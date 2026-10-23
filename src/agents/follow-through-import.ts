/**
 * The after-call task that brings a call's reminders, commitments and
 * threads (and, with BOOKENDS on, timed one-time dates) into follow-ups
 * (services/follow-through/import-follow-ups.ts),
 * for the verified owner of the account only. FOLLOW_THROUGH_IMPORT=on (the
 * agent's, or the caller's through a cohort) turns it on; off, it returns
 * before any store read.
 * agents/voice-agent-entry/follow-through-import-register.ts registers it and
 * hands in the owner check, which lives a layer up.
 *
 * Whose call: the importer reads the account's own stores, so it runs only
 * when the person on the line is that account's proven owner (a signed-in
 * app call, or a phone caller recognised by a signed attestation). An
 * anonymous or on-behalf id, an unrecognised phone caller, a call Ferni
 * placed to someone else and a voice-eval user are skipped.
 *
 * Why it may miss a call and that's fine: it reads the stores, not the call,
 * and follow-up ids come from their sources. A call whose cleanup is cut
 * short (the 10 s race, a killed pod) leaves its reminders and commitments in
 * Firestore, and the next call's run imports them; nothing is made twice.
 *
 * @module agents/follow-through-import
 */
import { flagOn, type Env } from '../config/env-flag.js';
import {
  importFollowUps,
  type FollowUpSources,
  type FollowUpStore,
  type ImportResult,
} from '../services/follow-through/index.js';
import { envForCaller, type CohortStore } from '../services/platform/cohort-flags.js';
import type { AfterCallContext } from '../services/session/after-call-tasks.js';
import { createFollowUpSources } from '../services/stores/follow-through-sources.js';
import { createFollowUpStore } from '../services/stores/follow-through-store.js';
import { isRealUserId } from '../tools/registry/user-id-guard.js';
import { getFirestoreDb } from '../utils/firestore-utils.js';
import { createLogger } from '../utils/safe-logger.js';
import { isPersonAccountId } from '../utils/synthetic-user.js';

const log = createLogger({ module: 'follow-through-import-task' });

export const FOLLOW_THROUGH_IMPORT_TASK = 'follow-through-import';

export interface ImportTaskDeps {
  env?: Env;
  /** Injected for tests; defaults to Firestore. */
  cohorts?: CohortStore;
  /** Whether this session's caller is the account's proven owner. Without one, nobody is. */
  verifiedOwner?: (sessionId: string) => boolean;
  /** Null where there is no Firestore (local dev without credentials). */
  stores?: () => { store: FollowUpStore; sources: FollowUpSources } | null;
  /** BOOKENDS: true when a date's words are heavy (!isLightTopic). Unset: every one is. */
  heavy?: (text: string) => boolean;
  now?: () => Date;
}

export type ImportTaskOutcome =
  | { imported: true; result: ImportResult }
  | { imported: false; reason: 'flag-off' | 'not-owner' | 'no-zone' | 'no-store' };

function firestoreStores(
  heavy?: (text: string) => boolean
): { store: FollowUpStore; sources: FollowUpSources } | null {
  const db = getFirestoreDb();
  if (!db) return null;
  return { store: createFollowUpStore(db), sources: createFollowUpSources(db, { heavy }) };
}

/** An account id that belongs to one real person, not a placeholder, anonymous or eval id. */
export function isOwnAccountId(userId: string): boolean {
  return isPersonAccountId(userId) && isRealUserId(userId);
}

export async function importFollowUpsAfterCall(
  ctx: Pick<AfterCallContext, 'userId' | 'sessionId' | 'timezone'>,
  deps: ImportTaskDeps = {}
): Promise<ImportTaskOutcome> {
  // As this caller's call had it: process.env may hold the next caller's (cohort-flags.ts).
  const env = await envForCaller(ctx.userId, { env: deps.env, store: deps.cohorts });
  if (!flagOn('FOLLOW_THROUGH_IMPORT', env)) return { imported: false, reason: 'flag-off' };
  const verified = deps.verifiedOwner ?? (() => false);
  if (!isOwnAccountId(ctx.userId) || !verified(ctx.sessionId)) {
    log.info({ sessionId: ctx.sessionId }, 'Follow-up import skipped: not the account owner');
    return { imported: false, reason: 'not-owner' };
  }
  // The zone decides when a follow-up may be texted; a guessed one could text at night.
  // The next call with a known zone imports the same items.
  if (!ctx.timezone) {
    log.info({ sessionId: ctx.sessionId }, 'Follow-up import skipped: caller zone unknown');
    return { imported: false, reason: 'no-zone' };
  }
  const stores = deps.stores ? deps.stores() : firestoreStores(deps.heavy);
  if (!stores) return { imported: false, reason: 'no-store' };
  const now = (deps.now ?? (() => new Date()))();
  // BOOKENDS, as this caller's call had it: timed one-time dates come in with eventAt.
  const bookends = flagOn('BOOKENDS', env);
  const { sources, store } = stores;
  const result = await importFollowUps(ctx.userId, ctx.timezone, sources, store, now, { bookends });
  return { imported: true, result };
}
