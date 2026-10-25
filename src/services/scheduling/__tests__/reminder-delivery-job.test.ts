/**
 * Due reminders are delivered from Firestore by a scheduled job, each claimed
 * once, late ones marked missed, and unreachable ones sent in-app.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { id: string; userId: string; data: Record<string, unknown> };
let rows: Row[] = [];
type Outcome = 'sent' | 'in_app' | 'in_app_unnotified' | 'held' | 'failed';
const deliverReminder = vi.fn(
  async (
    _reminder: { id: string; deliveryMethod: string },
    _opts?: { textOn?: boolean; notifyInApp?: unknown }
  ): Promise<Outcome> => 'sent'
);

/** Enough of Firestore for the job's query and its claim transaction. */
function fakeDb() {
  const ref = (row: Row) => ({
    id: row.id,
    parent: { parent: { id: row.userId } },
    _row: row,
  });
  const query = (filters: Array<[string, string, unknown]> = [], n = Infinity) => ({
    where: (f: string, op: string, v: unknown) => query([...filters, [f, op, v]], n),
    orderBy: () => query(filters, n),
    limit: (k: number) => query(filters, k),
    get: async () => {
      const docs = rows
        .filter((r) =>
          filters.every(([f, op, v]) =>
            op === '==' ? r.data[f] === v : String(r.data[f]) <= String(v)
          )
        )
        .sort((a, b) => String(a.data.scheduledFor).localeCompare(String(b.data.scheduledFor)))
        .slice(0, n)
        .map((r) => ({ id: r.id, ref: ref(r), data: () => r.data }));
      return { docs, size: docs.length };
    },
  });
  return {
    collectionGroup: () => query(),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) =>
      fn({
        get: async (r: { _row: Row }) => ({ data: () => r._row.data }),
        update: (r: { _row: Row }, patch: Record<string, unknown>) =>
          Object.assign(r._row.data, patch),
      }),
  };
}

vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => fakeDb() }));
let smsUp = true;
vi.mock('../../outreach/unified-delivery.js', () => ({
  getChannelStatus: vi.fn(async () => ({
    sms: { available: smsUp },
    voice_call: { available: smsUp },
    email: { available: true },
    push: { available: false },
    in_app: { available: true },
  })),
}));
vi.mock('../reminder-scheduler.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../reminder-scheduler.js')>()),
  deliverReminderOutcome: deliverReminder,
}));
// The log lines only; the outcome mapping is the real one.
const logPromiseOutcome = vi.fn();
const logPromiseJobRun = vi.fn();
vi.mock('../../follow-through/promise-outcomes.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../follow-through/promise-outcomes.js')>()),
  logPromiseOutcome,
  logPromiseJobRun,
}));

const { deliverDueReminders, deliveryChannelFor, MISSED_AFTER_MS } =
  await import('../reminder-delivery-job.js');
const { reminderFromDoc } = await import('../reminder-scheduler.js');

const NOW = new Date('2026-09-30T16:00:00.000Z');
const at = (msFromNow: number) => new Date(NOW.getTime() + msFromNow).toISOString();
const reminder = (id: string, data: Record<string, unknown>): Row => ({
  id,
  userId: 'u1',
  data: {
    userId: 'u1',
    message: `reminder ${id}`,
    status: 'pending',
    deliveryMethod: 'sms',
    deliveryAddress: '+18015550123',
    createdAt: at(-86_400_000),
    ...data,
  },
});

beforeEach(() => {
  rows = [];
  smsUp = true;
  deliverReminder.mockReset().mockResolvedValue('sent');
  logPromiseOutcome.mockClear();
  logPromiseJobRun.mockClear();
});

