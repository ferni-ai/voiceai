/**
 * Cognitive Handoff Integration
 *
 * Captures and transfers cognitive insights during persona handoffs.
 * When a user moves from one persona to another, we transfer:
 * - What cognitive approaches worked
 * - What the user's thinking style seems to be
 * - What topics need special attention
 * - Cognitive blind spots the next persona should watch for
 */

import { getLogger } from '../../utils/safe-logger.js';
import type {
  ReasoningStyle,
  CognitiveProfile,
  CognitiveContext,
} from '../../personas/cognitive-types.js';
import { getCognitiveProfile } from '../../personas/cognitive-profiles.js';
import { getCognitiveEngine } from '../../personas/cognitive-intelligence.js';

// ============================================================================
// TYPES
// ============================================================================

export interface CognitiveHandoffContext {
  /** What the previous persona noticed/focused on */
  noticed: string[];

  /** Potential blind spots the previous persona might have missed */
  potentialBlindSpots: string[];

  /** Detected user cognitive style */
  userCognitiveStyle?: ReasoningStyle;

  /** Confidence in user style detection */
  userStyleConfidence: number;

  /** Approaches that seemed to work well */
  effectiveApproaches: ReasoningStyle[];

  /** Approaches that didn't resonate */
  ineffectiveApproaches: ReasoningStyle[];

  /** Topics where the user showed expertise */
  userExpertiseAreas: string[];

  /** Topics where the user seemed less experienced */
  userNoviceAreas: string[];

  /** Emotional context being carried forward */
  emotionalContext: {
    weight: number;
    primaryEmotion?: string;
    needsValidation: boolean;
  };

  /** Handoff note from the cognitive perspective */
  handoffNote: string;

  /** Previous persona's reasoning style */
  previousPersonaStyle: ReasoningStyle;

  /** Knowledge already explained to user */
  explainedTopics: string[];
}

export interface CognitiveHandoffInput {
  previousPersonaId: string;
  targetPersonaId: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  currentTopic: string;
  emotionalWeight: number;
  userExpertise: 'novice' | 'intermediate' | 'expert' | 'unknown';
}

// ============================================================================
// SESSION TRACKING
// ============================================================================

// Track cognitive state per session
const sessionCognitiveState = new Map<
  string,
  {
    detectedUserStyle?: ReasoningStyle;
    userStyleConfidence: number;
    effectiveApproaches: Map<ReasoningStyle, number>; // approach -> engagement score
    explainedTopics: Set<string>;
    userExpertiseAreas: Set<string>;
    userNoviceAreas: Set<string>;
  }
>();

/**
 * Get or create session cognitive state
 */
function getSessionState(sessionId: string) {
  if (!sessionCognitiveState.has(sessionId)) {
    sessionCognitiveState.set(sessionId, {
      userStyleConfidence: 0,
      effectiveApproaches: new Map(),
      explainedTopics: new Set(),
      userExpertiseAreas: new Set(),
      userNoviceAreas: new Set(),
    });
  }
  return sessionCognitiveState.get(sessionId)!;
}

/**
 * Record that a topic was explained to the user
 */
export function recordTopicExplained(sessionId: string, topic: string): void {
  getSessionState(sessionId).explainedTopics.add(topic);
}

/**
 * Record detected user expertise on a topic
 */
export function recordUserExpertise(
  sessionId: string,
  topic: string,
  level: 'expert' | 'novice'
): void {
  const state = getSessionState(sessionId);
  if (level === 'expert') {
    state.userExpertiseAreas.add(topic);
    state.userNoviceAreas.delete(topic);
  } else {
    state.userNoviceAreas.add(topic);
    state.userExpertiseAreas.delete(topic);
  }
}

/**
 * Record effectiveness of a cognitive approach
 */
export function recordApproachEffectiveness(
  sessionId: string,
  approach: ReasoningStyle,
  engagementScore: number
): void {
  const state = getSessionState(sessionId);
  const current = state.effectiveApproaches.get(approach) || 0;
  // Rolling average
  state.effectiveApproaches.set(approach, (current + engagementScore) / 2);
}

/**
 * Record detected user cognitive style
 */
export function recordUserCognitiveStyle(
  sessionId: string,
  style: ReasoningStyle,
  confidence: number
): void {
  const state = getSessionState(sessionId);
  if (confidence > state.userStyleConfidence) {
    state.detectedUserStyle = style;
    state.userStyleConfidence = confidence;
  }
}

// ============================================================================
// HANDOFF CONTEXT BUILDING
// ============================================================================

/**
 * Build cognitive context for handoff
 */
