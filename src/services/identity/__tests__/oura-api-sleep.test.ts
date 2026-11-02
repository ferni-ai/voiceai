/**
 * Oura reports sleep efficiency as a percentage already (87 means 87%). The summary once
 * multiplied it by 100 and called it the score, so a night at 87 read as 8700.
 */
import { describe, expect, it, vi } from 'vitest';

const oura = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../self-healing/resilient-http.js', () => ({
  createResilientClient: () => ({ get: oura.get }),
}));
vi.mock('../oura-auth.js', () => ({
  getValidAccessToken: async () => 'token-1',
  getOuraAccessToken: async () => ({ status: 'ok', token: 'token-1' }),
}));

const { getSleepSummary } = await import('../oura-api.js');

const PERIOD = {
  id: 'sl-1',
  day: '2026-10-28',
  bedtime_start: '2026-10-27T22:51:30-04:00',
  bedtime_end: '2026-10-28T06:58:30-04:00',
  type: 'long_sleep',
  efficiency: 87,
  latency: 660,
  total_sleep_duration: 23460,
  rem_sleep_duration: 4740,
  deep_sleep_duration: 4290,
  light_sleep_duration: 14430,
  awake_time: 2640,
  average_hrv: 38,
  average_heart_rate: 53.5,
  lowest_heart_rate: 47,
  average_breath: 15.6,
  restless_periods: 134,
};

describe('getSleepSummary efficiency', () => {
  it('efficiency 87 is score 87 and efficiency 87, not 8700', async () => {
    oura.get.mockResolvedValue({ status: 200, data: { data: [PERIOD] } });
    const result = await getSleepSummary('u1', '2026-10-28');
    expect(result.success).toBe(true);
    expect(result.data?.score).toBe(87);
    expect(result.data?.efficiency).toBe(87);
    expect(result.data?.totalSleep).toBe(391);
  });
});
