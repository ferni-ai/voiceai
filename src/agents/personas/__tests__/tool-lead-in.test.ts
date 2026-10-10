import { describe, expect, it } from 'vitest';
import { ReadableStream } from 'node:stream/web';
import { ACKS, LEAD_INS, withToolLeadIn } from '../tool-lead-in.js';

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

  it('says a short ack before an action the caller asked for (live: 3-6 s of silence)', async () => {
    const asked = (words: string) => ({
      items: [
        { type: 'message', role: 'user', textContent: `${words}\n\n(reminder: keep it short)` },
      ],
    });
    for (const [words, tool] of [
      ['Can you set a timer for ten minutes?', 'quickTimer'],
      ['Remind me to call my mom tomorrow at noon.', 'setReminder'],
      ['Honestly, throw on some jazz while I cook.', 'playMusic'],
    ] as const) {
      const out = await run([call(tool)], asked(words));
      expect(ACKS as readonly string[], words).toContain(spoken(out).trim());
      expect(out.at(-1)).toEqual(call(tool));
    }
    // A tool the model reaches for on its own, mid-chat, gets nothing.
    expect(await run([call('rememberAboutUser')], asked('my sister just moved to Denver'))).toEqual(
      [call('rememberAboutUser')]
    );
    // And TOOL_ACK=off turns it off.
    expect(
      await run([call('quickTimer')], asked('set a timer for ten minutes'), {}, { TOOL_ACK: 'off' })
    ).toEqual([call('quickTimer')]);
  });

  it('adds nothing before instant tools when the caller asked for nothing', async () => {
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
