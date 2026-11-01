/**
 * FACTS_DUAL_WRITE through the world_facts ingest: with the flag on, the facts the ingest
 * wrote are proposed to the memory writer (supersession labelled); off, the facts store
 * gets nothing; a writer that throws never stops the world_facts write. Fictional people.
 */
import { describe, expect, it } from 'vitest';
import { fakeFirestore } from '../../../../services/stores/__tests__/fake-firestore.js';
import { mapWorldFact } from '../../../../memory/writer/facts-dual-write.js';
import { proposeFact } from '../../../../memory/writer/memory-writer.js';
import { recordWorldObservations, type IngestDeps } from '../ingest.js';
import { createMemoryWorldFactStore } from './memory-store.js';

const BASE = { WORLD_MODEL_TEMPORAL: 'on' };
const ALL_ON = { ...BASE, FACTS_DUAL_WRITE: 'on', MEMORY_FACTS: 'on' };
const obs = (o: Record<string, unknown>, day: string, sessionId: string) => ({
  subjectKind: 'self',
  subject: 'self',
  observedAt: `${day}T15:00:00.000Z`,
  confidence: 0.9,
  source: { kind: 'summary', sessionId },
  ...o,
});
const call1 = [
  obs({ attribute: 'location', value: 'Tampa', by: 'caller' }, '2026-09-01', 'call-1'),
  // prettier-ignore
  obs({ subject: 'Mindy', subjectKind: 'person', relation: 'sister', attribute: 'health',
    value: 'knee surgery recovery' }, '2026-09-01', 'call-1'),
  obs({ attribute: 'event', value: 'dentist', eventDate: '2026-09-09' }, '2026-09-01', 'call-1'),
  obs({ attribute: 'goal', value: 'call back', by: 'ferni' }, '2026-09-01', 'call-1'),
];
const call2 = [
  // prettier-ignore
  obs({ attribute: 'location', value: 'St. Petersburg', since: '2026-10-01',
    replaces: { attribute: 'location' } }, '2026-10-05', 'call-2'),
];

function setup(env: Record<string, string>, facts: IngestDeps['facts'] = {}) {
  const fake = fakeFirestore();
  fake.docs.set('bogle_users/u1', { displayName: 'Jo Rivera' });
  const store = createMemoryWorldFactStore();
  let n = 0;
  const deps: IngestDeps = {
    store,
    env,
    judge: async () => [],
    forgotten: async () => [],
    newId: () => `wf_${++n}`,
    facts: { getDb: () => fake.db, ...facts },
  };
  const facts_ = () =>
    [...fake.docs.entries()].filter(([p]) => p.startsWith('bogle_users/u1/facts/'));
  return { fake, store, deps, facts: facts_ };
}

