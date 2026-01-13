/**
 * Emotional Memory Engine
 *
 * Tracks USER emotional states across sessions to enable:
 * - "Last time we talked, you seemed stressed about work"
 * - "You were really excited about that investment - how's it going?"
 * - "I remember when you were worried about your daughter's college"
 *
 * Creates deeper human connection through emotional continuity.
 *
 * @deprecated For new code, prefer using the unified interface:
 * ```typescript
 * import { getUnifiedEmotionalMemory } from '../../memory/emotional-memory-unified.js';
 * const memory = getUnifiedEmotionalMemory({ userId, personaId });
 * ```
 *
 * The unified interface coordinates this USER emotion tracking with the
 * PERSONA bonding system (conversation/superhuman/emotional-memory.ts).
 */
import type { PrimaryEmotion } from '../detectors/emotion.js';
export interface EmotionalMoment {
    id: string;
    timestamp: Date;
    sessionId: string;
    emotion: PrimaryEmotion;
    intensity: 'mild' | 'moderate' | 'strong';
    topic: string;
    trigger: string;
    userStatement: string;
    resolved?: boolean;
    resolutionNote?: string;
    followedUp?: boolean;
}
export interface EmotionalPattern {
    topic: string;
    emotions: PrimaryEmotion[];
    frequency: number;
    lastSeen: Date;
    trend: 'improving' | 'stable' | 'worsening' | 'unknown';
}
export interface EmotionalCheckIn {
    type: 'follow_up' | 'celebration' | 'support' | 'curiosity';
    reference: string;
    suggestedOpener: string;
    priority: 'high' | 'medium' | 'low';
    moment: EmotionalMoment;
}
export interface EmotionalContext {
    recentEmotions: string[];
    unresolvedConcerns: string[];
    celebratableWins: string[];
    checkInSuggestions: EmotionalCheckIn[];
}
export declare class EmotionalMemoryEngine {
    private moments;
    private currentSessionId;
    private lastSessionEmotions;
    constructor();
    /**
     * Record a significant emotional moment
     */
    recordMoment(emotion: PrimaryEmotion, topic: string, trigger: string, userStatement: string, intensity?: 'mild' | 'moderate' | 'strong'): string;
    /**
     * Mark a concern as resolved
     */
    resolveEmotion(momentId: string, note?: string): void;
    /**
     * Mark that we followed up on something
     */
    markFollowedUp(momentId: string): void;
    /**
     * Start a new session, snapshot previous session emotions
     */
    startSession(sessionId: string): void;
    /**
     * Detect emotional patterns around topics
     */
    detectPatterns(): EmotionalPattern[];
    private isPositive;
    /**
     * Get suggested emotional check-ins for conversation start
     */
    getCheckInSuggestions(): EmotionalCheckIn[];
    private generateFollowUpOpener;
    private generateCelebrationOpener;
    private generateSupportOpener;
    /**
     * Build emotional context for LLM prompt
     */
    buildEmotionalContext(): EmotionalContext;
    /**
     * Format for LLM prompt injection
     */
    formatForPrompt(): string;
    /**
     * Export moments for persistence
     */
    exportMoments(): EmotionalMoment[];
    /**
     * Import moments from storage
     */
    importMoments(moments: EmotionalMoment[]): void;
    /**
     * Get stats
     */
    getStats(): {
        totalMoments: number;
        lastSessionMoments: number;
        unresolvedCount: number;
        topPatterns: {
            topic: string;
            trend: "unknown" | "stable" | "improving" | "worsening";
        }[];
    };
}
export declare function getEmotionalMemory(userId: string): EmotionalMemoryEngine;
export declare function removeEmotionalMemory(userId: string): void;
//# sourceMappingURL=emotional-memory.d.ts.map