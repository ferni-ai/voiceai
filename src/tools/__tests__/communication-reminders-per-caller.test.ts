/**
 * PRIVACY: reminders belong to the caller who set them. setReminder,
 * listReminders and getCommunicationSummary used `userId || 'unknown'`, so
 * every id-less caller shared one reminder list; cancelReminder cancelled any
 * reminder by id. Runs the REAL reminder scheduler (getPendingReminders and
 * cancelReminder are not mocked); only Firestore, calendar sync, the promise
 * ledger and outbound email/SMS are stubbed out.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@livekit/agents', () => ({
  llm: { tool: vi.fn((config: { execute: unknown }) => config) },
}));
vi.mock('../../services/superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
vi.mock('../../services/communication-service.js', async (orig) => ({
  ...(await orig<typeof import('../../services/communication-service.js')>()),
  sendEmail: vi.fn(async () => 'sent'),
  sendSMS: vi.fn(async () => 'sent'),
}));
vi.mock('../../services/calendar/calendar-bridge.js', () => ({
  syncReminderToCalendar: vi.fn(async () => undefined),
  removeCalendarSyncedItem: vi.fn(async () => undefined),
}));
vi.mock('../../services/superhuman/semantic-intelligence/promise-keeper.js', () => ({
  recordReminderPromise: vi.fn(async () => undefined),
}));

import {
  communicationCallersHeld,
  createCommunicationTools,
} from '../domains/communication/communication-tools.js';
import {
  createReminder,
  getPendingReminders,
} from '../../services/scheduling/reminder-scheduler.js';

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

  it('a summary for a caller with no own id lists no reminders, not even ones filed under ""', async () => {
    await createReminder({
      userId: '',
      message: 'filed under nobody',
      subject: 'x',
      scheduledFor: new Date(Date.now() + 3_600_000),
      timezone: 'Etc/UTC',
      deliveryMethod: 'in_app',
      deliveryAddress: '',
      createdBy: 'alex',
    });
    expect(getPendingReminders('').map((r) => r.message)).toContain('filed under nobody');
    expect(await summary(as(undefined))).not.toContain('filed under nobody');
    expect(await summary(as('anonymous'))).not.toContain('filed under nobody');
  });

  it('reading drafts or calls never leaves an entry behind; writing adds one', async () => {
    const before = communicationCallersHeld();
    for (const id of ['uid-reader-1', 'uid-reader-2', undefined, 'anon:reader-3']) {
      await summary(as(id));
      await tools.sendApprovedEmail.execute(
        { to: 'someone@example.test', subject: 's', body: 'b' },
        as(id)
      );
    }
    expect(communicationCallersHeld()).toBe(before);

    await tools.draftEmail.execute(
      { to: 'someone@example.test', subject: 's', context: 'c', tone: 'friendly' },
      as('uid-writer')
    );
    expect(communicationCallersHeld()).toBe(before + 1);
  });

  it.each(['unknown', 'anonymous', 'Anonymous', ' unknown ', 'anon', 'default', ''])(
    'a placeholder or blank caller %j gets no reminder owner: refused, nothing filed or listed',
    async (id) => {
      const opts = as(id || undefined);
      expect(await remind('my court date', opts)).toMatch(/can't set that reminder/);
      expect(
        await tools.scheduleReminder.execute(
          { reminderText: 'my court date', when: 'in 2 hours' },
          opts
        )
      ).toMatch(/can't set that reminder/);
      for (const bucket of [
        'unknown',
        'anonymous',
        'Anonymous',
        ' unknown ',
        'anon',
        'default',
        '',
      ]) {
        expect(getPendingReminders(bucket).map((r) => r.message)).not.toContain('my court date');
      }
      expect(await list(opts)).not.toContain('court date');
    }
  );

  it("a summary for a caller with no id never lists reminders filed under 'unknown' or 'anonymous'", async () => {
    for (const bucket of ['unknown', 'anonymous']) {
      await createReminder({
        userId: bucket,
        message: `seeded under ${bucket}`,
        subject: 'x',
        scheduledFor: new Date(Date.now() + 3_600_000),
        timezone: 'Etc/UTC',
        deliveryMethod: 'in_app',
        deliveryAddress: '',
        createdBy: 'alex',
      });
      expect(getPendingReminders(bucket).map((r) => r.message)).toContain(`seeded under ${bucket}`);
    }
    for (const opts of [as(undefined), as('unknown'), as('anonymous'), as('')]) {
      const text = await summary(opts);
      expect(text).not.toContain('seeded under unknown');
      expect(text).not.toContain('seeded under anonymous');
      expect(await list(opts)).not.toContain('seeded under');
    }
  });
});
