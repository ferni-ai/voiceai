/**
 * What a call the server did not verify may have Ferni send the account owner
 * (owner-message-policy.ts): a shape allowlist, so a message passes only with none
 * of the shapes a phishing text needs (a link, a number, an address, a credential
 * ask), and a new disguise is refused by default. Every rule reads one form
 * (foldToAscii): NFKC, accents dropped, look-alikes as ASCII. It passes only if:
 * 1. charset: after folding, ASCII letters, 0-9, spaces, newlines, . , ! ? ' - : ( ) / & "
 *    and emoji (no zero-width joiner); later rules read / & " as "-" and emoji as a space
 * 2. digits: fewer than 7 digits or number words in any 30 characters or any 14
 *    words (separators ignored; l/i/o/s dressed as digits count); no digits woven
 *    through a word; no 3-6 digit run within 3 words of call/dial/text/reply/send/ring
 *    (a clock time is not one); no toll-free prefix or digits broken by capitals
 * 3. no address-forming tokens: dot/period/point/dash/hyphen/underscore/slash,
 *    "x.y", "x:y", "x(.)y", "x . y", "x. y" (y not a sentence start), www/http(s),
 *    com/net/org/io/info/biz/xyz/ru/uk, a dotted quad, or "at" before a mail provider
 * 4. no run of 3+ single letters or digits separated by spaces
 * 5. no credential ask (fe's ruling, 2026-10-31)
 *
 * The safety context's crisis lines (CRISIS_RESOURCES: 988, 741741, ...) and its
 * EMERGENCY_NUMBER (911) are never refused by the digit rules when they stand
 * alone: a number joined to them by nothing but spaces or punctuation makes one
 * longer number, which counts.
 *
 * @module tools/domains/proactive/outreach/owner-message-content
 */

import { EMERGENCY_NUMBER, SAFETY_CRISIS_RESOURCES } from '../../../../services/safety/index.js';

/** Why a message was refused; logged as the reason code, never with the text. */
export const CONTENT_BLOCKS = [
  'charset', 'digits', 'short_code', 'vanity_number', 'address_token', 'mail_provider', 'spaced_chars', 'credential_ask',
] as const; // prettier-ignore
export type ContentBlock = (typeof CONTENT_BLOCKS)[number];

/**
 * fe picked (b), 2026-10-31: refuse 7+ digits or number words within any 30
 * characters (separators ignored), or within any 14 words, so words padded
 * between the digits can't stretch a number past the character window.
 */
const DIGIT_RULE = { digits: 7, windowChars: 30, windowTokens: 14 } as const;

/** After folding, the characters in rule 1 only (fe, 2026-10-31); no zero-width joiner, so a
 * compound emoji is refused rather than glued together. */
