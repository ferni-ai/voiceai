/**
 * FACTS_DUAL_WRITE through deep extraction (the dynamic_facts writer): with the flag on
 * for a person, each fact written to dynamic_facts is proposed to the memory writer
 * (supersession labelled); off, the facts store gets nothing; a writer that throws never
 * stops the dynamic_facts write. Owner-first: a person's own value beats the env.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  fake: null as null | { db: unknown; docs: Map<string, Record<string, unknown>> },
  throwOnPropose: false,
}));

vi.mock('../../../utils/safe-logger.js', () => {
  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  return { createLogger: () => logger, getLogger: () => logger };
});
vi.mock('../async-events-config.js', () => ({ safeOnEvent: () => () => undefined }));
vi.mock('../../firestore-vector-store/index.js', () => ({
  getFirestoreVectorStore: () => ({
    initialize: async () => undefined,
    addDocuments: async (docs: unknown[]) => docs.map((_, i) => `v${i}`),
  }),
}));
vi.mock('../../../utils/firestore-utils.js', async (importActual) => {
  const actual = await importActual<typeof import('../../../utils/firestore-utils.js')>();
  // The fake database, plus a batch that writes into it as Firestore's would.
  const db = () => {
    const fake = h.fake as { db: Record<string, unknown>; docs: Map<string, unknown> };
    return Object.assign(Object.create(fake.db), {
      batch: () => {
        const writes: Array<[string, unknown]> = [];
        return {
          set: (ref: { path: string }, data: unknown) => void writes.push([ref.path, data]),
          commit: async () => writes.forEach(([p, d]) => fake.docs.set(p, d)),
        };
      },
    });
  };
  return { ...actual, getFirestoreDb: db, cleanForFirestore: <T>(o: T) => o };
});
vi.mock('../../writer/memory-writer.js', async (importActual) => {
  const actual = await importActual<typeof import('../../writer/memory-writer.js')>();
  return {
    ...actual,
    proposeFact: (...args: Parameters<typeof actual.proposeFact>) => {
      if (h.throwOnPropose) throw new Error('writer down');
      return actual.proposeFact(...args);
    },
  };
});

import { fakeFirestore } from '../../../services/stores/__tests__/fake-firestore.js';
import { usePersonFlagLookup } from '../../../config/person-flag.js';
import { DeepExtractionWorker, type ExtractedFact } from '../deep-extraction-worker.js';
import { mapDynamicFact } from '../../writer/facts-dual-write.js';

const fact = (entityName: string, key: string, value: string, factType = 'attribute') =>
  ({ entityName, factType, key, value, confidence: 0.9 }) as ExtractedFact;
const RUN_1 = [
  fact('User', 'city', 'Tampa'),
  fact('User', 'pet', 'a beagle named Biscuit'),
  fact('Mindy', 'health', 'knee surgery recovery', 'state'),
  fact('User', 'phone', 'ask the front desk'), // contact attribute: never a facts write
  fact('User', 'dentist', 'next Tuesday', 'event'), // an event: the ledger's
];
const RUN_2 = [fact('User', 'city', 'St. Petersburg')];

type Rel = { source: string; target: string; type: string };
// prettier-ignore
async function extract(userId: string, facts: ExtractedFact[], sessionId: string, rels: Rel[] = []) {
  const worker = new DeepExtractionWorker({ batchTurns: 1 });
  // prettier-ignore
  await worker['persistExtraction'](userId,
    { entities: [], facts, relationships: rels.map((r) => ({ ...r, strength: 1, bidirectional: false })), categories: [], importanceScore: 0.9, shouldPersist: true },
    { jobId: `job-${sessionId}`, userId, sessionId, turnNumber: 1, transcript: 'x',
      timestamp: new Date('2026-10-30T12:00:00Z'), priority: 'normal' as const,
      fastCaptureHints: { mentionedEntities: [], emotionSignals: [], topicHints: [],
        dateSignals: [], relationshipSignals: [] } });
}
const docsIn = (userId: string, coll: string) =>
  [...(h.fake?.docs.entries() ?? [])]
    .filter(([p]) => p.startsWith(`bogle_users/${userId}/${coll}/`))
    .map(([, d]) => d);
const fresh = () => {
  h.fake = fakeFirestore() as typeof h.fake;
};

afterEach(() => {
  vi.unstubAllEnvs();
  usePersonFlagLookup(async () => undefined);
  h.throwOnPropose = false;
});

describe('deep extraction dual-write', () => {
  it('flag on: each written fact is proposed, the old city kept and labelled', async () => {
    fresh();
    vi.stubEnv('FACTS_DUAL_WRITE', 'on');
    vi.stubEnv('MEMORY_FACTS', 'on');
    expect(docsIn('u1', 'facts')).toEqual([]);
    await extract('u1', RUN_1, 'call-1');
    await extract('u1', RUN_2, 'call-2');

    expect(docsIn('u1', 'dynamic_facts')).toHaveLength(6); // legacy unchanged
    const facts = docsIn('u1', 'facts');
    expect(facts.map((d) => `${d.subjectId}|${d.attribute}|${d.value}`).sort()).toEqual([
      'entity:mindy|health_note|knee surgery recovery',
      'self|city|St. Petersburg',
      'self|city|Tampa',
      'self|pet|a beagle named Biscuit',
    ]);
    const tampa = facts.find((d) => d.value === 'Tampa');
    expect(tampa).toMatchObject({ source: 'dynamic_facts', sourceEpisodeId: 'call-1' });
    expect(tampa?.supersededBy).toEqual(expect.any(String));
    expect(tampa?.retiredAt).not.toBeNull();
    expect(facts.find((d) => d.value === 'St. Petersburg')).toMatchObject({ retiredAt: null });
    expect(facts.find((d) => d.attribute === 'health_note')).toMatchObject({ sensitive: true });
  });

  it('flag off: dynamic_facts are written, the facts store gets nothing', async () => {
    for (const env of [{}, { MEMORY_FACTS: 'on' }, { FACTS_DUAL_WRITE: 'on' }]) {
      fresh();
      for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
      await extract('u1', RUN_1, 'call-1');
      expect(docsIn('u1', 'dynamic_facts')).toHaveLength(5);
      expect(docsIn('u1', 'facts'), JSON.stringify(env)).toEqual([]);
      vi.unstubAllEnvs();
    }
  });

  it('owner-first: on for one person by their own value, with the env off', async () => {
    fresh();
    usePersonFlagLookup(async (uid) => (uid === 'owner-1' ? 'on' : undefined));
    await extract('owner-1', RUN_2, 'call-1');
    await extract('u2', RUN_2, 'call-1');
    expect(docsIn('owner-1', 'facts')).toHaveLength(1);
    expect(docsIn('u2', 'facts')).toEqual([]);
    expect(docsIn('u2', 'dynamic_facts')).toHaveLength(1);
  });

  it("Ferni's own life stays in dynamic_facts only; nothing extracted is user_said", async () => {
    fresh();
    vi.stubEnv('FACTS_DUAL_WRITE', 'on');
    vi.stubEnv('MEMORY_FACTS', 'on');
    // prettier-ignore
    await extract('u1', [fact('Ferni', 'hometown', 'Portland'), fact('Maya', 'pet', 'a parrot'),
      fact('User', 'city', 'Tampa')], 'call-1');
    expect(docsIn('u1', 'dynamic_facts')).toHaveLength(3); // legacy unchanged
    const facts = docsIn('u1', 'facts');
    expect(facts.map((d) => `${d.subjectId}|${d.value}`)).toEqual(['self|Tampa']);
    expect(facts.map((d) => d.provenance)).toEqual(['inferred']);
  });

  it('a teammate name the caller relates to is stored: "my friend Maya is moving to Denver"', async () => {
    fresh();
    vi.stubEnv('FACTS_DUAL_WRITE', 'on');
    vi.stubEnv('MEMORY_FACTS', 'on');
    // prettier-ignore
    await extract('u1', [fact('Maya', 'city', 'Denver'), fact('Peter', 'goal', 'run a marathon')], 'call-1',
      [{ source: 'User', target: 'Maya', type: 'friend' }]);
    const facts = docsIn('u1', 'facts');
    expect(facts.map((d) => `${d.subjectId}|${d.value}`)).toEqual(['entity:maya|Denver']); // Peter: no relation
  });

  it('a writer that throws never stops the dynamic_facts write', async () => {
    fresh();
    vi.stubEnv('FACTS_DUAL_WRITE', 'on');
    vi.stubEnv('MEMORY_FACTS', 'on');
    h.throwOnPropose = true;
    await extract('u1', RUN_1, 'call-1');
    expect(docsIn('u1', 'dynamic_facts').map((d) => d.value)).toContain('Tampa');
    expect(docsIn('u1', 'facts')).toEqual([]);
  });
});

describe('mapDynamicFact', () => {
  const doc = (o: Record<string, unknown>) => ({ entityName: 'User', factType: 'attribute', ...o });
  it('maps each shape to one explicit op', () => {
    expect(mapDynamicFact(doc({ key: 'Lives In', value: 'Tampa' }), 's1', 'f1')).toMatchObject({
      op: 'update',
      proposal: { subjectId: 'self', attribute: 'city', sourceKey: 's1:f1' },
    });
    expect(mapDynamicFact(doc({ key: 'pet', value: 'a cat' }), 's1', 'f1').op).toBe('add');
    expect(
      mapDynamicFact(doc({ key: 'coffee', value: 'oat latte', factType: 'preference' }), 's', 'f')
    ).toMatchObject({ op: 'add', proposal: { attribute: 'preference' } });
    expect(mapDynamicFact(doc({ key: 'favorite_team', value: 'Rays' }), 's', 'f')).toMatchObject({
      op: 'add',
      proposal: { attribute: 'other', value: 'favorite team: Rays' },
    });
    expect(
      mapDynamicFact(doc({ entityName: 'José', key: 'relation', value: 'brother' }), 's', 'f')
    ).toMatchObject({
      op: 'update',
      proposal: { subjectId: 'entity:jose', attribute: 'relation' },
    });
    for (const key of ['email', 'phone_number', 'address'])
      expect(mapDynamicFact(doc({ key, value: 'x' }), 's', 'f')).toEqual({
        op: 'noop',
        reason: 'contact',
      });
    expect(mapDynamicFact(doc({ key: 'trip', value: 'x', factType: 'event' }), 's', 'f')).toEqual({
      op: 'noop',
      reason: 'event',
    });
    expect(mapDynamicFact(doc({ key: '', value: 'x' }), 's', 'f')).toEqual({
      op: 'noop',
      reason: 'shape',
    });
  });
});
