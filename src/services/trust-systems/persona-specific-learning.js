// ============================================================================
// PERSONA DEFINITIONS
// ============================================================================
const PERSONA_DOMAINS = {
    ferni: {
        name: 'Ferni',
        specialty: 'Life coaching & emotional support',
        learnsAbout: ['emotions', 'life_goals', 'relationships', 'growth', 'challenges'],
        sharesInsights: ['peter-john', 'alex-chen', 'maya-santos', 'jordan-taylor', 'nayan-patel'],
        receivesFrom: ['maya-santos', 'alex-chen', 'nayan-patel'],
    },
    'peter-john': {
        name: 'Peter',
        specialty: 'Research & analytical thinking',
        learnsAbout: [
            'interests',
            'learning_style',
            'curiosities',
            'knowledge_gaps',
            'research_topics',
        ],
        sharesInsights: ['ferni', 'maya-santos'],
        receivesFrom: ['ferni'],
    },
    'alex-chen': {
        name: 'Alex',
        specialty: 'Communications & social dynamics',
        learnsAbout: [
            'communication_style',
            'relationships',
            'social_challenges',
            'networking',
            'conflicts',
        ],
        sharesInsights: ['ferni', 'jordan-taylor'],
        receivesFrom: ['ferni', 'jordan-taylor'],
    },
    'maya-santos': {
        name: 'Maya',
        specialty: 'Habits & daily routines',
        learnsAbout: ['routines', 'habits', 'productivity', 'health', 'energy_patterns', 'sleep'],
        sharesInsights: ['ferni', 'jordan-taylor'],
        receivesFrom: ['ferni', 'peter-john'],
    },
    'jordan-taylor': {
        name: 'Jordan',
        specialty: 'Events & planning',
        learnsAbout: ['schedule', 'commitments', 'events', 'deadlines', 'planning_style'],
        sharesInsights: ['ferni', 'maya-santos', 'alex-chen'],
        receivesFrom: ['ferni', 'maya-santos', 'alex-chen'],
    },
    'nayan-patel': {
        name: 'Nayan',
        specialty: 'Wisdom, philosophy & long-term thinking',
        learnsAbout: ['values', 'beliefs', 'life_philosophy', 'decisions', 'meaning', 'everything'],
        sharesInsights: ['ferni'],
        receivesFrom: ['ferni', 'peter-john', 'alex-chen', 'maya-santos', 'jordan-taylor'],
    },
};
// ============================================================================
// STATE
// ============================================================================
const personaMemories = new Map(); // key: `${userId}:${personaId}`
// ============================================================================
// MEMORY MANAGEMENT
// ============================================================================
function getMemoryKey(userId, personaId) {
    return `${userId}:${personaId}`;
}
function getOrCreateMemory(userId, personaId) {
    const key = getMemoryKey(userId, personaId);
    let memory = personaMemories.get(key);
    if (!memory) {
        memory = {
            personaId,
            userId,
            interactions: {
                totalConversations: 0,
                totalMinutes: 0,
                lastInteraction: null,
                firstInteraction: null,
            },
            domainKnowledge: {},
            rapport: {
                comfortLevel: 0.3, // Start neutral
                trustLevel: 0.3,
                preferredTone: null,
                topicsDiscussed: [],
                avoidedTopics: [],
            },
            observations: [],
            shareable: [],
            lastUpdated: new Date(),
        };
        personaMemories.set(key, memory);
    }
    return memory;
}
export function getPersonaMemory(userId, personaId) {
    return personaMemories.get(getMemoryKey(userId, personaId)) || null;
}
export function getAllPersonaMemories(userId) {
    const memories = [];
    for (const personaId of Object.keys(PERSONA_DOMAINS)) {
        const memory = getPersonaMemory(userId, personaId);
        if (memory) {
            memories.push(memory);
        }
    }
    return memories;
}
// ============================================================================
// INTERACTION TRACKING
// ============================================================================
/**
 * Record a conversation with a specific persona
 */
