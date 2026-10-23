/**
 * ENGAGEMENT-SPEC F3: the live senders honour a Focus hold. sendGuardedText
 * holds what Ferni starts, releaseHeldTexts re-reads the hold before a held
 * text goes, and a push Ferni started waits while one marked as asked-for
 * goes. With FOCUS_HOLD off for the person nothing changes and nothing new is read.
 */
import { describe, expect, it, vi } from 'vitest';
import { atomicLocks } from './atomic-locks.js';
import type { CheckinRecord, TextKind } from '../checkin-replies.js';
import {
  focusHeldId,
  pushUnlessFocusHeld,
  type FocusPushDeps,
  type FocusTextDeps,
} from '../focus-send-hold.js';
import {
  sendGuardedText,
  type GuardedText,
  type TextDeps,
  type TextStore,
} from '../guarded-text.js';
import { releaseHeldTexts, type HeldText, type HeldTextStore } from '../held-texts.js';
import type { PushNotificationPayload } from '../../push-notifications.js';

const NOW = new Date('2026-10-22T04:00:00Z');
const CAP = new Date('2026-10-22T14:00:00Z');
const MIN = 60_000;
const ENV = { LOG_HASH_SECRET: 'test-secret' };
const PHONE = '+15551234567';

/** A bogle_users doc with a saved Focus hold (focus-store.ts's shape), in New York (EDT, UTC-4). */
function heldDoc(remindersThrough = true, capUntil = CAP): Record<string, unknown> {
  return {
    messagingPrefs: {
      zone: 'America/New_York',
      focus: {
        held: true,
        kind: 'sleep',
        remindersThrough,
        since: '2026-10-22T02:00:00Z',
        capUntil: capUntil.toISOString(),
        byDevice: { abc: true },
        updatedAt: '2026-10-22T02:00:00Z',
      },
    },
  };
}

/** feature_held_texts in memory: add (with an id, that doc), due, remove. */
function heldStore(): HeldTextStore & { docs: Map<string, Omit<HeldText, 'id'>> } {
  const docs = new Map<string, Omit<HeldText, 'id'>>();
  let n = 0;
  return {
    docs,
    add: vi.fn(async (held: Omit<HeldText, 'id'>, id?: string) => {
      docs.set(id ?? `auto-${++n}`, held);
    }),
    due: async (now: Date) =>
      [...docs]
        .filter(([, h]) => Date.parse(h.releaseAt) <= now.getTime())
        .map(([id, h]) => ({ ...h, id })),
    remove: vi.fn(async (id: string) => {
      docs.delete(id);
    }),
  };
}

function deps(opts: { doc?: Record<string, unknown>; flag?: boolean; at?: Date } = {}) {
  const added: CheckinRecord[] = [];
  const held = heldStore();
  const flagOn = vi.fn(async () => opts.flag !== false);
  const store = {
    forUser: async (u: string) => added.filter((r) => r.userId === u),
    forPhoneHash: async (h: string) => added.filter((r) => r.phoneHash === h),
    add: async (r: CheckinRecord) => {
      added.push(r);
      return 'new';
    },
    ...atomicLocks(),
    sponsoredPhone: async () => undefined,
    isOptedOut: async () => false,
    consentDoc: async () => undefined,
    userDoc: vi.fn(async () => opts.doc),
    legacySmsChannels: async () => undefined,
  } as unknown as TextStore;
  const focus: FocusTextDeps = { held, flagOn };
  const d: TextDeps = {
    env: ENV,
    store,
    authPhone: async () => PHONE,
    send: vi.fn(async () => ({ success: true, messageSid: 'SM1' })),
    now: () => opts.at ?? NOW,
    focus,
  };
  return { d, added, held, flagOn };
}

const text = (kind: TextKind, over: Partial<GuardedText> = {}): GuardedText => ({
  userId: 'u1',
  body: 'How did the biopsy go?',
  kind,
  refId: 'ref-1',
  minGapMs: 20 * 60 * MIN,
  ...over,
});

