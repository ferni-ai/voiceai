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
