import { beforeEach, describe, expect, it } from 'vitest';
import { entityIdFor, factIdForExtracted } from '../fact-identity.js';
import {
  upsertEntities,
  upsertFacts,
  upsertRelationships,
  type StorableFact,
} from '../fact-store.js';
import { FakeFirestore } from './helpers/fake-firestore.js';

const UID = 'user-1';
const FACTS = `bogle_users/${UID}/dynamic_facts`;
const breed: StorableFact = {
  entityName: 'Biscuit',
  factType: 'attribute',
  key: 'breed',
  value: 'golden retriever',
  confidence: 0.8,
};
const prov = (conversationId?: string) => ({ conversationId, sessionId: 's1', turnNumber: 3 });

let db: FakeFirestore;
beforeEach(() => {
  db = new FakeFirestore();
});

describe('upsertFacts', () => {
  it('writes the contract fields under the deterministic id', async () => {
    const summary = await upsertFacts(db, UID, [breed], prov('conv-a'));
    const id = factIdForExtracted(breed);
    const doc = db.get(`${FACTS}/${id}`);
    expect(summary.created).toBe(1);
    expect(summary.writtenIds).toEqual([id]);
    expect(doc).toMatchObject({
      text: 'Biscuit: breed is golden retriever',
      category: 'personal',
      confidence: 0.8,
      sourceConversationIds: ['conv-a'],
      userEdited: false,
      entityName: 'Biscuit',
      key: 'breed',
      value: 'golden retriever',
      syncedToSpanner: false,
    });
    expect(doc?.firstSeenAt).toBeInstanceOf(Date);
    expect(doc?.updatedAt).toBeInstanceOf(Date);
  });

  it('re-learning the same fact merges into one doc and unions provenance', async () => {
    await upsertFacts(db, UID, [breed], prov('conv-a'));
    const first = db.get(`${FACTS}/${factIdForExtracted(breed)}`);
    await upsertFacts(
      db,
      UID,
      [{ ...breed, entityName: 'biscuit', confidence: 0.7 }],
      prov('conv-b')
    );
    await upsertFacts(db, UID, [breed], prov('conv-b'));

    const docs = db.list(FACTS);
    expect(docs).toHaveLength(1);
    const doc = docs[0].data;
    expect(doc.sourceConversationIds).toEqual(['conv-a', 'conv-b']);
    expect(doc.firstSeenAt).toEqual(first?.firstSeenAt);
    // Hearing it again reinforces confidence.
    expect(doc.confidence as number).toBeGreaterThan(0.8);
  });

  it('a new value for a single-valued fact replaces the old one', async () => {
    const city = {
      entityName: 'user',
      factType: 'attribute',
      key: 'lives_in',
      value: 'Austin',
      confidence: 0.9,
    };
    await upsertFacts(db, UID, [city], prov('c1'));
    await upsertFacts(db, UID, [{ ...city, value: 'Denver', confidence: 0.6 }], prov('c2'));
    const docs = db.list(FACTS);
    expect(docs).toHaveLength(1);
    expect(docs[0].data).toMatchObject({
      value: 'Denver',
      confidence: 0.6,
      text: 'User: lives in is Denver',
    });
  });

  it('dedupes the same fact twice in one extraction', async () => {
    const summary = await upsertFacts(db, UID, [breed, { ...breed, confidence: 0.95 }], prov('c1'));
    expect(summary.created).toBe(1);
    expect(db.list(FACTS)[0].data.confidence).toBe(0.95);
  });

  it('never rewrites a user-edited fact, but records the new conversation', async () => {
    const id = factIdForExtracted(breed);
    db.docs.set(`${FACTS}/${id}`, {
      text: 'Biscuit is a goldendoodle, not a retriever',
      category: 'pets',
      confidence: 1,
      userEdited: true,
      sourceConversationIds: ['conv-a'],
      key: 'breed',
      value: 'goldendoodle',
    });
    const summary = await upsertFacts(db, UID, [breed], prov('conv-b'));
    expect(summary.provenanceOnly).toBe(1);
    expect(db.get(`${FACTS}/${id}`)).toEqual({
      text: 'Biscuit is a goldendoodle, not a retriever',
      category: 'pets',
      confidence: 1,
      userEdited: true,
      sourceConversationIds: ['conv-a', 'conv-b'],
      key: 'breed',
      value: 'goldendoodle',
    });

    // Same conversation again: nothing to change at all.
    const before = db.writes;
    expect((await upsertFacts(db, UID, [breed], prov('conv-b'))).unchanged).toBe(1);
    expect(db.writes).toBe(before);
  });

  it('skips facts the user deleted (tombstoned)', async () => {
    const id = factIdForExtracted(breed);
    db.docs.set(`bogle_users/${UID}/memory_tombstones/${id}`, {
      createdAt: new Date(),
      reason: 'user_deleted',
    });
    const summary = await upsertFacts(db, UID, [breed], prov('conv-c'));
    expect(summary.tombstoned).toBe(1);
    expect(db.list(FACTS)).toHaveLength(0);
  });

  it('works without a conversation id (provenance stays empty)', async () => {
    await upsertFacts(db, UID, [breed], prov(undefined));
    expect(db.list(FACTS)[0].data.sourceConversationIds).toEqual([]);
  });

  it('ignores malformed facts', async () => {
    const bad = [
      { ...breed, key: '' },
      { ...breed, entityName: '' },
    ] as StorableFact[];
    expect((await upsertFacts(db, UID, bad, prov('c'))).created).toBe(0);
  });
});

describe('upsertEntities / upsertRelationships', () => {
  it('merges entity attributes and counts mentions under one id', async () => {
    const mom = { name: 'Mom', type: 'person', attributes: { city: 'Tulsa' }, confidence: 0.7 };
    await upsertEntities(db, UID, [mom], prov('c1'));
    await upsertEntities(
      db,
      UID,
      [{ ...mom, name: 'mom', attributes: { job: 'teacher' }, confidence: 0.9 }],
      prov('c2')
    );
    const docs = db.list(`bogle_users/${UID}/dynamic_entities`);
    expect(docs).toHaveLength(1);
    expect(docs[0].id).toBe(entityIdFor('Mom', 'person'));
    expect(docs[0].data).toMatchObject({
      name: 'Mom',
      attributes: { city: 'Tulsa', job: 'teacher' },
      confidence: 0.9,
      mentionCount: 2,
      sourceConversationIds: ['c1', 'c2'],
    });
  });

  it('keeps the edge source entity (it is not overwritten by provenance)', async () => {
    const rel = {
      source: 'Sam',
      target: 'Alex',
      type: 'friend',
      strength: 0.6,
      bidirectional: true,
    };
    await upsertRelationships(db, UID, [rel], prov('c1'));
    await upsertRelationships(db, UID, [{ ...rel, source: 'Alex', target: 'Sam' }], prov('c1'));
    const docs = db.list(`bogle_users/${UID}/dynamic_relationships`);
    expect(docs).toHaveLength(1);
    expect(docs[0].data.origin).toBe('deep_extraction');
    expect(['Sam', 'Alex']).toContain(docs[0].data.source);
    expect(['Sam', 'Alex']).toContain(docs[0].data.target);
  });
});
