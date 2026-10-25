/**
 * LOOKUP_BRIDGE (lookup-bridge.ts): no dead air between "Let me look." and the
 * answer. Live (prod, 2026-10-21) that silence ran 1.3-2.5 s and two answers
 * were lost to a caller who spoke first.
 */
import { describe, expect, it } from 'vitest';
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { noteCrisisRisk } from '../../../services/safety/crisis-call-risk.js';
import { gatedReply } from '../crisis-gate.js';
import { afterToolHedgeMs, BRIDGES, bridgeAfterMs, withLookupBridge } from '../lookup-bridge.js';
import { LEAD_INS, withoutPastLeadIns, withToolLeadIn } from '../tool-lead-in.js';

const ON = { LOOKUP_BRIDGE: 'on', LOOKUP_BRIDGE_MS: '40' };
const OFF = { LOOKUP_BRIDGE: 'off', LOOKUP_BRIDGE_MS: '40' };

/** The reply after a sports result: caller, lead-in, the call and its output. */
function afterLookup(asked = 'Who won the Dodgers game last night?'): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  ctx.addMessage({ role: 'user', content: asked });
  ctx.addMessage({ role: 'assistant', content: 'Let me pull that up.' });
  ctx.insert([
    llm.FunctionCall.create({ callId: 'c1', name: 'getSports', args: '{"team":"Dodgers"}' }),
    llm.FunctionCallOutput.create({
      callId: 'c1',
      name: 'getSports',
      output: 'Dodgers 5, Brewers 3 (final).',
      isError: false,
    }),
  ]);
  return ctx;
}

function callerAsks(): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'user', content: 'How was your weekend?' });
  return ctx;
}

const sleep = (ms: number) =>
  new Promise((r) => {
    setTimeout(r, ms);
  });

/** A model stream: each chunk after its delay. */
function slow(chunks: Array<[number, object | string]>): ReadableStream<object | string> {
  return new ReadableStream({
    async start(c) {
      for (const [ms, chunk] of chunks) {
        await sleep(ms);
        c.enqueue(chunk);
      }
      c.close();
    },
  });
}

const text = (content: string) => ({ id: 'r', delta: { role: 'assistant', content } });
const call = (name: string) => ({ id: 'r', delta: { role: 'assistant', toolCalls: [{ name }] } });

async function words(stream: ReadableStream<object | string>): Promise<string> {
  let out = '';
  for await (const chunk of stream as unknown as AsyncIterable<object | string>) {
    out +=
      typeof chunk === 'string'
        ? chunk
        : ((chunk as { delta?: { content?: string } }).delta?.content ?? '');
  }
  return out;
}

const startsWithBridge = (said: string) => BRIDGES.some((b) => said.startsWith(`${b} `));

describe('withLookupBridge', () => {
  it('puts a bridge ahead of an answer that is slow after a tool result, only when on', async () => {
    const answer = () => slow([[150, text('Dodgers won, five to three.')]]);
    const off = await words(withLookupBridge(answer(), afterLookup(), {}, OFF));
    expect(off).toBe('Dodgers won, five to three.');
    const on = await words(withLookupBridge(answer(), afterLookup(), {}, ON));
    expect(startsWithBridge(on)).toBe(true);
    expect(on).toMatch(/ Dodgers won, five to three\.$/);
  });

  it('adds nothing when the answer starts in time', async () => {
    const on = await words(
      withLookupBridge(slow([[5, text('Dodgers won.')]]), afterLookup(), {}, ON)
    );
    expect(on).toBe('Dodgers won.');
  });

  it('does not count an empty delta as the answer starting', async () => {
    const on = await words(
      withLookupBridge(
        slow([
          [5, text('')],
          [150, text('Dodgers won.')],
        ]),
        afterLookup(),
        {},
        ON
      )
    );
    expect(startsWithBridge(on)).toBe(true);
  });

  it('leaves a reply to the caller alone, however slow', async () => {
    const on = await words(
      withLookupBridge(slow([[150, text('Pretty quiet one.')]]), callerAsks(), {}, ON)
    );
    expect(on).toBe('Pretty quiet one.');
  });

  it('adds nothing before a second tool call made in time', async () => {
    const on = await words(
      withLookupBridge(slow([[5, call('getDirections')]]), afterLookup(), {}, ON)
    );
    expect(on).toBe('');
  });

  it('rotates the bridge lines within a call', async () => {
    const session = {};
    const said = new Set<string>();
    for (const _ of BRIDGES) {
      const out = await words(
        withLookupBridge(slow([[120, text('x')]]), afterLookup(), session, ON)
      );
      said.add(out.replace(/ x$/, ''));
    }
    expect(said.size).toBe(BRIDGES.length);
  });

  it('reads its delays from env, with defaults', () => {
    expect(afterToolHedgeMs({})).toBeUndefined();
    expect(afterToolHedgeMs({ LOOKUP_BRIDGE: 'on' })).toBe(500);
    expect(afterToolHedgeMs({ LOOKUP_BRIDGE: 'on', LOOKUP_BRIDGE_HEDGE_MS: '300' })).toBe(300);
    expect(bridgeAfterMs({})).toBe(1000);
    expect(bridgeAfterMs({ LOOKUP_BRIDGE_MS: 'soon' })).toBe(1000);
    expect(bridgeAfterMs({ LOOKUP_BRIDGE_MS: '700' })).toBe(700);
  });
});

