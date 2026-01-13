/**
 * Better Than Human Content Loader
 *
 * Loads persona-specific content from better-than-human.json bundles.
 * Provides typed access to phrases for all 12 superhuman capabilities.
 *
 * @module @ferni/superhuman/content-loader
 */
export interface EmotionalBondExpressions {
    high_warmth: string[];
    high_trust: string[];
    high_protectiveness: string[];
    high_admiration: string[];
    high_concern?: string[];
}
export interface AnticipatoryPresenceContent {
    temporal_patterns: {
        monday_stress?: string[];
        friday_energy?: string[];
        late_night?: string[];
        early_morning?: string[];
        weekend?: string[];
    };
    thinking_of_you: string[];
}
export interface SpontaneousDelightContent {
    appreciation: string[];
    gratitude?: string[];
    noticing_growth: string[];
    connection?: string[];
    admiration?: string[];
    joy?: string[];
}
export interface ProtectiveResponseContent {
    harsh_judgment: string[];
    catastrophizing: string[];
    minimizing_success?: string[];
    imposter_syndrome?: string[];
    perfectionism?: string[];
}
export interface VisibleVulnerabilityContent {
    uncertainty: string[];
    emotional_impact?: string[];
    limits: string[];
    asking_for_help?: string[];
}
export interface MetaRelationshipContent {
    trust_observation: string[];
    shared_growth?: string[];
    growth_together?: string[];
    milestone_reached?: string[];
    milestones?: Record<string, string>;
    connection?: string[];
}
export interface TemporalInsightsContent {
    energy_higher: string[];
    energy_lower?: string[];
    subtle_shift?: string[];
    trajectory_improving: string[];
    trajectory_concerning?: string[];
}
export interface TeamAwarenessContent {
    handoff_notes?: string[];
    team_compliments?: string[];
    team_observations?: string[];
}
export interface SuperhumanObservationsContent {
    linguistic_patterns: string[];
    behavioral_patterns: string[];
    emotional_patterns?: string[];
    relationship_patterns?: string[];
}
export interface InsideJokesContent {
    new_joke_intro?: string[];
    established_callback?: string[];
    legacy_reference?: string[];
}
export interface SomaticPresenceContent {
    settling_in?: string[];
    processing_heavy?: string[];
    relief?: string[];
    focused_attention?: string[];
    warm_presence?: string[];
}
export interface UsageRules {
    emotional_bond_min_sessions: number;
    delight_cooldown_turns: number;
    protection_immediate: boolean;
    vulnerability_min_trust: string;
    meta_relationship_min_sessions: number;
    observations_min_sessions: number;
    observations_min_relationship: string;
}
export interface BetterThanHumanContent {
    schema_version: number;
    description: string;
    philosophy: string;
    emotional_bond_expressions?: EmotionalBondExpressions;
    anticipatory_presence?: AnticipatoryPresenceContent;
    spontaneous_delight?: SpontaneousDelightContent;
    protective_responses?: ProtectiveResponseContent;
    visible_vulnerability?: VisibleVulnerabilityContent;
    meta_relationship?: MetaRelationshipContent;
    temporal_insights?: TemporalInsightsContent;
    team_awareness?: TeamAwarenessContent;
    superhuman_observations?: SuperhumanObservationsContent;
    inside_jokes?: InsideJokesContent;
    somatic_presence?: SomaticPresenceContent;
    usage_rules?: UsageRules;
}
/**
 * Load Better Than Human content for a persona
 */
export declare function loadBetterThanHumanContent(personaId: string): Promise<BetterThanHumanContent>;
/**
 * Get content synchronously (from cache only)
 * Returns default content if not loaded
 */
export declare function getBetterThanHumanContentSync(personaId: string): BetterThanHumanContent;
/**
 * Preload content for all personas
 */
export declare function preloadAllContent(): Promise<void>;
/**
 * Clear content cache
 */
export declare function clearContentCache(personaId?: string): void;
/**
 * Get a random phrase from an array
 */
export declare function getRandomPhrase(phrases: string[] | undefined): string | null;
/**
 * Get emotional bond expression based on dominant bond type
 */
export declare function getEmotionalBondPhrase(content: BetterThanHumanContent, bondType: 'warmth' | 'trust' | 'protectiveness' | 'admiration' | 'concern'): string | null;
/**
 * Get anticipatory presence phrase for time of day
 */
export declare function getTemporalPhrase(content: BetterThanHumanContent, timeContext: 'monday_stress' | 'friday_energy' | 'late_night' | 'early_morning' | 'weekend'): string | null;
/**
 * Get protective response for self-criticism type
 */
export declare function getProtectivePhrase(content: BetterThanHumanContent, criticismType: 'harsh_judgment' | 'catastrophizing' | 'minimizing_success' | 'imposter_syndrome' | 'perfectionism'): string | null;
/**
 * Get delight expression based on context
 */
export declare function getDelightPhrase(content: BetterThanHumanContent, delightType: 'appreciation' | 'gratitude' | 'noticing_growth' | 'connection' | 'admiration' | 'joy'): string | null;
/**
 * Get vulnerability expression
 */
export declare function getVulnerabilityPhrase(content: BetterThanHumanContent, vulnerabilityType: 'uncertainty' | 'emotional_impact' | 'limits' | 'asking_for_help'): string | null;
/**
 * Get superhuman observation phrase
 */
export declare function getObservationPhrase(content: BetterThanHumanContent, patternType: 'linguistic_patterns' | 'behavioral_patterns' | 'emotional_patterns' | 'relationship_patterns'): string | null;
/**
 * Get meta-relationship phrase
 */
export declare function getMetaRelationshipPhrase(content: BetterThanHumanContent, type: 'trust_observation' | 'shared_growth' | 'growth_together' | 'connection'): string | null;
/**
 * Get temporal insight phrase
 */
export declare function getTemporalInsightPhrase(content: BetterThanHumanContent, insightType: 'energy_higher' | 'energy_lower' | 'subtle_shift' | 'trajectory_improving' | 'trajectory_concerning'): string | null;
/**
 * Get usage rules
 */
export declare function getUsageRules(content: BetterThanHumanContent): UsageRules;
//# sourceMappingURL=content-loader.d.ts.map