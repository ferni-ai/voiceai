/**
 * The capacity guard: skip over a ceiling, run (unmeasured) when a signal
 * can't be read, the billing table from BILLING_EXPORT_TABLE, and the settled
 * day: yesterday only once the export has caught up, else the day before.
 */
import { describe, expect, it } from 'vitest';
import {
  bigQuerySignals,
  costSql,
  MIN_CALLS,
  readGuard,
  type GuardSignals,
} from '../capacity-guard.js';
import { readSettings } from '../settings.js';

const SETTINGS = readSettings({}); // $50, 5%
const DAY = '2026-10-17';
const signals = (cost: number | null | Error, rate: number | null | Error): GuardSignals => ({
  dailyCost: async () => { if (cost instanceof Error) throw cost; return cost === null ? null : { usd: cost, day: DAY }; }, // prettier-ignore
  callErrorRate: async () => { if (rate instanceof Error) throw rate; return rate; }, // prettier-ignore
});

describe('readGuard', () => {
  it('ok under both ceilings, naming the day the cost is for', async () => {
    expect(await readGuard(signals(49.99, 0.05), SETTINGS)).toEqual({ state: 'ok', costUsd: 49.99, costDay: DAY, errorRate: 0.05, reasons: [] }); // prettier-ignore
  });

  it('tripped over the cost ceiling or the call-error ceiling', async () => {
    expect(await readGuard(signals(50.01, 0.01), SETTINGS)).toMatchObject({ state: 'tripped', reasons: ['cost'] }); // prettier-ignore
    expect(await readGuard(signals(10, 0.051), SETTINGS)).toMatchObject({ state: 'tripped', reasons: ['error-rate'] }); // prettier-ignore
    expect(await readGuard(signals(80, null), SETTINGS)).toMatchObject({ state: 'tripped', reasons: ['cost', 'error-rate-unmeasured'] }); // prettier-ignore
  });

  it('unmeasured when a signal is missing or throws, never ok', async () => {
    expect(await readGuard(signals(null, 0.01), SETTINGS)).toMatchObject({ state: 'unmeasured', reasons: ['cost-unmeasured'], costDay: null }); // prettier-ignore
    expect(await readGuard(signals(10, new Error('bq down')), SETTINGS)).toMatchObject({ state: 'unmeasured', errorRate: null }); // prettier-ignore
  });

  it('uses the ceilings from settings', async () => {
    expect((await readGuard(signals(30, 0.01), readSettings({ costCeilingUsd: 25 }))).state).toBe('tripped'); // prettier-ignore
  });
});

describe('bigQuerySignals', () => {
  const TABLE = { BILLING_EXPORT_TABLE: 'some-project.billing.export_table' };
  const reply =
    (status: number, body: unknown, sent: string[] = []) =>
    async (_url: string, init: RequestInit) => {
      // prettier-ignore
      sent.push(JSON.parse(String(init.body)).query as string);
      return new Response(JSON.stringify(body), { status });
    };
  const rows = (...r: Array<Array<string | null>>) => ({ jobComplete: true, rows: r.map((f) => ({ f: f.map((v) => ({ v })) })) }); // prettier-ignore
  const token = async () => 't';

  it('reads the table named by BILLING_EXPORT_TABLE, and unset means unmeasured (no query)', async () => {
    const sent: string[] = [];
    await bigQuerySignals(
      TABLE,
      reply(200, rows(['2026-10-17', '12', 'true']), sent),
      token
    ).dailyCost();
    expect(sent[0]).toContain('`some-project.billing.export_table`');
    const none: string[] = [];
    expect(await bigQuerySignals({}, reply(200, rows(), none), token).dailyCost()).toBeNull();
    expect(await bigQuerySignals({ BILLING_EXPORT_TABLE: 'x`; DROP' }, reply(200, rows(), none), token).dailyCost()).toBeNull(); // prettier-ignore
    expect(none).toEqual([]);
  });

  it('takes yesterday once the export has settled for it, else the day before', async () => {
    const settled = rows(['2026-10-17', '61.5', 'true'], ['2026-10-16', '20', 'true']);
    expect(await bigQuerySignals(TABLE, reply(200, settled), token).dailyCost()).toEqual({ day: '2026-10-17', usd: 61.5 }); // prettier-ignore
    const lagging = rows(['2026-10-17', '3.1', 'false'], ['2026-10-16', '48', 'true']);
    expect(await bigQuerySignals(TABLE, reply(200, lagging), token).dailyCost()).toEqual({ day: '2026-10-16', usd: 48 }); // prettier-ignore
    expect(await bigQuerySignals(TABLE, reply(200, rows(['2026-10-17', '3', 'false'])), token).dailyCost()).toBeNull(); // prettier-ignore
  });

  it('asks BigQuery for both days with their settled flag', () => {
    const sql = costSql('p.d.t');
    expect(sql).toContain('INTERVAL 2 DAY');
    expect(sql).toMatch(/MAX\(export_time\) >= TIMESTAMP_ADD\(.*INTERVAL 6 HOUR\) AS settled/);
  });

  it('reads the call error share, null for too few calls or a missing table', async () => {
    expect(await bigQuerySignals(TABLE, reply(200, rows(['3', '40'])), token).callErrorRate()).toBe(0.075); // prettier-ignore
    expect(await bigQuerySignals(TABLE, reply(200, rows(['1', String(MIN_CALLS - 1)])), token).callErrorRate()).toBeNull(); // prettier-ignore
    expect(await bigQuerySignals(TABLE, reply(404, { error: 'not found' }), token).callErrorRate()).toBeNull(); // prettier-ignore
  });
});
