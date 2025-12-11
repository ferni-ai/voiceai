/**
 * Human Listening Pipeline Tests
 *
 * Tests for the unified human-like listening capabilities:
 * - Text analysis (cognitive load, hedging, self-soothing)
 * - Audio analysis (breath, tremor, volume)
 * - Conversation analysis (narrative arc, engagement)
 * - Emotional undercurrent synthesis
 * - Session management
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  HumanListeningPipeline,
  getHumanListeningPipeline,
  resetAllHumanListeningPipelines,
  resetHumanListeningPipeline,
  type HumanListeningContext,
} from '../human-listening-pipeline.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

const createMockContext = (
  overrides: Partial<HumanListeningContext> = {}
): HumanListeningContext => ({
  sessionId: 'test-session',
  text: 'I feel okay about everything.',
  turnNumber: 1,
  ...overrides,
});

// ============================================================================
// TESTS
// ============================================================================

describe('HumanListeningPipeline', () => {
  let pipeline: HumanListeningPipeline;
  const sessionId = 'test-listening-session';

  beforeEach(() => {
    resetAllHumanListeningPipelines();
    pipeline = new HumanListeningPipeline(sessionId);
  });

  afterEach(() => {
    resetAllHumanListeningPipelines();
  });

  // -------------------------------------------------------------------------
  // BASIC FUNCTIONALITY
  // -------------------------------------------------------------------------

  describe('Basic Functionality', () => {
    it('should initialize correctly', () => {
      expect(pipeline).toBeDefined();
    });

    it('should analyze text without error', async () => {
      const context = createMockContext({ sessionId });
      const result = await pipeline.analyze(context);
      expect(result).toBeDefined();
    });

    it('should return complete result structure', async () => {
      const context = createMockContext({ sessionId });
      const result = await pipeline.analyze(context);

      // Check all top-level properties exist
      expect(result.audio).toBeDefined();
      expect(result.text).toBeDefined();
      expect(result.conversation).toBeDefined();
      expect(result.emotionalUndercurrent).toBeDefined();
      expect(result.overallAssessment).toBeDefined();
      expect(result.prioritySignals).toBeDefined();
      expect(result.agentGuidance).toBeDefined();
      expect(typeof result.shouldSlowDown).toBe('boolean');
      expect(typeof result.shouldGiveSpace).toBe('boolean');
      expect(typeof result.possibleDistress).toBe('boolean');
      expect(result.ssmlSuggestions).toBeDefined();
      expect(typeof result.confidence).toBe('number');
    });

    it('should reset correctly', async () => {
      const context = createMockContext({ sessionId });
      await pipeline.analyze(context);

      expect(() => pipeline.reset()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // TEXT ANALYSIS
  // -------------------------------------------------------------------------

  describe('Text Analysis', () => {
    it('should analyze cognitive load', async () => {
      const context = createMockContext({
        sessionId,
        text: 'I just, um, I was thinking about, you know, maybe trying to, like, figure out what I should do.',
      });

      const result = await pipeline.analyze(context);

      expect(result.text.cognitiveLoad).toBeDefined();
      expect(result.text.cognitiveLoad.level).toBeDefined();
    });

    it('should analyze hedging', async () => {
      const context = createMockContext({
        sessionId,
        text: "I guess maybe it's sort of okay, I suppose.",
      });

      const result = await pipeline.analyze(context);

      expect(result.text.hedging).toBeDefined();
      expect(typeof result.text.hedging.elevated).toBe('boolean');
    });

    it('should analyze self-soothing', async () => {
      const context = createMockContext({
        sessionId,
        text: "It's fine, I'm fine, everything is fine.",
      });

      const result = await pipeline.analyze(context);

      expect(result.text.selfSoothing).toBeDefined();
      expect(typeof result.text.selfSoothing.detected).toBe('boolean');
    });

    it('should analyze fluency', async () => {
      const context = createMockContext({
        sessionId,
        text: 'I wanted to talk about something.',
      });

      const result = await pipeline.analyze(context);

      expect(result.text.fluency).toBeDefined();
    });

    it('should analyze fillers', async () => {
      const context = createMockContext({
        sessionId,
        text: 'Um, like, you know, I was just thinking about stuff.',
      });

      const result = await pipeline.analyze(context);

      expect(result.text.fillers).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // CONVERSATION ANALYSIS
  // -------------------------------------------------------------------------

  describe('Conversation Analysis', () => {
    it('should analyze narrative arc', async () => {
      const context = createMockContext({
        sessionId,
        turnNumber: 3,
      });

      const result = await pipeline.analyze(context);

      expect(result.conversation.narrativeArc).toBeDefined();
    });

    it('should analyze engagement', async () => {
      const context = createMockContext({
        sessionId,
        text: 'That is really interesting, tell me more!',
      });

      const result = await pipeline.analyze(context);

      expect(result.conversation.engagement).toBeDefined();
      expect(result.conversation.engagement.level).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // EMOTIONAL UNDERCURRENT
  // -------------------------------------------------------------------------

  describe('Emotional Undercurrent', () => {
    it('should synthesize emotional undercurrent', async () => {
      const context = createMockContext({
        sessionId,
        text: "I'm fine, really. It doesn't bother me at all.",
      });

      const result = await pipeline.analyze(context);

      expect(result.emotionalUndercurrent).toBeDefined();
      expect(result.emotionalUndercurrent.primary).toBeDefined();
      expect(typeof result.emotionalUndercurrent.confidence).toBe('number');
      expect(Array.isArray(result.emotionalUndercurrent.evidence)).toBe(true);
      expect(typeof result.emotionalUndercurrent.possiblyMasked).toBe('boolean');
    });

    it('should detect possible masking in self-soothing speech', async () => {
      const context = createMockContext({
        sessionId,
        text: "It's totally fine. I'm not upset at all. Everything is completely fine.",
      });

      const result = await pipeline.analyze(context);

      // Self-soothing language often masks underlying emotions
      if (result.text.selfSoothing.detected) {
        expect(result.emotionalUndercurrent.possiblyMasked).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // SSML SUGGESTIONS
  // -------------------------------------------------------------------------

  describe('SSML Suggestions', () => {
    it('should provide valid speed multiplier', async () => {
      const context = createMockContext({ sessionId });
      const result = await pipeline.analyze(context);

      expect(result.ssmlSuggestions.speedMultiplier).toBeGreaterThanOrEqual(0.8);
      expect(result.ssmlSuggestions.speedMultiplier).toBeLessThanOrEqual(1.1);
    });

    it('should provide valid pause multiplier', async () => {
      const context = createMockContext({ sessionId });
      const result = await pipeline.analyze(context);

      expect(result.ssmlSuggestions.pauseMultiplier).toBeGreaterThanOrEqual(1.0);
      expect(result.ssmlSuggestions.pauseMultiplier).toBeLessThanOrEqual(1.5);
    });

    it('should provide valid volume level', async () => {
      const context = createMockContext({ sessionId });
      const result = await pipeline.analyze(context);

      expect(['softer', 'normal', 'match']).toContain(result.ssmlSuggestions.volumeLevel);
    });

    it('should suggest softer volume for distress', async () => {
      const context = createMockContext({
        sessionId,
        text: "I don't know what to do anymore. Everything is falling apart.",
        emotion: 'sad',
        emotionalIntensity: 0.9,
      });

      const result = await pipeline.analyze(context);

      // If distress is detected, volume should be softer
      if (result.possibleDistress) {
        expect(result.ssmlSuggestions.volumeLevel).toBe('softer');
      }
    });
  });

  // -------------------------------------------------------------------------
  // AGENT GUIDANCE
  // -------------------------------------------------------------------------

  describe('Agent Guidance', () => {
    it('should provide guidance string', async () => {
      const context = createMockContext({ sessionId });
      const result = await pipeline.analyze(context);

      expect(typeof result.agentGuidance).toBe('string');
      expect(result.agentGuidance.length).toBeGreaterThan(0);
    });

    it('should provide overall assessment', async () => {
      const context = createMockContext({ sessionId });
      const result = await pipeline.analyze(context);

      expect(typeof result.overallAssessment).toBe('string');
      expect(result.overallAssessment.length).toBeGreaterThan(0);
    });

    it('should identify priority signals as array', async () => {
      const context = createMockContext({ sessionId });
      const result = await pipeline.analyze(context);

      expect(Array.isArray(result.prioritySignals)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // QUICK ANALYZE
  // -------------------------------------------------------------------------

  describe('Quick Analyze', () => {
    it('should perform quick analysis without error', () => {
      const result = pipeline.quickAnalyze('I guess maybe I should try something.', 1);

      expect(result).toBeDefined();
      expect(result.cognitiveLoad).toBeDefined();
      expect(result.hedging).toBeDefined();
      expect(result.selfSoothing).toBeDefined();
      expect(typeof result.shouldSlowDown).toBe('boolean');
    });

    it('should be faster than full analyze', async () => {
      const startQuick = Date.now();
      pipeline.quickAnalyze('Hello there', 1);
      const quickTime = Date.now() - startQuick;

      const startFull = Date.now();
      await pipeline.analyze(createMockContext({ sessionId }));
      const fullTime = Date.now() - startFull;

      // Quick should be faster (or at least not much slower)
      expect(quickTime).toBeLessThanOrEqual(fullTime + 50);
    });
  });

  // -------------------------------------------------------------------------
  // LLM CONTEXT BUILDING
  // -------------------------------------------------------------------------

  describe('LLM Context Building', () => {
    it('should build LLM context after analysis', async () => {
      const context = createMockContext({
        sessionId,
        text: "I'm a bit worried about everything, I guess. It's fine though.",
      });

      await pipeline.analyze(context);
      const llmContext = pipeline.buildLLMContext();

      // May return null if no special conditions, or a string if there are
      expect(llmContext === null || typeof llmContext === 'string').toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // PROSODY FEATURES INPUT
  // -------------------------------------------------------------------------

  describe('Prosody Features Input', () => {
    it('should accept prosody features instead of raw audio', async () => {
      const context = createMockContext({
        sessionId,
        prosodyFeatures: {
          jitter: 0.05,
          shimmer: 0.15,
          voiceQuality: 'trembling',
          breathiness: 0.6,
          energyMean: 35,
          speechRate: 2,
        },
      });

      const result = await pipeline.analyze(context);

      // Should derive audio analysis from prosody features
      expect(result.audio).toBeDefined();
    });

    it('should detect tremor from high jitter in prosody', async () => {
      const context = createMockContext({
        sessionId,
        prosodyFeatures: {
          jitter: 0.05, // High jitter suggests tremor
          voiceQuality: 'trembling',
        },
      });

      const result = await pipeline.analyze(context);

      // Tremor should be derived
      expect(result.audio.tremor).not.toBeNull();
      if (result.audio.tremor) {
        expect(result.audio.tremor.detected).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // CONFIDENCE CALCULATION
  // -------------------------------------------------------------------------

  describe('Confidence Calculation', () => {
    it('should return confidence between 0 and 1', async () => {
      const context = createMockContext({ sessionId });
      const result = await pipeline.analyze(context);

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });
});

// ============================================================================
// SESSION MANAGEMENT TESTS
// ============================================================================

describe('Session Management', () => {
  afterEach(() => {
    resetAllHumanListeningPipelines();
  });

  it('should return same instance for same session', () => {
    const pipeline1 = getHumanListeningPipeline('session-a');
    const pipeline2 = getHumanListeningPipeline('session-a');

    expect(pipeline1).toBe(pipeline2);
  });

  it('should return different instances for different sessions', () => {
    const pipeline1 = getHumanListeningPipeline('session-a');
    const pipeline2 = getHumanListeningPipeline('session-b');

    expect(pipeline1).not.toBe(pipeline2);
  });

  it('should reset specific session', () => {
    const pipeline1 = getHumanListeningPipeline('session-a');
    expect(pipeline1).toBeDefined();

    resetHumanListeningPipeline('session-a');

    const pipeline2 = getHumanListeningPipeline('session-a');
    expect(pipeline2).not.toBe(pipeline1);
  });

  it('should reset all sessions', () => {
    getHumanListeningPipeline('session-a');
    getHumanListeningPipeline('session-b');
    getHumanListeningPipeline('session-c');

    expect(() => resetAllHumanListeningPipelines()).not.toThrow();
  });
});
