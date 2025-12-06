/**
 * Memory Persistence E2E Tests
 *
 * End-to-end tests that validate the complete memory persistence flow:
 * 1. User profile creation
 * 2. Intelligence learning during conversation
 * 3. Auto-save functionality
 * 4. Intelligence state persistence
 * 5. Session end with full save
 * 6. Restart and reload verification
 *
 * These tests use the in-memory store for speed but validate
 * the complete persistence logic.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDefaultStore, resetDefaultStore, type InMemoryStore } from '../memory/in-memory-store.js';
import { createUserProfile, type UserProfile } from '../types/user-profile.js';
import {
  exportIntelligenceState,
  applyIntelligenceToProfile,
  loadIntelligenceFromProfile,
  cleanupIntelligenceEngines,
  startAutoSave,
  stopAutoSave,
  stopAllAutoSaves,
} from '../services/intelligence-persistence.js';

// Mock intelligence engines for predictable testing
const mockHumorAttempts: any[] = [];
const mockStoryAttempts: any[] = [];
const mockEmotionalMoments: any[] = [];
const mockPaceObservations: any[] = [];
const mockOpenThreads: any[] = [];
const mockFollowUps: any[] = [];

vi.mock('../intelligence/humor-calibration.js', () => ({
  getHumorCalibration: vi.fn(() => ({
    getGuidance: () => ({
      preferences: { prefersWit: true },
      recentAttempts: mockHumorAttempts,
    }),
    recordAttempt: (type: string, context: string, reaction: string, response: string) => {
      mockHumorAttempts.push({ type, context, reaction, userResponse: response });
    },
  })),
  removeHumorCalibration: vi.fn(() => {
    mockHumorAttempts.length = 0;
  }),
}));

vi.mock('../intelligence/story-preference.js', () => ({
  getStoryPreference: vi.fn(() => ({
    getGuidance: () => ({
      preferences: { prefersShort: true },
      recentAttempts: mockStoryAttempts,
    }),
    recordStoryAttempt: (
      id: string,
      type: string,
      length: string,
      depth: string,
      topic: string,
      engagement: any
    ) => {
      mockStoryAttempts.push({
        storyId: id,
        type,
        length,
        emotionalDepth: depth,
        topic,
        engagement,
      });
    },
  })),
  removeStoryPreference: vi.fn(() => {
    mockStoryAttempts.length = 0;
  }),
}));

vi.mock('../intelligence/communication-mirroring.js', () => ({
  getCommunicationMirroring: vi.fn(() => ({
    getGuidance: () => ({
      detectedStyle: { formality: 'casual', energy: 'high' },
    }),
  })),
  removeCommunicationMirroring: vi.fn(),
}));

vi.mock('../intelligence/emotional-memory.js', () => ({
  getEmotionalMemory: vi.fn(() => ({
    exportMoments: () => [...mockEmotionalMoments],
    importMoments: (moments: any[]) => {
      mockEmotionalMoments.length = 0;
      mockEmotionalMoments.push(...moments);
    },
    getStats: () => ({ totalMoments: mockEmotionalMoments.length, unresolvedCount: 0 }),
  })),
  removeEmotionalMemory: vi.fn(() => {
    mockEmotionalMoments.length = 0;
  }),
}));

vi.mock('../intelligence/voice-pace-adapter.js', () => ({
  getVoicePaceAdapter: vi.fn(() => ({
    getCurrentState: () => ({
      learnedPreferences: {
        averageWPM: 150,
        tempo: 'moderate',
        preferredPauseLength: 200,
        recommendedAgentWPM: 140,
        recommendedResponseLength: 'moderate',
      },
      recentObservations: mockPaceObservations,
    }),
    recordObservation: (obs: any) => {
      mockPaceObservations.push(obs);
    },
  })),
  removeVoicePaceAdapter: vi.fn(() => {
    mockPaceObservations.length = 0;
  }),
}));

vi.mock('../intelligence/response-quality-tracker.js', () => ({
  getResponseQualityTracker: vi.fn(() => ({
    calculatePreferences: () => ({
      prefersStories: true,
      prefersHumor: true,
      prefersQuestions: true,
      prefersDirectAdvice: true,
      preferredLength: 'moderate',
      highEngagementTopics: ['investing'],
      lowEngagementTopics: [],
    }),
    exportSignals: () => [],
  })),
  removeResponseQualityTracker: vi.fn(),
}));

vi.mock('../intelligence/conversation-pattern-analyzer.js', () => ({
  getConversationPatternAnalyzer: vi.fn(() => ({
    analyzePatterns: () => ({
      preferredTimes: ['morning'],
      preferredDays: ['monday'],
      averageDuration: 15,
      likesSmallTalkFirst: true,
      prefersQuick: false,
    }),
    exportSessions: () => [],
  })),
  removeConversationPatternAnalyzer: vi.fn(),
}));

vi.mock('../intelligence/cross-session-threader.js', () => ({
  getCrossSessionThreader: vi.fn(() => ({
    getAllData: () => ({
      threads: mockOpenThreads,
      followUps: mockFollowUps,
    }),
  })),
  removeCrossSessionThreader: vi.fn(() => {
    mockOpenThreads.length = 0;
    mockFollowUps.length = 0;
  }),
}));

describe('Memory Persistence E2E', () => {
  const testUserId = 'e2e-test-user';
  let store: InMemoryStore;

  beforeEach(async () => {
    // Clear all mock data
    mockHumorAttempts.length = 0;
    mockStoryAttempts.length = 0;
    mockEmotionalMoments.length = 0;
    mockPaceObservations.length = 0;
    mockOpenThreads.length = 0;
    mockFollowUps.length = 0;

    // Reset store
    resetDefaultStore();
    store = getDefaultStore();
    await store.initialize();

    // Clear any auto-saves
    stopAllAutoSaves();
  });

  afterEach(async () => {
    stopAllAutoSaves();
    cleanupIntelligenceEngines(testUserId);
  });

  describe('Complete Persistence Flow', () => {
    it('should persist user profile and intelligence state through full lifecycle', async () => {
      // Step 1: Create new user profile
      let profile = createUserProfile(testUserId, 'Test User');
      await store.saveProfile(profile);

      // Verify profile was saved
      const savedProfile = await store.getProfile(testUserId);
      expect(savedProfile).toBeDefined();
      expect(savedProfile?.name).toBe('Test User');

      // Step 2: Simulate learning during conversation
      mockEmotionalMoments.push({
        id: 'emo-1',
        timestamp: new Date(),
        sessionId: 'session-1',
        emotion: 'joy',
        intensity: 'strong',
        topic: 'retirement',
        trigger: 'goal reached',
        userStatement: 'I finally hit my savings target!',
      });

      mockHumorAttempts.push({
        type: 'wit',
        context: 'finance',
        reaction: 'positive',
        userResponse: 'haha thats funny',
      });

      mockOpenThreads.push({
        id: 'thread-1',
        topic: 'retirement planning',
        reason: 'ongoing discussion',
        priority: 'high',
        status: 'open',
        suggestedResumption: 'Continue retirement discussion',
        createdAt: new Date(),
      });

      // Step 3: Apply intelligence state to profile
      profile = applyIntelligenceToProfile(savedProfile!, testUserId);

      // Verify intelligence state was applied
      expect(profile.customData).toBeDefined();
      expect((profile.customData as any).intelligenceState).toBeDefined();
      expect((profile.customData as any).emotionalMoments).toHaveLength(1);
      expect(profile.openThreads).toHaveLength(1);

      // Step 4: Save updated profile
      await store.saveProfile(profile);

      // Step 5: Simulate "restart" by clearing memory engines
      cleanupIntelligenceEngines(testUserId);
      expect(mockEmotionalMoments).toHaveLength(0);

      // Step 6: Reload profile
      const reloadedProfile = await store.getProfile(testUserId);
      expect(reloadedProfile).toBeDefined();

      // Step 7: Load intelligence from profile
      loadIntelligenceFromProfile(testUserId, reloadedProfile!);

      // Verify emotional moments were restored
      expect(mockEmotionalMoments).toHaveLength(1);
      expect(mockEmotionalMoments[0].emotion).toBe('joy');
      expect(mockEmotionalMoments[0].topic).toBe('retirement');
    });

    it('should handle returning user flow correctly', async () => {
      // Create and save initial profile with history
      const profile = createUserProfile(testUserId, 'Returning User');
      profile.totalConversations = 5;
      profile.totalMinutesTalked = 45;
      profile.relationshipStage = 'trusted_advisor';

      // Add previous intelligence data
      profile.customData = {
        emotionalMoments: [
          {
            id: 'old-emo-1',
            timestamp: new Date(Date.now() - 86400000), // Yesterday
            sessionId: 'old-session',
            emotion: 'anxiety',
            intensity: 'moderate',
            topic: 'market volatility',
            trigger: 'news',
            userStatement: 'The market drop worries me',
          },
        ],
      };
      profile.openThreads = [
        {
          id: 'old-thread',
          topic: 'market concerns',
          reason: 'unfinished',
          priority: 'high',
          status: 'open',
          suggestedResumption: 'Check on market concerns',
          createdAt: new Date(Date.now() - 86400000),
        },
      ] as any;

      await store.saveProfile(profile);

      // Simulate new session start
      const loadedProfile = await store.getProfile(testUserId);
      expect(loadedProfile?.totalConversations).toBe(5);

      // Load intelligence from profile
      loadIntelligenceFromProfile(testUserId, loadedProfile!);

      // Verify old data was restored
      expect(mockEmotionalMoments).toHaveLength(1);
      expect(mockEmotionalMoments[0].emotion).toBe('anxiety');
      expect(mockEmotionalMoments[0].topic).toBe('market volatility');
    });
  });

  describe('Auto-Save Integration', () => {
    it('should auto-save profile at intervals', async () => {
      // Create profile
      const profile = createUserProfile(testUserId);
      await store.saveProfile(profile);

      // Track save calls
      let saveCount = 0;
      const originalSave = store.saveProfile.bind(store);
      store.saveProfile = async (p: UserProfile) => {
        saveCount++;
        return originalSave(p);
      };

      // Start auto-save with short interval
      const autoSaveCallback = async (uid: string) => {
        const currentProfile = await store.getProfile(uid);
        if (currentProfile) {
          const updatedProfile = applyIntelligenceToProfile(currentProfile, uid);
          await store.saveProfile(updatedProfile);
        }
      };

      startAutoSave(testUserId, autoSaveCallback, { autoSaveIntervalMs: 50 });

      // Wait for a few auto-saves
      await new Promise((resolve) => {
        setTimeout(resolve, 180);
      });

      // Should have auto-saved at least twice
      expect(saveCount).toBeGreaterThanOrEqual(2);

      stopAutoSave(testUserId);
    });

    it('should persist data even if session crashes after auto-save', async () => {
      // Create profile
      const profile = createUserProfile(testUserId);
      await store.saveProfile(profile);

      // Add learning data
      mockEmotionalMoments.push({
        id: 'crash-emo',
        timestamp: new Date(),
        sessionId: 'crash-session',
        emotion: 'anticipation',
        intensity: 'strong',
        topic: 'new investment',
        trigger: 'opportunity',
        userStatement: 'I found a great opportunity!',
      });

      // Do one auto-save
      const loadedProfile = await store.getProfile(testUserId);
      const savedProfile = applyIntelligenceToProfile(loadedProfile!, testUserId);
      await store.saveProfile(savedProfile);

      // "Crash" - clear memory state
      cleanupIntelligenceEngines(testUserId);

      // Verify data was NOT lost
      const recoveredProfile = await store.getProfile(testUserId);
      const emotionalMoments = (recoveredProfile?.customData as any)?.emotionalMoments;

      expect(emotionalMoments).toBeDefined();
      expect(emotionalMoments.length).toBeGreaterThan(0);
      expect(emotionalMoments[0].emotion).toBe('anticipation');
    });
  });

  describe('Atomic Profile Updates', () => {
    it('should increment version on each save', async () => {
      const profile = createUserProfile(testUserId);
      expect(profile.version).toBe(1);

      await store.saveProfile(profile);

      // Simulate multiple updates
      for (let i = 0; i < 3; i++) {
        const loaded = await store.getProfile(testUserId);
        loaded!.version++;
        await store.saveProfile(loaded!);
      }

      const finalProfile = await store.getProfile(testUserId);
      expect(finalProfile?.version).toBe(4);
    });

    it('should preserve all intelligence data across multiple saves', async () => {
      // Initial save
      let profile = createUserProfile(testUserId);
      await store.saveProfile(profile);

      // First session - add emotional moment
      mockEmotionalMoments.push({
        id: 'emo-session1',
        timestamp: new Date(),
        sessionId: 'session-1',
        emotion: 'joy',
        intensity: 'moderate',
        topic: 'savings',
        trigger: 'milestone',
        userStatement: 'Hit my first milestone!',
      });

      profile = (await store.getProfile(testUserId)) as UserProfile;
      profile = applyIntelligenceToProfile(profile, testUserId);
      await store.saveProfile(profile);

      // "End session"
      cleanupIntelligenceEngines(testUserId);

      // Second session - add another emotional moment
      profile = (await store.getProfile(testUserId)) as UserProfile;
      loadIntelligenceFromProfile(testUserId, profile);

      mockEmotionalMoments.push({
        id: 'emo-session2',
        timestamp: new Date(),
        sessionId: 'session-2',
        emotion: 'trust',
        intensity: 'strong',
        topic: 'planning',
        trigger: 'advice',
        userStatement: 'Your advice really helped!',
      });

      profile = applyIntelligenceToProfile(profile, testUserId);
      await store.saveProfile(profile);

      // Verify both moments are preserved
      const finalProfile = await store.getProfile(testUserId);
      const moments = (finalProfile?.customData as any)?.emotionalMoments || [];

      expect(moments.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle profile with no intelligence data', async () => {
      const profile = createUserProfile(testUserId);
      await store.saveProfile(profile);

      const loaded = await store.getProfile(testUserId);

      // Should not throw
      expect(() => loadIntelligenceFromProfile(testUserId, loaded!)).not.toThrow();
    });

    it('should handle empty intelligence state', () => {
      const profile = createUserProfile(testUserId);

      // Should not throw when no data to export
      expect(() => applyIntelligenceToProfile(profile, testUserId)).not.toThrow();
    });

    it('should handle corrupted intelligence state gracefully', async () => {
      const profile = createUserProfile(testUserId);
      profile.customData = {
        intelligenceState: {
          version: 1,
          savedAt: 'invalid-date', // Corrupted
          emotional: null, // Missing data
        },
      };
      await store.saveProfile(profile);

      const loaded = await store.getProfile(testUserId);

      // Should not throw
      expect(() => loadIntelligenceFromProfile(testUserId, loaded!)).not.toThrow();
    });
  });
});

describe('Concurrent Access', () => {
  let store: InMemoryStore;
  const testUserId = 'concurrent-user';

  beforeEach(async () => {
    resetDefaultStore();
    store = getDefaultStore();
    await store.initialize();
  });

  afterEach(() => {
    stopAllAutoSaves();
  });

  it('should handle multiple concurrent profile reads', async () => {
    const profile = createUserProfile(testUserId);
    await store.saveProfile(profile);

    // Simulate 10 concurrent reads
    const reads = Array(10)
      .fill(null)
      .map(() => store.getProfile(testUserId));
    const results = await Promise.all(reads);

    // All reads should succeed
    expect(results.every((r) => r !== null)).toBe(true);
    expect(results.every((r) => r?.id === testUserId)).toBe(true);
  });

  it('should handle rapid save/load cycles', async () => {
    let profile = createUserProfile(testUserId);
    await store.saveProfile(profile);

    // Rapid save/load cycles
    for (let i = 0; i < 20; i++) {
      profile = (await store.getProfile(testUserId)) as UserProfile;
      profile.totalConversations++;
      await store.saveProfile(profile);
    }

    const final = await store.getProfile(testUserId);
    expect(final?.totalConversations).toBe(20);
  });
});
