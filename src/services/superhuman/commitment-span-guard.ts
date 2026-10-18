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
 * - Plain or sensitive. An item is plain only when every digit in it has an
 *   allowlisted shape (a clock time, a day of the month next to a month or
 *   weekday, one money amount standing alone) and it names no payment rail
 *   or credential in any of the languages listed. Everything else is
 *   sensitive, which only a call may raise, never a text, brief or push.
 * - Dropped, not redacted. A field holding a run of four or more digits in
 *   no allowlisted shape, or a credential word, is not stored at all.
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
  for (let i = t.indexOf(s); i !== -1; i = t.indexOf(s, i + 1)) {
    const before = i === 0 ? '' : t[i - 1];
    const after = t[i + s.length] ?? '';
    if (!WORDY.test(before) && !WORDY.test(after)) return true;
  }
  return false;
}

const MONTH =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const WEEKDAY = '(?:mon|tue|tues|wed|wednes|thu|thur|thurs|fri|sat|satur|sun)(?:day)?';
/** "9am", "9:30 p.m.", "14:30". */
const CLOCK =
  /(?<!\p{N})\d{1,2}(?::[0-5]\d)?\s?(?:a\.?m\.?|p\.?m\.?)(?![\p{L}\p{N}])|(?<![\p{N}:])(?:[01]?\d|2[0-3]):[0-5]\d(?![\p{N}:])/giu;
/** "Friday the 13th", "March 3", "3rd of June". */
const DAY_OF_MONTH = new RegExp(
  `(?<![\\p{L}])(?:${MONTH}|${WEEKDAY})\\.?\\s+(?:the\\s+)?\\d{1,2}(?:st|nd|rd|th)?(?![\\p{N}])|(?<!\\p{N})\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTH})(?![\\p{L}])`,
  'giu'
);
/** One money amount or small count: "$40", "1,450", "$12.50", "3". */
const AMOUNT = /^\$?\d{1,3}(?:,\d{3})*(?:\.\d\d)?$/;
/** A number as written: digits of any script, with the commas and points inside it. */
const NUMBER = /\$?\p{N}(?:[\p{N},.]*\p{N})?/gu;
/** Digits said as words, a run of which is a number said aloud ("four two seven nine"). */
const DIGIT_WORDS = new Set(
  'zero oh one two three four five six seven eight nine cero uno dos tres cuatro cinco seis siete ocho nueve zéro un deux trois quatre cinq six sept huit neuf null eins zwei drei vier fünf sechs sieben acht neun um dois três quatro cinco seis sete oito nove due tre quattro cinque sei sette otto'.split(
    ' '
  )
);

interface Digits {
  /** Every digit is in an allowlisted shape. */
  plain: boolean;
  /** A run of four or more digits in no allowlisted shape: how account, card and PIN numbers look. */
  secret: boolean;
}

/** The digits of a text, judged by shape. Neighbouring numbers ("555-0142", "4111 1111") are one run. */
function digitsOf(text: string): Digits {
  const masked = canon(text).replace(CLOCK, '§').replace(DAY_OF_MONTH, '§');
  const numbers = [...masked.matchAll(NUMBER)];
  let plain = true;
  let secret = false;
  let run = { digits: 0, shaped: true, end: -1 };
  const close = () => {
    if (run.digits >= 4 && !run.shaped) secret = true;
  };
  for (const m of numbers) {
    const n = m[0];
    const shaped = AMOUNT.test(n);
    const digits = (n.match(/\p{N}/gu) ?? []).length;
    const between = run.end < 0 ? 'x' : masked.slice(run.end, m.index);
    if (run.end >= 0 && !/\p{L}/u.test(between)) {
      // Next to the last number with only spaces or punctuation between: one run, never plain.
      run = { digits: run.digits + digits, shaped: false, end: m.index + n.length };
      plain = false;
    } else {
      close();
      run = { digits, shaped, end: m.index + n.length };
      if (!shaped) plain = false;
    }
  }
  close();
  const said = masked.split(/[^\p{L}]+/u);
  for (let i = 0, k = 0; i < said.length; i++) {
    k = DIGIT_WORDS.has(said[i]) ? k + 1 : 0;
    if (k >= 4) secret = true;
  }
  return { plain: plain && !secret, secret };
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
    'pin( number| code)?(?=\\s*(is|was|es|est|ist|é|è|:|=|\\p{N}))|(my|your|the|card|bank|debit) pin',
    'code(?=\\s*(is|was|es|est|ist|é|è|:|=|\\p{N}))',
    'contraseñas?|clave( secreta)?|código( de (verificación|seguridad|acceso))?',
    'mot de passe|code (secret|pin|de vérification)|identifiants?',
    'passwort|kennwort|geheimzahl|pin-code',
    'senhas?|código de verificação',
    "parola d'ordine|codice( segreto| di verifica| pin)?",
  ].join('|')
);

/** Words that name a way to move money or an account, in the same languages. */
const PAYMENT = words(
  [
    'venmo|zelle|paypal|cash ?app|wire( transfer)?|bank transfer|(bank|checking|savings) account|account number|routing( number)?|iban|swift|bic|(credit|debit) card|card number|bitcoin|btc|crypto|ethereum|gift ?cards?',
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

export type DropReason = 'not-a-caller-span' | 'quote-not-the-span' | 'person-not-said' | 'secret';
export type Screened = { keep: true; sensitive: boolean } | { keep: false; reason: DropReason };

/**
 * Whether a judged commitment may be stored, and if so whether it is
 * sensitive. `callerTurns` are the caller's turns only, never Ferni's.
 */
export function screenCommitment(item: SpanItem, callerTurns: readonly string[]): Screened {
  const fields = [item.statement, item.quote ?? '', item.person ?? ''];
  if (!callerTurns.some((t) => isSpanOf(item.statement, t)))
    return { keep: false, reason: 'not-a-caller-span' };
  if (item.quote && spanKey(item.quote) !== spanKey(item.statement))
    return { keep: false, reason: 'quote-not-the-span' };
  if (item.person && !callerTurns.some((t) => isSpanOf(item.person ?? '', t)))
    return { keep: false, reason: 'person-not-said' };
  if (fields.some(hasSecret)) return { keep: false, reason: 'secret' };
  return { keep: true, sensitive: !fields.every((f) => f === '' || isPlain(f)) };
}
