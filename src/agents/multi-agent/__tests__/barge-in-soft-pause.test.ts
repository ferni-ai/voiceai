/**
 * BARGE_IN_SOFT_PAUSE: sustained caller speech over Ferni pauses him instead
 * of cutting the reply; real words or the barge-in model confirm the cut,
 * anything else resumes him (prod iPhone calls, 2026-10-21: 4 of 6 fast-path
 * cuts were judged not an interruption).
 */
import { voice } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBargeInFastPath,
  POST_RESUME_BACKSTOP_MS,
  SOFT_PAUSE_WATCHDOG_EXTRA_MS,
  SUSTAINED_SPEECH_MS,
} from '../barge-in-fastpath.js';
import { installLiveCallBehaviors } from '../live-call-behaviors.js';
import { ResumeBufferOutput } from '../resume-buffer.js';
import {
  SOFT_PAUSE_CONFIRM_MS,
  SOFT_PAUSE_STT_GRACE_MS,
  softPauseConfirmMs,
  softPauseFromEnv,
  softPauseGraceMs,
} from '../barge-in-soft-pause.js';

const FERNI_SAYS = 'so for her birthday I was thinking a trail day by the lake';

function call(flag: string | undefined, env: Record<string, string> = {}) {
  const interrupt = vi.fn();
  const pause = vi.fn(() => true);
  const resume = vi.fn();
  const decisions: Array<Record<string, unknown>> = [];
  const softPause = softPauseFromEnv(
    { BARGE_IN_SOFT_PAUSE: flag, ...env },
    { pause, resume, log: (fields) => decisions.push(fields) }
  );
  const fp = createBargeInFastPath({ interrupt, softPause });
  /** Ferni starts a reply and the caller talks over it for the sustained-speech time. */
  const talkOver = () => {
    fp.onAgentState({ newState: 'speaking' });
    fp.onSpokenText(FERNI_SAYS);
    fp.onUserState({ newState: 'speaking' });
    vi.advanceTimersByTime(SUSTAINED_SPEECH_MS);
  };
  return { fp, interrupt, pause, resume, decisions, talkOver };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('BARGE_IN_SOFT_PAUSE off', () => {
  it('still cuts the reply after sustained speech, without pausing', () => {
    for (const flag of [undefined, 'off']) {
      const c = call(flag);
      c.talkOver();
      expect(c.interrupt).toHaveBeenCalledTimes(1);
      expect(c.pause).not.toHaveBeenCalled();
      expect(c.decisions).toEqual([]);
    }
  });
});

describe('BARGE_IN_SOFT_PAUSE on', () => {
  it('pauses Ferni on sustained speech instead of cutting him', () => {
    const c = call('on');
    c.talkOver();
    expect(c.pause).toHaveBeenCalledTimes(1);
    expect(c.interrupt).not.toHaveBeenCalled();
    expect(c.resume).not.toHaveBeenCalled();
  });

  it('cuts the reply when real words confirm it', () => {
    const c = call('on');
    c.talkOver();
    vi.advanceTimersByTime(400);
    c.fp.onTranscript({ transcript: 'Wait', isFinal: false });
    expect(c.interrupt).toHaveBeenCalledTimes(1);
    expect(c.resume).not.toHaveBeenCalled();
    expect(c.decisions).toEqual([
      { outcome: 'interrupted', why: 'words', words: 1, pausedMs: 400 },
    ]);
    // The paused output is released once the cut reply has ended.
    c.fp.onAgentState({ newState: 'listening' });
    expect(c.resume).toHaveBeenCalledTimes(1);
  });

  it('cuts the reply when the barge-in model calls it an interruption', () => {
    const c = call('on');
    c.talkOver();
    c.fp.onOverlapDecision({ isInterruption: false });
    expect(c.interrupt).not.toHaveBeenCalled();
    c.fp.onOverlapDecision({ isInterruption: true });
    expect(c.interrupt).toHaveBeenCalledTimes(1);
    expect(c.decisions[0]).toMatchObject({ outcome: 'interrupted', why: 'model' });
  });

  it("resumes when the only words are Ferni's own, heard by the caller's mic", () => {
    const c = call('on');
    c.talkOver();
    c.fp.onTranscript({ transcript: 'for her birthday I was thinking', isFinal: false });
    c.fp.onUserState({ newState: 'listening' }); // grace ends at 700, before the window
    expect(c.interrupt).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SOFT_PAUSE_CONFIRM_MS);
    expect(c.resume).toHaveBeenCalledTimes(1);
    expect(c.interrupt).not.toHaveBeenCalled();
    expect(c.decisions).toEqual([
      { outcome: 'resumed', why: 'echo', after: 'window', pausedMs: SOFT_PAUSE_CONFIRM_MS },
    ]);
  });

  it('resumes at the window end when the caller went quiet early, with no words', () => {
    const c = call('on');
    c.talkOver();
    vi.advanceTimersByTime(300);
    c.fp.onUserState({ newState: 'listening' });
    vi.advanceTimersByTime(SOFT_PAUSE_CONFIRM_MS - 301);
    expect(c.resume).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(c.resume).toHaveBeenCalledTimes(1);
    expect(c.interrupt).not.toHaveBeenCalled();
    expect(c.decisions).toEqual([
      { outcome: 'resumed', why: 'no-words', after: 'window', pausedMs: SOFT_PAUSE_CONFIRM_MS },
    ]);
    // A late timer does not resume (or log) twice.
    vi.advanceTimersByTime(SOFT_PAUSE_STT_GRACE_MS * 2);
    expect(c.resume).toHaveBeenCalledTimes(1);
    expect(c.decisions).toHaveLength(1);
  });

  it('caller goes quiet late with no words: resumes when the STT grace ends, not before', () => {
    const c = call('on');
    c.talkOver();
    vi.advanceTimersByTime(900);
    c.fp.onUserState({ newState: 'listening' }); // grace ends at 1600, after the window
    vi.advanceTimersByTime(SOFT_PAUSE_STT_GRACE_MS - 1);
    expect(c.resume).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(c.resume).toHaveBeenCalledTimes(1);
    expect(c.decisions).toEqual([
      {
        outcome: 'resumed',
        why: 'no-words',
        after: 'grace',
        pausedMs: 900 + SOFT_PAUSE_STT_GRACE_MS,
      },
    ]);
  });

  it('a "hold on" whose words land inside the STT grace still cuts the reply', () => {
    const c = call('on');
    c.talkOver();
    vi.advanceTimersByTime(900);
    c.fp.onUserState({ newState: 'listening' }); // the caller has finished "hold on"
    vi.advanceTimersByTime(500); // Ink-2's words arrive after the window's end
    c.fp.onTranscript({ transcript: 'Hold on', isFinal: false });
    expect(c.interrupt).toHaveBeenCalledTimes(1);
    expect(c.resume).not.toHaveBeenCalled();
    expect(c.decisions).toEqual([
      { outcome: 'interrupted', why: 'words', words: 2, pausedMs: 1400 },
    ]);
  });

  it('a model verdict inside the STT grace cuts the reply', () => {
    const c = call('on');
    c.talkOver();
    vi.advanceTimersByTime(1000);
    c.fp.onUserState({ newState: 'listening' });
    vi.advanceTimersByTime(400);
    c.fp.onOverlapDecision({ isInterruption: true });
    expect(c.interrupt).toHaveBeenCalledTimes(1);
    expect(c.resume).not.toHaveBeenCalled();
  });

  it('caller never goes quiet (steady room noise): resumes at the window end', () => {
    const c = call('on');
    c.talkOver();
    vi.advanceTimersByTime(SOFT_PAUSE_CONFIRM_MS - 1);
    expect(c.resume).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(c.resume).toHaveBeenCalledTimes(1);
    expect(c.decisions).toEqual([
      { outcome: 'resumed', why: 'no-words', after: 'window', pausedMs: SOFT_PAUSE_CONFIRM_MS },
    ]);
  });

  it('a quiet just before the window still gets its full STT grace', () => {
    const c = call('on');
    c.talkOver();
    vi.advanceTimersByTime(SOFT_PAUSE_CONFIRM_MS - 100);
    c.fp.onUserState({ newState: 'listening' });
    vi.advanceTimersByTime(SOFT_PAUSE_STT_GRACE_MS - 1);
    expect(c.resume).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(c.resume).toHaveBeenCalledTimes(1);
    expect(c.decisions[0]).toMatchObject({
      after: 'grace',
      pausedMs: SOFT_PAUSE_CONFIRM_MS - 100 + SOFT_PAUSE_STT_GRACE_MS,
    });
  });

  it('caller talks straight through the window: words landing after the resume still cut', () => {
    const c = call('on');
    c.talkOver();
    vi.advanceTimersByTime(SOFT_PAUSE_CONFIRM_MS);
    expect(c.resume).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1700 - SOFT_PAUSE_CONFIRM_MS); // 1700 ms into the pause
    c.fp.onTranscript({ transcript: 'no wait listen', isFinal: false });
    expect(c.interrupt).toHaveBeenCalledTimes(1);
  });

  it('resumes after a backchannel', () => {
    const c = call('on');
    c.talkOver();
    c.fp.onTranscript({ transcript: 'Mm-hmm.', isFinal: true });
    c.fp.onUserState({ newState: 'listening' });
    vi.advanceTimersByTime(SOFT_PAUSE_CONFIRM_MS);
    expect(c.resume).toHaveBeenCalledTimes(1);
    expect(c.interrupt).not.toHaveBeenCalled();
    expect(c.decisions[0]).toMatchObject({ outcome: 'resumed', why: 'backchannel' });
  });

  it('pauses at most once a reply, and again on the next reply', () => {
    const c = call('on');
    c.talkOver();
    vi.advanceTimersByTime(SOFT_PAUSE_CONFIRM_MS + SOFT_PAUSE_STT_GRACE_MS); // resumed
    expect(c.resume).toHaveBeenCalledTimes(1);
    // The caller keeps going over the same reply: no second pause, no cut.
    c.fp.onUserState({ newState: 'listening' });
    c.fp.onUserState({ newState: 'speaking' });
    vi.advanceTimersByTime(SUSTAINED_SPEECH_MS * 3);
    expect(c.pause).toHaveBeenCalledTimes(1);
    expect(c.interrupt).not.toHaveBeenCalled();

    // Next reply: the fast path arms again.
    c.fp.onAgentState({ newState: 'listening' });
    c.talkOver();
    expect(c.pause).toHaveBeenCalledTimes(2);
  });

  /** Paused, caller quiet at once, resumed at the window's end. */
  function resumed() {
    const c = call('on');
    c.talkOver();
    c.fp.onUserState({ newState: 'listening' });
    vi.advanceTimersByTime(SOFT_PAUSE_CONFIRM_MS);
    expect(c.resume).toHaveBeenCalledTimes(1);
    return c;
  }

  it('just after a resume, a two-word "hold on" cuts the reply', () => {
    const c = resumed();
    vi.advanceTimersByTime(900);
    c.fp.onTranscript({ transcript: 'hold on', isFinal: false });
    expect(c.interrupt).toHaveBeenCalledTimes(1);
  });

  it("just after a resume, Ferni's own words or a backchannel still do not", () => {
    const c = resumed();
    vi.advanceTimersByTime(900);
    c.fp.onTranscript({ transcript: 'her birthday', isFinal: false });
    c.fp.onTranscript({ transcript: 'yeah okay', isFinal: false });
    expect(c.interrupt).not.toHaveBeenCalled();
  });

  it('after the post-resume moment, the backstop needs three words again', () => {
    const c = resumed();
    vi.advanceTimersByTime(POST_RESUME_BACKSTOP_MS);
    c.fp.onTranscript({ transcript: 'hold on', isFinal: false });
    expect(c.interrupt).not.toHaveBeenCalled();
    c.fp.onTranscript({ transcript: 'no hold on please', isFinal: false });
    expect(c.interrupt).toHaveBeenCalledTimes(1);
  });

  it('a cut that fails after a confirmed pause resumes Ferni instead of leaving him paused', () => {
    for (const fail of [
      () => false,
      () => {
        throw new Error('does not allow interruptions');
      },
    ]) {
      const c = call('on');
      c.interrupt.mockImplementation(fail);
      c.talkOver();
      vi.advanceTimersByTime(300);
      expect(() => c.fp.onTranscript({ transcript: 'Wait', isFinal: false })).not.toThrow();
      expect(c.interrupt).toHaveBeenCalledTimes(1);
      expect(c.resume).toHaveBeenCalledTimes(1);
      expect(c.decisions).toEqual([
        { outcome: 'resumed', why: 'cut-failed', confirmedBy: 'words', pausedMs: 300 },
      ]);
    }
  });

  it('a pause that throws falls back to the plain cut, without escaping', () => {
    const c = call('on');
    c.pause.mockImplementation(() => {
      throw new Error('output gone');
    });
    expect(() => c.talkOver()).not.toThrow();
    expect(c.interrupt).toHaveBeenCalledTimes(1);
    expect(c.resume).not.toHaveBeenCalled();
  });

  it('a resume that throws is logged and does not escape the timer', () => {
    const c = call('on');
    c.resume.mockImplementation(() => {
      throw new Error('output gone');
    });
    c.talkOver();
    expect(() => vi.advanceTimersByTime(SOFT_PAUSE_CONFIRM_MS)).not.toThrow();
    expect(c.resume).toHaveBeenCalledTimes(1);
    expect(c.interrupt).not.toHaveBeenCalled();
    expect(c.decisions).toContainEqual({ event: 'resume-failed', error: 'Error: output gone' });
  });

  it('the watchdog resumes an output still held long after the pause', () => {
    const c = call('on');
    c.talkOver();
    c.fp.onTranscript({ transcript: 'Wait', isFinal: false }); // cut, but the reply never ends
    expect(c.interrupt).toHaveBeenCalledTimes(1);
    const watchdogMs =
      SOFT_PAUSE_CONFIRM_MS + SOFT_PAUSE_STT_GRACE_MS + SOFT_PAUSE_WATCHDOG_EXTRA_MS;
    vi.advanceTimersByTime(watchdogMs - 1);
    expect(c.resume).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(c.resume).toHaveBeenCalledTimes(1);
    expect(c.decisions.at(-1)).toEqual({
      outcome: 'resumed',
      why: 'watchdog',
      pausedMs: watchdogMs,
    });
    // A reply that ended normally leaves nothing for it to do.
    c.fp.onAgentState({ newState: 'listening' });
    expect(c.resume).toHaveBeenCalledTimes(1);
  });

  it('cuts the reply as before when the output cannot pause', () => {
    const c = call('on');
    c.pause.mockReturnValue(false);
    c.talkOver();
    expect(c.interrupt).toHaveBeenCalledTimes(1);
    expect(c.decisions).toEqual([]);
  });
});

