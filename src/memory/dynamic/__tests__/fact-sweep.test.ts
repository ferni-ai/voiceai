import { describe, expect, it } from 'vitest';
import {
  factSweepEnabled,
  parseSweep,
  sweepCall,
  sweepPrompt,
  sweepWindows,
  type StoredFactRow,
  type SweepStore,
} from '../fact-sweep.js';
import { factDocId } from '../extraction-firestore-docs.js';

// The shape real speech takes: one fact over three lines, the line-by-line
// extractor stored "him | phone number", and no question about Pete found it.
const call = [
  'Hey, could you call my brother?',
  'His name is Pete.',
  "Uh, yes. It's uh 435 339 7687.",
];

function memoryStore(rows: StoredFactRow[] = []) {
  const added: Array<{ id: string; data: Record<string, unknown> }> = [];
  const store: SweepStore = {
    facts: async () => rows,
    add: async (_u, docs) => {
      added.push(...docs);
      return docs.length;
    },
  };
  return { store, added };
}

const pete = JSON.stringify([
  {
    entityName: 'Pete',
    factType: 'relationship',
    key: 'relation to user',
    value: "User's brother",
    confidence: 0.9,
  },
  {
    entityName: 'Pete',
    factType: 'attribute',
    key: 'phone number',
    value: '435-339-7687',
    confidence: 0.9,
  },
]);

describe('sweepWindows', () => {
  it('reads a short call whole and a long one in overlapping windows', () => {
    expect(sweepWindows(call)).toEqual([{ start: 0, lines: call }]);
    const long = Array.from({ length: 30 }, (_, i) => `line number ${i}`);
    const windows = sweepWindows(long);
    expect(windows.map((w) => w.start)).toEqual([0, 11, 22]);
    expect(windows[0]!.lines.at(-1)).toBe('line number 13'); // overlaps the next window
    expect(windows.at(-1)!.lines.at(-1)).toBe('line number 29');
  });

  it('skips one-word lines and keeps only the last windows of a very long call', () => {
    expect(sweepWindows(['yeah', 'ok', '  '])).toEqual([]);
    const huge = Array.from({ length: 200 }, (_, i) => `line number ${i}`);
    const windows = sweepWindows(huge);
    expect(windows).toHaveLength(6);
    expect(windows.at(-1)!.lines.at(-1)).toBe('line number 199');
  });
});

describe('sweepPrompt and parseSweep', () => {
  it('shows the call, the moment and what is already known', () => {
    const prompt = sweepPrompt(
      { start: 0, lines: call },
      ['Biscuit | breed = golden retriever'],
      'This call took place on Monday.'
    );
    expect(prompt).toContain("- Uh, yes. It's uh 435 339 7687.");
    expect(prompt).toContain('- Biscuit | breed = golden retriever');
    expect(prompt).toContain('This call took place on Monday.');
    expect(prompt).toMatch(/never "he", "she", "him"/);
  });

  it('keeps valid facts and drops the rest', () => {
    const facts = parseSweep(`Here you go:\n${pete}`);
    expect(facts.map((f) => `${f.entityName} | ${f.key} = ${f.value}`)).toEqual([
      "Pete | relation to user = User's brother",
      'Pete | phone number = 435-339-7687',
    ]);
    expect(
      parseSweep(
        '[{"entityName":"Pete","factType":"nonsense","key":"age","value":40,"confidence":7}]'
      )[0]
    ).toMatchObject({
      factType: 'attribute',
      value: '40',
      confidence: 1,
    });
    expect(parseSweep('[{"key":"no entity","value":"x"}]')).toEqual([]);
    expect(parseSweep('not json [')).toEqual([]);
    expect(parseSweep(null)).toEqual([]);
  });
});

describe('sweepCall', () => {
  const at = {
    userId: 'u1',
    sessionId: 's1',
    startedAt: new Date('2026-01-05T18:00:00Z'),
    lines: call,
  };

  it('stores what was said across lines as one named fact', async () => {
    const { store, added } = memoryStore([
      { entityName: 'him', key: 'phone number', value: '435-339-7687' },
    ]);
    const prompts: string[] = [];
    const n = await sweepCall(at, { store, llm: async (p) => (prompts.push(p), pete) });
    expect(n).toBe(2);
    expect(added.map((d) => d.data.entityName)).toEqual(['Pete', 'Pete']);
    expect(added[1]).toMatchObject({
      id: factDocId('Pete', 'phone number', '435-339-7687'),
      data: { source: 'call_sweep', sessionId: 's1', value: '435-339-7687' },
    });
    expect(prompts[0]).toContain('- him | phone number = 435-339-7687'); // known facts shown
  });

  it('never adds a fact already stored', async () => {
    const { store, added } = memoryStore([
      { entityName: 'Pete', key: 'phone number', value: '435-339-7687' },
    ]);
    expect(await sweepCall(at, { store, llm: async () => pete })).toBe(1);
    expect(added.map((d) => d.data.key)).toEqual(['relation to user']);
  });

  it('makes no model call for a call with nothing said', async () => {
    const { store } = memoryStore();
    let calls = 0;
    const n = await sweepCall(
      { ...at, lines: ['ok'] },
      { store, llm: async () => (calls++, pete) }
    );
    expect([n, calls]).toEqual([0, 0]);
  });

  it('adds nothing when the model returns nothing usable', async () => {
    const { store, added } = memoryStore();
    expect(await sweepCall(at, { store, llm: async () => null })).toBe(0);
    expect(added).toEqual([]);
  });

  it('is off unless FACT_SWEEP=on', () => {
    expect(factSweepEnabled({})).toBe(false);
    expect(factSweepEnabled({ FACT_SWEEP: 'off' })).toBe(false);
    expect(factSweepEnabled({ FACT_SWEEP: 'on' })).toBe(true);
  });
});
