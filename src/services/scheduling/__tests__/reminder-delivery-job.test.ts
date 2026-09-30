/**
 * Due reminders are delivered from Firestore by a scheduled job, each claimed
 * once, late ones marked missed, and unreachable ones sent in-app.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { id: string; userId: string; data: Record<string, unknown> };
let rows: Row[] = [];
const deliverReminder = vi.fn(async (_reminder: { id: string; deliveryMethod: string }) => true);

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
vi.mock('../reminder-scheduler.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../reminder-scheduler.js')>()),
  deliverReminder,
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
  deliverReminder.mockReset().mockResolvedValue(true);
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
    const result = await deliverDueReminders({ now: NOW });

    expect(result).toMatchObject({ delivered: 1, rerouted: 1 });
    expect(deliverReminder.mock.calls[0][0]).toMatchObject({ deliveryMethod: 'in_app' });
  });

  it('counts a failed delivery', async () => {
    deliverReminder.mockResolvedValueOnce(false);
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
