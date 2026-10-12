import { describe, expect, it } from 'vitest';
import {
  createLedgerRecorder,
  supersededFacts,
  type LedgerFact,
  type LedgerStore,
} from '../life-ledger.js';
import {
  canonFor,
  inSecondPerson,
  loadCanon,
  SELF_RECALL_TOKENS,
  selfRecallEnabled,
  selfRecallNote,
} from '../self-recall.js';

const DAY = 86_400_000;
const NOW = Date.parse('2026-09-21T18:30:00-06:00');
const at = (daysAgo: number): string => new Date(NOW - daysAgo * DAY).toISOString();
const fact = (text: string, daysAgo: number): LedgerFact => ({
  personaId: 'ferni',
  fact: text,
  saidAt: at(daysAgo),
});

/** What the ledger held for one eval caller on day 14 of the 2026-10-11 run. */
const TOLD = [
  fact('Ferni spent Sunday trying to fix an old wooden chair in the kitchen.', 14),
  fact('Ferni picked up a book of Japanese essays on ma.', 14),
  fact('Ferni and his wife have been talking about getting a dog.', 14),
  fact('Ferni finished a book of essays and started a new collection of short stories.', 7),
  fact('Ferni and his wife decided against getting the terrier for now.', 4),
];
const CANON = {
  age: "You're fifty-seven.",
  origin: 'You grew up in Wyoming, third of seven kids.',
};
const note = (said: string, told = TOLD) =>
  selfRecallNote(said, told, CANON, { name: 'Ferni', now: NOW });
const tokens = (t: string) => Math.ceil(t.length / 4);

describe('selfRecallNote', () => {
  it('pins his age when asked: every age answer was wrong on the eval (42 to 52)', () => {
    expect(note("How old are you, if you don't mind me asking?")).toBe(
      "[ABOUT YOU: You're fifty-seven.]"
    );
  });

  it('answers "the book" with the newest version, not the one he has finished', () => {
    const n = note('You said you were reading something, right? What was it again?') ?? '';
    expect(n).toMatch(/^\[ABOUT YOU: You told them: You finished a book of essays/);
    expect(n.indexOf('finished')).toBeLessThan(n.indexOf('essays on ma'));
    expect(n).toContain('the newest is how it stands now');
  });

  it('answers "your dog" with the decision, newest first', () => {
    const n = note("And how's the pet situation at your place?") ?? '';
    expect(n).toMatch(/^\[ABOUT YOU: You told them: You and your wife decided against/);
  });

  it('tells him a weekend he already told is not this weekend', () => {
    const n = note('What did you do last weekend?') ?? '';
    expect(n).toContain('fix an old wooden chair');
    expect(n).toContain('(told 14d ago)');
    expect(n).toContain('Those happened before you told them, not this past weekend.');
  });

  it('stays within its token budget however much he has told', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      fact(`Ferni read a long book about the history of maps, part ${i}.`, i)
    );
    const n = note("How's your book going?", many) ?? '';
    expect(n).toContain('maps');
    expect(tokens(n)).toBeLessThanOrEqual(SELF_RECALL_TOKENS);
  });

  it('says nothing when they are not asking about him', () => {
    expect(note('Pepper chewed up one of my shoes this morning.')).toBeNull();
    expect(note('Thank you, see you later.')).toBeNull();
    expect(note('Ha. Okay, I have got to make dinner. Talk soon.')).toBeNull();
  });

  it('says nothing for a question about him that nothing answers', () => {
    expect(note('Are you a fan of jazz?')).toBeNull();
  });

  it("doesn't take his name for a topic", () => {
    expect(note('Hey Ferni, are you there?')).toBeNull();
  });
});

describe('canonFor and inSecondPerson', () => {
  it('maps canon questions to their lines, and only when the bundle has one', () => {
    expect(canonFor('Where did you grow up again?', CANON)).toEqual([CANON.origin]);
    expect(canonFor('Do you have brothers and sisters?', CANON)).toEqual([CANON.origin]);
    expect(canonFor("What's your wife up to?", CANON)).toEqual([]);
  });

  it('speaks the facts to him', () => {
    expect(inSecondPerson("Ferni's house is quiet today.", 'Ferni')).toBe(
      'Your house is quiet today'
    );
    expect(inSecondPerson('Ferni and his wife decided.', 'Ferni')).toBe(
      'You and your wife decided'
    );
  });

  it("loads Ferni's canon from the bundle, consistent with his character sheet", async () => {
    const canon = await loadCanon('ferni');
    expect(canon.age).toContain('fifty-seven');
    expect(canon.origin).toContain('Wyoming');
    expect(await loadCanon('no-such-persona')).toEqual({});
  });

  it('is off unless FERNI_SELF_RECALL=on', () => {
    expect(selfRecallEnabled({})).toBe(false);
    expect(selfRecallEnabled({ FERNI_SELF_RECALL: 'on' })).toBe(true);
  });
});

