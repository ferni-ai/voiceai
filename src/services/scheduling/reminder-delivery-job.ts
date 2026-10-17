/**
 * Reminder Delivery Job
 *
 * Delivers reminders that are due, straight from Firestore. Cloud Scheduler
 * runs it every minute via POST /api/jobs/deliver-reminders.
 *
 * Reminders used to be delivered only by an interval inside the voice-call
 * process that created them, from that process's memory. Call processes end
 * long before most reminders are due, so in production none were ever
 * delivered (0 of 123 on 2026-09-30).
 *
 * Each reminder is claimed in a transaction (pending → sending) before it is
 * sent, so overlapping runs can't send it twice. One found more than two hours
 * late is marked 'missed' rather than sent: "call your mom" is noise the next
 * morning. A reminder we can't reach by its chosen channel (no valid phone or
 * email, or no Twilio/SendGrid credentials on this server) goes to the app's
 * message panel instead of failing.
 *
 * A reminder Ferni promised ("I'll remind you Sunday") settles that promise:
 * kept when it goes out, missed when it is found too late or can't be sent.
 * After sending, the run also settles every other overdue promise
 * (sweepOverduePromises), so Trust's "I follow through" reads real outcomes.
 *
 * @module services/scheduling/reminder-delivery-job
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../superhuman/firestore-utils.js';
import { getChannelStatus, type ChannelStatus } from '../outreach/unified-delivery.js';
import type { PromiseSweepResult } from '../superhuman/semantic-intelligence/promise-keeper.js';
import {
  deliverReminder,
  reminderFromDoc,
  type ReminderDeliveryMethod,
  type ScheduledReminder,
} from './reminder-scheduler.js';

const log = createLogger({ module: 'ReminderDeliveryJob' });

/** Reminders found later than this after their time are marked missed, not sent. */
export const MISSED_AFTER_MS = 2 * 60 * 60 * 1000;

const PHONE_METHODS: readonly ReminderDeliveryMethod[] = ['sms', 'voice_message', 'call'];

function isPhone(address: string): boolean {
  const digits = address.replace(/[^\d+]/g, '');
  return /^\+[1-9]\d{7,14}$/.test(digits) || /^1?\d{10}$/.test(digits);
}

/** Whether this server can send on a channel (Twilio/SendGrid credentials present). */
function channelUp(method: ReminderDeliveryMethod, status?: ChannelStatus): boolean {
  if (!status) return true;
  if (method === 'sms' || method === 'voice_message') return status.sms.available;
  if (method === 'call') return status.voice_call.available;
  if (method === 'email') return status.email.available;
  return true;
}

/**
 * The reminder's own channel when we can reach the user there, otherwise
 * in-app: no usable phone/email, or this server can't send on that channel.
 */
export function deliveryChannelFor(
  reminder: ScheduledReminder,
  status?: ChannelStatus
): ReminderDeliveryMethod {
  const address = reminder.deliveryAddress ?? '';
  if (PHONE_METHODS.includes(reminder.deliveryMethod) && !isPhone(address)) return 'in_app';
  if (reminder.deliveryMethod === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
    return 'in_app';
  }
  if (!channelUp(reminder.deliveryMethod, status)) return 'in_app';
  return reminder.deliveryMethod;
}

export interface ReminderRunResult {
  due: number;
  delivered: number;
  failed: number;
  missed: number;
  /** Claimed by another run first. */
  skipped: number;
  /** Delivered in-app because the chosen channel couldn't be reached. */
  rerouted: number;
  dryRun: boolean;
  /** Overdue promises settled this run (absent on a dry run or when the check failed). */
  promises?: PromiseSweepResult;
  /** Why the overdue-promise check failed, if it did. */
  promisesError?: string;
  /** Reminders whose promise outcome couldn't be written (the sweep retries them). */
  promiseErrors: number;
}

