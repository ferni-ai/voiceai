/**
 * Response Mode Engine Tests
 *
 * Tests for response mode decision logic
 *
 * @module @ferni/conversation/response-mode/__tests__/engine
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createResponseModeDecider,
  type IResponseModeDecider,
  type ResponseModeContext,
} from '../index.js';

describe('ResponseModeDecider', () => {
  let decider: IResponseModeDecider;

  beforeEach(() => {
    decider = createResponseModeDecider();
  });

  // Helper to create context with defaults
  const createContext = (
    overrides: Partial<ResponseModeContext> = {}
  ): ResponseModeContext => ({
    userTurnLength: 25,
    userTurnIntensity: 0.5,
    wasVenting: false,
    wasVulnerable: false,
    askedQuestion: false,
    emotionalState: 'neutral',
    trajectory: 'stable',
    turnCount: 5,
    sessionMinute: 10,
    recentResponseModes: [],
    sentiment: 'neutral',
    ...overrides,
  });

  // ============================================================================
  // DECISION TESTS
  // ============================================================================

  describe('decide()', () => {
    it('returns brief mode after heavy venting', () => {
      const context = createContext({
        wasVenting: true,
        userTurnIntensity: 0.8,
        sentiment: 'negative',
      });

      const decision = decider.decide(context);

      expect(decision.mode).toBe('brief');
      expect(decision.maxWords).toBeLessThanOrEqual(15);
      expect(decision.suggestedPhrase).toBeDefined();
    });

    it('returns presence mode after vulnerability with raw emotion', () => {
      const context = createContext({
        wasVulnerable: true,
        emotionalState: 'raw',
      });

      const decision = decider.decide(context);

      expect(decision.mode).toBe('presence');
      expect(decision.pauseBeforeMs).toBeGreaterThanOrEqual(1000);
    });

    it('returns presence mode after vulnerability', () => {
      const context = createContext({
        wasVulnerable: true,
        emotionalState: 'sad',
      });

      const decision = decider.decide(context);

      expect(decision.mode).toBe('presence');
    });

    it('returns celebration mode for positive high-intensity moments', () => {
      const context = createContext({
        sentiment: 'positive',
        userTurnIntensity: 0.7,
        askedQuestion: false,
      });

      const decision = decider.decide(context);

      expect(decision.mode).toBe('celebration');
    });

    it('returns full mode when user asks a question', () => {
      const context = createContext({
        askedQuestion: true,
        sentiment: 'neutral',
      });

      const decision = decider.decide(context);

      expect(decision.mode).toBe('full');
    });

    it('returns invitation mode for very short turns', () => {
      const context = createContext({
        userTurnLength: 5,
        askedQuestion: false,
      });

      const decision = decider.decide(context);

      expect(decision.mode).toBe('invitation');
    });

    it('returns brief mode for declining emotional trajectory', () => {
      const context = createContext({
        trajectory: 'declining',
        sentiment: 'negative',
        userTurnIntensity: 0.6,
      });

      const decision = decider.decide(context);

      expect(decision.mode).toBe('brief');
    });

    it('returns full mode when no rule matches', () => {
      const context = createContext({
        userTurnLength: 30,
        userTurnIntensity: 0.3,
        askedQuestion: false,
        sentiment: 'neutral',
      });

      const decision = decider.decide(context);

      expect(decision.mode).toBe('full');
    });

    it('prioritizes venting over short turn', () => {
      const context = createContext({
        wasVenting: true,
        userTurnIntensity: 0.8,
        userTurnLength: 8, // Short turn
        askedQuestion: false,
      });

      const decision = decider.decide(context);

      // Venting has higher priority than short turn
      expect(decision.mode).toBe('brief');
    });

    it('prioritizes question over celebration', () => {
      const context = createContext({
        askedQuestion: true,
        sentiment: 'positive',
        userTurnIntensity: 0.7,
      });

      const decision = decider.decide(context);

      // Question has higher priority than celebration
      expect(decision.mode).toBe('full');
    });

    it('includes confidence in decision', () => {
      const context = createContext({
        wasVenting: true,
        userTurnIntensity: 0.8,
      });

      const decision = decider.decide(context);

      expect(decision.confidence).toBeGreaterThan(0);
      expect(decision.confidence).toBeLessThanOrEqual(1);
    });

    it('includes reasoning in decision', () => {
      const context = createContext({
        wasVenting: true,
        userTurnIntensity: 0.8,
      });

      const decision = decider.decide(context);

      expect(decision.reasoning).toBeDefined();
      expect(decision.reasoning.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // CONTENT RETRIEVAL TESTS
  // ============================================================================

  describe('getContentForMode()', () => {
    it('returns null for silence mode', () => {
      const content = decider.getContentForMode('silence');
      expect(content).toBeNull();
    });

    it('returns null for full mode', () => {
      const content = decider.getContentForMode('full');
      expect(content).toBeNull();
    });

    it('returns content for brief mode', () => {
      const content = decider.getContentForMode('brief');

      expect(content).not.toBeNull();
      expect(content?.text).toBeDefined();
      expect(content?.ssml).toBeDefined();
    });

    it('returns content for presence mode', () => {
      const content = decider.getContentForMode('presence');

      expect(content).not.toBeNull();
      expect(content?.text).toBeDefined();
    });

    it('returns content for invitation mode', () => {
      const content = decider.getContentForMode('invitation');

      expect(content).not.toBeNull();
      expect(content?.text).toBeDefined();
    });

    it('returns content for celebration mode', () => {
      const content = decider.getContentForMode('celebration');

      expect(content).not.toBeNull();
      expect(content?.text).toBeDefined();
    });

    it('returns content for clarify mode', () => {
      const content = decider.getContentForMode('clarify');

      expect(content).not.toBeNull();
      expect(content?.text).toBeDefined();
    });

    it('text has SSML stripped', () => {
      const content = decider.getContentForMode('presence');

      expect(content?.text).not.toContain('<break');
      expect(content?.text).not.toContain('/>');
    });
  });

  // ============================================================================
  // VENTING DETECTION TESTS
  // ============================================================================

  describe('detectVenting()', () => {
    it('detects high-intensity venting language', () => {
      const result = decider.detectVenting(
        "I can't believe they did that to me!",
        0.6
      );

      expect(result.isVenting).toBe(true);
      expect(result.signals).toContain('high_intensity_language');
    });

    it('detects moderate venting language', () => {
      const result = decider.detectVenting(
        "I'm feeling so overwhelmed with everything",
        0.5
      );

      expect(result.isVenting).toBe(true);
      expect(result.signals).toContain('moderate_intensity_language');
    });

    it('detects venting from high intensity alone', () => {
      const result = decider.detectVenting('Something happened today.', 0.8);

      expect(result.isVenting).toBe(true);
      expect(result.signals).toContain('high_emotional_intensity');
    });

    it('considers long messages as potential venting', () => {
      const longMessage = Array(60).fill('word').join(' ');
      const result = decider.detectVenting(longMessage, 0.4);

      expect(result.signals).toContain('long_message');
    });

    it('returns false for calm messages', () => {
      const result = decider.detectVenting(
        'I had a nice day today. The weather was pleasant.',
        0.2
      );

      expect(result.isVenting).toBe(false);
    });
  });

  // ============================================================================
  // VULNERABILITY DETECTION TESTS
  // ============================================================================

  describe('detectVulnerability()', () => {
    it('detects high vulnerability', () => {
      const result = decider.detectVulnerability(
        "I've never told anyone this before, but..."
      );

      expect(result.isVulnerable).toBe(true);
      expect(result.level).toBe('high');
    });

    it('detects medium vulnerability', () => {
      const result = decider.detectVulnerability(
        "I don't usually talk about this, but I've been thinking..."
      );

      expect(result.isVulnerable).toBe(true);
      expect(result.level).toBe('medium');
    });

    it('detects low vulnerability', () => {
      const result = decider.detectVulnerability(
        "I'm not sure if this makes sense, but maybe I should..."
      );

      expect(result.isVulnerable).toBe(true);
      expect(result.level).toBe('low');
    });

    it('detects vulnerability with trust language', () => {
      const result = decider.detectVulnerability(
        'I trust you. Can I tell you something?'
      );

      expect(result.isVulnerable).toBe(true);
    });

    it('returns low level for neutral messages', () => {
      const result = decider.detectVulnerability(
        'What time is the meeting tomorrow?'
      );

      expect(result.level).toBe('low');
      expect(result.markers.length).toBe(0);
    });
  });

  // ============================================================================
  // QUESTION DETECTION TESTS
  // ============================================================================

  describe('detectQuestion()', () => {
    it('detects direct questions starting with question words', () => {
      const result = decider.detectQuestion('What should I do about this?');

      expect(result.hasQuestion).toBe(true);
      expect(result.questionType).toBe('direct');
    });

    it('detects questions with question mark', () => {
      const result = decider.detectQuestion('You think that would work?');

      expect(result.hasQuestion).toBe(true);
      expect(result.questionType).toBe('direct');
    });

    it('detects indirect questions', () => {
      const result = decider.detectQuestion(
        "I'm wondering if you could help me with something."
      );

      expect(result.hasQuestion).toBe(true);
      expect(result.questionType).toBe('indirect');
    });

    it('identifies rhetorical questions', () => {
      const result = decider.detectQuestion("It's frustrating, you know?");

      expect(result.hasQuestion).toBe(false);
      expect(result.questionType).toBe('rhetorical');
    });

    it('returns none for statements', () => {
      const result = decider.detectQuestion('I had a great day today.');

      expect(result.hasQuestion).toBe(false);
      expect(result.questionType).toBe('none');
    });

    it('detects questions starting with auxiliary verbs', () => {
      const result = decider.detectQuestion('Do you think I should go?');

      expect(result.hasQuestion).toBe(true);
      expect(result.questionType).toBe('direct');
    });
  });

  // ============================================================================
  // OUTCOME TRACKING TESTS
  // ============================================================================

  describe('recordOutcome()', () => {
    it('records positive outcome', () => {
      // Make a decision first
      const context = createContext({
        wasVenting: true,
        userTurnIntensity: 0.8,
      });
      decider.decide(context);

      // Record outcome - should not throw
      expect(() => decider.recordOutcome('brief', 'positive')).not.toThrow();
    });

    it('records negative outcome', () => {
      const context = createContext({
        wasVenting: true,
        userTurnIntensity: 0.8,
      });
      decider.decide(context);

      expect(() => decider.recordOutcome('brief', 'negative')).not.toThrow();
    });
  });

  // ============================================================================
  // RESET TESTS
  // ============================================================================

  describe('reset()', () => {
    it('resets session state', () => {
      // Make some decisions
      const context = createContext({
        wasVenting: true,
        userTurnIntensity: 0.8,
      });
      decider.decide(context);
      decider.decide(context);

      // Reset
      expect(() => decider.reset()).not.toThrow();
    });
  });
});
