/**
 * Keeps the caller's and Ferni's words out of the LiveKit SDK's own log lines on prod.
 *
 * The SDK logs what was said under keys named `lk.pii.*` ("lk.pii.user_input",
 * "lk.pii.message", "lk.pii.arguments", ...), at info and warn, on ordinary turns. Its
 * own redaction only reaches the OpenTelemetry export, not the JSON line written to
 * stdout. So outside dev (isNonProdDatabase, as replyForLog), every value under a key
 * the SDK marks as personal data, at any depth inside plain objects and arrays, is
 * logged as its length, whatever its type: a string as `[N chars]`, an Error as the
 * length of its message, anything else as the length of its JSON or text. A value that
 * cannot be measured (a cycle, a throwing toJSON or getter) becomes `[redacted]`. null
 * and undefined stay as they are. A dev process logs the words.
 *
 * A key is marked when one of its dot-separated segments is `pii` ("lk.pii.message", and
 * "pii" nested under "lk"), the test the SDK's own telemetry redaction uses
 * (isPIIAttribute, telemetry/redaction.js). It names no key, so a key a later SDK
 * version adds is covered too.
 * The search for keys enters plain objects and arrays, 32 levels deep (deeper becomes
 * `[too deep]`), and marks a reference back to an object on its own path `[Circular]`.
 * It does not enter class instances, Maps or Sets: a matching key inside one of those,
 * under a key that does not match, is not found. A value under a matching key is always
 * replaced, whatever it is.
 *
 * It fails closed. If the search throws (a throwing getter, say), the record is walked
 * again reading nothing under a matching key: those become `[redacted]`, an unreadable
 * value `[unreadable]`. If that cannot complete either, the record becomes
 * `{ redaction: 'failed' }` (pino still adds level, time, msg and the bindings). The
 * original record is never logged on prod.
 *
 * Dev or prod is decided on every record. A child's bindings are redacted once, when
 * the child is made, by the env at that moment.
 *
 * The seam is the SDK's pino instance, which lives in a global slot that every copy of
 * the SDK (ESM, CJS, plugins) reads. initializeLogger takes only {pretty, level}, and
 * pino's `redact` has no prefix wildcard, so the instance's `log` formatter is wrapped
 * (children copy it) and its `child` is wrapped (child bindings skip that formatter).
 * Through sdk-logger-slot.ts, a logger the SDK sets later (a re-init, the per-job
 * child) is wrapped as it is set, and this and the phone redaction (log-redaction.ts)
 * both apply in whichever order they are installed.
 *
 * @module utils/log-pii-key-redaction
 */
import { isNonProdDatabase } from '../config/firestore-database.js';
import { onSdkLogger } from './sdk-logger-slot.js';

type Env = Readonly<Record<string, string | undefined>>;
type Fields = Record<string, unknown>;
type LogFormatter = (obj: Fields) => Fields;
interface PinoLike {
  child: (bindings: Fields, options?: unknown) => unknown;
  [key: symbol]: unknown;
}

const PII_SEGMENT = /(?:^|\.)pii(?:\.|$)/i;
const MAX_DEPTH = 32;
const REDACTED = '[redacted]';
const UNREADABLE = '[unreadable]';
const FAILED: Fields = { redaction: 'failed' };
const WRAPPED = Symbol.for('ferni:sdk-pii-key-redaction');

let liveEnv: Env = process.env;

/** True for a log key whose value the SDK marks as personal data (a `pii` segment). */
function isPiiLogKey(key: string): boolean {
  return PII_SEGMENT.test(key);
}

/** What a value under a pii key is logged as on prod: its length, or REDACTED. */
function piiValueLength(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  try {
    if (typeof value === 'string') return `[${value.length} chars]`;
    if (value instanceof Error) return `[${String(value.message).length} chars]`;
    if (typeof value !== 'object') return `[${String(value).length} chars]`;
    const json: unknown = JSON.stringify(value);
    return typeof json === 'string' ? `[${json.length} chars]` : REDACTED;
  } catch {
    return REDACTED; // a cycle, a BigInt, a throwing toJSON or getter
  }
}

