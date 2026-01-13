/**
 * Trigger System Types
 *
 * Type definitions for the Superhuman Trigger Intelligence system.
 * Phase 1: Semantic Core - embedding-based trigger matching.
 *
 * @module TriggerTypes
 */
/**
 * A proactive trigger from persona behavior JSON
 */
export interface ProactiveTrigger {
    trigger: string;
    behavior: string;
}
/**
 * A trigger with its embedding for semantic matching
 */
export interface EmbeddedTrigger {
    name: string;
    trigger: string;
    behavior: string;
    embedding: number[];
    personaId: string;
    category: TriggerCategory;
    createdAt: Date;
    updatedAt: Date;
}
/**
 * Categories of triggers for organization and filtering
 */
export type TriggerCategory = 'emotional' | 'behavioral' | 'temporal' | 'domain' | 'relational' | 'existential' | 'growth';
/**
 * Context for trigger matching
 */
export interface TriggerContext {
    userId?: string;
    userText?: string;
    emotion?: string;
    emotionIntensity?: number;
    turnCount?: number;
    relationshipStage?: string;
    isLateNight?: boolean;
    recentTopics?: string[];
    daysSinceLastSession?: number;
    currentHour?: number;
    currentTime?: Date;
    isReturningUser?: boolean;
    userData?: Record<string, unknown>;
}
/**
 * Result of semantic trigger matching
 */
export interface SemanticMatch {
    triggerName: string;
    trigger: string;
    behavior: string;
    semanticScore: number;
    patternScore: number;
    combinedScore: number;
    matchedKeywords?: string[];
    category: TriggerCategory;
}
/**
 * Result of hybrid matching (semantic + pattern)
 */
export interface HybridMatchResult {
    bestMatch: SemanticMatch | null;
    allMatches: SemanticMatch[];
    matchingStrategy: 'semantic' | 'pattern' | 'hybrid';
    processingTimeMs: number;
    analytics?: {
        processingTimeMs?: number;
        embeddingsUsed?: boolean;
        personalContextApplied?: boolean;
        personalContextMultiplier?: number;
        [key: string]: unknown;
    };
}
/**
 * Cached trigger embedding
 */
export interface CachedTriggerEmbedding {
    triggerId: string;
    embedding: number[];
    triggerText: string;
    personaId: string;
    model: string;
    createdAt: Date;
    accessedAt: Date;
    accessCount: number;
}
/**
 * Trigger embedding cache config
 */
export interface TriggerEmbeddingCacheConfig {
    /** Maximum number of trigger embeddings to cache (default: 1000) */
    maxSize: number;
    /** TTL in milliseconds (default: 7 days - triggers don't change often) */
    ttlMs: number;
    /** Whether to persist to Firestore (default: true) */
    persistToFirestore: boolean;
    /** Firestore collection name */
    firestoreCollection: string;
}
/**
 * Semantic matching analytics
 */
export interface SemanticMatchAnalytics {
    totalSemanticMatches: number;
    totalPatternMatches: number;
    totalHybridMatches: number;
    averageSemanticScore: number;
    averagePatternScore: number;
    averageProcessingTimeMs: number;
    byCategory: Map<TriggerCategory, {
        matched: number;
        avgScore: number;
    }>;
    recentMatches: Array<{
        timestamp: Date;
        triggerName: string;
        strategy: 'semantic' | 'pattern' | 'hybrid';
        score: number;
        userTextSnippet: string;
    }>;
}
/**
 * Configuration for hybrid matching
 */
export interface HybridMatchConfig {
    /** Minimum semantic similarity to consider a match (default: 0.65) */
    semanticThreshold: number;
    /** Minimum pattern score to consider a match (default: 0.5) */
    patternThreshold: number;
    /** Weight for semantic score in combined (default: 0.6) */
    semanticWeight: number;
    /** Weight for pattern score in combined (default: 0.4) */
    patternWeight: number;
    /** Maximum matches to return (default: 5) */
    maxMatches: number;
    /** Whether to use hybrid matching (default: true) */
    enableHybrid: boolean;
    /** Fall back to pattern-only if embeddings fail (default: true) */
    fallbackToPattern: boolean;
}
/**
 * Default hybrid matching config
 */
export declare const DEFAULT_HYBRID_CONFIG: HybridMatchConfig;
/**
 * Behavior file with proactive triggers
 */
export interface BehaviorFile {
    proactive_triggers?: Record<string, ProactiveTrigger | string>;
    more_likely_when?: string[];
    never_when?: string[];
    [key: string]: unknown;
}
/**
 * Loaded trigger set from a persona
 */
export interface PersonaTriggerSet {
    personaId: string;
    triggers: Record<string, ProactiveTrigger>;
    moreLikelyWhen?: string[];
    neverWhen?: string[];
    sourceFile: string;
    loadedAt: Date;
}
//# sourceMappingURL=types.d.ts.map