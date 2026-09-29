/**
 * Oura data uses the token linked in the settings UI (/wearables/oura).
 * Run with: npx vitest run src/services/identity/__tests__/oura-token-store.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logger = () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });
vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: logger,
  createLogger: logger,
}));

// Encrypted per-user wearable stores, one map per collection
const stores = new Map<string, Map<string, unknown>>();
vi.mock('../../persistence/index.js', () => ({
  createPersistenceStore: vi.fn((config: { collection: string }) => {
    const data = stores.get(config.collection) ?? new Map<string, unknown>();
    stores.set(config.collection, data);
    return {
      get: vi.fn(async (id: string) => data.get(id) ?? null),
      setImmediate: vi.fn(async (id: string, value: unknown) => void data.set(id, value)),
      delete: vi.fn(async (id: string) => void data.delete(id)),
      shutdown: vi.fn(async () => undefined),
    };
  }),
}));

// Legacy root `oura_tokens` collection
const legacyDocs = new Map<string, Record<string, unknown>>();
vi.mock('../../superhuman/firestore-utils.js', () => ({
  cleanForFirestore: (v: unknown) => v,
  getFirestoreDb: () => ({
    collection: () => ({
      doc: (id: string) => ({
        get: async () => ({ exists: legacyDocs.has(id), data: () => legacyDocs.get(id) }),
        set: vi.fn(),
        delete: vi.fn(),
      }),
    }),
  }),
}));

async function load() {
  const encryption = await import('../../../utils/token-encryption.js');
  const oura = await import('../oura-auth.js');
  return { encryption, oura };
}

describe('Oura token stores', () => {
  beforeEach(() => {
    vi.resetModules();
    stores.clear();
    legacyDocs.clear();
    vi.stubEnv('OURA_CLIENT_ID', 'oura-client');
    vi.stubEnv('OURA_CLIENT_SECRET', 'oura-secret');
    vi.stubEnv('OAUTH_ENCRYPTION_KEY', 'test-encryption-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers the token linked through /wearables/oura', async () => {
    const { encryption, oura } = await load();
    // Load the store module so the collection exists, then seed it
    await import('../wearable-linked-tokens.js');
    const store = stores.get('wearable_oura_tokens') ?? new Map<string, unknown>();
    stores.set('wearable_oura_tokens', store);
    store.set('user-1', {
      encrypted: encryption.encryptData({
        access_token: 'linked-oura-token',
        refresh_token: 'r',
        expires_at: Date.now() + 60 * 60_000,
      }),
      updated_at: Date.now(),
    });
    legacyDocs.set('user-1', {
      access_token: 'legacy-oura-token',
      refresh_token: 'r2',
      expires_at: Date.now() + 60 * 60_000,
    });

    expect(await oura.isOuraConfigured('user-1')).toBe(true);
    expect(await oura.getValidAccessToken('user-1')).toBe('linked-oura-token');
  });

  it('falls back to the legacy oura_tokens collection', async () => {
    const { oura } = await load();
    legacyDocs.set('user-2', {
      access_token: 'legacy-oura-token',
      refresh_token: 'r2',
      expires_at: Date.now() + 60 * 60_000,
    });

    expect(await oura.getValidAccessToken('user-2')).toBe('legacy-oura-token');
  });

  it('returns null when neither store has a token', async () => {
    const { oura } = await load();
    expect(await oura.getValidAccessToken('nobody')).toBeNull();
    expect(await oura.isOuraConfigured('nobody')).toBe(false);
  });
});