describe('supersededFacts', () => {
  it('returns the earlier facts the model names, and never a fact told again today', async () => {
    const earlier = [TOLD[2], TOLD[1], TOLD[0]];
    const gone = await supersededFacts(
      'Ferni',
      earlier,
      ['Ferni and his wife decided against the terrier.', TOLD[0].fact],
      async (_sys, input) => {
        expect(input.split('TODAY')[0]).not.toContain('wooden chair'); // told again today: not a candidate
        return '1\n2';
      }
    );
    expect(gone.map((f) => f.fact)).toEqual([TOLD[2].fact, TOLD[1].fact]);
  });

  it('supersedes nothing when the check fails or finds nothing', async () => {
    const boom = async () => {
      throw new Error('vertex down');
    };
    expect(await supersededFacts('Ferni', TOLD, ['Ferni fixed the chair.'], boom)).toEqual([]);
    expect(
      await supersededFacts('Ferni', TOLD, ['Ferni fixed the chair.'], async () => 'NONE')
    ).toEqual([]);
  });
});

/** Rows by doc text, merged like Firestore's set(..., { merge: true }); recent() reads like the real store. */
function mergingStore(): LedgerStore & { rows: Map<string, LedgerFact> } {
  const rows = new Map<string, LedgerFact>();
  return {
    rows,
    async save(_u, facts) {
      for (const f of facts) rows.set(f.fact, { ...rows.get(f.fact), ...f });
    },
    async recent() {
      return [...rows.values()].filter((f) => !f.supersededAt);
    },
  };
}

describe('the ledger with FERNI_SELF_RECALL', () => {
  const deps = (store: LedgerStore, env: Record<string, string>, verdict: string) => ({
    store,
    env,
    now: () => NOW,
    extract: async () => ['Ferni and his wife decided against getting the terrier.'],
    callerNames: async () => [],
    // The biography check rules nothing out; the supersede check names fact 1.
    ask: async (system: string) => (system.includes('biography') ? 'NONE' : verdict),
  });

  it('marks what the new fact replaces, so it is never recalled again', async () => {
    const store = mergingStore();
    await store.save('u', [TOLD[2]]);
    const env = { FERNI_SELF_MEMORY: 'on', FERNI_SELF_RECALL: 'on' };
    const recorder = createLedgerRecorder('u', deps(store, env, '1'));
    recorder.add('ferni', 'My wife and I decided against getting the terrier, at least for now.');
    expect(await recorder.flush()).toBe(1);
    expect(store.rows.get(TOLD[2].fact)?.supersededAt).toBe(new Date(NOW).toISOString());
    expect((await store.recent('u', 'ferni', 10)).map((f) => f.fact)).toEqual([
      'Ferni and his wife decided against getting the terrier.',
    ]);
  });

  it('leaves earlier facts alone with the flag off', async () => {
    const store = mergingStore();
    await store.save('u', [TOLD[2]]);
    const recorder = createLedgerRecorder('u', deps(store, { FERNI_SELF_MEMORY: 'on' }, '1'));
    recorder.add('ferni', 'My wife and I decided against getting the terrier, at least for now.');
    await recorder.flush();
    expect(store.rows.get(TOLD[2].fact)?.supersededAt).toBeUndefined();
  });
});

describe('the live recall hook with FERNI_SELF_RECALL', () => {
  const recallWith = async (selfRecall: boolean) => {
    const { createMemoryRecall } = await import('../../multi-agent/memory-recall-hook.js');
    const recall = createMemoryRecall({
      userId: 'u',
      userName: 'Dana',
      store: { facts: async () => [], summaries: async () => [] },
      ledgerStore: { save: async () => undefined, recent: async () => TOLD },
      checkIns: async () => [],
      semantic: false,
      selfRecall,
    });
    await recall.ready;
    recall.noteFor('Hey Ferni.'); // the first note carries the ledger
    recall.newTurn();
    return recall;
  };

  it('answers his age from the canon, once per turn', async () => {
    const recall = await recallWith(true);
    expect(recall.noteFor('How old are you?')).toContain("[ABOUT YOU: You're fifty-seven.");
    expect(recall.noteFor('How old are you, anyway?')).toBeNull();
    recall.newTurn();
    expect(recall.noteFor("How's that book you were reading?")).toContain('You finished a book');
  });

  it('adds nothing with the flag off', async () => {
    const recall = await recallWith(false);
    expect(recall.noteFor('How old are you?')).toBeNull();
  });
});
