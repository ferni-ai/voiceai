/**
 * MINOR_CARE=on, the shared persistence layer (createPersistenceStore): the hold is the default,
 * so every store built on it neither caches nor writes a held caller under 18 (not a verified
 * owner), and keeps refusing them in this process once the hold lapses (anything it learned in
 * memory while they were held would otherwise be written then). A store that opts out
 * (credentials, push endpoints, billing) still writes. The voice prosody store (pitch, energy,
 * and the conversation topic per sample) is built on it. Only Firestore is faked.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const written = vi.hoisted(() => [] as { path: string; data: unknown }[]);

/** A fake Firestore that records every write (path and data). */
const fakeDb = vi.hoisted(() => {
  const empty = { exists: false, empty: true, docs: [], size: 0, data: () => undefined };
  const ref = (path: string): Record<string, unknown> =>
    new Proxy(
      {
        path,
        collection: (name: string) => ref(`${path}/${name}`),
        doc: (id = 'auto') => ref(`${path}/${id}`),
        get: async () => empty,
        set: async (data: unknown) => void written.push({ path, data }),
      } as Record<string | symbol, unknown>,
      { get: (t, k) => (k in t ? t[k] : k === 'then' ? undefined : () => ref(path)) }
    );
  const tx = (r: { path: string }, data: unknown) => void written.push({ path: r.path, data });
  return Object.assign(ref(''), {
    batch: () => ({ set: tx, update: tx, delete: tx, commit: async () => undefined }),
  });
});
vi.mock('@google-cloud/firestore', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  Firestore: class {
    constructor() {
      return fakeDb;
    }
  },
}));

import { createPersistenceStore } from '../../services/persistence/index.js';
import { recordVoiceSample } from '../../services/trust-systems/voice-prosody-learning.js';
import { initializeOutreachPersistence, setPreferences } from '../../services/outreach/outreach-intelligence.js';
import {
  initMonetizationPersistence,
  saveUserJourney,
  saveValueEvent,
} from '../../services/monetization/persistence.js';
import { heldAfter, resetMinorCare, setVerifiedOwnerCheck, userHeld } from '../minor-care.js';

type Case = 'held' | 'owner' | 'off';
let n = 0;

/** A caller in the given state; 'mid' says it later (hold()). */
function caller(c: Case | 'mid', userId?: string): { userId: string; hold: () => void } {
  const sessionId = `shared-${c}-${++n}`;
  const id = userId ?? `user-${sessionId}`;
  vi.stubEnv('MINOR_CARE', c === 'off' ? 'off' : 'on');
  if (c === 'owner') setVerifiedOwnerCheck((s) => s === sessionId);
  const hold = () => void heldAfter(sessionId, "I'm 16 years old and bored", { userId: id });
  if (c !== 'mid') hold();
  return { userId: id, hold };
}

const wrote = (userId: string, marker: string): boolean =>
  written.some((w) => w.path.includes(userId) && JSON.stringify(w.data).includes(marker));

/** Advance the sync interval, then let its first-use Firestore import settle. */
async function tick(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await vi.dynamicImportSettled();
  await vi.advanceTimersByTimeAsync(0);
}

let stores = 0;
/** A store built the way every caller builds one: no holdWrites unless it opts out. */
function store(optOut = false) {
  return createPersistenceStore<{ note: string }>({
    collection: `minor_care_test_${++stores}`,
    syncIntervalMs: 1_000,
    ...(optOut ? { holdWrites: () => false } : {}),
  });
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearInterval', 'clearTimeout', 'Date'] });
  // Initialise the layer's Firestore once: two stores' first flushes racing it would get null
  const warm = store();
  warm.set('warm-up', { note: 'warm' });
  await tick(1_000);
});
afterAll(() => {
  vi.useRealTimers();
});
beforeEach(() => {
  written.length = 0;
});
afterEach(() => {
  resetMinorCare();
  vi.unstubAllEnvs();
});

