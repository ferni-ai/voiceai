/**
 * One night of Oura sleep, from real-shaped Oura v2 payloads. Mocked: the caller's access
 * (oura-auth) and Oura's HTTP. Checks that every number is one Oura sent, that a field Oura
 * left out is null (never a default), and that "Oura said nothing" is not "no sleep recorded".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const access = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../oura-auth.js', () => ({ getOuraAccessToken: access.get }));

const { getOuraNight, buildNight } = await import('../oura-night.js');

// Shapes copied from Oura's v2 docs, with one night's values.
const DAILY_SLEEP = {
  data: [
    {
      id: 'ds-1',
      contributors: {
        deep_sleep: 57,
        efficiency: 98,
        latency: 81,
        rem_sleep: 20,
        restfulness: 54,
        timing: 84,
        total_sleep: 60,
      },
      day: '2026-10-28',
      score: 72,
      timestamp: '2026-10-28T00:00:00+00:00',
    },
  ],
  next_token: null,
};
const PERIOD = {
  id: 'sl-1',
  average_breath: 15.6,
  average_heart_rate: 53.5,
  average_hrv: 38,
  awake_time: 2640,
  bedtime_end: '2026-10-28T06:58:30-04:00',
  bedtime_start: '2026-10-27T22:51:30-04:00',
  day: '2026-10-28',
  deep_sleep_duration: 4290,
  efficiency: 89,
  latency: 660,
  light_sleep_duration: 14430,
  lowest_heart_rate: 47,
  rem_sleep_duration: 4740,
  restless_periods: 134,
  time_in_bed: 24420,
  total_sleep_duration: 23460,
  type: 'long_sleep',
};
const NAP = {
  ...PERIOD,
  id: 'sl-nap',
  type: 'late_nap',
  total_sleep_duration: 1800,
  time_in_bed: 1900,
};
const READINESS = {
  data: [
    {
      id: 'dr-1',
      contributors: {
        activity_balance: 56,
        body_temperature: 98,
        hrv_balance: 75,
        previous_day_activity: null,
        previous_night: 35,
        recovery_index: 47,
        resting_heart_rate: 94,
        sleep_balance: 73,
      },
      day: '2026-10-28',
      score: 63,
      temperature_deviation: -0.2,
      temperature_trend_deviation: 0.1,
      timestamp: '2026-10-28T00:00:00+00:00',
    },
  ],
  next_token: null,
};

const NOW = Date.parse('2026-10-28T14:00:00Z');
let calls: string[];

function oura(replies: Record<string, { status?: number; body?: unknown }>): void {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL | string) => {
      const url = new URL(String(input));
      calls.push(url.toString());
      const endpoint = url.pathname.split('/').pop() ?? '';
      const reply = replies[endpoint] ?? { status: 404, body: {} };
      const status = reply.status ?? 200;
      return { ok: status < 300, status, json: async () => reply.body ?? { data: [] } };
    })
  );
}

beforeEach(() => {
  access.get.mockReset();
  access.get.mockResolvedValue({ status: 'ok', token: 'tok-1' });
});
afterEach(() => vi.unstubAllGlobals());

describe('a night with data', () => {
  it('joins score, sleep period and readiness into the numbers Oura sent', async () => {
    oura({
      daily_sleep: { body: DAILY_SLEEP },
      sleep: { body: { data: [NAP, PERIOD] } },
      daily_readiness: { body: READINESS },
    });

    const result = await getOuraNight('u1', undefined, NOW);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.night.date).toBe('2026-10-28');
    expect(result.night.sleep).toMatchObject({
      score: 72,
      totalSleepMinutes: 391, // 23460 s, the long sleep, not the nap
      timeInBedMinutes: 407,
      efficiencyPercent: 89, // Oura's percent as sent, not x100
      latencyMinutes: 11,
      deepMinutes: 72,
      remMinutes: 79,
      awakeMinutes: 44,
      averageHrv: 38,
      lowestHeartRate: 47,
      contributors: {
        deep_sleep: 57,
        efficiency: 98,
        latency: 81,
        total_sleep: 60,
        restfulness: 54,
        timing: 84,
        rem_sleep: 20,
      },
    });
    expect(result.night.readiness?.contributors).not.toHaveProperty('previous_day_activity'); // Oura sent null
    expect(result.night.readiness).toMatchObject({
      score: 63,
      temperatureDeviation: -0.2,
      contributors: { hrv_balance: 75, sleep_balance: 73 },
    });
  });

  it('asks all three collections for the person, with a window around the night', async () => {
    oura({
      daily_sleep: { body: DAILY_SLEEP },
      sleep: { body: { data: [PERIOD] } },
      daily_readiness: { body: READINESS },
    });
    await getOuraNight('u1', '2026-10-28', NOW);
    expect(access.get).toHaveBeenCalledWith('u1');
    expect(calls.map((u) => new URL(u).pathname).sort()).toEqual([
      '/v2/usercollection/daily_readiness',
      '/v2/usercollection/daily_sleep',
      '/v2/usercollection/sleep',
    ]);
    for (const u of calls) {
      const q = new URL(u).searchParams;
      expect(q.get('start_date')).toBe('2026-10-27');
      expect(q.get('end_date')).toBe('2026-10-30');
    }
  });

  it('with no date, reads the latest night in the window, not an older one', async () => {
    const older = { ...DAILY_SLEEP.data[0], day: '2026-10-27', score: 90 };
    oura({
      daily_sleep: { body: { data: [older, DAILY_SLEEP.data[0]] } },
      sleep: { body: { data: [PERIOD] } },
      daily_readiness: { body: READINESS },
    });
    const result = await getOuraNight('u1', undefined, NOW);
    expect(result).toMatchObject({
      status: 'ok',
      night: { date: '2026-10-28', sleep: { score: 72 } },
    });
  });

  it('with a date, reads that night even when a later one exists', async () => {
    const older = { ...DAILY_SLEEP.data[0], day: '2026-10-26', score: 90 };
    const olderPeriod = { ...PERIOD, day: '2026-10-26', total_sleep_duration: 18000 };
    oura({
      daily_sleep: { body: { data: [older, DAILY_SLEEP.data[0]] } },
      sleep: { body: { data: [olderPeriod, PERIOD] } },
      daily_readiness: { body: { data: [] } },
    });
    const result = await getOuraNight('u1', '2026-10-26', NOW);
    expect(result).toMatchObject({
      status: 'ok',
      night: { date: '2026-10-26', sleep: { score: 90, totalSleepMinutes: 300 }, readiness: null },
    });
  });

  it('a field Oura left out is null, never a default', async () => {
    const thin = { ...DAILY_SLEEP.data[0], score: undefined };
    const period = { ...PERIOD, latency: undefined, average_hrv: null, efficiency: undefined };
    oura({
      daily_sleep: { body: { data: [thin] } },
      sleep: { body: { data: [period] } },
      daily_readiness: { body: { data: [] } },
    });
    const result = await getOuraNight('u1', undefined, NOW);
    expect(result.status === 'ok' && result.night.sleep).toMatchObject({
      score: null,
      latencyMinutes: null,
      averageHrv: null,
      efficiencyPercent: null,
      totalSleepMinutes: 391,
    });
  });

  it('readiness failing leaves sleep intact and readiness empty, not zero', async () => {
    oura({
      daily_sleep: { body: DAILY_SLEEP },
      sleep: { body: { data: [PERIOD] } },
      daily_readiness: { status: 500 },
    });
    const result = await getOuraNight('u1', undefined, NOW);
    expect(result).toMatchObject({
      status: 'ok',
      night: { sleep: { score: 72 }, readiness: null },
    });
  });
});

describe('when there is nothing to say', () => {
  it('a night with no documents is no_data, with the date asked', async () => {
    oura({
      daily_sleep: { body: { data: [] } },
      sleep: { body: { data: [] } },
      daily_readiness: { body: { data: [] } },
    });
    expect(await getOuraNight('u1', '2026-10-25', NOW)).toEqual({
      status: 'no_data',
      date: '2026-10-25',
    });
  });

  it('no nights at all in the window is no_data without a date', async () => {
    oura({
      daily_sleep: { body: { data: [] } },
      sleep: { body: { data: [] } },
      daily_readiness: { body: { data: [] } },
    });
    expect(await getOuraNight('u1', undefined, NOW)).toEqual({ status: 'no_data', date: null });
  });

  it('a nap alone is not a night', async () => {
    oura({
      daily_sleep: { body: { data: [] } },
      sleep: { body: { data: [NAP] } },
      daily_readiness: { body: { data: [] } },
    });
    expect(await getOuraNight('u1', undefined, NOW)).toMatchObject({ status: 'no_data' });
  });

  it('Oura not answering is unavailable, not "no sleep recorded"', async () => {
    oura({
      daily_sleep: { status: 503 },
      sleep: { status: 503 },
      daily_readiness: { status: 503 },
    });
    expect(await getOuraNight('u1', undefined, NOW)).toEqual({ status: 'unavailable' });
  });

  it.each(['not_connected', 'needs_reauth', 'unavailable'] as const)(
    '%s: says so and never calls Oura',
    async (status) => {
      access.get.mockResolvedValue({ status });
      oura({});
      expect(await getOuraNight('u1', undefined, NOW)).toEqual({ status });
      expect(calls).toEqual([]);
    }
  );
});

describe('buildNight', () => {
  it('keeps the longest real sleep period of the day', () => {
    const night = buildNight(
      '2026-10-28',
      null,
      [NAP, { ...PERIOD, total_sleep_duration: 3600 }, PERIOD],
      null
    );
    expect(night.sleep?.totalSleepMinutes).toBe(391);
  });
});
