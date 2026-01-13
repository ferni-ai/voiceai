/**
 * Persona Interaction Domain Hooks
 *
 * Auto-indexing hooks for tracking user-persona relationships.
 * Helps with smart routing - "who does this user connect with best?"
 *
 * @module services/data-layer/hooks/persona-hooks
 */
import type { PersonaAffinityEntity, HandoffPreferenceEntity, PersonaInteractionHistoryEntity } from '../types.js';
/**
 * Called when persona affinity scores are updated
 * Tracks which personas user connects with best
 */
export declare const onPersonaAffinityChange: import("../hook-generator.js").DomainHook<PersonaAffinityEntity>;
/**
 * Called when handoff preferences are learned
 * Example: "When discussing anxiety, user prefers Maya over Ferni"
 */
export declare const onHandoffPreferenceChange: import("../hook-generator.js").DomainHook<HandoffPreferenceEntity>;
/**
 * Called after each persona interaction
 * Builds a record of how user relates to each persona
 */
export declare const onPersonaInteractionHistoryChange: import("../hook-generator.js").DomainHook<PersonaInteractionHistoryEntity>;
//# sourceMappingURL=persona-hooks.d.ts.map