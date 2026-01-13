/**
 * Human Listening Analyzers
 *
 * Analysis functions for audio, text, and conversation signals.
 */
import type { AudioAnalysis, ConversationAnalysis, HumanListeningContext, TextAnalysis } from './types.js';
/**
 * Analyze audio signals from raw samples or prosody features
 */
export declare function analyzeAudio(sessionId: string, context: HumanListeningContext): Promise<AudioAnalysis>;
/**
 * Analyze text-based signals
 */
export declare function analyzeText(sessionId: string, context: HumanListeningContext): Promise<TextAnalysis>;
/**
 * Analyze conversation-level signals
 */
export declare function analyzeConversation(sessionId: string, context: HumanListeningContext): Promise<ConversationAnalysis>;
/**
 * Reset all analyzers for a session
 */
export declare function resetAllAnalyzers(sessionId: string): void;
//# sourceMappingURL=analyzers.d.ts.map