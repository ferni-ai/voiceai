import { describe, expect, it, vi } from 'vitest';
import { createMemoryRecall } from '../../multi-agent/memory-recall-hook.js';
import {
  consistentWithBiography,
  createLedgerRecorder,
  formatLedger,
  groundedFacts,
  type LedgerFact,
  type LedgerStore,
} from '../life-ledger.js';

const prompts = vi.hoisted(() => [] as string[]);
vi.mock('../../../config/generative-model.js', () => ({
  getGenerativeModel: async (opts: { systemInstruction: string }) => {
    prompts.push(opts.systemInstruction);
    return {
      generateContent: async () => ({
        response: { text: () => "Jordan's neighbor teases her about her coffee" },
      }),
    };
  },
}));

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
    expect(extract).toHaveBeenCalledWith('Ferni', lines, {
      subject: 'he',
      object: 'him',
      possessive: 'his',
    });
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

describe('life ledger pronouns', () => {
  const capture = () => {
    const systems: string[] = [];
    const ask = async (system: string) => {
      systems.push(system);
      return 'NONE';
    };
    return { systems, ask };
  };
  const bio = 'I grew up in a small town. I have a brother.';

  it('asks the biography check about Maya as a woman, not a man with a wife', async () => {
    const { systems, ask } = capture();
    await consistentWithBiography('Maya', ['Maya grew up in Lisbon'], bio, ask);
    expect(systems).toHaveLength(2);
    for (const system of systems) {
      expect(system).toContain("Maya's biography, in her voice");
      expect(system).toContain('country she grew up in');
      expect(system).toContain('a different marital status');
      expect(system).not.toMatch(/\b(he|his|him)\b/);
      expect(system).not.toContain('no wife');
    }
  });

  it("extracts Jordan's facts with her pronouns when a call ends", async () => {
    prompts.length = 0;
    const store = memoryStore();
    const rec = createLedgerRecorder('u1', {
      store,
      now: () => Date.parse('2026-10-06T12:00:00Z'),
    });
    rec.add('jordan-taylor', 'My neighbor teases me about my coffee every single morning.');
    expect(await rec.flush()).toBe(1);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('"Jordan\'s neighbor teases her about her coffee"');
    expect(prompts[0]).toContain('in her life');
    expect(prompts[0]).not.toMatch(/\b(he|his|him)\b/);
    expect(prompts[0]).not.toContain('wife');
  });

  it('still describes Ferni as he/his', async () => {
    const { systems, ask } = capture();
    await consistentWithBiography('Ferni', ['Ferni grew up in Ohio'], bio, ask);
    expect(systems[0]).toContain("Ferni's biography, in his voice");
    expect(systems[0]).toContain('country he grew up in');
    expect(systems[0]).not.toMatch(/\b(she|her)\b/);
  });

  it('describes Alex as he/him', async () => {
    const { systems, ask } = capture();
    await consistentWithBiography('Alex', ['Alex grew up in Oakland'], bio, ask);
    expect(systems[0]).toContain("Alex's biography, in his voice");
    expect(systems[0]).toContain('country he grew up in');
    expect(systems[0]).not.toMatch(/\b(she|her|herself)\b/);
  });

  it("extracts Alex's facts with his pronouns when a call ends", async () => {
    prompts.length = 0;
    const rec = createLedgerRecorder('u1', { store: memoryStore() });
    rec.add('alex-chen', 'My neighbor teases me about my coffee every single morning.');
    await rec.flush();
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('"Alex\'s neighbor teases him about his coffee"');
    expect(prompts[0]).not.toMatch(/\b(she|her)\b/);
  });

  it('uses they/their for a persona it does not know', async () => {
    const { systems, ask } = capture();
    await consistentWithBiography('Quinn', ['Quinn grew up in Leeds'], bio, ask);
    expect(systems[0]).toContain("Quinn's biography, in their voice");
    expect(systems[0]).toContain('country they grew up in');
    expect(systems[0]).not.toMatch(/\b(he|his|him|she|her)\b/);
  });
});
