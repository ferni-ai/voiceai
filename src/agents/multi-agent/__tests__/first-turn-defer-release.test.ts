/**
 * FIRST_TURN_DEFER_RELEASE: what lifts turn 1's held context build once Ferni
 * replies. `settle` (the default) is 600 ms into the reply; `reply_end` is the
 * reply's end or interruption, so the build's stalls never land in its audio.
 */
import { EventEmitter } from 'node:events';
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deferFirstTurn, resetTurnPipelineWarm, SPEAKING_SETTLE_MS } from '../first-turn-defer.js';
import { firstTurnDeferRelease } from '../first-turn-release.js';
import { attachTurnContextPusher, type UserTurnHook } from '../turn-intelligence.js';

const ON = { FIRST_TURN_DEFER_BACKGROUND: 'on' };
const REPLY_END = { ...ON, FIRST_TURN_DEFER_RELEASE: 'reply_end' };

const makeAgent = () => {
  let ctx = llm.ChatContext.empty();
  return {
    get chatCtx() {
      return ctx;
    },
    updateChatCtx: vi.fn(async (next: llm.ChatContext) => {
      ctx = next;
    }),
  };
};

const pause = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const finalTranscript = (session: EventEmitter, transcript: string) =>
  session.emit('user_input_transcribed', { transcript, isFinal: true });
const agentState = (session: EventEmitter, newState: string) =>
  session.emit('agent_state_changed', { newState });

const message = (text: string) => llm.ChatMessage.create({ role: 'user', content: text });

beforeEach(() => resetTurnPipelineWarm()); // every test is a fresh process

describe('firstTurnDeferRelease', () => {
  it('is reply_end only when set so, settle otherwise', () => {
    expect(firstTurnDeferRelease({})).toBe('settle');
    expect(firstTurnDeferRelease({ FIRST_TURN_DEFER_RELEASE: 'settle' })).toBe('settle');
    expect(firstTurnDeferRelease({ FIRST_TURN_DEFER_RELEASE: 'on' })).toBe('settle');
    expect(firstTurnDeferRelease({ FIRST_TURN_DEFER_RELEASE: 'reply_end' })).toBe('reply_end');
    expect(firstTurnDeferRelease({ FIRST_TURN_DEFER_RELEASE: ' Reply_End ' })).toBe('reply_end');
  });
});

