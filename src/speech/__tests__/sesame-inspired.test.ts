/**
 * Sesame-Inspired Prosody Module Tests
 *
 * Tests for the state-of-the-art voice prosody features inspired by Sesame AI.
 * These features enable more natural, human-like expressiveness:
 * - Anticipatory emotional cues
 * - Mid-utterance micro-reactions
 * - Conversation context-aware prosody
 * - Pipeline integration
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Anticipatory Prosody
import {
  anticipateResponse,
  shouldAnticipate,
  resetAnticipatorySession,
  updateAnticipation,
  getLastAnticipation,
} from '../sesame-inspired/anticipatory-prosody.js';

// Micro-reactions
import {
  getMicroReaction,
  getSessionMicroReaction,
  resetMicroReactionSession,
} from '../sesame-inspired/micro-reactions.js';

// Conversation Prosody
import {
  getSessionProsodyRecommendation,
  resetConversationState,
} from '../sesame-inspired/conversation-prosody.js';

// Pipeline Integration
import {
  processPartialTranscript,
  getPreparedResponse,
  startNewTurn,
  resetSesamePipeline,
  getSesamePipelineMetrics,
} from '../sesame-inspired/pipeline-integration.js';

// Types
import type { PartialTranscript } from '../sesame-inspired/types.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createPartialTranscript(
  text: string,
  options: Partial<PartialTranscript> = {}
): PartialTranscript {
  return {
    text,
    isSpeaking: true,
    ...options,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Sesame-Inspired Prosody', () => {
  const testSessionId = 'test-sesame-session';

  beforeEach(() => {
    // Reset all session state
    resetAnticipatorySession(testSessionId);
    resetMicroReactionSession(testSessionId);
    resetConversationState(testSessionId);
    resetSesamePipeline(testSessionId);
  });

  afterEach(() => {
    // Clean up
    resetAnticipatorySession(testSessionId);
    resetMicroReactionSession(testSessionId);
    resetConversationState(testSessionId);
    resetSesamePipeline(testSessionId);
  });

  // -------------------------------------------------------------------------
  // ANTICIPATORY PROSODY
  // -------------------------------------------------------------------------

  describe('Anticipatory Prosody', () => {
    it('should not anticipate short transcripts', () => {
      const partial = createPartialTranscript('hi');
      expect(shouldAnticipate(partial)).toBe(false);
    });

    it('should anticipate longer transcripts with patterns', () => {
      // Use text that matches a pattern: "worried about"
      const partial = createPartialTranscript('I am worried about my job situation');
      expect(shouldAnticipate(partial)).toBe(true);
    });

    it('should detect excitement from transcript', () => {
      // Uses "guess what" which is a rising_excitement pattern
      const partial = createPartialTranscript('Guess what! Something amazing just happened!');
      const result = anticipateResponse(partial);

      expect(result.emotion).toBe('excited');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect sadness from transcript', () => {
      // Uses "passed away" which is a falling_sadness pattern
      const partial = createPartialTranscript('My grandmother passed away last week');
      const result = anticipateResponse(partial);

      expect(result.emotion).toBe('sympathetic');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect frustration from transcript', () => {
      // Uses "so frustrated" which is a building_frustration pattern
      const partial = createPartialTranscript('I am so frustrated with this situation');
      const result = anticipateResponse(partial);

      expect(result.emotion).toBe('sympathetic');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should provide opening reaction for strong emotions', () => {
      // Uses "guess what" pattern which should trigger opening reaction
      const partial = createPartialTranscript('Guess what happened today!');
      const result = anticipateResponse(partial);

      expect(result.openingReaction).toBeTruthy();
      expect(result.openingReaction).toContain('<');
    });

    it('should update and retrieve anticipation by session', () => {
      // Use text that matches a pattern
      const partial = createPartialTranscript('Guess what amazing thing happened');
      const result = anticipateResponse(partial);

      updateAnticipation(testSessionId, partial, result);

      const lastAnticipation = getLastAnticipation(testSessionId);
      expect(lastAnticipation).toBeTruthy();
      expect(lastAnticipation?.emotion).toBe(result.emotion);
    });

    it('should reset session state', () => {
      // Use text that matches a pattern
      const partial = createPartialTranscript('Guess what just happened to me');
      const result = anticipateResponse(partial);
      updateAnticipation(testSessionId, partial, result);

      resetAnticipatorySession(testSessionId);

      const lastAnticipation = getLastAnticipation(testSessionId);
      expect(lastAnticipation).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // MICRO-REACTIONS
  // -------------------------------------------------------------------------

  describe('Micro-reactions', () => {
    it('should get hmm reactions (acknowledgment)', () => {
      const result = getMicroReaction('hmm');

      expect(result).toBeTruthy();
      expect(result.ssml).toContain('<break');
      expect(result.type).toBe('hmm');
    });

    it('should get aww reactions (empathy)', () => {
      const result = getMicroReaction('aww');

      expect(result).toBeTruthy();
      expect(result.ssml).toBeTruthy();
      expect(result.type).toBe('aww');
    });

    it('should get wow reactions (excitement)', () => {
      const result = getMicroReaction('wow');

      expect(result).toBeTruthy();
      expect(result.type).toBe('wow');
    });

    it('should return reaction from session', () => {
      // Session reaction returns reaction based on context
      const result = getSessionMicroReaction(testSessionId, 'Actually I was thinking about this');
      // May or may not return based on probabilistic selection
      // Just verify it returns null or a valid reaction
      if (result) {
        expect(result.ssml).toBeTruthy();
        expect(result.type).toBeTruthy();
      }
    });

    it('should detect contexts in text', () => {
      // "actually" triggers acknowledgment context
      // Test multiple times since reactions are probabilistic
      let found = false;
      for (let i = 0; i < 5; i++) {
        resetMicroReactionSession(`${testSessionId}-${i}`);
        const result = getSessionMicroReaction(
          `${testSessionId}-${i}`,
          'Actually I wanted to talk about something'
        );
        if (result) {
          found = true;
          break;
        }
      }
      // Context detection should work at least once
      expect(found).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // CONVERSATION PROSODY
  // -------------------------------------------------------------------------

  describe('Conversation Prosody', () => {
    it('should provide base prosody for new sessions', () => {
      const prosody = getSessionProsodyRecommendation(testSessionId);

      expect(prosody.baseSpeed).toBeCloseTo(1.0, 1);
      expect(prosody.baseVolume).toBeCloseTo(1.0, 1);
      expect(prosody.pauseMultiplier).toBeGreaterThanOrEqual(1.0);
    });

    it('should recommend micro-reactions based on conversation state', () => {
      // First few turns should include micro-reactions
      const prosody = getSessionProsodyRecommendation(testSessionId);
      expect(prosody.includeMicroReactions).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // PIPELINE INTEGRATION
  // -------------------------------------------------------------------------

  describe('Pipeline Integration', () => {
    it('should process partial transcripts', () => {
      // Use text that matches "worried about" pattern (rising_concern)
      const partial: PartialTranscript = {
        text: 'I am worried about this situation at work',
        isSpeaking: true,
        tone: 'frustrated',
      };

      const prepared = processPartialTranscript(testSessionId, partial);

      expect(prepared).toBeTruthy();
      expect(prepared!.anticipatedEmotion).toBeTruthy();
      expect(prepared!.confidence).toBeGreaterThan(0);
    });

    it('should not reprocess same text', () => {
      // Use text that matches a pattern
      const partial: PartialTranscript = {
        text: 'Guess what happened to me today',
        isSpeaking: true,
      };

      const first = processPartialTranscript(testSessionId, partial);
      expect(first).toBeTruthy();

      const second = processPartialTranscript(testSessionId, partial);

      // Should return cached result
      expect(first).toEqual(second);
    });

    it('should track metrics', () => {
      // Use text that matches a pattern
      processPartialTranscript(testSessionId, {
        text: 'Guess what amazing thing happened to me',
        isSpeaking: true,
      });

      const metrics = getSesamePipelineMetrics(testSessionId);

      expect(metrics.hasAnticipation).toBe(true);
      expect(metrics.anticipationAge).toBeGreaterThanOrEqual(0);
    });

    it('should reset on new turn', () => {
      // Use text that matches a pattern
      processPartialTranscript(testSessionId, {
        text: 'I am so excited about this news',
        isSpeaking: true,
      });

      expect(getPreparedResponse(testSessionId)).toBeTruthy();

      startNewTurn(testSessionId);

      expect(getPreparedResponse(testSessionId)).toBeNull();
    });

    it('should fully reset pipeline', () => {
      processPartialTranscript(testSessionId, {
        text: 'Some message to process',
        isSpeaking: true,
      });

      resetSesamePipeline(testSessionId);

      expect(getPreparedResponse(testSessionId)).toBeNull();
      expect(getSesamePipelineMetrics(testSessionId).turnCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // INTEGRATION TESTS
  // -------------------------------------------------------------------------

  describe('Integration', () => {
    it('should work end-to-end for happy path', () => {
      // 1. User starts speaking with "guess what" pattern
      const partial1: PartialTranscript = {
        text: 'Guess what just happened',
        isSpeaking: true,
        tone: 'excited',
      };
      processPartialTranscript(testSessionId, partial1);

      // 2. User continues speaking with more excitement patterns
      const partial2: PartialTranscript = {
        text: 'Guess what! I finally got the promotion at work!',
        isSpeaking: true,
        tone: 'excited',
      };
      const prepared = processPartialTranscript(testSessionId, partial2);

      expect(prepared).toBeTruthy();
      expect(prepared!.anticipatedEmotion).toBe('excited');

      // 3. Start new turn
      startNewTurn(testSessionId);
      expect(getPreparedResponse(testSessionId)).toBeNull();
    });

    it('should work end-to-end for empathetic response', () => {
      // User shares something sad using "passed away" pattern
      const partial: PartialTranscript = {
        text: 'My grandmother passed away last week and I miss her',
        isSpeaking: true,
        tone: 'sad',
      };
      const prepared = processPartialTranscript(testSessionId, partial);

      expect(prepared).toBeTruthy();
      expect(prepared!.anticipatedEmotion).toBe('sympathetic');
    });
  });
});
