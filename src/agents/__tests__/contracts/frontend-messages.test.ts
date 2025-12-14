/**
 * Frontend Message Contract Tests
 *
 * Tests the contract between voice agent backend and frontend.
 * Ensures data messages sent to frontend match expected schemas.
 *
 * These contracts are critical for:
 * - Mood updates
 * - Celebration events
 * - Emotion events (Ferni EQ)
 * - Session state updates
 *
 * @module agents/__tests__/contracts/frontend-messages
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// ============================================================================
// CONTRACT SCHEMAS
// ============================================================================

/**
 * Schema for mood update messages
 */
export const MoodMessageSchema = z.object({
  state: z.enum([
    'calm',
    'energized',
    'contemplative',
    'playful',
    'supportive',
    'focused',
    'warm',
    'neutral',
  ]),
  energyLevel: z.number().min(0).max(1),
  relationshipStage: z.enum(['new', 'developing', 'established', 'deep', 'trusted', 'unknown']),
  hasTransition: z.boolean().optional(),
});

/**
 * Schema for celebration event messages
 */
export const CelebrationEventSchema = z.object({
  category: z.enum(['milestone', 'achievement', 'aha_moment', 'good_news']),
  content: z.string().min(1),
});

/**
 * Schema for emotion event messages (Ferni EQ)
 */
export const EmotionEventSchema = z.object({
  type: z.enum([
    'concern_detected',
    'voice_text_mismatch',
    'emotional_trajectory',
    'distress_alert',
    'micro_expression',
  ]),
  payload: z.object({
    emotion: z.string().optional(),
    intensity: z.number().min(0).max(1).optional(),
    distressLevel: z.number().min(0).max(1).optional(),
    trajectory: z.enum(['improving', 'stable', 'declining', 'escalating']).optional(),
    mismatch: z
      .object({
        textEmotion: z.string(),
        voiceEmotion: z.string(),
        confidence: z.number(),
      })
      .optional(),
    expression: z.string().optional(),
    duration: z.number().optional(),
  }),
  timestamp: z.number(),
});

/**
 * Schema for breath sync messages (Ferni EQ - Avatar breathing synchronization)
 */
export const BreathSyncSchema = z.object({
  type: z.literal('breath_sync'),
  syncQuality: z.number().min(0).max(1),
  pacing: z.number().min(0.5).max(2),
  hasBreathMarkers: z.boolean(),
  adjustedBreaks: z.number().int().min(0),
});

/**
 * Schema for session state update messages
 */
export const SessionStateUpdateSchema = z.object({
  type: z.literal('session_state'),
  sessionId: z.string(),
  turnCount: z.number().int().min(0),
  topic: z.string().optional(),
  emotionalState: z
    .object({
      primary: z.string(),
      intensity: z.number(),
      distressLevel: z.number(),
    })
    .optional(),
  relationshipStage: z.string().optional(),
});

/**
 * Schema for handoff messages
 */
export const HandoffMessageSchema = z.object({
  type: z.literal('handoff'),
  fromPersona: z.string(),
  toPersona: z.string(),
  context: z.string().optional(),
  reason: z.string().optional(),
});

/**
 * Schema for typing indicator messages
 */
export const TypingIndicatorSchema = z.object({
  type: z.enum(['typing_start', 'typing_stop']),
  personaId: z.string(),
});

/**
 * Schema for greeting messages
 */
export const GreetingMessageSchema = z.object({
  type: z.literal('greeting'),
  personaId: z.string(),
  isReturningUser: z.boolean(),
  userName: z.string().optional(),
});

// ============================================================================
// CONTRACT TESTS
// ============================================================================

