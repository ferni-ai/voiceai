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

const { words, stripped, CREDENTIAL_WORDS, SET_TO, DIGIT_WORDS, TEENS, TENS } = VOCABULARY;

export const REDACTED = '[redacted]';

interface Token extends Span {
  norm: string;
}

/** `words`, with each word's place in the text. */
function tokens(text: string): Token[] {
  return [...text.matchAll(/\bwi[\s_-]?fi\b|[\p{L}\p{M}\p{N}'’]+/giu)].flatMap((m) => {
    const norm = words(m[0]).join('');
    const start = m.index ?? 0;
    return norm ? [{ norm, start, end: start + m[0].length }] : [];
  });
}

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

/**
 * The last word of the credential whose key starts at toks[i] and ends before toks[k], or
 * -1. A word secret ("hunter2", "Blue Horse 77") needs "is" or ":" before it, or a digit,
 * so "I forgot my password again" keeps "again".
 */
function credentialEnd(text: string, toks: readonly Token[], i: number, k: number): number {
  const at = (j: number): Token => toks[j] ?? { norm: '', start: 0, end: 0 };
  const sentenceBreak = (j: number): boolean =>
    /[.!?;\n]/.test(text.slice(at(j - 1).end, at(j).start));
  const key = text.slice(at(i).start, at(k - 1).end);
  const connected = isConnected(text, toks, i, k);
  let hit = -1;
  let secretSeen = false;
  for (let j = k; j < Math.min(toks.length, k + MAX_VALUE_WORDS); j++) {
    const w = at(j).norm;
    if (j > k && sentenceBreak(j)) break;
    if (secretSeen && startsKey(toks, j)) break; // the next credential
    if (hit >= 0 && ENDS_SECRET.has(w) && !isDigitWord(at(j + 1).norm)) break;
    if (!inKey(w)) secretSeen = true;
    const value = text.slice(at(k).start, at(j).end);
    const category = credentialCategory(key, value);
    const wordSecret = category === 'password' || category === 'security-answer';
    if (category !== null && (!wordSecret || connected || /\d/.test(value))) hit = j;
  }
  return hit;
}

/** The text with every credential the predicate finds replaced by `[redacted]`. Ignores the flag. */
function redactText(text: string): string {
  // Shaped secrets first, so a card number can't stretch a phrase around it
  const shaped = shapedSecrets(text);
  const base = shaped.length > 0 ? replaceSpans(text, shaped) : text;
  const toks = tokens(base);
  const spans: Span[] = [];
  for (let i = 0; i < toks.length; i++) {
    if (!startsKey(toks, i)) continue;
    let k = i + 1;
    while (
      k < toks.length &&
      inKey(toks[k]?.norm ?? '') &&
      !/[.!?;\n]/.test(base.slice(toks[k - 1]?.end, toks[k]?.start))
    )
      k++;
    const hit = credentialEnd(base, toks, i, k);
    if (hit < 0) continue;
    // The secret: from the first word that isn't a credential word or filler ("changed to x": x)
    const value = toks.slice(k, hit + 1);
    const to = value.findIndex((t, n) => t.norm === 'to' && SET_TO.has(value[n - 1]?.norm ?? ''));
    const secret = value.slice(to + 1).filter((t) => !inKey(t.norm) && t.norm !== 'redacted');
    const first = secret[0];
    const last = secret[secret.length - 1];
    if (first !== undefined && last !== undefined)
      spans.push({ start: first.start, end: last.end });
    i = hit;
  }
  return spans.length > 0 ? replaceSpans(base, spans) : base;
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
