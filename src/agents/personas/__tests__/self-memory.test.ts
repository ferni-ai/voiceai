import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  biographyCore,
  consistentWithBiography,
  notTheCallers,
  createLedgerRecorder,
  lifeFactsOnly,
  selfMemoryEnabled,
  type LedgerFact,
  type LedgerStore,
} from '../life-ledger.js';

/** What the extractor saved for one prod caller on 2026-10-10, in order. */
const PROD_FACTS = [
  "Ferni's week has been pretty quiet.",
  "Ferni wouldn't last a day in the ancient tea economy.",
  'Ferni would probably drink tea currency by mistake.',
  'Ferni would end up eating his own wallet by Tuesday.',
  'Ferni plans to ignore the mail until tomorrow and drink coffee.',
  'Ferni has been staring at a stack of mail three weeks deep.',
  'Ferni has been reading an old history book about the silk road.',
  'Ferni got mixed up and confused the tea talk.',
];
const HIS_LIFE = [PROD_FACTS[0], PROD_FACTS[4], PROD_FACTS[5], PROD_FACTS[6]];

/** Lines that ground every fact above, so only the self-memory filter can drop any. */
const LINES = [
  "Honestly my week has been pretty quiet. I've been staring at a stack of mail three weeks deep.",
  "I plan to ignore the mail until tomorrow and drink coffee instead. I'm reading an old history book about the silk road.",
  "I wouldn't last a day in the ancient tea economy. I'd probably drink tea currency by mistake and end up eating my own wallet by Tuesday.",
  'Sorry, I got mixed up there and confused the tea talk.',
];

function memoryStore(): LedgerStore & { rows: LedgerFact[] } {
  const rows: LedgerFact[] = [];
  return {
    rows,
    async save(_u, facts) {
      rows.push(...facts);
    },
    async recent() {
      return rows;
    },
  };
}

describe('lifeFactsOnly', () => {
  it("keeps his life and drops the jokes and the remark about the call (prod, 2026-10-10)", () => {
    expect(lifeFactsOnly(PROD_FACTS)).toEqual(HIS_LIFE);
  });

  it('keeps a real story that happens to use the same words', () => {
    const real = [
      'Ferni got confused by the IKEA instructions for his new bookshelf',
      "Ferni's wife would rather go to Kyoto than Osaka",
    ];
    expect(lifeFactsOnly(real)).toEqual(real);
  });
});

describe('createLedgerRecorder with FERNI_SELF_MEMORY', () => {
  async function saved(
    env: Record<string, string>,
    extracted = PROD_FACTS,
    lines = LINES,
    ask: (system: string, input: string) => Promise<string> = async () => 'NONE',
    callers: string[] = []
  ): Promise<string[]> {
    const store = memoryStore();
    const rec = createLedgerRecorder('u1', {
      store,
      extract: async () => extracted,
      env,
      ask,
      callerNames: async () => callers,
    });
    for (const line of lines) rec.add('ferni', line);
    await rec.flush();
    return store.rows.map((r) => r.fact);
  }

  it('stores only his life when on, and is unchanged when off', async () => {
    const off = await saved({});
    expect(off).toEqual(PROD_FACTS); // all grounded: the filter is the only difference
    expect(await saved({ FERNI_SELF_MEMORY: 'on' })).toEqual(HIS_LIFE);
  });

  it("drops what conflicts with his biography, checked against the real biography-core.md", async () => {
    const extracted = ['Ferni is reading an old history book about the silk road', 'Ferni is an only child'];
    const lines = ["I'm reading an old history book about the silk road. I'm an only child, actually."];
    const asked: string[] = [];
    const ask = async (system: string, input: string) => {
      asked.push(system, input);
      return '2 | Third of seven siblings.';
    };
    expect(await saved({}, extracted, lines, ask)).toEqual(extracted); // off: no check
    expect(asked).toEqual([]);
    expect(await saved({ FERNI_SELF_MEMORY: 'on' }, extracted, lines, ask)).toEqual([extracted[0]]);
    expect(asked[0]).toContain('Third of seven siblings');
    expect(asked[1]).toBe('1. Ferni is reading an old history book about the silk road\n2. Ferni is an only child');
  });

  it("drops the caller's own pet when on, from the caller's entities", async () => {
    const extracted = ['Ferni has a pet named Biscuit', 'Ferni is reading an old history book'];
    const lines = ["Classic Biscuit! Me, I'm reading an old history book. Biscuit sounds like a pet named trouble."];
    const none = async () => 'NONE';
    expect(await saved({}, extracted, lines, none, ['Biscuit'])).toEqual(extracted);
    expect(await saved({ FERNI_SELF_MEMORY: 'on' }, extracted, lines, none, ['Biscuit'])).toEqual([extracted[1]]);
  });

  it('is off by default', () => {
    expect(selfMemoryEnabled({})).toBe(false);
    expect(selfMemoryEnabled({ FERNI_SELF_MEMORY: 'on' })).toBe(true);
  });
});

