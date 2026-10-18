/**
 * Product analytics rows for BigQuery (johnb-2025.ferni_events), off unless BQ_EVENTS is on.
 *
 * Privacy is enforced here, not by callers: a row with a field outside its table's allowlist,
 * a string over 64 characters or a wrongly typed value is dropped whole, so no free text can
 * leak; ids become HMAC-SHA256 keyed from LOG_HASH_SECRET per purpose (never the raw id).
 *
 * Rows are buffered and sent with tabledata.insertAll via google-auth-library (already a
 * dependency). Nothing blocks a call or a request; a failed batch is logged (rate-limited)
 * and dropped.
 *
 * @module services/analytics/bq-events
 */
import { createHmac, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

import type { AuthClient } from 'google-auth-library';

import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';

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
const INSERT_SCOPE = 'https://www.googleapis.com/auth/bigquery.insertdata';
const INSERT_URL = (table: string) =>
  `https://bigquery.googleapis.com/bigquery/v2/projects/johnb-2025/datasets/ferni_events/tables/${table}/insertAll`;

export type BqTransport = (table: BqTable, rows: Record<string, unknown>[]) => Promise<void>;

const buffer = new Map<BqTable, Record<string, unknown>[]>();
let buffered = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let transport: BqTransport | null = null;
const lastWarn = new Map<string, number>();

/** One warning per topic per WARN_EVERY_MS; never the row's values. */
function warnOnce(topic: string, ctx: Record<string, unknown>): void {
  const now = Date.now();
  if (now - (lastWarn.get(topic) ?? -Infinity) < WARN_EVERY_MS) return;
  lastWarn.set(topic, now);
  log.warn(ctx, `BigQuery events: ${topic}`);
}

/** prod only on an explicit prod signal; both voice agents run with NODE_ENV=production. */
export function bqEnv(env: Env = process.env): 'prod' | 'dev' {
  const named = (env.DEPLOY_ENV || env.SENTRY_ENVIRONMENT || '').trim().toLowerCase();
  if (named) return named === 'prod' || named === 'production' ? 'prod' : 'dev';
  return (env.LIVEKIT_URL ?? '').includes('test-rvg91u1z') ? 'prod' : 'dev';
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

function coerce(col: Col, v: unknown): unknown {
  const str = (x: unknown) =>
    (typeof x === 'string' || typeof x === 'number') && String(x).length <= MAX_STRING
      ? String(x)
      : undefined;
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
    const coerced = coerce(col, value);
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
    warnOnce('emit failed', { table, error: String(error) });
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
    data: { rows: rows.map((json) => ({ insertId: randomUUID(), json })) },
  });
  const errors = res.data?.insertErrors?.length ?? 0;
  if (errors) throw new Error(`${errors} of ${rows.length} rows rejected`);
}

/** Sends everything buffered, waiting at most `timeoutMs`. Failures are logged (rate-limited) and dropped. */
export async function flushBqEvents(timeoutMs = 10_000): Promise<void> {
  const batches = drain();
  const send = transport ?? insertAll;
  const sends = batches.map(([table, rows]) =>
    send(table, rows).catch((error: unknown) =>
      warnOnce(`insert failed (${table})`, { table, rows: rows.length, error: String(error) })
    )
  );
  await Promise.race([Promise.all(sends), sleep(timeoutMs, undefined, { ref: false })]);
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
}
