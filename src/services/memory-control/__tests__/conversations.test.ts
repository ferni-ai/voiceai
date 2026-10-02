/**
 * memory-control: conversation listing, transcripts and the delete cascade.
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
  deleteConversation,
  findLatestConversation,
  getConversation,
  listConversations,
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

describe('listConversations', () => {
  it('lists newest first with cursor pagination', async () => {
    const first = await listConversations(UID, { limit: 1 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.conversations).toEqual([
      {
        id: 'c2',
        startedAt: '2026-09-10T10:00:00.000Z',
        endedAt: '2026-09-10T10:20:00.000Z',
        personaId: 'maya',
        summary: 'Morning run habit',
        turnCount: 1,
      },
    ]);
    expect(first.value.nextCursor).toBe('c2');

    const second = await listConversations(UID, { limit: 1, cursor: 'c2' });
    expect(second.ok && second.value.conversations.map((c) => c.id)).toEqual(['c1']);
    expect(second.ok && second.value.nextCursor).toBeUndefined();
  });

  it('rejects an unknown cursor', async () => {
    expect(await listConversations(UID, { cursor: 'nope' })).toMatchObject({
      ok: false,
      error: { code: 'invalid' },
    });
  });
});

describe('getConversation', () => {
  it('returns all turns in order, both roles, reading legacy `content`', async () => {
    const result = await getConversation(UID, 'c1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.turns).toEqual([
      {
        role: 'user',
        text: 'I have a job interview at Acme',
        timestamp: '2026-09-01T10:01:00.000Z',
      },
      {
        role: 'assistant',
        text: 'That sounds exciting. How are you feeling?',
        timestamp: '2026-09-01T10:02:00.000Z',
      },
      { role: 'user', text: 'Nervous!', timestamp: '2026-09-01T10:03:00.000Z' },
    ]);
    expect(result.value.conversation.summary).toBe('Job interview nerves at Acme');
  });

  it('is not_found for another user’s or a missing conversation', async () => {
    db.seed(`${base(OTHER)}/conversations/only-b`, { startedAt: new Date() });
    expect(await getConversation(UID, 'only-b')).toMatchObject({
      ok: false,
      error: { code: 'not_found' },
    });
  });
});

describe('deleteConversation cascade', () => {
  it('deletes turns, summary + embedding, history, thread and applies provenance rules', async () => {
    const result = await deleteConversation(UID, 'c1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // f-only-c1 and f-legacy (sessionId sess-1) lose their only source → deleted
    expect(result.value.deleted).toEqual({ turns: 3, facts: 2, embeddings: 2 });

    const u = base();
    expect(db.get(`${u}/conversations/c1`)).toBeUndefined();
    expect(db.paths(`${u}/conversations/c1/`)).toEqual([]);
    expect(db.get(`${u}/summaries/s1-${UID}`)).toBeUndefined();
    expect(vectors.docs.has(`conversation_s1-${UID}`)).toBe(false);
    expect(vectors.docs.has('conversation_fact_f-only-c1')).toBe(false);
    expect(db.get(`${u}/extraction_history/j1`)).toBeUndefined();
    expect(db.get(`${u}/conversation_threads/th1`)).toBeUndefined();
    expect(db.get(`${u}/conversation_threads/th1/messages/m1`)).toBeUndefined();
    expect(db.get(`${u}/conversation_threads/th2/messages/m1`)).toBeDefined();

    // last source gone + not edited → deleted and tombstoned
    expect(db.get(`${u}/dynamic_facts/f-only-c1`)).toBeUndefined();
    expect(db.get(`${u}/memory_tombstones/f-only-c1`)).toMatchObject({ reason: 'user_deleted' });
    expect(
      db.get(`${u}/memory_tombstones/${factIdFor({ subject: 'Sarah', predicate: 'job' })}`)
    ).toBeDefined();
    // other source remains → only the id is removed
    expect(db.get(`${u}/dynamic_facts/f-both`)?.sourceConversationIds).toEqual(['c2']);
    // user-edited facts survive with empty provenance
    expect(db.get(`${u}/dynamic_facts/f-edited`)).toMatchObject({
      userEdited: true,
      sourceConversationIds: [],
    });
    expect(db.get(`${u}/memory_tombstones/f-edited`)).toBeUndefined();
    // explicit "remember that" facts survive
    expect(db.get(`${u}/extracted_facts/x1`)).toBeDefined();
    // entities carrying this conversation's provenance go; others stay
    expect(db.get(`${u}/dynamic_entities/e-c1`)).toBeUndefined();
    expect(db.get(`${u}/dynamic_entities/p1`)).toBeDefined();
    // the profile's embedded copy of this summary is scrubbed
    const profile = db.get(u);
    expect(profile?.conversationSummaries).toEqual([
      { id: 's-old', sessionId: 'sess-old', keyPoints: ['old'] },
    ]);
    expect(profile?.lastConversationSummary).toBeUndefined();
    // the other conversation and other user are untouched
    expect(db.get(`${u}/conversations/c2/turns/t1`)).toBeDefined();
    expect(db.get(`${base(OTHER)}/conversations/c1/turns/t1`)).toBeDefined();
    expect(db.get(`${base(OTHER)}/dynamic_facts/f-only-c1`)).toBeDefined();
  });

  it('is not_found for an unknown conversation', async () => {
    expect(await deleteConversation(UID, 'zzz')).toMatchObject({
      ok: false,
      error: { code: 'not_found' },
    });
  });
});

describe('findLatestConversation', () => {
  it('prefers the newest finished conversation and skips the live one', async () => {
    db.seed(`${base()}/conversations/live`, { startedAt: new Date('2026-09-20T10:00:00Z') });
    expect((await findLatestConversation(UID))?.id).toBe('c2');
  });

  it('never picks the live call when nothing has ended', async () => {
    const fresh = new FakeFirestore();
    h.db = fresh;
    fresh.seed(`${base()}/conversations/live`, { startedAt: new Date('2026-09-20T10:00:00Z') });
    expect(await findLatestConversation(UID)).toBeNull();
  });
});
