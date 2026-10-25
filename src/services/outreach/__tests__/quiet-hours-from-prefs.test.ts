/**
 * QUIET_HOURS_FROM_PREFS: the quiet hours the menu saves (messagingPrefs) reach
 * every sender through savedQuietHours, read in the person's zone. Their window
 * adds quiet time to each sender's own and never opens one; nothing saved, or
 * the flag off, leaves today's check. Instants are UTC; 2026-10-20 is CDT (UTC-5).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ZonedQuiet } from '../quiet-hours.js';

const docs: Record<string, Record<string, unknown>> = {};
const contactInfo = vi.fn(async (_uid: string) => undefined as { timezone?: string } | undefined);
vi.mock('../user-contact.js', () => ({ getUserContactInfo: contactInfo }));
vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => ({ exists: !!docs[`${name}/${id}`], data: () => docs[`${name}/${id}`] }),
      }),
    }),
  }),
}));

const qh = await import('../quiet-hours.js');
const { checkCallHours } = await import('../call-hours-guard.js');
const { chooseChannel } = await import('../proactive-channels/channel-policy.js');

const CHI = 'America/Chicago';
const NY = 'America/New_York';
const LA = 'America/Los_Angeles';
const at = (iso: string) => new Date(iso);
const CHI_2015 = at('2026-10-21T01:15:00Z'); // Tue 20:15 in Chicago, inside call hours
const CHI_0930_NEXT = at('2026-10-21T14:30:00Z'); // Wed 09:30 in Chicago
const CHI_1500 = at('2026-10-20T20:00:00Z'); // Tue 15:00 in Chicago

/** What POST /api/user/preferences saves for 20:00 to 09:30 (a window over midnight). */
const saved = (extra: Record<string, unknown> = {}) => ({
  messagingPrefs: { quietStart: '20:00', quietEnd: '09:30', zone: CHI, ...extra },
});

beforeEach(() => {
  for (const key of Object.keys(docs)) delete docs[key];
  contactInfo.mockReset().mockResolvedValue({ timezone: CHI });
  vi.stubEnv('QUIET_HOURS_FROM_PREFS', 'on');
  vi.stubEnv('QUIET_HOURS_UNIFIED', '');
});
afterEach(() => vi.unstubAllEnvs());

describe('savedQuietHours: the one reader', () => {
  it('reads the saved window in the zone saved with it', () => {
    expect(qh.savedQuietHours(saved())).toEqual({
      window: { startMin: 20 * 60, endMin: 9 * 60 + 30 },
      zones: [CHI],
      zone: CHI,
    });
    // The schedulers with their own check (automated-scheduler, outreach-worker) switch to it.
    expect(qh.usesSharedQuiet(saved())).toBe(true);
    expect(qh.usesSharedQuiet({})).toBe(false);
  });

  it('is nothing when the flag is off, nothing is saved, or only the older store holds hours', () => {
    expect(qh.savedQuietHours(undefined)).toBeUndefined();
    const older = {
      outreachPreferences: { quietHours: { enabled: true, start: '20:00', end: '09:30' } },
    };
    expect(qh.savedQuietHours(older)).toBeUndefined();
    vi.stubEnv('QUIET_HOURS_FROM_PREFS', 'off');
    expect(qh.savedQuietHours(saved())).toBeUndefined();
    expect(qh.usesSharedQuiet(saved())).toBe(false);
  });

  it('no zone saved: their profile zone; none at all: both US coasts, never no limit', () => {
    const noZone = { messagingPrefs: { quietStart: '20:00', quietEnd: '09:30' } };
    expect(qh.savedQuietHours({ ...noZone, contactInfo: { timezone: CHI } })?.zones).toEqual([CHI]);
    const coasts = qh.savedQuietHours(noZone);
    expect(coasts?.zones).toEqual([NY, LA]);
    expect(coasts?.zone).toBeUndefined();
    expect(qh.isUserQuiet(noZone, at('2026-10-21T04:00:00Z'))).toBe(true); // 21:00 in LA
  });
});

