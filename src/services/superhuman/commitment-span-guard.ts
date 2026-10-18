/**
 * What the after-call commitment judge (#1985, COMMITMENT_SINGLE_WRITER) may
 * store, decided by an allowlist instead of a denylist.
 *
 * Three rounds of review on #1985 found new bypasses each time: amounts in
 * words, inflated numbers, invented payees, other languages and number
 * formats all slipped past lists of what to catch. So this inverts it:
 *
 * - Extractive only. A commitment's statement must be the caller's own words:
 *   a whole-word span of one caller turn (after NFKC, case folding and
 *   whitespace collapsing). Its quote is that span, and a person, if any, is
 *   a span of a caller turn too. Nothing the model writes itself survives:
 *   no "five thousand" for "fifty", no payee nobody named.
 * - Plain only by construction. An item is plain only when it holds no
 *   digit, number word, currency sign or currency word at all, apart from
 *   up to two time or date shapes ("at 3:30", "on the 15th", "Friday").
 *   Money is never plain. Payment and credential words make an item
 *   sensitive too, as an extra layer. Sensitive items only a call may raise,
 *   never a text, brief or push.
 * - Dropped, not redacted. If an item holds four or more digits in all
 *   (number words count as their digits, and so do "5k" and "grand"),
 *   however they are split up, it is not stored, unless the only number in
 *   it is one money amount of at most seven digits ("$1,450"). A credential
 *   word drops it as well.
 *
 * Accepted, not fixed here: a span can leave out a negation ("not going to
 * wire $900" gives "wire $900", stored as sensitive, so only a call raises
 * it); a password with no digit in it is plain; and directive text the
 * caller said can be stored as plain. Readers must render commitments as
 * quoted data, never as instructions to a model.
 *
 * A library: nothing calls it yet. #1985's writer and readers adopt it.
 *
 * @module services/superhuman/commitment-span-guard
 */

/** NFKC, lower case, one space between words: how spans are compared. */
export function canon(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
}

const WORDY = /[\p{L}\p{N}]/u;

/** A span as compared: canonical, without the sentence's closing punctuation. */
const spanKey = (s: string): string => canon(s).replace(/[.!?,;:]+$/, '');

/** Whether `span` is a whole-word run of `turn` ("500 to kyle" is not in "1500 to kyle"). */
export function isSpanOf(span: string, turn: string): boolean {
  const s = spanKey(span);
  const t = canon(turn);
  if (!s) return false;
  // A span may not cut a word, nor a number: "$5" is not a span of "$5,000", nor "$1" of "$1.5 million".
  const cuts = (edge: string, beyond: string) =>
    WORDY.test(edge) || (/[,.]/.test(edge) && /\p{N}/u.test(beyond));
  for (let i = t.indexOf(s); i !== -1; i = t.indexOf(s, i + 1)) {
    const end = i + s.length;
    if (!cuts(t[i - 1] ?? '', t[i - 2] ?? '') && !cuts(t[end] ?? '', t[end + 1] ?? '')) return true;
  }
  return false;
}

const MONTH =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const WEEKDAY = '(?:mon|tue|tues|wed|wednes|thu|thur|thurs|fri|sat|satur|sun)(?:day)?';
/** "9am", "9:30 p.m.", "14:30". */
const CLOCK =
  /(?<!\p{N})\d{1,2}(?::[0-5]\d)?\s?(?:a\.?m\.?|p\.?m\.?)(?![\p{L}\p{N}])|(?<![\p{N}:])(?:[01]?\d|2[0-3]):[0-5]\d(?![\p{N}:])/giu;
