/**
 * Tests for Callback Helpers
 *
 * Tests the "smile factor" - the callback system that makes users
 * feel remembered by following up on things they shared.
 *
 * @module tests/personality/callback-helpers
 */

import { describe, expect, it } from 'vitest';
import {
  createCallbackKeyMoment,
  extractCallbackKeyMoments,
  formatCallbackForPrompt,
  getPendingCallbacksFromProfile,
} from '../../personality/callback-helpers.js';
import type { UserProfile } from '../../types/user-profile.js';

describe('Callback Helpers', () => {
  // ============================================================================
  // CALLBACK CREATION TESTS
  // ============================================================================

  describe('createCallbackKeyMoment', () => {
    it('should create a key moment with defaults', () => {
      const moment = createCallbackKeyMoment('User mentioned job interview');

      expect(moment.id).toMatch(/^km_/);
      expect(moment.summary).toBe('User mentioned job interview');
      expect(moment.type).toBe('concern');
      expect(moment.emotionalWeight).toBe('medium');
      expect(moment.followUpNeeded).toBe(true);
      expect(moment.timestamp).toBeInstanceOf(Date);
    });

    it('should respect provided options', () => {
      const followUpDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const moment = createCallbackKeyMoment('Passed the exam!', {
        type: 'celebration',
        emotionalWeight: 'light',
        topics: ['career', 'achievement'],
        followUpDate,
      });

      expect(moment.type).toBe('celebration');
      expect(moment.emotionalWeight).toBe('light');
      expect(moment.topics).toContain('career');
      expect(moment.followUpDate).toEqual(followUpDate);
    });

    it('should generate unique IDs', () => {
      const moment1 = createCallbackKeyMoment('First moment');
      const moment2 = createCallbackKeyMoment('Second moment');

      expect(moment1.id).not.toBe(moment2.id);
    });
  });

  // ============================================================================
  // EXTRACTION TESTS
  // ============================================================================

  describe('extractCallbackKeyMoments', () => {
    it('should extract upcoming event callbacks', () => {
      const message = 'I have an interview on Friday';
      const callbacks = extractCallbackKeyMoments(message);

      expect(callbacks.length).toBeGreaterThan(0);
      expect(callbacks.some((c) => c.type === 'milestone')).toBe(true);
    });

    it('should extract decision-related callbacks', () => {
      const message = "I'm thinking about quitting my job";
      const callbacks = extractCallbackKeyMoments(message);

      expect(callbacks.length).toBeGreaterThan(0);
      expect(callbacks.some((c) => c.type === 'decision')).toBe(true);
      expect(callbacks.some((c) => c.emotionalWeight === 'heavy')).toBe(true);
    });

    it('should extract vulnerable share callbacks', () => {
      const message = "I've never told anyone this before, but I struggle with anxiety";
      const callbacks = extractCallbackKeyMoments(message);

      expect(callbacks.length).toBeGreaterThan(0);
      expect(callbacks.some((c) => c.type === 'shared_vulnerability')).toBe(true);
    });

    it('should extract celebration callbacks', () => {
      const message = 'I finally finished my thesis!';
      const callbacks = extractCallbackKeyMoments(message);

      expect(callbacks.length).toBeGreaterThan(0);
      expect(callbacks.some((c) => c.type === 'celebration')).toBe(true);
      expect(callbacks.some((c) => c.emotionalWeight === 'light')).toBe(true);
    });

    it('should return empty array for non-callback messages', () => {
      const message = 'The weather is nice today.';
      const callbacks = extractCallbackKeyMoments(message);

      expect(callbacks).toHaveLength(0);
    });

    it('should handle messages with multiple callback-worthy items', () => {
      const message =
        "I have a presentation next Tuesday and I'm thinking about leaving my company";
      const callbacks = extractCallbackKeyMoments(message);

      // Should detect both event and decision
      expect(callbacks.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================================
  // PENDING CALLBACKS TESTS
  // ============================================================================

  describe('getPendingCallbacksFromProfile', () => {
    const createMockProfile = (keyMoments: UserProfile['keyMoments']): UserProfile => ({
      id: 'test-user',
      createdAt: new Date(),
      lastActive: new Date(),
      totalConversations: 10,
      personalityTraits: {},
      keyMoments: keyMoments || [],
    });

    it('should return pending callbacks that need follow-up', () => {
      const profile = createMockProfile([
        {
          id: 'km_1',
          timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          type: 'milestone',
          summary: 'Job interview',
          emotionalWeight: 'medium',
          topics: ['career'],
          followUpNeeded: true,
        },
      ]);

      const pending = getPendingCallbacksFromProfile(profile);

      expect(pending).toHaveLength(1);
      expect(pending[0].moment.summary).toBe('Job interview');
      expect(pending[0].question).toContain('go');
    });

    it('should not return callbacks that do not need follow-up', () => {
      const profile = createMockProfile([
        {
          id: 'km_1',
          timestamp: new Date(),
          type: 'milestone',
          summary: 'Already followed up',
          emotionalWeight: 'medium',
          topics: [],
          followUpNeeded: false,
        },
      ]);

      const pending = getPendingCallbacksFromProfile(profile);

      expect(pending).toHaveLength(0);
    });

    it('should not return callbacks before their follow-up date', () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const profile = createMockProfile([
        {
          id: 'km_1',
          timestamp: new Date(),
          type: 'milestone',
          summary: 'Future event',
          emotionalWeight: 'medium',
          topics: [],
          followUpNeeded: true,
          followUpDate: futureDate,
        },
      ]);

      const pending = getPendingCallbacksFromProfile(profile);

      expect(pending).toHaveLength(0);
    });

    it('should sort by emotional weight (heavy first)', () => {
      const profile = createMockProfile([
        {
          id: 'km_1',
          timestamp: new Date(),
          type: 'celebration',
          summary: 'Light moment',
          emotionalWeight: 'light',
          topics: [],
          followUpNeeded: true,
        },
        {
          id: 'km_2',
          timestamp: new Date(),
          type: 'decision',
          summary: 'Heavy decision',
          emotionalWeight: 'heavy',
          topics: [],
          followUpNeeded: true,
        },
      ]);

      const pending = getPendingCallbacksFromProfile(profile);

      expect(pending).toHaveLength(2);
      expect(pending[0].moment.emotionalWeight).toBe('heavy');
      expect(pending[1].moment.emotionalWeight).toBe('light');
    });

    it('should generate appropriate questions by type', () => {
      const profile = createMockProfile([
        {
          id: 'km_1',
          timestamp: new Date(),
          type: 'celebration',
          summary: 'Passed exam',
          emotionalWeight: 'light',
          topics: [],
          followUpNeeded: true,
        },
        {
          id: 'km_2',
          timestamp: new Date(),
          type: 'decision',
          summary: 'Job change',
          emotionalWeight: 'heavy',
          topics: [],
          followUpNeeded: true,
        },
        {
          id: 'km_3',
          timestamp: new Date(),
          type: 'shared_vulnerability',
          summary: 'Personal struggle',
          emotionalWeight: 'heavy',
          topics: [],
          followUpNeeded: true,
        },
      ]);

      const pending = getPendingCallbacksFromProfile(profile);

      // Each type should have a different question style
      const celebrationCallback = pending.find((p) => p.moment.type === 'celebration');
      const decisionCallback = pending.find((p) => p.moment.type === 'decision');
      const vulnerabilityCallback = pending.find((p) => p.moment.type === 'shared_vulnerability');

      expect(celebrationCallback?.question).toContain('win');
      expect(decisionCallback?.question).toContain('decision');
      expect(vulnerabilityCallback?.question).toContain('shared');
    });

    it('should handle empty key moments', () => {
      const profile = createMockProfile([]);

      const pending = getPendingCallbacksFromProfile(profile);

      expect(pending).toHaveLength(0);
    });

    it('should handle undefined key moments', () => {
      const profile = createMockProfile(undefined);

      const pending = getPendingCallbacksFromProfile(profile);

      expect(pending).toHaveLength(0);
    });
  });

  // ============================================================================
  // FORMATTING TESTS
  // ============================================================================

  describe('formatCallbackForPrompt', () => {
    it('should format callback for prompt injection', () => {
      const callback = {
        moment: {
          id: 'km_1',
          timestamp: new Date(),
          type: 'milestone' as const,
          summary: 'Job interview on Friday',
          emotionalWeight: 'medium' as const,
          topics: ['career'],
          followUpNeeded: true,
        },
        question: 'How did that interview go?',
      };

      const formatted = formatCallbackForPrompt(callback);

      expect(formatted).toContain('CALLBACK OPPORTUNITY');
      expect(formatted).toContain('SMILE FACTOR');
      expect(formatted).toContain('Job interview on Friday');
      expect(formatted).toContain('How did that interview go?');
      expect(formatted).toContain('LOVED');
    });

    it('should include type in formatted output', () => {
      const callback = {
        moment: {
          id: 'km_1',
          timestamp: new Date(),
          type: 'decision' as const,
          summary: 'Thinking about career change',
          emotionalWeight: 'heavy' as const,
          topics: [],
          followUpNeeded: true,
        },
        question: 'Any movement on that decision?',
      };

      const formatted = formatCallbackForPrompt(callback);

      expect(formatted).toContain('decision');
    });
  });
});

