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
 * A credential named in the value and followed, past fillers, by 3+ digits or a word of
 * letters and digits is dropped however many other words the fact has ("User's PIN is
 * 4321", "remember the wifi password is sunshine42"; #2514), as are ID numbers (SSN,
 * account, card or routing number).
 * Words are matched whole, never as substrings.
 *
 * A drop is logged as a count per category, never the key or the value.
 *
 * @module memory/spoken-credential
 */

import { flagOn, type Env } from '../config/env-flag.js';
import { createLogger, type FallbackLogger } from '../utils/safe-logger.js';
import { abaValid, shapedSecrets, ssnValid, type IdentifierCategory } from './identifier-shapes.js';
import { spokenDigits } from './spoken-digits.js';

export {
  luhnValid,
  shapedSecrets,
  type IdentifierCategory,
  type Span,
} from './identifier-shapes.js';

export type CredentialCategory =
  | 'access-code'
  | 'password'
  | 'pin'
  | 'security-answer'
  | 'one-time-code'
  | 'combination'
  | 'id-number'
  | IdentifierCategory;

export function spokenCredentialFilterOn(env: Env = process.env): boolean {
  return flagOn('SPOKEN_CREDENTIAL_FILTER', env);
}

/** Lower-case words in any script, accents dropped ("Código" is "codigo", "Türcode" "turcode"). */
function words(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\bwi[\s_-]?fi\b/g, 'wifi')
    .replace(/['’]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** Whole words of a phrase (words joined by single spaces). */
const term = (src: string): RegExp => new RegExp(`(?:^| )(?:${src})(?= |$)`);

const ACCESS = 'door|gate|garage|alarm|keypad|lockbox|entry|apartment|buzzer|house|security system';
/** Up to two words between "garage" and "code", none of which makes it another kind of code. */
const WINDOW =
  '(?: (?!(?:zip|zip4|area|postal|post|postcode|country|calling|promo|discount|coupon|dress|qr|bar|gift|tax)(?: |$))[^ ]+){0,2}';
/** Most specific first: "one time password" is a one-time code, "garage pin" an access code. */
const CONTEXT: ReadonlyArray<readonly [CredentialCategory, RegExp]> = [
  [
    'one-time-code',
    term(
      'one time (?:code|passcode|password|pin)|otp|2fa|mfa|two factor(?: code)?|verification code|authentication code|auth code|login code|sign in code'
    ),
  ],
  [
    'combination',
    term(
      '(?:lock|locker|safe|padlock) (?:combination|combo|code)|combination lock|combo lock|bike lock|bicycle lock|padlock'
    ),
  ],
  [
    'access-code',
    term(
      `(?:${ACCESS})${WINDOW} (?:access code|code|passcode|pin)|access code|security code|keypad|turcode|torcode|` +
        '(?:codigo|code|codice) (?:de |del |da |della |du )?(?:la |el |le )?(?:puerta|porta|portao|porte|entrada|entree|portail|garaje|alarma|alarme)'
    ),
  ],
  [
    'pin',
    term(
      'pin|pin number|cvv|cvc|card security code|(?:phone|ipad|tablet|laptop|screen) unlock|unlock (?:code|pin)|lock screen(?: code| pin| passcode)?|screen lock'
    ),
  ],
  [
    'password',
    term(
      'password|passwords|passcode|passphrase|pwd|pw|(?:wifi|wlan) (?:key|pass|code)|contrasena|clave|mot de passe|passwort|kennwort|senha'
    ),
  ],
  ['security-answer', term('(?:security|secret|challenge)(?: question)? answers?')],
  [
    'id-number',
    term(
      'ssn|social security(?: number)?|(?:bank |checking |savings )?account number|(?:credit |debit )?card number|routing number'
    ),
  ],
];

/** "password manager", "pin reset", "2fa app": a thing about the secret, never the secret. */
const ABOUT_SECRET = term(
  '(?:password|passwords|passcode|passcodes|passphrase|pin|pins|2fa|mfa|otp) (?:manager|managers|app|apps|policy|policies|reset|resets|hint|hints|reuse|security|strength|consultant|rules|requirements|expiry|expiration|vault|generator|recovery|change|changes|protection)'
);
/** India's postal code is a "PIN code"; a card's or phone's PIN code is still a PIN. */
const POSTAL_PIN = term('pin code|pincode');
const PIN_OWNER = term('card|atm|bank|debit|credit|phone|sim');
/** A key that is only "code": a bare number is a code only when it is long (a one-time code). */
const BARE_CODE = /^(?:the |my )?codes?$/;
/** "netflix login: jen@example.com / hunter2". */
const LOGIN = term('login|logins|log in|sign in|credentials|username');

/** Credential words and fillers, taken out of the value before its shape is read. */
const CREDENTIAL_WORDS = new Set(
  (
    'door gate garage alarm keypad lockbox entry apartment buzzer house front back security system access ' +
    'code codes passcode passcodes password passwords passphrase pwd pw pin cvv cvc combination combo lock locker ' +
    'safe padlock bike bicycle wifi wlan key pass time otp 2fa mfa factor verification authentication auth login sign ' +
    'question answer secret challenge card phone bank email account atm debit credit unlock screen ' +
    'ssn social routing checking savings ' +
    'contrasena clave mot passe passwort kennwort senha codigo turcode torcode puerta porta porte'
  ).split(' ')
);
const FILLER = new Set(
  (
    'is its it the my our his her their a an number num equals to was are star pound hash then and press ' +
    'opener remote right left turn clockwise counterclockwise de la el del da le du est es ist der die das'
  ).split(' ')
);
const stripped = (w: string): boolean => CREDENTIAL_WORDS.has(w) || FILLER.has(w);

/** A value word like these describes the secret, a practice or a schedule, so it isn't one. */
const DESCRIBES = new Set(
  (
    'on in under at inside behind written printed stored saved kept forgot forgotten changed change reset same as like ' +
    'with not never no none set doesnt dont cant cannot remember know knows expired locked weak strong new old long ' +
    'short hard easy unknown private shared needs need help trouble problem issue uses use somewhere instead ' +
    'every daily weekly monthly yearly annually days weeks months years rotates rotate rotated switched switch ' +
    'face touch fingerprint biometric biometrics birthday anniversary name names'
  ).split(' ')
);
/** "changed to x", "set to x": the secret is what follows. */
const SET_TO = new Set(['changed', 'set', 'updated', 'reset']);

const DIGIT_WORDS = new Set('zero oh one two three four five six seven eight nine'.split(' '));
const TEENS = new Set(
  'ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ')
);
const TENS = new Set('twenty thirty forty fifty sixty seventy eighty ninety'.split(' '));

/** How many digits a run of digits says ("4821", "12 34 56", "forty eight twenty one"); 0 if it isn't one. */
function codeDigits(rest: readonly string[]): number {
  if (rest.length === 0 || rest.length > 8) return 0;
  let digits = 0;
  for (const [i, w] of rest.entries()) {
    const next = rest[i + 1] ?? '';
    if (DIGIT_WORDS.has(w) || TEENS.has(w)) digits += TEENS.has(w) ? 2 : 1;
    else if (TENS.has(w))
      digits += DIGIT_WORDS.has(next) && next !== 'zero' && next !== 'oh' ? 1 : 2;
    else if (/^\p{L}*\d[\p{L}\d]*$/u.test(w)) digits += w.replace(/\D/g, '').length;
    else return 0;
  }
  return digits;
}

const looksLikeCode = (rest: readonly string[]): boolean => {
  const digits = codeDigits(rest);
  return digits >= 3 && digits <= 12;
};

/** One to `max` words, none of which describes the secret instead of being it. */
function looksLikeSecretWords(rest: readonly string[], max: number): boolean {
  return rest.length > 0 && rest.length <= max && !rest.some((w) => DESCRIBES.has(w));
}

/** The value's words that could be the secret: after "changed to", less credential words and fillers. */
function secretPart(valueWords: readonly string[]): string[] {
  const to = valueWords.findIndex((w, i) => w === 'to' && SET_TO.has(valueWords[i - 1] ?? ''));
  return valueWords.slice(to + 1).filter((w) => !stripped(w));
}

/** No credential word in the key: a short code under a bare "code", or "login: user / secret". */
function withoutContext(
  keyPhrase: string,
  value: string,
  rest: string[]
): CredentialCategory | null {
  if (BARE_CODE.test(keyPhrase) && codeDigits(rest) >= 6 && codeDigits(rest) <= 12) {
    return 'one-time-code';
  }
  const slash = value.lastIndexOf('/');
  if (LOGIN.test(keyPhrase) && slash > 0 && value.slice(0, slash).trim()) {
    return looksLikeSecretWords(words(value.slice(slash + 1)), 4) ? 'password' : null;
  }
  return null;
}

/** What may come before a credential named in a value: "remember my PIN", "User's PIN". */
const LEAD_IN = new Set(
  'remember remembers remembered note noted save saved keep that so'.split(' ')
);
const NUMBERISH = (w: string): boolean =>
  DIGIT_WORDS.has(w) || TEENS.has(w) || TENS.has(w) || /\d/.test(w);

/**
 * A credential named in the value and followed, past fillers, by what could be the
 * secret: 3+ digits, written or spoken, or a word of letters and digits ("sunshine42").
 * How many other words the value has doesn't matter. The name must lead its phrase:
 * only credential words, fillers, a lead-in or an owner ("Seth's") before it, so
 * "unit pin 1204" stays an apartment and "my PIN pad is broken" a broken pad.
 */
function secretAfterName(valueWords: readonly string[], value: string): CredentialCategory | null {
  const phrase = valueWords.join(' ');
  const owners = new Set(
    (value.match(/[\p{L}\p{N}]+['’]s?(?=[^\p{L}\p{N}]|$)/gu) ?? []).flatMap((t) => words(t))
  );
  for (const [category, re] of CONTEXT) {
    for (const m of phrase.matchAll(new RegExp(re.source, 'g'))) {
      const before = phrase.slice(0, m.index).trim();
      const start = before ? before.split(' ').length : 0;
      const prev = valueWords[start - 1] ?? '';
      if (start > 0 && !stripped(prev) && !LEAD_IN.has(prev) && !owners.has(prev)) continue;
      let at = start + m[0].trim().split(' ').length;
      while (at < valueWords.length && FILLER.has(valueWords[at])) at++;
      let end = at;
      while (end < valueWords.length && end - at < 8 && NUMBERISH(valueWords[end])) end++;
      const next = valueWords[at] ?? '';
      const mixed = next.length >= 4 && /\p{L}/u.test(next) && /\d/.test(next);
      if (codeDigits(valueWords.slice(at, end)) >= 3 || mixed) return category;
    }
  }
  return null;
}

/**
 * The credential this fact holds, or null when it holds none. Needs both a credential
 * word in the key or value and a value that could be the secret.
 */
export function credentialCategory(key: string, value: string): CredentialCategory | null {
  const keyPhrase = words(key).join(' ');
  const valueWords = words(value);
  const identifier = identifierCategory(keyPhrase, value, valueWords);
  if (identifier) return identifier;
  const phrase = `${keyPhrase} ${valueWords.join(' ')}`;
  if (ABOUT_SECRET.test(phrase) || (POSTAL_PIN.test(phrase) && !PIN_OWNER.test(phrase)))
    return null;
  const named = secretAfterName(valueWords, value);
  if (named) return named;
  const rest = secretPart(valueWords);
  const match = CONTEXT.find(([, re]) => re.test(phrase));
  if (!match) return withoutContext(keyPhrase, value, rest);
  const category = match[0];
  // A credential named only in the value must lead it ("password is x", not "resets passwords")
  if (!CONTEXT.some(([, re]) => re.test(keyPhrase))) {
    const last = valueWords.reduce((at, w, i) => (CREDENTIAL_WORDS.has(w) ? i : at), -1);
    if (valueWords.slice(0, last).some((w) => !stripped(w))) return null;
  }
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

// ---------------------------------------------------------------------------
// Identifiers (#2385). Free text is redacted with this predicate in credential-redaction.ts.
// Shapes and checksums live in identifier-shapes.ts.
// ---------------------------------------------------------------------------

/** Words that name an identifier; the secret is what follows the last of them. */
export const IDENTIFIER_WORDS = new Set(
  (
    'ssn social security routing aba bank checking savings account acct number no api access auth ' +
    'bearer refresh secret session personal client key keys token tokens mothers mother moms mom mums mum maiden name'
  ).split(' ')
);
const digitsOnly = (rest: readonly string[]): string =>
  rest.length > 0 && rest.every((w) => /^\d+$/.test(w)) ? rest.join('') : '';

/** "my password, hunter2, I use everywhere": the secret set off by commas right after the word. */
const APPOSITIVE = /\b(?:password|passcode|passphrase|pin)\s*[,:]\s*([^\s,]+)\s*(?:,|$)/i;

/** "the answer to my security question is what was my first pet": a question, not its answer. */
const ASKS = new Set('about regarding what which who where when why how whether if'.split(' '));

const IDENTIFIER_RULES: ReadonlyArray<{
  category: CredentialCategory;
  context: RegExp;
  secret: (rest: readonly string[]) => boolean;
  /** The secret runs to the end of the value, past identifier words ("my dog's name Biscuit"). */
  whole?: true;
}> = [
  {
    category: 'ssn',
    context: term('ssn|social security(?: number| no)?|social(?: number)?'),
    secret: (rest) => ssnValid(digitsOnly(rest)),
  },
  {
    category: 'bank-account',
    context: term('routing(?: number| no)?|aba(?: number)?'),
    secret: (rest) => abaValid(digitsOnly(rest)),
  },
  {
    category: 'bank-account',
    context: term(
      '(?:bank|checking|savings) account(?: number| no)?|account (?:number|no)|acct(?: number| no)?|account'
    ),
    secret: (rest) => /^\d{4,17}$/.test(digitsOnly(rest)),
  },
  {
    category: 'api-key',
    context: term(
      '(?:api|access|auth|bearer|refresh|secret|session|personal access) (?:key|keys|token|tokens)|api secret|client secret|token'
    ),
    secret: (rest) => {
      const joined = rest.join('');
      return (
        rest.length <= 6 &&
        !rest.some((w) => DESCRIBES.has(w)) &&
        joined.length >= 16 &&
        /\d/.test(joined) &&
        /\p{L}/u.test(joined)
      );
    },
  },
  {
    category: 'security-answer',
    context: term('(?:mothers|mother|moms|mom|mums|mum) maiden name'),
    secret: (rest) => looksLikeSecretWords(rest, 3),
  },
  {
    category: 'security-answer',
    context: term('(?:answer to (?:the |my )?)?(?:security|secret) question'),
    secret: (rest) => looksLikeSecretWords(rest, 3) && !rest.some((w) => ASKS.has(w)),
  },
  {
    category: 'one-time-code',
    context: term(
      '(?:texted|text message|sms|emailed) code|code (?:they|you|he|she|it|someone|somebody|the bank) (?:texted|sent|emailed)(?: me| to me)?'
    ),
    secret: (rest) => /^\d{4,8}$/.test(digitsOnly(rest)),
  },
  {
    category: 'access-code',
    context: term(
      'code for (?:the |my )?(?:front |back |side )?(?:door|gate|garage|alarm|house|building|apartment|lockbox)'
    ),
    secret: looksLikeCode,
  },
  {
    // "the password is my dog's name Biscuit": a name given is the secret, not a hint
    category: 'password',
    context: term('password|passcode|passphrase|pin'),
    secret: (rest) => rest.length <= 6 && /(?:^| )names? \S/.test(rest.join(' ')),
    whole: true,
  },
];

/**
 * The words a rule's context names as its secret: those after it up to the next identifier
 * word, or, when none follow, those just before it ("4821, the code for the front door").
 */
function restAround(
  context: RegExp,
  keyPhrase: string,
  valueWords: readonly string[],
  whole: boolean
): string[] | null {
  const phrase = `${keyPhrase} ${valueWords.join(' ')}`;
  const m = context.exec(phrase);
  if (!m) return null;
  const all = phrase.split(' ').filter(Boolean);
  const keyLength = all.length - valueWords.length;
  const end =
    phrase.slice(0, m.index).split(' ').filter(Boolean).length + m[0].trim().split(' ').length;
  const cut = (ws: string[]): string[] => {
    const stop = whole ? -1 : ws.findIndex((w) => IDENTIFIER_WORDS.has(w));
    return (stop < 0 ? ws : ws.slice(0, stop)).filter((w) => !FILLER.has(w));
  };
  // "account balance is 1200": the key goes on to name something else
  if (all.slice(end, keyLength).some((w) => !FILLER.has(w) && !IDENTIFIER_WORDS.has(w)))
    return null;
  const after = cut(end <= keyLength ? [...valueWords] : all.slice(end));
  if (after.length > 0) return after;
  const before = all.slice(keyLength, end - m[0].trim().split(' ').length).reverse();
  return cut(before).reverse();
}

/** A shaped secret anywhere in the value, or an identifier named in the key or value. */
function identifierCategory(
  keyPhrase: string,
  value: string,
  said: readonly string[]
): CredentialCategory | null {
  let valueWords = said;
  // "four one one one ...": number words read as digits ("4111...")
  const spoken = spokenDigits(value).text;
  const shaped = shapedSecrets(spoken)[0];
  if (shaped !== undefined) return shaped.category;
  if (spoken !== value) valueWords = words(spoken);
  const aside = APPOSITIVE.exec(value)?.[1]?.toLowerCase() ?? '';
  if (aside && !DESCRIBES.has(aside) && !FILLER.has(aside)) return 'password';
  for (const r of IDENTIFIER_RULES) {
    const rest = restAround(r.context, keyPhrase, valueWords, r.whole === true);
    if (rest !== null && r.secret(rest)) return r.category;
  }
  return null;
}

/** What the predicate reads text with, so the free-text redactor reads it the same way. */
export const VOCABULARY = { words, stripped, CREDENTIAL_WORDS, SET_TO, DIGIT_WORDS, TEENS, TENS };
