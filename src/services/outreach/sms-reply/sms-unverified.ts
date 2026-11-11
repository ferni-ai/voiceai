/**
 * SMS_REPLY_UNVERIFIED: a text from a number that isn't a member's verified phone gets one
 * fixed reply (Seth's words), at most once per number per 24 hours. Nothing about the sender
 * is read beyond the consent record, and no memory is read or written.
 *
 * @module services/outreach/sms-reply/sms-unverified
 */
import { flagModeOf, flagOn } from '../../../config/env-flag.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { phoneHash } from '../checkin-replies.js';
import type { TextStore } from '../guarded-text.js';
import { firestoreTextStore } from '../guarded-text-store.js';
import { smsConsentRefusal, type TextConsentReaders } from '../text-consent.js';

const log = createLogger({ module: 'SmsUnverified' });

/** Seth, 2026-11-11, word for word. */
export const SMS_UNVERIFIED_REPLY =
  'Hi, this is Ferni, an AI friend. I can only text with people who have set up Ferni with this number. Reply STOP to opt out.';
const ONCE_EVERY_MS = 24 * 3_600_000;

export interface UnverifiedDeps {
  consent: TextConsentReaders;
  /** One lock per number hash, stamped when the reply last went. */
  locks: Pick<TextStore, 'lock' | 'lockedAt' | 'unlock'>;
  now: () => Date;
  env: NodeJS.ProcessEnv;
}

const defaults = (): UnverifiedDeps => ({
  consent: firestoreTextStore,
  locks: firestoreTextStore,
  now: () => new Date(),
  env: process.env,
});

/** Takes this number's 24-hour slot; false when the reply went less than 24 hours ago. */
async function takeSlot(hash: string, now: Date, locks: UnverifiedDeps['locks']): Promise<boolean> {
  const id = `sms-unverified-${hash}`;
  if (await locks.lock(id, now.toISOString())) return true;
  const last = Date.parse((await locks.lockedAt(id)) ?? '');
  if (now.getTime() - last < ONCE_EVERY_MS) return false;
  await locks.unlock(id);
  return locks.lock(id, now.toISOString());
}

/**
 * The reply for a text from an unverified number, or null for none. The route calls it only
 * for a text no crisis read, check-in, contact YES or holder code answered. A read that throws
 * rejects, and the route's catch sends nothing.
 */
export async function smsUnverifiedReply(
  from: string,
  deps: UnverifiedDeps = defaults()
): Promise<string | null> {
  if (!flagOn('SMS_REPLY_UNVERIFIED') || flagModeOf('SMS_CRISIS_SCREEN') !== 'on') return null;
  const hash = phoneHash(from, deps.env);
  const now = deps.now();
  const refusal = hash ? await smsConsentRefusal(hash, deps.consent, false, now) : 'no-hash';
  const sent = !refusal && hash !== null && (await takeSlot(hash, now, deps.locks));
  const outcome = refusal ?? (sent ? 'sent' : 'within-24h');
  log.info({ event: 'SMS_REPLY_UNVERIFIED', outcome }, 'SMS unverified reply');
  return sent ? SMS_UNVERIFIED_REPLY : null;
}
