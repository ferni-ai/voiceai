/**
 * MINOR_CARE=on, the shared persistence layer (createPersistenceStore): the hold is the default,
 * so every store built on it neither caches nor writes a held caller under 18 (not a verified
 * owner), and keeps refusing them in this process once the hold lapses (anything it learned in
 * memory while they were held would otherwise be written then). A store that opts out
 * (credentials, push endpoints, billing) still writes. The voice prosody store (pitch, energy,
 * and the conversation topic per sample) is built on it. Only Firestore is faked.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const written = vi.hoisted(() => [] as { path: string; data: unknown; merge?: boolean }[]);
/** Paths whose next `left` direct writes fail (Firestore unavailable), running `during` first. */
const failing = vi.hoisted(
  () => new Map<string, { left: number; failed: number; during?: () => unknown }>()
);
/** Calendar documents as stored: a merge write merges maps and replaces arrays, like Firestore. */
const calendarDocs = vi.hoisted(() => new Map<string, Record<string, unknown>>());

/** A fake Firestore that records every write (path and data). */
const fakeDb = vi.hoisted(() => {
  const empty = { exists: false, empty: true, docs: [], size: 0, data: () => undefined };
  const isMap = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);
  const merge = (to: Record<string, unknown>, from: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(from))
      to[k] = isMap(v) && isMap(to[k]) ? merge({ ...(to[k] as object) } as never, v) : v;
    return to;
  };
  const record = (path: string, data: unknown, opts?: { merge?: boolean }) => {
    written.push({ path, data, merge: opts?.merge });
    if (!path.includes('/calendar_reminders/')) return;
    const doc = data as Record<string, unknown>;
    calendarDocs.set(path, opts?.merge ? merge({ ...calendarDocs.get(path) }, doc) : doc);
  };
  const ref = (path: string): Record<string, unknown> =>
    new Proxy(
      {
        path,
        collection: (name: string) => ref(`${path}/${name}`),
        doc: (id = 'auto') => ref(`${path}/${id}`),
        get: async () => {
          const doc = calendarDocs.get(path);
          return doc ? { exists: true, data: () => structuredClone(doc) } : empty;
        },
        set: async (data: unknown, opts?: { merge?: boolean }) => {
          for (const [p, f] of failing) {
            if (!path.includes(p) || f.left <= 0) continue;
            f.left--;
            f.failed++;
            await f.during?.();
            throw new Error('unavailable');
          }
          record(path, data, opts);
        },
      } as Record<string | symbol, unknown>,
      { get: (t, k) => (k in t ? t[k] : k === 'then' ? undefined : () => ref(path)) }
    );
  const tx = (r: { path: string }, data: unknown, opts?: { merge?: boolean }) =>
    record(r.path, data, opts);
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
import {
  initializeOutreachPersistence,
  setPreferences,
} from '../../services/outreach/outreach-intelligence.js';
import {
  initMonetizationPersistence,
  saveUserJourney,
  saveValueEvent,
} from '../../services/monetization/persistence.js';
import { detect, recordContribution } from '../../services/monetization/value-capture.js';
import {
  getUpcomingEvents,
  shutdownCalendarReminders,
  upsertEvent,
} from '../../services/scheduling/calendar-reminders.js';
import { getMayaNotificationService } from '../../services/engagement/engagement-notification-service.js';
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
  vi.useFakeTimers({
    toFake: ['setTimeout', 'setInterval', 'clearInterval', 'clearTimeout', 'Date'],
  });
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

/** The writes to this user's document in one collection. */
const writesTo = (userId: string, collection: string) =>
  written.filter((w) => w.path.includes(userId) && w.path.includes(`/${collection}/`));
const keysOf = (w: { data: unknown }) =>
  Object.keys(w.data as object).filter((k) => !k.startsWith('_'));

