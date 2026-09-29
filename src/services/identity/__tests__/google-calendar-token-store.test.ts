/**
 * Voice calendar/Gmail tokens come from the store the web OAuth flow writes.
 * Run with: npx vitest run src/services/identity/__tests__/google-calendar-token-store.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const HttpResponse = globalThis.Response;
type FetchInit = Parameters<typeof fetch>[1];

const logger = () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });
vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: logger,
  createLogger: logger,
}));

// Encrypted per-user store (bogle_users/{uid}/google_calendar_tokens/data)
const linkedStore = new Map<string, unknown>();
vi.mock('../../persistence/index.js', () => ({
  createPersistenceStore: vi.fn(() => ({
    get: vi.fn(async (id: string) => linkedStore.get(id) ?? null),
    setImmediate: vi.fn(async (id: string, value: unknown) => void linkedStore.set(id, value)),
    delete: vi.fn(async (id: string) => void linkedStore.delete(id)),
    shutdown: vi.fn(async () => undefined),
  })),
}));

// Legacy plaintext root collection (google_calendar_tokens/{uid})
const legacyDocs = new Map<string, Record<string, unknown>>();
const legacySet = vi.fn();
vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    collection() {
      return {
        doc: (id: string) => ({
          get: async () => ({ exists: legacyDocs.has(id), data: () => legacyDocs.get(id) }),
          set: legacySet,
          delete: vi.fn(async () => void legacyDocs.delete(id)),
        }),
      };
    }
  },
}));

const fetchMock = vi.fn();

async function load() {
  const encryption = await import('../../../utils/token-encryption.js');
  const oauth = await import('../google-calendar-oauth.js');
  return { encryption, oauth };
}

describe('Google Calendar token store (voice read path)', () => {
  beforeEach(() => {
    vi.resetModules();
    linkedStore.clear();
    legacyDocs.clear();
    legacySet.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('GOOGLE_CALENDAR_CLIENT_ID', 'gcal-client');
    vi.stubEnv('GOOGLE_CALENDAR_CLIENT_SECRET', 'gcal-secret');
    vi.stubEnv('OAUTH_ENCRYPTION_KEY', 'test-encryption-key');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sees a calendar linked in the web app and refreshes its expired token', async () => {
    const { encryption, oauth } = await load();
    linkedStore.set('user-1', {
      encrypted: encryption.encryptData({
        access_token: 'old-access',
        refresh_token: 'web-refresh',
        expires_at: Date.now() - 60_000,
        scope: 'https://www.googleapis.com/auth/calendar',
      }),
      updated_at: Date.now(),
    });
    fetchMock.mockResolvedValue(
      new HttpResponse(JSON.stringify({ access_token: 'new-access', expires_in: 3600 }), {
        status: 200,
      })
    );

    expect(await oauth.isCalendarConfigured('user-1')).toBe(true);
    expect(await oauth.getValidAccessToken('user-1')).toBe('new-access');

    const [url, init] = fetchMock.mock.calls[0] as [string, FetchInit];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect(String(init?.body)).toContain('refresh_token=web-refresh');

    // Refreshed token stays encrypted in the per-user store
    const saved = linkedStore.get('user-1') as { encrypted: string };
    expect(saved.encrypted).not.toContain('new-access');
    expect(encryption.decryptData<{ access_token: string }>(saved.encrypted)?.access_token).toBe(
      'new-access'
    );
  });

  it('falls back to the legacy root collection', async () => {
    const { oauth } = await load();
    legacyDocs.set('legacy-user', {
      access_token: 'legacy-access',
      refresh_token: 'legacy-refresh',
      expires_in: 3600,
      token_type: 'Bearer',
      expiry_date: Date.now() + 30 * 60_000,
    });

    expect(await oauth.isCalendarConfigured('legacy-user')).toBe(true);
    expect(await oauth.getValidAccessToken('legacy-user')).toBe('legacy-access');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('migrates a refreshed legacy token into the encrypted store', async () => {
    const { encryption, oauth } = await load();
    legacyDocs.set('legacy-user', {
      access_token: 'legacy-access',
      refresh_token: 'legacy-refresh',
      expires_in: 3600,
      token_type: 'Bearer',
      expiry_date: Date.now() - 60_000,
    });
    fetchMock.mockResolvedValue(
      new HttpResponse(
        JSON.stringify({ access_token: 'fresh', expires_in: 3600, token_type: 'Bearer' }),
        {
          status: 200,
        }
      )
    );

    expect(await oauth.getValidAccessToken('legacy-user')).toBe('fresh');
    expect(legacySet).not.toHaveBeenCalled();
    const saved = linkedStore.get('legacy-user') as { encrypted: string };
    expect(encryption.decryptData<{ refresh_token: string }>(saved.encrypted)?.refresh_token).toBe(
      'legacy-refresh'
    );
  });

  it('reports not connected when neither store has tokens', async () => {
    const { oauth } = await load();
    expect(await oauth.isCalendarConfigured('nobody')).toBe(false);
    expect(await oauth.getValidAccessToken('nobody')).toBeNull();
  });

  it('asks for Gmail read-only consent alongside calendar', async () => {
    const linked = await import('../google-calendar-linked-tokens.js');
    const url = new URL(linked.buildAuthUrl('state-1'));
    expect(url.searchParams.get('scope')).toContain(
      'https://www.googleapis.com/auth/gmail.readonly'
    );
  });
});
