/**
 * Local Search Tools
 *
 * Find local businesses, restaurants, reviews using Google Places (primary)
 * with Yelp fallback. Users can also explicitly request a specific source.
 *
 * Strategy:
 * - Google Places = Primary (always available via GOOGLE_API_KEY)
 * - Yelp = Fallback + explicit requests (when YELP_API_KEY configured)
 * - User says "check Yelp" or "search Google" → honor explicit preference
 *
 * @module tools/domains/local-search
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';

// Google Places (primary)
import {
  searchRestaurants as searchGooglePlaces,
  getPlaceDetails as getGooglePlaceDetails,
  findNearbyRestaurants as findNearbyGoogle,
  formatRestaurantListForSpeech as formatGoogleResults,
  isGooglePlacesConfigured,
  type PlaceSearchResult,
} from '../../../services/google-places.js';

// Yelp (fallback + explicit)
import {
  searchBusinesses as searchYelp,
  searchRestaurants as searchYelpRestaurants,
  getBusinessDetails as getYelpDetails,
  getBusinessReviews as getYelpReviews,
  getBusinessByPhone as yelpPhoneLookup,
  formatBusinessForSpeech as formatYelpBusiness,
  formatReviewForSpeech as formatYelpReview,
  isYelpConfigured,
  type YelpBusiness,
} from '../../../services/integrations/yelp.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

type Source = 'auto' | 'google' | 'yelp';

interface SearchResult {
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
function detectExplicitSource(query: string): Source {
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
function formatResults(results: SearchResult[], query: string, location: string): string {
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
async function unifiedSearch(
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

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

/**
 * Search for local businesses
 */
const searchLocalBusinessesDef: ToolDefinition = {
  id: 'searchLocalBusinesses',
  name: 'Search Local Businesses',
  description: 'Search for local businesses (restaurants, shops, services). Uses Google Places with Yelp fallback.',
  domain: 'local-search',
  tags: ['local', 'search', 'restaurants', 'businesses', 'google', 'yelp'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Search for local businesses like restaurants, coffee shops, gyms, salons. ' +
        'Say "on Yelp" or "on Google" to use a specific source. ' +
        'Returns ratings, reviews, price level, and hours.',
      parameters: z.object({
        query: z.string().describe('What to search for (e.g., "Italian restaurant", "coffee shop", "gym")'),
        location: z.string().describe('Where to search (city, neighborhood, or address)'),
        openNow: z.boolean().optional().describe('Only show places currently open'),
        priceLevel: z
          .string()
          .optional()
          .describe('Price filter: "1" ($), "2" ($$), "3" ($$$), "4" ($$$$)'),
      }),
      execute: async ({ query, location, openNow, priceLevel }) => {
        try {
          log.info({ query, location, userId: ctx.userId }, '🔍 Searching local businesses');

          const explicitSource = detectExplicitSource(query);
          // Remove "on yelp" / "on google" from query
          const cleanQuery = query
            .replace(/\s+(on\s+)?(yelp|google)/gi, '')
            .trim();

          const results = await unifiedSearch(cleanQuery, location, {
            openNow,
            priceLevel,
            explicitSource,
          });

          return formatResults(results, cleanQuery, location);
        } catch (error) {
          log.error({ error: String(error) }, 'Local search failed');
          return "I had trouble searching. Let's try again in a moment.";
        }
      },
    });
  },
};

/**
 * Find restaurants
 */
