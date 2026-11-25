/**
 * A line that never reaches the speaker gets no speech-ended event. The coordinator must free its
 * slot and play the queue anyway, or every later line, including a crisis hand-back, waits behind
 * a SPEAKING state nothing will clear (#4446).
 *
 * Real coordinator and real `speakToSession`; only the LiveKit session is a stub.
 */

import type { voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { speakToSession } from '../../tts-gateway/index.js';
import {
  CoordinatorState,
  SpeechCoordinator,
  SpeechPriority,
  resetSpeechCoordinator,
} from '../speech-coordinator.js';

const sink = vi.hoisted(() => {
  const calls: unknown[][] = [];
  const record = (...args: unknown[]) => void calls.push(args);
  const logger: Record<string, unknown> = {
    debug: record,
    info: record,
    warn: record,
    error: record,
  };
  logger.child = () => logger;
  const quiet = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  return { calls, logger, quiet };
});
// The coordinator's own logger is the one under test; the gateway's (tts-gateway) is not.
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/safe-logger.js')>()),
  createLogger: (bindings: { module?: string }) =>
    bindings?.module === 'speech-coordinator' ? sink.logger : sink.quiet,
}));

const SSML_ONLY = '<break time="500ms"/>';
const spoken = (say: ReturnType<typeof vi.fn>): string[] => say.mock.calls.map((c) => c[0]);