describe('consistentWithBiography', () => {
  const facts = ['a', 'b', 'c'];
  it('keeps everything when the check finds no conflict, or there is no biography', async () => {
    expect(await consistentWithBiography('Ferni', facts, 'bio', async () => 'NONE')).toEqual(facts);
    const ask = async () => '1,2,3';
    expect(await consistentWithBiography('Ferni', facts, '', ask)).toEqual(facts);
  });

  it('keeps the facts when the check fails', async () => {
    const ask = async (): Promise<string> => {
      throw new Error('quota');
    };
    expect(await consistentWithBiography('Ferni', facts, 'bio', ask)).toEqual(facts);
  });

  const bio = 'Wyoming kid. Third of seven siblings. Coffee (my wife says it is an addiction)';

  it('drops a fact only when both answers rule it out', async () => {
    const replies = ['1 | Third of seven siblings.\n2 | Wyoming kid', '1 | Third of seven siblings.'];
    const ask = async () => replies.shift() ?? 'NONE';
    expect(await consistentWithBiography('Ferni', facts, bio, ask)).toEqual(['b', 'c']);
  });

  it('drops a fact only with a quote that is really in the biography', async () => {
    const reply = '1 | Third of seven siblings.\n3 | "Wyoming kid"';
    expect(await consistentWithBiography('Ferni', facts, bio, async () => reply)).toEqual(['b']);
  });

  it('keeps a fact flagged without a quote, with a made-up quote, or with one word', async () => {
    const reply = '1, 3\n2 | grew up in Ohio\n3 | Wyoming';
    expect(await consistentWithBiography('Ferni', facts, bio, async () => reply)).toEqual(facts);
  });
});

describe('notTheCallers', () => {
  it("drops facts that give him the caller's own named pet (13 prod facts, 2026-10-10)", () => {
    const facts = [
      'Ferni has a pet named Biscuit.',
      "Ferni's pet, Biscuit, saved the best for breakfast.",
      'Ferni is reading an old history book about the silk road.',
    ];
    expect(notTheCallers(facts, ['Biscuit', 'manager'], 'Ferni')).toEqual([facts[2]]);
  });

  it('ignores kin words, pronouns, the caller and Ferni himself', () => {
    const facts = [
      "Ferni's brother dropped news out of nowhere while they were pumping gas.",
      "Ferni's own mom used to call him every Saturday morning.",
      'Ferni had a cat growing up.',
      'Fernie loves the first quiet hour of morning.',
    ];
    const callers = ['They', 'She', 'Brother', 'Mom', 'Cat', 'User', 'Speaker', 'Fernie', 'sister'];
    expect(notTheCallers(facts, callers, 'Ferni')).toEqual(facts);
  });
});

describe('biographyCore', () => {
  it("reads the persona's biography-core.md from the bundle", async () => {
    expect(await biographyCore('ferni')).toContain('Wyoming');
    expect(await biographyCore('no-such-persona')).toBe('');
  });

  it('finds it in the image layout: /app/dist/personas/bundles, no src/', async () => {
    const app = mkdtempSync(join(tmpdir(), 'image-'));
    const dir = join(app, 'dist', 'personas', 'bundles', 'imagetest', 'identity');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'biography-core.md'), 'Wyoming kid. Third of seven siblings.');
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(app);
    try {
      expect(await biographyCore('imagetest')).toContain('Third of seven');
      expect(await biographyCore('imagetest-missing')).toBe('');
    } finally {
      cwd.mockRestore();
    }
  });
});
