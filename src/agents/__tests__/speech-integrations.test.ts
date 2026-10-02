/**
 * Speech Integrations Tests
 *
 * Tests for the new speech feature integrations:
 * - Speech metrics integration
 * - Context manager speech insights
 *
 * @module speech-integrations.test
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Integration modules
import {
  finalizeSpeechMetrics,
  getGlobalMetricsSnapshot,
  getSessionMetricsContext,
  initializeSpeechMetrics,
  trackBackchannelQuality,
  trackConversationTurn,
  trackEmotionDetection,
  trackSpeechLatency,
  trackTurnPrediction,
} from '../integrations/speech-metrics-integration.js';

// Context manager
import { getContextManager, removeContextManager } from '../../context/index.js';

// Speech module types
import type { EmotionalMomentum } from '../../speech/emotional-contagion.js';
import type { HumanListeningResult } from '../../speech/human-listening-pipeline/types.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

const createMockListeningResult = (
  overrides: Partial<HumanListeningResult> = {}
): HumanListeningResult =>
  ({
    audio: {
      tremor: null,
      breath: null,
      volumeDynamics: null,
      energyDynamics: null,
    },
    text: {
      cognitiveLoad: { level: 'low', score: 0.3, indicators: [] },
      hedging: { isHedging: false, confidence: 0.2, phrases: [] },
      selfSoothing: { detected: false, confidence: 0.1, patterns: [] },
      fluency: { overallScore: 0.8, disfluencies: [], pattern: 'fluent' },
      fillers: { count: 0, instances: [], pattern: 'minimal' },
    },
    conversation: {
      narrativeArc: { stage: 'exploration', confidence: 0.7 },
      engagement: { score: 0.6, factors: [] },
    },
    emotionalUndercurrent: {
      primary: 'neutral',
      confidence: 0.7,
      evidence: [],
      possiblyMasked: false,
    },
    overallAssessment: {
      needsSupport: false,
      engagementLevel: 'moderate',
    },
    prioritySignals: [],
    agentGuidance: {
      tone: 'warm',
      pacing: 'normal',
      suggestions: [],
    },
    shouldSlowDown: false,
    possibleDistress: false,
    confidence: 0.7,
    ssmlSuggestions: {
      speedMultiplier: 1.0,
      pauseMultiplier: 1.0,
      volumeLevel: 'normal',
    },
    ...overrides,
  }) as HumanListeningResult;

const createMockEmotionalMomentum = (
  overrides: Partial<EmotionalMomentum> = {}
): EmotionalMomentum => ({
  valence: 0.2,
  arousal: 0.5,
  warmth: 'medium',
  turnsAtState: 2,
  trend: 'stable',
  ...overrides,
});

// ============================================================================
// TESTS
// ============================================================================

describe('Speech Metrics Integration', () => {
  const sessionId = 'test-metrics-session';
  const personaId = 'ferni';

  afterEach(() => {
    finalizeSpeechMetrics(sessionId, true);
  });

  describe('Session Lifecycle', () => {
    it('should initialize metrics for a session', () => {
      const context = initializeSpeechMetrics(sessionId, personaId);

      expect(context.sessionId).toBe(sessionId);
      expect(context.personaId).toBe(personaId);
      expect(context.turnCount).toBe(0);
      expect(context.startTime).toBeGreaterThan(0);
    });

    it('should track metrics context per session', () => {
      initializeSpeechMetrics(sessionId, personaId);

      const context = getSessionMetricsContext(sessionId);
      expect(context).toBeDefined();
      expect(context?.sessionId).toBe(sessionId);
    });

    it('should finalize and clean up session', () => {
      initializeSpeechMetrics(sessionId, personaId);
      finalizeSpeechMetrics(sessionId, true);

      const context = getSessionMetricsContext(sessionId);
      expect(context).toBeUndefined();
    });
  });

  describe('Latency Tracking', () => {
    it('should track latency samples', () => {
      initializeSpeechMetrics(sessionId, personaId);

      trackSpeechLatency(sessionId, 'test.operation', 50);
      trackSpeechLatency(sessionId, 'test.operation', 60);
      trackSpeechLatency(sessionId, 'test.operation', 55);

      const snapshot = getGlobalMetricsSnapshot();
      expect(snapshot.metrics.latency.sampleCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Quality Metrics', () => {
    it('should track emotion detection quality', () => {
      initializeSpeechMetrics(sessionId, personaId);

      trackEmotionDetection(sessionId, 0.8);
      trackEmotionDetection(sessionId, 0.7);
      trackEmotionDetection(sessionId, 0.9);

      const context = getSessionMetricsContext(sessionId);
      expect(context?.emotionSamples).toBe(3);
    });

    it('should track backchannel quality', () => {
      initializeSpeechMetrics(sessionId, personaId);

      trackBackchannelQuality(sessionId, true);
      trackBackchannelQuality(sessionId, false);
      trackBackchannelQuality(sessionId, true);

      const context = getSessionMetricsContext(sessionId);
      expect(context?.backchannelCount).toBe(3);
    });

    it('should track turn prediction accuracy', () => {
      initializeSpeechMetrics(sessionId, personaId);

      trackTurnPrediction(sessionId, true);
      trackTurnPrediction(sessionId, true);
      trackTurnPrediction(sessionId, false);

      const context = getSessionMetricsContext(sessionId);
      expect(context?.turnPredictions).toBe(3);
    });
  });

  describe('Turn Tracking', () => {
    it('should increment turn count', () => {
      initializeSpeechMetrics(sessionId, personaId);

      trackConversationTurn(sessionId);
      trackConversationTurn(sessionId);
      trackConversationTurn(sessionId);

      const context = getSessionMetricsContext(sessionId);
      expect(context?.turnCount).toBe(3);
    });
  });

  describe('Global Metrics', () => {
    it('should provide global metrics snapshot', () => {
      initializeSpeechMetrics(sessionId, personaId);

      const snapshot = getGlobalMetricsSnapshot();

      expect(snapshot.timestamp).toBeGreaterThan(0);
      expect(snapshot.metrics).toBeDefined();
      expect(snapshot.metrics.latency).toBeDefined();
      expect(snapshot.metrics.quality).toBeDefined();
      expect(snapshot.metrics.usage).toBeDefined();
    });
  });
});

describe('Context Manager Speech Insights', () => {
  const sessionId = 'test-context-session';

  afterEach(() => {
    removeContextManager(sessionId);
  });

  describe('Speech Insights Building', () => {
    it('should build speech insights from listening result', () => {
      const manager = getContextManager(sessionId);

      const insights = manager.buildSpeechInsightsContext({
        humanListeningResult: createMockListeningResult(),
      });

      expect(insights.voiceDistressSignals).toBe(false);
      expect(insights.estimatedCognitiveLoad).toBeDefined();
      expect(insights.speechGuidance).toBeDefined();
    });

    it('should detect voice distress signals', () => {
      const manager = getContextManager(sessionId);

      const distressedResult = createMockListeningResult({
        possibleDistress: true,
      });

      const insights = manager.buildSpeechInsightsContext({
        humanListeningResult: distressedResult,
      });

      expect(insights.voiceDistressSignals).toBe(true);
      expect(insights.speechGuidance).toContain('distress');
    });

    it('should include emotional momentum guidance', () => {
      const manager = getContextManager(sessionId);

      const insights = manager.buildSpeechInsightsContext({
        emotionalMomentum: createMockEmotionalMomentum({
          warmth: 'high',
          trend: 'building',
        }),
      });

      expect((insights.emotionalMomentum as { warmth?: string })?.warmth).toBe('high');
      expect(insights.speechGuidance).toContain('warm');
    });

    it('should calculate cognitive load from text signals', () => {
      const manager = getContextManager(sessionId);

      // Use a real-ish result - the mock already has proper structure
      const result = createMockListeningResult();

      const insights = manager.buildSpeechInsightsContext({
        humanListeningResult: result,
      });

      // The context manager should extract cognitive load info
      expect(insights.estimatedCognitiveLoad).toBeGreaterThanOrEqual(0);
      expect(insights.estimatedCognitiveLoad).toBeLessThanOrEqual(1);
    });
  });

  describe('Prompt Formatting', () => {
    it('should format speech insights for prompt', () => {
      const manager = getContextManager(sessionId);

      const insights = manager.buildSpeechInsightsContext({
        humanListeningResult: createMockListeningResult({
          shouldSlowDown: true,
        }),
        emotionalMomentum: createMockEmotionalMomentum({ warmth: 'high' }),
      });

      const formatted = manager.formatSpeechInsightsForPrompt(insights);

      // Should contain voice insights if there's guidance
      expect(typeof formatted).toBe('string');
    });

    it('should return empty string when no guidance', () => {
      const manager = getContextManager(sessionId);

      const insights = manager.buildSpeechInsightsContext({});
      insights.speechGuidance = '';

      const formatted = manager.formatSpeechInsightsForPrompt(insights);

      expect(formatted).toBe('');
    });
  });
});

describe('Enhanced Tracking Features', () => {
  const sessionId = 'test-enhanced-session';

  beforeEach(() => {
    initializeSpeechMetrics(sessionId, 'ferni');
  });

  afterEach(() => {
    finalizeSpeechMetrics(sessionId, true);
  });

  describe('Backchannel Event Tracking', () => {
    it('should track detailed backchannel events', async () => {
      const { trackBackchannelEvent, getSessionMetricsContext } =
        await import('../integrations/speech-metrics-integration.js');

      trackBackchannelEvent(sessionId, {
        pauseDurationMs: 500,
        wasTimely: true,
        category: 'acknowledgment',
        userEmotion: 'neutral',
        mode: 'standard',
      });

      const context = getSessionMetricsContext(sessionId);
      expect(context?.backchannelCount).toBe(1);
      expect(context?.backchannelEvents).toHaveLength(1);
      expect(context?.backchannelEvents[0].category).toBe('acknowledgment');
    });
  });

  describe('Turn Prediction Validation', () => {
    it('should track and validate turn predictions', async () => {
      const { trackTurnPredictionEvent, validateTurnPrediction, getSessionMetricsContext } =
        await import('../integrations/speech-metrics-integration.js');

      // Record a prediction
      trackTurnPredictionEvent(sessionId, {
        prediction: 'take_turn',
        probability: 0.8,
        silenceDurationMs: 800,
      });

      // Validate with actual outcome
      validateTurnPrediction(sessionId, 'user_finished');

      const context = getSessionMetricsContext(sessionId);
      expect(context?.turnPredictions).toBe(1);
      expect(context?.turnPredictionEvents[0].wasCorrect).toBe(true);
    });

    it('should mark incorrect predictions', async () => {
      const { trackTurnPredictionEvent, validateTurnPrediction, getSessionMetricsContext } =
        await import('../integrations/speech-metrics-integration.js');

      trackTurnPredictionEvent(sessionId, {
        prediction: 'wait',
        probability: 0.3,
        silenceDurationMs: 200,
      });

      validateTurnPrediction(sessionId, 'user_finished');

      const context = getSessionMetricsContext(sessionId);
      expect(context?.turnPredictionEvents[0].wasCorrect).toBe(false);
    });
  });

  describe('Response Latency Tracking', () => {
    it('should track response latency with running average', async () => {
      const { trackResponseLatency, getSessionMetricsContext } =
        await import('../integrations/speech-metrics-integration.js');

      trackResponseLatency(sessionId, 100);
      trackResponseLatency(sessionId, 200);
      trackResponseLatency(sessionId, 150);

      const context = getSessionMetricsContext(sessionId);
      expect(context?.responseLatencySamples).toBe(3);
      expect(context?.avgResponseLatencyMs).toBe(150);
    });
  });
});

describe('Quality Alerts System', () => {
  it('should return current quality thresholds', async () => {
    const { getQualityThresholds } = await import('../integrations/speech-metrics-integration.js');

    const thresholds = getQualityThresholds();

    expect(thresholds.turnPredictionAccuracy).toBeGreaterThan(0);
    expect(thresholds.backchannelAccuracy).toBeGreaterThan(0);
    expect(thresholds.responseLatencyMs).toBeGreaterThan(0);
    expect(thresholds.emotionConfidence).toBeGreaterThan(0);
    expect(thresholds.p99LatencyMs).toBeGreaterThan(0);
  });

  it('should allow setting custom thresholds', async () => {
    const { setQualityThresholds, getQualityThresholds } =
      await import('../integrations/speech-metrics-integration.js');

    const originalThresholds = getQualityThresholds();

    setQualityThresholds({ turnPredictionAccuracy: 0.9 });

    const newThresholds = getQualityThresholds();
    expect(newThresholds.turnPredictionAccuracy).toBe(0.9);

    // Reset
    setQualityThresholds({ turnPredictionAccuracy: originalThresholds.turnPredictionAccuracy });
  });

  it('should check quality alerts based on metrics', async () => {
    const { checkQualityAlerts } = await import('../integrations/speech-metrics-integration.js');

    const alerts = checkQualityAlerts();

    // Should return an array (may be empty if metrics are good)
    expect(Array.isArray(alerts)).toBe(true);
  });

  it('should get dashboard data with alerts', async () => {
    const { getDashboardDataWithAlerts } =
      await import('../integrations/speech-metrics-integration.js');

    const data = getDashboardDataWithAlerts();

    expect(data).toHaveProperty('global');
    expect(data).toHaveProperty('activeSessions');
    expect(data).toHaveProperty('personaMetrics');
    expect(data).toHaveProperty('recentSessions');
    expect(data).toHaveProperty('alerts');
    expect(data).toHaveProperty('thresholds');
  });

  it('should get alert history', async () => {
    const { getAlertHistory } = await import('../integrations/speech-metrics-integration.js');

    const history = getAlertHistory();

    expect(Array.isArray(history)).toBe(true);
  });
});

describe('End-to-End Integration Flow', () => {
  const sessionId = 'test-e2e-session';

  afterEach(() => {
    finalizeSpeechMetrics(sessionId, true);
    removeContextManager(sessionId);
  });

  it('should handle full conversation turn with all integrations', () => {
    // 1. Initialize metrics
    initializeSpeechMetrics(sessionId, 'ferni');

    // 2. Get context manager
    const contextManager = getContextManager(sessionId);

    // 3. Simulate user message with speech analysis
    const listeningResult = createMockListeningResult();

    // 4. Build speech insights
    const speechInsights = contextManager.buildSpeechInsightsContext({
      humanListeningResult: listeningResult,
      emotionalMomentum: createMockEmotionalMomentum(),
    });

    // 5. Track metrics
    trackConversationTurn(sessionId);
    trackEmotionDetection(sessionId, 0.75);

    // Verify full flow worked
    expect(speechInsights.estimatedCognitiveLoad).toBeGreaterThanOrEqual(0);

    const metricsContext = getSessionMetricsContext(sessionId);
    expect(metricsContext?.turnCount).toBe(1);
    expect(metricsContext?.emotionSamples).toBe(1);
  });
});