describe('field-level hold (whenHeld): only consent fields persist, as a merge write', () => {
  it("a store with whenHeld: a held user's allowed fields persist, the rest never written", async () => {
    const s = createPersistenceStore<{ prefs: { off: boolean }; story: string }>({
      collection: 'minor_care_fields',
      syncIntervalMs: 1_000,
      whenHeld: (d: { prefs: { off: boolean } }) => ({ prefs: d.prefs }),
    });
    const held = caller('held');
    const owner = caller('owner');
    s.set(held.userId, { prefs: { off: true }, story: 'their school' });
    s.set(owner.userId, { prefs: { off: false }, story: 'owner story' });
    await tick(1_000);
    const [h] = writesTo(held.userId, 'minor_care_fields');
    expect(h && keysOf(h)).toEqual(['prefs']);
    expect(h?.merge).toBe(true); // a merge write: stored fields are never blanked
    expect(wrote(held.userId, 'their school')).toBe(false);
    expect(wrote(owner.userId, 'owner story')).toBe(true);
  });

  it('a failed field write is put back and written after its backoff (2 s), never dropped', async () => {
    const s = createPersistenceStore<{ prefs: { off: boolean }; story: string }>({
      collection: 'minor_care_retry',
      syncIntervalMs: 1_000,
      whenHeld: (d: { prefs: { off: boolean } }) => ({ prefs: d.prefs }),
    });
    const held = caller('held');
    s.set(held.userId, { prefs: { off: true }, story: 'their school' });
    failing.set('/minor_care_retry/', { left: 1, failed: 0 });
    await tick(1_000);
    expect(failing.get('/minor_care_retry/')?.failed).toBe(1); // tried, and failed
    expect(writesTo(held.userId, 'minor_care_retry')).toEqual([]);
    await tick(2_000);
    const [w] = writesTo(held.userId, 'minor_care_retry');
    expect(w && keysOf(w)).toEqual(['prefs']);
    expect(wrote(held.userId, '"off":true')).toBe(true);
    expect(wrote(held.userId, 'their school')).toBe(false);
  });

  it('a user deleted while their field write fails: the part is never written', async () => {
    const s = createPersistenceStore<{ prefs: { off: boolean }; story: string }>({
      collection: 'minor_care_deleted',
      syncIntervalMs: 1_000,
      whenHeld: (d: { prefs: { off: boolean } }) => ({ prefs: d.prefs }),
    });
    const held = caller('held');
    s.set(held.userId, { prefs: { off: true }, story: 'their school' });
    // A GDPR delete lands while the write is in flight, then the write fails
    failing.set('/minor_care_deleted/', {
      left: 1,
      failed: 0,
      during: () => s.delete(held.userId),
    });
    await tick(1_000);
    expect(failing.get('/minor_care_deleted/')?.failed).toBe(1);
    for (let i = 0; i < 10; i++) await tick(1_000); // past its backoff
    expect(writesTo(held.userId, 'minor_care_deleted')).toEqual([]);
  });

  /** A store whose held users keep only prefs, and a held caller with a pending opt-out. */
  function pendingOptOut(collection: string) {
    const s = createPersistenceStore<{ prefs: { off: boolean; n?: number }; story: string }>({
      collection,
      syncIntervalMs: 1_000,
      whenHeld: (d: { prefs: { off: boolean } }) => ({ prefs: d.prefs }),
    });
    const held = caller('held');
    s.set(held.userId, { prefs: { off: true }, story: 'their school' });
    return { s, userId: held.userId };
  }

  it('consent is never dropped: after 6 failed writes it is still pending, then written', async () => {
    const { userId } = pendingOptOut('minor_care_never_dropped');
    const fail = { left: 6, failed: 0 };
    failing.set('/minor_care_never_dropped/', fail);
    // Backoff: 2 s, 4 s, 8 s ... between tries, so a few minutes covers 7 tries
    for (let i = 0; i < 300 && writesTo(userId, 'minor_care_never_dropped').length === 0; i++)
      await tick(1_000);
    expect(fail.failed).toBe(6);
    const [w] = writesTo(userId, 'minor_care_never_dropped');
    expect(w && keysOf(w)).toEqual(['prefs']);
  });

  it('a failed write backs off; a new opt-out resets it and is written on the next sync', async () => {
    const { s, userId } = pendingOptOut('minor_care_backoff');
    const fail = { left: 3, failed: 0 };
    failing.set('/minor_care_backoff/', fail);
    for (let i = 0; i < 20 && fail.failed < 3; i++) await tick(1_000);
    expect(fail.failed).toBe(3); // the next try is 16 s away
    await tick(1_000);
    expect(writesTo(userId, 'minor_care_backoff')).toEqual([]); // backing off
    s.set(userId, { prefs: { off: true, n: 2 }, story: 'more of their school' });
    await tick(1_000);
    expect(wrote(userId, '"n":2')).toBe(true);
    expect(wrote(userId, 'their school')).toBe(false);
  });

  it('outreach: outreach off and quiet hours persist; commitments never written', async () => {
    await initializeOutreachPersistence();
    const { userId } = caller('held');
    setPreferences(userId, { enabled: false, quietHoursStart: '20:00' });
    await tick(10_000);
    const [w] = writesTo(userId, 'outreach_data');
    expect(w && keysOf(w)).toEqual(['preferences']);
    expect(w?.merge).toBe(true);
    expect(wrote(userId, '"quietHoursStart":"20:00"')).toBe(true);
  });

  it('outreach: an owner writes the whole document', async () => {
    await initializeOutreachPersistence();
    const { userId } = caller('owner');
    setPreferences(userId, { enabled: false });
    await tick(10_000);
    const [w] = writesTo(userId, 'outreach_data');
    expect(w && keysOf(w)).toEqual(expect.arrayContaining(['preferences', 'commitments']));
  });

  it('notifications: opt-outs persist; scheduled notification content never written', async () => {
    const maya = getMayaNotificationService();
    await maya.initialize();
    const { userId } = caller('held');
    await maya.setPreferences(userId, { enabled: false });
    await tick(15_000);
    const [w] = writesTo(userId, 'maya_notifications');
    expect(w && keysOf(w)).toEqual(['preferences']);
    expect(w?.merge).toBe(true);
  });

  it("calendar: event title, place and attendees never written; an owner's are", async () => {
    const event = (userId: string, title: string) => ({
      id: `e-${userId}`,
      userId,
      title,
      location: 'their school',
      attendees: ['a friend'],
      startTime: new Date(Date.now() + 86_400_000),
      endTime: new Date(Date.now() + 90_000_000),
      isAllDay: false,
      reminders: [],
      source: 'manual' as const,
    });
    const held = caller('held');
    const owner = caller('owner');
    await upsertEvent(event(held.userId, 'held title'));
    await upsertEvent(event(owner.userId, 'owner title'));
    await tick(5_000);
    expect(
      writesTo(held.userId, 'calendar_reminders').every(
        (w) => keysOf(w).sort().join() === 'eventFlags,remindersSent'
      )
    ).toBe(true);
    expect(wrote(held.userId, 'held title')).toBe(false);
    expect(wrote(held.userId, 'their school')).toBe(false);
    expect(wrote(owner.userId, 'owner title')).toBe(true);
  });

  it('calendar: a held user cancels a stored event; it stays cancelled, no content written', async () => {
    const who = caller('mid');
    const event = {
      id: `stored-${who.userId}`,
      userId: who.userId,
      title: 'stored title',
      location: 'their school',
      attendees: ['a friend'],
      startTime: new Date(Date.now() + 86_400_000),
      endTime: new Date(Date.now() + 90_000_000),
      isAllDay: false,
      reminders: [],
      source: 'manual' as const,
    };
    await upsertEvent(event);
    await tick(5_000); // stored before the hold, with its content
    who.hold();
    written.length = 0;
    await upsertEvent({ ...event, cancelled: true });
    await tick(5_000);
    const writes = writesTo(who.userId, 'calendar_reminders');
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.every((w) => keysOf(w).sort().join() === 'eventFlags,remindersSent')).toBe(true);
    expect(wrote(who.userId, 'stored title')).toBe(false);
    expect(wrote(who.userId, 'their school')).toBe(false);
    expect(wrote(who.userId, 'a friend')).toBe(false);
    // A fresh process reloads the stored event: content from before the hold, now cancelled
    await shutdownCalendarReminders();
    await upsertEvent({ ...event, id: `other-${who.userId}`, title: 'other' });
    const [stored] = getUpcomingEvents(who.userId, 48).filter((e) => e.id === event.id);
    expect(stored).toMatchObject({ title: 'stored title', cancelled: true });
  });
});

