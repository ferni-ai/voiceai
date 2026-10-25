/**
 * Credentials in free text the caller said or typed (#2367, #2385): a transcript turn, a
 * summary, a journal entry, a commitment. The secret is replaced by `[redacted]` and every
 * other word kept. It asks the same predicate facts are dropped by (`credentialCategory`), so
 * "my password is hunter2" loses "hunter2" and "I forgot my password" stays as said.
 * SPOKEN_CREDENTIAL_FILTER is off by default; set it on to redact.
 *
 * @module memory/credential-redaction
 */

import {
  credentialCategory,
  IDENTIFIER_WORDS,
  shapedSecrets,
  spokenCredentialFilterOn,
  VOCABULARY,
  type Span,
} from './spoken-credential.js';
import { spokenDigits } from './spoken-digits.js';

const { words, stripped, CREDENTIAL_WORDS, SET_TO, DIGIT_WORDS, TEENS, TENS } = VOCABULARY;

export const REDACTED = '[redacted]';

interface Token extends Span {
  norm: string;
}

/** "pin's", "code's": the credential word, then "is" ("my pin's 1234"); "mother's" stays possessive. */
const CONTRACTED = /^(.+)['’](s|re|m)$/u;
const CONTRACTION = { s: 'is', re: 'are', m: 'am' } as const;

/** `words`, with each word's place in the text. */
function tokens(text: string): Token[] {
  return [...text.matchAll(/\bwi[\s_-]?fi\b|[\p{L}\p{M}\p{N}'’]+/giu)].flatMap((m) => {
    const start = m.index ?? 0;
    const c = CONTRACTED.exec(m[0]);
    const base = c ? words(c[1] ?? '').join('') : '';
    if (c && (c[2] !== 's' || CREDENTIAL_WORDS.has(base))) {
      const cut = start + (c[1] ?? '').length;
      const verb = CONTRACTION[(c[2] ?? 's').toLowerCase() as keyof typeof CONTRACTION];
      return [
        { norm: base, start, end: cut },
        { norm: verb, start: cut, end: start + m[0].length },
      ];
    }
    const norm = words(m[0]).join('');
    return norm ? [{ norm, start, end: start + m[0].length }] : [];
  });
}

/** The text the predicate reads, with "pin's" as "pin is". */
const expand = (text: string): string =>
  text.replace(/(\p{L}+)['’](s|re|m)\b/gu, (all, w: string, c: string) =>
    c !== 's' || CREDENTIAL_WORDS.has(w.toLowerCase())
      ? `${w} ${CONTRACTION[c.toLowerCase() as keyof typeof CONTRACTION]}`
      : all
  );

/** A credential phrase starts here: a credential or identifier word, or "one time", "two factor". */
const NOT_A_START = new Set([
  'number',
  'no',
  'name',
  'key',
  'keys',
  'access',
  'personal',
  'session',
]);
function startsKey(toks: readonly Token[], i: number): boolean {
  const w = toks[i]?.norm ?? '';
  const next = toks[i + 1]?.norm ?? '';
  if (NOT_A_START.has(w)) return false;
  return (
    CREDENTIAL_WORDS.has(w) ||
    IDENTIFIER_WORDS.has(w) ||
    (w === 'one' && next === 'time') ||
    (w === 'two' && next === 'factor')
  );
}
const inKey = (w: string): boolean => stripped(w) || IDENTIFIER_WORDS.has(w);
const MAX_VALUE_WORDS = 10;

/** Each span replaced by `[redacted]`; overlapping spans merge. */
function replaceSpans(text: string, spans: Span[]): string {
  const merged: Span[] = [];
  for (const s of [...spans].sort((x, y) => x.start - y.start)) {
    const prev = merged[merged.length - 1];
    if (prev !== undefined && s.start <= prev.end) prev.end = Math.max(prev.end, s.end);
    else merged.push({ ...s });
  }
  // From the end, so earlier offsets stay true
  return merged.reduceRight((out, s) => out.slice(0, s.start) + REDACTED + out.slice(s.end), text);
}

/** After a secret, these end it unless a code goes on ("36 and 24"), not "hunter2 and my dog". */
const ENDS_SECRET = new Set('and but so because by if when or which that though anyway'.split(' '));
const CODE_GOES_ON = new Set(
  'right left turn then clockwise counterclockwise star pound hash'.split(' ')
);
const isDigitWord = (w: string): boolean =>
  /\d/.test(w) || DIGIT_WORDS.has(w) || TEENS.has(w) || TENS.has(w) || CODE_GOES_ON.has(w);
const CONNECTIVE = new Set(['is', 'was', 'are', 'its', 'equals']);

/** "password is", "password:", "pin=": the key is joined to what follows it. */
function isConnected(text: string, toks: readonly Token[], i: number, k: number): boolean {
  const between = text.slice(toks[i]?.start ?? 0, toks[k]?.start ?? text.length);
  return toks.slice(i, k).some((t) => CONNECTIVE.has(t.norm)) || /[:=]/.test(between);
}

/** A sentence ends at ! ? ; a line break, or a full stop before a space ("jen@example.com" goes on). */
const SENTENCE_END = /[!?;\n]|\.\s/;
const WORD_SECRETS = new Set<string>(['password', 'security-answer']);

interface Credential {
  /** The value's first and last word; hit -1 when there is no credential. */
  from: number;
  hit: number;
  category: string;
}

/**
 * The last word of the credential whose key is toks[i..k-1], or hit -1. A word secret
 * ("hunter2", "Blue Horse 77") needs "is" or ":" before it, or a digit, so "I forgot my
 * password again" keeps "again"; it never runs past a comma ("Garcia, she loved that").
 */
function credentialEnd(text: string, toks: readonly Token[], i: number, k: number): Credential {
  const at = (j: number): Token => toks[j] ?? { norm: '', start: 0, end: 0 };
  const gap = (j: number): string => text.slice(at(j - 1).end, at(j).start);
  const key = expand(text.slice(at(i).start, at(k - 1).end));
  const connected = isConnected(text, toks, i, k);
  const found: Credential = { from: k, hit: -1, category: '' };
  let secretSeen = false;
  for (let j = k; j < Math.min(toks.length, k + MAX_VALUE_WORDS); j++) {
    const w = at(j).norm;
    if (j > k && SENTENCE_END.test(gap(j))) break;
    if (secretSeen && startsKey(toks, j)) break; // the next credential
    if (found.hit >= 0 && ENDS_SECRET.has(w) && !isDigitWord(at(j + 1).norm)) break;
    if (found.hit >= 0 && gap(j).includes(',') && !isDigitWord(w)) break;
    if (!inKey(w)) secretSeen = true;
    const value = expand(text.slice(at(k).start, at(j).end));
    const category = credentialCategory(key, value);
    if (category !== null && (!WORD_SECRETS.has(category) || connected || /\d/.test(value))) {
      Object.assign(found, { hit: j, category });
    }
  }
  return found;
}

/** "my locker combo at the gym is 12-34-56": the key reaches its "is" a few words on. */
function bridged(text: string, toks: readonly Token[], i: number, k: number): Credential {
  for (let c = k; c < Math.min(toks.length, k + 5); c++) {
    const gap = text.slice(toks[c - 1]?.end, toks[c]?.start);
    if (SENTENCE_END.test(gap) || gap.includes(',') || startsKey(toks, c)) break;
    if (CONNECTIVE.has(toks[c]?.norm ?? '')) return credentialEnd(text, toks, i, c + 1);
  }
  return { from: k, hit: -1, category: '' };
}

/** "it is 4821, the code for the front door": a code just before the key that names it. */
const LEADS_TO_KEY = new Set(['the', 'its', 'thats', 'that', 'is', 'my', 'which', 'our']);
function codeBefore(text: string, toks: readonly Token[], i: number): Span | null {
  let d = i - 1;
  while (d >= 0 && LEADS_TO_KEY.has(toks[d]?.norm ?? '') && i - d < 4) d--;
  const code = toks[d];
  if (code === undefined || !/\d/.test(code.norm)) return null;
  let end = i + 1;
  while (
    end < toks.length &&
    end - i < 7 &&
    !SENTENCE_END.test(text.slice(toks[end - 1]?.end, toks[end]?.start))
  )
    end++;
  const key = text.slice(toks[i]?.start, toks[end - 1]?.end);
  return credentialCategory(key, code.norm) === null ? null : code;
}

/** What to redact of a credential found at toks[k..hit]. */
function secretSpan(
  text: string,
  toks: readonly Token[],
  k: number,
  found: Credential
): Span | null {
  const value = toks.slice(k, found.hit + 1);
  const to = value.findIndex((t, n) => t.norm === 'to' && SET_TO.has(value[n - 1]?.norm ?? ''));
  const slash = text.lastIndexOf('/', value[value.length - 1]?.end ?? 0);
  let secret = value.slice(to + 1).filter((t) => t.norm !== 'redacted');
  // "jen@example.com / hunter2": the secret is what follows the slash
  if (found.category === 'password' && slash >= (value[0]?.start ?? 0)) {
    secret = secret.filter((t) => t.start > slash);
  } else if (!WORD_SECRETS.has(found.category)) {
    secret = secret.filter((t) => isDigitWord(t.norm)); // a code: its digits, not the words around it
  }
  const first = secret[0];
  const last = secret[secret.length - 1];
  return first !== undefined && last !== undefined ? { start: first.start, end: last.end } : null;
}

/** The text with every credential the predicate finds replaced by `[redacted]`. Ignores the flag. */
function redactText(text: string): string {
  // Number words as digits ("four one one one ..."), then shaped secrets masked in place
  // (same length, so offsets hold), so a card number can't stretch a phrase around it
  const spoken = spokenDigits(text);
  const shaped = shapedSecrets(spoken.text);
  const base = shaped.reduce(
    (t, s) => t.slice(0, s.start) + '#'.repeat(s.end - s.start) + t.slice(s.end),
    spoken.text
  );
  const toks = tokens(base);
  const spans: Span[] = [...shaped];
  for (let i = 0; i < toks.length; i++) {
    if (!startsKey(toks, i)) continue;
    let k = i + 1;
    while (
      k < toks.length &&
      inKey(toks[k]?.norm ?? '') &&
      !SENTENCE_END.test(base.slice(toks[k - 1]?.end, toks[k]?.start))
    )
      k++;
    let found = credentialEnd(base, toks, i, k);
    if (found.hit < 0) found = bridged(base, toks, i, k);
    if (found.hit < 0) {
      const code = codeBefore(base, toks, i);
      if (code !== null) spans.push(code);
      continue;
    }
    // A word secret is the whole clause after its "is": "the password is [my dog's name Biscuit]"
    const is = toks
      .slice(i, found.from)
      .map((t) => t.norm)
      .lastIndexOf('is');
    const from = WORD_SECRETS.has(found.category) && is >= 0 ? i + is + 1 : found.from;
    const span = secretSpan(base, toks, from, found);
    if (span !== null) spans.push(span);
    i = found.hit;
  }
  if (spans.length === 0) return text;
  return replaceSpans(
    text,
    spans.map((s) => spoken.original(s.start, s.end))
  );
}

/**
 * Free text the caller said or typed (a transcript turn, a summary, a journal entry, a
 * commitment), with each credential replaced by `[redacted]` and the rest kept. Facts with
 * a key are dropped whole instead (`withoutSpokenCredentials`). With
 * SPOKEN_CREDENTIAL_FILTER off (the default) the text is returned untouched.
 */
export function redactCredentials(text: string): string {
  if (typeof text !== 'string' || !text || !spokenCredentialFilterOn()) return text;
  return redactText(text);
}

/** Ids, urls and paths are never caller text, and a redaction would break them. */
const NOT_TEXT_KEY = /(?:^|_)(?:id|ids|uid|url|path)$|(?:Id|Ids|Url|Path)$/;

function redactWalk(value: unknown, key: string): unknown {
  if (NOT_TEXT_KEY.test(key)) return value;
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map((v) => redactWalk(v, ''));
  if (
    value !== null &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactWalk(v, k)]));
  }
  return value; // Dates, Timestamps, FieldValues, numbers
}

/**
 * A document about to be written, with `redactCredentials` applied to every string in its
 * plain objects and arrays (not ids or urls). Returns a copy; the input is not changed.
 */
export function redactCredentialsIn<T>(doc: T): T {
  if (!spokenCredentialFilterOn()) return doc;
  return redactWalk(doc, '') as T;
}

/**
 * Key → value attributes (an extracted entity's) without credentials: a value the key makes
 * a credential is dropped ("door_code": "4821"), and other strings are redacted.
 */
export function withoutCredentialAttributes(
  attributes: Record<string, unknown>
): Record<string, unknown> {
  if (!spokenCredentialFilterOn()) return attributes;
  return Object.fromEntries(
    Object.entries(attributes).flatMap(([key, value]) => {
      if (typeof value !== 'string') return [[key, value]];
      return credentialCategory(key, value) ? [] : [[key, redactText(value)]];
    })
  );
}
