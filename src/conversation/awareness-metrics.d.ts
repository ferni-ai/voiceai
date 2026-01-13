/**
 * Awareness System Observability Metrics
 *
 * Tracks performance and usage of the awareness components:
 * - Momentum tracking (state transitions, velocity)
 * - Thinking time (pauses, speech rate adjustments)
 * - Tangent decisions (triggers, acceptance rate)
 * - Self-awareness (landing rate, miss detection)
 *
 * Use these metrics to:
 * - Debug conversation flow issues
 * - Tune awareness sensitivity per persona
 * - Understand what makes conversations feel natural
 *
 * @module conversation/awareness-metrics
 */
import type { MomentumState } from './momentum-tracker.js';
export interface MomentumMetrics {
    /** Session ID */
    sessionId: string;
    /** Persona ID */
    personaId: string;
    /** State transitions recorded */
    stateTransitions: Array<{
        from: MomentumState;
        to: MomentumState;
        turn: number;
        timestamp: Date;
    }>;
    /** Time spent in each state (turns) */
    stateDistribution: Record<MomentumState, number>;
    /** Peak moments detected */
    peaksDetected: number;
    /** Stalls detected */
    stallsDetected: number;
    /** Average velocity */
    avgVelocity: number;
    /** Topic depth reached */
    maxTopicDepth: number;
}
export interface ThinkingTimeMetrics {
    /** Total thinking calculations */
    totalCalculations: number;
    /** Average opening pause (ms) */
    avgOpeningPauseMs: number;
    /** Average speech rate multiplier */
    avgSpeechRate: number;
    /** Thinking sounds used */
    thinkingSoundsUsed: Record<string, number>;
    /** Mid-pauses injected */
    midPausesInjected: number;
    /** Slow speech rate triggers */
    slowSpeechTriggers: number;
}
export interface TangentMetrics {
    /** Total tangent decisions */
    totalDecisions: number;
    /** Tangents suggested */
    tangentsSuggested: number;
    /** Tangents taken (would be tracked if we had feedback) */
    tangentsTaken: number;
    /** Tangents by theme */
    tangentsByTheme: Record<string, number>;
    /** Cooldown blocks */
    cooldownBlocks: number;
    /** Momentum blocks (wrong state) */
    momentumBlocks: number;
    /** Relationship depth blocks */
    relationshipBlocks: number;
}
export interface SelfAwarenessMetrics {
    /** Total assessments */
    totalAssessments: number;
    /** Landing rate (responses that landed) */
    landingRate: number;
    /** Miss count */
    missCount: number;
    /** Consecutive misses (max) */
    maxConsecutiveMisses: number;
    /** Response types used */
    responseTypeDistribution: Record<string, number>;
    /** Self-aware prompts generated */
    selfAwarePromptsGenerated: number;
}
export interface AwarenessSessionMetrics {
    sessionId: string;
    personaId: string;
    startTime: Date;
    turnCount: number;
    momentum: MomentumMetrics;
    thinkingTime: ThinkingTimeMetrics;
    tangents: TangentMetrics;
    selfAwareness: SelfAwarenessMetrics;
}
/**
 * Record a momentum state transition
 */
export declare function recordMomentumTransition(sessionId: string, personaId: string, from: MomentumState, to: MomentumState, turn: number): void;
/**
 * Record momentum velocity
 */
export declare function recordMomentumVelocity(sessionId: string, personaId: string, velocity: number, topicDepth: number): void;
/**
 * Record thinking time calculation
 */
export declare function recordThinkingTime(sessionId: string, personaId: string, openingPauseMs: number, speechRate: number, thinkingSound: string | undefined, midPausesCount: number): void;
/**
 * Record tangent decision
 */
export declare function recordTangentDecision(sessionId: string, personaId: string, shouldTangent: boolean, theme: string | undefined, blockReason: 'cooldown' | 'momentum' | 'relationship' | 'none'): void;
/**
 * Record self-awareness assessment
 */
export declare function recordSelfAwarenessAssessment(sessionId: string, personaId: string, result: 'landed' | 'partial' | 'missed' | 'unknown', responseType: string, consecutiveMisses: number): void;
/**
 * Record self-aware prompt generation
 */
export declare function recordSelfAwarePrompt(sessionId: string, personaId: string): void;
/**
 * Get metrics for a session
 */
export declare function getAwarenessMetrics(sessionId: string): AwarenessSessionMetrics | undefined;
/**
 * Get summary across all sessions
 */
export declare function getAwarenessSummary(): {
    totalSessions: number;
    avgLandingRate: number;
    avgPeaksPerSession: number;
    avgStallsPerSession: number;
    mostCommonTangentThemes: Array<{
        theme: string;
        count: number;
    }>;
    avgOpeningPauseMs: number;
    mostUsedThinkingSounds: Array<{
        sound: string;
        count: number;
    }>;
};
/**
 * Reset metrics for a session
 */
export declare function resetAwarenessMetrics(sessionId: string): void;
/**
 * Reset all metrics
 */
export declare function resetAllAwarenessMetrics(): void;
//# sourceMappingURL=awareness-metrics.d.ts.map