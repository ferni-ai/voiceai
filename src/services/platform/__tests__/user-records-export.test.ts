/**
 * The export's two filters: the store allowlist (a store is exported only once someone has
 * reviewed it) and the secret-field filter (whole words, so ordinary fields survive).
 */
import { describe, expect, it, vi } from 'vitest';
import { isSecretField, isSecretValue, MAX_FIELD_DEPTH, toPlain } from '../export-redaction.js';
import {
  EXPORTED_STORES,
  exportUserRecords,
  KNOWN_USER_STORES,
  WITHHELD_STORES,
} from '../user-records-export.js';

// The shared setup fakes firestore; the value cleaner checks its real Timestamp class
vi.mock('firebase-admin/firestore', async () => vi.importActual('firebase-admin/firestore'));

describe('secret fields', () => {
  it.each([
    'pushToken',
    'refresh_token',
    'refresh',
    'access',
    'endpoint',
    'keys',
    'p256dh',
    'auth',
    'passwordHash',
    'salt',
    'pin',
    'otpCode',
    'code',
    'verificationCode',
    'apiKey',
    'api_key',
    'session_id',
    'clientSecret',
    'webauthnCredential',
    'privateKey',
    // the same key spelled every way: camel, snake, kebab, upper, dotted, spaced
    'accessToken',
    'access_token',
    'access-token',
    'ACCESS_TOKEN',
    'Access.Token',
    'access token',
    'APIKey',
    'X-API-KEY',
    'idToken',
    'ID_TOKEN',
    'pushSubscription',
    'push_subscription',
    'keys.auth',
    'keys.p256dh',
    'Authorization',
    'mfaSecret',
    'AUTH',
    'Pin',
    'otp_code',
    // look-alikes a byte-wise match misses: full-width letters, a zero-width space
    'ａｃｃｅｓｓＴｏｋｅｎ',
    'access\u200bToken',
  ])('drops %s', (key) => expect(isSecretField(key)).toBe(true));

  it.each([
    'footprint',
    'zipCode',
    'accessLevel',
    'author',
    'name',
    'phoneNumber',
    'pinned',
    'sessionCount',
    'keystone',
    'hashtags',
    'notes',
    'title',
    'relationship',
  ])('keeps %s', (key) => expect(isSecretField(key)).toBe(false));

  it.each([
    'Bearer abc.def',
    'ya29.a0AfH6SM',
    'eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.sig',
    'sk_live_51H',
    'https://fcm.googleapis.com/fcm/send/abc',
    '-----BEGIN RSA PRIVATE KEY-----\nMII',
  ])('drops a credential-looking value %s', (value) => expect(isSecretValue(value)).toBe(true));
});

