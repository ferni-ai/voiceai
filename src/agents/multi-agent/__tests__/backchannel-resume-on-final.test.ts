/**
 * BACKCHANNEL_RESUME_ON_FINAL (patches/@livekit__agents@1.9.3.patch): a reply paused for a
 * caller's "mm-hm" resumes from the backchannel's final transcript, not 650 ms later from its
 * end of turn, and that end of turn is then dropped, never answered.
 *
 * Dev nightly 2026-11-27 (#4548, talk-over run): both backchannels resumed only after the end of
 * turn (300 ms endpoint, then the 350 ms resume timer), so Ferni was silent 1.1 s and 2.05 s.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installBackchannelHook } from '../barge-in-fastpath.js';

const agentsDist = dirname(createRequire(import.meta.url).resolve('@livekit/agents'));
type Activity = ReturnType<typeof pausedActivity>;
type Proto = {
  onFinalTranscript: (this: Activity, ev: unknown, speaking?: boolean) => void;
  onEndOfTurn: (this: Activity, info: { newTranscript: string }) => Promise<boolean>;
};

async function proto(): Promise<Proto> {
  const mod = (await import(pathToFileURL(join(agentsDist, 'voice/agent_activity.js')).href)) as {
    AgentActivity: { prototype: Proto };
  };
  return mod.AgentActivity.prototype;
}

/** An AgentActivity with Ferni's reply paused by the caller's voice (as backchannel-resume.test). */
function pausedActivity(userState: string) {
  return {
    agentSession: {
      userState,
      amd: undefined,
      emit: vi.fn(),
      chatCtx: { items: [] },
      sessionOptions: { turnHandling: { interruption: { minWords: 0 } } },
    },
    schedulingPaused: false,
    newTurnsBlocked: false,
    stt: {},
    turnDetection: 'stt',
    _currentSpeech: undefined,
    pausedSpeech: { handle: { interrupted: false } } as
      { handle: { interrupted: boolean } } | undefined,
    closeAbort: { signal: { aborted: false } },
    audioRecognition: undefined,
    logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    cancelPreemptiveGeneration: vi.fn(),
    cancelSpeechPause: vi.fn(),
    // LiveKit's resume: the paused reply plays on and no pause is left.
    startFalseInterruptionTimer: vi.fn(function (this: Activity) {
      this.pausedSpeech = undefined;
    }),
    createSpeechTask: vi.fn(() => ({ done: false })),
    userTurnCompleted: vi.fn(),
  };
}

const final = (text: string) => ({ alternatives: [{ text, language: 'en' }] });
const logged = (a: Activity, line: string) =>
  a.logger.info.mock.calls.filter((c: unknown[]) => c[1] === line).length;