describe('FIRST_TURN_DEFER_RELEASE=reply_end', () => {
  it('does not build while Ferni speaks, past the settle period; builds on speaking -> listening', async () => {
    const session = new EventEmitter();
    const hook = vi.fn<UserTurnHook>(async () => {});
    const detach = attachTurnContextPusher(hook, makeAgent(), session, { env: REPLY_END });

    finalTranscript(session, 'long day at work');
    agentState(session, 'thinking');
    agentState(session, 'speaking');
    await pause(SPEAKING_SETTLE_MS + 150); // settle would have released by now
    expect(hook).not.toHaveBeenCalled();

    agentState(session, 'listening');
    await vi.waitFor(() => expect(hook).toHaveBeenCalledTimes(1), { timeout: 300 });
    expect(hook.mock.calls[0][1].textContent).toBe('long day at work');
    await detach();
  });

  it('an interrupted reply releases on the interruption, well before the 6 s bound', async () => {
    const hook = vi.fn<UserTurnHook>(async () => {});
    const deferral = deferFirstTurn(hook, { releaseOn: 'reply_end' });
    deferral.onFinalTranscript('so anyway');
    void deferral.hook(llm.ChatContext.empty(), message('so anyway'));
    deferral.onAgentState('speaking');
    await pause(10);
    expect(hook).not.toHaveBeenCalled();
    deferral.onAgentState('listening'); // the caller barged in: the SDK's interruption
    await vi.waitFor(() => expect(hook).toHaveBeenCalledTimes(1), { timeout: 500 });
    await deferral.dispose();
  });

  it('a released turn-1 note survives turn 2 starting while its build still runs', async () => {
    // The verifier's timeline: an 800 ms build, a 1.5 s reply, turn 2's words 300 ms after it ends.
    const session = new EventEmitter();
    const hook = vi.fn<UserTurnHook>(async (ctx, msg) => {
      await pause(800);
      ctx.addMessage({ role: 'user', content: `NOTE for ${msg.textContent}` });
    });
    const agent = makeAgent();
    const detach = attachTurnContextPusher(hook, agent, session, { env: REPLY_END });
    finalTranscript(session, 'turn one words');
    agentState(session, 'thinking');
    agentState(session, 'speaking');
    await pause(1500);
    agentState(session, 'listening'); // releases turn 1's build, which runs to 800 ms
    await pause(300);
    finalTranscript(session, 'yeah'); // turn 2 starts before turn 1's note is ready
    agentState(session, 'thinking');
    agentState(session, 'speaking');
    await pause(1200);
    agentState(session, 'listening'); // turn 2's note is pushed here
    await vi.waitFor(
      () => {
        const texts = agent.chatCtx.items.map((item) => (item as { textContent?: string }).textContent ?? '');
        expect(texts.join('\n')).toContain('NOTE for turn one words');
      },
      { timeout: 1000 }
    );
    await detach();
  });

  it('is not released by the end of the greeting, spoken before turn 1', async () => {
    const hook = vi.fn<UserTurnHook>(async () => {});
    const deferral = deferFirstTurn(hook, { releaseOn: 'reply_end' });
    deferral.onAgentState('speaking'); // greeting, before any words: nothing armed
    deferral.onFinalTranscript('hi'); // the caller talks over the greeting's end
    void deferral.hook(llm.ChatContext.empty(), message('hi'));
    deferral.onAgentState('listening'); // greeting ends: not the reply to turn 1
    deferral.onAgentState('thinking');
    await pause(10);
    expect(hook).not.toHaveBeenCalled();
    deferral.onAgentState('speaking');
    deferral.onAgentState('listening');
    await vi.waitFor(() => expect(hook).toHaveBeenCalledTimes(1), { timeout: 300 });
    await deferral.dispose();
  });

  it('runs turn 1 on the timeout when the reply never starts', async () => {
    const hook = vi.fn<UserTurnHook>(async () => {});
    const deferral = deferFirstTurn(hook, { releaseOn: 'reply_end', maxDeferMs: 20 });
    deferral.onFinalTranscript('hi');
    const done = deferral.hook(llm.ChatContext.empty(), message('hi'));
    deferral.onAgentState('thinking');
    expect(hook).not.toHaveBeenCalled();
    await done;
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('the bound restarts with the reply, so it does not fire into a long reply', () => {
    vi.useFakeTimers();
    try {
      const hook = vi.fn<UserTurnHook>(async () => {});
      const deferral = deferFirstTurn(hook, { releaseOn: 'reply_end', maxDeferMs: 1000 });
      deferral.onFinalTranscript('hi');
      void deferral.hook(llm.ChatContext.empty(), message('hi'));
      vi.advanceTimersByTime(800);
      deferral.onAgentState('speaking');
      vi.advanceTimersByTime(900); // 1.7 s after the words, 0.9 s into the reply
      expect(vi.getTimerCount()).toBe(1); // still held, still bounded
      vi.advanceTimersByTime(200);
      expect(vi.getTimerCount()).toBe(0); // the bound fired: released
    } finally {
      vi.useRealTimers();
    }
  });

  it('a crisis decision mid-reply still releases at once', async () => {
    const session = new EventEmitter();
    const hook = vi.fn<UserTurnHook>(async () => {});
    const detach = attachTurnContextPusher(hook, makeAgent(), session, { env: REPLY_END });
    finalTranscript(session, 'long day at work');
    agentState(session, 'speaking');
    session.emit('crisis_gate_decision', { action: 'guide' });
    await vi.waitFor(() => expect(hook).toHaveBeenCalledTimes(1), { timeout: 300 });
    await detach();
  });

  it('a safety signal in the words still releases at once, before any reply', async () => {
    const hook = vi.fn<UserTurnHook>(async () => {});
    const deferral = deferFirstTurn(hook, { releaseOn: 'reply_end', safetySignal: () => true });
    deferral.onFinalTranscript('hi');
    await deferral.hook(llm.ChatContext.empty(), message('hi'));
    expect(hook).toHaveBeenCalledTimes(1);
  });
});

describe('FIRST_TURN_DEFER_RELEASE unset or settle: unchanged', () => {
  for (const env of [ON, { ...ON, FIRST_TURN_DEFER_RELEASE: 'settle' }]) {
    it(`releases ${SPEAKING_SETTLE_MS} ms into the reply while Ferni still speaks (${JSON.stringify(env)})`, async () => {
      const session = new EventEmitter();
      const hook = vi.fn<UserTurnHook>(async () => {});
      const detach = attachTurnContextPusher(hook, makeAgent(), session, { env });
      finalTranscript(session, 'long day at work');
      agentState(session, 'speaking');
      const spokeAt = performance.now();
      await vi.waitFor(() => expect(hook).toHaveBeenCalledTimes(1), { timeout: 2000 });
      expect(performance.now() - spokeAt).toBeGreaterThanOrEqual(SPEAKING_SETTLE_MS - 20);
      await detach(); // no 'listening' was ever sent
    });
  }
});
