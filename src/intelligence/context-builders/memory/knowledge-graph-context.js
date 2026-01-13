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
import { createLogger } from '../../../utils/safe-logger.js';
import { BuilderCategory } from '../core/categories.js';
import { createHintInjection, createStandardInjection, registerContextBuilder, } from '../index.js';
const log = createLogger({ module: 'context:knowledge-graph' });
const DEFAULT_CONFIG = {
    maxEntities: 5,
    maxFactsPerEntity: 3,
    maxPatterns: 2,
    minRelevanceScore: 0.5,
    enablePatterns: true,
    enableProactiveSurfacing: true,
};
let config = { ...DEFAULT_CONFIG };
/**
 * Configure the knowledge graph context builder
 */
export function configureKnowledgeGraphContext(newConfig) {
    config = { ...config, ...newConfig };
}
/**
 * Format entity for LLM context injection
 */
function formatEntityForContext(entity, facts = []) {
    const formattedFacts = [];
    // Add relationship as fact
    if (entity.specificRelation) {
        formattedFacts.push(`Relationship: your ${entity.specificRelation}`);
    }
    else if (entity.relationship && entity.relationship !== 'other') {
        formattedFacts.push(`Relationship: ${entity.relationship}`);
    }
    // Add contact info
    if (entity.contact?.phone) {
        formattedFacts.push(`Phone: ${entity.contact.phone}`);
    }
    if (entity.contact?.birthday) {
        formattedFacts.push(`Birthday: ${entity.contact.birthday}`);
    }
    // Add extracted facts
    for (const fact of facts.slice(0, config.maxFactsPerEntity)) {
        if (fact.content) {
            formattedFacts.push(fact.content);
        }
        else if (fact.key && fact.value) {
            formattedFacts.push(`${fact.key}: ${fact.value}`);
        }
    }
    // Add recent context
    let recentContext;
    if (entity.lastMentionedAt) {
        const daysSince = Math.floor((Date.now() - new Date(entity.lastMentionedAt).getTime()) / (1000 * 60 * 60 * 24));
        if (daysSince === 0) {
            recentContext = 'mentioned today';
        }
        else if (daysSince === 1) {
            recentContext = 'mentioned yesterday';
        }
        else if (daysSince < 7) {
            recentContext = `mentioned ${daysSince} days ago`;
        }
        else if (daysSince < 30) {
            recentContext = `mentioned ${Math.floor(daysSince / 7)} weeks ago`;
        }
    }
    return {
        name: entity.canonicalName,
        relationship: entity.specificRelation,
        facts: formattedFacts,
        recentContext,
        salience: entity.salience || 0.5,
    };
}
/**
 * Format entities into readable context block
 */
function formatEntitiesForInjection(entities) {
    if (entities.length === 0)
        return '';
    const lines = ['[PEOPLE IN USER\'S LIFE - Use this knowledge naturally]'];
    for (const entity of entities) {
        const factStr = entity.facts.length > 0 ? `\n   • ${entity.facts.join('\n   • ')}` : '';
        const recentStr = entity.recentContext ? ` (${entity.recentContext})` : '';
        lines.push(`👤 ${entity.name}${recentStr}${factStr}`);
    }
    return lines.join('\n');
}
/**
 * Format patterns for context injection
 */
function formatPatternsForInjection(patterns) {
    if (patterns.length === 0)
        return '';
    const lines = ['[PATTERNS YOU\'VE NOTICED - Surface if relevant]'];
    for (const pattern of patterns) {
        lines.push(`🔍 ${pattern.description}`);
        if (pattern.actionable) {
            lines.push(`   → ${pattern.actionable}`);
        }
    }
    return lines.join('\n');
}
/**
 * Format proactive suggestions for context
 */
function formatProactiveSuggestions(suggestions) {
    if (suggestions.length === 0)
        return '';
    const lines = ['[PROACTIVE MEMORY - Bring up naturally if appropriate]'];
    for (const suggestion of suggestions) {
        const urgencyEmoji = suggestion.urgency === 'high' ? '❗' : suggestion.urgency === 'medium' ? '💡' : '💭';
        lines.push(`${urgencyEmoji} ${suggestion.reason}`);
        lines.push(`   Try: "${suggestion.suggestedPhrase}"`);
    }
    return lines.join('\n');
}
// ============================================================================
// CONTEXT BUILDER
// ============================================================================
/**
 * Build knowledge graph context
 */