describe('the value written to the file', () => {
  it('drops secrets inside arrays of objects and nested maps', () => {
    const out = JSON.stringify(
      toPlain({
        title: 'Lunch',
        attendees: [
          { name: 'Sam', access_token: 's1' },
          { name: 'Ana', 'push-subscription': { a: 's2' } },
        ],
        meta: { deep: [[{ ID_TOKEN: 's3', keep: 'k' }]] },
      })
    );
    expect(out).not.toMatch(/s1|s2|s3/);
    expect(out).toContain('"name":"Sam"');
    expect(out).toContain('"keep":"k"');
  });

  it('filters JSON kept as a string, nested strings included, and keeps it a string', () => {
    const inner = JSON.stringify({ refreshToken: 's4', note: 'hi' });
    const stored = JSON.stringify({ list: [{ apiKey: 's5', label: 'ok' }], inner });
    const out = toPlain({ blob: stored, raw: '{not json', text: 'plain' }) as Record<
      string,
      string
    >;
    expect(JSON.stringify(out)).not.toMatch(/s4|s5/);
    expect(JSON.parse(out.blob!).list[0].label).toBe('ok');
    expect(JSON.parse(JSON.parse(out.blob!).inner).note).toBe('hi');
    expect(out.raw).toBe('{not json');
    expect(out.text).toBe('plain');
  });

  it("leaves a fact's stored vector out, and keeps the fact", async () => {
    const { FieldValue } = await import('@google-cloud/firestore');
    const embedding = FieldValue.vector(Array.from({ length: 768 }, () => 0.5));
    const fact = {
      entityName: 'Biscuit',
      factType: 'attribute',
      value: 'golden retriever',
      embedding,
    };
    expect(toPlain(fact)).toEqual({
      entityName: 'Biscuit',
      factType: 'attribute',
      value: 'golden retriever',
    });
    expect(toPlain({ scores: [0.5, 0.25] })).toEqual({ scores: [0.5, 0.25] });
  });

  it('writes a Firestore timestamp as an ISO string', async () => {
    const { Timestamp } = await import('firebase-admin/firestore');
    expect(toPlain({ at: Timestamp.fromMillis(0) })).toEqual({ at: '1970-01-01T00:00:00.000Z' });
  });

  it('filters double-encoded JSON, drops bytes, and treats a "__proto__" key as a field', () => {
    const twice = JSON.stringify(JSON.stringify({ sessionToken: 's6', ok: 1 }));
    const stored = JSON.parse('{"__proto__": {"apiKey": "s7", "label": "p"}}') as unknown;
    const out = JSON.stringify(
      toPlain({ twice, bytes: Buffer.from('s8-secret'), stored, said: '"Hello," she said' })
    );
    expect(out).not.toMatch(/s6|s7/);
    expect(JSON.parse(out)).not.toHaveProperty('bytes');
    expect(out).toContain('label');
    expect(out).toContain('she said');
  });

  it('stops at a bounded depth, in maps and in JSON strings, without running out of stack', () => {
    let deepMap: Record<string, unknown> = { apiKey: 'deep-secret', note: 'bottom' };
    let deepJson = JSON.stringify({ apiKey: 'deep-secret', note: 'bottom' });
    for (let i = 0; i < 5_000; i++) deepMap = { next: deepMap };
    // JSON kept as a string inside JSON inside maps: escaping doubles per level, so 12 is plenty
    for (let i = 0; i < 12; i++) deepJson = JSON.stringify({ next: deepJson });
    let wrapped: unknown = deepJson;
    for (let i = 0; i < 25; i++) wrapped = { next: wrapped };
    const out = JSON.stringify(toPlain({ top: 'kept', deepMap, deepJson: wrapped }));
    expect(out).toContain('"top":"kept"');
    expect(out).not.toContain('deep-secret');
    expect(out).not.toContain('bottom'); // past MAX_FIELD_DEPTH it is left out, not walked
    const shallow = { a: { b: { c: 'reachable' } } };
    expect(JSON.stringify(toPlain(shallow))).toContain('reachable');
    expect(MAX_FIELD_DEPTH).toBeGreaterThanOrEqual(20); // Firestore's own nesting limit
  });

  it('charges a JSON string to the meter before parsing it, and leaves a huge one unparsed', () => {
    const parse = vi.spyOn(JSON, 'parse');
    const refuse = {
      reserveBytes: () => {
        throw new Error('over budget');
      },
      limits: { maxJsonStringBytes: 1_000 },
    };
    expect(() => toPlain({ s: '{"a":1}' }, refuse)).toThrow('over budget');
    expect(parse).not.toHaveBeenCalled();
    const charged: number[] = [];
    const meter = {
      reserveBytes: (n: number) => void charged.push(n),
      limits: { maxJsonStringBytes: 1_000 },
    };
    const out = toPlain({ small: '{"a":1}', big: JSON.stringify({ b: 'z'.repeat(2_000) }) }, meter);
    expect(charged).toEqual([7]);
    expect(out).toEqual({ small: '{"a":1}' });
    parse.mockRestore();
  });

  it('drops a credential value under an innocent key', () => {
    const out = JSON.stringify(
      toPlain({ note: 'Bearer zz-secret', items: ['ya29.zz-secret', 'milk'] })
    );
    expect(out).not.toContain('zz-secret');
    expect(out).toContain('milk');
  });
});

/**
 * Just what BoundedReader calls: doc(path).get(), and collection(path) with where, orderBy,
 * startAfter, limit and get. Documents are keyed by full path; each store is one page.
 */