describe('soft pause settings', () => {
  it('reads BARGE_IN_SOFT_PAUSE_CONFIRM_MS within bounds, else 1200', () => {
    expect(softPauseConfirmMs({})).toBe(1200);
    expect(softPauseConfirmMs({ BARGE_IN_SOFT_PAUSE_CONFIRM_MS: '800' })).toBe(800);
    expect(softPauseConfirmMs({ BARGE_IN_SOFT_PAUSE_CONFIRM_MS: 'soon' })).toBe(1200);
    expect(softPauseConfirmMs({ BARGE_IN_SOFT_PAUSE_CONFIRM_MS: '60000' })).toBe(1200);
  });

  it('reads BARGE_IN_SOFT_PAUSE_STT_GRACE_MS within 200-2000, else 700', () => {
    expect(softPauseGraceMs({})).toBe(700);
    expect(softPauseGraceMs({ BARGE_IN_SOFT_PAUSE_STT_GRACE_MS: '400' })).toBe(400);
    expect(softPauseGraceMs({ BARGE_IN_SOFT_PAUSE_STT_GRACE_MS: '100' })).toBe(700);
    expect(softPauseGraceMs({ BARGE_IN_SOFT_PAUSE_STT_GRACE_MS: '2500' })).toBe(700);
  });

  it('sets how long the pause waits', () => {
    const c = call('on', {
      BARGE_IN_SOFT_PAUSE_CONFIRM_MS: '800',
      BARGE_IN_SOFT_PAUSE_STT_GRACE_MS: '300',
    });
    c.talkOver();
    vi.advanceTimersByTime(799);
    expect(c.resume).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(c.resume).toHaveBeenCalledTimes(1);
    const d = call('on', {
      BARGE_IN_SOFT_PAUSE_CONFIRM_MS: '800',
      BARGE_IN_SOFT_PAUSE_STT_GRACE_MS: '300',
    });
    d.talkOver();
    vi.advanceTimersByTime(700);
    d.fp.onUserState({ newState: 'listening' });
    vi.advanceTimersByTime(299);
    expect(d.resume).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(d.resume).toHaveBeenCalledTimes(1);
  });
});

