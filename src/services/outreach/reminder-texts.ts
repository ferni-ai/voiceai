/**
 * A reminder texted to the account owner's own verified number goes through
 * the guarded sender (guarded-text.ts), the one path that honours STOP and
 * texts turned off in settings, and is held in the owner's quiet hours.
 * Anything it won't text is delivered in the app instead, so the reminder is
 * never lost.
 *
 * A text reminder to any other number (one the caller said yes to) is not
 * this module's: the delivery job sends it the way it always has.
 *
 * The delivery job sits a layer below outreach, so the job route hands this
 * in (reminderTextSender), and only with REMINDER_SMS_DEFAULT=on.
 *
 * @module services/outreach/reminder-texts
 */

import { createLogger } from '../../utils/safe-logger.js';
import { isValidTimeZone } from '../../utils/time-zone.js';
import { isQuietHour } from '../follow-through/index.js';
import { isReminderSmsDefaultOn } from '../../config/reminder-sms-flag.js';
import type { OwnReminderText } from '../scheduling/reminder-delivery-job.js';
import type { ScheduledReminder } from '../scheduling/reminder-scheduler.js';
import { toE164 } from './checkin-replies.js';
import {
  defaultTextDeps,
  resolveCheckinPhone,
  sendGuardedText,
  type TextDeps,
  type TextOutcome,
} from './guarded-text.js';

const log = createLogger({ module: 'reminder-texts' });

/** Two reminder texts within a minute: the second goes to the app, so a loop can't spam. */
export const REMINDER_TEXT_GAP_MS = 60 * 1000;

/** The text, the way a friend would put it. No em dashes or ellipses. */
export function reminderText(r: ScheduledReminder): string {
  if (r.sourceIdentityName) {
    return `It's Ferni. ${r.sourceIdentityName} wanted me to remind you: ${r.message}`;
  }
  return `It's Ferni. You asked me to remind you: ${r.message}`;
}

export interface ReminderSmsDeps {
  text: TextDeps;
  send: (t: Parameters<typeof sendGuardedText>[0], deps: TextDeps) => Promise<TextOutcome>;
}

const defaultDeps = (): ReminderSmsDeps => ({ text: defaultTextDeps(), send: sendGuardedText });

/** Texts `r` to its owner through the guarded sender, if it is addressed to their own verified number. */
export async function textOwnReminder(
  r: ScheduledReminder,
  deps: ReminderSmsDeps = defaultDeps()
): Promise<OwnReminderText> {
  const to = toE164(r.deliveryAddress);
  const userDoc = await deps.text.store.userDoc(r.userId);
  const own = await resolveCheckinPhone(r.userId, userDoc, deps.text);
  if (!to || to !== own) return 'not-owner';

  const zone = r.timezone;
  if (isValidTimeZone(zone) && isQuietHour(deps.text.now(), zone)) {
    log.info({ reminderId: r.id, reason: 'quiet-hours' }, 'Reminder text held; delivering in app');
    return 'in-app';
  }
  const outcome = await deps.send(
    {
      userId: r.userId,
      body: reminderText(r),
      kind: 'reminder',
      refId: r.id,
      minGapMs: REMINDER_TEXT_GAP_MS,
    },
    deps.text
  );
  if (outcome.sent) return 'sent';
  log.info({ reminderId: r.id, reason: outcome.reason }, 'Reminder text held; delivering in app');
  return 'in-app';
}

/** What the job route hands the delivery job: the guarded sender with the flag on, else nothing. */
export function reminderTextSender(
  env: Record<string, string | undefined> = process.env
): ((r: ScheduledReminder) => Promise<OwnReminderText>) | undefined {
  return isReminderSmsDefaultOn(env) ? (r) => textOwnReminder(r) : undefined;
}
