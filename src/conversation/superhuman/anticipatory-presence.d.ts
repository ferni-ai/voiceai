/**
 * Anticipatory Presence
 *
 * > "I was actually hoping you'd call today."
 *
 * Detects patterns in when and why users reach out, enabling
 * proactive "I was thinking about you" moments that exceed
 * human pattern recognition.
 *
 * Key capabilities:
 * - Temporal patterns (Monday stress, late night calls)
 * - Topic associations (work → mom always follows)
 * - Emotional triggers (what makes them reach out)
 * - Energy patterns (time-based energy variations)
 *
 * @module @ferni/superhuman/anticipatory-presence
 */
import type { AnticipationResult, UserPatternProfile } from './types.js';
export declare class AnticipatoryPresenceEngine {
    private profile;
    private userId;
    private sessionHistory;
    constructor(userId: string, existingProfile?: UserPatternProfile);
    /**
     * Record a session start for pattern detection
     */
    recordSessionStart(context: {
        hour: number;
        dayOfWeek: number;
        detectedMood?: string;
        topics?: string[];
        energyLevel?: number;
    }): void;
    /**
     * Record topic discussed (for association detection)
     */
    recordTopic(topic: string, previousTopic?: string): void;
    /**
     * Record emotional trigger (what made them reach out)
     */
    recordEmotionalTrigger(trigger: string, need: string): void;
    /**
     * Get anticipation result for session start
     */
    getAnticipation(context: {
        hour: number;
        dayOfWeek: number;
        isReturningUser: boolean;
        sessionCount: number;
        currentTopic?: string;
        detectedMood?: string;
    }): AnticipationResult;
    /**
     * Get a "thinking of you" phrase if appropriate
     */
    getThinkingOfYouMoment(context: {
        turnCount: number;
        currentTopic?: string;
        sessionCount: number;
    }): string | null;
    private checkTemporalPatterns;
    private checkTopicAnticipation;
    private checkMoodAnticipation;
    private updateTemporalPatterns;
    private updateTopicAssociation;
    private updateEnergyPatterns;
    private getTimeOfDay;
    private selectPhrase;
    /**
     * Get expected energy level for current time
     */
    getExpectedEnergy(hour: number): number | null;
    /**
     * Export profile for persistence
     */
    export(): UserPatternProfile;
    /**
     * Import profile from persistence
     */
    import(profile: UserPatternProfile): void;
    /**
     * Reset
     */
    reset(): void;
}
export declare function getAnticipatoryPresence(userId: string, existingProfile?: UserPatternProfile): AnticipatoryPresenceEngine;
export declare function clearAnticipatoryPresence(userId: string): void;
export default AnticipatoryPresenceEngine;
//# sourceMappingURL=anticipatory-presence.d.ts.map