/**
 * Whose clock a recurring reminder is set by. In a call it is the zone the
 * call settled (phone-parity.ts: the browser's, else only a verified owner's
 * profile zone), never the raw profile's: on a call placed for someone, or
 * from a caller matched by number alone, the profile isn't theirs. Outside a
 * call the account's own profile zone still applies.
 */
// Prod servers run in UTC; pin it so a dev machine's own zone can't mask the bug.
process.env.TZ = 'UTC';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const created = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock('../../../../services/scheduling/reminder-scheduler.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../services/scheduling/reminder-scheduler.js')
  >()),
  createReminder: vi.fn(async (params: Record<string, unknown>) => {
    created.push(params);
    return { id: 'rem-1', ...params };
  }),
}));
vi.mock('../../../../services/superhuman/semantic-intelligence/promise-keeper.js', () => ({
  recordReminderPromise: vi.fn(async () => {}),
}));
// The account's profile says Los Angeles.
vi.mock('../../../../memory/profile-store.js', () => ({
  getProfileStore: async () => ({
    getProfile: async () => ({ contactInfo: { timezone: 'America/Los_Angeles' } }),
  }),
}));
vi.mock('../../../../memory/firestore-store.js', () => ({
  getFirestoreStore: () => ({
    getDatabase: async () => {
      throw new Error('no Firestore in tests');
    },
  }),
}));

import { rememberCallerTimeZone } from '../../../../utils/caller-time-zone.js';
import { advancedReminderDefinitions } from '../advanced-reminders.js';

// Monday 2026-10-12 02:41 UTC: Sunday evening in New York and Los Angeles.
const NOW = new Date('2026-10-12T02:41:00Z');
type Exec = { execute: (args: Record<string, unknown>) => Promise<string> };

async function dailyAt8(ctx: Record<string, unknown>): Promise<string> {
  const def = advancedReminderDefinitions.find((d) => d.id === 'recurringReminder')!;
  const tool = def.create({ agentId: 'ferni', agentDisplayName: 'Ferni', ...ctx } as never);
  await (tool as unknown as Exec).execute({ message: 'pill', pattern: 'daily', time: '8am' });
  return (created[0].scheduledFor as Date).toISOString();
}

describe('recurring reminder time zone', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    created.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it("in a call that settled no zone: not the profile's zone (UTC until the caller says)", async () => {
    expect(await dailyAt8({ userId: 'u-unsettled', sessionId: 's-unsettled' })).toBe(
      '2026-10-12T08:00:00.000Z'
    );
  });

  it('in a call that settled a zone: that zone', async () => {
    rememberCallerTimeZone('America/New_York', 's-settled');
    expect(await dailyAt8({ userId: 'u-settled', sessionId: 's-settled' })).toBe(
      '2026-10-12T12:00:00.000Z'
    );
  });

  it("outside a call: the account's own profile zone", async () => {
    expect(await dailyAt8({ userId: 'u-app' })).toBe('2026-10-12T15:00:00.000Z');
  });
});
