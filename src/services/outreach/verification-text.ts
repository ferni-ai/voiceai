/**
 * Texts a phone-verification code to the number being verified. That number
 * is not verified yet (that's the point), so the guarded sender's
 * verified-phone rule can't apply; the code goes straight to it over the same
 * transport, and only after two checks: the number never sent STOP (the
 * global opt-out every inbound STOP writes, checkin-replies.ts), and the user
 * and the number are each under the limit (1 a minute, 5 an hour). The code
 * and the full number are never logged: last four digits only.
 *
 * @module services/outreach/verification-text
 */
import { createLogger } from '../../utils/safe-logger.js';
import {
  checkinDb,
  firestoreReplyStore,
  last4,
  phoneHash,
  toE164,
  type Env,
} from './checkin-replies.js';
import type { SMSDeliveryResult, SMSMessage } from './delivery/sms-delivery.js';
import { defaultTextDeps, redactNumbers } from './guarded-text.js';

const log = createLogger({ module: 'verification-text' });
const SENDS = 'verify_code_sends';
export const CODE_GAP_MS = 60 * 1000;
export const CODES_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;

export const codeText = (code: string): string =>
  `Your Ferni code is ${code}. It expires in 10 minutes.`;

export type CodeRefusal = 'invalid-number' | 'unavailable' | 'opted-out' | 'too-soon' | 'too-many';
export type CodeOutcome = { sent: true } | { sent: false; reason: CodeRefusal | 'send-failed' };

export interface CodeTextDeps {
  env: Env;
  isOptedOut: (phoneHash: string) => Promise<boolean>;
  /** ISO times of recent code sends for a key (`user:<uid>` or `phone:<hash>`). */
  recentSends: (key: string) => Promise<string[]>;
  saveSends: (key: string, sentAt: string[]) => Promise<void>;
  send: (message: SMSMessage) => Promise<SMSDeliveryResult>;
  now: () => Date;
}

export const defaultCodeTextDeps = (): CodeTextDeps => ({
  env: process.env,
  isOptedOut: (hash) => firestoreReplyStore.isOptedOut(hash),
  recentSends: async (key) => {
    const doc = await checkinDb().collection(SENDS).doc(key).get();
    const at: unknown = doc.exists ? doc.data()?.sentAt : undefined;
    return Array.isArray(at) ? at.filter((t): t is string => typeof t === 'string') : [];
  },
  saveSends: async (key, sentAt) => {
    await checkinDb().collection(SENDS).doc(key).set({ sentAt });
  },
  send: defaultTextDeps().send, // the guarded sender's transport (Twilio via sms-delivery)
  now: () => new Date(),
});

/**
 * Texts the code `makeCode` stores for this number, if allowed. `makeCode`
 * runs only after the checks pass, so a refused request leaves no code behind.
 * Sent only when the provider accepted it.
 */
export async function textVerificationCode(
  userId: string,
  rawPhone: string,
  makeCode: (e164: string) => Promise<string>,
  deps: CodeTextDeps = defaultCodeTextDeps()
): Promise<CodeOutcome> {
  const refuse = (reason: CodeRefusal | 'send-failed'): CodeOutcome => {
    log.info({ reason, phoneLast4: last4(rawPhone) }, 'Verification code not sent');
    return { sent: false, reason };
  };
  const phone = toE164(rawPhone);
  if (!phone) return refuse('invalid-number');
  // No hash secret: STOP and the per-number limit can't be checked, so nothing goes.
  const hash = phoneHash(phone, deps.env);
  if (!hash) return refuse('unavailable');
  if (await deps.isOptedOut(hash)) return refuse('opted-out');

  const now = deps.now().getTime();
  const keys = [`user:${userId}`, `phone:${hash}`];
  const recent = await Promise.all(
    keys.map(async (k) => (await deps.recentSends(k)).filter((t) => now - Date.parse(t) < HOUR_MS))
  );
  if (recent.some((r) => r.some((t) => now - Date.parse(t) < CODE_GAP_MS)))
    return refuse('too-soon');
  if (recent.some((r) => r.length >= CODES_PER_HOUR)) return refuse('too-many');
  const at = new Date(now).toISOString();
  // Every attempt counts, sent or not, so failures can't be used to send without limit.
  await Promise.all(keys.map((k, i) => deps.saveSends(k, [...recent[i], at])));

  const code = await makeCode(phone);
  const result = await deps.send({
    to: phone,
    body: codeText(code),
    personaId: 'ferni',
    userId,
    outreachId: `verify_${at}`,
  });
  if (!result.success) {
    log.warn({ phoneLast4: last4(phone), error: redactNumbers(result.error) }, 'Code send failed');
    return refuse('send-failed');
  }
  log.info({ phoneLast4: last4(phone) }, 'Verification code sent');
  return { sent: true };
}