describe('createPersistenceStore holds by default', () => {
  it.each<[Case, boolean]>([
    ['held', false],
    ['owner', true],
    ['off', true],
  ])('%s: written = %s', async (c, writes) => {
    const s = store();
    const { userId } = caller(c);
    s.set(userId, { note: 'what they said' });
    // Not even cached for a held user: checked before any sync could drop it
    expect(await s.get(userId).then((d) => d?.note)).toBe(writes ? 'what they said' : undefined);
    await tick(1_000);
    expect(wrote(userId, 'what they said')).toBe(writes);
  });

  it('a hold that starts mid-call stops the next write, and stays after it lapses', async () => {
    const s = store();
    const who = caller('mid');
    s.set(who.userId, { note: 'before' });
    await tick(1_000);
    expect(wrote(who.userId, 'before')).toBe(true);
    who.hold();
    s.set(who.userId, { note: 'while held' });
    await tick(1_000);
    expect(wrote(who.userId, 'while held')).toBe(false);
    await vi.advanceTimersByTimeAsync(7 * 60 * 60 * 1000); // past the 6 h hold
    expect(userHeld(who.userId)).toBe(false);
    s.set(who.userId, { note: 'after it lapsed' });
    await tick(1_000);
    expect(wrote(who.userId, 'after it lapsed')).toBe(false);
  });

  it('flushUser: queued before the hold, not written once held', async () => {
    const s = store();
    const who = caller('mid');
    s.set(who.userId, { note: 'queued' });
    who.hold();
    await s.flushUser(who.userId);
    expect(wrote(who.userId, 'queued')).toBe(false);
  });

  it('a store that opts out (credentials, billing) still writes a held user', async () => {
    const s = store(true);
    const { userId } = caller('held');
    s.set(userId, { note: 'a token' });
    await tick(1_000);
    expect(wrote(userId, 'a token')).toBe(true);
  });
});

describe('placeholder ids are never held', () => {
  it.each(['anonymous', 'Anonymous', 'default', 'unknown', ' '])('%j', async (id) => {
    caller('held', id);
    expect(userHeld(id)).toBe(false);
    const s = store();
    s.set(id, { note: 'shared bucket' });
    await tick(1_000);
    expect(written.some((w) => JSON.stringify(w.data).includes('shared bucket'))).toBe(true);
  });

  it('a per-device anon:<id> is one caller, so it is held', () => {
    const { userId } = caller('held', 'anon:device-123');
    expect(userHeld(userId)).toBe(true);
  });
});

const VOICE = {
  pitchMean: 210,
  pitchRange: 30,
  pitchVariability: 0.3,
  energyMean: 0.5,
  energyRange: 0.2,
  energyVariability: 0.3,
  speakingRate: 150,
  pauseFrequency: 3,
  pauseDuration: 300,
  breathiness: 0.3,
  tension: 0.3,
} as never;

describe('voice prosody (built on the shared store, 10 s sync)', () => {
  it.each<[Case, boolean]>([
    ['held', false],
    ['owner', true],
    ['off', true],
  ])('%s: their voice and topic written = %s', async (c, writes) => {
    const { userId } = caller(c);
    recordVoiceSample(userId, VOICE, { conversationContext: 'math class' });
    await tick(10_000);
    expect(wrote(userId, 'math class')).toBe(writes);
  });

  it('a hold that starts mid-call stops the next write', async () => {
    const who = caller('mid');
    recordVoiceSample(who.userId, VOICE, { conversationContext: 'before' });
    await tick(10_000);
    expect(wrote(who.userId, 'before')).toBe(true);
    who.hold();
    recordVoiceSample(who.userId, VOICE, { conversationContext: 'my school' });
    await tick(10_000);
    expect(wrote(who.userId, 'my school')).toBe(false);
  });
});

describe('opted out: a held user\'s consent and billing still persist', () => {
  it('outreach: turning outreach off (do-not-contact) is written', async () => {
    await initializeOutreachPersistence();
    const { userId } = caller('held');
    setPreferences(userId, { enabled: false, quietHoursStart: '20:00' });
    await tick(10_000);
    expect(wrote(userId, '"quietHoursStart":"20:00"')).toBe(true);
  });

  it('billing: a contribution record and the journey are written', async () => {
    initMonetizationPersistence();
    const { userId } = caller('held');
    await saveValueEvent(userId, {
      id: 'v1',
      type: 'tip',
      contributionCents: 500,
      status: 'contributed',
      createdAt: new Date().toISOString(),
    });
    await saveUserJourney(userId, { userId, stage: 'paid-stage-marker' } as never);
    await tick(5_000);
    expect(wrote(userId, '"contributionCents":500')).toBe(true);
    expect(wrote(userId, 'paid-stage-marker')).toBe(true);
  });

  it('and an ordinary write for the same held user is still dropped', async () => {
    const s = store();
    const { userId } = caller('held');
    s.set(userId, { note: 'their school' });
    await tick(1_000);
    expect(wrote(userId, 'their school')).toBe(false);
  });
});
