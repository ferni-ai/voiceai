/**
 * consent/{phoneHash}: what inbound STOP/START writes, what senders are told,
 * the old stores as a fallback, the flag off as today, and no raw number stored.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ current: null as unknown }));
const logged = vi.hoisted(() => ({ error: [] as Array<[Record<string, unknown>, string]> }));
vi.mock('../../../utils/safe-logger.js', () => {
  const logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: (ctx: Record<string, unknown>, msg: string) => logged.error.push([ctx, msg]),
  };
  return { createLogger: () => logger, getLogger: () => ({ ...logger, child: () => logger }) };
});
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => db.current }));

import {
  consentBlocks,
  firestoreConsentStore,
  readConsent,
  recordInboundSmsConsent,
  writeOptIn,
  writeOptOut,
  type ConsentDeps,
  type ConsentStore,
} from '../consent.js';
import { phoneHash } from '../../outreach/checkin-replies.js';
import { memoryConsentStore } from './memory-consent.js';

const PHONE = '+12025550143';
const ON = { MESSAGING_PIPELINE: 'on', LOG_HASH_SECRET: 'test-secret' };
const OFF = { LOG_HASH_SECRET: 'test-secret' };
const HASH = phoneHash(PHONE, ON) as string;
const NOW = new Date('2026-10-18T15:00:00Z');

const memoryStore = memoryConsentStore;

const depsWith = (store: ConsentStore, env: Record<string, string> = ON): ConsentDeps => ({
  env,
  store,
  now: () => NOW,
});

describe('recordInboundSmsConsent', () => {
  it('STOP writes an sms opt-out to consent/{phoneHash} and to the old store', async () => {
    const m = memoryStore();
    await recordInboundSmsConsent(PHONE, 'STOP', depsWith(m.store));
    expect(m.docs.get(HASH)?.sms).toEqual({
      state: 'opted-out',
      source: 'inbound-sms',
      at: NOW.toISOString(),
    });
    expect(m.docs.get(HASH)?.call).toBeUndefined();
    expect(m.legacySms.has(HASH)).toBe(true);
    expect(m.legacyCall.size).toBe(0);
  });

  it('"stop calling" opts out of calls too, in both stores', async () => {
    const m = memoryStore();
    await recordInboundSmsConsent(PHONE, 'stop calling', depsWith(m.store));
    expect((m.docs.get(HASH)?.call as { state: string }).state).toBe('opted-out');
    expect(m.legacyCall.has(PHONE)).toBe(true);
  });

  it('START after STOP opts back in and clears the old store, so nothing still blocks', async () => {
    const m = memoryStore();
    const deps = depsWith(m.store);
    await recordInboundSmsConsent(PHONE, 'STOP', deps);
    await recordInboundSmsConsent(PHONE, 'start', deps);
    expect((await readConsent(HASH, deps)).sms.state).toBe('opted-in');
    expect(m.legacySms.has(HASH)).toBe(false);
  });

  it('flag off: "stop calling" still reaches every store, do-not-call included (the law, not a feature)', async () => {
    const m = memoryStore();
    await recordInboundSmsConsent(PHONE, 'stop calling', depsWith(m.store, OFF));
    expect(m.docs.get(HASH)).toMatchObject({
      sms: { state: 'opted-out' },
      call: { state: 'opted-out' },
    });
    expect(m.legacySms.has(HASH)).toBe(true);
    expect(m.legacyCall.has(PHONE)).toBe(true);
  });

  it('a possible opt-out only pauses texts for 7 days; "keep texting me" lifts it', async () => {
    const m = memoryStore();
    const deps = depsWith(m.store, OFF);
    expect(await recordInboundSmsConsent(PHONE, 'please cancel', deps)).toBeNull();
    expect(m.docs.get(HASH)?.smsPause).toEqual({
      at: NOW.toISOString(),
      until: new Date(NOW.getTime() + 7 * 24 * 3_600_000).toISOString(),
      source: 'inbound-sms',
    });
    expect(m.docs.get(HASH)?.sms).toBeUndefined();
    expect(m.legacySms.size).toBe(0);
    await recordInboundSmsConsent(PHONE, 'keep texting me', deps);
    expect(m.docs.get(HASH)?.smsPause).toBeUndefined();
  });

  it('an ordinary message that only sounds like one ("cancel my 3pm") writes nothing', async () => {
    const m = memoryStore();
    for (const body of ['cancel my 3pm', "don't stop", 'end of day works']) {
      // eslint-disable-next-line no-await-in-loop
      expect(await recordInboundSmsConsent(PHONE, body, depsWith(m.store, OFF))).toBeNull();
    }
    expect(m.docs.size + m.legacySms.size + m.legacyCall.size).toBe(0);
  });

  it('flag off: START and UNSTOP clear both text stores', async () => {
    for (const optIn of ['START', 'unstop']) {
      const m = memoryStore();
      const deps = depsWith(m.store, OFF);
      // eslint-disable-next-line no-await-in-loop
      await recordInboundSmsConsent(PHONE, 'revoke', deps);
      expect(m.legacySms.has(HASH)).toBe(true);
      // eslint-disable-next-line no-await-in-loop
      await recordInboundSmsConsent(PHONE, optIn, deps);
      expect(m.legacySms.has(HASH)).toBe(false);
      expect((m.docs.get(HASH)?.sms as { state: string }).state).toBe('opted-in');
    }
  });

  it('HELP changes nothing', async () => {
    const m = memoryStore();
    expect(await recordInboundSmsConsent(PHONE, 'HELP', depsWith(m.store))).toBeNull();
    expect(m.docs.size + m.legacySms.size).toBe(0);
  });

  it('writes both channels in one transaction, with the key version', async () => {
    const m = memoryStore();
    const apply = vi.spyOn(m.store, 'apply');
    await recordInboundSmsConsent(PHONE, 'stop calling', depsWith(m.store));
    expect(apply).toHaveBeenCalledOnce();
    expect(m.docs.get(HASH)?.keyVersion).toMatch(/^after-call-checkin\/phone\/v1:[0-9a-f]{8}$/);
  });

  it('the do-not-call entry is written before consent', async () => {
    const m = memoryStore();
    const order: string[] = [];
    const store: ConsentStore = {
      ...m.store,
      setLegacyCallOptOut: async (...a) => (
        order.push('call_opt_outs'),
        m.store.setLegacyCallOptOut(...a)
      ),
      apply: async (...a) => (order.push('consent'), m.store.apply(...a)),
      setLegacySmsOptOut: async (...a) => (
        order.push('feature_checkin_optouts'),
        m.store.setLegacySmsOptOut(...a)
      ),
    };
    await recordInboundSmsConsent(PHONE, 'stop calling', depsWith(store));
    expect(order).toEqual(['call_opt_outs', 'consent', 'feature_checkin_optouts']);
  });

  describe('a STOP is never lost to one failed write', () => {
    const fail = async (): Promise<never> => Promise.reject(new Error('unavailable'));
    beforeEach(() => {
      logged.error.length = 0;
    });

    it('consent write fails: both old stores still get it, logged at error level', async () => {
      const m = memoryStore();
      const store = { ...m.store, apply: fail };
      expect(await recordInboundSmsConsent(PHONE, 'stop calling', depsWith(store))).toBeNull();
      expect(m.legacyCall.has(PHONE)).toBe(true);
      expect(m.legacySms.has(HASH)).toBe(true);
      expect(logged.error).toEqual([
        [expect.objectContaining({ phoneLast4: '0143' }), 'Opt-out not saved: consent'],
      ]);
    });

    it('do-not-call write fails: consent and the text opt-out are still written', async () => {
      const m = memoryStore();
      const store = { ...m.store, setLegacyCallOptOut: fail };
      await recordInboundSmsConsent(PHONE, 'stop calling', depsWith(store));
      expect(m.docs.get(HASH)).toMatchObject({ call: { state: 'opted-out' } });
      expect(m.legacySms.has(HASH)).toBe(true);
      expect(logged.error.map(([, msg]) => msg)).toEqual(['Opt-out not saved: call_opt_outs']);
    });

    it('text opt-out mirror fails: consent is still saved and reported', async () => {
      const m = memoryStore();
      const store = { ...m.store, setLegacySmsOptOut: fail };
      expect(await recordInboundSmsConsent(PHONE, 'STOP', depsWith(store))).not.toBeNull();
      expect(m.docs.get(HASH)).toMatchObject({ sms: { state: 'opted-out' } });
      expect(logged.error.map(([, msg]) => msg)).toEqual([
        'Opt-out not saved: feature_checkin_optouts',
      ]);
    });

    it('no hash secret: "stop calling" still reaches the do-not-call list (keyed by number)', async () => {
      const m = memoryStore();
      await recordInboundSmsConsent(
        PHONE,
        'stop calling',
        depsWith(m.store, { MESSAGING_PIPELINE: 'on' })
      );
      expect(m.legacyCall.has(PHONE)).toBe(true);
      expect(m.docs.size).toBe(0);
      expect(logged.error.map(([, msg]) => msg)).toEqual([
        'Opt-out recognised but not saved: no LOG_HASH_SECRET',
      ]);
    });

    it('no hash secret: an error with the last four digits only, never the number', async () => {
      const m = memoryStore();
      await recordInboundSmsConsent(PHONE, 'STOP', depsWith(m.store, { MESSAGING_PIPELINE: 'on' }));
      expect(logged.error).toHaveLength(1);
      expect(logged.error[0][0]).toMatchObject({ phoneLast4: '0143' });
      expect(JSON.stringify(logged.error)).not.toContain('5550143');
    });
  });

  it('an ordinary reply changes nothing', async () => {
    const m = memoryStore();
    expect(await recordInboundSmsConsent(PHONE, 'thanks, it went well', depsWith(m.store))).toBe(
      null
    );
    expect(m.docs.size).toBe(0);
  });

  it('keeps a bounded history of short codes, never the message', async () => {
    const m = memoryStore();
    const deps = depsWith(m.store);
    for (let i = 0; i < 25; i++) {
      // eslint-disable-next-line no-await-in-loop
      await recordInboundSmsConsent(PHONE, i % 2 ? 'START' : 'STOP', deps);
    }
    const history = m.docs.get(HASH)?.history as string[];
    expect(history).toHaveLength(20);
    expect(history.at(-1)).toBe(`${NOW.toISOString()} sms opted-out inbound-sms`);
  });
});

describe('consentBlocks', () => {
  const owner = async () => true;
  const stranger = async () => false;

  it('refuses a number that opted out, owner or not', async () => {
    const m = memoryStore();
    await writeOptOut(HASH, 'sms', 'inbound-sms', depsWith(m.store));
    expect(await consentBlocks(PHONE, 'sms', owner, depsWith(m.store))).toBe('opted-out');
  });

  it('unknown: yes for the owner, no for a third party; their START grants no third party', async () => {
    const m = memoryStore();
    const deps = depsWith(m.store);
    expect(await consentBlocks(PHONE, 'sms', owner, deps)).toBeNull();
    expect(await consentBlocks(PHONE, 'sms', stranger, deps)).toBe('needs-consent');
    await writeOptIn(HASH, 'sms', 'inbound-sms', deps);
    expect(await consentBlocks(PHONE, 'sms', stranger, deps)).toBe('needs-consent');
  });

  it('an sms opt-out does not block calls; a call opt-out does', async () => {
    const m = memoryStore();
    const deps = depsWith(m.store);
    await writeOptOut(HASH, 'sms', 'inbound-sms', deps);
    expect(await consentBlocks(PHONE, 'call', owner, deps)).toBeNull();
    await writeOptOut(HASH, 'call', 'voice-call', deps);
    expect(await consentBlocks(PHONE, 'call', owner, deps)).toBe('opted-out');
  });

  it('fallback: a STOP only in feature_checkin_optouts or call_opt_outs still blocks', async () => {
    const m = memoryStore();
    m.legacySms.add(HASH);
    m.legacyCall.add(PHONE);
    expect(await consentBlocks(PHONE, 'sms', owner, depsWith(m.store))).toBe('opted-out');
    expect(await consentBlocks(PHONE, 'call', owner, depsWith(m.store))).toBe('opted-out');
  });

  it('with the flag off, never blocks (each sender keeps its own checks)', async () => {
    const m = memoryStore();
    await writeOptOut(HASH, 'sms', 'inbound-sms', depsWith(m.store));
    expect(await consentBlocks(PHONE, 'sms', stranger, depsWith(m.store, OFF))).toBeNull();
  });

  it('fails closed: unreadable store, no hash secret, bad number', async () => {
    const m = memoryStore();
    const broken = { ...m.store, read: async () => Promise.reject(new Error('unavailable')) };
    expect(await consentBlocks(PHONE, 'sms', owner, depsWith(broken))).toBe('unverifiable');
    const noSecret = depsWith(m.store, { MESSAGING_PIPELINE: 'on' });
    expect(await consentBlocks(PHONE, 'sms', owner, noSecret)).toBe('unverifiable');
    expect(await consentBlocks('not a number', 'sms', owner, depsWith(m.store))).toBe(
      'unverifiable'
    );
  });
});

describe('firestoreConsentStore', () => {
  const writes: Array<{ path: string; data: unknown }> = [];
  beforeEach(() => {
    writes.length = 0;
    const doc = (c: string) => (id: string) => ({
      path: `${c}/${id}`,
      get: async () => ({ exists: false, data: () => undefined }),
      set: async (data: unknown) => {
        writes.push({ path: `${c}/${id}`, data });
      },
      delete: async () => undefined,
    });
    db.current = {
      collection: (c: string) => ({ doc: doc(c) }),
      runTransaction: async (fn: (tx: unknown) => Promise<void>) =>
        fn({
          get: async () => ({ exists: false, data: () => undefined }),
          set: (ref: { path: string }, data: unknown) => writes.push({ path: ref.path, data }),
        }),
    };
  });

  it('stores consent under the phone hash, never the number', async () => {
    await recordInboundSmsConsent(PHONE, 'STOP', {
      env: ON,
      store: firestoreConsentStore,
      now: () => NOW,
    });
    const consent = writes.filter((w) => w.path.startsWith('consent/'));
    expect(consent).toHaveLength(1);
    expect(consent[0].path).toBe(`consent/${HASH}`);
    expect(JSON.stringify(consent)).not.toContain('5550143');
  });
});
