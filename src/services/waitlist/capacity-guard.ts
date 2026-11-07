/**
 * Before a wave lets anyone in: the last settled day's net GCP cost against
 * costCeilingUsd, and the share of prod calls in the last 24 h that ended in
 * error (ferni_events.call_events, at least MIN_CALLS) against errorRateCeiling.
 * Over a ceiling: skip the wave. A signal that can't be read: run and alert
 * (Seth, 2026-10-18: run when unmeasured, skip when tripped).
 *
 * Cost comes from the billing export named by BILLING_EXPORT_TABLE
 * (project.dataset.table; the same variable cost-alerts.yml uses, kept out of
 * this public repo). Unset: cost is unmeasured. The export lags by hours, so
 * "yesterday" (Pacific) counts only once it holds rows exported 6+ hours after
 * the day ended; until then the day before yesterday is used. Net of credits.
 *
 * IAM for the server's service account (john-bogle-ui@johnb-2025): to run the
 * queries (bigquery.jobs.create), roles/bigquery.jobUser on project johnb-2025;
 * to read the rows (bigquery.tables.getData), roles/bigquery.dataViewer on the
 * billing export dataset and on dataset ferni_events. Check before flipping:
 * `ferni waitlist guard --check`.
 *
 * @module services/waitlist/capacity-guard
 */
import type { WaitlistSettings } from './settings.js';

type GuardState = 'ok' | 'tripped' | 'unmeasured';

export interface GuardReading {
  state: GuardState;
  costUsd: number | null;
  /** The Pacific day the cost is for (yesterday, or the day before while the export settles). */
  costDay: string | null;
  errorRate: number | null;
  /** Why it tripped ('cost', 'error-rate') or which signal is missing ('cost-unmeasured', ...). */
  reasons: string[];
}

interface DailyCost {
  usd: number;
  day: string;
}

export interface GuardSignals {
  dailyCost: () => Promise<DailyCost | null>;
  callErrorRate: () => Promise<number | null>;
}

export const MIN_CALLS = 20;
const PROJECT = 'johnb-2025';
const TABLE_NAME = /^[A-Za-z0-9-]+\.[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/;
const TZ = 'America/Los_Angeles';

/** Yesterday and the day before, newest first, each with whether the export has settled for it. */
export function costSql(table: string): string {
  return `WITH r AS (
  SELECT DATE(usage_start_time, '${TZ}') AS d, cost, credits, export_time FROM \`${table}\`
  WHERE DATE(usage_start_time, '${TZ}') BETWEEN DATE_SUB(CURRENT_DATE('${TZ}'), INTERVAL 2 DAY) AND DATE_SUB(CURRENT_DATE('${TZ}'), INTERVAL 1 DAY))
SELECT CAST(d AS STRING) AS day,
  ROUND(IFNULL(SUM(cost), 0) + IFNULL(SUM((SELECT SUM(c.amount) FROM UNNEST(credits) c)), 0), 2) AS net,
  MAX(export_time) >= TIMESTAMP_ADD(TIMESTAMP(DATE_ADD(d, INTERVAL 1 DAY), '${TZ}'), INTERVAL 6 HOUR) AS settled
FROM r GROUP BY d ORDER BY d DESC`;
}

const ERROR_RATE_SQL = `SELECT COUNTIF(end_reason = 'error') AS errors, COUNT(*) AS calls
FROM \`${PROJECT}.ferni_events.call_events\`
WHERE event_type = 'call_end' AND env = 'prod'
  AND event_ts >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)`;

const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null); // prettier-ignore

export async function readGuard(
  signals: GuardSignals,
  settings: WaitlistSettings
): Promise<GuardReading> {
  const [cost, rate] = await Promise.all([
    signals.dailyCost().catch(() => null),
    signals.callErrorRate().catch(() => null),
  ]);
  const costUsd = finite(cost?.usd);
  const errorRate = finite(rate);
  const tripped = [
    ...(costUsd !== null && costUsd > settings.costCeilingUsd ? ['cost'] : []),
    ...(errorRate !== null && errorRate > settings.errorRateCeiling ? ['error-rate'] : []),
  ];
  const missing = [
    ...(costUsd === null ? ['cost-unmeasured'] : []),
    ...(errorRate === null ? ['error-rate-unmeasured'] : []),
  ];
  const state: GuardState = tripped.length ? 'tripped' : missing.length ? 'unmeasured' : 'ok';
  return { state, costUsd, costDay: costUsd === null ? null : (cost?.day ?? null), errorRate, reasons: [...tripped, ...missing] }; // prettier-ignore
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** One BigQuery query over REST: every row's cells, or null when it can't answer. */
async function queryRows(
  sql: string,
  fetchImpl: Fetch,
  token: () => Promise<string>
): Promise<Array<Array<string | null>> | null> {
  // prettier-ignore
  const res = await fetchImpl(`https://bigquery.googleapis.com/bigquery/v2/projects/${PROJECT}/queries`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, useLegacySql: false, timeoutMs: 20_000 }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { jobComplete?: boolean; rows?: Array<{ f: Array<{ v: string | null }> }> }; // prettier-ignore
  return body.jobComplete ? (body.rows ?? []).map((r) => r.f.map((c) => c.v)) : null;
}

async function gcpToken(): Promise<string> {
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/bigquery.readonly'] });
  return (await (await auth.getClient()).getAccessToken()).token ?? '';
}

/** The production signals: the billing export and call_events, read-only. */
export function bigQuerySignals(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: Fetch = fetch,
  token = gcpToken
): GuardSignals {
  // prettier-ignore
  const table = env['BILLING_EXPORT_TABLE']?.trim() ?? '';
  return {
    dailyCost: async () => {
      if (!TABLE_NAME.test(table)) return null; // unset or not project.dataset.table
      const settled = (await queryRows(costSql(table), fetchImpl, token))?.find(
        (r) => r[2] === 'true'
      );
      return settled?.[0] && settled[1] !== null
        ? { day: settled[0], usd: Number(settled[1]) }
        : null;
    },
    callErrorRate: async () => {
      const [errors, calls] = ((await queryRows(ERROR_RATE_SQL, fetchImpl, token))?.[0] ?? []).map(Number); // prettier-ignore
      return errors !== undefined && calls !== undefined && calls >= MIN_CALLS ? errors / calls : null; // prettier-ignore
    },
  };
}
