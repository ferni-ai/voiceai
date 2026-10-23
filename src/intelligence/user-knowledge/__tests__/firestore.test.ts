/**
 * The user-knowledge aggregators read through getFirestoreDb(), so its client must
 * be on the process's database (FIRESTORE_DATABASE). It used to be admin.firestore(),
 * which is always '(default)': on the ferni-dev agent every aggregate* read prod.
 *
 * Uses the real firebase-admin SDK (the test setup's mocks hand back a fake with no
 * databaseId). Building a client sends nothing; no RPC is made here.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.unmock('firebase-admin');
vi.unmock('firebase-admin/app');
vi.unmock('firebase-admin/firestore');

afterEach(() => vi.unstubAllEnvs());

describe('user-knowledge getFirestoreDb', () => {
  it('binds FIRESTORE_DATABASE (ferni-dev), not (default)', async () => {
    vi.stubEnv('FIRESTORE_DATABASE', 'ferni-dev');
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'demo-user-knowledge');
    const { getFirestoreDb } = await import('../firestore.js');
    const db = await getFirestoreDb();
    expect(db).not.toBeNull();
    expect(db?.databaseId).toBe('ferni-dev');
  });
});
