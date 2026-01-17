/**
 * Thinking of You Engine Tests
 *
 * Tests for the proactive "Thinking of You" outreach system
 * that generates no-agenda check-ins based on user shares.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectSignificantShare,
  generateThinkingOfYouMoments,
  generateRandomWarmth,
  getDueMoments,
  markMomentSent,
  recordOutreachResponse,
  updatePreferences,
  exportThinkingOfYouProfile,
  importThinkingOfYouProfile,
  type SignificantShare,
  type ThinkingOfYouProfile,
} from '../thinking-of-you.js';

describe('ThinkingOfYou', () => {
  const testUserId = 'test-user-123';

  beforeEach(() => {
    // Reset profile state by importing empty profile
    importThinkingOfYouProfile({
      userId: testUserId,
      significantShares: [],
      pendingMoments: [],
      sentMoments: [],
      preferences: {
        enabled: true,
        maxPerWeek: 2,
        preferredMethod: 'either',
        quietDays: [],
      },
    });
  });

  describe('detectSignificantShare', () => {
    it('should detect heavy topics like health concerns', () => {
      const share = detectSignificantShare(testUserId, 'I got some bad health news today', {
        topic: 'health',
        emotionIntensity: 0.8,
      });

      expect(share).not.toBeNull();
      expect(share?.emotionalWeight).toBe('heavy');
      expect(share?.followUpType).toBe('support');
    });

    it('should detect upcoming events', () => {
      const share = detectSignificantShare(testUserId, 'I have a job interview tomorrow', {
        topic: 'career',
      });

      expect(share).not.toBeNull();
      expect(share?.followUpType).toBe('celebrate');
      expect(share?.associatedDate).toBeDefined();
    });

    it('should return null for casual messages', () => {
      const share = detectSignificantShare(testUserId, 'Nice weather today', {});

      expect(share).toBeNull();
    });

    it('should detect high emotional intensity shares', () => {
      const share = detectSignificantShare(testUserId, 'I am so frustrated with everything', {
        emotionIntensity: 0.85,
      });

      expect(share).not.toBeNull();
      expect(share?.emotionalWeight).toBe('medium');
    });

    it('should extract people mentioned in messages', () => {
      const share = detectSignificantShare(
        testUserId,
        "I talked to Sarah about my mom's health issues",
        {
          topic: 'family',
          emotionIntensity: 0.6,
        }
      );

      expect(share).not.toBeNull();
      expect(share?.peopleMentioned).toContain('Sarah');
    });

    it('should parse tomorrow as next day', () => {
      const share = detectSignificantShare(testUserId, 'I have a presentation tomorrow', {});

      expect(share).not.toBeNull();
      expect(share?.associatedDate).toBeDefined();

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      expect(share?.associatedDate?.getDate()).toBe(tomorrow.getDate());
    });
  });

  describe('generateThinkingOfYouMoments', () => {
    it('should generate no moments for empty profile', () => {
      const moments = generateThinkingOfYouMoments(testUserId);
      expect(moments).toHaveLength(0);
    });

    it('should generate moments from significant shares', () => {
      // Add a significant share with a heavy topic keyword ('health')
      detectSignificantShare(testUserId, 'I got some concerning news about my health today', {
        topic: 'health',
        emotionIntensity: 0.9,
      });

      const moments = generateThinkingOfYouMoments(testUserId);

      expect(moments.length).toBeGreaterThan(0);
      expect(moments[0]?.type).toBe('holding_space');
      expect(moments[0]?.priority).toBe('high');
    });

    it('should not duplicate moments for same share', () => {
      detectSignificantShare(testUserId, 'My dad is in the hospital', {
        topic: 'family',
        emotionIntensity: 0.9,
      });

      const moments1 = generateThinkingOfYouMoments(testUserId);
      const moments2 = generateThinkingOfYouMoments(testUserId);

      // Second call should not create new moments for same share
      expect(moments2.length).toBe(0);
      expect(moments1.length).toBeGreaterThan(0);
    });
  });

  describe('generateRandomWarmth', () => {
    it('should generate random warmth message', () => {
      // First need a profile
      updatePreferences(testUserId, { enabled: true });

      const warmth = generateRandomWarmth(testUserId);

      expect(warmth).not.toBeNull();
      expect(warmth?.type).toBe('random_warmth');
      expect(warmth?.trigger.type).toBe('random');
      expect(warmth?.priority).toBe('low');
    });

    it('should respect rate limiting', () => {
      updatePreferences(testUserId, { enabled: true });

      // Generate first
      const warmth1 = generateRandomWarmth(testUserId);
      expect(warmth1).not.toBeNull();

      // Mark as sent to set lastNoAgendaOutreach
      if (warmth1) {
        markMomentSent(testUserId, warmth1.id);
      }

      // Try to generate again immediately - should be rate limited
      const warmth2 = generateRandomWarmth(testUserId);
      expect(warmth2).toBeNull();
    });
  });

  describe('getDueMoments', () => {
    it('should return empty for no pending moments', () => {
      const due = getDueMoments(testUserId);
      expect(due).toHaveLength(0);
    });

    it('should return moments past their suggested timing', () => {
      // Import profile with a past-due moment
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      importThinkingOfYouProfile({
        userId: testUserId,
        significantShares: [],
        pendingMoments: [
          {
            id: 'test-moment-1',
            type: 'genuine_check_in',
            trigger: { type: 'random' },
            message: 'Hey, how are you?',
            ssml: 'Hey, how are you?',
            suggestedTiming: pastDate,
            priority: 'low',
            sent: false,
          },
        ],
        sentMoments: [],
        preferences: {
          enabled: true,
          maxPerWeek: 2,
          preferredMethod: 'either',
          quietDays: [],
        },
      });

      const due = getDueMoments(testUserId);
      expect(due.length).toBe(1);
      expect(due[0]?.id).toBe('test-moment-1');
    });

    it('should not return already-sent moments', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      importThinkingOfYouProfile({
        userId: testUserId,
        significantShares: [],
        pendingMoments: [
          {
            id: 'sent-moment',
            type: 'genuine_check_in',
            trigger: { type: 'random' },
            message: 'Hey!',
            ssml: 'Hey!',
            suggestedTiming: pastDate,
            priority: 'low',
            sent: true,
          },
        ],
        sentMoments: [],
        preferences: {
          enabled: true,
          maxPerWeek: 2,
          preferredMethod: 'either',
          quietDays: [],
        },
      });

      const due = getDueMoments(testUserId);
      expect(due).toHaveLength(0);
    });
  });

  describe('markMomentSent', () => {
    it('should mark moment as sent and move to sentMoments', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      importThinkingOfYouProfile({
        userId: testUserId,
        significantShares: [],
        pendingMoments: [
          {
            id: 'to-send',
            type: 'genuine_check_in',
            trigger: { type: 'random' },
            message: 'Hey!',
            ssml: 'Hey!',
            suggestedTiming: pastDate,
            priority: 'low',
            sent: false,
          },
        ],
        sentMoments: [],
        preferences: {
          enabled: true,
          maxPerWeek: 2,
          preferredMethod: 'either',
          quietDays: [],
        },
      });

      markMomentSent(testUserId, 'to-send');

      const profile = exportThinkingOfYouProfile(testUserId);
      expect(profile?.pendingMoments).toHaveLength(0);
      expect(profile?.sentMoments).toHaveLength(1);
      expect(profile?.sentMoments[0]?.sent).toBe(true);
      expect(profile?.lastNoAgendaOutreach).toBeDefined();
    });
  });

  describe('recordOutreachResponse', () => {
    it('should record when user responded', () => {
      importThinkingOfYouProfile({
        userId: testUserId,
        significantShares: [],
        pendingMoments: [],
        sentMoments: [
          {
            id: 'sent-1',
            type: 'genuine_check_in',
            trigger: { type: 'random' },
            message: 'Hey!',
            ssml: 'Hey!',
            suggestedTiming: new Date(),
            priority: 'low',
            sent: true,
          },
        ],
        preferences: {
          enabled: true,
          maxPerWeek: 2,
          preferredMethod: 'either',
          quietDays: [],
        },
      });

      recordOutreachResponse(testUserId, 'sent-1', true);

      const profile = exportThinkingOfYouProfile(testUserId);
      expect(profile?.sentMoments[0]?.responseReceived).toBe(true);
    });

    it('should reduce frequency when user does not respond', () => {
      importThinkingOfYouProfile({
        userId: testUserId,
        significantShares: [],
        pendingMoments: [],
        sentMoments: [
          {
            id: 'ignored-1',
            type: 'genuine_check_in',
            trigger: { type: 'random' },
            message: 'Hey!',
            ssml: 'Hey!',
            suggestedTiming: new Date(),
            priority: 'low',
            sent: true,
          },
        ],
        preferences: {
          enabled: true,
          maxPerWeek: 3,
          preferredMethod: 'either',
          quietDays: [],
        },
      });

      recordOutreachResponse(testUserId, 'ignored-1', false);

      const profile = exportThinkingOfYouProfile(testUserId);
      expect(profile?.preferences.maxPerWeek).toBe(2);
    });
  });

  describe('updatePreferences', () => {
    it('should update user preferences', () => {
      updatePreferences(testUserId, {
        enabled: false,
        maxPerWeek: 5,
        preferredMethod: 'voice',
        quietDays: ['saturday', 'sunday'],
      });

      const profile = exportThinkingOfYouProfile(testUserId);
      expect(profile?.preferences.enabled).toBe(false);
      expect(profile?.preferences.maxPerWeek).toBe(5);
      expect(profile?.preferences.preferredMethod).toBe('voice');
      expect(profile?.preferences.quietDays).toContain('saturday');
    });

    it('should merge with existing preferences', () => {
      updatePreferences(testUserId, { maxPerWeek: 1 });

      const profile = exportThinkingOfYouProfile(testUserId);
      expect(profile?.preferences.maxPerWeek).toBe(1);
      expect(profile?.preferences.enabled).toBe(true); // unchanged default
    });
  });

  describe('export/import profile', () => {
    it('should export and import profile correctly', () => {
      const profile: ThinkingOfYouProfile = {
        userId: 'export-test',
        significantShares: [
          {
            id: 'share-1',
            content: 'Test share',
            sharedAt: new Date(),
            topic: 'life',
            emotionalWeight: 'light',
            peopleMentioned: [],
            followUpType: 'check_in',
          },
        ],
        pendingMoments: [],
        sentMoments: [],
        preferences: {
          enabled: true,
          maxPerWeek: 1,
          preferredMethod: 'text',
          quietDays: ['sunday'],
        },
        lastNoAgendaOutreach: new Date(),
      };

      importThinkingOfYouProfile(profile);

      const exported = exportThinkingOfYouProfile('export-test');
      expect(exported?.userId).toBe('export-test');
      expect(exported?.significantShares).toHaveLength(1);
      expect(exported?.preferences.preferredMethod).toBe('text');
    });
  });
});
