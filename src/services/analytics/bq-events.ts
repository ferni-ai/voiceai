/**
 * Product analytics rows for BigQuery (johnb-2025.ferni_events), off unless BQ_EVENTS is on.
 *
 * Privacy is enforced here, not by callers: a row with an unknown field or a wrongly typed
 * value is dropped whole, and every string column passes a per-column allowlist
 * (bq-fields.ts) that writes 'other' for anything off it, so no free text can leak; ids become HMAC-SHA256 keyed from LOG_HASH_SECRET per purpose (never the raw id),
 * so rows are pseudonymous, not anonymous: account erasure must delete them too.
 *
 * Rows are buffered and sent with tabledata.insertAll via google-auth-library (already a
 * dependency). Nothing blocks a call or a request; a failed batch is logged (rate-limited)
 * and dropped. insertRowsOrThrow (evals) sends at once and throws instead.
 *
 * @module services/analytics/bq-events
 */
import { createHmac, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

import type { AuthClient } from 'google-auth-library';

import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { FIELD_VALUE, OTHER } from './bq-fields.js';

const log = createLogger({ module: 'bq-events' });

/** `!` required, `[]` repeated. Mirrors the dataset's table schemas exactly. */
type Col = 'TIMESTAMP!' | 'STRING!' | 'STRING' | 'INT64' | 'FLOAT64' | 'BOOL' | 'STRING[]';
// prettier-ignore
const [T, R, S, I, F, B, LIST] = ['TIMESTAMP!', 'STRING!', 'STRING', 'INT64', 'FLOAT64', 'BOOL', 'STRING[]'] as const;

/** Compact on purpose; a test diffs it against the live schemas (__tests__/fixtures/ferni_events). */
// prettier-ignore
export const BQ_TABLES = {
  call_events: {
    event_ts: T, env: S, event_type: R, user_hash: S, session_hash: S, agent_version: S,
    persona: S, model: S, duration_ms: I, end_reason: S, turns: I, first_response_ms: I,
    p50_turn_ms: I, p90_turn_ms: I, interruptions: I, handoffs: I, quality_score: F, flags: LIST,
  },
  outreach_events: {
    event_ts: T, env: S, event_type: R, user_hash: S, channel: S, kind: S, reason: S,
    outcome: S, third_party: B, latency_ms: I,
  },
  turn_metrics: {
    event_ts: T, env: S, user_hash: S, session_hash: S, turn: I, persona: S, stt_ms: I,
    llm_first_token_ms: I, tts_first_audio_ms: I, reply_delay_ms: I, user_words: I,
    agent_words: I, tools_called: LIST, interrupted: B,
    // added for the TURN_RECEIPT producer (agents/shared/turn-receipt-bq.ts)
    user_kind: S, eou_delay_ms: I, commit_to_audio_ms: I, prompt_tokens: I,
    prompt_cached_tokens: I, model: S, lane: S, tools_offered: I, preemptive: S,
    pause_hold_ms: I, barge_in_source: S, reply_chars: I,
  },
  followthrough_outcomes: {
    event_ts: T, env: S, user_hash: S, item_hash: S, item_kind: S, outcome: S,
    delay_hours: F, surfaced_via: S,
  },
  eval_results: {
    event_ts: T, env: S, run_id: S, scenario: S, arm: S, agent_version: S, metric: S,
    value: F, flags: LIST,
  },
} as const satisfies Record<string, Record<string, Col>>;

export type BqTable = keyof typeof BQ_TABLES;
/** Fields this module fills; a caller passing one is refused. */
const MANAGED = ['event_ts', 'env', 'user_hash', 'session_hash', 'item_hash'] as const;
type Managed = (typeof MANAGED)[number];
// prettier-ignore
type ValueOf<C> = C extends 'STRING[]' ? readonly string[] : C extends 'INT64' | 'FLOAT64' ? number : C extends 'BOOL' ? boolean : string;
export type BqRow<K extends BqTable> = {
  [F in Exclude<keyof (typeof BQ_TABLES)[K], Managed>]?: ValueOf<(typeof BQ_TABLES)[K][F]> | null;
};
/** Raw ids, hashed before they enter a row. */
export type BqIds = { userId?: string; sessionId?: string; itemId?: string };
type Purpose = 'user' | 'session' | 'item';

export const MAX_STRING = 64;
const MAX_LIST = 200;
const HASH_HEX = 32;
const FLUSH_ROWS = 50;
const FLUSH_MS = 5_000;
const MAX_BUFFER = 1_000;
const WARN_EVERY_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_IN_FLIGHT = 4;
const INSERT_SCOPE = 'https://www.googleapis.com/auth/bigquery.insertdata';
const INSERT_URL = (table: string) =>
  `https://bigquery.googleapis.com/bigquery/v2/projects/johnb-2025/datasets/ferni_events/tables/${table}/insertAll`;

/** What insertAll answers; a fake transport may return insertErrors as the API does. */
type InsertReply = void | { insertErrors?: unknown[] };
export type BqTransport = (table: BqTable, rows: Record<string, unknown>[]) => Promise<InsertReply>;

const buffer = new Map<BqTable, Record<string, unknown>[]>();
let buffered = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let transport: BqTransport | null = null;
let inFlight = 0;
const lastWarn = new Map<string, number>();

/** What a failed insert says about itself without its message, which could quote row data. */
function errorShape(error: unknown): Record<string, unknown> {
  const e = error as {
    name?: unknown;
    status?: unknown;
    code?: unknown;
    response?: { status?: unknown };
  };
  return {
    errorName: String(e?.name ?? 'unknown'),
    status: e?.response?.status ?? e?.status ?? e?.code,
  };
}

/** One warning per topic per WARN_EVERY_MS; never the row's values. */
function warnOnce(topic: string, ctx: Record<string, unknown>): void {
  const now = Date.now();
  if (now - (lastWarn.get(topic) ?? -Infinity) < WARN_EVERY_MS) return;
  lastWarn.set(topic, now);
  log.warn(ctx, `BigQuery events: ${topic}`);
}

const ENV_NAMES: Record<string, 'prod' | 'dev'> = {
  prod: 'prod',
  production: 'prod',
  dev: 'dev',
  development: 'dev',
};

/** DEPLOY_ENV first, then SENTRY_ENVIRONMENT, then the LiveKit project; anything else is unknown. */
export function bqEnv(env: Env = process.env): 'prod' | 'dev' | 'unknown' {
  const named = (env.DEPLOY_ENV || env.SENTRY_ENVIRONMENT || '').trim().toLowerCase();
  if (named) return ENV_NAMES[named] ?? 'unknown';
  const url = env.LIVEKIT_URL ?? '';
  return url.includes('test-rvg91u1z') ? 'prod' : url.includes('dev-8sm1ba0z') ? 'dev' : 'unknown';
}

/** HMAC-SHA256(key = HMAC(LOG_HASH_SECRET, "bq-<purpose>:"), id), truncated hex. Null without the secret. */
export function bqHash(purpose: Purpose, id: string, env: Env = process.env): string | null {
  const secret = env.LOG_HASH_SECRET;
  if (!secret || !id) {
    if (id) warnOnce('LOG_HASH_SECRET unset, ids left empty', {});
    return null;
  }
  const key = createHmac('sha256', secret).update(`bq-${purpose}:`).digest();
  return createHmac('sha256', key).update(id).digest('hex').slice(0, HASH_HEX);
}

/** A string column's value through its allowlist (bq-fields.ts): off the list is 'other'. */
function allowed(field: string, x: unknown): string | undefined {
  if (typeof x !== 'string' && typeof x !== 'number') return undefined;
  const v = (FIELD_VALUE[field] ?? (() => OTHER))(String(x));
  return v.length <= MAX_STRING ? v : OTHER;
}

function coerce(field: string, col: Col, v: unknown): unknown {
  const str = (x: unknown) => allowed(field, x);
  switch (col) {
    case 'INT64':
    case 'FLOAT64': {
      const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
      if (!Number.isFinite(n)) return undefined;
      return col === 'INT64' ? Math.round(n) : n;
    }
    case 'BOOL':
      return typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : undefined;
    case 'STRING[]': {
      if (!Array.isArray(v) || v.length > MAX_LIST) return undefined;
      const out = v.map(str);
      return out.every((x) => x !== undefined) ? out : undefined;
    }
    default:
      return str(v);
  }
}

/** The row as BigQuery JSON, or why it was refused. Exported for tests. */
export function buildRow(
  table: BqTable,
  row: Record<string, unknown>,
  ids: BqIds = {},
  env: Env = process.env,
  now: Date = new Date()
): { row: Record<string, unknown> } | { refused: string } {
  const schema: Record<string, Col> = BQ_TABLES[table];
  const out: Record<string, unknown> = { event_ts: now.toISOString(), env: bqEnv(env) };
  for (const [field, value] of Object.entries(row)) {
    const col = schema[field];
    if (!col || (MANAGED as readonly string[]).includes(field))
      return { refused: `field ${field}` };
    if (value === null || value === undefined) continue;
    const coerced = coerce(field, col, value);
    if (coerced === undefined) return { refused: `value of ${field}` };
    out[field] = coerced;
  }
  const hashes = {
    user_hash: ids.userId && bqHash('user', ids.userId, env),
    session_hash: ids.sessionId && bqHash('session', ids.sessionId, env),
    item_hash: ids.itemId && bqHash('item', ids.itemId, env),
  };
  for (const [field, h] of Object.entries(hashes)) if (h && field in schema) out[field] = h;
  const missing = Object.keys(schema).find((f) => schema[f]?.endsWith('!') && out[f] === undefined);
  return missing ? { refused: `missing ${missing}` } : { row: out };
}

/**
 * Queues one row. Returns false when BQ_EVENTS is off or the row is refused. Never throws,
 * never awaits the network.
 */
export function emitEvent<K extends BqTable>(
  table: K,
  row: BqRow<K>,
  ids?: BqIds,
  env = process.env
) {
  try {
    if (!flagOn('BQ_EVENTS', env)) return false;
    const built = buildRow(table, row as Record<string, unknown>, ids, env);
    if ('refused' in built) {
      warnOnce(`row refused (${table})`, { table, why: built.refused });
      return false;
    }
    if (buffered >= MAX_BUFFER) {
      warnOnce('buffer full, rows dropped', { table });
      return false;
    }
    buffer.set(table, [...(buffer.get(table) ?? []), built.row]);
    buffered++;
    if (buffered >= FLUSH_ROWS) void flushBqEvents();
    else if (!timer) {
      timer = setTimeout(() => void flushBqEvents(), FLUSH_MS);
      timer.unref?.();
    }
    return true;
  } catch (error) {
    warnOnce('emit failed', { table, ...errorShape(error) });
    return false;
  }
}

let authClient: Promise<AuthClient> | null = null;

/** One auth client per process (ADC: the mounted service-account key); retried after a failure. */
async function insertAll(table: BqTable, rows: Record<string, unknown>[]): Promise<void> {
  authClient ??= import('google-auth-library')
    .then(({ GoogleAuth }) => new GoogleAuth({ scopes: [INSERT_SCOPE] }).getClient())
    .catch((error: unknown) => {
      authClient = null;
      throw error;
    });
  const res = await (
    await authClient
  ).request<{ insertErrors?: unknown[] }>({
    url: INSERT_URL(table),
    method: 'POST',
    timeout: REQUEST_TIMEOUT_MS,
    data: { rows: rows.map((json) => ({ insertId: randomUUID(), json })) },
  });
  const errors = res.data?.insertErrors?.length ?? 0;
  if (errors)
    throw Object.assign(new Error('rows rejected'), { name: 'InsertErrors', code: errors });
}

/** Sends everything buffered, waiting at most `timeoutMs`. Failures are logged (rate-limited) and dropped. */
export async function flushBqEvents(timeoutMs = 10_000): Promise<void> {
  const batches = drain();
  const send = transport ?? insertAll;
  const sends = batches.map(async ([table, rows]) => {
    if (inFlight >= MAX_IN_FLIGHT)
      return warnOnce('too many inserts in flight, rows dropped', { table });
    inFlight++;
    try {
      await send(table, rows);
    } catch (error) {
      warnOnce(`insert failed (${table})`, { table, rows: rows.length, ...errorShape(error) });
    } finally {
      inFlight--;
    }
  });
  await Promise.race([Promise.all(sends), sleep(timeoutMs, undefined, { ref: false })]);
}

/** The first STRING field whose value its allowlist would rewrite (to 'other'), if any. */
function offList(
  table: BqTable,
  row: Record<string, unknown>,
  out: Record<string, unknown>
): string | undefined {
  const schema: Record<string, Col> = BQ_TABLES[table];
  return Object.keys(row).find((f) => {
    const [v, o] = [row[f], out[f]];
    if (!schema[f]?.startsWith('STRING') || v === null || v === undefined) return false;
    return Array.isArray(v) ? v.some((x, i) => (o as unknown[])[i] !== x) : o !== v;
  });
}

/**
 * Sends rows now, unbuffered, for a caller that must not lose them (an eval run). Unlike
 * emitEvent it throws: when BQ_EVENTS is off, on a refused row, on a string its allowlist
 * would write as 'other' (emitEvent writes it), a transport error or insertErrors. Nothing
 * is sent unless every row passes. Returns the number of rows sent.
 */
export async function insertRowsOrThrow<K extends BqTable>(
  table: K,
  rows: ReadonlyArray<BqRow<K>>,
  env: Env = process.env
): Promise<number> {
  if (!flagOn('BQ_EVENTS', env)) throw new Error('BQ_EVENTS is off: nothing sent');
  if (rows.length === 0) return 0;
  const built = rows.map((r) => buildRow(table, r as Record<string, unknown>, {}, env));
  const json = built.map((b, i) => {
    if ('refused' in b) throw new Error(`row refused (${table}): ${b.refused}`);
    const field = offList(table, rows[i] as Record<string, unknown>, b.row);
    if (field) throw new Error(`row refused (${table}): ${field} is off its allowlist`);
    return b.row;
  });
  const reply = await (transport ?? insertAll)(table, json);
  const errors = reply?.insertErrors?.length ?? 0;
  if (errors)
    throw Object.assign(new Error(`${errors} rows rejected (${table})`), { name: 'InsertErrors' });
  return json.length;
}

function drain(): Array<[BqTable, Record<string, unknown>[]]> {
  if (timer) clearTimeout(timer);
  timer = null;
  const batches = [...buffer.entries()];
  buffer.clear();
  buffered = 0;
  return batches;
}

process.once('beforeExit', () => void flushBqEvents());

/** Tests: swap the network for a fake, and clear buffered state. */
export function setBqTransportForTests(fn: BqTransport | null): void {
  transport = fn;
  drain();
  lastWarn.clear();
  inFlight = 0;
}
