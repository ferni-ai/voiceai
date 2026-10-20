import { EventEmitter } from 'node:events';
import { ReadableStream } from 'node:stream/web';
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { gatedReply } from '../../personas/crisis-gate.js';
import {
  deferFirstTurn,
  firstTurnDeferEnabled,
  hasSafetySignal,
  resetTurnPipelineWarm,
  SPEAKING_SETTLE_MS,
} from '../first-turn-defer.js';
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

beforeEach(() => resetTurnPipelineWarm()); // every test is a fresh process

describe('firstTurnDeferEnabled', () => {
  it('is on only with FIRST_TURN_DEFER_BACKGROUND=on and a live crisis gate', () => {
    expect(firstTurnDeferEnabled({})).toBe(false);
    expect(firstTurnDeferEnabled({ FIRST_TURN_DEFER_BACKGROUND: 'off' })).toBe(false);
    expect(firstTurnDeferEnabled(ON)).toBe(true);
    expect(firstTurnDeferEnabled({ ...ON, CRISIS_GUARD_MODE: 'shadow' })).toBe(false);
    expect(firstTurnDeferEnabled({ ...ON, CRISIS_GUARD_MODE: 'off' })).toBe(false);
  });

  it('is on only on the cascade path: the realtime models skip llmNode and CrisisGate', () => {
    expect(firstTurnDeferEnabled({ ...ON, VOICE_PIPELINE: 'cartesia-cascade' })).toBe(true);
    expect(firstTurnDeferEnabled({ ...ON, VOICE_PIPELINE: 'openai-realtime' })).toBe(false);
    expect(firstTurnDeferEnabled({ ...ON, VOICE_PIPELINE: 'gemini-live' })).toBe(false);
    expect(firstTurnDeferEnabled({ ...ON, VOICE_PIPELINE: 'gemini-native-audio' })).toBe(false);
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
    expect(await delayWith(ON)).toBeLessThan(500); // well under the 1 s block, with room for a loaded CI box
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

  it('session end waits for the released turn-1 build to finish', async () => {
    const session = new EventEmitter();
    let finished = false;
    const hook = vi.fn<UserTurnHook>(async () => {
      await pause(200);
      finished = true;
    });
    const detach = attachTurnContextPusher(hook, makeAgent(), session, { env: ON });

    finalTranscript(session, 'im parked on the bridge, just sitting here');
    await pause(20);
    expect(hook).not.toHaveBeenCalled();
    await detach();
    expect(hook).toHaveBeenCalledTimes(1);
    expect(finished).toBe(true);
  });

  it('session end right after the words still waits for their build', async () => {
    const session = new EventEmitter();
    let finished = false;
    const hook = vi.fn<UserTurnHook>(async () => {
      await pause(100);
      finished = true;
    });
    const detach = attachTurnContextPusher(hook, makeAgent(), session, { env: ON });
    finalTranscript(session, 'im parked on the bridge, just sitting here');
    await detach(); // same tick: the pusher has not reached the hook yet
    expect(finished).toBe(true);
  });

  it('session end waits at most the bound for turn-1 work', async () => {
    const deferral = deferFirstTurn(
      vi.fn<UserTurnHook>(() => new Promise<void>(() => {})),
      { endWaitMs: 50 }
    );
    deferral.onFinalTranscript('hi');
    void deferral.hook(
      llm.ChatContext.empty(),
      llm.ChatMessage.create({ role: 'user', content: 'hi' })
    );
    const start = performance.now();
    await deferral.dispose();
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it('a persona taking over after turn 1 (handoff) does not defer its first turn', async () => {
    const session = new EventEmitter();
    const first = blockingHook(0);
    const detachFirst = attachTurnContextPusher(first, makeAgent(), session, { env: ON });
    finalTranscript(session, 'first turn');
    agentState(session, 'speaking');
    await vi.waitFor(() => expect(first).toHaveBeenCalledTimes(1));
    agentState(session, 'listening');

    resetTurnPipelineWarm(); // so only the handoff, not a warm process, can skip the hold
    const next = blockingHook(0);
    const detachNext = attachTurnContextPusher(next, makeAgent(), session, { env: ON });
    await detachFirst();
    finalTranscript(session, 'hi maya');
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1), { timeout: 500 });
    await detachNext();
  });

  it('a failing safety check releases turn 1 at once and never throws into the listener', async () => {
    const hook = vi.fn<UserTurnHook>(async () => {});
    const deferral = deferFirstTurn(hook, {
      safetySignal: () => {
        throw new Error('guard broke');
      },
    });
    expect(() => deferral.onFinalTranscript('hi')).not.toThrow();
    await deferral.hook(
      llm.ChatContext.empty(),
      llm.ChatMessage.create({ role: 'user', content: 'hi' })
    );
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('lets the reply play for the settle period before the held work starts', async () => {
    const session = new EventEmitter();
    const hook = blockingHook(0);
    const detach = attachTurnContextPusher(hook, makeAgent(), session, { env: ON });
    finalTranscript(session, 'long day at work');
    agentState(session, 'speaking');
    const spokeAt = performance.now();
    await vi.waitFor(() => expect(hook).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(performance.now() - spokeAt).toBeGreaterThanOrEqual(SPEAKING_SETTLE_MS - 20);
    await detach();
  });

  it('a reply that ends inside the settle period releases at once', async () => {
    const session = new EventEmitter();
    const hook = blockingHook(0);
    const detach = attachTurnContextPusher(hook, makeAgent(), session, { env: ON });
    finalTranscript(session, 'hi');
    agentState(session, 'speaking');
    agentState(session, 'listening');
    await vi.waitFor(() => expect(hook).toHaveBeenCalledTimes(1), { timeout: 400 });
    await detach();
  });

  it('a crisis decision inside the settle period still releases at once', async () => {
    const session = new EventEmitter();
    const hook = blockingHook(0);
    const detach = attachTurnContextPusher(hook, makeAgent(), session, { env: ON });
    finalTranscript(session, 'long day at work');
    agentState(session, 'speaking');
    session.emit('crisis_gate_decision', { action: 'guide' });
    await vi.waitFor(() => expect(hook).toHaveBeenCalledTimes(1), { timeout: 400 });
    await detach();
  });

  it('a safety release cancels the pending settle and the cap: no timer is left behind', () => {
    vi.useFakeTimers();
    try {
      const deferral = deferFirstTurn(vi.fn<UserTurnHook>(async () => {}));
      deferral.onFinalTranscript('long day at work'); // arms the cap
      deferral.onAgentState('speaking'); // arms the settle
      expect(vi.getTimerCount()).toBe(2);
      deferral.onCrisisDecision('guide');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('defers only in a cold process: once the turn pipeline has run, a new call builds turn 1 at once', async () => {
    const first = new EventEmitter();
    const hook = blockingHook(0);
    const detachFirst = attachTurnContextPusher(hook, makeAgent(), first, { env: ON });
    finalTranscript(first, 'first call');
    agentState(first, 'listening'); // not 'speaking': still held
    await pause(50);
    expect(hook).not.toHaveBeenCalled();
    await detachFirst(); // the call ends; its turn 1 is built, and the process is now warm
    expect(hook).toHaveBeenCalledTimes(1);

    const second = new EventEmitter();
    const next = blockingHook(0);
    const detachSecond = attachTurnContextPusher(next, makeAgent(), second, { env: ON });
    finalTranscript(second, 'second call');
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1), { timeout: 500 });
    await detachSecond();
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
