import { describe, expect, it, vi } from 'vitest';
import { createMemoryRecall } from '../../multi-agent/memory-recall-hook.js';
import {
  createLedgerRecorder,
  formatLedger,
  groundedFacts,
  type LedgerFact,
  type LedgerStore,
} from '../life-ledger.js';

const lines = [
  "Ha, my neighbor's goat got out again and ate half of my wife's marigolds.",
  'I finally tried that slow-drip coffee, and the whole kitchen smelled amazing.',
];

function memoryStore(): LedgerStore & { saved: LedgerFact[] } {
  const saved: LedgerFact[] = [];
  return {
    saved,
    async save(_u, facts) {
      saved.push(...facts);
    },
    async recent(_u, personaId, limit) {
      return saved
        .filter((f) => f.personaId === personaId)
        .slice(-limit)
        .reverse();
    },
  };
}

describe('life ledger', () => {
  it('keeps short facts grounded in what he said, and drops invented ones', () => {
    expect(
      groundedFacts(
        [
          "- Ferni's neighbor's goat got out and ate his wife's marigolds",
          "Ferni's brother is a pilot in Denver",
          'Ferni tried slow-drip coffee',
          'Ferni tried slow-drip coffee',
        ],
        lines
      )
    ).toEqual([
      "Ferni's neighbor's goat got out and ate his wife's marigolds",
      'Ferni tried slow-drip coffee',
    ]);
  });

  it('formats a note that keeps his life consistent, dated by when he told it', () => {
    const now = Date.parse('2026-10-06T12:00:00Z');
    const note = formatLedger(
      [
        {
          personaId: 'ferni',
          fact: "Ferni's neighbor's goat keeps getting out",
          saidAt: '2026-10-01T12:00:00Z',
        },
      ],
      'Sam',
      now
    );
    expect(note).toContain("WHAT YOU'VE TOLD SAM ABOUT YOUR OWN LIFE");
    expect(note).toContain("- Ferni's neighbor's goat keeps getting out [told 5 days ago]");
    expect(note).toMatch(/stay consistent/);
    expect(formatLedger([], 'Sam')).toBeNull();
  });

  it('stores what a call said about himself when it ends, once', async () => {
    const store = memoryStore();
    const extract = vi.fn(async () => [
      "Ferni's neighbor's goat got out again",
      'The caller likes hiking',
    ]);
    const rec = createLedgerRecorder('u1', {
      store,
      extract,
      now: () => Date.parse('2026-10-06T12:00:00Z'),
    });
    for (const l of lines) rec.add('ferni', l);
    expect(await rec.flush()).toBe(1); // "the caller likes hiking" isn't in his lines
    expect(await rec.flush()).toBe(0);
    expect(store.saved).toEqual([
      {
        personaId: 'ferni',
        fact: "Ferni's neighbor's goat got out again",
        saidAt: '2026-10-06T12:00:00.000Z',
      },
    ]);
    expect(extract).toHaveBeenCalledWith('Ferni', lines);
  });

  it('never throws when extraction fails', async () => {
    const rec = createLedgerRecorder('u1', {
      store: memoryStore(),
      extract: async () => Promise.reject(new Error('quota')),
    });
    rec.add('ferni', lines[0]);
    await expect(rec.flush()).resolves.toBe(0);
  });

  it('reaches the next call: the first recall note carries it, later ones do not', async () => {
    const ledgerStore = memoryStore();
    await ledgerStore.save('u1', [
      {
        personaId: 'ferni',
        fact: "Ferni's neighbor's goat got out",
        saidAt: new Date().toISOString(),
      },
    ]);
    const recall = createMemoryRecall({
      userId: 'u1',
      userName: 'Sam',
      store: { facts: async () => [], summaries: async () => [] },
      ledgerStore,
    });
    await recall.ready;
    expect(recall.noteFor('hey, how are you')).toContain("Ferni's neighbor's goat got out");
    recall.newTurn();
    expect(recall.noteFor('what are you up to')).toBeNull();
  });
});
