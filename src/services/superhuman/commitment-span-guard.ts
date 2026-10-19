/**
 * What the after-call commitment judge (#1985, COMMITMENT_SINGLE_WRITER) may
 * store, decided by construction rather than by lists of what to catch.
 *
 * Review on #1985 and on this guard kept finding the same thing: a list of
 * words that mark money, numbers or "plain" text always misses a language
 * ("mandale a Kyle quinientos", "пятьсот рублей", "a billion"). So nothing
 * here decides that an item is safe to send. Every kept commitment is raised
 * only on a call, and a reader may text one only after the caller said yes to
 * a reminder for it, in the call. This guard does two things:
 *
 * - Extractive only. A statement must be the caller's own words: a whole-word
 *   span of one caller turn (after NFKC, case folding and whitespace
 *   collapsing) that cuts no word and no number ("$5" is not a span of
 *   "$5,000", "$5 thousand" or "$5 000"). Its quote is that span, and a
 *   person, if any, is a span of a caller turn too. Nothing the model writes
 *   itself survives: no "five thousand" for "fifty", no payee nobody named.
 * - Secrets dropped, not redacted. An item holding four or more digits in all,
 *   however they are split up ("42 then 79", "the combo is 12:34"), is not
 *   stored, unless its only number is one money amount of at most seven
 *   digits with a currency sign or word ("$1,450"). Digits in a time or date
 *   count too, unless it reads as one ("at 3:30", "on March 3", "5pm"), for
 *   at most two of them, and only when nothing else in the item is a number;
 *   a bare ordinal ("the 41st") counts. A credential word drops an item too.
 *
 * Known limits. The secret drop is defence in depth, not a number parser:
 * number words count as digits only as far as the lists below go (a few
 * languages, the common words), and digits said any other way, or in any
 * other language, are not caught. The safeguards that do not depend on it
 * are that a kept commitment is only ever raised on a call, and texted only
 * after the caller says yes to a reminder for it. Accepted too: a span can
 * leave out a negation ("not going to wire $900" gives "wire $900").
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

/**
 * Number words and the digits each stands for, so "four two seven nine",
 * "forty one eleven" and "twenty twenty four" count as the codes they are.
 * Best effort: the languages listed, no more.
 */
