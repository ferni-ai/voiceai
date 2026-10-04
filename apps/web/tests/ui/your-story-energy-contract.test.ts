/**
 * Your Story energy: the REAL server output, through the REAL web transform,
 * into the REAL ring component.
 *
 * Before: the server had one real number (the average of the user's energy
 * readings, or 72 when there were none) and invented the rest: emotional
 * = avg x 1.04, mental = avg x 0.94, canned labels. The web then passed
 * { overall, dimensions } to a component that reads top-level
 * emotional/mental/physical, so three rings drew "undefined%".
 *
 * Now: one ring, the real overall; no readings -> no energy, no rings.
 * Only auth, the capacity-guardian store, and the web's HTTP call are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';

vi.mock('../../../../src/api/auth-middleware.js', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'u1', isAdmin: false })),
  rateLimit: vi.fn(() => false),
}));

const guardian = vi.hoisted(() => ({
  readings: [] as Array<{ energyScore: number }>,
}));
vi.mock('../../../../src/services/superhuman/capacity-guardian.js', () => ({
  loadEnergyHistory: vi.fn(async () => guardian.readings),
  assessBurnoutRisk: vi.fn(async () => ({
    risk: 'low',
    recommendations: ['A walk after lunch has helped you before.'],
  })),
}));

const apiGet = vi.fn();
vi.mock('../../src/utils/api.js', () => ({ apiGet: (...a: unknown[]) => apiGet(...a) }));

const { handleYourStoryRoutes } = await import('../../../../src/api/your-story-routes.js');
const { fetchYourStory } = await import('../../src/services/your-story.service.js');
const { buildEnergyRings } = await import('../../src/ui/visualizations/builders/energy-rings.js');
const { getYourStoryUI } = await import('../../src/ui/your-story-dashboard.ui.js');

/** GET /api/your-story/section/energy from the real route handler. */
async function serverEnergy(): Promise<unknown> {
  let payload = '';
  const req = { method: 'GET', url: '/api/your-story/section/energy', headers: {} };
  const res = {
    headersSent: false,
    setHeader: vi.fn(),
    writeHead: vi.fn(),
    end: vi.fn((chunk?: string) => {
      payload = chunk ?? '';
    }),
  };
  const path = '/api/your-story/section/energy';
  await handleYourStoryRoutes(
    req as unknown as IncomingMessage,
    res as unknown as ServerResponse,
    path,
    new URL(path, 'http://x')
  );
  return (JSON.parse(payload) as { data: unknown }).data;
}

/** The web's story, with the server's real energy section in it. */
async function webStoryWith(energy: unknown) {
  const story = {
    header: {
      greeting: '',
      tagline: '',
      daysTogether: 4,
      totalConversations: 3,
      currentStreak: 1,
      longestStreak: 1,
    },
    relationship: { stage: 'new', stageLabel: 'New', progress: 10, nextStage: null, tagline: '' },
    energy,
    moodCalendar: {
      month: 10,
      year: 2026,
      days: [],
      summary: { calmDays: 0, dominantMood: 'neutral', trend: 'stable' },
    },
    growth: { overallScore: 0, dimensions: [], strongest: '', growthEdge: '', narrative: '' },
    lifeChapters: [],
    recoveryPath: {
      currentPhase: '',
      phaseLabel: '',
      progress: 0,
      emotionalIntensity: 0,
      phases: [],
    },
    yourWorld: {
      totalConnections: 0,
      activeConnections: 0,
      needsAttention: 0,
      categories: [],
      topConnections: [],
    },
    openLoops: {
      total: 0,
      closedThisWeek: 0,
      byPriority: { high: 0, medium: 0, low: 0 },
      items: [],
    },
    prediction: {
      metric: '',
      currentValue: 0,
      predictedValue: 0,
      changePercent: 0,
      confidence: 0,
      trackRecord: 0,
      timeframe: '',
      range: { conservative: 0, expected: 0, optimistic: 0 },
      insight: '',
      alsoTracking: [],
    },
    lastUpdated: '2026-10-04T00:00:00.000Z',
  };
  apiGet.mockResolvedValue({ ok: true, status: 200, data: { success: true, data: story } });
  const result = await fetchYourStory();
  if (result.status !== 'ok') throw new Error(`story not ok: ${result.status}`);
  return result.data;
}

const mobile = {
  type: 'mobile' as const,
  platform: 'web' as const,
  width: 390,
  height: 844,
  prefersReducedMotion: true,
};

describe('Your Story energy ring', () => {
  beforeEach(() => {
    localStorage.setItem('ferni_user_id', 'u1');
    apiGet.mockReset();
  });

  it('draws one ring from the real average of energy readings, with no invented dimensions', async () => {
    guardian.readings = [{ energyScore: 60 }, { energyScore: 70 }];

    const energy = (await serverEnergy()) as Record<string, unknown>;
    expect(energy.overall).toBe(65);
    expect(energy).not.toHaveProperty('emotional');
    expect(energy).not.toHaveProperty('mental');
    expect(energy).not.toHaveProperty('physical');

    const data = await webStoryWith(energy);
    const container = document.createElement('div');
    buildEnergyRings(container, data.energyRings!, mobile);

    expect(container.querySelectorAll('.viz-ring__progress')).toHaveLength(1);
    expect(container.textContent).toContain('65%');
    expect(container.textContent).not.toMatch(/undefined|NaN|emotional|mental|physical/i);
    expect(container.textContent).toContain('A walk after lunch has helped you before.');
  });

  it('has no energy, and no rings, when there are no readings (no default 72)', async () => {
    guardian.readings = [];

    const energy = await serverEnergy();
    expect(energy).toBeNull();

    const data = await webStoryWith(energy);
    expect(data.energyRings).toBeUndefined();
    expect(data.burnoutGauge).toBeUndefined();

    // The real dashboard leaves no empty ring frame behind.
    getYourStoryUI().show(data);
    expect(document.querySelector('.your-story__section')).not.toBeNull();
    expect(document.getElementById('viz-energy-rings')).toBeNull();
    expect(document.getElementById('viz-burnout-gauge')).toBeNull();
  });
});
