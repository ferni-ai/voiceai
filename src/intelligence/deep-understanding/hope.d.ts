/**
 * Hope Trajectory Tracking System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Long-term emotional resilience monitoring - tracking not just
 * momentary emotions but the trajectory of hope, resilience, and
 * groundedness over time.
 *
 * This is superhuman because it requires memory and pattern recognition
 * across many conversations that even therapists struggle to maintain.
 */
export type TrajectoryDirection = 'improving' | 'stable' | 'declining' | 'volatile';
export type UrgencyLevel = 'proactive' | 'watchful' | 'urgent' | 'critical';
export interface HopeObservation {
    /** Timestamp */
    timestamp: Date;
    /** Session ID */
    sessionId: string;
    /** Hope indicators (0-1) */
    indicators: {
        futureOrientation: number;
        agencyLanguage: number;
        meaningMaking: number;
        connectionSeeking: number;
        selfCompassion: number;
    };
    /** Composite hope score */
    hopeScore: number;
    /** Resilience indicators */
    resilience: {
        bounceBackSpeed: number;
        copingUtilization: number;
        perspectiveTaking: number;
    };
    /** Risk indicators */
    risk: {
        hopelessnessLanguage: boolean;
        isolationMentions: boolean;
        helplessnessPatterns: boolean;
        negativeRumination: boolean;
    };
    /** Context */
    context: {
        topicsDuring: string[];
        emotionRange: string[];
        stressLevel: number;
    };
}
export interface HopeTrajectory {
    /** Current state */
    current: {
        hopeLevel: number;
        resilienceScore: number;
        groundedness: number;
        lastAssessed: Date;
    };
    /** Trend over time */
    trend: {
        direction: TrajectoryDirection;
        rate: number;
        volatility: number;
        confidence: number;
    };
    /** What anchors their hope */
    anchors: {
        sources: Array<{
            description: string;
            strength: number;
            lastMentioned: Date;
        }>;
        threats: Array<{
            description: string;
            severity: number;
            lastMentioned: Date;
        }>;
        protectiveFactors: string[];
    };
    /** Intervention timing */
    intervention: {
        bestWindowForSupport: boolean;
        urgencyLevel: UrgencyLevel;
        suggestedApproach: string;
    };
}
export interface HopeProfile {
    userId: string;
    /** Observation history */
    observations: HopeObservation[];
    /** Current trajectory */
    trajectory: HopeTrajectory;
    /** Patterns learned */
    patterns: {
        baselineHope: number;
        recoveryRate: number;
        triggerTopics: string[];
        stabilizingFactors: string[];
    };
    /** Metadata */
    metadata: {
        firstObservation: Date;
        totalObservations: number;
        lastUpdated: Date;
    };
}
/**
 * Get or create hope profile
 */
export declare function getHopeProfile(userId: string): HopeProfile;
export interface HopeAnalysis {
    /** Observation from this conversation */
    observation: HopeObservation;
    /** Updated trajectory */
    trajectory: HopeTrajectory;
    /** Alerts if any */
    alerts: Array<{
        type: 'hopelessness' | 'isolation' | 'declining_trend' | 'volatility';
        severity: 'low' | 'medium' | 'high';
        message: string;
    }>;
    /** Guidance for this session */
    guidance: {
        approach: string;
        reinforce: string[];
        avoid: string[];
        checkIn: string | null;
    };
}
/**
 * Analyze hope trajectory
 */
export declare function analyzeHope(userId: string, sessionId: string, text: string, topics: string[], emotions: string[], stressLevel: number): HopeAnalysis;
/**
 * Format hope analysis for prompt injection
 */
export declare function formatHopeForPrompt(analysis: HopeAnalysis): string;
/**
 * Import a hope profile into memory (for persistence)
 */
export declare function importHopeProfile(profile: HopeProfile): void;
/**
 * Reset all hope trajectory state (for testing)
 */
export declare function resetHopeTrajectory(): void;
declare const _default: {
    getHopeProfile: typeof getHopeProfile;
    analyzeHope: typeof analyzeHope;
    formatHopeForPrompt: typeof formatHopeForPrompt;
    resetHopeTrajectory: typeof resetHopeTrajectory;
};
export default _default;
//# sourceMappingURL=hope.d.ts.map