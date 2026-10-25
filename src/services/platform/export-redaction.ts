/**
 * What leaves in a "Take your story" file: stored values made plain JSON, with secrets
 * removed at every depth (user-records-export.ts decides which stores are read).
 *
 * @module services/platform/export-redaction
 */

import { DocumentReference, Timestamp } from 'firebase-admin/firestore';
import { PROFILE_TOKEN_FIELDS } from '../../utils/token-at-rest.js';

/**
 * What a credential is called, judged word by word (#2366). A field name is split into
 * words (camelCase, snake_case, kebab-case, dots, spaces and digits all split; NFKC first,
 * so full-width letters and a zero-width space change nothing) and each word is made
 * singular, so linkedInTokens, fcm_tokens and ACCESS-TOKEN all hold the word "token".
 * Nothing is matched inside a word: hashtags, keystone, author and pinned are ordinary.
 *
 * A name is a credential's when:
 * 1. any word is a CREDENTIAL_WORD (token, secret, password, oauth, cookie, ...), or two
 *    adjacent words make a CREDENTIAL_PAIR (api key, verification code, push subscription);
 * 2. it is one SHORT_WORD and nothing else (pin, code, key, salt, hash, auth, nonce, ...):
 *    each is a credential alone but an ordinary word beside others (zipCode, contentHash,
 *    authMethod, accessLevel, endpoint_of_trip);
 * 3. it is a profile's token map (PROFILE_TOKEN_FIELDS).
 * KEPT_NAMES lists the known names that rule 1 would misread as a credential.
 * Session references (sessionId, sessionIds, firstSessionId, session_id) match no rule: they
 * name the call a record came from, not a sign-in.
 */
const CREDENTIAL_WORDS = new Set([
  'token',
  'secret',
  'password',
  'passwd',
  'passcode',
  'passphrase',
  'credential',
  'apikey',
  'privatekey',
  'oauth',
  'webauthn',
  'passkey',
  'cookie',
  'authorization',
  'bearer',
  'jwt',
  'otp',
  'totp',
  'p256dh',
  // the pairs below, run together as one lower-case word (accesstoken, apikey)
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'pushtoken',
  'sessiontoken',
  'pushsubscription',
  'verificationcode',
  'recoverycode',
  'backupcode',
  'authcode',
  'pincode',
  'secretkey',
  'signingkey',
  'encryptionkey',
  'clientkey',
  'sessionkey',
  'accesskey',
]);
/** Second word -> the first words that make the pair a credential's name */
const CREDENTIAL_PAIRS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['code', new Set(['verification', 'recovery', 'backup', 'auth', 'authorization', 'otp', 'pin'])],
  ['token', new Set(['refresh', 'access', 'id', 'push', 'session'])],
  [
    'key',
    new Set(['api', 'private', 'secret', 'signing', 'encryption', 'client', 'session', 'access']),
  ],
  ['subscription', new Set(['push'])],
  ['hash', new Set(['password', 'pin'])],
  ['auth', new Set(['key'])], // a web-push subscription's keys.auth
]);
/** Credentials only as the whole name: each is also an ordinary word beside others */
const SHORT_WORDS = new Set([
  'pin',
  'code',
  'key',
  'salt',
  'hash',
  'auth',
  'nonce',
  'mfa',
  'signature',
  'sig',
  'access',
  'refresh',
  'endpoint',
]);
/** Names rule 1 misreads, normalised (lower case, separators removed); each one is tested */
const KEPT_NAMES = new Set([
  'favoritecookie',
  'saltintake',
  'hashbrowns',
  'tokencount',
  'maxtokens',
  'sessionid',
]);
const PROFILE_TOKEN_NAMES: ReadonlySet<string> = new Set(PROFILE_TOKEN_FIELDS);

