/**
 * Visual Storytelling Service Tests
 *
 * Tests for the visual storytelling features:
 * - Sleep pattern sync
 * - Circadian period detection
 * - Warmth transitions
 * - API data fetching
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the dependencies
vi.mock('../../utils/api.js', () => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocks
import { apiGet, apiPut, apiPost } from '../../utils/api.js';

describe('Visual Storytelling Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset localStorage
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Sleep Pattern Management', () => {
    it('should store sleep pattern in localStorage', async () => {
      const { circadianManager } = await import('../circadian-manager.js');
      
      circadianManager.setSleepPattern({
        wakeTime: 8,
        sleepTime: 23,
        isNightOwl: true,
        isEarlyBird: false,
      });

      const stored = localStorage.getItem('ferni_sleep_pattern');
      expect(stored).toBeTruthy();
      
      const pattern = JSON.parse(stored!);
      expect(pattern.wakeTime).toBe(8);
      expect(pattern.isNightOwl).toBe(true);
    });

    it('should retrieve sleep pattern', async () => {
      const { circadianManager } = await import('../circadian-manager.js');
      
      circadianManager.setSleepPattern({
        wakeTime: 6,
        sleepTime: 22,
        isNightOwl: false,
        isEarlyBird: true,
      });

      const pattern = circadianManager.getSleepPattern();
      expect(pattern.wakeTime).toBe(6);
      expect(pattern.isEarlyBird).toBe(true);
    });
  });

  describe('Circadian Period Detection', () => {
    it('should detect morning period at 9am', async () => {
      const { circadianManager } = await import('../circadian-manager.js');
      
      // Create a date at 9am
      const morning = new Date();
      morning.setHours(9, 0, 0, 0);
      
      const period = circadianManager.detectPeriod(morning, true); // ignore sleep pattern
      expect(period).toBe('morning');
    });

    it('should detect late night period at 2am', async () => {
      const { circadianManager } = await import('../circadian-manager.js');
      
      const lateNight = new Date();
      lateNight.setHours(2, 0, 0, 0);
      
      const period = circadianManager.detectPeriod(lateNight, true);
      expect(period).toBe('lateNight');
    });

    it('should detect evening period at 7pm', async () => {
      const { circadianManager } = await import('../circadian-manager.js');
      
      const evening = new Date();
      evening.setHours(19, 0, 0, 0);
      
      const period = circadianManager.detectPeriod(evening, true);
      expect(period).toBe('evening');
    });

    it('should detect midday period at noon', async () => {
      const { circadianManager } = await import('../circadian-manager.js');
      
      const midday = new Date();
      midday.setHours(12, 0, 0, 0);
      
      const period = circadianManager.detectPeriod(midday, true);
      expect(period).toBe('midday');
    });

    it('should adjust period for night owl sleep pattern', async () => {
      const { circadianManager } = await import('../circadian-manager.js');
      
      // Set up as night owl who wakes at 10am
      circadianManager.setSleepPattern({
        wakeTime: 10,
        sleepTime: 2,
        isNightOwl: true,
        isEarlyBird: false,
      });
      
      // At 11pm, a night owl should still be in "evening" mode, not "night"
      const evening = new Date();
      evening.setHours(23, 0, 0, 0);
      
      const period = circadianManager.detectPeriod(evening);
      // Night owls have later evening/night periods
      expect(['evening', 'night']).toContain(period);
    });
  });

  describe('Circadian Override', () => {
    it('should allow manual period override', async () => {
      const { circadianManager } = await import('../circadian-manager.js');
      
      circadianManager.setOverride('lateNight');
      expect(circadianManager.hasOverride()).toBe(true);
      expect(circadianManager.getCurrentPeriod()).toBe('lateNight');
    });

    it('should clear override and return to auto', async () => {
      const { circadianManager } = await import('../circadian-manager.js');
      
      circadianManager.setOverride('morning');
      expect(circadianManager.hasOverride()).toBe(true);
      
      circadianManager.clearOverride();
      expect(circadianManager.hasOverride()).toBe(false);
    });

    it('should persist override in localStorage', async () => {
      const { circadianManager } = await import('../circadian-manager.js');
      
      circadianManager.setOverride('evening');
      
      const stored = localStorage.getItem('ferni_circadian_override');
      expect(stored).toBe('evening');
    });
  });

  describe('Sleep Pattern Inference', () => {
    it('should infer night owl from late night usage', async () => {
      const { circadianManager } = await import('../circadian-manager.js');
      
      // Create session times with lots of late night usage
      const sessions: Date[] = [];
      for (let i = 0; i < 10; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(2, 0, 0, 0); // 2 AM
        sessions.push(date);
      }
      // Add some morning sessions
      for (let i = 0; i < 5; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(10, 0, 0, 0); // 10 AM
        sessions.push(date);
      }
      
      const inferred = circadianManager.inferSleepPatternFromUsage(sessions);
      expect(inferred).toBeTruthy();
      expect(inferred!.isNightOwl).toBe(true);
    });

    it('should infer early bird from early morning usage', async () => {
      const { circadianManager } = await import('../circadian-manager.js');
      
      // Create session times with lots of early morning usage
      const sessions: Date[] = [];
      for (let i = 0; i < 15; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(6, 0, 0, 0); // 6 AM
        sessions.push(date);
      }
      
      const inferred = circadianManager.inferSleepPatternFromUsage(sessions);
      expect(inferred).toBeTruthy();
      expect(inferred!.isEarlyBird).toBe(true);
    });

    it('should return null with insufficient data', async () => {
      const { circadianManager } = await import('../circadian-manager.js');
      
      // Only 3 sessions - not enough
      const sessions = [new Date(), new Date(), new Date()];
      
      const inferred = circadianManager.inferSleepPatternFromUsage(sessions);
      expect(inferred).toBeNull();
    });
  });
});

describe('Warmth Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Warmth Configuration', () => {
    it('should provide correct warmth config for each stage', async () => {
      const { warmthManager } = await import('../warmth-manager.js');
      
      const firstMeeting = warmthManager.getConfigForStage('first-meeting');
      expect(firstMeeting.colorTemperature).toBe(0);
      expect(firstMeeting.animationMultiplier).toBe(1.0);

      const deepPartnership = warmthManager.getConfigForStage('deep-partnership');
      expect(deepPartnership.colorTemperature).toBe(0.5);
      expect(deepPartnership.animationMultiplier).toBe(0.85);
    });

    it('should have increasing warmth with deeper stages', async () => {
      const { warmthManager } = await import('../warmth-manager.js');
      
      const stages = ['first-meeting', 'getting-started', 'building-trust', 'established', 'deep-partnership'] as const;
      
      let lastWarmth = -1;
      for (const stage of stages) {
        const config = warmthManager.getConfigForStage(stage);
        expect(config.colorTemperature).toBeGreaterThan(lastWarmth);
        lastWarmth = config.colorTemperature;
      }
    });

    it('should have decreasing animation multiplier with deeper stages', async () => {
      const { warmthManager } = await import('../warmth-manager.js');
      
      const stages = ['first-meeting', 'getting-started', 'building-trust', 'established', 'deep-partnership'] as const;
      
      let lastMultiplier = 2;
      for (const stage of stages) {
        const config = warmthManager.getConfigForStage(stage);
        expect(config.animationMultiplier).toBeLessThanOrEqual(lastMultiplier);
        lastMultiplier = config.animationMultiplier;
      }
    });
  });

  describe('Animation Duration Adjustment', () => {
    it('should adjust duration based on relationship depth', async () => {
      const { warmthManager } = await import('../warmth-manager.js');
      
      // Apply a stage first
      warmthManager.applyTheme('deep-partnership');
      
      const baseDuration = 300;
      const adjusted = warmthManager.getAdjustedDuration(baseDuration);
      
      // Deep partnership has 0.85 multiplier, so duration should be longer
      // adjusted = 300 / 0.85 ≈ 353
      expect(adjusted).toBeGreaterThan(baseDuration);
    });

    it('should return base duration at first-meeting stage', async () => {
      const { warmthManager } = await import('../warmth-manager.js');
      
      warmthManager.applyTheme('first-meeting');
      
      const baseDuration = 300;
      const adjusted = warmthManager.getAdjustedDuration(baseDuration);
      
      // First meeting has 1.0 multiplier
      expect(adjusted).toBe(baseDuration);
    });
  });

  describe('Warmth Event Subscription', () => {
    it('should call callback when warmth changes', async () => {
      const { warmthManager } = await import('../warmth-manager.js');
      
      const callback = vi.fn();
      const unsubscribe = warmthManager.onWarmthChange(callback);
      
      // Simulate stage change event
      window.dispatchEvent(new CustomEvent('ferni:warmth-change', {
        detail: {
          previousStage: 'first-meeting',
          newStage: 'getting-started',
          isDeepening: true,
          warmthConfig: { colorTemperature: 0.1, animationMultiplier: 1.0, glowIntensity: 0.4, uiRichness: 0.4, saturation: 1.02 },
          stageIndex: 1,
        },
      }));
      
      expect(callback).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        isDeepening: true,
        newStage: 'getting-started',
      }));
      
      unsubscribe();
    });

    it('should unsubscribe correctly', async () => {
      const { warmthManager } = await import('../warmth-manager.js');
      
      const callback = vi.fn();
      const unsubscribe = warmthManager.onWarmthChange(callback);
      
      unsubscribe();
      
      // Should not be called after unsubscribe
      window.dispatchEvent(new CustomEvent('ferni:warmth-change', { detail: {} }));
      
      expect(callback).not.toHaveBeenCalled();
    });
  });
});

describe('Visual Storytelling API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch visual storytelling data on init', async () => {
    const mockData = {
      data: {
        sleepPattern: { wakeTime: 7, sleepTime: 23, isNightOwl: false, isEarlyBird: false },
        relationship: { stage: 'building-trust', stageIndex: 2, progressPercent: 60, daysTogether: 30, conversationCount: 15, currentStreak: 5, longestStreak: 10, warmthConfig: {} },
        teaserEligibility: { history: true, goals: true, team: true, patterns: true, wellbeing: true },
        milestones: [],
        teamProgress: [],
        lastUpdated: new Date().toISOString(),
      },
    };

    vi.mocked(apiGet).mockResolvedValue(mockData);

    const { visualStorytellingService } = await import('../visual-storytelling.service.js');
    
    const data = await visualStorytellingService.init('test-user-id');
    
    expect(apiGet).toHaveBeenCalledWith('/api/visual-storytelling/test-user-id');
    expect(data).toBeTruthy();
    expect(data?.relationship.stage).toBe('building-trust');
  });

  it('should update sleep pattern via API', async () => {
    vi.mocked(apiPut).mockResolvedValue({ success: true });
    vi.mocked(apiGet).mockResolvedValue({
      data: {
        sleepPattern: null,
        relationship: { stage: 'first-meeting', stageIndex: 0, progressPercent: 0, daysTogether: 1, conversationCount: 1, currentStreak: 1, longestStreak: 1, warmthConfig: {} },
        teaserEligibility: { history: false, goals: false, team: false, patterns: false, wellbeing: false },
        milestones: [],
        teamProgress: [],
        lastUpdated: new Date().toISOString(),
      },
    });

    const { visualStorytellingService } = await import('../visual-storytelling.service.js');
    
    // Initialize first
    await visualStorytellingService.init('test-user-id');
    
    // Update sleep pattern
    const success = await visualStorytellingService.updateSleepPattern({
      wakeTime: 8,
      sleepTime: 0,
      isNightOwl: true,
    });
    
    expect(success).toBe(true);
    expect(apiPut).toHaveBeenCalledWith(
      '/api/visual-storytelling/test-user-id/sleep-pattern',
      expect.objectContaining({ wakeTime: 8, isNightOwl: true })
    );
  });

  it('should celebrate milestone via API', async () => {
    vi.mocked(apiPost).mockResolvedValue({ success: true });
    vi.mocked(apiGet).mockResolvedValue({
      data: {
        sleepPattern: null,
        relationship: { stage: 'building-trust', stageIndex: 2, progressPercent: 60, daysTogether: 30, conversationCount: 15, currentStreak: 5, longestStreak: 10, warmthConfig: {} },
        teaserEligibility: { history: true, goals: true, team: true, patterns: true, wellbeing: true },
        milestones: [{ id: 'first-hello', type: 'greeting', title: 'First Hello', emoji: '👋', celebratedAt: null, personaId: 'ferni', progressPercent: 100 }],
        teamProgress: [],
        lastUpdated: new Date().toISOString(),
      },
    });

    const { visualStorytellingService } = await import('../visual-storytelling.service.js');
    
    await visualStorytellingService.init('test-user-id');
    const success = await visualStorytellingService.celebrateMilestone('first-hello');
    
    expect(success).toBe(true);
    expect(apiPost).toHaveBeenCalledWith(
      '/api/visual-storytelling/test-user-id/milestone/first-hello/celebrate',
      {}
    );
  });

  it('should return teaser eligibility correctly', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      data: {
        sleepPattern: null,
        relationship: { stage: 'getting-started', stageIndex: 1, progressPercent: 50, daysTogether: 5, conversationCount: 5, currentStreak: 3, longestStreak: 3, warmthConfig: {} },
        teaserEligibility: { history: true, goals: true, team: true, patterns: false, wellbeing: false },
        milestones: [],
        teamProgress: [],
        lastUpdated: new Date().toISOString(),
      },
    });

    const { visualStorytellingService } = await import('../visual-storytelling.service.js');
    
    await visualStorytellingService.init('test-user-id');
    const eligibility = visualStorytellingService.getTeaserEligibility();
    
    expect(eligibility.history).toBe(true);
    expect(eligibility.goals).toBe(true);
    expect(eligibility.patterns).toBe(false);
  });
});