const CHARSET = /^[A-Za-z0-9 \n.,!?'\-:()/&"\p{Extended_Pictographic}\uFE0F]*$/u;
/** Latin letters NFKD leaves alone that read as ASCII ones (dotless i, small capitals, ...). */
const LATIN_LOOK_ALIKES: Readonly<Record<string, string>> = {
  ı: 'i', ȷ: 'j', ß: 'ss', æ: 'ae', Æ: 'AE', ø: 'o', Ø: 'O', œ: 'oe', Œ: 'OE', ł: 'l', Ł: 'L',
  đ: 'd', Đ: 'D', ð: 'd', Ð: 'D', þ: 'th', Þ: 'Th', ɑ: 'a', ɡ: 'g', ɩ: 'i', ʋ: 'v',
  ᴀ: 'a', ʙ: 'b', ᴄ: 'c', ᴅ: 'd', ᴇ: 'e', ꜰ: 'f', ɢ: 'g', ʜ: 'h', ɪ: 'i', ᴊ: 'j', ᴋ: 'k',
  ʟ: 'l', ᴍ: 'm', ɴ: 'n', ᴏ: 'o', ᴘ: 'p', ʀ: 'r', ꜱ: 's', ᴛ: 't', ᴜ: 'u', ᴠ: 'v', ᴡ: 'w',
  ʏ: 'y', ᴢ: 'z', '©': 'c', '®': 'r',
}; // prettier-ignore
/** Letters next to a digit that stand in for one ("55S-O1l2" is 555-0112). */
const DIGIT_LOOK_ALIKES: Readonly<Record<string, string>> = { l: '1', i: '1', o: '0', s: '5' };
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
/** A dot word glued to a TLD, inside any word: "evildotcom", "evil-dotnet". */
const GLUED_ADDRESS = /(?:dot|period|point)(?:com|net|org|io|info|biz|xyz|ru|uk)\b/;
const own = <T>(table: Readonly<Record<string, T>>, key: string | undefined): T | undefined =>
  key !== undefined && Object.hasOwn(table, key) ? table[key] : undefined;
/** fe dropped "live" (2026-10-31): "meet at Live Oak Park". */
const MAIL_PROVIDERS = /^(?:gmail|yahoo|outlook|hotmail|icloud|aol|proton|protonmail|msn)$/;
const CREDENTIAL_PHRASE = /\b(?:card\s*numbers?|bank\s*accounts?|account\s*numbers?|routing\s*numbers?|(?:verification|one[\s-]*time|security|login|log[\s-]*in|authentication)\s*(?:pass\s*)?codes?|gift\s*cards?)\b/; // prettier-ignore
const CREDENTIAL_WORD = /\b(?:verif(?:y|ies|ied|ying|ications?)|pass[\s-]*words?|pass[\s-]*codes?|otps?|pins?|ssns?|social\s*security(?:\s*numbers?)?|(?:re[\s-]*)?log(?:s|ged|ging)?[\s-]*(?:back[\s-]*)?in|logins?|wires?|wired|wiring)\b/; // prettier-ignore
const CODE_ASK = /^(?:send|sends|sent|reply|replies|enter|share|read|type|text|texts|texted)$/;

interface Token {
  text: string;
  start: number;
  /** The digits it stands for, or null when it is a word */
  digits: string | null;
}

/** Every crisis line's number and the emergency number as digits, read from the safety context. */
function crisisNumbers(): ReadonlySet<string> {
  const numbers = new Set<string>([EMERGENCY_NUMBER.replace(/\D/g, '')]);
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
const isClockTime = ([hours, minutes, ...rest]: Token[], text: string): boolean =>
  !rest.length && /^[0-9]{1,2}$/.test(hours?.text ?? '') && /^[0-9]{2}$/.test(minutes?.text ?? '') && text.slice(hours.start + hours.text.length, minutes.start) === ':'; // prettier-ignore

/** Words spelled only with l, i, o, s: read as words even beside a number ("Buy 2 oil"). */
const LOOK_ALIKE_WORDS: ReadonlySet<string> = new Set(['i', 'is', 'so', 'lo', 'oil', 'oils', 'soil', 'soils', 'silo', 'silos', 'solo', 'solos', 'sis', 'loo', 'loos', 'lol', 'sol', 'loss', 'ill', 'ills', 'sill', 'sills', 'oslo']); // prettier-ignore
const asLookAlikeDigits = (letters: string): string => letters.replace(/[lios]/g, (c) => DIGIT_LOOK_ALIKES[c]); // prettier-ignore

/** One mapping pass, repeated until nothing changes; `acrossSpace` also maps a whole look-alike word beside a number. */
function mapLookAlikes(text: string, acrossSpace: boolean, keepWords: boolean): string {
  let out = text;
  for (let before = ''; before !== out;) {
    before = out;
    out = out.replace(/[a-z]+/g, (piece: string, offset: number, whole: string) => {
      if (piece !== 'o' && wordDigits(piece) !== null) return piece; // a lone o is a look-alike too
      const pure = /^[lios]+$/.test(piece) && !(keepWords && LOOK_ALIKE_WORDS.has(piece));
      const gap = pure && acrossSpace ? '[-.()\\s]*' : '[-.()]*';
      const left = new RegExp(`[0-9]${gap}$`).test(whole.slice(0, offset));
      const right = new RegExp(`^${gap}[0-9]`).test(whole.slice(offset + piece.length));
      if (pure) return left || right ? asLookAlikeDigits(piece) : piece;
      let mapped = left ? piece.replace(/^[lios]+/, asLookAlikeDigits) : piece;
      if (right) mapped = mapped.replace(/[lios]+$/, asLookAlikeDigits);
      return mapped;
    });
  }
  return out;
}

/** Letters dressed as digits read as digits ("55S-O1l2"): first at word ends touching a digit
 * (or through - . ( )), then whole l/i/o/s words beside a number across a space ("2ooo ooo"),
 * real words ("oil", "I") only once the message already dressed digits as letters. */
function withLookAlikeDigits(text: string): string {
  const inWords = mapLookAlikes(text, false, true);
  return mapLookAlikes(inWords, true, inWords === text);
}

/** Rule 2 on the lower-case text: digit windows, mixed tokens and short codes, crisis lines aside. */
function digitBlock(lower: string): ContentBlock | null {
  const text = withLookAlikeDigits(lower);
  // Digits woven through letters in one word ("1a2b3c4"): a number dressed as a word
  for (const [word] of text.matchAll(/[a-z0-9]+/g)) {
    if (/[0-9][a-z]+[0-9]/.test(word) && (word.match(/[0-9]/g)?.length ?? 0) >= 4) return 'digits';
  }
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
  const inCounted = new Set(counted.flat());
  const perToken = tokens.map((t) => (inCounted.has(t) ? (t.digits ?? '').length : 0));
  for (let i = 0; i < perToken.length; i++) {
    const inWindow = perToken.slice(i, i + DIGIT_RULE.windowTokens).reduce((a, b) => a + b, 0);
    if (inWindow >= DIGIT_RULE.digits) return 'digits';
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

/**
 * The one form every rule reads: NFKC, curly apostrophes as ', then accents
 * dropped (NFKD without marks) and Latin look-alikes as ASCII, so a word check
 * sees "verify" however it was dressed. Case is kept for the vanity and
 * sentence-start rules.
 */
const foldToAscii = (text: string): string =>
  text
    .normalize('NFKC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{ASCII}]/gu, (c) => LATIN_LOOK_ALIKES[c] ?? c)
    .replace(/[\u{1F100}-\u{1F1FF}]/gu, enclosedLetter);

/** Enclosed letters (🅰 🅿, squared or circled) read as the letter; the rest of the block (regional
 * indicators, squared words) as U+FFFD, which the charset refuses. Keycaps: NFKD keeps the digit. */
function enclosedLetter(c: string): string {
  const offset = [0x1f130, 0x1f150, 0x1f170].map((base) => (c.codePointAt(0) ?? 0) - base).find((o) => o >= 0 && o < 26); // prettier-ignore
  return offset === undefined ? '\uFFFD' : String.fromCharCode(65 + offset);
}

/** a.m., p.m., e.g., i.e. as whole words: letter-dot-letter, but no address. */
const withoutAbbreviationDots = (text: string): string =>
  text.replace(/(?<![A-Za-z])(?:[ap]\.m|e\.g|i\.e)\.?(?![A-Za-z])/gi, (a) => a.replace(/\./g, ''));

/**
 * Rule 3's dots on the case-kept text: "x.y" and "x:y", a defanged "x(.)y",
 * "x . y", and "x. y" unless y starts a sentence (a capital in the text as written).
 */
const ADDRESS_DOTS = [
  /[A-Za-z][.:][A-Za-z]/,
  /[A-Za-z0-9]\s*\(\s*[.:]\s*\)\s*[A-Za-z0-9]/,
  /[A-Za-z0-9]\s+[.:]\s*[A-Za-z]{2}/,
  /[A-Za-z0-9]\.(?!\.)\s+[a-z]{2}/,
];

/** The first rule `text` breaks for an unverified call, or null when it may be sent. */
export function blockedContent(text: string): ContentBlock | null {
  const folded = foldToAscii(text);
  if (!CHARSET.test(folded)) return 'charset';
  // Every later rule reads / & " as "-" and an emoji as a space: separators that can't glue or break a shape
  const form = folded.replace(/[/&"]/g, '-').replace(/\p{Extended_Pictographic}/gu, ' ');
  if (vanityBlock(form)) return 'vanity_number';
  const lower = form.toLowerCase();
  if (/(?<![\p{L}0-9])(?:[\p{L}0-9] +){2,}[\p{L}0-9](?![\p{L}0-9])/u.test(lower)) return 'spaced_chars'; // prettier-ignore
  const plain = collapseSpacedLetters(lower);
  const digits = digitBlock(plain);
  if (digits) return digits;
  const dotted = withoutAbbreviationDots(form);
  if (ADDRESS_WORDS.test(plain) || GLUED_ADDRESS.test(plain) || ADDRESS_DOTS.some((dot) => dot.test(dotted))) return 'address_token'; // prettier-ignore
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
