/**
 * The claims behind call-result-once.ts: which channels have told the owner about
 * a call, kept on the call's own doc, bogle_users/{uid}/on_behalf_calls/{callId}
 * as told.{channel} = level, set in a transaction before the send so it holds
 * across processes. With Firestore off or failing, they are held in this process.
 *
 * @module services/outreach/call-result-claims
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { getFirestoreDb } from '../superhuman/firestore-utils.js';

const log = createLogger({ module: 'call-result-claims' });

export type ToldChannel = 'voice' | 'crisis' | 'push' | 'text' | 'email' | 'calendar' | 'record';

/** Used when Firestore is off or fails: holds within this process, for a day, at most 2000 calls. */
const claimedHere = new Map<string, { at: number; told: Partial<Record<ToldChannel, number>> }>();
const HELD_FOR_MS = 24 * 60 * 60 * 1000;
const MAX_HELD = 2000;

function heldHere(key: string): Partial<Record<ToldChannel, number>> {
  const held = claimedHere.get(key);
  return held && Date.now() - held.at < HELD_FOR_MS ? held.told : {};
}

function holdHere(key: string, channel: ToldChannel, level: number): void {
  const told = { ...heldHere(key), [channel]: level };
  claimedHere.delete(key); // re-insert, so the oldest call is first out
  claimedHere.set(key, { at: Date.now(), told });
  for (const oldest of claimedHere.keys()) {
    if (claimedHere.size <= MAX_HELD) break;
    claimedHere.delete(oldest);
  }
}

/** The level before, when this claim beats it (-1: none); null when it doesn't. */
function claimHere(key: string, channel: ToldChannel, level: number): number | null {
  const before = heldHere(key)[channel] ?? -1;
  if (before >= level) return null;
  holdHere(key, channel, level);
  return before;
}

type Db = NonNullable<ReturnType<typeof getFirestoreDb>>;
interface CallDoc {
  db: Db;
  ref: ReturnType<ReturnType<Db['collection']>['doc']>;
}

async function callDoc(userId: string, callId: string): Promise<CallDoc | null> {
  const { getFirestoreDb: dbNow } = await import('../superhuman/firestore-utils.js');
  const db = dbNow();
  const ref = db?.collection('bogle_users').doc(userId).collection('on_behalf_calls').doc(callId);
  return db && ref ? { db, ref } : null;
}

function levelIn(data: unknown, channel: ToldChannel): number {
  const told: unknown = typeof data === 'object' && data ? (data as { told?: unknown }).told : undefined; // prettier-ignore
  const level = typeof told === 'object' && told ? (told as Record<string, unknown>)[channel] : undefined; // prettier-ignore
  return typeof level === 'number' ? level : -1;
}

/**
 * Claim `channel` for this capture: it wins when nobody has told, or only with
 * less to say. Returns the level before (to give it back), or null when it lost.
 */
export async function claimTold(
  userId: string,
  callId: string,
  channel: ToldChannel,
  level: number
): Promise<number | null> {
  const key = `${userId}/${callId}`;
  try {
    const doc = await callDoc(userId, callId);
    if (!doc) return claimHere(key, channel, level);
    const before = await doc.db.runTransaction(async (tx) => {
      const was = levelIn((await tx.get(doc.ref)).data(), channel);
      if (was >= level) return null;
      tx.set(doc.ref, { told: { [channel]: level } }, { merge: true });
      return was;
    });
    if (before !== null) holdHere(key, channel, level);
    return before;
  } catch (error) {
    log.warn({ callId, channel, error: String(error) }, 'Told claim not stored; held in process');
    return claimHere(key, channel, level);
  }
}

/** Give a claim back after a send that failed or was held, unless a later one took it. */
export async function releaseTold(
  userId: string,
  callId: string,
  channel: ToldChannel,
  level: number,
  before: number
): Promise<void> {
  const key = `${userId}/${callId}`;
  if ((heldHere(key)[channel] ?? -1) === level) holdHere(key, channel, before);
  try {
    const doc = await callDoc(userId, callId);
    await doc?.db.runTransaction(async (tx) => {
      if (levelIn((await tx.get(doc.ref)).data(), channel) !== level) return;
      tx.set(doc.ref, { told: { [channel]: before } }, { merge: true });
    });
  } catch (error) {
    log.warn({ callId, channel, error: String(error) }, 'Told claim not given back');
  }
}

/** For tests: forget the in-process claims. */
export function resetToldClaimsForTests(): void {
  claimedHere.clear();
}
