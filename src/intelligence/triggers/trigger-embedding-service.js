/**
 * Trigger Embedding Service
 *
 * Generates and manages embeddings for proactive triggers.
 * Phase 1 of the Superhuman Trigger Intelligence system.
 *
 * Philosophy: Transform trigger descriptions into semantic vectors
 * that capture INTENT, not just keywords. This enables matching
 * emotional undertones and implicit meanings.
 *
 * @module TriggerEmbeddingService
 */
import { createLogger } from '../../utils/safe-logger.js';
import { embed, embedBatch, getEmbeddingProvider } from '../../memory/embeddings.js';
// Rust-accelerated batch operations for trigger matching (SIMD-accelerated for 5+ triggers)
import { batchCosineSimilarityOptimized } from '../../memory/rust-accelerator.js';
const log = createLogger({ module: 'TriggerEmbeddingService' });
// ============================================================================
// TRIGGER CATEGORIZATION
// ============================================================================
/**
 * Keywords that indicate trigger categories
 */
const CATEGORY_KEYWORDS = {
    emotional: [
        'distress',
        'grief',
        'loss',
        'sad',
        'worried',
        'anxious',
        'overwhelmed',
        'panic',
        'crisis',
        'fear',
        'anger',
        'frustrated',
        'hurt',
        'pain',
        'depressed',
        'lonely',
        'hopeless',
        'exhausted',
        'burnt out',
    ],
    behavioral: [
        'deflect',
        'avoid',
        'minimize',
        'deny',
        'excuse',
        'rationalize',
        'blame',
        'project',
        'withdraw',
        'isolate',
        'procrastinate',
        'fine',
        'okay',
        'whatever',
        'anyway',
        'never mind',
    ],
    temporal: [
        'late night',
        'midnight',
        '2am',
        '3am',
        'morning',
        'evening',
        'returning',
        'absence',
        'silence',
        'days',
        'weeks',
        'anniversary',
        'birthday',
        'holiday',
        'season',
        'monday',
        'sunday',
    ],
    domain: [
        'habit',
        'routine',
        'streak',
        'goal',
        'plan',
        'milestone',
        'market',
        'portfolio',
        'finance',
        'money',
        'invest',
        'calendar',
        'meeting',
        'email',
        'work',
        'deadline',
    ],
    relational: [
        'relationship',
        'friend',
        'family',
        'partner',
        'spouse',
        'parent',
        'child',
        'sibling',
        'colleague',
        'boss',
        'text',
        'respond',
        'conversation',
        'argument',
        'conflict',
        'boundary',
    ],
    existential: [
        'meaning',
        'purpose',
        'point',
        'why',
        'life',
        'death',
        'legacy',
        'values',
        'beliefs',
        'identity',
        'who am i',
        'matter',
        'important',
        'worth',
        'significance',
    ],
    growth: [
        'growth',
        'change',
        'progress',
        'different',
        'used to',
        'before',
        'now',
        'learning',
        'improving',
        'developing',
        'realizing',
        'understanding',
        'awareness',
    ],
};
/**
 * Detect the category of a trigger based on its description
 */
export function detectTriggerCategory(triggerText) {
    const lowerText = triggerText.toLowerCase();
    const scores = {
        emotional: 0,
        behavioral: 0,
        temporal: 0,
        domain: 0,
        relational: 0,
        existential: 0,
        growth: 0,
    };
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        for (const keyword of keywords) {
            if (lowerText.includes(keyword)) {
                scores[category]++;
            }
        }
    }
    // Find category with highest score
    let maxCategory = 'emotional'; // Default
    let maxScore = 0;
    for (const [category, score] of Object.entries(scores)) {
        if (score > maxScore) {
            maxScore = score;
            maxCategory = category;
        }
    }
    return maxCategory;
}
// ============================================================================
// TRIGGER EMBEDDING SERVICE
// ============================================================================
/**
 * Service for generating and managing trigger embeddings
 */
