/**
 * A credential in free text, by shape (#2514 round 2): what a caller asked Ferni to
 * remember is one sentence, not an extractor's key and value, so spoken-credential.ts's
 * credentialCategory misses "Gmail password is hunter2!", "the code is 4 8 1 5" and
 * "my credit card is 4111-1111-1111-1111". This reads the sentence itself.
 *
 * Refused when any holds:
 * - a known key or token prefix (sk-, AKIA, ghp_, xoxb-, AIza, glpat-, a JWT), or an IBAN;
 * - a card number (13 to 19 digits, written, spaced, dashed or spoken, that pass Luhn)
 *   or an SSN shape (123-45-6789), with no credential word needed;
 * - a credential word (password, code, PIN, card, CVV, SSN, account or routing number,
 *   API key, token, passport...) followed, within its clause, by a secret-shaped token:
 *   a run of digits (spaced, dashed or spoken), letters spelled one by one, a word of
 *   letters and digits, a long random string, or, after "password is", plain words;
 * - a security question, secret answer or mother's maiden name given with its answer.
 * A word about the secret ("password manager", "zip code", "pin pad", "15th") is not one.
 *
 * Pure: no flag, no logging. remembered-facts.ts refuses on it; others may reuse it.
 *
 * @module memory/credential-shapes
 */

export type ShapeCategory =
  | 'password'
  | 'access-code'
  | 'pin'
  | 'one-time-code'
  | 'id-number'
  | 'api-key'
  | 'security-answer';

const KEY_PREFIX =
  /(?:^|[^A-Za-z0-9])(?:sk-[A-Za-z0-9_-]{6,}|sk_(?:live|test)_\w{6,}|(?:AKIA|ASIA)[0-9A-Z]{12,}|gh[pousr]_[A-Za-z0-9]{10,}|github_pat_\w{10,}|xox[abprs]-[A-Za-z0-9-]{6,}|AIza[0-9A-Za-z_-]{20,}|glpat-[\w-]{10,}|eyJ[\w-]{8,}\.[\w-]{8,})/;
const IBAN = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/;
const SSN = /(?:^|\D)\d{3}[- ]\d{2}[- ]\d{4}(?!\d)/;

const DIGIT_WORDS: Record<string, string> = {
  zero: '0', oh: '0', o: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9', niner: '9',
}; // prettier-ignore

