/**
 * Apple Calendar app-specific passwords at rest. With no token key nothing is
 * stored and the save says why; with one, the password is sealed through
 * utils/token-at-rest and the raw doc holds no plaintext. A record sealed by
 * the old derived key (project id + a salt in this public repo) still opens,
 * and is re-sealed on read once a token key is configured.
 */
import { createCipheriv, randomBytes, scryptSync } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/safe-logger.js', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { getLogger: () => logger, createLogger: () => logger };
});

type Doc = { data: Record<string, unknown>; updateTime: { v: number } };
const fs = vi.hoisted(() => ({ docs: new Map<string, Doc>(), version: 0, updates: 0 }));

vi.mock('@google-cloud/firestore', () => {
  const ref = (key: string) => ({
    get: async () => {
      const d = fs.docs.get(key);
      return {
        exists: !!d,
        data: () => (d ? structuredClone(d.data) : undefined),
        updateTime: d?.updateTime,
      };
    },
    set: async (data: Record<string, unknown>) => {
      fs.docs.set(key, { data: structuredClone(data), updateTime: { v: ++fs.version } });
    },
    update: async (fields: Record<string, unknown>, pre?: { lastUpdateTime?: unknown }) => {
      const d = fs.docs.get(key);
      if (!d) throw Object.assign(new Error('not found'), { code: 5 });
      if (pre?.lastUpdateTime && pre.lastUpdateTime !== d.updateTime) {
        throw Object.assign(new Error('precondition'), { code: 9 });
      }
      fs.updates += 1;
      const data = { ...d.data, ...structuredClone(fields) };
      fs.docs.set(key, { data, updateTime: { v: ++fs.version } });
    },
    delete: async () => void fs.docs.delete(key),
  });
  class Firestore {
    collection(path: string) {
      return { doc: (id: string) => ref(`${path}/${id}`) };
    }
  }
  return { Firestore, FieldValue: { delete: () => ({ __delete: true }) } };
});

const { AppleCalendarProvider } = await import('../providers/apple-provider.js');

const KEY = 'users/u1/calendar_providers/apple';
const PASSWORD = 'abcd-efgh-ijkl-mnop';
const saved = { ...process.env };

type Creds = { appleId: string; appSpecificPassword: string } | null;
const provider = new AppleCalendarProvider();
const getCredentials = (uid: string) =>
  (provider as unknown as { getCredentials(u: string): Promise<Creds> }).getCredentials(uid);
const raw = () => JSON.stringify(fs.docs.get(KEY)?.data ?? null);
const credentialsField = () => fs.docs.get(KEY)?.data.credentials as Record<string, unknown>;

/** A password as the old encryption.ts wrote it with CALENDAR_ENCRYPTION_KEY unset. */
function legacySeal(plaintext: string, project: string) {
  const key = scryptSync(`calendar-${project}`, 'ferni-prod-salt', 32);
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = cipher.update(plaintext, 'utf8', 'base64') + cipher.final('base64');
  return {
    encrypted,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    version: 1,
  };
}

function putLegacy(appSpecificPassword: unknown) {
  fs.docs.set(KEY, {
    data: { provider: 'apple', credentials: { appleId: 'me@icloud.com', appSpecificPassword } },
    updateTime: { v: ++fs.version },
  });
}

describe('Apple Calendar credentials at rest', () => {
  beforeEach(() => {
    fs.docs.clear();
    fs.updates = 0;
    for (const k of [
      'TOKEN_SEALING_KEY',
      'TOKEN_SEALING_KEY_PREVIOUS',
      'OAUTH_ENCRYPTION_KEY',
      'LOG_HASH_SECRET',
      'CALENDAR_ENCRYPTION_KEY',
    ]) {
      delete process.env[k];
    }
    process.env.GOOGLE_CLOUD_PROJECT = 'fixture-project';
    vi.spyOn(provider, 'validateCredentials').mockResolvedValue(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...saved };
  });

  it('with no token key stores nothing and refuses with a typed reason, before asking Apple', async () => {
    expect(fs.docs.size).toBe(0);
    const result = await provider.storeCredentials('u1', 'me@icloud.com', PASSWORD);
    expect(result).toEqual({ ok: false, reason: 'sealing_unavailable' });
    expect(fs.docs.size).toBe(0);
    expect(provider.validateCredentials).not.toHaveBeenCalled();
  });

  it('with a token key seals the password: raw doc has no plaintext, and it round-trips', async () => {
    process.env.TOKEN_SEALING_KEY = Buffer.alloc(32, 3).toString('base64');
    const result = await provider.storeCredentials('u1', 'me@icloud.com', PASSWORD);
    expect(result).toEqual({ ok: true });
    expect(raw()).not.toContain(PASSWORD);
    expect(credentialsField().appSpecificPassword).toBeUndefined();
    const sealed = credentialsField().sealedPassword as { encrypted: string };
    expect(JSON.parse(sealed.encrypted)).toMatchObject({ encrypted: true });
    expect(await getCredentials('u1')).toMatchObject({ appSpecificPassword: PASSWORD });
  });

  it('invalid Apple credentials are reported as such, and nothing is stored', async () => {
    process.env.LOG_HASH_SECRET = 'fixture-log-hash-secret';
    vi.spyOn(provider, 'validateCredentials').mockResolvedValue(false);
    const result = await provider.storeCredentials('u1', 'me@icloud.com', PASSWORD);
    expect(result).toEqual({ ok: false, reason: 'invalid_credentials' });
    expect(fs.docs.size).toBe(0);
  });

  it('a derived-key legacy record still reads, and is re-sealed under the token key', async () => {
    process.env.LOG_HASH_SECRET = 'fixture-log-hash-secret';
    putLegacy(legacySeal(PASSWORD, 'fixture-project'));
    expect(credentialsField().sealedPassword).toBeUndefined();

    expect(await getCredentials('u1')).toMatchObject({ appSpecificPassword: PASSWORD });
    expect(fs.updates).toBe(1);
    expect(credentialsField().appSpecificPassword).toBeUndefined();
    expect(credentialsField().sealedPassword).toBeDefined();
    expect(raw()).not.toContain(PASSWORD);

    // The legacy key no longer matters: the re-sealed record opens on its own.
    process.env.GOOGLE_CLOUD_PROJECT = 'some-other-project';
    expect(await getCredentials('u1')).toMatchObject({ appSpecificPassword: PASSWORD });
    expect(fs.updates).toBe(1);
  });

  it('a legacy plaintext record is re-sealed on read', async () => {
    process.env.LOG_HASH_SECRET = 'fixture-log-hash-secret';
    putLegacy(PASSWORD);
    expect(raw()).toContain(PASSWORD);
    expect(await getCredentials('u1')).toMatchObject({ appSpecificPassword: PASSWORD });
    expect(raw()).not.toContain(PASSWORD);
  });

  it('with no token key a legacy record still reads and is left as stored', async () => {
    putLegacy(legacySeal(PASSWORD, 'fixture-project'));
    const before = raw();
    expect(await getCredentials('u1')).toMatchObject({ appSpecificPassword: PASSWORD });
    expect(fs.updates).toBe(0);
    expect(raw()).toBe(before);
  });

  it('a legacy record no legacy key opens reads as not connected, untouched', async () => {
    process.env.LOG_HASH_SECRET = 'fixture-log-hash-secret';
    putLegacy(legacySeal(PASSWORD, 'not-this-project'));
    expect(await getCredentials('u1')).toBeNull();
    expect(fs.updates).toBe(0);
  });
});
