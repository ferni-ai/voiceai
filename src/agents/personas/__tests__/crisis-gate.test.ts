import { beforeEach, describe, expect, it, vi } from 'vitest';
import { llm } from '@livekit/agents';
import { ReadableStream, TransformStream } from 'node:stream/web';

const logInfo = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  const spyInfo = <T extends object>(logger: T): T =>
    new Proxy(logger, {
      get: (target, prop, receiver) => {
        const value = Reflect.get(target, prop, receiver);
        if (prop !== 'info' || typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          logInfo(...args);
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });
  return {
    ...real,
    createLogger: (...args: Parameters<typeof real.createLogger>) =>
      spyInfo(real.createLogger(...args)),
  };
});

import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { TURN_CONTEXT_HEADER } from '../../multi-agent/turn-intelligence.js';
import { buildCrisisGuidance, detectCrisis } from '../../safety/crisis-guard.js';
import { EventEmitter } from 'node:events';
import { attachTurnOpeningSound } from '../../integrations/turn-opening-sound.js';
import { OpenerGate } from '../opener-gate.js';
import {
  gatedReply,
  holdUntilCleared,
  startCrisisGate,
  textReply,
  type CrisisGateDecision,
} from '../crisis-gate.js';

const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };

function request(...turns: Array<['user' | 'assistant', string]>): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (const [role, content] of turns) ctx.addMessage({ role, content });
  return ctx;
}

const verdict =
  (reply: string): CrisisGenerateFn =>
  async () =>
    reply;

async function collect(stream: ReadableStream<unknown>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const chunk of stream as unknown as AsyncIterable<unknown>) out.push(chunk);
  return out;
}