/** "Friday the 13th", "March 3", "3rd of June", "the 15th": a day of the month, 1 to 31. */
const DAY = '(?:3[01]|[12]\\d|0?[1-9])';
const DAY_OF_MONTH = new RegExp(
  `(?<![\\p{L}])(?:${MONTH}|${WEEKDAY})\\.?\\s+(?:the\\s+)?${DAY}(?:st|nd|rd|th)?(?![\\p{N}])|(?<!\\p{N})${DAY}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTH})(?![\\p{L}])|(?<!\\p{N})${DAY}(?:st|nd|rd|th)(?![\\p{L}\\p{N}])`,
  'giu'
);
/** At most this many time or date shapes are set aside; past that ("11:11 11:11 11:11") their digits count. */
const MAX_SHAPES = 2;
/** One money amount, at most 7 digits: "$40", "1,450", "$1,000,000", "$12.50". */
const AMOUNT = /^\$?(?:(?:0|[1-9]\d{0,2})(?:,\d{3})?|[1-9],\d{3},\d{3})(?:\.\d\d)?$/;
/** A number as written: digits of any script, with the commas and points inside it. */
const NUMBER = /\$?\p{N}(?:[\p{N},.]*\p{N})?/gu;
/** Money said as a word or a sign, in any of the languages here. Never plain. */
const CURRENCY =
  /\p{Sc}|(?<![\p{L}])(?:dollars?|bucks?|usd|cents?|euros?|pesos?|pounds?|quid|grand|yen|rupees?|reais|dólares?|francs?|lire|kr|zł)(?![\p{L}])/iu;
/** A suffix that multiplies the number before it: "5k" is four digits of money, not one. */
const MAGNITUDE = /\p{N}\s?(k|m|mm|bn|grand)(?![\p{L}])/giu;
/**
 * Number words and the digits each stands for, so "four two seven nine",
 * "forty one eleven" and "twenty twenty four" count as the PINs they are.
 */
const NUMBER_WORDS = new Map<string, number>([
  ...'zero oh one two three four five six seven eight nine cero uno dos tres cuatro cinco seis siete ocho nueve zéro un une deux trois quatre cinq six sept huit neuf null eins zwei drei vier fünf sechs sieben acht neun um dois três sete oito nove due tre quattro cinque sei sette otto'
    .split(' ')
    .map((w): [string, number] => [w, 1]),
  ...'ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred diez veinte treinta cuarenta cincuenta cien ciento dix vingt trente quarante cinquante cent zehn zwanzig hundert dez vinte cem dieci venti cento'
    .split(' ')
    .map((w): [string, number] => [w, 2]),
  ...'thousand grand mil mille tausend'.split(' ').map((w): [string, number] => [w, 3]),
  ...'million millions millón millones'.split(' ').map((w): [string, number] => [w, 6]),
]);

interface Digits {
  /** No digit, number word or currency outside the allowlisted time and date shapes. */
  plain: boolean;
  /** Four or more digits in all (number words counted), unless they are one money amount. */
  secret: boolean;
}

/**
 * The number content of a text. Time and date shapes are set aside (at most
 * MAX_SHAPES of them); every other digit counts, wherever it is, so "42 then
 * 79" is the four-digit code it reads as, however the digits are split up.
 */
function digitsOf(text: string): Digits {
  let shapes = 0;
  const setAside = (m: string) => (++shapes <= MAX_SHAPES ? '§' : m);
  const masked = canon(text).replace(CLOCK, setAside).replace(DAY_OF_MONTH, setAside);
  const numbers = [...masked.matchAll(NUMBER)].map((m) => m[0]);
  const digits = (masked.match(/\p{N}/gu) ?? []).length;
  let spoken = 0;
  for (const w of masked.split(/[^\p{L}]+/u)) spoken += NUMBER_WORDS.get(w) ?? 0;
  for (const m of masked.matchAll(MAGNITUDE)) spoken += m[1] === 'k' || m[1] === 'grand' ? 3 : 6;
  const oneAmount =
    numbers.length === 1 &&
    spoken === 0 &&
    AMOUNT.test(numbers[0]) &&
    (numbers[0].startsWith('$') || CURRENCY.test(masked));
  const total = digits + spoken;
  return {
    plain: total === 0 && !CURRENCY.test(masked),
    secret: total >= 4 && !oneAmount,
  };
}

/** Whole-word, in any script. */
const words = (list: string): RegExp =>
  new RegExp(`(?<![\\p{L}\\p{N}])(?:${list})(?![\\p{L}\\p{N}])`, 'iu');

/**
 * Words that name a credential, in English, Spanish, French, German,
 * Portuguese and Italian. "pin" and "code" count only when they read as one
 * ("my PIN is", "code: 4417"), not "pin the poster up" or "code the site".
 */
