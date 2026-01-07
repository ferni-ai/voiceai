/**
 * Advanced Humanization Voice Agent Integration
 *
 * > "Better than human" - The 10 capabilities that make it real
 *
 * This module integrates the advanced humanization orchestrator into the
 * voice agent pipeline. It provides:
 *
 * 1. Session lifecycle hooks
 * 2. Turn processing with comprehensive guidance
 * 3. Response modification based on detected signals
 * 4. Persistence for cross-session features
 *
 * @module @ferni/advanced-humanization-integration
 */

import { createLogger } from '../utils/safe-logger.js';
import {
  getAdvancedHumanization,
  resetAdvancedHumanization,
  type AdvancedHumanizationContext,
  type AdvancedHumanizationResult,
  type SessionStartResult,
} from './advanced-humanization.js';

const logger = createLogger({ module: 'AdvancedHumanizationIntegration' });

// ============================================================================
// TYPES
// ============================================================================

export interface AdvancedHumanizationSessionConfig {
  sessionId: string;
  userId: string;
  relationshipDepth?: 'new' | 'developing' | 'established' | 'deep';
  prosodyHints?: {
    speechRate?: number;
    volume?: number;
    pitchVariance?: number;
  };
}

export interface TurnGuidance {
  /** Priority actions to address (most important first) */
  priorityActions: string[];

  /** Should we stop giving direct advice? */
  stopDirectAdvice: boolean;

  /** Tone guidance for response */
  toneGuidance: string;

  /** Length guidance */
  lengthGuidance: 'shorter' | 'normal' | 'longer';

  /** Subtext to address (if any) */
  subtext?: {
    type: string;
    probe: string | null;
  };

  /** Repair needed (if any) */
  repair?: {
    phrase: string;
    followUp?: string;
  };

  /** Affirmation to include (if any) */
  affirmation?: {
    phrase: string;
    placement: 'prefix' | 'inline' | 'suffix';
  };

  /** Hope injection (if appropriate) */
  hope?: {
    phrase: string;
    type: string;
  };

  /** Curiosity prompt (if appropriate) */
  curiosityPrompt?: string;

  /** Milestone to acknowledge (if any) */
  milestone?: string;

  /** Aftercare guidance (if needed) */
  aftercare?: {
    phase: string;
    checkIn?: string;
    grounding?: string;
    pacing: string;
  };

  /** Energy regulation guidance */
  energyGuidance?: {
    strategy: string;
    pace: string;
    intensity: string;
  };

  /** Paradoxical intervention (if appropriate) */
  paradoxicalPhrase?: string;
}

export interface ResponseModification {
  /** Prefix to add to response */
  prefix?: string;

  /** Suffix to add to response */
  suffix?: string;

  /** System prompt additions */
  systemPromptAdditions: string[];

  /** SSML modifications */
  ssmlHints?: {
    pace?: 'slow' | 'normal' | 'fast';
    emphasis?: string[];
    pauses?: Array<{ after: string; duration: number }>;
  };
}

// ============================================================================
// SESSION STATE
// ============================================================================

interface SessionState {
  config: AdvancedHumanizationSessionConfig;
  startTime: Date;
  turnCount: number;
  lastResult: AdvancedHumanizationResult | null;
  wasAdviceGiven: boolean;
  recentTopics: string[];
}

const sessions = new Map<string, SessionState>();

// ============================================================================
// SESSION LIFECYCLE
// ============================================================================

/**
 * Initialize advanced humanization for a session
 */
export function initAdvancedHumanization(
  config: AdvancedHumanizationSessionConfig
): SessionStartResult {
  const { sessionId, userId } = config;

  // Create session state
  const state: SessionState = {
    config,
    startTime: new Date(),
    turnCount: 0,
    lastResult: null,
    wasAdviceGiven: false,
    recentTopics: [],
  };
  sessions.set(sessionId, state);

  // Initialize orchestrator and get session start result
  const humanizer = getAdvancedHumanization(sessionId, userId);
  const result = humanizer.startSession();

  logger.info(
    {
      sessionId,
      userId,
      greeting: !!result.greeting,
      milestone: !!result.milestoneAcknowledgment,
    },
    '🌟 Advanced humanization initialized'
  );

  return result;
}

/**
 * Clean up advanced humanization for a session
 */
