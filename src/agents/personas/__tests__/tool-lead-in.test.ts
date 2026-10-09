import { describe, expect, it } from 'vitest';
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { LEAD_INS, withoutPastLeadIns, withToolLeadIn } from '../tool-lead-in.js';

const userTurn = { items: [{ type: 'message', role: 'user' }] };
const afterTool = {
  items: [
    { type: 'message', role: 'user' },
    { type: 'function_call', name: 'getWeather' },
    { type: 'function_call_output', name: 'getWeather' },
  ],
};
const call = (name: string) => ({ id: '1', delta: { role: 'assistant', toolCalls: [{ name }] } });
const text = (content: string) => ({ id: '1', delta: { role: 'assistant', content } });

async function run(chunks: object[], request: object, session: object = {}, env = {}) {
  const input = new ReadableStream<object>({
    start(c) {
      for (const chunk of chunks) c.enqueue(chunk);
      c.close();
    },
  });
  const out: object[] = [];
  const stream = withToolLeadIn(input as never, request as never, session, env);
  for await (const chunk of stream as unknown as AsyncIterable<object>) out.push(chunk);
  return out;
}

const spoken = (out: object[]) =>
  out.map((c) => (c as { delta?: { content?: string } }).delta?.content ?? '').join('');

describe('withToolLeadIn', () => {
  it('speaks a short line before a look-up the model called without a word', async () => {
    const out = await run([call('getWeatherForecast')], userTurn);
    expect(out).toHaveLength(2);
    expect(LEAD_INS as readonly string[]).toContain(spoken(out).trim());
    expect(out[1]).toEqual(call('getWeatherForecast'));
  });

  it('adds nothing when the model already said something', async () => {
    const out = await run([text('Ooh, let me look.'), call('getWeather')], userTurn);
    expect(spoken(out)).toBe('Ooh, let me look.');
  });

  it('adds nothing before instant tools (music, handoffs, memory)', async () => {
    const names = ['playMusic', 'handoffToMaya', 'rememberAboutMe'];
    const outs = await Promise.all(names.map((name) => run([call(name)], userTurn)));
    expect(outs).toEqual(names.map((name) => [call(name)]));
  });

  it('adds nothing to the answer that follows a tool result', async () => {
    expect(await run([call('getNews')], afterTool)).toEqual([call('getNews')]);
  });

  it('ignores empty text chunks ahead of the call', async () => {
    const out = await run([text(''), call('searchWeb')], userTurn);
    expect(spoken(out).trim().length).toBeGreaterThan(0);
  });

  it('varies the line across one call', async () => {
    const session = {};
    const lines = new Set<string>();
    for (const _ of LEAD_INS)
      // eslint-disable-next-line no-await-in-loop -- the rotation is sequential by design
      lines.add(spoken(await run([call('getWeather')], userTurn, session)).trim());
    expect(lines.size).toBe(LEAD_INS.length);
  });

  it('never opens with a reaction word the opener gate would double', () => {
    for (const line of LEAD_INS) expect(line).not.toMatch(/^(oh|ooh|ha|ugh|yeah|hmm|ah|wow)\b/i);
  });

  it('TOOL_LEAD_IN=off passes the reply through', async () => {
    const out = await run([call('getWeather')], userTurn, {}, { TOOL_LEAD_IN: 'off' });
    expect(out).toEqual([call('getWeather')]);
  });
});

describe('withoutPastLeadIns', () => {
  /** A weather turn the lead-in spoke for, as it lands in the session's history. */
  function weatherTurn(ctx: llm.ChatContext, leadIn = 'Hang on, checking. '): void {
    ctx.addMessage({ role: 'user', content: "What's the weather tomorrow?" });
    ctx.addMessage({ role: 'assistant', content: leadIn });
    ctx.items = [
      ...ctx.items,
      llm.FunctionCall.create({ callId: 'c1', name: 'getWeatherForecast', args: '{}' }),
      llm.FunctionCallOutput.create({
        callId: 'c1',
        name: 'getWeatherForecast',
        output: 'sunny, 94F',
        isError: false,
      }),
    ];
  }
  const said = (ctx: llm.ChatContext) =>
    ctx.items.map((item) =>
      item.type === 'message' ? `${item.role}: ${item.textContent ?? ''}` : item.type
    );

  it("leaves an earlier turn's lead-in out of the next turn's request", () => {
    const ctx = llm.ChatContext.empty();
    weatherTurn(ctx);
    ctx.addMessage({ role: 'assistant', content: 'Sunny and 94, so go early.' });
    ctx.addMessage({ role: 'user', content: 'Can you set a timer for ten minutes?' });
    expect(said(withoutPastLeadIns(ctx))).toEqual([
      "user: What's the weather tomorrow?",
      'function_call',
      'function_call_output',
      'assistant: Sunny and 94, so go early.',
      'user: Can you set a timer for ten minutes?',
    ]);
  });

  it("keeps this turn's lead-in for the answer after the tool result", () => {
    const ctx = llm.ChatContext.empty();
    weatherTurn(ctx);
    expect(withoutPastLeadIns(ctx)).toBe(ctx);
  });

  it('keeps the rest of a message that opens with a lead-in', () => {
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'user', content: 'Any news?' });
    ctx.addMessage({ role: 'assistant', content: 'Let me look. Quiet day, mostly weather.' });
    ctx.addMessage({ role: 'user', content: 'Set a timer.' });
    expect(said(withoutPastLeadIns(ctx))).toEqual([
      'user: Any news?',
      'assistant: Quiet day, mostly weather.',
      'user: Set a timer.',
    ]);
  });

  it("changes only the request, never the session's history", () => {
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'user', content: 'Any news?' });
    ctx.addMessage({ role: 'assistant', content: 'Let me look. Quiet day.' });
    ctx.addMessage({ role: 'user', content: 'Set a timer.' });
    const before = said(ctx);
    withoutPastLeadIns(ctx);
    expect(said(ctx)).toEqual(before);
  });

  it("leaves Ferni's own words alone when no lead-in opens them", () => {
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'user', content: 'Any news?' });
    ctx.addMessage({ role: 'assistant', content: "Let me look at that later, it's a lot." });
    ctx.addMessage({ role: 'user', content: 'Set a timer.' });
    expect(withoutPastLeadIns(ctx)).toBe(ctx);
  });
});
