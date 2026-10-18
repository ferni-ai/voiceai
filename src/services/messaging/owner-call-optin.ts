/**
 * The owner undoes a do-not-call on their own number: "you can call me again".
 *
 * Only the account's own verified number (sponsor-confirmed, verified in
 * Settings, or Firebase Auth's), never a number from the request, so nobody
 * can lift someone else's do-not-call. It writes a call opt-in to
 * consent/{phoneHash} (source owner-undo) and removes the number's
 * call_opt_outs entry, which call paths read today. Texts are untouched: a
 * text STOP is undone only by START from that phone.
 *
 * Used by POST /api/outreach/consent/calls/undo (outreach.routes.ts) and
 * `ferni users undo-dnc <userId>` (scripts/undo-own-dnc.ts: a dry run unless
 * --execute and the typed project id; recorded as admin-undo).
 *
 * @module services/messaging/owner-call-optin
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { last4, phoneHash, toE164 } from '../outreach/checkin-replies.js';
import {
  defaultConsentDeps,
  messagingPipelineOn,
  writeOptIn,
  type ConsentDeps,
} from './consent.js';

const log = createLogger({ module: 'owner-call-optin' });

export type OwnerCallOptInOutcome =
  | { ok: true; phoneLast4: string; dryRun?: true }
  | {
      ok: false;
      reason: 'pipeline-off' | 'sponsored' | 'no-verified-phone' | 'no-hash-secret' | 'not-saved';
    };

export interface UndoOptions {
  /** owner-undo when the owner asked in the app; admin-undo when an operator ran the CLI. */
  source?: 'owner-undo' | 'admin-undo';
  /** Report what would change, write nothing. */
  dryRun?: boolean;
}

export interface OwnerCallOptInDeps {
  /** The owner's own verified number, or undefined. */
  verifiedPhone: (userId: string) => Promise<string | undefined>;
  consent: ConsentDeps;
  removeCallOptOut: (e164: string) => Promise<void>;
}

async function ownVerifiedPhone(userId: string): Promise<string | undefined> {
  const { defaultTextDeps, resolveCheckinPhone } = await import('../outreach/guarded-text.js');
  const deps = defaultTextDeps();
  const doc = userId.startsWith('sponsored_') ? undefined : await deps.store.userDoc(userId);
  return resolveCheckinPhone(userId, doc, deps);
}

export function defaultOwnerCallOptInDeps(): OwnerCallOptInDeps {
  return {
    verifiedPhone: ownVerifiedPhone,
    consent: defaultConsentDeps(),
    async removeCallOptOut(e164) {
      const db = getFirestoreDb();
      if (!db) throw new Error('Firestore unavailable');
      await db.collection('call_opt_outs').doc(e164).delete();
    },
  };
}

/**
 * Lift the do-not-call on the owner's own verified number. Behind
 * MESSAGING_PIPELINE. Never for a sponsored identity: the number a sponsor
 * typed isn't proven to be the holder's.
 */
export async function undoOwnCallOptOut(
  userId: string,
  deps: OwnerCallOptInDeps = defaultOwnerCallOptInDeps(),
  opts: UndoOptions = {}
): Promise<OwnerCallOptInOutcome> {
  if (!messagingPipelineOn(deps.consent.env)) return { ok: false, reason: 'pipeline-off' };
  if (userId.startsWith('sponsored_')) return { ok: false, reason: 'sponsored' };
  const raw = await deps.verifiedPhone(userId);
  const e164 = raw ? toE164(raw) : null;
  if (!e164) return { ok: false, reason: 'no-verified-phone' };
  const hash = phoneHash(e164, deps.consent.env);
  if (!hash) return { ok: false, reason: 'no-hash-secret' };
  const phoneLast4 = last4(e164);
  if (opts.dryRun) return { ok: true, phoneLast4, dryRun: true };
  try {
    await writeOptIn(hash, 'call', opts.source ?? 'owner-undo', deps.consent);
    await deps.removeCallOptOut(e164);
  } catch (error) {
    log.error({ error: String(error), phoneLast4 }, 'Do-not-call not lifted');
    return { ok: false, reason: 'not-saved' };
  }
  log.info({ userId, phoneLast4, source: opts.source ?? 'owner-undo' }, 'Do-not-call lifted');
  return { ok: true, phoneLast4 };
}
