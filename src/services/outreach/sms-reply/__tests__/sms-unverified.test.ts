/**
 * SMS_REPLY_UNVERIFIED's rules: Seth's words, once per number per 24 hours, nothing after an
 * opt-out, a pause or an unreadable consent record. Fake consent and lock stores; fictional
 * numbers only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logs = vi.hoisted(() => [] as unknown[][]);
vi.mock('../../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ info: (...a: unknown[]) => logs.push(a), warn: vi.fn(), debug: vi.fn() }),
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
  const held = new Map<string, string>();
  const clock = { at: start.getTime() };
  const deps: UnverifiedDeps = {
    consent: { isOptedOut: async () => false, consentDoc: vi.fn(consentDoc) },
    locks: {
      lock: async (id, at) => (held.has(id) ? false : (held.set(id, at), true)),
      lockedAt: async (id) => held.get(id),
      unlock: async (id) => void held.delete(id),
    },
    now: () => new Date(clock.at),
    env: { LOG_HASH_SECRET: 'example-secret' },
  };
  return { deps, held, clock };
}

beforeEach(() => {
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
    expect([...out.held, ...paused.held, ...unread.held]).toEqual([]);
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
});
