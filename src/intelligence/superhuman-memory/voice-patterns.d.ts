/**
 * Voice Tone Memory
 *
 * Energy/pace patterns over time.
 *
 * @module superhuman-memory/voice-patterns
 */
import type { VoicePatternObservation } from './types.js';
/**
 * Record a voice pattern observation
 */
export declare function recordVoicePattern(userId: string, sessionId: string, observation: Omit<VoicePatternObservation, 'sessionId' | 'timestamp'>): void;
/**
 * Analyze voice patterns for anomalies
 */
export declare function analyzeVoicePatterns(userId: string): {
    currentState: 'normal' | 'lower_energy' | 'higher_energy' | 'rushed' | 'hesitant';
    confidence: number;
    suggestion?: string;
};
/**
 * Clear voice pattern history for a user (for testing)
 */
export declare function clearVoicePatternHistory(userId: string): void;
//# sourceMappingURL=voice-patterns.d.ts.map