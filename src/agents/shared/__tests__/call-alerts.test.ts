import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { voice } from '@livekit/agents';
import {
  alertInstructions,
  ANSWER_START_MS,
  createCallAlertSpeaker,
  HEARD_AFTER_MS,
  MAX_ALERT_ATTEMPTS,
} from '../call-alerts.js';

/** A LiveKit SpeechHandle as the speaker sees it. */
function fakeHandle() {
  const done: Array<() => void> = [];
  const h = {
    interrupted: false,
    addDoneCallback: (fn: () => void) => done.push(fn),
    finish(interrupted: boolean) {
      h.interrupted = interrupted;
      done.splice(0).forEach((fn) => fn());
    },
  };
  return h;
}

function fakeSession() {
  const listeners = new Map<string, Set<(ev: unknown) => void>>();
  const handles: Array<ReturnType<typeof fakeHandle>> = [];
  const closing = new AbortController();
  const s = {
    agentState: 'speaking',
    userState: 'listening',
    _activity: {
      currentSpeech: undefined as unknown,
      endpointingOpts: { maxDelay: 0 },
    },
    _closingSignal: closing.signal,
    close: () => closing.abort(),
    handles,
    generateReply: vi.fn(() => {
      const h = fakeHandle();
      handles.push(h);
      return h;
    }),
    on: (e: string, fn: (ev: unknown) => void) =>
      listeners.set(e, (listeners.get(e) ?? new Set()).add(fn)),
    off: (e: string, fn: (ev: unknown) => void) => listeners.get(e)?.delete(fn),
    emit: (e: string, ev: unknown = {}) => [...(listeners.get(e) ?? [])].forEach((fn) => fn(ev)),
    /** LiveKit's agent state; the event carries the new state. */
    setAgent(state: string) {
      s.agentState = state;
      s.emit(voice.AgentSessionEventTypes.AgentStateChanged, { newState: state });
    },
    setUser(state: string) {
      s.userState = state;
      s.emit(voice.AgentSessionEventTypes.UserStateChanged, { newState: state });
    },
    /** The latest reply's first audio plays. */
    play() {
      s._activity.currentSpeech = handles[handles.length - 1];
      s.setAgent('speaking');
    },
  };
  return s;
}

const timer = {
  type: 'timer_complete' as const,
  userId: 'u',
  message: "Timer's up for pasta!",
  priority: 'high' as const,
  context: { label: 'pasta' },
};

/** Lets pending timers and promise callbacks run, `ms` of fake time on. */
const tick = async (ms = 0) => {
  await vi.advanceTimersByTimeAsync(ms);
};

function speaker(s: ReturnType<typeof fakeSession>) {
  const logs: Array<{ msg: string; fields: Record<string, unknown> }> = [];
  const speak = createCallAlertSpeaker(s, { log: (msg, fields) => logs.push({ msg, fields }) });
  return { speak, logs, msgs: () => logs.map((l) => l.msg) };
}

/** The caller talks over the alert's reply; their turn cuts it. */
function callerCuts(s: ReturnType<typeof fakeSession>, i: number) {
  s.setUser('speaking');
  s.handles[i].finish(true);
  s.setUser('listening');
}

/** Ferni answers the caller: thinking, then speaking, then done. */
async function ferniAnswers(s: ReturnType<typeof fakeSession>) {
  s.setAgent('thinking');
  await tick(1400); // LiveKit's turn hooks run before the answer exists
  s._activity.currentSpeech = {};
  s.setAgent('speaking');
  await tick(2000);
  s.setAgent('listening');
  await tick();
}

