/**
 * Outreach reaches everyone by default, in-app only. A user who switched it
 * off gets nothing, and texts/email/calls go only to users who chose them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = { id: string; data: Record<string, unknown> };
let users: Doc[] = [];
const setCalls: Array<{ id: string; value: unknown; opts: unknown }> = [];
let dbAvailable = true;

/** Enough of Firestore for bogle_users paging and doc reads/writes. */
function fakeDb() {
  const query = (after?: string, n = Infinity) => ({
    orderBy: () => query(after, n),
    limit: (k: number) => query(after, k),
    startAfter: (id: string) => query(id, n),
    get: async () => {
      const sorted = [...users].sort((a, b) => (a.id < b.id ? -1 : 1));
      const docs = sorted
        .filter((u) => after === undefined || u.id > after)
        .slice(0, n)
        .map((u) => ({ id: u.id, data: () => u.data }));
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
  });
  return {
    collection: () => ({
      ...query(),
      doc: (id: string) => ({
        get: async () => {
          const u = users.find((x) => x.id === id);
          return { exists: !!u, data: () => u?.data };
        },
        set: async (value: unknown, opts: unknown) => void setCalls.push({ id, value, opts }),
        update: async () => undefined,
      }),
    }),
  };
}

vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => (dbAvailable ? fakeDb() : null),
}));
vi.mock('../unified-delivery.js', () => ({
  deliver: vi.fn(),
  getChannelStatus: vi.fn(async () => ({
    email: { available: true },
    sms: { available: true },
    voice_call: { available: true },
    push: { available: true },
    in_app: { available: true },
  })),
}));
// Engagement history prefers email; without the user's consent that must not matter.
vi.mock('../engagement-tracking.js', () => ({
  getOptimalOutreachTime: vi.fn(),
  getPreferredChannel: vi.fn(async () => 'email'),
}));
vi.mock('../intelligent-onboarding-arc.js', () => ({
  getOnboardingState: vi.fn(async () => null),
  getPendingCheckIns: vi.fn(async () => []),
}));
vi.mock('../llm-content-generator.js', () => ({ generatePersonalizedContent: vi.fn() }));
const confirmSmsOptIn = vi.hoisted(() => vi.fn(async () => 'sent'));
vi.mock('../opt-in-text.js', () => ({ confirmSmsOptIn }));
// Consent history is appended with arrayUnion; seen here as the entries it would add.
vi.mock('firebase-admin/firestore', async (orig) => ({
  ...(await orig<object>()),
  FieldValue: { arrayUnion: (...entries: unknown[]) => ({ arrayUnion: entries }) },
}));

const consent = await import('../outreach-consent.js');
const { deliver } = await import('../unified-delivery.js');
const { runDailyOutreach } = await import('../automated-scheduler.js');

const longAgo = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
const user = (id: string, extra: Record<string, unknown> = {}): Doc => ({
  id,
  data: { createdAt: longAgo, email: `${id}@example.com`, phone: '+15555550100', ...extra },
});

beforeEach(() => {
  users = [];
  setCalls.length = 0;
  dbAvailable = true;
});
afterEach(() => vi.unstubAllEnvs());

