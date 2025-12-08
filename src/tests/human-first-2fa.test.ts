/**
 * Tests for Human-First 2FA System
 *
 * @module HumanFirst2FATests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectMagicMoment,
  calculateTrustLevel,
  shouldAskForPhone,
  canPerformOperation,
  recordPhoneAskResponse,
  type TrustState,
} from '../services/trust-and-identity/human-first-2fa.js';

describe('Human-First 2FA', () => {
  describe('Magic Moment Detection', () => {
    it('detects reminder requests', () => {
      const result = detectMagicMoment('Can you remind me to call mom tomorrow?');

      expect(result.isMagicMoment).toBe(true);
      expect(result.momentType).toBe('wants_reminder');
      expect(result.suggestedAsk).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0.4); // Base pattern match confidence
    });

    it('detects celebration moments', () => {
      const result = detectMagicMoment("I finally got the promotion! I can't believe it!");

      expect(result.isMagicMoment).toBe(true);
      expect(result.momentType).toBe('celebrating_win');
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it('detects hard times', () => {
      const result = detectMagicMoment("I'm going through a really hard time right now");

      expect(result.isMagicMoment).toBe(true);
      expect(result.momentType).toBe('processing_hard_thing');
      expect(result.confidence).toBeGreaterThan(0.4); // Pattern match gives ~0.475
    });

    it('detects accountability requests', () => {
      const result = detectMagicMoment('Can you help me stick to my workout routine?');

      expect(result.isMagicMoment).toBe(true);
      expect(result.momentType).toBe('wants_accountability');
    });

    it('detects vulnerability sharing', () => {
      const result = detectMagicMoment("I've never told anyone this before, but...");

      expect(result.isMagicMoment).toBe(true);
      expect(result.momentType).toBe('vulnerability_shared');
      expect(result.confidence).toBeGreaterThan(0.4); // High emotional weight but basic confidence
    });

    it('detects loneliness expressions', () => {
      const result = detectMagicMoment('I feel so lonely sometimes. No one really understands.');

      expect(result.isMagicMoment).toBe(true);
      expect(result.momentType).toBe('expressed_loneliness');
    });

    it('detects outreach requests', () => {
      const result = detectMagicMoment('Can you check in on me sometimes?');

      expect(result.isMagicMoment).toBe(true);
      expect(result.momentType).toBe('asks_about_outreach');
    });

    it('does not detect magic moments in casual conversation', () => {
      const result = detectMagicMoment("The weather is nice today, isn't it?");

      expect(result.isMagicMoment).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('detects returning after break with context', () => {
      const result = detectMagicMoment('Hey, how have you been?', {
        turnCount: 1,
        daysSinceLastContact: 21, // 3 weeks
      });

      expect(result.isMagicMoment).toBe(true);
      expect(result.momentType).toBe('returning_after_break');
    });

    it('detects first deep convo based on context', () => {
      const result = detectMagicMoment('This has been really helpful, thank you', {
        turnCount: 10,
        emotionalIntensity: 0.8,
      });

      expect(result.isMagicMoment).toBe(true);
      expect(result.momentType).toBe('first_deep_convo');
    });

    it('includes emotional context in analysis', () => {
      const result = detectMagicMoment("I'm going through something really difficult");

      expect(result.emotionalContext).toBe('supportive and gentle');
    });

    it('includes reasoning for detection', () => {
      const result = detectMagicMoment('Remind me to buy groceries');

      expect(result.reasoning).toContain('wants_reminder');
      expect(result.reasoning).toContain('confidence');
    });
  });

  describe('Phone Ask Scripts', () => {
    it('provides appropriate script for reminder moments', () => {
      const result = detectMagicMoment('Please remind me about my appointment');

      expect(result.suggestedAsk).toBeDefined();
      expect(result.suggestedAsk?.toLowerCase()).toContain('remind');
    });

    it('provides appropriate script for celebration moments', () => {
      const result = detectMagicMoment('I did it! I finally did it!');

      expect(result.suggestedAsk).toBeDefined();
      expect(result.suggestedAsk?.toLowerCase()).toMatch(/follow up|celebrate|text/);
    });

    it('provides caring script for hard times', () => {
      const result = detectMagicMoment("I'm struggling with something difficult");

      expect(result.suggestedAsk).toBeDefined();
      // Script should be caring - check for warm language
      expect(result.suggestedAsk?.toLowerCase()).toMatch(
        /check in|here for you|tomorrow|follow up|thinking about/
      );
    });

    it('provides gentle script for loneliness', () => {
      const result = detectMagicMoment("I don't have anyone to talk to");

      expect(result.suggestedAsk).toBeDefined();
      expect(result.suggestedAsk?.toLowerCase()).toMatch(/reach out|say hi/);
    });
  });

  describe('Trust Level Calculation', () => {
    it('returns stranger level for unknown users', async () => {
      const trustState = await calculateTrustLevel('unknown-user-xyz', {
        voiceConfidence: 0,
        deviceRecognized: false,
        callerIdMatch: false,
      });

      expect(trustState.level).toBe('stranger');
      expect(trustState.hasPhone).toBe(false);
    });

    it('returns trusted level with voice match', async () => {
      const trustState = await calculateTrustLevel('test-user', {
        voiceConfidence: 0.85,
        deviceRecognized: false,
        callerIdMatch: false,
      });

      // High voice confidence = trusted
      expect(['trusted', 'verified']).toContain(trustState.level);
    });

    it('returns verified level with multiple factors', async () => {
      const trustState = await calculateTrustLevel('test-user', {
        voiceConfidence: 0.9,
        deviceRecognized: true,
        callerIdMatch: true,
      });

      expect(trustState.level).toBe('verified');
    });

    it('calculates relationship score', async () => {
      const trustState = await calculateTrustLevel('test-user', {});

      expect(trustState.relationshipScore).toBeGreaterThanOrEqual(0);
      expect(trustState.conversationCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Operation Permission Checks', () => {
    it('allows casual operations for strangers', () => {
      const trustState: TrustState = {
        userId: 'test',
        level: 'stranger',
        factors: {
          voiceMatch: false,
          voiceConfidence: 0,
          deviceRecognized: false,
          phoneVerified: false,
          knowledgeVerified: false,
        },
        relationshipScore: 0,
        conversationCount: 0,
        daysSinceFirstContact: 0,
        hasPhone: false,
        hasEmail: false,
        verificationCount: 0,
        failedVerifications: 0,
      };

      const result = canPerformOperation(trustState, 'casual');
      expect(result.allowed).toBe(true);
    });

    it('requires verification for critical operations', () => {
      const trustState: TrustState = {
        userId: 'test',
        level: 'trusted',
        factors: {
          voiceMatch: true,
          voiceConfidence: 0.8,
          deviceRecognized: true,
          phoneVerified: false,
          knowledgeVerified: false,
        },
        relationshipScore: 50,
        conversationCount: 5,
        daysSinceFirstContact: 10,
        hasPhone: false,
        hasEmail: false,
        verificationCount: 0,
        failedVerifications: 0,
      };

      const result = canPerformOperation(trustState, 'critical');
      expect(result.allowed).toBe(false);
      expect(result.requiresVerification).toBe(true);
    });

    it('allows sensitive operations for verified users', () => {
      const trustState: TrustState = {
        userId: 'test',
        level: 'verified',
        factors: {
          voiceMatch: true,
          voiceConfidence: 0.95,
          deviceRecognized: true,
          phoneVerified: true,
          knowledgeVerified: false,
        },
        relationshipScore: 80,
        conversationCount: 20,
        daysSinceFirstContact: 60,
        hasPhone: true,
        hasEmail: true,
        verificationCount: 3,
        failedVerifications: 0,
      };

      const result = canPerformOperation(trustState, 'sensitive');
      expect(result.allowed).toBe(true);
    });

    it('allows sensitive operations based on relationship depth', () => {
      const trustState: TrustState = {
        userId: 'test',
        level: 'recognized',
        factors: {
          voiceMatch: false,
          voiceConfidence: 0.4,
          deviceRecognized: true,
          phoneVerified: false,
          knowledgeVerified: false,
        },
        relationshipScore: 75, // High relationship score
        conversationCount: 15,
        daysSinceFirstContact: 90,
        hasPhone: false,
        hasEmail: false,
        verificationCount: 0,
        failedVerifications: 0,
      };

      const result = canPerformOperation(trustState, 'sensitive');
      expect(result.allowed).toBe(true); // Allowed due to deep relationship
    });
  });

  describe('Phone Ask Orchestration', () => {
    // Use unique user IDs per test to avoid state pollution
    const getUniqueUserId = () => `test-user-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    it('should ask at magic moment after turn 3', async () => {
      const testUserId = getUniqueUserId();
      // Use a high-confidence trigger (accountability + context clues)
      const magicMoment = detectMagicMoment('Help me stick to my goal and keep me accountable', {
        turnCount: 4,
        emotionalIntensity: 0.7,
      });

      // Verify magic moment is detected
      expect(magicMoment.isMagicMoment).toBe(true);
      expect(magicMoment.confidence).toBeGreaterThan(0.5);

      const result = await shouldAskForPhone(testUserId, magicMoment, {
        turnCount: 4,
        hasAskedThisSession: false,
      });

      // New user without phone should be asked
      expect(result.shouldAsk).toBe(true);
      expect(result.script).toBeDefined();
    });

    it('should not ask before turn 3', async () => {
      const testUserId = getUniqueUserId();
      const magicMoment = detectMagicMoment('Remind me about this');

      const result = await shouldAskForPhone(testUserId, magicMoment, {
        turnCount: 2,
        hasAskedThisSession: false,
      });

      expect(result.shouldAsk).toBe(false);
      expect(result.reason).toContain('early');
    });

    it('should not ask twice in one session', async () => {
      const testUserId = getUniqueUserId();
      const magicMoment = detectMagicMoment('Remind me please');

      const result = await shouldAskForPhone(testUserId, magicMoment, {
        turnCount: 5,
        hasAskedThisSession: true,
      });

      expect(result.shouldAsk).toBe(false);
      expect(result.reason).toContain('session');
    });

    it('should not ask without magic moment', async () => {
      const testUserId = getUniqueUserId();
      const noMoment = detectMagicMoment('How are you today?');

      const result = await shouldAskForPhone(testUserId, noMoment, {
        turnCount: 5,
        hasAskedThisSession: false,
      });

      expect(result.shouldAsk).toBe(false);
      expect(result.reason).toContain('No magic moment');
    });

    it('tracks declined responses and prevents re-asking', async () => {
      const testUserId = getUniqueUserId();

      // First, trigger an ask (this sets up the tracking state)
      const firstMoment = detectMagicMoment('Remind me tomorrow');
      await shouldAskForPhone(testUserId, firstMoment, {
        turnCount: 5,
        hasAskedThisSession: false,
      });

      // Now record a decline
      recordPhoneAskResponse(testUserId, 'declined');

      // After decline, shouldn't ask again immediately (24 hour cooldown)
      const secondMoment = detectMagicMoment('Remind me about my meeting');
      const result = await shouldAskForPhone(testUserId, secondMoment, {
        turnCount: 6,
        hasAskedThisSession: false,
      });

      expect(result.shouldAsk).toBe(false);
      expect(result.reason).toContain('declined');
    });
  });

  describe('Script Quality', () => {
    it('scripts feel human not robotic', () => {
      const result = detectMagicMoment('I finally did it!');

      // Should not contain robotic phrases
      const robotic = ['please provide', 'enter your', 'required', 'mandatory'];
      const script = result.suggestedAsk?.toLowerCase() || '';

      for (const phrase of robotic) {
        expect(script).not.toContain(phrase);
      }
    });

    it('scripts contain caring language', () => {
      const result = detectMagicMoment("I'm going through a hard time");

      const script = result.suggestedAsk?.toLowerCase() || '';

      // Should contain warm language
      const warm = ['check in', 'here for', 'help', 'tomorrow', 'would'];
      const hasWarm = warm.some((word) => script.includes(word));

      expect(hasWarm).toBe(true);
    });
  });
});
