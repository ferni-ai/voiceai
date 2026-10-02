import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteAllDerived, deleteDerivedFor, deletePersonProfile } from '../deletion.js';
import { createFirestoreInsightsStore, type FirestoreLike } from '../firestore-store.js';
import {
  registerBoundariesPort,
  registerImportantDatesPort,
  resetIntegrationPorts,
} from '../integrations.js';
import { createPersonRecall, getPersonContext } from '../person-context.js';
import {
  getPeople,
  getPeopleForApi,
  getPerson,
  invalidatePersonalInsightsCache,
  loadSessionInsights,
  onConversationSummarized,
  refreshPersonalInsights,
} from '../pipeline.js';
import { FakeFirestore, MemoryStore, NOW, fact, sources, summary } from './fixtures.js';

const UID = 'user-1';

function familySources() {
  return sources({
    facts: [
      fact('Mom', 'name', 'Linda', { id: 'f_mom', conversationIds: ['c1'] }),
      fact('Linda', 'birthday', 'October 5', { id: 'f_bday', conversationIds: ['c1'] }),
      fact('user', 'partner', 'Sam', { id: 'f_sam', conversationIds: ['c2'] }),
    ],
    summaries: [
      summary('c1', 9, {
        mainTopics: ['Marathon training'],
        followUps: ["Check on mom's surgery next week"],
      }),
      summary('c2', 5, {
        mainTopics: ['Marathon training', 'Ex drama'],
        keyPoints: ['Sam is supportive'],
      }),
      summary('c3', 2, {
        mainTopics: ['Marathon training'],
        followUps: ['Ask how the long run felt'],
      }),
    ],
  });
}

beforeEach(() => {
  resetIntegrationPorts();
  registerImportantDatesPort(null);
  registerBoundariesPort(null);
  invalidatePersonalInsightsCache();
});
afterEach(() => {
  resetIntegrationPorts();
  delete process.env.PERSONAL_INSIGHTS;
});

describe('pipeline precompute', () => {
  it('builds people, threads, predictions and a grounded bundle with the LLM mocked', async () => {
    const store = new MemoryStore(familySources());
    const llm = vi
      .fn()
      .mockResolvedValue(
        '{"insights":[],"openers":[{"text":"How is the marathon training going?","evidence":["E1","E2","E3","E4","E5"]}]}'
      );
    const result = await refreshPersonalInsights(UID, { store, llm, now: () => NOW });
    expect(result).toMatchObject({ people: 2 });
    const bundle = store.bundle!;
    expect(bundle.predictions.length).toBeGreaterThan(0);
    expect(bundle.upcomingDates[0]).toMatchObject({ title: "Linda's birthday", daysAway: 3 });
    expect(bundle.people[0].name).toBe('Linda');
    expect(bundle.sourceConversationIds).toEqual(expect.arrayContaining(['c1']));
    expect((await getPerson(UID, 'my mother', { store }))?.name).toBe('Linda');
    expect((await getPeopleForApi(UID, { store })).find((p) => p.name === 'Sam')).toMatchObject({
      relationship: 'partner',
    });
  });

  it('sends detected dates to the important-dates store and reads upcoming dates from it', async () => {
    const upsertImportantDate = vi.fn().mockResolvedValue(undefined);
    const getUpcomingDates = vi
      .fn()
      .mockResolvedValue([{ title: 'Anniversary', date: '--10-04', kind: 'anniversary' }]);
    registerImportantDatesPort({ upsertImportantDate, getUpcomingDates });
    const store = new MemoryStore(familySources());
    await refreshPersonalInsights(UID, { store, llm: null, now: () => NOW });
    expect(upsertImportantDate).toHaveBeenCalledWith(
      UID,
      expect.objectContaining({
        kind: 'birthday',
        date: '--10-05',
        source: 'detected',
        sourceConversationIds: ['c1'],
      })
    );
    expect(store.bundle!.upcomingDates).toEqual([
      expect.objectContaining({ title: 'Anniversary', daysAway: 2 }),
    ]);
  });

  it('treats proactive boundaries as hard filters', async () => {
    registerBoundariesPort({
      isTopicAllowedProactively: async (_u, topic) => !/ex drama|marathon/i.test(topic),
    });
    const store = new MemoryStore(familySources());
    await refreshPersonalInsights(UID, { store, llm: null, now: () => NOW });
    const text = JSON.stringify([
      store.bundle!.predictions,
      store.bundle!.openers,
      store.bundle!.insights,
    ]);
    expect(text).not.toMatch(/marathon|ex drama/i);
  });

  it('scores the previous predictions after a conversation and stores the outcome', async () => {
    const store = new MemoryStore(familySources());
    await refreshPersonalInsights(UID, { store, llm: null, now: () => NOW });
    await onConversationSummarized(
      UID,
      'c4',
      'Talked about marathon training and new shoes',
      [{ role: 'user', text: 'my knee hurts from the run' }],
      { store, llm: null, now: () => NOW + 1000 }
    );
    const outcome = store.outcomes.get('c4')!;
    expect(outcome.total).toBeGreaterThan(0);
    expect(outcome.items.find((i) => i.label === 'Marathon training')?.hit).toBe(true);
    expect(outcome.sourceConversationIds).toEqual(['c4']);
  });

  it('honours the kill switch', async () => {
    process.env.PERSONAL_INSIGHTS = 'off';
    const store = new MemoryStore(familySources());
    expect(await refreshPersonalInsights(UID, { store, now: () => NOW })).toBeNull();
    expect(await loadSessionInsights(UID, { store })).toBeNull();
    expect(store.bundle).toBeNull();
  });
});

