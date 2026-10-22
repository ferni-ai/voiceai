/**
 * What became of a reminder delivery, and the wording of one that came from a
 * family member. An inbox row only reached someone when a push told them, so
 * 'in_app_unnotified' is not delivered and its promise is not kept.
 *
 * @module services/scheduling/reminder-outcome
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { ScheduledReminder } from './reminder-scheduler.js';

/** A reminder's stored status ('in_app_unnotified': an inbox row with no text or push). */
export type ReminderStatus =
  'pending' | 'sending' | 'delivered' | 'failed' | 'cancelled' | 'missed' | 'in_app_unnotified';

/**
 * Sent on its channel (text, email, call), saved in the app with a push
 * ('in_app') or with nothing to tell them ('in_app_unnotified'), held to a
 * later time by the text guard, or failed.
 */
export type ReminderOutcome = 'sent' | 'in_app' | 'in_app_unnotified' | 'held' | 'failed';

/** How a delivery run reaches each person, decided per person by the server running it. */
export interface ReminderReach {
  /** Whether this person's app reminders go by text (REMINDER_SMS_DEFAULT, for everyone or for them). */
  textOn: (userId: string) => Promise<boolean>;
  /** Tells the person a reminder is in their app's inbox; true when a push was sent. */
  notifyInApp?: (reminder: ScheduledReminder) => Promise<boolean>;
}

/** The owner's text decision; a failed read means off, so the reminder stays in the app. */
export async function textOnFor(
  reach: ReminderReach | undefined,
  userId: string
): Promise<boolean> {
  if (!reach) return false;
  try {
    return await reach.textOn(userId);
  } catch (error) {
    getLogger().warn(
      { error: String(error) },
      'Reminder text flag not read; keeping it in the app'
    );
    return false;
  }
}

export interface DeliverOptions {
  /** The owner's REMINDER_SMS_DEFAULT (textOnFor); unknown means off. */
  textOn?: boolean;
  /** Tells the owner a reminder is in their app's inbox (a push); true when one was sent. */
  notifyInApp?: (reminder: ScheduledReminder) => Promise<boolean>;
}

/** True when it reached them, or was held to a later time. */
export const reachedThem = (outcome: ReminderOutcome): boolean =>
  outcome !== 'failed' && outcome !== 'in_app_unnotified';

/** After an inbox save: 'in_app' only when a push told them. */
export async function inAppOutcome(
  reminder: ScheduledReminder,
  opts: DeliverOptions
): Promise<'in_app' | 'in_app_unnotified'> {
  if (!opts.notifyInApp) return 'in_app_unnotified';
  try {
    return (await opts.notifyInApp(reminder)) ? 'in_app' : 'in_app_unnotified';
  } catch (error) {
    getLogger().warn({ error: String(error), reminderId: reminder.id }, 'Reminder push failed');
    return 'in_app_unnotified';
  }
}

const RELATIONSHIP_WORDS: Record<string, string> = {
  mother: 'mom',
  father: 'dad',
  grandmother: 'grandma',
  grandfather: 'grandpa',
};

/** The reminder's text, attributed when a family member asked for it ("Your mom Ann wanted me to remind you: ..."). */
export function attributedMessage(reminder: ScheduledReminder): string {
  if (!reminder.sourceIdentityId || !reminder.sourceIdentityName) return reminder.message;
  const rel = reminder.sourceRelationship;
  const relationship = rel ? RELATIONSHIP_WORDS[rel] || rel : '';
  const attribution = relationship
    ? `Your ${relationship} ${reminder.sourceIdentityName}`
    : reminder.sourceIdentityName;
  getLogger().info(
    {
      reminderId: reminder.id,
      sourceIdentityName: reminder.sourceIdentityName,
      relationship: reminder.sourceRelationship,
    },
    '👨‍👩‍👧 Reminder attributed to family member'
  );
  return `${attribution} wanted me to remind you: ${reminder.message}`;
}
