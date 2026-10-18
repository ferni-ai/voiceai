/**
 * How the deliver-reminders job reaches each person. The UI server runs it for
 * everyone in one process, so both switches are read per person (cohort
 * flags through flagForUser), never by writing process.env:
 *
 * - REMINDER_SMS_DEFAULT: their reminders go by text, through the guarded
 *   sender (reminder-texts.ts), to the verified number on their account.
 * - REMINDER_IN_APP_PUSH: a reminder that lands in the app's inbox (no text,
 *   or the text wasn't sent) also gets a push, so it reaches them. Without
 *   one it is 'in_app_unnotified' and its promise isn't kept.
 *
 * Each is on for everyone with the server's env flag, or for one person when
 * their cohort or override turns it on. Both are off by default.
 *
 * @module services/outreach/reminder-reach
 */

import { flagOn } from '../../config/env-flag.js';
import { isReminderSmsDefaultOn } from '../../config/reminder-sms-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { flagForUser } from '../platform/cohort-flags.js';
import { getPushNotificationsService } from '../push-notifications.js';
import type { ReminderReach } from '../scheduling/reminder-delivery-job.js';
import type { ScheduledReminder } from '../scheduling/reminder-scheduler.js';

const log = createLogger({ module: 'reminder-reach' });

export interface ReminderReachDeps {
  env: Record<string, string | undefined>;
  flagForUser: (userId: string, flag: string) => Promise<'on' | 'off' | undefined>;
  /** True when a push reached at least one of their devices. */
  push: (userId: string, title: string, body: string, reminderId: string) => Promise<boolean>;
}

const defaultDeps = (): ReminderReachDeps => ({
  env: process.env,
  flagForUser: async (userId, flag) => flagForUser(userId, flag),
  push: async (userId, title, body, reminderId) =>
    getPushNotificationsService().sendNotification(userId, {
      title,
      body,
      type: 'general',
      personaId: 'ferni',
      data: { kind: 'reminder', reminderId },
    }),
});

export function reminderReach(deps: ReminderReachDeps = defaultDeps()): ReminderReach {
  return {
    textOn: async (userId) =>
      isReminderSmsDefaultOn(deps.env) ||
      (await deps.flagForUser(userId, 'REMINDER_SMS_DEFAULT')) === 'on',
    notifyInApp: async (r: ScheduledReminder) => {
      const on =
        flagOn('REMINDER_IN_APP_PUSH', deps.env) ||
        (await deps.flagForUser(r.userId, 'REMINDER_IN_APP_PUSH')) === 'on';
      if (!on) return false;
      try {
        const sent = await deps.push(r.userId, 'A reminder from Ferni', r.message, r.id);
        if (!sent) log.info({ reminderId: r.id }, 'No device to push the reminder to');
        return sent;
      } catch (error) {
        log.warn({ error: String(error), reminderId: r.id }, 'Reminder push failed');
        return false;
      }
    },
  };
}
