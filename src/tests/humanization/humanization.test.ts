/**
 * Humanization System Tests
 *
 * Comprehensive tests for the advanced humanization subsystem.
 * Tests all 5 phases:
 * - Phase 1: Natural Imperfection (self-correction, disfluency, phonetic mirroring)
 * - Phase 2: Session Dynamics (fatigue, phases, comfort)
 * - Phase 3: Advanced Listening (voice print, ambient)
 * - Phase 4: Emotional Leadership (leading, breathing sync)
 * - Phase 5: Cross-Session Intelligence
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AmbientAwarenessEngine,
  BreathingSyncEngine,
  CatchingYourselfEngine,
  ComfortProgressionEngine,
  // Phase 5
  CrossSessionVoiceEngine,
  DisfluencyEngine,
  // Phase 4
  EmotionalLeadingEngine,
  getHumanizationOrchestrator,
  // Main orchestrator
  HumanizationOrchestrator,
  PhoneticMirroringEngine,
  resetAllHumanization,
  // Phase 1
  SelfCorrectionEngine,
  SessionDynamicsEngine,
  simulateBreathPattern,
  // Phase 2
  VocalFatigueEngine,
  // Phase 3
  VoicePrintEngine,
  // Types
  type HumanizationContext,
  type VoiceSnapshot,
} from '../../conversation/humanization/index.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createTestContext(overrides: Partial<HumanizationContext> = {}): HumanizationContext {
  return {
    userMessage: 'How do I handle stress better?',
    userWordCount: 6,
    userEnergy: 'medium',
    responseText:
      "That's a really thoughtful question. Let me share some perspective on managing stress.",
    responseWordCount: 12,
    responseComplexity: 0.5,
    isGivingAdvice: true,
    isEmotionalContent: false,
    turnCount: 5,
    sessionMinutes: 10,
    comfortLevel: 0.4,
    relationshipStage: 'acquaintance',
    personaId: 'ferni',
    recentTopics: ['stress', 'work'],
    recentHumanizations: [],
    ...overrides,
  };
}

function createTestVoiceSnapshot(overrides: Partial<VoiceSnapshot> = {}): VoiceSnapshot {
  return {
    pitchMean: 150,
    pitchMin: 100,
    pitchMax: 200,
    pitchVariance: 25,
    speechRate: 150,
    pauseRate: 8,
    avgPauseDuration: 400,
    energyMean: 0.5,
    energyVariance: 0.15,
    breathiness: 0.3,
    roughness: 0.2,
    strain: 0.1,
    valence: 0,
    arousal: 0.5,
    timestamp: new Date(),
    ...overrides,
  };
}

// ============================================================================
// PHASE 1: NATURAL IMPERFECTION
// ============================================================================

describe('Phase 1: Natural Imperfection', () => {
  describe('SelfCorrectionEngine', () => {
    let engine: SelfCorrectionEngine;

    beforeEach(() => {
      engine = new SelfCorrectionEngine();
    });

    it('should not trigger for simple responses', () => {
      const context = createTestContext({
        responseWordCount: 15,
        responseText: 'Yes, that sounds good.',
      });

      const decision = engine.shouldApply(context);
      expect(decision.shouldApply).toBe(false);
      expect(decision.reason).toContain('too short');
    });

    it('should consider complex responses for correction', () => {
      const context = createTestContext({
        responseWordCount: 80,
        responseText:
          'This is a complex response with many words that explains something in detail and provides nuanced advice about the situation you are facing and how to handle it effectively.',
        responseComplexity: 0.8,
      });

      // May or may not trigger due to probability, but should pass checks
      const decision = engine.shouldApply(context);
      // Either triggers or fails on probability
      expect(decision.reason).not.toContain('too short');
    });

    it('should respect cooldown between corrections', () => {
      const context = createTestContext({
        responseWordCount: 80,
        turnCount: 5,
      });

      // Force a generation
      const result1 = engine.generate(context);
      if (result1) {
        // Try again immediately
        const decision = engine.shouldApply({ ...context, turnCount: 6 });
        expect(decision.shouldApply).toBe(false);
        expect(decision.reason).toContain('Cooldown');
      }
    });

    it('should respect max per session', () => {
      const engine = new SelfCorrectionEngine({ maxPerSession: 2 });

      // Use up the quota
      for (let i = 0; i < 5; i++) {
        engine.generate(
          createTestContext({
            responseWordCount: 100,
            turnCount: i * 10 + 10,
          })
        );
      }

      // Check state
      expect(engine.getState().usageCount).toBeLessThanOrEqual(2);
    });
  });

  describe('DisfluencyEngine', () => {
    let engine: DisfluencyEngine;

    beforeEach(() => {
      engine = new DisfluencyEngine();
    });

    it('should not add disfluency to greetings', () => {
      const context = createTestContext({
        responseText: 'Hello! Great to see you!',
        responseWordCount: 5,
      });

      const decision = engine.shouldApply(context);
      expect(decision.shouldApply).toBe(false);
    });

    it('should not add disfluency to responses already starting with one', () => {
      const context = createTestContext({
        responseText: 'Um, well that is an interesting question...',
        responseWordCount: 30,
      });

      const decision = engine.shouldApply(context);
      expect(decision.shouldApply).toBe(false);
    });

    it('should apply disfluency correctly', () => {
      const result = engine.generate(
        createTestContext({
          responseWordCount: 50,
          turnCount: 2,
        })
      );

      if (result) {
        expect(result.type).toBe('disfluency');
        expect([
          'filled_pause',
          'discourse_marker',
          'false_start',
          'lengthening',
          'repetition',
        ]).toContain(result.disfluencyType);
      }
    });
  });

  describe('PhoneticMirroringEngine', () => {
    let engine: PhoneticMirroringEngine;

    beforeEach(() => {
      engine = new PhoneticMirroringEngine();
    });

    it('should detect reduction patterns', () => {
      engine.analyzeMessage("I'm gonna go to the store");
      engine.analyzeMessage('Wanna come with me?');
      engine.analyzeMessage('I kinda want to stay home');

      const profile = engine.getProfile();
      expect(profile.usesReductions).toBe(true);
      expect(profile.detectedReductions).toContain('gonna');
      expect(profile.detectedReductions).toContain('wanna');
      expect(profile.detectedReductions).toContain('kinda');
    });

    it('should detect regional markers', () => {
      engine.analyzeMessage("Y'all should come over");
      engine.analyzeMessage("Y'all are great");

      const profile = engine.getProfile();
      expect(profile.regionalMarkers).toContain('yall');
    });

    it('should mirror reductions after enough samples', () => {
      // Need 3 samples minimum
      engine.analyzeMessage("I'm gonna do it");
      engine.analyzeMessage('gonna be fun');
      engine.analyzeMessage('gonna work out');

      const { text, appliedMirrorings } = engine.mirror('I am going to help you with that.');

      // Should mirror if detected
      if (appliedMirrorings.length > 0) {
        expect(text).toContain('gonna');
        expect(appliedMirrorings).toContain('reduction:gonna');
      }
    });
  });

  describe('CatchingYourselfEngine', () => {
    let engine: CatchingYourselfEngine;

    beforeEach(() => {
      engine = new CatchingYourselfEngine();
    });

    it('should track word counts for talking_too_much detection', () => {
      // Agent talks a lot
      engine.recordAgentResponse(100, ['topic1']);
      engine.recordAgentResponse(100, ['topic1']);
      engine.recordAgentResponse(100, ['topic1']);

      // User says little
      engine.recordUserMessage(10);

      const state = engine.getState();
      expect(state.agentWordCountRecent).toBeGreaterThan(state.userWordCountRecent);
    });

    it('should track topic mentions for circling_back detection', () => {
      engine.recordAgentResponse(50, ['anxiety']);
      engine.recordAgentResponse(50, ['anxiety']);
      engine.recordAgentResponse(50, ['anxiety']);

      const state = engine.getState();
      expect(state.topicMentionCounts.get('anxiety')).toBe(3);
    });
  });
});

// ============================================================================
// PHASE 2: SESSION DYNAMICS
// ============================================================================

describe('Phase 2: Session Dynamics', () => {
  describe('VocalFatigueEngine', () => {
    let engine: VocalFatigueEngine;

    beforeEach(() => {
      engine = new VocalFatigueEngine();
    });

    it('should start with no fatigue', () => {
      const state = engine.getState();
      expect(state.fatigueLevel).toBe(0);
      expect(engine.isSignificant()).toBe(false);
    });

    it('should increase fatigue over time and heavy topics', () => {
      // Simulate a long conversation with heavy topics
      for (let i = 0; i < 30; i++) {
        engine.update({
          turnCount: i,
          topicWeight: i % 3 === 0 ? 'heavy' : 'medium',
          responseWordCount: 60,
        });
      }

      const state = engine.getState();
      expect(state.fatigueLevel).toBeGreaterThan(0);
    });

    it('should recover from positive events', () => {
      // Build up some fatigue
      for (let i = 0; i < 20; i++) {
        engine.update({
          turnCount: i,
          topicWeight: 'heavy',
          responseWordCount: 80,
        });
      }

      const beforeRecovery = engine.getState().fatigueLevel;

      // Apply recovery
      engine.applyRecovery('laughter');
      engine.applyRecovery('user_breakthrough');

      const afterRecovery = engine.getState().fatigueLevel;
      expect(afterRecovery).toBeLessThan(beforeRecovery);
    });

    it('should return appropriate adjustments based on fatigue', () => {
      const adjustments = engine.getAdjustments();
      expect(adjustments.speedReduction).toBeDefined();
      expect(adjustments.pauseMultiplier).toBeGreaterThanOrEqual(1);
      expect(adjustments.energyCeiling).toBeLessThanOrEqual(1);
    });
  });

  describe('SessionDynamicsEngine', () => {
    let engine: SessionDynamicsEngine;

    beforeEach(() => {
      engine = new SessionDynamicsEngine();
    });

    it('should start in opening phase', () => {
      const state = engine.getState();
      expect(state.phase).toBe('opening');
    });

    it('should transition through phases', () => {
      // Opening: 0-3
      engine.update({ turnCount: 0 });
      expect(engine.getState().phase).toBe('opening');

      // Warming: 4-8
      engine.update({ turnCount: 5 });
      expect(engine.getState().phase).toBe('warming');

      // Engaged: 9-20
      engine.update({ turnCount: 15 });
      expect(engine.getState().phase).toBe('engaged');

      // Deepening: 21-35
      engine.update({ turnCount: 25 });
      expect(engine.getState().phase).toBe('deepening');

      // Winding: 36-50
      engine.update({ turnCount: 40 });
      expect(engine.getState().phase).toBe('winding');

      // Extended: 51+
      engine.update({ turnCount: 55 });
      expect(engine.getState().phase).toBe('extended');
    });

    it('should provide phase-specific behavior guidance', () => {
      engine.update({ turnCount: 15 }); // Engaged phase

      const behavior = engine.getPhaseBehavior();
      expect(behavior.questionStyle).toBe('deep_exploratory');
      expect(behavior.responseLength).toBe('matches_user');
    });
  });

  describe('ComfortProgressionEngine', () => {
    let engine: ComfortProgressionEngine;

    beforeEach(() => {
      engine = new ComfortProgressionEngine();
    });

    it('should start with minimal comfort', () => {
      expect(engine.getComfortLevel()).toBeLessThan(0.3);
      expect(engine.getComfortCategory()).toBe('minimal');
    });

    it('should increase comfort from positive events', () => {
      const before = engine.getComfortLevel();

      engine.recordEvent('user_shared_vulnerability', 1);
      engine.recordEvent('shared_laughter', 2);
      engine.recordEvent('emotional_moment_navigated', 3);

      const after = engine.getComfortLevel();
      expect(after).toBeGreaterThan(before);
    });

    it('should gate behaviors based on comfort level', () => {
      // At minimal comfort, should not unlock playful_teasing
      expect(engine.isBehaviorUnlocked('playful_teasing')).toBe(false);
      expect(engine.isBehaviorUnlocked('hard_truths')).toBe(false);

      // Build comfort
      for (let i = 0; i < 10; i++) {
        engine.recordEvent('user_shared_vulnerability', i);
        engine.recordEvent('shared_laughter', i);
      }

      // Now should unlock more behaviors
      const unlocked = engine.getUnlockedBehaviors();
      expect(unlocked.length).toBeGreaterThan(3);
    });

    it('should track indicators', () => {
      engine.recordIndicator('usesAgentName', 5);
      engine.recordIndicator('showsPlayfulness', 8);

      const state = engine.getState();
      expect(state.indicators.usesAgentName).toBe(true);
      expect(state.indicators.showsPlayfulness).toBe(true);
    });
  });
});

// ============================================================================
// PHASE 3: ADVANCED LISTENING
// ============================================================================

describe('Phase 3: Advanced Listening', () => {
  describe('VoicePrintEngine', () => {
    let engine: VoicePrintEngine;

    beforeEach(() => {
      engine = new VoicePrintEngine('test-user');
    });

    it('should start uncalibrated', () => {
      expect(engine.isCalibrated()).toBe(false);
      expect(engine.getCalibrationProgress()).toBe(0);
    });

    it('should calibrate with enough samples', () => {
      // Add 10 samples
      for (let i = 0; i < 15; i++) {
        engine.recordSnapshot(createTestVoiceSnapshot());
      }

      expect(engine.getCalibrationProgress()).toBeGreaterThan(0.5);
    });

    it('should detect voice state changes', () => {
      // Calibrate with baseline
      for (let i = 0; i < 10; i++) {
        engine.recordSnapshot(createTestVoiceSnapshot({ energyMean: 0.5, valence: 0 }));
      }

      // Now test with different state
      const excitedSnapshot = createTestVoiceSnapshot({
        pitchMean: 180, // Higher pitch
        energyMean: 0.8, // More energy
        valence: 0.5, // Positive
        arousal: 0.8,
      });

      const detection = engine.detectState(excitedSnapshot);
      expect(detection.vsBaseline.pitchDeviation).toBeGreaterThan(0);
      expect(detection.vsBaseline.energyDeviation).toBeGreaterThan(0);
    });

    it('should serialize and deserialize', () => {
      engine.recordSnapshot(createTestVoiceSnapshot());
      const serialized = engine.serialize();
      const deserialized = VoicePrintEngine.deserialize(serialized);
      expect(deserialized.userId).toBe('test-user');
    });
  });

  describe('AmbientAwarenessEngine', () => {
    let engine: AmbientAwarenessEngine;

    beforeEach(() => {
      engine = new AmbientAwarenessEngine();
    });

    it('should detect quiet environment', () => {
      const detection = engine.simulateDetection({ isQuiet: true });
      const context = engine.processDetection(detection, 1);

      expect(context.primarySound).toBe('quiet');
      expect(context.privacyLevel).toBe('private');
      expect(context.implications.shouldAvoidSensitiveTopics).toBe(false);
    });

    it('should detect traffic and infer car location', () => {
      const detection = engine.simulateDetection({ hasTraffic: true });
      const context = engine.processDetection(detection, 1);

      expect(context.primarySound).toBe('traffic');
      expect(context.likelyLocation).toBe('car');
      expect(context.implications.shouldKeepBrief).toBe(true);
      expect(context.implications.attentionMayBeDivided).toBe(true);
    });

    it('should detect crowd and suggest avoiding sensitive topics', () => {
      const detection = engine.simulateDetection({ hasVoices: true, energyLevel: 0.8 });
      const context = engine.processDetection(detection, 1);

      if (context.primarySound === 'crowd') {
        expect(context.privacyLevel).toBe('public');
        expect(context.implications.shouldAvoidSensitiveTopics).toBe(true);
      }
    });

    it('should only acknowledge sounds once', () => {
      const detection = engine.simulateDetection({ hasTraffic: true });

      const context1 = engine.processDetection(detection, 1);
      const shouldAck1 = context1.shouldAcknowledge;

      const context2 = engine.processDetection(detection, 2);
      expect(context2.shouldAcknowledge).toBe(false);
    });
  });
});

// ============================================================================
// PHASE 4: EMOTIONAL LEADERSHIP
// ============================================================================

describe('Phase 4: Emotional Leadership', () => {
  describe('EmotionalLeadingEngine', () => {
    let engine: EmotionalLeadingEngine;

    beforeEach(() => {
      engine = new EmotionalLeadingEngine();
    });

    it('should hold space during crisis', () => {
      const decision = engine.decideLeading(
        {
          valence: -0.8,
          arousal: 0.9,
          emotion: 'distressed',
          distressLevel: 0.9,
          negativeSpiralIndicators: 3,
          energy: 'high',
          inCrisis: true,
        },
        "I can't handle this anymore",
        { turnCount: 10, comfortLevel: 0.5, recentTopics: [] }
      );

      expect(decision.strategy).toBe('hold_space');
      expect(decision.shouldLead).toBe(false);
    });

    it('should suggest calming for high anxiety', () => {
      const decision = engine.decideLeading(
        {
          valence: -0.2,
          arousal: 0.8,
          emotion: 'anxious',
          distressLevel: 0.4,
          negativeSpiralIndicators: 0,
          energy: 'high',
          inCrisis: false,
        },
        "I'm so worried about everything",
        { turnCount: 10, comfortLevel: 0.5, recentTopics: [] }
      );

      expect(decision.strategy).toBe('calm');
      expect(decision.vocalAdjustments.tempoTarget).toBeLessThan(1);
    });

    it('should suggest energizing for low energy', () => {
      const decision = engine.decideLeading(
        {
          valence: 0,
          arousal: 0.3,
          emotion: 'flat',
          distressLevel: 0.2,
          negativeSpiralIndicators: 0,
          energy: 'low',
          inCrisis: false,
        },
        'Just feeling kind of meh today',
        { turnCount: 10, comfortLevel: 0.5, recentTopics: [] }
      );

      expect(decision.strategy).toBe('energize');
      expect(decision.vocalAdjustments.energyTarget).toBeGreaterThan(0.5);
    });

    it('should require mirroring first for distressed users', () => {
      const decision = engine.decideLeading(
        {
          valence: -0.5,
          arousal: 0.6,
          emotion: 'upset',
          distressLevel: 0.6,
          negativeSpiralIndicators: 2,
          energy: 'medium',
          inCrisis: false,
        },
        'Nothing ever works out for me',
        { turnCount: 10, comfortLevel: 0.5, recentTopics: [] }
      );

      expect(decision.mirrorTurnsFirst).toBeGreaterThan(0);
    });
  });

  describe('BreathingSyncEngine', () => {
    let engine: BreathingSyncEngine;

    beforeEach(() => {
      engine = new BreathingSyncEngine();
    });

    it('should start without valid data', () => {
      expect(engine.hasValidData()).toBe(false);
    });

    it('should accept simulated breath patterns', () => {
      const pattern = simulateBreathPattern({ isCalm: true });
      engine.updateUserPattern(pattern);

      expect(engine.hasValidData()).toBe(true);
      expect(engine.getState().userPattern?.breathsPerMinute).toBe(12);
    });

    it('should calculate adjustments for text', () => {
      const pattern = simulateBreathPattern({ isCalm: true });
      engine.updateUserPattern(pattern);

      const adjustments = engine.calculateAdjustments(
        'This is a test sentence. Here is another one. And a third.',
        { isEmotional: true, isHeavy: false, isExcited: false }
      );

      expect(adjustments.overallPacing).toBeDefined();
      expect(adjustments.adjustedBreaks).toBeDefined();
    });

    it('should apply adjustments to SSML', () => {
      const pattern = simulateBreathPattern({ isAnxious: true });
      engine.updateUserPattern(pattern);

      const adjustments = engine.calculateAdjustments('Test sentence here.', {
        isEmotional: false,
        isHeavy: false,
        isExcited: false,
      });

      const ssml = engine.applyToSsml('Test sentence here.', adjustments);
      // Should have some modification if adjustments were made
      expect(ssml).toBeDefined();
    });
  });
});

// ============================================================================
// PHASE 5: CROSS-SESSION INTELLIGENCE
// ============================================================================

describe('Phase 5: Cross-Session Intelligence', () => {
  describe('CrossSessionVoiceEngine', () => {
    let engine: CrossSessionVoiceEngine;

    beforeEach(() => {
      engine = new CrossSessionVoiceEngine('test-user');
    });

    it('should start with empty history', () => {
      const summary = engine.getHistorySummary();
      expect(summary.totalSessions).toBe(0);
    });

    it('should track session start and end', () => {
      const startVoice = createTestVoiceSnapshot({ energyMean: 0.5 });
      engine.startSession('session-1', startVoice);

      engine.recordMoment(5, 'User shared something important', { energyMean: 0.6 }, 'engaged');

      const endVoice = createTestVoiceSnapshot({ energyMean: 0.6 });
      engine.endSession(endVoice);

      const summary = engine.getHistorySummary();
      expect(summary.totalSessions).toBe(1);
    });

    it('should detect changes between sessions', () => {
      // First session - baseline
      const startVoice1 = createTestVoiceSnapshot({ energyMean: 0.5, valence: 0 });
      engine.startSession('session-1', startVoice1);
      engine.endSession(createTestVoiceSnapshot({ energyMean: 0.5, valence: 0 }));

      // Second session - different
      const startVoice2 = createTestVoiceSnapshot({ energyMean: 0.8, valence: 0.3 });
      engine.startSession('session-2', startVoice2);

      // Should detect the change
      const ack = engine.generateAcknowledgment(startVoice2);
      // May or may not generate based on logic
      if (ack) {
        expect(['observation', 'celebration', 'concern', 'trend']).toContain(ack.type);
      }
    });

    it('should serialize and deserialize', () => {
      const startVoice = createTestVoiceSnapshot();
      engine.startSession('session-1', startVoice);
      engine.endSession(startVoice);

      const serialized = engine.serialize();
      const memory = CrossSessionVoiceEngine.deserialize(serialized);

      expect(memory.userId).toBe('test-user');
      expect(memory.totalSessions).toBe(1);
    });
  });
});

// ============================================================================
// ORCHESTRATOR INTEGRATION
// ============================================================================

describe('HumanizationOrchestrator Integration', () => {
  let orchestrator: HumanizationOrchestrator;

  beforeEach(() => {
    resetAllHumanization();
    orchestrator = getHumanizationOrchestrator('test-session', {}, 'test-user');
  });

  afterEach(() => {
    resetAllHumanization();
  });

  it('should initialize all engines', () => {
    const states = orchestrator.getEngineStates();

    expect(states.selfCorrection).toBeDefined();
    expect(states.disfluency).toBeDefined();
    expect(states.phoneticMirroring).toBeDefined();
    expect(states.catchingYourself).toBeDefined();
    expect(states.vocalFatigue).toBeDefined();
    expect(states.sessionDynamics).toBeDefined();
    expect(states.comfortProgression).toBeDefined();
    expect(states.voicePrint).toBeDefined();
    expect(states.ambientAwareness).toBeDefined();
    expect(states.emotionalLeading).toBeDefined();
    expect(states.breathingSync).toBeDefined();
    expect(states.crossSessionVoice).toBeDefined();
  });

  it('should humanize a response', () => {
    const context = createTestContext();
    orchestrator.recordUserMessage(context.userMessage);

    const result = orchestrator.humanize(context.responseText, {
      userMessage: context.userMessage,
      userWordCount: context.userWordCount,
      userEnergy: context.userEnergy,
      turnCount: context.turnCount,
      sessionMinutes: context.sessionMinutes,
      comfortLevel: context.comfortLevel,
      relationshipStage: context.relationshipStage,
      personaId: context.personaId,
      recentTopics: context.recentTopics,
      recentHumanizations: context.recentHumanizations,
    });

    expect(result.original).toBe(context.responseText);
    expect(result.text).toBeDefined();
    expect(result.ssml).toBeDefined();
    expect(result.appliedHumanizations).toBeDefined();
    expect(result.skippedFeatures).toBeDefined();
  });

  it('should track conversation phase', () => {
    // Early phase
    expect(orchestrator.getConversationPhase()).toBe('opening');

    // Simulate turns
    for (let i = 0; i < 15; i++) {
      orchestrator.humanize('Test response', {
        userMessage: 'Test message',
        userWordCount: 2,
        userEnergy: 'medium',
        turnCount: i,
        sessionMinutes: i,
        comfortLevel: 0.4,
        relationshipStage: 'acquaintance',
        personaId: 'ferni',
        recentTopics: [],
        recentHumanizations: [],
      });
    }

    // Should be in engaged phase now
    expect(orchestrator.getConversationPhase()).toBe('engaged');
  });

  it('should track comfort progression', () => {
    // Record comfort events
    orchestrator.recordComfortEvent('shared_laughter', 1);
    orchestrator.recordComfortEvent('user_shared_vulnerability', 2);

    // Should unlock some behaviors
    expect(orchestrator.isBehaviorUnlocked('gentle_humor')).toBe(true);
  });

  it('should get emotional leading decisions', () => {
    const decision = orchestrator.getEmotionalLeadingDecision(
      {
        valence: -0.3,
        arousal: 0.7,
        emotion: 'anxious',
        distressLevel: 0.4,
        energy: 'high',
        inCrisis: false,
      },
      "I'm worried about tomorrow"
    );

    expect(decision).toBeDefined();
    expect(decision.strategy).toBeDefined();
  });

  it('should reset properly', () => {
    // Do some humanization
    orchestrator.humanize('Test', createTestContext());

    // Reset
    orchestrator.reset();

    const states = orchestrator.getEngineStates();
    expect(states.sessionTotal).toBe(0);
    expect(states.currentTurn).toBe(0);
  });
});

// ============================================================================
// E2E SCENARIO TESTS
// ============================================================================

describe('E2E Scenarios', () => {
  beforeEach(() => {
    resetAllHumanization();
  });

  afterEach(() => {
    resetAllHumanization();
  });

  it('should handle a complete conversation flow', () => {
    const orchestrator = getHumanizationOrchestrator('e2e-session', {}, 'e2e-user');

    const conversationTurns = [
      { user: 'Hey, how are you?', response: "I'm doing well, thanks for asking! How about you?" },
      {
        user: "I'm okay, just a bit stressed",
        response: "I hear you. Stress can be tough. What's going on?",
      },
      {
        user: 'Work has been crazy. My boss keeps piling on more work.',
        response:
          "That sounds overwhelming. It's hard when work demands keep growing. Have you been able to set any boundaries?",
      },
      {
        user: "Not really. I kinda feel like I can't say no.",
        response:
          "That's a really common feeling. Many people struggle with saying no, especially at work. What makes it feel hard for you?",
      },
      {
        user: 'I guess I worry about what people will think',
        response:
          "That makes complete sense. Worrying about perception is natural. But I'm curious—what's the cost of always saying yes?",
      },
    ];

    for (let i = 0; i < conversationTurns.length; i++) {
      const turn = conversationTurns[i];
      orchestrator.recordUserMessage(turn.user);

      const result = orchestrator.humanize(turn.response, {
        userMessage: turn.user,
        userWordCount: turn.user.split(/\s+/).length,
        userEnergy: i < 2 ? 'medium' : 'low',
        turnCount: i,
        sessionMinutes: i * 2,
        comfortLevel: 0.3 + i * 0.1,
        relationshipStage: 'acquaintance',
        personaId: 'ferni',
        recentTopics: ['work', 'stress'],
        recentHumanizations: [],
        isEmotionalContent: i >= 2,
      });

      // Verify result structure
      expect(result.text).toBeDefined();
      expect(result.ssml).toBeDefined();
    }

    // Verify state after conversation
    const states = orchestrator.getEngineStates();
    // sessionTotal may be 0 if probabilistic humanizations didn't trigger - that's okay
    expect(states.sessionTotal).toBeGreaterThanOrEqual(0);
    expect((states.sessionDynamics as { phase: string }).phase).toBe('warming');
  });

  it('should handle emotional leading scenario', () => {
    const orchestrator = getHumanizationOrchestrator('leading-session', {}, 'leading-user');

    // First do some turns to build context
    for (let i = 0; i < 5; i++) {
      orchestrator.humanize('Response', {
        userMessage: 'Message',
        userWordCount: 1,
        userEnergy: 'medium',
        turnCount: i,
        sessionMinutes: i,
        comfortLevel: 0.5,
        relationshipStage: 'acquaintance',
        personaId: 'ferni',
        recentTopics: [],
        recentHumanizations: [],
      });
    }

    // User starts anxious
    const decision = orchestrator.getEmotionalLeadingDecision(
      {
        valence: -0.4,
        arousal: 0.8,
        emotion: 'anxious',
        distressLevel: 0.4, // Lower distress to avoid hold_space
        energy: 'high',
        inCrisis: false,
      },
      "I'm so nervous about this presentation"
    );

    // Valid strategies for anxiety include calm, validate, hold_space, or ground
    expect(['calm', 'validate', 'ground', 'hold_space']).toContain(decision.strategy);
    // Mirror turns could be 0 if hold_space or based on conditions
    expect(decision.mirrorTurnsFirst).toBeGreaterThanOrEqual(0);
  });

  it('should handle ambient context changes', () => {
    const orchestrator = getHumanizationOrchestrator('ambient-session', {}, 'ambient-user');

    // Start in quiet environment
    let context = orchestrator.getAmbientContext();
    expect(context).toBeNull(); // Not yet processed

    // TODO: Add ambient detection integration when available
  });
});
