/**
 * With REMINDER_SMS_DEFAULT=on, every reminder text (sms, or a voice_message
 * MMS) goes through the guarded sender or into the app: never the old
 * sendReminder, which honours neither STOP nor quiet hours. deliverReminder
 * asks here first, so the deliver-reminders job and the in-process scheduler
 * take the same path.
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
 * MESSAGING_PIPELINE: the raw paths (a text or MMS with the flag above off, or
 * a call) dial deliveryAddress, which the model can set, and the call path
 * checked no STOP at all. They read consent/{phoneHash} first; a refused one is
 * delivered in the app instead. A text or call to anyone but the owner's
 * verified number needs their own consent: nothing confirms a reminder call.
 *
 * @module services/scheduling/reminder-text-guard
 */

import { isReminderSmsDefaultOn } from '../../config/reminder-sms-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { ReminderDeliveryMethod, ScheduledReminder } from './reminder-scheduler.js';

const log = createLogger({ module: 'reminder-text-guard' });

/** What the guarded sender did with a reminder text: sent it, held it for the app, or held it until a time. */
export type GuardedTextOutcome = 'sent' | 'in-app' | { holdUntil: Date };
export type ReminderTextGuard = (reminder: ScheduledReminder) => Promise<GuardedTextOutcome>;

const TEXT_METHODS: readonly ReminderDeliveryMethod[] = ['sms', 'voice_message'];

let guard: ReminderTextGuard | undefined;
const held = new WeakSet<ScheduledReminder>();

export function installReminderTextGuard(next: ReminderTextGuard | undefined): void {
  guard = next;
}

/** The owner's own verified number, or one the owner holds a grant for? Installed with the guard; without it, never. */
export type OwnNumberCheck = (
  userId: string,
  phone: string,
  channel: 'sms' | 'call'
) => Promise<boolean>;
let ownNumber: OwnNumberCheck | undefined;

export function installReminderOwnNumber(next: OwnNumberCheck | undefined): void {
  ownNumber = next;
}

/** True when deliverReminder held this reminder to a later time instead of delivering it. */
export const wasHeld = (reminder: ScheduledReminder): boolean => held.has(reminder);

/** null: not a text, or the flag is off, so deliver it as before (unless consent refuses it). */
export async function textThroughGuard(
  reminder: ScheduledReminder,
  env: Record<string, string | undefined> = process.env
): Promise<GuardedTextOutcome | null> {
  if (!isReminderSmsDefaultOn(env) || !TEXT_METHODS.includes(reminder.deliveryMethod)) {
    return (await consentRefusal(reminder, env)) ? 'in-app' : null;
  }
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

/** Why the raw text or call path may not reach deliveryAddress, or null (MESSAGING_PIPELINE). */
async function consentRefusal(
  reminder: ScheduledReminder,
  env: Record<string, string | undefined>
): Promise<string | null> {
  const method = reminder.deliveryMethod;
  const channel = method === 'call' ? 'call' : TEXT_METHODS.includes(method) ? 'sms' : null;
  if (!channel) return null;
  const { consentBlocks, defaultConsentDeps } = await import('../messaging/consent.js');
  const to = reminder.deliveryAddress;
  const refused = await consentBlocks(
    to,
    channel,
    async (): Promise<boolean> => (await ownNumber?.(reminder.userId, to, channel)) === true,
    { ...defaultConsentDeps(), env }
  );
  if (refused) log.info({ reminderId: reminder.id, channel, refused }, 'Reminder held for the app');
  return refused;
}

/**
 * Marks a held reminder 'pending' at its new time in this process (the in-process
 * scheduler reads these objects). The guard that held it saved the new time.
 */
function holdReminder(reminder: ScheduledReminder, until: Date): boolean {
  reminder.status = 'pending';
  reminder.scheduledFor = until;
  held.add(reminder);
  log.info({ reminderId: reminder.id, until: until.toISOString() }, 'Reminder text held');
  return true;
}

/** For deliverReminder: deliver a held-for-the-app text in the app, or hold it until its time. */
export async function settleGuardedText(
  reminder: ScheduledReminder,
  outcome: 'in-app' | { holdUntil: Date },
  deliver: (r: ScheduledReminder) => Promise<boolean>
): Promise<boolean> {
  if (outcome === 'in-app') return deliver({ ...reminder, deliveryMethod: 'in_app' });
  return Promise.resolve(holdReminder(reminder, outcome.holdUntil));
}
