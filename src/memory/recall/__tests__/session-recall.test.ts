import { describe, expect, it } from 'vitest';
import {
  dedupeFacts,
  factId,
  formatRecall,
  loadRecallSnapshot,
  mentions,
  rareWordWeights,
  rareWordsEnabled,
  recallForTurn,
  type RecallSnapshot,
  type RecallFact,
} from '../session-recall.js';
import { insideJokesEnabled, jokesForTurn } from '../inside-jokes-recall.js';

// Shapes as written by deep extraction (bogle_users/{id}/dynamic_facts), 2026-09-27.
const biscuitBreed = { entity: 'Biscuit', key: 'breed', value: 'golden retriever', confidence: 1 };
const biscuitShoes = {
  entity: 'Biscuit',
  key: 'action',
  value: "chewed through 2 of Speaker's shoes",
  confidence: 0.9,
};
const austinJob = { entity: 'Austin', key: 'job_offer', value: 'new job in Austin', confidence: 0.8 };
const selfFact = { entity: 'Speaker', key: 'feeling', value: 'rough week, not sleeping', confidence: 0.7 };

const snapshot: RecallSnapshot = {
  facts: [biscuitBreed, biscuitShoes, austinJob, selfFact],
  followUps: ['Ask how the shoe situation with Biscuit is going'],
};

describe('mentions', () => {
  it('matches whole words only', () => {
    expect(mentions('How is Biscuit doing?', 'Biscuit')).toBe(true);
    expect(mentions("I've been exhausting myself", 'Austin')).toBe(false);
    expect(mentions('we went to Austin, it was great', 'austin')).toBe(true);
    expect(mentions('my golden retriever', 'golden retriever')).toBe(true);
  });
});

describe('recallForTurn', () => {
  it('brings facts about the entity the user names, best first', () => {
    const facts = recallForTurn(snapshot, 'Biscuit ate another shoe today');
    expect(facts.map((f) => f.key)).toEqual(['action', 'breed']);
  });

  it('matches on shared content words when no entity is named', () => {
    expect(recallForTurn(snapshot, "I still haven't been sleeping")).toEqual([selfFact]);
  });

  it('returns nothing for an unrelated turn', () => {
    expect(recallForTurn(snapshot, 'What is the weather tomorrow?')).toEqual([]);
  });

  it('does not match an entity hidden inside another word', () => {
    expect(recallForTurn(snapshot, 'Work has been exhausting')).toEqual([]);
  });

  it('skips facts already surfaced this session', () => {
    const surfaced = new Set([factId(biscuitShoes)]);
    expect(recallForTurn(snapshot, 'Biscuit is so funny', surfaced)).toEqual([biscuitBreed]);
  });
});

describe('dedupeFacts', () => {
  it('keeps one copy of a fact extracted in several sessions, at its highest confidence', () => {
    const facts = dedupeFacts([
      { ...biscuitBreed, confidence: 0.6 },
      biscuitBreed,
      { ...biscuitBreed, entity: 'biscuit', confidence: 0.7 },
    ]);
    expect(facts).toEqual([biscuitBreed]);
  });
});

describe('formatRecall', () => {
  it('writes the facts and open threads, naming the caller for self facts', () => {
    const note = formatRecall([biscuitBreed, selfFact], snapshot.followUps, 'Sam');
    expect(note).toContain('[WHAT YOU REMEMBER ABOUT SAM]');
    expect(note).toContain('- Biscuit: breed = golden retriever');
    expect(note).toContain('- Sam: feeling = rough week, not sleeping');
    expect(note).toContain('- Ask how the shoe situation with Biscuit is going');
  });

  it('returns null when there is nothing to recall', () => {
    expect(formatRecall([], [])).toBeNull();
  });
});