/** Record what this reminder means for the promise behind it, if Ferni made one. */
async function settlePromise(
  result: ReminderRunResult,
  settled: { owner: string; reminderId: string; kept: boolean; how: string; now: Date }
): Promise<void> {
  const { owner, reminderId, kept, how, now } = settled;
  try {
    const { settleReminderPromise } =
      await import('../superhuman/semantic-intelligence/promise-keeper.js');
    await settleReminderPromise(owner, reminderId, kept ? 'kept' : 'missed', how, now);
  } catch (error) {
    result.promiseErrors++;
    log.error({ error: String(error), reminderId }, 'Could not record the promise for a reminder');
  }
}

/** The broken-promise check, after sending: overdue promises are settled now. */
async function sweepPromises(result: ReminderRunResult, now: Date): Promise<void> {
  try {
    const { sweepOverduePromises } =
      await import('../superhuman/semantic-intelligence/promise-keeper.js');
    result.promises = await sweepOverduePromises({ now });
  } catch (error) {
    result.promisesError = String(error);
    log.error({ error: String(error) }, 'Overdue-promise check failed');
  }
}

export async function deliverDueReminders(
  opts: { now?: Date; limit?: number; dryRun?: boolean } = {}
): Promise<ReminderRunResult> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  const now = opts.now ?? new Date();
  const dryRun = opts.dryRun === true;
  const result: ReminderRunResult = {
    due: 0,
    delivered: 0,
    failed: 0,
    missed: 0,
    skipped: 0,
    rerouted: 0,
    dryRun,
    promiseErrors: 0,
  };

  // scheduledFor is stored as an ISO string, so string order is time order.
  // Needs the collection-group index (status, scheduledFor) in firestore.indexes.json.
  const snapshot = await db
    .collectionGroup('reminders')
    .where('status', '==', 'pending')
    .where('scheduledFor', '<=', now.toISOString())
    .orderBy('scheduledFor')
    .limit(opts.limit ?? 50)
    .get();
  result.due = snapshot.size;
  const channels = snapshot.size > 0 ? await getChannelStatus() : undefined;

  for (const doc of snapshot.docs) {
    // Owner from the document's path (bogle_users/{uid}/reminders/{id}), never
    // its userId field: that is data, and trusting it would let one user's
    // reminder be delivered to, and recorded under, another user.
    const owner = doc.ref.parent.parent?.id;
    if (!owner) continue;
    const reminder = { ...reminderFromDoc(doc.id, doc.data()), userId: owner };
    const late = now.getTime() - reminder.scheduledFor.getTime() > MISSED_AFTER_MS;
    const channel = deliveryChannelFor(reminder, channels);

    if (dryRun) {
      if (late) result.missed++;
      else if (channel !== reminder.deliveryMethod) result.rerouted++;
      continue;
    }

    const claim = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      if (fresh.data()?.status !== 'pending') return null;
      tx.update(
        doc.ref,
        late
          ? { status: 'missed', missedAt: now.toISOString() }
          : { status: 'sending', claimedAt: now.toISOString() }
      );
      return late ? 'missed' : 'sending';
    });
    if (claim === null) {
      result.skipped++;
      continue;
    }
    if (claim === 'missed') {
      result.missed++;
      await settlePromise(result, {
        owner,
        reminderId: reminder.id,
        kept: false,
        how: 'reminder found too late',
        now,
      });
      continue;
    }

    if (channel !== reminder.deliveryMethod) result.rerouted++;
    const ok = await deliverReminder({ ...reminder, deliveryMethod: channel });
    if (ok) result.delivered++;
    else result.failed++;
    const how = ok ? `reminder delivered (${channel})` : 'reminder could not be delivered';
    await settlePromise(result, { owner, reminderId: reminder.id, kept: ok, how, now });
  }

  if (!dryRun) await sweepPromises(result, now);

  if (result.due > 0) log.info(result, 'Reminder delivery run');
  return result;
}
