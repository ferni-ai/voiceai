/**
 * What a call the server did not verify may have Ferni send the account owner
 * (owner-message-policy.ts). A shape allowlist, not a denylist: a message passes
 * only when it has none of the shapes a phishing text needs (a link, a number to
 * call, an address to write to, an ask for a login, code or bank details), so a
 * new disguise is refused by default instead of slipping past a missing case.
 *
 * After NFKC, a message passes only if every rule holds:
 * 1. charset: Latin letters (accents OK), 0-9, spaces, newlines and . , ! ? ' - : ( )
 * 2. digits: fewer than 7 digits or number words in any 30 characters (separators
 *    ignored); no 3-6 digit run within 3 words of call/dial/text/reply/send/ring
 *    (a clock time is not one); no toll-free prefix or digits broken by capitals
 * 3. no address-forming tokens: dot/period/point/dash/hyphen/underscore/slash,
 *    "." or ":" between two letters, www/http(s), com/net/org/io/info/biz/xyz/ru/uk,
 *    a dotted quad, or "at" before a mail provider
 * 4. no run of 3+ single letters or digits separated by spaces
 * 5. no credential ask (fe's ruling, 2026-10-31)
 *
 * The crisis lines of the safety context (CRISIS_RESOURCES: 988, 741741, ...) are
 * never refused by the digit rules when they stand alone: a number joined to
 * them by nothing but spaces or punctuation makes one longer number, which counts.
 *
 * @module tools/domains/proactive/outreach/owner-message-content
 */

import { SAFETY_CRISIS_RESOURCES } from '../../../../services/safety/index.js';

/** Why a message was refused; logged as the reason code, never with the text. */
export const CONTENT_BLOCKS = [
  'charset',
  'digits',
  'short_code',
  'vanity_number',
  'address_token',
  'mail_provider',
  'spaced_chars',
  'credential_ask',
] as const;
export type ContentBlock = (typeof CONTENT_BLOCKS)[number];

/** fe picked (b), 2026-10-31: refuse 7+ digits or number words within any 30 characters. */
const DIGIT_RULE = { digits: 7, windowChars: 30 } as const;