describe('loadRecallSnapshot', () => {
  it('maps stored facts, dedupes them and collects follow-ups from summaries', async () => {
    const snap = await loadRecallSnapshot(
      {
        facts: async () => [
          { entityName: 'Biscuit', key: 'breed', value: 'golden retriever', confidence: 1 },
          { entityName: 'Biscuit', key: 'breed', value: 'golden retriever', confidence: 0.8 },
        ],
        summaries: async () => [
          {
            callerProvenance: 1,
            followUpItems: ['Ask about the vet visit', 'Ask about the shoes'],
          },
          { callerProvenance: 1, followUpItems: ['Ask about the vet visit', 'Ask about Austin'] },
        ],
      },
      'u1'
    );
    expect(snap.facts).toEqual([biscuitBreed]);
    expect(snap.followUps).toEqual([
      'Ask about the vet visit',
      'Ask about the shoes',
      'Ask about Austin',
    ]);
  });

  it('returns an empty snapshot when the store fails', async () => {
    const snap = await loadRecallSnapshot(
      {
        facts: async () => {
          throw new Error('unavailable');
        },
        summaries: async () => {
          throw new Error('unavailable');
        },
      },
      'u1'
    );
    expect(snap).toEqual({ facts: [], followUps: [], insideJokes: [] });
  });
});

// Memory with manners (dev, 2026-10-04): a scripted call's "she's pregnant",
// stored as 63 undated rows, came back as "Since she's pregnant..." in
// unrelated calls. Facts now carry their age, sensitive ones wait for the
// caller to raise them, and one entity can't take the whole turn's budget.
describe('memory with manners', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

  it('says how old each remembered fact is', () => {
    const note = formatRecall(
      [
        { ...biscuitBreed, extractedAt: daysAgo(5) },
        { ...austinJob, extractedAt: daysAgo(0.1) },
      ],
      [],
      'Sam',
      now
    )!;
    expect(note).toContain('- Biscuit: breed = golden retriever [said 5 days ago]');
    expect(note).toContain('- Austin: job offer = new job in Austin [said today]');
    // A date inside the value must not read as dated by the label (dev 2026-10-05).
    expect(note).not.toMatch(/\(today\)|\(yesterday\)/);
    expect(note).toContain('as of when it was said');
  });

  it('tells Ferni to check rather than assert, and to leave sensitive things to the caller', () => {
    const note = formatRecall([biscuitBreed], [], 'Sam', now)!;
    expect(note).toMatch(/check/i);
    expect(note).toMatch(/health/i);
    expect(note).toMatch(/unless they bring it up/i);
  });

  it('brings at most two facts about one entity to a turn', () => {
    const sister = (key: string, value: string) => ({ entity: 'sister', key, value, confidence: 1 });
    const snap: RecallSnapshot = {
      facts: [
        sister('pregnancy', 'Pregnant'),
        sister('pregnancy', 'is pregnant'),
        sister('pregnancy announcement', 'announced it on the trail'),
        sister('likes', 'hiking'),
        { entity: 'Sam', key: 'likes', value: 'old movies', confidence: 1 },
      ],
      followUps: [],
    };
    const got = recallForTurn(snap, "My sister's birthday is next week. She loves hiking and old movies.");
    expect(got.filter((f) => f.entity === 'sister')).toHaveLength(2);
  });

  it('reads word confidences, drops low ones, and keeps the newest copy of a fact', async () => {
    const snap = await loadRecallSnapshot(
      {
        facts: async () => [
          { entityName: 'Biscuit', key: 'breed', value: 'golden retriever', confidence: 'high', extractedAt: daysAgo(9) },
          { entityName: 'Biscuit', key: 'breed', value: 'golden retriever', confidence: 'high', extractedAt: daysAgo(2) },
          { entityName: 'Biscuit', key: 'toy', value: 'tennis ball', confidence: 'low' },
          { entityName: 'Biscuit', key: 'age', value: 'three' },
        ],
        summaries: async () => [],
      },
      'u1'
    );
    expect(snap.facts).toEqual([
      { entity: 'Biscuit', key: 'breed', value: 'golden retriever', confidence: 0.9, extractedAt: daysAgo(2) },
      { entity: 'Biscuit', key: 'age', value: 'three', confidence: 0.5 },
    ]);
  });
});

