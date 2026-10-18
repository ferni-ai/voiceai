/**
 * Before a wave lets anyone in: yesterday's net GCP cost (billing export, Pacific
 * day, credits applied) against costCeilingUsd, and the share of prod calls in
 * the last 24 h that ended in error (ferni_events.call_events, at least MIN_CALLS)
 * against errorRateCeiling. Over a ceiling: skip the wave. A signal that can't be
 * read: run and alert (Seth, 2026-10-18: run when unmeasured, skip when tripped).
 *
 * @module services/waitlist/capacity-guard
 */
import type { WaitlistSettings } from './settings.js';

export type GuardState = 'ok' | 'tripped' | 'unmeasured';

export interface GuardReading {
  state: GuardState;
  costUsd: number | null;
  errorRate: number | null;
  /** Why it tripped ('cost', 'error-rate') or which signal is missing ('cost-unmeasured', ...). */
  reasons: string[];
}

export interface GuardSignals {
  yesterdayCostUsd: () => Promise<number | null>;
  callErrorRate: () => Promise<number | null>;
}

export const MIN_CALLS = 20;
const PROJECT = 'johnb-2025';
const BILLING_TABLE = `${PROJECT}.billing_export.gcp_billing_export_v1_015B34_C55C7D_412EDC`;

export const COST_SQL = `SELECT SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)) AS net
FROM \`${BILLING_TABLE}\`
WHERE DATE(usage_start_time, 'America/Los_Angeles') = DATE_SUB(CURRENT_DATE('America/Los_Angeles'), INTERVAL 1 DAY)`;

export const ERROR_RATE_SQL = `SELECT COUNTIF(end_reason = 'error') AS errors, COUNT(*) AS calls
FROM \`${PROJECT}.ferni_events.call_events\`
WHERE event_type = 'call_end' AND env = 'prod'
  AND event_ts >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)`;

const settle = async (read: () => Promise<number | null>): Promise<number | null> =>
  read().then(
    (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null),
    () => null
  );

export async function readGuard(
  signals: GuardSignals,
  settings: WaitlistSettings
): Promise<GuardReading> {
  const [costUsd, errorRate] = await Promise.all([
    settle(signals.yesterdayCostUsd),
    settle(signals.callErrorRate),
  ]);
  const tripped = [
    ...(costUsd !== null && costUsd > settings.costCeilingUsd ? ['cost'] : []),
    ...(errorRate !== null && errorRate > settings.errorRateCeiling ? ['error-rate'] : []),
  ];
  const missing = [
    ...(costUsd === null ? ['cost-unmeasured'] : []),
    ...(errorRate === null ? ['error-rate-unmeasured'] : []),
  ];
  const state: GuardState = tripped.length ? 'tripped' : missing.length ? 'unmeasured' : 'ok';
  return { state, costUsd, errorRate, reasons: [...tripped, ...missing] };
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** One BigQuery query over REST: the first row's cells, or null when it can't answer. */
async function firstRow(
  sql: string,
  fetchImpl: Fetch,
  token: () => Promise<string>
): Promise<string[] | null> {
  // prettier-ignore
  const res = await fetchImpl(`https://bigquery.googleapis.com/bigquery/v2/projects/${PROJECT}/queries`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, useLegacySql: false, timeoutMs: 20_000 }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { jobComplete?: boolean; rows?: Array<{ f: Array<{ v: string | null }> }> }; // prettier-ignore
  const cells = body.jobComplete ? body.rows?.[0]?.f.map((c) => c.v) : undefined;
  return cells && cells.every((c) => c !== null) ? (cells as string[]) : null;
}

async function gcpToken(): Promise<string> {
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/bigquery.readonly'] });
  return (await (await auth.getClient()).getAccessToken()).token ?? '';
}

/** The production signals: the billing export and call_events, read-only. */
export function bigQuerySignals(fetchImpl: Fetch = fetch, token = gcpToken): GuardSignals {
  return {
    yesterdayCostUsd: async () => {
      const row = await firstRow(COST_SQL, fetchImpl, token);
      return row ? Number(row[0]) : null;
    },
    callErrorRate: async () => {
      const row = await firstRow(ERROR_RATE_SQL, fetchImpl, token);
      const [errors, calls] = (row ?? []).map(Number);
      return errors !== undefined && calls !== undefined && calls >= MIN_CALLS ? errors / calls : null; // prettier-ignore
    },
  };
}
