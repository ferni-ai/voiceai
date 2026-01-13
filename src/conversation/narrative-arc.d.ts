/**
 * Narrative Arc Detection
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Detects narrative structure in user's speech to understand:
 * - Is the user building to a point?
 * - Are they meandering or circling?
 * - Have they reached the core of what they're trying to say?
 * - Are they digressing or avoiding?
 *
 * This helps the agent know when to listen vs. when to gently guide,
 * and when to validate that a climax/core message has been reached.
 *
 * @module NarrativeArc
 */
export type NarrativeStructure = 'building_to_point' | 'meandering' | 'circular' | 'digressing' | 'direct' | 'exploratory';
export type InterventionType = 'wait' | 'guide_back' | 'validate_climax' | 'explore_digression' | 'reflect_back' | 'check_in';
export interface NarrativePoint {
    /** Position in conversation (turn number) */
    turn: number;
    /** Key content/topic at this point */
    content: string;
    /** Emotional weight at this point */
    emotionalWeight: number;
    /** Is this related to previous points? */
    connectedness: number;
}
export interface NarrativeArcResult {
    /** Detected narrative structure */
    structure: NarrativeStructure;
    /** Is climax approaching or reached? */
    climaxApproaching: boolean;
    /** Has user reached the core of what they want to say? */
    hasReachedCore: boolean;
    /** Key themes detected */
    themes: string[];
    /** Number of times main concern was referenced */
    mainConcernReferences: number;
    /** Suggested intervention */
    suggestedIntervention: InterventionType;
    /** Specific intervention guidance */
    interventionGuidance: string;
    /** Confidence (0-1) */
    confidence: number;
}
export interface NarrativeContext {
    /** Recent utterance */
    text: string;
    /** Turn number */
    turn: number;
    /** Detected emotion */
    emotion?: string;
    /** Emotional intensity */
    emotionalIntensity?: number;
}
export declare class NarrativeArcTracker {
    private points;
    private themes;
    private mainConcernWords;
    private turnCount;
    private readonly maxPoints;
    constructor();
    /**
     * Analyze a new utterance in the narrative
     */
    analyzeUtterance(context: NarrativeContext): NarrativeArcResult;
    /**
     * Get narrative summary
     */
    getNarrativeSummary(): {
        totalTurns: number;
        dominantStructure: NarrativeStructure;
        topThemes: string[];
        emotionalArc: 'increasing' | 'decreasing' | 'stable' | 'volatile';
    };
    /**
     * Reset tracker
     */
    reset(): void;
    private extractPoint;
    private updateThemes;
    private detectStructure;
    private detectClimaxApproaching;
    private detectCoreReached;
    private countMainConcernReferences;
    private determineIntervention;
    private getTopThemes;
    private getContentOverlap;
    private inferStructureFromPoint;
}
export declare function getNarrativeArcTracker(sessionId: string): NarrativeArcTracker;
export declare function resetNarrativeArcTracker(sessionId: string): void;
export declare function resetAllNarrativeArcTrackers(): void;
export declare function hasNarrativeArcTracker(sessionId: string): boolean;
export declare function getActiveNarrativeArcCount(): number;
export default NarrativeArcTracker;
//# sourceMappingURL=narrative-arc.d.ts.map