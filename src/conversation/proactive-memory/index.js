/**
 * Proactive Memory Surfacing
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This is a SUPERHUMAN capability: surfacing memories BEFORE the user mentions them.
 * A human friend might eventually remember "oh right, you had that interview!"
 * Ferni proactively brings it up, creating the "they actually care" feeling.
 *
 * @module conversation/proactive-memory
 */
import { createLogger } from '../../utils/safe-logger.js';
import { createSessionRegistry, registerGlobalRegistry } from '../../utils/session-registry.js';
import { extractContent } from './extractors.js';
import { PatternDetector } from './pattern-detection.js';
import { SurfacingEngine } from './surfacing.js';
const logger = createLogger({ module: 'ProactiveMemory' });
// ============================================================================
// PROACTIVE MEMORY ENGINE
// ============================================================================
const MAX_MEMORIES = 50;
export class ProactiveMemoryEngine {
    memories = [];
    patternDetector = new PatternDetector();
    surfacing;
    turnCount = 0;
    sessionStartTime;
    currentSessionId;
    constructor(sessionId) {
        this.currentSessionId = sessionId;
        this.sessionStartTime = new Date();
        this.surfacing = new SurfacingEngine(sessionId);
        logger.debug({ sessionId }, 'ProactiveMemoryEngine initialized');
    }
    // ==========================================================================
    // MEMORY CAPTURE
    // ==========================================================================
    /**
     * Process user message and extract memorable content
     */
    captureFromMessage(text, context) {
        this.turnCount = context.turnCount;
        const extracted = extractContent(text);
        const now = new Date();
        // Capture events
        for (const { event, timeRef } of extracted.events) {
            this.addMemory({
                type: 'event',
                content: event,
                context: timeRef?.description,
                topics: context.topic ? [context.topic] : [],
                people: [],
                expectedFollowUpAt: timeRef?.date,
                emotionalWeight: context.wasVulnerable ? 'heavy' : 'medium',
                wasVulnerable: context.wasVulnerable || false,
            });
        }
        // Capture goals
        for (const goal of extracted.goals) {
            this.addMemory({
                type: 'goal',
                content: goal,
                topics: context.topic ? [context.topic] : [],
                people: [],
                emotionalWeight: 'medium',
                wasVulnerable: false,
            });
        }
        // Capture people
        for (const { name, relationship } of extracted.people) {
            const existing = this.memories.find((m) => m.type === 'person' && m.content.toLowerCase() === name.toLowerCase());
            if (!existing) {
                this.addMemory({
                    type: 'person',
                    content: name,
                    context: relationship,
                    topics: context.topic ? [context.topic] : [],
                    people: [name],
                    emotionalWeight: 'light',
                    wasVulnerable: false,
                });
            }
        }
        // Capture struggles
        for (const struggle of extracted.struggles) {
            this.addMemory({
                type: 'struggle',
                content: struggle,
                topics: context.topic ? [context.topic] : [],
                people: [],
                emotionalWeight: context.wasVulnerable ? 'heavy' : 'medium',
                wasVulnerable: context.wasVulnerable || false,
            });
        }
        // Track for pattern detection
        if (context.topic) {
            this.patternDetector.trackTopic(context.topic, now);
            const mentionedPeople = extracted.people.map((p) => p.name);
            if (mentionedPeople.length > 0) {
                this.patternDetector.trackPeopleWithTopic(context.topic, mentionedPeople);
            }
        }
        if (context.emotion) {
            this.patternDetector.trackEmotion(context.emotion, now);
        }
        // Run pattern detection periodically
        if (this.turnCount % 5 === 0) {
            this.patternDetector.detectPatterns();
        }
    }
    /**
     * Add a memory directly
     */
    addMemory(memory) {
        const id = `mem_${Date.now()}_${this.memories.length.toString(36)}`;
        this.memories.push({
            ...memory,
            id,
            mentionedAt: new Date(),
            surfaced: false,
            surfaceCount: 0,
            sessionId: this.currentSessionId,
        });
        logger.debug({ type: memory.type, content: memory.content.slice(0, 30) }, '💾 Memory captured');
        // Keep max memories
        this.trimMemories();
    }
    trimMemories() {
        if (this.memories.length > MAX_MEMORIES) {
            this.memories.sort((a, b) => {
                const weightScore = { heavy: 3, medium: 2, light: 1 };
                if (a.surfaced !== b.surfaced)
                    return a.surfaced ? 1 : -1;
                if (weightScore[a.emotionalWeight] !== weightScore[b.emotionalWeight]) {
                    return weightScore[b.emotionalWeight] - weightScore[a.emotionalWeight];
                }
                return b.mentionedAt.getTime() - a.mentionedAt.getTime();
            });
            this.memories = this.memories.slice(0, MAX_MEMORIES);
        }
    }
    // ==========================================================================
    // PROACTIVE SURFACING
    // ==========================================================================
    /**
     * Get suggestions for what to proactively surface
     */
    getSuggestions(context) {
        this.turnCount = context.turnCount;
        const suggestions = [];
        const now = new Date();
        // 1. Session-start surfacing
        if (context.isSessionStart && this.turnCount <= 2) {
            const openingSuggestion = this.surfacing.getOpeningSuggestion(this.memories);
            if (openingSuggestion) {
                suggestions.push(openingSuggestion);
            }
        }
        // 2. Time-based surfacing
        suggestions.push(...this.surfacing.getTimeBasedSuggestions(this.memories, now));
        // 3. Topic-based surfacing
        if (context.currentTopic) {
            suggestions.push(...this.surfacing.getTopicBasedSuggestions(this.memories, context.currentTopic));
        }
        // 4. Pattern-based surfacing
        suggestions.push(...this.surfacing.getPatternBasedSuggestions(this.patternDetector.getPatterns(), context));
        // Sort by priority and limit
        suggestions.sort((a, b) => b.priority - a.priority);
        return suggestions.slice(0, 2);
    }
    /**
     * Mark a memory as surfaced
     */
    markSurfaced(memoryId) {
        const memory = this.memories.find((m) => m.id === memoryId);
        if (memory) {
            memory.surfaced = true;
            memory.surfaceCount++;
            memory.lastSurfacedAt = new Date();
            logger.debug({ memoryId, content: memory.content.slice(0, 30) }, 'Memory surfaced');
        }
    }
    /**
     * Acknowledge a pattern
     */
    acknowledgePattern(type) {
        this.patternDetector.acknowledgePattern(type);
    }
    // ==========================================================================
    // IMPORT/EXPORT
    // ==========================================================================
    /**
     * Import memories from profile persistence
     */
    importMemories(memories) {
        for (const memory of memories) {
            const existing = this.memories.find((m) => m.content === memory.content && m.type === memory.type);
            if (!existing) {
                this.memories.push({
                    ...memory,
                    surfaced: false,
                    lastSurfacedAt: undefined,
                });
            }
        }
        logger.debug({ count: memories.length }, 'Imported memories');
    }
    /**
     * Export memories for profile persistence
     */
    exportMemories() {
        return this.memories.filter((m) => m.emotionalWeight !== 'light' || m.type === 'goal' || m.type === 'event');
    }
    /**
     * Export patterns for persistence
     */
    exportPatterns() {
        return this.patternDetector.exportPatterns();
    }
    /**
     * Import patterns from persistence
     */
    importPatterns(patterns) {
        this.patternDetector.importPatterns(patterns);
    }
    // ==========================================================================
    // RESET/CLEAR
    // ==========================================================================
    /**
     * Reset for new session (preserves memories)
     */
    reset() {
        this.turnCount = 0;
        this.sessionStartTime = new Date();
        logger.debug('ProactiveMemoryEngine reset');
    }
    /**
     * Clear all data
     */
    clearAll() {
        this.memories = [];
        this.patternDetector.clear();
        this.turnCount = 0;
        logger.debug('ProactiveMemoryEngine cleared');
    }
    /**
     * Get all memories for debugging
     */
    getAllMemories() {
        return [...this.memories];
    }
    /**
     * Get all patterns for debugging
     */
    getAllPatterns() {
        return this.patternDetector.getPatterns();
    }
}
// ============================================================================
// SESSION REGISTRY
// ============================================================================
const proactiveMemoryRegistry = createSessionRegistry((sessionId) => new ProactiveMemoryEngine(sessionId), {
    name: 'ProactiveMemory',
    cleanup: (engine) => engine.clearAll(),
    verbose: false,
});
registerGlobalRegistry(proactiveMemoryRegistry);
export function getProactiveMemoryEngine(sessionId) {
    return proactiveMemoryRegistry.get(sessionId);
}
export function resetProactiveMemoryEngine(sessionId) {
    const engine = proactiveMemoryRegistry.get(sessionId);
    engine.reset();
}
export function clearProactiveMemoryEngine(sessionId) {
    proactiveMemoryRegistry.reset(sessionId);
}
export function hasProactiveMemoryEngine(sessionId) {
    return proactiveMemoryRegistry.has(sessionId);
}
export function getActiveProactiveMemoryCount() {
    return proactiveMemoryRegistry.getActiveCount();
}
export default ProactiveMemoryEngine;
//# sourceMappingURL=index.js.map