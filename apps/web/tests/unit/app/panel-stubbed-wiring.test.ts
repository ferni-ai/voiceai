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

vi.mock('../../../src/services/engagement-demo-data.js', () => ({
  isDemoDataEnabled: () => false,
  getDemoTeamHuddle: vi.fn(),
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
