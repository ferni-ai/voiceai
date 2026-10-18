/**
 * The capacity guard: skip over a ceiling, run (unmeasured) when a signal
 * can't be read, and the BigQuery reader's handling of what comes back.
 */
import { describe, expect, it } from 'vitest';
import { bigQuerySignals, MIN_CALLS, readGuard, type GuardSignals } from '../capacity-guard.js';
import { readSettings } from '../settings.js';

const SETTINGS = readSettings({}); // $50, 5%
const signals = (cost: number | null | Error, rate: number | null | Error): GuardSignals => ({
  yesterdayCostUsd: async () => { if (cost instanceof Error) throw cost; return cost; }, // prettier-ignore
  callErrorRate: async () => { if (rate instanceof Error) throw rate; return rate; }, // prettier-ignore
});

describe('readGuard', () => {
  it('ok under both ceilings', async () => {
    expect(await readGuard(signals(49.99, 0.05), SETTINGS)).toEqual({ state: 'ok', costUsd: 49.99, errorRate: 0.05, reasons: [] }); // prettier-ignore
  });

  it('tripped over the cost ceiling or the call-error ceiling', async () => {
    expect(await readGuard(signals(50.01, 0.01), SETTINGS)).toMatchObject({ state: 'tripped', reasons: ['cost'] }); // prettier-ignore
    expect(await readGuard(signals(10, 0.051), SETTINGS)).toMatchObject({ state: 'tripped', reasons: ['error-rate'] }); // prettier-ignore
    expect(await readGuard(signals(80, null), SETTINGS)).toMatchObject({ state: 'tripped', reasons: ['cost', 'error-rate-unmeasured'] }); // prettier-ignore
  });

  it('unmeasured when a signal is missing or throws, never ok', async () => {
    expect(await readGuard(signals(null, 0.01), SETTINGS)).toMatchObject({ state: 'unmeasured', reasons: ['cost-unmeasured'] }); // prettier-ignore
    expect(await readGuard(signals(10, new Error('bq down')), SETTINGS)).toMatchObject({ state: 'unmeasured', errorRate: null }); // prettier-ignore
  });

  it('uses the ceilings from settings', async () => {
    expect((await readGuard(signals(30, 0.01), readSettings({ costCeilingUsd: 25 }))).state).toBe('tripped'); // prettier-ignore
  });
});

describe('bigQuerySignals', () => {
  const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status }); // prettier-ignore
  const row = (...v: Array<string | null>) => ({ jobComplete: true, rows: [{ f: v.map((x) => ({ v: x })) }] }); // prettier-ignore
  const token = async () => 't';

  it('reads yesterday’s net cost and the call error share', async () => {
    expect(await bigQuerySignals(reply(200, row('42.5')), token).yesterdayCostUsd()).toBe(42.5);
    expect(await bigQuerySignals(reply(200, row('3', '40')), token).callErrorRate()).toBe(0.075);
  });

  it('answers null (unmeasured) for too few calls, no rows, a null sum or a missing table', async () => {
    expect(await bigQuerySignals(reply(200, row('1', String(MIN_CALLS - 1))), token).callErrorRate()).toBeNull(); // prettier-ignore
    expect(await bigQuerySignals(reply(200, row(null)), token).yesterdayCostUsd()).toBeNull();
    expect(await bigQuerySignals(reply(200, { jobComplete: true }), token).yesterdayCostUsd()).toBeNull(); // prettier-ignore
    expect(await bigQuerySignals(reply(404, { error: 'not found' }), token).callErrorRate()).toBeNull(); // prettier-ignore
  });
});
