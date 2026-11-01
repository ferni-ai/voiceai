/**
 * What stored call text may not carry into a message to the account owner
 * (OWNER_OUTREACH_STORED_TEXT_SCREEN, owner-message-policy.ts). The jobs can't tell
 * the owner's own rows from a caller's, and the owner's rows carry numbers, prices,
 * links and phone numbers all the time ("Call Dr. Lee at 555-0123", "Pay rent $1200",
 * "Order from amazon.com"). So nothing is refused for its characters, only for an
 * instruction a scam needs:
 * - code_handover: a code word (code, passcode, password, PIN, one-time, OTP,
 *   verification) with a hand-over verb (send, text, tell, give, read, share, reply,
 *   forward);
 * - money_destination: a money word (wire, pay, transfer, refund, deposit, gift card,
 *   Venmo, Zelle, PayPal, Cash App, bitcoin, crypto) with somewhere to send it: a
 *   number of 7 or more digits (not a date), a link (a scheme, www, a domain, a spoken
 *   "dot com" or "slash") or an email address.
 * Every rule reads the folded form (foldToAscii). Anything that is not a string, is
 * over STORED_TEXT_MAX_CHARS, or can't be read is refused (fail closed).
 *
 * @module tools/domains/proactive/outreach/owner-stored-text
 */

import { foldToAscii } from './owner-message-content.js';

/** Why stored text was kept out; logged as the reason code, never with the text. */
export type StoredTextBlock =
  'code_handover' | 'money_destination' | 'not_text' | 'too_long' | 'screen_error';

/** Longer than any line these jobs send; past it, refuse rather than scan. */
export const STORED_TEXT_MAX_CHARS = 10_000;

const CODE_WORD = /\b(?:pass)?codes?\b|\bpasswords?\b|\bpins?\b|\bone[\s-]?time\b|\botps?\b|\bverification\b/i; // prettier-ignore
const HAND_OVER = /\b(?:send|text|tell|give|read|share|reply|forward)(?:s|ed|ing)?\b|\bsent\b|\btold\b|\bgave\b/i; // prettier-ignore
const MONEY_WORD =
  /\b(?:wir(?:e|es|ed|ing)|pay(?:s|ing|ment|ments)?|paid|transfer\w*|refund\w*|deposit\w*|gift\s?cards?|venmo|zelle|paypal|cash\s?app|bitcoin|crypto)\b/i;
const LINK =
  /\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|net|org|io|co|app|me|ly|info|biz|us|xyz|link|site|online)\b|\bdot\s+(?:com|net|org|io|co)\b|\bslash\b/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
/** Digits joined only by spaces, dots, dashes or brackets: one number to whoever reads it. */
const NUMBER_RUN = /\+?\d[\d\s().-]*\d/g;
const PHONE_DIGITS = 7;

/** A date the jobs write themselves ("on 2026-10-19"): never a number to send money to. */
const ISO_DATE = /\b(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?:T[\d:.]+Z?)?\b/g;

const hasPhoneNumber = (text: string): boolean =>
  (text.replace(ISO_DATE, ' ').match(NUMBER_RUN) ?? []).some(
    (run) => run.replace(/\D/g, '').length >= PHONE_DIGITS
  );

function blockIn(text: string): StoredTextBlock | null {
  const form = foldToAscii(text);
  if (CODE_WORD.test(form) && HAND_OVER.test(form)) return 'code_handover';
  const destination = hasPhoneNumber(form) || LINK.test(form) || EMAIL.test(form);
  if (destination && MONEY_WORD.test(form)) return 'money_destination';
  return null;
}

/** Why `text` may not go into a message to the owner, or null when it may. */
export function storedTextBlock(text: unknown): StoredTextBlock | null {
  if (typeof text !== 'string') return 'not_text';
  if (text.length > STORED_TEXT_MAX_CHARS) return 'too_long';
  try {
    return blockIn(text);
  } catch {
    return 'screen_error';
  }
}
