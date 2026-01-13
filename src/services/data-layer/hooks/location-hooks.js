/**
 * Location & Places Domain Hooks
 *
 * Auto-indexing hooks for geographic and place-related data.
 * Enables semantic search like "that café we talked about" or "places I love".
 *
 * @module services/data-layer/hooks/location-hooks
 */
import { createDomainHook, formatField, joinNonEmpty } from '../hook-generator.js';
// ============================================================================
// FAVORITE PLACE HOOKS
// ============================================================================
/**
 * Called when a favorite place is added, updated, or removed
 */
export const onFavoritePlaceChange = createDomainHook({
    entityType: 'favorite_place',
    storeType: 'life-data',
    contentBuilder: (entity) => joinNonEmpty([
        `Favorite place: ${entity.name} (${entity.type})`,
        formatField('Location', entity.location),
        formatField('Why loved', entity.whyLoved),
        entity.memories?.length ? `Memories: ${entity.memories.join(', ')}` : undefined,
    ]),
});
// ============================================================================
// LOCATION MEMORY HOOKS
// ============================================================================
/**
 * Called when a location-tied memory is captured
 */
export const onLocationMemoryChange = createDomainHook({
    entityType: 'location_memory',
    storeType: 'memory',
    contentBuilder: (entity) => joinNonEmpty([
        `Memory at ${entity.place}: ${entity.memory}`,
        formatField('Emotion', entity.emotion),
        entity.significance !== 'casual' ? `[${entity.significance}]` : undefined,
        entity.peopleInvolved?.length ? `with ${entity.peopleInvolved.join(', ')}` : undefined,
    ]),
});
// ============================================================================
// GEOGRAPHIC PREFERENCE HOOKS
// ============================================================================
/**
 * Called when a geographic preference is recorded
 */
export const onGeographicPreferenceChange = createDomainHook({
    entityType: 'geographic_preference',
    storeType: 'life-data',
    contentBuilder: (entity) => joinNonEmpty([
        `Geographic preference (${entity.preferenceType}): ${entity.preference}`,
        formatField('Reason', entity.reason),
        entity.examples?.length ? `Examples: ${entity.examples.join(', ')}` : undefined,
    ]),
});
//# sourceMappingURL=location-hooks.js.map