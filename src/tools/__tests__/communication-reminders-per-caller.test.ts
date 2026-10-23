/**
 * PRIVACY: reminders belong to the caller who set them. setReminder,
 * listReminders and getCommunicationSummary used `userId || 'unknown'`, so
 * every id-less caller shared one reminder list; cancelReminder cancelled any
 * reminder by id. Runs the REAL reminder scheduler (getPendingReminders and
 * cancelReminder are not mocked); only Firestore, calendar sync and the
 * promise ledger are stubbed out.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@livekit/agents', () => ({
  llm: { tool: vi.fn((config: { execute: unknown }) => config) },
}));
vi.mock('../../services/superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
vi.mock('../../services/calendar/calendar-bridge.js', () => ({
  syncReminderToCalendar: vi.fn(async () => undefined),
  removeCalendarSyncedItem: vi.fn(async () => undefined),
}));
vi.mock('../../services/superhuman/semantic-intelligence/promise-keeper.js', () => ({
  recordReminderPromise: vi.fn(async () => undefined),
}));

import { createCommunicationTools } from '../domains/communication/communication-tools.js';
import { getPendingReminders } from '../../services/scheduling/reminder-scheduler.js';

type Execute = (args: Record<string, unknown>, opts: unknown) => Promise<string>;
const tools = createCommunicationTools() as unknown as Record<string, { execute: Execute }>;

/** LiveKit's tool options: the caller is userData.userId; `session` is the server's per-session object. */
const as = (userId?: string, session: object = {}) => ({
  ctx: { userData: userId ? { userId } : {}, session },
  toolCallId: 't',
});
const remind = (message: string, opts: unknown) =>
  tools.setReminder.execute({ message, when: 'in 2 hours' }, opts);
const list = (opts: unknown) => tools.listReminders.execute({}, opts);
const summary = (opts: unknown) => tools.getCommunicationSummary.execute({}, opts);

describe('reminders per caller', () => {
  it("a member never sees another member's reminders", async () => {
    await remind('pick up my prescription', as('uid-rem-alice'));

    expect(await list(as('uid-rem-bob'))).not.toContain('prescription');
    expect(await summary(as('uid-rem-bob'))).not.toContain('prescription');
    expect(await list(as('uid-rem-alice'))).toContain('pick up my prescription');
  });

  it('two callers without an id never share a reminder list', async () => {
    const first = {};
    await remind('call the parole officer', as(undefined, first));

    for (const other of [as(undefined), as('unknown'), as('anonymous'), as('anon')]) {
      expect(await list(other)).not.toContain('parole officer');
      expect(await summary(other)).not.toContain('parole officer');
    }
    expect(getPendingReminders('unknown')).toEqual([]);
    // Nobody's own id to file it under: refused rather than kept in a shared bucket.
    expect(await list(as('anon', first))).not.toContain('parole officer');
    expect(await remind('see the doctor', as('anon:caller-7'))).toMatch(/Reminder ID/);
    expect(await list(as('anon:caller-7'))).toContain('see the doctor');
  });

  it("a caller cannot cancel someone else's reminder", async () => {
    const reply = await remind('take insulin', as('uid-rem-carol'));
    const shortId = /Reminder ID: (\S+)/.exec(reply)?.[1] ?? '';
    const [full] = getPendingReminders('uid-rem-carol');
    expect(full?.id.endsWith(shortId)).toBe(true);

    for (const id of [shortId, full!.id]) {
      expect(await tools.cancelReminder.execute({ reminderId: id }, as('uid-rem-dave'))).toMatch(
        /couldn't find/
      );
    }
    expect(getPendingReminders('uid-rem-carol')).toHaveLength(1);

    expect(
      await tools.cancelReminder.execute({ reminderId: shortId }, as('uid-rem-carol'))
    ).toMatch(/cancelled/);
    expect(getPendingReminders('uid-rem-carol')).toEqual([]);
  });
});
