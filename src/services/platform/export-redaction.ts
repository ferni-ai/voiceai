/**
 * What leaves in a "Take your story" file: stored values made plain JSON, with secrets
 * removed at every depth (user-records-export.ts decides which stores are read).
 *
 * @module services/platform/export-redaction
 */

import { DocumentReference, Timestamp } from 'firebase-admin/firestore';

/**
 * What a credential is called: a denylist, not a pattern. A field is dropped by name, at
 * any depth (nested maps, arrays, JSON kept as a string), when its normalised name (NFKC,
 * lower case, every separator and non-letter removed, so accessToken, access_token,
 * ACCESS-TOKEN and "access token" are one name) IS one of SECRET_NAMES or ENDS WITH one of
 * SECRET_ENDINGS. Nothing is matched inside a name (#2366): a person's own words that
 * merely contain one (favorite_cookie, salt_intake, hash_browns, endpoint_of_trip,
 * refreshments) stay, and so does every session reference (sessionId, sessionIds,
 * firstSessionId, session_id): the call a record came from, not a sign-in. A credential
 * under any other name is still dropped by its value (isSecretValue).
 */
const SECRET_ENDINGS = [
  // tokens, with or without a prefix: accessToken, refresh_token, pushToken, twilioAuthToken
  'token',
  // service and client secrets: clientSecret, mfaSecret, webhookSecret, livekitApiSecret
  'secret',
  'secrets',
  // passwords and password hashes
  'password',
  'passwords',
  'passwordhash',
  'passwd',
  'passcode',
  'passphrase',
  // key material: apiKey, X-API-KEY, privateKey, signingKey
  'apikey',
  'apikeys',
  'accesskey',
  'secretkey',
  'privatekey',
  'signingkey',
  'encryptionkey',
  'clientkey',
  'sessionkey',
  // stored credentials: webauthnCredential, googleCredentials
  'credential',
  'credentials',
];
/** Credentials only as the whole name: each is also an ordinary word inside other names */
const SECRET_NAMES = new Set([
  // key material, and a web-push subscription (its endpoint and keys.auth / keys.p256dh)
  'key',
  'keys',
  'keysauth',
  'keysp256dh',
  'p256dh',
  'auth',
  'endpoint',
  'pushsubscription',
  'passkey',
  'webauthn',
  // HTTP credentials and token bundles ({access, refresh})
  'authorization',
  'bearer',
  'jwt',
  'cookie',
  'cookies',
  'sessioncookie',
  'oauth',
  'access',
  'refresh',
  // PINs and one-time codes
  'pin',
  'pincode',
  'pinhash',
  'otp',
  'otpcode',
  'totp',
  'code',
  'authcode',
  'authorizationcode',
  'verificationcode',
  'recoverycode',
  'recoverycodes',
  'backupcode',
  'backupcodes',
  // signing and hashing material
  'salt',
  'nonce',
  'sig',
  'signature',
]);

function normaliseKey(key: string): string {
  return key
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function isSecretField(key: string): boolean {
  const name = normaliseKey(key);
  return SECRET_NAMES.has(name) || SECRET_ENDINGS.some((ending) => name.endsWith(ending));
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
}
const NO_NAMES: FieldNames = { spared: new Set(), maps: new Set() };

/**
 * Firestore values as JSON, with secrets removed: timestamps become ISO strings,
 * references their paths, and a string holding JSON is filtered like any object and
 * kept as a string. Secret fields and secret-looking values are dropped. `names.spared`
 * (exact, as stored) skip the field-name filter on this object only, never on nested values,
 * and their own values still go through the value filter. `names.maps` are this object's
 * fields that are data maps: their own keys are spared the same way.
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
  // Bytes: nothing a person reads, and the one shape a key name can't describe
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return DROP;
  // A stored vector (a fact's embedding): 768 numbers derived from text that is exported
  if (isVector(value)) return DROP;
  if (typeof value === 'object') return cleanFields(value, meter, depth, names);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return DROP; // functions, symbols, bigints: nothing a person stored
}

/**
 * An object's fields, secret ones dropped unless spared. Nested values get no spared names,
 * except a data map's own keys (the map's values are still filtered as usual).
 */
function cleanFields(
  value: object,
  meter: ParseMeter,
  depth: number,
  { spared, maps }: FieldNames
): Record<string, Plain> {
  // No prototype, so a stored "__proto__" key is an own field the filter sees, not a setter
  const out = Object.create(null) as Record<string, Plain>;
  for (const [k, v] of Object.entries(value) as Array<[string, unknown]>) {
    if (isSecretField(k) && !spared.has(k)) continue;
    const kept = clean(v, meter, depth + 1, maps.has(k) ? dataMapNames(v) : NO_NAMES);
    if (kept !== DROP) out[k] = kept;
  }
  return out;
}

/** A data map's own keys are spared; what they hold is filtered as usual */
function dataMapNames(map: unknown): FieldNames {
  if (typeof map !== 'object' || map === null) return NO_NAMES;
  return { spared: new Set(Object.keys(map)), maps: NO_NAMES.maps };
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
 * model (an entity's attributes: {pin: 'the blue one'}), so no key of theirs is dropped by
 * name (#2366); their values still go through every filter.
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
