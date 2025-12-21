/**
 * Natural Voice Authentication Tests
 *
 * Tests for the human-friendly authentication system.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  authenticateNaturally,
  getNaturalGreeting,
  generateContextForLLM,
  enrollVoice,
  verifyIdentity,
  type AuthContext,
} from '../services/identity/natural-auth.js';

describe('Natural Authentication', () => {
  describe('authenticateNaturally', () => {
    it('should return unknown for empty metadata', async () => {
      const result = await authenticateNaturally({
        metadata: {},
      });

      expect(result.confidence).toBe('unknown');
      expect(result.action).toBe('ask_naturally');
      expect(result.isNewUser).toBe(true);
    });

    it('should identify user by device_id', async () => {
      const result = await authenticateNaturally({
        metadata: {
          device_id: 'test-device-123',
        },
      });

      expect(result.userId).toContain('device');
      // First time with this device should be new
      expect(result.isNewUser).toBe(true);
    });

    it('should identify user by phone number', async () => {
      const result = await authenticateNaturally({
        metadata: {
          caller_id: '+15551234567',
        },
      });

      expect(result.userId).toContain('phone');
    });

    it('should handle explicit user_id', async () => {
      const result = await authenticateNaturally({
        metadata: {
          user_id: 'known-user-123',
        },
      });

      expect(result.userId).toBe('known-user-123');
    });

    it('should handle null voice sketch', async () => {
      const result = await authenticateNaturally({
        metadata: { device_id: 'device-no-voice' },
        voiceSketch: null,
      });

      expect(result).toBeDefined();
      expect(result.voiceEnrolled).toBe(false);
    });
  });

  describe('getNaturalGreeting', () => {
    it('should generate warm greeting for certain confidence', () => {
      const authContext: AuthContext = {
        userId: 'user-123',
        userName: 'Sarah',
        confidence: 'certain',
        action: 'greet_warmly',
        isNewUser: false,
        isReturningUser: true,
        conversationCount: 10,
        relationshipStage: 'friend',
        voiceConfidence: 0.95,
        voiceEnrolled: true,
        shouldEnrollVoice: false,
        requiresVerification: false,
      };

      const greeting = getNaturalGreeting(authContext);

      expect(greeting).toBeDefined();
      expect(greeting.length).toBeGreaterThan(0);
    });

    it('should generate confirmation for likely confidence', () => {
      const authContext: AuthContext = {
        userId: 'user-456',
        userName: 'John',
        confidence: 'likely',
        action: 'confirm_gently',
        isNewUser: false,
        isReturningUser: true,
        conversationCount: 3,
        relationshipStage: 'acquaintance',
        voiceConfidence: 0.7,
        voiceEnrolled: true,
        shouldEnrollVoice: false,
        requiresVerification: false,
      };

      const greeting = getNaturalGreeting(authContext);

      expect(greeting).toBeDefined();
    });

    it('should generate introduction for unknown user', () => {
      const authContext: AuthContext = {
        userId: 'unknown',
        confidence: 'unknown',
        action: 'ask_naturally',
        isNewUser: true,
        isReturningUser: false,
        conversationCount: 0,
        relationshipStage: 'stranger',
        voiceConfidence: 0,
        voiceEnrolled: false,
        shouldEnrollVoice: true,
        requiresVerification: false,
      };

      const greeting = getNaturalGreeting(authContext);

      expect(greeting).toBeDefined();
    });
  });

  describe('generateContextForLLM', () => {
    it('should generate context for known user', () => {
      const authContext: AuthContext = {
        userId: 'user-known',
        userName: 'Alex',
        confidence: 'certain',
        action: 'greet_warmly',
        isNewUser: false,
        isReturningUser: true,
        conversationCount: 15,
        relationshipStage: 'friend',
        rememberedTopics: ['coffee', 'hiking', 'work project'],
        lastMilestone: 'Got promoted at work',
        voiceConfidence: 0.92,
        voiceEnrolled: true,
        shouldEnrollVoice: false,
        requiresVerification: false,
      };

      const context = generateContextForLLM(authContext);

      expect(context).toContain('Alex');
      expect(context).toContain('friend');
      expect(context).toContain('certain');
    });

    it('should generate context for new user', () => {
      const authContext: AuthContext = {
        userId: 'new-user',
        confidence: 'unknown',
        action: 'ask_naturally',
        isNewUser: true,
        isReturningUser: false,
        conversationCount: 0,
        relationshipStage: 'stranger',
        voiceConfidence: 0,
        voiceEnrolled: false,
        shouldEnrollVoice: true,
        requiresVerification: false,
      };

      const context = generateContextForLLM(authContext);

      expect(context).toContain('new');
      expect(context).toContain('stranger');
    });

    it('should include verification note when required', () => {
      const authContext: AuthContext = {
        userId: 'user-verify',
        userName: 'Pat',
        confidence: 'possible',
        action: 'verify_security',
        isNewUser: false,
        isReturningUser: true,
        conversationCount: 5,
        relationshipStage: 'acquaintance',
        voiceConfidence: 0.5,
        voiceEnrolled: true,
        shouldEnrollVoice: false,
        requiresVerification: true,
        verificationQuestion: "What's your favorite coffee order?",
      };

      const context = generateContextForLLM(authContext);

      // Should contain either "verification" or "verify"
      expect(context.toLowerCase()).toMatch(/verif(y|ication)/);
    });
  });

  describe('verifyIdentity', () => {
    it('should return false for unknown user', async () => {
      const result = await verifyIdentity('non-existent-user', 'any answer');

      expect(result.verified).toBe(false);
      expect(result.confidence).toBe(0);
    });
  });

  describe('Confidence Levels', () => {
    it('should map confidence to appropriate actions', async () => {
      // Unknown confidence should ask naturally
      const unknownResult = await authenticateNaturally({
        metadata: {},
      });
      expect(unknownResult.action).toBe('ask_naturally');
    });
  });

  describe('Relationship Stages', () => {
    it('should start as stranger for new users', async () => {
      const result = await authenticateNaturally({
        metadata: { device_id: 'brand-new-device' },
      });

      expect(result.relationshipStage).toBe('stranger');
    });
  });

  describe('Voice Enrollment', () => {
    it('should flag new users for voice enrollment', async () => {
      const result = await authenticateNaturally({
        metadata: {},
        voiceSketch: null,
      });

      expect(result.shouldEnrollVoice).toBe(true);
    });
  });
});
