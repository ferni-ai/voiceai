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
 * @module services/scheduling/reminder-delivery-job
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../superhuman/firestore-utils.js';
import { getChannelStatus, type ChannelStatus } from '../outreach/unified-delivery.js';
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
    const reminder = reminderFromDoc(doc.id, doc.data());
    if (!reminder.userId) reminder.userId = doc.ref.parent.parent?.id ?? '';
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
      continue;
    }

    if (channel !== reminder.deliveryMethod) result.rerouted++;
    const ok = await deliverReminder({ ...reminder, deliveryMethod: channel });
    if (ok) result.delivered++;
    else result.failed++;
  }

  if (result.due > 0) log.info(result, 'Reminder delivery run');
  return result;
}