describe('BACKCHANNEL_RESUME_ON_FINAL (patched)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installBackchannelHook();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    delete (globalThis as { __FERNI_IS_BACKCHANNEL?: unknown }).__FERNI_IS_BACKCHANNEL;
  });

  it('off: the final keeps the pause and resumes nothing (the end of turn does, as today)', async () => {
    vi.stubEnv('BACKCHANNEL_RESUME_ON_FINAL', 'off');
    const { onFinalTranscript } = await proto();
    const a = pausedActivity('listening');
    onFinalTranscript.call(a, final('M M M.'), false);
    expect(logged(a, 'BACKCHANNEL_KEEPS_PAUSE')).toBe(1);
    vi.advanceTimersByTime(2000);
    expect(a.startFalseInterruptionTimer).not.toHaveBeenCalled();
    expect(a.cancelSpeechPause).not.toHaveBeenCalled();
  });

  it.each(['on', ' ON ', 'true', '1'])(
    '%j: resumes 100 ms after the final, once the caller is quiet',
    async (value) => {
      vi.stubEnv('BACKCHANNEL_RESUME_ON_FINAL', value);
      const { onFinalTranscript } = await proto();
      const a = pausedActivity('listening');
      onFinalTranscript.call(a, final('Yeah.'), false);
      vi.advanceTimersByTime(99);
      expect(a.startFalseInterruptionTimer).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(a.startFalseInterruptionTimer).toHaveBeenCalledWith(0);
    }
  );

  it('on: waits while the caller keeps talking ("Yeah, so...")', async () => {
    vi.stubEnv('BACKCHANNEL_RESUME_ON_FINAL', 'on');
    const { onFinalTranscript } = await proto();
    const a = pausedActivity('speaking');
    onFinalTranscript.call(a, final('Yeah,'), true);
    vi.advanceTimersByTime(1000);
    expect(a.startFalseInterruptionTimer).not.toHaveBeenCalled();
    a.agentSession.userState = 'listening';
    vi.advanceTimersByTime(150);
    expect(a.startFalseInterruptionTimer).toHaveBeenCalledTimes(1);
  });

  it('on: does not resume a reply the caller has since interrupted', async () => {
    vi.stubEnv('BACKCHANNEL_RESUME_ON_FINAL', 'on');
    const { onFinalTranscript } = await proto();
    const a = pausedActivity('listening');
    onFinalTranscript.call(a, final('Mm-hmm.'), false);
    a.pausedSpeech!.handle.interrupted = true;
    vi.advanceTimersByTime(1000);
    expect(a.startFalseInterruptionTimer).not.toHaveBeenCalled();
  });

  it('on: an activity closed before the timer fires is not resumed', async () => {
    vi.stubEnv('BACKCHANNEL_RESUME_ON_FINAL', 'on');
    const { onFinalTranscript } = await proto();
    const a = pausedActivity('listening');
    onFinalTranscript.call(a, final('Mm-hmm.'), false);
    a.closeAbort.signal.aborted = true; // the call ended, or a handoff closed this activity
    vi.advanceTimersByTime(1000);
    expect(a.startFalseInterruptionTimer).not.toHaveBeenCalled();
  });

  it('on: real words are not a backchannel, so nothing resumes early', async () => {
    vi.stubEnv('BACKCHANNEL_RESUME_ON_FINAL', 'on');
    const { onFinalTranscript } = await proto();
    const a = pausedActivity('listening');
    onFinalTranscript.call(a, final('Wait, hold on.'), false);
    expect(logged(a, 'BACKCHANNEL_KEEPS_PAUSE')).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(a.startFalseInterruptionTimer).not.toHaveBeenCalled();
  });

  it("on: the resumed backchannel's end of turn is dropped, never answered", async () => {
    vi.stubEnv('BACKCHANNEL_RESUME_ON_FINAL', 'on');
    const { onFinalTranscript, onEndOfTurn } = await proto();
    const a = pausedActivity('listening');
    onFinalTranscript.call(a, final('M M M.'), false);
    vi.advanceTimersByTime(100); // resumed: no pause left
    expect(a.pausedSpeech).toBeUndefined();
    vi.advanceTimersByTime(300); // the endpoint delay, then the end of turn
    await expect(onEndOfTurn.call(a, { newTranscript: 'M M M.' })).resolves.toBe(true);
    expect(logged(a, 'BACKCHANNEL_NOT_A_TURN')).toBe(1);
    expect(a.createSpeechTask).not.toHaveBeenCalled();
    expect(a.userTurnCompleted).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(a.startFalseInterruptionTimer).toHaveBeenCalledTimes(1); // no second resume
  });

  it('on: only once, and only within 3 s: a later backchannel with no pause is not dropped here', async () => {
    vi.stubEnv('BACKCHANNEL_RESUME_ON_FINAL', 'on');
    const { onFinalTranscript, onEndOfTurn } = await proto();
    const late = pausedActivity('listening');
    onFinalTranscript.call(late, final('Yeah.'), false);
    vi.advanceTimersByTime(100 + 3000);
    await onEndOfTurn.call(late, { newTranscript: 'Yeah.' }).catch(() => undefined);
    expect(logged(late, 'BACKCHANNEL_NOT_A_TURN')).toBe(0);

    const twice = pausedActivity('listening');
    onFinalTranscript.call(twice, final('Yeah.'), false);
    vi.advanceTimersByTime(100);
    await onEndOfTurn.call(twice, { newTranscript: 'Yeah.' });
    await onEndOfTurn.call(twice, { newTranscript: 'Okay.' }).catch(() => undefined);
    expect(logged(twice, 'BACKCHANNEL_NOT_A_TURN')).toBe(1);
  });

  it('on: after an early resume, real words are a turn, not dropped', async () => {
    vi.stubEnv('BACKCHANNEL_RESUME_ON_FINAL', 'on');
    const { onFinalTranscript, onEndOfTurn } = await proto();
    const a = pausedActivity('listening');
    onFinalTranscript.call(a, final('Yeah.'), false);
    vi.advanceTimersByTime(100);
    await onEndOfTurn.call(a, { newTranscript: 'Actually, wait a second.' }).catch(() => undefined);
    expect(logged(a, 'BACKCHANNEL_NOT_A_TURN')).toBe(0);
  });

  it('on: a new pause after an early resume goes the end-of-turn way, and still resumes', async () => {
    vi.stubEnv('BACKCHANNEL_RESUME_ON_FINAL', 'on');
    const { onFinalTranscript, onEndOfTurn } = await proto();
    const a = pausedActivity('listening');
    onFinalTranscript.call(a, final('Yeah.'), false);
    vi.advanceTimersByTime(100);
    a.pausedSpeech = { handle: { interrupted: false } }; // the caller's voice paused him again
    await onEndOfTurn.call(a, { newTranscript: 'Mm-hmm.' });
    vi.advanceTimersByTime(350);
    expect(a.startFalseInterruptionTimer).toHaveBeenCalledTimes(2);
  });

  it('off: a backchannel end of turn with no pause is not dropped by this path', async () => {
    vi.stubEnv('BACKCHANNEL_RESUME_ON_FINAL', 'off');
    const { onEndOfTurn } = await proto();
    const a = pausedActivity('listening');
    a.pausedSpeech = undefined;
    await onEndOfTurn.call(a, { newTranscript: 'Yeah.' }).catch(() => undefined);
    expect(logged(a, 'BACKCHANNEL_NOT_A_TURN')).toBe(0);
  });
});
