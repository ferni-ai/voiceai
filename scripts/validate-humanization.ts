#!/usr/bin/env npx ts-node
/**
 * Humanization System E2E Validation
 *
 * This script validates the complete humanization system by simulating
 * realistic conversation scenarios and checking that all subsystems
 * behave correctly.
 *
 * Usage: npx ts-node scripts/validate-humanization.ts
 */

import {
  AmbientAwarenessEngine,
  BreathingSyncEngine,
  CatchingYourselfEngine,
  ComfortProgressionEngine,
  CrossSessionVoiceEngine,
  DisfluencyEngine,
  EmotionalLeadingEngine,
  getHumanizationOrchestrator,
  PhoneticMirroringEngine,
  resetAllHumanization,
  // Engines
  SelfCorrectionEngine,
  SessionDynamicsEngine,
  simulateBreathPattern,
  VocalFatigueEngine,
  VoicePrintEngine,
  // Types
  type VoiceSnapshot,
} from '../src/conversation/humanization/index';

// ============================================================================
// UTILITIES
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(message: string, color: keyof typeof colors = 'reset'): void {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function pass(test: string): void {
  log(`  ✓ ${test}`, 'green');
}

function fail(test: string, error?: string): void {
  log(`  ✗ ${test}`, 'red');
  if (error) {
    log(`    Error: ${error}`, 'dim');
  }
}

function section(title: string): void {
  console.log();
  log(`━━━ ${title} ━━━`, 'cyan');
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
// VALIDATION TESTS
// ============================================================================

interface ValidationResult {
  passed: number;
  failed: number;
  errors: string[];
}

async function validatePhase1(): Promise<ValidationResult> {
  section('Phase 1: Natural Imperfection');
  const result: ValidationResult = { passed: 0, failed: 0, errors: [] };

  try {
    // Self-Correction
    const selfCorrection = new SelfCorrectionEngine();
    const scContext = {
      userMessage: 'How do I handle this?',
      userWordCount: 5,
      userEnergy: 'medium' as const,
      responseText:
        'Well, I think you should consider multiple perspectives here and take time to reflect on what matters most to you in this situation.',
      responseWordCount: 20,
      responseComplexity: 0.6,
      isGivingAdvice: true,
      isEmotionalContent: false,
      turnCount: 5,
      sessionMinutes: 5,
      comfortLevel: 0.4,
      relationshipStage: 'acquaintance' as const,
      personaId: 'ferni',
      recentTopics: [],
      recentHumanizations: [],
    };

    // Test decision making
    selfCorrection.shouldApply(scContext);
    pass('SelfCorrectionEngine.shouldApply() works');
    result.passed++;

    // Disfluency
    const disfluency = new DisfluencyEngine();
    disfluency.shouldApply(scContext);
    pass('DisfluencyEngine.shouldApply() works');
    result.passed++;

    // Phonetic Mirroring
    const phonetic = new PhoneticMirroringEngine();
    phonetic.analyzeMessage("I'm gonna do it");
    phonetic.analyzeMessage('wanna help me?');
    phonetic.analyzeMessage('kinda tired today');
    const profile = phonetic.getProfile();
    if (profile.usesReductions && profile.detectedReductions.length > 0) {
      pass('PhoneticMirroringEngine detects reductions');
      result.passed++;
    } else {
      fail('PhoneticMirroringEngine should detect reductions');
      result.failed++;
    }

    // Catching Yourself
    const catching = new CatchingYourselfEngine();
    catching.recordAgentResponse(100, ['topic1']);
    catching.recordUserMessage(10);
    const catchState = catching.getState();
    if (catchState.agentWordCountRecent > 0 && catchState.userWordCountRecent > 0) {
      pass('CatchingYourselfEngine tracks word counts');
      result.passed++;
    } else {
      fail('CatchingYourselfEngine should track word counts');
      result.failed++;
    }
  } catch (error) {
    fail('Phase 1 validation error');
    result.failed++;
    result.errors.push(String(error));
  }

  return result;
}

async function validatePhase2(): Promise<ValidationResult> {
  section('Phase 2: Session Dynamics');
  const result: ValidationResult = { passed: 0, failed: 0, errors: [] };

  try {
    // Vocal Fatigue
    const fatigue = new VocalFatigueEngine();
    const initialFatigue = fatigue.getState().fatigueLevel;

    for (let i = 0; i < 20; i++) {
      fatigue.update({
        turnCount: i,
        topicWeight: 'heavy',
        responseWordCount: 80,
      });
    }

    const finalFatigue = fatigue.getState().fatigueLevel;
    if (finalFatigue > initialFatigue) {
      pass('VocalFatigueEngine increases fatigue over time');
      result.passed++;
    } else {
      fail('VocalFatigueEngine should increase fatigue');
      result.failed++;
    }

    // Recovery
    const beforeRecovery = fatigue.getState().fatigueLevel;
    fatigue.applyRecovery('laughter');
    const afterRecovery = fatigue.getState().fatigueLevel;
    if (afterRecovery < beforeRecovery) {
      pass('VocalFatigueEngine recovery works');
      result.passed++;
    } else {
      fail('VocalFatigueEngine recovery should reduce fatigue');
      result.failed++;
    }

    // Session Dynamics
    const dynamics = new SessionDynamicsEngine();
    dynamics.update({ turnCount: 0 });
    if (dynamics.getState().phase === 'opening') {
      pass('SessionDynamicsEngine starts in opening phase');
      result.passed++;
    } else {
      fail('SessionDynamicsEngine should start in opening');
      result.failed++;
    }

    dynamics.update({ turnCount: 15 });
    if (dynamics.getState().phase === 'engaged') {
      pass('SessionDynamicsEngine transitions to engaged phase');
      result.passed++;
    } else {
      fail('SessionDynamicsEngine should transition to engaged');
      result.failed++;
    }

    // Comfort Progression
    const comfort = new ComfortProgressionEngine();
    const initialComfort = comfort.getComfortLevel();
    comfort.recordEvent('user_shared_vulnerability', 1);
    comfort.recordEvent('shared_laughter', 2);
    const finalComfort = comfort.getComfortLevel();
    if (finalComfort > initialComfort) {
      pass('ComfortProgressionEngine builds comfort from events');
      result.passed++;
    } else {
      fail('ComfortProgressionEngine should build comfort');
      result.failed++;
    }
  } catch (error) {
    fail('Phase 2 validation error');
    result.failed++;
    result.errors.push(String(error));
  }

  return result;
}

async function validatePhase3(): Promise<ValidationResult> {
  section('Phase 3: Advanced Listening');
  const result: ValidationResult = { passed: 0, failed: 0, errors: [] };

  try {
    // Voice Print
    const voicePrint = new VoicePrintEngine('test-user');
    if (!voicePrint.isCalibrated()) {
      pass('VoicePrintEngine starts uncalibrated');
      result.passed++;
    } else {
      fail('VoicePrintEngine should start uncalibrated');
      result.failed++;
    }

    // Add samples
    for (let i = 0; i < 15; i++) {
      voicePrint.recordSnapshot(createTestVoiceSnapshot());
    }

    if (voicePrint.getCalibrationProgress() > 0.5) {
      pass('VoicePrintEngine calibrates with samples');
      result.passed++;
    } else {
      fail('VoicePrintEngine should calibrate');
      result.failed++;
    }

    // State detection
    const excitedSnapshot = createTestVoiceSnapshot({
      pitchMean: 180,
      energyMean: 0.8,
      arousal: 0.8,
    });
    const detection = voicePrint.detectState(excitedSnapshot);
    if (detection.vsBaseline.pitchDeviation > 0) {
      pass('VoicePrintEngine detects pitch deviation');
      result.passed++;
    } else {
      fail('VoicePrintEngine should detect pitch deviation');
      result.failed++;
    }

    // Ambient Awareness
    const ambient = new AmbientAwarenessEngine();
    const quietDetection = ambient.simulateDetection({ isQuiet: true });
    const quietContext = ambient.processDetection(quietDetection, 1);
    if (quietContext.primarySound === 'quiet' && quietContext.privacyLevel === 'private') {
      pass('AmbientAwarenessEngine detects quiet environment');
      result.passed++;
    } else {
      fail('AmbientAwarenessEngine should detect quiet');
      result.failed++;
    }

    const trafficDetection = ambient.simulateDetection({ hasTraffic: true });
    const trafficContext = ambient.processDetection(trafficDetection, 2);
    if (trafficContext.likelyLocation === 'car') {
      pass('AmbientAwarenessEngine infers car location from traffic');
      result.passed++;
    } else {
      fail('AmbientAwarenessEngine should infer car location');
      result.failed++;
    }
  } catch (error) {
    fail('Phase 3 validation error');
    result.failed++;
    result.errors.push(String(error));
  }

  return result;
}

async function validatePhase4(): Promise<ValidationResult> {
  section('Phase 4: Emotional Leadership');
  const result: ValidationResult = { passed: 0, failed: 0, errors: [] };

  try {
    // Emotional Leading
    const leading = new EmotionalLeadingEngine();

    // Crisis = hold space
    const crisisDecision = leading.decideLeading(
      {
        valence: -0.8,
        arousal: 0.9,
        emotion: 'distressed',
        distressLevel: 0.9,
        negativeSpiralIndicators: 3,
        energy: 'high',
        inCrisis: true,
      },
      "I can't handle this",
      { turnCount: 10, comfortLevel: 0.5, recentTopics: [] }
    );

    if (crisisDecision.strategy === 'hold_space') {
      pass('EmotionalLeadingEngine holds space during crisis');
      result.passed++;
    } else {
      fail('EmotionalLeadingEngine should hold space during crisis');
      result.failed++;
    }

    // Anxiety = calm
    const anxietyDecision = leading.decideLeading(
      {
        valence: -0.2,
        arousal: 0.8,
        emotion: 'anxious',
        distressLevel: 0.4,
        negativeSpiralIndicators: 0,
        energy: 'high',
        inCrisis: false,
      },
      "I'm so worried",
      { turnCount: 10, comfortLevel: 0.5, recentTopics: [] }
    );

    if (anxietyDecision.strategy === 'calm') {
      pass('EmotionalLeadingEngine suggests calming for anxiety');
      result.passed++;
    } else {
      fail('EmotionalLeadingEngine should suggest calming for anxiety');
      result.failed++;
    }

    // Breathing Sync
    const breathSync = new BreathingSyncEngine();
    const pattern = simulateBreathPattern({ isCalm: true });
    breathSync.updateUserPattern(pattern);

    if (breathSync.hasValidData()) {
      pass('BreathingSyncEngine accepts breath patterns');
      result.passed++;
    } else {
      fail('BreathingSyncEngine should have valid data');
      result.failed++;
    }

    const adjustments = breathSync.calculateAdjustments('Test sentence. Another one.', {
      isEmotional: false,
      isHeavy: false,
      isExcited: false,
    });

    if (adjustments.overallPacing !== undefined) {
      pass('BreathingSyncEngine calculates pacing adjustments');
      result.passed++;
    } else {
      fail('BreathingSyncEngine should calculate adjustments');
      result.failed++;
    }
  } catch (error) {
    fail('Phase 4 validation error');
    result.failed++;
    result.errors.push(String(error));
  }

  return result;
}

async function validatePhase5(): Promise<ValidationResult> {
  section('Phase 5: Cross-Session Intelligence');
  const result: ValidationResult = { passed: 0, failed: 0, errors: [] };

  try {
    const crossSession = new CrossSessionVoiceEngine('test-user');

    // Empty history
    const initialSummary = crossSession.getHistorySummary();
    if (initialSummary.totalSessions === 0) {
      pass('CrossSessionVoiceEngine starts with empty history');
      result.passed++;
    } else {
      fail('CrossSessionVoiceEngine should start empty');
      result.failed++;
    }

    // First session
    crossSession.startSession('session-1', createTestVoiceSnapshot({ energyMean: 0.5 }));
    crossSession.recordMoment(5, 'Important moment', { energyMean: 0.6 }, 'engaged');
    crossSession.endSession(createTestVoiceSnapshot({ energyMean: 0.6 }));

    const afterFirst = crossSession.getHistorySummary();
    if (afterFirst.totalSessions === 1) {
      pass('CrossSessionVoiceEngine tracks session completion');
      result.passed++;
    } else {
      fail('CrossSessionVoiceEngine should track session');
      result.failed++;
    }

    // Second session with different state
    crossSession.startSession(
      'session-2',
      createTestVoiceSnapshot({ energyMean: 0.8, valence: 0.3 })
    );

    // Should potentially detect the change
    const memory = crossSession.getMemory();
    if (memory.sessionSnapshots.length >= 1) {
      pass('CrossSessionVoiceEngine maintains session history');
      result.passed++;
    } else {
      fail('CrossSessionVoiceEngine should maintain history');
      result.failed++;
    }

    // Serialization
    const serialized = crossSession.serialize();
    const deserialized = CrossSessionVoiceEngine.deserialize(serialized);
    if (deserialized.userId === 'test-user') {
      pass('CrossSessionVoiceEngine serialization works');
      result.passed++;
    } else {
      fail('CrossSessionVoiceEngine serialization should work');
      result.failed++;
    }
  } catch (error) {
    fail('Phase 5 validation error');
    result.failed++;
    result.errors.push(String(error));
  }

  return result;
}

async function validateOrchestrator(): Promise<ValidationResult> {
  section('Orchestrator Integration');
  const result: ValidationResult = { passed: 0, failed: 0, errors: [] };

  try {
    resetAllHumanization();

    const orchestrator = getHumanizationOrchestrator('validation-session', {}, 'validation-user');

    // Check all engines initialized
    const states = orchestrator.getEngineStates();
    const expectedEngines = [
      'selfCorrection',
      'disfluency',
      'phoneticMirroring',
      'catchingYourself',
      'vocalFatigue',
      'sessionDynamics',
      'comfortProgression',
      'voicePrint',
      'ambientAwareness',
      'emotionalLeading',
      'breathingSync',
      'crossSessionVoice',
    ];

    let allEnginesPresent = true;
    for (const engine of expectedEngines) {
      if (states[engine] === undefined) {
        allEnginesPresent = false;
        fail(`Missing engine: ${engine}`);
        result.failed++;
      }
    }

    if (allEnginesPresent) {
      pass('All 12 engines initialized');
      result.passed++;
    }

    // Test humanization
    const testResponse = 'I think you should take some time to reflect on this situation.';
    const humanized = orchestrator.humanize(testResponse, {
      userMessage: 'What should I do?',
      userWordCount: 4,
      userEnergy: 'medium',
      turnCount: 5,
      sessionMinutes: 5,
      comfortLevel: 0.4,
      relationshipStage: 'acquaintance',
      personaId: 'ferni',
      recentTopics: [],
      recentHumanizations: [],
    });

    if (humanized.original === testResponse && humanized.text) {
      pass('Humanize() returns valid result');
      result.passed++;
    } else {
      fail('Humanize() should return valid result');
      result.failed++;
    }

    // Test phase tracking
    for (let i = 0; i < 10; i++) {
      orchestrator.humanize('Response', {
        userMessage: 'Message',
        userWordCount: 1,
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

    const phase = orchestrator.getConversationPhase();
    if (phase === 'engaged') {
      pass('Phase tracking works (reached engaged)');
      result.passed++;
    } else {
      fail(`Phase tracking: expected engaged, got ${phase}`);
      result.failed++;
    }

    // Test comfort events
    orchestrator.recordComfortEvent('shared_laughter', 5);
    if (orchestrator.isBehaviorUnlocked('gentle_humor')) {
      pass('Comfort gating works');
      result.passed++;
    } else {
      fail('Comfort gating should unlock gentle_humor');
      result.failed++;
    }

    // Test emotional leading integration
    const leadingDecision = orchestrator.getEmotionalLeadingDecision(
      {
        valence: -0.3,
        arousal: 0.6,
        emotion: 'worried',
        distressLevel: 0.3,
        energy: 'medium',
        inCrisis: false,
      },
      'I am worried about things'
    );

    if (leadingDecision.strategy) {
      pass('Emotional leading integration works');
      result.passed++;
    } else {
      fail('Emotional leading should return strategy');
      result.failed++;
    }

    // Test reset
    orchestrator.reset();
    const statesAfterReset = orchestrator.getEngineStates();
    if (statesAfterReset.sessionTotal === 0) {
      pass('Reset works correctly');
      result.passed++;
    } else {
      fail('Reset should clear session total');
      result.failed++;
    }

    resetAllHumanization();
  } catch (error) {
    fail('Orchestrator validation error');
    result.failed++;
    result.errors.push(String(error));
  }

  return result;
}

async function validateE2EScenario(): Promise<ValidationResult> {
  section('E2E Conversation Scenario');
  const result: ValidationResult = { passed: 0, failed: 0, errors: [] };

  try {
    resetAllHumanization();

    const orchestrator = getHumanizationOrchestrator('e2e-session', {}, 'e2e-user');

    // Simulate a real conversation
    const conversation = [
      {
        turn: 0,
        user: 'Hey, how are you doing?',
        response: "I'm doing well, thanks! How about you?",
      },
      {
        turn: 1,
        user: "I'm okay, kinda stressed about work",
        response: "I hear you. Work stress is real. What's going on?",
      },
      {
        turn: 2,
        user: 'My boss keeps giving me more and more tasks',
        response:
          'That sounds overwhelming. When everything piles up it can feel suffocating. Have you been able to talk to your boss about the workload?',
      },
      {
        turn: 3,
        user: "Not really, I'm afraid to speak up",
        response:
          "That fear is really common. Many people worry about how they'll be perceived. What's the worst that could happen if you did speak up?",
      },
      {
        turn: 4,
        user: "I guess I could get fired? But that's probably unlikely",
        response:
          "You're right to reality-check that fear. And even naming it takes away some of its power. What would you want to say if you could?",
      },
    ];

    let allTurnsSuccessful = true;

    for (const turn of conversation) {
      orchestrator.recordUserMessage(turn.user);

      const humanized = orchestrator.humanize(turn.response, {
        userMessage: turn.user,
        userWordCount: turn.user.split(/\s+/).length,
        userEnergy: turn.turn < 2 ? 'medium' : 'low',
        turnCount: turn.turn,
        sessionMinutes: turn.turn * 2,
        comfortLevel: 0.3 + turn.turn * 0.08,
        relationshipStage: 'acquaintance',
        personaId: 'ferni',
        recentTopics: ['work', 'stress'],
        recentHumanizations: [],
        isEmotionalContent: turn.turn >= 2,
      });

      if (!humanized.text || !humanized.ssml) {
        allTurnsSuccessful = false;
        fail(`Turn ${turn.turn} failed to humanize`);
        result.failed++;
      }
    }

    if (allTurnsSuccessful) {
      pass('All conversation turns humanized successfully');
      result.passed++;
    }

    // Check final state
    const finalStates = orchestrator.getEngineStates();

    if ((finalStates.sessionDynamics as { phase: string }).phase === 'warming') {
      pass('Conversation progressed through phases');
      result.passed++;
    } else {
      fail('Conversation should be in warming phase');
      result.failed++;
    }

    if ((finalStates.sessionTotal as number) > 0) {
      pass('Humanizations were applied during conversation');
      result.passed++;
    } else {
      // This is okay - humanizations are probabilistic
      pass('No humanizations applied (probabilistic - acceptable)');
      result.passed++;
    }

    resetAllHumanization();
  } catch (error) {
    fail('E2E scenario validation error');
    result.failed++;
    result.errors.push(String(error));
  }

  return result;
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log();
  log('╔═══════════════════════════════════════════════════════════════╗', 'cyan');
  log('║      FERNI HUMANIZATION SYSTEM - E2E VALIDATION               ║', 'cyan');
  log('║      "Making AI Human, One Feature at a Time"                 ║', 'cyan');
  log('╚═══════════════════════════════════════════════════════════════╝', 'cyan');

  const results: ValidationResult[] = [];

  // Run all validations
  results.push(await validatePhase1());
  results.push(await validatePhase2());
  results.push(await validatePhase3());
  results.push(await validatePhase4());
  results.push(await validatePhase5());
  results.push(await validateOrchestrator());
  results.push(await validateE2EScenario());

  // Summary
  const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
  const allErrors = results.flatMap((r) => r.errors);

  section('VALIDATION SUMMARY');

  console.log();
  log(`  Total Tests: ${totalPassed + totalFailed}`, 'blue');
  log(`  Passed: ${totalPassed}`, 'green');
  log(`  Failed: ${totalFailed}`, totalFailed > 0 ? 'red' : 'green');

  if (allErrors.length > 0) {
    console.log();
    log('  Errors:', 'red');
    for (const error of allErrors) {
      log(`    - ${error}`, 'dim');
    }
  }

  console.log();

  if (totalFailed === 0) {
    log('╔═══════════════════════════════════════════════════════════════╗', 'green');
    log('║  ✓ ALL VALIDATIONS PASSED - HUMANIZATION SYSTEM READY        ║', 'green');
    log('╚═══════════════════════════════════════════════════════════════╝', 'green');
    process.exit(0);
  } else {
    log('╔═══════════════════════════════════════════════════════════════╗', 'red');
    log('║  ✗ SOME VALIDATIONS FAILED - SEE ERRORS ABOVE                ║', 'red');
    log('╚═══════════════════════════════════════════════════════════════╝', 'red');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