async function buildKnowledgeGraphContext(input) {
    const { userText, services, userData, analysis } = input;
    const injections = [];
    const userId = services?.userId;
    const turnCount = userData?.turnCount || 0;
    if (!userId) {
        return [];
    }
    try {
        // Import entity store modules dynamically
        const { isEntityStoreReady } = await import('../../../memory/entity-store/integration.js');
        if (!isEntityStoreReady()) {
            log.debug('Entity store not ready, skipping knowledge graph context');
            return [];
        }
        const { searchEntities, getMentionsForEntity } = await import('../../../memory/entity-store/storage.js');
        // 1. Find entities relevant to current conversation
        const relevantEntities = await searchEntities(userId, userText, {
            types: ['person', 'event', 'commitment', 'goal'],
            limit: config.maxEntities * 2, // Get more, filter by score
        });
        // Filter by relevance score (using salience which is the property on Entity)
        const highRelevanceEntities = relevantEntities.filter((e) => (e.salience || 0.5) >= config.minRelevanceScore);
        if (highRelevanceEntities.length > 0) {
            // Get facts for each entity
            const formattedEntities = [];
            for (const entity of highRelevanceEntities.slice(0, config.maxEntities)) {
                // Get recent mentions for facts
                const mentions = await getMentionsForEntity(userId, entity.id, 10);
                const facts = mentions.flatMap((m) => m.facts || []);
                formattedEntities.push(formatEntityForContext(entity, facts));
            }
            // Create entity context injection
            const entityContext = formatEntitiesForInjection(formattedEntities);
            if (entityContext) {
                injections.push(createStandardInjection('knowledge_graph_entities', entityContext, {
                    category: 'memory',
                    confidence: 0.85,
                }));
            }
            log.debug({ userId, entityCount: formattedEntities.length }, 'Injected knowledge graph entities');
        }
        // 2. Get detected patterns (if enabled)
        if (config.enablePatterns) {
            try {
                const { getCorrelationEngine } = await import('../../../memory/entity-store/correlation-engine.js');
                const correlationEngine = getCorrelationEngine();
                const correlations = await correlationEngine.getCorrelations(userId, {
                    minStrength: 0.6,
                    limit: config.maxPatterns,
                });
                if (correlations.length > 0) {
                    const formattedPatterns = correlations.map((c) => ({
                        description: c.description,
                        strength: c.strength,
                        actionable: c.pattern?.behavioral,
                    }));
                    const patternContext = formatPatternsForInjection(formattedPatterns);
                    if (patternContext) {
                        injections.push(createHintInjection('knowledge_graph_patterns', patternContext, {
                            category: 'cognitive',
                            confidence: correlations[0].confidence,
                        }));
                    }
                }
            }
            catch (error) {
                // Correlation engine may not be available
                log.debug({ error: String(error) }, 'Correlation retrieval failed (non-blocking)');
            }
        }
        // 3. Get proactive surfacing suggestions (if enabled)
        if (config.enableProactiveSurfacing && turnCount > 0) {
            try {
                const { checkProactiveSurfacing } = await import('../../../memory/entity-store/integration.js');
                const opportunities = await checkProactiveSurfacing(userId, userText, {
                    sessionId: services?.sessionId || '',
                    personaId: input.persona?.id || 'ferni',
                    turnNumber: turnCount,
                    surfacingCountThisSession: 0, // Track externally if needed
                    sessionTopics: analysis?.topics?.detected || [],
                    conversationMood: analysis?.state?.currentMood || undefined,
                });
                // Convert to suggestions format using available SurfacingOpportunity properties
                const suggestions = opportunities
                    .filter((o) => (o.receptivityScore ?? 0.5) >= 0.7)
                    .slice(0, 2)
                    .map((o) => ({
                    entityName: o.entity.canonicalName,
                    reason: `${o.type.replace(/_/g, ' ')} opportunity`,
                    suggestedPhrase: o.naturalPhrasing || `How is ${o.entity.canonicalName}?`,
                    urgency: o.timing === 'immediate' ? 'high' : o.timing === 'soon' ? 'medium' : 'low',
                }));
                if (suggestions.length > 0) {
                    const proactiveContext = formatProactiveSuggestions(suggestions);
                    injections.push(createHintInjection('proactive_memory_surfacing', proactiveContext, {
                        category: 'memory',
                        confidence: 0.75,
                    }));
                }
            }
            catch (error) {
                log.debug({ error: String(error) }, 'Proactive surfacing failed (non-blocking)');
            }
        }
        // 4. Add cross-reference hints for related entities
        if (highRelevanceEntities.length > 0) {
            try {
                const { getRelationshipsForEntity } = await import('../../../memory/entity-store/storage.js');
                const crossRefs = [];
                for (const entity of highRelevanceEntities.slice(0, 3)) {
                    const relationships = await getRelationshipsForEntity(userId, entity.id);
                    for (const rel of relationships.slice(0, 2)) {
                        if (rel.label) {
                            crossRefs.push(`${entity.canonicalName} ${rel.label} (${rel.relationshipType})`);
                        }
                    }
                }
                if (crossRefs.length > 0) {
                    injections.push(createHintInjection('entity_relationships', `[CONNECTIONS]\n${crossRefs.join('\n')}`, { category: 'memory', confidence: 0.7 }));
                }
            }
            catch (error) {
                log.debug({ error: String(error) }, 'Relationship retrieval failed (non-blocking)');
            }
        }
        return injections;
    }
    catch (error) {
        log.warn({ error: error instanceof Error ? error.message : String(error), userId }, 'Knowledge graph context builder failed');
        return [];
    }
}
// ============================================================================
// BUILDER REGISTRATION
// ============================================================================
/**
 * The knowledge graph context builder.
 *
 * Provides unified entity context from the knowledge graph, including:
 * - People in user's life with facts
 * - Detected patterns and correlations
 * - Proactive memory surfacing
 * - Cross-domain relationships
 */
export const knowledgeGraphContextBuilder = {
    name: 'knowledge-graph',
    description: 'Provides unified entity context from knowledge graph for superhuman memory',
    priority: 28, // Run early in memory category, just after unified-memory-orchestrator (30)
    category: BuilderCategory.MEMORY,
    build: buildKnowledgeGraphContext,
};
// Register the builder
registerContextBuilder(knowledgeGraphContextBuilder);
// ============================================================================
// EXPORTS
// ============================================================================
export { buildKnowledgeGraphContext, formatEntityForContext, formatEntitiesForInjection, };
export default knowledgeGraphContextBuilder;
//# sourceMappingURL=knowledge-graph-context.js.map