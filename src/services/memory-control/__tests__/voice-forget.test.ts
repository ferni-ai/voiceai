/**
 * Voice forget: find → confirm → delete → 30s undo.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeFirestore } from './fake-firestore.js';
import { FakeVectorStore } from './fake-vector-store.js';
import { base, OTHER, seedUser, UID } from './seed.js';

const h = vi.hoisted(() => ({ db: null as unknown, vectors: null as unknown }));

vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => h.db }));
vi.mock('../../../memory/firestore-vector-store.js', () => ({
  getFirestoreVectorStore: () => h.vectors,
}));

import { handleVoiceForget, resetVoiceForgetState, UNDO_WINDOW_MS } from '../index.js';
import { VOICE_COPY } from '../voice-forget.js';

let db: FakeFirestore;
let vectors: FakeVectorStore;

beforeEach(() => {
  db = new FakeFirestore();
  vectors = new FakeVectorStore();
  h.db = db;
  h.vectors = vectors;
  seedUser(db, vectors, UID);
  seedUser(db, vectors, OTHER);
  resetVoiceForgetState();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('handleVoiceForget', () => {
  it('asks before deleting, then deletes on confirmation', async () => {
    const ask = await handleVoiceForget(UID, { query: 'Sarah' });
    expect(ask).toMatch(/^I found Sarah \(sister\)/);
    expect(ask).toContain('Want me to forget');
    expect(db.get(`${base()}/dynamic_entities/p2`)).toBeDefined();

    const done = await handleVoiceForget(UID, { confirm: true });
    expect(done).toBe(VOICE_COPY.done);
    expect(db.get(`${base()}/dynamic_entities/p1`)).toBeUndefined();
    expect(db.get(`${base()}/dynamic_entities/p2`)).toBeUndefined();
    expect(db.get(`${base()}/dynamic_facts/f-legacy`)).toBeUndefined();
    expect(db.get(`${base()}/memory_tombstones/f-legacy`)).toMatchObject({
      reason: 'voice_forget',
    });
    expect(db.get(`${base(OTHER)}/dynamic_entities/p2`)).toBeDefined();
  });

  it('deletes straight away when the user already confirmed', async () => {
    const done = await handleVoiceForget(UID, { query: 'favourite colour', confirm: true });
    expect(done).toBe(VOICE_COPY.done);
    expect(db.get(`${base()}/extracted_facts/x1`)).toBeUndefined();
  });

  it('undo within the window restores documents, tombstones and vectors', async () => {
    await handleVoiceForget(UID, { query: 'job interview', confirm: true });
    expect(db.get(`${base()}/dynamic_facts/f-only-c1`)).toBeUndefined();
    expect(db.get(`${base()}/conversations/c1`)).toBeUndefined();

    expect(await handleVoiceForget(UID, { undo: true })).toBe(VOICE_COPY.undone);
    expect(db.get(`${base()}/dynamic_facts/f-only-c1`)).toMatchObject({
      sourceConversationIds: ['c1'],
    });
    expect(db.get(`${base()}/conversations/c1/turns/t2`)).toBeDefined();
    expect(db.get(`${base()}/memory_tombstones/f-only-c1`)).toBeUndefined();
    expect(vectors.docs.has('conversation_fact_f-only-c1')).toBe(true);
    expect(vectors.docs.has(`conversation_s1-${UID}`)).toBe(true);
    // a second undo has nothing left to do
    expect(await handleVoiceForget(UID, { undo: true })).toBe(VOICE_COPY.nothingToUndo);
  });

  it('undo after the window keeps the deletion', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    await handleVoiceForget(UID, { query: 'favourite colour', confirm: true });
    vi.advanceTimersByTime(UNDO_WINDOW_MS + 1);
    const reply = await handleVoiceForget(UID, { undo: true });
    expect([VOICE_COPY.undoExpired, VOICE_COPY.nothingToUndo]).toContain(reply);
    expect(db.get(`${base()}/extracted_facts/x1`)).toBeUndefined();
  });

  it('forgets our last conversation', async () => {
    const ask = await handleVoiceForget(UID, { query: 'forget our last conversation' });
    expect(ask).toBe('I found our last conversation. Want me to forget it?');
    expect(await handleVoiceForget(UID, { confirm: true })).toBe(VOICE_COPY.done);
    expect(db.get(`${base()}/conversations/c2`)).toBeUndefined();
    expect(db.get(`${base()}/conversations/c1`)).toBeDefined();
  });

  it('supports the explicit last_conversation scope', async () => {
    expect(await handleVoiceForget(UID, { scope: 'last_conversation', confirm: true })).toBe(
      VOICE_COPY.done
    );
    expect(db.get(`${base()}/conversations/c2`)).toBeUndefined();
  });

  it('answers warmly when there is nothing to do', async () => {
    expect(await handleVoiceForget(undefined, { query: 'x' })).toBe(VOICE_COPY.noUser);
    expect(await handleVoiceForget(UID, {})).toBe(VOICE_COPY.askWhat);
    expect(await handleVoiceForget(UID, { query: 'quantum chromodynamics' })).toBe(
      VOICE_COPY.nothingFound
    );
    expect(await handleVoiceForget(UID, { undo: true })).toBe(VOICE_COPY.nothingToUndo);
  });

  it('keeps every reply short', () => {
    for (const line of Object.values(VOICE_COPY)) expect(line.length).toBeLessThanOrEqual(80);
  });
});