describe('sendGuardedText with a Focus hold', () => {
  it('a check-in: 0 sends and 1 held doc, reason focus, until the cap', async () => {
    const { d, held } = deps({ doc: heldDoc() });
    expect(await sendGuardedText(text('checkin'), d)).toEqual({
      sent: false,
      reason: 'focus-held',
    });
    expect(d.send).not.toHaveBeenCalled();
    expect([...held.docs.values()]).toEqual([
      { text: text('checkin'), releaseAt: CAP.toISOString(), reason: 'focus' },
    ]);
  });

  it('every kind Ferni starts is held; a sender running again keeps one copy', async () => {
    const { d, held } = deps({ doc: heldDoc() });
    for (const kind of ['checkin', 'follow-up', 'proactive', 'morning-brief'] as const) {
      expect(await sendGuardedText(text(kind), d)).toMatchObject({ reason: 'focus-held' });
    }
    await sendGuardedText(text('follow-up'), d); // the follow-up job's next run
    expect(held.docs.size).toBe(4);
    expect(held.docs.has(focusHeldId(text('follow-up')))).toBe(true);
    expect(d.send).not.toHaveBeenCalled();
  });

  it('what they asked for still goes: a text-me-that, a call result, a coaching pick', async () => {
    for (const kind of ['message', 'call-result', 'coach-media'] as const) {
      const { d, held } = deps({ doc: heldDoc() });
      expect(await sendGuardedText(text(kind), d)).toEqual({ sent: true });
      expect(held.docs.size).toBe(0);
    }
  });

  it('a reminder they timed goes with remindersThrough, and waits without it', async () => {
    const through = deps({ doc: heldDoc(true) });
    expect(await sendGuardedText(text('reminder'), through.d)).toEqual({ sent: true });
    const waits = deps({ doc: heldDoc(false) });
    expect(await sendGuardedText(text('reminder'), waits.d)).toMatchObject({
      reason: 'focus-held',
    });
    expect(waits.d.send).not.toHaveBeenCalled();
    expect(waits.held.docs.size).toBe(1);
  });

  it('past the cap the hold is over: the check-in sends', async () => {
    const { d, held } = deps({ doc: heldDoc(), at: new Date(CAP.getTime() + MIN) });
    expect(await sendGuardedText(text('checkin'), d)).toEqual({ sent: true });
    expect(held.docs.size).toBe(0);
  });

  it('FOCUS_HOLD off for them: a saved hold changes nothing', async () => {
    const { d, held } = deps({ doc: heldDoc(), flag: false });
    expect(await sendGuardedText(text('checkin'), d)).toEqual({ sent: true });
    expect(held.add).not.toHaveBeenCalled();
  });

  it('no saved hold: not even the flag is read', async () => {
    const { d, flagOn } = deps({ doc: {} });
    expect(await sendGuardedText(text('checkin'), d)).toEqual({ sent: true });
    expect(flagOn).not.toHaveBeenCalled();
    expect(d.store.userDoc).toHaveBeenCalledTimes(1); // the read the sender always did
  });
});

