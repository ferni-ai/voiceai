/**
 * person-model-store: the loader reads what the build takes (facts through the recall
 * filter, forgotten topics and generation from the port, summaries newest first), and
 * the writer is idempotent on the input hash and rotates current into prev.
 * Every name and value here is invented.
 */
import { describe, expect, it } from 'vitest';
import { buildPersonModel, type PersonModel } from '../../../intelligence/person-model/index.js';
import { loadPersonModelInputs, readPersonModel, savePersonModel } from '../person-model-store.js';
import { fakeFirestore } from './fake-firestore.js';

const NOW = new Date('2026-10-30T12:00:00.000Z');
const U = 'u-test-1';
const at = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

function seeded() {
  const fake = fakeFirestore({ directions: true });
  const put = (path: string, data: Record<string, unknown>) => fake.docs.set(path, data);
  put(`bogle_users/${U}`, {
    preferences: { timezone: 'America/Chicago' },
    familyMembers: [{ name: 'Rowan', relationship: 'Brother' }],
  });
  put(`bogle_users/${U}/summaries/s1`, { sessionId: 'sess-old', timestamp: at(9) });
  put(`bogle_users/${U}/summaries/s2`, { sessionId: 'sess-new', timestamp: at(1) });
  put(`bogle_users/${U}/dynamic_facts/f1`, {
    ...{ entityName: 'Rowan', key: 'job', value: 'carpenter', confidence: 0.9 },
    extractedAt: at(2),
  });
  // Forgotten by the person: the recall filter drops it before the build sees it.
  put(`bogle_users/${U}/dynamic_facts/f2`, {
    ...{ entityName: 'Rowan', key: 'pet', value: 'iguana', confidence: 0.9 },
    ...{ extractedAt: at(3), forgottenAt: at(1) },
  });
  put(`bogle_users/${U}/memory_state/forgotten`, { topics: ['tax audit'], generation: 4 });
  put(`bogle_users/${U}/world_facts/w1`, { attribute: 'birthday' });
  return fake;
}

describe('loadPersonModelInputs', () => {
  it('reads every input the build takes, facts through the recall filter', async () => {
    const { db } = seeded();
    const i = await loadPersonModelInputs(db, U);
    expect(i).not.toBeNull();
    expect(i!.timezone).toBe('America/Chicago');
    expect(i!.summaries.map((s) => s.sessionId)).toEqual(['sess-new', 'sess-old']);
    expect(i!.facts.map((f) => `${f.entity}:${f.key}`)).toEqual(['Rowan:job']);
    expect(i!.forgotten).toEqual(['tax audit']);
    expect(i!.forgetGeneration).toBe(4);
    expect(i!.familyMembers).toEqual([{ name: 'Rowan', relationship: 'Brother' }]);
    expect(i!.worldFacts).toEqual([{ attribute: 'birthday' }]);
    expect(buildPersonModel(i!, NOW).throughSessionId).toBe('sess-new');
  });

  it('is null when the record is gone (erased), and refuses an id that names another path', async () => {
    const { db } = fakeFirestore();
    expect(await loadPersonModelInputs(db, U)).toBeNull();
    await expect(loadPersonModelInputs(db, 'u/../other')).rejects.toThrow(/invalid user id/);
  });
});

describe('savePersonModel', () => {
  const model = async (db: Parameters<typeof loadPersonModelInputs>[0]): Promise<PersonModel> =>
    buildPersonModel((await loadPersonModelInputs(db, U))!, NOW);

  it('writes current, then writes nothing for the same inputs, then rotates prev', async () => {
    const { db, docs, stats } = seeded();
    const m = await model(db);
    expect(docs.has(`bogle_users/${U}/person_model/current`)).toBe(false);

    expect(await savePersonModel(db, U, m, 'hash-a')).toBe('written');
    expect(docs.get(`bogle_users/${U}/person_model/current`)).toMatchObject({
      inputHash: 'hash-a',
    });
    expect(docs.has(`bogle_users/${U}/person_model/prev`)).toBe(false);
    expect((await readPersonModel(db, U))?.inputHash).toBe('hash-a');

    const before = stats.writes;
    expect(await savePersonModel(db, U, m, 'hash-a')).toBe('unchanged');
    expect(stats.writes).toBe(before);

    const next = { ...m, builtAt: '2026-10-31T07:15:00.000Z' };
    expect(await savePersonModel(db, U, next, 'hash-b')).toBe('written');
    expect(docs.get(`bogle_users/${U}/person_model/prev`)).toMatchObject({
      inputHash: 'hash-a',
      builtAt: m.builtAt,
    });
    expect(docs.get(`bogle_users/${U}/person_model/current`)).toMatchObject({
      inputHash: 'hash-b',
      builtAt: '2026-10-31T07:15:00.000Z',
    });
  });

  it('reads back nothing for a doc of another shape or another person', async () => {
    const { db, docs } = seeded();
    docs.set(`bogle_users/${U}/person_model/current`, { v: 99, userId: U, inputHash: 'x' });
    expect(await readPersonModel(db, U)).toBeNull();
    docs.set(`bogle_users/${U}/person_model/current`, { v: 1, userId: 'u-other', inputHash: 'x' });
    expect(await readPersonModel(db, U)).toBeNull();
  });
});
