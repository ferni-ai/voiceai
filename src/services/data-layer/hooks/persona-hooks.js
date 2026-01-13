/**
 * Persona Interaction Domain Hooks
 *
 * Auto-indexing hooks for tracking user-persona relationships.
 * Helps with smart routing - "who does this user connect with best?"
 *
 * @module services/data-layer/hooks/persona-hooks
 */
import { createDomainHook, formatField, joinNonEmpty } from '../hook-generator.js';
// ============================================================================
// PERSONA AFFINITY HOOKS
// ============================================================================
/**
 * Called when persona affinity scores are updated
 * Tracks which personas user connects with best
 */
export const onPersonaAffinityChange = createDomainHook({
    entityType: 'persona_affinity',
    storeType: 'conversation',
    contentBuilder: (entity) => joinNonEmpty([
        `Persona affinity: ${entity.personaName}`,
        `Score: ${Math.round(entity.affinityScore * 100)}%`,
        entity.totalSessions ? `${entity.totalSessions} sessions` : undefined,
        entity.topTopics?.length ? `Topics: ${entity.topTopics.join(', ')}` : undefined,
        formatField('Resonance', entity.emotionalResonance),
    ]),
});
// ============================================================================
// HANDOFF PREFERENCE HOOKS
// ============================================================================
/**
 * Called when handoff preferences are learned
 * Example: "When discussing anxiety, user prefers Maya over Ferni"
 */
export const onHandoffPreferenceChange = createDomainHook({
    entityType: 'handoff_preference',
    storeType: 'conversation',
    contentBuilder: (entity) => joinNonEmpty([
        `Handoff preference: ${entity.fromPersona} → ${entity.toPersona}`,
        entity.triggerTopics?.length ? `for ${entity.triggerTopics.join(', ')}` : undefined,
        entity.userApproved ? '[user approved]' : undefined,
        entity.successfulHandoffs ? `Success: ${entity.successfulHandoffs}` : undefined,
    ]),
});
// ============================================================================
// PERSONA INTERACTION HISTORY HOOKS
// ============================================================================
/**
 * Called after each persona interaction
 * Builds a record of how user relates to each persona
 */
export const onPersonaInteractionHistoryChange = createDomainHook({
    entityType: 'persona_interaction_history',
    storeType: 'conversation',
    contentBuilder: (entity) => joinNonEmpty([
        `Interaction with ${entity.personaId}: ${entity.interactionType}`,
        entity.topics?.length ? `Topics: ${entity.topics.join(', ')}` : undefined,
        `(${entity.sentiment})`,
        formatField('Outcome', entity.outcome),
    ]),
    shouldSkip: (entity) => {
        // Skip brief mentions - only track meaningful interactions
        return entity.interactionType === 'brief_mention';
    },
});
//# sourceMappingURL=persona-hooks.js.map