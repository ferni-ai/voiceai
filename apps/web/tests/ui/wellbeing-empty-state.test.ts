/**
 * Wellbeing dashboard: users with no data see the empty state.
 *
 * Before: the "has data" check compared an ISO timestamp to a date-only
 * string, which is never equal, so every user "had data" and saw six 50%
 * placeholder scores built from the server's neutral 0.5 defaults.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/utils/api-helpers.js', () => ({
  getApiHeadersAsync: vi.fn().mockResolvedValue({ Authorization: 'Bearer t' }),
}));

const { showWellbeingDashboard, cleanupWellbeingDashboard } =
  await import('../../src/ui/wellbeing-dashboard.ui.js');

const NOW = '2026-10-03T12:34:56.000Z';

function respond(dashboard: unknown, status = 200): void {
  globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
    const isTrends = String(url).includes('/trends');
    const body = isTrends
      ? { userId: 'u', period: 'month', dataPoints: [], averages: {} }
      : dashboard;
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
}

function dashboardBody(currentState: unknown, extra: Record<string, unknown> = {}) {
  return {
    userId: 'u',
    currentState,
    trends: { period: 'week', direction: 'stable', changedDimensions: [] },
    insights: [],
    warnings: [],
    streaks: { currentDays: 0, bestDays: 0, lastCheckIn: '' },
    ...extra,
  };
}

const content = () => document.getElementById('wellbeing-content');

describe('wellbeing dashboard empty state', () => {
  beforeEach(() => {
    cleanupWellbeingDashboard();
    document.body.innerHTML = '';
  });

  it('shows the empty state when the server says there is no data', async () => {
    respond(dashboardBody(null, { hasData: false }));
    await showWellbeingDashboard();

    expect(content()?.querySelector('.wellbeing-empty')).not.toBeNull();
    expect(content()?.querySelector('.wellbeing-dimension-card')).toBeNull();
  });

  it('shows the empty state for an older server that sent 0.5 placeholders and no check-in', async () => {
    const placeholders = {
      mood: 0.5,
      energy: 0.5,
      anxiety: 0.5,
      connection: 0.5,
      purpose: 0.5,
      sleep: 0.5,
      lastUpdated: NOW,
    };
    respond(dashboardBody(placeholders));
    await showWellbeingDashboard();

    expect(content()?.querySelector('.wellbeing-empty')).not.toBeNull();
    expect(content()?.textContent).not.toContain('50');
  });

  it('renders only the dimensions that were actually measured', async () => {
    const measured = {
      mood: 0.9,
      energy: null,
      anxiety: null,
      connection: null,
      purpose: null,
      sleep: 0.2,
      lastUpdated: NOW,
    };
    respond(
      dashboardBody(measured, {
        hasData: true,
        streaks: { currentDays: 1, bestDays: 1, lastCheckIn: NOW },
      })
    );
    await showWellbeingDashboard();

    const cards = content()?.querySelectorAll('.wellbeing-dimension-card') ?? [];
    expect(cards.length).toBe(2);
  });

  it('shows the error state, not the empty state, when the load fails', async () => {
    respond({ error: 'boom' }, 500);
    await showWellbeingDashboard();

    expect(content()?.querySelector('.wellbeing-error')).not.toBeNull();
    expect(content()?.querySelector('.wellbeing-empty')).toBeNull();
  });
});
