/**
 * Turn Personality Integration
 *
 * Handles the "Better Than Human" personality system integration for turns.
 * Extracted from turn-handler.ts for maintainability.
 *
 * NOW ALL PERSONAS get the full "Better Than Human" treatment:
 * - 8-dimensional context sensing
 * - Real-time noticing (pauses, energy shifts, topic deflection)
 * - Cross-session resonance learning
 * - Dynamic expression composition
 *
 * Each persona has unique building blocks (passions, opinions, quirks, vulnerabilities)
 * that make their expressions authentic to their character.
 *
 * Responsibilities:
 * - Cross-turn personality state tracking
 * - Ferni personality processing (original system)
 * - Shared "Better Than Human" personality for ALL other personas
 * - Personality injection building
 *
 * @module voice-agent/turn-personality
 */

import { log } from '@livekit/agents';
import {
  ferniPersonality,
  type PersonalityTurnResult,
} from '../../personas/bundles/ferni/personality-integration.js';
// Legacy shared personality (basic signal detection)
import {
  sharedPersonality as legacySharedPersonality,
  type PersonaTurnResult,
} from '../../personas/shared/persona-turn-personality.js';
// NEW: Full "Better Than Human" shared personality for ALL personas
import {
  sharedPersonality as betterThanHumanPersonality,
  type SharedPersonalityTurnResult,
} from '../../personas/shared/shared-personality-integration.js';
import { hasPersonaBuildingBlocks } from '../../personas/shared/persona-building-blocks.js';
import { cleanupSharedPersonalitySession } from '../../personas/shared/shared-personality-integration.js';
import { diag } from '../../services/diagnostic-logger.js';
import type { ThemeCategory } from '../../services/session-variety-tracker.js';

// ============================================================================
// TYPES
// ============================================================================

export interface PersonalityContext {
  sessionId: string;
  userId: string | null;
  personaId: string;
  turnCount: number;
  userText: string;
  userData: {
    speechRateWPM?: number;
    pauseBeforeMs?: number;
    totalConversations?: number;
    sharedVulnerabilities?: number;
    relationshipStage?: string;
  };
  voiceEmotion?: {
    primary: string;
    confidence: number;
    arousal?: number;
    valence?: number;
  };
  emotionalResult: {
    primary: string;
    intensity: number;
    distressLevel: number;
    trajectory?: string;
  };
  humanizingResult?: {
    mood?: { state?: string; energyLevel?: number };
    relationship?: { stage?: string };
  };
  analysisResult?: {
    intent?: { primary?: string };
    topics?: { detected?: string[] };
    currentTopic?: string;
  };
  injections: Array<{ category: string; content: string; priority?: number }>;
  sessionStateManager?: { getState: () => { conversation: { recentTopics: string[] } } };
}

// Import BehaviorEvent type for proper typing
import type { BehaviorEvent } from '../realtime/behavior-types.js';

export interface PersonalityProcessingResult {
  /** Whether personality injection should be added */
  shouldInject: boolean;
  /** The injection content to add */
  injectionContent: string | undefined;
  /** Behavior event to dispatch (if any) */
  behaviorEvent?: BehaviorEvent;
  /** The full personality result for further processing */
  personalityResult: PersonalityTurnResult | PersonaTurnResult | null;
}

// ============================================================================
// PERSONALITY STATE TRACKING (Cross-turn)
// ============================================================================

/** Track previous personality expressions for resonance learning */
const previousExpressions = new Map<string, { theme: ThemeCategory; content: string }>();

/** Track previous turns for pattern detection (per session) */
interface TurnHistory {
  userTranscript: string;
  speechRate?: number;
  pauseBefore?: number;
  voiceEmotion?: string;
  topics?: string[];
  timestamp: number;
}
const turnHistories = new Map<string, TurnHistory[]>();
const MAX_TURN_HISTORY = 10;

/** Get previous expression for a session */
export function getPreviousExpression(
  sessionId: string
): { theme: ThemeCategory; content: string } | undefined {
  return previousExpressions.get(sessionId);
}

