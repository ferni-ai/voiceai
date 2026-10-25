/**
 * reminderReach decides, per person, whether reminders go by text and whether
 * an in-app one gets a push: the server's env flag for everyone, or the
 * person's cohort flag (flagForUser), never another person's.
 */
import { describe, expect, it, vi } from 'vitest';
import { ownerReminderReach, reminderReach, type ReminderReachDeps } from '../reminder-reach.js';
import { applyFlags, forgetAgentValues } from '../../platform/cohort-flags.js';
import type { ScheduledReminder } from '../../scheduling/reminder-scheduler.js';

const reminder = (userId: string) =>
  ({ id: `r-${userId}`, userId, message: 'take the bread out' }) as ScheduledReminder;

function deps(over: Partial<ReminderReachDeps> = {}): ReminderReachDeps {
  return {
    env: {},
    flagForUser: async () => undefined,
    push: vi.fn(async () => true),
    ...over,
  };
}

describe('reminderReach', () => {
  it('texts: on for one person by their cohort flag, off for the rest', async () => {
    const reach = reminderReach(
      deps({
        flagForUser: async (uid, f) =>
          uid === 'a' && f === 'REMINDER_SMS_DEFAULT' ? 'on' : undefined,
      })
    );
    expect(await reach.textOn('a')).toBe(true);
    expect(await reach.textOn('b')).toBe(false);
  });

  it('texts: on for everyone with the server env flag', async () => {
    const reach = reminderReach(deps({ env: { REMINDER_SMS_DEFAULT: 'on' } }));
    expect(await reach.textOn('anyone')).toBe(true);
  });

  it('push: off by default, so nothing is sent', async () => {
    const d = deps();
    expect(await reminderReach(d).notifyInApp!(reminder('a'))).toBe(false);
    expect(d.push).not.toHaveBeenCalled();
  });

  it("push: on for the reminder's owner sends one with the reminder's text", async () => {
    const d = deps({
      flagForUser: async (uid, f) =>
        uid === 'a' && f === 'REMINDER_IN_APP_PUSH' ? 'on' : undefined,
    });
    const reach = reminderReach(d);
    expect(await reach.notifyInApp!(reminder('a'))).toBe(true);
    expect(d.push).toHaveBeenCalledWith('a', 'A reminder from Ferni', 'take the bread out', 'r-a');
    expect(await reach.notifyInApp!(reminder('b'))).toBe(false);
    expect(d.push).toHaveBeenCalledTimes(1);
  });

  it('push: a failed or throwing send is not a notification', async () => {
    const env = { REMINDER_IN_APP_PUSH: 'on' };
    expect(
      await reminderReach(deps({ env, push: async () => false })).notifyInApp!(reminder('a'))
    ).toBe(false);
    const boom = async (): Promise<boolean> => {
      throw new Error('no vapid key');
    };
    expect(await reminderReach(deps({ env, push: boom })).notifyInApp!(reminder('a'))).toBe(false);
  });
});

describe('ownerReminderReach (the in-process scheduler in a voice-call process)', () => {
  it("ignores the current caller's flags in process.env and reads the owner's", async () => {
    applyFlags({ REMINDER_SMS_DEFAULT: 'on' }); // a call started: its caller's flags are applied
    try {
      expect(process.env.REMINDER_SMS_DEFAULT).toBe('on');
      expect(await ownerReminderReach().textOn('another-owner')).toBe(false);
    } finally {
      applyFlags({}); // the agent's own values back
      forgetAgentValues();
    }
    expect(process.env.REMINDER_SMS_DEFAULT).toBeUndefined();
  });
});