export function cleanupAdvancedHumanization(sessionId: string): void {
  const state = sessions.get(sessionId);
  if (!state) return;

  resetAdvancedHumanization(sessionId, state.config.userId);
  sessions.delete(sessionId);

  logger.info({ sessionId }, '🧹 Advanced humanization cleaned up');
}

// ============================================================================
// TURN PROCESSING
// ============================================================================

/**
 * Process a user turn and get comprehensive guidance
 */
export function processAdvancedTurn(
  sessionId: string,
  userMessage: string,
  context?: {
    detectedEmotion?: string;
    valence?: number;
    arousal?: number;
    topic?: string;
    prosodyHints?: {
      speechRate?: number;
      volume?: number;
      pitchVariance?: number;
    };
  }
): TurnGuidance | null {
  const state = sessions.get(sessionId);
  if (!state) {
    logger.warn({ sessionId }, 'Cannot process turn - session not initialized');
    return null;
  }

  state.turnCount++;

  // Update topics
  if (context?.topic) {
    state.recentTopics.unshift(context.topic);
    if (state.recentTopics.length > 5) {
      state.recentTopics.pop();
    }
  }

  // Build context
  const turnContext: AdvancedHumanizationContext = {
    userMessage,
    turnCount: state.turnCount,
    sessionId,
    userId: state.config.userId,
    detectedEmotion: context?.detectedEmotion,
    valence: context?.valence,
    arousal: context?.arousal,
    wasAdviceGiven: state.wasAdviceGiven,
    recentTopics: state.recentTopics,
    relationshipDepth: state.config.relationshipDepth,
    prosodyHints: context?.prosodyHints || state.config.prosodyHints,
  };

  // Process turn
  const humanizer = getAdvancedHumanization(sessionId, state.config.userId);
  const result = humanizer.processTurn(turnContext);

  // Store result for later use
  state.lastResult = result;
  state.wasAdviceGiven = false; // Reset - will be set when advice is given

  // Build turn guidance
  const guidance: TurnGuidance = {
    priorityActions: result.priorityActions,
    stopDirectAdvice: result.stopDirectAdvice,
    toneGuidance: result.toneGuidance,
    lengthGuidance: result.lengthGuidance,
  };

  // Add subtext if detected
  if (result.subtext.shouldAct && result.subtext.gentleProbe) {
    guidance.subtext = {
      type: result.subtext.type,
      probe: result.subtext.gentleProbe ?? undefined,
    };
  }

  // Add repair if needed
  if (result.repair.shouldRepair && result.repair.strategy) {
    guidance.repair = {
      phrase: result.repair.strategy.phrase,
      followUp: result.repair.strategy.followUp ?? undefined,
    };
  }

  // Add affirmation if appropriate
  if (result.affirmation.shouldAffirm && result.affirmation.affirmation) {
    const { placement } = result.affirmation.affirmation;
    // Map standalone to suffix for our simpler interface
    const mappedPlacement =
      placement === 'standalone'
        ? ('suffix' as const)
        : (placement as 'prefix' | 'inline' | 'suffix');
    guidance.affirmation = {
      phrase: result.affirmation.affirmation.phrase,
      placement: mappedPlacement,
    };
  }

  // Add hope injection if appropriate
  if (result.hope.shouldInject && result.hope.injection) {
    guidance.hope = {
      phrase: result.hope.injection.phrase,
      type: result.hope.injection.type,
    };
  }

  // Add curiosity prompt if available
  if (result.curiosityPrompt) {
    guidance.curiosityPrompt = result.curiosityPrompt.question;
  }

  // Add milestone if appropriate
  if (result.milestone) {
    guidance.milestone = result.milestone.phrase;
  }

  // Add aftercare if needed
  if (result.aftercare.guidance.priority !== 'none') {
    guidance.aftercare = {
      phase: result.aftercare.state.phase,
      checkIn: result.aftercare.guidance.checkInQuestion ?? undefined,
      grounding: result.aftercare.guidance.groundingPrompt ?? undefined,
      pacing: result.aftercare.guidance.pacingGuidance,
    };
  }

  // Add energy guidance
  guidance.energyGuidance = {
    strategy: result.energyGuidance.strategy,
    pace: result.energyGuidance.responseGuidance.pace,
    intensity: result.energyGuidance.responseGuidance.intensity,
  };

  // Add paradoxical phrase if appropriate
  if (result.paradoxical.shouldIntervene && result.paradoxical.phrase) {
    guidance.paradoxicalPhrase = result.paradoxical.phrase;
  }

  logger.debug(
    {
      sessionId,
      turn: state.turnCount,
      priorityCount: guidance.priorityActions.length,
      stopAdvice: guidance.stopDirectAdvice,
      hasSubtext: !!guidance.subtext,
      hasRepair: !!guidance.repair,
    },
    '🎯 Advanced turn processed'
  );

  return guidance;
}

