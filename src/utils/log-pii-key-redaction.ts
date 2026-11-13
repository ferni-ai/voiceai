/**
 * Keeps the caller's and Ferni's words out of the LiveKit SDK's own log lines on prod.
 *
 * The SDK logs what was said under keys named `lk.pii.*` ("lk.pii.user_input",
 * "lk.pii.message", "lk.pii.arguments", ...), at info and warn, on ordinary turns. Its
 * own redaction only reaches the OpenTelemetry export, not the JSON line written to
 * stdout. So outside dev (isNonProdDatabase, as replyForLog), every value under a key
 * the SDK marks as personal data, at any depth inside plain objects and arrays, is
 * logged as its length: a string as `[N chars]`, a plain object or array as the length of its
 * JSON, an Error as the length of its message, a number or boolean as the length of
 * its text. null and undefined stay as they are. A dev process logs the words.
 *
 * A key is marked when one of its dot-separated segments is `pii` ("lk.pii.message", and
 * "pii" nested under "lk"), the test the SDK's own telemetry redaction uses
 * (isPIIAttribute, telemetry/redaction.js). It names no key, so a key a later SDK
 * version adds is covered too.
 * Values inside class instances (anything that is not a plain object or array) are not
 * walked: pino serialises those itself.
 *
 * The seam is the SDK's pino instance, which lives in a global slot that every copy of
 * the SDK (ESM, CJS, plugins) reads. initializeLogger takes only {pretty, level}, and
 * pino's `redact` has no prefix wildcard, so the instance's `log` formatter is wrapped
 * (children copy it) and its `child` is wrapped (child bindings skip that formatter).
 * The slot gets a setter, so a logger the SDK sets later (a re-init, the per-job child)
 * is wrapped as it is set. The setter chains onto one already there (the phone
 * redaction in log-redaction.ts, installed first), so both apply.
 *
 * @module utils/log-pii-key-redaction
 */
import { isNonProdDatabase } from '../config/firestore-database.js';

type Env = Readonly<Record<string, string | undefined>>;
type LogFormatter = (obj: Record<string, unknown>) => Record<string, unknown>;
interface PinoLike {
  child: (bindings: Record<string, unknown>, options?: unknown) => unknown;
  [key: symbol]: unknown;
}

const PII_SEGMENT = /(?:^|\.)pii(?:\.|$)/i;
const MAX_DEPTH = 32;
const SDK_LOGGER = Symbol.for('@livekit/agents:logger');
const WRAPPED = Symbol.for('ferni:sdk-pii-key-redaction');

let liveEnv: Env = process.env;

/** True for a log key whose value the SDK marks as personal data (a `pii` segment). */
function isPiiLogKey(key: string): boolean {
  return PII_SEGMENT.test(key);
}

/** What a value under an lk.pii.* key is logged as on prod: its length. */
function piiValueLength(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  if (typeof value === 'string') return `[${value.length} chars]`;
  if (value instanceof Error) return `[${value.message.length} chars]`;
  if (typeof value !== 'object') return `[${String(value).length} chars]`;
  try {
    return `[${(JSON.stringify(value) ?? '').length} chars]`;
  } catch {
    return '[unserializable]'; // a cycle or a BigInt; the words still never reach the line
  }
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function walkArray(value: unknown[], depth: number, path: Set<object>): unknown[] {
  let out: unknown[] | undefined;
  for (let i = 0; i < value.length; i++) {
    const v = walk(value[i], depth + 1, path);
    if (v !== value[i]) (out ??= value.slice())[i] = v;
  }
  return out ?? value;
}

function walkObject(
  value: Record<string, unknown>,
  depth: number,
  path: Set<object>
): Record<string, unknown> {
  let out: Record<string, unknown> | undefined;
  for (const key of Object.keys(value)) {
    const v = isPiiLogKey(key) ? piiValueLength(value[key]) : walk(value[key], depth + 1, path);
    if (v !== value[key]) (out ??= { ...value })[key] = v;
  }
  return out ?? value;
}

function walk(value: unknown, depth: number, path: Set<object>): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const array = Array.isArray(value);
  if (!array && !isPlainObject(value)) return value;
  // A copy no longer points at its original, so pino would print the original in full
  // where it sees no cycle: mark the cycle (and an absurd depth) here instead.
  if (path.has(value)) return '[Circular]';
  if (depth >= MAX_DEPTH) return '[too deep]';
  path.add(value);
  const out = array ? walkArray(value, depth, path) : walkObject(value, depth, path);
  path.delete(value);
  return out;
}

/**
 * A copy of a log object with the value under every pii key replaced by its length (the
 * same object when there is none), unless this is a dev process.
 */
function redactPiiLogKeys<T>(value: T, env: Env = liveEnv): T {
  if (isNonProdDatabase(env)) return value;
  return walk(value, 0, new Set()) as T;
}

function pinoSymbol(logger: object, description: string): symbol | undefined {
  return Object.getOwnPropertySymbols(logger).find((s) => s.description === description);
}

/** Wraps a pino logger's `log` formatter and `child` so lk.pii.* values become lengths. */
function isPinoLike(value: unknown): value is PinoLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'child' in value &&
    typeof value.child === 'function'
  );
}

function redactSdkPiiKeys(l: unknown): void {
  if (!isPinoLike(l)) return;
  const key = pinoSymbol(l, 'pino.formatters');
  // WRAPPED is read through the prototype: a child of a wrapped logger copied its formatter
  if (!key || l[WRAPPED] === true) return;
  const formatters = l[key] as { log?: LogFormatter };
  const { log } = formatters;
  l[key] = {
    ...formatters,
    log: (obj: Record<string, unknown>) => redactPiiLogKeys(log ? log(obj) : obj),
  };
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
  const g = globalThis as Record<symbol, unknown>;
  if (g[WRAPPED] === true) return;
  g[WRAPPED] = true;
  const prior = Object.getOwnPropertyDescriptor(g, SDK_LOGGER);
  let value: unknown = prior?.value;
  const read = (): unknown => (prior?.get ? prior.get.call(g) : value);
  Object.defineProperty(g, SDK_LOGGER, {
    configurable: true,
    enumerable: false,
    get: read,
    set: (logger: unknown) => {
      if (prior?.set) prior.set.call(g, logger);
      else value = logger;
      redactSdkPiiKeys(read());
    },
  });
  redactSdkPiiKeys(read());
}
