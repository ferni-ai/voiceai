/**
 * The guarded sender's STOP check (guarded-text.ts): may this phone be texted?
 *
 * An inbound STOP, REVOKE or OPT OUT is recorded in two stores, keyed by the
 * same phoneHash: consent/{phoneHash} (messaging/consent.ts) and the older
 * feature_checkin_optouts. Both are read on every send, and a stop in EITHER
 * refuses: an "opted-in" in one never outweighs an opt-out in the other. Until
 * 2026-10-21 only the old store was read here, so a "revoke" or "opt out"
 * (written to consent/ only) did not stop check-ins, reminders, the brief or
 * texts to third parties. Honouring a revocation is the law (TCPA), so no flag
 * turns this off.
 *
 * Fails closed. If a store can't be read within CONSENT_READ_TIMEOUT_MS, the
 * text is not sent, with one exception: a text the owner asked for just now in
 * a call ("text me that", askedNow) to their own verified number may go when
 * the old store was read and has no STOP. They are on the line asking for it,
 * which is fresh consent for that one text, and a STOP already in the old store
 * still refuses it. A proactive text or one to someone else never goes on an
 * unread record.
 *
 * @module services/outreach/text-consent
 */
import { withTimeout } from '../../utils/async.js';
import { createLogger } from '../../utils/safe-logger.js';
import { channelOf, firestoreConsentStore } from '../messaging/consent.js';

const log = createLogger({ module: 'text-consent' });

/** A Firestore point read takes milliseconds; past this, the record counts as unread. */
export const CONSENT_READ_TIMEOUT_MS = 3000;

export interface TextConsentReaders {
  /** feature_checkin_optouts/{hash} exists: a STOP on record in the old store. */
  isOptedOut: (hash: string) => Promise<boolean>;
  /** consent/{hash}, or undefined when there is none. */
  consentDoc: (hash: string) => Promise<Record<string, unknown> | undefined>;
}

/** consent/{hash} from Firestore (guarded-text's store). */
export const readConsentDoc = async (hash: string): Promise<Record<string, unknown> | undefined> =>
  firestoreConsentStore.read(hash);

/** Why a text was refused: an opt-out on record, or a record that couldn't be read. */
export type ConsentRefusal = 'opted-out' | 'consent-unknown';

/**
 * Null when `hash` may be texted, else why not. `askedNow`: the owner asked
 * for this text in the call (see the module comment). Never throws.
 */
export async function smsConsentRefusal(
  hash: string,
  readers: TextConsentReaders,
  askedNow: boolean,
  timeoutMs: number = CONSENT_READ_TIMEOUT_MS
): Promise<ConsentRefusal | null> {
  const [old, current] = await Promise.allSettled([
    withTimeout(readers.isOptedOut(hash), timeoutMs, 'feature_checkin_optouts read'),
    withTimeout(readers.consentDoc(hash), timeoutMs, 'consent read'),
  ]);
  const oldStop = old.status === 'fulfilled' && old.value;
  const stop =
    current.status === 'fulfilled' && channelOf(current.value?.sms).state === 'opted-out';
  if (oldStop || stop) return 'opted-out';
  if (old.status === 'fulfilled' && current.status === 'fulfilled') return null;
  const unread = [old, current].flatMap((r) => (r.status === 'rejected' ? [String(r.reason)] : []));
  const allowed = askedNow && old.status === 'fulfilled';
  log.warn({ error: unread.join('; '), askedNow, sending: allowed }, 'Text opt-out not readable');
  return allowed ? null : 'consent-unknown';
}
