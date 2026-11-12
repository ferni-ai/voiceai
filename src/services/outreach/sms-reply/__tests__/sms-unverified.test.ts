/**
 * SMS_REPLY_UNVERIFIED's rules: Seth's words, once per number per 24 hours (a slot in
 * rate_limits that its TTL policy deletes), nothing after an opt-out, a pause or an unreadable
 * consent record. Fake consent store and an in-memory Firestore; fictional numbers only.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logs = vi.hoisted(() => [] as unknown[][]);
vi.mock('../../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ info: (...a: unknown[]) => logs.push(a), warn: vi.fn(), debug: vi.fn() }),
}));
/** Firestore docs by `collection/id`, behind the transaction surface the slot uses. */
const docs = vi.hoisted(() => new Map<string, Record<string, unknown>>());
const firestore = vi.hoisted(() => ({ down: false }));
vi.mock('../../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () =>
    firestore.down
      ? null
      : {
          collection: (c: string) => ({ doc: (id: string) => ({ path: `${c}/${id}` }) }),
          runTransaction: async <T>(work: (tx: object) => Promise<T>) =>
            work({
              get: async (ref: { path: string }) => ({
                get: (f: string) => docs.get(ref.path)?.[f],
              }),
              set: (ref: { path: string }, data: Record<string, unknown>) =>
                docs.set(ref.path, data),
            }),
        },
}));

import {
  SMS_UNVERIFIED_REPLY,
  smsUnverifiedReply,
  type UnverifiedDeps,
} from '../sms-unverified.js';

const PHONE = '+15555550188';
const HOUR = 3_600_000;
const start = new Date('2026-11-12T18:00:00Z');

function world(
  consentDoc: () => Promise<Record<string, unknown> | undefined> = async () => undefined
) {
  const clock = { at: start.getTime() };
  const deps: UnverifiedDeps = {
    consent: { isOptedOut: async () => false, consentDoc: vi.fn(consentDoc) },
    now: () => new Date(clock.at),
    env: { LOG_HASH_SECRET: 'example-only' },
  };
  return { deps, clock };
}

beforeEach(() => {
  docs.clear();
  firestore.down = false;
  logs.length = 0;
  vi.stubEnv('SMS_REPLY_UNVERIFIED', 'on');
  vi.stubEnv('SMS_CRISIS_SCREEN', 'on');
});
afterEach(() => vi.unstubAllEnvs());

