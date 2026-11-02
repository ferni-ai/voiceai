/**
 * Last call's topic opens one call, not every call (LAST_TOPIC_ONCE, off by default).
 *
 * The greeting is given "what you talked about last time" (the profile's
 * lastCallerSummary, greeting-direction.ts callerHistory) and may open on it.
 * Wins and check-ins remember being raised (wins.ts markWinSurfaced; a
 * check-in is asked at most three times, a few days apart). Last time's topic
 * did not. A summary is only replaced when a later call's LLM summary has key
 * points (session/last-summary.ts), so a call whose summary failed or came back
 * empty left it in place. Prod 2026-10-31: the owner's hello asked again about
 * a thread they had already talked through several times.
 *
 * With the flag on, a hello that raises the topic records a hash of it under
 * bogle_users/{uid}/greeting_state/last_topic, and a later greeting leaves the
 * topic out while the summary is unchanged. A new summary has a new hash, so
 * it can open a call again. Only a hash is stored, never the words; the record
 * goes with the user's erase (erase-store.ts deletes the user doc recursively)
 * and `expireAt` is for a Firestore TTL policy.
 *
 * Read or write failures fall back to the old behaviour (the topic is offered)
 * and are logged. Flag off: nothing is read or written.
 *
 * @module agents/multi-agent/greeting-topic-once
 */

import { createHash } from 'node:crypto';
import { flagOn, type Env } from '../../config/env-flag.js';
import { sharedWords } from '../personas/caller-greeting.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'greeting-topic-once' });

/** Longer than the gap between most calls; the record has nothing to do after it. */
const KEEP_MS = 60 * 24 * 60 * 60 * 1000;

function lastTopicOnceOn(env: Env): boolean {
  return flagOn('LAST_TOPIC_ONCE', env);
}

/**
 * Warmth any hello can carry, so sharing one with the summary is not raising it: "Love
 * hearing your voice, so glad you called!" after a summary about a concert they loved.
 */
const WARMTH = `love loved lovely glad happy hope hoping excited exciting missed miss welcome
  back catch caught thinking thought hear hearing voice called calling feel feeling felt
  wonderful amazing awesome fun proud sorry wish wishing care caring nice smile laugh
  thanks thank grateful`.split(/\s+/);

/**
 * The hello raised `topic` itself: it shares a word with the summary that isn't a name,
 * small talk or warmth. Errs toward not raised, which offers the topic again next call.
 */
export function raisesTopic(line: string, topic: string, userName?: string): boolean {
  return sharedWords(topic, line, [...(userName ? [userName] : []), ...WARMTH]).length > 0;
}

/** The same summary, however it was spaced or cased, has one key. */
export function topicKey(topic: string): string {
  const norm = topic.trim().toLowerCase().replace(/\s+/g, ' ');
  return createHash('sha256').update(norm).digest('hex').slice(0, 32);
}

function record(userId: string) {
  return getFirestoreDb()
    ?.collection('bogle_users')
    .doc(userId)
    .collection('greeting_state')
    .doc('last_topic');
}

/** True when an earlier hello already raised this topic. False when off, unknown or unreadable. */
export async function topicAlreadyRaised(
  userId: string | undefined,
  topic: string | undefined,
  env: Env = process.env
): Promise<boolean> {
  if (!userId || !topic || !lastTopicOnceOn(env)) return false;
  try {
    const snap = await record(userId)?.get();
    const key = (snap?.data() as { key?: unknown } | undefined)?.key;
    return key === topicKey(topic);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Raised topic unreadable: offering it');
    return false;
  }
}

/** Records that this call's hello raised the topic, for every later call on any instance. */
export async function markTopicRaised(
  userId: string,
  topic: string,
  now: number = Date.now(),
  env: Env = process.env
): Promise<void> {
  if (!lastTopicOnceOn(env)) return;
  try {
    await record(userId)?.set({
      key: topicKey(topic),
      raisedAt: now,
      expireAt: new Date(now + KEEP_MS),
    });
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Raised topic not recorded');
  }
}