/**
 * Get response modifications based on last turn's guidance
 */
export function getResponseModifications(sessionId: string): ResponseModification | null {
  const state = sessions.get(sessionId);
  if (!state || !state.lastResult) {
    return null;
  }

  const result = state.lastResult;
  const modifications: ResponseModification = {
    systemPromptAdditions: [],
  };

  // Build system prompt additions from priority actions
  if (result.priorityActions.length > 0) {
    modifications.systemPromptAdditions.push(
      `[PRIORITY GUIDANCE]\n${result.priorityActions.map((a, i) => `${i + 1}. ${a}`).join('\n')}`
    );
  }

  // Add tone guidance
  modifications.systemPromptAdditions.push(`[TONE] ${result.toneGuidance}`);

  // Add length guidance (but never strip warmth - that's core to Ferni)
  const lengthMap = {
    shorter: 'Be thoughtful with length, but stay warm and present. 2-4 sentences is fine.',
    normal: 'Use a natural conversational length. Stay warm and engaged.',
    longer: 'You can elaborate more. User is engaged. Share and connect.',
  };
  modifications.systemPromptAdditions.push(`[LENGTH] ${lengthMap[result.lengthGuidance]}`);

  // Add energy guidance
  const energy = result.energyGuidance.responseGuidance;
  modifications.systemPromptAdditions.push(
    `[ENERGY] Strategy: ${result.energyGuidance.strategy}. Pace: ${energy.pace}. Intensity: ${energy.intensity}.`
  );

  // Add stop advice warning if needed
  if (result.stopDirectAdvice) {
    modifications.systemPromptAdditions.push(
      `[⚠️ STOP DIRECT ADVICE] User is showing resistance. Switch to:\n- Curious questions\n- Validation\n- Paradoxical approaches${result.paradoxical.phrase ? `\n- Consider: "${result.paradoxical.phrase}"` : ''}`
    );
  }

  // Add prefix for repair
  if (result.repair.shouldRepair && result.repair.strategy) {
    modifications.prefix = result.repair.strategy.phrase;
    if (result.repair.strategy.followUp) {
      modifications.prefix += ` ${result.repair.strategy.followUp}`;
    }
  }

  // Add affirmation
  if (result.affirmation.shouldAffirm && result.affirmation.affirmation) {
    const aff = result.affirmation.affirmation;
    if (aff.placement === 'prefix') {
      modifications.prefix = aff.phrase + (modifications.prefix ? ` ${modifications.prefix}` : '');
    } else if (aff.placement === 'suffix') {
      modifications.suffix = aff.phrase;
    }
  }

  // Add hope injection
  if (result.hope.shouldInject && result.hope.injection) {
    modifications.systemPromptAdditions.push(
      `[HOPE] Subtly include forward-looking language: "${result.hope.injection.phrase}"`
    );
  }

  // Add subtext guidance
  if (result.subtext.shouldAct) {
    modifications.systemPromptAdditions.push(
      `[SUBTEXT DETECTED: ${result.subtext.type}]\nInferred: ${result.subtext.inferredMeaning}\n${result.subtext.gentleProbe ? `Consider gently: "${result.subtext.gentleProbe}"` : ''}`
    );
  }

  // Add aftercare guidance
  if (result.aftercare.guidance.priority !== 'none') {
    const ac = result.aftercare.guidance;
    const aftercareText = [
      `[EMOTIONAL AFTERCARE: ${result.aftercare.state.phase}]`,
      ac.toneGuidance ? `Tone: ${ac.toneGuidance}` : null,
      ac.pacingGuidance ? `Pacing: ${ac.pacingGuidance}` : null,
      ac.groundingPrompt ? `Grounding: "${ac.groundingPrompt}"` : null,
      ac.checkInQuestion ? `Check-in: "${ac.checkInQuestion}"` : null,
    ]
      .filter(Boolean)
      .join('\n');
    modifications.systemPromptAdditions.push(aftercareText);
  }

  // Add milestone acknowledgment
  if (result.milestone) {
    modifications.prefix = result.milestone.phrase + (modifications.prefix ? ' ' : '');
  }

  // Add SSML hints for energy matching
  modifications.ssmlHints = {
    pace:
      energy.pace === 'slower' ? 'slow' : energy.pace === 'faster' ? 'fast' : ('normal' as const),
  };

  return modifications;
}

