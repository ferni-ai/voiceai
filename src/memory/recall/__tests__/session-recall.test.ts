import { describe, expect, it } from 'vitest';
import {
  dedupeFacts,
  factId,
  formatRecall,
  insideJokesEnabled,
  loadRecallSnapshot,
  mentions,
  recallForTurn,
  type RecallSnapshot,
} from '../session-recall.js';

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
          { followUpItems: ['Ask about the vet visit', 'Ask about the shoes'] },
          { followUpItems: ['Ask about the vet visit', 'Ask about Austin'] },
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

// Inside jokes (INSIDE_JOKES=on): bits the summarizer saw land between the
// caller and Ferni on past calls. Ferni once said "Classic Biscuit" about a dog
// first mentioned seconds earlier; shared history has to be real.
describe('inside jokes', () => {
  const ON = { INSIDE_JOKES: 'on' };
  const jokes = ['the mushroom thing: Sam calls the risotto "the fungus incident"'];

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
          { insideJokes: ['the mushroom thing', '  '] },
          {},
          { insideJokes: ['The Mushroom Thing', 'Biscuit vs the vacuum', 42] },
          { insideJokes: ['the "accountant voice" bit', 'the parking-lot saga'] },
        ],
      },
      'u1'
    );
    expect(snap.insideJokes).toEqual([
      'the mushroom thing',
      'Biscuit vs the vacuum',
      'the "accountant voice" bit',
    ]);
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
