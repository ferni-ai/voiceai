/**
 * What a reply to a proactive text means, for users on the dogfood
 * allowlist whose number is the verified one on their Firebase account:
 *
 * - "less" (or "too much"): one step down normal → gentle → light.
 * - "not now" (or "later", "busy"): nothing for 12 hours, and the last
 *   check-in counts as declined, which backs off calls.
 * - "stop" or any other opt-out (messaging/sms-keywords.ts, the one list):
 *   proactive check-ins off. The webhook's own STOP handling still runs after
 *   this and sends the unsubscribe reply.
 * - Anything else: the last text counts as answered, so texts don't back off.
 *
 * Returns the reply to text back, or undefined to let the webhook carry on.
 *
 * @module services/outreach/proactive-channels/sms-replies
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getFirebaseUserByPhone } from '../../identity/firebase-auth.js';
import { getFirestoreDb } from '../../superhuman/firestore-utils.js';
import { inboundKeyword } from '../../messaging/sms-keywords.js';
import { frequencyOf } from './channel-policy.js';
import { logId, LOG_COLLECTION, recentOutreach, type OutreachOutcome } from './outreach-log.js';
import { isProactiveChannelsOn, isProactiveChannelsUser } from './proactive-tick.js';
import type { ProactiveChannel } from './types.js';

const log = createLogger({ module: 'ProactiveSmsReplies' });

const HOUR_MS = 60 * 60 * 1000;
const SNOOZE_MS = 12 * HOUR_MS;
/** A reply more than this long after the last check-in isn't an answer to it. */
const ANSWER_WINDOW_MS = 48 * HOUR_MS;

const LESS = /^(less|less often|fewer|too much|too many|text less)[.!]*$/;
const NOT_NOW = /^(not now|later|busy|not today|can'?t talk( right now)?)[.!]*$/;

async function setPrefs(userId: string, prefs: Record<string, unknown>): Promise<void> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  await db
    .collection('bogle_users')
    .doc(userId)
    .set({ outreachPreferences: prefs }, { merge: true });
}

/** Mark their latest text or call (within the answer window) with how they answered. */
async function markLatest(
  userId: string,
  outcome: OutreachOutcome,
  now: Date,
  channels: ProactiveChannel[]
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;
  const recent = await recentOutreach(userId, new Date(now.getTime() - ANSWER_WINDOW_MS));
  const latest = recent
    .filter((e) => channels.includes(e.channel))
    .sort((a, b) => b.at.localeCompare(a.at))
    .at(0);
  if (latest === undefined) return;
  await db
    .collection('bogle_users')
    .doc(userId)
    .collection(LOG_COLLECTION)
    .doc(logId(latest.sourceId))
    .set({ outcome, outcomeAt: now.toISOString() }, { merge: true });
}

async function less(userId: string): Promise<string> {
  const db = getFirestoreDb();
  const user = db ? (await db.collection('bogle_users').doc(userId).get()).data() : undefined;
  const current = frequencyOf(user?.outreachPreferences);
  const next = current === 'normal' ? 'gentle' : 'light';
  await setPrefs(userId, { proactiveFrequency: current === 'off' ? 'off' : next });
  return next === 'light'
    ? "Got it. I'll keep it to once a day, and only when it matters."
    : "Got it, I'll check in less.";
}

export async function handleProactiveSmsReply(
  from: string,
  body: string,
  now: Date = new Date()
): Promise<string | undefined> {
  if (!isProactiveChannelsOn()) return undefined;
  try {
    const userId = (await getFirebaseUserByPhone(from))?.uid;
    if (!userId || !(await isProactiveChannelsUser(userId))) return undefined;
    const said = body.trim().toLowerCase().replace(/\s+/g, ' ');

    if (inboundKeyword(body)?.kind === 'opt-out') {
      await setPrefs(userId, { proactiveFrequency: 'off' });
      log.info({ userId }, 'Proactive check-ins stopped by text');
      return undefined;
    }
    if (LESS.test(said)) return await less(userId);
    if (NOT_NOW.test(said)) {
      await setPrefs(userId, {
        proactiveSnoozeUntil: new Date(now.getTime() + SNOOZE_MS).toISOString(),
      });
      await markLatest(userId, 'declined', now, ['sms', 'voice_call']);
      return "No problem. I'll leave you be for now.";
    }
    await markLatest(userId, 'replied', now, ['sms']);
  } catch (error) {
    log.warn({ error: String(error) }, 'Proactive SMS reply handling failed');
  }
  return undefined;
}
