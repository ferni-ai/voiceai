/**
 * Business Metrics asks for subscription metrics with the admin's credentials. The
 * endpoint answers only an admin, and on /admin the app never installs the fetch
 * wrapper that adds the sign-in token, so a plain fetch got 401 and an empty panel.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const adminGet = vi.fn(async (path: string) =>
  path === '/api/subscription/metrics'
    ? {
        ok: true,
        status: 200,
        data: { activeSubscribers: 7, mrr: 123, churnRate: 0, conversionRate: 0, recentEvents: [] },
      }
    : { ok: false, status: 404 }
);
vi.mock('../../src/admin/admin-api.js', () => ({ adminGet }));

describe('Business Metrics subscription metrics', () => {
  beforeEach(() => {
    adminGet.mockClear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 }))
    );
  });

  it('asks through adminGet and shows the answer', async () => {
    const section = await import('../../src/admin/sections/BusinessMetricsSection.js');
    document.body.innerHTML = section.render();
    await section.refresh();
    expect(adminGet).toHaveBeenCalledWith('/api/subscription/metrics');
    expect(fetch).not.toHaveBeenCalled();
  });
});