describe('call alerts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for a pause, then has Ferni say it', async () => {
    const s = fakeSession();
    const { speak } = speaker(s);
    const done = speak(timer);
    await tick();
    expect(s.generateReply).not.toHaveBeenCalled(); // Ferni is mid-sentence
    s.setAgent('listening');
    await tick();
    expect(s.generateReply).toHaveBeenCalledWith({
      instructions: expect.stringContaining('(pasta) just went off'),
    });
    s.play();
    await tick(HEARD_AFTER_MS);
    await done;
  });

  it('waits for the caller to finish talking', async () => {
    const s = fakeSession();
    s.agentState = 'listening';
    s.userState = 'speaking';
    const { speak } = speaker(s);
    void speak(timer);
    await tick(5000);
    expect(s.generateReply).not.toHaveBeenCalled();
    s.setUser('listening');
    await tick();
    expect(s.generateReply).toHaveBeenCalledTimes(1);
  });

  it('logs CALL_ALERT_SPOKEN once its audio has played a while, not when it is asked for', async () => {
    const s = fakeSession();
    s.agentState = 'listening';
    const { speak, msgs } = speaker(s);
    const done = speak(timer);
    await tick();
    expect(s.generateReply).toHaveBeenCalledTimes(1);
    s.setAgent('thinking');
    s._activity.currentSpeech = {}; // another reply is what plays
    s.setAgent('speaking');
    await tick(HEARD_AFTER_MS);
    expect(msgs()).toEqual([]);
    s.setAgent('listening');
    s.play();
    await tick(HEARD_AFTER_MS - 100);
    expect(msgs()).toEqual([]); // its first audio alone is not "heard"
    await tick(100);
    await done;
    expect(msgs()).toEqual(['CALL_ALERT_SPOKEN']);
  });

  it('a reply cut before it is heard is said again after Ferni answers the caller (#2507)', async () => {
    const s = fakeSession();
    s.agentState = 'listening';
    const { speak, msgs, logs } = speaker(s);
    const done = speak(timer);
    await tick();
    s.play(); // its first audio...
    await tick(40);
    callerCuts(s, 0); // ...then the caller's turn cuts it
    await tick();
    expect(msgs()).toEqual(['CALL_ALERT_RETRY']);
    expect(logs[0].fields).toMatchObject({ reason: 'cut_before_heard', attempt: 1 });
    // Both sides read "listening" while the turn hooks run: not a pause to speak into.
    await ferniAnswers(s);
    expect(s.generateReply).toHaveBeenCalledTimes(2);
    s.play();
    await tick(HEARD_AFTER_MS);
    await done;
    expect(msgs()).toEqual(['CALL_ALERT_RETRY', 'CALL_ALERT_SPOKEN']);
  });

  it('the retry does not go ahead of the answer during the turn hooks', async () => {
    const s = fakeSession();
    s.agentState = 'listening';
    const { speak } = speaker(s);
    void speak(timer);
    await tick();
    callerCuts(s, 0);
    await tick(1400); // quiet on both sides, the answer not started yet
    expect(s.generateReply).toHaveBeenCalledTimes(1);
  });

  it('with no answer to wait for, the retry comes after ANSWER_START_MS', async () => {
    const s = fakeSession();
    s.agentState = 'listening';
    const { speak } = speaker(s);
    void speak(timer);
    await tick();
    callerCuts(s, 0);
    await tick(ANSWER_START_MS - 100);
    expect(s.generateReply).toHaveBeenCalledTimes(1);
    await tick(100);
    expect(s.generateReply).toHaveBeenCalledTimes(2);
  });

  it(`gives up after ${MAX_ALERT_ATTEMPTS} cut replies and logs CALL_ALERT_DROPPED`, async () => {
    const s = fakeSession();
    s.agentState = 'listening';
    const { speak, msgs, logs } = speaker(s);
    const done = speak(timer);
    for (let i = 0; i < MAX_ALERT_ATTEMPTS; i++) {
      // eslint-disable-next-line no-await-in-loop -- one attempt at a time
      await tick();
      callerCuts(s, i);
      // eslint-disable-next-line no-await-in-loop -- one attempt at a time
      await ferniAnswers(s);
    }
    await done;
    expect(s.generateReply).toHaveBeenCalledTimes(MAX_ALERT_ATTEMPTS);
    expect(msgs()).toEqual(['CALL_ALERT_RETRY', 'CALL_ALERT_DROPPED']);
    expect(logs[1].fields).toMatchObject({ reason: 'cut_before_heard', type: 'timer_complete' });
  });

  it('logs CALL_ALERT_DROPPED when the reply cannot be asked for', async () => {
    const s = fakeSession();
    s.agentState = 'listening';
    s.generateReply.mockImplementation(() => {
      throw new Error('activity closed');
    });
    const { speak, msgs, logs } = speaker(s);
    await speak(timer);
    expect(msgs()).toEqual(['CALL_ALERT_DROPPED']);
    expect(logs[0].fields).toMatchObject({ reason: 'reply_failed' });
  });

  it('is not repeated once heard, even if the caller then cuts it', async () => {
    const s = fakeSession();
    s.agentState = 'listening';
    const { speak, msgs } = speaker(s);
    const done = speak(timer);
    await tick();
    s.play();
    await tick(HEARD_AFTER_MS);
    callerCuts(s, 0);
    await done;
    await tick(ANSWER_START_MS);
    expect(s.generateReply).toHaveBeenCalledTimes(1);
    expect(msgs()).toEqual(['CALL_ALERT_SPOKEN']);
  });

  it('a reply that finished uninterrupted counts as spoken', async () => {
    const s = fakeSession();
    s.agentState = 'listening';
    const { speak, msgs } = speaker(s);
    const done = speak(timer);
    await tick();
    s.handles[0].finish(false);
    await done;
    expect(msgs()).toEqual(['CALL_ALERT_SPOKEN']);
  });

  it('counts playout, not time since the first frame: a pause for the caller stops the clock', async () => {
    const s = fakeSession();
    s.agentState = 'listening';
    const { speak, msgs } = speaker(s);
    const done = speak(timer);
    await tick();
    s.play();
    await tick(300);
    s.setAgent('listening'); // paused for the caller's voice
    await tick(1000);
    expect(msgs()).toEqual([]);
    s.setAgent('speaking'); // resumed
    await tick(HEARD_AFTER_MS - 300 - 1);
    expect(msgs()).toEqual([]);
    await tick(1);
    await done;
    expect(msgs()).toEqual(['CALL_ALERT_SPOKEN']);
  });

  it.each([
    ['460 ms played, then the caller talks 400 ms', 460, 400],
    ['the caller starts 100 ms in and talks 900 ms', 100, 900],
  ])('%s, then their turn cuts it: said again', async (_n, playMs, talkMs) => {
    const s = fakeSession();
    s.agentState = 'listening';
    const { speak, msgs } = speaker(s);
    const done = speak(timer);
    await tick();
    s.play();
    await tick(playMs);
    s.setAgent('listening'); // LiveKit pauses Ferni for the caller's voice
    s.setUser('speaking');
    await tick(talkMs);
    s.setUser('listening');
    s.handles[0].finish(true); // their turn commits and cuts the alert
    await tick();
    expect(msgs()).toEqual(['CALL_ALERT_RETRY']);
    await ferniAnswers(s);
    expect(s.generateReply).toHaveBeenCalledTimes(2);
    s.play();
    await tick(HEARD_AFTER_MS);
    await done;
    expect(msgs()).toEqual(['CALL_ALERT_RETRY', 'CALL_ALERT_SPOKEN']);
  });

  it("waits LiveKit's endpointing delay after the caller stops, so their turn can commit first", async () => {
    const s = fakeSession();
    s._activity.endpointingOpts.maxDelay = 1500;
    s.agentState = 'listening';
    s.userState = 'speaking';
    const { speak } = speaker(s);
    void speak(timer);
    await tick();
    s.setUser('listening');
    await tick(1499);
    expect(s.generateReply).not.toHaveBeenCalled();
    await tick(1);
    expect(s.generateReply).toHaveBeenCalledTimes(1);
  });

  it('the caller talking again during the retry wait: the retry waits for their turn too', async () => {
    const s = fakeSession();
    s._activity.endpointingOpts.maxDelay = 1500;
    s.agentState = 'listening';
    const { speak, msgs } = speaker(s);
    const done = speak(timer);
    await tick();
    callerCuts(s, 0);
    s.setAgent('thinking');
    await tick(1400);
    s._activity.currentSpeech = {};
    s.setAgent('speaking'); // Ferni answers...
    await tick(300);
    s.setAgent('listening'); // ...and the caller's voice pauses that answer
    s.setUser('speaking');
    await tick(600);
    s.setUser('listening'); // VAD end; their turn is not committed yet
    await tick(1000);
    expect(s.generateReply).toHaveBeenCalledTimes(1); // not into the commit
    s.setAgent('thinking'); // the commit: Ferni answers again
    await tick(1400);
    s.setAgent('speaking');
    await tick(2000);
    s.setAgent('listening');
    await tick();
    expect(s.generateReply).toHaveBeenCalledTimes(2);
    s.play();
    await tick(HEARD_AFTER_MS);
    await done;
    expect(msgs()).toEqual(['CALL_ALERT_RETRY', 'CALL_ALERT_SPOKEN']);
  });

  it('the call ends while it waits: CALL_ALERT_DROPPED call_ended, nothing asked for', async () => {
    const s = fakeSession();
    const { speak, msgs, logs } = speaker(s);
    const done = speak(timer); // Ferni is talking: it waits
    await tick(300);
    s.close();
    await done;
    expect(s.generateReply).not.toHaveBeenCalled();
    expect(msgs()).toEqual(['CALL_ALERT_DROPPED']);
    expect(logs[0].fields).toMatchObject({ reason: 'call_ended' });
  });

  it('gives Ferni the facts, not canned words', () => {
    const text = alertInstructions(timer);
    expect(text).toContain('in your own words');
    expect(text).not.toContain("Timer's up");
  });
});