const findRestaurantsDef: ToolDefinition = {
  id: 'findRestaurants',
  name: 'Find Restaurants',
  description: 'Find restaurants with ratings, reviews, and hours',
  domain: 'local-search',
  tags: ['restaurants', 'dining', 'food', 'google', 'yelp'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Find restaurants in a specific area. Great for dinner recommendations. ' +
        'Say "on Yelp" or "on Google" to use a specific source.',
      parameters: z.object({
        location: z.string().describe('Where to search (city, neighborhood, or address)'),
        cuisine: z.string().optional().describe('Type of cuisine (e.g., "Italian", "Sushi", "Mexican")'),
        openNow: z.boolean().optional().describe('Only show restaurants currently open'),
        priceLevel: z.string().optional().describe('Price range: "1" ($) to "4" ($$$$)'),
      }),
      execute: async ({ location, cuisine, openNow, priceLevel }) => {
        try {
          const query = cuisine ? `${cuisine} restaurant` : 'restaurant';
          log.info({ query, location, userId: ctx.userId }, '🍽️ Finding restaurants');

          const explicitSource = detectExplicitSource(cuisine || '');
          const cleanCuisine = (cuisine || '')
            .replace(/\s+(on\s+)?(yelp|google)/gi, '')
            .trim();

          const results = await unifiedSearch(
            cleanCuisine ? `${cleanCuisine} restaurant` : 'restaurant',
            location,
            { openNow, priceLevel, explicitSource }
          );

          if (results.length === 0) {
            return `I couldn't find ${cleanCuisine || 'any'} restaurants in ${location}. Try a different area or cuisine?`;
          }

          let response = `**${cleanCuisine || 'Restaurant'} Options near ${location}**\n\n`;
          response += formatResults(results, cleanCuisine || 'restaurants', location);

          return response;
        } catch (error) {
          log.error({ error: String(error) }, 'Restaurant search failed');
          return "I had trouble finding restaurants. Let me try again.";
        }
      },
    });
  },
};

/**
 * Get business details
 */
const getBusinessInfoDef: ToolDefinition = {
  id: 'getBusinessInfo',
  name: 'Get Business Details',
  description: 'Get detailed information about a specific business',
  domain: 'local-search',
  tags: ['business', 'details', 'hours', 'reviews'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Get detailed information about a specific business including hours, phone, and reviews.',
      parameters: z.object({
        businessId: z.string().describe('The business ID from a previous search'),
        source: z.enum(['google', 'yelp']).describe('Which service the ID is from'),
      }),
      execute: async ({ businessId, source }) => {
        try {
          log.info({ businessId, source, userId: ctx.userId }, '📋 Getting business details');

          if (source === 'google' && isGooglePlacesConfigured()) {
            const details = await getGooglePlaceDetails(businessId);
            if (!details) return "I couldn't find details for that business.";

            let response = `**${details.name}**\n\n`;
            if (details.rating) response += `⭐ ${details.rating} (${details.userRatingsTotal} reviews)\n`;
            response += `📍 ${details.formattedAddress}\n`;
            if (details.formattedPhoneNumber) response += `📞 ${details.formattedPhoneNumber}\n`;
            if (details.website) response += `🌐 ${details.website}\n`;
            if (details.openingHours) {
              response += `\n**Hours:** ${details.openingHours.openNow ? '🟢 Open now' : '🔴 Closed'}\n`;
              details.openingHours.weekdayText.slice(0, 3).forEach((day) => {
                response += `  ${day}\n`;
              });
            }
            return response;
          }

          if (source === 'yelp' && isYelpConfigured()) {
            const details = await getYelpDetails(businessId);
            if (!details) return "I couldn't find details for that business.";

            let response = `**${details.name}**\n\n`;
            response += `⭐ ${details.rating} (${details.review_count} reviews)\n`;
            if (details.price) response += `💰 ${details.price}\n`;
            response += `📍 ${details.location.display_address.join(', ')}\n`;
            if (details.display_phone) response += `📞 ${details.display_phone}\n`;

            // Get reviews
            const reviews = await getYelpReviews(businessId, { limit: 2 });
            if (reviews.length > 0) {
              response += '\n**Recent Reviews:**\n';
              reviews.forEach((r) => {
                response += `• ${formatYelpReview(r)}\n`;
              });
            }

            return response;
          }

          return "I couldn't get the business details. The source may not be configured.";
        } catch (error) {
          log.error({ error: String(error) }, 'Get business details failed');
          return "I couldn't get the business details.";
        }
      },
    });
  },
};

