/**
 * An inside joke's copy in the semantic index expires a year after it is written, like the
 * shared moment it copies (utils/shared-moment-retention.ts): the real trust hook and the real
 * store-hooks writer run, only the vector store and the embedder are faked. Search drops a
 * document past its expireAt (Firestore TTL deletes late). Policies that only declare a
 * ttlDays (never enforced) are unchanged. Synthetic uids and words only.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { keepCandidate } from '../../../memory/firestore-vector-store/helpers.js';
import { indexInsideJoke } from '../integrations/trust-integration.js';
import { indexExpireAt } from '../index-expiry.js';
import { flushPendingChanges, onStoreChange } from '../store-hooks.js';

const written = vi.hoisted(() => [] as Array<{ id: string; expireAt?: Date }>);

vi.mock('../../../memory/firestore-vector-store/index.js', () => ({
  getFirestoreVectorStore: () => ({
    addDocument: async (doc: { id: string; expireAt?: Date }) => void written.push(doc),
    removeDocument: async () => true,
    list: async () => [],
    cached: async () => ({ docs: [], fallback: false }),
  }),
}));
vi.mock('../../../memory/embeddings.js', () => ({ embed: async () => [0.1, 0.2, 0.3] }));
vi.mock('../max-per-user.js', () => ({
  enforceMaxPerUser: async () => undefined,
  forgetIndexedDoc: () => undefined,
}));

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

afterEach(() => void written.splice(0));

describe('semantic index expiry', () => {
  it("writes a new inside joke's vector with an expireAt one year out", async () => {
    const before = Date.now();
    indexInsideJoke('expiry-user-a', {
      id: 'joke-1',
      joke: 'the quokka that stole lunch',
      context: 'a picnic story',
    });
    await flushPendingChanges();
    const after = Date.now();

    expect(written.map((d) => d.id)).toEqual(['trust_inside_joke_joke-1']);
    const at = written[0]?.expireAt?.getTime();
    expect(at).toBeGreaterThanOrEqual(before + YEAR_MS);
    expect(at).toBeLessThanOrEqual(after + YEAR_MS);
  });

  it('leaves policies that never enforced their ttlDays without an expiry', async () => {
    // task: ttlDays 30, declared but never enforced, so still none
    onStoreChange({
      storeType: 'productivity',
      changeType: 'update',
      userId: 'expiry-user-a',
      entityType: 'task',
      entityId: 'task-1',
      content: 'Task (high): call the plumber.',
      metadata: { priority: 'high', status: 'active' },
    });
    await flushPendingChanges();

    expect(written.map((d) => d.id)).toEqual(['productivity_task_task-1']);
    expect(written[0]?.expireAt).toBeUndefined();
    expect(indexExpireAt('habit')).toBeUndefined();
  });

  it('search drops a document past its expireAt and keeps one before it or without one', () => {
    const metadata = { source: 'store_auto_sync', userId: 'expiry-user-a' };
    const filter = { userId: 'expiry-user-a' };
    expect(keepCandidate({ metadata, expireAt: new Date(Date.now() - 1000) }, filter)).toBe(false);
    expect(keepCandidate({ metadata, expireAt: new Date(Date.now() + YEAR_MS) }, filter)).toBe(
      true
    );
    expect(keepCandidate({ metadata }, filter)).toBe(true);
  });
});
