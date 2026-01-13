/**
 * Knowledge Graph Context Builder
 *
 * Provides "Better Than Human" memory context from the unified entity store.
 * This builder:
 * - Surfaces entities relevant to the current conversation
 * - Provides relationship context ("Mike is your brother")
 * - Injects proactive surfacing opportunities
 * - Shares detected patterns and correlations
 * - Enables cross-domain queries
 *
 * Philosophy: When user says "my brother", we should know EVERYTHING about
 * their brother - not just what was captured in a single collection.
 *
 * @module intelligence/context-builders/knowledge-graph-context
 */
import type { ContextBuilder, ContextBuilderInput, ContextInjection } from '../core/types.js';
interface KnowledgeGraphConfig {
    /** Maximum entities to inject per turn */
    maxEntities: number;
    /** Maximum facts per entity */
    maxFactsPerEntity: number;
    /** Maximum patterns to surface */
    maxPatterns: number;
    /** Minimum relevance score to include */
    minRelevanceScore: number;
    /** Enable pattern surfacing */
    enablePatterns: boolean;
    /** Enable proactive surfacing hints */
    enableProactiveSurfacing: boolean;
}
/**
 * Configure the knowledge graph context builder
 */
export declare function configureKnowledgeGraphContext(newConfig: Partial<KnowledgeGraphConfig>): void;
interface FormattedEntity {
    name: string;
    relationship?: string;
    facts: string[];
    recentContext?: string;
    salience: number;
}
/**
 * Format entity for LLM context injection
 */
declare function formatEntityForContext(entity: {
    canonicalName: string;
    specificRelation?: string;
    relationship?: string;
    topics?: string[];
    salience?: number;
    contact?: {
        phone?: string;
        email?: string;
        birthday?: string;
    };
    lastMentionedAt?: Date;
}, facts?: Array<{
    content?: string;
    key?: string;
    value?: string;
}>): FormattedEntity;
/**
 * Format entities into readable context block
 */
declare function formatEntitiesForInjection(entities: FormattedEntity[]): string;
interface FormattedPattern {
    description: string;
    strength: number;
    actionable?: string;
}
interface ProactiveSuggestion {
    entityName: string;
    reason: string;
    suggestedPhrase: string;
    urgency: 'high' | 'medium' | 'low';
}
/**
 * Build knowledge graph context
 */
declare function buildKnowledgeGraphContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
/**
 * The knowledge graph context builder.
 *
 * Provides unified entity context from the knowledge graph, including:
 * - People in user's life with facts
 * - Detected patterns and correlations
 * - Proactive memory surfacing
 * - Cross-domain relationships
 */
export declare const knowledgeGraphContextBuilder: ContextBuilder;
export { buildKnowledgeGraphContext, formatEntityForContext, formatEntitiesForInjection, type KnowledgeGraphConfig, type FormattedEntity, type FormattedPattern, type ProactiveSuggestion, };
export default knowledgeGraphContextBuilder;
//# sourceMappingURL=knowledge-graph-context.d.ts.map