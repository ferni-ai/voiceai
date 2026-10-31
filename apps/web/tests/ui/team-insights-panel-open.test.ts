/**
 * The "What we've been thinking" panel must not spin forever.
 *
 * The panel's markup starts in its loading state. Opening it within a minute of
 * the background check (which fetches while the panel is closed) used to skip
 * both the fetch and the redraw, so the spinner never went away even though
 * GET /api/team-insights had answered.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/utils/api-helpers.js', () => ({
  getApiHeadersAsync: vi.fn(async () => ({})),
  getUserId: vi.fn(() => null),
}));
vi.mock('../../src/services/authed-websocket.service.js', () => ({
  openAuthedWebSocket: vi.fn(),
}));

const teamStatus = {
  financialHealth: { budgetOnTrack: true, savingsProgress: 0 },
  habitHealth: { activeHabits: 0, totalStreakDays: 0, keystoneActive: false },
  goalHealth: { activeGoals: 0, nearingCompletion: 0 },
  emotionalContext: 'neutral',
  topConcern: null,
};

function panelState(): string {
  const loading = document.querySelector<HTMLElement>('.team-insights-loading');
  return loading?.style.display ?? 'missing';
}

describe('team insights panel open', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ insights: [], teamStatus }), { status: 200 }))
    );
  });

  afterEach(async () => {
    const { teamInsightsUI } = await import('../../src/ui/team-insights.ui.js');
    teamInsightsUI.dispose();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('opening right after the background check draws the data, not the spinner', async () => {
    const { teamInsightsUI } = await import('../../src/ui/team-insights.ui.js');
    teamInsightsUI.init();
    await teamInsightsUI.checkForNew(); // panel closed: fetches, marks the data fresh

    teamInsightsUI.open();

    expect(panelState()).toBe('none');
    expect(document.querySelector<HTMLElement>('.team-insights-empty')?.style.display).toBe('block');
  });

  it('a panel set up again after dispose opens drawn, not stuck loading', async () => {
    const { teamInsightsUI } = await import('../../src/ui/team-insights.ui.js');
    teamInsightsUI.init();
    teamInsightsUI.open();
    await vi.waitFor(() => expect(panelState()).toBe('none'));

    teamInsightsUI.dispose(); // the open panel goes away with its fresh data
    teamInsightsUI.init();
    teamInsightsUI.toggle();

    expect(document.querySelector('.team-insights-panel')?.classList.contains('is-open')).toBe(true);
    expect(panelState()).toBe('none');
  });
});