describe('deletion hooks', () => {
  it('deleteDerivedFor removes derived docs citing a conversation and recomputes without it', async () => {
    const src = familySources();
    const store = new MemoryStore(src);
    await refreshPersonalInsights(UID, { store, llm: null, now: () => NOW });
    expect([...store.people.values()].some((p) => p.name === 'Sam')).toBe(true);

    // C deletes conversation c2's sources first, then calls the hook.
    store.src = {
      ...src,
      facts: src.facts.filter((f) => !f.conversationIds.includes('c2')),
      summaries: src.summaries.filter((s) => s.conversationId !== 'c2'),
    };
    const counts = await deleteDerivedFor(UID, 'c2', { store, llm: null, now: () => NOW });
    expect(counts.people_profiles).toBeGreaterThan(0);
    const all = JSON.stringify([...store.people.values(), ...store.threads.values(), store.bundle]);
    expect(all).not.toContain('"c2"');
    expect(all).not.toContain('Sam');
    expect([...store.people.values()].map((p) => p.name)).toEqual(['Linda']);
  });

  it('deleteAllDerived wipes everything derived', async () => {
    const store = new MemoryStore(familySources());
    await refreshPersonalInsights(UID, { store, llm: null, now: () => NOW });
    await deleteAllDerived(UID, { store });
    expect(store.people.size + store.threads.size + store.outcomes.size).toBe(0);
    expect(store.bundle).toBeNull();
    expect(await getPeople(UID, { store })).toEqual([]);
  });

  it('deletePersonProfile tombstones the person so it is not rebuilt', async () => {
    const store = new MemoryStore(familySources());
    await refreshPersonalInsights(UID, { store, llm: null, now: () => NOW });
    const sam = [...store.people.values()].find((p) => p.name === 'Sam')!;
    const res = await deletePersonProfile(UID, sam.id, { store, llm: null, now: () => NOW });
    expect(res).toMatchObject({ deleted: true, sourceFactIds: ['f_sam'] });
    expect([...store.people.values()].some((p) => p.name === 'Sam')).toBe(false);
  });

  it('the Firestore store deletes by sourceConversationIds and wipes all collections', async () => {
    const db = new FakeFirestore();
    const base = `bogle_users/${UID}`;
    db.seed(`${base}/dynamic_facts/f1`, {
      entityName: 'Mom',
      key: 'name',
      value: 'Linda',
      sessionId: 'c1',
      extractedAt: new Date(NOW).toISOString(),
      confidence: 0.9,
    });
    db.seed(`${base}/dynamic_facts/f2`, {
      text: 'Sam is their partner',
      entityName: 'user',
      key: 'partner',
      value: 'Sam',
      sourceConversationIds: ['c2'],
      updatedAt: NOW,
    });
    db.seed(`${base}/summaries/s1`, {
      sessionId: 'c1',
      timestamp: NOW,
      mainTopics: ['Garden'],
      followUpItems: ["Ask about mom's garden"],
    });
    const store = createFirestoreInsightsStore(() => db as unknown as FirestoreLike);

    const src = await store.loadSources(UID);
    expect(src.facts.map((f) => f.conversationIds)).toEqual([['c1'], ['c2']]);
    expect(src.summaries[0].followUps).toEqual(["Ask about mom's garden"]);

    await refreshPersonalInsights(UID, { store, llm: null, now: () => NOW });
    const derived = () =>
      [...db.docs.keys()].filter((k) =>
        /people_profiles|life_threads|personal_insights|prediction_outcomes/.test(k)
      );
    expect(derived().length).toBeGreaterThanOrEqual(3);

    const counts = await store.deleteDerivedFor(UID, 'c2');
    expect(counts.people_profiles).toBe(1);
    expect(derived().some((k) => k.includes('people_profiles'))).toBe(true); // Linda (c1) stays

    await store.deleteAllDerived(UID);
    expect(derived()).toEqual([]);
    expect(db.docs.has(`${base}/dynamic_facts/f1`)).toBe(true); // sources untouched
  });
});

describe('per-turn person context', () => {
  it('surfaces a person once when mentioned, and respects boundaries', async () => {
    const store = new MemoryStore(familySources());
    await refreshPersonalInsights(UID, { store, llm: null, now: () => NOW });
    invalidatePersonalInsightsCache();

    const recall = createPersonRecall(UID, { store });
    await recall.ready;
    const note = recall.noteFor("I'm worried about my mom");
    expect(note).toMatch(/ABOUT LINDA/);
    expect(note).toMatch(/surgery/);
    expect(recall.noteFor('mom again')).toBeNull();
    expect(recall.noteFor('the weather is nice')).toBeNull();

    expect(await getPersonContext(UID, 'Sam', { store })).toMatch(/ABOUT SAM/);
    registerBoundariesPort({ isTopicAllowedProactively: async (_u, topic) => topic !== 'Sam' });
    expect(await getPersonContext(UID, 'Sam', { store })).toBeNull();
  });
});
