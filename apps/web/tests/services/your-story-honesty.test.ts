/**
 * Your Story must never show demo data as the user's own.
 *
 * Before: an API error made fetchYourStory return the demo story (127
 * conversations, 45 days), which passed the panel's "real data" check and
 * rendered without the demo banner.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const apiGet = vi.fn();
vi.mock('../../src/utils/api.js', () => ({ apiGet: (...args: unknown[]) => apiGet(...args) }));

const dashboard = { showLoading: vi.fn(), show: vi.fn(), showStatus: vi.fn() };
const fetchVisualizationData = vi.fn();
const hasAnyVisualizationData = vi.fn();
let demoEnabled = false;

vi.mock('../../src/services/engagement-demo-data.js', () => ({
  isDemoDataEnabled: () => demoEnabled,
  getDemoTeamHuddle: vi.fn(),
}));

vi.mock('../../src/ui/lazy-screens.js', async () => {
  const service = await import('../../src/services/your-story.service.js');
  const { createDemoStoryData } = await import('../../src/ui/visualizations/api/demo-data.js');
  return {
    loadYourStory: async () => [
      { getYourStoryUI: () => dashboard },
      service,
      { createDemoStoryData, fetchVisualizationData, hasAnyVisualizationData },
    ],
  };
});

const { fetchYourStory } = await import('../../src/services/your-story.service.js');
const { showYourStoryDashboard } = await import('../../src/app/panel-methods.js');

/** A demo story's tell: the fixed numbers from createDemoStoryData. */
function isDemoStory(data: unknown): boolean {
  const analytics = (data as { analytics?: { conversations?: number; daysTogether?: number } })
    ?.analytics;
  return analytics?.conversations === 127 && analytics?.daysTogether === 45;
}

describe('Your Story honesty', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    demoEnabled = false;
    localStorage.setItem('ferni_user_id', 'user-1');
    fetchVisualizationData.mockResolvedValue({});
    hasAnyVisualizationData.mockReturnValue(false);
  });

  it('fetchYourStory reports an API failure instead of returning demo data', async () => {
    apiGet.mockResolvedValue({ ok: false, status: 500, error: 'boom' });
    const result = await fetchYourStory();
    expect(isDemoStory(result)).toBe(false);
    expect(result).toEqual({ status: 'error' });
  });

  it('fetchYourStory reports a thrown request as an error', async () => {
    apiGet.mockRejectedValue(new Error('offline'));
    expect(await fetchYourStory()).toEqual({ status: 'error' });
  });

  it('on API error with nothing in Firestore, the panel shows the error state, never demo data', async () => {
    apiGet.mockResolvedValue({ ok: false, status: 503, error: 'down' });
    await showYourStoryDashboard();

    const shownDemo = dashboard.show.mock.calls.some(([data]) => isDemoStory(data));
    expect(shownDemo).toBe(false);
    expect(dashboard.showStatus).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('on API error, never shows a story pieced together in the browser with made-up header numbers', async () => {
    // What the old in-browser Firestore fallback returned (with its 0.5 / "calm" defaults)
    fetchVisualizationData.mockResolvedValue({
      moodCalendar: {
        entries: [{ date: '2026-10-03', mood: 'calm', intensity: 0.5 }],
        summary: { dominantMood: 'calm', calmDays: 1, trend: 'stable' },
      },
    });
    hasAnyVisualizationData.mockReturnValue(true);
    apiGet.mockResolvedValue({ ok: false, status: 503, error: 'down' });

    await showYourStoryDashboard();

    expect(dashboard.show).not.toHaveBeenCalled();
    expect(dashboard.showStatus).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('with no story on the server, shows the empty state even if the browser could read something', async () => {
    fetchVisualizationData.mockResolvedValue({ openLoops: { loops: [], totalOpen: 1 } });
    hasAnyVisualizationData.mockReturnValue(true);
    apiGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: { success: true, data: emptyStory() },
    });

    await showYourStoryDashboard();

    expect(dashboard.show).not.toHaveBeenCalled();
    expect(dashboard.showStatus).toHaveBeenCalledWith('empty', expect.any(Function));
  });

  it('a new user with an empty story sees the empty state, not demo data', async () => {
    apiGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: { success: true, data: emptyStory() },
    });
    await showYourStoryDashboard();

    expect(dashboard.show).not.toHaveBeenCalled();
    expect(dashboard.showStatus).toHaveBeenCalledWith('empty', expect.any(Function));
  });

  it('a real story renders without the demo banner', async () => {
    const story = emptyStory();
    story.header.totalConversations = 3;
    story.header.daysTogether = 2;
    apiGet.mockResolvedValue({ ok: true, status: 200, data: { success: true, data: story } });
    await showYourStoryDashboard();

    expect(dashboard.show).toHaveBeenCalledTimes(1);
    const [data, options] = dashboard.show.mock.calls[0];
    expect((data as { analytics: { conversations: number } }).analytics.conversations).toBe(3);
    expect(options).toBeUndefined();
  });

  it('the energy ring carries only what the API measured: one overall score, no social score', async () => {
    const story = emptyStory();
    story.header.totalConversations = 3;
    story.energy = { overall: 64, label: 'Good', trend: 'stable', recommendation: null };
    apiGet.mockResolvedValue({ ok: true, status: 200, data: { success: true, data: story } });

    const result = await fetchYourStory();

    expect(result.status).toBe('ok');
    const rings = (result as { data: { energyRings: unknown } }).data.energyRings;
    expect(rings).toEqual({ overall: 64, label: 'Good', recommendation: undefined });
  });

  it('demo data appears only behind the demo flag, and always with the banner', async () => {
    demoEnabled = true;
    await showYourStoryDashboard();

    expect(apiGet).not.toHaveBeenCalled();
    expect(dashboard.show).toHaveBeenCalledWith(expect.anything(), { showDemoBanner: true });
  });
});

function emptyStory() {
  return {
    header: {
      greeting: '',
      tagline: '',
      daysTogether: 0,
      totalConversations: 0,
      currentStreak: 0,
      longestStreak: 0,
    },
    relationship: { stage: 'new', stageLabel: 'New', progress: 0, nextStage: null, tagline: '' },
    energy: null as null | {
      overall: number;
      label: string;
      trend: string;
      recommendation: string | null;
    },
    // The other sections as the server sends them with no data
    moodCalendar: null,
    lifeChapters: [],
    emotionalArc: null,
    yourWorld: null,
    openLoops: null,
    prediction: null,
    lastUpdated: '2026-10-03T00:00:00.000Z',
  };
}
