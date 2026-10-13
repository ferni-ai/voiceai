/**
 * Tool results say exactly what was stored. Dev, 2026-10-11: Ferni said "I've
 * got that set up to remind you daily" for a pill; nothing repeating was
 * stored, because nothing delivers from recurring_reminders.
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
vi.mock('../../../../memory/profile-store.js', () => ({
  getProfileStore: async () => ({ getProfile: async () => null }),
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
import { shortcutsToolDefinitions } from '../shortcuts-tools.js';
import { essentialsToolDefinitions } from '../essentials-tools.js';

// Sunday 2026-10-11 22:41 in New York: already Monday 02:41 in UTC.
const LATE_SUNDAY_NY = new Date('2026-10-12T02:41:00Z');
type Exec = { execute: (args: Record<string, unknown>, opts?: unknown) => Promise<string> };
const ctx = { userId: 'voice-eval-honest', agentId: 'ferni', agentDisplayName: 'Ferni' };

describe('honest scheduling results', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: LATE_SUNDAY_NY, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    created.length = 0;
    rememberCallerTimeZone('America/New_York', 'voice-eval-honest');
  });
  afterEach(() => vi.useRealTimers());

  it('recurringReminder stores one real reminder at 8 AM their time and says it does not repeat', async () => {
    const def = advancedReminderDefinitions.find((d) => d.id === 'recurringReminder')!;
    const tool = def.create(ctx as never) as unknown as Exec;

    const said = await tool.execute({
      message: 'take blood pressure pill',
      pattern: 'daily',
      time: '8am',
    });

    // The first occurrence goes to the store the delivery job fires: Monday 8 AM EDT.
    expect(created).toHaveLength(1);
    expect((created[0].scheduledFor as Date).toISOString()).toBe('2026-10-12T12:00:00.000Z');
    expect(said).toContain('Saved: tomorrow, Oct 12, 8:00 AM your time, one reminder');
    expect(said).toContain('It does not repeat every day');
    expect(said).not.toMatch(/I'll remind you/i);
  });

  it('quickTimer says when it goes off in their time and that it needs the call open', async () => {
    const def = shortcutsToolDefinitions.find((d) => d.id === 'quickTimer')!;
    const tool = def.create(ctx as never) as unknown as Exec;

    const said = await tool.execute(
      { duration: '10 minutes', label: 'pasta' },
      { ctx: { session: {}, userData: { userId: 'voice-eval-honest' } } }
    );

    expect(said).toContain('It goes off today, Oct 11, 10:51 PM your time.');
    expect(said).toContain("if the call ends first, it won't ring");
    expect(said).not.toContain("I'll check in when it's done");
  });

  it('quickCapture reads back the one reminder it saved, in their time, and does not promise a repeat', async () => {
    const def = essentialsToolDefinitions.find((d) => d.id === 'quickCapture')!;
    const tool = def.create(ctx as never) as unknown as Exec;

    const said = await tool.execute({ thought: 'remind me to water the plants every day at 9am' });

    expect(created).toHaveLength(1);
    expect((created[0].scheduledFor as Date).toISOString()).toBe('2026-10-12T13:00:00.000Z');
    expect(said).toContain('Saved one reminder for tomorrow, Oct 12, 9:00 AM your time');
    expect(said).toContain('It does not repeat');
    expect(said).not.toContain("I'll remind you when the time comes");
  });

  it('locationReminder does not promise a ping it cannot deliver', async () => {
    const def = advancedReminderDefinitions.find((d) => d.id === 'locationReminder')!;
    const tool = def.create(ctx as never) as unknown as Exec;

    const said = await tool.execute({
      message: 'buy milk',
      locationName: 'the grocery store',
      triggerOn: 'arrive',
    });

    expect(said).toContain("Location reminders aren't delivered yet");
    expect(said).not.toMatch(/I'll remind you/i);
  });
});
