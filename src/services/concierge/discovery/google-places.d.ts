/**
 * Google Places Discovery
 *
 * Discovers businesses using Google Places API for contact information.
 * This is the first step in the concierge flow - finding who to call.
 */
import type { DiscoveryOptions, DiscoveredBusiness } from '../types.js';
/**
 * Check if Google Places API is configured
 */
export declare function isGooglePlacesConfigured(): boolean;
/**
 * Discover businesses matching the criteria
 */
export declare function discoverBusinesses(options: DiscoveryOptions): Promise<DiscoveredBusiness[]>;
//# sourceMappingURL=google-places.d.ts.map