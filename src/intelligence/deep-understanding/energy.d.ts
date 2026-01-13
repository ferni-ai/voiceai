/**
 * Energy State Inference System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Inferring physical and mental energy from voice patterns and behavior.
 * Understanding when someone is depleted vs. energized, and adapting
 * response complexity accordingly.
 *
 * "You sound tired today. Want to keep things light, or would talking help?"
 *
 * This is superhuman because even close friends don't always notice
 * subtle energy shifts, and they certainly can't modulate their own
 * communication style in response.
 */
import type { VoiceEmotionResult } from '../../speech/audio-prosody.js';
export type EnergyLevel = 'depleted' | 'low' | 'moderate' | 'high' | 'elevated';
export type SleepQuality = 'poor' | 'fair' | 'good' | 'unknown';
export type MentalCapacity = 'overwhelmed' | 'limited' | 'normal' | 'sharp' | 'flow';
export interface PhysicalEnergyState {
    /** Overall physical energy level */
    level: EnergyLevel;
    /** Estimated sleep quality */
    sleepQuality: SleepQuality;
    /** Indicators detected */
    indicators: Array<{
        type: 'voice' | 'language' | 'pace' | 'engagement';
        signal: string;
        weight: number;
    }>;
    /** Time of day factor */
    timeOfDayFactor: {
        hour: number;
        expectedEnergy: EnergyLevel;
        deviation: number;
    };
    /** Confidence in assessment */
    confidence: number;
}
export interface MentalEnergyState {
    /** Cognitive capacity right now */
    capacity: MentalCapacity;
    /** Decision fatigue indicators */
    decisionFatigue: {
        detected: boolean;
        severity: number;
        indicators: string[];
    };
    /** Emotional reserve (capacity for heavy topics) */
    emotionalReserve: {
        level: number;
        canHandleHeavy: boolean;
        recentDrains: string[];
    };
    /** Focus indicators */
    focus: {
        level: number;
        distractionSignals: string[];
        engagementSignals: string[];
    };
    /** Confidence in assessment */
    confidence: number;
}
export interface EnergyAssessment {
    /** Physical energy state */
    physical: PhysicalEnergyState;
    /** Mental energy state */
    mental: MentalEnergyState;
    /** Overall state summary */
    overall: {
        readyForDeep: boolean;
        optimalResponseLength: 'brief' | 'normal' | 'detailed';
        topicsToAvoid: string[];
        suggestedApproach: string;
    };
    /** Timestamp */
    assessedAt: Date;
}
export interface EnergyPattern {
    userId: string;
    /** Historical energy by time of day */
    timePatterns: Record<number, {
        avgEnergy: number;
        samples: number;
    }>;
    /** Day of week patterns */
    dayPatterns: Record<number, {
        avgEnergy: number;
        samples: number;
    }>;
    /** Recovery patterns (how quickly they bounce back) */
    recoveryRate: number;
    /** Typical baseline energy */
    baselineEnergy: number;
    /** Topics that drain energy */
    drainingTopics: string[];
    /** Topics that energize */
    energizingTopics: string[];
    /** Total observations */
    observations: number;
}
/**
 * Get or create energy pattern for user
 */
export declare function getEnergyPattern(userId: string): EnergyPattern;
/**
 * Assess energy state from multiple signals
 */
export declare function assessEnergyState(userId: string, text: string, voiceData: VoiceEmotionResult | null, currentTopics: string[], sessionTurnCount: number): EnergyAssessment;
/**
 * Mark a topic as draining or energizing
 */
export declare function markTopicEnergy(userId: string, topic: string, effect: 'draining' | 'energizing'): void;
/**
 * Format energy assessment for prompt injection
 */
export declare function formatEnergyForPrompt(assessment: EnergyAssessment): string;
/**
 * Import an energy pattern into memory (for persistence)
 */
export declare function importEnergyPattern(pattern: EnergyPattern): void;
/**
 * Reset all energy state inference state (for testing)
 */
export declare function resetEnergyStateInference(): void;
declare const _default: {
    getEnergyPattern: typeof getEnergyPattern;
    assessEnergyState: typeof assessEnergyState;
    markTopicEnergy: typeof markTopicEnergy;
    formatEnergyForPrompt: typeof formatEnergyForPrompt;
    resetEnergyStateInference: typeof resetEnergyStateInference;
};
export default _default;
//# sourceMappingURL=energy.d.ts.map