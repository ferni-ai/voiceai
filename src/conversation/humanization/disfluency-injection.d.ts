/**
 * Strategic Disfluency Injection
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Disfluencies like "um", "uh", "well", and "you know" aren't mistakes—they're
 * natural speech patterns that signal genuine thinking. Strategic use makes
 * complex responses feel more considered, not less intelligent.
 *
 * **When to use:**
 * - Before answering complex questions (signals processing)
 * - When navigating emotional topics (signals care)
 * - When uncertain (authenticity)
 * - Early in conversation (warming up)
 *
 * **When NOT to use:**
 * - Simple factual responses
 * - Greetings
 * - Crisis situations (need confidence)
 * - Already highly humanized content
 *
 * @module @ferni/humanization/disfluency-injection
 */
import type { HumanizationContext, HumanizationDecision, HumanizationInjection, InjectionPlacement } from './types.js';
export type DisfluencyType = 'filled_pause' | 'discourse_marker' | 'lengthening' | 'false_start' | 'repetition';
export interface DisfluencyConfig {
    /** Base probability */
    baseProbability: number;
    /** Maximum duration for audio pause (ms) */
    maxPauseDuration: number;
    /** Placement in response */
    placement: InjectionPlacement;
}
export interface DisfluencyState {
    usageCount: number;
    lastUsageTurn: number;
    recentTypes: DisfluencyType[];
}
export interface DisfluencyResult extends HumanizationInjection {
    type: 'disfluency';
    disfluencyType: DisfluencyType;
    pauseDuration: number;
}
interface DisfluencyEngineConfig {
    maxPerSession: number;
    cooldownTurns: number;
    minTurn: number;
    skipSimpleResponses: boolean;
    simpleResponseThreshold: number;
    enabledTypes: DisfluencyType[];
}
export declare class DisfluencyEngine {
    private state;
    private config;
    constructor(config?: Partial<DisfluencyEngineConfig>);
    /**
     * Decide if disfluency should be applied
     */
    shouldApply(context: HumanizationContext): HumanizationDecision;
    /**
     * Generate disfluency injection
     */
    generate(context: HumanizationContext): DisfluencyResult | null;
    /**
     * Apply disfluency to response
     */
    apply(response: string, disfluency: DisfluencyResult): {
        text: string;
        ssml: string;
    };
    /**
     * Reset state for new session
     */
    reset(): void;
    /**
     * Get current state
     */
    getState(): DisfluencyState;
    private chooseDisfluencyType;
    private choosePattern;
    private calculatePauseDuration;
}
export declare function getDisfluencyEngine(sessionId: string): DisfluencyEngine;
export declare function resetDisfluencyEngine(sessionId: string): void;
export declare function resetAllDisfluencyEngines(): void;
export default DisfluencyEngine;
//# sourceMappingURL=disfluency-injection.d.ts.map