function storedDb(docs: Record<string, Record<string, unknown>>): FirebaseFirestore.Firestore {
  const snap = (path: string) => ({
    id: path.split('/').pop() ?? '',
    exists: path in docs,
    data: () => (path in docs ? structuredClone(docs[path]) : undefined),
  });
  const query = (path: string): Record<string, unknown> => ({
    where: () => query(path),
    orderBy: () => query(path),
    startAfter: () => query(path),
    limit: () => query(path),
    get: async () => ({
      docs: Object.keys(docs)
        .filter((p) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/'))
        .map(snap),
    }),
  });
  const db = { doc: (path: string) => ({ get: async () => snap(path) }), collection: query };
  return db as unknown as FirebaseFirestore.Firestore;
}

describe('the records export keeps a fact whole (#2336)', () => {
  const FACTS = 'bogle_users/{uid}/dynamic_facts';

  it("keeps a fact's key and the session it came from", async () => {
    const out = await exportUserRecords(
      'u-1',
      undefined,
      storedDb({
        'bogle_users/u-1/dynamic_facts/f1': {
          entityName: 'Biscuit',
          key: 'breed',
          value: 'golden retriever',
          sessionId: 's-1',
        },
      })
    );
    expect(out[FACTS]).toEqual([
      {
        id: 'f1',
        entityName: 'Biscuit',
        key: 'breed',
        value: 'golden retriever',
        sessionId: 's-1',
      },
    ]);
  });

  it('still drops real secrets: nested, beside a fact, in other stores, or as the value', async () => {
    const out = await exportUserRecords(
      'u-1',
      undefined,
      storedDb({
        'bogle_users/u-1/dynamic_facts/f1': {
          entityName: 'Biscuit',
          key: 'breed',
          value: 'golden retriever',
          apiKey: 'zz-secret-1',
          meta: { key: 'zz-secret-2', sessionId: 'zz-secret-3' },
        },
        // a kept name never vouches for its value: a credential is dropped whatever its key
        'bogle_users/u-1/dynamic_facts/f2': { entityName: 'Biscuit', key: 'sk_live_zz-secret-4' },
        // key is kept in dynamic_facts only
        'bogle_users/u-1/conversations/c1': {
          title: 'Call',
          sessionId: 's-2',
          key: 'zz-secret-5',
          accessToken: 'zz-secret-6',
          signature: 'zz-secret-7',
        },
      })
    );
    expect(JSON.stringify(out)).not.toMatch(/zz-secret/);
    expect(out[FACTS]).toEqual([
      { id: 'f1', entityName: 'Biscuit', key: 'breed', value: 'golden retriever', meta: {} },
      { id: 'f2', entityName: 'Biscuit' },
    ]);
    expect(out['bogle_users/{uid}/conversations']).toEqual([
      { id: 'c1', title: 'Call', sessionId: 's-2' },
    ]);
  });

  it('keeps a fact key and session id but still leaves its vector out (#2332 + #2336)', async () => {
    const { FieldValue } = await import('@google-cloud/firestore');
    const embedding = FieldValue.vector(Array.from({ length: 768 }, () => 0.5));
    const keep = ['sessionId', 'key'];
    const fact = { entityName: 'Biscuit', key: 'breed', sessionId: 's-1', embedding };
    expect(toPlain(fact, undefined, keep)).toEqual({
      entityName: 'Biscuit',
      key: 'breed',
      sessionId: 's-1',
    });
    // a kept name never vouches for a vector under it
    expect(toPlain({ entityName: 'Biscuit', key: embedding }, undefined, keep)).toEqual({
      entityName: 'Biscuit',
    });
  });

  it('keeps only the exact names: other spellings are still dropped as secrets', async () => {
    const out = await exportUserRecords(
      'u-1',
      undefined,
      storedDb({
        'bogle_users/u-1/dynamic_facts/f1': {
          entityName: 'Biscuit',
          key: 'breed',
          Key: 'zz-secret-1',
          _key: 'zz-secret-2',
          KEY: 'zz-secret-3',
        },
        'bogle_users/u-1/conversations/c1': {
          title: 'Call',
          sessionId: 's-1',
          session_id: 'zz-secret-4',
          SESSION_ID: 'zz-secret-5',
          'session.id': 'zz-secret-6',
          ｓｅｓｓｉｏｎＩｄ: 'zz-secret-7',
        },
      })
    );
    expect(JSON.stringify(out)).not.toMatch(/zz-secret/);
    expect(out[FACTS]).toEqual([{ id: 'f1', entityName: 'Biscuit', key: 'breed' }]);
    expect(out['bogle_users/{uid}/conversations']).toEqual([
      { id: 'c1', title: 'Call', sessionId: 's-1' },
    ]);
  });

  it('drops a kept sessionId whose value is a credential', async () => {
    const out = await exportUserRecords(
      'u-1',
      undefined,
      storedDb({
        'bogle_users/u-1/conversations/c1': { title: 'Bearer', sessionId: 'Bearer zz-secret-1' },
        'bogle_users/u-1/conversations/c2': {
          title: 'JWT',
          sessionId: 'eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.zz-secret-2',
        },
      })
    );
    expect(JSON.stringify(out)).not.toMatch(/zz-secret/);
    expect(out['bogle_users/{uid}/conversations']).toEqual([
      { id: 'c1', title: 'Bearer' },
      { id: 'c2', title: 'JWT' },
    ]);
  });
});

describe('store allowlist', () => {
  it('holds every store a menu panel reads', () => {
    for (const store of KNOWN_USER_STORES) {
      const [root, , sub] = store.split('/');
      if (sub) expect(EXPORTED_STORES[root!], store).toContain(sub);
    }
  });

  it('covers every store found under real owners on 2026-10-18 that was missing', () => {
    const exported = [
      'energy_readings',
      'follow_through',
      'implicit_preferences',
      'learnings',
      'memory_state',
      'move_outcomes',
      'persona_life_updates',
      'personality_profiles',
    ];
    for (const sub of exported) expect(EXPORTED_STORES.bogle_users, sub).toContain(sub);
    for (const sub of ['deferred_calls', 'system'])
      expect(WITHHELD_STORES, sub).toHaveProperty(sub);
  });

  it('never also allowlists a withheld store', () => {
    const exported = Object.values(EXPORTED_STORES).flat();
    expect(exported.filter((s) => s in WITHHELD_STORES)).toEqual([]);
    expect(
      exported.filter((s) =>
        /token|secret|credential|oauth|push_sub|passkey|webauthn|plaid/i.test(s)
      )
    ).toEqual([]);
  });
});
