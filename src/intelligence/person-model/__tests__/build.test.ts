import { describe, expect, it } from 'vitest';
import { buildPersonModel } from '../build.js';
import { freshness, PERSON_MODEL_VERSION } from '../types.js';
import { hasContactData } from '../util.js';
import { ago, factDoc, inputs, NOW, recalled, summary } from './fixtures.js';

const ONE_FACT_BOOK = [
  factDoc('Joan', 'sister of speaker', "The speaker's sister is named Joan", 5),
  factDoc('Joan', 'location', 'Tucson', 6),
  factDoc('Walt', 'spouse of', 'User', 2),
  factDoc('Walt', 'health', 'knee surgery scheduled', 2),
  factDoc('Walt', 'hobby', 'woodworking', 120), // older than 90 days: not counted
];

describe('people', () => {
  it('joins the recall roster, profile relations and relationship_network mentions', async () => {
    const m = buildPersonModel(
      inputs({
        facts: await recalled(ONE_FACT_BOOK),
        familyMembers: [{ name: 'Theo', relationship: 'Grandson' }],
        relationshipNetwork: [
          {
            name: 'Wally',
            aliases: ['Walt'],
            mentionCount: 9,
            lastMentioned: NOW.getTime() - 1000,
            recentMentions: [
              {
                context: 'dinner plans',
                date: NOW.getTime() - 2 * 86_400_000,
                sentiment: 'neutral',
              },
              { context: 'old trip', date: NOW.getTime() - 200 * 86_400_000, sentiment: 'neutral' },
            ],
            type: 'family',
          },
          { name: 'Priya', aliases: [], lastMentioned: NOW.getTime() - 5000, recentMentions: [] },
        ],
      }),
      NOW
    );
    const byName = Object.fromEntries(m.people.value.map((p) => [p.name, p]));
    expect(byName.Joan.relation).toBe('sister');
    expect(byName.Walt.relation).toBe('spouse');
    expect(byName.Theo.relation).toBe('grandson');
    // Only relationship_network knows Priya: her relation is unknown, never guessed.
    expect(byName.Priya.relation).toBeNull();
    // Walt: 2 facts in 90 days + 1 recent network mention (the 120- and 200-day ones don't count).
    expect(byName.Walt.mentions90d).toBe(3);
    expect(m.people.value[0].name).toBe('Walt');
    expect(byName.Walt.sensitive).toBe(true); // "surgery": only ever "let them lead"
    expect(byName.Joan.sensitive).toBe(false);
    expect(byName.Walt.sentiment).toBe('unknown');
    expect(byName.Walt.openThread).toBeNull();
    expect(m.people.prov.sources).toContain('dynamic_facts');
  });

  it('leaves out everyone and everything the caller asked Ferni to forget', async () => {
    const forgotten = ['Joan'];
    const marked = {
      ...factDoc('Dana', 'friend of speaker', 'friend of the speaker'),
      forgottenAt: ago(1),
    };
    const m = buildPersonModel(
      inputs({
        facts: await recalled([...ONE_FACT_BOOK, marked], forgotten),
        familyMembers: [{ name: 'Joan', relationship: 'sister' }],
        relationshipNetwork: [{ name: 'Joan', aliases: [], recentMentions: [] }],
        summaries: [summary(1, { mainTopics: ['Joan visit', 'gardening'] })],
        forgotten,
      }),
      NOW
    );
    const names = m.people.value.map((p) => p.name);
    expect(names).not.toContain('Joan');
    expect(names).not.toContain('Dana'); // marked forgotten in storage
    expect(names).toContain('Walt');
    expect(JSON.stringify(m)).not.toMatch(/joan/i);
  });
});

