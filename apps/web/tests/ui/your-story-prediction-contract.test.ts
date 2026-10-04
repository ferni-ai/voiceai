/**
 * Your Story "Where You're Headed": the REAL server forecast, through the
 * REAL web transform, into the REAL dashboard section.
 *
 * Before: the server returned the same canned forecast for everyone
 * ("Emotional Wellbeing" 68 -> 78, confidence 82, 84% track record), with or
 * without any data. Now the forecast is a trend over the user's real energy
 * readings, with a stated method, or nothing when there are too few.
 *
 * Only auth, the energy-reading store and the web's HTTP call are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';

vi.mock('../../../../src/api/auth-middleware.js', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'u1', isAdmin: false })),
  rateLimit: vi.fn(() => false),
}));

const guardian = vi.hoisted(() => ({
  readings: [] as Array<{ timestamp: number; energyScore: number }>,
}));
vi.mock('../../../../src/services/superhuman/capacity-guardian.js', () => ({
  loadEnergyHistory: vi.fn(async () => guardian.readings),
  assessBurnoutRisk: vi.fn(async () => ({ risk: 'low', recommendations: [] })),
}));

const apiGet = vi.fn();
vi.mock('../../src/utils/api.js', () => ({ apiGet: (...a: unknown[]) => apiGet(...a) }));

const { handleYourStoryRoutes } = await import('../../../../src/api/your-story-routes.js');
const { fetchYourStory } = await import('../../src/services/your-story.service.js');
const { getYourStoryUI } = await import('../../src/ui/your-story-dashboard.ui.js');

const DAY = 24 * 60 * 60 * 1000;

/** GET /api/your-story/section/prediction from the real route handler. */
async function serverPrediction(): Promise<Record<string, unknown> | null> {
  let payload = '';
  const path = '/api/your-story/section/prediction';
  const res = {
    headersSent: false,
    setHeader: vi.fn(),
    writeHead: vi.fn(),
    end: vi.fn((chunk?: string) => {
      payload = chunk ?? '';
    }),
  };
  await handleYourStoryRoutes(
    { method: 'GET', url: path, headers: {} } as unknown as IncomingMessage,
    res as unknown as ServerResponse,
    path,
    new URL(path, 'http://x')
  );
  return (JSON.parse(payload) as { data: Record<string, unknown> | null }).data;
}

/** The dashboard, showing a story whose prediction is the server's. */
async function dashboardWith(prediction: unknown): Promise<void> {
  const story = {
    header: {
      greeting: '',
      tagline: '',
      daysTogether: 9,
      totalConversations: 12,
      currentStreak: 2,
      longestStreak: 4,
    },
    relationship: {
      stage: 'friend',
      stageLabel: 'Building Trust',
      progress: 40,
      nextStage: null,
      tagline: '',
    },
    energy: null,
    // The other sections as the server sends them with no data
    moodCalendar: null,
    lifeChapters: [],
    emotionalArc: null,
    yourWorld: null,
    openLoops: null,
    prediction,
    lastUpdated: '2026-10-04T00:00:00.000Z',
  };
  apiGet.mockResolvedValue({ ok: true, status: 200, data: { success: true, data: story } });
  const result = await fetchYourStory();
  if (result.status !== 'ok') throw new Error(`story not ok: ${result.status}`);
  getYourStoryUI().show(result.data);
}

describe('Your Story prediction', () => {
  beforeEach(() => {
    localStorage.setItem('ferni_user_id', 'u1');
    apiGet.mockReset();
  });

  it('forecasts from a real trend: rising readings give a rising forecast with its basis', async () => {
    const now = Date.now();
    // 8 readings over 8 days, rising ~2 points a day with a little scatter.
    guardian.readings = [50, 53, 54, 57, 58, 61, 62, 65].map((score, i) => ({
      timestamp: now - (7 - i) * DAY,
      energyScore: score,
    }));

    const prediction = await serverPrediction();

    expect(prediction).not.toBeNull();
    expect(prediction).toMatchObject({
      metric: 'Energy',
      timeframe: '2 weeks',
      readings: 8,
      days: 8,
    });
    const current = prediction!.currentValue as number;
    const predicted = prediction!.predictedValue as number;
    expect(current).toBeGreaterThanOrEqual(63);
    expect(current).toBeLessThanOrEqual(66);
    expect(predicted).toBeGreaterThan(current + 20); // ~2/day for 14 days
    const range = prediction!.range as Record<string, number>;
    expect(range.conservative).toBeLessThan(range.expected);
    expect(range.optimistic).toBeGreaterThanOrEqual(range.expected);
    expect(prediction!.confidence).toBeGreaterThan(0.95); // tight, steady trend
    expect(prediction!.basis).toMatch(/^From 8 energy readings over 8 days: rising/);
    expect(prediction).not.toHaveProperty('trackRecord');

    await dashboardWith(prediction);
    const section = document.getElementById('viz-predictions');
    expect(section).not.toBeNull();
    expect(section!.textContent).toContain(String(predicted));
    expect(section!.textContent).toContain(prediction!.basis as string);
    expect(section!.textContent).not.toMatch(/track record|Emotional Wellbeing|undefined|NaN/);
  });

  it('has no forecast, and no section, without enough readings (no canned 68 -> 78)', async () => {
    const now = Date.now();
    guardian.readings = [60, 62, 61].map((score, i) => ({
      timestamp: now - i * DAY,
      energyScore: score,
    }));

    const prediction = await serverPrediction();
    expect(prediction).toBeNull();

    await dashboardWith(prediction);
    expect(document.querySelector('.your-story__section')).not.toBeNull();
    expect(document.getElementById('viz-predictions')).toBeNull();
  });
});