describe('a text from an unverified number', () => {
  it("first text: Seth's words, exactly", async () => {
    const { deps } = world();
    expect(await smsUnverifiedReply(PHONE, deps)).toBe(
      'Hi, this is Ferni, an AI friend. I can only text with people who have set up Ferni with this number. Reply STOP to opt out.'
    );
    expect(SMS_UNVERIFIED_REPLY.length).toBeLessThanOrEqual(160);
  });

  it('SB 243: the reply says "an AI friend" itself, so no extra reminder, first or 24 h later', async () => {
    const { deps, clock } = world();
    const first = await smsUnverifiedReply(PHONE, deps);
    clock.at += 24 * HOUR;
    const again = await smsUnverifiedReply(PHONE, deps);
    for (const reply of [first, again]) {
      expect(reply).toContain('an AI friend');
      expect(reply).not.toMatch(/just a reminder/i);
      expect(reply).toBe(SMS_UNVERIFIED_REPLY);
    }
  });

  it('once per number per 24 hours: 23 h later none, 24 h later again; another number its own', async () => {
    const { deps, clock } = world();
    expect(await smsUnverifiedReply(PHONE, deps)).toBe(SMS_UNVERIFIED_REPLY);
    clock.at += HOUR;
    expect(await smsUnverifiedReply(PHONE, deps)).toBeNull();
    expect(await smsUnverifiedReply('+15555550189', deps)).toBe(SMS_UNVERIFIED_REPLY);
    clock.at = start.getTime() + 23 * HOUR;
    expect(await smsUnverifiedReply(PHONE, deps)).toBeNull();
    clock.at = start.getTime() + 24 * HOUR;
    expect(await smsUnverifiedReply(PHONE, deps)).toBe(SMS_UNVERIFIED_REPLY);
  });

  it('opted out, paused, or a consent record that cannot be read: nothing, and no slot taken', async () => {
    const out = world(async () => ({ sms: { state: 'opted-out' } }));
    expect(await smsUnverifiedReply(PHONE, out.deps)).toBeNull();
    const until = new Date(start.getTime() + 24 * HOUR).toISOString();
    const smsPause = { at: start.toISOString(), until };
    const paused = world(async () => ({ smsPause }));
    expect(await smsUnverifiedReply(PHONE, paused.deps)).toBeNull();
    const unread = world(async () => Promise.reject(new Error('Firestore unavailable')));
    expect(await smsUnverifiedReply(PHONE, unread.deps)).toBeNull();
    expect([...docs.keys()]).toEqual([]);
  });

  it('flag off, or the crisis screen not on: nothing, and nothing read', async () => {
    for (const [name, mode] of [
      ['SMS_REPLY_UNVERIFIED', 'off'],
      ['SMS_CRISIS_SCREEN', 'shadow'],
    ]) {
      vi.stubEnv(name, mode);
      const { deps } = world();
      expect(await smsUnverifiedReply(PHONE, deps)).toBeNull();
      expect(deps.consent.consentDoc).not.toHaveBeenCalled();
      vi.stubEnv(name, 'on');
    }
  });

  it('no hash key: nothing; the log line holds an outcome, never the number', async () => {
    const { deps } = world();
    expect(await smsUnverifiedReply(PHONE, { ...deps, env: {} })).toBeNull();
    await smsUnverifiedReply(PHONE, deps);
    expect(logs.map((l) => (l[0] as { outcome: string }).outcome)).toEqual(['no-hash', 'sent']);
    expect(JSON.stringify(logs)).not.toMatch(/555|0188/);
  });

  it('the slot: one rate_limits doc per number, its expireAt (the TTL field) 24 h out, no number', async () => {
    const { deps } = world();
    await smsUnverifiedReply(PHONE, deps);
    const [[path, doc]] = [...docs];
    expect(path).toMatch(/^rate_limits\/sms-unverified:[0-9a-f]{64}$/);
    expect(doc).toEqual({
      at: start.toISOString(),
      expireAt: new Date(start.getTime() + 24 * HOUR),
    });
    expect(JSON.stringify([...docs])).not.toMatch(/555|0188/);
  });

  it('prod deletes the slots: firestore.indexes.json keeps the TTL policy on rate_limits.expireAt', () => {
    const file = JSON.parse(
      readFileSync(join(process.cwd(), 'firestore.indexes.json'), 'utf8')
    ) as {
      fieldOverrides: Array<{ collectionGroup: string; fieldPath: string; ttl?: boolean }>;
    };
    const ttl = file.fieldOverrides.find((o) => o.collectionGroup === 'rate_limits');
    expect(ttl).toMatchObject({ fieldPath: 'expireAt', ttl: true });
  });

  it.each(['default', 'ferni-dev'])(
    'the %s database has that policy live: its checked-in TTL listing shows it ACTIVE',
    (database) => {
      const dir = join(process.cwd(), 'scripts/ci/fixtures/firestore-indexes', database);
      const listed = JSON.parse(readFileSync(join(dir, 'ttls.json'), 'utf8')) as Array<{
        name: string;
        ttlConfig?: { state?: string };
      }>;
      const policy = listed.find((f) =>
        f.name.endsWith('/collectionGroups/rate_limits/fields/expireAt')
      );
      expect(policy?.ttlConfig?.state).toBe('ACTIVE');
    }
  );

  it('Firestore unavailable: rejects (the route sends nothing)', async () => {
    firestore.down = true;
    const { deps } = world();
    await expect(smsUnverifiedReply(PHONE, deps)).rejects.toThrow('Firestore unavailable');
  });
});
