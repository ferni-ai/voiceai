/**
 * Human-First 2FA System Tests
 *
 * Tests for trust levels, magic moments, and verification flows.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  detectMagicMoment,
  canPerformOperation,
  recordPhoneAskResponse,
  initiatePhoneVerification,
  verifyPhoneCode,
  getStoredVerificationCode,
  type TrustState,
  type TrustLevel,
  type OperationSensitivity,
} from '../human-first-2fa.js';

// Mock Twilio
vi.mock('../../twilio-sms.js', () => ({
  sendVerificationCode: vi.fn().mockResolvedValue('mock-sid'),
  isTwilioConfigured: vi.fn().mockReturnValue(false),
}));

describe('HumanFirst2FA', () => {
  // ===========================================================================
  // detectMagicMoment
  // ===========================================================================
  describe('detectMagicMoment', () => {
    describe('reminder moments', () => {
      it('should detect "remind me" as magic moment', () => {
        const result = detectMagicMoment('Can you remind me to call mom tomorrow?');

        expect(result.isMagicMoment).toBe(true);
        expect(result.momentType).toBe('wants_reminder');
        expect(result.suggestedAsk).toBeDefined();
      });

      it('should detect "don\'t let me forget" as reminder', () => {
        const result = detectMagicMoment("Don't let me forget to send that email");

        expect(result.isMagicMoment).toBe(true);
        expect(result.momentType).toBe('wants_reminder');
      });
    });

    describe('celebration moments', () => {
      it('should detect "I did it" as celebration', () => {
        const result = detectMagicMoment('I did it! I finally passed the exam!');

        expect(result.isMagicMoment).toBe(true);
        expect(result.momentType).toBe('celebrating_win');
      });

      it('should detect "I finally" as celebration', () => {
        const result = detectMagicMoment('I finally got the promotion!');

        expect(result.isMagicMoment).toBe(true);
        expect(result.momentType).toBe('celebrating_win');
      });

      it('should detect excitement expressions', () => {
        const result = detectMagicMoment("I'm so excited about this!");

        expect(result.isMagicMoment).toBe(true);
        expect(result.momentType).toBe('celebrating_win');
      });
    });

    describe('processing hard things', () => {
      it('should detect "going through" as processing', () => {
        const result = detectMagicMoment("I'm going through a really tough time");

        expect(result.isMagicMoment).toBe(true);
        expect(result.momentType).toBe('processing_hard_thing');
      });

      it('should detect "struggling with" as processing', () => {
        const result = detectMagicMoment("I'm struggling with anxiety lately");

        expect(result.isMagicMoment).toBe(true);
        expect(result.momentType).toBe('processing_hard_thing');
      });

      it('should detect feeling overwhelmed', () => {
        const result = detectMagicMoment("I'm feeling overwhelmed with everything");

        expect(result.isMagicMoment).toBe(true);
        expect(result.momentType).toBe('processing_hard_thing');
      });
    });

    describe('accountability moments', () => {
      it('should detect "help me stick to" as accountability', () => {
        const result = detectMagicMoment('Can you help me stick to my diet?');

        expect(result.isMagicMoment).toBe(true);
        expect(result.momentType).toBe('wants_accountability');
      });

      it('should detect "hold me accountable"', () => {
        const result = detectMagicMoment('I need you to hold me accountable');

        expect(result.isMagicMoment).toBe(true);
        expect(result.momentType).toBe('wants_accountability');
      });
    });

    describe('outreach requests', () => {
      it('should detect "can you check in"', () => {
        const result = detectMagicMoment('Can you check in on me sometimes?');

        expect(result.isMagicMoment).toBe(true);
        expect(result.momentType).toBe('asks_about_outreach');
      });

      it('should detect "can we stay in touch"', () => {
        const result = detectMagicMoment('Can we stay in touch between sessions?');

        expect(result.isMagicMoment).toBe(true);
        expect(result.momentType).toBe('asks_about_outreach');
      });
    });

    describe('commitment moments', () => {
      it('should detect "I\'m going to" as commitment', () => {
        const result = detectMagicMoment("I'm going to start exercising every day");

        expect(result.isMagicMoment).toBe(true);
        expect(result.momentType).toBe('meaningful_commitment');
      });

      it('should detect "I\'ve decided to"', () => {
        const result = detectMagicMoment("I've decided to quit smoking");

        expect(result.isMagicMoment).toBe(true);
        expect(result.momentType).toBe('meaningful_commitment');
      });
    });

    describe('vulnerability moments', () => {
      it('should detect "I\'ve never told anyone"', () => {
        const result = detectMagicMoment("I've never told anyone this before");

        expect(result.isMagicMoment).toBe(true);
        expect(result.momentType).toBe('vulnerability_shared');
      });

      it('should detect "hard to admit"', () => {
        const result = detectMagicMoment('This is hard to admit, but...');

        expect(result.isMagicMoment).toBe(true);
        expect(result.momentType).toBe('vulnerability_shared');
      });
    });

    describe('loneliness moments', () => {
      it('should detect "feel so lonely"', () => {
        const result = detectMagicMoment('I feel so lonely sometimes');

        expect(result.isMagicMoment).toBe(true);
        expect(result.momentType).toBe('expressed_loneliness');
      });

      it('should detect "feel alone"', () => {
        const result = detectMagicMoment('I feel so alone these days');

        expect(result.isMagicMoment).toBe(true);
        expect(result.momentType).toBe('expressed_loneliness');
      });
    });

    describe('context-based detection', () => {
      it('should detect returning after break from context', () => {
        const result = detectMagicMoment("Hey, how's it going?", {
          turnCount: 1,
          daysSinceLastContact: 20,
        });

        expect(result.isMagicMoment).toBe(true);
        expect(result.momentType).toBe('returning_after_break');
      });

      it('should detect first deep convo from context', () => {
        const result = detectMagicMoment('Thank you for listening', {
          turnCount: 10,
          emotionalIntensity: 0.8,
        });

        expect(result.isMagicMoment).toBe(true);
        expect(result.momentType).toBe('first_deep_convo');
      });
    });

    describe('non-magic moments', () => {
      it('should not detect regular conversation', () => {
        const result = detectMagicMoment("What's the weather like today?");

        expect(result.isMagicMoment).toBe(false);
      });

      it('should not detect simple greetings', () => {
        const result = detectMagicMoment('Hi, how are you?');

        expect(result.isMagicMoment).toBe(false);
      });
    });

    it('should include confidence score', () => {
      const result = detectMagicMoment('I finally did it!');

      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should include emotional context', () => {
      const result = detectMagicMoment('I finally did it!');

      expect(result.emotionalContext).toBeDefined();
    });
  });

  // ===========================================================================
  // canPerformOperation
  // ===========================================================================
  describe('canPerformOperation', () => {
    const createTrustState = (level: TrustLevel, relationshipScore = 50): TrustState => ({
      userId: 'test-user',
      level,
      factors: {
        voiceMatch: level === 'verified' || level === 'trusted',
        voiceConfidence: level === 'verified' ? 0.95 : 0.5,
        deviceRecognized: level !== 'stranger',
        phoneVerified: level === 'verified',
        knowledgeVerified: false,
      },
      relationshipScore,
      conversationCount: 10,
      daysSinceFirstContact: 30,
      hasPhone: false,
      hasEmail: false,
      verificationCount: 0,
      failedVerifications: 0,
    });

    it('should allow casual operations for strangers', () => {
      const state = createTrustState('stranger');
      const result = canPerformOperation(state, 'casual');

      expect(result.allowed).toBe(true);
    });

    it('should deny personal operations for strangers', () => {
      const state = createTrustState('stranger');
      const result = canPerformOperation(state, 'personal');

      expect(result.allowed).toBe(false);
      expect(result.requiresVerification).toBe(true);
    });

    it('should allow personal operations for recognized users', () => {
      const state = createTrustState('recognized');
      const result = canPerformOperation(state, 'personal');

      expect(result.allowed).toBe(true);
    });

    it('should allow sensitive operations for trusted users', () => {
      const state = createTrustState('trusted');
      const result = canPerformOperation(state, 'sensitive');

      expect(result.allowed).toBe(true);
    });

    it('should deny sensitive operations for recognized users', () => {
      const state = createTrustState('recognized');
      const result = canPerformOperation(state, 'sensitive');

      expect(result.allowed).toBe(false);
    });

    it('should allow sensitive operations for deep relationships even at lower trust', () => {
      const state = createTrustState('recognized', 80); // High relationship score
      const result = canPerformOperation(state, 'sensitive');

      expect(result.allowed).toBe(true);
    });

    it('should require verification for critical operations', () => {
      const state = createTrustState('trusted');
      const result = canPerformOperation(state, 'critical');

      expect(result.allowed).toBe(false);
      expect(result.requiresVerification).toBe(true);
    });

    it('should allow critical operations for verified users', () => {
      const state = createTrustState('verified');
      const result = canPerformOperation(state, 'critical');

      expect(result.allowed).toBe(true);
    });
  });

  // ===========================================================================
  // recordPhoneAskResponse
  // ===========================================================================
  describe('recordPhoneAskResponse', () => {
    it('should not throw for unknown user', () => {
      expect(() => {
        recordPhoneAskResponse('unknown-user', 'declined');
      }).not.toThrow();
    });

    it('should accept "provided" response', () => {
      expect(() => {
        recordPhoneAskResponse('test-user', 'provided');
      }).not.toThrow();
    });

    it('should accept "ignored" response', () => {
      expect(() => {
        recordPhoneAskResponse('test-user', 'ignored');
      }).not.toThrow();
    });
  });

  // ===========================================================================
  // Phone Verification Flow
  // ===========================================================================
  describe('initiatePhoneVerification', () => {
    it('should store verification code', async () => {
      const userId = `verify-test-${Date.now()}`;
      const result = await initiatePhoneVerification(userId, '+15551234567');

      expect(result.success).toBe(true);
      expect(result.message).toContain('code');

      const stored = getStoredVerificationCode(userId);
      expect(stored).toBeDefined();
      expect(stored?.code).toHaveLength(6);
    });

    it('should set expiry time', async () => {
      const userId = `verify-expiry-${Date.now()}`;
      await initiatePhoneVerification(userId, '+15551234567');

      const stored = getStoredVerificationCode(userId);
      expect(stored?.expires).toBeInstanceOf(Date);
      expect(stored?.expires.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('verifyPhoneCode', () => {
    it('should verify correct code', async () => {
      const userId = `verify-correct-${Date.now()}`;
      await initiatePhoneVerification(userId, '+15551234567');

      const stored = getStoredVerificationCode(userId);
      const result = await verifyPhoneCode(userId, stored!.code);

      expect(result.verified).toBe(true);
      expect(result.message).toContain('Perfect');
    });

    it('should reject incorrect code', async () => {
      const userId = `verify-wrong-${Date.now()}`;
      await initiatePhoneVerification(userId, '+15551234567');

      const result = await verifyPhoneCode(userId, '000000');

      expect(result.verified).toBe(false);
      expect(result.message).toContain("doesn't match");
    });

    it('should handle no pending code', async () => {
      const result = await verifyPhoneCode('no-code-user', '123456');

      expect(result.verified).toBe(false);
      expect(result.message).toContain("don't have a code");
    });

    it('should clear code after successful verification', async () => {
      const userId = `verify-clear-${Date.now()}`;
      await initiatePhoneVerification(userId, '+15551234567');

      const stored = getStoredVerificationCode(userId);
      await verifyPhoneCode(userId, stored!.code);

      const afterVerify = getStoredVerificationCode(userId);
      expect(afterVerify).toBeUndefined();
    });
  });
});
