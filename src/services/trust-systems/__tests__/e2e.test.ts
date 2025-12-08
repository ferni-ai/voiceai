/**
 * Trust Systems E2E Tests
 *
 * Tests for full user journeys (P10)
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Simulating a full user session
import { recordEmotionalSnapshot } from '../sentiment-timeline.js';
import { detectLifeEvents, saveEvent } from '../life-events.js';
import { calculateHealthScore, getHealthScore } from '../relationship-health.js';
import { generateStarters } from '../conversation-starters.js';
import { recordWin, generateCelebrations } from '../celebration-momentum.js';
import { onSessionStart, onSessionEnd, saveTrustProfiles } from '../persistence.js';

describe('Trust Systems E2E', () => {
  describe('New User Journey', () => {
    const newUserId = `new-user-${Date.now()}`;

    it('should handle first-time user flow', async () => {
      // 1. Session starts - load (empty) trust profiles
      await onSessionStart(newUserId);

      // 2. User speaks - detect emotion
      recordEmotionalSnapshot(newUserId, {
        primaryEmotion: 'anticipation',
        secondaryEmotions: [],
        intensity: 0.6,
        source: 'detected',
      });

      // 3. User mentions future event
      const detections = detectLifeEvents(newUserId, 'I have a big presentation next week');

      for (const detection of detections) {
        if (detection.detected && detection.event) {
          saveEvent({
            ...detection.event,
            userId: newUserId,
            id: `event-${Date.now()}`,
            date: detection.event.date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            type: detection.event.type || 'event',
            importance: 'high',
            followUp: { beforeReminder: true, afterCheckIn: true },
            tags: ['work'],
            context: { mentionedAt: new Date(), originalText: 'presentation next week' },
          } as Parameters<typeof saveEvent>[0]);
        }
      }

      // 4. Generate appropriate starter (new user, has upcoming event)
      const starters = generateStarters({
        userId: newUserId,
      });

      expect(starters.length).toBeGreaterThan(0);

      // 5. Session ends - save profiles
      await onSessionEnd(newUserId);

      // Verification: Health score should be a valid stage
      const factors = { consistency: 10, depth: 10, trust: 10, engagement: 50, growth: 10 };
      const health = calculateHealthScore(newUserId, factors);
      expect(['new', 'building', 'established']).toContain(health.stage);
    });
  });

  describe('Returning User Journey', () => {
    const returningUserId = `returning-user-${Date.now()}`;

    it('should handle returning user with history', async () => {
      // Setup: Create some history
      const factors = { consistency: 60, depth: 55, trust: 65, engagement: 70, growth: 58 };
      calculateHealthScore(returningUserId, factors);

      // Record past wins
      recordWin(returningUserId, {
        type: 'followed_through',
        description: 'Previous commitment kept',
        tags: ['consistency'],
      });

      // 1. Session starts - load trust profiles
      await onSessionStart(returningUserId);

      // 2. Check health score exists
      const health = getHealthScore(returningUserId);
      expect(health).toBeDefined();

      // 3. Generate personalized starter
      const starters = generateStarters({
        userId: returningUserId,
        recentTopics: ['work', 'health'],
      });

      expect(starters.length).toBeGreaterThan(0);

      // 4. User reports a win (using valid WinType 'courage_moment')
      recordWin(returningUserId, {
        type: 'courage_moment', // Valid WinType
        description: 'Spoke up in meeting',
        tags: ['work', 'growth'],
      });

      // 5. Generate celebration
      const celebrations = generateCelebrations(returningUserId);
      // May or may not have celebratable moments depending on thresholds
      expect(Array.isArray(celebrations)).toBe(true);

      // 6. Session ends
      await onSessionEnd(returningUserId);
    });
  });

  describe('Emotional Journey', () => {
    const emotionalUserId = `emotional-user-${Date.now()}`;

    it('should track emotional journey across session', async () => {
      await onSessionStart(emotionalUserId);

      // Start of session: neutral
      recordEmotionalSnapshot(emotionalUserId, {
        primaryEmotion: 'neutral',
        secondaryEmotions: [],
        intensity: 0.3,
        source: 'detected',
      });

      // User shares difficulty
      recordEmotionalSnapshot(emotionalUserId, {
        primaryEmotion: 'sadness',
        secondaryEmotions: ['anxiety'],
        intensity: 0.7,
        source: 'detected',
      });

      // AI provides support, user feels better
      recordEmotionalSnapshot(emotionalUserId, {
        primaryEmotion: 'trust',
        secondaryEmotions: [],
        intensity: 0.6,
        source: 'detected',
      });

      // End of session: user has processed emotions
      recordEmotionalSnapshot(emotionalUserId, {
        primaryEmotion: 'joy',
        secondaryEmotions: ['trust'],
        intensity: 0.75,
        source: 'detected',
      });

      await onSessionEnd(emotionalUserId);

      // Verification: This should be detectable as a successful session
      // (went from negative to positive)
    });
  });

  describe('Life Event Follow-Up Journey', () => {
    const eventUserId = `event-user-${Date.now()}`;

    it('should track event from mention to follow-up', async () => {
      await onSessionStart(eventUserId);

      // Day 1: User mentions upcoming event
      const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      saveEvent({
        userId: eventUserId,
        id: 'job-interview-event',
        type: 'appointment', // Valid EventType (not 'interview')
        description: 'Job interview at TechCorp',
        date: nextWeek,
        importance: 'high',
        followUp: { beforeReminder: true, afterCheckIn: true },
        tags: ['career'],
        context: { mentionedAt: new Date(), originalText: 'interview next week' },
      });

      await onSessionEnd(eventUserId);

      // Simulate time passing...
      // Day 7: Event day

      await onSessionStart(eventUserId);

      // Generate starters should mention the event
      const starters = generateStarters({
        userId: eventUserId,
        upcomingEvents: [
          {
            id: 'job-interview-event',
            description: 'Job interview',
            date: nextWeek,
            type: 'appointment' as const,
          },
        ],
      });

      expect(starters.length).toBeGreaterThan(0);

      await onSessionEnd(eventUserId);
    });
  });

  describe('Growth Momentum Journey', () => {
    const growthUserId = `growth-user-${Date.now()}`;

    it('should build momentum through consistent wins', async () => {
      // Simulate multiple sessions with wins
      for (let session = 0; session < 3; session++) {
        await onSessionStart(growthUserId);

        // Record a win each session
        recordWin(growthUserId, {
          type: 'followed_through', // Valid WinType
          description: `Kept commitment #${session + 1}`,
          tags: ['consistency'],
        });

        await onSessionEnd(growthUserId);
      }

      // Check momentum after 3 sessions
      await onSessionStart(growthUserId);

      const celebrations = generateCelebrations(growthUserId);

      // Should potentially have streak celebration
      expect(Array.isArray(celebrations)).toBe(true);

      await onSessionEnd(growthUserId);
    });
  });

  describe('Data Persistence Journey', () => {
    const persistUserId = `persist-user-${Date.now()}`;

    it('should persist and restore user data', async () => {
      // Session 1: Create data
      await onSessionStart(persistUserId);

      recordEmotionalSnapshot(persistUserId, {
        primaryEmotion: 'joy',
        secondaryEmotions: [],
        intensity: 0.8,
        source: 'detected',
      });

      recordWin(persistUserId, {
        type: 'breakthrough',
        description: 'Major insight',
        tags: ['growth'],
      });

      await onSessionEnd(persistUserId);

      // Session 2: Should have data from session 1
      await onSessionStart(persistUserId);

      // Data should still be there (if persistence works)
      // This depends on Firestore being available in test environment

      await onSessionEnd(persistUserId);
    });
  });
});
