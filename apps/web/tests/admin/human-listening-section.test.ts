/**
 * Human Listening no longer shows the avatar's field data (#4069, L6): the soul
 * stats moved to Avatar Soul, and Human Listening keeps one line saying so with
 * a link there. Every request the section makes is recorded; none leaves the test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/admin/admin-api.js', () => ({
  getAdminHeadersAsync: () => Promise.resolve({}),
}));

const { render } = await import('../../src/admin/sections/HumanListeningSection.js');

const requested: string[] = [];

beforeEach(() => {
  requested.length = 0;
  vi.stubGlobal('fetch', (url: string) => {
    requested.push(url);
    const body = url.endsWith('/metrics')
      ? {
          measured: true,
          windowHours: 24,
          totalSessions: 2,
          distressDetections: 0,
          avgCognitiveLoad: 0.2,
          avgEngagement: 0.5,
          selfSoothingDetections: 0,
          hedgingDetections: 0,
          tremorDetections: 0,
          energyFadeDetections: 0,
        }
      : [];
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  });
});

afterEach(() => vi.unstubAllGlobals());

async function section(): Promise<HTMLElement> {
  const el = document.createElement('div');
  el.innerHTML = await render();
  return el;
}

describe('the Human Listening section', () => {
  it('reads its own listening routes and never the soul stats', async () => {
    await section();
    expect(requested).toContain('/api/v1/admin/human-listening/metrics');
    expect(requested.filter((url) => url.includes('/soul/stats'))).toEqual([]);
  });

  it('shows no soul counts, only a line saying they moved and a link to Avatar Soul', async () => {
    const el = await section();
    expect(el.querySelector('.soul-stat-value')).toBeNull();
    expect(el.querySelector('.soul-stats-note')).toBeNull();
    const card = el.querySelector('.listening-soul-response');
    expect(card?.textContent).toContain(
      "How often each avatar moment played on people's calls is now on Avatar Soul."
    );
    const link = card?.querySelector('a[data-navigate="avatar-soul"]');
    expect(link?.getAttribute('href')).toBe('#avatar-soul');
  });
});
