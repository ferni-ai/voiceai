/**
 * Session Management for Audio Prosody
 *
 * Manages session-scoped analyzers and metrics tracking.
 */
import { AudioProsodyAnalyzer } from './analyzer.js';
import type { ProsodyMetrics, VoiceEmotionResult } from './types.js';
/**
 * Get or create a prosody analyzer for a specific session
 */
export declare function getSessionAudioProsodyAnalyzer(sessionId: string): AudioProsodyAnalyzer;
/**
 * Reset and remove a session's prosody analyzer (on session end)
 */
export declare function resetSessionAudioProsodyAnalyzer(sessionId: string): void;
/**
 * Get metrics for a specific session's prosody analysis
 */
export declare function getProsodyMetrics(sessionId: string): ProsodyMetrics;
/**
 * Internal function to record prosody analysis
 */
export declare function recordProsodyAnalysisInternal(sessionId: string, result: VoiceEmotionResult | null): void;
/**
 * Record a prosody analysis result for metrics (public API)
 */
export declare function recordProsodyAnalysis(sessionId: string, result: VoiceEmotionResult | null): void;
/**
 * Clear metrics for a specific session
 */
export declare function clearProsodyMetrics(sessionId: string): void;
//# sourceMappingURL=session-management.d.ts.map