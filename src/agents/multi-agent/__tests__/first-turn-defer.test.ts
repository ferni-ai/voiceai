import { EventEmitter } from 'node:events';
import { llm } from '@livekit/agents';
import { describe, expect, it, vi } from 'vitest';
import { deferFirstTurn, firstTurnDeferEnabled } from '../first-turn-defer.js';
import { attachTurnContextPusher, type UserTurnHook } from '../turn-intelligence.js';

const ON = { FIRST_TURN_DEFER_BACKGROUND: 'on' };

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
const texts = (agent: ReturnType<typeof makeAgent>) =>
  agent.chatCtx.items.map((i) => (i as { textContent?: string }).textContent ?? '');

/** Turn intelligence as it behaves cold on turn 1: one await, then the thread is busy. */
const blockingHook = (blockMs: number) =>
  vi.fn<UserTurnHook>(async (turnCtx, message) => {
    await Promise.resolve();
    const until = performance.now() + blockMs;
    while (performance.now() < until) {
      // busy: the event loop can run nothing else
    }
    turnCtx.addMessage({ role: 'user', content: `[CONTEXT about: ${message.textContent}]` });
  });

const pause = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const finalTranscript = (session: EventEmitter, transcript: string) =>
  session.emit('user_input_transcribed', { transcript, isFinal: true });
const agentState = (session: EventEmitter, newState: string) =>
  session.emit('agent_state_changed', { newState });

/** When the SDK's reply request (llmNode) would run, scheduled 10 ms after the turn ends. */
const replyRequestDelay = (start: number) =>
  new Promise<number>((resolve) => {
    setTimeout(() => resolve(performance.now() - start), 10);
  });

describe('firstTurnDeferEnabled', () => {
  it('is off unless FIRST_TURN_DEFER_BACKGROUND=on', () => {
    expect(firstTurnDeferEnabled({})).toBe(false);
    expect(firstTurnDeferEnabled({ FIRST_TURN_DEFER_BACKGROUND: 'true' })).toBe(false);
    expect(firstTurnDeferEnabled(ON)).toBe(true);
  });
});

describe('turn 1 background work with FIRST_TURN_DEFER_BACKGROUND', () => {
  it('a 1 s blocking build does not delay turn 1 reply request when on; it does when off', async () => {
    const delayWith = async (env: Record<string, string>) => {
      const session = new EventEmitter();
      const hook = blockingHook(1000);
      const detach = attachTurnContextPusher(hook, makeAgent(), session, env);
      const start = performance.now();
      finalTranscript(session, 'hey ferni, long day');
      const delay = await replyRequestDelay(start);
      agentState(session, 'speaking'); // the reply's first audio, after its first token
      await vi.waitFor(() => expect(hook).toHaveBeenCalledTimes(1), { timeout: 3000 });
      detach();
      return delay;
    };

    expect(await delayWith({})).toBeGreaterThanOrEqual(900);
    expect(await delayWith(ON)).toBeLessThan(200);
  });

  it('builds turn 1 once Ferni speaks, and its note reaches the context for turn 2', async () => {
    const session = new EventEmitter();
    const agent = makeAgent();
    const hook = blockingHook(1000);
    const detach = attachTurnContextPusher(hook, agent, session, ON);

    finalTranscript(session, 'my puppy chewed my shoes');
    agentState(session, 'thinking');
    await pause(20);
    expect(hook).not.toHaveBeenCalled();

    agentState(session, 'speaking');
    await vi.waitFor(() => expect(hook).toHaveBeenCalledTimes(1), { timeout: 3000 });
    agentState(session, 'listening');
    await vi.waitFor(() => expect(agent.updateChatCtx).toHaveBeenCalledTimes(1));
    expect(texts(agent).join('\n')).toContain('[CONTEXT about: my puppy chewed my shoes]');
    detach();
  });

  it('builds only the latest segment of turn 1', async () => {
    const session = new EventEmitter();
    const hook = blockingHook(0);
    const detach = attachTurnContextPusher(hook, makeAgent(), session, ON);

    finalTranscript(session, 'hey ferni, it has been kind of a');
    agentState(session, 'thinking');
    finalTranscript(session, 'hey ferni, it has been kind of a long day');
    agentState(session, 'speaking');

    await vi.waitFor(() => expect(hook).toHaveBeenCalledTimes(1));
    await pause(20);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook.mock.calls[0][1].textContent).toBe('hey ferni, it has been kind of a long day');
    detach();
  });

  it('leaves turns 2+ alone: they build at once, before Ferni speaks', async () => {
    const session = new EventEmitter();
    const hook = blockingHook(0);
    const detach = attachTurnContextPusher(hook, makeAgent(), session, ON);

    finalTranscript(session, 'first turn');
    agentState(session, 'speaking');
    await vi.waitFor(() => expect(hook).toHaveBeenCalledTimes(1));
    agentState(session, 'listening');

    finalTranscript(session, 'second turn');
    await vi.waitFor(() => expect(hook).toHaveBeenCalledTimes(2));
    expect(hook.mock.calls[1][1].textContent).toBe('second turn');
    detach();
  });

  it('is not released by the greeting, which Ferni speaks before turn 1', async () => {
    const session = new EventEmitter();
    const hook = blockingHook(0);
    const detach = attachTurnContextPusher(hook, makeAgent(), session, ON);

    agentState(session, 'speaking'); // greeting
    agentState(session, 'listening');
    finalTranscript(session, 'hi');
    await pause(20);
    expect(hook).not.toHaveBeenCalled();

    agentState(session, 'speaking');
    await vi.waitFor(() => expect(hook).toHaveBeenCalledTimes(1));
    detach();
  });

  it('runs turn 1 anyway when Ferni never speaks within the bound', async () => {
    const hook = vi.fn<UserTurnHook>(async () => {});
    const deferral = deferFirstTurn(hook, 20);
    deferral.onFinalTranscript();
    const done = deferral.hook(
      llm.ChatContext.empty(),
      llm.ChatMessage.create({ role: 'user', content: 'hi' })
    );
    expect(hook).not.toHaveBeenCalled();
    await done;
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('builds turn 1 at once when off (the default)', async () => {
    const session = new EventEmitter();
    const hook = blockingHook(0);
    const detach = attachTurnContextPusher(hook, makeAgent(), session, {});

    finalTranscript(session, 'hi');
    await vi.waitFor(() => expect(hook).toHaveBeenCalledTimes(1));
    detach();
  });
});
