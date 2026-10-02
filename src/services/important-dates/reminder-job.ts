/**
 * Important-date reminder job. Cloud Scheduler runs it every 15 minutes via
 * POST /api/jobs/deliver-date-reminders (see infra/cloud-scheduler-memory.yaml).
 *
 * Each date stores `nextReminderAt`; the job reads the dates whose time has
 * come (collection-group query, index in firestore.indexes.json), then for
 * each one:
 *   1. re-plans it (the date may have been edited since);
 *   2. skips topics the user asked us not to raise proactively;
 *   3. defers it while the user is in quiet hours / do-not-contact times;
 *   4. claims `{dateId}_{year}_{offset}` in `important_date_deliveries` with a
 *      transactional create, so overlapping runs and a reminder already
 *      surfaced in conversation can't send twice;
 *   5. delivers with channel fallback, records the outcome on the claim, and
 *      schedules the date's next reminder.
 *
 * @module services/important-dates/reminder-job
 */

import type { Firestore } from 'firebase-admin/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../superhuman/firestore-utils.js';
import { formatCivil, localToday } from './date-math.js';
import { isDoNotContactNow, isReminderTopicAllowed } from './boundaries-adapter.js';
import { reminderMessage } from './copy.js';
import { recordFromDoc } from './record.js';
import {
  channelPlan,
  loadUserReach,
  sendWithFallback,
  serverChannels,
  unifiedDeliverySender,
  type ChannelSender,
  type ServerChannels,
} from './reminder-delivery.js';
import {
  isQuietNow,
  planNextReminder,
  quietHoursEnd,
  withHandledKey,
  type PlannedReminder,
  type ScheduleContext,
} from './reminder-schedule.js';
import { getReminderSettings, resolveTimeZone } from './settings.js';
import { DATES_COLLECTION, DELIVERIES_COLLECTION, userRef, withSchedule } from './store.js';
import type { ImportantDateRecord } from './types.js';

const log = createLogger({ module: 'important-dates:job' });

const DEFER_DNC_MS = 60 * 60 * 1000;

export interface DateReminderRunResult {
  due: number;
  delivered: number;
  failed: number;
  deferred: number;
  /** Already claimed (another run, or surfaced in conversation). */
  skipped: number;
  /** Topic the user asked us not to raise. */
  suppressed: number;
  rescheduled: number;
  dryRun: boolean;
}

export interface DateReminderJobOptions {
  now?: Date;
  limit?: number;
  dryRun?: boolean;
  /** Injected in tests. */
  sender?: ChannelSender;
  server?: ServerChannels;
}

export type ClaimStatus = 'claimed' | 'surfaced';

/**
 * Claim a reminder key. Returns false when it was already claimed (by an
 * overlapping run or by a session that surfaced it in conversation).
 */
export async function claimReminder(
  db: Firestore,
  userId: string,
  record: ImportantDateRecord,
  plan: PlannedReminder,
  status: ClaimStatus,
  now: Date
): Promise<boolean> {
  const ref = userRef(db, userId).collection(DELIVERIES_COLLECTION).doc(plan.key);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return false;
    tx.set(ref, {
      key: plan.key,
      dateId: record.id,
      offset: plan.offset,
      occursOn: formatCivil(plan.occursOn),
      remindOn: formatCivil(plan.remindOn),
      status,
      ...(status === 'surfaced' ? { channel: 'conversation' } : {}),
      claimedAt: now.toISOString(),
    });
    return true;
  });
}

async function externalSentToday(db: Firestore, userId: string, day: string): Promise<number> {
  const snap = await userRef(db, userId)
    .collection(DELIVERIES_COLLECTION)
    .where('remindOn', '==', day)
    .get();
  return snap.docs.filter((d) => {
    const c = d.data().channel;
    return c === 'sms' || c === 'email';
  }).length;
}

/** Store the handled key and the next reminder on the date. */
async function markHandled(
  db: Firestore,
  userId: string,
  record: ImportantDateRecord,
  key: string,
  ctx: ScheduleContext
): Promise<void> {
  const next = withSchedule(
    { ...record, sentReminderKeys: withHandledKey(record.sentReminderKeys, key) },
    ctx
  );
  await userRef(db, userId).collection(DATES_COLLECTION).doc(record.id).update({
    sentReminderKeys: next.sentReminderKeys,
    nextReminderAt: next.nextReminderAt,
    nextReminderKey: next.nextReminderKey,
  });
}

async function setNextAt(
  db: Firestore,
  userId: string,
  id: string,
  at: string | null,
  key: string | null
): Promise<void> {
  await userRef(db, userId)
    .collection(DATES_COLLECTION)
    .doc(id)
    .update({ nextReminderAt: at, nextReminderKey: key });
}

