/**
 * Memory Lane and Team Insights: a failed load shows an error, never the empty
 * state. Memory Lane ignored a failed response and showed "no memories yet";
 * Team Insights swallowed the failure and returned an empty list plus a made-up
 * `budgetOnTrack: true`, so its error state never appeared, and Refresh still
 * toasted "updated". Team Insights' loaded state is pinned here too.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockApiGet = vi.fn();
const mockToast = { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() };

vi.mock('../../src/utils/api.js', () => ({ apiGet: mockApiGet, apiPatch: vi.fn() }));
vi.mock('../../src/services/firebase-auth.service.js', () => ({
  getAuthState: () => ({ isAuthenticated: true, userId: 'u1' }),
}));
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast: mockToast, whisper: mockToast }));
vi.mock('../../src/utils/api-helpers.js', () => ({
  getApiHeadersAsync: async () => ({}),
  getUserId: () => 'u1',
}));
vi.mock('../../src/services/authed-websocket.service.js', () => ({
  openAuthedWebSocket: vi.fn(() => null),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

/** Fresh modules per test: both panels keep module state, and setup.ts empties the body. */
async function load<T>(path: string): Promise<T> {
  vi.resetModules();
  return (await import(path)) as T;
}

beforeEach(() => {
  mockApiGet.mockReset();
  mockFetch.mockReset();
  Object.values(mockToast).forEach((fn) => fn.mockReset());
});

describe('Memory Lane', () => {
  type Panel = typeof import('../../src/ui/memory-lane.ui.js');

  afterEach(async () => {
    const { closeMemoryLane } = await import('../../src/ui/memory-lane.ui.js');
    closeMemoryLane();
  });

  it('a server error shows the error, not "no memories yet"', async () => {
    mockApiGet.mockResolvedValue({ ok: false, status: 500, error: 'boom' });
    const { openMemoryLane } = await load<Panel>('../../src/ui/memory-lane.ui.js');

    await openMemoryLane();

    const content = document.getElementById('memory-lane-content');
    // (tests run without locale files, so t() answers with the key)
    expect(content?.querySelector('.memory-lane-error')?.textContent).toMatch(
      /memoryLane\.loadError|couldn't load your memories/
    );
    expect(content?.querySelector('.ferni-empty-state')).toBeNull();
  });

  it('no memories at all is still the empty state', async () => {
    mockApiGet.mockResolvedValue({ ok: true, status: 200, data: { memories: [] } });
    const { openMemoryLane } = await load<Panel>('../../src/ui/memory-lane.ui.js');

    await openMemoryLane();

    const content = document.getElementById('memory-lane-content');
    expect(content?.querySelector('.ferni-empty-state')).not.toBeNull();
    expect(content?.querySelector('.memory-lane-error')).toBeNull();
  });
});

describe('Team Insights', () => {
  type Panel = typeof import('../../src/ui/team-insights.ui.js');
  const shown = (selector: string) =>
    (document.querySelector(selector) as HTMLElement | null)?.style.display;

  afterEach(async () => {
    const { disposeTeamInsightsUI } = await import('../../src/ui/team-insights.ui.js');
    disposeTeamInsightsUI();
  });

  it('a server error shows the error state, not an empty list', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const { teamInsightsUI } = await load<Panel>('../../src/ui/team-insights.ui.js');

    teamInsightsUI.init();
    await teamInsightsUI.refresh();

    expect(shown('.team-insights-error')).toBe('flex');
    expect(shown('.team-insights-empty')).toBe('none');
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it('no insights at all is still the empty state', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ insights: [], teamStatus: null }),
    });
    const { teamInsightsUI } = await load<Panel>('../../src/ui/team-insights.ui.js');

    teamInsightsUI.init();
    await teamInsightsUI.refresh();

    expect(shown('.team-insights-empty')).toBe('block');
    expect(shown('.team-insights-error')).toBe('none');
  });

  it('an insight from the server shows as a card, not the empty or error state', async () => {
    const insight = {
      id: 'insight_1',
      source: 'maya',
      category: 'behavior_pattern',
      summary: 'Walks after dinner stick.',
      content: 'Walks after dinner stick. | Context: it keeps coming up',
      priority: 'normal',
      createdAt: Date.now() - 60_000,
      isNew: false,
    };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ insights: [insight], teamStatus: null }),
    });
    const { teamInsightsUI } = await load<Panel>('../../src/ui/team-insights.ui.js');

    teamInsightsUI.init();
    await teamInsightsUI.refresh();

    expect(shown('.team-insights-list')).toBe('flex');
    const card = document.querySelector('.team-insight-card[data-insight-id="insight_1"]');
    expect(card?.querySelector('.insight-context')?.textContent).toBe('Walks after dinner stick.');
    expect(shown('.team-insights-empty')).toBe('none');
    expect(shown('.team-insights-error')).toBe('none');
  });
});