describe('outreach consent mapping', () => {
  it('defaults to on with no opt-in channels', () => {
    expect(consent.consentFromPrefs(undefined)).toEqual({ enabled: true, channels: [] });
    expect(consent.allowedDeliveryChannels(undefined)).toEqual(['in_app']);
    expect(consent.allowedDeliveryChannels({ enabled: true })).toEqual(['in_app']);
  });

  it('honours an explicit off and drops unknown channels', () => {
    expect(consent.consentFromPrefs({ enabled: false }).enabled).toBe(false);
    expect(consent.consentFromPrefs({ channels: ['sms', 'carrier-pigeon'] }).channels).toEqual([
      'sms',
    ]);
  });

  it('maps settings names to delivery channels and back', () => {
    expect(consent.channelsFromSettings(['call', 'email', 'nope'])).toEqual([
      'voice_call',
      'email',
    ]);
    expect(consent.channelsFromSettings('sms')).toEqual([]);
    expect(consent.settingsFromChannels(['voice_call', 'in_app', 'sms'])).toEqual(['sms', 'call']);
  });

  it('saves with merge so other profile fields survive', async () => {
    await consent.writeOutreachConsent('u1', { enabled: false, channels: ['sms', 'in_app'] });
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0].opts).toEqual({ merge: true });
    expect(setCalls[0].value).toMatchObject({
      outreachPreferences: { enabled: false, channels: ['sms'] },
    });
  });

  it('saves proactive frequency and quiet hours from the settings body, dropping junk', async () => {
    const body = {
      enabled: true,
      allowedChannels: ['sms', 'call'],
      proactiveFrequency: 'gentle',
      quietHours: { start: 21, end: '08:00' },
    };
    await consent.writeOutreachConsent('u1', consent.consentPatchFrom(body));
    expect(setCalls[0].value).toMatchObject({
      outreachPreferences: {
        enabled: true,
        channels: ['sms', 'voice_call'],
        proactiveFrequency: 'gentle',
        quietHours: { enabled: true, start: '21:00', end: '08:00' },
      },
    });
    const junk = { proactiveFrequency: 'always', quietHours: { start: 25, end: 'noon' } };
    expect(consent.proactiveSettingsFrom(junk)).toEqual({});
  });

  it('records proof of consent when texts or calls go on, and revokedAt when they go off', async () => {
    const how = { disclosureVersion: consent.CURRENT_SMS_DISCLOSURE, source: 'web-settings' };
    users = [user('u1', { outreachPreferences: { channels: [] } })];
    await consent.writeOutreachConsent('u1', { channels: ['sms', 'voice_call'] }, how);
    const granted = (setCalls[0].value as { outreachPreferences: Record<string, unknown> })
      .outreachPreferences;
    for (const [field, channel] of [
      ['smsConsent', 'sms'],
      ['callConsent', 'call'],
    ]) {
      expect(granted[field]).toEqual({
        grantedAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
        disclosureVersion: '2026-10-18',
        source: 'web-settings',
        channel,
        scope: 'all',
        revokedAt: null,
      });
    }
    // Each grant is appended to the history too, never only overwritten.
    expect(granted.smsConsentHistory).toEqual({ arrayUnion: [granted.smsConsent] });

    users = [user('u1', { outreachPreferences: { channels: ['sms', 'voice_call'] } })];
    await consent.writeOutreachConsent('u1', { channels: ['voice_call'] }, how);
    const revoked = (setCalls[1].value as { outreachPreferences: Record<string, unknown> })
      .outreachPreferences;
    // Only revokedAt: the merge keeps the original grant on record.
    expect(revoked.smsConsent).toEqual({ revokedAt: expect.stringMatching(/^\d{4}-/) });
    expect(revoked).not.toHaveProperty('callConsent'); // unchanged, so untouched
  });

  it('SMS_OPT_IN_CONFIRM off (default): consent is recorded, no confirmation is sent', async () => {
    confirmSmsOptIn.mockClear();
    vi.stubEnv('SMS_OPT_IN_CONFIRM', undefined);
    const web = { disclosureVersion: consent.CURRENT_SMS_DISCLOSURE, source: 'web-settings' };
    users = [user('u1', { outreachPreferences: { channels: [] } })];
    await consent.writeOutreachConsent('u1', { channels: ['sms'] }, web);
    const prefs = (setCalls[0].value as { outreachPreferences: Record<string, unknown> })
      .outreachPreferences;
    expect(prefs.smsConsent).toEqual({
      grantedAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
      disclosureVersion: consent.CURRENT_SMS_DISCLOSURE,
      source: 'web-settings',
      channel: 'sms',
      scope: 'all',
      revokedAt: null,
    });
    vi.stubEnv('SMS_OPT_IN_CONFIRM', 'off');
    users = [user('u1', { outreachPreferences: { channels: [] } })];
    await consent.writeOutreachConsent('u1', { channels: ['sms'] }, web);
    expect(confirmSmsOptIn).not.toHaveBeenCalled();
  });

  it('texts going on in settings send one confirmation; going off, or another source, none', async () => {
    confirmSmsOptIn.mockClear();
    vi.stubEnv('SMS_OPT_IN_CONFIRM', 'on');
    const web = { disclosureVersion: consent.CURRENT_SMS_DISCLOSURE, source: 'web-settings' };
    users = [user('u1', { outreachPreferences: { channels: [] } })];
    await consent.writeOutreachConsent('u1', { channels: ['sms'] }, web);
    const granted = (
      setCalls[0].value as { outreachPreferences: { smsConsent: { grantedAt: string } } }
    ).outreachPreferences.smsConsent.grantedAt;
    expect(confirmSmsOptIn).toHaveBeenCalledWith('u1', granted);
    await consent.writeOutreachConsent('u1', { channels: ['voice_call'] }, web); // calls only: no sms grant
    users = [user('u1', { outreachPreferences: { channels: ['sms'] } })];
    await consent.writeOutreachConsent('u1', { channels: ['sms'] }, web); // already on
    await consent.writeOutreachConsent('u1', { channels: [] }, web); // off
    users = [user('u1', { outreachPreferences: { channels: [] } })];
    await consent.writeOutreachConsent('u1', { channels: ['sms'] }); // not from settings
    expect(confirmSmsOptIn).toHaveBeenCalledTimes(1);
  });

  it('consent given on a call is recorded as covering only texts they ask for, and appended', async () => {
    const proof = { sessionId: 'call-1', nonce: 'n-1' };
    await consent.recordVoiceSmsConsent('u1', proof, new Date('2026-10-18T15:00:00Z'));
    const smsConsent = {
      grantedAt: '2026-10-18T15:00:00.000Z',
      disclosureVersion: consent.CURRENT_VOICE_DISCLOSURE,
      source: 'voice',
      channel: 'sms',
      scope: 'requested',
      revokedAt: null,
      ...proof,
    };
    expect(setCalls[0].value).toEqual({
      outreachPreferences: { smsConsent, smsConsentHistory: { arrayUnion: [smsConsent] } },
    });
    expect(consent.hasSmsConsent({ smsConsent })).toBe(true);
    expect(consent.hasSmsConsent({ smsConsent: { grantedAt: 'x', revokedAt: 'y' } })).toBe(false);
    expect(consent.hasSmsConsent({ channels: ['sms'] })).toBe(true);
    expect(consent.hasSmsConsent(undefined)).toBe(false);
  });

  it('a settings save without texts revokes consent given on a call, and appends the revocation', async () => {
    const voice = { grantedAt: 'g', scope: 'requested', source: 'voice', revokedAt: null };
    users = [user('u1', { outreachPreferences: { channels: [], smsConsent: voice } })];
    await consent.writeOutreachConsent(
      'u1',
      { channels: ['voice_call'] },
      { source: 'web-settings' }
    );
    const prefs = (setCalls[0].value as { outreachPreferences: Record<string, unknown> })
      .outreachPreferences;
    expect(prefs.smsConsent).toEqual({ revokedAt: expect.stringMatching(/^\d{4}-/) });
    expect(prefs.smsConsentHistory).toEqual({
      arrayUnion: [{ revokedAt: expect.any(String), source: 'web-settings' }],
    });
    // Already revoked, or never given: nothing to revoke.
    users = [
      user('u1', {
        outreachPreferences: { channels: [], smsConsent: { ...voice, revokedAt: 'r' } },
      }),
    ];
    await consent.writeOutreachConsent('u1', { channels: [] }, { source: 'web-settings' });
    expect(setCalls[1].value).not.toHaveProperty('outreachPreferences.smsConsent');
  });

  it('fails loudly when the opt-out cannot be saved', async () => {
    dbAvailable = false;
    await expect(consent.writeOutreachConsent('u1', { enabled: false })).rejects.toThrow();
  });
});