export async function deliverDueDateReminders(
  opts: DateReminderJobOptions = {}
): Promise<DateReminderRunResult> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  const now = opts.now ?? new Date();
  const dryRun = opts.dryRun === true;
  const send = opts.sender ?? unifiedDeliverySender;
  const result: DateReminderRunResult = {
    due: 0,
    delivered: 0,
    failed: 0,
    deferred: 0,
    skipped: 0,
    suppressed: 0,
    rescheduled: 0,
    dryRun,
  };

  // nextReminderAt is an ISO string, so string order is time order.
  const snapshot = await db
    .collectionGroup(DATES_COLLECTION)
    .where('nextReminderAt', '<=', now.toISOString())
    .orderBy('nextReminderAt')
    .limit(opts.limit ?? 200)
    .get();
  result.due = snapshot.size;
  if (snapshot.empty) return result;
  const server = opts.server ?? (await serverChannels());
  const contexts = new Map<string, ScheduleContext>();

  for (const doc of snapshot.docs) {
    // Owner from the path (bogle_users/{uid}/important_dates/{id}), never a field.
    const userId = doc.ref.parent.parent?.id;
    const record = userId ? recordFromDoc(doc.id, doc.data()) : null;
    if (!userId || !record) continue;
    try {
      let ctx = contexts.get(userId);
      if (!ctx) {
        const settings = await getReminderSettings(userId);
        ctx = { timeZone: await resolveTimeZone(userId, settings), now, settings };
        contexts.set(userId, ctx);
      }
      const outcome = await processDate(db, userId, record, ctx, { dryRun, send, server });
      result[outcome]++;
    } catch (error) {
      result.failed++;
      log.error({ error: String(error), userId, id: record.id }, 'Date reminder failed');
    }
  }
  if (result.due > 0) log.info(result, 'Date reminder run');
  return result;
}

type Outcome = 'delivered' | 'failed' | 'deferred' | 'skipped' | 'suppressed' | 'rescheduled';

async function processDate(
  db: Firestore,
  userId: string,
  record: ImportantDateRecord,
  ctx: ScheduleContext,
  deps: { dryRun: boolean; send: ChannelSender; server: ServerChannels }
): Promise<Outcome> {
  const plan = planNextReminder(record, ctx);
  if (!plan || plan.at.getTime() > ctx.now.getTime()) {
    if (!deps.dryRun) {
      await setNextAt(db, userId, record.id, plan?.at.toISOString() ?? null, plan?.key ?? null);
    }
    return 'rescheduled';
  }
  if (!(await isReminderTopicAllowed(userId, record.title))) {
    if (!deps.dryRun) await markHandled(db, userId, record, plan.key, ctx);
    return 'suppressed';
  }
  if (isQuietNow(ctx)) {
    if (!deps.dryRun) {
      // Wake up when quiet hours end, or at the usual send time that morning.
      const end = quietHoursEnd(ctx);
      const replanned = planNextReminder(record, { ...ctx, now: end });
      const wake = replanned && replanned.at > end ? replanned.at : end;
      await setNextAt(db, userId, record.id, wake.toISOString(), replanned?.key ?? plan.key);
    }
    return 'deferred';
  }
  if (await isDoNotContactNow(userId, ctx.now, ctx.timeZone)) {
    const later = new Date(ctx.now.getTime() + DEFER_DNC_MS).toISOString();
    if (!deps.dryRun) await setNextAt(db, userId, record.id, later, plan.key);
    return 'deferred';
  }
  if (deps.dryRun) return 'delivered';

  const claimed = await claimReminder(db, userId, record, plan, 'claimed', ctx.now);
  if (!claimed) {
    await markHandled(db, userId, record, plan.key, ctx);
    return 'skipped';
  }

  const reach = await loadUserReach(db, userId);
  const day = formatCivil(localToday(ctx.now, ctx.timeZone));
  const channels = channelPlan(
    record,
    ctx.settings,
    reach,
    deps.server,
    await externalSentToday(db, userId, day)
  );
  const daysUntil = Math.max(0, daysFrom(plan));
  const text = reminderMessage(record, daysUntil, plan.occursOn, yearsFor(record, plan));
  const delivery = await sendWithFallback(channels, deps.send, {
    userId,
    text,
    personaId: record.personaId ?? 'ferni',
    reach,
    triggerId: plan.key,
  });

  await userRef(db, userId)
    .collection(DELIVERIES_COLLECTION)
    .doc(plan.key)
    .update({
      status: delivery.delivered ? 'delivered' : channels.length === 0 ? 'no_channel' : 'failed',
      ...(delivery.channel ? { channel: delivery.channel } : {}),
      attempts: delivery.attempts,
      text,
      completedAt: new Date().toISOString(),
    });
  await markHandled(db, userId, record, plan.key, ctx);
  log.info(
    {
      userId,
      id: record.id,
      key: plan.key,
      channel: delivery.channel,
      delivered: delivery.delivered,
    },
    'Date reminder handled'
  );
  return delivery.delivered ? 'delivered' : 'failed';
}

function daysFrom(plan: PlannedReminder): number {
  const a = Date.UTC(plan.remindOn.year, plan.remindOn.month - 1, plan.remindOn.day);
  const b = Date.UTC(plan.occursOn.year, plan.occursOn.month - 1, plan.occursOn.day);
  return Math.round((b - a) / 86_400_000);
}

function yearsFor(record: ImportantDateRecord, plan: PlannedReminder): number | undefined {
  const m = /^(\d{4})-/.exec(record.date);
  if (!record.recurring || !m) return undefined;
  const years = plan.occursOn.year - Number(m[1]);
  return years > 0 ? years : undefined;
}