function normaliseKey(key: string): string {
  return key
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** tokens -> token, cookies -> cookie, hashes -> hash; access and pass stay */
function singular(word: string): string {
  if (/(ss|sh|ch|x)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/**
 * The words of a name, singular: split at case and separators, and split again at digits
 * too (fcm2Token), each split checked on its own so adjacent words stay adjacent
 */
function nameSplits(key: string): string[][] {
  const spaced = key
    .normalize('NFKC')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase();
  return [/[^a-z0-9]+/, /[^a-z]+/].map((at) => spaced.split(at).filter(Boolean).map(singular));
}

function holdsCredentialWord(words: readonly string[]): boolean {
  return words.some(
    (word, i) => CREDENTIAL_WORDS.has(word) || CREDENTIAL_PAIRS.get(word)?.has(words[i - 1] ?? '')
  );
}

/** Rules 1 and 3: a credential's name wherever it appears, data maps included */
function isCredentialName(key: string): boolean {
  if (PROFILE_TOKEN_NAMES.has(key)) return true;
  if (KEPT_NAMES.has(normaliseKey(key))) return false;
  return nameSplits(key).some(holdsCredentialWord);
}

/** Rule 2: one short word and nothing else */
function isShortCredentialName(key: string): boolean {
  const [words] = nameSplits(key);
  return words?.length === 1 && SHORT_WORDS.has(words[0] ?? '');
}

export function isSecretField(key: string): boolean {
  return isCredentialName(key) || isShortCredentialName(key);
}

/**
 * A field name in a data map (keys the person or the model chose): rules 1 and 3 only, so
 * an attribute "pin" or "code" is data but "bankToken" or "apiKey" is still dropped.
 */
export function isSecretDataMapKey(key: string): boolean {
  return isCredentialName(key);
}

/** Values that are credentials whatever their key says (bearer, JWT, Google, Stripe, push) */
const SECRET_VALUES = [
  /^\s*bearer\s+\S/i,
  /^ya29\./,
  /^eyJ[\w-]{8,}\.[\w-]{8,}\./,
  /^(sk|rk)_(live|test)_/,
  /^[\w-]{20,}:APA91b/, // FCM registration token
  /^Expo(nent)?PushToken\[/,
  /^AIza[\w-]{30,}/,
  /^(xox[abpr]|gh[pousr])[-_]/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[\w.-]+\.notify\.windows\.com)\//i,
];

export function isSecretValue(value: string): boolean {
  return SECRET_VALUES.some((pattern) => pattern.test(value));
}

export type Plain = string | number | boolean | null | Plain[] | { [key: string]: Plain };

const DROP = Symbol('drop');

/**
 * How deep a value is followed, counting a JSON string as one level. Firestore stores at
 * most 20 levels of maps; JSON kept as a string can nest without limit, so past this the
 * rest is left out rather than walked (and a crafted value can't exhaust the stack).
 */
export const MAX_FIELD_DEPTH = 32;

/**
 * What parsing a JSON string costs: charged to the request's byte budget before the parse
 * (ExportBudget implements this), and a string longer than maxJsonStringBytes is left out
 * unparsed, since a secret inside it couldn't be filtered.
 */
export interface ParseMeter {
  reserveBytes(bytes: number): void;
  readonly limits: { readonly maxJsonStringBytes: number };
}

/** For callers outside an export request (tests): no budget, the same per-string limit */
const UNMETERED: ParseMeter = {
  reserveBytes: () => undefined,
  limits: { maxJsonStringBytes: 64 * 1024 },
};

/** A Firestore VectorValue from any copy of the SDK (firebase-admin's or our own). */
function isVector(value: unknown): boolean {
  const v = value as { constructor?: { name?: string }; toArray?: unknown };
  return v.constructor?.name === 'VectorValue' && typeof v.toArray === 'function';
}

/** instanceof that tolerates a stubbed module (the shared test setup fakes firestore) */
function isA<T>(type: unknown, value: unknown): value is T {
  return typeof type === 'function' && value instanceof type;
}

/** Names an object's fields are matched by, as stored: see clean() */
interface FieldNames {
  readonly spared: ReadonlySet<string>;
  readonly maps: ReadonlySet<string>;
  /** The object is a data map: its keys are words a person or the model chose */
  readonly dataMap?: boolean;
}
const NO_NAMES: FieldNames = { spared: new Set(), maps: new Set() };
const IN_DATA_MAP: FieldNames = { ...NO_NAMES, dataMap: true };

/**
 * Firestore values as JSON, with secrets removed: timestamps become ISO strings,
 * references their paths, and a string holding JSON is filtered like any object and
 * kept as a string. Secret fields and secret-looking values are dropped. `names.spared`
 * (exact, as stored) skip the field-name filter on this object only, never on nested values,
 * and their own values still go through the value filter. `names.maps` are this object's
 * fields that are data maps: their own keys are judged by isSecretDataMapKey.
 */
function clean(
  value: unknown,
  meter: ParseMeter,
  depth = 0,
  names: FieldNames = NO_NAMES
): Plain | typeof DROP {
  if (depth > MAX_FIELD_DEPTH) return DROP; // deeper than Firestore allows: crafted, not stored
  if (value === null || value === undefined) return null;
  if (isA<Timestamp>(Timestamp, value)) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (isA<DocumentReference>(DocumentReference, value)) return value.path;
  if (typeof value === 'string') return cleanString(value, meter, depth);
  if (Array.isArray(value)) {
    return value.map((v) => clean(v, meter, depth + 1)).filter((v): v is Plain => v !== DROP);
  }
  if (typeof value === 'object') return cleanObject(value, meter, depth, names);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return DROP; // functions, symbols, bigints: nothing a person stored
}

/** A sealed token record (token-at-rest.ts): `{ encrypted }`, whatever it is called */
function isSealedEnvelope(value: object): boolean {
  return typeof (value as { encrypted?: unknown }).encrypted === 'string';
}

function cleanObject(
  value: object,
  meter: ParseMeter,
  depth: number,
  names: FieldNames
): Plain | typeof DROP {
  // Bytes: nothing a person reads, and the one shape a key name can't describe
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return DROP;
  // A stored vector (a fact's embedding): 768 numbers derived from text that is exported
  if (isVector(value)) return DROP;
  // Ciphertext of a credential: never the person's to read, at any depth (#2366)
  if (isSealedEnvelope(value)) return DROP;
  return cleanFields(value, meter, depth, names);
}

/**
 * An object's fields, secret ones dropped unless spared. Nested values get no spared names.
 * A data map's own keys are judged by isSecretDataMapKey (only the short words are spared).
 */
function cleanFields(
  value: object,
  meter: ParseMeter,
  depth: number,
  { spared, maps, dataMap }: FieldNames
): Record<string, Plain> {
  const isSecret = dataMap === true ? isSecretDataMapKey : isSecretField;
  // No prototype, so a stored "__proto__" key is an own field the filter sees, not a setter
  const out = Object.create(null) as Record<string, Plain>;
  for (const [k, v] of Object.entries(value) as Array<[string, unknown]>) {
    if (isSecret(k) && !spared.has(k)) continue;
    const kept = clean(v, meter, depth + 1, maps.has(k) ? IN_DATA_MAP : NO_NAMES);
    if (kept !== DROP) out[k] = kept;
  }
  return out;
}

function cleanString(value: string, meter: ParseMeter, depth: number): Plain | typeof DROP {
  if (isSecretValue(value)) return DROP;
  const trimmed = value.trim();
  if (!/^[[{"]/.test(trimmed)) return value;
  // Size checked, then charged, before parsing: the parsed value is new memory
  const bytes = Buffer.byteLength(trimmed, 'utf8');
  if (bytes > meter.limits.maxJsonStringBytes) return DROP;
  meter.reserveBytes(bytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return value; // looks like JSON but isn't: plain text
  }
  // A JSON string literal may hold JSON again (double-encoded): clean() reaches it too
  const kept = clean(parsed, meter, depth + 1);
  return kept === DROP ? DROP : JSON.stringify(kept);
}

/**
 * A stored value as it goes into the export file, any JSON parsing charged to the meter.
 * `keep` lists top-level fields of the value that stay although their name is on the
 * secret list, matched exactly as stored and never normalised (so `KEY` is still
 * dropped), for a store where that name is the person's data (#2336). Only the top
 * level: the same name inside a nested map, an array or JSON kept as a string is still
 * dropped, and a kept field holding a credential-looking value is dropped all the same.
 * `dataMaps` lists top-level fields whose own keys are data, chosen by the person or the
 * model (an entity's attributes: {pin: 'the blue one'}): a short word there is not read as
 * a credential, but a credential's name (bankToken, apiKey) still is (#2366), and their
 * values still go through every filter.
 */
export function toPlain(
  value: unknown,
  meter: ParseMeter = UNMETERED,
  keep: readonly string[] = [],
  dataMaps: readonly string[] = []
): Plain {
  const kept = clean(value, meter, 0, { spared: new Set(keep), maps: new Set(dataMaps) });
  return kept === DROP ? null : kept;
}