describe('deliverDueReminders', () => {
  it('delivers a reminder that is due, and leaves future ones alone', async () => {
    rows = [
      reminder('due', { scheduledFor: at(-60_000) }),
      reminder('later', { scheduledFor: at(3_600_000) }),
    ];
    const result = await deliverDueReminders({ now: NOW });

    expect(result).toMatchObject({ due: 1, delivered: 1, missed: 0, failed: 0 });
    expect(deliverReminder).toHaveBeenCalledTimes(1);
    expect(deliverReminder.mock.calls[0][0]).toMatchObject({ id: 'due', deliveryMethod: 'sms' });
    expect(rows[0].data.status).toBe('sending'); // claimed; deliverReminder records the outcome
    expect(rows[1].data.status).toBe('pending');
  });

  it('marks a reminder found hours late as missed instead of sending it', async () => {
    rows = [reminder('stale', { scheduledFor: at(-MISSED_AFTER_MS - 60_000) })];
    const result = await deliverDueReminders({ now: NOW });

    expect(result).toMatchObject({ due: 1, missed: 1, delivered: 0 });
    expect(deliverReminder).not.toHaveBeenCalled();
    expect(rows[0].data.status).toBe('missed');
  });

  it('never sends a reminder another run already claimed', async () => {
    rows = [reminder('due', { scheduledFor: at(-60_000) })];
    await deliverDueReminders({ now: NOW });
    await deliverDueReminders({ now: NOW });
    expect(deliverReminder).toHaveBeenCalledTimes(1);
  });

  it('sends in-app when there is no phone number to text', async () => {
    rows = [
      reminder('nophone', {
        scheduledFor: at(-60_000),
        deliveryMethod: 'voice_message',
        deliveryAddress: '',
      }),
    ];
    deliverReminder.mockResolvedValueOnce('in_app');
    const result = await deliverDueReminders({ now: NOW });

    expect(result).toMatchObject({ delivered: 1, rerouted: 1, pushed: 1, texted: 0 });
    expect(deliverReminder.mock.calls[0][0]).toMatchObject({ deliveryMethod: 'in_app' });
  });

  it('an in-app reminder nobody was told about is not delivered', async () => {
    deliverReminder.mockResolvedValueOnce('in_app_unnotified');
    rows = [reminder('inbox', { scheduledFor: at(-60_000), deliveryMethod: 'in_app' })];
    const result = await deliverDueReminders({ now: NOW });
    expect(result).toMatchObject({ delivered: 0, inboxOnly: 1, failed: 0 });
  });

  it('with texts on for the owner, a text reminder with no phone of its own goes to the guard', async () => {
    rows = [
      reminder('app', {
        scheduledFor: at(-60_000),
        deliveryMethod: 'voice_message',
        deliveryAddress: 'voice:u1',
      }),
    ];
    const textOn = vi.fn(async (uid: string) => uid === 'u1');
    const notifyInApp = vi.fn(async () => true);
    const result = await deliverDueReminders({ now: NOW, reach: { textOn, notifyInApp } });
    expect(textOn).toHaveBeenCalledWith('u1');
    expect(deliverReminder.mock.calls[0][0]).toMatchObject({ deliveryMethod: 'voice_message' });
    expect(deliverReminder.mock.calls[0][1]).toEqual({ textOn: true, notifyInApp });
    expect(result).toMatchObject({ delivered: 1, texted: 1, rerouted: 0 });
  });

  it('sends in-app when this server has no Twilio credentials', async () => {
    smsUp = false;
    rows = [reminder('texting', { scheduledFor: at(-60_000) })];
    const result = await deliverDueReminders({ now: NOW });

    expect(result).toMatchObject({ delivered: 1, rerouted: 1 });
    expect(deliverReminder.mock.calls[0][0]).toMatchObject({ deliveryMethod: 'in_app' });
  });

  it("delivers to the path's owner, not the document's userId field", async () => {
    rows = [reminder('forged', { scheduledFor: at(-60_000), userId: 'victim' })];
    await deliverDueReminders({ now: NOW });
    expect(deliverReminder.mock.calls[0][0]).toMatchObject({ userId: 'u1' });
  });

  it('counts a failed delivery', async () => {
    deliverReminder.mockResolvedValueOnce('failed');
    rows = [reminder('due', { scheduledFor: at(-60_000) })];
    expect(await deliverDueReminders({ now: NOW })).toMatchObject({ delivered: 0, failed: 1 });
  });

  it('dry run reports without claiming or sending', async () => {
    rows = [
      reminder('due', { scheduledFor: at(-60_000), deliveryAddress: 'not a phone' }),
      reminder('stale', { scheduledFor: at(-MISSED_AFTER_MS - 60_000) }),
    ];
    const result = await deliverDueReminders({ now: NOW, dryRun: true });

    expect(result).toMatchObject({ due: 2, missed: 1, rerouted: 1, delivered: 0, dryRun: true });
    expect(deliverReminder).not.toHaveBeenCalled();
    expect(rows.map((r) => r.data.status)).toEqual(['pending', 'pending']);
  });
});

