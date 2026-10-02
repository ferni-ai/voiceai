/**
 * Local Search Results
 *
 * Unified result type and pure helpers for the local-search domain: source
 * detection, Google Places / Yelp normalization, and speech formatting.
 *
 * @module tools/domains/local-search/search-results
 */

import type { PlaceSearchResult } from '../../../services/google-places.js';
import type { YelpBusiness } from '../../../services/yelp.js';

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
export function googleToUnified(place: PlaceSearchResult): SearchResult {
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
export function yelpToUnified(biz: YelpBusiness): SearchResult {
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
