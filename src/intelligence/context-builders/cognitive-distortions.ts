/**
 * Cognitive Distortions Context Builder
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Integrates the Cognitive Intelligence system into the voice agent's
 * context pipeline. Detects cognitive distortions in real-time and
 * provides guidance for gentle Socratic intervention.
 *
 * This builder surfaces:
 * - Detected cognitive distortions with confidence scores
 * - Recommended response approach (validate, Socratic, gentle name, etc.)
 * - Suggested questions and reframes
 * - Pattern information (is this recurring?)
 *
 * PHILOSOPHY:
 * A great coach notices when someone is stuck in a thinking trap—
 * not to lecture, but to invite curiosity. The goal is never to
 * dismiss feelings. It's to question thoughts that may not be serving them.
 *
 * @module ContextBuilders/CognitiveDistortions
 */

import {
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
  createHintInjection,
  createStandardInjection,
} from './index.js';

import {
  buildCognitiveIntelligenceContext,
  type CognitiveIntelligenceResult,
} from '../../services/cognitive-intelligence/index.js';

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CognitiveDistortionsBuilder' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Minimum confidence to inject into context */
const CONTEXT_INJECTION_THRESHOLD = 0.65;

/** Maximum distortion injections per turn */
const MAX_INJECTIONS_PER_TURN = 2;

// Track recent cognitive work per user to avoid over-challenging
const recentCognitiveWork = new Map<string, {
  lastTurn: number;
  reframeCount: number;
  questionsAsked: string[];
}>();

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build cognitive distortion awareness context for the current turn.
 */
async function buildCognitiveDistortionsContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const { userText, services, userData, analysis, userProfile } = input;
  const userId = services?.userId;

  // Skip if no user identification
  if (!userId || !userText) {
    return [];
  }

  const injections: ContextInjection[] = [];
  const turnCount = userData?.turnCount || 0;

  // Get or create tracking state
  let trackingState = recentCognitiveWork.get(userId);
  if (!trackingState || turnCount - trackingState.lastTurn > 10) {
    // Reset if more than 10 turns since last cognitive work
    trackingState = {
      lastTurn: turnCount,
      reframeCount: 0,
      questionsAsked: [],
    };
    recentCognitiveWork.set(userId, trackingState);
  }

  // Determine relationship stage
  let relationshipStage: 'new' | 'building' | 'established' | 'deep' = 'new';
  if (userProfile) {
    const convos = userProfile.totalConversations || 0;
    if (convos >= 50) relationshipStage = 'deep';
    else if (convos >= 20) relationshipStage = 'established';
    else if (convos >= 5) relationshipStage = 'building';
  }

  // Build cognitive intelligence context
  const cognitiveResult = buildCognitiveIntelligenceContext(
    userId,
    userText,
    {
      topic: analysis?.topics?.primary || undefined,
      emotion: analysis?.emotion?.primary,
      emotionIntensity: analysis?.emotion?.intensity,
      relationshipStage,
      recentReframes: trackingState.reframeCount,
      questionsAsked: trackingState.questionsAsked,
    }
  );

  // If no distortion detected, return empty
  if (!cognitiveResult.hasDistortion || !cognitiveResult.contextInjection) {
    return [];
  }

  // Check if confidence is high enough
  const primary = cognitiveResult.primary;
  if (!primary || primary.confidence < CONTEXT_INJECTION_THRESHOLD) {
    return [];
  }

  // Create the injection
  const injection = formatCognitiveInjection(cognitiveResult, turnCount);
  if (injection) {
    injections.push(injection);

    // Update tracking state
    trackingState.lastTurn = turnCount;
    if (cognitiveResult.response?.approach === 'socratic' || 
        cognitiveResult.response?.approach === 'gentle_name') {
      trackingState.reframeCount++;
      if (cognitiveResult.dialogue?.question) {
        trackingState.questionsAsked.push(cognitiveResult.dialogue.question);
        // Keep only last 10 questions
        if (trackingState.questionsAsked.length > 10) {
          trackingState.questionsAsked.shift();
        }
      }
    }
    recentCognitiveWork.set(userId, trackingState);

    log.debug(
      {
        userId,
        distortionType: primary.type,
        confidence: primary.confidence,
        approach: cognitiveResult.response?.approach,
        isRecurring: primary.isRecurring,
        patternCount: primary.patternCount,
      },
      '🧠 Cognitive distortion context injected'
    );
  }

  return injections;
}

/**
 * Format the cognitive result into a context injection.
 */
function formatCognitiveInjection(
  result: CognitiveIntelligenceResult,
  turnCount: number
): ContextInjection | null {
  if (!result.contextInjection || !result.primary) {
    return null;
  }

  const { primary, response, dialogue, contextInjection } = result;

  // Use standard injection for high-confidence detections
  // Use hint injection for lower confidence
  if (primary.confidence >= 0.8) {
    return createStandardInjection(
      'cognitive_distortion',
      contextInjection.llmContext
    );
  } else {
    return createHintInjection(
      'cognitive_distortion',
      contextInjection.llmContext,
      { category: 'cognitive' }
    );
  }
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'cognitive-distortions',
  priority: 85, // High priority, but after emotional crisis detection
  description: 'Detect cognitive distortions and guide gentle Socratic intervention',
  build: buildCognitiveDistortionsContext,
});

// ============================================================================
// EXPORTS
// ============================================================================

export { buildCognitiveDistortionsContext };

export default {
  buildCognitiveDistortionsContext,
};

