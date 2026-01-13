/**
 * Resistance Pattern Detection System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Detecting what users are AVOIDING - not just what they're saying.
 * Understanding deflection, intellectualization, humor as defense,
 * and other self-protective patterns.
 *
 * "I notice you change the subject when we get close to talking about your dad."
 *
 * This is superhuman because it requires tracking patterns over time
 * that even therapists might miss in session.
 */
export type DefensePattern = 'intellectualization' | 'humor' | 'externalizing' | 'minimizing' | 'catastrophizing' | 'deflection' | 'rationalization' | 'denial' | 'projection' | 'splitting' | 'sarcasm' | 'vagueness' | 'whataboutism';
export interface AvoidedTopic {
    /** Topic or theme being avoided */
    topic: string;
    /** First detected */
    firstDetected: Date;
    /** Last time they came close to it */
    lastApproached: Date;
    /** How they typically deflect */
    deflectionPatterns: DefensePattern[];
    /** Snippets showing avoidance */
    evidence: Array<{
        text: string;
        timestamp: Date;
        defenseUsed: DefensePattern;
    }>;
    /** Emotional charge (how much energy around this) */
    emotionalCharge: 'high' | 'medium' | 'low';
    /** Are there signs they're ready to explore? */
    readinessSignals: string[];
    /** Estimated readiness to explore (0-1) */
    readiness: number;
}
export interface SelfProtectiveProfile {
    /** Overall defense tendency (0-1) */
    overallDefensiveness: number;
    /** Individual pattern scores */
    patterns: Record<DefensePattern, {
        frequency: number;
        contexts: string[];
        effectiveness: number;
        lastObserved: Date | null;
    }>;
    /** Primary defense mechanisms (top 3) */
    primaryDefenses: DefensePattern[];
}
export interface GrowthEdge {
    /** Topic or area */
    topic: string;
    /** Current openness level (0-1) */
    openness: number;
    /** Is now a good time to explore? */
    timing: 'now' | 'soon' | 'not_yet';
    /** Why we think they might be ready */
    readinessIndicators: string[];
    /** Gentle entry point */
    entryPoint: string;
    /** What to avoid saying */
    avoidPhrases: string[];
}
export interface ResistanceProfile {
    userId: string;
    /** Topics being avoided */
    avoidedTopics: AvoidedTopic[];
    /** Self-protective patterns */
    selfProtection: SelfProtectiveProfile;
    /** Areas where they're ready to grow */
    growthEdges: GrowthEdge[];
    /** Overall insight */
    summary: {
        mostAvoidedTopic: string | null;
        mostUsedDefense: DefensePattern | null;
        readiestGrowthArea: string | null;
        overallOpenness: number;
    };
    /** Metadata */
    metadata: {
        totalObservations: number;
        lastUpdated: Date;
        confidence: number;
    };
}
/**
 * Get or create resistance profile
 */
export declare function getResistanceProfile(userId: string): ResistanceProfile;
export interface ResistanceAnalysis {
    /** Defenses detected in this message */
    defensesDetected: Array<{
        pattern: DefensePattern;
        evidence: string;
        confidence: number;
    }>;
    /** Topic being avoided (if any) */
    avoidedTopic: AvoidedTopic | null;
    /** Is this a deflection from something? */
    isDeflecting: boolean;
    /** What they might be deflecting from */
    deflectingFrom: string | null;
    /** Overall resistance level in this message (0-1) */
    resistanceLevel: number;
    /** Growth readiness signals */
    readinessSignals: string[];
    /** Suggested approach */
    approach: {
        strategy: 'honor' | 'gentle_invite' | 'reflect_back' | 'wait' | 'challenge';
        guidance: string;
        avoidPhrases: string[];
    };
}
/**
 * Analyze a message for resistance patterns
 */
export declare function analyzeResistance(userId: string, text: string, emotion: string, emotionIntensity: number, currentTopics: string[], previousTopic?: string): ResistanceAnalysis;
/**
 * Identify current growth edges
 */
export declare function identifyGrowthEdges(userId: string): GrowthEdge[];
/**
 * Format resistance analysis for prompt injection
 */
export declare function formatResistanceForPrompt(analysis: ResistanceAnalysis): string;
/**
 * Get summary for a user
 */
export declare function getResistanceSummary(userId: string): string | null;
/**
 * Import a resistance profile into memory (for persistence)
 */
export declare function importResistanceProfile(profile: ResistanceProfile): void;
/**
 * Reset all resistance detection state (for testing)
 */
export declare function resetResistanceDetection(): void;
declare const _default: {
    getResistanceProfile: typeof getResistanceProfile;
    analyzeResistance: typeof analyzeResistance;
    identifyGrowthEdges: typeof identifyGrowthEdges;
    formatResistanceForPrompt: typeof formatResistanceForPrompt;
    getResistanceSummary: typeof getResistanceSummary;
    resetResistanceDetection: typeof resetResistanceDetection;
};
export default _default;
//# sourceMappingURL=resistance.d.ts.map