describe('topics', () => {
  // calls[0] is the newest. "garden" in 4 of the last 10; "move" only in 6-9; "taxes" new.
  const topics = [
    ['garden', 'taxes'],
    ['garden'],
    ['work'],
    ['garden', 'work'],
    ['garden'],
    ['move'],
    ['move', 'work'],
    ['move'],
    ['move'],
    [],
  ];
  const summaries = topics.map((t, k) => summary(k + 1, { mainTopics: t }));

  it('counts recurring, new and fading topics across calls', () => {
    const t = buildPersonModel(inputs({ summaries }), NOW).topics.value;
    expect(t.recurring).toEqual([
      { label: 'garden', calls: 4 },
      { label: 'move', calls: 4 },
      { label: 'work', calls: 3 },
    ]);
    expect(t.new).toEqual(['taxes']);
    expect(t.fading).toEqual(['move']);
  });

  it('folds topic_patterns into its own call', () => {
    const t = buildPersonModel(
      inputs({
        summaries: summaries.slice(0, 3),
        topicPatterns: [{ sessionId: 'sess-1', topics: ['Piano'], dominantTopic: 'Piano' }],
      }),
      NOW
    ).topics.value;
    expect(t.new).toContain('piano');
  });
});

describe('privacy', () => {
  it('fails closed when the forgotten topics could not be read', async () => {
    const m = buildPersonModel(
      inputs({
        facts: await recalled(ONE_FACT_BOOK),
        summaries: [summary(1, { mainTopics: ['garden'] }), summary(2), summary(3)],
        forgotten: null,
      }),
      NOW
    );
    expect(m.people.value).toEqual([]);
    expect(m.topics.value).toEqual({ recurring: [], new: [], fading: [] });
    expect(m.unfinished.value).toEqual({ openLoops: [], upcomingDates: [], ferniOwes: [] });
  });

  it('keeps phone numbers and emails out of the doc', () => {
    const m = buildPersonModel(
      inputs({
        summaries: [
          summary(1, { mainTopics: ['call Sam at 415-555-0134', 'sam@example.com', 'piano'] }),
          summary(2),
          summary(3),
        ],
        relationshipNetwork: [{ name: 'Sam (555) 010 9999', aliases: [] }],
      }),
      NOW
    );
    expect(m.topics.value.new).toEqual(['piano']);
    expect(JSON.stringify(m)).not.toMatch(/@|555/);
  });

  it('recognises contact data, and not ordinary numbers', () => {
    expect(hasContactData('415-555-0134')).toBe(true);
    expect(hasContactData('+1 (415) 555 0134')).toBe(true);
    expect(hasContactData('me@x.io')).toBe(true);
    expect(hasContactData('ran 5k in 2026')).toBe(false);
  });
});

describe('the document', () => {
  it('carries version, idempotency key, forget generation and per-section provenance', () => {
    const m = buildPersonModel(
      inputs({ summaries: [summary(1), summary(4)], forgetGeneration: 3 }),
      NOW
    );
    expect(m.v).toBe(PERSON_MODEL_VERSION);
    expect(m.throughSessionId).toBe('sess-1');
    expect(m.forgetGeneration).toBe(3);
    expect(m.rendered).toBe('');
    expect(m.topics.prov).toMatchObject({ builtAt: NOW.toISOString(), method: 'code' });
    // LLM sections are not built here: dirty, so readers derive them live.
    expect(m.mood.prov.builtAt).toBeNull();
    expect(m.changed.prov.builtAt).toBeNull();
  });
});

describe('freshness', () => {
  const built = (h: number) => ({
    builtAt: new Date(NOW.getTime() - h * 3_600_000).toISOString(),
    sources: [],
    method: 'code' as const,
    inputDocs: 0,
  });
  it('is fresh for 36 hours, then for a week only while they have not called', () => {
    expect(freshness(built(10), NOW)).toBe('fresh');
    expect(freshness(built(48), NOW)).toBe('fresh');
    expect(freshness(built(48), NOW, ago(1))).toBe('stale');
    expect(freshness(built(8 * 24), NOW)).toBe('stale');
    expect(freshness({ ...built(1), builtAt: null }, NOW)).toBe('dirty');
  });
});