function streamOf(chunks: string[], delayMs = 0): ReadableStream<unknown> {
  return new ReadableStream<unknown>({
    async start(controller) {
      for (const chunk of chunks) {
        if (delayMs)
          await new Promise((resolve) => {
            setTimeout(resolve, delayMs);
          });
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

beforeEach(() => resetCrisisClassifierCache());

describe('startCrisisGate: the patterns', () => {
  it('is off in shadow and off modes', () => {
    const ctx = request(['user', 'I want to kill myself']);
    expect(startCrisisGate(ctx, undefined, { env: { CRISIS_GUARD_MODE: 'shadow' } })).toBeNull();
    expect(startCrisisGate(ctx, undefined, { env: { CRISIS_GUARD_MODE: 'off' } })).toBeNull();
  });

  it('replaces the reply for an explicit statement', () => {
    const gate = startCrisisGate(request(['user', 'I want to kill myself tonight']), undefined, {
      env: PATTERNS_ONLY,
    });
    expect(gate?.decision.action).toBe('replace');
    expect(gate?.decision.action === 'replace' && gate.decision.script).toContain('988');
    expect(gate?.escalation).toBeNull();
  });

  it('guides the reply for passive ideation', () => {
    const gate = startCrisisGate(request(['user', "I hope I don't wake up tomorrow"]), undefined, {
      env: PATTERNS_ONLY,
    });
    expect(gate?.decision.action).toBe('guide');
  });

  it('passes an ordinary turn', () => {
    const gate = startCrisisGate(request(['user', 'what should I cook tonight?']), undefined, {
      env: PATTERNS_ONLY,
    });
    expect(gate?.decision).toEqual({ action: 'pass' });
  });

  it('reads only the words this reply answers, not pushed context notes', () => {
    const gate = startCrisisGate(
      request(
        ['user', 'I want to kill myself'],
        ['assistant', 'I am here with you.'],
        ['user', `${TURN_CONTEXT_HEADER}\nThey said they want to kill themselves`],
        ['user', 'can you play some music?']
      ),
      undefined,
      { env: PATTERNS_ONLY }
    );
    expect(gate?.decision.action).not.toBe('replace');
  });

  it("gives the classifier Ferni's line just before the caller's words", async () => {
    const generate = vi.fn<CrisisGenerateFn>(async () => '{"risk":"none","subject":"self"}');
    const gate = startCrisisGate(
      request(
        ['user', 'Plan the day with her.'],
        ['assistant', 'Morning hike, then a movie night.'],
        ['user', "Tell me again how you'd do it."]
      ),
      undefined,
      { env: LIVE, generate }
    );
    await gate?.escalation;
    expect(JSON.parse(generate.mock.calls[0][1])).toMatchObject({
      latest: "Tell me again how you'd do it.",
      earlier: ['Plan the day with her.'],
      companion: 'Morning hike, then a movie night.',
    });
  });

  it('uses the voice reading from the session', () => {
    const text = "honestly what's the point anymore";
    const calm = startCrisisGate(request(['user', text]), undefined, { env: PATTERNS_ONLY });
    const distressed = startCrisisGate(
      request(['user', text]),
      { voiceEmotion: { primary: 'hopeless', confidence: 0.9, stressLevel: 0.9 } },
      { env: PATTERNS_ONLY }
    );
    expect(calm?.decision.action).toBe('pass');
    expect(distressed?.decision.action).toBe('replace');
  });
});

describe('startCrisisGate: the classifier', () => {
  const missed = 'im parked on the bridge, engine off, just sitting here deciding';

  it('escalates a missed imminent message to the 911-first script', async () => {
    const gate = startCrisisGate(request(['user', missed]), undefined, {
      env: LIVE,
      generate: verdict('{"risk":"imminent","subject":"self"}'),
    });
    expect(gate?.decision.action).toBe('pass');
    const escalated = await gate?.escalation;
    expect(escalated?.action).toBe('replace');
    expect(escalated?.action === 'replace' && escalated.script).toContain('911');
  });

  it('does not escalate when the classifier agrees there is no risk', async () => {
    const gate = startCrisisGate(request(['user', 'what should I cook tonight?']), undefined, {
      env: LIVE,
      generate: verdict('{"risk":"none","subject":"self"}'),
    });
    expect(await gate?.escalation).toBeNull();
  });

  it('does not escalate when the classifier fails', async () => {
    const gate = startCrisisGate(request(['user', missed]), undefined, {
      env: LIVE,
      generate: async () => {
        throw new Error('quota');
      },
    });
    expect(await gate?.escalation).toBeNull();
  });

  it('skips the classifier when the patterns already replace the reply', () => {
    const generate = vi.fn<CrisisGenerateFn>();
    const gate = startCrisisGate(request(['user', 'I want to kill myself tonight']), undefined, {
      env: LIVE,
      generate,
    });
    expect(gate?.escalation).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });

  it('shares one classifier call between a preemptive and a final request', async () => {
    const generate = vi.fn<CrisisGenerateFn>(async () => '{"risk":"none","subject":"self"}');
    const ctx = request(['user', 'long day at work']);
    await startCrisisGate(ctx, undefined, { env: LIVE, generate })?.escalation;
    await startCrisisGate(ctx, undefined, { env: LIVE, generate })?.escalation;
    expect(generate).toHaveBeenCalledTimes(1);
  });
});

describe('holdUntilCleared', () => {
  it('releases the whole reply when nothing escalates', async () => {
    const out = await collect(
      holdUntilCleared(
        streamOf(['Hey', ' there'], 5) as never,
        Promise.resolve(null),
        async () => null
      )
    );
    expect(out).toEqual(['Hey', ' there']);
  });

  it('holds output until the verdict, then releases it in order', async () => {
    let clear: (value: CrisisGateDecision | null) => void = () => undefined;
    const escalation = new Promise<CrisisGateDecision | null>((resolve) => {
      clear = resolve;
    });
    const seen: unknown[] = [];
    const held = holdUntilCleared(streamOf(['a', 'b', 'c']) as never, escalation, async () => null);
    const reading = (async () => {
      for await (const chunk of held as unknown as AsyncIterable<unknown>) seen.push(chunk);
    })();
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(seen).toEqual([]);
    clear(null);
    await reading;
    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('logs how long a ready reply waited on the verdict', async () => {
    logInfo.mockClear();
    const late = new Promise<null>((resolve) => setTimeout(() => resolve(null), 60));
    await collect(holdUntilCleared(streamOf(['Hey', ' there']) as never, late, async () => null));
    const [fields] = logInfo.mock.calls.find((c) => c[1] === 'CRISIS_HOLD') ?? [];
    expect((fields as { delayedMs: number }).delayedMs).toBeGreaterThanOrEqual(40);
  });

  it('logs no delay when the verdict came before the reply', async () => {
    logInfo.mockClear();
    await collect(
      holdUntilCleared(streamOf(['Hey'], 30) as never, Promise.resolve(null), async () => null)
    );
    const [fields] = logInfo.mock.calls.find((c) => c[1] === 'CRISIS_HOLD') ?? [];
    expect(fields).toEqual({ delayedMs: 0 });
  });

  it('drops the reply and speaks the replacement on escalation', async () => {
    const out = await collect(
      holdUntilCleared(
        streamOf(['Sounds fun!', ' Tell me more'], 5) as never,
        Promise.resolve({ action: 'replace', script: 'Please call 911.' }),
        async (decision) => (decision.action === 'replace' ? textReply(decision.script) : null)
      )
    );
    expect(out).toEqual(['Please call 911.']);
  });

  it('treats a rejected escalation as no escalation', async () => {
    const out = await collect(
      holdUntilCleared(streamOf(['ok']) as never, Promise.reject(new Error('x')), async () => null)
    );
    expect(out).toEqual(['ok']);
  });
});

describe('gatedReply', () => {
  const session = { userData: undefined };
  /** Marks every chunk it passes, so tests can see what went through it. */
  const opener = {
    wrap: (stream: ReadableStream<unknown>) =>
      stream.pipeThrough(
        new TransformStream<unknown, unknown>({
          transform: (chunk, controller) => controller.enqueue(`~${String(chunk)}`),
        })
      ),
  };
  const modelSaying = (...replies: string[]) => {
    const model = vi.fn(async (_ctx: llm.ChatContext) => streamOf([replies.shift() ?? '']));
    return model;
  };
  const reply = async (
    text: string,
    model: ReturnType<typeof modelSaying>,
    options: Parameters<typeof gatedReply>[4]
  ) =>
    collect(
      (await gatedReply(
        request(['user', text]),
        session,
        model as never,
        opener as never,
        options
      )) as never
    );

  it('speaks the script without asking the model when the patterns replace', async () => {
    const model = modelSaying('Sounds fun!');
    const out = await reply('I want to kill myself tonight', model, { env: PATTERNS_ONLY });
    expect(model).not.toHaveBeenCalled();
    expect(out.join('')).toContain('988');
    expect(out.join('')).not.toMatch(/^~/);
  });

  it('adds crisis guidance to the request when the patterns guide', async () => {
    const ordinary = modelSaying('ok');
    const guided = modelSaying('ok');
    await reply('what should I cook tonight?', ordinary, { env: PATTERNS_ONLY });
    await reply("I hope I don't wake up tomorrow", guided, { env: PATTERNS_ONLY });
    const said = (model: ReturnType<typeof modelSaying>) =>
      (model.mock.calls[0]![0].items.at(-1) as llm.ChatMessage).textContent ?? '';
    const guidance = buildCrisisGuidance(detectCrisis("I hope I don't wake up tomorrow"));
    expect(said(guided)).toContain(guidance);
    expect(said(ordinary)).not.toContain(guidance);
  });

  it("asks the model without an earlier turn's spoken lead-in", async () => {
    // Live 2026-10-09: with "Hang on, checking." from the weather turn in the
    // request, Gemini claimed "I've got that timer set" without calling the
    // tool on 34 of 40 replays of one request; without it, 0 of 40.
    const model = modelSaying('ok');
    const ctx = request(
      ['user', "What's the weather tomorrow?"],
      ['assistant', 'Hang on, checking. '],
      ['assistant', 'Sunny and 94.'],
      ['user', 'Set a timer for ten minutes.']
    );
    await gatedReply(ctx, session, model as never, opener as never, { env: PATTERNS_ONLY });
    const sent = model.mock.calls[0]![0].items.map(
      (item) => (item as llm.ChatMessage).textContent ?? ''
    );
    expect(sent.some((text) => text.includes('Hang on, checking.'))).toBe(false);
    expect(sent).toContain('Sunny and 94.');
  });

  it('passes the model reply through the opener gate unless it is off', async () => {
    expect(
      await reply('what should I cook tonight?', modelSaying('ok'), { env: PATTERNS_ONLY })
    ).toEqual(['~ok']);
    const off = { ...PATTERNS_ONLY, OPENER_GATE: 'off' };
    expect(await reply('what should I cook tonight?', modelSaying('ok'), { env: off })).toEqual([
      'ok',
    ]);
  });

  it('drops the held reply for the 911-first script when the classifier escalates', async () => {
    const model = modelSaying('Sounds peaceful!');
    const out = await reply(
      'im parked on the bridge, engine off, just sitting here deciding',
      model,
      {
        env: LIVE,
        generate: verdict('{"risk":"imminent","subject":"self"}'),
      }
    );
    expect(model).toHaveBeenCalledTimes(1);
    expect(out.join('')).toContain('911');
    expect(out.join('')).not.toContain('Sounds peaceful');
  });

  it('regenerates with guidance when the classifier finds a crisis the patterns missed', async () => {
    const model = modelSaying('first', 'second');
    const out = await reply('long day at work', model, {
      env: LIVE,
      generate: verdict('{"risk":"crisis","subject":"self"}'),
    });
    expect(model).toHaveBeenCalledTimes(2);
    expect(out).toEqual(['~second']);
  });

  it('drops the reply opener when a turn-opening clip played while it was coming', async () => {
    // A slow reply: the clip fires 0 ms after the commit, before its first words.
    const session = Object.assign(new EventEmitter(), { userData: undefined });
    attachTurnOpeningSound(
      session,
      { playClip: () => true, lastPlayedAt: () => 0 },
      () => 'Work was rough, I am exhausted.',
      () => false,
      { waitMs: 0, replyTextSince: () => false, clipMs: () => 400, holdReply: () => undefined }
    );
    const gate = new OpenerGate(3);
    const model = vi.fn(async () => streamOf(['Mm, that sounds like a long one.'], 30));
    const pending = gatedReply(
      request(['user', 'Work was rough, I am exhausted.']),
      session,
      model as never,
      gate,
      {
        env: PATTERNS_ONLY,
      }
    );
    session.emit('agent_state_changed', { newState: 'thinking' });
    const out = await collect((await pending) as never);
    expect(out.join('')).toBe('That sounds like a long one.');
  });

  it('keeps the reply opener when no clip played', async () => {
    const session = { userData: undefined };
    const gate = new OpenerGate(3);
    const model = vi.fn(async () => streamOf(['Mm, that sounds like a long one.'], 30));
    const out = await collect(
      (await gatedReply(request(['user', 'Work was rough.']), session, model as never, gate, {
        env: PATTERNS_ONLY,
      })) as never
    );
    expect(out.join('')).toBe('Mm, that sounds like a long one.');
  });
});
