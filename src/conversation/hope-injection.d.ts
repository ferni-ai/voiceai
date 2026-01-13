/**
 * Hope Injection System
 *
 * > "The future isn't fixed. And neither are you."
 *
 * Subtly weaves forward-looking language during difficult moments:
 *
 * - **Future Anchoring**: Reference things they mentioned looking forward to
 * - **Possibility Language**: "when" instead of "if" where appropriate
 * - **Gentle Reframing**: Without toxic positivity
 * - **Agency Restoration**: Remind them of their capacity to change
 * - **Temporal Perspective**: This moment isn't forever
 *
 * The key: Hope without dismissing their current pain.
 *
 * @module @ferni/hope-injection
 */
export type HopeContext = 'struggle' | 'stuck' | 'hopeless' | 'grieving' | 'anxious' | 'self_critical' | 'overwhelmed' | 'general';
export type HopeType = 'future_anchor' | 'possibility' | 'agency' | 'temporal' | 'growth' | 'connection' | 'gentle_reframe';
export interface FutureAnchor {
    /** What they mentioned */
    content: string;
    /** When they mentioned it */
    turn: number;
    /** Category */
    category: 'event' | 'goal' | 'person' | 'plan' | 'dream';
    /** Sentiment */
    sentiment: 'positive' | 'neutral' | 'anxious';
}
export interface HopeInjection {
    /** Type of hope injection */
    type: HopeType;
    /** The phrase to inject */
    phrase: string;
    /** Where to place it */
    placement: 'prefix' | 'suffix' | 'weave';
    /** Confidence this is appropriate (0-1) */
    confidence: number;
}
export interface HopeGuidance {
    /** Should we inject hope? */
    shouldInject: boolean;
    /** Type of hope most appropriate */
    injectionType: HopeType | null;
    /** Specific injection */
    injection: HopeInjection | null;
    /** Context detected */
    context: HopeContext;
    /** Warning if risk of toxic positivity */
    toxicPositivityRisk: boolean;
}
export declare class HopeInjectionEngine {
    private futureAnchors;
    private lastInjectionTurn;
    private injectionCount;
    private turnCount;
    private readonly MIN_INJECTION_INTERVAL;
    private readonly MAX_INJECTIONS_PER_SESSION;
    constructor();
    /**
     * Process a message to extract future anchors
     */
    extractFutureAnchors(message: string, turnCount: number): void;
    /**
     * Analyze a message and determine if/what hope to inject
     *
     * @param userMessage - User's message
     * @param turnCount - Current turn
     * @returns Hope guidance
     */
    analyze(userMessage: string, turnCount: number): HopeGuidance;
    /**
     * Get a future anchor callback if available
     */
    getFutureAnchorCallback(): string | null;
    /**
     * Get future anchors
     */
    getAnchors(): FutureAnchor[];
    /**
     * Reset for new conversation
     */
    reset(): void;
    private detectContext;
    private assessToxicPositivityRisk;
    private selectHopeType;
    private getInjection;
}
export declare function getHopeInjectionEngine(sessionId: string): HopeInjectionEngine;
export declare function resetHopeInjectionEngine(sessionId: string): void;
export declare function clearHopeInjectionEngine(sessionId: string): void;
export declare function getActiveHopeInjectionCount(): number;
export default HopeInjectionEngine;
//# sourceMappingURL=hope-injection.d.ts.map