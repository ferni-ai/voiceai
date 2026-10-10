import { describe, expect, it, vi } from 'vitest';
import { ReadableStream, type ReadableStreamDefaultController } from 'node:stream/web';
import { OpenerGate, capitalizeStart, openingDecidable, stripStockOpener } from '../opener-gate.js';

describe('stripStockOpener', () => {
  it('drops the reaction words seen on live calls', () => {
    expect(stripStockOpener('Ha! Oh, of course he did.').text).toBe('Of course he did.');
    expect(stripStockOpener('Oh, I hear you, Sam.').text).toBe('I hear you, Sam.');
    expect(stripStockOpener('Ugh, Friday? That is stressful.').text).toBe(
      'Friday? That is stressful.'
    );
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
    expect(capitalizeStart("it's, um, always that scramble.")).toBe(
      "It's, um, always that scramble."
    );
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

describe('openingDecidable', () => {
  it('decides once the first whole word is not a reaction word', () => {
    expect(openingDecidable('It')).toBe(false);
    expect(openingDecidable("It's ")).toBe(true);
    expect(openingDecidable('3 miles')).toBe(true);
    expect(openingDecidable('Ohio ')).toBe(true);
  });

  it('waits past reaction words for the first real word', () => {
    expect(openingDecidable('Oh')).toBe(false);
    expect(openingDecidable('Oh, ')).toBe(false);
    expect(openingDecidable('Ha! Oh, ')).toBe(false);
    expect(openingDecidable('Ha! Oh, of')).toBe(false);
    expect(openingDecidable('Ha! Oh, of ')).toBe(true);
  });

  it('waits for markup to finish streaming in', () => {
    expect(openingDecidable('<emotion value="sym')).toBe(false);
    expect(openingDecidable('<emotion value="sympathetic"/>That ')).toBe(true);
  });
});

describe('OpenerGate early decision (OPENER_GATE_EARLY)', () => {
  /** Stream `pieces` one at a time; report the output and how many pieces went in before the first came out. */
  async function through(gate: OpenerGate, pieces: string[]) {
    let push!: ReadableStreamDefaultController<string>;
    const input = new ReadableStream<string>({ start: (c) => void (push = c) });
    const out: string[] = [];
    const reading = (async () => {
      for await (const chunk of gate.wrap(input) as unknown as AsyncIterable<string>)
        out.push(chunk);
    })();
    const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
    let firstAfter: number | null = null;
    for (let i = 0; i < pieces.length; i++) {
      push.enqueue(pieces[i]!);
      await tick();
      if (firstAfter === null && out.length > 0) firstAfter = i + 1;
    }
    push.close();
    await reading;
    return { text: out.join(''), firstAfter: firstAfter ?? pieces.length + 1 };
  }

  // How Gemini streams: a 2-6 character first chunk, then a few words at a time.
  const replies = [
    ["It's", ' been', ' a long', ' one, huh?'],
    ['Oh', ', that sounds', ' rough. What happened?'],
    ['Oh', ', ', 'that', ' sounds', ' rough.'],
    ['Ha', '! Oh, of course', ' he did.'],
    ['Yeah', ', Fridays are', ' brutal.'],
    ['Three', ' miles is no joke!'],
    ['Oh?'],
  ];

  it('gives the same words as the 24-character wait, sooner', async () => {
    // Each gate has spent its opener, so reaction words are trimmed.
    const spent = async (early: boolean) => {
      const gate = new OpenerGate(3, early);
      await through(gate, ['Yeah', ', sure.']);
      return gate;
    };
    for (const reply of replies) {
      const late = await through(await spent(false), reply);
      const early = await through(await spent(true), reply);
      expect(early.text).toBe(late.text);
      expect(early.firstAfter!).toBeLessThanOrEqual(late.firstAfter!);
    }
  });

  it('lets a plain first word through on the first chunk', async () => {
    const late = await through(new OpenerGate(3, false), replies[0]!);
    const early = await through(new OpenerGate(3, true), replies[0]!);
    // 24 characters need all four chunks; "It's" is known whole at the second
    expect(early.firstAfter!).toBeLessThan(late.firstAfter!);
  });

  it('still trims a reaction opener the gate would trim', async () => {
    const gate = new OpenerGate(3, true);
    await through(gate, ['Yeah', ', sure.']); // the first reply keeps its opener
    expect((await through(gate, ['Oh', ', that sounds', ' rough.'])).text).toBe(
      'That sounds rough.'
    );
  });

  it('is off unless OPENER_GATE_EARLY=on', async () => {
    vi.stubEnv('OPENER_GATE_EARLY', '');
    const off = (await through(new OpenerGate(), replies[0]!)).firstAfter!;
    vi.stubEnv('OPENER_GATE_EARLY', 'on');
    const on = (await through(new OpenerGate(), replies[0]!)).firstAfter!;
    vi.unstubAllEnvs();
    expect(on).toBeLessThan(off);
  });
});