export function recordPersonaInteraction(userId, personaId, durationMinutes, topicsDiscussed) {
    const memory = getOrCreateMemory(userId, personaId);
    // Update interaction stats
    memory.interactions.totalConversations += 1;
    memory.interactions.totalMinutes += durationMinutes;
    memory.interactions.lastInteraction = new Date();
    if (!memory.interactions.firstInteraction) {
        memory.interactions.firstInteraction = new Date();
    }
    // Track topics
    for (const topic of topicsDiscussed) {
        if (!memory.rapport.topicsDiscussed.includes(topic)) {
            memory.rapport.topicsDiscussed.push(topic);
        }
    }
    // Increase rapport with interaction
    memory.rapport.comfortLevel = Math.min(1, memory.rapport.comfortLevel + 0.02);
    memory.rapport.trustLevel = Math.min(1, memory.rapport.trustLevel + 0.01);
    memory.lastUpdated = new Date();
}
// ============================================================================
// DOMAIN-SPECIFIC LEARNING
// ============================================================================
/**
 * Learn domain-specific knowledge for a persona
 */
export function learnDomainKnowledge(userId, personaId, domain, knowledge) {
    const memory = getOrCreateMemory(userId, personaId);
    const personaDef = PERSONA_DOMAINS[personaId];
    // Only learn if it's relevant to this persona
    if (personaDef.learnsAbout.includes(domain) || personaDef.learnsAbout.includes('everything')) {
        memory.domainKnowledge[domain] = knowledge;
        memory.lastUpdated = new Date();
    }
}
/**
 * Get what a persona knows about a domain
 */
export function getPersonaDomainKnowledge(userId, personaId, domain) {
    const memory = getPersonaMemory(userId, personaId);
    return memory?.domainKnowledge[domain] || null;
}
// ============================================================================
// PERSONA-SPECIFIC OBSERVATIONS
// ============================================================================
/**
 * Record an observation from a persona's perspective
 */
export function recordPersonaObservation(userId, personaId, type, observation, confidence = 0.7) {
    const memory = getOrCreateMemory(userId, personaId);
    const obs = {
        id: `obs_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        date: new Date(),
        type,
        observation,
        confidence,
        sharedWithOthers: false,
    };
    memory.observations.push(obs);
    // Keep only recent observations (last 100)
    if (memory.observations.length > 100) {
        memory.observations = memory.observations.slice(-100);
    }
    memory.lastUpdated = new Date();
    // Check if this should be shared
    if (confidence >= 0.7) {
        maybeCreateShareableInsight(userId, personaId, obs);
    }
    return obs;
}
/**
 * Get a persona's observations about the user
 */
export function getPersonaObservations(userId, personaId, type) {
    const memory = getPersonaMemory(userId, personaId);
    if (!memory)
        return [];
    const { observations } = memory;
    if (type) {
        return observations.filter((o) => o.type === type);
    }
    return observations;
}
// ============================================================================
// TRANSFER LEARNING
// ============================================================================
/**
 * Create a shareable insight from an observation
 */
function maybeCreateShareableInsight(userId, fromPersonaId, observation) {
    const personaDef = PERSONA_DOMAINS[fromPersonaId];
    if (personaDef.sharesInsights.length === 0)
        return;
    // Map observation types to insight types
    const typeMap = {
        preference: 'preference',
        boundary: 'boundary',
        pattern: 'pattern',
        growth: 'milestone',
        context: 'context',
    };
    const insightType = typeMap[observation.type] || 'context';
    const insight = {
        id: `insight_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        fromPersona: fromPersonaId,
        insightType,
        summary: observation.observation,
        relevantPersonas: personaDef.sharesInsights,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    };
    // Add to originating persona's memory
    const memory = getOrCreateMemory(userId, fromPersonaId);
    memory.shareable.push(insight);
    observation.sharedWithOthers = true;
    // Share with relevant personas
    for (const targetPersonaId of personaDef.sharesInsights) {
        receiveSharedInsight(userId, targetPersonaId, insight);
    }
}
/**
 * Receive a shared insight from another persona
 */
function receiveSharedInsight(userId, personaId, insight) {
    const memory = getOrCreateMemory(userId, personaId);
    const personaDef = PERSONA_DOMAINS[personaId];
    // Only receive if this persona is configured to receive from the source
    if (!personaDef.receivesFrom.includes(insight.fromPersona))
        return;
    // Avoid duplicates
    if (memory.shareable.some((s) => s.id === insight.id))
        return;
    // Add with proper attribution
    memory.shareable.push({
        ...insight,
        relevantPersonas: [personaId], // Mark as received
    });
}
/**
 * Get insights shared with a persona
 */
