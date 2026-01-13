/**
 * Synthesis Trigger Generator
 *
 * Phase 6: Cross-Domain Synthesis
 *
 * Generates synthesis triggers based on life context patterns.
 * These triggers respond to LIFE CONTEXT, not just words.
 *
 * Example:
 * - Maya sees poor sleep + Alex sees packed calendar + Peter sees market anxiety
 *   → Generate trigger: "support" with "You're carrying a lot right now"
 *
 * Key categories:
 * - support: User needs emotional/practical support
 * - celebration: Positive momentum worth acknowledging
 * - warning: Early intervention for emerging issues
 * - connection: User may need social connection
 * - rest: User needs to slow down
 *
 * @module synthesis-trigger-generator
 */
import type { LifeContextSnapshot, SynthesisTrigger, AggregatorConfig } from './life-context-snapshot.js';
interface TriggerTemplate {
    id: string;
    category: SynthesisTrigger['category'];
    priority: SynthesisTrigger['priority'];
    condition: (snapshot: LifeContextSnapshot) => {
        matches: boolean;
        confidence: number;
        reasoning: string;
    };
    suggestedResponses: string[];
    recommendedPersona: string;
    contributingDomains: string[];
}
/**
 * Support trigger templates - for when user needs help
 */
declare const supportTriggerTemplates: TriggerTemplate[];
/**
 * Celebration trigger templates - for positive momentum
 */
declare const celebrationTriggerTemplates: TriggerTemplate[];
/**
 * Nuanced edge case triggers - subtle patterns and transitions
 */
declare const nuancedTriggerTemplates: TriggerTemplate[];
/**
 * Warning trigger templates - early intervention
 */
declare const warningTriggerTemplates: TriggerTemplate[];
/**
 * All trigger templates combined
 */
declare const allTriggerTemplates: TriggerTemplate[];
/**
 * Generate synthesis triggers from life context snapshot
 */
export declare function generateSynthesisTriggers(snapshot: LifeContextSnapshot, config?: Partial<AggregatorConfig>): SynthesisTrigger[];
/**
 * Populate synthesizedTriggers field in a life context snapshot
 */
export declare function populateSynthesisTriggers(snapshot: LifeContextSnapshot, config?: Partial<AggregatorConfig>): LifeContextSnapshot;
/**
 * Get the most important trigger from a snapshot
 */
export declare function getMostImportantTrigger(snapshot: LifeContextSnapshot): SynthesisTrigger | null;
/**
 * Get triggers by category
 */
export declare function getTriggersByCategory(snapshot: LifeContextSnapshot, category: SynthesisTrigger['category']): SynthesisTrigger[];
/**
 * Get triggers recommended for a specific persona
 */
export declare function getTriggersForPersona(snapshot: LifeContextSnapshot, personaId: string): SynthesisTrigger[];
interface SynthesisAnalytics {
    totalTriggersGenerated: number;
    byCategory: Record<SynthesisTrigger['category'], number>;
    byPriority: Record<SynthesisTrigger['priority'], number>;
    byPersona: Record<string, number>;
    averageConfidence: number;
    mostCommonTriggers: Array<{
        id: string;
        count: number;
    }>;
}
/**
 * Record triggers for analytics
 */
export declare function recordSynthesisTriggers(triggers: SynthesisTrigger[]): void;
/**
 * Get synthesis analytics
 */
export declare function getSynthesisAnalytics(): SynthesisAnalytics;
/**
 * Reset analytics (for testing)
 */
export declare function resetSynthesisAnalytics(): void;
export { allTriggerTemplates, supportTriggerTemplates, celebrationTriggerTemplates, warningTriggerTemplates, nuancedTriggerTemplates, };
export type { TriggerTemplate, SynthesisAnalytics };
//# sourceMappingURL=synthesis-trigger-generator.d.ts.map