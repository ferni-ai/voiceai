/**
 * "Catching Yourself" Moments
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Humans show meta-awareness of their conversations—noticing they've been
 * talking too much, realizing they keep circling back to something, checking
 * if they're making sense. These moments create authenticity and connection.
 *
 * **Types of catching yourself:**
 * - Talking too much: "Oh—I've been doing most of the talking..."
 * - Circling back: "I keep coming back to this—there's something here, isn't there?"
 * - Noticing patterns: "You know, every time we talk about X, you..."
 * - Checking understanding: "Am I making sense? Sometimes I explain things weird."
 * - Energy mismatch: "I'm being too intense, aren't I?"
 *
 * @module @ferni/humanization/catching-yourself
 */
import type { HumanizationContext, HumanizationDecision, HumanizationInjection } from './types.js';
export type CatchingYourselfType = 'talking_too_much' | 'circling_back' | 'noticing_pattern' | 'checking_understanding' | 'energy_mismatch';
export interface CatchingYourselfConfig {
    maxPerSession: number;
    cooldownTurns: number;
    minTurn: number;
    minComfortLevel: number;
    enabledTypes: CatchingYourselfType[];
}
export interface CatchingYourselfState {
    usageCount: number;
    usageByType: Record<CatchingYourselfType, number>;
    lastUsageTurn: number;
    agentWordCountRecent: number;
    userWordCountRecent: number;
    topicMentionCounts: Map<string, number>;
    lastComplexExplanationTurn: number;
}
export interface CatchingYourselfTrigger {
    type: CatchingYourselfType;
    /** Predicate to check if trigger conditions are met */
    shouldTrigger: (state: CatchingYourselfState, context: HumanizationContext) => boolean;
    /** Response templates */
    responses: string[];
    /** SSML templates */
    ssmlResponses: string[];
    /** Cooldown specific to this type */
    cooldownTurns: number;
    /** Max uses per session for this type */
    maxPerSession: number;
    /** Minimum comfort level */
    minComfortLevel: number;
}
export interface CatchingYourselfResult extends HumanizationInjection {
    type: 'catching_yourself';
    catchingType: CatchingYourselfType;
}
export declare class CatchingYourselfEngine {
    private state;
    private config;
    constructor(config?: Partial<CatchingYourselfConfig>);
    /**
     * Record agent response metrics
     */
    recordAgentResponse(wordCount: number, topics: string[]): void;
    /**
     * Record user message metrics
     */
    recordUserMessage(wordCount: number): void;
    /**
     * Check if any catching yourself trigger should fire
     */
    shouldApply(context: HumanizationContext): HumanizationDecision;
    /**
     * Generate catching yourself injection if appropriate
     */
    generate(context: HumanizationContext): CatchingYourselfResult | null;
    /**
     * Apply catching yourself to response
     */
    apply(response: string, catching: CatchingYourselfResult): {
        text: string;
        ssml: string;
    };
    /**
     * Set current turn (for tracking)
     */
    setCurrentTurn(turn: number): void;
    private getCurrentTurn;
    /**
     * Reset state for new session
     */
    reset(): void;
    /**
     * Get current state
     */
    getState(): CatchingYourselfState;
    private createInitialState;
}
export declare function getCatchingYourselfEngine(sessionId: string): CatchingYourselfEngine;
export declare function resetCatchingYourselfEngine(sessionId: string): void;
export declare function resetAllCatchingYourselfEngines(): void;
export default CatchingYourselfEngine;
//# sourceMappingURL=catching-yourself.d.ts.map