describe('on the live reply path (gatedReply)', () => {
  const opener = { wrap: (s: ReadableStream<unknown>) => s };
  const env = { ...ON, CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };

  it('the answer after a slow look-up starts with a bridge when on, and not when off', async () => {
    const model = async () => slow([[150, 'Dodgers won, five to three.']]) as never;
    const session = { userData: undefined };
    const run = async (e: Record<string, string>) =>
      words(
        (await gatedReply(afterLookup(), session, model, opener as never, {
          env: e,
        })) as never
      );
    expect(startsWithBridge(await run({ ...env, LOOKUP_BRIDGE: 'off' }))).toBe(false);
    expect(startsWithBridge(await run(env))).toBe(true);
  });

  it('never bridges on a call with crisis risk noted', async () => {
    const model = async () => slow([[150, 'It is sunny.']]) as never;
    const session = { userData: { services: { sessionId: 'call-risky' } } };
    const answer = async () =>
      words((await gatedReply(afterLookup(), session, model, opener as never, { env })) as never);
    expect(startsWithBridge(await answer())).toBe(true);
    noteCrisisRisk('call-risky');
    const out = await answer();
    expect(startsWithBridge(out)).toBe(false);
    expect(out).toBe('It is sunny.');
  });
});

describe('withoutPastLeadIns with LOOKUP_BRIDGE', () => {
  it("drops an earlier answer's bridge from the request, only when on", () => {
    const ctx = afterLookup();
    ctx.addMessage({ role: 'assistant', content: 'Okay, got it. Dodgers won, five to three.' });
    ctx.addMessage({ role: 'user', content: 'Nice. Set a timer for ten minutes.' });
    const said = (c: llm.ChatContext) =>
      c.items.flatMap((i) =>
        i.type === 'message' && i.role === 'assistant' ? [i.textContent] : []
      );
    expect(said(withoutPastLeadIns(ctx, OFF))).toContain(
      'Okay, got it. Dodgers won, five to three.'
    );
    expect(said(withoutPastLeadIns(ctx, ON))).toContain('Dodgers won, five to three.');
    expect(said(withoutPastLeadIns(ctx, ON))).not.toContain(
      'Okay, got it. Dodgers won, five to three.'
    );
  });
});

describe('findBusiness gets a lead-in under LOOKUP_BRIDGE', () => {
  it('speaks a lead-in before findBusiness only when on', async () => {
    const ask = () => slow([[1, call('findBusiness')]]);
    const off = await words(withToolLeadIn(ask(), callerAsks(), {}, OFF));
    expect(off).toBe('');
    const on = await words(withToolLeadIn(ask(), callerAsks(), {}, ON));
    expect(LEAD_INS as readonly string[]).toContain(on.trim());
  });
});
