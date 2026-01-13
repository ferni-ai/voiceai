/**
 * Life Context Aggregator
 *
 * Phase 6: Cross-Domain Synthesis
 *
 * Aggregates data from all domain collectors into a unified life context
 * snapshot. Computes stress indicators, overall load scores, and detects
 * cross-domain patterns.
 *
 * This is NOT reactive to words, but to LIFE CONTEXT.
 *
 * Example pattern:
 * - Maya sees poor sleep + Alex sees packed calendar + Peter sees market anxiety
 *   → Synthesis: "You're carrying a lot right now"
 *
 * @module life-context-aggregator
 */
import type { LifeContextSnapshot, DomainStressIndicator, SleepDomainData, CalendarDomainData, FinanceDomainData, GoalsDomainData, RelationshipDomainData, HabitsDomainData, AggregatorConfig } from './life-context-snapshot.js';
/**
 * Compute stress level for sleep domain
 */
declare function computeSleepStress(data: SleepDomainData): DomainStressIndicator | null;
/**
 * Compute stress level for calendar domain
 */
declare function computeCalendarStress(data: CalendarDomainData): DomainStressIndicator | null;
/**
 * Compute stress level for finance domain
 */
declare function computeFinanceStress(data: FinanceDomainData): DomainStressIndicator | null;
/**
 * Compute stress level for goals domain
 */
declare function computeGoalsStress(data: GoalsDomainData): DomainStressIndicator | null;
/**
 * Compute stress level for relationships domain
 */
declare function computeRelationshipStress(data: RelationshipDomainData): DomainStressIndicator | null;
/**
 * Compute stress level for habits domain
 */
declare function computeHabitsStress(data: HabitsDomainData): DomainStressIndicator | null;
export interface DetectedPattern {
    description: string;
    domains: string[];
    impact: 'positive' | 'negative' | 'neutral';
}
/**
 * Detect cross-domain patterns from collected data
 */
declare function detectCrossDomainPatterns(domains: LifeContextSnapshot['domains'], stressIndicators: DomainStressIndicator[]): DetectedPattern[];
/**
 * Calculate overall load score (0-1, higher = more stressed/overwhelmed)
 */
declare function calculateOverallLoadScore(stressIndicators: DomainStressIndicator[]): number;
/**
 * Calculate overall wellbeing score (0-1, higher = better)
 * This is NOT just inverse of load - it considers positive signals too
 */
declare function calculateWellbeingScore(domains: LifeContextSnapshot['domains'], loadScore: number, patterns: DetectedPattern[]): number;
/**
 * Default aggregator configuration
 */
export declare const DEFAULT_AGGREGATOR_CONFIG: AggregatorConfig;
/**
 * Aggregate all domain data into a unified life context snapshot
 */
export declare function aggregateLifeContext(userId: string, config?: Partial<AggregatorConfig>): Promise<LifeContextSnapshot>;
/**
 * Get a quick summary of life context for logging/debugging
 */
export declare function summarizeLifeContext(snapshot: LifeContextSnapshot): string;
export { computeSleepStress, computeCalendarStress, computeFinanceStress, computeGoalsStress, computeRelationshipStress, computeHabitsStress, detectCrossDomainPatterns, calculateOverallLoadScore, calculateWellbeingScore, };
//# sourceMappingURL=life-context-aggregator.d.ts.map