const CHARSET = /^[\p{Script=Latin}0-9 \n.,!?'\-:()]*$/u;
const NUMBER_WORDS: Readonly<Record<string, string>> = {
  zero: '0', oh: '0', o: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
  seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12', thirteen: '13',
  fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18',
  nineteen: '19', twenty: '20', thirty: '30', forty: '40', fifty: '50', sixty: '60',
  seventy: '70', eighty: '80', ninety: '90',
}; // prettier-ignore
const REPEATS: Readonly<Record<string, number>> = { double: 2, triple: 3 };
const DIALS = /^(?:call(?:s|ed|ing)?|dial(?:s|ed|ing|led|ling)?|texts?|texted|texting|repl(?:y|ies|ied|ying)|sends?|sending|sent|rings?|ringing|rang)$/; // prettier-ignore
const ADDRESS_WORDS = /\b(?:dot|period|point|dash|hyphen|underscore|slash|www|https?|com|net|org|io|info|biz|xyz|ru|uk)\b/; // prettier-ignore
/** a.m., p.m., e.g., i.e.: letter-dot-letter, but no address. */
const ABBREVIATIONS = /(?<!\p{L})(?:a\.m|p\.m|e\.g|i\.e)\.?/gu;
const own = <T>(table: Readonly<Record<string, T>>, key: string | undefined): T | undefined =>
  key !== undefined && Object.hasOwn(table, key) ? table[key] : undefined;
const MAIL_PROVIDERS = /^(?:gmail|yahoo|outlook|hotmail|icloud|aol|proton|protonmail|live|msn)$/;
const CREDENTIAL_PHRASE = /\b(?:card\s*numbers?|bank\s*accounts?|account\s*numbers?|routing\s*numbers?|(?:verification|one[\s-]*time|security|login|log[\s-]*in)\s*codes?|gift\s*cards?)\b/; // prettier-ignore
const CREDENTIAL_WORD = /\b(?:verif(?:y|ies|ied|ying|ications?)|pass[\s-]*words?|pins?|ssns?|social\s*security(?:\s*numbers?)?|(?:re[\s-]*)?log(?:s|ged|ging)?[\s-]*(?:back[\s-]*)?in|logins?|wires?|wired|wiring)\b/; // prettier-ignore
const CODE_ASK = /^(?:send|sends|sent|reply|replies|enter|share|read|type|text|texts|texted)$/;

interface Token {
  text: string;
  start: number;
  /** The digits it stands for, or null when it is a word */
  digits: string | null;
}

/** Every crisis line's number as digits, read from the crisis module (one source of truth). */
function crisisNumbers(): ReadonlySet<string> {
  const numbers = new Set<string>();
  for (const resource of Object.values(SAFETY_CRISIS_RESOURCES).flat()) {
    const phone = resource.phone?.replace(/\D/g, '');
    if (phone && phone.length >= 3) numbers.add(phone);
    for (const run of resource.text?.match(/\d{3,}/g) ?? []) numbers.add(run);
  }
  return numbers;
}

/** Number words run together ("fivefive"), longest first; "o"/"oh" only on their own. */
const GLUABLE = Object.keys(NUMBER_WORDS).filter((w) => w.length > 2).sort((a, b) => b.length - a.length).join('|'); // prettier-ignore
const GLUED_NUMBER_WORDS = new RegExp(`^(?:${GLUABLE})+$`);
const ONE_NUMBER_WORD = new RegExp(GLUABLE, 'g');

/** What a word stands for in digits, or null when it is not a number. */
function wordDigits(word: string): string | null {
  if (/^[0-9]/.test(word)) return word;
  const single = own(NUMBER_WORDS, word) ?? (own(REPEATS, word) ? '' : undefined);
  if (single !== undefined) return single;
  return GLUED_NUMBER_WORDS.test(word) ? word.replace(ONE_NUMBER_WORD, (w) => NUMBER_WORDS[w]) : null; // prettier-ignore
}

/** Words and digit runs, with what each number word stands for ("o"/"oh" only next to a number). */
function tokensOf(text: string): Token[] {
  const tokens = [...text.matchAll(/\p{L}+|[0-9]+/gu)].map((m) => ({
    text: m[0],
    start: m.index,
    digits: wordDigits(m[0]),
  }));
  const numeric = (t: Token | undefined) => t?.digits != null && t.text !== 'o' && t.text !== 'oh';
  tokens.forEach((t, i) => {
    if ((t.text === 'o' || t.text === 'oh') && !numeric(tokens[i - 1]) && !numeric(tokens[i + 1])) t.digits = null; // prettier-ignore
  });
  return tokens;
}

/** Runs of number tokens with nothing but spaces or punctuation between them: one number each. */
function numberGroups(tokens: Token[]): Token[][] {
  const groups: Token[][] = [];
  let run: Token[] = [];
  for (const t of [...tokens, { text: '', start: -1, digits: null }]) {
    if (t.digits != null) run.push(t);
    else if (run.length) {
      groups.push(run);
      run = [];
    }
  }
  return groups;
}

const groupDigits = (group: Token[]): string =>
  group.reduce(
    (out, t, i) => out + (own(REPEATS, t.text) ? '' : (t.digits ?? '').repeat(own(REPEATS, group[i - 1]?.text) ?? 1)), // prettier-ignore
    ''
  );

/** Whether a group is a clock time ("5:30", "10:45"), never a short code. */
const isClockTime = (group: Token[], text: string): boolean =>
  group.length === 2 &&
  /^[0-9]{1,2}$/.test(group[0].text) &&
  /^[0-9]{2}$/.test(group[1].text) &&
  text.slice(group[0].start + group[0].text.length, group[1].start) === ':';

/** Rule 2 on the lower-case text: the 7-in-30 window and short codes, crisis lines aside. */
function digitBlock(text: string): ContentBlock | null {
  const tokens = tokensOf(text);
  const crisis = crisisNumbers();
  const counted = numberGroups(tokens).filter((g) => !crisis.has(groupDigits(g)));
  const startsGroup = new Map(counted.map((g) => [g[0], groupDigits(g)]));
  // Words as written, each counted number as its digits, crisis lines and separators gone
  const compact = tokens.map((t) => startsGroup.get(t) ?? (t.digits == null ? t.text : '')).join(''); // prettier-ignore
  for (let i = 0; i < compact.length; i++) {
    const window = compact.slice(i, i + DIGIT_RULE.windowChars);
    if ((window.match(/[0-9]/g)?.length ?? 0) >= DIGIT_RULE.digits) return 'digits';
  }
  for (const group of counted) {
    const length = groupDigits(group).length;
    if (length < 3 || length > 6 || isClockTime(group, text)) continue;
    const [first, last] = [tokens.indexOf(group[0]), tokens.indexOf(group[group.length - 1])];
    const near = tokens.slice(Math.max(0, first - 3), last + 4);
    if (near.some((t) => DIALS.test(t.text))) return 'short_code';
  }
  return null;
}

/** Toll-free prefixes and digits broken by capitals, read before lower-casing. */
function vanityBlock(text: string): boolean {
  const crisis = crisisNumbers();
  const tollFree = /(?<![0-9A-Za-z])(?:1[\s.\-()]*)?\(?8(?:00|88|77|66|55|44|33)\)?[\s.\-]*(?=[0-9]|[A-Z]{2})[0-9A-Z\s.\-()]*/g; // prettier-ignore
  for (const [run] of text.matchAll(tollFree)) {
    if (/[A-Z]{2}/.test(run) || !crisis.has(run.replace(/\D/g, ''))) return true;
  }
  return /[0-9][\s.\-()]*(?:[A-Z][\s.-]?){3,}[\s.\-()]*[0-9]/.test(text);
}

/** Single letters spaced apart read as one word: "g m a i l" is "gmail". */
const collapseSpacedLetters = (text: string): string =>
  text.replace(/(?<![\p{L}0-9])\p{L}(?: \p{L}(?![\p{L}0-9]))+/gu, (run) => run.replace(/ /g, ''));

/** Credential asks, also with digits standing in for letters inside a word ("passw0rd"). */
function credentialAsk(text: string): boolean {
  const spellings = ['i', 'l'].map((one) =>
    text.replace(/\p{L}*[0-9]\p{L}[\p{L}0-9]*|\p{L}+[0-9][\p{L}0-9]*/gu, (word) =>
      word.replace(/[013457]/g, (d) => ({ 0: 'o', 1: one, 3: 'e', 4: 'a', 5: 's', 7: 't' })[d] ?? d)
    )
  );
  if (spellings.some((s) => CREDENTIAL_PHRASE.test(s) || CREDENTIAL_WORD.test(s))) return true;
  const words = [...text.matchAll(/\p{L}+/gu)].map((m) => m[0]);
  return words.some(
    (w, i) => /^(?:codes?|pins?)$/.test(w) && words.slice(Math.max(0, i - 4), i + 5).some((n) => CODE_ASK.test(n)) // prettier-ignore
  );
}

/** The first rule `text` breaks for an unverified call, or null when it may be sent. */
export function blockedContent(text: string): ContentBlock | null {
  const form = text.normalize('NFKC').replace(/[\u2018\u2019]/g, "'");
  if (!CHARSET.test(form)) return 'charset';
  if (vanityBlock(form)) return 'vanity_number';
  const lower = form.toLowerCase();
  if (/(?<![\p{L}0-9])(?:[\p{L}0-9] +){2,}[\p{L}0-9](?![\p{L}0-9])/u.test(lower)) return 'spaced_chars'; // prettier-ignore
  const plain = collapseSpacedLetters(lower);
  const digits = digitBlock(plain);
  if (digits) return digits;
  const unabbreviated = plain.replace(ABBREVIATIONS, (abbreviation) =>
    abbreviation.replace(/\./g, '')
  );
  if (ADDRESS_WORDS.test(unabbreviated) || /\p{L}[.:]\p{L}/u.test(unabbreviated)) return 'address_token'; // prettier-ignore
  if (/[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/.test(plain)) return 'address_token';
  const words = [...plain.matchAll(/\p{L}+/gu)].map((m) => m[0]);
  // "at" then a provider within 2 words, also split across two ("g mail", "proton mail")
  const near = (i: number) => [1, 2].flatMap((k) => [words[i + k], `${words[i + k] ?? ''}${words[i + k + 1] ?? ''}`]); // prettier-ignore
  const mail = words.some(
    (w, i) => w === 'at' && near(i).some((n) => MAIL_PROVIDERS.test(n ?? ''))
  );
  if (mail) return 'mail_provider';
  return credentialAsk(plain) ? 'credential_ask' : null;
}