const CREDENTIAL = words(
  [
    'passwords?|passcodes?|passwd|passphrase|otp|cvv2?|cvc|ssn|social security( number)?|seed phrase|recovery phrase|private key|2fa',
    '(verification|security|access|login|one[- ]time|pin|sms) code',
    "pin( number| code)?(?=('s)?\\s*(is|was|es|est|ist|é|è|:|=|\\p{N}))|(my|your|the|card|bank|debit) pin",
    "(code|pw|pass)(?=('s)?\\s*(is|was|es|est|ist|é|è|:|=|\\p{N}))",
    'contraseñas?|contrasenas?|clave( secreta)?|c[oó]digo( de (verificaci[oó]n|seguridad|acceso))?',
    'mot de passe|code (secret|pin|de vérification)|identifiants?',
    'passwort|kennwort|geheimzahl|pin-code',
    'senhas?|código de verificação',
    "parola d'ordine|codice( segreto| di verifica| pin)?",
    'пароль|пин-код',
  ].join('|')
);

/** Words that name a way to move money or an account, in the same languages. */
const PAYMENT = words(
  [
    'venmo|zelle|paypal|cash ?app|wire( transfer)?|bank transfer|(bank|checking|savings) account|account number|routing( number)?|iban|swift|bic|(credit|debit) card|card number|bitcoin|btc|crypto\\p{L}*|ethereum|gift ?cards?|apple pay|google pay|western union|moneygram',
    'transferencias?|transferir|cuenta( bancaria)?|número de cuenta|tarjeta|bizum',
    'virement|compte( bancaire)?|carte bancaire|rib|lydia',
    'überweisung|überweisen|konto(nummer)?|kreditkarte|bankkarte',
    'transferência|conta( bancária)?|cartão|pix',
    'bonifico|conto( corrente)?|carta di credito',
  ].join('|')
);

/** Whether a field must not be stored at all: a number in no allowlisted shape, or a credential. */
export function hasSecret(text: string): boolean {
  return digitsOf(text).secret || CREDENTIAL.test(canon(text));
}

/** Whether a text may surface on its own: allowlisted digits only, no payment rail or credential. */
export function isPlain(text: string): boolean {
  const t = canon(text);
  return digitsOf(t).plain && !CREDENTIAL.test(t) && !PAYMENT.test(t);
}

/** The fields of a judged commitment this reads. */
export interface SpanItem {
  statement: string;
  quote?: string;
  person?: string;
}

export type DropReason =
  'malformed' | 'not-a-caller-span' | 'quote-not-the-span' | 'person-not-said' | 'secret';
export type Screened = { keep: true; sensitive: boolean } | { keep: false; reason: DropReason };

/**
 * Whether a judged commitment may be stored, and if so whether it is
 * sensitive. `callerTurns` are the caller's turns only, never Ferni's.
 */
export function screenCommitment(item: SpanItem, callerTurns: readonly string[]): Screened {
  try {
    return screen(item, callerTurns);
  } catch {
    // Never throws: anything it can't read is not stored.
    return { keep: false, reason: 'malformed' };
  }
}

const optionalText = (x: unknown): boolean => x === undefined || typeof x === 'string';

function screen(item: SpanItem, callerTurns: readonly string[]): Screened {
  const { statement, quote, person } = item as {
    statement: unknown;
    quote: unknown;
    person: unknown;
  };
  const turns = Array.isArray(callerTurns) ? callerTurns.filter((t) => typeof t === 'string') : [];
  if (typeof statement !== 'string' || !/[\p{L}\p{N}]/u.test(statement)) return { keep: false, reason: 'malformed' }; // prettier-ignore
  if (!optionalText(quote) || !optionalText(person)) return { keep: false, reason: 'malformed' };
  const q = quote as string | undefined;
  const who = person as string | undefined;
  if (!turns.some((t) => isSpanOf(statement, t)))
    return { keep: false, reason: 'not-a-caller-span' };
  // The quote must be the statement itself, so a secret can't ride in a quote that differs from it.
  if (q && spanKey(q) !== spanKey(statement)) return { keep: false, reason: 'quote-not-the-span' };
  if (who && !turns.some((t) => isSpanOf(who, t)))
    return { keep: false, reason: 'person-not-said' };
  const fields = [statement, q ?? '', who ?? ''];
  if (fields.some(hasSecret)) return { keep: false, reason: 'secret' };
  return { keep: true, sensitive: !fields.every((f) => f === '' || isPlain(f)) };
}
