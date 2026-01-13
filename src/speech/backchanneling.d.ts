/**
 * Backchanneling System - GAP 1.4
 *
 * Provides verbal "nods" and listening cues during user speech.
 * Makes agents feel present and engaged, not silent.
 *
 * NOW USES PERSONA-SPECIFIC BACKCHANNELS for distinct personalities!
 */
import type { EmotionResult } from '../intelligence/emotion-detector.js';
import type { TopicWeight } from './speech-context.js';
export interface BackchannelContext {
    userHasBeenSpeaking: number;
    userPausedBriefly: boolean;
    userEmotion: EmotionResult;
    topicWeight: TopicWeight;
    lastBackchannelTime?: number;
    personaId?: string;
}
export interface BackchannelResult {
    shouldBackchannel: boolean;
    phrase: string | null;
    timing: 'immediate' | 'after_pause' | 'never';
}
export declare class BackchannelingSystem {
    private lastBackchannelTime;
    private backchannelCount;
    private readonly MIN_INTERVAL_MS;
    /**
     * Determine if agent should backchannel (verbal nod)
     */
    shouldBackchannel(context: BackchannelContext): BackchannelResult;
    /**
     * Get appropriate backchannel phrase based on emotion, topic, and PERSONA
     * Now uses persona-specific backchannels for distinct personalities!
     */
    getBackchannel(emotion: EmotionResult, topicWeight: TopicWeight, personaId?: string): string;
    /**
     * Get engagement phrase for encouraging user to continue
     *
     * "Better Than Human" Philosophy:
     * - Presence, not commands ("I'm here" vs "Tell me more")
     * - Soft sounds that blend, not interrupt
     */
    getEngagementPhrase(emotion: EmotionResult): string;
    /**
     * Record backchannel (for tracking)
     */
    recordBackchannel(): void;
    /**
     * Get statistics
     */
    getStats(): {
        count: number;
        lastTime: number;
    };
    /**
     * Reset for new session
     */
    reset(): void;
}
/**
 * Get or create a backchanneling system for a specific session
 */
export declare function getSessionBackchannelingSystem(sessionId: string): BackchannelingSystem;
/**
 * Reset and remove a session's backchanneling system (on session end)
 */
export declare function resetSessionBackchannelingSystem(sessionId: string): void;
//# sourceMappingURL=backchanneling.d.ts.map