/**
 * Human Listening Synthesis
 *
 * Functions for synthesizing insights from analysis results.
 * Generates emotional undercurrents, assessments, and guidance.
 */
import type { AudioAnalysis, TextAnalysis, ConversationAnalysis, EmotionalUndercurrent, SsmlSuggestions } from './types.js';
/**
 * Synthesize emotional undercurrent from all analysis results
 */
export declare function synthesizeEmotionalUndercurrent(audio: AudioAnalysis, text: TextAnalysis, conversation: ConversationAnalysis): EmotionalUndercurrent;
/**
 * Generate overall assessment of how the user is doing
 */
export declare function generateOverallAssessment(audio: AudioAnalysis, text: TextAnalysis, conversation: ConversationAnalysis, undercurrent: EmotionalUndercurrent): string;
/**
 * Identify priority signals that agent should attend to
 */
export declare function identifyPrioritySignals(audio: AudioAnalysis, text: TextAnalysis, conversation: ConversationAnalysis): string[];
/**
 * Generate unified guidance for agent response
 */
export declare function generateAgentGuidance(audio: AudioAnalysis, text: TextAnalysis, conversation: ConversationAnalysis, prioritySignals: string[]): string;
/**
 * Determine if agent should slow down
 */
export declare function determineShouldSlowDown(audio: AudioAnalysis, text: TextAnalysis, conversation: ConversationAnalysis): boolean;
/**
 * Determine if agent should give more space
 */
export declare function determineShouldGiveSpace(audio: AudioAnalysis, text: TextAnalysis, conversation: ConversationAnalysis): boolean;
/**
 * Determine if user is possibly in distress
 */
export declare function determinePossibleDistress(audio: AudioAnalysis, text: TextAnalysis, _conversation: ConversationAnalysis): boolean;
/**
 * Calculate SSML suggestions for agent response
 */
export declare function calculateSsmlSuggestions(audio: AudioAnalysis, text: TextAnalysis, shouldSlowDown: boolean): SsmlSuggestions;
/**
 * Calculate overall confidence in the analysis
 */
export declare function calculateOverallConfidence(audio: AudioAnalysis, text: TextAnalysis, conversation: ConversationAnalysis): number;
//# sourceMappingURL=synthesis.d.ts.map