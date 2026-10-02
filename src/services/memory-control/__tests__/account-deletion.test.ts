/**
 * Account erasure: recursive Firestore deletion, vectors, storage, truthful report.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeFirestore } from './fake-firestore.js';
import { FakeVectorStore } from './fake-vector-store.js';
import { base, OTHER, seedUser, UID } from './seed.js';

const h = vi.hoisted(() => ({
  db: null as unknown,
  vectors: null as unknown,
  files: new Map<string, string[]>(),
  failBucket: null as string | null,
}));

vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => h.db }));
vi.mock('../../../memory/firestore-vector-store.js', () => ({
  getFirestoreVectorStore: () => h.vectors,
}));
vi.mock('@google-cloud/storage', () => ({
  Storage: class {
    bucket(name: string) {
      return {
        getFiles: async ({ prefix }: { prefix: string }) => {
          if (h.failBucket === name) throw new Error('permission denied');
          return [(h.files.get(name) ?? []).filter((f) => f.startsWith(prefix))];
        },
        deleteFiles: async ({ prefix }: { prefix: string }) => {
          h.files.set(
            name,
            (h.files.get(name) ?? []).filter((f) => !f.startsWith(prefix))
          );
        },
      };
    }
  },
}));

import { deleteUserAccountData } from '../index.js';
import { storageTargets } from '../account-deletion.js';

let db: FakeFirestore;
let vectors: FakeVectorStore;

beforeEach(() => {
  db = new FakeFirestore();
  vectors = new FakeVectorStore();
  h.db = db;
  h.vectors = vectors;
  h.failBucket = null;
  h.files = new Map([
    [
      'ferni-voice-messages',
      [
        `voice-messages/${UID}/1.mp3`,
        `voice-messages/${OTHER}/1.mp3`,
        `voice-messages/${UID}x/1.mp3`,
      ],
    ],
  ]);
  delete process.env.GCS_BUCKET_NAME;
  delete process.env.FIREBASE_STORAGE_BUCKET;
  delete process.env.VOICE_MESSAGE_BUCKET;
  seedUser(db, vectors, UID);
  seedUser(db, vectors, OTHER);
  db.seed(`users/${UID}/wins/w1`, { text: 'Shipped' });
  // An orphan subcollection under a doc that no longer exists
  db.seed(`${base()}/orphans/o1/deep/d1`, { x: 1 });
});

describe('deleteUserAccountData', () => {
  it('deletes the profile and every nested subcollection, vectors and storage objects', async () => {
    const report = await deleteUserAccountData(UID);

    expect(report.complete).toBe(true);
    expect(report.existed).toBe(true);
    expect(report.firestore).toEqual({ bogle_users: 'deleted', users: 'deleted' });
    expect(db.get(base())).toBeUndefined();
    expect(db.paths(`${base()}/`)).toEqual([]);
    expect(db.paths(`users/${UID}/`)).toEqual([]);
    expect(report.embeddings).toBe(3);
    expect([...vectors.docs.values()].some((d) => d.metadata.userId === UID)).toBe(false);
    expect(report.storage).toEqual({ [`ferni-voice-messages/voice-messages/${UID}/`]: 1 });
    expect(h.files.get('ferni-voice-messages')).toEqual([
      `voice-messages/${OTHER}/1.mp3`,
      `voice-messages/${UID}x/1.mp3`,
    ]);

    // another user's data is untouched
    expect(db.get(base(OTHER))).toBeDefined();
    expect(db.paths(`${base(OTHER)}/conversations/`).length).toBeGreaterThan(0);
  });

  it('reports incomplete (never "all deleted") when a part fails', async () => {
    vectors.failWipe = true;
    h.failBucket = 'ferni-voice-messages';
    const report = await deleteUserAccountData(UID);
    expect(report.complete).toBe(false);
    expect(report.storage[`ferni-voice-messages/voice-messages/${UID}/`]).toBe('failed');
    expect(report.errors.some((e) => e.startsWith('vectors:'))).toBe(true);
  });

  it('reports nothing existed for an unknown user', async () => {
    h.files = new Map();
    const report = await deleteUserAccountData('nobody');
    expect(report).toMatchObject({
      complete: true,
      existed: false,
      firestore: { bogle_users: 'absent', users: 'absent' },
    });
  });

  it('is incomplete when Firestore is unavailable', async () => {
    h.db = null;
    const report = await deleteUserAccountData(UID);
    expect(report.complete).toBe(false);
    expect(report.errors).toContain('Firestore unavailable');
  });

  it('refuses ids that could address other documents', async () => {
    await expect(deleteUserAccountData('')).rejects.toThrow();
    await expect(deleteUserAccountData('bogle_users/x')).rejects.toThrow();
  });
});

describe('storageTargets', () => {
  it('lists every user-keyed prefix with a trailing slash', () => {
    process.env.GCS_BUCKET_NAME = 'general';
    process.env.FIREBASE_STORAGE_BUCKET = 'fb';
    expect(storageTargets('u1')).toEqual([
      { bucket: 'general', prefix: 'outreach-voice/u1/' },
      { bucket: 'general', prefix: 'voice-messages/u1/' },
      { bucket: 'ferni-voice-messages', prefix: 'voice-messages/u1/' },
      { bucket: 'fb', prefix: 'visual-memories/u1/' },
    ]);
  });
});
