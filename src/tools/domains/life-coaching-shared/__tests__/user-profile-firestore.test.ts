/**
 * Life-coaching profiles fail closed. With GOOGLE_PROJECT_ID unset no Firestore client
 * is built and profiles stay in memory: the client used to fall back to a hardcoded
 * project id nobody on our side can see, and project ids are global, so whoever owns
 * that id would receive the data. With it set, the client uses that project and the
 * process's database (FIRESTORE_DATABASE).
 *
 * The real @google-cloud/firestore client, with its constructor wrapped to record
 * calls. Building a client sends nothing; no RPC is made here.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const built = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock('@google-cloud/firestore', async (importOriginal) => {
  const real = await importOriginal<typeof import('@google-cloud/firestore')>();
  function Firestore(settings: Record<string, unknown>) {
    built.push(settings);
    return new real.Firestore(settings);
  }
  return { ...real, Firestore, default: { ...real, Firestore } };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  built.length = 0;
});

describe('life-coaching profile Firestore', () => {
  it('GOOGLE_PROJECT_ID unset: builds no client, and saves stay in memory', async () => {
    vi.stubEnv('GOOGLE_PROJECT_ID', '');
    vi.stubEnv('FIRESTORE_DATABASE', 'ferni-dev');
    const { getFirestore } = await import('../user-profile-firestore.js');
    const profiles = await import('../user-profile.js');

    await expect(getFirestore()).resolves.toBeNull();
    await profiles.updateLifeCoachingProfile('u-memory', {});
    await profiles.updateLifeCoachingProfile('u-memory', {});
    const profile = await profiles.getLifeCoachingProfile('u-memory');

    expect(profile.totalLifeCoachingInteractions).toBe(2);
    expect(built).toEqual([]);
  });

  it('GOOGLE_PROJECT_ID set: that project and FIRESTORE_DATABASE, built once', async () => {
    vi.stubEnv('GOOGLE_PROJECT_ID', 'demo-life-coaching');
    vi.stubEnv('FIRESTORE_DATABASE', 'ferni-dev');
    const { getFirestore } = await import('../user-profile-firestore.js');

    const db = (await getFirestore()) as unknown as { projectId: string; databaseId: string };
    expect(db.projectId).toBe('demo-life-coaching');
    expect(db.databaseId).toBe('ferni-dev');
    expect(await getFirestore()).toBe(db);
    expect(built).toEqual([{ projectId: 'demo-life-coaching', databaseId: 'ferni-dev' }]);
  });

  it('checks again on the next call, so setting GOOGLE_PROJECT_ID later turns persistence on', async () => {
    vi.stubEnv('GOOGLE_PROJECT_ID', '');
    const { getFirestore } = await import('../user-profile-firestore.js');
    await expect(getFirestore()).resolves.toBeNull();
    vi.stubEnv('GOOGLE_PROJECT_ID', 'demo-later');
    vi.stubEnv('FIRESTORE_DATABASE', '');
    const db = (await getFirestore()) as unknown as { projectId: string; databaseId: string };
    expect(db.projectId).toBe('demo-later');
    expect(db.databaseId).toBe('(default)');
  });
});