describe('rare words (RECALL_RARE_WORDS)', () => {
  const fact = (entity: string, key: string, value: string): RecallFact => ({
    entity,
    key,
    value,
    confidence: 0.9,
  });
  // Maya's memory in the benchmark: "work" is everywhere, the old hospital once.
  const facts = [
    fact('Speaker', 'work schedule', 'Works long shifts'),
    fact('Neighbor', 'walks pet', "Walks the speaker's pet during the speaker's long work shifts"),
    fact('commute', 'length', 'forty minutes to work'),
    fact('Dana', 'relation', 'a friend from work'),
    fact('Speaker', 'previous hospital', "St. Mary's"),
    fact('Biscuit', 'breed', 'golden retriever'),
  ];

  it('counts a word in one fact as 1 and a word in many as less', () => {
    const weights = rareWordWeights(facts)!;
    expect(weights.get('hospital')).toBe(1);
    expect(weights.get('work')!).toBeLessThan(0.35);
    expect(rareWordWeights(facts.slice(0, 3))).toBeUndefined(); // too few to tell
  });

  it('a common word alone no longer brings a fact; a rare one still does', () => {
    const plain: RecallSnapshot = { facts, followUps: [] };
    const weighted: RecallSnapshot = { ...plain, wordWeights: rareWordWeights(facts) };
    const ask = 'which hospital did I work at before';
    const before = recallForTurn(plain, ask).map((f) => f.value);
    const after = recallForTurn(weighted, ask).map((f) => f.value);
    expect(before).toContain('Works long shifts');
    expect(after).toEqual(["St. Mary's"]);
  });

  it('is off unless RECALL_RARE_WORDS=on', async () => {
    const store = { facts: async () => facts.map((f) => ({ entityName: f.entity, key: f.key, value: f.value, confidence: 0.9 })), summaries: async () => [] };
    expect(rareWordsEnabled({})).toBe(false);
    const prev = process.env.RECALL_RARE_WORDS;
    process.env.RECALL_RARE_WORDS = 'on';
    try {
      expect((await loadRecallSnapshot(store, 'u')).wordWeights?.get('hospital')).toBe(1);
    } finally {
      if (prev === undefined) delete process.env.RECALL_RARE_WORDS;
      else process.env.RECALL_RARE_WORDS = prev;
    }
    expect((await loadRecallSnapshot(store, 'u')).wordWeights).toBeUndefined();
  });
});

describe('superseded facts', () => {
  const store = {
    facts: async () => [
      { entityName: 'User', key: 'current employer', value: 'Northwind', confidence: 0.9 },
      {
        entityName: 'User',
        key: 'current_job',
        value: 'Works as a baker at Rise and Grind',
        confidence: 0.9,
        supersededAt: '2026-10-06T19:00:00Z',
      },
    ],
    summaries: async () => [],
  };

  it('stay findable but rank below current facts and read as how things were', async () => {
    const snapshot = await loadRecallSnapshot(store, 'u');
    const picked = recallForTurn(snapshot, 'where do I work, my current job or employer?');
    expect(picked.map((f) => f.value)).toEqual(['Northwind', 'Works as a baker at Rise and Grind']);
    const note = formatRecall(picked, [], 'Eli')!;
    expect(note).toContain('- Eli: current employer = Northwind\n');
    expect(note).toContain('current job = Works as a baker at Rise and Grind [no longer true: how things were before]');
  });
});

const ref = (bit: string, quote = 'the fungus incident') => ({ bit, quote, speaker: 'user' as const });

