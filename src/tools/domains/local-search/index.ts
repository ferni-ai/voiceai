/**
 * Local Search Tools
 *
 * Find local businesses and restaurants through Google Places. Yelp was
 * removed (2026-10-30, API terms section 9.4 ban generative-model use), and
 * with it the Yelp-only review and phone-lookup tools. When Places is not
 * configured the tools say they can't search instead of "couldn't find any".
 *
 * @module tools/domains/local-search
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { callerCityTools } from './caller-city-tools.js';
import { callerCityMemoryOn, resolveSearchLocation } from './caller-city.js';

import {
  formatResults,
  isLocalSearchAvailable,
  LOCAL_SEARCH_UNAVAILABLE,
  unifiedSearch,
} from './unified-search.js';
import { pickRestaurantDef } from './restaurant-pick.js';
import { isCoachLocalEnabled } from '../../../config/coach-local-flag.js';

import {
  getPlaceDetails as getGooglePlaceDetails,
  isGooglePlacesConfigured,
} from '../../../services/google-places.js';

const log = getLogger();

/** Asked only when the model gave no location and the caller's location is unknown. */
const LOCATION_UNKNOWN = "Where should I look? I don't have your location.";

const locationParam = z
  .string()
  .optional()
  .describe(
    "Where to search (city, neighborhood, or address). Optional - leave it out to search near the caller's location"
  );

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

/**
 * Search for local businesses
 */
const searchLocalBusinessesDef: ToolDefinition = {
  id: 'searchLocalBusinesses',
  name: 'Search Local Businesses',
  description: 'Search for local businesses (restaurants, shops, services) through Google Places.',
  domain: 'local-search',
  tags: ['local', 'search', 'restaurants', 'businesses', 'google'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Search for local businesses like restaurants, coffee shops, gyms, salons. ' +
        'Searches near the caller unless they name a place. ' +
        'Returns ratings, review counts, price level, and open status.',
      parameters: z.object({
        query: z
          .string()
          .describe('What to search for (e.g., "Italian restaurant", "coffee shop", "gym")'),
        location: locationParam,
        openNow: z.boolean().optional().describe('Only show places currently open'),
      }),
      execute: async ({ query, location: requested, openNow }, opts) => {
        if (!isLocalSearchAvailable()) return LOCAL_SEARCH_UNAVAILABLE;
        const location = await resolveSearchLocation(requested, opts, ctx);
        if (!location) return LOCATION_UNKNOWN;
        try {
          log.info({ query, location, userId: ctx.userId }, '🔍 Searching local businesses');

          const results = await unifiedSearch(query, location, { openNow });

          return formatResults(results, query, location);
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
  tags: ['restaurants', 'dining', 'food', 'google'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Find restaurants near the caller, or in an area they name. Great for dinner recommendations.',
      parameters: z.object({
        location: locationParam,
        cuisine: z
          .string()
          .optional()
          .describe('Type of cuisine (e.g., "Italian", "Sushi", "Mexican")'),
        openNow: z.boolean().optional().describe('Only show restaurants currently open'),
      }),
      execute: async ({ location: requested, cuisine, openNow }, opts) => {
        if (!isLocalSearchAvailable()) return LOCAL_SEARCH_UNAVAILABLE;
        const location = await resolveSearchLocation(requested, opts, ctx);
        if (!location) return LOCATION_UNKNOWN;
        try {
          const cleanCuisine = (cuisine || '').trim();
          const query = cleanCuisine ? `${cleanCuisine} restaurant` : 'restaurant';
          log.info({ query, location, userId: ctx.userId }, '🍽️ Finding restaurants');

          const results = await unifiedSearch(query, location, {
            openNow,
            restaurantsOnly: true,
          });

          if (results.length === 0) {
            return `I couldn't find ${cleanCuisine || 'any'} restaurants in ${location}. Try a different area or cuisine?`;
          }

          let response = `**${cleanCuisine || 'Restaurant'} Options near ${location}**\n\n`;
          response += formatResults(results, cleanCuisine || 'restaurants', location);

          return response;
        } catch (error) {
          log.error({ error: String(error) }, 'Restaurant search failed');
          return 'I had trouble finding restaurants. Let me try again.';
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
  tags: ['business', 'details', 'hours'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Get detailed information about a specific business including hours, phone, and rating.',
      parameters: z.object({
        businessId: z.string().describe('The Google place ID from a previous search'),
      }),
      execute: async ({ businessId }) => {
        if (!isGooglePlacesConfigured()) return LOCAL_SEARCH_UNAVAILABLE;
        try {
          log.info({ businessId, userId: ctx.userId }, '📋 Getting business details');

          const details = await getGooglePlaceDetails(businessId);
          if (!details) return "I couldn't find details for that business.";

          let response = `**${details.name}**\n\n`;
          if (details.rating)
            response += `⭐ ${details.rating} (${details.userRatingsTotal} reviews)\n`;
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
        } catch (error) {
          log.error({ error: String(error) }, 'Get business details failed');
          return "I couldn't get the business details.";
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
      description: 'Check whether local search (Google Places) is configured.',
      parameters: z.object({}),
      execute: async () => {
        const google = isGooglePlacesConfigured();

        let response = '**Local Search Status**\n\n';
        response += `🗺️ Google Places: ${google ? '✅ Active' : '❌ Not configured'}\n\n`;

        if (google) {
          response += 'I can help you find restaurants, shops, and services nearby!';
        } else {
          response +=
            "Local search isn't configured yet. I can still chat about places in general!";
        }

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN EXPORT
// ============================================================================

export const { domain, definitions } = createDomainExport('local-search', [
  searchLocalBusinessesDef,
  findRestaurantsDef,
  getBusinessInfoDef,
  checkLocalSearchStatusDef,
  pickRestaurantDef,
  ...callerCityTools,
]);
/** What the registry loads: no pickRestaurant while COACH_LOCAL is off (config/coach-local-flag.ts). */
export const getToolDefinitions = (): Promise<ToolDefinition[]> =>
  Promise.resolve(
    definitions.filter(
      (d) =>
        (d !== pickRestaurantDef || isCoachLocalEnabled()) &&
        (!callerCityTools.includes(d) || callerCityMemoryOn())
    )
  );

export default { getToolDefinitions, domain, definitions };
