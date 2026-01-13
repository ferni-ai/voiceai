/**
 * Proactive Domain Tools - Better Than Human
 *
 * This domain exposes Ferni's superhuman capabilities as LLM tools.
 * These tools make Ferni genuinely better than any human friend:
 *
 * - Perfect memory of every commitment
 * - Pattern recognition across conversations
 * - Proactive check-ins based on predicted needs
 * - Life narrative synthesis
 * - Values alignment detection
 *
 * DOMAIN: proactive
 * PERSONA AFFINITY: All personas (superhuman capabilities are cross-cutting)
 *
 * TOOLS:
 *   Commitment: trackCommitment, reviewCommitments, celebrateCompletion
 *   Patterns: recordPattern, viewPatterns, getPredictions
 *   Narrative: buildLifeNarrative, reflectOnJourney
 *   Values: checkValuesAlignment, surfaceContradiction
 *   Proactive: generateProactiveMessage, scheduleFollowUp
 */
import type { ToolDefinition } from '../../registry/types.js';
declare const trackCommitmentDef: ToolDefinition;
declare const reviewCommitmentsDef: ToolDefinition;
declare const celebrateCompletionDef: ToolDefinition;
declare const recordPatternDef: ToolDefinition;
declare const getPredictionsDef: ToolDefinition;
declare const reflectOnJourneyDef: ToolDefinition;
declare const checkValuesAlignmentDef: ToolDefinition;
declare const generateProactiveMessageDef: ToolDefinition;
declare const scheduleFollowUpDef: ToolDefinition;
export * from './coaching/index.js';
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export { trackCommitmentDef, reviewCommitmentsDef, celebrateCompletionDef, recordPatternDef, getPredictionsDef, reflectOnJourneyDef, checkValuesAlignmentDef, generateProactiveMessageDef, scheduleFollowUpDef, };
export { getAgentToUserOutreachDefinitions } from './outreach/index.js';
export * from './outreach/index.js';
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map