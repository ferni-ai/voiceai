/**
 * Handoff State Management Tests
 *
 * Tests for per-session handoff state management.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createHandoffState,
  recordHandoff,
  getLastHandoff,
  setCurrentAgent,
  hasMetPersona,
  markPersonaMet,
  incrementMeetingCount,
  setLastTopicForPersona,
  updateUserContextForHandoff,
  captureHandoffContext,
  getHandoffContext,
  formatHandoffContextForAgent,
  getMeetingCounts,
  getLastTopicsPerPersona,
  initializeFromPersistedData,
  isHandoffAllowed,
  getHandoffAnalytics,
  type HandoffState,
} from '../handoff-state.js';
import type { AgentId } from '../../../types/agent-ids.js';

describe('HandoffState', () => {
  let state: HandoffState;

  beforeEach(() => {
    state = createHandoffState('ferni');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // createHandoffState
  // ===========================================================================
  describe('createHandoffState', () => {
    it('should create state with default agent as ferni', () => {
      const newState = createHandoffState();
      expect(newState.currentAgent).toBe('ferni');
    });

    it('should create state with specified initial agent', () => {
      const newState = createHandoffState('maya-santos');
      expect(newState.currentAgent).toBe('maya-santos');
    });

    it('should initialize with empty history', () => {
      expect(state.handoffHistory).toEqual([]);
    });

    it('should mark initial agent as met', () => {
      expect(state.metPersonas.has('ferni')).toBe(true);
    });

    it('should set initial meeting count for starting agent', () => {
      expect(state.perPersonaMeetingCount.get('ferni')).toBe(1);
    });

    it('should have null conversation context initially', () => {
      expect(state.conversationContext).toBeNull();
    });
  });

  // ===========================================================================
  // recordHandoff
  // ===========================================================================
  describe('recordHandoff', () => {
    it('should add handoff record to history', () => {
      recordHandoff(state, 'ferni', 'maya-santos', 'User needs coaching');

      expect(state.handoffHistory.length).toBe(1);
      expect(state.handoffHistory[0].from).toBe('ferni');
      expect(state.handoffHistory[0].to).toBe('maya-santos');
      expect(state.handoffHistory[0].reason).toBe('User needs coaching');
    });

    it('should update lastHandoffTimestamp', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      recordHandoff(state, 'ferni', 'maya-santos', 'test');

      expect(state.lastHandoffTimestamp).toBe(now);
    });

    it('should calculate duration from previous handoff', () => {
      const start = Date.now();
      vi.setSystemTime(start);

      recordHandoff(state, 'ferni', 'maya-santos', 'first');

      vi.setSystemTime(start + 5000); // 5 seconds later
      recordHandoff(state, 'maya-santos', 'jordan-taylor', 'second');

      expect(state.handoffHistory[1].duration).toBe(5000);
    });

    it('should trim history when exceeding max length', () => {
      // Available agent IDs to cycle through
      const agents: AgentId[] = [
        'ferni',
        'maya-santos',
        'jordan-taylor',
        'alex-chen',
        'peter-john',
        'nayan-patel',
      ];

      // Fill up history to 55 (exceeding max of 50)
      for (let i = 0; i < 55; i++) {
        const from = agents[i % agents.length];
        const to = agents[(i + 1) % agents.length];
        recordHandoff(state, from, to, `reason-${i}`);
      }

      expect(state.handoffHistory.length).toBe(50);
      // First 5 entries should be trimmed
      expect(state.handoffHistory[0].to).toBe(agents[6 % agents.length]);
    });
  });

  // ===========================================================================
  // getLastHandoff
  // ===========================================================================
  describe('getLastHandoff', () => {
    it('should return undefined when no handoffs', () => {
      expect(getLastHandoff(state)).toBeUndefined();
    });

    it('should return the most recent handoff', () => {
      recordHandoff(state, 'ferni', 'maya-santos', 'first');
      recordHandoff(state, 'maya-santos', 'jordan-taylor', 'second');

      const last = getLastHandoff(state);
      expect(last?.to).toBe('jordan-taylor');
      expect(last?.reason).toBe('second');
    });
  });

  // ===========================================================================
  // setCurrentAgent
  // ===========================================================================
  describe('setCurrentAgent', () => {
    it('should update current agent', () => {
      setCurrentAgent(state, 'nayan-patel');
      expect(state.currentAgent).toBe('nayan-patel');
    });
  });

  // ===========================================================================
  // hasMetPersona / markPersonaMet
  // ===========================================================================
  describe('hasMetPersona / markPersonaMet', () => {
    it('should return true for initial persona', () => {
      expect(hasMetPersona(state, 'ferni')).toBe(true);
    });

    it('should return false for unmet persona', () => {
      expect(hasMetPersona(state, 'maya-santos')).toBe(false);
    });

    it('should mark persona as met', () => {
      markPersonaMet(state, 'maya-santos');
      expect(hasMetPersona(state, 'maya-santos')).toBe(true);
    });
  });

  // ===========================================================================
  // incrementMeetingCount
  // ===========================================================================
  describe('incrementMeetingCount', () => {
    it('should increment from 0 for new persona', () => {
      const count = incrementMeetingCount(state, 'maya-santos');
      expect(count).toBe(1);
    });

    it('should increment existing count', () => {
      incrementMeetingCount(state, 'maya-santos');
      incrementMeetingCount(state, 'maya-santos');
      const count = incrementMeetingCount(state, 'maya-santos');
      expect(count).toBe(3);
    });

    it('should track counts independently per persona', () => {
      incrementMeetingCount(state, 'maya-santos');
      incrementMeetingCount(state, 'maya-santos');
      incrementMeetingCount(state, 'jordan-taylor');

      expect(state.perPersonaMeetingCount.get('maya-santos')).toBe(2);
      expect(state.perPersonaMeetingCount.get('jordan-taylor')).toBe(1);
    });
  });

  // ===========================================================================
  // setLastTopicForPersona
  // ===========================================================================
  describe('setLastTopicForPersona', () => {
    it('should set topic for persona', () => {
      setLastTopicForPersona(state, 'maya-santos', 'habit tracking');
      expect(state.perPersonaLastTopic.get('maya-santos')).toBe('habit tracking');
    });

    it('should overwrite previous topic', () => {
      setLastTopicForPersona(state, 'maya-santos', 'old topic');
      setLastTopicForPersona(state, 'maya-santos', 'new topic');
      expect(state.perPersonaLastTopic.get('maya-santos')).toBe('new topic');
    });
  });

  // ===========================================================================
  // updateUserContextForHandoff
  // ===========================================================================
  describe('updateUserContextForHandoff', () => {
    it('should update last user message', () => {
      updateUserContextForHandoff(state, { lastUserMessage: 'I feel stressed' });
      expect(state.lastUserMessageForMood).toBe('I feel stressed');
    });

    it('should update emotion analysis', () => {
      updateUserContextForHandoff(state, {
        emotionAnalysis: { primary: 'anxious', intensity: 0.8 },
      });
      expect(state.lastEmotionAnalysisForMood?.primary).toBe('anxious');
    });

    it('should update both together', () => {
      updateUserContextForHandoff(state, {
        lastUserMessage: 'I feel stressed',
        emotionAnalysis: { primary: 'stressed', intensity: 0.7 },
      });
      expect(state.lastUserMessageForMood).toBe('I feel stressed');
      expect(state.lastEmotionAnalysisForMood?.primary).toBe('stressed');
    });
  });

  // ===========================================================================
  // captureHandoffContext / getHandoffContext
  // ===========================================================================
  describe('captureHandoffContext / getHandoffContext', () => {
    it('should capture full context', () => {
      captureHandoffContext(state, {
        topics: ['stress', 'work'],
        emotionalState: 'anxious',
        summary: 'User stressed about work',
        pendingItems: ['meditation reminder'],
        recentMessages: [{ role: 'user', content: 'I feel overwhelmed' }],
      });

      const ctx = getHandoffContext(state);
      expect(ctx?.topics).toEqual(['stress', 'work']);
      expect(ctx?.emotionalState).toBe('anxious');
      expect(ctx?.summary).toBe('User stressed about work');
    });

    it('should provide defaults for missing fields', () => {
      captureHandoffContext(state, { topics: ['test'] });

      const ctx = getHandoffContext(state);
      expect(ctx?.emotionalState).toBe('neutral');
      expect(ctx?.pendingItems).toEqual([]);
    });
  });

  // ===========================================================================
  // formatHandoffContextForAgent
  // ===========================================================================
  describe('formatHandoffContextForAgent', () => {
    it('should return empty string when no context', () => {
      expect(formatHandoffContextForAgent(state)).toBe('');
    });

    it('should format topics', () => {
      captureHandoffContext(state, { topics: ['stress', 'work'] });
      const formatted = formatHandoffContextForAgent(state);
      expect(formatted).toContain('Topics discussed: stress, work');
    });

    it('should format emotional state when not neutral', () => {
      captureHandoffContext(state, { emotionalState: 'anxious' });
      const formatted = formatHandoffContextForAgent(state);
      expect(formatted).toContain("User's mood: anxious");
    });

    it('should skip neutral emotional state', () => {
      captureHandoffContext(state, { emotionalState: 'neutral' });
      const formatted = formatHandoffContextForAgent(state);
      expect(formatted).not.toContain('mood');
    });

    it('should include HANDOFF CONTEXT header', () => {
      captureHandoffContext(state, { summary: 'test summary' });
      const formatted = formatHandoffContextForAgent(state);
      expect(formatted).toContain('[HANDOFF CONTEXT]');
    });
  });

  // ===========================================================================
  // getMeetingCounts / getLastTopicsPerPersona
  // ===========================================================================
  describe('getMeetingCounts / getLastTopicsPerPersona', () => {
    it('should return meeting counts as object', () => {
      incrementMeetingCount(state, 'maya-santos');
      incrementMeetingCount(state, 'maya-santos');

      const counts = getMeetingCounts(state);
      expect(counts['ferni']).toBe(1); // Initial
      expect(counts['maya-santos']).toBe(2);
    });

    it('should return last topics as object', () => {
      setLastTopicForPersona(state, 'maya-santos', 'habits');
      setLastTopicForPersona(state, 'jordan-taylor', 'goals');

      const topics = getLastTopicsPerPersona(state);
      expect(topics['maya-santos']).toBe('habits');
      expect(topics['jordan-taylor']).toBe('goals');
    });
  });

  // ===========================================================================
  // initializeFromPersistedData
  // ===========================================================================
  describe('initializeFromPersistedData', () => {
    it('should load meeting counts from persisted data', () => {
      initializeFromPersistedData(state, {
        meetingCounts: { 'maya-santos': 5, 'jordan-taylor': 3 },
      });

      expect(state.perPersonaMeetingCount.get('maya-santos')).toBe(5);
      expect(state.perPersonaMeetingCount.get('jordan-taylor')).toBe(3);
    });

    it('should load last topics from persisted data', () => {
      initializeFromPersistedData(state, {
        lastTopics: { 'maya-santos': 'habits', 'nayan-patel': 'wisdom' },
      });

      expect(state.perPersonaLastTopic.get('maya-santos')).toBe('habits');
      expect(state.perPersonaLastTopic.get('nayan-patel')).toBe('wisdom');
    });
  });

  // ===========================================================================
  // isHandoffAllowed (rate limiting)
  // ===========================================================================
  describe('isHandoffAllowed', () => {
    it('should allow handoff when no recent handoffs', () => {
      expect(isHandoffAllowed(state)).toBe(true);
    });

    it('should deny handoff when too soon after last handoff', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      recordHandoff(state, 'ferni', 'maya-santos', 'first');

      vi.setSystemTime(now + 500); // Only 500ms later
      expect(isHandoffAllowed(state)).toBe(false);
    });

    it('should allow handoff after rate limit window', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      recordHandoff(state, 'ferni', 'maya-santos', 'first');

      vi.setSystemTime(now + 1500); // 1.5 seconds later
      expect(isHandoffAllowed(state)).toBe(true);
    });
  });

  // ===========================================================================
  // getHandoffAnalytics
  // ===========================================================================
  describe('getHandoffAnalytics', () => {
    it('should return zero stats for empty history', () => {
      const analytics = getHandoffAnalytics(state);
      expect(analytics.totalHandoffs).toBe(0);
      expect(analytics.pingPongCount).toBe(0);
    });

    it('should count handoffs by agent', () => {
      recordHandoff(state, 'ferni', 'maya-santos', 'r1');
      recordHandoff(state, 'maya-santos', 'jordan-taylor', 'r2');
      recordHandoff(state, 'jordan-taylor', 'maya-santos', 'r3');

      const analytics = getHandoffAnalytics(state);
      expect(analytics.handoffsByAgent['maya-santos']).toBe(2);
      expect(analytics.handoffsByAgent['jordan-taylor']).toBe(1);
    });

    it('should detect ping-pong patterns', () => {
      // Ping-pong: record[i] is reverse of record[i-2]
      // i=0: ferni -> maya-santos
      // i=1: maya-santos -> jordan-taylor (any middle handoff)
      // i=2: maya-santos -> ferni (reverse of i=0)
      recordHandoff(state, 'ferni', 'maya-santos', 'r1');
      recordHandoff(state, 'maya-santos', 'jordan-taylor', 'r2');
      recordHandoff(state, 'maya-santos', 'ferni', 'r3');

      const analytics = getHandoffAnalytics(state);
      expect(analytics.pingPongCount).toBeGreaterThan(0);
    });

    it('should track common routes', () => {
      recordHandoff(state, 'ferni', 'maya-santos', 'r1');
      recordHandoff(state, 'maya-santos', 'ferni', 'r2');
      recordHandoff(state, 'ferni', 'maya-santos', 'r3');
      recordHandoff(state, 'maya-santos', 'ferni', 'r4');

      const analytics = getHandoffAnalytics(state);
      expect(analytics.commonRoutes.length).toBeGreaterThan(0);
      // Most common should be ferni->maya-santos or maya-santos->ferni
      const topRoute = analytics.commonRoutes[0];
      expect(topRoute.count).toBe(2);
    });

    it('should calculate average time by agent', () => {
      const now = Date.now();
      vi.setSystemTime(now);
      recordHandoff(state, 'ferni', 'maya-santos', 'r1');

      vi.setSystemTime(now + 10000);
      recordHandoff(state, 'maya-santos', 'jordan-taylor', 'r2');

      const analytics = getHandoffAnalytics(state);
      // Duration is tracked by "from" agent - maya-santos spent 10s before handing off
      // First handoff (ferni) has no duration since there's no previous record
      expect(analytics.averageTimeByAgent['maya-santos']).toBe(10000);
    });
  });
});