export function getSharedInsights(userId, personaId) {
    const memory = getPersonaMemory(userId, personaId);
    if (!memory)
        return [];
    const now = new Date();
    return memory.shareable.filter((s) => s.fromPersona !== personaId && // Not from self
        (!s.expiresAt || s.expiresAt > now) // Not expired
    );
}
// ============================================================================
// RAPPORT MANAGEMENT
// ============================================================================
/**
 * Update rapport with a persona based on interaction quality
 */
export function updatePersonaRapport(userId, personaId, update) {
    const memory = getOrCreateMemory(userId, personaId);
    if (update.comfortDelta !== undefined) {
        memory.rapport.comfortLevel = Math.max(0, Math.min(1, memory.rapport.comfortLevel + update.comfortDelta));
    }
    if (update.trustDelta !== undefined) {
        memory.rapport.trustLevel = Math.max(0, Math.min(1, memory.rapport.trustLevel + update.trustDelta));
    }
    if (update.preferredTone) {
        memory.rapport.preferredTone = update.preferredTone;
    }
    if (update.avoidTopic && !memory.rapport.avoidedTopics.includes(update.avoidTopic)) {
        memory.rapport.avoidedTopics.push(update.avoidTopic);
    }
    memory.lastUpdated = new Date();
}
/**
 * Get the preferred communication style for a persona with this user
 */
export function getPersonaCommunicationStyle(userId, personaId) {
    const memory = getPersonaMemory(userId, personaId);
    // Default styles per persona
    const defaults = {
        ferni: { tone: 'warm', formality: 0.3, emoji: true, verbosity: 'moderate' },
        'peter-john': { tone: 'analytical', formality: 0.6, emoji: false, verbosity: 'detailed' },
        'alex-chen': { tone: 'friendly', formality: 0.3, emoji: true, verbosity: 'moderate' },
        'maya-santos': { tone: 'encouraging', formality: 0.3, emoji: true, verbosity: 'concise' },
        'jordan-taylor': { tone: 'organized', formality: 0.4, emoji: true, verbosity: 'concise' },
        'nayan-patel': { tone: 'wise', formality: 0.5, emoji: false, verbosity: 'detailed' },
    };
    const base = defaults[personaId];
    if (!memory)
        return base;
    // Adjust based on learned preferences
    return {
        tone: memory.rapport.preferredTone || base.tone,
        formality: memory.rapport.comfortLevel < 0.5 ? base.formality : base.formality * 0.7,
        emoji: base.emoji && memory.rapport.comfortLevel > 0.4,
        verbosity: base.verbosity,
    };
}
// ============================================================================
// CONTEXT FOR LLM
// ============================================================================
/**
 * Build context about the user for a specific persona
 */
export function buildPersonaContext(userId, personaId) {
    const memory = getPersonaMemory(userId, personaId);
    const sharedInsights = getSharedInsights(userId, personaId);
    const personaDef = PERSONA_DOMAINS[personaId];
    const lines = [];
    lines.push(`## What ${personaDef.name} knows about this user\n`);
    // Relationship status
    if (memory) {
        lines.push(`### Our history`);
        lines.push(`- Conversations: ${memory.interactions.totalConversations}`);
        lines.push(`- Time together: ${Math.round(memory.interactions.totalMinutes)} minutes`);
        lines.push(`- Comfort level: ${Math.round(memory.rapport.comfortLevel * 100)}%`);
        lines.push(`- Trust level: ${Math.round(memory.rapport.trustLevel * 100)}%`);
        if (memory.rapport.preferredTone) {
            lines.push(`- They prefer a ${memory.rapport.preferredTone} tone with me`);
        }
        if (memory.rapport.avoidedTopics.length > 0) {
            lines.push(`- Topics to avoid: ${memory.rapport.avoidedTopics.join(', ')}`);
        }
        lines.push('');
        // Domain knowledge
        const domainKeys = Object.keys(memory.domainKnowledge);
        if (domainKeys.length > 0) {
            lines.push(`### What I've learned (${personaDef.specialty})`);
            for (const key of domainKeys) {
                const value = memory.domainKnowledge[key];
                if (typeof value === 'string') {
                    lines.push(`- ${key}: ${value}`);
                }
                else if (Array.isArray(value)) {
                    lines.push(`- ${key}: ${value.join(', ')}`);
                }
            }
            lines.push('');
        }
        // Recent observations
        const recentObs = memory.observations.slice(-5);
        if (recentObs.length > 0) {
            lines.push(`### My recent observations`);
            for (const obs of recentObs) {
                lines.push(`- [${obs.type}] ${obs.observation}`);
            }
            lines.push('');
        }
    }
    // Shared insights from other personas
    if (sharedInsights.length > 0) {
        lines.push(`### What my colleagues shared with me`);
        for (const insight of sharedInsights.slice(-5)) {
            const sourceName = PERSONA_DOMAINS[insight.fromPersona].name;
            lines.push(`- From ${sourceName}: ${insight.summary}`);
        }
        lines.push('');
    }
    return lines.join('\n');
}
// ============================================================================
// PERSISTENCE
// ============================================================================
/**
 * Export all persona memories for a user
 */
