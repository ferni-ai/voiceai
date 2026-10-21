/**
 * Maya's habit notifications used to go to profile.contactInfo, which
 * saveContactInfo writes from whatever the model heard. They now go only to the
 * verified phone or email (engagement-reach-port.ts) and are marked
 * 'verified-own', so their text always takes the guarded sender.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  reminder: vi.fn(async (r: Record<string, unknown>) => ({ id: 'r1', ...r })),
}));

vi.mock('../../../memory/profile-store.js', () => ({
  getProfileStore: async () => ({
    listProfiles: async () => [],
    // Model-written: anyone's number and address.
    getProfile: async () => ({
      contactInfo: { phone: '+12125550199', email: 'stranger@example.com', timezone: 'UTC' },
    }),
  }),
}));
vi.mock('../../persistence/index.js', () => ({
  createPersistenceStore: () => ({
    get: async () => null,
    set: () => undefined,
    flush: async () => undefined,
    shutdown: async () => undefined,
  }),
}));
vi.mock('../../scheduling/reminder-scheduler.js', () => ({ createReminder: h.reminder }));
vi.mock('../../scheduling/calendar-busy-detection.js', () => ({
  isUserBusy: async () => false,
  getNextOutreachWindow: async () => null,
}));

import { setEngagementReachPort } from '../engagement-reach-port.js';
import { getMayaNotificationService } from '../engagement-notification-service.js';

const request = (userId: string) => ({
  userId,
  type: 'habit_reminder' as const,
  scheduledFor: new Date('2026-10-20T15:00:00.000Z'),
  habitId: 'h1',
  habitName: 'walk',
});

afterEach(() => {
  setEngagementReachPort(undefined);
  vi.clearAllMocks();
});

describe('Maya notifications reach only the verified phone or email', () => {
  it('a saved phone with no verified reach: nothing is scheduled', async () => {
    setEngagementReachPort({
      verifiedPhone: async () => undefined,
      verifiedEmail: async () => undefined,
    });
    expect(await getMayaNotificationService().scheduleNotification(request('u-none'))).toBeNull();
    expect(h.reminder).not.toHaveBeenCalled();
  });

  it('no port in this process: nothing is scheduled (fail closed)', async () => {
    expect(await getMayaNotificationService().scheduleNotification(request('u-noport'))).toBeNull();
    expect(h.reminder).not.toHaveBeenCalled();
  });

  it('a verified phone gets it, marked verified-own for the guarded sender', async () => {
    setEngagementReachPort({
      verifiedPhone: async () => '+18015550100',
      verifiedEmail: async () => undefined,
    });
    await getMayaNotificationService().scheduleNotification(request('u-verified'));
    expect(h.reminder).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryMethod: 'sms',
        deliveryAddress: '+18015550100',
        addressSource: 'verified-own',
      })
    );
  });
});
