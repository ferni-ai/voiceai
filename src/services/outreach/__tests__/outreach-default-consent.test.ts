/**
 * Outreach reaches everyone by default, in-app only. A user who switched it
 * off gets nothing, and texts/email/calls go only to users who chose them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const consent = await import('../outreach-consent.js');
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

  it('fails loudly when the opt-out cannot be saved', async () => {
    dbAvailable = false;
    await expect(consent.writeOutreachConsent('u1', { enabled: false })).rejects.toThrow();
  });
});

describe('daily outreach selection', () => {
  it('includes users with no preference, in-app only; skips users who switched off', async () => {
    users = [
      user('a-no-prefs'),
      user('b-off', { outreachPreferences: { enabled: false } }),
      user('c-sms', { outreachPreferences: { enabled: true, channels: ['sms'] } }),
      user('d-recent', { lastOutreachDate: new Date().toISOString() }),
    ];
    const result = await runDailyOutreach({ dryRun: true, respectQuietHours: false });

    const byUser = Object.fromEntries(result.details.map((d) => [d.userId, d]));
    expect(Object.keys(byUser).sort()).toEqual(['a-no-prefs', 'c-sms']);
    expect(byUser['a-no-prefs']).toMatchObject({ status: 'sent', channel: 'in_app' });
    expect(byUser['c-sms']).toMatchObject({ status: 'sent', channel: 'sms' });
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
