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
export type { CognitiveProfile, CognitiveContext, CognitiveGuidance, ReasoningStyle, AttentionFocus, AttentionProfile, TheoryOfMindConfig, CognitiveBiasConfig, CognitiveBiasType, CognitiveBias, MetacognitionConfig, UncertaintyExpression, ConfidenceLevel, InformationProcessingStyle, UncertaintyResponse, } from './cognitive-types.js';
export { CognitiveIntelligenceEngine, getCognitiveEngine, removeCognitiveEngine, resetAllCognitiveEngines, } from './cognitive-intelligence.js';
export { cognitiveProfiles, getCognitiveProfile, ferniCognitiveProfile, peterCognitiveProfile, alexCognitiveProfile, mayaCognitiveProfile, jordanCognitiveProfile, nayanCognitiveProfile, } from './cognitive-profiles.js';
export type { UserCognitiveStyle, CognitiveHandoffContext, ReasoningStep, ReasoningChain, CognitiveConflict, CognitiveEffectiveness, CognitiveLearning, UserKnowledgeState, CognitiveGrowthProfile, } from './cognitive-advanced.js';
export { detectUserCognitiveStyle } from './cognitive-advanced.js';
export { buildCognitiveHandoffContext } from './cognitive-advanced.js';
export { buildReasoningChain, getReasoningChainGuidance } from './cognitive-advanced.js';
export { detectCognitiveConflict } from './cognitive-advanced.js';
export { CognitiveLearningTracker, getCognitiveLearningTracker, initializeCognitiveLearning, flushCognitiveLearning, } from './cognitive-advanced.js';
export { KnowledgeStateTracker, getKnowledgeStateTracker, initializeKnowledgeState, flushKnowledgeState, } from './cognitive-advanced.js';
export { getCognitiveGrowthProfile, buildCognitiveGrowthContext } from './cognitive-advanced.js';
export type { PersistedCognitiveLearning, PersistedKnowledgeState, } from './cognitive-persistence.js';
export { saveCognitiveLearning, loadCognitiveLearning, loadAllCognitiveLearning, saveKnowledgeState, loadKnowledgeState, } from './cognitive-persistence.js';
export { generatePerspective, generateCollaborativePerspectives, generateTeamCommentary, } from './collaborative-cognition.js';
export type { CognitivePerspective, CollaborativeCognition } from './collaborative-cognition.js';
import type { CognitiveContext, CognitiveGuidance } from './cognitive-types.js';
/**
 * Get cognitive guidance for a persona in a specific context
 * One-liner for easy integration
 */
export declare function getCognitiveGuidance(personaId: string, context: Partial<CognitiveContext>): CognitiveGuidance | null;
/**
 * Build cognitive context injection string for LLM prompts
 * Returns empty string if persona has no cognitive profile
 */
export declare function buildCognitivePromptInjection(personaId: string, context: Partial<CognitiveContext>): string;
/**
 * Detect question complexity from message
 */
export declare function detectQuestionComplexity(message: string): 'simple' | 'moderate' | 'complex' | 'ambiguous';
/**
 * Detect user expertise level from message history
 */
export declare function detectUserExpertise(messages: string[], topic: string): 'novice' | 'intermediate' | 'expert' | 'unknown';
declare const _default: {
    getCognitiveGuidance: typeof getCognitiveGuidance;
    buildCognitivePromptInjection: typeof buildCognitivePromptInjection;
    detectQuestionComplexity: typeof detectQuestionComplexity;
    detectUserExpertise: typeof detectUserExpertise;
};
export default _default;
//# sourceMappingURL=cognitive-index.d.ts.map