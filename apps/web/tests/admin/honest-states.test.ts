/**
 * #4069 honest states: an admin screen shows a measurement, or says it has none.
 *
 * Each test fails if a fabricated value comes back: the fixed "+12%" badge,
 * zeros or "System Down" on a failed request, a "0%" block rate, the placeholder
 * corrections list, a "coming soon" button, an invented $50 budget, a dry run
 * reported as "complete", a missing score shown as 0.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/admin/admin-api.js', () => ({
  getAdminHeadersAsync: vi.fn(async () => ({ Authorization: 'Bearer admin-token' })),
}));

const toast = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast }));

type Route = { status: number; body?: unknown } | 'network-error';
let routes: Record<string, Route> = {};

const fetchMock = vi.fn(async (url: string) => {
  const route = Object.entries(routes).find(([prefix]) => String(url).startsWith(prefix))?.[1];
  if (!route || route === 'network-error') throw new TypeError('Failed to fetch');
  return new Response(JSON.stringify(route.body ?? {}), { status: route.status });
});

const source = (path: string): string => readFileSync(resolve(__dirname, '../..', path), 'utf8');

const textOf = (html: string): string => {
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('style').forEach((style) => style.remove());
  return div.textContent ?? '';
};

const stats = (system: Record<string, unknown>, conversations: Record<string, unknown> = {}) => ({
  agents: { total: 4, active: 4 },
  conversations: { today: 30, thisWeek: 150, trend: 'up', ...conversations },
  evalops: { totalEvaluations: 0, passRate: 0, flaggedCount: 0 },
  trust: { totalProfiles: 2, avgTrustScore: 0.5, activeRelationships: 1 },
  system: { uptime: 3600, responseTime: 120, errorRate: 0.02, activeSessions: 3, ...system },
});

beforeEach(() => {
  routes = {};
  fetchMock.mockClear();
  Object.values(toast).forEach((fn) => fn.mockClear());
  vi.stubGlobal('fetch', fetchMock);
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('shared unavailable state', () => {
  it('names the HTTP status, or a network error when nothing answered', async () => {
    const { unavailableReason, loadJson } = await import('../../src/utils/unavailable.js');
    expect(unavailableReason(401)).toBe('unavailable (HTTP 401)');
    expect(unavailableReason(0)).toBe('unavailable (network error)');
    routes = { '/x': 'network-error' };
    expect(await loadJson(fetch('/x'), 'x')).toEqual({
      unavailable: 'unavailable (network error)',
    });
  });
});

describe('Dashboard (DB2, DB4)', () => {
  it('draws no delta badge when the API sends no measured change', async () => {
    routes = {
      '/api/v1/admin/dashboard/health': {
        status: 200,
        body: { status: 'healthy', uptime: 60, services: [] },
      },
      '/api/v1/admin/dashboard/stats': { status: 200, body: stats({}) },
      '/api/v1/admin/dashboard/activity': { status: 200, body: { activity: [] } },
    };
    const { render } = await import('../../src/admin/sections/DashboardSection.js');
    document.body.innerHTML = await render();
    expect(document.body.textContent).not.toContain('+12%');
    expect(document.querySelector('.stat-change')).toBeNull();
  });

  it('a refused request shows its status, not "System Down" and zeros', async () => {
    routes = {
      '/api/v1/admin/dashboard/health': { status: 401 },
      '/api/v1/admin/dashboard/stats': { status: 401 },
      '/api/v1/admin/dashboard/activity': { status: 401 },
    };
    const { render } = await import('../../src/admin/sections/DashboardSection.js');
    const text = textOf(await render());
    expect(text).toContain('System health unavailable (HTTP 401)');
    expect(text).toContain('Stats unavailable (HTTP 401)');
    expect(text).toContain('Activity unavailable (HTTP 401)');
    expect(text).not.toContain('System Down');
    expect(text).not.toContain('0.00%');
    expect(text).not.toContain('0ms');
    expect(text).not.toContain('No recent activity');
  });

  it('values the server could not measure read "not measured", not 0', async () => {
    routes = {
      '/api/v1/admin/dashboard/health': {
        status: 200,
        body: { status: 'healthy', uptime: 60, services: [] },
      },
      '/api/v1/admin/dashboard/stats': {
        status: 200,
        body: stats({ responseTime: null, errorRate: null, activeSessions: null }, { today: null }),
      },
      '/api/v1/admin/dashboard/activity': { status: 200, body: { activity: [] } },
    };
    const { render } = await import('../../src/admin/sections/DashboardSection.js');
    const text = textOf(await render());
    expect(text.match(/not measured/g)?.length).toBe(4);
    expect(text).not.toContain('0.00%');
    expect(text).not.toContain('0ms');
  });
});

describe('Semantic Routing (SR1, SR2)', () => {
  const semantic = {
    aggregate: {
      totalRoutes: 0,
      bypassedLLM: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      cacheHitRate: 0,
      toolBreakdown: {},
      matchPathBreakdown: {},
    },
    abTests: { active: 0, experiments: [] },
    proactive: { suggestionsToday: 0, acceptanceRate: 0 },
    community: { totalPatterns: 0, avgConfidence: 0, lastAggregation: null },
    hourly: [],
    // Servers before #4069 sent this all-zero block; the section must not draw it
    learning: { totalCorrections: 0, correctionRate: 0, recentCorrections: [] },
  };

  it('a failed defense read shows its status, not a 0% block rate', async () => {
    routes = {
      '/api/observability/semantic-routing': { status: 200, body: semantic },
      '/api/observability/routing-dashboard': { status: 503 },
    };
    const mod = await import('../../src/admin/sections/SemanticRoutingSection.js');
    document.body.innerHTML = mod.render();
    await mod.refresh();
    expect(document.getElementById('threat-breakdown')?.textContent).toContain(
      'Defense metrics unavailable (HTTP 503)'
    );
    expect(document.getElementById('block-rate')?.textContent).not.toContain('0%');
  });

  it('a dashboard with no defense block says defense is not measured', async () => {
    routes = {
      '/api/observability/semantic-routing': { status: 200, body: semantic },
      '/api/observability/routing-dashboard': { status: 200, body: {} },
    };
    const mod = await import('../../src/admin/sections/SemanticRoutingSection.js');
    document.body.innerHTML = mod.render();
    await mod.refresh();
    expect(document.getElementById('threat-breakdown')?.textContent).toContain(
      'Defense metrics not measured'
    );
  });

  it('a failed semantic-routing load says so above the empty cards', async () => {
    routes = {
      '/api/observability/semantic-routing': { status: 502 },
      '/api/observability/routing-dashboard': { status: 200, body: {} },
    };
    const mod = await import('../../src/admin/sections/SemanticRoutingSection.js');
    document.body.innerHTML = mod.render();
    await mod.refresh();
    expect(document.getElementById('semantic-routing-status')?.textContent).toBe(
      'Semantic routing unavailable (HTTP 502)'
    );
    routes['/api/observability/semantic-routing'] = { status: 200, body: semantic };
    await mod.refresh();
    expect(document.getElementById('semantic-routing-status')?.textContent).toBe('');
  });

  it('lists an experiment without a made-up variant count', async () => {
    const experiment = { id: 'exp-1', name: 'Shorter greetings', status: 'running' };
    routes = {
      '/api/observability/semantic-routing': {
        status: 200,
        body: { ...semantic, abTests: { active: 1, experiments: [experiment] } },
      },
      '/api/observability/routing-dashboard': { status: 200, body: {} },
    };
    const mod = await import('../../src/admin/sections/SemanticRoutingSection.js');
    document.body.innerHTML = mod.render();
    await mod.refresh();
    const list = document.getElementById('ab-tests-list')?.textContent ?? '';
    expect(list).toContain('Shorter greetings');
    expect(list).not.toMatch(/variants/);
  });

  it('shows the correction rate as not measured and no placeholder corrections list', async () => {
    const mod = await import('../../src/admin/sections/SemanticRoutingSection.js');
    const html = mod.render();
    expect(textOf(html)).not.toContain('Recent Corrections');
    document.body.innerHTML = html;
    expect(document.getElementById('correction-rate')?.textContent).toContain('not measured');
  });
});

describe('Experiments (EX2, EX3)', () => {
  it('a failed load shows its status, not "No Experiments Yet" and zero counts', async () => {
    routes = { '/api/v1/admin/experiments': { status: 500 } };
    const { render } = await import('../../src/admin/sections/ExperimentsSection.js');
    const text = textOf(await render());
    expect(text).toContain('Experiments unavailable (HTTP 500)');
    expect(text).not.toContain('No Experiments Yet');
  });

  it('has no "New Experiment" button that only says coming soon', async () => {
    routes = {
      '/api/v1/admin/experiments': {
        status: 200,
        body: {
          experiments: [],
          summary: { total: 0, running: 0, completed: 0, draft: 0, paused: 0 },
        },
      },
    };
    const { render } = await import('../../src/admin/sections/ExperimentsSection.js');
    expect(await render()).not.toContain('create-experiment');
    expect(source('src/admin/sections/ExperimentsSection.ts')).not.toMatch(/coming soon/i);
  });
});

describe('Operations (OP5 and a failed load)', () => {
  const ops = (budget: Record<string, unknown>) => ({
    services: [],
    metrics: {
      latency: { voiceAgent: { p50: 1, p95: 1, p99: 1 }, uiServer: { p50: 1, p95: 1, p99: 1 } },
      errorRate: { voiceAgent: 0, uiServer: 0 },
      requestCount: { voiceAgent: 0, uiServer: 0 },
      instances: { voiceAgent: 1, uiServer: 1 },
    },
    budget: { spent: null, currency: 'USD', period: 'monthly', alertThresholds: [], ...budget },
    links: { dashboard: '#', uptime: '#', alerts: '#', logs: '#', budget: '#' },
    lastUpdated: new Date().toISOString(),
  });

  it('no budget found reads "No budget found", not a made-up $50 limit', async () => {
    routes = {
      '/api/v1/admin/operations': {
        status: 200,
        body: ops({ name: null, limit: null, percentage: null }),
      },
    };
    const { render } = await import('../../src/admin/sections/OperationsSection.js');
    const text = textOf(await render());
    expect(text).toContain('No budget found');
    expect(text).not.toContain('$50');
    expect(text).not.toContain('% used');
  });

  it('a named budget with no fixed amount says so, with no limit or bar', async () => {
    routes = {
      '/api/v1/admin/operations': {
        status: 200,
        body: ops({ name: 'Ferni monthly', limit: null, percentage: null }),
      },
    };
    const { render } = await import('../../src/admin/sections/OperationsSection.js');
    const text = textOf(await render());
    expect(text).toContain('Ferni monthly: no fixed limit');
    expect(text).not.toContain('% used');
  });

  it('a fixed budget shows its limit and says spend is not measured', async () => {
    routes = {
      '/api/v1/admin/operations': {
        status: 200,
        body: ops({ name: 'Ferni monthly', limit: 120, percentage: null }),
      },
    };
    const { render } = await import('../../src/admin/sections/OperationsSection.js');
    const text = textOf(await render());
    expect(text).toContain('$120 monthly');
    expect(text).toContain('Spend not measured (it needs the billing export)');
    expect(text).not.toMatch(/\$\d+ \/ \$120|% used/);
  });

  it('a failed load shows its status, not an all-zero "System Outage"', async () => {
    routes = { '/api/v1/admin/operations': 'network-error' };
    const { render } = await import('../../src/admin/sections/OperationsSection.js');
    const text = textOf(await render());
    expect(text).toContain('Operations unavailable (network error)');
    expect(text).not.toContain('System Outage');
  });
});

describe('EvalOps labels (EO3, EO6)', () => {
  it('a dry run is reported as nothing evaluated, not "EvalOps complete"', async () => {
    routes = { '/api/evalops/run-suite': { status: 200, body: { success: true, dry_run: true } } };
    const { runQuickAction } = await import('../../src/admin/admin-events.js');
    await runQuickAction('run-evalops');
    expect(toast.warning).toHaveBeenCalledWith('Dry run: nothing evaluated');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('a refused suite run says it did not run, not that it "found issues"', async () => {
    routes = { '/api/evalops/run-suite': { status: 400 } };
    const { runQuickAction } = await import('../../src/admin/admin-events.js');
    await runQuickAction('run-evalops');
    expect(toast.error).toHaveBeenCalledWith('EvalOps did not run: unavailable (HTTP 400)');
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('a voice check with no score never shows 0%', async () => {
    routes = { '/api/evalops/quick-check': { status: 200, body: { passed: true } } };
    const { runQuickVoiceCheck } = await import('../../src/admin/admin-events.js');
    await runQuickVoiceCheck();
    expect(toast.success).toHaveBeenCalledWith('Voice check passed (no score returned)');
  });

  it('a refused voice check says it did not run, with the status', async () => {
    routes = { '/api/evalops/quick-check': { status: 400 } };
    const { runQuickVoiceCheck } = await import('../../src/admin/admin-events.js');
    await runQuickVoiceCheck();
    expect(toast.error).toHaveBeenCalledWith('Voice check did not run: unavailable (HTTP 400)');
  });
});