describe('a window that crosses midnight', () => {
  it('is quiet from its start to its end the next morning, in their zone', () => {
    const user = saved();
    expect(qh.quietHoursOf(user, CHI_2015)).toEqual({ quiet: true, until: CHI_0930_NEXT });
    const twoAm = at('2026-10-21T07:00:00Z'); // 02:00 Chicago
    expect(qh.quietHoursOf(user, twoAm).until).toEqual(CHI_0930_NEXT);
    expect(qh.isUserQuiet(user, CHI_0930_NEXT)).toBe(false);
    expect(qh.isUserQuiet(user, at('2026-10-21T00:59:00Z'))).toBe(false); // 19:59
  });

  it('adds quiet time but never opens the default: 23:00 to 07:00 is still quiet at 22:30', () => {
    const user = saved({ quietStart: '23:00', quietEnd: '07:00' });
    const late = at('2026-10-21T03:30:00Z'); // 22:30 Chicago, inside the default 22:00 to 08:00
    expect(qh.quietHoursOf(user, late)).toEqual({
      quiet: true,
      until: at('2026-10-21T13:00:00Z'), // 08:00 Chicago
    });
  });
});

describe('callQuietHours (the call schedulers)', () => {
  it('on: a call at 20:15 their time waits until 09:30; off: as main, it goes', async () => {
    docs['bogle_users/u1'] = saved();
    expect(await qh.callQuietHours('u1', CHI_2015)).toEqual({ quiet: true, until: CHI_0930_NEXT });
    vi.stubEnv('QUIET_HOURS_FROM_PREFS', 'off');
    expect(await qh.callQuietHours('u1', CHI_2015)).toEqual({ quiet: false, until: CHI_2015 });
  });
});

describe('checkCallHours (the call-hours guard)', () => {
  it('refuses a call inside their saved window and offers the window end', async () => {
    docs['bogle_users/u1'] = saved();
    const decision = await checkCallHours({ now: CHI_2015, recipientUserId: 'u1' });
    expect(decision).toMatchObject({ allowed: false, timezone: CHI, source: 'stored' });
    expect(decision.at).toEqual(CHI_0930_NEXT);
    expect((await checkCallHours({ now: CHI_1500, recipientUserId: 'u1' })).allowed).toBe(true);
  });

  it('a call they asked for is held by call hours only, not their saved window', async () => {
    docs['bogle_users/u1'] = saved();
    const asked = await checkCallHours({ now: CHI_2015, recipientUserId: 'u1', userAsked: true });
    expect(asked.allowed).toBe(true);
  });

  it('a daytime window (12:00 to 14:00) holds a 12:30 call until 14:00', async () => {
    docs['bogle_users/u1'] = saved({ quietStart: '12:00', quietEnd: '14:00' });
    const decision = await checkCallHours({
      now: at('2026-10-20T17:30:00Z'),
      recipientUserId: 'u1',
    });
    expect(decision.at).toEqual(at('2026-10-20T19:00:00Z'));
  });

  it('flag off: the saved window is not read and the call goes, as on main', async () => {
    docs['bogle_users/u1'] = saved();
    vi.stubEnv('QUIET_HOURS_FROM_PREFS', 'off');
    const decision = await checkCallHours({ now: CHI_2015, recipientUserId: 'u1' });
    expect(decision).toEqual({ allowed: true, at: CHI_2015, timezone: CHI, source: 'stored' });
  });

  it('uses the zone saved with the window when the profile has none', async () => {
    contactInfo.mockResolvedValue(undefined);
    docs['bogle_users/u1'] = saved();
    const decision = await checkCallHours({ now: CHI_1500, recipientUserId: 'u1' });
    expect(decision).toMatchObject({ allowed: true, timezone: CHI, source: 'stored' });
  });
});

describe('the proactive check-in policy', () => {
  const policy = (now: Date, savedQuiet: ZonedQuiet | null = qh.savedQuietHours(saved())!) => ({
    trigger: { weight: 'light' as const, timely: true },
    now,
    prefs: { channels: ['sms'] },
    timezone: CHI,
    verifiedPhone: '+13125550100',
    recent: [],
    canCall: false,
    optedOut: { sms: false, call: false },
    ...(savedQuiet && { savedQuiet }),
  });

  it('holds a text inside the saved window and sends one outside it', () => {
    expect(chooseChannel(policy(CHI_2015))).toEqual({ channel: null, why: 'quiet hours' });
    expect(chooseChannel(policy(CHI_1500)).channel).toBe('sms');
    expect(chooseChannel(policy(CHI_2015, null)).channel).toBe('sms'); // nothing saved
  });
});