/**
 * Record that advice was given (for resistance tracking)
 */
export function recordAdviceGiven(sessionId: string): void {
  const state = sessions.get(sessionId);
  if (!state) return;

  state.wasAdviceGiven = true;

  const humanizer = getAdvancedHumanization(sessionId, state.config.userId);
  humanizer.recordAdviceGiven('advice');
}

/**
 * Record agent response (for repair detection)
 *
 * This flows to two systems:
 * 1. Advanced humanization repair engine (existing)
 * 2. Deep understanding repair intelligence (new - superhuman understanding)
 */
export function recordAgentResponse(sessionId: string, response: string): void {
  const state = sessions.get(sessionId);
  if (!state) return;

  const humanizer = getAdvancedHumanization(sessionId, state.config.userId);
  humanizer.recordAgentResponse(response);

  // Also record to deep understanding for new repair intelligence
  import('../intelligence/context-builders/intelligence/deep-understanding.js')
    .then(({ recordResponse }) => {
      recordResponse(sessionId, response);
    })
    .catch((err) => {
      // Non-critical - don't block on this, but log for debugging
      logger.debug(
        { error: String(err), sessionId },
        'Failed to record response to deep understanding'
      );
    });
}

// ============================================================================
// SPECIAL EVENTS
// ============================================================================

/**
 * Record a relationship milestone
 */
export function recordMilestone(
  sessionId: string,
  type: 'vulnerability' | 'breakthrough' | 'inside_joke',
  context?: string
): void {
  const state = sessions.get(sessionId);
  if (!state) return;

  const humanizer = getAdvancedHumanization(sessionId, state.config.userId);
  humanizer.recordMilestone(type, context);
}

/**
 * Add a shared memory (inside joke, phrase)
 */
export function addSharedMemory(
  sessionId: string,
  content: string,
  category: 'joke' | 'phrase' | 'reference'
): void {
  const state = sessions.get(sessionId);
  if (!state) return;

  const humanizer = getAdvancedHumanization(sessionId, state.config.userId);
  humanizer.addSharedMemory(content, category);
}

/**
 * Add a significant date to remember
 */
export function addSignificantDate(sessionId: string, date: Date, description: string): void {
  const state = sessions.get(sessionId);
  if (!state) return;

  const humanizer = getAdvancedHumanization(sessionId, state.config.userId);
  humanizer.addSignificantDate(date, description);
}

// ============================================================================
// CLOSING
// ============================================================================

/**
 * Get closing guidance for end of conversation
 */
export function getClosingGuidance(sessionId: string): {
  phrase: string;
  aftercareNeeded: boolean;
  checkIn: string | null;
} | null {
  const state = sessions.get(sessionId);
  if (!state) return null;

  const humanizer = getAdvancedHumanization(sessionId, state.config.userId);
  const closing = humanizer.getClosing();
  return {
    phrase: closing.phrase,
    aftercareNeeded: closing.aftercareNeeded,
    checkIn: closing.checkInQuestion,
  };
}

// ============================================================================
// STATE ACCESS
// ============================================================================

/**
 * Get current session state for debugging
 */
export function getAdvancedHumanizationState(sessionId: string): {
  turnCount: number;
  lastGuidance: TurnGuidance | null;
  orchestratorState: ReturnType<ReturnType<typeof getAdvancedHumanization>['getState']>;
} | null {
  const state = sessions.get(sessionId);
  if (!state) return null;

  const humanizer = getAdvancedHumanization(sessionId, state.config.userId);

  // Convert last result to guidance format
  let lastGuidance: TurnGuidance | null = null;
  if (state.lastResult) {
    lastGuidance = {
      priorityActions: state.lastResult.priorityActions,
      stopDirectAdvice: state.lastResult.stopDirectAdvice,
      toneGuidance: state.lastResult.toneGuidance,
      lengthGuidance: state.lastResult.lengthGuidance,
    };
  }

  return {
    turnCount: state.turnCount,
    lastGuidance,
    orchestratorState: humanizer.getState(),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  type AdvancedHumanizationContext,
  type AdvancedHumanizationResult,
  type SessionStartResult,
};