export function exportPersonaMemories(userId) {
    const result = {};
    for (const personaId of Object.keys(PERSONA_DOMAINS)) {
        const memory = getPersonaMemory(userId, personaId);
        if (memory) {
            result[personaId] = {
                ...memory,
                interactions: {
                    ...memory.interactions,
                    lastInteraction: memory.interactions.lastInteraction?.toISOString(),
                    firstInteraction: memory.interactions.firstInteraction?.toISOString(),
                },
                observations: memory.observations.map((o) => ({
                    ...o,
                    date: o.date.toISOString(),
                })),
                shareable: memory.shareable.map((s) => ({
                    ...s,
                    createdAt: s.createdAt.toISOString(),
                    expiresAt: s.expiresAt?.toISOString(),
                })),
                lastUpdated: memory.lastUpdated.toISOString(),
            };
        }
    }
    return result;
}
/**
 * Import persona memories from Firestore
 */
export function importPersonaMemories(userId, data) {
    for (const [personaId, memoryData] of Object.entries(data)) {
        if (!PERSONA_DOMAINS[personaId])
            continue;
        const md = memoryData;
        const interactions = md.interactions;
        const memory = {
            personaId: personaId,
            userId,
            interactions: {
                totalConversations: interactions?.totalConversations || 0,
                totalMinutes: interactions?.totalMinutes || 0,
                lastInteraction: interactions?.lastInteraction
                    ? new Date(interactions.lastInteraction)
                    : null,
                firstInteraction: interactions?.firstInteraction
                    ? new Date(interactions.firstInteraction)
                    : null,
            },
            domainKnowledge: md.domainKnowledge || {},
            rapport: md.rapport || {
                comfortLevel: 0.3,
                trustLevel: 0.3,
                preferredTone: null,
                topicsDiscussed: [],
                avoidedTopics: [],
            },
            observations: (md.observations || []).map((o) => ({
                ...o,
                date: new Date(o.date),
            })),
            shareable: (md.shareable || []).map((s) => ({
                ...s,
                createdAt: new Date(s.createdAt),
                expiresAt: s.expiresAt ? new Date(s.expiresAt) : null,
            })),
            lastUpdated: md.lastUpdated ? new Date(md.lastUpdated) : new Date(),
        };
        personaMemories.set(getMemoryKey(userId, personaId), memory);
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export const personaLearning = {
    recordInteraction: recordPersonaInteraction,
    learnDomain: learnDomainKnowledge,
    getDomainKnowledge: getPersonaDomainKnowledge,
    recordObservation: recordPersonaObservation,
    getObservations: getPersonaObservations,
    getSharedInsights,
    updateRapport: updatePersonaRapport,
    getCommunicationStyle: getPersonaCommunicationStyle,
    buildContext: buildPersonaContext,
    getMemory: getPersonaMemory,
    getAllMemories: getAllPersonaMemories,
    exportMemories: exportPersonaMemories,
    importMemories: importPersonaMemories,
    PERSONA_DOMAINS,
};
//# sourceMappingURL=persona-specific-learning.js.map