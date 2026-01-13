/**
 * Unified Entity Store Types
 *
 * The atomic units of superhuman memory.
 * Every piece of user data becomes an Entity with semantic embeddings
 * and graph relationships.
 *
 * @module memory/entity-store/types
 */
// ============================================================================
// FACTORY HELPERS
// ============================================================================
/**
 * Create a new entity with defaults
 */
export function createEntity(userId, type, name, attributes) {
    const now = new Date();
    const salienceScore = 0.5;
    const emotionalWeight = 0;
    return {
        userId,
        type,
        canonicalName: name,
        aliases: [],
        searchTokens: tokenize(name),
        firstSeen: now,
        lastSeen: now,
        mentionCount: 1,
        temporalContext: {
            peakMoments: [],
            emotionalDecayResistance: 1.0,
        },
        // Compatibility aliases
        firstMentioned: now,
        lastMentioned: now,
        salienceScore,
        emotionalWeight,
        // Compatibility aliases
        importance: salienceScore,
        emotionalSalience: emotionalWeight,
        recencyBoost: 1.0,
        attributes,
        // Compatibility - convert attributes to generic properties
        properties: attributesToProperties(attributes),
        sourceConversations: [],
        sourcePersonas: [],
        confidence: 0.8,
        createdAt: now,
        updatedAt: now,
    };
}
/**
 * Map various status strings to EntityProperties status values
 */
function mapStatusToEntityProps(status) {
    const mapping = {
        active: 'active',
        achieved: 'achieved',
        abandoned: 'abandoned',
        paused: 'paused',
        // Goal/commitment status mappings
        planning: 'active',
        stalled: 'paused',
        completed: 'achieved',
        deferred: 'paused',
    };
    return mapping[status];
}
/**
 * Convert EntityAttributes to EntityProperties for backward compatibility
 */
function attributesToProperties(attrs) {
    const props = {};
    switch (attrs._type) {
        case 'person':
            props.relationship = attrs.relationship;
            props.phone = attrs.phone;
            props.email = attrs.email;
            if (attrs.birthday) {
                const yearSuffix = attrs.birthday.year != null ? `/${attrs.birthday.year}` : '';
                props.birthday = `${attrs.birthday.month}/${attrs.birthday.day}${yearSuffix}`;
            }
            break;
        case 'place':
            props.placeType = attrs.placeType;
            props.location = attrs.location;
            props.coordinates = attrs.coordinates;
            break;
        case 'event':
            props.date = attrs.date;
            props.recurring = attrs.isRecurring;
            props.recurrencePattern = attrs.recurringPattern;
            props.participants = attrs.relatedPeople;
            break;
        case 'goal':
            // Map goal status to EntityProperties status
            props.status = mapStatusToEntityProps(attrs.status);
            props.targetDate = attrs.targetDate;
            props.progress = attrs.progress;
            break;
        case 'commitment':
            // Map commitment status to EntityProperties status
            props.status = mapStatusToEntityProps(attrs.status);
            props.targetDate = attrs.targetDate;
            break;
        // Add more as needed
    }
    return props;
}
/**
 * Tokenize text for BM25 search
 */
export function tokenize(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length > 1);
}
/**
 * Convert entity to text for embedding
 */
export function entityToText(entity) {
    const parts = [entity.canonicalName];
    if (entity.aliases.length > 0) {
        parts.push(`(also known as: ${entity.aliases.join(', ')})`);
    }
    // Add type-specific context
    const attrs = entity.attributes;
    switch (attrs._type) {
        case 'person':
            parts.push(`${attrs.relationship}`);
            if (attrs.lastKnownStatus)
                parts.push(attrs.lastKnownStatus);
            break;
        case 'commitment':
            parts.push(`${attrs.commitmentType}: ${attrs.originalStatement}`);
            break;
        case 'event':
            parts.push(`${attrs.eventType} event`);
            break;
        case 'memory':
            parts.push(attrs.content);
            break;
        // Add more as needed
    }
    return parts.join(' - ');
}
//# sourceMappingURL=types.js.map