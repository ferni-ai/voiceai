/**
 * The marketplace stores never pick Firestore under a test runner: with a
 * project id set and gcloud credentials on the machine, the unit tests wrote
 * their fixtures (userId 'user123', 'Test Tool', 'Test Agent') to production.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { firestoreBackendFromEnv, isTestRun } from '../backend.js';

const PROD_PROJECT = { GCP_PROJECT_ID: 'johnb-2025', FIREBASE_PROJECT_ID: 'johnb-2025' };

describe('firestoreBackendFromEnv', () => {
  it('picks memory under vitest even with a production project id', () => {
    expect(
      firestoreBackendFromEnv('USE_FIRESTORE_MARKETPLACE', { VITEST: 'true', ...PROD_PROJECT })
    ).toBe(false);
  });

  it('picks memory with NODE_ENV=test even when the store is opted in', () => {
    const env = { NODE_ENV: 'test', USE_FIRESTORE_MARKETPLACE: 'true', ...PROD_PROJECT };
    expect(firestoreBackendFromEnv('USE_FIRESTORE_MARKETPLACE', env)).toBe(false);
  });

  it('a test reaches Firestore only through the emulator and the explicit flag', () => {
    const emulator = { VITEST: 'true', FIRESTORE_EMULATOR_HOST: 'localhost:8080' };
    expect(firestoreBackendFromEnv('USE_FIRESTORE_REVIEWS', emulator)).toBe(false);
    expect(
      firestoreBackendFromEnv('USE_FIRESTORE_REVIEWS', {
        ...emulator,
        USE_FIRESTORE_REVIEWS: 'true',
      })
    ).toBe(true);
  });

  it('outside tests keeps the production behaviour', () => {
    expect(firestoreBackendFromEnv('USE_FIRESTORE_BILLING', { NODE_ENV: 'production' })).toBe(true);
    expect(firestoreBackendFromEnv('USE_FIRESTORE_BILLING', { GCP_PROJECT_ID: 'p' })).toBe(true);
    expect(
      firestoreBackendFromEnv('USE_FIRESTORE_BILLING', { USE_FIRESTORE_BILLING: 'true' })
    ).toBe(true);
    expect(firestoreBackendFromEnv('USE_FIRESTORE_BILLING', { NODE_ENV: 'development' })).toBe(
      false
    );
  });

  it('isTestRun sees vitest', () => {
    expect(isTestRun()).toBe(true);
    expect(isTestRun({ NODE_ENV: 'development' })).toBe(false);
  });
});

describe('the store factories under vitest', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('getMarketplaceStore, getBillingStore and getReviewsStore return in-memory stores', async () => {
    // The env that sent the registry tests to production before the fix.
    vi.stubEnv('GCP_PROJECT_ID', 'johnb-2025');
    vi.stubEnv('FIREBASE_PROJECT_ID', 'johnb-2025');
    vi.stubEnv('USE_FIRESTORE_MARKETPLACE', 'true');
    vi.resetModules();

    const { getMarketplaceStore } = await import('../firestore.js');
    const { InMemoryMarketplaceStore } = await import('../in-memory.js');
    const { getBillingStore } = await import('../../billing/persistence.js');
    const { getReviewsStore } = await import('../../reviews/persistence.js');

    expect(await getMarketplaceStore()).toBeInstanceOf(InMemoryMarketplaceStore);
    expect((await getBillingStore()).constructor.name).toBe('InMemoryBillingStore');
    expect((await getReviewsStore()).constructor.name).toBe('InMemoryReviewsStore');
  });
});
