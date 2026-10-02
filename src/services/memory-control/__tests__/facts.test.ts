/**
 * memory-control: facts, people, explicit facts, find, export, delete-all.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { factIdFor } from '../../../memory/dynamic/fact-identity.js';
import { FakeFirestore } from './fake-firestore.js';
import { FakeVectorStore } from './fake-vector-store.js';
import { base, OTHER, seedUser, UID } from './seed.js';

const h = vi.hoisted(() => ({ db: null as unknown, vectors: null as unknown }));

vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => h.db }));
vi.mock('../../../memory/firestore-vector-store.js', () => ({
  getFirestoreVectorStore: () => h.vectors,
}));

import {
  deleteAllMemories,
  deleteFact,
  deletePerson,
  editFact,
  exportMemories,
  findMemories,
  listMemories,
} from '../index.js';

let db: FakeFirestore;
let vectors: FakeVectorStore;

beforeEach(() => {
  db = new FakeFirestore();
  vectors = new FakeVectorStore();
  h.db = db;
  h.vectors = vectors;
  seedUser(db, vectors, UID);
  seedUser(db, vectors, OTHER);
});

describe('listMemories', () => {
  it('returns facts (incl. legacy and explicit) and people grouped by name', async () => {
    const result = await listMemories(UID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.value.facts.map((f) => f.id).sort();
    expect(ids).toEqual(['explicit_x1', 'f-both', 'f-edited', 'f-legacy', 'f-only-c1']);

    const legacy = result.value.facts.find((f) => f.id === 'f-legacy');
    expect(legacy).toMatchObject({
      text: 'Sarah · job: nurse',
      category: 'attribute',
      sourceConversationIds: ['sess-1'],
      userEdited: false,
    });

    const explicit = result.value.facts.find((f) => f.id === 'explicit_x1');
    expect(explicit).toMatchObject({ text: 'My favourite colour is green', userEdited: true });

    expect(result.value.people).toHaveLength(1);
    expect(result.value.people[0]).toMatchObject({
      id: 'p2',
      name: 'Sarah',
      relationship: 'sister',
      notes: 'Lives in Lisbon',
    });
    expect(result.value.updatedAt).toBe('2026-09-10T10:30:00.000Z');
  });

  it('is unavailable without Firestore', async () => {
    h.db = null;
    const result = await listMemories(UID);
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: 'unavailable' }) });
  });
});

describe('editFact', () => {
  it('sets text, userEdited and editedAt, and re-indexes the embedding', async () => {
    const result = await editFact(UID, 'f-only-c1', {
      text: 'Interview at Acme went well',
      category: 'work',
    });
    expect(result.ok && result.value).toMatchObject({
      text: 'Interview at Acme went well',
      category: 'work',
      userEdited: true,
    });
    const doc = db.get(`${base()}/dynamic_facts/f-only-c1`);
    expect(doc?.userEdited).toBe(true);
    expect(doc?.editedAt).toBeInstanceOf(Date);
    expect(doc?.sourceConversationIds).toEqual(['c1']);
    expect(vectors.docs.get('conversation_fact_f-only-c1')?.text).toBe(
      'Interview at Acme went well'
    );
  });

  it('edits explicit facts too', async () => {
    const result = await editFact(UID, 'explicit_x1', { text: 'My favourite colour is blue' });
    expect(result.ok && result.value.text).toBe('My favourite colour is blue');
    expect(db.get(`${base()}/extracted_facts/x1`)?.fact).toBe('My favourite colour is blue');
    expect(
      [...vectors.docs.values()].some(
        (d) => d.text === 'My favourite colour is green' && d.metadata.userId === UID
      )
    ).toBe(false);
  });

  it('rejects empty / too long text and unknown ids', async () => {
    expect(await editFact(UID, 'f-both', { text: '  ' })).toMatchObject({
      ok: false,
      error: { code: 'invalid' },
    });
    expect(await editFact(UID, 'f-both', { text: 'x'.repeat(501) })).toMatchObject({
      ok: false,
      error: { code: 'invalid' },
    });
    expect(await editFact(UID, 'nope', { text: 'hi' })).toMatchObject({
      ok: false,
      error: { code: 'not_found' },
    });
  });
});

describe('deleteFact', () => {
  it('deletes the doc, writes tombstones (doc id + deterministic key id) and removes embeddings', async () => {
    const result = await deleteFact(UID, 'f-legacy');
    expect(result).toEqual({ ok: true, value: { deleted: true } });
    expect(db.get(`${base()}/dynamic_facts/f-legacy`)).toBeUndefined();
    expect(db.get(`${base()}/memory_tombstones/f-legacy`)).toMatchObject({
      reason: 'user_deleted',
    });
    const keyId = factIdFor({ subject: 'Sarah', predicate: 'job' });
    expect(db.get(`${base()}/memory_tombstones/${keyId}`)).toMatchObject({
      reason: 'user_deleted',
    });
    // other user untouched
    expect(db.get(`${base(OTHER)}/dynamic_facts/f-legacy`)).toBeDefined();
  });

  it('removes the fact embedding', async () => {
    await deleteFact(UID, 'f-only-c1');
    expect(vectors.docs.has('conversation_fact_f-only-c1')).toBe(false);
  });

  it("never removes another user's vector that shares the same id", async () => {
    vectors.add({
      id: 'conversation_fact_f-both',
      text: 'x',
      metadata: { source: 'conversation', userId: OTHER },
    });
    await deleteFact(UID, 'f-both');
    expect(vectors.docs.has('conversation_fact_f-both')).toBe(true);
  });

  it('deletes explicit facts and their vectors', async () => {
    expect(await deleteFact(UID, 'explicit_x1')).toEqual({ ok: true, value: { deleted: true } });
    expect(db.get(`${base()}/extracted_facts/x1`)).toBeUndefined();
    expect(vectors.docs.has('fact_user-a_123')).toBe(false);
  });

  it('is not_found for unknown ids', async () => {
    expect(await deleteFact(UID, 'missing')).toMatchObject({
      ok: false,
      error: { code: 'not_found' },
    });
    expect(await deleteFact(UID, 'explicit_missing')).toMatchObject({
      ok: false,
      error: { code: 'not_found' },
    });
  });
});

describe('deletePerson', () => {
  it('removes every doc for the person, their relationships and facts about them', async () => {
    const result = await deletePerson(UID, 'p2');
    expect(result.ok).toBe(true);
    expect(db.get(`${base()}/dynamic_entities/p1`)).toBeUndefined();
    expect(db.get(`${base()}/dynamic_entities/p2`)).toBeUndefined();
    expect(db.get(`${base()}/dynamic_entities/place1`)).toBeDefined();
    expect(db.get(`${base()}/dynamic_relationships/r1`)).toBeUndefined();
    expect(db.get(`${base()}/dynamic_facts/f-legacy`)).toBeUndefined();
    expect(db.get(`${base()}/memory_tombstones/f-legacy`)).toBeDefined();
  });

  it('is not_found for non-person entities and unknown ids', async () => {
    expect(await deletePerson(UID, 'place1')).toMatchObject({
      ok: false,
      error: { code: 'not_found' },
    });
    expect(await deletePerson(UID, 'zzz')).toMatchObject({
      ok: false,
      error: { code: 'not_found' },
    });
  });
});

describe('findMemories', () => {
  it('finds people by name and facts by words', async () => {
    const people = await findMemories(UID, 'my sister Sarah');
    expect(people.ok && people.value[0]).toMatchObject({
      kind: 'person',
      id: 'p2',
      label: 'Sarah (sister)',
    });

    const facts = await findMemories(UID, 'the job interview');
    expect(facts.ok && facts.value.map((m) => m.id)).toEqual(
      expect.arrayContaining(['f-only-c1', 'c1'])
    );
  });

  it('returns nothing for stopword-only or unrelated queries', async () => {
    expect(await findMemories(UID, 'that thing')).toEqual({ ok: true, value: [] });
    expect(await findMemories(UID, 'quantum chromodynamics')).toEqual({ ok: true, value: [] });
  });
});

describe('exportMemories', () => {
  it('exports facts, people, conversations with full turns (both roles) and summaries as JSON', async () => {
    const result = await exportMemories(UID, 'json');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.contentType).toContain('application/json');
    expect(result.value.filename).toMatch(/^ferni-memories-\d{4}-\d{2}-\d{2}\.json$/);
    const data = JSON.parse(result.value.body);
    expect(data.facts).toHaveLength(5);
    expect(data.people).toHaveLength(1);
    const c1 = data.conversations.find(
      (c: { conversation: { id: string } }) => c.conversation.id === 'c1'
    );
    expect(c1.turns.map((t: { role: string }) => t.role)).toEqual(['user', 'assistant', 'user']);
    expect(c1.turns[1].text).toBe('That sounds exciting. How are you feeling?');
    expect(c1.summaries).toHaveLength(1);
    expect(data.summaries[0].timestamp).toBe('2026-09-01T10:30:00.000Z');
  });

  it('exports a multi-section CSV', async () => {
    const result = await exportMemories(UID, 'csv');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const body = result.value.body;
    for (const section of ['# facts', '# people', '# conversations', '# turns', '# summaries']) {
      expect(body).toContain(section);
    }
    expect(body).toContain(
      'c1,2,assistant,2026-09-01T10:02:00.000Z,That sounds exciting. How are you feeling?'
    );
  });
});

describe('deleteAllMemories', () => {
  it('wipes every memory collection but keeps the profile basics', async () => {
    const result = await deleteAllMemories(UID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.collections.conversations).toBe(2);
    expect(result.value.collections.dynamic_facts).toBe(4);
    expect(db.paths(`${base()}/`)).toEqual([]);
    const profile = db.get(base());
    expect(profile).toMatchObject({
      name: 'Ana',
      preferences: { verbosity: 'concise' },
      conversationSummaries: [],
      keyMoments: [],
    });
    expect(profile?.lastConversationSummary).toBeUndefined();
    expect(result.value.embeddings).toBe(3);
    expect([...vectors.docs.values()].filter((d) => d.metadata.userId === UID)).toHaveLength(0);
    // other user untouched
    expect(db.paths(`${base(OTHER)}/`).length).toBeGreaterThan(10);
    expect([...vectors.docs.values()].filter((d) => d.metadata.userId === OTHER)).toHaveLength(2);
  });

  it('refuses unsafe user ids', async () => {
    await expect(deleteAllMemories('')).rejects.toThrow();
    await expect(deleteAllMemories('a/b')).rejects.toThrow();
  });
});
