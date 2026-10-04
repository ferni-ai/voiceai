/**
 * Panels whose API call was commented out "until the backend exists", long
 * after it did. Each test feeds the server's real response shape (copied from
 * the handler, see the comments) into the real panel function.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock('../../../src/utils/api.js', () => ({ apiGet, apiPost }));

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
vi.mock('../../../src/ui/whisper.ui.js', () => ({ toast }));

const trackerUI = { show: vi.fn() };
vi.mock('../../../src/ui/prediction-tracker.ui.js', () => ({
  getPredictionTrackerUI: () => trackerUI,
}));

const huddleUI = { showTeamHuddle: vi.fn() };
vi.mock('../../../src/ui/team-huddle.ui.js', () => huddleUI);

vi.mock('../../../src/services/engagement-demo-data.js', () => ({
  isDemoDataEnabled: () => false,
  getDemoTeamHuddle: vi.fn(),
}));

const storyUI = { showLoading: vi.fn(), show: vi.fn(), showStatus: vi.fn() };
const story = {
  fetchYourStory: vi.fn(),
  fetchVisualizationData: vi.fn(),
  hasAnyVisualizationData: vi.fn(),
};
vi.mock('../../../src/ui/lazy-screens.js', () => ({
  loadYourStory: async () => [
    { getYourStoryUI: () => storyUI },
    { fetchYourStory: story.fetchYourStory },
    {
      createDemoStoryData: vi.fn(),
      fetchVisualizationData: story.fetchVisualizationData,
      hasAnyVisualizationData: story.hasAnyVisualizationData,
    },
  ],
}));

const panels = await import('../../../src/app/panel-methods.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('showPredictionTracker', () => {
  // Body of GET /api/predictions as src/api/routes/predictions.ts builds it
  // (src/tests/prediction-tracker-contract.test.ts runs the real handler).
  const serverBody = {
    predictions: [
      {
        id: 'p3',
        weekOf: '2026-09-28',
        predictions: { 'Deep work hours': 10 },
        createdAt: '2026-10-01T00:00:00.000Z',
      },
      {
        id: 'p2',
        weekOf: '2026-09-21',
        predictions: { 'Deep work hours': 8 },
        actuals: { 'Deep work hours': 7 },
        accuracy: 88,
        createdAt: '2026-09-24T00:00:00.000Z',
        completedAt: '2026-09-28T00:00:00.000Z',
      },
      {
        id: 'p1',
        weekOf: '2026-09-14',
        predictions: { 'Deep work hours': 8 },
        actuals: { 'Deep work hours': 4 },
        accuracy: 50,
        createdAt: '2026-09-17T00:00:00.000Z',
        completedAt: '2026-09-21T00:00:00.000Z',
      },
    ],
    stats: { totalPredictions: 3, averageAccuracy: 69, pendingCount: 1, expiredCount: 0 },
  };

  it('loads GET /api/predictions and shows the real numbers', async () => {
    apiGet.mockResolvedValueOnce({ ok: true, status: 200, data: serverBody });

    await panels.showPredictionTracker();

    expect(apiGet).toHaveBeenCalledWith('/api/predictions');
    expect(trackerUI.show).toHaveBeenCalledWith({
      overallAccuracy: 69,
      totalPredictions: 3,
      correctPredictions: 1,
      byCategory: [],
      recentTrend: [50, 88],
      currentStreak: 1,
      bestStreak: 1,
    });
  });

  it('says there are no predictions yet instead of showing a zero dashboard', async () => {
    apiGet.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        predictions: [],
        stats: { totalPredictions: 0, averageAccuracy: 0, pendingCount: 0, expiredCount: 0 },
      },
    });

    await panels.showPredictionTracker();

    expect(trackerUI.show).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledTimes(1);
  });

  it('reports a failed load instead of showing zeros as if they were real', async () => {
    apiGet.mockResolvedValueOnce({ ok: false, status: 500, error: 'boom' });

    await panels.showPredictionTracker();

    expect(trackerUI.show).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Couldn't load your predictions. Try again?");
  });
});

describe('showTeamHuddle', () => {
  // Body of POST /api/huddles/start as src/api/routes/team.ts sends it
  // (src/tests/team-huddle-start-contract.test.ts runs the real handler).
  const huddle = {
    id: 'huddle_1759600000000_abc123def',
    title: 'Team Check-in',
    topic: 'Weekly check-in on your progress',
    intro: 'The team wanted to share something with you.',
    outro: "That's what we're seeing.",
    participants: [
      {
        personaId: 'ferni',
        name: 'Ferni',
        initials: 'F',
        comment: 'Every conversation we have teaches me something new about you.',
        avatarColor: 'var(--persona-ferni-primary)',
      },
    ],
    status: 'active',
    startedAt: '2026-10-04T16:00:00.000Z',
    type: 'weekly',
    scheduledAt: '2026-10-04T16:00:00.000Z',
  };

  it('starts a real huddle via POST /api/huddles/start and shows it', async () => {
    apiPost.mockResolvedValueOnce({ ok: true, status: 200, data: { success: true, huddle } });

    await panels.showTeamHuddle();

    expect(apiPost).toHaveBeenCalledWith('/api/huddles/start', {
      topic: 'Weekly check-in on your progress',
      type: 'weekly',
    });
    expect(huddleUI.showTeamHuddle).toHaveBeenCalledWith(huddle);
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('says the start failed instead of "isn\'t ready yet"', async () => {
    apiPost.mockResolvedValueOnce({ ok: false, status: 500, error: 'boom' });

    await panels.showTeamHuddle();

    expect(huddleUI.showTeamHuddle).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Couldn't start a team huddle. Try again?");
  });
});
