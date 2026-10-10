import { describe, expect, it } from 'vitest';
import { ReadableStream } from 'node:stream/web';
import { OpenerGate, capitalizeStart, stripStockOpener } from '../opener-gate.js';

describe('stripStockOpener', () => {
  it('drops the reaction words seen on live calls', () => {
    expect(stripStockOpener('Ha! Oh, of course he did.').text).toBe('Of course he did.');
    expect(stripStockOpener('Oh, I hear you, Sam.').text).toBe('I hear you, Sam.');
    expect(stripStockOpener('Ugh, Friday? That is stressful.').text).toBe('Friday? That is stressful.');
  });

  it('keeps a leading emotion tag', () => {
    expect(stripStockOpener('<emotion value="sympathetic"/>Oh, I hear you.').text).toBe(
      '<emotion value="sympathetic"/>I hear you.'
    );
  });

  it('leaves replies that do not start with a reaction word, or are only one', () => {
    expect(stripStockOpener("It's completely overwhelming.")).toEqual({
      text: "It's completely overwhelming.",
      stripped: false,
    });
    expect(stripStockOpener('Oh?').stripped).toBe(false);
    expect(stripStockOpener('Ohio was fun.').stripped).toBe(false);
    expect(stripStockOpener('Well done, that took guts.').stripped).toBe(false);
  });
});

describe('capitalizeStart', () => {
  it('capitalises the first spoken letter, past markup and cues', () => {
    expect(capitalizeStart("it's, um, always that scramble.")).toBe("It's, um, always that scramble.");
    expect(capitalizeStart('[laughter] classic Biscuit.')).toBe('[laughter] Classic Biscuit.');
    expect(capitalizeStart('<emotion value="happy"/>little architect at work, huh?')).toBe(
      '<emotion value="happy"/>Little architect at work, huh?'
    );
  });

  it('leaves replies that already start well alone', () => {
    expect(capitalizeStart('Of course he did.')).toBe('Of course he did.');
    expect(capitalizeStart('"Wait," she said.')).toBe('"Wait," she said.');
    expect(capitalizeStart('')).toBe('');
  });
});

describe('OpenerGate', () => {
  it('capitalises a lowercase reply that has no reaction word', () => {
    expect(new OpenerGate(3).decide('classic Biscuit.')).toBe('Classic Biscuit.');
  });

  it('keeps a reaction word at most once every three replies', () => {
    const gate = new OpenerGate(3);
    const out = ['Oh, a.', 'Oh, b.', 'Oh, c.', 'Oh, d.', 'Oh, e.'].map((t) => gate.decide(t));
    expect(out).toEqual(['Oh, a.', 'B.', 'C.', 'D.', 'Oh, e.']);
  });

  it('works on a streamed reply split mid-word and passes tool calls through', async () => {
    const gate = new OpenerGate(3);
    gate.decide('Oh, first reply keeps it.');
    const chunks = [
      { id: '1', delta: { role: 'assistant', content: 'O' } },
      { id: '1', delta: { role: 'assistant', content: 'h, I hear you, Sam. It sounds' } },
      { id: '1', delta: { role: 'assistant', content: ' like a long day.' } },
      { id: '1', delta: { role: 'assistant', toolCalls: [{ name: 'x' }] } },
    ];
    const input = new ReadableStream({
      start(c) {
        for (const x of chunks) c.enqueue(x);
        c.close();
      },
    });
    const out: Array<{ delta?: { content?: string; toolCalls?: unknown[] } }> = [];
    for await (const c of gate.wrap(input as never) as unknown as AsyncIterable<(typeof out)[0]>) {
      out.push(c);
    }
    const text = out.map((c) => c.delta?.content ?? '').join('');
    expect(text).toBe('I hear you, Sam. It sounds like a long day.');
    expect(out[out.length - 1].delta?.toolCalls).toHaveLength(1);
  });
});
