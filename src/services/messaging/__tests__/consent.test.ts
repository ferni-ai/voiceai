/**
 * consent/{phoneHash}: what inbound STOP/START writes, what senders are told,
 * the old stores as a fallback, the flag off as today, and no raw number stored.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => db.current }));

import {
  consentBlocks,
  consentKeyword,
  firestoreConsentStore,
  readConsent,
  recordInboundSmsConsent,
  writeOptIn,
  writeOptOut,
  type ConsentDeps,
  type ConsentStore,
} from '../consent.js';
import { phoneHash } from '../../outreach/checkin-replies.js';

const PHONE = '+12025550143';
const ON = { MESSAGING_PIPELINE: 'on', LOG_HASH_SECRET: 'test-secret' };
const OFF = { LOG_HASH_SECRET: 'test-secret' };
const HASH = phoneHash(PHONE, ON) as string;
const NOW = new Date('2026-10-18T15:00:00Z');

function memoryStore() {
  const docs = new Map<string, Record<string, unknown>>();
  const legacySms = new Set<string>();
  const legacyCall = new Set<string>();
  const store: ConsentStore = {
    read: async (h) => docs.get(h),
    apply: async (h, change) => {
      docs.set(h, change(docs.get(h)));
    },
    legacySmsOptOut: async (h) => legacySms.has(h),
    setLegacySmsOptOut: async (h, out) => {
      if (out) legacySms.add(h);
      else legacySms.delete(h);
    },
    legacyCallOptOut: async (p) => legacyCall.has(p),
    setLegacyCallOptOut: async (p) => {
      legacyCall.add(p);
    },
  };
  return { store, docs, legacySms, legacyCall };
}

const depsWith = (store: ConsentStore, env: Record<string, string> = ON): ConsentDeps => ({
  env,
  store,
  now: () => NOW,
});

describe('consentKeyword: the whole message is the keyword', () => {
  it.each(['STOP', 'stop.', 'Revoke', 'CANCEL', ' unsubscribe ', 'Quit!'])(
    '%s opts out of texts only',
    (body) => expect(consentKeyword(body)).toEqual({ state: 'opted-out', channels: ['sms'] })
  );
  it.each(['stop calling', 'Stop calling me.'])('%s opts out of texts and calls', (body) =>
    expect(consentKeyword(body)).toEqual({ state: 'opted-out', channels: ['sms', 'call'] })
  );
  it.each(['START', 'unstop'])('%s opts back in to texts', (body) =>
    expect(consentKeyword(body)).toEqual({ state: 'opted-in', channels: ['sms'] })
  );
  it.each(['please stop', 'unstoppable', 'stop by later?', 'started', 'end'])(
    '%s is not a consent change',
    (body) => expect(consentKeyword(body)).toBeNull()
  );
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

  it('with MESSAGING_PIPELINE off, writes nothing anywhere (today)', async () => {
    const m = memoryStore();
    expect(await recordInboundSmsConsent(PHONE, 'STOP', depsWith(m.store, OFF))).toBeNull();
    expect(m.docs.size + m.legacySms.size + m.legacyCall.size).toBe(0);
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

  it('unknown: yes for the owner, no for a third party; an opt-in lets a third party through', async () => {
    const m = memoryStore();
    const deps = depsWith(m.store);
    expect(await consentBlocks(PHONE, 'sms', owner, deps)).toBeNull();
    expect(await consentBlocks(PHONE, 'sms', stranger, deps)).toBe('no-consent');
    await writeOptIn(HASH, 'sms', 'inbound-sms', deps);
    expect(await consentBlocks(PHONE, 'sms', stranger, deps)).toBeNull();
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
