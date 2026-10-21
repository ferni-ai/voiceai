/**
 * What leaves in a "Take your story" file: stored values made plain JSON, with secrets
 * removed at every depth (user-records-export.ts decides which stores are read).
 *
 * @module services/platform/export-redaction
 */

import { DocumentReference, Timestamp } from 'firebase-admin/firestore';

/**
 * Fields never exported, at any depth: inside nested objects, arrays, and JSON kept as a
 * string. A key is normalised before it's matched (NFKC, lower case, every separator and
 * non-letter removed), so accessToken, access_token, access-token, ACCESS.TOKEN and
 * "access token" are one key. Long unambiguous terms match anywhere in that key; short
 * ones only as a whole word or as the whole key, so "footprint" is not "otp".
 */
const SECRET_KEY_PARTS = [
  'token',
  'secret',
  'password',
  'passwd',
  'passcode',
  'credential',
  'apikey',
  'accesskey',
  'privatekey',
  'signingkey',
  'clientkey',
  'oauth',
  'p256dh',
  'authorization',
  'bearer',
  'jwt',
  'cookie',
  'webauthn',
  'passkey',
  'pushsubscription',
  'endpoint',
  'refresh',
  'sessionid',
  'sessionkey',
  'verificationcode',
  'otpcode',
  'pincode',
  'authcode',
  'totp',
  'recoverycode',
  'backupcode',
];
/** Secret only as a whole word of the key (auth in authMethod, not in author) */
const SECRET_WORDS = new Set(['auth', 'otp', 'pin', 'hash', 'salt', 'mfa']);
/** Secret only as the entire key */
const SECRET_KEYS = new Set(['keys', 'key', 'access', 'code', 'sig', 'signature', 'nonce']);

function normaliseKey(key: string): string {
  return key
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function isSecretField(key: string): boolean {
  const whole = normaliseKey(key);
  if (SECRET_KEYS.has(whole) || SECRET_KEY_PARTS.some((part) => whole.includes(part))) {
    return true;
  }
  const words = key
    .normalize('NFKC')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/);
  return words.some((w) => SECRET_WORDS.has(w));
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

/** instanceof that tolerates a stubbed module (the shared test setup fakes firestore) */
function isA<T>(type: unknown, value: unknown): value is T {
  return typeof type === 'function' && value instanceof type;
}

const NOTHING_SPARED: ReadonlySet<string> = new Set();

/**
 * Firestore values as JSON, with secrets removed: timestamps become ISO strings,
 * references their paths, and a string holding JSON is filtered like any object and
 * kept as a string. Secret fields and secret-looking values are dropped. `spared` names
 * (normalised) skip the field-name filter on this object only, never on nested values,
 * and their own values still go through the value filter.
 */
function clean(
  value: unknown,
  meter: ParseMeter,
  depth = 0,
  spared: ReadonlySet<string> = NOTHING_SPARED
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
  // Bytes: nothing a person reads, and the one shape a key name can't describe
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return DROP;
  if (typeof value === 'object') return cleanFields(value, meter, depth, spared);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return DROP; // functions, symbols, bigints: nothing a person stored
}

/** An object's fields, secret ones dropped unless spared; nested values get no spared names */
function cleanFields(
  value: object,
  meter: ParseMeter,
  depth: number,
  spared: ReadonlySet<string>
): Record<string, Plain> {
  // No prototype, so a stored "__proto__" key is an own field the filter sees, not a setter
  const out = Object.create(null) as Record<string, Plain>;
  for (const [k, v] of Object.entries(value)) {
    if (isSecretField(k) && !spared.has(normaliseKey(k))) continue;
    const kept = clean(v, meter, depth + 1);
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
 * secret list, for a store where that name is the person's data (#2336). Only the top
 * level: the same name inside a nested map, an array or JSON kept as a string is still
 * dropped, and a kept field holding a credential-looking value is dropped all the same.
 */
export function toPlain(
  value: unknown,
  meter: ParseMeter = UNMETERED,
  keep: readonly string[] = []
): Plain {
  const kept = clean(value, meter, 0, new Set(keep.map(normaliseKey)));
  return kept === DROP ? null : kept;
}
