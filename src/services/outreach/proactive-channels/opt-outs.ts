/**
 * Whether a proactive check-in may text or ring the user's verified phone,
 * read from the same opt-out records the guarded senders (guarded-text.ts) and
 * the on-behalf call paths (call-retry.ts) honour:
 *
 * - texts: a STOP to our number (feature_checkin_optouts/{phoneHash}, and
 *   consent/{phoneHash}.sms), or texts turned off in settings or by the old
 *   webhook's global STOP (outreach_profiles.state.allowedChannels);
 * - calls: the do-not-call list (call_opt_outs/{e164}), or a "stop calling me"
 *   in consent/{phoneHash}.call.
 *
 * Honouring STOP and do-not-call is the law (TCPA), not a feature, so no flag
 * turns this off. It fails closed: a phone that can't be hashed (no
 * LOG_HASH_SECRET) or a store that can't be read throws, and the caller sends
 * nothing.
 *
 * @module services/outreach/proactive-channels/opt-outs
 */

import { readConsent, type Consent } from '../../messaging/consent.js';
import { isCallOptedOut } from '../call-retry.js';
import { phoneHash, toE164, type Env } from '../checkin-replies.js';
import { firestoreTextStore, smsTurnedOff } from '../guarded-text.js';
import type { ProactiveChannel } from './types.js';

/** true: this phone must not get that channel. */
export interface PhoneOptOuts {
  sms: boolean;
  call: boolean;
}

/** The stores, so tests can break one. Each throws when it can't be read, except callOptOut, which says true. */
export interface OptOutReaders {
  /** consent/{hash}, with an opt-out in feature_checkin_optouts counted (messaging/consent.ts). */
  consent: (hash: string) => Promise<Consent>;
  /** outreach_profiles/{userId}.state.allowedChannels. */
  legacySmsChannels: (userId: string) => Promise<unknown>;
  /** call_opt_outs/{e164}; true when it can't be read. */
  doNotCall: (e164: string) => Promise<boolean>;
}

const firestoreReaders: OptOutReaders = {
  consent: async (hash) => readConsent(hash),
  legacySmsChannels: async (userId) => firestoreTextStore.legacySmsChannels(userId),
  doNotCall: isCallOptedOut,
};

/** What this user's verified `phone` opted out of. Throws when that can't be known. */
export async function phoneOptOuts(
  userId: string,
  user: Record<string, unknown>,
  phone: string,
  env: Env = process.env,
  readers: OptOutReaders = firestoreReaders
): Promise<PhoneOptOuts> {
  const e164 = toE164(phone);
  const hash = e164 ? phoneHash(e164, env) : null;
  if (!e164 || !hash) throw new Error('Phone not hashable (LOG_HASH_SECRET), so opt-outs unknown');
  const [consent, legacyChannels, onDoNotCall] = await Promise.all([
    readers.consent(hash),
    readers.legacySmsChannels(userId),
    readers.doNotCall(e164),
  ]);
  return {
    sms: consent.sms.state === 'opted-out' || smsTurnedOff(user, legacyChannels),
    call: consent.call.state === 'opted-out' || onDoNotCall,
  };
}

/** The channels an opt-out ruled out, for the outreach log (codes only, never words). */
export function optedOutChannels(o: PhoneOptOuts): ProactiveChannel[] {
  return [...(o.sms ? ['sms' as const] : []), ...(o.call ? ['voice_call' as const] : [])];
}
