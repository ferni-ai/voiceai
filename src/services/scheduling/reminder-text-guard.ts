/**
 * Every reminder text (sms or voice_message) goes through the guarded sender
 * or into the app, whatever the flags say: never a direct send, which honours
 * neither STOP nor quiet hours (fail closed). deliverReminder asks here first,
 * so the deliver-reminders job and the in-process scheduler take the same path.
 * REMINDER_SMS_DEFAULT only decides whether a reminder kept for the app
 * (voice:<uid>) is texted to its owner instead.
 *
 * The guarded sender can also hold a text: one due in the owner's quiet hours
 * waits until 08:00 (Seth, 2026-10-17), and one inside the guard's gap after
 * another waits out the gap. The guard saves the new time (and moves the
 * promise with it); here the reminder goes back to 'pending' at that time.
 *
 * The guarded sender lives a layer up (services/outreach/reminder-texts.ts),
 * so each process that delivers reminders installs it: the UI server's job
 * route, and startup when REMINDER_SCHEDULER_IN_PROCESS is on. A process
 * without it delivers the reminder in the app (fail closed).
 *
 * MESSAGING_PIPELINE: a reminder call dials deliveryAddress, which the model can
 * set, and checked no STOP at all. It reads consent/{phoneHash} first; a refused
 * one is delivered in the app instead. A call to anyone but the owner's verified
 * number needs their own consent: nothing confirms a reminder call. (Texts get
 * the same checks in the guarded sender.)
 *
 * @module services/scheduling/reminder-text-guard
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { ReminderDeliveryMethod, ScheduledReminder } from './reminder-scheduler.js';

const log = createLogger({ module: 'reminder-text-guard' });

/** What the guarded sender did with a reminder text: sent it, held it for the app, or held it until a time. */
export type GuardedTextOutcome = 'sent' | 'in-app' | { holdUntil: Date };
export type ReminderTextGuard = (reminder: ScheduledReminder) => Promise<GuardedTextOutcome>;

const TEXT_METHODS: readonly ReminderDeliveryMethod[] = ['sms', 'voice_message'];

let guard: ReminderTextGuard | undefined;

export function installReminderTextGuard(next: ReminderTextGuard | undefined): void {
  guard = next;
}

/** Is this the owner's own verified number? Installed with the guard; without it, never. */
export type OwnNumberCheck = (userId: string, phone: string) => Promise<boolean>;
let ownNumber: OwnNumberCheck | undefined;

export function installReminderOwnNumber(next: OwnNumberCheck | undefined): void {
  ownNumber = next;
}

/**
 * null: not a text, so deliver it on its channel (unless consent refuses a
 * call: then 'in-app'). `textOn` is the owner's REMINDER_SMS_DEFAULT, decided
 * per person by the caller; unknown means off, so an app reminder stays in the app.
 */
export async function textThroughGuard(
  reminder: ScheduledReminder,
  textOn = false,
  env: Record<string, string | undefined> = process.env
): Promise<GuardedTextOutcome | null> {
  if (!TEXT_METHODS.includes(reminder.deliveryMethod)) {
    return (await consentRefusal(reminder, env)) ? 'in-app' : null;
  }
  if (!textOn && reminder.deliveryAddress.startsWith('voice:')) return 'in-app';
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

/** Why a reminder call may not reach deliveryAddress, or null (MESSAGING_PIPELINE). */
async function consentRefusal(
  reminder: ScheduledReminder,
  env: Record<string, string | undefined>
): Promise<string | null> {
  if (reminder.deliveryMethod !== 'call') return null;
  const { consentBlocks, defaultConsentDeps } = await import('../messaging/consent.js');
  const to = reminder.deliveryAddress;
  const refused = await consentBlocks(
    to,
    'call',
    async (): Promise<boolean> => (await ownNumber?.(reminder.userId, to)) === true,
    { ...defaultConsentDeps(), env }
  );
  if (refused) log.info({ reminderId: reminder.id, refused }, 'Reminder call held for the app');
  return refused;
}

/**
 * Marks a held reminder 'pending' at its new time in this process (the in-process
 * scheduler reads these objects). The guard that held it saved the new time.
 */
function holdReminder(reminder: ScheduledReminder, until: Date): void {
  reminder.status = 'pending';
  reminder.scheduledFor = until;
  log.info({ reminderId: reminder.id, until: until.toISOString() }, 'Reminder text held');
}

/** For deliverReminder: deliver a held-for-the-app text in the app, or hold it until its time. */
export async function settleGuardedText<T>(
  reminder: ScheduledReminder,
  outcome: 'in-app' | { holdUntil: Date },
  deliver: (r: ScheduledReminder) => Promise<T>,
  heldResult: T
): Promise<T> {
  if (outcome === 'in-app') return deliver({ ...reminder, deliveryMethod: 'in_app' });
  holdReminder(reminder, outcome.holdUntil);
  return Promise.resolve(heldResult);
}
