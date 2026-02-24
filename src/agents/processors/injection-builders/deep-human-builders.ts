/**
 * Deep Human System & Emotional Journey Builders
 *
 * Orchestrates all 5 "Better Than Human" personality builders:
 * 1. Secret Mode Detector
 * 2. Energy Matcher
 * 3. Deep Human Orchestrator
 * 4. Speech Naturalizer
 * 5. Laughter Contagion
 *
 * Also includes the Emotional Journey Orchestrator.
 *
 * Priority: 50-70 (varies by behavior urgency)
 */

import { diag } from '../../../services/diagnostic-logger.js';
import type { ContextInjection } from '../types.js';

// Deep Human System imports (statically loaded)
import { buildDeepHumanContext } from '../../../intelligence/context-builders/personas/deep-human-orchestrator.js';
import { buildSecretModeContext } from '../../../intelligence/context-builders/personas/secret-mode-detector.js';
import { buildEnergyMatcherContext } from '../../../intelligence/context-builders/emotional/energy-matcher.js';
import { buildSpeechNaturalizerContext } from '../../../intelligence/context-builders/humanization/speech-naturalizer.js';
import { buildLaughterContagionContext } from '../../../intelligence/context-builders/emotional/laughter-contagion.js';

// Personality A/B Testing
import {
  getVariant,
} from '../../../personas/shared/personality-ab-testing.js';

import type {
  DeepHumanInjectionContext,
  DeepHumanInjectionResult,
  EmotionalJourneyContext,
  EmotionalJourneyResult,
} from './types.js';

// ============================================================================
// DEEP HUMAN SYSTEM INJECTION BUILDER
// Priority: 50-70 (varies by behavior urgency)
// ============================================================================

/**
 * Build Deep Human System injections
 *
 * These run in sequence because they build on each other:
 * - Secret mode affects tone/pacing for energy matching
 * - Energy level affects how deep human behaviors are expressed
 * - Speech naturalizer adds SSML-based naturalness
 * - Laughter contagion is event-triggered (on detected humor)
 */
export async function buildDeepHumanInjections(
  ctx: DeepHumanInjectionContext
): Promise<DeepHumanInjectionResult> {
  const {
    sessionId,
    userId,
    userText,
    persona,
    turnCount,
    detectedEmotion,
    emotionIntensity,
    analysis,
    userProfile,
  } = ctx;

  const injections: ContextInjection[] = [];
  let activeSecretMode: string | undefined;
  let detectedEnergy: DeepHumanInjectionResult['detectedEnergy'];
  let speechNaturalizerApplied = false;
  let laughterTriggered = false;

  // Check A/B testing variant for personality features
  const PERSONALITY_EXPERIMENT_ID = 'personality_v2';
  const experimentVariant = getVariant(userId, PERSONALITY_EXPERIMENT_ID, persona.id);

  if (experimentVariant === 'control') {
    diag.debug('A/B Testing: User in control group, skipping personality injections', {
      userId,
      experimentId: PERSONALITY_EXPERIMENT_ID,
    });
    return {
      injections: [],
      activeSecretMode: undefined,
      detectedEnergy: undefined,
      speechNaturalizerApplied: false,
      laughterTriggered: false,
    };
  }

  // Build context input for the Deep Human builders
  const builderInput = {
    userText,
    persona,
    services: {
      userId,
      sessionId,
      sessionStartTime: Date.now(),
      userProfile: null,
    },
    userData: {
      turnCount,
      userName: userProfile?.name,
      sessionCount: userProfile?.sessionCount,
    },
    userProfile: null,
    analysis: {
      emotion: {
        primary: detectedEmotion || 'neutral',
        intensity: emotionIntensity || 0.5,
      },
      intent: analysis?.intent || { primary: 'general', confidence: 0.5 },
      topics: analysis?.topics || { detected: [], primary: null },
      state: analysis?.state || {
        phase: 'exploring',
        trustLevel: 0.5,
        engagementLevel: 0.5,
      },
    },
  };

  try {
    // 1. SECRET MODE DETECTOR
    try {
      const secretModeInjections = await buildSecretModeContext(builderInput);
      for (const injection of secretModeInjections) {
        if (injection.content?.includes('SECRET_MODE:')) {
          const modeMatch = injection.content.match(/SECRET_MODE:\s*(\w+)/);
          if (modeMatch) {
            activeSecretMode = modeMatch[1];
          }
        }
        injections.push({
          category: 'secret_mode',
          content: injection.content,
          priority:
            injection.priority === 'critical' ? 85 : injection.priority === 'high' ? 70 : 55,
        });
      }
    } catch (error) {
      diag.debug('Secret mode detection failed (non-fatal)', { error: String(error) });
    }

    // 2. ENERGY MATCHER
    try {
      const energyInjections = await buildEnergyMatcherContext(builderInput);
      for (const injection of energyInjections) {
        if (injection.content?.includes('ENERGY:')) {
          const energyMatch = injection.content.match(/ENERGY:\s*(\w+)/);
          if (energyMatch) {
            detectedEnergy = energyMatch[1] as DeepHumanInjectionResult['detectedEnergy'];
          }
        }
        injections.push({
          category: 'energy_matching',
          content: injection.content,
          priority:
            injection.priority === 'critical' ? 80 : injection.priority === 'high' ? 65 : 50,
        });
      }
    } catch (error) {
      diag.debug('Energy matching failed (non-fatal)', { error: String(error) });
    }

    // 3. DEEP HUMAN ORCHESTRATOR
    try {
      const deepHumanInjections = await buildDeepHumanContext(builderInput);
      for (const injection of deepHumanInjections) {
        injections.push({
          category: 'deep_human',
          content: injection.content,
          priority:
            injection.priority === 'critical' ? 75 : injection.priority === 'high' ? 60 : 45,
        });
      }
    } catch (error) {
      diag.debug('Deep human orchestrator failed (non-fatal)', { error: String(error) });
    }

    // 4. SPEECH NATURALIZER
    try {
      const speechInjections = await buildSpeechNaturalizerContext(builderInput);
      if (speechInjections.length > 0) {
        speechNaturalizerApplied = true;
        for (const injection of speechInjections) {
          injections.push({
            category: 'speech_naturalizer',
            content: injection.content,
            priority:
              injection.priority === 'critical' ? 70 : injection.priority === 'high' ? 55 : 40,
          });
        }
      }
    } catch (error) {
      diag.debug('Speech naturalizer failed (non-fatal)', { error: String(error) });
    }

    // 5. LAUGHTER CONTAGION
    try {
      const laughterInjections = await buildLaughterContagionContext(builderInput);
      if (laughterInjections.length > 0) {
        laughterTriggered = true;
        for (const injection of laughterInjections) {
          injections.push({
            category: 'laughter_contagion',
            content: injection.content,
            priority:
              injection.priority === 'critical' ? 75 : injection.priority === 'high' ? 60 : 45,
          });
        }
      }
    } catch (error) {
      diag.debug('Laughter contagion failed (non-fatal)', { error: String(error) });
    }

    diag.debug('Deep Human System injections built', {
      sessionId,
      turnCount,
      injectionCount: injections.length,
      activeSecretMode,
      detectedEnergy,
      speechNaturalizerApplied,
      laughterTriggered,
    });
  } catch (error) {
    diag.warn('Deep Human System failed (graceful degradation)', { error: String(error) });
  }

  return {
    injections,
    activeSecretMode,
    detectedEnergy,
    speechNaturalizerApplied,
    laughterTriggered,
  };
}

