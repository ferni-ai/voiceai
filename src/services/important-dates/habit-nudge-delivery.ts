/**
 * Habit check-in nudges, delivered by the important-date reminder job.
 *
 * Aspirations stores `habit.nextNudgeAt` (habit-reminder-rule.ts). Each run
 * reads the habits whose nudge time has come (collection-group query on
 * `aspirations`, index in firestore.indexes.json) and, for each one, follows
 * the same steps as date reminders:
 *   1. re-plans it (the habit may have been edited, checked in, paused), and
 *   2. drops a nudge that's gone stale (a missed run shouldn't nudge hours late);
 *   3. skips topics the user asked us not to raise proactively;
 *   4. defers it during quiet hours / do-not-contact times;
 *   5. claims `{habitId}_{YYYY-MM-DD}` in `important_date_deliveries` with a
 *      transactional create, so a day's nudge goes out at most once;
 *   6. delivers with the user's channels and fallback, records the outcome,
 *      and stores the habit's next nudge.
 *
 * The delivery record holds ids and the outcome only, not the habit's title.
 *
 * @module services/important-dates/habit-nudge-delivery
 */

import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import { isDueOn } from '../aspirations/habit-math.js';
import { recordFromDoc as aspirationFromDoc } from '../aspirations/record.js';
import { ASPIRATIONS_COLLECTION } from '../aspirations/store.js';
import { isConfirmed, type AspirationRecord } from '../aspirations/types.js';
import { formatCivil, localToday } from './date-math.js';
import { isDoNotContactNow, isReminderTopicAllowed } from './boundaries-adapter.js';
import { habitNudgeMessage } from './copy.js';
import { planHabitNudge, type PlannedHabitNudge } from './habit-reminder-rule.js';
import {
  channelPlan,
  loadUserReach,
  sendWithFallback,
  type ChannelSender,
  type ServerChannels,
} from './reminder-delivery.js';
import { isQuietNow, quietHoursEnd, type ScheduleContext } from './reminder-schedule.js';
import { DELIVERIES_COLLECTION, userRef } from './store.js';

const log = createLogger({ module: 'important-dates:habit-nudges' });

/** A nudge more than this late (missed runs, long deferral) is dropped. */
export const STALE_NUDGE_MS = 6 * 60 * 60 * 1000;
const DEFER_DNC_MS = 60 * 60 * 1000;

export const NUDGE_FIELD = 'habit.nextNudgeAt';

export interface HabitNudgeRunResult {
  due: number;
  delivered: number;
  failed: number;
  deferred: number;
  /** Already claimed, or too late to be useful. */
  skipped: number;
  /** Topic the user asked us not to raise. */
  suppressed: number;
  rescheduled: number;
}

export interface HabitNudgeDeps {
  now: Date;
  limit: number;
  dryRun: boolean;
  send: ChannelSender;
  server: () => Promise<ServerChannels>;
  contextFor: (userId: string) => Promise<ScheduleContext>;
  externalSentToday: (db: Firestore, userId: string, day: string) => Promise<number>;
}

type Outcome = Exclude<keyof HabitNudgeRunResult, 'due'>;

function planFor(record: AspirationRecord, ctx: ScheduleContext): PlannedHabitNudge | null {
  const habit = record.habit;
  if (!habit || record.level !== 'habit' || !isConfirmed(record)) return null;
  return planHabitNudge(
    {
      habitId: record.id,
      reminderTime: habit.schedule.reminderTime,
      active: record.status === 'active',
      isDue: (day) => isDueOn(habit, day),
    },
    ctx
  );
}

/** Store the habit's next nudge time (whole-map write, like aspirations does). */
async function setNextNudge(ref: DocumentReference, at: string | null): Promise<void> {
  const snap = await ref.get();
  const stored = snap.data()?.habit;
  if (!snap.exists || !stored || typeof stored !== 'object') return;
  await ref.update({ habit: { ...(stored as Record<string, unknown>), nextNudgeAt: at } });
}

/** The next nudge after `ctx.now`. */
async function advance(
  ref: DocumentReference,
  record: AspirationRecord,
  ctx: ScheduleContext
): Promise<void> {
  const next = planFor(record, ctx);
  await setNextNudge(ref, next ? next.at.toISOString() : null);
}

