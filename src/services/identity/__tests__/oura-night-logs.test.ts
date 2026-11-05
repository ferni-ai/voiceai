/**
 * Oura logs carry the endpoint, the HTTP status and an error name, never a sleep value.
 * A JSON parse error's message quotes the body it choked on, so the error is logged by name.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const access = vi.hoisted(() => ({ get: vi.fn() }));
const logged = vi.hoisted(() => [] as unknown[]);
vi.mock('../oura-auth.js', () => ({ getOuraAccessToken: access.get }));
vi.mock('../../../utils/safe-logger.js', () => {
  const keep = (...args: unknown[]) => void logged.push(args);
  return { createLogger: () => ({ debug: keep, info: keep, warn: keep, error: keep }) };
});

const { getOuraNight } = await import('../oura-night.js');

const NOW = Date.parse('2026-10-28T14:00:00Z');
// Sleep values no log line may carry.
const SECRET_VALUES = ['72', '23460', '38', '47', '63'];
const NIGHT = {
  data: [{ day: '2026-10-28', score: 72, contributors: { deep_sleep: 57 } }],
};
const PERIOD = {
  data: [
    {
      day: '2026-10-28',
      type: 'long_sleep',
      total_sleep_duration: 23460,
      average_hrv: 38,
      lowest_heart_rate: 47,
    },
  ],
};

/** Each endpoint answers with a status and a raw body string. */
function oura(replies: Record<string, { status: number; raw: string }>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL | string) => {
      const endpoint = new URL(String(input)).pathname.split('/').pop() ?? '';
      const { status, raw } = replies[endpoint] ?? { status: 404, raw: '{}' };
      return { ok: status < 300, status, json: async () => JSON.parse(raw) };
    })
  );
}

beforeEach(() => {
  logged.length = 0;
  access.get.mockResolvedValue({ status: 'ok', token: 'tok-1' });
});
afterEach(() => vi.unstubAllGlobals());

describe('oura-night logs', () => {
  it('a body that is not JSON is logged by error name, not by the text it quoted', async () => {
    oura({
      daily_sleep: { status: 200, raw: JSON.stringify(NIGHT) },
      sleep: { status: 200, raw: JSON.stringify(PERIOD) },
      daily_readiness: { status: 200, raw: 'score 63 hrv 38 lowest 47 total 23460' },
    });

    const result = await getOuraNight('u1', undefined, NOW);

    expect(result.status).toBe('ok'); // the night is still read
    expect(logged).toEqual([
      [{ endpoint: 'daily_readiness', error: 'SyntaxError' }, 'Oura collection request failed'],
    ]);
  });

  it('a failed read logs endpoint and status only', async () => {
    oura({
      daily_sleep: { status: 200, raw: JSON.stringify(NIGHT) },
      sleep: { status: 503, raw: JSON.stringify(PERIOD) },
      daily_readiness: { status: 500, raw: '{"score": 63}' },
    });

    await getOuraNight('u1', undefined, NOW);

    const text = JSON.stringify(logged);
    expect(logged.length).toBe(2);
    for (const value of SECRET_VALUES) expect(text).not.toContain(value);
    expect(logged).toContainEqual([
      { endpoint: 'sleep', status: 503 },
      'Oura collection read failed',
    ]);
  });
});