export function buildCognitiveHandoffContext(
  input: CognitiveHandoffInput,
  sessionId: string
): CognitiveHandoffContext {
  const { previousPersonaId, targetPersonaId, currentTopic, emotionalWeight, userExpertise } =
    input;

  const previousProfile = getCognitiveProfile(previousPersonaId);
  const targetProfile = getCognitiveProfile(targetPersonaId);
  const sessionState = getSessionState(sessionId);

  // Get what the previous persona would have noticed
  const noticed = previousProfile
    ? previousProfile.attention.primaryFocus.map((f) => `${f}: focused`)
    : [];

  // Get blind spots the target persona should watch
  const potentialBlindSpots = previousProfile
    ? previousProfile.attention.blindSpots.map((b) => `Previous persona may have missed: ${b}`)
    : [];

  // Calculate effective/ineffective approaches
  const effectiveApproaches: ReasoningStyle[] = [];
  const ineffectiveApproaches: ReasoningStyle[] = [];

  for (const [approach, score] of sessionState.effectiveApproaches.entries()) {
    if (score >= 0.6) {
      effectiveApproaches.push(approach);
    } else if (score < 0.4) {
      ineffectiveApproaches.push(approach);
    }
  }

  // Build handoff note
  const handoffNote = buildHandoffNote(
    previousProfile,
    targetProfile,
    sessionState,
    currentTopic,
    emotionalWeight
  );

  return {
    noticed,
    potentialBlindSpots,
    userCognitiveStyle: sessionState.detectedUserStyle,
    userStyleConfidence: sessionState.userStyleConfidence,
    effectiveApproaches,
    ineffectiveApproaches,
    userExpertiseAreas: Array.from(sessionState.userExpertiseAreas),
    userNoviceAreas: Array.from(sessionState.userNoviceAreas),
    emotionalContext: {
      weight: emotionalWeight,
      needsValidation: emotionalWeight > 0.6,
    },
    handoffNote,
    previousPersonaStyle: previousProfile?.reasoningStyle || 'narrative',
    explainedTopics: Array.from(sessionState.explainedTopics),
  };
}

/**
 * Build a natural-language handoff note from cognitive perspective
 */
function buildHandoffNote(
  previousProfile: CognitiveProfile | undefined,
  targetProfile: CognitiveProfile | undefined,
  sessionState: ReturnType<typeof getSessionState>,
  currentTopic: string,
  emotionalWeight: number
): string {
  const notes: string[] = [];

  // Note about user's thinking style
  if (sessionState.detectedUserStyle && sessionState.userStyleConfidence > 0.5) {
    notes.push(
      `User seems to think ${sessionState.detectedUserStyle}ly - adapt your approach accordingly.`
    );
  }

  // Note about what worked
  const topEffective = Array.from(sessionState.effectiveApproaches.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);

  if (topEffective.length > 0) {
    const approaches = topEffective.map(([a]) => a).join(' and ');
    notes.push(`${approaches} approaches have been resonating with this user.`);
  }

  // Note about emotional context
  if (emotionalWeight > 0.7) {
    notes.push('This conversation has significant emotional weight - lead with empathy.');
  }

  // Note about cognitive transition
  if (previousProfile && targetProfile) {
    if (previousProfile.reasoningStyle !== targetProfile.reasoningStyle) {
      notes.push(
        `Transitioning from ${previousProfile.reasoningStyle} to ${targetProfile.reasoningStyle} thinking. ` +
          `You might pick up on things ${previousProfile.attention.blindSpots.join(', ')} that were overlooked.`
      );
    }
  }

  // Note about explained topics
  if (sessionState.explainedTopics.size > 0) {
    const recentTopics = Array.from(sessionState.explainedTopics).slice(-3);
    notes.push(`Already explained: ${recentTopics.join(', ')} - don't repeat basics.`);
  }

  return notes.join(' ');
}

/**
 * Format cognitive context for injection into handoff instructions
 */
export function formatCognitiveHandoffForPrompt(context: CognitiveHandoffContext): string {
  const sections: string[] = [];

  // User cognitive style
  if (context.userCognitiveStyle && context.userStyleConfidence > 0.5) {
    sections.push(
      `[USER THINKING STYLE] This person thinks ${context.userCognitiveStyle}ly ` +
        `(confidence: ${Math.round(context.userStyleConfidence * 100)}%). ` +
        `Adapt your communication to match or complement their style.`
    );
  }

  // Effective approaches
  if (context.effectiveApproaches.length > 0) {
    sections.push(
      `[WHAT'S WORKING] These approaches have resonated: ${context.effectiveApproaches.join(', ')}`
    );
  }

  // Ineffective approaches
  if (context.ineffectiveApproaches.length > 0) {
    sections.push(
      `[WHAT'S NOT WORKING] These approaches fell flat: ${context.ineffectiveApproaches.join(', ')}`
    );
  }

  // Blind spots from previous persona
  if (context.potentialBlindSpots.length > 0) {
    sections.push(`[OPPORTUNITY] ${context.potentialBlindSpots.slice(0, 2).join('. ')}`);
  }

  // Emotional context
  if (context.emotionalContext.needsValidation) {
    sections.push(
      `[EMOTIONAL CONTEXT] This conversation carries emotional weight. Acknowledge and validate before problem-solving.`
    );
  }

  // Already explained topics
  if (context.explainedTopics.length > 0) {
    sections.push(
      `[DON'T REPEAT] These topics were already explained: ${context.explainedTopics.join(', ')}`
    );
  }

  // User expertise areas
  if (context.userExpertiseAreas.length > 0) {
    sections.push(
      `[USER EXPERTISE] User shows expertise in: ${context.userExpertiseAreas.join(', ')} - skip basics here.`
    );
  }

  // Handoff note
  if (context.handoffNote) {
    sections.push(`[COGNITIVE HANDOFF NOTE] ${context.handoffNote}`);
  }

  return sections.join('\n\n');
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clear cognitive state for a session
 */
export function clearSessionCognitiveState(sessionId: string): void {
  sessionCognitiveState.delete(sessionId);
  getLogger().debug({ sessionId }, 'Cleared session cognitive state');
}

/**
 * Clear all session cognitive states (for testing)
 */
export function clearAllSessionCognitiveStates(): void {
  sessionCognitiveState.clear();
}

export default {
  buildCognitiveHandoffContext,
  formatCognitiveHandoffForPrompt,
  recordTopicExplained,
  recordUserExpertise,
  recordApproachEffectiveness,
  recordUserCognitiveStyle,
  clearSessionCognitiveState,
};