export class TriggerEmbeddingService {
    embeddedTriggers = new Map();
    pendingEmbeddings = new Map();
    initialized = false;
    /**
     * Initialize the service with triggers from a persona
     */
    async initializeForPersona(triggerSet) {
        log.info({ personaId: triggerSet.personaId, triggerCount: Object.keys(triggerSet.triggers).length }, 'Initializing trigger embeddings');
        const triggers = Object.entries(triggerSet.triggers);
        if (triggers.length === 0) {
            log.debug({ personaId: triggerSet.personaId }, 'No triggers to embed');
            return 0;
        }
        // Generate embeddings for all trigger descriptions
        const triggerTexts = triggers.map(([, t]) => t.trigger);
        try {
            const embeddings = await embedBatch(triggerTexts);
            for (let i = 0; i < triggers.length; i++) {
                const [name, trigger] = triggers[i];
                const triggerId = `${triggerSet.personaId}:${name}`;
                const embeddedTrigger = {
                    name,
                    trigger: trigger.trigger,
                    behavior: trigger.behavior,
                    embedding: embeddings[i],
                    personaId: triggerSet.personaId,
                    category: detectTriggerCategory(trigger.trigger),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };
                this.embeddedTriggers.set(triggerId, embeddedTrigger);
            }
            log.info({
                personaId: triggerSet.personaId,
                embedded: embeddings.length,
                provider: getEmbeddingProvider().model,
            }, 'Trigger embeddings initialized');
            this.initialized = true;
            return embeddings.length;
        }
        catch (error) {
            log.error({ error: String(error), personaId: triggerSet.personaId }, 'Failed to generate trigger embeddings');
            throw error;
        }
    }
    /**
     * Generate embedding for user text
     */
    async embedUserText(text) {
        // Check if we have a pending embedding for this text
        const pending = this.pendingEmbeddings.get(text);
        if (pending) {
            return pending;
        }
        // Generate new embedding
        const promise = embed(text);
        this.pendingEmbeddings.set(text, promise);
        try {
            const embedding = await promise;
            return embedding;
        }
        finally {
            // Clean up pending
            this.pendingEmbeddings.delete(text);
        }
    }
    /**
     * Find semantically similar triggers for user text
     */
    async findSimilarTriggers(userText, options = {}) {
        const { personaId, category, topK = 5, minSimilarity = 0.5 } = options;
        if (this.embeddedTriggers.size === 0) {
            log.warn('No embedded triggers available');
            return [];
        }
        // Generate embedding for user text
        const userEmbedding = await this.embedUserText(userText);
        // Filter triggers first (by persona and category)
        const filteredTriggers = [];
        for (const trigger of this.embeddedTriggers.values()) {
            // Filter by persona if specified
            if (personaId && trigger.personaId !== personaId)
                continue;
            // Filter by category if specified
            if (category && trigger.category !== category)
                continue;
            filteredTriggers.push(trigger);
        }
        if (filteredTriggers.length === 0) {
            return [];
        }
        // Batch compute all similarities at once (SIMD-accelerated for 5+ triggers)
        const triggerVectors = filteredTriggers.map((t) => Array.from(t.embedding));
        const queryArray = Array.from(userEmbedding);
        const similarities = batchCosineSimilarityOptimized(queryArray, triggerVectors);
        // Build results with similarity threshold
        const results = [];
        for (let i = 0; i < filteredTriggers.length; i++) {
            const similarity = similarities[i];
            if (similarity >= minSimilarity) {
                results.push({ trigger: filteredTriggers[i], similarity });
            }
        }
        // Sort by similarity descending
        results.sort((a, b) => b.similarity - a.similarity);
        // Return top K
        return results.slice(0, topK);
    }
    /**
     * Get all embedded triggers for a persona
     */
    getTriggersForPersona(personaId) {
        const triggers = [];
        for (const trigger of this.embeddedTriggers.values()) {
            if (trigger.personaId === personaId) {
                triggers.push(trigger);
            }
        }
        return triggers;
    }
    /**
     * Get trigger by ID
     */
    getTrigger(personaId, triggerName) {
        return this.embeddedTriggers.get(`${personaId}:${triggerName}`);
    }
    /**
     * Check if service is initialized
     */
    isInitialized() {
        return this.initialized;
    }
    /**
     * Get stats about embedded triggers
     */
    getStats() {
        const byPersona = {};
        const byCategory = {
            emotional: 0,
            behavioral: 0,
            temporal: 0,
            domain: 0,
            relational: 0,
            existential: 0,
            growth: 0,
        };
        for (const trigger of this.embeddedTriggers.values()) {
            byPersona[trigger.personaId] = (byPersona[trigger.personaId] || 0) + 1;
            byCategory[trigger.category]++;
        }
        const provider = getEmbeddingProvider();
        const dimensions = this.embeddedTriggers.size > 0
            ? Array.from(this.embeddedTriggers.values())[0].embedding.length
            : provider.dimensions;
        return {
            totalTriggers: this.embeddedTriggers.size,
            byPersona,
            byCategory,
            embeddingDimensions: dimensions,
            model: provider.model,
        };
    }
    /**
     * Clear all cached embeddings
     */
    clear() {
        this.embeddedTriggers.clear();
        this.pendingEmbeddings.clear();
        this.initialized = false;
        log.info('Trigger embedding cache cleared');
    }
    /**
     * Add or update a single trigger embedding
     */
    async addTrigger(personaId, name, trigger) {
        const triggerId = `${personaId}:${name}`;
        // Check if already exists
        const existing = this.embeddedTriggers.get(triggerId);
        if (existing && existing.trigger === trigger.trigger) {
            // Same trigger text, reuse embedding
            return existing;
        }
        // Generate new embedding
        const embedding = await embed(trigger.trigger);
        const embeddedTrigger = {
            name,
            trigger: trigger.trigger,
            behavior: trigger.behavior,
            embedding,
            personaId,
            category: detectTriggerCategory(trigger.trigger),
            createdAt: existing?.createdAt || new Date(),
            updatedAt: new Date(),
        };
        this.embeddedTriggers.set(triggerId, embeddedTrigger);
        log.debug({ triggerId, category: embeddedTrigger.category }, 'Added trigger embedding');
        return embeddedTrigger;
    }
    /**
     * Remove a trigger
     */
    removeTrigger(personaId, name) {
        const triggerId = `${personaId}:${name}`;
        return this.embeddedTriggers.delete(triggerId);
    }
}
// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
let instance = null;
/**
 * Get the singleton trigger embedding service
 */
export function getTriggerEmbeddingService() {
    if (!instance) {
        instance = new TriggerEmbeddingService();
    }
    return instance;
}
/**
 * Reset the singleton (for testing)
 */
export function resetTriggerEmbeddingService() {
    if (instance) {
        instance.clear();
        instance = null;
    }
}
export default {
    TriggerEmbeddingService,
    getTriggerEmbeddingService,
    resetTriggerEmbeddingService,
    detectTriggerCategory,
};
//# sourceMappingURL=trigger-embedding-service.js.map