describe('PROMISE_OUTCOME / PROMISE_JOB_RUN lines', () => {
  it('one outcome per reminder: delivered done, failed send-failed, late missed-window', async () => {
    deliverReminder.mockImplementation(async (r) => (r.id === 'ok' ? 'sent' : 'failed'));
    rows = [
      reminder('ok', { scheduledFor: at(-60_000) }),
      reminder('bad', { scheduledFor: at(-30_000) }),
      reminder('stale', { scheduledFor: at(-MISSED_AFTER_MS - 60_000) }),
    ];
    await deliverDueReminders({ now: NOW });

    expect(logPromiseOutcome.mock.calls).toEqual(
      expect.arrayContaining([
        ['reminder', { outcome: 'done' }, { reminderId: 'ok' }],
        ['reminder', { outcome: 'failed', reason: 'send-failed' }, { reminderId: 'bad' }],
        ['reminder', { outcome: 'failed', reason: 'missed-window' }, { reminderId: 'stale' }],
      ])
    );
    expect(logPromiseOutcome).toHaveBeenCalledTimes(3);
    expect(logPromiseJobRun).toHaveBeenCalledWith('deliver-reminders', {
      due: 3,
      done: 1,
      failed: 1,
      held: 0,
      missed: 1,
    });
  });

  it('an inbox row no one was told about logs missed, never done; a held text logs quiet-hours', async () => {
    deliverReminder.mockImplementation(async (r) =>
      r.id === 'inbox' ? 'in_app_unnotified' : 'held'
    );
    rows = [
      reminder('inbox', { scheduledFor: at(-60_000) }),
      reminder('quiet', { scheduledFor: at(-30_000) }),
    ];
    await deliverDueReminders({ now: NOW });

    expect(logPromiseOutcome.mock.calls).toEqual(
      expect.arrayContaining([
        ['reminder', { outcome: 'failed', reason: 'missed-window' }, { reminderId: 'inbox' }],
        ['reminder', { outcome: 'held', reason: 'quiet-hours' }, { reminderId: 'quiet' }],
      ])
    );
    expect(logPromiseOutcome).toHaveBeenCalledTimes(2);
    expect(logPromiseJobRun).toHaveBeenCalledWith('deliver-reminders', {
      due: 2,
      done: 0,
      failed: 0,
      held: 1,
      missed: 1,
    });
  });

  it('logs a run with nothing due, and nothing on a dry run', async () => {
    await deliverDueReminders({ now: NOW });
    expect(logPromiseJobRun).toHaveBeenCalledWith('deliver-reminders', {
      due: 0,
      done: 0,
      failed: 0,
      held: 0,
      missed: 0,
    });
    logPromiseJobRun.mockClear();
    rows = [reminder('due', { scheduledFor: at(-60_000) })];
    await deliverDueReminders({ now: NOW, dryRun: true });
    expect(logPromiseJobRun).not.toHaveBeenCalled();
    expect(logPromiseOutcome).not.toHaveBeenCalled();
  });
});

describe('deliveryChannelFor', () => {
  const r = (deliveryMethod: string, deliveryAddress: string) =>
    reminderFromDoc('x', {
      userId: 'u1',
      scheduledFor: NOW.toISOString(),
      deliveryMethod,
      deliveryAddress,
    });

  it('keeps the chosen channel when it can be reached', () => {
    expect(deliveryChannelFor(r('sms', '+1 (801) 555-0123'))).toBe('sms');
    expect(deliveryChannelFor(r('call', '8015550123'))).toBe('call');
    expect(deliveryChannelFor(r('email', 'sam@example.com'))).toBe('email');
  });

  it('falls back to in-app when it cannot', () => {
    expect(deliveryChannelFor(r('voice_message', '[invalid]'))).toBe('in_app');
    expect(deliveryChannelFor(r('email', ''))).toBe('in_app');
    expect(deliveryChannelFor(r('call', 'voice:u1'), undefined, true)).toBe('in_app');
  });

  it("with texts on, keeps a text reminder's channel for the guard to resolve", () => {
    expect(deliveryChannelFor(r('voice_message', 'voice:u1'), undefined, true)).toBe(
      'voice_message'
    );
    expect(deliveryChannelFor(r('voice_message', 'voice:u1'), undefined, false)).toBe('in_app');
  });
});

describe('reminderFromDoc', () => {
  it('rebuilds dates and defaults a missing method to in-app', () => {
    const rem = reminderFromDoc('id1', { userId: 'u1', scheduledFor: '2026-10-01T09:00:00.000Z' });
    expect(rem.scheduledFor.toISOString()).toBe('2026-10-01T09:00:00.000Z');
    expect(rem.deliveryMethod).toBe('in_app');
    expect(rem.status).toBe('pending');
  });
});
