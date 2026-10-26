/**
 * The live push callers go through the Focus gate by default (F3): a Ferni
 * note's push (in-app-push, outreach web push) is held while a Focus holds,
 * and a reminder's push follows the person's reminder choice. Only the edges
 * are faked: the push service, the user doc and the person's FOCUS_HOLD.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePersonFlagLookup } from '../../../config/person-flag.js';
import type { ScheduledReminder } from '../../scheduling/reminder-scheduler.js';

const { sendNotification, userDoc } = vi.hoisted(() => ({
  sendNotification: vi.fn(async () => true),
  userDoc: vi.fn(async (): Promise<Record<string, unknown> | undefined> => undefined),
}));
vi.mock('../../push-notifications.js', () => ({
  getPushNotificationsService: () => ({ sendNotification }),
}));
vi.mock('../web-push-flag.js', () => ({ webPushDeliveryOn: async () => true }));
vi.mock('../guarded-text-store.js', () => ({
  firestoreTextStore: { userDoc },
  sendSms: vi.fn(),
}));

const { pushInAppNote } = await import('../in-app-push.js');
const { sendOutreachWebPush } = await import('../web-push-delivery.js');
const { reminderReach } = await import('../reminder-reach.js');

const inAnHour = (): string => new Date(Date.now() + 3_600_000).toISOString();
const focusDoc = (remindersThrough: boolean) => ({
  messagingPrefs: {
    zone: 'UTC',
    focus: {
      held: true,
      kind: 'work',
      remindersThrough,
      since: new Date().toISOString(),
      capUntil: inAnHour(),
      byDevice: { abc: true },
      updatedAt: new Date().toISOString(),
    },
  },
});

describe('push callers honour a Focus hold for people with FOCUS_HOLD on', () => {
  beforeEach(() => {
    sendNotification.mockClear();
    userDoc.mockReset();
    usePersonFlagLookup(async (_uid, flag) => (flag === 'FOCUS_HOLD' ? 'on' : undefined));
  });
  afterEach(() => usePersonFlagLookup(async () => undefined));

  it("a Ferni note's push (in-app-push) is held, then sent once the Focus is off", async () => {
    userDoc.mockResolvedValue(focusDoc(true));
    expect(await pushInAppNote('u1', { text: 'Thinking of you', kind: 'momentum_check' })).toBe(
      false
    );
    expect(sendNotification).not.toHaveBeenCalled();
    userDoc.mockResolvedValue({});
    expect(await pushInAppNote('u1', { text: 'Thinking of you', kind: 'momentum_check' })).toBe(
      true
    );
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it('an outreach web push (web-push-delivery) is held', async () => {
    userDoc.mockResolvedValue(focusDoc(true));
    const note = { text: 'Hey', personaId: 'ferni', kind: 'thinking_of_you' };
    expect(await sendOutreachWebPush('u1', note)).toBe(false);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("a reminder's push (reminder-reach) goes with remindersThrough, waits without it", async () => {
    vi.stubEnv('REMINDER_IN_APP_PUSH', 'on');
    const r = { id: 'r1', userId: 'u1', message: 'take the bread out' } as ScheduledReminder;
    userDoc.mockResolvedValue(focusDoc(true));
    expect(await reminderReach().notifyInApp?.(r)).toBe(true);
    userDoc.mockResolvedValue(focusDoc(false));
    expect(await reminderReach().notifyInApp?.(r)).toBe(false);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });

  it('FOCUS_HOLD off: the push goes and their doc is never read', async () => {
    usePersonFlagLookup(async () => undefined);
    userDoc.mockResolvedValue(focusDoc(true));
    expect(await pushInAppNote('u1', { text: 'Thinking of you', kind: 'momentum_check' })).toBe(
      true
    );
    expect(userDoc).not.toHaveBeenCalled();
  });
});
