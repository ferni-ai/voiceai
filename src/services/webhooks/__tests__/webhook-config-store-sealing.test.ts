/**
 * bogle_users/{uid}/webhooks: url and headers are stored only sealed, and a
 * save is refused (honestly, nothing written) when there is no key.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const docs = new Map<string, Record<string, unknown>>();
const DELETE = Symbol('delete');

function applyWrite(base: Record<string, unknown>, data: Record<string, unknown>) {
  const out = { ...base };
  for (const [k, v] of Object.entries(data)) {
    if (v === DELETE) delete out[k];
    else out[k] = v;
  }
  return out;
}
function fakeDoc(path: string) {
  return {
    collection: (name: string) => fakeCollection(`${path}/${name}`),
    set: async (data: Record<string, unknown>) => void docs.set(path, applyWrite({}, data)),
    update: async (data: Record<string, unknown>) => {
      const cur = docs.get(path);
      if (!cur) throw Object.assign(new Error('not found'), { code: 5 });
      docs.set(path, applyWrite(cur, data));
    },
    delete: async () => void docs.delete(path),
  };
}
function fakeCollection(path: string) {
  return {
    doc: (id: string) => fakeDoc(`${path}/${id}`),
    get: async () => {
      const hits = [...docs.entries()].filter(
        ([p]) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/')
      );
      return {
        size: hits.length,
        docs: hits.map(([p, d]) => ({
          id: p.split('/').pop(),
          data: () => ({ ...d }),
          ref: fakeDoc(p),
          updateTime: undefined,
        })),
      };
    },
  };
}

vi.mock('@google-cloud/firestore', () => ({
  FieldValue: { delete: () => DELETE },
  Firestore: class {
    collection(name: string) {
      return fakeCollection(name);
    }
  },
}));

const store = await import('../webhook-config-store.js');

const URL_SECRET = 'https://hooks.example.test/trigger?token=webhook-secret-abc123';
const HEADER_SECRET = 'Bearer header-secret-xyz789';
const input = {
  name: 'Lights',
  url: URL_SECRET,
  voiceTriggers: ['lights on'],
  headers: { Authorization: HEADER_SECRET },
};

const KEYS = [
  'TOKEN_SEALING_KEY',
  'TOKEN_SEALING_KEY_PREVIOUS',
  'OAUTH_ENCRYPTION_KEY',
  'LOG_HASH_SECRET',
];
const saved: Record<string, string | undefined> = {};
const savedNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  docs.clear();
  store.clearAllCaches();
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  process.env.NODE_ENV = savedNodeEnv;
});

describe('webhook-config-store sealing', () => {
  it('no key (production): create is refused with an honest message; nothing stored or cached', async () => {
    process.env.NODE_ENV = 'production';
    const result = await store.createWebhook('u1', input);
    expect(result).toMatchObject({ success: false, code: 'sealing_unavailable' });
    expect(result.error).toBe(store.WEBHOOK_SEALING_REFUSED);
    expect(docs.size).toBe(0);
    expect((await store.listWebhooks('u1')).data?.total).toBe(0);
  });

  it('no key (non-production): still refused, never plaintext', async () => {
    const result = await store.createWebhook('u1', input);
    expect(result.code).toBe('sealing_unavailable');
    expect(docs.size).toBe(0);
  });

  it('with a key: stored bytes hold neither the URL nor the header; reads round-trip', async () => {
    process.env.NODE_ENV = 'production';
    process.env.LOG_HASH_SECRET = 'test-only-hash-secret';
    const created = await store.createWebhook('u1', input);
    expect(created.success).toBe(true);

    const [path, record] = [...docs.entries()][0] ?? [];
    expect(path).toMatch(/^bogle_users\/u1\/webhooks\//);
    const bytes = JSON.stringify(record);
    expect(bytes).not.toContain('webhook-secret-abc123');
    expect(bytes).not.toContain('hooks.example.test');
    expect(bytes).not.toContain('header-secret-xyz789');

    store.clearAllCaches(); // force a Firestore read
    const read = await store.getWebhook('u1', created.data!.id);
    expect(read.data).toMatchObject({ url: URL_SECRET, headers: { Authorization: HEADER_SECRET } });
  });

  it('update without a key is refused and leaves the stored record unchanged', async () => {
    process.env.LOG_HASH_SECRET = 'test-only-hash-secret';
    const created = await store.createWebhook('u1', input);
    const before = JSON.stringify([...docs.values()]);
    delete process.env.LOG_HASH_SECRET;
    const result = await store.updateWebhook('u1', {
      id: created.data!.id,
      url: 'https://other.example.test/x',
    });
    expect(result.code).toBe('sealing_unavailable');
    expect(JSON.stringify([...docs.values()])).toBe(before);
  });

  it('a legacy plaintext doc still loads and is sealed in place on read', async () => {
    process.env.LOG_HASH_SECRET = 'test-only-hash-secret';
    docs.set('bogle_users/u1/webhooks/w1', {
      id: 'w1',
      name: 'Old',
      url: URL_SECRET,
      headers: JSON.stringify({ Authorization: HEADER_SECRET }),
      voiceTriggers: ['old'],
      enabled: true,
      successCount: 0,
      failureCount: 0,
    });
    const read = await store.getWebhook('u1', 'w1');
    expect(read.data).toMatchObject({ url: URL_SECRET, headers: { Authorization: HEADER_SECRET } });
    await vi.waitFor(() =>
      expect(docs.get('bogle_users/u1/webhooks/w1')?.encrypted).toBeTypeOf('string')
    );
    const bytes = JSON.stringify(docs.get('bogle_users/u1/webhooks/w1'));
    expect(bytes).not.toContain('webhook-secret-abc123');
    expect(bytes).not.toContain('header-secret-xyz789');
  });
  it('a legacy doc read with no key loads but is left as stored (no rewrite)', async () => {
    const legacy = {
      id: 'w2',
      name: 'Old',
      url: URL_SECRET,
      voiceTriggers: ['old'],
      enabled: true,
      successCount: 0,
      failureCount: 0,
    };
    docs.set('bogle_users/u1/webhooks/w2', legacy);
    const read = await store.getWebhook('u1', 'w2');
    expect(read.data?.url).toBe(URL_SECRET);
    await new Promise((r) => setTimeout(r, 10));
    expect(docs.get('bogle_users/u1/webhooks/w2')).toEqual(legacy);
  });
});