// Inside jokes (INSIDE_JOKES=on): bits the summarizer saw land between the
// caller and Ferni on past calls. Ferni once said "Classic Biscuit" about a dog
// first mentioned seconds earlier; shared history has to be real.
describe('inside jokes', () => {
  const ON = { INSIDE_JOKES: 'on' };
  const jokes = [
    {
      bit: 'the mushroom thing: Sam calls the risotto "the fungus incident"',
      quote: 'the fungus incident',
      speaker: 'user' as const,
    },
  ];

  it('is off unless INSIDE_JOKES=on', () => {
    expect(insideJokesEnabled({})).toBe(false);
    expect(insideJokesEnabled({ INSIDE_JOKES: 'off' })).toBe(false);
    expect(insideJokesEnabled(ON)).toBe(true);
  });

  it('collects up to 3 recent jokes from summaries, newest first, deduped', async () => {
    const snap = await loadRecallSnapshot(
      {
        facts: async () => [],
        summaries: async () => [
          { insideJokes: [ref('the mushroom thing', 'the fungus incident'), { bit: '  ', quote: 'x y z' }] },
          {},
          { insideJokes: [ref('The Mushroom Thing', 'other line here'), ref('Biscuit vs the vacuum', 'the vacuum roared'), 42] },
          { insideJokes: [ref('the "accountant voice" bit', 'the accountant voice'), 'the parking-lot saga'] },
        ],
      },
      'u1'
    );
    expect(snap.insideJokes?.map((j) => j.bit)).toEqual([
      'the mushroom thing',
      'Biscuit vs the vacuum',
      'the "accountant voice" bit',
    ]);
  });

  it('keeps bits only with their line on file (bare strings from old summaries are dropped)', async () => {
    const snap = await loadRecallSnapshot(
      {
        facts: async () => [],
        summaries: async () => [{ insideJokes: ['an old bare string', { bit: 'no line', quote: '' }] }],
      },
      'u2'
    );
    expect(snap.insideJokes).toEqual([]);
  });

  it('does not bring a bit back on filler words like "really" alone', () => {
    const j = [ref('the mushroom police', 'I really love the mushroom police')];
    expect(jokesForTurn(j, 'Hi, really good to hear you')).toEqual([]);
    expect(jokesForTurn(j, 'the mushroom police came back')).toHaveLength(1);
  });

  it('brings a bit back only on a turn that touches its line', () => {
    const j = [ref('the mushroom thing', 'the fungus incident in the risotto')];
    expect(jokesForTurn(j, 'the weather is nice today')).toEqual([]);
    expect(jokesForTurn(j, 'the fungus is back in my risotto')).toHaveLength(1);
  });

  it('adds the shared-bits section only with the flag on', () => {
    const off = formatRecall([biscuitBreed], [], 'Sam', Date.now(), { insideJokes: jokes, env: {} })!;
    expect(off).not.toContain('fungus incident');
    expect(off).not.toContain('Bits you two actually share');

    const on = formatRecall([biscuitBreed], [], 'Sam', Date.now(), { insideJokes: jokes, env: ON })!;
    expect(on).toContain('Bits you two actually share from past calls');
    expect(on).toContain('- the mushroom thing: Sam calls the risotto "the fungus incident"');
  });

  it('tells Ferni to use one at most once a call and never explain it', () => {
    const note = formatRecall([], [], 'Sam', Date.now(), { insideJokes: jokes, env: ON })!;
    expect(note).toContain('at most once this call');
    expect(note).toContain('never explain it');
    expect(note).toContain('only if it fits naturally');
  });

  it('adds nothing when there are no jokes, even with the flag on', () => {
    expect(formatRecall([], [], 'Sam', Date.now(), { insideJokes: [], env: ON })).toBeNull();
    const note = formatRecall([biscuitBreed], [], 'Sam', Date.now(), { env: ON })!;
    expect(note).not.toContain('Bits you two actually share');
  });

  it('does not make a note from jokes alone when the flag is off', () => {
    expect(formatRecall([], [], 'Sam', Date.now(), { insideJokes: jokes, env: {} })).toBeNull();
  });
});
