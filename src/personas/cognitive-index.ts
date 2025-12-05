/**
 * Cognitive Intelligence System - Index
 *
 * Central export for the cognitive intelligence system that makes
 * each persona think differently.
 *
 * Includes:
 * - Core cognitive profiles and engine
 * - User cognitive style detection
 * - Cognitive handoff transfer
 * - Multi-step reasoning chains
 * - Cognitive conflict resolution
 * - Cognitive learning and adaptation
 * - Knowledge state persistence
 * - Cognitive growth arcs
 * - Cognitive questions
 * - Collaborative cognition (team perspectives)
 * - Speech × cognition integration
 */

// Types
export type {
  CognitiveProfile,
  CognitiveContext,
  CognitiveGuidance,
  ReasoningStyle,
  AttentionFocus,
  AttentionProfile,
  TheoryOfMindConfig,
  CognitiveBiasConfig,
  CognitiveBiasType,
  CognitiveBias,
  MetacognitionConfig,
  UncertaintyExpression,
  ConfidenceLevel,
  InformationProcessingStyle,
  UncertaintyResponse,
} from './cognitive-types.js';

// Engine
export {
  CognitiveIntelligenceEngine,
  getCognitiveEngine,
  removeCognitiveEngine,
  resetAllCognitiveEngines,
} from './cognitive-intelligence.js';

// Profiles
export {
  cognitiveProfiles,
  getCognitiveProfile,
  ferniCognitiveProfile,
  peterCognitiveProfile,
  alexCognitiveProfile,
  mayaCognitiveProfile,
  jordanCognitiveProfile,
  nayanCognitiveProfile,
} from './cognitive-profiles.js';

// ============================================================================
// ADVANCED COGNITIVE FEATURES
// ============================================================================

// Advanced types
export type {
  UserCognitiveStyle,
  CognitiveHandoffContext,
  ReasoningStep,
  ReasoningChain,
  CognitiveConflict,
  CognitiveEffectiveness,
  CognitiveLearning,
  UserKnowledgeState,
  CognitiveGrowthProfile,
} from './cognitive-advanced.js';

// User cognitive style detection
export {
  detectUserCognitiveStyle,
} from './cognitive-advanced.js';

// Cognitive handoff transfer
export {
  buildCognitiveHandoffContext,
} from './cognitive-advanced.js';

// Multi-step reasoning chains
export {
  buildReasoningChain,
  getReasoningChainGuidance,
} from './cognitive-advanced.js';

// Cognitive conflict resolution
export {
  detectCognitiveConflict,
} from './cognitive-advanced.js';

// Cognitive learning
export {
  CognitiveLearningTracker,
  getCognitiveLearningTracker,
} from './cognitive-advanced.js';

// Knowledge state persistence
export {
  KnowledgeStateTracker,
  getKnowledgeStateTracker,
} from './cognitive-advanced.js';

// Cognitive growth arc
export {
  getCognitiveGrowthProfile,
  buildCognitiveGrowthContext,
} from './cognitive-advanced.js';

// ============================================================================
// COLLABORATIVE COGNITION
// ============================================================================

export {
  generatePerspective,
  generateCollaborativePerspectives,
  generateTeamCommentary,
} from './collaborative-cognition.js';

export type {
  CognitivePerspective,
  CollaborativeCognition,
} from './collaborative-cognition.js';

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

import { getCognitiveEngine } from './cognitive-intelligence.js';
import { getCognitiveProfile } from './cognitive-profiles.js';
import type { CognitiveContext, CognitiveGuidance } from './cognitive-types.js';

/**
 * Get cognitive guidance for a persona in a specific context
 * One-liner for easy integration
 */
export function getCognitiveGuidance(
  personaId: string,
  context: Partial<CognitiveContext>
): CognitiveGuidance | null {
  const profile = getCognitiveProfile(personaId);
  if (!profile) return null;

  const engine = getCognitiveEngine(personaId, profile);

  // Fill in defaults for missing context
  const fullContext: CognitiveContext = {
    currentTopic: context.currentTopic || 'general',
    userExpertise: context.userExpertise || 'unknown',
    emotionalWeight: context.emotionalWeight ?? 0.3,
    questionComplexity: context.questionComplexity || 'moderate',
    turnCount: context.turnCount ?? 1,
    previousApproaches: context.previousApproaches || [],
  };

  return engine.generateGuidance(fullContext);
}

