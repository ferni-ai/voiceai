/**
 * returning-caller.ts on its own: the key, the field allow-list, the summary
 * filter and an expired record.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  beginReturningCaller,
  callerHash,
  clearReturningCallers,
  recordReturningCall,
  registerMinorSignal,
  RETURNING_CALLER_FIELDS,
  returningCallerFor,
  toStoredRecord,
  type ReturningCallerStore,
} from '../returning-caller.js';
import { safeSummary } from '../returning-caller-summary.js';
import { phoneHash } from '../../outreach/checkin-replies.js';

const ENV = { LOG_HASH_SECRET: 'test-secret', RETURNING_CALLER: 'on' };

beforeEach(() => clearReturningCallers());

describe('callerHash', () => {
  it('is stable, keyed, and separate from the check-in phone hash', () => {
    const a = callerHash('+15551234567', ENV);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(callerHash('+15551234567', ENV)).toBe(a);
    expect(callerHash('+15551234568', ENV)).not.toBe(a);
    expect(callerHash('+15551234567', { LOG_HASH_SECRET: 'other' })).not.toBe(a);
    expect(phoneHash('+15551234567', ENV)).not.toBe(a);
    expect(callerHash('+15551234567', {})).toBeNull();
  });
});

describe('toStoredRecord', () => {
  it('keeps only the allow-listed fields', () => {
    expect(RETURNING_CALLER_FIELDS).toEqual([
      'firstName',
      'summary',
      'lastCallAt',
      'callCount',
      'expireAt',
      'forgotten',
      'deniedUntil',
      'failedGuesses',
    ]);
    const at = new Date('2026-10-18T00:00:00Z');
    const record = toStoredRecord({
      firstName: 'Dana',
      summary: 'guitar',
      lastCallAt: at,
      callCount: 1,
      expireAt: at,
      phone: '+15551234567',
      age: 34,
      city: 'Denver',
      transcript: 'everything',
    });
    expect(Object.keys(record).sort()).toEqual([
      'callCount',
      'expireAt',
      'firstName',
      'lastCallAt',
      'summary',
    ]);
  });
});

describe('safeSummary', () => {
  it('drops a phone number, an age and a place, and keeps a plain topic', () => {
    const topics = [
      'Call me at 555-123-4567',
      'Turning thirty next week',
      'Trip to Denver',
      'Learning guitar',
    ];
    expect(safeSummary(topics)).toBe('learning guitar');
  });

  it('drops a place or name the caller said, even without a cue word', () => {
    const lines = ["We're heading to Denver soon.", 'My friend Priya is coming.'];
    expect(safeSummary(['Denver weekend', 'Priya visit'], lines)).toBeUndefined();
  });

  it('drops health, faith, money and possessive topics, and keeps at most two', () => {
    const topics = [
      'Doctor appointment',
      'Church group',
      'Credit card debt',
      "Sam's wedding",
      'Learning guitar',
      'Baking bread',
      'Morning runs',
    ];
    expect(safeSummary(topics)).toBe('learning guitar and baking bread');
    expect(safeSummary(['x'.repeat(400)])?.length).toBe(280);
    expect(safeSummary([])).toBeUndefined();
  });
});

describe('beginReturningCaller', () => {
  const storeWith = (data: Record<string, unknown> | null): ReturningCallerStore => ({
    get: async () => data,
    set: async () => undefined,
    setUnlessForgotten: async () => true,
    erasurePending: async () => false,
    markErasure: async () => undefined,
    clearErasure: async () => undefined,
    markDenied: async () => undefined,
  });

  it('ignores a record past its expiry that TTL has not removed yet', async () => {
    const now = new Date('2026-10-18T00:00:00Z');
    const old = { firstName: 'Dana', callCount: 1, expireAt: new Date('2026-10-17T00:00:00Z') };
    await beginReturningCaller('exp', '+15551234567', storeWith(old), ENV, now);
    expect(returningCallerFor('exp')).toBeUndefined();
    const live = { ...old, expireAt: new Date('2026-11-01T00:00:00Z') };
    await beginReturningCaller('live', '+15551234567', storeWith(live), ENV, now);
    expect(returningCallerFor('live')).toEqual({ firstName: 'Dana', callCount: 1 });
  });

  it('writes nothing when the call-start read timed out or failed', async () => {
    registerMinorSignal(() => false);
    const sets: unknown[] = [];
    const reads = {
      hang: () => new Promise<null>(() => undefined),
      fail: async () => Promise.reject(new Error('unavailable')),
      ok: async () => null,
    };
    for (const [id, get] of Object.entries(reads)) {
      const set = async (_h: string, d: unknown): Promise<void> => void sets.push(d);
      const store: ReturningCallerStore = {
        get,
        set,
        setUnlessForgotten: async (h, d) => (await set(h, d), true),
        erasurePending: async () => false,
        markErasure: async () => undefined,
        clearErasure: async () => undefined,
        markDenied: async () => undefined,
      };
      await beginReturningCaller(id, '+15551234567', store, ENV);
      expect(await recordReturningCall({ sessionId: id, firstName: 'Dana' }, store, ENV)).toBe(
        id === 'ok'
      );
    }
    expect(sets).toHaveLength(1);
  });

  it('reads nothing without the secret or with the flag off', async () => {
    let reads = 0;
    const store = { ...storeWith(null), get: async () => (reads++, null) };
    await beginReturningCaller('s1', '+15551234567', store, { RETURNING_CALLER: 'on' });
    await beginReturningCaller('s2', '+15551234567', store, { LOG_HASH_SECRET: 'x' });
    expect(reads).toBe(0);
  });
});
