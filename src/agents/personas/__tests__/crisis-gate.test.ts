import { beforeEach, describe, expect, it, vi } from 'vitest';
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';

import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { TURN_CONTEXT_HEADER } from '../../multi-agent/turn-intelligence.js';
import {
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
