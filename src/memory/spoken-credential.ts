/**
 * SPOKEN_CREDENTIAL_FILTER (off by default): a fact that holds a credential the caller
 * said aloud is never stored (#2367).
 *
 * A caller says "the door code is 4821" or "wifi password is sunshine42" to get help,
 * and the extractor kept it as a fact like any other: recalled on later calls and, since
 * #2359, exported with its key ("door_code = 4821"). With the flag on, every writer of
 * dynamic_facts (deep extraction, the after-call sweep, the caller's own corrections)
 * drops a fact when BOTH hold:
 * - its key or value names a credential: a door, gate, garage or alarm code; a wifi,
 *   account, email or bank password or passcode; a PIN (card, phone); a security answer;
 *   a one-time code; a lock combination;
 * - and its value, less those words, could be the secret itself: a short run of digits
 *   ("4821", "12-34-56", "four eight two one") for a code, PIN or combination, or a few
 *   words that don't describe the secret ("sunshine42", not "on a sticky note") for a
 *   password or answer.
 * Both are required, so an age, a house number, a zip or area code, a phone number, a
 * flight or room number and a score are kept, and so is "door code: changed last week".
 * Words are matched whole, never as substrings.
 *
 * A drop is logged as a count per category, never the key or the value.
 *
 * @module memory/spoken-credential
 */

import { flagOn, type Env } from '../config/env-flag.js';
import { createLogger, type FallbackLogger } from '../utils/safe-logger.js';

export type CredentialCategory =
  'access-code' | 'password' | 'pin' | 'security-answer' | 'one-time-code' | 'combination';

export function spokenCredentialFilterOn(env: Env = process.env): boolean {
  return flagOn('SPOKEN_CREDENTIAL_FILTER', env);
}

/** Lower-case words, with "wi-fi" as one word and apostrophes dropped ("it's" is "its"). */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\bwi[\s_-]?fi\b/g, 'wifi')
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const ACCESS =
  '(?:door|gate|garage|alarm|keypad|lockbox|entry|apartment|buzzer|house|security system)';
/** Most specific first: "one time password" is a one-time code, "garage pin" an access code. */
const CONTEXT: ReadonlyArray<readonly [CredentialCategory, RegExp]> = [
  [
    'one-time-code',
    /\b(?:one time (?:code|passcode|password|pin)|otp|2fa|mfa|two factor(?: code)?|verification code|authentication code|auth code|login code|sign in code)\b/,
  ],
  [
    'combination',
    /\b(?:(?:lock|locker|safe|padlock) (?:combination|combo|code)|combination lock|combo lock)\b/,
  ],
  ['access-code', new RegExp(`\\b${ACCESS}(?: \\w+){0,2} (?:access code|code|passcode|pin)\\b`)],
  ['pin', /\b(?:pin|pin number|pin code|cvv|cvc|card security code)\b/],
  ['password', /\b(?:password|passwords|passcode|passphrase|pwd|wifi (?:key|pass|code))\b/],
  ['security-answer', /\b(?:security|secret|challenge) (?:question|answer)s?\b/],
];

/** Credential words and fillers, taken out of the value before its shape is read. */
const CREDENTIAL_WORDS = new Set(
  (
    'door gate garage alarm keypad lockbox entry apartment buzzer house front back security system access ' +
    'code codes passcode passcodes password passwords passphrase pwd pin cvv cvc combination combo lock locker ' +
    'safe padlock wifi key pass time otp 2fa mfa factor verification authentication auth login sign ' +
    'question answer secret challenge card phone bank email account atm debit credit'
  ).split(' ')
);
const FILLER = new Set(
  'is its it the my our his her their a an number num equals to was are star pound hash then and'.split(
    ' '
  )
);
const stripped = (w: string): boolean => CREDENTIAL_WORDS.has(w) || FILLER.has(w);