/** The room's audio output: pausable, records what the session asks of it. */
class RoomOutput extends voice.AudioOutput {
  calls: string[] = [];
  played: AudioFrame[] = [];
  /** What the room still holds unplayed; its pause clears this much. */
  audioSource = { queuedDuration: 0 };
  constructor() {
    super(24000, undefined, { pause: true });
  }
  pause(): void {
    this.calls.push('pause');
    super.pause();
  }
  resume(): void {
    this.calls.push('resume');
    super.resume();
  }
  clearBuffer(): void {
    this.calls.push('clear');
  }
  async captureFrame(frame: AudioFrame): Promise<void> {
    this.played.push(frame);
  }
}

/** 10 ms of 24 kHz audio. */
const frame = (): AudioFrame => new AudioFrame(new Int16Array(240), 24000, 1, 240);

/** installLiveCallBehaviors on a fake session that keeps its handlers. */
function liveCall(flag: string, currentSpeech: unknown = { allowInterruptions: true }) {
  for (const f of ['INTERRUPT_TRACE', 'TURN_KEEPER']) vi.stubEnv(f, 'off');
  vi.stubEnv('BARGE_IN_SOFT_PAUSE', flag);
  const handlers = new Map<string, Array<(ev: unknown) => void>>();
  const room = new RoomOutput();
  const session = {
    on: (event: string, h: (ev: unknown) => void) =>
      handlers.set(event, [...(handlers.get(event) ?? []), h]),
    interrupt: vi.fn(),
    output: { audio: room as voice.AudioOutput },
    _activity: { currentSpeech },
  };
  installLiveCallBehaviors({
    session: session as never,
    sessionWithEvents: session,
    sessionEventHandlers: [],
    cleanupFunctions: [],
    sessionId: 's1',
    userId: undefined,
  });
  const emit = (event: string, ev: unknown) => handlers.get(event)?.forEach((h) => h(ev));
  return { session, room, handlers, emit };
}