describe('daily outreach selection', () => {
  // Selection is only reached on the legacy path, with grounded check-ins off.
  beforeEach(() => {
    process.env.OUTREACH_GROUNDED_CHECKINS = 'off';
  });
  afterEach(() => {
    delete process.env.OUTREACH_GROUNDED_CHECKINS;
  });

  it('includes users with no preference, in-app only; skips users who switched off', async () => {
    users = [
      user('a-no-prefs'),
      user('b-off', { outreachPreferences: { enabled: false } }),
      user('c-sms', {
        outreachPreferences: { enabled: true, channels: ['sms'] },
        linkedIdentifiers: ['phone:+15555550100'],
      }),
      user('d-recent', { lastOutreachDate: new Date().toISOString() }),
    ];
    const result = await runDailyOutreach({ dryRun: true, respectQuietHours: false });

    const byUser = Object.fromEntries(result.details.map((d) => [d.userId, d]));
    expect(Object.keys(byUser).sort()).toEqual(['a-no-prefs', 'c-sms']);
    expect(byUser['a-no-prefs']).toMatchObject({ status: 'sent', channel: 'in_app' });
    expect(byUser['c-sms']).toMatchObject({ status: 'sent', channel: 'sms' });
  });

  it('treats someone who talked yesterday as active, not someone to win back', async () => {
    users = [user('active', { lastContact: new Date(Date.now() - 86_400_000).toISOString() })];
    // Active users get an occasional "thinking of you" (a 30% draw; forced here).
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    const result = await runDailyOutreach({ dryRun: true, respectQuietHours: false });
    random.mockRestore();
    expect(result.details).toHaveLength(1);
    expect(result.details[0]).toMatchObject({ userId: 'active', outreachType: 'thinking_of_you' });
  });

  it('skips users who have not answered the last few messages', async () => {
    users = [
      user('gone-quiet', {
        lastOutreachDate: new Date(Date.now() - 30 * 86_400_000).toISOString(),
        outreachUnanswered: 3,
      }),
      user('due', { lastOutreachDate: new Date(Date.now() - 8 * 86_400_000).toISOString() }),
    ];
    const result = await runDailyOutreach({ dryRun: true, respectQuietHours: false });
    expect(result.details.map((d) => d.userId)).toEqual(['due']);
    expect(result.details[0]).toMatchObject({ outreachType: 'reengagement_warmth' });
  });

  it('leaves test-harness accounts out', async () => {
    users = [
      user('voice-eval-r1-story'),
      user('e2e-memtest-1'),
      user('device:debug-3'),
      user('device:device-9f3a'),
    ];
    const result = await runDailyOutreach({ dryRun: true, respectQuietHours: false });
    expect(result.details.map((d) => d.userId)).toEqual(['device:device-9f3a']);
  });

  it('ids that name no account do not use up the day’s candidates', async () => {
    // Every unrecognised caller (eval runs included) leaves an anon: doc, and
    // calls placed on someone's behalf an onbehalf: one. They sort before
    // most real ids, so counting them toward the cap starved real accounts.
    const strangers = Array.from({ length: 120 }, (_, i) => user(`anon:eval-${i}`));
    const onBehalf = Array.from({ length: 30 }, (_, i) => user(`onbehalf:call-${i}`));
    const real = ['real-account-1', 'real-account-2', 'real-account-3'];
    users = [...strangers, ...onBehalf, ...real.map((id) => user(id))];

    const result = await runDailyOutreach({ dryRun: true, respectQuietHours: false });

    expect(result.details.map((d) => d.userId)).toEqual(real);
  });

  it('jumps past a long run of anon: ids instead of spending the scan bound on them', async () => {
    const strangers = Array.from({ length: 6000 }, (_, i) =>
      user(`anon:${String(i).padStart(5, '0')}`)
    );
    users = [...strangers, user('real-account-1')];

    const result = await runDailyOutreach({ dryRun: true, respectQuietHours: false });

    expect(result.details.map((d) => d.userId)).toEqual(['real-account-1']);
  });

  it('pages past the first 200 users', async () => {
    const recent = { lastOutreachDate: new Date().toISOString() };
    users = Array.from({ length: 201 }, (_, i) =>
      user(`u${String(i).padStart(3, '0')}`, i === 200 ? {} : recent)
    );
    const result = await runDailyOutreach({ dryRun: true, respectQuietHours: false });
    expect(result.details.map((d) => d.userId)).toEqual(['u200']);
  });
});