describe('Frontend Message Contracts', () => {
  // ==========================================================================
  // MOOD MESSAGES
  // ==========================================================================

  describe('Mood Messages', () => {
    it('should validate valid mood message', () => {
      const moodMessage = {
        state: 'calm' as const,
        energyLevel: 0.6,
        relationshipStage: 'developing' as const,
        hasTransition: false,
      };

      const result = MoodMessageSchema.safeParse(moodMessage);

      expect(result.success).toBe(true);
    });

    it('should validate all mood states', () => {
      const states = [
        'calm',
        'energized',
        'contemplative',
        'playful',
        'supportive',
        'focused',
        'warm',
        'neutral',
      ] as const;

      for (const state of states) {
        const message = {
          state,
          energyLevel: 0.5,
          relationshipStage: 'established' as const,
        };

        const result = MoodMessageSchema.safeParse(message);
        expect(result.success).toBe(true);
      }
    });

    it('should validate all relationship stages', () => {
      const stages = ['new', 'developing', 'established', 'deep', 'trusted', 'unknown'] as const;

      for (const stage of stages) {
        const message = {
          state: 'calm' as const,
          energyLevel: 0.5,
          relationshipStage: stage,
        };

        const result = MoodMessageSchema.safeParse(message);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid energy level', () => {
      const invalidMessages = [
        { state: 'calm', energyLevel: -0.1, relationshipStage: 'new' },
        { state: 'calm', energyLevel: 1.5, relationshipStage: 'new' },
      ];

      for (const message of invalidMessages) {
        const result = MoodMessageSchema.safeParse(message);
        expect(result.success).toBe(false);
      }
    });

    it('should reject invalid mood state', () => {
      const message = {
        state: 'invalid_state',
        energyLevel: 0.5,
        relationshipStage: 'new',
      };

      const result = MoodMessageSchema.safeParse(message);
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // CELEBRATION EVENTS
  // ==========================================================================

  describe('Celebration Events', () => {
    it('should validate milestone event', () => {
      const event = {
        category: 'milestone' as const,
        content: 'User hit a 30-day streak!',
      };

      const result = CelebrationEventSchema.safeParse(event);

      expect(result.success).toBe(true);
    });

    it('should validate all celebration categories', () => {
      const categories = ['milestone', 'achievement', 'aha_moment', 'good_news'] as const;

      for (const category of categories) {
        const event = {
          category,
          content: `Test ${category} content`,
        };

        const result = CelebrationEventSchema.safeParse(event);
        expect(result.success).toBe(true);
      }
    });

    it('should reject empty content', () => {
      const event = {
        category: 'milestone' as const,
        content: '',
      };

      const result = CelebrationEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('should reject invalid category', () => {
      const event = {
        category: 'invalid_category',
        content: 'Some content',
      };

      const result = CelebrationEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // EMOTION EVENTS (FERNI EQ)
  // ==========================================================================

  describe('Emotion Events (Ferni EQ)', () => {
    it('should validate concern detected event', () => {
      const event = {
        type: 'concern_detected' as const,
        payload: {
          emotion: 'worried',
          intensity: 0.7,
          distressLevel: 0.5,
        },
        timestamp: Date.now(),
      };

      const result = EmotionEventSchema.safeParse(event);

      expect(result.success).toBe(true);
    });

    it('should validate voice-text mismatch event', () => {
      const event = {
        type: 'voice_text_mismatch' as const,
        payload: {
          mismatch: {
            textEmotion: 'happy',
            voiceEmotion: 'sad',
            confidence: 0.85,
          },
        },
        timestamp: Date.now(),
      };

      const result = EmotionEventSchema.safeParse(event);

      expect(result.success).toBe(true);
    });

    it('should validate emotional trajectory event', () => {
      const event = {
        type: 'emotional_trajectory' as const,
        payload: {
          trajectory: 'improving' as const,
          emotion: 'hopeful',
          intensity: 0.6,
        },
        timestamp: Date.now(),
      };

      const result = EmotionEventSchema.safeParse(event);

      expect(result.success).toBe(true);
    });

    it('should validate micro expression event', () => {
      const event = {
        type: 'micro_expression' as const,
        payload: {
          expression: 'recognition',
          duration: 80,
        },
        timestamp: Date.now(),
      };

      const result = EmotionEventSchema.safeParse(event);

      expect(result.success).toBe(true);
    });

    it('should validate all trajectory types', () => {
      const trajectories = ['improving', 'stable', 'declining', 'escalating'] as const;

      for (const trajectory of trajectories) {
        const event = {
          type: 'emotional_trajectory' as const,
          payload: { trajectory },
          timestamp: Date.now(),
        };

        const result = EmotionEventSchema.safeParse(event);
        expect(result.success).toBe(true);
      }
    });

    it('should reject missing timestamp', () => {
      const event = {
        type: 'concern_detected' as const,
        payload: { emotion: 'worried' },
      };

      const result = EmotionEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // BREATH SYNC (FERNI EQ - Avatar Breathing)
  // ==========================================================================

  describe('Breath Sync (Ferni EQ)', () => {
    it('should validate breath sync message', () => {
      const message = {
        type: 'breath_sync' as const,
        syncQuality: 0.85,
        pacing: 1.2,
        hasBreathMarkers: true,
        adjustedBreaks: 3,
      };

      const result = BreathSyncSchema.safeParse(message);
      expect(result.success).toBe(true);
    });

    it('should validate breath sync with minimum values', () => {
      const message = {
        type: 'breath_sync' as const,
        syncQuality: 0,
        pacing: 0.5,
        hasBreathMarkers: false,
        adjustedBreaks: 0,
      };

      const result = BreathSyncSchema.safeParse(message);
      expect(result.success).toBe(true);
    });

    it('should reject invalid sync quality', () => {
      const message = {
        type: 'breath_sync' as const,
        syncQuality: 1.5, // Out of range
        pacing: 1.0,
        hasBreathMarkers: true,
        adjustedBreaks: 1,
      };

      const result = BreathSyncSchema.safeParse(message);
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // SESSION STATE UPDATES
  // ==========================================================================

  describe('Session State Updates', () => {
    it('should validate full session state update', () => {
      const update = {
        type: 'session_state' as const,
        sessionId: 'session-123',
        turnCount: 5,
        topic: 'career',
        emotionalState: {
          primary: 'hopeful',
          intensity: 0.7,
          distressLevel: 0.1,
        },
        relationshipStage: 'developing',
      };

      const result = SessionStateUpdateSchema.safeParse(update);

      expect(result.success).toBe(true);
    });

    it('should validate minimal session state update', () => {
      const update = {
        type: 'session_state' as const,
        sessionId: 'session-456',
        turnCount: 0,
      };

      const result = SessionStateUpdateSchema.safeParse(update);

      expect(result.success).toBe(true);
    });

    it('should reject negative turn count', () => {
      const update = {
        type: 'session_state' as const,
        sessionId: 'session-789',
        turnCount: -1,
      };

      const result = SessionStateUpdateSchema.safeParse(update);
      expect(result.success).toBe(false);
    });

    it('should reject wrong type', () => {
      const update = {
        type: 'wrong_type',
        sessionId: 'session-123',
        turnCount: 0,
      };

      const result = SessionStateUpdateSchema.safeParse(update);
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // HANDOFF MESSAGES
  // ==========================================================================

  describe('Handoff Messages', () => {
    it('should validate handoff message', () => {
      const message = {
        type: 'handoff' as const,
        fromPersona: 'ferni',
        toPersona: 'jordan',
        context: 'User wants help planning an event',
        reason: 'Event planning specialist needed',
      };

      const result = HandoffMessageSchema.safeParse(message);

      expect(result.success).toBe(true);
    });

    it('should validate minimal handoff message', () => {
      const message = {
        type: 'handoff' as const,
        fromPersona: 'maya',
        toPersona: 'ferni',
      };

      const result = HandoffMessageSchema.safeParse(message);

      expect(result.success).toBe(true);
    });

    it('should reject missing required fields', () => {
      const invalidMessages = [
        { type: 'handoff', fromPersona: 'ferni' }, // missing toPersona
        { type: 'handoff', toPersona: 'jordan' }, // missing fromPersona
        { fromPersona: 'ferni', toPersona: 'jordan' }, // missing type
      ];

      for (const message of invalidMessages) {
        const result = HandoffMessageSchema.safeParse(message);
        expect(result.success).toBe(false);
      }
    });
  });

  // ==========================================================================
  // TYPING INDICATOR
  // ==========================================================================

  describe('Typing Indicator Messages', () => {
    it('should validate typing start', () => {
      const message = {
        type: 'typing_start' as const,
        personaId: 'ferni',
      };

      const result = TypingIndicatorSchema.safeParse(message);

      expect(result.success).toBe(true);
    });

    it('should validate typing stop', () => {
      const message = {
        type: 'typing_stop' as const,
        personaId: 'maya',
      };

      const result = TypingIndicatorSchema.safeParse(message);

      expect(result.success).toBe(true);
    });

    it('should reject invalid typing type', () => {
      const message = {
        type: 'typing_pause',
        personaId: 'ferni',
      };

      const result = TypingIndicatorSchema.safeParse(message);
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // GREETING MESSAGES
  // ==========================================================================

  describe('Greeting Messages', () => {
    it('should validate returning user greeting', () => {
      const message = {
        type: 'greeting' as const,
        personaId: 'ferni',
        isReturningUser: true,
        userName: 'Sarah',
      };

      const result = GreetingMessageSchema.safeParse(message);

      expect(result.success).toBe(true);
    });

    it('should validate new user greeting', () => {
      const message = {
        type: 'greeting' as const,
        personaId: 'ferni',
        isReturningUser: false,
      };

      const result = GreetingMessageSchema.safeParse(message);

      expect(result.success).toBe(true);
    });
  });
});

// ============================================================================
// CONTRACT HELPERS
// ============================================================================

/**
 * Validate a mood message against the contract
 */
export function validateMoodMessage(message: unknown): boolean {
  return MoodMessageSchema.safeParse(message).success;
}

/**
 * Validate a celebration event against the contract
 */
export function validateCelebrationEvent(event: unknown): boolean {
  return CelebrationEventSchema.safeParse(event).success;
}

/**
 * Validate an emotion event against the contract
 */
export function validateEmotionEvent(event: unknown): boolean {
  return EmotionEventSchema.safeParse(event).success;
}

/**
 * Validate a session state update against the contract
 */
export function validateSessionStateUpdate(update: unknown): boolean {
  return SessionStateUpdateSchema.safeParse(update).success;
}

/**
 * Create a valid mood message
 */
export function createValidMoodMessage(
  overrides: Partial<z.infer<typeof MoodMessageSchema>> = {}
): z.infer<typeof MoodMessageSchema> {
  return {
    state: 'calm',
    energyLevel: 0.5,
    relationshipStage: 'developing',
    ...overrides,
  };
}

/**
 * Create a valid celebration event
 */
export function createValidCelebrationEvent(
  category: z.infer<typeof CelebrationEventSchema>['category'],
  content: string
): z.infer<typeof CelebrationEventSchema> {
  return { category, content };
}

/**
 * Create a valid emotion event
 */
export function createValidEmotionEvent(
  type: z.infer<typeof EmotionEventSchema>['type'],
  payload: z.infer<typeof EmotionEventSchema>['payload']
): z.infer<typeof EmotionEventSchema> {
  return {
    type,
    payload,
    timestamp: Date.now(),
  };
}
