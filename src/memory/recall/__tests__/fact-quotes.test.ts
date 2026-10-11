import { describe, expect, it } from 'vitest';
import {
  FACT_QUOTE_TOKENS_PER_TURN,
  callDate,
  createFactQuotes,
  factQuotesEnabled,
  formatFactQuotes,
  quoteFor,
} from '../fact-quotes.js';
import type { RecallFact } from '../session-recall.js';
import type { EpisodeCall } from '../episodes.js';

const fact = (entity: string, key: string, value: string, extractedAt?: string): RecallFact => ({
  entity,
  key,
  value,
  confidence: 0.9,
  ...(extractedAt && { extractedAt }),
});

// The shapes real speech takes: a fact over two lines, a number read out, filler.
const calls: EpisodeCall[] = [
  {
    id: 'c2',
    at: '2026-01-09T18:00:00.000Z',
    lines: [
      'so um the vet said Biscuit has to have the knee surgery',
      'yeah it is on Thursday',
      'anyway how are you',
    ],
  },
  {
    id: 'c1',
    at: '2026-01-05T18:00:00.000Z',
    lines: [
      'Hey, could you call my brother?',
      'His name is Pete.',
      "Uh, yes. It's uh 435 339 7687.",
      'I adopted a golden retriever named Biscuit last month',
    ],
  },
];

describe('quoteFor', () => {
  it("finds the caller's line that says the fact, with that call's date", () => {
    const q = quoteFor(fact('Biscuit', 'breed', 'golden retriever'), calls);
    expect(q).toEqual({
      text: 'I adopted a golden retriever named Biscuit last month',
      at: '2026-01-05T18:00:00.000Z',
    });
  });

  it('matches a number however it was written', () => {
    const q = quoteFor(fact("User's brother", 'phone number', '435-339-7687'), calls);
    expect(q?.text).toContain('435 339 7687');
  });

  it('joins two adjacent lines when the fact is spread over them', () => {
    const q = quoteFor(fact('Biscuit', 'knee surgery', 'Thursday'), calls);
    expect(q?.text).toBe(
      'so um the vet said Biscuit has to have the knee surgery yeah it is on Thursday'
    );
  });

  it('prefers the call the fact was extracted on', () => {
    const twice: EpisodeCall[] = [
      {
        id: 'a',
        at: '2026-01-09T18:00:00.000Z',
        lines: ['Biscuit the golden retriever is sleeping'],
      },
      {
        id: 'b',
        at: '2026-01-05T18:00:00.000Z',
        lines: ['Biscuit the golden retriever is sleeping'],
      },
    ];
    const q = quoteFor(fact('Biscuit', 'breed', 'golden retriever', '2026-01-05T18:02:00Z'), twice);
    expect(q?.at).toBe('2026-01-05T18:00:00.000Z');
  });

  it('gives no quote when no line clearly says it', () => {
    // One shared word ("brother") is not a source.
    expect(quoteFor(fact("User's brother", 'job', 'works as an electrician'), calls)).toBeNull();
    expect(quoteFor(fact('Speaker', 'hometown', 'Boise, Idaho'), calls)).toBeNull();
    expect(quoteFor(fact('Biscuit', 'breed', 'golden retriever'), [])).toBeNull();
  });

  it('trims a long line to the words around the fact', () => {
    const long: EpisodeCall[] = [
      {
        id: 'l',
        at: '2026-01-05T18:00:00.000Z',
        lines: [
          `${'and then we went to the store and '.repeat(4)}my sister Joan moved to Denver for her new nursing job ${'which is great and all but '.repeat(4)}`,
        ],
      },
    ];
    const q = quoteFor(fact('Joan', 'moved to', 'Denver for a nursing job'), long)!;
    expect(q.text.replace(/^\.\.\. | \.\.\.$/g, '').split(/\s+/).length).toBeLessThanOrEqual(22);
    expect(q.text).toContain('Joan moved to Denver');
    expect(q.text.startsWith('... ')).toBe(true);
  });
});

describe('formatFactQuotes', () => {
  it('names the call by its date and quotes the words', () => {
    const note = formatFactQuotes(
      [
        {
          fact: fact('Biscuit', 'breed', 'golden retriever'),
          quote: { text: 'I adopted a golden retriever', at: '2026-01-05T18:00:00.000Z' },
        },
      ],
      'Maya'
    )!;
    expect(note).toContain("in Maya's own words");
    expect(note).toContain('- breed: on Jan 5, "I adopted a golden retriever"');
    expect(formatFactQuotes([])).toBeNull();
    expect(callDate('not a date')).toBe('an earlier call');
  });
});

describe('createFactQuotes', () => {
  const biscuit = fact('Biscuit', 'breed', 'golden retriever');
  const pete = fact("User's brother", 'phone number', '435-339-7687');

  it('quotes each fact once a call', async () => {
    const q = createFactQuotes({
      userId: 'u1',
      calls: Promise.resolve(calls),
      forgotten: async () => [],
    });
    await q.ready;
    expect(q.take([biscuit])).toContain('golden retriever named Biscuit');
    q.newTurn();
    expect(q.take([biscuit])).toBeNull();
    expect(q.take([pete])).toContain('435 339 7687');
  });

  it('keeps to the turn budget', async () => {
    const many: EpisodeCall[] = [
      {
        id: 'm',
        at: '2026-01-05T18:00:00.000Z',
        lines: Array.from(
          { length: 6 },
          (_, i) => `my cousin number ${i} lives up in Spokane Washington these days with the twins`
        ),
      },
    ];
    const facts = Array.from({ length: 6 }, (_, i) =>
      fact(`cousin ${i}`, 'lives in', 'Spokane Washington')
    );
    const q = createFactQuotes({
      userId: 'u2',
      calls: Promise.resolve(many),
      forgotten: async () => [],
    });
    await q.ready;
    const note = q.take(facts)!;
    const quoted = note.split('\n').filter((l) => l.startsWith('- '));
    expect(quoted.length).toBeGreaterThan(0);
    expect(quoted.length).toBeLessThan(6);
    expect(FACT_QUOTE_TOKENS_PER_TURN).toBeLessThan(100);
  });

  it('never quotes words about a forgotten topic', async () => {
    const q = createFactQuotes({
      userId: 'u3',
      calls: Promise.resolve(calls),
      forgotten: async () => ["my brother's number"],
    });
    await q.ready;
    expect(q.take([pete])).toBeNull();
    expect(q.take([biscuit])).toContain('golden retriever');
  });

  it('quotes nothing when forgotten topics cannot be read', async () => {
    const q = createFactQuotes({
      userId: 'u4',
      calls: Promise.resolve(calls),
      forgotten: async () => null,
    });
    await q.ready;
    expect(q.take([biscuit])).toBeNull();
  });

  it('quotes nothing when the calls cannot be read', async () => {
    const q = createFactQuotes({
      userId: 'u5',
      calls: Promise.reject(new Error('down')),
      forgotten: async () => [],
    });
    await q.ready;
    expect(q.take([biscuit])).toBeNull();
  });

  it('is off unless RECALL_FACT_QUOTES=on', () => {
    expect(factQuotesEnabled({})).toBe(false);
    expect(factQuotesEnabled({ RECALL_FACT_QUOTES: 'off' })).toBe(false);
    expect(factQuotesEnabled({ RECALL_FACT_QUOTES: 'on' })).toBe(true);
  });
});