describe('world_facts ingest dual-write', () => {
  it('flag on: the written facts land in the facts store, the old city kept and labelled', async () => {
    const { store, deps, facts } = setup(ALL_ON);
    expect(facts()).toEqual([]);
    await recordWorldObservations('u1', 'call-1', call1, deps);
    await recordWorldObservations('u1', 'call-2', call2, deps);

    const docs = facts().map(([, d]) => d);
    const byValue = (v: string) => docs.find((d) => d.value === v);
    expect(docs.map((d) => `${d.subjectId}|${d.attribute}|${d.value}`).sort()).toEqual([
      'person:mindy|health_note|knee surgery recovery',
      'person:mindy|relation|sister',
      'self|city|St. Petersburg',
      'self|city|Tampa',
    ]);
    const [newId] = facts().find(([, d]) => d.value === 'St. Petersburg') ?? [];
    expect(byValue('Tampa')).toMatchObject({
      source: 'world_facts',
      validTo: '2026-10-01T12:00:00.000Z',
      supersededBy: newId?.split('/').pop(),
    });
    expect(byValue('Tampa')?.retiredAt).not.toBeNull();
    expect(byValue('St. Petersburg')).toMatchObject({
      validFrom: '2026-10-01T12:00:00.000Z',
      validTo: null,
      sourceEpisodeId: 'call-2',
    });
    expect(byValue('knee surgery recovery')).toMatchObject({ sensitive: true });
    // the caller said Tampa; the rest was read off the call. Ferni's promise is not a fact.
    expect(byValue('Tampa')).toMatchObject({ provenance: 'user_said' });
    expect(byValue('St. Petersburg')).toMatchObject({ provenance: 'inferred' });
    expect(docs.some((d) => d.value === 'call back')).toBe(false);
    // the legacy store holds everything it held before, the event and Ferni's promise too
    expect(store.all('u1')).toHaveLength(5);
  });

  it('flag off: world_facts are written, the facts store gets nothing', async () => {
    for (const env of [
      BASE,
      { ...BASE, MEMORY_FACTS: 'on' },
      { ...BASE, FACTS_DUAL_WRITE: 'on' },
    ]) {
      const { store, deps, facts } = setup(env);
      const r = await recordWorldObservations('u1', 'call-1', call1, deps);
      expect(r?.created, JSON.stringify(env)).toBe(4);
      expect(store.all('u1')).toHaveLength(4);
      expect(facts(), JSON.stringify(env)).toEqual([]);
    }
  });

  it('a writer that throws (or rejects) never stops the legacy write', async () => {
    const boom = () => {
      throw new Error('writer down');
    };
    for (const propose of [boom, async () => boom()]) {
      const { store, deps, facts } = setup(ALL_ON, { propose: propose as never });
      const r = await recordWorldObservations('u1', 'call-1', call1, deps);
      expect(r).toEqual({ created: 4, closed: 0, refreshed: 0 });
      expect(store.all('u1').map((f) => f.value)).toContain('Tampa');
      expect(facts()).toEqual([]);
    }
  });
  it('a teammate name with a stated relation is stored; without one it is refused', async () => {
    const { deps, facts } = setup(ALL_ON);
    // prettier-ignore
    await recordWorldObservations('u1', 'call-1', [
      obs({ subject: 'Maya', subjectKind: 'person', relation: 'friend', attribute: 'location', value: 'Denver' }, '2026-10-01', 'call-1'),
      obs({ subject: 'Jordan', subjectKind: 'person', attribute: 'goal', value: 'loves hiking' }, '2026-10-01', 'call-1'),
    ], deps);
    expect(
      facts()
        .map(([, d]) => `${d.subjectId}|${d.attribute}|${d.value}`)
        .sort()
    ).toEqual(['person:maya|city|Denver', 'person:maya|relation|friend']);
  });

  it('one fact the writer rejects does not stop the others', async () => {
    const propose: typeof proposeFact = (db, uid, p, env) =>
      p.value === 'Tampa' ? Promise.reject(new Error('contention')) : proposeFact(db, uid, p, env);
    const { deps, facts } = setup(ALL_ON, { propose });
    await recordWorldObservations('u1', 'call-1', call1, deps);
    expect(
      facts()
        .map(([, d]) => d.value)
        .sort()
    ).toEqual(['knee surgery recovery', 'sister']);
  });
});

describe('mapWorldFact', () => {
  const fact = {
    id: 'wf_1',
    subject: 'self',
    subjectKind: 'self',
    attribute: 'location',
    value: 'Tampa',
    validFrom: '2026-09-01T15:00:00.000Z',
    validTo: null,
    observedAt: '2026-09-01T15:00:00.000Z',
    confidence: 0.9,
    source: { sessionId: 'call-1' },
  };
  it('maps each shape to one explicit op', () => {
    expect(mapWorldFact(fact)).toMatchObject([{ op: 'update', proposal: { attribute: 'city' } }]);
    expect(mapWorldFact({ ...fact, attribute: 'goal' })).toMatchObject([{ op: 'add' }]);
    expect(mapWorldFact({ ...fact, attribute: 'status', value: 'on leave' })).toMatchObject([
      { op: 'add', proposal: { attribute: 'other', value: 'status: on leave' } },
    ]);
    expect(mapWorldFact({ ...fact, attribute: 'commitment' })).toEqual([
      { op: 'noop', reason: 'event' },
    ]);
    expect(mapWorldFact({ ...fact, by: 'ferni' })).toEqual([{ op: 'noop', reason: 'ferni' }]);
    for (const closed of [{ validTo: fact.validFrom }, { wrong: true }, { forgottenAt: 'x' }])
      expect(mapWorldFact({ ...fact, ...closed })).toEqual([{ op: 'noop', reason: 'closed' }]);
    expect(mapWorldFact({ ...fact, subject: '李', subjectKind: 'person' })).toEqual([
      { op: 'noop', reason: 'subject' },
    ]);
  });
});