describe('a live call', () => {
  it('flag on: pauses the session audio output, then cuts on the model verdict', () => {
    const c = liveCall('on');
    expect(c.session.output.audio).toBeInstanceOf(ResumeBufferOutput);
    c.emit('agent_state_changed', { newState: 'speaking' });
    c.emit('user_state_changed', { newState: 'speaking' });
    vi.advanceTimersByTime(SUSTAINED_SPEECH_MS);
    expect(c.room.calls).toEqual(['pause']);
    expect(c.session.interrupt).not.toHaveBeenCalled();
    c.emit(voice.AgentSessionEventTypes.OverlappingSpeech, { isInterruption: true });
    expect(c.session.interrupt).toHaveBeenCalledTimes(1);
  });

  it('flag on: resumes when nothing confirms, replaying the audio the pause cleared', async () => {
    const c = liveCall('on');
    const sent = [frame(), frame(), frame()];
    for (const f of sent) await c.session.output.audio.captureFrame(f);
    c.room.audioSource.queuedDuration = 20; // the last two frames had not played yet
    c.emit('agent_state_changed', { newState: 'speaking' });
    c.emit('user_state_changed', { newState: 'speaking' });
    vi.advanceTimersByTime(SUSTAINED_SPEECH_MS + SOFT_PAUSE_CONFIRM_MS + SOFT_PAUSE_STT_GRACE_MS);
    expect(c.room.calls).toEqual(['pause', 'resume']);
    expect(c.session.interrupt).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(c.room.played).toEqual([...sent, sent[1], sent[2]]);
  });

  it("flag on: a reply that can't be interrupted (or can't be told) is not paused", () => {
    for (const speech of [{ allowInterruptions: false }, null]) {
      const c = liveCall('on', speech);
      c.emit('agent_state_changed', { newState: 'speaking' });
      c.emit('user_state_changed', { newState: 'speaking' });
      vi.advanceTimersByTime(SUSTAINED_SPEECH_MS + SOFT_PAUSE_CONFIRM_MS + SOFT_PAUSE_STT_GRACE_MS);
      expect(c.room.calls).toEqual([]);
      expect(c.session.interrupt).toHaveBeenCalledTimes(1); // as today
    }
  });

  it('flag off: no verdict hook, no resume buffer, sustained speech cuts as before', () => {
    const c = liveCall('off');
    expect(c.handlers.has(voice.AgentSessionEventTypes.OverlappingSpeech)).toBe(false);
    expect(c.session.output.audio).toBe(c.room);
    c.emit('agent_state_changed', { newState: 'speaking' });
    c.emit('user_state_changed', { newState: 'speaking' });
    vi.advanceTimersByTime(SUSTAINED_SPEECH_MS);
    expect(c.session.interrupt).toHaveBeenCalledTimes(1);
    expect(c.room.calls).toEqual([]);
  });
});
