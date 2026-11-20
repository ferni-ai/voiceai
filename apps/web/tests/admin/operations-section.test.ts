/**
 * Operations (#4069 W11): the section's Refresh reads the operations data once more, past
 * the server's cache, and redraws the section in place. It used to do nothing: no handler
 * knew "refresh-ops". The click stays in the section, so the portal's delegated
 * [data-action] handlers (whose "refresh" posts a flags reload and reloads the page) never
 * see it. A metric the server could not read shows the server's reason, never a 0.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const requests: Array<{ path: string; method: string }> = [];
let requestCount = 120;
let uiOverride: Record<string, unknown> = {};

const uiServer = () => ({
  latencyMs: { p50: 32, p95: 128, p99: 460.8 },
  errorRate: 0.1,
  requestCount,
  instances: 2,
  missing: {},
  ...uiOverride,
});
const unmeasured = (reason: string) => ({
  latencyMs: { p50: null, p95: null, p99: null },
  errorRate: null,
  requestCount: null,
  instances: null,
  missing: { latencyMs: reason, errorRate: reason, requestCount: reason, instances: reason },
});

vi.mock('../../src/admin/admin-fetch.js', () => ({
  adminFetch: async (path: string, init: RequestInit = {}) => {
    requests.push({ path, method: init.method ?? 'GET' });
    if (!path.startsWith('/api/v1/admin/operations')) return new Response('{}', { status: 404 });
    const body = {
      services: [
        {
          id: 'voice-agent',
          name: 'Voice Agent',
          status: 'not-measured',
          responseTime: null,
          reason: 'not measured: the voice agent runs on LiveKit Cloud',
          critical: true,
          lastChecked: new Date().toISOString(),
        },
      ],
      metrics: {
        windowMinutes: 60,
        uiServer: uiServer(),
        voiceAgent: unmeasured('not measured: the voice agent runs on LiveKit Cloud'),
      },
      budget: { name: null, limit: null, spent: null, percentage: null, currency: 'USD' },
      links: { dashboard: '#', uptime: '#', alerts: '#', logs: '#', budget: '#' },
      lastUpdated: new Date().toISOString(),
    };
    return new Response(JSON.stringify(body), { status: 200 });
  },
}));

const content = (): string => document.getElementById('adminContent')?.textContent ?? '';

async function openOperations(): Promise<void> {
  window.history.replaceState({}, '', '/admin?section=operations');
  document.body.innerHTML = '<div id="app"></div>';
  const { initAdminPortal } = await import('../../src/admin/index.js');
  await initAdminPortal();
  await vi.waitFor(() => expect(content()).toContain('120 requests in the last 60 min'));
}

describe('Operations section', () => {
  beforeEach(() => {
    vi.resetModules();
    requests.length = 0;
    requestCount = 120;
    uiOverride = {};
  });

  it('Refresh makes one fresh operations request and redraws, with nothing else sent', async () => {
    await openOperations();
    const portalSaw = vi.fn();
    document.getElementById('adminPortal')?.addEventListener('click', portalSaw);
    requests.length = 0;
    requestCount = 250;

    document.querySelector<HTMLButtonElement>('[data-action="refresh-ops"]')?.click();

    await vi.waitFor(() => expect(content()).toContain('250 requests in the last 60 min'));
    expect(requests).toEqual([{ path: '/api/v1/admin/operations?fresh=1', method: 'GET' }]);
    expect(portalSaw).not.toHaveBeenCalled(); // never reaches the flags reload / page reload
    // The redrawn section is wired again: a second Refresh works too
    requestCount = 300;
    document.querySelector<HTMLButtonElement>('[data-action="refresh-ops"]')?.click();
    await vi.waitFor(() => expect(content()).toContain('300 requests in the last 60 min'));
  });

  it('shows the reason beside a missing p95/p99, not a bare dash', async () => {
    const reason = 'no data: Cloud Monitoring sent no p95 or p99 for this window';
    uiOverride = { latencyMs: { p50: 32, p95: null, p99: null }, missing: { latencyMs: reason } };
    await openOperations();
    const values = Array.from(document.querySelectorAll('.ops-latency-value')).map(
      (el) => el.textContent?.trim() ?? ''
    );
    expect(values).toEqual(['32ms', reason, reason]);
  });

  it('shows the server reason for what it could not measure, never 0', async () => {
    await openOperations();
    const text = content();
    expect(text).toContain('not measured: the voice agent runs on LiveKit Cloud');
    expect(text).toContain('Not checked');
    expect(text).not.toMatch(/\b0ms\b|\b0\.00%/);
    // The UI server's real numbers are drawn as read
    expect(text).toContain('32ms');
    expect(text).toContain('461ms');
    expect(text).toContain('10.00%');
    expect(text).toContain('2 instances now');
  });
});