describe('SpeechCoordinator: a line that never reaches the speaker (#4446)', () => {
  let coordinator: SpeechCoordinator;
  let say: ReturnType<typeof vi.fn>;

  const speak = (text: string) =>
    coordinator.requestSpeak({ text, priority: SpeechPriority.RESPONSE, source: 'direct' });

  /** The first line is spoken; the rest queue behind it; its end lets the queue play. */
  const queueBehindALine = async (...queued: string[]): Promise<void> => {
    await speak('Line A');
    await Promise.all(queued.map(speak));
    coordinator.onSpeechEnded(false, 1000);
    vi.advanceTimersByTime(5_000);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    resetSpeechCoordinator();
    coordinator = new SpeechCoordinator();
    say = vi.fn();
    coordinator.attachSession({ say } as unknown as voice.AgentSession, { sessionId: 's-1' });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('a line the session refuses leaves the coordinator IDLE', async () => {
    say.mockImplementationOnce(() => {
      throw new Error('session is gone');
    });

    await speak('Line A');

    expect(say).toHaveBeenCalledTimes(1);
    expect(coordinator.getState()).toBe(CoordinatorState.IDLE);
  });

  it('a line with nothing left after the SSML strip leaves the coordinator IDLE', async () => {
    await speak(SSML_ONLY);

    expect(say).not.toHaveBeenCalled();
    expect(coordinator.getState()).toBe(CoordinatorState.IDLE);
  });

  it('a failed line is followed by the next queued line', async () => {
    say
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error('session is gone');
      });

    await queueBehindALine('Line B', 'Line C');

    expect(spoken(say)).toEqual(['Line A', 'Line B', 'Line C']);
    expect(coordinator.getState()).toBe(CoordinatorState.SPEAKING);
  });

  it('an empty line is followed by the next queued line', async () => {
    await queueBehindALine(SSML_ONLY, 'Line C');

    expect(spoken(say)).toEqual(['Line A', 'Line C']);
    expect(coordinator.getState()).toBe(CoordinatorState.SPEAKING);
  });

  it('a line the session refuses on the legacy path is followed by the next queued line', async () => {
    vi.stubEnv('USE_TTS_GATEWAY', 'false');
    say
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error('AgentSession is not running');
      });

    await queueBehindALine('Line B', 'Line C');

    expect(spoken(say)).toEqual(['Line A', 'Line B', 'Line C']);
    expect(coordinator.getState()).toBe(CoordinatorState.SPEAKING);
  });

  it('a line with nothing left after the SSML strip on the legacy path leaves the coordinator IDLE', async () => {
    vi.stubEnv('USE_TTS_GATEWAY', 'false');

    await speak(SSML_ONLY);

    expect(say).not.toHaveBeenCalled();
    expect(coordinator.getState()).toBe(CoordinatorState.IDLE);
  });

  it('an empty line on the legacy path is followed by the next queued line', async () => {
    vi.stubEnv('USE_TTS_GATEWAY', 'false');

    await queueBehindALine(SSML_ONLY, 'Line C');

    expect(spoken(say)).toEqual(['Line A', 'Line C']);
    expect(coordinator.getState()).toBe(CoordinatorState.SPEAKING);
  });

  it('a line whose onStart throws, after a failed line, is dropped and logged by class only', async () => {
    sink.calls.length = 0;
    say
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error('session is gone');
      });
    const a = await speak('Line A');
    await speak('Line B');
    const c = await coordinator.requestSpeak({
      text: 'Line C',
      priority: SpeechPriority.RESPONSE,
      source: 'direct',
      onStart: () => {
        throw new Error('refused To=+12025550142');
      },
    });
    await speak('Line D');
    coordinator.onSpeechEnded(false, 1000);
    vi.advanceTimersByTime(5_000);

    expect(spoken(say)).toEqual(['Line A', 'Line B', 'Line D']);
    expect(coordinator.getState()).toBe(CoordinatorState.SPEAKING);
    const dropped = sink.calls.find(
      (c) => c[1] === 'Queued line dropped: it threw before speaking'
    );
    // The dropped line's own id (C's), the error class only, and no line blames A for C's throw.
    expect(dropped?.[0]).toEqual({ error: 'Error', id: c.id });
    expect(JSON.stringify(sink.calls)).not.toContain('5550142');
    // A spoke fine, so none of the failure lines may carry A's id (its info lines may).
    const failures = sink.calls.filter((c) =>
      /Speech failed|Speech skipped|Queued line dropped/.test(String(c[1]))
    );
    expect(failures.length).toBeGreaterThan(0);
    expect(JSON.stringify(failures)).not.toContain(a.id);
  });

  describe('one failed line frees the slot once: the next line speaks once and the one after waits', () => {
    const refuse = () => {
      throw new Error('session is gone');
    };

    it('a line the session refuses', async () => {
      say.mockImplementationOnce(() => undefined).mockImplementationOnce(refuse);

      await queueBehindALine('Line B', 'Line C', 'Line D');

      expect(spoken(say)).toEqual(['Line A', 'Line B', 'Line C']);
      expect(coordinator.getState()).toBe(CoordinatorState.SPEAKING);
    });

    it('a line with nothing left after the SSML strip', async () => {
      await queueBehindALine(SSML_ONLY, 'Line C', 'Line D');

      expect(spoken(say)).toEqual(['Line A', 'Line C']);
      expect(coordinator.getState()).toBe(CoordinatorState.SPEAKING);
    });

    it('a line the session refuses on the legacy path', async () => {
      vi.stubEnv('USE_TTS_GATEWAY', 'false');
      say.mockImplementationOnce(() => undefined).mockImplementationOnce(refuse);

      await queueBehindALine('Line B', 'Line C', 'Line D');

      expect(spoken(say)).toEqual(['Line A', 'Line B', 'Line C']);
      expect(coordinator.getState()).toBe(CoordinatorState.SPEAKING);
    });

    it('a line with nothing left on the legacy path, or only whitespace after the strip', async () => {
      vi.stubEnv('USE_TTS_GATEWAY', 'false');

      await queueBehindALine(`${SSML_ONLY}   `, 'Line C', 'Line D');

      expect(spoken(say)).toEqual(['Line A', 'Line C']);
      expect(coordinator.getState()).toBe(CoordinatorState.SPEAKING);
    });
  });

  it('no log carries the words of a line, spoken or refused, on either path, on a dev process', async () => {
    // A dev process is the one where replyForLog would print words (reply-for-log.ts).
    vi.stubEnv('FIRESTORE_DATABASE', 'ferni-dev');
    const sentence = 'zorbleflax tell my fictional neighbour the ladder is back';
    for (const gateway of ['true', 'false']) {
      vi.stubEnv('USE_TTS_GATEWAY', gateway);
      sink.calls.length = 0;
      say.mockReset();
      say.mockImplementationOnce(() => {
        throw new Error(`TTS rejected: ${sentence}`);
      });
      resetSpeechCoordinator();
      const fresh = new SpeechCoordinator();
      fresh.attachSession({ say } as unknown as voice.AgentSession, { sessionId: 's-2' });

      const line = await fresh.requestSpeak({
        text: sentence,
        priority: SpeechPriority.RESPONSE,
        source: 'direct',
      });

      expect(fresh.getState()).toBe(CoordinatorState.IDLE);
      const failed = sink.calls.find(
        (c) => c[1] === 'TTS Gateway speech failed' || c[1] === 'Speech failed'
      );
      expect(failed?.[0]).toEqual({ error: 'Error', id: line.id });
      expect(sink.calls.length).toBeGreaterThan(1); // the "speaking" lines were logged too
      expect(JSON.stringify(sink.calls)).not.toContain('zorbleflax');
    }
  });

  it('a second speech-ended event for one line releases the next line once', async () => {
    await speak('Line A');
    await speak('Line B');
    await speak('Line C');
    coordinator.onSpeechEnded(false, 1000);
    coordinator.onSpeechEnded(false, 1000);
    vi.advanceTimersByTime(5_000);

    expect(spoken(say)).toEqual(['Line A', 'Line B']);
    expect(coordinator.getState()).toBe(CoordinatorState.SPEAKING);
  });

  it('queued lines play in priority order, then arrival order, after a failed line', async () => {
    say
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error('session is gone');
      });
    await speak('Line A');
    await speak('Line B');
    await coordinator.requestSpeak({
      text: 'Line C',
      priority: SpeechPriority.CRISIS,
      source: 'direct',
    });
    await speak('Line D');
    coordinator.onSpeechEnded(false, 1000);
    vi.advanceTimersByTime(5_000);

    // C (crisis) is first and fails; B plays next and D waits behind it, as it arrived.
    expect(spoken(say)).toEqual(['Line A', 'Line C', 'Line B']);
    expect(coordinator.getState()).toBe(CoordinatorState.SPEAKING);
  });

  it('several failed lines in a row are skipped in queue order', async () => {
    say
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error('session is gone');
      })
      .mockImplementationOnce(() => {
        throw new Error('session is gone');
      });

    await queueBehindALine('Line B', 'Line C', 'Line D');

    expect(spoken(say)).toEqual(['Line A', 'Line B', 'Line C', 'Line D']);
    expect(coordinator.getState()).toBe(CoordinatorState.SPEAKING);
  });

  it('a spoken line still waits for its speech-ended event', async () => {
    await speak('Line A');
    await speak('Line B');

    expect(spoken(say)).toEqual(['Line A']);
    expect(coordinator.getState()).toBe(CoordinatorState.SPEAKING);
  });
});

describe('speakToSession says whether the text reached the session', () => {
  const session = (say: ReturnType<typeof vi.fn>) => ({ say }) as unknown as voice.AgentSession;

  it('true when handed to the session, false when the SSML strip leaves nothing', () => {
    const say = vi.fn();

    expect(speakToSession(session(say), 'Line A', { voiceId: 'v' })).toBe(true);
    expect(speakToSession(session(say), SSML_ONLY, { voiceId: 'v' })).toBe(false);
    expect(spoken(say)).toEqual(['Line A']);
  });
});
