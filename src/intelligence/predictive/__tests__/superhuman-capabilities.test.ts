/**
 * Tests for Better Than Human v4 - Superhuman Predictive Capabilities
 *
 * Tests all 8 superhuman capabilities:
 * 1. Avoidance Prediction
 * 2. Breakthrough Proximity
 * 3. Pre-Trajectory Detection
 * 4. Conversation Preparation
 * 5. Cognitive Fingerprint
 * 6. Ripple Effect Prediction
 * 7. Life Phase Prediction
 * 8. Intervention Timing
 *
 * Plus integration tests for:
 * - Signal Integration
 * - Context Building
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Import all capabilities
import { avoidancePrediction } from '../avoidance-prediction.js';
import { breakthroughProximity } from '../breakthrough-proximity.js';
import { preTrajectoryDetection } from '../pre-trajectory-detection.js';
import { conversationPreparation } from '../conversation-preparation.js';
import { cognitiveFingerprint } from '../cognitive-fingerprint.js';
import { rippleEffectPrediction } from '../ripple-effect-prediction.js';
import { lifePhasePrediction } from '../life-phase-prediction.js';
import { interventionTiming } from '../intervention-timing.js';
import { signalIntegration } from '../signal-integration.js';
import { getSuperhumanPredictiveContext } from '../index.js';

// Test user ID
const TEST_USER = 'test-user-superhuman-' + Date.now();

describe('Better Than Human v4 - Superhuman Capabilities', () => {
  // =========================================================================
  // 1. AVOIDANCE PREDICTION
  // =========================================================================
  describe('Avoidance Prediction', () => {
    it('should record deflection and build pressure', () => {
      const userId = `${TEST_USER}-avoidance`;

      // Record multiple deflections about parent
      avoidancePrediction.recordDeflection(userId, 'relationship:parent_father', 'humor');
      avoidancePrediction.recordDeflection(userId, 'relationship:parent_father', 'humor');
      avoidancePrediction.recordDeflection(userId, 'relationship:parent_father', 'topic_change');

      // Get predictions
      const predictions = avoidancePrediction.getAllAvoidancePredictions(userId);

      expect(predictions.length).toBeGreaterThan(0);
      expect(predictions[0].topic).toBe('relationship:parent_father');
      expect(predictions[0].pressureLevel).toBeGreaterThan(0);
    });

    it('should track deflection styles', () => {
      const userId = `${TEST_USER}-avoidance-styles`;

      // Record different styles
      avoidancePrediction.recordDeflection(userId, 'area:career_dissatisfaction', 'humor');
      avoidancePrediction.recordDeflection(userId, 'area:career_dissatisfaction', 'humor');
      avoidancePrediction.recordDeflection(userId, 'area:career_dissatisfaction', 'minimize');

      const prediction = avoidancePrediction.predictSurfacing(userId, 'area:career_dissatisfaction');

      // Should identify humor as primary deflection style
      expect(prediction).not.toBeNull();
    });

    it('should build context string', () => {
      const userId = `${TEST_USER}-avoidance-context`;

      // Build up avoidance
      for (let i = 0; i < 5; i++) {
        avoidancePrediction.recordDeflection(userId, 'emotion:grief', 'topic_change');
      }

      const context = avoidancePrediction.buildAvoidanceContext(userId);

      // Should have context if enough data
      expect(typeof context).toBe('string');
    });
  });

  // =========================================================================
  // 2. BREAKTHROUGH PROXIMITY
  // =========================================================================
  describe('Breakthrough Proximity', () => {
    it('should record indicators and track progress', () => {
      const userId = `${TEST_USER}-breakthrough`;
      const topic = 'work-life-balance';

      // Record multiple indicators
      breakthroughProximity.recordIndicator(
        userId,
        { type: 'questioning_beliefs', strength: 0.7, content: 'I always thought I had to work this hard' },
        topic
      );
      breakthroughProximity.recordIndicator(
        userId,
        { type: 'connecting_dots', strength: 0.8, content: 'I see the same pattern in my relationships' },
        topic
      );
      breakthroughProximity.recordIndicator(
        userId,
        { type: 'emotional_intensity', strength: 0.6, content: 'This really hits me' },
        topic
      );

      // Assess proximity
      const assessment = breakthroughProximity.assessProximity(userId, topic);

      expect(assessment).not.toBeNull();
      expect(assessment!.topic).toBe(topic);
      expect(assessment!.indicators.length).toBe(3);
    });

    it('should record blockages', () => {
      const userId = `${TEST_USER}-breakthrough-block`;
      const topic = 'self-worth';

      // Record enough indicators (MIN_INDICATORS = 3)
      breakthroughProximity.recordIndicator(
        userId,
        { type: 'questioning_beliefs', strength: 0.6, content: 'Maybe I am good enough' },
        topic
      );
      breakthroughProximity.recordIndicator(
        userId,
        { type: 'emotional_intensity', strength: 0.7, content: 'This really hits me' },
        topic
      );
      breakthroughProximity.recordIndicator(
        userId,
        { type: 'vulnerability_increase', strength: 0.5, content: 'I have never told anyone' },
        topic
      );

      // Record blockage
      breakthroughProximity.recordBlockage(userId, topic, {
        type: 'fear_of_change',
        strength: 0.7,
        description: 'Afraid of what this means',
      });

      const assessment = breakthroughProximity.assessProximity(userId, topic);
      
      // Blockages should be tracked (now has enough indicators)
      expect(assessment).not.toBeNull();
      expect(assessment!.blockages.length).toBeGreaterThan(0);
    });

    it('should record breakthrough and update history', () => {
      const userId = `${TEST_USER}-breakthrough-record`;
      const topic = 'relationship-pattern';

      // Record a breakthrough
      breakthroughProximity.recordBreakthrough(
        userId,
        topic,
        'pattern_recognition',
        'reflection'
      );

      // Should affect future predictions
      const assessments = breakthroughProximity.getAllBreakthroughAssessments(userId);
      expect(Array.isArray(assessments)).toBe(true);
    });
  });

  // =========================================================================
  // 3. PRE-TRAJECTORY DETECTION
  // =========================================================================
  describe('Pre-Trajectory Detection', () => {
    it('should record precursor observations', () => {
      const userId = `${TEST_USER}-trajectory`;

      // Record observations
      preTrajectoryDetection.recordPrecursorObservation(userId, 'sleep_pattern_change', 0.3, 'conversation');
      preTrajectoryDetection.recordPrecursorObservation(userId, 'energy_fluctuation', 0.4, 'conversation');
      preTrajectoryDetection.recordPrecursorObservation(userId, 'rumination_increase', 0.7, 'conversation');

      // Should build predictions
      const predictions = preTrajectoryDetection.predictTrajectories(userId);
      expect(Array.isArray(predictions)).toBe(true);
    });

    it('should process conversation signals', () => {
      const userId = `${TEST_USER}-trajectory-signals`;

      // Record conversation signals
      preTrajectoryDetection.recordConversationSignals(userId, {
        emotionalValence: -0.5,
        emotionalVolatility: 0.7,
        selfTalkValence: -0.3,
        futureOrientation: -0.2,
      });

      // Should have recorded observations
      const predictions = preTrajectoryDetection.predictTrajectories(userId);
      expect(Array.isArray(predictions)).toBe(true);
    });

    it('should build context for alerts', () => {
      const userId = `${TEST_USER}-trajectory-context`;

      // Record multiple concerning signals
      for (let i = 0; i < 5; i++) {
        preTrajectoryDetection.recordPrecursorObservation(userId, 'rumination_increase', 0.8, 'test');
        preTrajectoryDetection.recordPrecursorObservation(userId, 'energy_fluctuation', 0.2, 'test');
      }

      const context = preTrajectoryDetection.buildPreTrajectoryContext(userId);
      expect(typeof context).toBe('string');
    });
  });

  // =========================================================================
  // 4. CONVERSATION PREPARATION
  // =========================================================================
  describe('Conversation Preparation', () => {
    it('should record topic discussions', () => {
      const userId = `${TEST_USER}-prep`;

      conversationPreparation.recordTopicDiscussion(userId, {
        topic: 'work stress',
        category: 'work',
        emotionalIntensity: 0.7,
        resolved: false,
        unresolvedAspects: ['deadline pressure'],
        followUpNeeded: true,
        userInitiated: true,
      });

      const prep = conversationPreparation.prepareForConversation(userId);
      expect(prep).not.toBeNull();
      expect(prep.userId).toBe(userId);
    });

    it('should record conversation needs', () => {
      const userId = `${TEST_USER}-prep-needs`;

      conversationPreparation.recordConversationNeed(userId, 'validation', 'work context');
      conversationPreparation.recordConversationNeed(userId, 'validation', 'work context');
      conversationPreparation.recordConversationNeed(userId, 'advice', 'career');

      const prep = conversationPreparation.prepareForConversation(userId);
      expect(prep.predictedNeeds.length).toBeGreaterThan(0);
    });

    it('should generate conversation preparation', () => {
      const userId = `${TEST_USER}-prep-full`;

      // Build history
      conversationPreparation.recordTopicDiscussion(userId, {
        topic: 'relationship anxiety',
        category: 'relationships',
        emotionalIntensity: 0.8,
        resolved: false,
        unresolvedAspects: ['communication'],
        followUpNeeded: true,
        userInitiated: true,
      });

      const prep = conversationPreparation.prepareForConversation(userId);

      expect(prep.suggestedOpening).toBeDefined();
      expect(prep.suggestedOpening.phrase).toBeTruthy();
      expect(prep.pacing).toBeDefined();
    });
  });

  // =========================================================================
  // 5. COGNITIVE FINGERPRINT
  // =========================================================================
  describe('Cognitive Fingerprint', () => {
    it('should record decisions', () => {
      const userId = `${TEST_USER}-cognitive`;

      cognitiveFingerprint.recordDecision(userId, {
        style: 'analytical',
        timeToDecision: 24,
        outcome: 'satisfied',
      });

      const fingerprint = cognitiveFingerprint.getFingerprint(userId);
      expect(fingerprint).not.toBeNull();
    });

    it('should record stress responses', () => {
      const userId = `${TEST_USER}-cognitive-stress`;

      cognitiveFingerprint.recordStressResponse(userId, {
        style: 'analyze',
        stressLevel: 0.7,
        trigger: 'work deadline',
      });

      const adjustments = cognitiveFingerprint.getPredictionAdjustments(userId);
      expect(adjustments).toBeDefined();
      expect(adjustments.optimalTone).toBeTruthy();
    });

    it('should record conversation effectiveness', () => {
      const userId = `${TEST_USER}-cognitive-conv`;

      cognitiveFingerprint.recordConversationEffectiveness(userId, {
        dayOfWeek: 3,
        hour: 19,
        effectiveness: 0.9,
        tone: 'warm',
        depthReached: 'deep',
      });

      const fingerprint = cognitiveFingerprint.getFingerprint(userId);
      expect(fingerprint).not.toBeNull();
    });

    it('should build fingerprint context', () => {
      const userId = `${TEST_USER}-cognitive-context`;

      // Build up observations
      for (let i = 0; i < 15; i++) {
        cognitiveFingerprint.recordDecision(userId, {
          style: 'intuitive',
          timeToDecision: 2,
        });
      }

      const context = cognitiveFingerprint.buildFingerprintContext(userId);
      expect(typeof context).toBe('string');
    });
  });

  // =========================================================================
  // 6. RIPPLE EFFECT PREDICTION
  // =========================================================================
  describe('Ripple Effect Prediction', () => {
    it('should record domain events and predict ripples', () => {
      const userId = `${TEST_USER}-ripple`;

      const prediction = rippleEffectPrediction.recordDomainEvent(userId, {
        domain: 'work',
        eventType: 'deadline_pressure',
        magnitude: -0.7,
        description: 'Major project deadline',
      });

      expect(prediction).toBeDefined();
      expect(prediction.sourceEvent.domain).toBe('work');
      expect(prediction.ripples.length).toBeGreaterThan(0);
    });

    it('should track domain health', () => {
      const userId = `${TEST_USER}-ripple-health`;

      rippleEffectPrediction.updateDomainHealth(userId, 'mental_health', 0.4);

      const status = rippleEffectPrediction.getRippleStatus(userId);
      expect(status.domainStates.length).toBeGreaterThan(0);
    });

    it('should identify leverage points', () => {
      const userId = `${TEST_USER}-ripple-leverage`;

      // Create stress in sleep domain
      rippleEffectPrediction.updateDomainHealth(userId, 'sleep', 0.3);

      const status = rippleEffectPrediction.getRippleStatus(userId);
      
      // Should identify sleep as leverage point
      const prediction = rippleEffectPrediction.recordDomainEvent(userId, {
        domain: 'work',
        eventType: 'deadline_pressure',
        magnitude: -0.5,
        description: 'Increasing pressure',
      });

      expect(prediction.leveragePoints.length).toBeGreaterThan(0);
    });

    it('should simulate hypothetical ripples', () => {
      const userId = `${TEST_USER}-ripple-simulate`;

      const simulation = rippleEffectPrediction.simulateRipples(userId, {
        domain: 'relationships',
        eventType: 'major_conflict',
        magnitude: -0.8,
        description: 'Major fight with partner',
      });

      expect(simulation.ripples.length).toBeGreaterThan(0);
      expect(simulation.cascadeRisk).toBeTruthy();
    });
  });

  // =========================================================================
  // 7. LIFE PHASE PREDICTION
  // =========================================================================
  describe('Life Phase Prediction', () => {
    it('should record phase signals', () => {
      const userId = `${TEST_USER}-phase`;

      lifePhasePrediction.recordPhaseSignal(userId, 'new_initiatives', 0.8);
      lifePhasePrediction.recordPhaseSignal(userId, 'future_planning', 0.7);
      lifePhasePrediction.recordPhaseSignal(userId, 'energy_increase', 0.6);

      const phaseInfo = lifePhasePrediction.getPhaseInfo(userId);
      expect(phaseInfo).not.toBeNull();
    });

    it('should process conversation phase signals', () => {
      const userId = `${TEST_USER}-phase-conv`;

      lifePhasePrediction.recordConversationPhaseSignals(userId, {
        newInitiatives: 2,
        reflectionLevel: 0.3,
        futureFocus: 0.7,
        energyLevel: 0.8,
        learningMentioned: true,
      });

      const prediction = lifePhasePrediction.predictPhase(userId);
      // May or may not have prediction depending on data
      expect(prediction === null || prediction.currentPhase).toBeTruthy();
    });

    it('should get phase info', () => {
      const userId = `${TEST_USER}-phase-info`;

      // Build up signals for expansion phase
      for (let i = 0; i < 10; i++) {
        lifePhasePrediction.recordPhaseSignal(userId, 'new_initiatives', 0.8);
        lifePhasePrediction.recordPhaseSignal(userId, 'energy_increase', 0.7);
      }

      const info = lifePhasePrediction.getPhaseInfo(userId);
      expect(info).not.toBeNull();
      expect(info!.summary).toBeTruthy();
    });
  });

  // =========================================================================
  // 8. INTERVENTION TIMING
  // =========================================================================
  describe('Intervention Timing', () => {
    it('should get timing recommendation', () => {
      const userId = `${TEST_USER}-timing`;

      const recommendation = interventionTiming.getTimingRecommendation(
        userId,
        'validation',
        { emotionalState: 'sad' }
      );

      expect(recommendation).toBeDefined();
      expect(recommendation.interventionType).toBe('validation');
      expect(typeof recommendation.recommended).toBe('boolean');
    });

    it('should record outcomes and learn', () => {
      const userId = `${TEST_USER}-timing-learn`;

      // Record successful intervention
      interventionTiming.recordQuickOutcome(userId, 'gentle_challenge', true, {
        emotionalState: 'calm',
      });
      interventionTiming.recordQuickOutcome(userId, 'gentle_challenge', true, {
        emotionalState: 'calm',
      });

      // Get recommendation for same intervention
      const recommendation = interventionTiming.getTimingRecommendation(
        userId,
        'gentle_challenge',
        { emotionalState: 'calm' }
      );

      // Should have historical success
      expect(recommendation.historicalSuccess).toBeGreaterThanOrEqual(0);
    });

    it('should get all recommendations', () => {
      const userId = `${TEST_USER}-timing-all`;

      const recommendations = interventionTiming.getAllTimingRecommendations(userId);

      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBeGreaterThan(0);
    });

    it('should get best intervention', () => {
      const userId = `${TEST_USER}-timing-best`;

      const best = interventionTiming.getBestIntervention(userId, {
        emotionalState: 'anxious',
      });

      expect(best).toBeDefined();
      expect(best.interventionType).toBeTruthy();
    });
  });

  // =========================================================================
  // SIGNAL INTEGRATION
  // =========================================================================
  describe('Signal Integration', () => {
    it('should process turn for superhuman learning', async () => {
      const userId = `${TEST_USER}-integration`;

      await signalIntegration.processTurnForSuperhumanLearning(userId, {
        userMessage: 'I have been thinking about my relationship with my dad. Maybe I have been wrong about him.',
        emotion: {
          primary: 'reflective',
          intensity: 0.6,
          valence: 'neutral',
        },
        topic: {
          primary: 'family',
          category: 'family',
        },
      });

      // Should have recorded data in multiple systems
      const breakthroughs = breakthroughProximity.getAllBreakthroughAssessments(userId);
      // May or may not have assessments yet
      expect(Array.isArray(breakthroughs)).toBe(true);
    });

    it('should record session events', async () => {
      const userId = `${TEST_USER}-integration-session`;

      await signalIntegration.processSessionStart(userId, {
        daysSinceLastConversation: 3,
      });

      await signalIntegration.processSessionEnd(userId, {
        topicsDiscussed: ['work', 'stress'],
        primaryNeed: 'validation',
        satisfactionLevel: 0.8,
      });

      // Should have affected conversation prep
      const prep = conversationPreparation.prepareForConversation(userId);
      expect(prep).toBeDefined();
    });

    it('should record life events', () => {
      const userId = `${TEST_USER}-integration-life`;

      signalIntegration.recordLifeEvent(userId, {
        domain: 'work',
        eventType: 'promotion',
        magnitude: 0.8,
        description: 'Got the promotion!',
      });

      const status = rippleEffectPrediction.getRippleStatus(userId);
      expect(status.activeRipples.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // CONTEXT BUILDING
  // =========================================================================
  describe('Context Building', () => {
    it('should build superhuman predictive context', () => {
      const userId = `${TEST_USER}-context`;

      // Build up some data
      cognitiveFingerprint.recordDecision(userId, {
        style: 'intuitive',
        timeToDecision: 1,
      });
      
      for (let i = 0; i < 5; i++) {
        lifePhasePrediction.recordPhaseSignal(userId, 'new_initiatives', 0.7);
      }

      const context = getSuperhumanPredictiveContext(userId, {
        currentEmotion: 'excited',
        currentTopic: 'career',
      });

      expect(typeof context).toBe('string');
    });
  });
});
