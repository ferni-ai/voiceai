/**
 * Unified local search: Google Places first, Yelp as fallback, or whichever
 * source the user named ("on Yelp", "on Google").
 *
 * @module tools/domains/local-search/unified-search
 */

import { getLogger } from '../../../utils/safe-logger.js';
import {
  searchRestaurants as searchGooglePlaces,
  isGooglePlacesConfigured,
  type PlaceSearchResult,
} from '../../../services/google-places.js';
import {
  searchBusinesses as searchYelp,
  isYelpConfigured,
  type YelpBusiness,
} from '../../../services/yelp.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export type Source = 'auto' | 'google' | 'yelp';

export interface SearchResult {
  name: string;
  address: string;
  rating?: number;
  reviewCount?: number;
  priceLevel?: string;
  phone?: string;
  isOpen?: boolean;
  source: 'google' | 'yelp';
  sourceId: string;
}

// ============================================================================
// UNIFIED SEARCH LOGIC
// ============================================================================

/**
 * Detect if user explicitly requested a source
 */
export function detectExplicitSource(query: string): Source {
  const lower = query.toLowerCase();
  if (lower.includes('yelp') || lower.includes('on yelp')) return 'yelp';
  if (lower.includes('google') || lower.includes('on google')) return 'google';
  return 'auto';
}

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
 * Convert Yelp result to unified format
 */
function yelpToUnified(biz: YelpBusiness): SearchResult {
  return {
    name: biz.name,
    address: biz.location.display_address.join(', '),
    rating: biz.rating,
    reviewCount: biz.review_count,
    priceLevel: biz.price,
    phone: biz.display_phone,
    isOpen: !biz.is_closed,
    source: 'yelp',
    sourceId: biz.id,
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

  // Note the source
  const sources = [...new Set(results.map((r) => r.source))];
  if (sources.length === 1) {
    response += `_via ${sources[0] === 'google' ? 'Google' : 'Yelp'}_`;
  }

  return response;
}

/**
 * Unified search: Google primary, Yelp fallback
 */
export async function unifiedSearch(
  query: string,
  location: string,
  options: { openNow?: boolean; priceLevel?: string; explicitSource?: Source }
): Promise<SearchResult[]> {
  const source = options.explicitSource || 'auto';

  // Explicit Yelp request
  if (source === 'yelp') {
    if (!isYelpConfigured()) {
      log.debug('Yelp requested but not configured');
      return [];
    }
    const yelpResults = await searchYelp({
      term: query,
      location,
      open_now: options.openNow,
      price: options.priceLevel,
      limit: 10,
    });
    return yelpResults.map(yelpToUnified);
  }

  // Explicit Google request
  if (source === 'google') {
    if (!isGooglePlacesConfigured()) {
      log.debug('Google Places requested but not configured');
      return [];
    }
    const googleResults = await searchGooglePlaces({
      query,
      location,
      openNow: options.openNow,
    });
    return googleResults.map(googleToUnified);
  }

  // Auto: Google primary, Yelp fallback
  if (isGooglePlacesConfigured()) {
    const googleResults = await searchGooglePlaces({
      query,
      location,
      openNow: options.openNow,
    });

    if (googleResults.length > 0) {
      return googleResults.map(googleToUnified);
    }
    log.debug('Google returned no results, trying Yelp fallback');
  }

  // Fallback to Yelp
  if (isYelpConfigured()) {
    const yelpResults = await searchYelp({
      term: query,
      location,
      open_now: options.openNow,
      price: options.priceLevel,
      limit: 10,
    });
    return yelpResults.map(yelpToUnified);
  }

  log.warn('Neither Google Places nor Yelp configured for local search');
  return [];
}
