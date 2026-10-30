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

type ToldLevels = Partial<Record<ToldChannel, number>>;
/** A won claim: the levels before (to give back) and the levels it set. */
export interface Claimed {
  before: ToldLevels;
  set: ToldLevels;
}

/** Held in this process too (and alone when Firestore is off or fails): a day, at most 2000 calls. */
const claimedHere = new Map<string, { at: number; told: ToldLevels }>();
const HELD_FOR_MS = 24 * 60 * 60 * 1000;
const MAX_HELD = 2000;

function heldHere(key: string): ToldLevels {
  const held = claimedHere.get(key);
  return held && Date.now() - held.at < HELD_FOR_MS ? held.told : {};
}

function holdHere(key: string, levels: ToldLevels): void {
  const told = { ...heldHere(key), ...levels };
  claimedHere.delete(key); // re-insert, so the oldest call is first out
  claimedHere.set(key, { at: Date.now(), told });
  for (const oldest of claimedHere.keys()) {
    if (claimedHere.size <= MAX_HELD) break;
    claimedHere.delete(oldest);
  }
}

/** `channel` wins over a lower level; the `also` channels are raised with it, in one write. */
function plan(
  told: (channel: ToldChannel) => number,
  channel: ToldChannel,
  level: number,
  also: ToldChannel[]
): Claimed | null {
  if (told(channel) >= level) return null;
  const before: ToldLevels = {};
  const set: ToldLevels = {};
  for (const ch of [channel, ...also]) {
    before[ch] = told(ch);
    set[ch] = Math.max(told(ch), level);
  }
  return { before, set };
}

function claimHere(
  key: string,
  channel: ToldChannel,
  level: number,
  also: ToldChannel[]
): Claimed | null {
  // prettier-ignore
  const claimed = plan((ch) => heldHere(key)[ch] ?? -1, channel, level, also);
  if (claimed) holdHere(key, claimed.set);
  return claimed;
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
 * Claim `channel` for this capture, before the send: it wins when nobody has
 * told, or only with less to say. The `also` channels are raised to the same
 * level in the same transaction (a crisis push is this call's push too). Null
 * when it lost. A claim this process already holds counts even when Firestore
 * doesn't have it (it was down then); with Firestore failing now, the process
 * alone decides, so a crisis line is sent rather than dropped.
 */
export async function claimTold(
  userId: string,
  callId: string,
  channel: ToldChannel,
  level: number,
  also: ToldChannel[] = []
): Promise<Claimed | null> {
  const key = `${userId}/${callId}`;
  if ((heldHere(key)[channel] ?? -1) >= level) return null;
  try {
    const doc = await callDoc(userId, callId);
    if (!doc) return claimHere(key, channel, level, also);
    const claimed = await doc.db.runTransaction(async (tx) => {
      const data: unknown = (await tx.get(doc.ref)).data();
      const won = plan((ch) => levelIn(data, ch), channel, level, also);
      if (won) tx.set(doc.ref, { told: won.set }, { merge: true });
      return won;
    });
    if (claimed) holdHere(key, claimed.set);
    return claimed;
  } catch (error) {
    log.warn({ callId, channel, error: String(error) }, 'Told claim not stored; held in process');
    return claimHere(key, channel, level, also);
  }
}

/** The channels a claim changed, back to their levels before, unless a later claim took them. */
function giveBack(told: (channel: ToldChannel) => number, claimed: Claimed): ToldLevels {
  const back: ToldLevels = {};
  for (const [ch, level] of Object.entries(claimed.set) as Array<[ToldChannel, number]>) {
    const before = claimed.before[ch] ?? -1;
    if (level !== before && told(ch) === level) back[ch] = before;
  }
  return back;
}

/** Give a claim back after a send that failed or was held. */
export async function releaseTold(userId: string, callId: string, claimed: Claimed): Promise<void> {
  const key = `${userId}/${callId}`;
  holdHere(
    key,
    giveBack((ch) => heldHere(key)[ch] ?? -1, claimed)
  );
  try {
    const doc = await callDoc(userId, callId);
    await doc?.db.runTransaction(async (tx) => {
      const data: unknown = (await tx.get(doc.ref)).data();
      const back = giveBack((ch) => levelIn(data, ch), claimed);
      if (Object.keys(back).length > 0) tx.set(doc.ref, { told: back }, { merge: true });
    });
  } catch (error) {
    log.warn({ callId, error: String(error) }, 'Told claim not given back');
  }
}

/** For tests: forget the in-process claims. */
export function resetToldClaimsForTests(): void {
  claimedHere.clear();
}
