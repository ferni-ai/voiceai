import { EventEmitter } from 'node:events';
import { ReadableStream } from 'node:stream/web';
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { gatedReply } from '../../personas/crisis-gate.js';
import { deferFirstTurn, firstTurnDeferEnabled, hasSafetySignal } from '../first-turn-defer.js';
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
  it('is on only with FIRST_TURN_DEFER_BACKGROUND=on and a live crisis gate', () => {
    expect(firstTurnDeferEnabled({})).toBe(false);
    expect(firstTurnDeferEnabled({ FIRST_TURN_DEFER_BACKGROUND: 'true' })).toBe(false);
    expect(firstTurnDeferEnabled(ON)).toBe(true);
    expect(firstTurnDeferEnabled({ ...ON, CRISIS_GUARD_MODE: 'shadow' })).toBe(false);
    expect(firstTurnDeferEnabled({ ...ON, CRISIS_GUARD_MODE: 'off' })).toBe(false);
  });
});

describe('turn 1 background work with FIRST_TURN_DEFER_BACKGROUND', () => {
  it('a 1 s blocking build does not delay turn 1 reply request when on; it does when off', async () => {
    const delayWith = async (env: Record<string, string>) => {
      const session = new EventEmitter();
      const hook = blockingHook(1000);
      const detach = attachTurnContextPusher(hook, makeAgent(), session, { env });
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
    const detach = attachTurnContextPusher(hook, agent, session, { env: ON });

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

  it('builds every segment of turn 1, none dropped', async () => {
    const session = new EventEmitter();
    const hook = blockingHook(0);
    const detach = attachTurnContextPusher(hook, makeAgent(), session, { env: ON });

    finalTranscript(session, 'hey ferni, it has been kind of a');
    agentState(session, 'thinking');
    finalTranscript(session, 'long day');
    await pause(20);
    expect(hook).not.toHaveBeenCalled();
    agentState(session, 'speaking');

    await vi.waitFor(() => expect(hook).toHaveBeenCalledTimes(2));
    expect(hook.mock.calls.map((c) => c[1].textContent)).toEqual([
      'hey ferni, it has been kind of a',
      'long day',
    ]);
    detach();
  });

  it('leaves turns 2+ alone: they build at once, before Ferni speaks', async () => {
    const session = new EventEmitter();
    const hook = blockingHook(0);
    const detach = attachTurnContextPusher(hook, makeAgent(), session, { env: ON });

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
    const detach = attachTurnContextPusher(hook, makeAgent(), session, { env: ON });

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
    const deferral = deferFirstTurn(hook, { maxDeferMs: 20 });
    deferral.onFinalTranscript('hi');
    const done = deferral.hook(
      llm.ChatContext.empty(),
      llm.ChatMessage.create({ role: 'user', content: 'hi' })
    );
    expect(hook).not.toHaveBeenCalled();
    await done;
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('runs a held turn 1 when the session ends before Ferni speaks', async () => {
    const session = new EventEmitter();
    const hook = blockingHook(0);
    const detach = attachTurnContextPusher(hook, makeAgent(), session, { env: ON });

    finalTranscript(session, 'im parked on the bridge, just sitting here');
    await pause(20);
    expect(hook).not.toHaveBeenCalled();

    detach(); // caller hung up: no 'speaking', no gate verdict, well inside the 6 s bound
    await vi.waitFor(() => expect(hook).toHaveBeenCalledTimes(1), { timeout: 500 });
    expect(hook.mock.calls[0][1].textContent).toBe('im parked on the bridge, just sitting here');
  });

  it('builds turn 1 at once when off (the default)', async () => {
    const session = new EventEmitter();
    const hook = blockingHook(0);
    const detach = attachTurnContextPusher(hook, makeAgent(), session, { env: {} });

    finalTranscript(session, 'hi');
    await vi.waitFor(() => expect(hook).toHaveBeenCalledTimes(1));
    detach();
  });
});

describe('safety work on turn 1 is never deferred', () => {
  const PATTERNS_ONLY = { ...ON, CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
  const LIVE = { ...ON, CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };

  beforeEach(() => resetCrisisClassifierCache());

  const callSession = () => Object.assign(new EventEmitter(), { userData: {} });
  const turnOne = (text: string) => {
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
    ctx.addMessage({ role: 'assistant', content: 'Hey, good to hear from you.' });
    ctx.addMessage({ role: 'user', content: text });
    return ctx;
  };
  const modelSaying = (text: string) =>
    vi.fn(
      async () =>
        new ReadableStream<unknown>({
          start(controller) {
            controller.enqueue(text);
            controller.close();
          },
        })
    );
  const opener = { wrap: (stream: ReadableStream<unknown>) => stream };

  it('flags crisis words and distress, not ordinary talk', () => {
    expect(hasSafetySignal('I want to kill myself tonight')).toBe(true);
    expect(hasSafetySignal("I hope I don't wake up tomorrow")).toBe(true);
    expect(hasSafetySignal('what should I cook tonight?')).toBe(false);
  });

  it('a crisis utterance on turn 1: turn intelligence runs at once and the gate decides before the reply', async () => {
    const session = callSession();
    const hook = blockingHook(0);
    const detach = attachTurnContextPusher(hook, makeAgent(), session, {
      env: PATTERNS_ONLY,
      userData: session.userData,
    });

    finalTranscript(session, 'I want to kill myself tonight');
    // No 'speaking' yet: the safety build is not held behind the reply.
    await vi.waitFor(() => expect(hook).toHaveBeenCalledTimes(1), { timeout: 500 });
    expect(hook.mock.calls[0][1].textContent).toBe('I want to kill myself tonight');

    const model = modelSaying('Sounds fun!');
    const reply = await gatedReply(
      turnOne('I want to kill myself tonight'),
      session,
      model as never,
      opener as never,
      { env: PATTERNS_ONLY }
    );
    const said: unknown[] = [];
    for await (const chunk of reply as unknown as AsyncIterable<unknown>) said.push(chunk);
    expect(model).not.toHaveBeenCalled();
    expect(said.join('')).toContain('988');
    detach();
  });

  it('a crisis only the classifier catches releases turn 1 before the crisis reply is spoken', async () => {
    const session = callSession();
    const hook = blockingHook(0);
    const detach = attachTurnContextPusher(hook, makeAgent(), session, {
      env: LIVE,
      userData: session.userData,
    });
    const text = 'im parked on the bridge, engine off, just sitting here deciding';
    expect(hasSafetySignal(text)).toBe(false);

    finalTranscript(session, text);
    await pause(20);
    expect(hook).not.toHaveBeenCalled();

    const generate: CrisisGenerateFn = async () => '{"risk":"imminent","subject":"self"}';
    const reply = await gatedReply(
      turnOne(text),
      session,
      modelSaying('Sounds peaceful!') as never,
      opener as never,
      { env: LIVE, generate }
    );
    const said: unknown[] = [];
    let builtBeforeFirstWord = false;
    for await (const chunk of reply as unknown as AsyncIterable<unknown>) {
      if (said.length === 0) builtBeforeFirstWord = hook.mock.calls.length === 1;
      said.push(chunk);
    }
    expect(said.join('')).toContain('911');
    expect(builtBeforeFirstWord).toBe(true);
    detach();
  });
});
