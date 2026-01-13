/**
 * Location & Places Domain Hooks
 *
 * Auto-indexing hooks for geographic and place-related data.
 * Enables semantic search like "that café we talked about" or "places I love".
 *
 * @module services/data-layer/hooks/location-hooks
 */
import type { FavoritePlaceEntity, LocationMemoryEntity, GeographicPreferenceEntity } from '../types.js';
/**
 * Called when a favorite place is added, updated, or removed
 */
export declare const onFavoritePlaceChange: import("../hook-generator.js").DomainHook<FavoritePlaceEntity>;
/**
 * Called when a location-tied memory is captured
 */
export declare const onLocationMemoryChange: import("../hook-generator.js").DomainHook<LocationMemoryEntity>;
/**
 * Called when a geographic preference is recorded
 */
export declare const onGeographicPreferenceChange: import("../hook-generator.js").DomainHook<GeographicPreferenceEntity>;
//# sourceMappingURL=location-hooks.d.ts.map