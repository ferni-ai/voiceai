/**
 * Life-coaching profiles bind the process's database (FIRESTORE_DATABASE) and keep
 * main's project: GOOGLE_PROJECT_ID, else 'bogle-voiceai'. Moving them into the main
 * project would start persisting them in prod, a separate decision, so binding the
 * database must not change the project.
 *
 * Uses the real @google-cloud/firestore client (the test setup's mock ignores its
 * options). Building a client sends nothing; no RPC is made here.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.unmock('@google-cloud/firestore');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function client(): Promise<{ projectId: string; databaseId: string }> {
  const { getFirestore } = await import('../user-profile-firestore.js');
  const db = await getFirestore();
  expect(db).not.toBeNull();
  return db as unknown as { projectId: string; databaseId: string };
}

describe('life-coaching profile Firestore', () => {
  it("keeps main's project fallback and binds FIRESTORE_DATABASE", async () => {
    vi.stubEnv('GOOGLE_PROJECT_ID', '');
    vi.stubEnv('FIRESTORE_DATABASE', 'ferni-dev');
    const db = await client();
    expect(db.projectId).toBe('bogle-voiceai');
    expect(db.databaseId).toBe('ferni-dev');
  });

  it('uses GOOGLE_PROJECT_ID when set, and (default) when FIRESTORE_DATABASE is unset', async () => {
    vi.stubEnv('GOOGLE_PROJECT_ID', 'demo-life-coaching');
    vi.stubEnv('FIRESTORE_DATABASE', '');
    const db = await client();
    expect(db.projectId).toBe('demo-life-coaching');
    expect(db.databaseId).toBe('(default)');
  });

  it('creates the client once', async () => {
    const { getFirestore } = await import('../user-profile-firestore.js');
    expect(await getFirestore()).toBe(await getFirestore());
  });
});