/** A value word like these describes the secret ("on a sticky note", "forgotten"), so it isn't one. */
const DESCRIBES = new Set(
  (
    'on in under at inside behind written stored saved kept forgot forgotten changed change reset same as like ' +
    'with not never no none set doesnt dont cant cannot remember know knows expired locked weak strong new old long ' +
    'short hard easy unknown private shared needs need help trouble problem issue uses use somewhere'
  ).split(' ')
);

const DIGIT_WORDS = new Set('zero oh one two three four five six seven eight nine'.split(' '));

/** Digits only ("4821", "12 34 56", "a1b2", "four eight two one"), 3 to 12 of them. */
function looksLikeCode(rest: readonly string[]): boolean {
  if (rest.length === 0 || rest.length > 8) return false;
  let digits = 0;
  for (const w of rest) {
    if (DIGIT_WORDS.has(w)) digits += 1;
    else if (/^[a-z]*\d[a-z\d]*$/.test(w)) digits += w.replace(/\D/g, '').length;
    else return false;
  }
  return digits >= 3 && digits <= 12;
}

/** One to `max` words, none of which describes the secret instead of being it. */
function looksLikeSecretWords(rest: readonly string[], max: number): boolean {
  return rest.length > 0 && rest.length <= max && !rest.some((w) => DESCRIBES.has(w));
}

/**
 * The credential this fact holds, or null when it holds none. Needs both a credential
 * word in the key or value and a value that could be the secret.
 */
export function credentialCategory(key: string, value: string): CredentialCategory | null {
  const keyPhrase = words(key).join(' ');
  const valueWords = words(value);
  const match = CONTEXT.find(([, re]) => re.test(`${keyPhrase} ${valueWords.join(' ')}`));
  if (!match) return null;
  const category = match[0];
  // A credential named only in the value must lead it ("password is x", not "resets passwords")
  if (!CONTEXT.some(([, re]) => re.test(keyPhrase))) {
    const last = valueWords.reduce((at, w, i) => (CREDENTIAL_WORDS.has(w) ? i : at), -1);
    if (valueWords.slice(0, last).some((w) => !stripped(w))) return null;
  }
  const rest = valueWords.filter((w) => !stripped(w));
  const secret =
    category === 'password'
      ? looksLikeSecretWords(rest, 4)
      : category === 'security-answer'
        ? looksLikeSecretWords(rest, 5)
        : looksLikeCode(rest);
  return secret ? category : null;
}

export interface CredentialDrops<T> {
  kept: T[];
  /** How many were dropped, per category; empty when none was. */
  dropped: Partial<Record<CredentialCategory, number>>;
}

/** The facts that hold no credential, and a count of the rest. Callers check the flag. */
export function dropSpokenCredentials<T extends { key: string; value: string }>(
  facts: readonly T[]
): CredentialDrops<T> {
  const kept: T[] = [];
  const dropped: Partial<Record<CredentialCategory, number>> = {};
  for (const f of facts) {
    const category = credentialCategory(f.key, f.value);
    if (category) dropped[category] = (dropped[category] ?? 0) + 1;
    else kept.push(f);
  }
  return { kept, dropped };
}

/**
 * Flag off: `facts` itself, untouched. On: the facts that hold no credential, with the
 * drops logged as `writer` (null when another call logs the same facts).
 */
export function withoutSpokenCredentials<T extends { key: string; value: string }>(
  facts: T[],
  writer: string | null
): T[] {
  if (!spokenCredentialFilterOn()) return facts;
  const { kept, dropped } = dropSpokenCredentials(facts);
  if (writer) logCredentialDrops(writer, dropped);
  return kept;
}

let log: FallbackLogger | null = null;

/** Count and category only: never the key, the value or who said it. */
export function logCredentialDrops(
  writer: string,
  dropped: Partial<Record<CredentialCategory, number>>
): void {
  const count = Object.values(dropped).reduce((n, c) => n + (c ?? 0), 0);
  if (count === 0) return;
  log ??= createLogger({ module: 'spoken-credential' });
  log.info({ writer, count, categories: dropped }, 'Did not store a spoken credential');
}
