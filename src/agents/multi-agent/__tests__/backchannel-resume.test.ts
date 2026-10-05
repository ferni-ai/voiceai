/**
 * A backchannel while Ferni's reply is paused (BACKCHANNEL_NOT_A_TURN in
 * patches/@livekit__agents@1.5.1.patch) uses the app's word list, and the
 * reply resumes only once the caller has stopped talking.
 *
 * Dev talk-over runs, 2026-10-04: "Uh-huh" transcribed as "Aha," was missing
 * from the patch's own list, so it was committed as a turn and Ferni stopped;
 * and the resume ran at 0 ms, over a caller saying "Yeah, so...".
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installBackchannelHook } from '../barge-in-fastpath.js';

const agentsDist = dirname(createRequire(import.meta.url).resolve('@livekit/agents'));
type OnEndOfTurn = (this: unknown, info: { newTranscript: string }) => Promise<boolean>;

async function onEndOfTurn(): Promise<OnEndOfTurn> {
  const mod = (await import(pathToFileURL(join(agentsDist, 'voice/agent_activity.js')).href)) as {
    AgentActivity: { prototype: { onEndOfTurn: OnEndOfTurn } };
  };
  return mod.AgentActivity.prototype.onEndOfTurn;
}

/** An AgentActivity with Ferni's reply paused by the caller's voice. */
function pausedActivity(userState: string) {
  return {
    agentSession: {
      userState,
      amd: undefined,
      chatCtx: { items: [] },
      sessionOptions: { turnHandling: { interruption: { minWords: 0 } } },
    },
    schedulingPaused: false,
    newTurnsBlocked: false,
    stt: {},
    turnDetection: 'stt',
    _currentSpeech: undefined,
    pausedSpeech: { handle: { interrupted: false } },
    closeAbort: { signal: { aborted: false } },
    audioRecognition: { speaking: false, audioTranscript: '', runEOUDetection: vi.fn() },
    logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    cancelPreemptiveGeneration: vi.fn(),
    startFalseInterruptionTimer: vi.fn(),
    createSpeechTask: vi.fn(() => ({ done: false })),
    userTurnCompleted: vi.fn(),
  };
}

describe('backchannel while a reply is paused (patched)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installBackchannelHook();
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { __FERNI_IS_BACKCHANNEL?: unknown }).__FERNI_IS_BACKCHANNEL;
  });

  it("treats the app's backchannel words as backchannels, including ones the patch lacked", async () => {
    const run = await onEndOfTurn();
    for (const said of ['Aha,', 'Got it.', 'I see', 'Alright']) {
      const a = pausedActivity('listening');
      await run.call(a, { newTranscript: said });
      expect(a.logger.info, said).toHaveBeenCalledWith(
        expect.objectContaining({ user_input: said }),
        'BACKCHANNEL_NOT_A_TURN'
      );
      expect(a.createSpeechTask, said).not.toHaveBeenCalled();
    }
  });

  it('resumes the reply 350 ms on, not at once', async () => {
    const run = await onEndOfTurn();
    const a = pausedActivity('listening');
    await run.call(a, { newTranscript: 'Mm-hmm.' });
    expect(a.startFalseInterruptionTimer).not.toHaveBeenCalled();
    vi.advanceTimersByTime(349);
    expect(a.startFalseInterruptionTimer).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(a.startFalseInterruptionTimer).toHaveBeenCalledWith(0);
  });

  it('waits while the caller keeps talking ("Yeah, so...")', async () => {
    const run = await onEndOfTurn();
    const a = pausedActivity('speaking');
    await run.call(a, { newTranscript: 'Yeah,' });
    vi.advanceTimersByTime(1000);
    expect(a.startFalseInterruptionTimer).not.toHaveBeenCalled();
    a.agentSession.userState = 'listening';
    vi.advanceTimersByTime(150);
    expect(a.startFalseInterruptionTimer).toHaveBeenCalledTimes(1);
  });

  it('does not resume a reply the caller has since interrupted', async () => {
    const run = await onEndOfTurn();
    const a = pausedActivity('listening');
    await run.call(a, { newTranscript: 'Yeah.' });
    a.pausedSpeech.handle.interrupted = true;
    vi.advanceTimersByTime(1000);
    expect(a.startFalseInterruptionTimer).not.toHaveBeenCalled();
  });
});
