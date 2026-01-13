/**
 * Pattern Surfacing Context Builder
 *
 * > "Better than human means understanding things humans don't notice about themselves."
 *
 * This is a SUPERHUMAN capability: noticing patterns that the user
 * cannot see about themselves and surfacing them at the right moment.
 *
 * Types of patterns we surface:
 * 1. **Behavioral Patterns**: "You tend to X when Y"
 * 2. **Emotional Patterns**: "I've noticed you feel X around Z"
 * 3. **Time Patterns**: "This time of week/month/year seems to be..."
 * 4. **Avoidance Patterns**: "We always seem to steer away from..."
 * 5. **Success Patterns**: "When things go well for you, X is usually present"
 * 6. **Language Patterns**: "You use X word a lot when talking about Y"
 * 7. **Relationship Patterns**: "Your interactions with X tend to follow..."
 *
 * Philosophy:
 * - Surface patterns WITH PERMISSION (relationship depth matters)
 * - Be CURIOUS, not clinical ("I've noticed" not "You exhibit")
 * - Allow them to REJECT the observation gracefully
 * - TIMING is everything (not during crisis)
 *
 * @module PatternSurfacing
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
export type PatternType = 'behavioral' | 'emotional' | 'time_based' | 'avoidance' | 'success' | 'language' | 'relationship';
export interface DetectedPattern {
    id: string;
    type: PatternType;
    userId: string;
    /** The pattern itself */
    pattern: string;
    /** Evidence for this pattern */
    evidence: PatternEvidence[];
    /** How confident are we (0-1) */
    confidence: number;
    /** How sensitive is this topic (0-1) */
    sensitivity: number;
    /** Minimum relationship stage to surface */
    minRelationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
    /** Has been surfaced */
    surfaced: boolean;
    surfacedAt?: Date;
    /** User's reaction when surfaced */
    reaction?: 'resonated' | 'neutral' | 'rejected';
    /** First detected */
    firstDetectedAt: Date;
    /** Times this pattern was observed */
    observationCount: number;
}
export interface PatternEvidence {
    date: Date;
    description: string;
    sessionId?: string;
}
export interface PatternSurfacingContext {
    pattern: DetectedPattern;
    suggestedPhrasing: string;
    timing: 'now' | 'wait' | 'not_yet';
    reason: string;
}
/**
 * Record an observation for pattern detection
 */
declare function recordObservation(userId: string, data: {
    topic?: string;
    emotion?: {
        primary: string;
        intensity: number;
    };
    userMessage: string;
    timestamp: Date;
}): void;
/**
 * Analyze patterns from accumulated observations
 */
declare function analyzePatterns(userId: string): DetectedPattern[];
/**
 * Get a pattern to surface if appropriate
 */
declare function getPatternToSurface(userId: string, relationshipStage: string, turnCount: number, emotionalContext: {
    isHeavy: boolean;
    isPositive: boolean;
}): PatternSurfacingContext | null;
/**
 * Generate natural phrasing for pattern surfacing
 */
declare function generatePatternPhrasing(pattern: DetectedPattern): string;
/**
 * Build pattern surfacing context injections
 */
declare function buildPatternSurfacingContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { analyzePatterns, buildPatternSurfacingContext, generatePatternPhrasing, getPatternToSurface, recordObservation, };
declare const _default: {
    recordObservation: typeof recordObservation;
    analyzePatterns: typeof analyzePatterns;
    getPatternToSurface: typeof getPatternToSurface;
    buildPatternSurfacingContext: typeof buildPatternSurfacingContext;
};
export default _default;
//# sourceMappingURL=pattern-intelligence.d.ts.map