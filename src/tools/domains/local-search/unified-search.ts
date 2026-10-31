/**
 * Local search through Google Places, the one place source left. Yelp was
 * removed (2026-10-30): its API terms (section 9.4) ban feeding Yelp content
 * to a generative model.
 *
 * @module tools/domains/local-search/unified-search
 */

import { getLogger } from '../../../utils/safe-logger.js';
import {
  searchRestaurants as searchGooglePlaces,
  isGooglePlacesConfigured,
  type PlaceSearchResult,
} from '../../../services/google-places.js';

const log = getLogger();

/** What the tools say when no place source is configured, instead of "I couldn't find any". */
export const LOCAL_SEARCH_UNAVAILABLE = "I can't search for places right now.";

// ============================================================================
// TYPES
// ============================================================================

export interface SearchResult {
  name: string;
  address: string;
  rating?: number;
  reviewCount?: number;
  priceLevel?: string;
  phone?: string;
  isOpen?: boolean;
  source: 'google';
  sourceId: string;
}

// ============================================================================
// UNIFIED SEARCH LOGIC
// ============================================================================

/**
 * Convert Google Places result to unified format
 */
function googleToUnified(place: PlaceSearchResult): SearchResult {
  const priceLevels = ['', '$', '$$', '$$$', '$$$$'];
  return {
    name: place.name,
    address: place.address,
    rating: place.rating,
    reviewCount: place.userRatingsTotal,
    priceLevel: place.priceLevel ? priceLevels[place.priceLevel] : undefined,
    isOpen: place.openNow,
    source: 'google',
    sourceId: place.placeId,
  };
}

/**
 * Format unified results for speech
 */
export function formatResults(results: SearchResult[], query: string, location: string): string {
  if (results.length === 0) {
    return `I couldn't find any "${query}" in ${location}. Try a different search or location?`;
  }

  let response = `**Found ${results.length} options for "${query}" near ${location}**\n\n`;

  results.slice(0, 5).forEach((r, i) => {
    const stars = r.rating ? `⭐ ${r.rating.toFixed(1)}` : '';
    const reviews = r.reviewCount ? `(${r.reviewCount.toLocaleString()} reviews)` : '';
    const price = r.priceLevel || '';
    const open = r.isOpen === true ? '🟢 Open' : r.isOpen === false ? '🔴 Closed' : '';

    response += `**${i + 1}. ${r.name}** ${price}\n`;
    if (stars || reviews) response += `${stars} ${reviews}\n`;
    response += `📍 ${r.address}\n`;
    if (r.phone) response += `📞 ${r.phone}\n`;
    if (open) response += `${open}\n`;
    response += '\n';
  });

  response += '_via Google_';

  return response;
}

/** True when a place source is configured (only Google Places is left). */
export function isLocalSearchAvailable(): boolean {
  return isGooglePlacesConfigured();
}

/**
 * Search Google Places. Returns [] when Places is not configured; callers
 * check isLocalSearchAvailable() first so they can say so honestly.
 */
export async function unifiedSearch(
  query: string,
  location: string,
  options: {
    openNow?: boolean;
    restaurantsOnly?: boolean;
  }
): Promise<SearchResult[]> {
  if (!isGooglePlacesConfigured()) {
    log.warn('Google Places not configured for local search');
    return [];
  }
  // Places text search drops every non-restaurant when includedType is 'restaurant'.
  const type = options.restaurantsOnly ? 'restaurant' : null;
  const googleResults = await searchGooglePlaces({
    query,
    location,
    openNow: options.openNow,
    type,
  });
  return googleResults.map(googleToUnified);
}