async function claimNudge(
  db: Firestore,
  userId: string,
  habitId: string,
  plan: PlannedHabitNudge,
  now: Date
): Promise<boolean> {
  const ref = userRef(db, userId).collection(DELIVERIES_COLLECTION).doc(plan.key);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return false;
    tx.set(ref, {
      key: plan.key,
      kind: 'habit_nudge',
      habitId,
      remindOn: formatCivil(plan.remindOn),
      status: 'claimed',
      claimedAt: now.toISOString(),
    });
    return true;
  });
}

async function processHabit(
  db: Firestore,
  userId: string,
  ref: DocumentReference,
  record: AspirationRecord,
  ctx: ScheduleContext,
  deps: HabitNudgeDeps
): Promise<Outcome> {
  // The nudge that's due: the first one inside the stale window. A missed
  // nudge older than the window plans past `now`, so it's never sent late.
  const due = planFor(record, { ...ctx, now: new Date(ctx.now.getTime() - STALE_NUDGE_MS) });
  if (!due || due.at.getTime() > ctx.now.getTime()) {
    if (!deps.dryRun) await advance(ref, record, ctx);
    return 'rescheduled';
  }
  if (!(await isReminderTopicAllowed(userId, record.title))) {
    if (!deps.dryRun) await advance(ref, record, ctx);
    return 'suppressed';
  }
  if (isQuietNow(ctx)) {
    if (!deps.dryRun) await setNextNudge(ref, quietHoursEnd(ctx).toISOString());
    return 'deferred';
  }
  if (await isDoNotContactNow(userId, ctx.now, ctx.timeZone)) {
    const later = new Date(ctx.now.getTime() + DEFER_DNC_MS).toISOString();
    if (!deps.dryRun) await setNextNudge(ref, later);
    return 'deferred';
  }
  if (deps.dryRun) return 'delivered';

  if (!(await claimNudge(db, userId, record.id, due, ctx.now))) {
    await advance(ref, record, ctx);
    return 'skipped';
  }

  const reach = await loadUserReach(db, userId);
  const day = formatCivil(localToday(ctx.now, ctx.timeZone));
  const channels = channelPlan(
    {},
    ctx.settings,
    reach,
    await deps.server(),
    await deps.externalSentToday(db, userId, day)
  );
  const text = habitNudgeMessage(record.title, record.habit?.streak ?? 0);
  const delivery = await sendWithFallback(channels, deps.send, {
    userId,
    text,
    personaId: record.personaId ?? 'ferni',
    reach,
    triggerId: due.key,
  });
  await userRef(db, userId)
    .collection(DELIVERIES_COLLECTION)
    .doc(due.key)
    .update({
      status: delivery.delivered ? 'delivered' : channels.length === 0 ? 'no_channel' : 'failed',
      ...(delivery.channel ? { channel: delivery.channel } : {}),
      attempts: delivery.attempts,
      completedAt: new Date().toISOString(),
    });
  await advance(ref, record, ctx);
  log.info(
    { userId, habitId: record.id, key: due.key, channel: delivery.channel },
    'Habit nudge handled'
  );
  return delivery.delivered ? 'delivered' : 'failed';
}

/** Deliver every habit nudge that's due. Per-habit failures are counted, not thrown. */
export async function deliverDueHabitNudges(
  db: Firestore,
  deps: HabitNudgeDeps
): Promise<HabitNudgeRunResult> {
  const result: HabitNudgeRunResult = {
    due: 0,
    delivered: 0,
    failed: 0,
    deferred: 0,
    skipped: 0,
    suppressed: 0,
    rescheduled: 0,
  };
  // nextNudgeAt is an ISO string, so string order is time order.
  const snapshot = await db
    .collectionGroup(ASPIRATIONS_COLLECTION)
    .where(NUDGE_FIELD, '<=', deps.now.toISOString())
    .orderBy(NUDGE_FIELD)
    .limit(deps.limit)
    .get();
  result.due = snapshot.size;

  for (const doc of snapshot.docs) {
    // Owner from the path (bogle_users/{uid}/aspirations/{id}), never a field.
    const userId = doc.ref.parent.parent?.id;
    const record = userId ? aspirationFromDoc(doc.id, doc.data()) : null;
    if (!userId || !record) continue;
    try {
      const ctx = await deps.contextFor(userId);
      const outcome = await processHabit(db, userId, doc.ref, record, ctx, deps);
      result[outcome]++;
    } catch (error) {
      result.failed++;
      log.error({ error: String(error), userId, habitId: record.id }, 'Habit nudge failed');
    }
  }
  if (result.due > 0) log.info(result, 'Habit nudge run');
  return result;
}