describe('billing', () => {
  it('value capture: what a held caller said is never stored; their payment record is', async () => {
    vi.stubEnv('PAYWALL', 'on');
    initMonetizationPersistence();
    const { userId } = caller('held');
    const event = await detect({ userId, message: 'I got a raise today!', conversationId: 'c1' });
    expect(event).not.toBeNull();
    await tick(3_000);
    expect(wrote(userId, 'financial_gain')).toBe(false);
    await recordContribution({ eventId: event!.id, amountCents: 500, stripePaymentId: 'pi_1' });
    await tick(3_000);
    expect(wrote(userId, 'pi_1')).toBe(true);
  });

  it('a direct contribution record is written for a held user', async () => {
    initMonetizationPersistence();
    const { userId } = caller('held');
    await saveValueEvent(userId, {
      id: 'v1',
      type: 'tip',
      contributionCents: 500,
      status: 'contributed',
      createdAt: new Date().toISOString(),
    });
    await tick(3_000);
    expect(wrote(userId, '"contributionCents":500')).toBe(true);
  });

  it('the journey (milestones, not a payment) is held', async () => {
    initMonetizationPersistence();
    const { userId } = caller('held');
    await saveUserJourney(userId, { userId, stage: 'journey-marker' } as never);
    await tick(5_000);
    expect(wrote(userId, 'journey-marker')).toBe(false);
  });
});
