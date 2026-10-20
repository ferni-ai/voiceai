/**
 * Reasons to reach out beyond Ferni's own promises (triggers.ts):
 *
 * - A reminder that didn't go out (found too late, or the channel failed):
 *   the same day, Ferni owns it. "I was meant to remind you to call the
 *   pharmacy earlier. Did it happen?"
 * - Something they said they'd do, when its follow-up comes due
 *   (COACH_FOLLOW_THROUGH, commitment-follow-up.ts: on for everyone, or for
 *   this person through their cohort flags). For allowlisted users this
 *   replaces the between-call push (commitment-push.ts).
 * - Something in their world that is due today (the temporal world model's
 *   "since you last talked" items, WORLD_MODEL_TEMPORAL), when the server
 *   has that model; the loader is passed in by the scheduler job.
 *
 * @module services/outreach/proactive-channels/more-triggers
 */

import {
  coachFollowThroughMode,
  dueForPush,
  firestoreCommitmentStore,
  toOpenCommitment,
  youSaidYoud,
} from '../../superhuman/commitment-follow-up.js';
import { getFirestoreDb } from '../../superhuman/firestore-utils.js';
import { flagForUser } from '../../platform/cohort-flags.js';
import type { ProactiveTrigger } from './types.js';

const HOUR_MS = 60 * 60 * 1000;
/** A missed reminder is worth owning up to the same day, not after. */
const REMINDER_OWN_UP_MS = 12 * HOUR_MS;

/** A short quote fit for a text, or undefined. */
function quote(s: unknown, max = 90): string | undefined {
  const t =
    typeof s === 'string'
      ? s
          .trim()
          .replace(/\s+/g, ' ')
          .replace(/[.!?]+$/, '')
      : '';
  return t && t.length <= max ? t : undefined;
}

/**
 * Reminders to the user (not to a contact) that didn't reach them in the last
 * 12 hours: missed, failed, or saved in the app with nobody told (in_app_unnotified).
 */
export async function reminderTriggers(userId: string, now: Date): Promise<ProactiveTrigger[]> {
  const db = getFirestoreDb();
  if (!db) return [];
  const col = db.collection('bogle_users').doc(userId).collection('reminders');
  const [missed, failed, unnotified] = await Promise.all([
    col.where('status', '==', 'missed').get(),
    col.where('status', '==', 'failed').get(),
    col.where('status', '==', 'in_app_unnotified').get(),
  ]);
  const out: ProactiveTrigger[] = [];
  for (const doc of [...missed.docs, ...failed.docs, ...unnotified.docs]) {
    const r = doc.data();
    const at = Date.parse(String(r.scheduledFor ?? ''));
    const what = quote(r.message);
    if (r.isDirectToContact === true || !what || Number.isNaN(at)) continue;
    if (at > now.getTime() || now.getTime() - at > REMINDER_OWN_UP_MS) continue;
    out.push({
      sourceId: `reminder:${doc.id}`,
      kind: 'reminder',
      weight: 'light',
      timely: true,
      text: `Hey, it's Ferni. I was meant to remind you earlier: ${what}. Sorry that slipped. Did it happen?`,
      reason: `I was meant to remind them "${what}" earlier and the reminder didn't reach them`,
      expiresAt: new Date(at + REMINDER_OWN_UP_MS),
    });
  }
  return out;
}

/**
 * On for everyone (the server's env), else for this person when their cohort
 * flags turn it on. Read per person: this server runs for many users at once.
 */
async function followThroughOn(userId: string): Promise<boolean> {
  return coachFollowThroughMode() || (await flagForUser(userId, 'COACH_FOLLOW_THROUGH')) === 'on';
}

/** What they said they'd do, when it's time to ask how it went (COACH_FOLLOW_THROUGH). */
export async function commitmentTriggers(userId: string, now: Date): Promise<ProactiveTrigger[]> {
  if (!(await followThroughOn(userId))) return [];
  const store = firestoreCommitmentStore;
  const out: ProactiveTrigger[] = [];
  for (const { id, data } of await store.active(userId)) {
    const c = toOpenCommitment(id, data);
    const said = c && quote(youSaidYoud(c), 120);
    if (!c || !said || !dueForPush(c, now.getTime())) continue;
    out.push({
      sourceId: `commitment:${c.id}:${c.followUpCount}`,
      kind: 'follow_up',
      weight: 'light',
      timely: true,
      text: `Hey, it's Ferni. Last time you said ${said}. How did it go?`,
      reason: `last time they said they'd ${c.statement}, and it's time to ask how it went`,
      afterSend: async () => store.markFollowedUp(userId, c, now.getTime()),
    });
  }
  return out;
}

/** One thing in their world that comes due (temporal world model). */
export interface WorldDueItem {
  factId: string;
  /** "Mindy (sister): knee surgery, today." */
  text: string;
}

export function worldTriggers(items: WorldDueItem[], now: Date): ProactiveTrigger[] {
  const day = now.toISOString().slice(0, 10);
  return items.flatMap((item) => {
    const what = quote(item.text, 120);
    if (!what) return [];
    return [
      {
        sourceId: `world:${item.factId}:${day}`,
        kind: 'world_due' as const,
        weight: 'light' as const,
        timely: true,
        text: `Hey, it's Ferni. Thinking of you today (${what}). How's it going?`,
        reason: `something in their life is due today: ${what}`,
      },
    ];
  });
}
