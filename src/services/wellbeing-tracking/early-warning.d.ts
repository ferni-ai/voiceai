/**
 * Early Warning System
 *
 * Phase 21: Predict struggles before they become crises.
 * Multi-signal pattern detection for depression, anxiety, burnout, etc.
 *
 * @module EarlyWarning
 */
import type { WellbeingProfile } from './index.js';
export type WarningType = 'depression_risk' | 'anxiety_spike' | 'burnout_trajectory' | 'isolation_pattern' | 'sleep_deterioration' | 'motivation_collapse' | 'hopelessness_pattern' | 'crisis_risk';
export type WarningSeverity = 'watch' | 'concern' | 'urgent';
export interface WarningSignal {
    signal: string;
    weight: number;
    observation: string;
    detected: boolean;
    source: 'wellbeing' | 'conversation' | 'pattern' | 'voice';
}
export interface EarlyWarning {
    id: string;
    userId: string;
    type: WarningType;
    severity: WarningSeverity;
    confidence: number;
    signals: WarningSignal[];
    triggerScore: number;
    detectedAt: Date;
    context?: string;
    recommendations: {
        forUser: string[];
        forFerni: string[];
        suggestProfessional: boolean;
    };
    previousOccurrences: number;
    wasAccurate?: boolean;
}
export interface WarningPattern {
    type: WarningType;
    signals: Array<{
        signal: string;
        weight: number;
        detector: (profile: WellbeingProfile, conversationContext?: ConversationData) => boolean;
        observation: string;
    }>;
    threshold: number;
    severeThreshold: number;
}
export interface ConversationData {
    recentMessages?: string[];
    emotionalTone?: string;
    topics?: string[];
    sessionDuration?: number;
    daysSinceLastSession?: number;
}
export interface WarningHistory {
    userId: string;
    warnings: EarlyWarning[];
    lastChecked: Date;
    accuracyScore: number;
}
/**
 * Check for early warnings.
 */
export declare function checkWarnings(profile: WellbeingProfile, context?: ConversationData): EarlyWarning[];
/**
 * Get active warnings for a user.
 */
export declare function getActiveWarnings(userId: string): EarlyWarning[];
/**
 * Get warning context for LLM.
 */
export declare function getWarningContextInjection(userId: string): string;
/**
 * Record feedback on warning accuracy.
 */
export declare function recordWarningFeedback(userId: string, warningId: string, wasAccurate: boolean): void;
/**
 * Get crisis resources.
 */
export declare function getCrisisResources(): {
    hotlines: Array<{
        name: string;
        number: string;
        country: string;
    }>;
    text: Array<{
        name: string;
        number: string;
        country: string;
    }>;
    online: Array<{
        name: string;
        url: string;
    }>;
};
export declare const earlyWarning: {
    check: typeof checkWarnings;
    getActive: typeof getActiveWarnings;
    getContextInjection: typeof getWarningContextInjection;
    recordFeedback: typeof recordWarningFeedback;
    getCrisisResources: typeof getCrisisResources;
};
export default earlyWarning;
//# sourceMappingURL=early-warning.d.ts.map