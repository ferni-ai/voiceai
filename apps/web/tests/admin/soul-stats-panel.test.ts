/**
 * The Avatar Soul counts on the Human Listening panel against faked answers
 * shaped like src/api/v1/admin/soul-stats.ts sends them: server numbers labelled
 * "last 24 h", "not measured: <reason>" with no number when the server has none,
 * and "unavailable (HTTP n)" when the request fails (#4069). No request leaves the test.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
vi.mock('../../src/admin/admin-fetch.js', () => ({
  adminFetch: (url: string, init?: RequestInit) => fetchMock(url, init),
}));

import { loadSoulStats, renderSoulStats } from '../../src/admin/sections/soul-stats-panel.js';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });
const at = (iso: string) => `at ${iso}`;

async function panel(answer: Response): Promise<HTMLElement> {
  fetchMock.mockResolvedValueOnce(answer);
  const el = document.createElement('div');
  el.innerHTML = renderSoulStats(await loadSoulStats(), at);
  return el;
}

beforeEach(() => fetchMock.mockReset());

describe('Avatar Soul counts on the Human Listening panel', () => {
  it('reads the admin soul stats route', async () => {
    await panel(json({ measured: false, reason: 'SOUL_STATS is off' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/admin/soul/stats', undefined);
  });

  it('measured false: says "not measured" with the reason, and shows no number', async () => {
    const el = await panel(json({ measured: false, reason: 'SOUL_STATS is off' }));
    expect(el.textContent).toContain('not measured: SOUL_STATS is off');
    expect(el.textContent).not.toMatch(/\d/);
    expect(el.querySelector('.soul-stat-value')).toBeNull();
  });

  it('a failed request: "unavailable (HTTP 500)", and no number', async () => {
    const el = await panel(json({ error: 'boom' }, 500));
    expect(el.textContent).toContain('unavailable (HTTP 500)');
    expect(el.querySelector('.soul-stat-value')).toBeNull();
  });

  it('measured: the server counts, each labelled last 24 h, and when they were last reported', async () => {
    const el = await panel(
      json({
        measured: true,
        windowHours: 24,
        microExpressions: 41,
        protectiveModes: 3,
        comfortPulses: 0,
        memorySparks: 7,
        lastUpdated: '2026-11-19T07:12:00.000Z',
      })
    );
    const values = [...el.querySelectorAll('.soul-stat-value')].map((v) => [v.id, v.textContent]);
    expect(values).toEqual([
      ['soulMicroExpressions', '41'],
      ['soulProtectiveModes', '3'],
      ['soulComfortPulses', '0'], // a measured 0 is drawn as 0
      ['soulMemorySparks', '7'],
    ]);
    const labels = [...el.querySelectorAll('.soul-stat-label')].map((l) => l.textContent);
    expect(labels).toEqual([
      'Micro-Expressions (last 24 h)',
      'Protective Modes (last 24 h)',
      'Comfort Pulses (last 24 h)',
      'Memory Sparks (last 24 h)',
    ]);
    expect(el.textContent).toContain('Last report at 2026-11-19T07:12:00.000Z.');
  });

  it('measured with nothing reported: zeros, and says nothing was reported', async () => {
    const el = await panel(
      json({
        measured: true,
        windowHours: 24,
        microExpressions: 0,
        protectiveModes: 0,
        comfortPulses: 0,
        memorySparks: 0,
        lastUpdated: null,
      })
    );
    expect(el.textContent).toContain('Nothing reported in the last 24 h.');
  });
});
