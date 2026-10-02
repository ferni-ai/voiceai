/**
 * Delivering a reminder records the outcome in Firestore even when this
 * process didn't create it. Before, the status update looked the reminder up
 * in the process's in-memory store and silently did nothing when it wasn't
 * there, which is always the case for reminders loaded by the delivery job.
 */
import { describe, expect, it, vi } from 'vitest';

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

const { deliverReminder, reminderFromDoc } = await import('../reminder-scheduler.js');

describe('deliverReminder', () => {
  it('records delivery in Firestore for a reminder this process did not create', async () => {
    const reminder = reminderFromDoc('rem-1', {
      userId: 'u1',
      message: 'call mom',
      scheduledFor: '2026-09-30T16:00:00.000Z',
      deliveryMethod: 'in_app',
      status: 'sending',
    });

    expect(await deliverReminder(reminder)).toBe(true);
    expect(saveInAppMessage).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ type: 'reminder', text: 'call mom', triggerId: 'rem-1' })
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'delivered', attempts: 1 })
    );
    expect(docPath).toEqual(expect.arrayContaining(['bogle_users', 'u1', 'reminders', 'rem-1']));
  });
});
