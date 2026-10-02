/**
 * Identity resolution for voice sessions.
 *
 * - Verified identities (Firebase uid from the token server, server-side
 *   dispatch user ids) follow merge redirects to the account that owns their
 *   memory, and resume an interrupted merge in the background.
 * - A persistent device id presented together with a verified account is
 *   folded into that account (first account to present it wins).
 * - Callers with no stable identity get an explicit ephemeral id and no
 *   durable memory.
 *
 * @module services/identity/identity-resolution
 */

import { ephemeralUserIdFor } from '../../utils/ephemeral-identity.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { LINKED_IDENTITIES, mergeIdentityInto, type MergeReason } from './identity-merge.js';
import { recordIdentityEvent } from './identity-metrics.js';
import {
  readRedirectMarker,
  resolveIdentityRedirect,
  USERS_COLLECTION,
  type RedirectResolution,
} from './identity-redirect.js';

const log = createLogger({ module: 'identity-resolution' });

/** How long session start waits for a device merge before carrying on. */
const DEVICE_MERGE_WAIT_MS = 2500;

/** Merges already kicked off by this process (avoid piling up duplicates). */
const inFlight = new Map<string, Promise<unknown>>();

function runMergeOnce(sourceId: string, targetId: string, reason: MergeReason): Promise<unknown> {
  const key = `${sourceId}->${targetId}`;
  const running = inFlight.get(key);
  if (running) return running;
  const db = getFirestoreDb();
  if (!db) return Promise.resolve();
  const task = mergeIdentityInto(db, { sourceId, targetId, reason })
    .catch((error: unknown) => log.error({ error: String(error) }, 'Background merge crashed'))
    .finally(() => inFlight.delete(key));
  inFlight.set(key, task);
  return task;
}

/**
 * Resolve a verified identity through merge redirects. Resumes an unfinished
 * merge in the background so stragglers written by older sessions move too.
 */
export async function resolveVerifiedIdentity(userId: string): Promise<RedirectResolution> {
  const resolution = await resolveIdentityRedirect(getFirestoreDb(), userId);
  if (resolution.redirectedFrom && !resolution.mergeComplete) {
    void runMergeOnce(resolution.redirectedFrom, resolution.userId, 'anonymous_upgrade');
  }
  void sweepLinkedIdentities(resolution.userId);
  return resolution;
}

/** Collections probed for leftovers written after a merge finished. */
const LEFTOVER_PROBES = ['conversations', 'dynamic_facts', 'summaries', 'dynamic_entities'];
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const lastSweep = new Map<string, number>();

/**
 * A session that was already running under the anonymous identity when the
 * merge finished can still write there when it ends. At most hourly per
 * account, look for such leftovers under linked identities and move them.
 */
export async function sweepLinkedIdentities(accountUid: string, now = Date.now()): Promise<number> {
  const db = getFirestoreDb();
  if (!db) return 0;
  if (now - (lastSweep.get(accountUid) ?? 0) < SWEEP_INTERVAL_MS) return 0;
  lastSweep.set(accountUid, now);
  let resumed = 0;
  try {
    const users = db.collection(USERS_COLLECTION);
    const links = await users.doc(accountUid).collection(LINKED_IDENTITIES).limit(10).get();
    for (const link of links.docs) {
      const source = users.doc(link.id);
      const probes = await Promise.all(
        LEFTOVER_PROBES.map((c) => source.collection(c).limit(1).get())
      );
      if (probes.every((p) => p.empty)) continue;
      const reason: MergeReason =
        link.data().reason === 'device_claim' ? 'device_claim' : 'anonymous_upgrade';
      await runMergeOnce(link.id, accountUid, reason);
      resumed++;
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Linked identity sweep failed (will retry later)');
  }
  return resumed;
}

/** Test hook: forget sweep throttling. */
export function resetSweepThrottle(): void {
  lastSweep.clear();
}

/**
 * Fold `device:<deviceId>` into a verified account when that device has
 * memory and no other account has claimed it. Waits briefly so the first
 * greeting can already know the user; the merge keeps going afterwards.
 *
 * Trust: a device id is a client-held random id, the same bearer secret the
 * identity guard already accepts for anonymous `device:` API access, presented
 * here together with a verified account token, so this grants nothing the
 * client could not already read.
 */
export async function claimDeviceForAccount(deviceId: string, accountUid: string): Promise<void> {
  const db = getFirestoreDb();
  if (!db || !deviceId || deviceId.includes('/')) return;
  const sourceId = `device:${deviceId}`;
  try {
    const snap = await db.collection(USERS_COLLECTION).doc(sourceId).get();
    if (!snap.exists) return;
    const marker = readRedirectMarker(snap.data());
    if (marker?.mergedInto && marker.mergedInto !== accountUid) return; // claimed by another account
    if (marker?.mergeStatus === 'complete') return;
    const task = runMergeOnce(sourceId, accountUid, 'device_claim');
    const wait = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, DEVICE_MERGE_WAIT_MS);
      timer.unref?.();
    });
    await Promise.race([task, wait]);
  } catch (error) {
    log.warn({ error: String(error) }, 'Device claim check failed (continuing)');
  }
}

/**
 * Explicit ephemeral identity for a session nobody can be tied to.
 * Logged and counted so the rate of memoryless sessions is visible.
 */
export function ephemeralIdentity(
  sessionKey: string | undefined,
  source: string | undefined
): string {
  const key = sessionKey && sessionKey.length > 0 ? sessionKey : `t${Date.now().toString(36)}`;
  recordIdentityEvent('ephemeralSessions');
  log.warn(
    { source: source ?? 'unknown' },
    'No stable identity for this session; memory will not persist after the call'
  );
  return ephemeralUserIdFor(key);
}