/** Lower-case words; ":" and "=" read as "is"; "wi-fi" is "wifi"; apostrophes dropped. */
function tokens(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\bwi[\s_-]?fi\b/g, 'wifi')
    .replace(/['’]/g, '')
    .replace(/\b(?:no|num|nr)\.(?=\s|\d)/g, 'number ')
    .replace(/#(?=\s*\d)/g, ' number ')
    .replace(/[:=]/g, ' is ')
    .replace(/([,;.!?()])/g, ' $1 ')
    .split(/[^\p{L}\p{N},;.!?()_-]+/u)
    .flatMap((w) =>
      /^[\p{L}\p{N}]+(?:[_-][\p{L}\p{N}]+)+$/u.test(w) && !/\p{L}{2}/u.test(w)
        ? w.split(/[_-]/)
        : [w]
    ) // prettier-ignore
    .map((w) => w.replace(/^[_-]+|[_-]+$/g, ''))
    .filter(Boolean);
}

const TEENS =
  'ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
const TENS = 'twenty thirty forty fifty sixty seventy eighty ninety'.split(' ');
const isDigitTok = (w: string): boolean =>
  /^\d+$/.test(w) || w in DIGIT_WORDS || TEENS.includes(w) || TENS.includes(w);
/** Its digits: "4815", "four" 4, "twelve" 12, "thirty" 30 ("thirty two" reads 302, still a run). */
const digitsOf = (w: string): string =>
  /^\d+$/.test(w)
    ? w
    : (DIGIT_WORDS[w] ??
      (TEENS.includes(w) ? String(10 + TEENS.indexOf(w)) : TENS.includes(w) ? String(20 + 10 * TENS.indexOf(w)) : '')); // prettier-ignore
const CLAUSE = new Set([',', ';', '.', '!', '?', '(', ')', 'and', 'but', 'so', 'because', 'which', 'then']); // prettier-ignore

/** Every run of digit tokens (numerals or spoken digits), joined. */
function digitRuns(ws: readonly string[]): string[] {
  const runs: string[] = [];
  let run = '';
  for (const w of ws) {
    if (isDigitTok(w)) {
      run += digitsOf(w);
    } else if (run) {
      runs.push(run);
      run = '';
    }
  }
  if (run) runs.push(run);
  return runs;
}

function luhn(d: string): boolean {
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
    sum += n;
  }
  return sum % 10 === 0;
}

/** 13 to 19 digits that pass Luhn, in any one run (a card, written or spoken). */
const cardNumberIn = (ws: readonly string[]): boolean =>
  digitRuns(ws).some((r) => r.length >= 13 && r.length <= 19 && luhn(r));

/** Fillers between a credential word and its secret. */
const FILLER = new Set(
  (
    'is are was were its the my our his her their a an number no num # equals to of be ' +
    'spelled spelt spells reads ending ends in at capital uppercase lowercase upper lower'
  ).split(' ')
);
/** A word after "password is" that says something about it, so it isn't the secret. */
const DESCRIBES = new Set(
  (
    'on in under at inside behind written printed stored saved kept forgot forgotten changed reset same as like ' +
    'with not never no none set expired locked weak strong new old long short hard easy simple complicated ' +
    'secure safe unsafe wrong right correct incorrect different too very really so case sensitive private ' +
    'shared somewhere still also just only being getting going here there this that what it something ' +
    'last next every same required needed taken a an the my your his her their our for to from about'
  ).split(' ')
);

const mixed = (w: string): boolean =>
  w.length >= 4 &&
  /\p{L}/u.test(w) &&
  /\d/.test(w) &&
  !/^\d+(?:st|nd|rd|th|s|am|pm|k|mg|kg|lb|lbs)$/.test(w);
/** A long string of letters and digits or symbols, like a key. */
const randomish = (w: string): boolean => w.length >= 16 && /^[\w-]+$/.test(w) && /\d/.test(w);

/** The words after `at`: fillers skipped (noting an "is"), up to the clause's end. */
function clauseAfter(ws: readonly string[], at: number): { copula: boolean; clause: string[] } {
  let i = at;
  let copula = false;
  for (; i < ws.length && FILLER.has(ws[i] ?? ''); i++) {
    if (['is', 'are', 'was', 'were'].includes(ws[i] ?? '')) copula = true;
  }
  const clause: string[] = [];
  for (let j = i; j < ws.length && clause.length < 20; j++) {
    const word = ws[j] ?? '';
    // "thirty two, ten, eight": a comma between numbers doesn't end the run
    if (word === ',' && isDigitTok(ws[j - 1] ?? '') && isDigitTok(ws[j + 1] ?? '')) continue;
    if (CLAUSE.has(word)) break;
    clause.push(word);
  }
  return { copula, clause };
}

/** How many digits the clause opens with ("4 8 1 5", "four eight one five"). */
function leadingDigits(clause: readonly string[]): number {
  let run = '';
  for (const word of clause) {
    if (!isDigitTok(word)) break;
    run += digitsOf(word);
  }
  return run.length;
}

/** "h u n t e r 2", "capital T r o u b": single letters or digits in a row. */
function spelled(clause: readonly string[]): number {
  let singles = 0;
  for (const word of clause) {
    if (word.length === 1 || word in DIGIT_WORDS) singles++;
    else if (!FILLER.has(word)) break;
  }
  return singles;
}

/** Whether the secret follows `at`: digits, a key-like token, spelled letters, or (after "is") words. */
function secretAt(ws: readonly string[], at: number, rule: Rule): boolean {
  const { copula, clause } = clauseAfter(ws, at);
  const head = clause[0];
  if (head === undefined) return false;
  if (leadingDigits(clause) >= rule.minDigits || spelled(clause) >= 4) return true;
  if (mixed(head) || randomish(head) || KEY_PREFIX.test(` ${head}`)) return true;
  const plain = clause.length <= 4 && !clause.some((word) => DESCRIBES.has(word));
  return rule.allowWords === true && copula && plain;
}

interface Rule {
  category: ShapeCategory;
  /** The credential words, as a regex over the joined tokens (whole words). */
  words: RegExp;
  /** The fewest digits a run needs to be the secret. */
  minDigits: number;
  /** "password is purple monkey dishwasher": plain words after "is" count. */
  allowWords?: boolean;
  /** A word just before that makes it another thing ("zip code", "area code"). */
  notAfter?: ReadonlySet<string>;
}
const w = (src: string): RegExp => new RegExp(`(?:^| )(?:${src})(?= |$)`, 'g');
const NOT_A_SECRET_CODE = new Set(
  'zip zip4 area postal post postcode country calling promo promotional discount coupon dress qr bar gift tax source morse color colour zone time'.split(' ') // prettier-ignore
);
const RULES: readonly Rule[] = [
  { category: 'one-time-code', words: w('one time (?:code|passcode|password|pin)|otp|2fa|mfa|two factor(?: code)?|verification code|authentication code|auth code|login code|security code'), minDigits: 3 }, // prettier-ignore
  { category: 'password', words: w('password|passcode|passphrase|pwd|pw'), minDigits: 3, allowWords: true }, // prettier-ignore
  { category: 'password', words: w('pass|wifi|network key|wifi key|login|log in'), minDigits: 6 },
  { category: 'pin', words: w('pin|pin number|pins|cvv|cvc|cvv2|csc'), minDigits: 3 },
  { category: 'access-code', words: w('code|codes|combination|combo|lock combo'), minDigits: 3, notAfter: NOT_A_SECRET_CODE }, // prettier-ignore
  { category: 'id-number', words: w('ssn|social security(?: number)?|social'), minDigits: 9 },
  { category: 'id-number', words: w('card|card number|credit card|debit card|visa|amex|mastercard|discover card'), minDigits: 12 }, // prettier-ignore
  { category: 'id-number', words: w('account|account number|acct|routing|routing number|aba|iban|sort code|swift|bic'), minDigits: 6 }, // prettier-ignore
  { category: 'id-number', words: w('passport|passport number|license|licence|license number|drivers license|national id|tax id|ein|itin|nhs number|id number'), minDigits: 6 }, // prettier-ignore
  { category: 'api-key', words: w('api key|key|keys|token|tokens|secret|secrets|bearer|access key|secret key|client secret|private key'), minDigits: 12 }, // prettier-ignore
];

/** Right after a credential word, a word that makes it a thing about the secret. */
const ABOUT = new Set(
  (
    'manager managers app apps policy policies reset resets hint hints reuse strength generator vault ' +
    'recovery change changes protection rules requirements expiry expiration pad pads review reviews name ' +
    'names base editor school camp book page reader breach leak leaks field box'
  ).split(' ')
);

const SECURITY_ANSWER =
  /(?:^| )(?:(?:security|secret|challenge|recovery) (?:question|answer)s?|(?:mothers?|moms?|mums?|mothers side) maiden name)(?= |$)/;

/** A security question, secret answer or maiden name stated with its answer ("is x", "was x"). */
function securityAnswer(ws: readonly string[]): boolean {
  if (!SECURITY_ANSWER.test(ws.join(' '))) return false;
  const at = ws.findIndex((x) => x === 'is' || x === 'was');
  const answer = at >= 0 ? ws[at + 1] : undefined;
  return answer !== undefined && !DESCRIBES.has(answer) && !CLAUSE.has(answer);
}

/** Where each token starts in `ws.join(' ')`. */
function offsets(ws: readonly string[]): number[] {
  const out: number[] = [];
  let at = 0;
  for (const word of ws) {
    out.push(at);
    at += word.length + 1;
  }
  return out;
}

/** Whether the credential word at `first` (spanning `span` tokens) comes with its secret. */
function ruleHit(ws: readonly string[], rule: Rule, first: number, span: number): boolean {
  if (rule.notAfter?.has(ws[first - 1] ?? '')) return false;
  const after = first + span;
  const next = ws[after];
  if (next !== undefined && ABOUT.has(next)) return false;
  // "the three digits on the back are 123 cvv": the secret just before, ending its clause
  const ends = next === undefined || CLAUSE.has(next);
  const before = digitRuns(ws.slice(Math.max(0, first - 3), first));
  if (ends && isDigitTok(ws[first - 1] ?? '') && before.some((r) => r.length >= rule.minDigits)) {
    return true;
  }
  // "the password for the bank is hunter2": the secret may follow a short phrase and "is"
  const is = ws.slice(after, after + 6).findIndex((x) => x === 'is' || x === 'was');
  return secretAt(ws, after, rule) || (is > 0 && secretAt(ws, after + is, rule));
}

/** The credential `text` holds, by shape, or null. Pure. */
export function credentialInText(text: string): ShapeCategory | null {
  if (KEY_PREFIX.test(text)) return 'api-key';
  if (IBAN.test(text) || SSN.test(text)) return 'id-number';
  const ws = tokens(text);
  if (cardNumberIn(ws)) return 'id-number';
  if (securityAnswer(ws)) return 'security-answer';
  const joined = ws.join(' ');
  const starts = offsets(ws);
  for (const rule of RULES) {
    for (const m of joined.matchAll(rule.words)) {
      const first = starts.indexOf(m.index + (m[0].startsWith(' ') ? 1 : 0));
      if (first >= 0 && ruleHit(ws, rule, first, m[0].trim().split(' ').length)) {
        return rule.category;
      }
    }
  }
  return null;
}