const NUMBER_WORDS = new Map<string, number>([
  ...'zero oh one two three four five six seven eight nine cero uno dos tres cuatro cinco seis siete ocho nueve zéro un une deux trois quatre cinq six sept huit neuf null eins zwei drei vier fünf sechs sieben acht neun um dois três sete oito nove due tre quattro cinque sei sette otto один два три четыре пять шесть семь восемь девять quatro'
    .split(' ')
    .map((w): [string, number] => [w, 1]),
  ...'ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fourty fifty sixty seventy eighty ninety hundred dozen diez once doce trece catorce quince veinte veinticinco treinta cuarenta cincuenta sesenta setenta ochenta noventa cien ciento dix onze douze treize quatorze quinze seize vingt trente quarante cinquante soixante cent zehn elf zwölf zwanzig dreißig vierzig fünfzig sechzig siebzig achtzig neunzig hundert dez doze dezesseis vinte trinta quarenta cinquenta sessenta cem dieci undici dodici venti trenta quaranta cinquanta sessanta cento десять двадцать тридцать сорок пятьдесят сто dieciséis dieciseis diecisiete diecinueve veintiuno dieciocho dezoito oitenta neunzehn siebzehn diciannove settanta девятнадцать семнадцать'
    .split(' ')
    .map((w): [string, number] => [w, 2]),
  ...'doscientos trescientos cuatrocientos quinientos seiscientos setecientos ochocientos novecientos quinhentos пятьсот'
    .split(' ')
    .map((w): [string, number] => [w, 3]),
  ...'thousand grand mil mille tausend тысяча тысячи тысяч'
    .split(' ')
    .map((w): [string, number] => [w, 3]),
  ...'million millions millón millones milliard миллион'
    .split(' ')
    .map((w): [string, number] => [w, 6]),
  ...'billion billions'.split(' ').map((w): [string, number] => [w, 9]),
]);
/** Words that repeat the digit after them: "double four" is 44, "triple one" 111. */
const MULTIPLIER = new Map<string, number>([
  ...'double doble doppel doppio dupla'.split(' ').map((w): [string, number] => [w, 2]),
  ...'triple triplo tripla dreifach'.split(' ').map((w): [string, number] => [w, 3]),
]);
/** What a number may run on into, past a space: "$5 thousand", "$5 k", "$5 000". */
const RUNS_ON = /^[\s'\u00a0\u2009\u202f]*(?:\p{N}|(?:k|m|mm|bn)(?![\p{L}\p{N}]))/u;
const nextWord = (rest: string): string => rest.match(/^[^\p{L}\p{N}]*([\p{L}]+)/u)?.[1] ?? '';

/**
 * Whether `span` is a whole-word run of `turn` that cuts no number: "500 to
 * kyle" is not in "1500 to kyle", nor "$5" in "$5,000", "$1.5 million",
 * "$5 thousand" or "$5'000".
 */
export function isSpanOf(span: string, turn: string): boolean {
  const s = spanKey(span);
  const t = canon(turn);
  if (!s) return false;
  const cuts = (edge: string, beyond: string): boolean =>
    WORDY.test(edge) || (/[,.:]/.test(edge) && /\p{N}/u.test(beyond));
  for (let i = t.indexOf(s); i !== -1; i = t.indexOf(s, i + 1)) {
    const end = i + s.length;
    if (cuts(t[i - 1] ?? '', t[i - 2] ?? '') || cuts(t[end] ?? '', t[end + 1] ?? '')) continue;
    // A span ending on a number may not leave the rest of it behind.
    const rest = t.slice(end);
    if (/\p{N}$/u.test(s) && (RUNS_ON.test(rest) || NUMBER_WORDS.has(nextWord(rest)))) continue;
    if (NUMBER_WORDS.has(s.split(' ').at(-1) ?? '') && NUMBER_WORDS.has(nextWord(rest))) continue;
    return true;
  }
  return false;
}

const MONTH =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const WEEKDAY = '(?:mon|tue|tues|wed|wednes|thu|thur|thurs|fri|sat|satur|sun)(?:day)?';
/** "9am", "9:30 p.m.", "14:30". */
const CLOCK =
  /(?<!\p{N})\d{1,2}(?::[0-5]\d)?\s?(?:a\.?m\.?|p\.?m\.?)(?![\p{L}\p{N}])|(?<![\p{N}:])(?:[01]?\d|2[0-3]):[0-5]\d(?![\p{N}:])/giu;
/** "Friday the 13th", "March 3", "3rd of June": a day of the month, 1 to 31, next to a month or weekday. A bare "the 15th" counts its digits. */
const DAY = '(?:3[01]|[12]\\d|0?[1-9])';
const DAY_OF_MONTH = new RegExp(
  `(?<![\\p{L}])(?:${MONTH}|${WEEKDAY})\\.?\\s+(?:the\\s+)?${DAY}(?:st|nd|rd|th)?(?![\\p{N}])|(?<!\\p{N})${DAY}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTH})(?![\\p{L}])`,
  'giu'
);
/** Words that make a time or date read as one: "at 3:30", "on the 15th", "by March 3". */
const INTRO = /(?<![\p{L}])(?:at|by|on|until|till|before|after|from)\s+(?:the\s+)?$/iu;
/** What may sit between two listed times: "at 3:30 and 5:30", "at 9, or 10". */
const LIST = /^\s*,?\s*(?:and|or|then|&)\s+(?:at\s+)?$/iu;
/** At most this many time or date shapes are set aside; past that their digits count. */
const MAX_SHAPES = 2;
/** One money amount, at most 7 digits: "$40", "1,450", "$1,000,000", "$12.50". */
const AMOUNT = /^\$?(?:(?:0|[1-9]\d{0,2})(?:,\d{3})?|[1-9],\d{3},\d{3})(?:\.\d\d)?$/;
/** A number as written: digits of any script, with the commas and points inside it. */
const NUMBER = /\$?\p{N}(?:[\p{N},.]*\p{N})?/gu;
/** A currency sign or word next to a number makes it an amount rather than a code. */
const CURRENCY =
  /\p{Sc}|(?<![\p{L}])(?:dollars?|bucks?|usd|cents?|euros?|pesos?|pounds?|quid|yen|rupees?|reais|dólares?|francs?|lire|libras?|рублей|рубля|рубль)(?![\p{L}])/iu;
/** A suffix that multiplies the number before it: "5k" is four digits, not one. */
const MAGNITUDE = /\p{N}\s?(k|m|mm|bn|grand)(?![\p{L}])/giu;

/**
 * Four or more digits in all (number words, multipliers and magnitudes
 * counted), unless the only number is one money amount. A time or date
 * counts as well unless it reads as one ("at 3:30", "5pm"), only two are set
 * aside, and none at all when anything else in the item is a number.
 */
/** Digits said as words or magnitudes: "four one" is 2, "double four" 2, "5k" 3. */
function spokenDigits(masked: string): number {
  let spoken = 0;
  const said = masked.split(/[^\p{L}]+/u);
  for (let i = 0; i < said.length; i++) {
    const n = NUMBER_WORDS.get(said[i]) ?? 0;
    // "double four" is two digits and "triple four" three.
    spoken += n * (n > 0 ? (MULTIPLIER.get(said[i - 1] ?? '') ?? 1) : 1);
  }
  for (const m of masked.matchAll(MAGNITUDE)) spoken += m[1] === 'k' || m[1] === 'grand' ? 3 : 6;
  return spoken;
}
function tooManyDigits(text: string): boolean {
  let shapes = 0;
  let shapeDigits = 0;
  // One per pass: each pass reads its own string, so "listed" looks back only within it.
  // A date named by its month or weekday ("May 3") always reads as one; a time needs a cue.
  const setAside = (always = false) => {
    let lastEnd = -1;
    return (m: string, at: number, all: string) => {
      // "at 3:30 and 5:30": a time listed right after one that read as a time reads as one too.
      const listed = lastEnd >= 0 && LIST.test(all.slice(lastEnd, at));
      const reads = always || /[ap]\.?m\.?$/i.test(m) || INTRO.test(all.slice(0, at)) || listed;
      if (!reads || ++shapes > MAX_SHAPES) return m;
      shapeDigits += (m.match(/\p{N}/gu) ?? []).length;
      lastEnd = at + m.length;
      return '§';
    };
  };
  const masked = canon(text).replace(CLOCK, setAside()).replace(DAY_OF_MONTH, setAside(true));
  const numbers = [...masked.matchAll(NUMBER)].map((m) => m[0]);
  const spoken = spokenDigits(masked);
  const oneAmount =
    numbers.length === 1 &&
    spoken === 0 &&
    AMOUNT.test(numbers[0]) &&
    (numbers[0].startsWith('$') || CURRENCY.test(masked));
  const other = (masked.match(/\p{N}/gu) ?? []).length + spoken;
  // Times and dates are set aside only when nothing else in the item is a number:
  // "at 3:30 and 5:30" is kept, "at 12:34 and at 23:45 then 567" is not.
  return other > 0 && !oneAmount && other + shapeDigits >= 4;
}

/** Whole-word, in any script. */
const words = (list: string): RegExp =>
  new RegExp(`(?<![\\p{L}\\p{N}])(?:${list})(?![\\p{L}\\p{N}])`, 'iu');

/**
 * Words that name a credential, in English, Spanish, French, German,
 * Portuguese, Italian and Russian. "pin" and "code" count only when they read
 * as one ("my PIN is", "code: 4417"), not "pin the poster up" or "code the site".
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

/** Whether a field must not be stored at all: too many digits, or a credential. */
export function hasSecret(text: string): boolean {
  return tooManyDigits(text) || CREDENTIAL.test(canon(text));
}

/** The fields of a judged commitment this reads. */
export interface SpanItem {
  statement: string;
  quote?: string;
  person?: string;
}

export type DropReason =
  'malformed' | 'not-a-caller-span' | 'quote-not-the-span' | 'person-not-said' | 'secret';
/** Kept or not. Never "safe to send": that is only ever the caller's yes, asked in the call. */
export type Screened = { keep: true } | { keep: false; reason: DropReason };

/**
 * Whether a judged commitment may be stored. `callerTurns` are the caller's
 * turns only, never Ferni's. Never throws: anything it can't read is dropped.
 */
export function screenCommitment(item: SpanItem, callerTurns: readonly string[]): Screened {
  try {
    return screen(item, callerTurns);
  } catch {
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
  if (typeof statement !== 'string' || !WORDY.test(statement))
    return { keep: false, reason: 'malformed' };
  if (!optionalText(quote) || !optionalText(person)) return { keep: false, reason: 'malformed' };
  const q = quote as string | undefined;
  const who = person as string | undefined;
  if (!turns.some((t) => isSpanOf(statement, t)))
    return { keep: false, reason: 'not-a-caller-span' };
  // The quote must be the statement itself, so a secret can't ride in a quote that differs from it.
  if (q && spanKey(q) !== spanKey(statement)) return { keep: false, reason: 'quote-not-the-span' };
  if (who && !turns.some((t) => isSpanOf(who, t)))
    return { keep: false, reason: 'person-not-said' };
  if ([statement, q ?? '', who ?? ''].some(hasSecret)) return { keep: false, reason: 'secret' };
  return { keep: true };
}