// ============================================================================
// EMOTIONAL JOURNEY ORCHESTRATOR
// Coordinates all systems for smiles, laughter, vulnerability, and tears
// ============================================================================

/**
 * Build emotional journey injections that coordinate all emotional systems
 *
 * This is the master coordinator that ensures:
 * - Smiles come at warm moments (return visits, recognition)
 * - Laughter comes at light moments (NOT during vulnerability)
 * - Vulnerability is invited when trust exists
 * - Tears are held in safe embrace
 * - Celebration honors effort, not just outcomes
 */
export async function buildEmotionalJourneyInjections(
  ctx: EmotionalJourneyContext
): Promise<EmotionalJourneyResult> {
  const result: EmotionalJourneyResult = {
    injections: [],
    highEmotionMode: false,
    coachingMode: 'exploratory',
    suppressedSystems: [],
    phase: 'exploration',
    momentType: null,
  };

  try {
    const { orchestrateEmotionalJourney, buildEmotionalContext } =
      await import('../../../conversation/emotional-journey-orchestrator.js');

    // Build context
    const emotionalContext = buildEmotionalContext({
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      turnCount: ctx.turnCount,
      sessionCount: ctx.sessionCount,
      relationshipStage: ctx.relationshipStage,
      emotion: ctx.emotion,
      voiceEmotion: ctx.voiceEmotion,
      resistanceDetected: ctx.resistanceDetected,
      vulnerabilityShared: ctx.vulnerabilityShared,
      wasAdviceGiven: ctx.wasAdviceGiven,
      topicsTouched: ctx.topicsTouched,
      isLastTurn: ctx.isLastTurn,
    });

    // Get orchestration decision
    const decision = orchestrateEmotionalJourney(emotionalContext);

    // Transfer results
    result.highEmotionMode = decision.highEmotionMode;
    result.coachingMode = decision.coachingMode;
    result.suppressedSystems = decision.suppressSystems;
    result.phase = decision.phase;
    result.momentType = decision.momentType;

    // Add guidance injection (high priority)
    if (decision.guidance) {
      result.injections.push({
        category: 'emotional_journey',
        content: `[EMOTIONAL JOURNEY - ${decision.phase.toUpperCase()}]\n${decision.guidance}`,
        priority: 60,
      });
    }

    // Add moment-specific injection
    if (decision.momentType) {
      result.injections.push({
        category: 'emotional_moment',
        content: `[MOMENT OPPORTUNITY: ${decision.momentType.replace(/_/g, ' ').toUpperCase()}]`,
        priority: 55,
      });
    }

    diag.debug('🎭 Emotional journey orchestrated', {
      phase: decision.phase,
      momentType: decision.momentType,
      coachingMode: decision.coachingMode,
      highEmotionMode: decision.highEmotionMode,
      activeSystems: decision.activateSystems.length,
      suppressedSystems: decision.suppressSystems.length,
    });
  } catch (error) {
    diag.warn('Emotional journey orchestration failed (non-fatal)', { error: String(error) });
  }

  return result;
}
