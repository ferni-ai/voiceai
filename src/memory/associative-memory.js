/**
 * Associative Memory System
 *
 * Models human-like associative memory triggers.
 * When someone mentions something, what would genuinely surface in a friend's mind?
 *
 * Philosophy: Human memory isn't a database query. When a friend mentions "my daughter",
 * you don't search for "daughter" - you naturally think of the time they proudly showed
 * you her artwork, their worry about college applications, that funny story from her
 * childhood. This module models those natural associations.
 *
 * @module memory/associative-memory
 */
import { createLogger } from '../utils/safe-logger.js';
const log = createLogger({ module: 'AssociativeMemory' });
const DEFAULT_CONFIG = {
    minFiringStrength: 0.3,
    strengthDecayPerDay: 0.01,
    firingBoost: 0.1,
    maxTriggersPerMemory: 10,
    maxTriggeredMemories: 5,
};
const TRIGGER_PATTERNS = [
    // Person mentions
    {
        type: 'person',
        patterns: [
            /\b(my|our)\s+(mom|mother|dad|father|wife|husband|son|daughter|sister|brother|friend|boss|partner|girlfriend|boyfriend)\b/gi,
            /\b(mom|mother|dad|father)\b/gi,
            /\b[A-Z][a-z]+\s+(?:said|told|thinks|mentioned|asked)/g,
        ],
        extractor: (match) => match[0].toLowerCase().replace(/\bmy\s+|\bour\s+/g, ''),
    },
    // Emotional states
    {
        type: 'emotion',
        patterns: [
            /(?:feeling|felt|feel)\s+(anxious|worried|scared|happy|excited|sad|frustrated|overwhelmed|stressed|hopeful|grateful)/gi,
            /(?:I'm|I am)\s+(anxious|worried|scared|happy|excited|sad|frustrated|overwhelmed|stressed|hopeful|grateful)/gi,
        ],
        extractor: (match) => match[1]?.toLowerCase() || match[0].toLowerCase(),
    },
    // Topics
    {
        type: 'topic',
        patterns: [
            /\b(work|job|career|money|health|relationship|family|kids|school|college|wedding|moving|travel|hobby|exercise|sleep|diet)\b/gi,
        ],
        extractor: (match) => match[0].toLowerCase(),
    },
    // Situations
    {
        type: 'situation',
        patterns: [
            /\b(decision|choice|dilemma|problem|challenge|opportunity|change|transition|milestone|anniversary|birthday)\b/gi,
            /\b(starting|ending|beginning|finishing|quitting|joining)\b/gi,
        ],
        extractor: (match) => match[0].toLowerCase(),
    },
    // Time-based
    {
        type: 'time',
        patterns: [
            /\b(morning|evening|night|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
            /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi,
        ],
        extractor: (match) => match[0].toLowerCase(),
    },
];
// ============================================================================
// NATURAL REFERENCE TEMPLATES
// ============================================================================
const REFERENCE_TEMPLATES = {
    person: [
        'This reminds me of what you shared about {person}',
        "You've mentioned {person} before - how are things going there?",
        'That connects to something about {person} you told me',
    ],
    emotion: [
        "You've felt this way before - I remember {context}",
        'This sounds similar to {context}',
        'I recall you going through something like this',
    ],
    topic: [
        "We've talked about {topic} before",
        'This connects to our conversation about {topic}',
        "You've been thinking about {topic} for a while",
    ],
    situation: [
        'This reminds me of when you were dealing with {situation}',
        "You've navigated something similar before",
        'I remember you facing this kind of {situation}',
    ],
    time: [
        '{time} seems significant - I remember {context}',
        'Around this time, you mentioned {context}',
    ],
    word: [
        'That word makes me think of something you shared',
        'You mentioned that before in a different context',
    ],
};
// ============================================================================
// ASSOCIATIVE MEMORY IMPLEMENTATION
// ============================================================================
export class AssociativeMemory {
    config;
    triggers = new Map(); // userId -> triggers
    memories = new Map(); // memoryId -> memory
    constructor(config) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * Register associative triggers for a memory
     */
    async registerTrigger(memoryId, triggers) {
        const now = new Date();
        const existingTriggers = this.triggers.get(memoryId) || [];
        for (const trigger of triggers) {
            // Check for duplicate
            const exists = existingTriggers.some((t) => t.triggerType === trigger.triggerType && t.triggerValue === trigger.triggerValue);
            if (!exists) {
                existingTriggers.push({
                    ...trigger,
                    triggerId: `trigger_${memoryId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    createdAt: now,
                    lastFired: now,
                    fireCount: 0,
                });
            }
        }
        // Limit triggers per memory
        const limitedTriggers = existingTriggers
            .sort((a, b) => b.strength - a.strength)
            .slice(0, this.config.maxTriggersPerMemory);
        this.triggers.set(memoryId, limitedTriggers);
        log.debug({ memoryId, triggerCount: limitedTriggers.length }, 'Registered triggers');
    }
    /**
     * Get memories triggered by user text
     */
    async getTriggeredMemories(userText, context) {
        const triggered = [];
        const extractedTriggers = this.extractTriggersFromText(userText);
        if (extractedTriggers.length === 0) {
            return [];
        }
        // Check each memory's triggers
        for (const [memoryId, memoryTriggers] of this.triggers.entries()) {
            for (const trigger of memoryTriggers) {
                // Check if any extracted trigger matches
                const match = extractedTriggers.find((et) => et.type === trigger.triggerType &&
                    (et.value === trigger.triggerValue ||
                        et.value.includes(trigger.triggerValue) ||
                        trigger.triggerValue.includes(et.value)));
                if (match) {
                    const memory = this.memories.get(memoryId);
                    if (!memory)
                        continue;
                    // Calculate activation strength with decay
                    const daysSinceFired = (Date.now() - trigger.lastFired.getTime()) / (1000 * 60 * 60 * 24);
                    const decayedStrength = Math.max(0, trigger.strength - daysSinceFired * this.config.strengthDecayPerDay);
                    if (decayedStrength >= this.config.minFiringStrength) {
                        // Apply context boosters
                        let activationStrength = decayedStrength;
                        // Boost if emotionally relevant
                        if (context.currentEmotion && trigger.triggerType === 'emotion') {
                            activationStrength *= 1.3;
                        }
                        // Boost if topic matches current conversation
                        if (context.currentTopic && memory.topics?.includes(context.currentTopic)) {
                            activationStrength *= 1.2;
                        }
                        triggered.push({
                            memory,
                            trigger,
                            activationStrength: Math.min(1, activationStrength),
                            naturalReference: this.generateNaturalReference(memory, trigger, match.value),
                        });
                    }
                }
            }
        }
        // Sort by activation strength and limit
        return triggered
            .sort((a, b) => b.activationStrength - a.activationStrength)
            .slice(0, this.config.maxTriggeredMemories);
    }
    /**
     * Record that a trigger was fired (used)
     */
    async recordTriggerFired(triggerId) {
        for (const [memoryId, triggers] of this.triggers.entries()) {
            const trigger = triggers.find((t) => t.triggerId === triggerId);
            if (trigger) {
                trigger.lastFired = new Date();
                trigger.fireCount++;
                trigger.strength = Math.min(1, trigger.strength + this.config.firingBoost);
                log.debug({ triggerId, newStrength: trigger.strength }, 'Trigger fired');
                break;
            }
        }
    }
    /**
     * Get strongest triggers for a memory
     */
    async getStrongestTriggers(memoryId) {
        const triggers = this.triggers.get(memoryId) || [];
        return triggers.sort((a, b) => b.strength - a.strength).slice(0, 5);
    }
    // ============================================================================
    // MEMORY REGISTRATION
    // ============================================================================
    /**
     * Register a memory and automatically create associative triggers
     */
    registerMemory(memory) {
        this.memories.set(memory.id, memory);
        // Auto-generate triggers from memory content
        const autoTriggers = this.extractTriggersFromText(memory.content);
        const triggersToRegister = autoTriggers.map((t) => ({
            triggerType: t.type,
            triggerValue: t.value,
            linkedMemoryId: memory.id,
            strength: this.calculateInitialStrength(memory, t),
            bidirectional: t.type === 'person' || t.type === 'topic',
        }));
        // Add topic-based triggers
        if (memory.topics) {
            for (const topic of memory.topics) {
                triggersToRegister.push({
                    triggerType: 'topic',
                    triggerValue: topic.toLowerCase(),
                    linkedMemoryId: memory.id,
                    strength: 0.6,
                    bidirectional: true,
                });
            }
        }
        // Add person-based triggers
        if (memory.personMentioned) {
            triggersToRegister.push({
                triggerType: 'person',
                triggerValue: memory.personMentioned.toLowerCase(),
                linkedMemoryId: memory.id,
                strength: 0.8,
                bidirectional: true,
            });
        }
        void this.registerTrigger(memory.id, triggersToRegister);
    }
    // ============================================================================
    // PRIVATE HELPERS
    // ============================================================================
    /**
     * Extract potential triggers from text
     */
    extractTriggersFromText(text) {
        const triggers = [];
        for (const pattern of TRIGGER_PATTERNS) {
            for (const regex of pattern.patterns) {
                const matches = text.matchAll(new RegExp(regex));
                for (const match of matches) {
                    const value = pattern.extractor(match, text);
                    if (value && value.length > 2) {
                        triggers.push({ type: pattern.type, value });
                    }
                }
            }
        }
        // Deduplicate
        return triggers.filter((t, i) => triggers.findIndex((other) => other.type === t.type && other.value === t.value) === i);
    }
    /**
     * Calculate initial strength for an auto-generated trigger
     */
    calculateInitialStrength(memory, trigger) {
        let strength = 0.5;
        // Emotional memories have stronger triggers
        if (memory.emotionalWeight > 0.6) {
            strength += 0.2;
        }
        // Person mentions are strong triggers
        if (trigger.type === 'person') {
            strength += 0.2;
        }
        // Commitments are strong triggers
        if (memory.commitment) {
            strength += 0.15;
        }
        // Emotional triggers are strong
        if (trigger.type === 'emotion') {
            strength += 0.1;
        }
        return Math.min(1, strength);
    }
    /**
     * Generate a natural reference for a triggered memory
     */
    generateNaturalReference(memory, trigger, matchedValue) {
        const templates = REFERENCE_TEMPLATES[trigger.triggerType] || REFERENCE_TEMPLATES.word;
        const template = templates[Math.floor(Math.random() * templates.length)];
        // Extract context from memory
        const context = memory.content.slice(0, 100);
        const topic = memory.topics?.[0] || 'this';
        const person = memory.personMentioned || matchedValue;
        return template
            .replace('{person}', person)
            .replace('{topic}', topic)
            .replace('{context}', context)
            .replace('{situation}', matchedValue)
            .replace('{time}', matchedValue);
    }
    // ============================================================================
    // IMPORT/EXPORT
    // ============================================================================
    /**
     * Export for persistence
     */
    export() {
        return {
            triggers: Array.from(this.triggers.entries()),
            memories: Array.from(this.memories.entries()),
        };
    }
    /**
     * Import from persistence
     */
    import(data) {
        this.triggers = new Map(data.triggers);
        this.memories = new Map(data.memories);
    }
    /**
     * Get stats
     */
    getStats() {
        let totalTriggers = 0;
        for (const triggers of this.triggers.values()) {
            totalTriggers += triggers.length;
        }
        return {
            totalMemories: this.memories.size,
            totalTriggers,
            avgTriggersPerMemory: this.memories.size > 0 ? totalTriggers / this.memories.size : 0,
        };
    }
}
// ============================================================================
// SINGLETON WITH PERSISTENCE
// ============================================================================
const associativeMemories = new Map();
const persistenceInitialized = false;
/**
 * Get associative memory for a user (with Firestore persistence)
 */
export function getAssociativeMemory(userId) {
    if (!associativeMemories.has(userId)) {
        const memory = new AssociativeMemory();
        associativeMemories.set(userId, memory);
        // Load from Firestore in background (non-blocking)
        void loadFromPersistence(userId, memory);
    }
    return associativeMemories.get(userId);
}
/**
 * Load associative memory from Firestore
 */
async function loadFromPersistence(userId, memory) {
    try {
        const { getFirestoreMemoryPersistence } = await import('./firestore-memory-persistence.js');
        const persistence = await getFirestoreMemoryPersistence();
        if (persistence.isAvailable()) {
            const data = await persistence.loadAssociativeTriggers(userId);
            // Import the loaded data
            const triggers = [];
            const memories = [];
            for (const [memoryId, { triggers: t, memory: m }] of data.entries()) {
                triggers.push([memoryId, t]);
                if (m)
                    memories.push([memoryId, m]);
            }
            memory.import({ triggers, memories });
            log.debug({ userId, loaded: data.size }, 'Loaded associative memory from Firestore');
        }
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Firestore persistence not available');
    }
}
/**
 * Save associative memory to Firestore
 */
export async function saveAssociativeMemory(userId) {
    const memory = associativeMemories.get(userId);
    if (!memory)
        return;
    try {
        const { getFirestoreMemoryPersistence } = await import('./firestore-memory-persistence.js');
        const persistence = await getFirestoreMemoryPersistence();
        if (persistence.isAvailable()) {
            const exported = memory.export();
            for (const [memoryId, triggers] of exported.triggers) {
                const memoryItem = exported.memories.find(([id]) => id === memoryId)?.[1];
                await persistence.saveAssociativeTriggers(userId, memoryId, triggers, memoryItem);
            }
            log.debug({ userId }, 'Saved associative memory to Firestore');
        }
    }
    catch (error) {
        log.warn({ error: String(error) }, 'Failed to save associative memory');
    }
}
/**
 * Clear associative memory for a user
 */
export function clearAssociativeMemory(userId) {
    associativeMemories.delete(userId);
}
export default {
    AssociativeMemory,
    getAssociativeMemory,
    saveAssociativeMemory,
    clearAssociativeMemory,
};
//# sourceMappingURL=associative-memory.js.map