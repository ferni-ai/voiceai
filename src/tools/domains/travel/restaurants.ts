/**
 * Restaurant Search & Reservation Tools
 *
 * Find restaurants, read reviews, and make reservations.
 *
 * APIs:
 * - Google Places API (New) text search, via services/google-places
 * - Booking: call-on-behalf (scheduling/appointments-tools makeReservation);
 *   OpenTable, Resy and Yelp have no booking API we can use (removed 2026-10-30)
 *
 * @module tools/restaurants
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import {
  searchRestaurants as searchPlacesNew,
  isGooglePlacesConfigured,
} from '../../../services/google-places.js';

import { getToolDescription } from '../../utils/tool-descriptions.js';
// ============================================================================
// TYPES
// ============================================================================

interface Restaurant {
  name: string;
  rating: number;
  reviewCount: number;
  priceLevel: string; // $, $$, $$$, $$$$
  cuisine: string[];
  address: string;
  phone?: string;
  distance?: string;
  isOpen?: boolean;
  hours?: string;
  url?: string;
}

interface SearchParams {
  query?: string;
  location: string;
  cuisine?: string;
  priceLevel?: number; // 1-4
  openNow?: boolean;
  sortBy?: 'rating' | 'distance' | 'review_count';
  limit?: number;
}

// ============================================================================
// GOOGLE PLACES API
// ============================================================================

async function searchGooglePlaces(params: SearchParams): Promise<Restaurant[]> {
  const query = [params.query || 'restaurants', params.cuisine].filter(Boolean).join(' ');
  const places = await searchPlacesNew({
    query,
    location: params.location,
    openNow: params.openNow,
  });
  const priceLevels = ['', '$', '$$', '$$$', '$$$$'];

  return places.slice(0, params.limit || 5).map((place) => ({
    name: place.name,
    rating: place.rating || 0,
    reviewCount: place.userRatingsTotal || 0,
    priceLevel: priceLevels[place.priceLevel || 2] || '$$',
    cuisine: (place.types || []).filter(
      (t) => !['restaurant', 'food', 'point_of_interest', 'establishment'].includes(t)
    ),
    address: place.address,
    isOpen: place.openNow,
  }));
}

// ============================================================================
// MAIN SEARCH FUNCTION
// ============================================================================

export async function searchRestaurants(params: SearchParams): Promise<string> {
  getLogger().info({ params }, '🍽️ Searching for restaurants');

  const restaurants = await searchGooglePlaces(params);

  if (restaurants.length === 0) {
    if (!isGooglePlacesConfigured()) {
      return "I can't search restaurants right now.";
    }
    return `I couldn't find any restaurants matching your criteria in ${params.location}. Try:\n• Being more specific about the location\n• Broadening your cuisine preference\n• Searching without "open now"`;
  }

  return formatRestaurantResults(restaurants, params);
}

function formatRestaurantResults(restaurants: Restaurant[], params: SearchParams): string {
  let response = `**Restaurants`;
  if (params.cuisine) response += ` - ${params.cuisine}`;
  response += ` near ${params.location}**\n\n`;

  restaurants.forEach((r, i) => {
    const stars = '⭐'.repeat(Math.round(r.rating));
    const openStatus = r.isOpen === true ? '🟢 Open' : r.isOpen === false ? '🔴 Closed' : '';

    response += `**${i + 1}. ${r.name}** ${r.priceLevel}\n`;
    response += `${stars} ${r.rating.toFixed(1)} (${r.reviewCount.toLocaleString()} reviews)\n`;

    if (r.cuisine.length > 0) {
      response += `🍴 ${r.cuisine.slice(0, 3).join(', ')}\n`;
    }

    response += `📍 ${r.address}`;
    if (r.distance) response += ` (${r.distance})`;
    response += '\n';

    if (openStatus) response += `${openStatus}\n`;
    if (r.phone) response += `📞 ${r.phone}\n`;

    response += '\n';
  });

  response += `💡 *Want me to help you make a reservation?*`;

  return response;
}

// ============================================================================
// RESERVATION HELPERS
// ============================================================================

/**
 * Generate a reservation request message
 * Since we don't have direct API access to OpenTable/Resy,
 * we help users make reservations by providing the info they need
 */