/**
 * Build cognitive context injection string for LLM prompts
 * Returns empty string if persona has no cognitive profile
 */
export function buildCognitivePromptInjection(
  personaId: string,
  context: Partial<CognitiveContext>
): string {
  const profile = getCognitiveProfile(personaId);
  if (!profile) return '';

  const engine = getCognitiveEngine(personaId, profile);

  const fullContext: CognitiveContext = {
    currentTopic: context.currentTopic || 'general',
    userExpertise: context.userExpertise || 'unknown',
    emotionalWeight: context.emotionalWeight ?? 0.3,
    questionComplexity: context.questionComplexity || 'moderate',
    turnCount: context.turnCount ?? 1,
    previousApproaches: context.previousApproaches || [],
  };

  return engine.buildPromptInjection(fullContext);
}

/**
 * Detect question complexity from message
 */
export function detectQuestionComplexity(
  message: string
): 'simple' | 'moderate' | 'complex' | 'ambiguous' {
  const lower = message.toLowerCase();

  // Ambiguous markers
  const ambiguousPatterns = [
    /i don'?t know/,
    /not sure/,
    /maybe|perhaps/,
    /kind of|sort of/,
    /or something/,
    /whatever/,
    /idk/,
    /hard to explain/,
  ];

  for (const pattern of ambiguousPatterns) {
    if (pattern.test(lower)) return 'ambiguous';
  }

  // Complex markers
  const complexPatterns = [
    /why.*and.*how/,
    /on one hand.*other hand/,
    /comparing|versus|vs/,
    /should i.*or/,
    /trade-?off/,
    /complicated|complex/,
    /multiple.*factors/,
    /long.?term.*short.?term/,
  ];

  for (const pattern of complexPatterns) {
    if (pattern.test(lower)) return 'complex';
  }

  // Simple markers
  const simplePatterns = [
    /^what is/,
    /^how do i/,
    /^can you/,
    /^please/,
    /^tell me about/,
    /^yes$/,
    /^no$/,
  ];

  for (const pattern of simplePatterns) {
    if (pattern.test(lower)) return 'simple';
  }

  // Word count heuristic
  const wordCount = message.split(/\s+/).length;
  if (wordCount < 10) return 'simple';
  if (wordCount > 50) return 'complex';

  return 'moderate';
}

/**
 * Detect user expertise level from message history
 */
export function detectUserExpertise(
  messages: string[],
  topic: string
): 'novice' | 'intermediate' | 'expert' | 'unknown' {
  if (messages.length < 2) return 'unknown';

  const allText = messages.join(' ').toLowerCase();

  // Expert signals
  const expertSignals = [
    'in my experience',
    'from what i\'ve seen',
    'i\'ve been doing this',
    'i know that',
    'actually',
    'technically',
    'specifically',
    'my approach is',
    'i usually',
  ];

  // Novice signals
  const noviceSignals = [
    'i don\'t understand',
    'what does that mean',
    'i\'m new to',
    'never done this',
    'first time',
    'confusing',
    'overwhelmed',
    'help me understand',
    'eli5',
    'dumb question',
  ];

  let expertScore = 0;
  let noviceScore = 0;

  for (const signal of expertSignals) {
    if (allText.includes(signal)) expertScore++;
  }

  for (const signal of noviceSignals) {
    if (allText.includes(signal)) noviceScore++;
  }

  if (expertScore >= 2 && noviceScore === 0) return 'expert';
  if (noviceScore >= 2 && expertScore === 0) return 'novice';
  if (expertScore > noviceScore) return 'intermediate';
  if (noviceScore > expertScore) return 'novice';

  return 'unknown';
}

export default {
  getCognitiveGuidance,
  buildCognitivePromptInjection,
  detectQuestionComplexity,
  detectUserExpertise,
};

