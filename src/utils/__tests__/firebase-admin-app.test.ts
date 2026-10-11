/**
 * getAdminApp() is the only initializer of the default firebase-admin app.
 *
 * These use the real firebase-admin (initializeApp makes no network call), so they
 * prove the behaviour the ~90 old `if (!apps.length) initializeApp()` sites relied on.
 * src/tests/setup.ts mocks both modules for every other test, hence the unmocks.
 */
import { deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminApp, getAdminFirestore, resolveFirebaseProjectId } from '../firebase-admin-app.js';

vi.unmock('firebase-admin/app');
vi.unmock('firebase-admin/firestore');

const PROJECT_ENV = ['GCP_PROJECT_ID', 'GOOGLE_CLOUD_PROJECT', 'FIREBASE_PROJECT_ID'] as const;

async function deleteAllApps(): Promise<void> {
  await Promise.all(getApps().map((app) => deleteApp(app)));
}

describe('resolveFirebaseProjectId', () => {
  it('prefers GCP_PROJECT_ID, then GOOGLE_CLOUD_PROJECT, then FIREBASE_PROJECT_ID', () => {
    expect(
      resolveFirebaseProjectId({
        GCP_PROJECT_ID: 'a',
        GOOGLE_CLOUD_PROJECT: 'b',
        FIREBASE_PROJECT_ID: 'c',
      })
    ).toBe('a');
    expect(resolveFirebaseProjectId({ GOOGLE_CLOUD_PROJECT: 'b', FIREBASE_PROJECT_ID: 'c' })).toBe(
      'b'
    );
    expect(resolveFirebaseProjectId({ FIREBASE_PROJECT_ID: 'c' })).toBe('c');
  });

  it('returns undefined (not an empty string) when nothing is set, so ADC infers the project', () => {
    expect(resolveFirebaseProjectId({})).toBeUndefined();
    expect(resolveFirebaseProjectId({ GCP_PROJECT_ID: '' })).toBeUndefined();
  });
});

describe('getAdminApp', () => {
  const saved: Partial<Record<(typeof PROJECT_ENV)[number], string>> = {};

  beforeEach(async () => {
    await deleteAllApps();
    for (const key of PROJECT_ENV) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(async () => {
    await deleteAllApps();
    for (const key of PROJECT_ENV) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('initializes the default app once and returns the same app afterwards', () => {
    process.env.GCP_PROJECT_ID = 'demo-admin-app';
    expect(getApps()).toHaveLength(0);

    const first = getAdminApp();
    const second = getAdminApp();

    expect(first.name).toBe('[DEFAULT]');
    expect(second).toBe(first);
    expect(getApps()).toHaveLength(1);
    expect(first.options.projectId).toBe('demo-admin-app');
  });

  it('reuses a default app another module already initialized, keeping its options', () => {
    const existing = initializeApp({ projectId: 'demo-already-there' });
    process.env.GCP_PROJECT_ID = 'demo-would-be-ignored';

    expect(getAdminApp()).toBe(existing);
    expect(getApps()).toHaveLength(1);
  });

  it('does not treat a named app as the default (the old apps.length check did)', () => {
    initializeApp({ projectId: 'demo-named' }, 'some-test-app');

    const app = getAdminApp();

    expect(app.name).toBe('[DEFAULT]');
    expect(
      getApps()
        .map((a) => a.name)
        .sort()
    ).toEqual(['[DEFAULT]', 'some-test-app']);
  });

  it('initializes without a projectId when none is configured', () => {
    expect(getAdminApp().options.projectId).toBeUndefined();
  });

  it('getAdminFirestore initializes the default app and returns its Firestore', () => {
    process.env.GCP_PROJECT_ID = 'demo-admin-firestore';
    expect(getApps()).toHaveLength(0);

    const db = getAdminFirestore();

    expect(getApps().map((a) => a.name)).toEqual(['[DEFAULT]']);
    expect(db).toBe(getFirestore(getAdminApp()));
    expect(db).toBe(getAdminFirestore());
  });
});