function isPlainObject(value: object): value is Fields {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * One pass of the search. Strict: lengths under matching keys, copy-on-write, and any
 * throw ends the pass. Lenient (after a throw): nothing under a matching key is read,
 * a value that throws when read is UNREADABLE, and the copy is always fresh.
 */
function walk(value: unknown, depth: number, lenient: boolean, path: Set<object>): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const array = Array.isArray(value);
  if (!array && !isPlainObject(value)) return value;
  // A copy no longer points at its original, so pino would print the original in full
  // where it sees no cycle: mark the cycle (and an absurd depth) here instead.
  if (path.has(value)) return '[Circular]';
  if (depth >= MAX_DEPTH) return '[too deep]';
  path.add(value);
  const out = array
    ? walkArray(value, depth, lenient, path)
    : walkObject(value as Fields, depth, lenient, path);
  path.delete(value);
  return out;
}

function readLeniently(get: () => unknown, depth: number, path: Set<object>): unknown {
  try {
    return walk(get(), depth + 1, true, path);
  } catch {
    return UNREADABLE;
  }
}

function walkArray(
  value: unknown[],
  depth: number,
  lenient: boolean,
  path: Set<object>
): unknown[] {
  if (lenient) {
    return Array.from({ length: value.length }, (_, i) =>
      readLeniently(() => value[i], depth, path)
    );
  }
  let out: unknown[] | undefined;
  for (let i = 0; i < value.length; i++) {
    const raw = value[i];
    const v = walk(raw, depth + 1, false, path);
    if (v !== raw) (out ??= value.slice())[i] = v;
  }
  return out ?? value;
}

function walkObject(value: Fields, depth: number, lenient: boolean, path: Set<object>): Fields {
  if (lenient) {
    const out: Fields = {};
    for (const key of Object.keys(value)) {
      out[key] = isPiiLogKey(key) ? REDACTED : readLeniently(() => value[key], depth, path);
    }
    return out;
  }
  let out: Fields | undefined;
  for (const key of Object.keys(value)) {
    const raw = value[key];
    const v = isPiiLogKey(key) ? piiValueLength(raw) : walk(raw, depth + 1, false, path);
    if (v !== raw) (out ??= { ...value })[key] = v;
  }
  return out ?? value;
}

/**
 * The record (or child bindings) pino may write: on a dev process the same object; on
 * prod a copy with every pii value replaced. Never throws, and never the original on prod.
 */
function redactPiiLogKeys(value: Fields, inner?: LogFormatter): Fields {
  if (isNonProdDatabase(liveEnv)) return inner ? inner(value) : value;
  let obj: Fields;
  try {
    obj = inner ? inner(value) : value;
  } catch {
    return { ...FAILED }; // the phone formatter failed: nothing it masks may go out raw
  }
  try {
    return walk(obj, 0, false, new Set()) as Fields;
  } catch {
    try {
      return walk(obj, 0, true, new Set()) as Fields;
    } catch {
      return { ...FAILED };
    }
  }
}

function pinoSymbol(logger: object, description: string): symbol | undefined {
  return Object.getOwnPropertySymbols(logger).find((s) => s.description === description);
}

function isPinoLike(value: unknown): value is PinoLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'child' in value &&
    typeof value.child === 'function'
  );
}

/** Wraps a pino logger's `log` formatter and `child` so pii values become lengths. */
function redactSdkPiiKeys(l: unknown): void {
  if (!isPinoLike(l)) return;
  const key = pinoSymbol(l, 'pino.formatters');
  // WRAPPED is read through the prototype: a child of a wrapped logger copied its formatter
  if (!key || l[WRAPPED] === true) return;
  const formatters = l[key] as { log?: LogFormatter };
  const { log } = formatters;
  l[key] = { ...formatters, log: (obj: Fields) => redactPiiLogKeys(obj, log) };
  const { child } = l;
  l.child = function piiRedactedChild(this: unknown, bindings, options) {
    return child.call(this, redactPiiLogKeys(bindings), options);
  };
  l[WRAPPED] = true;
}

/**
 * Wraps the SDK logger now and every logger later set in its global slot. `env` decides
 * dev or prod, read on every record (process.env when deployed). Idempotent: a second
 * call only changes `env`.
 */
export function installSdkPiiKeyRedaction(env: Env = process.env): void {
  liveEnv = env;
  onSdkLogger(redactSdkPiiKeys);
}