/** Store expression for next turn's resonance learning */
export function storePreviousExpression(
  sessionId: string,
  expression: { theme: ThemeCategory; content: string } | null
): void {
  if (expression) {
    previousExpressions.set(sessionId, expression);
  }
}

/** Record a turn for pattern detection */
export function recordTurnHistory(sessionId: string, turn: Omit<TurnHistory, 'timestamp'>): void {
  let history = turnHistories.get(sessionId) || [];
  history.push({ ...turn, timestamp: Date.now() });

  // Keep only last N turns
  if (history.length > MAX_TURN_HISTORY) {
    history = history.slice(-MAX_TURN_HISTORY);
  }

  turnHistories.set(sessionId, history);
}

/** Get turn history for a session */
export function getTurnHistory(sessionId: string): TurnHistory[] {
  return turnHistories.get(sessionId) || [];
}

/** Clean up session personality state */
export function cleanupPersonalityState(sessionId: string, userId?: string): void {
  previousExpressions.delete(sessionId);
  turnHistories.delete(sessionId);
  ferniPersonality.cleanup(sessionId);
  // Clean up shared "Better Than Human" personality state for all other personas
  cleanupSharedPersonalitySession(sessionId, userId ?? undefined);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Map mood state to conversation momentum
 */
export function mapMoodToMomentum(
  moodState: string | undefined,
  emotionalIntensity: number
): 'opening' | 'cruising' | 'peaking' | 'intimate' | 'closing' | 'stalled' {
  if (!moodState) return 'cruising';

  if (emotionalIntensity > 0.8) return 'peaking';
  if (emotionalIntensity > 0.6) return 'intimate';

  switch (moodState) {
    case 'energized':
    case 'playful':
      return 'cruising';
    case 'reflective':
    case 'philosophical':
    case 'nostalgic':
      return 'intimate';
    case 'grounded':
      return 'cruising';
    case 'tired_but_present':
      return 'closing';
    default:
      return 'cruising';
  }
}

/**
 * Map intent to user sharing type
 */
export function mapIntentToSharing(
  intent: string | undefined
): 'sharing' | 'asking' | 'venting' | 'exploring' | 'celebrating' | 'requesting' | undefined {
  if (!intent) return undefined;

  const intentMap: Record<
    string,
    'sharing' | 'asking' | 'venting' | 'exploring' | 'celebrating' | 'requesting'
  > = {
    confiding: 'sharing',
    venting: 'venting',
    seeking_advice: 'asking',
    exploring: 'exploring',
    celebrating: 'celebrating',
    requesting: 'requesting',
    sharing: 'sharing',
    greeting: 'sharing',
    questioning: 'asking',
  };

  return intentMap[intent.toLowerCase()];
}

/**
 * Build personality injection content from result
 */
export function buildPersonalityInjection(result: PersonalityTurnResult): string | null {
  const parts: string[] = [];

  // Add noticing guidance
  if (result.noticing && result.noticing.shouldAcknowledge) {
    parts.push(`[🔔 BETTER THAN HUMAN - NOTICED]
Type: ${result.noticing.type}
Observation: ${result.noticing.observation}

START YOUR RESPONSE WITH (naturally incorporate):
"${result.noticing.acknowledgment}"

Timing: ${result.noticing.timing} | Subtlety: ${result.noticing.subtlety}`);
  }

  // Add expression guidance
  if (result.expression) {
    const expr = result.expression;
    parts.push(`[🎭 PERSONALITY EXPRESSION]
Theme: ${expr.theme}
Intimacy: ${Math.round(expr.intimacyLevel * 100)}%

${expr.shouldBeSubtle ? 'Weave in subtly' : 'Share naturally'} ${
      result.injectionPoint === 'mid_response'
        ? 'in the middle of your response'
        : result.injectionPoint === 'after_response'
          ? 'at the end of your response'
          : 'at the beginning'
    }:

"${expr.content}"

(This is from ${expr.compositionReason})`);
  }

  if (parts.length === 0) return null;

  return parts.join('\n\n');
}

// ============================================================================
// MAIN PROCESSING FUNCTIONS
// ============================================================================

/**
 * Process Ferni-specific personality
 */
export async function processFerniPersonality(
  ctx: PersonalityContext
): Promise<PersonalityProcessingResult> {
  const logger = log();

  try {
    // Get relationship stage from humanizing result
    const relationshipStage = (ctx.humanizingResult?.relationship?.stage || 'acquaintance') as
      | 'stranger'
      | 'acquaintance'
      | 'friend'
      | 'trusted_advisor';

    // Get momentum from humanizing result
    const momentum = mapMoodToMomentum(
      ctx.humanizingResult?.mood?.state,
      ctx.emotionalResult.intensity
    );

    // Detect if heavy topic
    const isHeavyTopic =
      ctx.emotionalResult.distressLevel > 0.5 ||
      ctx.injections.some(
        (i) =>
          i.content.toLowerCase().includes('grief') ||
          i.content.toLowerCase().includes('crisis') ||
          i.content.toLowerCase().includes('loss')
      );

    // Detect user intent from analysis
    const userIntent = mapIntentToSharing(ctx.analysisResult?.intent?.primary);

    // Get topics from analysis
    const topics = ctx.analysisResult?.topics?.detected || [];

    const personalityResult = await ferniPersonality.processTurn({
      sessionId: ctx.sessionId,
      userId: ctx.userId ?? undefined,
      turnCount: ctx.turnCount,
      userTranscript: ctx.userText,

      // Voice signals
      pauseBeforeMs: ctx.userData.pauseBeforeMs || 0,
      speechRateWPM: ctx.userData.speechRateWPM,
      voiceEmotion: ctx.voiceEmotion,

      // Analysis results
      textEmotion: {
        primary: ctx.emotionalResult.primary,
        intensity: ctx.emotionalResult.intensity,
        distressLevel: ctx.emotionalResult.distressLevel,
        valence: ctx.emotionalResult.intensity > 0.5 ? 'negative' : 'neutral',
        trajectory: ctx.emotionalResult.trajectory as 'rising' | 'falling' | 'stable' | undefined,
      },

      // Conversation state
      momentum,
      topics,
      lastTopic: ctx.sessionStateManager?.getState().conversation.recentTopics[0],

      // Relationship
      relationshipStage,
      totalConversations: ctx.userData.totalConversations || 1,
      sharedVulnerabilities: ctx.userData.sharedVulnerabilities || 0,

      // Previous turns (from this session)
      previousTurns: getTurnHistory(ctx.sessionId),

      // Flags
      isHeavyTopic,
      wasPersonalSharing: ctx.injections.some(
        (i) => i.category === 'memory' || i.content.includes('shared')
      ),
      userIntent,

      // Previous expression for resonance learning
      previousExpression: getPreviousExpression(ctx.sessionId),
    });

    // Build injection content
    let injectionContent: string | null = null;
    if (personalityResult.shouldInject) {
      injectionContent = buildPersonalityInjection(personalityResult);
      if (injectionContent) {
        diag.info('🎭 Better Than Human personality injection', {
          hasNoticing: !!personalityResult.noticing,
          hasExpression: !!personalityResult.expression,
          noticingType: personalityResult.noticing?.type,
          expressionTheme: personalityResult.expression?.theme,
        });
      }
    }

    // Store expression for next turn's resonance learning
    if (personalityResult.expression) {
      storePreviousExpression(ctx.sessionId, {
        theme: personalityResult.expression.theme,
        content: personalityResult.expression.content,
      });
    }

    // Record this turn for pattern detection
    recordTurnHistory(ctx.sessionId, {
      userTranscript: ctx.userText,
      speechRate: ctx.userData.speechRateWPM,
      pauseBefore: ctx.userData.pauseBeforeMs,
      voiceEmotion: ctx.voiceEmotion?.primary,
      topics,
    });

    return {
      shouldInject: personalityResult.shouldInject,
      injectionContent: injectionContent ?? undefined,
      behaviorEvent: personalityResult.behaviorEvent ?? undefined,
      personalityResult,
    };
  } catch (personalityError) {
    logger.debug({ error: String(personalityError) }, 'Ferni personality system (non-critical)');
    return {
      shouldInject: false,
      injectionContent: undefined,
      personalityResult: null,
    };
  }
}

/**
 * Process shared persona personality (Maya, Jordan, Peter, Alex, Nayan)
 *
 * NOW uses the full "Better Than Human" system with:
 * - 8-dimensional context sensing
 * - Real-time noticing (pauses, energy shifts, topic deflection)
 * - Cross-session resonance learning
 * - Dynamic expression composition
 * - Persona-specific building blocks (passions, opinions, quirks, vulnerabilities)
 */
export async function processSharedPersonality(
  ctx: PersonalityContext
): Promise<PersonalityProcessingResult> {
  const logger = log();

  // Check if persona has "Better Than Human" building blocks
  if (hasPersonaBuildingBlocks(ctx.personaId)) {
    return processBetterThanHumanPersonality(ctx);
  }

  // Fallback to legacy shared personality for personas without building blocks
  if (!legacySharedPersonality.hasSupport(ctx.personaId)) {
    return {
      shouldInject: false,
      injectionContent: undefined,
      personalityResult: null,
    };
  }

  try {
    const relationshipStage = ctx.humanizingResult?.relationship?.stage || 'acquaintance';
    const momentum = mapMoodToMomentum(
      ctx.humanizingResult?.mood?.state,
      ctx.emotionalResult.intensity
    );

    const isHeavyTopic =
      ctx.emotionalResult.distressLevel > 0.5 ||
      ctx.injections.some(
        (i) =>
          i.content.toLowerCase().includes('grief') ||
          i.content.toLowerCase().includes('crisis') ||
          i.content.toLowerCase().includes('loss')
      );

    const topics = ctx.analysisResult?.topics?.detected || [];

    const sharedResult = await legacySharedPersonality.processTurn({
      personaId: ctx.personaId,
      sessionId: ctx.sessionId,
      userId: ctx.userId ?? undefined,
      turnCount: ctx.turnCount,
      userTranscript: ctx.userText,

      // Voice signals
      pauseBeforeMs: ctx.userData.pauseBeforeMs || 0,
      speechRateWPM: ctx.userData.speechRateWPM,
      voiceEmotion: ctx.voiceEmotion,

      // Analysis results
      textEmotion: {
        primary: ctx.emotionalResult.primary,
        intensity: ctx.emotionalResult.intensity,
        distressLevel: ctx.emotionalResult.distressLevel,
        valence: ctx.emotionalResult.intensity > 0.5 ? 'negative' : 'neutral',
      },

      // Conversation state
      momentum,
      topics,

      // Relationship
      relationshipStage,
      totalConversations: ctx.userData.totalConversations || 1,

      // Flags
      isHeavyTopic,
      wasPersonalSharing: ctx.injections.some(
        (i) => i.category === 'memory' || i.content.includes('shared')
      ),
    });

    // Build injection content
    let injectionContent: string | null = null;
    if (sharedResult.shouldInject) {
      const content = sharedResult.humanization?.ssml || sharedResult.expression?.ssml || '';
      if (content) {
        injectionContent = `[PERSONALITY] ${content}`;
        diag.info('🎭 Legacy shared persona personality injection', {
          personaId: ctx.personaId,
          hasHumanization: !!sharedResult.humanization,
          humanizationType: sharedResult.humanization?.type,
          hasExpression: !!sharedResult.expression,
        });
      }
    }

    return {
      shouldInject: sharedResult.shouldInject,
      injectionContent: injectionContent ?? undefined,
      personalityResult: sharedResult,
    };
  } catch (personalityError) {
    logger.debug({ error: String(personalityError) }, 'Legacy shared personality system (non-critical)');
    return {
      shouldInject: false,
      injectionContent: undefined,
      personalityResult: null,
    };
  }
}

/**
 * Process "Better Than Human" personality for any persona (Maya, Peter, Alex, Jordan, Nayan)
 *
 * Full superhuman personality system with:
 * - 8-dimensional context sensing
 * - Real-time noticing
 * - Cross-session resonance learning
 * - Dynamic expression composition
 */
async function processBetterThanHumanPersonality(
  ctx: PersonalityContext
): Promise<PersonalityProcessingResult> {
  const logger = log();

  try {
    const relationshipStage = ctx.humanizingResult?.relationship?.stage || 'acquaintance';
    const momentum = mapMoodToMomentum(
      ctx.humanizingResult?.mood?.state,
      ctx.emotionalResult.intensity
    );

    const topics = ctx.analysisResult?.topics?.detected || [];
    const lastTopics = ctx.sessionStateManager?.getState().conversation.recentTopics;

    const bthResult = await betterThanHumanPersonality.processTurn({
      personaId: ctx.personaId,
      sessionId: ctx.sessionId,
      userId: ctx.userId ?? undefined,
      turnCount: ctx.turnCount,
      userTranscript: ctx.userText,

      // Voice signals
      pauseBeforeMs: ctx.userData.pauseBeforeMs || 0,
      speechRateWPM: ctx.userData.speechRateWPM,
      voiceEmotion: ctx.voiceEmotion,

      // Analysis results
      textEmotion: {
        primary: ctx.emotionalResult.primary,
        intensity: ctx.emotionalResult.intensity,
        distressLevel: ctx.emotionalResult.distressLevel,
      },

      // Conversation state
      conversationMomentum: momentum,
      currentTopics: topics,
      lastTopics,

      // Relationship
      relationshipStage,
      totalConversations: ctx.userData.totalConversations || 1,
      sharedVulnerabilities: ctx.userData.sharedVulnerabilities || 0,

      // Previous turns for pattern detection
      previousTurns: getTurnHistory(ctx.sessionId),

      // Previous expression for resonance learning
      previousExpression: getPreviousExpression(ctx.sessionId),
    });

    // Build injection content
    let injectionContent: string | null = null;
    if (bthResult.shouldInject && bthResult.injectionContent) {
      injectionContent = bthResult.injectionContent;

      // If we have a noticing result, format it nicely
      if (bthResult.noticing) {
        diag.info('🔍 Better Than Human NOTICING for shared persona', {
          personaId: ctx.personaId,
          noticingType: bthResult.noticing.type,
          confidence: bthResult.noticing.confidence,
        });
      }

      // If we have an expression result
      if (bthResult.expression) {
        diag.info('🎭 Better Than Human EXPRESSION for shared persona', {
          personaId: ctx.personaId,
          theme: bthResult.expression.theme,
          intimacy: bthResult.expression.intimacyLevel,
          timing: bthResult.expression.timing,
        });

        // Store expression for resonance learning
        storePreviousExpression(ctx.sessionId, {
          theme: bthResult.expression.theme,
          content: bthResult.expression.content,
        });
      }
    }

    // Record this turn for pattern detection
    recordTurnHistory(ctx.sessionId, {
      userTranscript: ctx.userText,
      speechRate: ctx.userData.speechRateWPM,
      pauseBefore: ctx.userData.pauseBeforeMs,
      voiceEmotion: ctx.voiceEmotion?.primary,
      topics,
    });

    // Map the result to PersonalityProcessingResult
    return {
      shouldInject: bthResult.shouldInject,
      injectionContent: injectionContent ?? undefined,
      personalityResult: bthResult as unknown as PersonaTurnResult,
    };
  } catch (personalityError) {
    logger.debug({ error: String(personalityError) }, 'Better Than Human shared personality (non-critical)');
    return {
      shouldInject: false,
      injectionContent: undefined,
      personalityResult: null,
    };
  }
}

/**
 * Process personality for any persona (routes to Ferni or shared)
 */
export async function processPersonality(
  ctx: PersonalityContext
): Promise<PersonalityProcessingResult> {
  if (ctx.personaId === 'ferni') {
    return processFerniPersonality(ctx);
  }
  return processSharedPersonality(ctx);
}
