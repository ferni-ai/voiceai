/**
 * Prediction tracker: the web panel reads what GET /api/predictions really sends.
 *
 * Before: showPredictionTracker had its fetch commented out ("backend not
 * implemented yet") long after the route shipped, so every real user got an
 * all-zero dashboard. This feeds the real handler's output (only Firestore is
 * faked) into the web's real mapper.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';
import type { StoredPrediction } from '../services/engagement/engagement-store.js';

const getRecentPredictions = vi.fn();
const getProfile = vi.fn();
vi.mock('../services/engagement/engagement-store.js', () => ({
  getEngagementStore: async () => ({ getRecentPredictions, getProfile }),
}));

const { handleGetPredictions } = await import('../api/routes/predictions.js');
const { toPredictionTrackerData } =
  await import('../../apps/web/src/services/prediction-tracker-data.js');

async function getPredictions(): Promise<{ status: number; body: Record<string, unknown> }> {
  const out = { status: 0, body: {} as Record<string, unknown> };
  const req = {
    method: 'GET',
    url: '/api/predictions',
    headers: { host: 'localhost', 'x-firebase-uid': 'signed-in-user' },
  } as unknown as IncomingMessage;
  const res = {
    setHeader: vi.fn(),
    writeHead(status: number) {
      out.status = status;
      return this;
    },
    end(chunk?: string) {
      if (chunk) out.body = JSON.parse(chunk);
    },
  } as unknown as ServerResponse;
  await handleGetPredictions(req, res, new URL('http://localhost/api/predictions'));
  return out;
}

const recent = new Date().toISOString();

function prediction(id: string, accuracy?: number): StoredPrediction {
  return {
    id,
    weekOf: '2026-09-28',
    predictions: { 'Mood average (1-10)': 7 },
    ...(accuracy === undefined ? {} : { accuracy, completedAt: recent }),
    createdAt: recent,
  };
}

beforeEach(() => {
  getRecentPredictions.mockReset();
  getProfile.mockReset();
});

describe('GET /api/predictions → prediction tracker', () => {
  it('shows the scored predictions the server returns, not zeros', async () => {
    // Newest first, as Firestore returns them.
    getRecentPredictions.mockResolvedValue([
      prediction('p5'),
      prediction('p4', 90),
      prediction('p3', 80),
      prediction('p2', 40),
      prediction('p1', 75),
    ]);
    getProfile.mockResolvedValue({ stats: { totalPredictions: 9, predictionAccuracy: 50 } });

    const { status, body } = await getPredictions();
    expect(status).toBe(200);
    expect(getRecentPredictions).toHaveBeenCalledWith('signed-in-user', 20);

    expect(toPredictionTrackerData(body)).toEqual({
      overallAccuracy: 71, // (90 + 80 + 40 + 75) / 4, computed by the server
      totalPredictions: 9, // the profile counter, not just this page of results
      correctPredictions: 3, // 90, 80, 75 are at or above 70
      byCategory: [],
      recentTrend: [75, 40, 80, 90], // oldest to newest
      currentStreak: 2, // 90, 80 before the miss at 40
      bestStreak: 2,
    });
  });

  it('reports no data (not a zero dashboard) for a user with no predictions', async () => {
    getRecentPredictions.mockResolvedValue([]);
    getProfile.mockResolvedValue({ stats: { totalPredictions: 0, predictionAccuracy: 0 } });

    const { status, body } = await getPredictions();
    expect(status).toBe(200);
    expect(body.predictions).toEqual([]);
    expect(toPredictionTrackerData(body)).toBeNull();
  });

  it('counts unscored predictions without inventing accuracy for them', async () => {
    getRecentPredictions.mockResolvedValue([prediction('p2'), prediction('p1')]);
    getProfile.mockResolvedValue({ stats: { totalPredictions: 2, predictionAccuracy: 0 } });

    const { body } = await getPredictions();
    const data = toPredictionTrackerData(body);
    expect(data?.totalPredictions).toBe(2);
    expect(data?.correctPredictions).toBe(0);
    expect(data?.recentTrend).toEqual([]);
    expect(data?.currentStreak).toBe(0);
  });
});