describe('releaseHeldTexts after a Focus hold', () => {
  it('still held when it comes due: 0 sends, and the text stays queued', async () => {
    const { d, held } = deps({ doc: heldDoc() });
    await sendGuardedText(text('checkin'), d);
    // A new hold began (the cap passed, then their Work Focus came on): due, but held again.
    const later = new Date(CAP.getTime() + MIN);
    const again = heldDoc();
    focusOf(again).capUntil = '2026-10-22T23:00:00Z';
    const run = deps({ doc: again, at: later });
    const send = vi.fn(sendGuardedText);
    expect(await releaseHeldTexts(held, run.d, send)).toEqual({ sent: 0, dropped: 0, waiting: 1 });
    expect(send).not.toHaveBeenCalled();
    expect(held.remove).not.toHaveBeenCalled();
    expect(held.docs.size).toBe(1);
  });

  it('once the cap has passed, release sends it', async () => {
    const { d, held } = deps({ doc: heldDoc() });
    await sendGuardedText(text('checkin'), d);
    const run = deps({ doc: heldDoc(), at: new Date(CAP.getTime() + MIN) });
    expect(await releaseHeldTexts(held, run.d)).toEqual({ sent: 1, dropped: 0, waiting: 0 });
    expect(run.d.send).toHaveBeenCalledTimes(1);
    expect(held.docs.size).toBe(0);
  });

  it('a hold that comes back between the re-read and the send keeps it queued', async () => {
    const { d, held } = deps({ doc: heldDoc() });
    await sendGuardedText(text('checkin'), d);
    const run = deps({ doc: heldDoc(), at: new Date(CAP.getTime() + MIN) });
    const send = vi.fn(async () => ({ sent: false as const, reason: 'focus-held' as const }));
    expect(await releaseHeldTexts(held, run.d, send)).toEqual({ sent: 0, dropped: 0, waiting: 1 });
    expect(held.docs.size).toBe(1);
  });

  it('a held text whose kind already went out since is dropped, never sent twice', async () => {
    const { d, held } = deps({ doc: heldDoc() });
    await sendGuardedText(text('follow-up'), d);
    const run = deps({ doc: heldDoc(), at: new Date(CAP.getTime() + MIN) });
    const send = vi.fn(async () => ({ sent: false as const, reason: 'recently-sent' as const }));
    expect(await releaseHeldTexts(held, run.d, send)).toEqual({ sent: 0, dropped: 1, waiting: 0 });
  });

  it('flag off: a text held for something else is released with no extra read', async () => {
    const held = heldStore();
    await held.add({ text: text('opt-in'), releaseAt: NOW.toISOString(), reason: 'quiet-hours' });
    const run = deps({ doc: heldDoc(), flag: false });
    expect(await releaseHeldTexts(held, run.d)).toEqual({ sent: 1, dropped: 0, waiting: 0 });
    expect(run.flagOn).not.toHaveBeenCalled(); // opt-in is no kind a Focus holds
  });
});

function focusOf(doc: Record<string, unknown>): Record<string, unknown> {
  return (doc.messagingPrefs as { focus: Record<string, unknown> }).focus;
}

describe('a Focus release never lands in their quiet hours (21:00 to 08:00 theirs)', () => {
  const at = (iso: string): Date => new Date(iso);

  it('a cap at 10:00 their time releases at 10:00', async () => {
    const { d, held } = deps({ doc: heldDoc() }); // CAP 14:00Z = 10:00 EDT
    await sendGuardedText(text('checkin'), d);
    expect([...held.docs.values()][0].releaseAt).toBe(CAP.toISOString());
  });

  it('a Work Focus capped at 03:00 their time releases at 08:00, when quiet hours end', async () => {
    const doc = heldDoc(true, at('2026-10-22T07:00:00Z')); // 03:00 EDT
    const { d, held } = deps({ doc, at: at('2026-10-21T21:00:00Z') });
    await sendGuardedText(text('follow-up'), d);
    expect([...held.docs.values()][0].releaseAt).toBe('2026-10-22T12:00:00.000Z'); // 08:00 EDT
  });

  it('their own quiet window counts: ending 07:00, a 03:00 cap releases at 07:00', async () => {
    const doc = heldDoc(true, at('2026-10-22T07:00:00Z'));
    Object.assign(doc.messagingPrefs as object, { quietStart: '22:00', quietEnd: '07:00' });
    const { d, held } = deps({ doc, at: at('2026-10-21T21:00:00Z') });
    await sendGuardedText(text('checkin'), d);
    expect([...held.docs.values()][0].releaseAt).toBe('2026-10-22T11:00:00.000Z');
  });

  it('a release tried at 02:00 their time sends nothing and keeps the text queued', async () => {
    const held = heldStore(); // due at 01:00 EDT (an older doc, or their zone changed since)
    await held.add({ text: text('checkin'), releaseAt: '2026-10-22T05:00:00Z', reason: 'focus' });
    const run = deps({
      doc: heldDoc(true, at('2026-10-22T05:00:00Z')),
      at: at('2026-10-22T06:00:00Z'),
    });
    const send = vi.fn(sendGuardedText);
    expect(await releaseHeldTexts(held, run.d, send)).toEqual({ sent: 0, dropped: 0, waiting: 1 });
    expect(send).not.toHaveBeenCalled();
    expect(held.docs.size).toBe(1);
    const morning = deps({
      doc: heldDoc(true, at('2026-10-22T05:00:00Z')),
      at: at('2026-10-22T12:01:00Z'),
    });
    expect(await releaseHeldTexts(held, morning.d)).toEqual({ sent: 1, dropped: 0, waiting: 0 });
  });

  it('quiet hours hold a Focus-held text even with FOCUS_HOLD since turned off', async () => {
    const held = heldStore();
    await held.add({ text: text('checkin'), releaseAt: '2026-10-22T05:00:00Z', reason: 'focus' });
    const run = deps({ doc: {}, flag: false, at: at('2026-10-22T06:00:00Z') });
    expect(await releaseHeldTexts(held, run.d)).toMatchObject({ sent: 0, waiting: 1 });
  });
});

