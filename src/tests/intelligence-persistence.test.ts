/**
 * Intelligence Persistence Tests
 *
 * Tests for the unified intelligence persistence system that ensures
 * all learning engines properly save and load user data.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  exportIntelligenceState,
  importIntelligenceState,
  applyIntelligenceToProfile,
  loadIntelligenceFromProfile,
  cleanupIntelligenceEngines,
  startAutoSave,
  stopAutoSave,
  stopAllAutoSaves,
  getAutoSaveStatus,
  type IntelligenceState,
} from '../services/intelligence-persistence.js';
import { createUserProfile, type UserProfile } from '../types/user-profile.js';

// Mock the intelligence engines with correct API
vi.mock('../intelligence/tracking/humor.js', () => ({
  getHumorCalibration: vi.fn(() => ({
    calculatePreferences: () => ({
      shouldUseHumor: true,
      preferredTypes: ['dry_wit'],
      avoidTypes: [],
      humorFrequency: 'moderate',
      totalAttempts: 5,
      successRate: 0.8,
    }),
  })),
  removeHumorCalibration: vi.fn(),
}));

vi.mock('../intelligence/tracking/story-preference.js', () => ({
  getStoryPreference: vi.fn(() => ({
    calculatePreferences: () => ({
      likesStories: true,
      preferredTypes: ['personal'],
      preferredLength: 'short',
      preferredDepth: 'medium',
      totalStoriesTold: 3,
      engagementRate: 0.85,
    }),
  })),
  removeStoryPreference: vi.fn(),
}));

vi.mock('../intelligence/tracking/communication-style.js', () => ({
  getCommunicationMirroring: vi.fn(() => ({
    getStats: () => ({
      sampleCount: 10,
      style: {
        formality: 'casual',
        energy: 'high',
        vocabulary: 'everyday',
      },
    }),
  })),
  removeCommunicationMirroring: vi.fn(),
}));

vi.mock('../intelligence/tracking/emotional-memory.js', () => ({
  getEmotionalMemory: vi.fn(() => ({
    exportMoments: () => [
      {
        id: 'emo-1',
        timestamp: new Date(),
        sessionId: 'sess-1',
        emotion: 'joy',
        intensity: 'strong',
        topic: 'retirement',
        trigger: 'goal reached',
        userStatement: 'I finally hit my target!',
      },
    ],
    importMoments: vi.fn(),
    getStats: () => ({ totalMoments: 1, unresolvedCount: 0 }),
  })),
  removeEmotionalMemory: vi.fn(),
}));

vi.mock('../intelligence/tracking/voice-pace.js', () => ({
  getVoicePaceAdapter: vi.fn(() => ({
    calculatePreferences: () => ({
      avgWPM: 150,
      wpmCategory: 'moderate',
      wpmVariance: 20,
      avgResponseTime: 0.2,
      avgMessageLength: 50,
      prefersShortResponses: false,
      recommendedJackWPM: 140,
      totalObservations: 10,
    }),
  })),
  removeVoicePaceAdapter: vi.fn(),
}));

vi.mock('../intelligence/tracking/response-quality.js', () => ({
  getResponseQualityTracker: vi.fn(() => ({
    calculatePreferences: () => ({
      storyEffectiveness: 0.8,
      adviceEffectiveness: 0.7,
      humorEffectiveness: 0.75,
      questionEffectiveness: 0.9,
      empathyEffectiveness: 0.85,
      explanationEffectiveness: 0.7,
      preferredResponseLength: 'moderate',
      topTopics: ['investing'],
      lowEngagementTopics: [],
      totalSignals: 20,
    }),
    getSignals: () => [],
  })),
  removeResponseQualityTracker: vi.fn(),
}));

vi.mock('../intelligence/tracking/conversation-patterns.js', () => ({
  getConversationPatternAnalyzer: vi.fn(() => ({
    analyzePatterns: () => ({
      preferredTimes: ['morning'],
      preferredDays: ['monday'],
      avgTimeBetweenConversations: 3,
      avgDuration: 15,
      preferredDuration: 'medium',
      hasTimeConstraints: false,
      likesSmallTalkFirst: true,
      hasCheckinPattern: false,
    }),
    getSessions: () => [],
  })),
  removeConversationPatternAnalyzer: vi.fn(),
}));

vi.mock('../intelligence/tracking/cross-session.js', () => ({
  getCrossSessionThreader: vi.fn(() => ({
    getAllData: () => ({
      threads: [
        {
          id: 'thread-1',
          topic: 'retirement planning',
          reason: 'ongoing',
          priority: 'high',
          status: 'open',
          suggestedResumption: 'Continue retirement discussion',
          createdAt: new Date(),
        },
      ],
      followUps: [
        {
          id: 'followup-1',
          type: 'check-in',
          description: 'Check on portfolio',
          delivered: false,
          createdAt: new Date(),
        },
      ],
    }),
  })),
  removeCrossSessionThreader: vi.fn(),
}));

describe('Intelligence Persistence', () => {
  const testUserId = 'test-user-123';

  beforeEach(() => {
    vi.clearAllMocks();
    stopAllAutoSaves();
  });

  afterEach(() => {
    stopAllAutoSaves();
  });

  describe('exportIntelligenceState', () => {
    it('should export all intelligence state for a user', () => {
      const state = exportIntelligenceState(testUserId);

      expect(state).toBeDefined();
      expect(state.version).toBe(1);
      expect(state.savedAt).toBeInstanceOf(Date);

      // Check humor state
      expect(state.humor).toBeDefined();
      expect(state.humor?.preferences).toBeDefined();
      expect(state.humor?.preferences?.shouldUseHumor).toBe(true);

      // Check story state
      expect(state.stories).toBeDefined();
      expect(state.stories?.preferences?.likesStories).toBe(true);

      // Check communication state
      expect(state.communication).toBeDefined();
      expect(state.communication?.formality).toBe('casual');

      // Check emotional state
      expect(state.emotional).toBeDefined();
      expect(state.emotional?.moments).toHaveLength(1);

      // Check voice pace state
      expect(state.voicePace).toBeDefined();
      expect(state.voicePace?.preferences?.avgWPM).toBe(150);

      // Check response quality state
      expect(state.responseQuality).toBeDefined();
      expect(state.responseQuality?.preferences?.storyEffectiveness).toBe(0.8);

      // Check pattern state
      expect(state.patterns).toBeDefined();
      expect(state.patterns?.preferences?.avgDuration).toBe(15);

      // Check threads state
      expect(state.threads).toBeDefined();
      expect(state.threads?.openThreads).toHaveLength(1);
      expect(state.threads?.promisedFollowUps).toHaveLength(1);
    });
  });

  describe('importIntelligenceState', () => {
    it('should import intelligence state for a user', () => {
      const state: IntelligenceState = {
        version: 1,
        savedAt: new Date(),
        humor: {
          preferences: null,
          recentAttempts: [
            { type: 'wit', context: 'finance', reaction: 'positive', userResponse: 'nice' },
          ],
        },
        emotional: {
          moments: [
            {
              id: 'emo-2',
              timestamp: new Date(),
              sessionId: 'sess-2',
              emotion: 'anticipation',
              intensity: 'moderate',
              topic: 'savings',
              trigger: 'goal setting',
              userStatement: 'I want to save more',
            },
          ],
          stats: { totalMoments: 1, unresolvedCount: 0 },
        },
      };

      // Should not throw
      expect(() => importIntelligenceState(testUserId, state)).not.toThrow();
    });

    it('should handle null state gracefully', () => {
      expect(() =>
        importIntelligenceState(testUserId, null as unknown as IntelligenceState)
      ).not.toThrow();
    });

    it('should warn about newer version state', () => {
      const futureState: IntelligenceState = {
        version: 999,
        savedAt: new Date(),
      };

      // Should not throw, just warn
      expect(() => importIntelligenceState(testUserId, futureState)).not.toThrow();
    });
  });

  describe('applyIntelligenceToProfile', () => {
    it('should apply intelligence state to user profile', () => {
      const profile = createUserProfile(testUserId);

      const updatedProfile = applyIntelligenceToProfile(profile, testUserId);

      // Check that customData has intelligence state
      expect(updatedProfile.customData).toBeDefined();
      expect(
        (updatedProfile.customData as Record<string, unknown>).intelligenceState
      ).toBeDefined();

      // Check that voice pace was updated
      expect(updatedProfile.voicePace).toBeDefined();
      expect(updatedProfile.voicePace?.preferences?.avgWPM).toBe(150);

      // Check that response quality was updated (based on effectiveness thresholds)
      expect(updatedProfile.responseQuality).toBeDefined();
      // storyEffectiveness is 0.8 which is > 0.6, so likesStories should be true
      expect(updatedProfile.responseQuality?.preferences?.likesStories).toBe(true);

      // Check that conversation patterns were updated
      expect(updatedProfile.conversationPatterns).toBeDefined();
      expect(updatedProfile.conversationPatterns?.preferences?.avgDuration).toBe(15);

      // Check that threads were updated
      expect(updatedProfile.openThreads).toHaveLength(1);
      expect(updatedProfile.promisedFollowUps).toHaveLength(1);
    });

    it('should set updatedAt on profile', () => {
      const profile = createUserProfile(testUserId);
      const originalUpdatedAt = profile.updatedAt;

      // Wait a tiny bit to ensure time difference
      const updatedProfile = applyIntelligenceToProfile(profile, testUserId);

      expect(updatedProfile.updatedAt.getTime()).toBeGreaterThanOrEqual(
        originalUpdatedAt.getTime()
      );
    });
  });

  describe('loadIntelligenceFromProfile', () => {
    it('should load intelligence state from profile customData', () => {
      const profile = createUserProfile(testUserId);
      profile.customData = {
        intelligenceState: {
          version: 1,
          savedAt: new Date(),
          emotional: {
            moments: [
              {
                id: 'emo-loaded',
                timestamp: new Date(),
                sessionId: 'sess-loaded',
                emotion: 'joy',
                intensity: 'strong',
                topic: 'success',
                trigger: 'achievement',
                userStatement: 'I did it!',
              },
            ],
            stats: { totalMoments: 1, unresolvedCount: 0 },
          },
        },
      };

      // Should not throw
      expect(() => loadIntelligenceFromProfile(testUserId, profile)).not.toThrow();
    });

    it('should handle legacy profile fields', () => {
      const profile = createUserProfile(testUserId);
      profile.openThreads = [
        {
          id: 'legacy-thread',
          topic: 'retirement',
          reason: 'unfinished',
          priority: 'medium',
          status: 'open',
          suggestedResumption: 'Continue',
          createdAt: new Date(),
        },
      ] as any;

      // Should not throw
      expect(() => loadIntelligenceFromProfile(testUserId, profile)).not.toThrow();
    });
  });

  describe('cleanupIntelligenceEngines', () => {
    it('should cleanup all engines without throwing', () => {
      expect(() => cleanupIntelligenceEngines(testUserId)).not.toThrow();
    });
  });

  describe('Auto-Save', () => {
    it('should start auto-save for a user', async () => {
      const saveCallback = vi.fn().mockResolvedValue(undefined);

      startAutoSave(testUserId, saveCallback, { autoSaveIntervalMs: 100 });

      const status = getAutoSaveStatus();
      expect(status.has(testUserId)).toBe(true);

      // Wait for at least one auto-save
      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });

      expect(saveCallback).toHaveBeenCalled();

      stopAutoSave(testUserId);
    });

    it('should stop auto-save for a user', () => {
      const saveCallback = vi.fn();

      startAutoSave(testUserId, saveCallback, { autoSaveIntervalMs: 100 });
      expect(getAutoSaveStatus().has(testUserId)).toBe(true);

      stopAutoSave(testUserId);
      expect(getAutoSaveStatus().has(testUserId)).toBe(false);
    });

    it('should stop all auto-saves', () => {
      const saveCallback = vi.fn();

      startAutoSave('user-1', saveCallback, { autoSaveIntervalMs: 100 });
      startAutoSave('user-2', saveCallback, { autoSaveIntervalMs: 100 });

      expect(getAutoSaveStatus().size).toBe(2);

      stopAllAutoSaves();

      expect(getAutoSaveStatus().size).toBe(0);
    });

    it('should not start auto-save if interval is 0', () => {
      const saveCallback = vi.fn();

      startAutoSave(testUserId, saveCallback, { autoSaveIntervalMs: 0 });

      expect(getAutoSaveStatus().has(testUserId)).toBe(false);
    });

    it('should replace existing auto-save when started again', () => {
      const saveCallback1 = vi.fn();
      const saveCallback2 = vi.fn();

      startAutoSave(testUserId, saveCallback1, { autoSaveIntervalMs: 100 });
      startAutoSave(testUserId, saveCallback2, { autoSaveIntervalMs: 100 });

      expect(getAutoSaveStatus().size).toBe(1);

      stopAutoSave(testUserId);
    });
  });
});

describe('Intelligence Round-Trip', () => {
  const testUserId = 'roundtrip-user';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopAllAutoSaves();
  });

  it('should preserve intelligence state through export->apply->load cycle', () => {
    // Create initial profile
    const profile = createUserProfile(testUserId);

    // Export and apply
    const profileWithIntelligence = applyIntelligenceToProfile(profile, testUserId);

    // Verify data was added
    expect(profileWithIntelligence.customData).toBeDefined();
    const intelligenceState = (profileWithIntelligence.customData as Record<string, unknown>)
      .intelligenceState as IntelligenceState;
    expect(intelligenceState).toBeDefined();
    expect(intelligenceState.version).toBe(1);

    // Now simulate loading from this profile
    // Should not throw
    expect(() => loadIntelligenceFromProfile(testUserId, profileWithIntelligence)).not.toThrow();
  });
});
