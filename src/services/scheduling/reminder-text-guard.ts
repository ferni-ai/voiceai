/**
 * With REMINDER_SMS_DEFAULT=on, every reminder text (sms, or a voice_message
 * MMS) goes through the guarded sender or into the app: never the old
 * sendReminder, which honours neither STOP nor quiet hours. deliverReminder
 * asks here first, so the deliver-reminders job and the in-process scheduler
 * take the same path.
 *
 * The guarded sender lives a layer up (services/outreach/reminder-texts.ts),
 * so each process that delivers reminders installs it: the UI server's job
 * route, and startup when REMINDER_SCHEDULER_IN_PROCESS is on. A process
 * without it delivers the reminder in the app (fail closed).
 *
 * @module services/scheduling/reminder-text-guard
 */

import { isReminderSmsDefaultOn } from '../../config/reminder-sms-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { ReminderDeliveryMethod, ScheduledReminder } from './reminder-scheduler.js';

const log = createLogger({ module: 'reminder-text-guard' });

/** What the guarded sender did with a reminder text: sent it, or held it for the app. */
export type GuardedTextOutcome = 'sent' | 'in-app';
export type ReminderTextGuard = (reminder: ScheduledReminder) => Promise<GuardedTextOutcome>;

const TEXT_METHODS: readonly ReminderDeliveryMethod[] = ['sms', 'voice_message'];

let guard: ReminderTextGuard | undefined;

export function installReminderTextGuard(next: ReminderTextGuard | undefined): void {
  guard = next;
}

/** null: not a text, or the flag is off, so deliver it as before. */
export async function textThroughGuard(
  reminder: ScheduledReminder,
  env: Record<string, string | undefined> = process.env
): Promise<GuardedTextOutcome | null> {
  if (!isReminderSmsDefaultOn(env) || !TEXT_METHODS.includes(reminder.deliveryMethod)) return null;
  if (!guard) {
    log.warn(
      { reminderId: reminder.id },
      'No guarded text sender in this process; delivering in app'
    );
    return 'in-app';
  }
  try {
    return await guard(reminder);
  } catch (error) {
    log.error({ error: String(error), reminderId: reminder.id }, 'Guarded reminder text failed');
    return 'in-app';
  }
}
