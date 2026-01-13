/**
 * Memory Orchestrator
 *
 * Single entry point for all memory operations.
 * Coordinates all memory subsystems to provide unified, deduplicated context.
 *
 * Philosophy: The brain doesn't have separate "semantic memory", "emotional memory",
 * and "episodic memory" departments that each send their own memo. It integrates
 * everything into a coherent stream of consciousness. This orchestrator does the same
 * for Ferni's memory.
 *
 * @module memory/orchestrator
 */
import { createLogger } from '../utils/safe-logger.js';
// Import implementations
import { retrieveMemories, getConversationPrimingMemories, } from './advanced-retrieval.js';
// Entity Store - Unified Better Than Human memory
import { isEntityStoreReady, retrieveMemoriesUnified } from './entity-store/integration.js';
import { getRetrievalExplainer } from './retrieval-explanations.js';
import { getSessionPrimer } from './session-priming.js';
import { getUnifiedEmotionalMemory } from './emotional-memory-unified.js';
import { getAssociativeMemory } from './associative-memory.js';
import { getCommunicationPreferences, } from './communication-preferences.js';
import { getEmotionalThreading } from './emotional-threading.js';
import { getBehavioralPatternDetector } from './behavioral-pattern-detector.js';
import { getNaturalReferenceGenerator } from './natural-reference-generator.js';
import { getLLMSignalExtractor } from './llm-signal-extractor.js';
const log = createLogger({ module: 'MemoryOrchestrator' });
const DEFAULT_CONFIG = {
    maxPrimaryMemories: 5,
    maxCallbacks: 3,
    minMemoryScore: 0.3,
    includeBehavioralPatterns: true,
    includeCommunicationPreferences: true,
};
// ============================================================================
// MEMORY ORCHESTRATOR IMPLEMENTATION
// ============================================================================
export class MemoryOrchestratorImpl {
    config;
    explainer = getRetrievalExplainer();
    sessionPrimer = getSessionPrimer();
    referenceGenerator = getNaturalReferenceGenerator();
    signalExtractor = getLLMSignalExtractor();
    // Per-user subsystems (accessed via getters)
    associativeMemories = new Map();
    commPreferences = new Map();
    emotionalThreading = new Map();
    patternDetectors = new Map();
    constructor(config) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * Main recall function - coordinates all memory subsystems
     */
    async recall(context) {
        const { userId, profile, query, currentTopic, currentEmotion, personaId, conversationTurn, isSessionStart, recentSummaries, } = context;
        log.debug({ userId, isSessionStart, turn: conversationTurn }, 'Memory recall started');
        // 1. Get raw memories from different sources
        const rawMemories = await this.gatherMemories(context);
        // 2. Explain and enhance memories
        const explainedMemories = this.explainer.explainAll(rawMemories, context);
        // 3. Deduplicate and rank
        const rankedMemories = this.rankAndDeduplicate(explainedMemories);
        // 4. Get session priming if session start
        let priming = null;
        if (isSessionStart && profile && recentSummaries) {
            try {
                const memoryItems = rawMemories.map((m) => m.item);
                priming = await this.sessionPrimer.generatePrimingContext(profile, memoryItems, recentSummaries);
            }
            catch (error) {
                log.warn({ error: String(error) }, 'Session priming failed');
            }
        }
        // 5. Get emotional context
        const emotional = await this.getEmotionalContext(userId, personaId);
        // 6. Get behavioral patterns
        let activePatterns = [];
        if (this.config.includeBehavioralPatterns) {
            const detector = this.getPatternDetector(userId);
            activePatterns = await detector.getPatterns(userId);
            // Filter to high-confidence patterns
            activePatterns = activePatterns.filter((p) => p.confidence > 0.4);
        }
        // 7. Separate primary memories from callback suggestions
        const { primary, callbacks } = this.categorizeMemories(rankedMemories, context, conversationTurn || 0);
        // 8. Generate natural references for callbacks
        const callbacksWithReferences = callbacks.map((memory) => {
            const ref = this.referenceGenerator.generate(memory, {
                userMood: currentEmotion || 'neutral',
                relationshipStage: profile?.relationshipStage || 'building',
                personaId: personaId || 'ferni',
                conversationTone: 'neutral',
            });
            return {
                memory,
                suggestedReference: ref.reference,
                timing: this.determineCallbackTiming(memory, conversationTurn || 0),
                priority: memory.score,
            };
        });
        // 9. Format for prompt injection
        const formattedContext = this.formatForPrompt(primary, callbacksWithReferences, emotional, activePatterns, priming);
        log.info({
            userId,
            primaryCount: primary.length,
            callbackCount: callbacks.length,
            hasEmotionalContext: !!emotional.threads.length,
            patternCount: activePatterns.length,
        }, 'Memory recall complete');
        return {
            primaryMemories: primary,
            callbacks: callbacksWithReferences,
            priming,
            emotional,
            activePatterns,
            formattedContext,
        };
    }
    /**
     * Record an interaction for memory learning
     */
    async recordInteraction(context) {
        const { userId, turns, sessionEmotion, personaId, sessionId, sessionEndState } = context;
        // 1. Extract signals from conversation AND route to Superhuman Services
        try {
            const signals = await this.signalExtractor.extractSignals(turns, {
                userId,
                personaId,
                sessionEmotion,
            });
            log.debug({
                userId,
                dates: signals.importantDates.length,
                values: signals.values.length,
                dreams: signals.dreams.length,
            }, 'Extracted signals from conversation');
            // Route signals to Superhuman Services for "Better than Human" capabilities
            // This feeds: Dream Keeper, Values Alignment, Relationship Network, Capacity Guardian
            const { routeSignalsToSuperhuman } = await import('./superhuman-signal-router.js');
            await routeSignalsToSuperhuman(userId, signals);
        }
        catch (error) {
            log.warn({ error: String(error) }, 'Signal extraction failed');
        }
        // 2. Update associative memory
        const associative = this.getAssociativeMemory(userId);
        // Register triggers from conversation content
        for (const turn of turns.filter((t) => t.role === 'user')) {
            // This is handled internally by associative memory
        }
        // 3. Update behavioral patterns
        const detector = this.getPatternDetector(userId);
        const existingPatterns = await detector.getPatterns(userId);
        const updatedPatterns = await detector.analyzeForPatterns(turns, existingPatterns);
        await detector.savePatterns(userId, updatedPatterns);
        // 4. Record emotional threading
        if (sessionId && sessionEndState) {
            const threading = this.getEmotionalThreading(userId);
            const unresolvedTopics = this.extractUnresolvedTopics(turns);
            await threading.recordSessionEnd({
                userId,
                sessionId,
                dominantEmotion: sessionEmotion || 'neutral',
                endState: sessionEndState,
                unresolvedTopics,
            });
        }
        log.info({ userId, turnCount: turns.length }, 'Recorded interaction');
    }
    /**
     * Get memory health stats
     */
    async getMemoryHealth(userId) {
        // This would query the actual memory stores
        // For now, return placeholders
        return {
            totalMemories: 0,
            recentMemories: 0,
            strongMemories: 0,
            emotionalMemories: 0,
            commitments: 0,
        };
    }
    // ============================================================================
    // PRIVATE: MEMORY GATHERING
    // ============================================================================
    /**
     * Gather memories from all sources
     */
    async gatherMemories(context) {
        const { userId, query, isSessionStart, personaId, currentTopic, currentEmotion } = context;
        const memories = [];
        // ═══════════════════════════════════════════════════════════════════════════
        // 0. ENTITY STORE (Primary - Better Than Human unified memory)
        // Uses Graph-RAG for state-of-the-art retrieval
        // ═══════════════════════════════════════════════════════════════════════════
        if (query && isEntityStoreReady()) {
            try {
                const { entities, formattedContext } = await retrieveMemoriesUnified(userId, query, {
                    currentTopic,
                    currentEmotion,
                    personaId,
                    conversationTurn: context.conversationTurn,
                    recentTopics: context.recentTopics,
                });
                // Convert entity results to RetrievedMemory format
                for (const result of entities) {
                    // Build content from entity - entityToContent expects specific shape
                    const entityForContent = {
                        canonicalName: result.entity.canonicalName || result.entity.id,
                        type: result.entity.type,
                        attributes: {
                            _type: result.entity.type,
                            relationship: result.entity.relationship,
                            specificRelation: result.entity.specificRelation,
                        },
                    };
                    const entityMemory = {
                        id: `entity:${result.entity.id}`,
                        type: this.mapEntityTypeToMemoryType(result.entity.type),
                        content: this.entityToContent(entityForContent),
                        timestamp: new Date(result.entity.lastSeen),
                        emotionalWeight: result.entity.emotionalWeight,
                        relevanceDecay: 0, // Already factored into score
                        baseImportance: result.entity.salienceScore,
                        source: { collection: 'entities', documentId: result.entity.id },
                    };
                    memories.push({
                        item: entityMemory,
                        score: result.score,
                        scoreBreakdown: {
                            semantic: result.scoreBreakdown.semantic,
                            temporal: result.scoreBreakdown.temporal,
                            emotional: result.scoreBreakdown.emotional,
                            contextual: result.scoreBreakdown.graphDistance > 0 ? 0.8 : 1.0,
                        },
                        reason: result.reason,
                        triggerType: 'semantic',
                    });
                }
                log.debug({ userId: userId.substring(0, 8), entityResults: entities.length }, '🧠 Entity store retrieval complete');
            }
            catch (error) {
                log.warn({ error: String(error) }, 'Entity store retrieval failed, continuing with legacy');
            }
        }
        // ═══════════════════════════════════════════════════════════════════════════
        // 1. LEGACY: Semantic retrieval (for backward compatibility)
        // TODO: Remove after full entity store migration
        // ═══════════════════════════════════════════════════════════════════════════
        try {
            const semanticMemories = await retrieveMemories(userId, context);
            // Only add if not already found in entity store
            for (const mem of semanticMemories) {
                if (!memories.some((m) => m.item.content === mem.item.content)) {
                    memories.push(mem);
                }
            }
        }
        catch (error) {
            log.warn({ error: String(error) }, 'Semantic retrieval failed');
        }
        // 2. Associative memory triggers
        if (query) {
            try {
                const associative = this.getAssociativeMemory(userId);
                const triggered = await associative.getTriggeredMemories(query, context);
                for (const t of triggered) {
                    // Convert to RetrievedMemory format
                    memories.push({
                        item: t.memory,
                        score: t.activationStrength,
                        scoreBreakdown: {
                            semantic: 0,
                            temporal: 0.5,
                            emotional: t.memory.emotionalWeight,
                            contextual: 0.5,
                            associative: t.activationStrength,
                        },
                        reason: `Triggered by: ${t.trigger.triggerValue}`,
                        triggerType: 'associative',
                    });
                }
            }
            catch (error) {
                log.debug({ error: String(error) }, 'Associative retrieval failed');
            }
        }
        // 3. Priming memories (for session start)
        if (isSessionStart) {
            try {
                const primingMemories = getConversationPrimingMemories(userId, personaId || 'ferni', {
                    maxMemories: 3,
                    sessionCount: context.sessionCount ?? 0,
                });
                for (const item of primingMemories) {
                    // Avoid duplicates
                    if (!memories.some((m) => m.item.id === item.id)) {
                        memories.push({
                            item,
                            score: 0.7, // Priming memories get good score
                            scoreBreakdown: {
                                semantic: 0.5,
                                temporal: 0.7,
                                emotional: item.emotionalWeight,
                                contextual: 0.6,
                            },
                            reason: 'Session priming',
                        });
                    }
                }
            }
            catch (error) {
                log.debug({ error: String(error) }, 'Priming retrieval failed');
            }
        }
        return memories;
    }
    // ============================================================================
    // PRIVATE: RANKING AND DEDUPLICATION
    // ============================================================================
    /**
     * Rank and deduplicate memories
     */
    rankAndDeduplicate(memories) {
        // Group by content similarity
        const seen = new Set();
        const unique = [];
        // Sort by score first
        const sorted = [...memories].sort((a, b) => b.score - a.score);
        for (const memory of sorted) {
            // Create a simple hash of content
            const contentKey = memory.item.content.toLowerCase().slice(0, 100);
            if (!seen.has(contentKey)) {
                seen.add(contentKey);
                unique.push(memory);
            }
        }
        return unique;
    }
    /**
     * Categorize memories into primary and callbacks
     */
    categorizeMemories(memories, context, turnCount) {
        const primary = [];
        const callbacks = [];
        for (const memory of memories) {
            if (memory.score < this.config.minMemoryScore)
                continue;
            // High-score, direct relevance -> primary
            if (memory.score > 0.6 || memory.connectionStrength === 'strong') {
                if (primary.length < this.config.maxPrimaryMemories) {
                    primary.push(memory);
                }
                else if (callbacks.length < this.config.maxCallbacks) {
                    callbacks.push(memory);
                }
            }
            // Lower relevance -> callback candidate
            else if (callbacks.length < this.config.maxCallbacks) {
                callbacks.push(memory);
            }
        }
        // Only suggest callbacks after turn 3
        if (turnCount < 3) {
            return { primary, callbacks: [] };
        }
        return { primary, callbacks };
    }
    /**
     * Determine when a callback should be used
     */
    determineCallbackTiming(memory, turnCount) {
        // Commitments are good for opening
        if (memory.item.commitment) {
            return 'opening';
        }
        // Emotional memories are good when relevant
        if (memory.item.emotionalWeight > 0.6) {
            return 'when_relevant';
        }
        // Topic matches are good when relevant
        if (memory.connectionType === 'topic_match') {
            return 'when_relevant';
        }
        // Default
        return 'when_relevant';
    }
    // ============================================================================
    // PRIVATE: EMOTIONAL CONTEXT
    // ============================================================================
    /**
     * Get unified emotional context
     */
    async getEmotionalContext(userId, personaId) {
        // Get emotional memory
        const emotionalMemory = getUnifiedEmotionalMemory({
            userId,
            personaId: personaId || 'ferni',
        });
        const state = emotionalMemory.getState();
        // Get emotional threading
        const threading = this.getEmotionalThreading(userId);
        const sessionContext = await threading.getSessionContext(userId);
        // Get communication preferences
        let approachGuidance = null;
        if (this.config.includeCommunicationPreferences) {
            const prefs = getCommunicationPreferences();
            approachGuidance = await prefs.getApproachGuidance(userId, {
                emotion: state.user.recentEmotions[0],
            });
        }
        return {
            userState: {
                recentEmotions: state.user.recentEmotions,
                unresolvedConcerns: state.user.unresolvedConcerns,
                celebratableWins: state.user.celebratableWins,
                emotionalTrend: state.user.patterns[0]?.trend || 'unknown',
            },
            bondState: {
                warmth: state.bond.warmth,
                trust: state.bond.trust,
                protectiveness: state.bond.protectiveness,
                admiration: state.bond.admiration,
                concern: state.bond.concern,
                sessionCount: state.bond.sessionCount,
                stage: this.mapRelationshipStage(state.bond.stage),
            },
            threads: sessionContext.activeThreads,
            approachGuidance,
        };
    }
    // ============================================================================
    // PRIVATE: FORMATTING
    // ============================================================================
    /**
     * Format everything for prompt injection
     */
    formatForPrompt(primary, callbacks, emotional, patterns, priming) {
        const sections = [];
        // Primary memories
        if (primary.length > 0) {
            const memoryLines = primary.map((m) => `- ${m.suggestedReference}`);
            sections.push(`[RELEVANT MEMORIES]\n${memoryLines.join('\n')}`);
        }
        // Callback suggestions
        if (callbacks.length > 0) {
            const callbackLines = callbacks.map((c) => `- ${c.suggestedReference}`);
            sections.push(`[MEMORY CALLBACKS - Use naturally if appropriate]\n${callbackLines.join('\n')}`);
        }
        // Emotional context
        if (emotional.threads.length > 0 || emotional.userState.unresolvedConcerns.length > 0) {
            const emotionalLines = [];
            if (emotional.threads.length > 0) {
                const thread = emotional.threads[0];
                emotionalLines.push(`- Unresolved emotional topic: ${thread.topic} (${thread.emotion})`);
            }
            if (emotional.userState.unresolvedConcerns.length > 0) {
                emotionalLines.push(`- Concerns to be aware of: ${emotional.userState.unresolvedConcerns.join(', ')}`);
            }
            if (emotional.userState.celebratableWins.length > 0) {
                emotionalLines.push(`- Wins to potentially celebrate: ${emotional.userState.celebratableWins.join(', ')}`);
            }
            sections.push(`[EMOTIONAL CONTEXT]\n${emotionalLines.join('\n')}`);
        }
        // Behavioral patterns
        if (patterns.length > 0) {
            const patternLines = patterns
                .slice(0, 2)
                .map((p) => `- Pattern: "${p.description}" → ${p.suggestedResponse}`);
            sections.push(`[BEHAVIORAL AWARENESS]\n${patternLines.join('\n')}`);
        }
        // Approach guidance
        if (emotional.approachGuidance) {
            const guidance = emotional.approachGuidance;
            const guidanceLines = [];
            if (guidance.embrace.length > 0) {
                guidanceLines.push(`Do: ${guidance.embrace.slice(0, 2).join('; ')}`);
            }
            if (guidance.avoid.length > 0) {
                guidanceLines.push(`Avoid: ${guidance.avoid.slice(0, 2).join('; ')}`);
            }
            if (guidanceLines.length > 0) {
                sections.push(`[APPROACH GUIDANCE]\n${guidanceLines.join('\n')}`);
            }
        }
        // Session priming (opening suggestions)
        if (priming) {
            if (priming.suggestedOpener) {
                sections.push(`[SUGGESTED OPENER]\n${priming.suggestedOpener}`);
            }
            if (priming.sensitiveTopics.length > 0) {
                sections.push(`[SENSITIVE - Be careful with]\n${priming.sensitiveTopics.join(', ')}`);
            }
        }
        return sections.join('\n\n');
    }
    /**
     * Map entity type to memory item type
     */
    mapEntityTypeToMemoryType(entityType) {
        const typeMap = {
            person: 'person',
            commitment: 'commitment',
            event: 'event',
            value: 'topic',
            dream: 'topic',
            pattern: 'topic',
            preference: 'preference',
            memory: 'moment',
            topic: 'topic',
            emotion: 'topic',
            goal: 'commitment',
            place: 'topic',
        };
        return typeMap[entityType] || 'topic';
    }
    /**
     * Convert entity to memory content string
     */
    entityToContent(entity) {
        const parts = [entity.canonicalName];
        const attrs = entity.attributes;
        switch (attrs._type) {
            case 'person': {
                const personAttrs = attrs;
                if (personAttrs.relationship)
                    parts.push(`(${personAttrs.relationship})`);
                if (personAttrs.lastKnownStatus)
                    parts.push(`- ${personAttrs.lastKnownStatus}`);
                if (personAttrs.recentContext?.length)
                    parts.push(`Recent: ${personAttrs.recentContext[0]}`);
                break;
            }
            case 'commitment': {
                const commitAttrs = attrs;
                if (commitAttrs.originalStatement)
                    parts.push(`- ${commitAttrs.originalStatement}`);
                if (commitAttrs.status)
                    parts.push(`[${commitAttrs.status}]`);
                break;
            }
            case 'event': {
                const eventAttrs = attrs;
                if (eventAttrs.eventType)
                    parts.push(`(${eventAttrs.eventType})`);
                if (eventAttrs.date)
                    parts.push(`on ${new Date(eventAttrs.date).toLocaleDateString()}`);
                break;
            }
            case 'memory': {
                const memAttrs = attrs;
                if (memAttrs.content)
                    parts.push(`- ${memAttrs.content.substring(0, 200)}`);
                break;
            }
            case 'pattern': {
                const patternAttrs = attrs;
                if (patternAttrs.description)
                    parts.push(`- ${patternAttrs.description}`);
                break;
            }
        }
        return parts.join(' ');
    }
    /**
     * Map relationship stage from unified emotional memory to our interface type
     */
    mapRelationshipStage(stage) {
        const stageMap = {
            new_acquaintance: 'new',
            new: 'new',
            acquaintance: 'building',
            building: 'building',
            friend: 'established',
            established: 'established',
            close_friend: 'deep',
            deep: 'deep',
            confidant: 'deep',
        };
        return stageMap[stage] || 'building';
    }
    // ============================================================================
    // PRIVATE: HELPERS
    // ============================================================================
    /**
     * Extract topics that seem unresolved
     */
    extractUnresolvedTopics(turns) {
        const topics = [];
        // Look for questions that weren't answered
        for (let i = 0; i < turns.length; i++) {
            const turn = turns[i];
            if (turn.role === 'user' && turn.content.includes('?')) {
                // Check if next turn addresses it
                const nextTurn = turns[i + 1];
                if (!nextTurn) {
                    // No response - definitely unresolved
                    const question = turn.content.match(/[^.!?]*\?/)?.[0];
                    if (question)
                        topics.push(question.slice(0, 50));
                }
            }
        }
        // Look for heavy emotional content
        const heavyIndicators = ['worried', 'scared', 'anxious', 'stressed', 'overwhelmed', 'sad'];
        for (const turn of turns.filter((t) => t.role === 'user')) {
            for (const indicator of heavyIndicators) {
                if (turn.content.toLowerCase().includes(indicator)) {
                    // Extract context
                    const match = turn.content.match(new RegExp(`\\b\\w+\\s+${indicator}\\s+(?:about\\s+)?([^.!?]+)`, 'i'));
                    if (match) {
                        topics.push(match[1].slice(0, 50));
                    }
                }
            }
        }
        return [...new Set(topics)].slice(0, 3);
    }
    // Subsystem getters
    getAssociativeMemory(userId) {
        if (!this.associativeMemories.has(userId)) {
            this.associativeMemories.set(userId, getAssociativeMemory(userId));
        }
        return this.associativeMemories.get(userId);
    }
    getEmotionalThreading(userId) {
        if (!this.emotionalThreading.has(userId)) {
            this.emotionalThreading.set(userId, getEmotionalThreading());
        }
        return this.emotionalThreading.get(userId);
    }
    getPatternDetector(userId) {
        if (!this.patternDetectors.has(userId)) {
            this.patternDetectors.set(userId, getBehavioralPatternDetector());
        }
        return this.patternDetectors.get(userId);
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
let defaultOrchestrator = null;
export function getMemoryOrchestrator() {
    if (!defaultOrchestrator) {
        defaultOrchestrator = new MemoryOrchestratorImpl();
    }
    return defaultOrchestrator;
}
export function resetMemoryOrchestrator() {
    defaultOrchestrator = null;
}
export default {
    MemoryOrchestratorImpl,
    getMemoryOrchestrator,
    resetMemoryOrchestrator,
};
//# sourceMappingURL=orchestrator.js.map