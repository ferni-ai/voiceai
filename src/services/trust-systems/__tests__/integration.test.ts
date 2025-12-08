/**
 * Trust Systems Integration Tests
 *
 * Tests for systems working together (P9)
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Import all systems we're testing together
import { recordEmotionalSnapshot, getTimeline } from '../sentiment-timeline.js';
import { detectLifeEvents, saveEvent, getUpcomingEvents } from '../life-events.js';
import { calculateHealthScore, getHealthScore } from '../relationship-health.js';
import { generateStarters, getBestStarter } from '../conversation-starters.js';
import { recordWin, getMomentumProfile, generateCelebrations } from '../celebration-momentum.js';
import { isEnabled, setFlag, resetToDefaults } from '../../feature-flags.js';

describe('Trust Systems Integration', () => {
  const testUserId = 'integration-test-user';

  beforeEach(async () => {
    // Reset feature flags to defaults
    await resetToDefaults();
  });

  describe('Emotion → Sentiment Timeline → Conversation Starters', () => {
    it('should flow emotion data from recording to conversation starters', () => {
      // 1. Record an emotional snapshot
      recordEmotionalSnapshot(testUserId, {
        primaryEmotion: 'sadness',
        secondaryEmotions: ['anxiety'],
        intensity: 0.7,
        source: 'detected',
      });

      // 2. Get timeline (should have the snapshot)
      const timeline = getTimeline(testUserId);
      expect(timeline?.snapshots?.length).toBeGreaterThan(0);

      // 3. Generate starters (should consider emotional context)
      const starters = generateStarters({
        userId: testUserId,
      });

      // Starters should exist
      expect(Array.isArray(starters)).toBe(true);
    });
  });

  describe('Life Events → Conversation Starters', () => {
    it('should incorporate upcoming events into conversation starters', () => {
      // 1. Save a life event
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      saveEvent({
        userId: testUserId,
        id: 'test-event-integration',
        type: 'appointment',
        description: 'Job interview at TechCorp',
        date: tomorrow,
        importance: 'high',
        followUp: { beforeReminder: true, afterCheckIn: true },
        tags: ['career'],
        context: { mentionedAt: new Date(), originalText: 'interview tomorrow' },
      });

      // 2. Get upcoming events
      const events = getUpcomingEvents(testUserId);
      expect(events.today.length + events.thisWeek.length).toBeGreaterThan(0);

      // 3. Generate starters with events context
      const starters = generateStarters({
        userId: testUserId,
        upcomingEvents: [
          { id: 'test-event', description: 'Job interview', date: tomorrow, type: 'appointment' as const }
        ],
      });

      // Should have event-aware starters
      expect(Array.isArray(starters)).toBe(true);
    });
  });

  describe('Wins → Momentum → Celebrations', () => {
    it('should track wins and generate celebrations', () => {
      // 1. Record multiple wins
      recordWin(testUserId, {
        type: 'followed_through',
        description: 'Completed morning routine',
        tags: ['habits'],
      });

      recordWin(testUserId, {
        type: 'courage_moment',
        description: 'Had difficult conversation',
        tags: ['relationships'],
      });

      // 2. Check momentum profile
      const momentum = getMomentumProfile(testUserId);
      expect(momentum).toBeDefined();
      expect(momentum?.totalWins).toBeGreaterThan(0);

      // 3. Generate celebrations
      const celebrations = generateCelebrations(testUserId);
      expect(Array.isArray(celebrations)).toBe(true);
    });
  });

  describe('Health Score Integration', () => {
    it('should calculate health score from multiple factors', () => {
      // Simulate engagement data
      const factors = {
        consistency: 70,
        depth: 65,
        trust: 75,
        engagement: 80,
        growth: 72,
      };

      // Calculate health score
      const score = calculateHealthScore(testUserId, factors);

      expect(score).toBeDefined();
      expect(score.overallScore).toBeGreaterThan(0);
      expect(score.stage).toBeDefined();

      // Retrieve cached score
      const cachedScore = getHealthScore(testUserId);
      expect(cachedScore?.overallScore).toBe(score.overallScore);
    });
  });

  describe('Feature Flags Integration', () => {
    it('should control system behavior with flags', async () => {
      // Enable a flag
      await setFlag('trust.sentiment-timeline', { enabled: true, percentage: 100 });

      expect(isEnabled('trust.sentiment-timeline', testUserId)).toBe(true);

      // Disable the flag
      await setFlag('trust.sentiment-timeline', { enabled: false, percentage: 0 });

      expect(isEnabled('trust.sentiment-timeline', testUserId)).toBe(false);
    });

    it('should respect percentage rollout', async () => {
      // Set to 50%
      await setFlag('trust.voice-prosody', { enabled: true, percentage: 50 });

      // Should be deterministic for same user
      const result1 = isEnabled('trust.voice-prosody', 'deterministic-user-1');
      const result2 = isEnabled('trust.voice-prosody', 'deterministic-user-1');

      expect(result1).toBe(result2);
    });
  });

  describe('Cross-System Data Flow', () => {
    it('should maintain data consistency across systems', () => {
      // 1. Record emotion
      recordEmotionalSnapshot(testUserId, {
        primaryEmotion: 'joy',
        secondaryEmotions: [],
        intensity: 0.85,
        source: 'detected',
      });

      // 2. Record a win
      recordWin(testUserId, {
        type: 'breakthrough',
        description: 'Major realization',
        tags: ['growth'],
      });

      // 3. Save life event
      saveEvent({
        userId: testUserId,
        id: 'test-event-data-flow',
        type: 'milestone',
        description: 'Completed project',
        date: new Date(),
        importance: 'high',
        followUp: { beforeReminder: false, afterCheckIn: true },
        tags: ['work'],
        context: { mentionedAt: new Date(), originalText: 'finished the project!' },
      });

      // 4. Verify all systems have data
      const timeline = getTimeline(testUserId);
      expect(timeline?.snapshots?.length).toBeGreaterThan(0);

      const momentum = getMomentumProfile(testUserId);
      expect(momentum?.totalWins).toBeGreaterThan(0);

      const events = getUpcomingEvents(testUserId);
      // Events may or may not be in "upcoming" depending on date
      expect(events).toBeDefined();
    });
  });

  describe('Error Resilience', () => {
    it('should handle missing user gracefully', () => {
      const unknownUser = 'unknown-user-xyz-123';

      // All systems should handle gracefully
      expect(() => getTimeline(unknownUser)).not.toThrow();
      expect(() => getMomentumProfile(unknownUser)).not.toThrow();
      expect(() => getUpcomingEvents(unknownUser)).not.toThrow();
      expect(() => getHealthScore(unknownUser)).not.toThrow();
      expect(() => generateStarters({ userId: unknownUser })).not.toThrow();
    });

    it('should handle concurrent updates', async () => {
      // Simulate concurrent updates
      const promises = Array.from({ length: 10 }, (_, i) =>
        Promise.resolve(
          recordEmotionalSnapshot(testUserId, {
            primaryEmotion: 'neutral',
            secondaryEmotions: [],
            intensity: 0.5,
            source: 'detected',
          })
        )
      );

      await Promise.all(promises);

      // Should not have corrupted data
      const timeline = getTimeline(testUserId);
      expect(timeline).toBeDefined();
    });
  });
});

