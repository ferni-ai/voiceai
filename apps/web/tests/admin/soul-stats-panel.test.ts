/**
 * The Avatar Soul counts panel, rendered on its own, against faked answers
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
import { SOUL_COUNT_KEYS as KEYS } from '../../src/services/soul-stats.service.js';

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

describe('the Avatar Soul counts panel', () => {
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

  it('measured: the eleven server counts, each labelled last 24 h, and when last reported', async () => {
    const el = await panel(
      json({
        measured: true,
        windowHours: 24,
        counts: {
          micro_expression: 41,
          protective_mode: 3,
          comfort_pulse: 0,
          memory_spark: 7,
          warmth_bloom: 12,
          celebrate_growth: 2,
          cameo_arrival: 5,
          crisis_hold: 1,
          name_lift_brighten: 4,
          name_lift_attentive: 6,
          name_lift_comfort: 9,
        },
        lastUpdated: '2026-11-19T07:12:00.000Z',
      })
    );
    const values = [...el.querySelectorAll('.soul-stat-value')].map((v) => [v.id, v.textContent]);
    expect(values).toEqual([
      ['soulMicroExpressions', '41'],
      ['soulProtectiveModes', '3'],
      ['soulComfortPulses', '0'], // a measured 0 is drawn as 0
      ['soulMemorySparks', '7'],
      ['soulWarmthBlooms', '12'],
      ['soulGrowthCelebrations', '2'],
      ['soulCameoArrivals', '5'],
      ['soulCrisisHolds', '1'],
      ['soulNameLiftsBrighten', '4'],
      ['soulNameLiftsAttentive', '6'],
      ['soulNameLiftsComfort', '9'],
    ]);
    const labels = [...el.querySelectorAll('.soul-stat-label')].map((l) => l.textContent);
    expect(labels).toEqual([
      'Micro-Expressions (last 24 h)',
      'Protective Modes (last 24 h)',
      'Comfort Pulses (last 24 h)',
      'Memory Sparks (last 24 h)',
      'Warmth Blooms (last 24 h)',
      'Growth Celebrations (last 24 h)',
      'Cameo Arrivals (last 24 h)',
      'Crisis Holds (last 24 h)',
      'Name Lifts, Brighten (last 24 h)',
      'Name Lifts, Attentive (last 24 h)',
      'Name Lifts, Comfort (last 24 h)',
    ]);
    expect(el.textContent).toContain('Last report at 2026-11-19T07:12:00.000Z.');
  });

  it('measured with nothing reported: eleven zeros, and says nothing was reported', async () => {
    const counts = Object.fromEntries(KEYS.map((k) => [k, 0]));
    const el = await panel(json({ measured: true, windowHours: 24, counts, lastUpdated: null }));
    const values = [...el.querySelectorAll('.soul-stat-value')].map((v) => v.textContent);
    expect(values).toEqual(Array(11).fill('0'));
    expect(el.textContent).toContain('Nothing reported in the last 24 h.');
  });

  it('measured but a count is missing: that tile says not measured, never a made-up 0', async () => {
    const counts = Object.fromEntries(KEYS.filter((k) => k !== 'crisis_hold').map((k) => [k, 2]));
    const el = await panel(json({ measured: true, windowHours: 24, counts, lastUpdated: null }));
    expect(el.querySelector('#soulCrisisHolds')?.textContent).toBe(
      'not measured: the server sent no count for this moment'
    );
    expect(el.querySelector('#soulWarmthBlooms')?.textContent).toBe('2');
  });

  it('measured: the note says the tiles overlap, so they are not read as 11 separate moments', async () => {
    const counts = Object.fromEntries(KEYS.map((k) => [k, 1]));
    const el = await panel(json({ measured: true, windowHours: 24, counts, lastUpdated: null }));
    const note = el.querySelector('.soul-stats-note')?.textContent ?? '';
    expect(note).toContain(
      'The tiles overlap: a cameo arrival and a brighten or comfort name lift each also count a warmth bloom'
    );
    expect(note).toContain('so they are not 11 separate moments');
  });

  it('measured with no counts object at all: not measured, and no number', async () => {
    const el = await panel(json({ measured: true, windowHours: 24, lastUpdated: null }));
    expect(el.textContent).toContain('not measured: the server sent no counts');
    expect(el.querySelector('.soul-stat-value')).toBeNull();
  });
});
