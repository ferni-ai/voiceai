/**
 * Session Summary Tests
 *
 * Tests the Voice ↔ App session context system.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock firebase-admin
vi.mock('firebase-admin', () => ({
  default: {
    firestore: () => ({
      collection: () => ({
        doc: () => ({
          collection: () => ({
            doc: () => ({
              set: vi.fn().mockResolvedValue(undefined),
              get: vi.fn().mockResolvedValue({ exists: false }),
            }),
            orderBy: () => ({
              limit: () => ({
                get: vi.fn().mockResolvedValue({ empty: true }),
              }),
            }),
            add: vi.fn().mockResolvedValue({ id: 'mock-id' }),
          }),
          set: vi.fn().mockResolvedValue(undefined),
          get: vi.fn().mockResolvedValue({ exists: false }),
        }),
      }),
    }),
  },
}));

import {
  storeSessionSummary,
  getLastSessionSummary,
  getActiveUserContext,
  recordAppScreenView,
  recordAppInteraction,
  formatContextForVoiceCall,
  formatContextForApp,
  clearAllSessionData,
  type VoiceSessionSummary,
  type ActiveUserContext,
} from '../session-summary.js';

describe('Session Summary', () => {
  const testUserId = 'test-user-123';
  const testSessionId = 'session-123';

  beforeEach(() => {
    // Clear in-memory data between tests
    clearAllSessionData();
  });

  const mockSummary: VoiceSessionSummary = {
    sessionId: testSessionId,
    userId: testUserId,
    startedAt: new Date(),
    endedAt: new Date(),
    durationSeconds: 300,
    personasEngaged: ['ferni', 'maya'],
    mainTopics: ['stress', 'work', 'habits'],
    naturalSummary: 'Discussed work stress and building better habits',
    insightsGenerated: [
      {
        type: 'pattern',
        content: 'Stress peaks on Monday mornings',
        confidence: 0.8,
        timestamp: new Date(),
      },
    ],
    unfinishedTopics: ['exercise routine'],
    commitmentsMade: ['Try 5-minute morning meditation'],
    emotionalArc: [
      { timestamp: new Date(), emotion: 'anxious', intensity: 0.7 },
      { timestamp: new Date(), emotion: 'hopeful', intensity: 0.6 },
    ],
    endingEmotionalState: 'hopeful',
    wasSignificant: true,
    significanceScore: 0.75,
  };

  describe('storeSessionSummary', () => {
    it('should store a session summary', async () => {
      await storeSessionSummary(mockSummary);

      // Verify it can be retrieved
      const retrieved = await getLastSessionSummary(testUserId);
      // Note: In memory cache should have it
      expect(retrieved?.sessionId).toBe(testSessionId);
    });

    it('should update active context with session data', async () => {
      await storeSessionSummary(mockSummary);

      const context = await getActiveUserContext(testUserId);
      expect(context).toBeDefined();
      expect(context?.pendingTopics).toContain('exercise routine');
      expect(context?.lastInteractionType).toBe('voice');
    });
  });

  describe('recordAppScreenView', () => {
    it('should record app screen views', async () => {
      await recordAppScreenView(testUserId, 'insights-dashboard', 60);
      await recordAppScreenView(testUserId, 'habits-tracker', 30);

      const context = await getActiveUserContext(testUserId);
      expect(context?.appBrowsingContext?.recentScreens).toContain('insights-dashboard');
      expect(context?.appBrowsingContext?.timeSpent['insights-dashboard']).toBe(60);
    });

    it('should accumulate time spent on same screen', async () => {
      await recordAppScreenView(testUserId, 'habits-tracker', 30);
      await recordAppScreenView(testUserId, 'habits-tracker', 20);

      const context = await getActiveUserContext(testUserId);
      expect(context?.appBrowsingContext?.timeSpent['habits-tracker']).toBe(50);
    });

    it('should update last interaction type to app', async () => {
      await recordAppScreenView(testUserId, 'some-screen', 10);

      const context = await getActiveUserContext(testUserId);
      expect(context?.lastInteractionType).toBe('app');
    });
  });

  describe('recordAppInteraction', () => {
    it('should record app interactions', async () => {
      await recordAppInteraction(testUserId, 'expanded_mood_chart');
      await recordAppInteraction(testUserId, 'clicked_team_member_maya');

      const context = await getActiveUserContext(testUserId);
      expect(context?.appBrowsingContext?.interactions).toContain('expanded_mood_chart');
      expect(context?.appBrowsingContext?.interactions).toContain('clicked_team_member_maya');
    });

    it('should keep interactions in order (most recent first)', async () => {
      await recordAppInteraction(testUserId, 'first');
      await recordAppInteraction(testUserId, 'second');
      await recordAppInteraction(testUserId, 'third');

      const context = await getActiveUserContext(testUserId);
      expect(context?.appBrowsingContext?.interactions[0]).toBe('third');
    });
  });

  describe('formatContextForVoiceCall', () => {
    it('should format context for LLM injection', async () => {
      // Store a summary first
      await storeSessionSummary(mockSummary);
      await recordAppScreenView(testUserId, 'habits-tracker', 120);

      const context = await getActiveUserContext(testUserId);
      if (!context) throw new Error('Context should exist');

      const formatted = formatContextForVoiceCall(context);

      expect(formatted).toContain('[CROSS-CHANNEL CONTEXT]');
      expect(formatted).toContain('stress');
      expect(formatted).toContain('exercise routine'); // Unfinished topic
    });

    it('should include app browsing context', async () => {
      await recordAppScreenView(testUserId, 'mood-insights', 60);

      const context = await getActiveUserContext(testUserId);
      if (!context) throw new Error('Context should exist');

      const formatted = formatContextForVoiceCall(context);

      expect(formatted).toContain('mood-insights');
    });
  });

  describe('formatContextForApp', () => {
    it('should format context for app display', async () => {
      await storeSessionSummary(mockSummary);

      const context = await getActiveUserContext(testUserId);
      if (!context) throw new Error('Context should exist');

      const appContext = formatContextForApp(context);

      expect(appContext.pendingTopics).toContain('exercise routine');
      expect(appContext.emotionalState).toBe('hopeful');
    });

    it('should include bridge message for significant conversations', async () => {
      await storeSessionSummary(mockSummary);

      const context = await getActiveUserContext(testUserId);
      if (!context) throw new Error('Context should exist');

      const appContext = formatContextForApp(context);

      expect(appContext.bridgeMessage).toBeDefined();
    });
  });
});
