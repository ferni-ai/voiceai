/**
 * Due scheduled actions are delivered from Firestore by a scheduled job: by
 * push when this server can send push, otherwise to the in-app panel, with
 * the outcome recorded back in Firestore.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore, type Row } from '../../scheduling/__tests__/fake-firestore.js';

let rows: Row[] = [];
let pushUp = false;
const sendPushNotification = vi.fn(async () => [{ success: true }]);
const saveInAppMessage = vi.fn(async () => ({ success: true, channel: 'in_app' }));

vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fakeFirestore(rows),
}));
vi.mock('../../outreach/delivery/push-notifications.js', () => ({ sendPushNotification }));
vi.mock('../../outreach/unified-delivery.js', () => ({
  saveInAppMessage,
  getChannelStatus: vi.fn(async () => ({ push: { available: pushUp } })),
}));

const { deliverDueScheduledActions } = await import('../scheduled-actions.js');

const NOW = new Date('2026-09-30T16:00:00.000Z');
const action = (id: string, minutesAgo: number): Row => ({
  id,
  userId: 'u1',
  collection: 'scheduled_actions',
  data: {
    id,
    userId: 'u1',
    title: 'Evening wind-down',
    body: 'Time to put the phone away',
    personaId: 'ferni',
    status: 'pending',
    attempts: 0,
    scheduledFor: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
    createdAt: new Date(NOW.getTime() - 86_400_000).toISOString(),
  },
});

beforeEach(() => {
  rows = [];
  pushUp = false;
  vi.clearAllMocks();
});

describe('deliverDueScheduledActions', () => {
  it('delivers in-app when this server cannot send push, and records it', async () => {
    rows = [action('a1', 1)];
    const result = await deliverDueScheduledActions({ now: NOW });

    expect(result).toMatchObject({ due: 1, delivered: 1, inApp: 1, failed: 0 });
    expect(saveInAppMessage).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        type: 'scheduled_action',
        text: 'Evening wind-down: Time to put the phone away',
        triggerId: 'a1',
      })
    );
    expect(sendPushNotification).not.toHaveBeenCalled();
    expect(rows[0].data).toMatchObject({ status: 'delivered', attempts: 1 });
  });

  it("delivers to the path's owner, not the document's userId field", async () => {
    rows = [action('a1', 1)];
    rows[0].data.userId = 'victim';
    await deliverDueScheduledActions({ now: NOW });
    expect(saveInAppMessage).toHaveBeenCalledWith('u1', expect.anything());
    expect(saveInAppMessage).not.toHaveBeenCalledWith('victim', expect.anything());
  });

  it('sends push when available', async () => {
    pushUp = true;
    rows = [action('a1', 1)];
    const result = await deliverDueScheduledActions({ now: NOW });

    expect(result).toMatchObject({ delivered: 1, inApp: 0 });
    expect(sendPushNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', outreachId: 'a1' })
    );
    expect(rows[0].data.status).toBe('delivered');
  });

  it('leaves a failed push pending for the next run', async () => {
    pushUp = true;
    sendPushNotification.mockResolvedValueOnce([{ success: false }]);
    rows = [action('a1', 1)];
    const result = await deliverDueScheduledActions({ now: NOW });

    expect(result).toMatchObject({ delivered: 0, retrying: 1 });
    expect(rows[0].data).toMatchObject({ status: 'pending', attempts: 1 });
  });

  it('marks an action found hours late as missed, without sending', async () => {
    rows = [action('old', 5 * 60)];
    const result = await deliverDueScheduledActions({ now: NOW });

    expect(result).toMatchObject({ missed: 1, delivered: 0 });
    expect(saveInAppMessage).not.toHaveBeenCalled();
    expect(rows[0].data.status).toBe('missed');
  });
});