/**
 * Get business reviews (Yelp-specific, better review data)
 */
const getBusinessReviewsDef: ToolDefinition = {
  id: 'getBusinessReviews',
  name: 'Get Business Reviews',
  description: 'Get customer reviews for a business (uses Yelp for rich reviews)',
  domain: 'local-search',
  tags: ['reviews', 'ratings', 'yelp'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Get customer reviews for a business. Uses Yelp which has richer review data.',
      parameters: z.object({
        businessId: z.string().describe('The Yelp business ID'),
        limit: z.number().optional().describe('Number of reviews (max 3)'),
      }),
      execute: async ({ businessId, limit }) => {
        if (!isYelpConfigured()) {
          return "Reviews require Yelp integration. I can still help you search for businesses!";
        }

        try {
          log.info({ businessId, userId: ctx.userId }, '💬 Getting business reviews');

          const reviews = await getYelpReviews(businessId, { limit: Math.min(limit || 3, 3) });

          if (reviews.length === 0) {
            return "I couldn't find any reviews for this business yet.";
          }

          let response = `**Recent Reviews**\n\n`;
          response += reviews.map((r) => formatYelpReview(r)).join('\n\n');

          return response;
        } catch (error) {
          log.error({ error: String(error) }, 'Get reviews failed');
          return "I couldn't get the reviews.";
        }
      },
    });
  },
};

/**
 * Look up business by phone number (Yelp-specific feature)
 */
const lookupByPhoneDef: ToolDefinition = {
  id: 'lookupBusinessByPhone',
  name: 'Lookup Business by Phone',
  description: 'Find what business a phone number belongs to (uses Yelp)',
  domain: 'local-search',
  tags: ['phone', 'lookup', 'yelp'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Look up a business by its phone number. Useful for identifying mystery calls or finding business info.',
      parameters: z.object({
        phone: z.string().describe('The phone number to look up'),
      }),
      execute: async ({ phone }) => {
        if (!isYelpConfigured()) {
          return "Phone lookup requires Yelp integration. Try searching by name instead!";
        }

        try {
          log.info({ phone: phone.slice(-4), userId: ctx.userId }, '📞 Looking up business by phone');

          const business = await yelpPhoneLookup(phone);

          if (!business) {
            return "I couldn't find a business with that phone number. It might not be listed.";
          }

          return `That number belongs to **${business.name}**!\n\n${formatYelpBusiness(business, true)}`;
        } catch (error) {
          log.error({ error: String(error) }, 'Phone lookup failed');
          return "I couldn't look up that phone number.";
        }
      },
    });
  },
};

/**
 * Check if local search is available
 */
const checkLocalSearchStatusDef: ToolDefinition = {
  id: 'checkLocalSearchStatus',
  name: 'Check Local Search Status',
  description: 'Check which local search services are available',
  domain: 'local-search',
  tags: ['status', 'configuration'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Check which local search services (Google Places, Yelp) are configured.',
      parameters: z.object({}),
      execute: async () => {
        const google = isGooglePlacesConfigured();
        const yelp = isYelpConfigured();

        let response = '**Local Search Status**\n\n';
        response += `🗺️ Google Places: ${google ? '✅ Active (primary)' : '❌ Not configured'}\n`;
        response += `⭐ Yelp: ${yelp ? '✅ Active (fallback + reviews)' : '❌ Not configured'}\n\n`;

        if (google || yelp) {
          response += "I can help you find restaurants, shops, and services nearby!";
        } else {
          response += "Local search isn't configured yet. I can still chat about places in general!";
        }

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN EXPORT
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport('local-search', [
  searchLocalBusinessesDef,
  findRestaurantsDef,
  getBusinessInfoDef,
  getBusinessReviewsDef,
  lookupByPhoneDef,
  checkLocalSearchStatusDef,
]);

export default { getToolDefinitions, domain, definitions };
