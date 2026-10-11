/**
 * Visual storytelling saves report the API result.
 *
 * The api helpers never throw; they return { ok }. A save must report
 * failure when the response is not ok, so the UI does not show "Saved!".
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/utils/api.js', () => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { apiGet, apiPut, apiPost } from '../../src/utils/api.js';

const storyData = {
  sleepPattern: null,
  relationship: {
    stage: 'building-trust',
    stageIndex: 2,
    progressPercent: 60,
    daysTogether: 30,
    conversationCount: 15,
    currentStreak: 5,
    longestStreak: 10,
    warmthConfig: {},
  },
  teaserEligibility: { history: true, goals: true, team: true, patterns: true, wellbeing: true },
  milestones: [
    {
      id: 'first-hello',
      type: 'greeting',
      title: 'First Hello',
      emoji: 'wave',
      celebratedAt: null,
      personaId: 'ferni',
      progressPercent: 100,
    },
  ],
  teamProgress: [],
  lastUpdated: new Date().toISOString(),
};

async function loadInitialisedService() {
  vi.resetModules();
  vi.mocked(apiGet).mockResolvedValue({ ok: true, status: 200, data: structuredClone(storyData) });
  const mod = await import('../../src/services/visual-storytelling.service.js');
  await mod.visualStorytellingService.init('test-user-id');
  return mod.visualStorytellingService;
}

describe('visual storytelling save results', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('updateSleepPattern returns false and fires no event when the API response is not ok', async () => {
    vi.mocked(apiPut).mockResolvedValue({ ok: false, status: 500, error: 'server error' });
    const service = await loadInitialisedService();
    const onUpdated = vi.fn();
    window.addEventListener('ferni:sleep-pattern-updated', onUpdated);

    const success = await service.updateSleepPattern({ wakeTime: 9 });

    window.removeEventListener('ferni:sleep-pattern-updated', onUpdated);
    expect(success).toBe(false);
    expect(onUpdated).not.toHaveBeenCalled();
    expect(service.getData()?.sleepPattern).toBeNull();
  });

  it('updateSleepPattern returns true when the API response is ok', async () => {
    vi.mocked(apiPut).mockResolvedValue({ ok: true, status: 200 });
    const service = await loadInitialisedService();

    expect(await service.updateSleepPattern({ wakeTime: 9 })).toBe(true);
  });

  it('celebrateMilestone returns false and leaves the milestone uncelebrated when not ok', async () => {
    vi.mocked(apiPost).mockResolvedValue({ ok: false, status: 503, error: 'unavailable' });
    const service = await loadInitialisedService();

    const success = await service.celebrateMilestone('first-hello');

    expect(success).toBe(false);
    expect(service.getMilestones()[0]?.celebratedAt).toBeNull();
  });

  it('celebrateMilestone returns true when the API response is ok', async () => {
    vi.mocked(apiPost).mockResolvedValue({ ok: true, status: 200 });
    const service = await loadInitialisedService();

    expect(await service.celebrateMilestone('first-hello')).toBe(true);
  });
});
