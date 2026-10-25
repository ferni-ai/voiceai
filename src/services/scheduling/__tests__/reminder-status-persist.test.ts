/**
 * Delivering a reminder records the outcome in Firestore even when this
 * process didn't create it. Before, the status update looked the reminder up
 * in the process's in-memory store and silently did nothing when it wasn't
 * there, which is always the case for reminders loaded by the delivery job.
 * An in-app reminder counts as delivered only when a push told them about it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const update = vi.fn(async () => undefined);
const saveInAppMessage = vi.fn(async () => ({ success: true, channel: 'in_app' }));
const docPath: string[] = [];

vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => {
    const doc = (id: string) => {
      docPath.push(id);
      return {
        collection: (c: string) => ({ doc: (d: string) => (docPath.push(c), doc(d)) }),
        update,
      };
    };
    return { collection: (c: string) => (docPath.push(c), { doc }) };
  },
}));
vi.mock('../../outreach/unified-delivery.js', () => ({ saveInAppMessage }));

const { deliverReminder, deliverReminderOutcome, reminderFromDoc } =
  await import('../reminder-scheduler.js');

describe('deliverReminder', () => {
  const inApp = () =>
    reminderFromDoc('rem-1', {
      userId: 'u1',
      message: 'call mom',
      scheduledFor: '2026-09-30T16:00:00.000Z',
      deliveryMethod: 'in_app',
      status: 'sending',
    });

  beforeEach(() => {
    update.mockClear();
    docPath.length = 0;
  });

  it('records delivery in Firestore for a reminder this process did not create', async () => {
    const notifyInApp = vi.fn(async () => true); // a push told them
    expect(await deliverReminder(inApp(), { notifyInApp })).toBe(true);
    expect(saveInAppMessage).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ type: 'reminder', text: 'call mom', triggerId: 'rem-1' })
    );
    expect(notifyInApp).toHaveBeenCalledWith(expect.objectContaining({ id: 'rem-1' }));
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'delivered', attempts: 1 })
    );
    expect(docPath).toEqual(expect.arrayContaining(['bogle_users', 'u1', 'reminders', 'rem-1']));
  });

  it('an inbox row nobody was told about is in_app_unnotified, not delivered', async () => {
    expect(await deliverReminderOutcome(inApp())).toBe('in_app_unnotified');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_app_unnotified' }));
    expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'delivered' }));
  });

  it('a push that fails or throws leaves it in_app_unnotified', async () => {
    expect(await deliverReminder(inApp(), { notifyInApp: async () => false })).toBe(false);
    const boom = async (): Promise<boolean> => {
      throw new Error('push down');
    };
    expect(await deliverReminderOutcome(inApp(), { notifyInApp: boom })).toBe('in_app_unnotified');
    expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'delivered' }));
  });
});
