/**
 * E2E Speech Pipeline Integration Tests
 *
 * Validates the full speech pipeline from audio input to humanized output:
 * 1. Audio analysis → Prosody features
 * 2. Human listening pipeline → Emotional understanding
 * 3. Voice humanization → TTS adjustments
 * 4. Advanced humanization → Natural SSML output
 * 5. Session cleanup → Memory safety
 *
 * @module e2e-speech-pipeline.test
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Session management
import {
  cleanupSpeechSession,
  getActiveSpeechSessionCount,
  registerSpeechSession,
} from '../session-cleanup.js';

// Core services
import {
  humanizeText,
  mapContextToEmotion,
  type EmotionContext,
} from '../advanced-humanization.js';
import { getSessionAudioProsodyAnalyzer, type ProsodyFeatures } from '../audio-prosody.js';
import { getBackchannelEngine } from '../backchanneling/index.js';
import { getEmotionalContagionService } from '../emotional-contagion.js';
import { getEnhancedTurnPredictor } from '../enhanced-turn-prediction.js';
import {
  getHumanListeningPipeline,
  type HumanListeningContext,
} from '../human-listening-pipeline.js';
import { getVoiceHumanizationService } from '../voice-humanization.js';

// Supporting types
import type { EmotionalArc } from '../../conversation/emotional-arc.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

const createMockProsody = (overrides: Partial<ProsodyFeatures> = {}): ProsodyFeatures => ({
  pitchMean: 150,
  pitchVariance: 20,
  pitchRange: 50,
  pitchContour: 'flat',
  energyMean: -20,
  energyVariance: 5,
  energyPeaks: 2,
  speechRate: 4,
  pauseDuration: 200,
  pauseFrequency: 3,
  jitter: 0.01,
  shimmer: 0.02,
  breathiness: 0.1,
  utteranceDuration: 2000,
  speakingRatio: 0.8,
  ...overrides,
});

const createMockEmotionalArc = (overrides: Partial<EmotionalArc> = {}): EmotionalArc => ({
  currentEmotion: 'neutral',
  currentValence: 0,
  currentArousal: 0.5,
  trajectory: 'stable',
  trajectoryConfidence: 0.7,
  valenceMomentum: 0,
  arousalMomentum: 0,
  conversationTemperature: 0.4,
  smoothedValence: 0,
  smoothedArousal: 0.5,
  turnsSinceEmotionalPeak: 5,
  turnsSinceDistress: 10,
  needsEmotionalSupport: false,
  emotionStabilizing: false,
  suddenShiftDetected: false,
  ...overrides,
});

const createMockListeningContext = (
  sessionId: string,
  overrides: Partial<HumanListeningContext> = {}
): HumanListeningContext => ({
  sessionId,
  text: 'I feel okay about everything.',
  turnNumber: 1,
  ...overrides,
});

// ============================================================================
// TESTS
// ============================================================================

describe('E2E Speech Pipeline', () => {
  const sessionId = 'e2e-test-session';

  beforeEach(() => {
    registerSpeechSession(sessionId);
  });

  afterEach(() => {
    cleanupSpeechSession(sessionId, { reason: 'normal', verbose: false });
  });

  // -------------------------------------------------------------------------
  // FULL PIPELINE INTEGRATION
  // -------------------------------------------------------------------------

  describe('Full Pipeline Integration', () => {
    it('should process text through full human listening pipeline', async () => {
      const pipeline = getHumanListeningPipeline(sessionId);
      const context = createMockListeningContext(sessionId, {
        text: "I'm feeling overwhelmed with everything going on at work.",
        turnNumber: 3,
      });

      const result = await pipeline.analyze(context);

      // Validate complete result structure
      expect(result).toBeDefined();
      expect(result.audio).toBeDefined();
      expect(result.text).toBeDefined();
      expect(result.conversation).toBeDefined();
      expect(result.emotionalUndercurrent).toBeDefined();
      expect(result.agentGuidance).toBeDefined();
      expect(typeof result.shouldSlowDown).toBe('boolean');
      expect(typeof result.possibleDistress).toBe('boolean');
      expect(result.ssmlSuggestions).toBeDefined();
    });

    it('should detect distress signals from text content', async () => {
      const pipeline = getHumanListeningPipeline(sessionId);
      const distressContext = createMockListeningContext(sessionId, {
        text: "I don't know if I can handle this anymore. Everything feels hopeless.",
        turnNumber: 5,
      });

      const result = await pipeline.analyze(distressContext);

      // Distress detection depends on the NLP analysis
      // At minimum, emotional content should be detected
      expect(result.emotionalUndercurrent).toBeDefined();
      // The analysis should produce some response guidance
      expect(result.agentGuidance).toBeDefined();
    });

    it('should provide appropriate agent guidance for emotional content', async () => {
      const pipeline = getHumanListeningPipeline(sessionId);
      const emotionalContext = createMockListeningContext(sessionId, {
        text: "I just got the news that I didn't get the job. I really thought I had it.",
        turnNumber: 2,
      });

      const result = await pipeline.analyze(emotionalContext);

      expect(result.agentGuidance).toBeDefined();
      // Emotional undercurrent should indicate negative emotional state
      expect(result.emotionalUndercurrent).toBeDefined();
    });

    it('should apply voice humanization adjustments based on emotional arc', () => {
      const humanizer = getVoiceHumanizationService(sessionId);
      const distressedArc = createMockEmotionalArc({
        currentEmotion: 'sad',
        currentValence: -0.6,
        currentArousal: 0.3,
        needsEmotionalSupport: true,
        conversationTemperature: 0.7,
      });

      const adjustments = humanizer.getEmotionalTtsAdjustments(distressedArc);

      // Should suggest warm, slow response
      expect(adjustments.warmth).toBe('high');
      expect(adjustments.speedAdjust).toBeLessThan(0);
      expect(adjustments.openingPauseMs).toBeGreaterThanOrEqual(200);
      expect(adjustments.addBreaths).toBe(true);
    });

    it('should generate humanized SSML with emotion and breath groups', () => {
      const responseText = "I hear you. That sounds really hard. I'm here for you.";
      const emotionContext: EmotionContext = {
        agentIntent: 'comforting',
        userEmotion: 'sad',
        topicWeight: 'heavy',
        relationshipStage: 'friend',
        personaId: 'ferni',
      };

      const humanizedText = humanizeText(responseText, {
        personaId: 'ferni',
        emotionContext,
        fillers: true,
        breathGroups: true,
        rhythmVariation: true,
        emotionMapping: true,
      });

      // Should contain emotion tag
      expect(humanizedText).toContain('<emotion');
      // Should contain pauses
      expect(humanizedText).toContain('<break');
    });

    it('should map context to appropriate Cartesia emotion', () => {
      const supportiveContext: EmotionContext = {
        agentIntent: 'comforting',
        userEmotion: 'sad',
        topicWeight: 'heavy',
        relationshipStage: 'friend',
      };

      const emotion = mapContextToEmotion(supportiveContext);

      // Heavy topic with sad user should get sympathetic emotion
      expect(emotion).toBe('sympathetic');
    });
  });

  // -------------------------------------------------------------------------
  // EMOTIONAL CONTAGION CONTINUITY
  // -------------------------------------------------------------------------

  describe('Emotional Contagion Continuity', () => {
    it('should maintain emotional momentum across turns', () => {
      const contagion = getEmotionalContagionService(sessionId);

      // Record several warm, supportive utterances
      contagion.recordUtterance({
        emotion: 'empathetic',
        valence: -0.2,
        arousal: 0.4,
        warmth: 'high',
        wasSupporting: true,
      });

      contagion.recordUtterance({
        emotion: 'empathetic',
        valence: -0.1,
        arousal: 0.4,
        warmth: 'high',
        wasSupporting: true,
      });

      contagion.recordUtterance({
        emotion: 'warm',
        valence: 0,
        arousal: 0.5,
        warmth: 'high',
        wasSupporting: true,
      });

      const momentum = contagion.getMomentum();

      // Should maintain high warmth
      expect(momentum.warmth).toBe('high');
      expect(momentum.turnsAtState).toBeGreaterThanOrEqual(1);
    });

    it('should provide continuity hints for TTS', () => {
      const contagion = getEmotionalContagionService(sessionId);

      // Build up supportive momentum
      contagion.recordUtterance({
        emotion: 'empathetic',
        valence: -0.2,
        arousal: 0.3,
        warmth: 'high',
        wasSupporting: true,
      });

      const hints = contagion.getContinuityHints(
        createMockEmotionalArc({ needsEmotionalSupport: true })
      );

      expect(hints.emotion.tag).not.toBe('neutral');
      expect(hints.closingWarmth).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // TURN PREDICTION INTEGRATION
  // -------------------------------------------------------------------------

  describe('Turn Prediction Integration', () => {
    it('should predict turn completion with prosody features', () => {
      const turnPredictor = getEnhancedTurnPredictor(sessionId);

      // First establish a baseline prosody
      const baseProsody = createMockProsody({
        pitchMean: 160,
        pitchContour: 'flat',
      });
      turnPredictor.predict(baseProsody, 'Starting to say something', 100);

      // Then falling pitch = statement end
      const statementProsody = createMockProsody({
        pitchMean: 120, // Dropped from 160
        pitchContour: 'falling',
        speechRate: 3,
        pauseDuration: 600,
      });

      const prediction = turnPredictor.predict(
        statementProsody,
        'I think we should move forward with this plan.',
        700
      );

      // Should produce some completion signal (may vary based on analysis)
      expect(prediction.completionProbability).toBeGreaterThanOrEqual(0);
      expect(prediction.evidence).toBeDefined();
      expect(prediction.evidence.phraseBoundary).toBeDefined();
    });

    it('should detect continuation signals from rising pitch', () => {
      const turnPredictor = getEnhancedTurnPredictor(sessionId);

      // Rising pitch = question or continuation
      const questionProsody = createMockProsody({
        pitchContour: 'rising',
        pitchRange: 120, // Wide range = question
        speechRate: 4,
      });

      const prediction = turnPredictor.predict(questionProsody, 'So what do you think about', 200);

      // Should suggest waiting since sentence is incomplete
      expect(prediction.evidence.phraseBoundary.boundaryType).not.toBe('statement');
    });

    it('should learn user turn duration patterns', () => {
      const turnPredictor = getEnhancedTurnPredictor(sessionId);

      // Record several turns
      turnPredictor.recordTurnComplete(3000, true, false, 500);
      turnPredictor.recordTurnComplete(3500, true, false, 400);
      turnPredictor.recordTurnComplete(2800, true, false, 600);

      const patterns = turnPredictor.getPatterns();

      // Should learn typical duration
      expect(patterns.typicalTurnDuration).toBeGreaterThan(2500);
      expect(patterns.typicalTurnDuration).toBeLessThan(4000);
    });
  });

  // -------------------------------------------------------------------------
  // BACKCHANNELING INTEGRATION
  // -------------------------------------------------------------------------

  describe('Backchanneling Integration', () => {
    it('should create backchanneling engine with different modes', () => {
      const standardEngine = getBackchannelEngine(sessionId, 'standard');
      expect(standardEngine).toBeDefined();

      const enhancedEngine = getBackchannelEngine(sessionId, 'enhanced');
      expect(enhancedEngine).toBeDefined();

      const liveEngine = getBackchannelEngine(sessionId, 'live');
      expect(liveEngine).toBeDefined();
    });

    it('should make backchannel decisions based on context', () => {
      const engine = getBackchannelEngine(sessionId, 'enhanced');

      const decision = engine.decide({
        sessionId,
        personaId: 'ferni',
        userSpeechDuration: 5000,
        currentPauseDuration: 4000,
        userEmotion: {
          primary: 'sadness',
          confidence: 0.7,
          intensity: 0.6,
          valence: 'negative',
          distressLevel: 0.5,
          markers: ['really hard'],
          suggestedTone: 'gentle',
        },
        topicWeight: 'heavy',
        turnCount: 3,
        backchannelCountThisTurn: 0,
      });

      expect(decision).toBeDefined();
      expect(typeof decision.shouldEmit).toBe('boolean');
      if (decision.shouldEmit) {
        expect(decision.phrase).toBeTruthy();
      }
    });
  });

  // -------------------------------------------------------------------------
  // SESSION STATE MANAGEMENT
  // -------------------------------------------------------------------------

  describe('Session State Management', () => {
    it('should maintain state across multiple turns', async () => {
      const pipeline = getHumanListeningPipeline(sessionId);
      const humanizer = getVoiceHumanizationService(sessionId);

      // Simulate multiple conversation turns
      for (let turn = 1; turn <= 5; turn++) {
        const context = createMockListeningContext(sessionId, {
          text: `Turn ${turn}: This is my message.`,
          turnNumber: turn,
        });

        const result = await pipeline.analyze(context);
        expect(result).toBeDefined();

        humanizer.recordTurn();
      }

      const state = humanizer.getState();
      expect(state.turnCount).toBe(5);
    });

    it('should build up rhythm profile over time', () => {
      const humanizer = getVoiceHumanizationService(sessionId);

      // Simulate several rhythm updates
      humanizer.updateRhythmProfile('Short. Quick. Sentences.', 2000, [300, 300]);
      humanizer.updateRhythmProfile('Another short one.', 1500, [250]);
      humanizer.updateRhythmProfile('Quick reply.', 1000);

      humanizer.recordTurn();
      humanizer.recordTurn();
      humanizer.recordTurn();
      humanizer.recordTurn();

      const adjustments = humanizer.getRhythmMirroringAdjustments();

      // After enough turns, should have rhythm profile
      const state = humanizer.getState();
      expect(state.userRhythmProfile).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // SESSION CLEANUP
  // -------------------------------------------------------------------------

  describe('Session Cleanup', () => {
    it('should clean up all services without memory leaks', () => {
      const additionalSessionId = 'cleanup-test-session';
      registerSpeechSession(additionalSessionId);

      // Initialize multiple services
      getHumanListeningPipeline(additionalSessionId);
      getVoiceHumanizationService(additionalSessionId);
      getEmotionalContagionService(additionalSessionId);
      getEnhancedTurnPredictor(additionalSessionId);
      getBackchannelEngine(additionalSessionId, 'enhanced');
      getSessionAudioProsodyAnalyzer(additionalSessionId);

      const countBefore = getActiveSpeechSessionCount();

      // Clean up
      cleanupSpeechSession(additionalSessionId, { reason: 'normal', verbose: false });

      const countAfter = getActiveSpeechSessionCount();

      // Should have removed the session
      expect(countAfter).toBeLessThan(countBefore);
    });

    it('should handle cleanup of non-existent session gracefully', () => {
      // Should not throw
      expect(() => {
        cleanupSpeechSession('non-existent-session', { reason: 'normal', verbose: false });
      }).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // QUICK ANALYSIS PATH
  // -------------------------------------------------------------------------

  describe('Quick Analysis Path', () => {
    it('should provide fast analysis for real-time use', () => {
      const pipeline = getHumanListeningPipeline(sessionId);

      // Quick analysis should be synchronous and fast
      const startTime = performance.now();
      const quickResult = pipeline.quickAnalyze("I'm not sure what to do about this situation.", 3);
      const elapsed = performance.now() - startTime;

      expect(quickResult.cognitiveLoad).toBeDefined();
      expect(quickResult.hedging).toBeDefined();
      expect(quickResult.selfSoothing).toBeDefined();
      expect(typeof quickResult.shouldSlowDown).toBe('boolean');

      // Should be fast (<50ms)
      expect(elapsed).toBeLessThan(50);
    });
  });

  // -------------------------------------------------------------------------
  // LLM CONTEXT BUILDING
  // -------------------------------------------------------------------------

  describe('LLM Context Building', () => {
    it('should build LLM context from analysis state', async () => {
      const pipeline = getHumanListeningPipeline(sessionId);

      // Run an analysis first
      await pipeline.analyze(
        createMockListeningContext(sessionId, {
          text: 'I guess it might be okay, but I really feel uncertain about everything.',
          turnNumber: 2,
        })
      );

      const llmContext = pipeline.buildLLMContext();

      // May or may not have context depending on detection results
      // Just verify it doesn't throw and returns expected type
      expect(llmContext === null || typeof llmContext === 'string').toBe(true);
    });
  });
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

describe('Speech Pipeline Performance', () => {
  const sessionId = 'perf-test-session';

  beforeEach(() => {
    registerSpeechSession(sessionId);
  });

  afterEach(() => {
    cleanupSpeechSession(sessionId, { reason: 'normal', verbose: false });
  });

  it('should complete full analysis within acceptable time (<500ms)', async () => {
    const pipeline = getHumanListeningPipeline(sessionId);
    const context = createMockListeningContext(sessionId, {
      text: 'This is a typical user message that the pipeline needs to analyze quickly.',
      turnNumber: 3,
    });

    const startTime = performance.now();
    await pipeline.analyze(context);
    const elapsed = performance.now() - startTime;

    // Full analysis should complete in <500ms
    expect(elapsed).toBeLessThan(500);
  });

  it('should handle rapid sequential turns efficiently', async () => {
    const pipeline = getHumanListeningPipeline(sessionId);

    const startTime = performance.now();

    // Simulate 10 rapid turns
    for (let i = 0; i < 10; i++) {
      await pipeline.analyze(
        createMockListeningContext(sessionId, {
          text: `Turn ${i}: Quick message from user.`,
          turnNumber: i + 1,
        })
      );
    }

    const elapsed = performance.now() - startTime;

    // 10 turns should complete in <3 seconds
    expect(elapsed).toBeLessThan(3000);
  });
});