export function getReservationHelp(
  restaurantName: string,
  partySize: number,
  date: string,
  time: string
): string {
  let response = `**Making a reservation at ${restaurantName}**\n\n`;
  response += `📅 ${date} at ${time}\n`;
  response += `👥 Party of ${partySize}\n\n`;

  response += `**Options to book:**\n\n`;
  response += `1. **OpenTable** - opentable.com\n`;
  response += `   Search for "${restaurantName}" and book directly\n\n`;
  response += `2. **Resy** - resy.com\n`;
  response += `   Many popular restaurants use Resy\n\n`;
  response += `3. **Google** - Search "${restaurantName} reservations"\n`;
  response += `   Often links directly to the restaurant's booking\n\n`;
  response += `4. **Call directly** - Some restaurants only take phone reservations\n\n`;

  response += `Would you like me to search for the restaurant's phone number?`;

  return response;
}

// ============================================================================
// CUISINE SUGGESTIONS
// ============================================================================

function suggestCuisine(mood: string): string[] {
  const moodMap: Record<string, string[]> = {
    romantic: ['Italian', 'French', 'Japanese', 'Fine Dining'],
    casual: ['American', 'Pizza', 'Mexican', 'Burgers'],
    healthy: ['Salads', 'Mediterranean', 'Poke', 'Vegetarian'],
    comfort: ['Southern', 'BBQ', 'Diner', 'American'],
    adventurous: ['Ethiopian', 'Korean', 'Peruvian', 'Fusion'],
    quick: ['Fast Food', 'Sandwiches', 'Pizza', 'Tacos'],
    celebration: ['Steakhouse', 'Fine Dining', 'Sushi', 'French'],
    family: ['Italian', 'American', 'Chinese', 'Mexican'],
  };

  return moodMap[mood.toLowerCase()] || ['American', 'Italian'];
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createRestaurantTools() {
  return {
    searchRestaurants: llm.tool({
      description: getToolDescription('searchRestaurants'),
      parameters: z.object({
        location: z.string().describe('Location to search (city, neighborhood, or address)'),
        cuisine: z.string().optional().describe('Type of cuisine (e.g., Italian, Mexican, Sushi)'),
        priceLevel: z
          .number()
          .min(1)
          .max(4)
          .optional()
          .describe('Price level: 1=$, 2=$$, 3=$$$, 4=$$$$'),
        openNow: z.boolean().optional().describe('Only show currently open restaurants'),
        query: z
          .string()
          .optional()
          .describe('Additional search terms (e.g., "outdoor seating", "romantic")'),
      }),
      execute: async ({ location, cuisine, priceLevel, openNow, query }) => {
        return searchRestaurants({
          location,
          cuisine,
          priceLevel,
          openNow,
          query,
          limit: 5,
          sortBy: 'rating',
        });
      },
    }),

    makeReservation: llm.tool({
      description: getToolDescription('makeReservation'),
      parameters: z.object({
        restaurantName: z.string().describe('Name of the restaurant'),
        partySize: z.number().describe('Number of people'),
        date: z.string().describe('Date for reservation (e.g., "tonight", "Saturday", "Dec 25")'),
        time: z.string().describe('Preferred time (e.g., "7pm", "around 8")'),
      }),
      execute: async ({ restaurantName, partySize, date, time }) => {
        return getReservationHelp(restaurantName, partySize, date, time);
      },
    }),

    suggestRestaurant: llm.tool({
      description: getToolDescription('suggestRestaurant'),
      parameters: z.object({
        location: z.string().describe('Location to search'),
        occasion: z
          .enum([
            'romantic',
            'casual',
            'healthy',
            'comfort',
            'adventurous',
            'quick',
            'celebration',
            'family',
          ])
          .optional()
          .describe('Type of occasion or mood'),
        preferences: z.string().optional().describe('Any preferences or restrictions'),
      }),
      execute: async ({ location, occasion, preferences }) => {
        const cuisines = occasion ? suggestCuisine(occasion) : ['American', 'Italian'];

        let response = `**Restaurant suggestions`;
        if (occasion) response += ` for ${occasion}`;
        response += `**\n\n`;

        response += `Based on your mood, I'd suggest looking for:\n`;
        cuisines.forEach((c) => {
          response += `• ${c}\n`;
        });
        response += '\n';

        // Search for top rated in the suggested cuisines
        const results = await searchRestaurants({
          location,
          cuisine: cuisines[0],
          query: preferences,
          limit: 3,
          sortBy: 'rating',
        });

        return `${response}\n${results}`;
      },
    }),
  };
}

export default createRestaurantTools;
