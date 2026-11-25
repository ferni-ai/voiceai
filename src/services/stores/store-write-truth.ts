/**
 * What a life-automation store does when its Firestore save fails (STORE_WRITES_TRUTHFUL).
 *
 * The workflow, subscription, meal and document stores keep an in-memory copy and save the
 * whole domain to Firestore (./firestore-life-adapter.ts). When that save fails they log "data in
 * memory only" and resolve, so the tool on top reports the change as made. Reads go to Firestore
 * first, so the next read returns the old state: a routine the caller deleted keeps running, and a
 * cancelled subscription shows as active again.
 *
 * Off: as on main, the same warning and the change kept in memory. On: the in-memory copy is
 * dropped, so the next read is Firestore's (the state before the change, or none), and the save
 * rejects with UnsavedWriteError, so a tool can say it couldn't. Its message names the domain
 * only. The copy is dropped rather than rolled back because callers change the arrays they read
 * in place, and with no Firestore document those arrays are the in-memory copy's own.
 *
 * @module services/stores/store-write-truth
 */

import { flagOn } from '../../config/env-flag.js';
import type { LifeAutomationDomain } from './firestore-life-adapter.js';

/** A life-automation save that did not reach Firestore. */
class UnsavedWriteError extends Error {
  constructor(readonly domain: LifeAutomationDomain) {
    super(`STORE_WRITES_TRUTHFUL: the ${domain} change was not saved`);
    this.name = 'UnsavedWriteError';
  }
}

interface Logger {
  warn: (fields: object, message: string) => void;
}

interface FailedSave {
  userId: string;
  result: { error?: string };
}

/** Called by a store, with its own logger and in-memory copy, when its Firestore save failed. */
export function notSaved<T>(
  log: Logger,
  memory: Map<string, T>,
  domain: LifeAutomationDomain,
  { userId, result }: FailedSave
): void {
  if (!flagOn('STORE_WRITES_TRUTHFUL')) {
    log.warn({ userId, error: result.error }, 'Failed to save to Firestore, data in memory only');
    return;
  }
  memory.delete(userId); // the next read is Firestore's: what was there before
  log.warn({ userId, domain, reason: 'store_write_failed' }, 'STORE_WRITES_TRUTHFUL');
  throw new UnsavedWriteError(domain);
}

/** What a tool says when a change it made was not saved. */
const UNSAVED = "I couldn't save that change just now, so nothing changed. Want me to try again?";

/** A tool's "couldn't" reply when `error` is a failed save, else undefined. */
export function unsavedReply(error: unknown, reply: string = UNSAVED): string | undefined {
  return error instanceof UnsavedWriteError ? reply : undefined;
}

/**
 * Awaits a store write: undefined when it saved, the "couldn't" reply when it was not saved.
 * Any other error is thrown as before.
 */
export async function orUnsaved(
  write: Promise<unknown>,
  reply?: string
): Promise<string | undefined> {
  try {
    await write;
    return undefined;
  } catch (error) {
    const couldnt = unsavedReply(error, reply);
    if (couldnt === undefined) throw error;
    return couldnt;
  }
}