describe('daily outreach reaches only the verified phone', () => {
  const smsOptIn = { outreachPreferences: { enabled: true, channels: ['sms'] } };
  // Channel choice and delivery are only reached with grounded check-ins off.
  beforeEach(() => {
    process.env.OUTREACH_GROUNDED_CHECKINS = 'off';
    vi.mocked(deliver)
      .mockReset()
      .mockResolvedValue({ success: true, channel: 'sms' } as never);
  });
  afterEach(() => {
    delete process.env.OUTREACH_GROUNDED_CHECKINS;
  });

  it('texts the account phone, not a profile phone the model wrote', async () => {
    // `phone` is what saveContactInfo writes; the id carries the caller ID the account was made from.
    users = [user('phone:+15555550199', { ...smsOptIn, phone: '+15555550100' })];
    const result = await runDailyOutreach({ respectQuietHours: false });
    expect(result.details[0]).toMatchObject({ status: 'sent', channel: 'sms' });
    expect(vi.mocked(deliver).mock.calls[0][0]).toMatchObject({ phone: '+15555550199' });
  });

  it('uses a phone the user verified on a web account', async () => {
    users = [user('web-1', { ...smsOptIn, linkedIdentifiers: ['phone:+15555550177'] })];
    await runDailyOutreach({ respectQuietHours: false });
    expect(vi.mocked(deliver).mock.calls[0][0]).toMatchObject({ phone: '+15555550177' });
  });

  it('with no verified phone, no text or call: in-app instead', async () => {
    users = [user('web-2', { ...smsOptIn, phone: '+15555550100', phoneNumber: '+15555550101' })];
    const result = await runDailyOutreach({ respectQuietHours: false });
    expect(result.details[0]).toMatchObject({ status: 'sent', channel: 'in_app' });
    const sent = vi.mocked(deliver).mock.calls.map((c) => c[0]);
    expect(sent.some((d) => d.channel === 'sms' || d.channel === 'voice_call')).toBe(false);
    expect(sent.every((d) => d.phone === undefined)).toBe(true);
  });
});

describe('daily outreach quiet hours', () => {
  // A user outside quiet hours is only reached with grounded check-ins off.
  beforeEach(() => {
    process.env.OUTREACH_GROUNDED_CHECKINS = 'off';
  });
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.OUTREACH_GROUNDED_CHECKINS;
  });

  it('a time zone that cannot be read counts as quiet', async () => {
    users = [user('bad-tz', { outreachPreferences: { timezone: 'Not/AZone' } })];
    const result = await runDailyOutreach({ dryRun: true });
    expect(result.details[0]).toMatchObject({ status: 'skipped', reason: 'In quiet hours' });
  });

  it('defaults to 21:00-08:00 Eastern', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    users = [user('no-tz')];
    vi.setSystemTime(new Date('2026-10-12T01:30:00Z')); // 21:30 in New York, 18:30 in LA
    expect((await runDailyOutreach({ dryRun: true })).details[0]).toMatchObject({
      reason: 'In quiet hours',
    });
    vi.setSystemTime(new Date('2026-10-11T16:00:00Z')); // noon in New York
    expect((await runDailyOutreach({ dryRun: true })).details[0]).toMatchObject({ status: 'sent' });
  });
});