describe('pushUnlessFocusHeld', () => {
  const payload: PushNotificationPayload = {
    title: 'Ferni',
    body: 'Thinking of you',
    type: 'ferni_checkin',
  };

  function pushDeps(over: Partial<FocusPushDeps> = {}): FocusPushDeps {
    return {
      flagOn: vi.fn(async () => true),
      userDoc: vi.fn(async () => heldDoc()),
      now: () => NOW,
      send: vi.fn(async () => true),
      ...over,
    };
  }

  it('a push Ferni started is held: not sent', async () => {
    const p = pushDeps();
    expect(await pushUnlessFocusHeld('u1', payload, 'ferni', p)).toBe(false);
    expect(p.send).not.toHaveBeenCalled();
  });

  it('a reminder they timed is sent with remindersThrough, held without it', async () => {
    const through = pushDeps();
    expect(await pushUnlessFocusHeld('u1', payload, 'reminder', through)).toBe(true);
    expect(through.send).toHaveBeenCalledWith('u1', payload);
    const waits = pushDeps({ userDoc: vi.fn(async () => heldDoc(false)) });
    expect(await pushUnlessFocusHeld('u1', payload, 'reminder', waits)).toBe(false);
  });

  it('past the cap, or with their doc unreadable, it is sent', async () => {
    const after = pushDeps({ now: () => new Date(CAP.getTime() + MIN) });
    expect(await pushUnlessFocusHeld('u1', payload, 'ferni', after)).toBe(true);
    const unreadable = pushDeps({ userDoc: vi.fn(async () => Promise.reject(new Error('down'))) });
    expect(await pushUnlessFocusHeld('u1', payload, 'ferni', unreadable)).toBe(true);
  });

  it('flag off: the same payload goes, and their doc is never read', async () => {
    const p = pushDeps({ flagOn: vi.fn(async () => false) });
    expect(await pushUnlessFocusHeld('u1', payload, 'ferni', p)).toBe(true);
    expect(p.send).toHaveBeenCalledWith('u1', payload);
    expect(p.userDoc).not.toHaveBeenCalled();
  });
});

it('focusHeldId is per person, kind and thing it is about', () => {
  expect(focusHeldId(text('checkin'))).toBe(focusHeldId(text('checkin')));
  expect(focusHeldId(text('checkin'))).not.toBe(focusHeldId(text('checkin', { refId: 'ref-2' })));
  expect(focusHeldId(text('checkin'))).not.toContain('u1');
});
