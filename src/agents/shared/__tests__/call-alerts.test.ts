import { describe, expect, it, vi } from 'vitest';
import { voice } from '@livekit/agents';
import { alertInstructions, createCallAlertSpeaker, MAX_ALERT_ATTEMPTS } from '../call-alerts.js';

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
  const s = {
    agentState: 'speaking',
    userState: 'listening',
    _activity: { currentSpeech: undefined as unknown },
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

const tick = () =>
  new Promise<void>((r) => {
    setTimeout(r, 0);
  });

function speaker(s: ReturnType<typeof fakeSession>) {
  const logs: Array<{ msg: string; fields: Record<string, unknown> }> = [];
  const speak = createCallAlertSpeaker(s, { log: (msg, fields) => logs.push({ msg, fields }) });
  return { speak, logs, msgs: () => logs.map((l) => l.msg) };
}

describe('call alerts', () => {
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
    await done;
  });

  it('waits for the caller to finish talking', async () => {
    const s = fakeSession();
    s.agentState = 'listening';
    s.userState = 'speaking';
    const { speak } = speaker(s);
    void speak(timer);
    await tick();
    expect(s.generateReply).not.toHaveBeenCalled();
    s.setUser('listening');
    await tick();
    expect(s.generateReply).toHaveBeenCalledTimes(1);
  });

  it('logs CALL_ALERT_SPOKEN when its audio starts, not when it is asked for', async () => {
    const s = fakeSession();
    s.agentState = 'listening';
    const { speak, msgs } = speaker(s);
    const done = speak(timer);
    await tick();
    expect(s.generateReply).toHaveBeenCalledTimes(1);
    s.setAgent('thinking');
    s._activity.currentSpeech = {}; // another reply is what plays
    s.setAgent('speaking');
    await tick();
    expect(msgs()).toEqual([]);
    s.play();
    await done;
    expect(msgs()).toEqual(['CALL_ALERT_SPOKEN']);
  });

  it('a reply cut before any audio is asked for again at the next pause (#2507)', async () => {
    const s = fakeSession();
    s.agentState = 'listening';
    const { speak, msgs, logs } = speaker(s);
    const done = speak(timer);
    await tick();
    // The caller spoke: LiveKit paused the alert's reply at launch, then their turn cut it.
    s.setUser('speaking');
    s.handles[0].finish(true);
    s.setAgent('thinking'); // Ferni answers the caller
    await tick();
    expect(msgs()).toEqual(['CALL_ALERT_RETRY']);
    expect(logs[0].fields).toMatchObject({ reason: 'cut_before_audio', attempt: 1 });
    expect(s.generateReply).toHaveBeenCalledTimes(1); // not over the caller, not over the answer
    s.setUser('listening');
    s.setAgent('speaking');
    await tick();
    expect(s.generateReply).toHaveBeenCalledTimes(1);
    s.setAgent('listening');
    await tick();
    expect(s.generateReply).toHaveBeenCalledTimes(2);
    s.play();
    await done;
    expect(msgs()).toEqual(['CALL_ALERT_RETRY', 'CALL_ALERT_SPOKEN']);
  });

  it(`gives up after ${MAX_ALERT_ATTEMPTS} cut replies and logs CALL_ALERT_DROPPED`, async () => {
    const s = fakeSession();
    s.agentState = 'listening';
    const { speak, msgs, logs } = speaker(s);
    const done = speak(timer);
    for (let i = 0; i < MAX_ALERT_ATTEMPTS; i++) {
      // eslint-disable-next-line no-await-in-loop -- one attempt at a time
      await tick();
      s.handles[i].finish(true);
    }
    await done;
    expect(s.generateReply).toHaveBeenCalledTimes(MAX_ALERT_ATTEMPTS);
    expect(msgs()).toEqual(['CALL_ALERT_RETRY', 'CALL_ALERT_DROPPED']);
    expect(logs[1].fields).toMatchObject({ reason: 'cut_before_audio', type: 'timer_complete' });
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
    s.handles[0].finish(true);
    await done;
    await tick();
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

  it('gives Ferni the facts, not canned words', () => {
    const text = alertInstructions(timer);
    expect(text).toContain('in your own words');
    expect(text).not.toContain("Timer's up");
  });
});
