/**
 * Travel Search & Planning Tool
 *
 * Search for flights, hotels, and plan trips.
 *
 * Features:
 * - Flight search
 * - Hotel search
 * - Trip planning
 * - Price tracking (future)
 *
 * Note: In production, this would integrate with:
 * - Google Flights API / Amadeus / Skyscanner
 * - Booking.com / Hotels.com API
 * - Google Maps for destinations
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { sanitizePlainText } from '../../validation.js';
import { getLogger, generateId } from '../../utils/tool-helpers.js';

import { getToolDescription } from '../../utils/tool-descriptions.js';
import { syncTravelToCalendar } from '../../../services/calendar/calendar-bridge.js';
// ============================================================================
// TYPES
// ============================================================================

export type TripType = 'roundtrip' | 'oneway' | 'multicity';
export type CabinClass = 'economy' | 'premium_economy' | 'business' | 'first';

export interface FlightSearch {
  id: string;
  userId: string;
  origin: string;
  destination: string;
  departureDate: Date;
  returnDate?: Date;
  tripType: TripType;
  passengers: number;
  cabinClass: CabinClass;
  results?: FlightResult[];
  createdAt: Date;
}

export interface FlightResult {
  id: string;
  airline: string;
  price: number;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  stops: number;
  bookingUrl?: string;
}

export interface HotelSearch {
  id: string;
  userId: string;
  destination: string;
  checkIn: Date;
  checkOut: Date;
  guests: number;
  rooms: number;
  results?: HotelResult[];
  createdAt: Date;
}

export interface HotelResult {
  id: string;
  name: string;
  rating: number;
  pricePerNight: number;
  totalPrice: number;
  amenities: string[];
  bookingUrl?: string;
}

export interface SavedTrip {
  id: string;
  userId: string;
  name: string;
  destination: string;
  startDate: Date;
  endDate: Date;
  flight?: FlightResult;
  hotel?: HotelResult;
  notes?: string;
  totalBudget?: number;
  createdAt: Date;
}

// ============================================================================
// STORAGE
// ============================================================================

const flightSearches = new Map<string, FlightSearch>();
const hotelSearches = new Map<string, HotelSearch>();
const savedTrips = new Map<string, SavedTrip>();

// ============================================================================
// AIRPORT CODES (Common ones)
// ============================================================================

const AIRPORT_CODES: Record<string, string[]> = {
  'new york': ['JFK', 'LGA', 'EWR'],
  'los angeles': ['LAX'],
  chicago: ['ORD', 'MDW'],
  'san francisco': ['SFO', 'OAK'],
  miami: ['MIA', 'FLL'],
  boston: ['BOS'],
  seattle: ['SEA'],
  denver: ['DEN'],
  atlanta: ['ATL'],
  dallas: ['DFW', 'DAL'],
  london: ['LHR', 'LGW'],
  paris: ['CDG', 'ORY'],
  tokyo: ['NRT', 'HND'],
  sydney: ['SYD'],
};

function findAirportCode(city: string): string {
  const lower = city.toLowerCase();

  // Check if it's already a code
  if (city.length === 3 && city.toUpperCase() === city) {
    return city;
  }

  // Look up city
  for (const [cityName, codes] of Object.entries(AIRPORT_CODES)) {
    if (lower.includes(cityName)) {
      return codes[0];
    }
  }

  // Return as-is (might be a code already)
  return city.toUpperCase().slice(0, 3);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function parseNaturalDate(expression: string): Date | null {
  const now = new Date();
  const lower = expression.toLowerCase().trim();

  // Handle "next [day]"
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < days.length; i++) {
    if (lower.includes(days[i])) {
      const target = new Date(now);
      const currentDay = now.getDay();
      const daysUntil = (i - currentDay + 7) % 7 || 7;
      target.setDate(target.getDate() + daysUntil);
      return target;
    }
  }

  // Handle "in X weeks/months"
  const inWeeksMatch = lower.match(/in\s+(\d+)\s+weeks?/);
  if (inWeeksMatch) {
    const weeks = parseInt(inWeeksMatch[1]);
    const target = new Date(now);
    target.setDate(target.getDate() + weeks * 7);
    return target;
  }

  const inMonthsMatch = lower.match(/in\s+(\d+)\s+months?/);
  if (inMonthsMatch) {
    const months = parseInt(inMonthsMatch[1]);
    const target = new Date(now);
    target.setMonth(target.getMonth() + months);
    return target;
  }

  // Handle month names
  const months = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ];
  for (let i = 0; i < months.length; i++) {
    if (lower.includes(months[i])) {
      const dayMatch = lower.match(/(\d{1,2})/);
      const day = dayMatch ? parseInt(dayMatch[1]) : 15;
      const target = new Date(now.getFullYear(), i, day);
      if (target < now) {
        target.setFullYear(target.getFullYear() + 1);
      }
      return target;
    }
  }

  // Try parsing as date
  const parsed = new Date(expression);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}

// ============================================================================
// API CONFIGURATION
// ============================================================================

// Amadeus API credentials (for real flight search)
// Sign up at: https://developers.amadeus.com/
const AMADEUS_API_KEY = process.env.AMADEUS_API_KEY || '';
const AMADEUS_API_SECRET = process.env.AMADEUS_API_SECRET || '';

// Booking.com Affiliate API (for real hotel search)
// Sign up at: https://developers.booking.com/
const BOOKING_AFFILIATE_ID = process.env.BOOKING_AFFILIATE_ID || '';

/**
 * Check if real travel APIs are configured
 */
export function isTravelApiConfigured(): { flights: boolean; hotels: boolean } {
  return {
    flights: !!(AMADEUS_API_KEY && AMADEUS_API_SECRET),
    hotels: !!BOOKING_AFFILIATE_ID,
  };
}

// ============================================================================
// LIVE SEARCH (no fares or rates unless a live provider answered)
// ============================================================================

/**
 * Outcome of a live search. When the provider is not configured or does not
 * answer, the outcome is 'unavailable' and carries no results: nothing is
 * invented to fill the gap.
 */
export type LiveSearch<T> =
  | { status: 'live'; results: T[] }
  | { status: 'unavailable'; reason: 'not-configured' | 'provider-error' };

// Amadeus flight search: https://developers.amadeus.com/
async function searchFlightsReal(params: {
  origin: string;
  destination: string;
  departureDate: Date;
  returnDate?: Date;
  passengers: number;
  cabinClass: CabinClass;
}): Promise<LiveSearch<FlightResult>> {
  if (!(AMADEUS_API_KEY && AMADEUS_API_SECRET)) {
    return { status: 'unavailable', reason: 'not-configured' };
  }

  try {
    // Get OAuth token
    const tokenResponse = await fetch('https://api.amadeus.com/v1/security/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: AMADEUS_API_KEY,
        client_secret: AMADEUS_API_SECRET,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to get Amadeus token');
    }

    const tokenData = (await tokenResponse.json()) as { access_token: string };

    // Search flights
    const searchParams = new URLSearchParams({
      originLocationCode: params.origin,
      destinationLocationCode: params.destination,
      departureDate: params.departureDate.toISOString().split('T')[0],
      adults: String(params.passengers),
      travelClass: params.cabinClass.toUpperCase().replace('_', ' '),
      max: '10',
    });

    if (params.returnDate) {
      searchParams.append('returnDate', params.returnDate.toISOString().split('T')[0]);
    }

    const searchResponse = await fetch(
      `https://api.amadeus.com/v2/shopping/flight-offers?${searchParams}`,
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!searchResponse.ok) {
      return { status: 'unavailable', reason: 'provider-error' };
    }

    const data = (await searchResponse.json()) as {
      data: Array<{
        id: string;
        price: { total: string };
        itineraries: Array<{
          duration: string;
          segments: Array<{
            departure: { at: string };
            arrival: { at: string };
            operating?: { carrierCode: string };
            carrierCode: string;
          }>;
        }>;
      }>;
    };

    return {
      status: 'live',
      results: (data.data || []).map((offer) => ({
        id: offer.id,
        airline: offer.itineraries[0]?.segments[0]?.carrierCode || 'Unknown',
        price: parseFloat(offer.price.total),
        departureTime: new Date(offer.itineraries[0]?.segments[0]?.departure.at).toLocaleTimeString(
          'en-US',
          { hour: '2-digit', minute: '2-digit' }
        ),
        arrivalTime: new Date(
          offer.itineraries[0]?.segments[offer.itineraries[0].segments.length - 1]?.arrival.at
        ).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        duration: offer.itineraries[0]?.duration.replace('PT', '').toLowerCase() || 'N/A',
        stops: (offer.itineraries[0]?.segments.length || 1) - 1,
        bookingUrl: `https://www.google.com/flights?q=${params.origin}+to+${params.destination}`,
      })),
    };
  } catch (error) {
    getLogger().warn({ error }, 'Amadeus flight search failed; no live fares to show');
    return { status: 'unavailable', reason: 'provider-error' };
  }
}

/** Live flight search. Never returns invented fares. */
export async function searchFlights(params: {
  origin: string;
  destination: string;
  departureDate: Date;
  returnDate?: Date;
  passengers: number;
  cabinClass: CabinClass;
}): Promise<LiveSearch<FlightResult>> {
  const outcome = await searchFlightsReal(params);
  if (outcome.status === 'unavailable') return outcome;
  return { status: 'live', results: [...outcome.results].sort((a, b) => a.price - b.price) };
}

// Booking.com Affiliate API: https://developers.booking.com/
async function searchHotelsReal(params: {
  destination: string;
  checkIn: Date;
  checkOut: Date;
  guests: number;
  rooms: number;
}): Promise<LiveSearch<HotelResult>> {
  if (!BOOKING_AFFILIATE_ID) {
    return { status: 'unavailable', reason: 'not-configured' };
  }

  try {
    // Note: Booking.com Affiliate API requires partner registration
    // This is the basic structure - actual implementation depends on your affiliate tier
    const searchParams = new URLSearchParams({
      dest_type: 'city',
      dest_id: params.destination,
      checkin: params.checkIn.toISOString().split('T')[0],
      checkout: params.checkOut.toISOString().split('T')[0],
      adults: String(params.guests),
      rooms: String(params.rooms),
      affiliate_id: BOOKING_AFFILIATE_ID,
    });

    const response = await fetch(
      `https://distribution-xml.booking.com/2.0/json/hotels?${searchParams}`,
      {
        headers: {
          Authorization: `Bearer ${BOOKING_AFFILIATE_ID}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      return { status: 'unavailable', reason: 'provider-error' };
    }

    const data = (await response.json()) as {
      result: Array<{
        hotel_id: string;
        hotel_name: string;
        review_score: number;
        min_total_price: number;
        hotel_facilities: string;
        url: string;
      }>;
    };

    const nights = Math.ceil(
      (params.checkOut.getTime() - params.checkIn.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      status: 'live',
      results: (data.result || []).slice(0, 10).map((hotel) => ({
        id: hotel.hotel_id,
        name: hotel.hotel_name,
        rating: hotel.review_score / 2, // Convert 0-10 to 0-5
        pricePerNight: Math.round(hotel.min_total_price / nights),
        totalPrice: hotel.min_total_price,
        amenities: (hotel.hotel_facilities || '').split(',').slice(0, 4),
        bookingUrl: hotel.url,
      })),
    };
  } catch (error) {
    getLogger().warn({ error }, 'Booking.com hotel search failed; no live rates to show');
    return { status: 'unavailable', reason: 'provider-error' };
  }
}

/** Live hotel search. Never returns invented rates. */
export async function searchHotels(params: {
  destination: string;
  checkIn: Date;
  checkOut: Date;
  guests: number;
  rooms: number;
}): Promise<LiveSearch<HotelResult>> {
  const outcome = await searchHotelsReal(params);
  if (outcome.status === 'unavailable') return outcome;
  return {
    status: 'live',
    results: [...outcome.results].sort((a, b) => a.pricePerNight - b.pricePerNight),
  };
}

/** What Ferni says when there are no live fares. Offers help, invents nothing. */
function flightsUnavailableText(origin: string, destination: string): string {
  const link = `https://www.google.com/flights?q=${encodeURIComponent(`${origin} to ${destination}`)}`;
  return (
    `I can't look up live flight prices right now, so I don't have real fares for ${origin} to ${destination}, and I won't guess at them. ` +
    `I can help you compare options: nonstop or one stop, flexible dates, bag fees, and whether a fare includes a seat. ` +
    `You can also check the route yourself on Google Flights: ${link}`
  );
}

/** What Ferni says when there are no live rates. Offers help, invents nothing. */
function hotelsUnavailableText(destination: string): string {
  const link = `https://www.google.com/travel/hotels/${encodeURIComponent(destination)}`;
  return (
    `I can't look up live hotel rates right now, so I don't have real prices for ${destination}, and I won't guess at them. ` +
    `I can help you narrow it down: which neighbourhood, a nightly budget, and what matters most (location, breakfast, cancellation terms). ` +
    `You can also check rates yourself here: ${link}`
  );
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createTravelTools() {
  return {
    searchFlights: llm.tool({
      description: getToolDescription('searchFlights'),
      parameters: z.object({
        origin: z.string().describe('Departure city or airport code'),
        destination: z.string().describe('Arrival city or airport code'),
        departureDate: z.string().describe('Departure date (e.g., "March 15", "next Friday")'),
        returnDate: z.string().optional().describe('Return date for roundtrip'),
        passengers: z.number().optional().default(1).describe('Number of passengers'),
        cabinClass: z
          .enum(['economy', 'premium_economy', 'business', 'first'])
          .optional()
          .default('economy'),
      }),
      execute: async (
        { origin, destination, departureDate, returnDate, passengers, cabinClass },
        { ctx }
      ) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        const depDate = parseNaturalDate(departureDate);
        if (!depDate) {
          return `I couldn't understand "${departureDate}". Try something like "March 15" or "next Friday".`;
        }

        const retDate = returnDate ? (parseNaturalDate(returnDate) ?? undefined) : undefined;

        const originCode = findAirportCode(origin);
        const destCode = findAirportCode(destination);

        const outcome = await searchFlights({
          origin: originCode,
          destination: destCode,
          departureDate: depDate,
          returnDate: retDate,
          passengers,
          cabinClass,
        });
        if (outcome.status === 'unavailable') {
          return flightsUnavailableText(originCode, destCode);
        }
        const results = outcome.results;

        // Save search
        const search: FlightSearch = {
          id: generateId('fsearch'),
          userId,
          origin: originCode,
          destination: destCode,
          departureDate: depDate,
          returnDate: retDate,
          tripType: retDate ? 'roundtrip' : 'oneway',
          passengers,
          cabinClass,
          results,
          createdAt: new Date(),
        };
        flightSearches.set(search.id, search);

        const depDateStr = depDate.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        });

        let response = `✈️ **Flights: ${originCode} → ${destCode}**\n`;
        response += `${depDateStr}${retDate ? ' (roundtrip)' : ' (one-way)'}\n`;
        response += `${passengers} passenger${passengers > 1 ? 's' : ''}, ${cabinClass.replace('_', ' ')}\n\n`;

        if (results.length === 0) {
          response += `No flights found. Try different dates?`;
        } else {
          response += `**Best Options:**\n`;
          results.slice(0, 5).forEach((flight, i) => {
            const stops =
              flight.stops === 0 ? 'Nonstop' : `${flight.stops} stop${flight.stops > 1 ? 's' : ''}`;
            response += `${i + 1}. **${flight.airline}** - $${flight.price}\n`;
            response += `   ${flight.departureTime} → ${flight.arrivalTime} (${flight.duration}) | ${stops}\n`;
          });

          const cheapest = results[0];
          response += `\n💰 Cheapest: $${cheapest.price} on ${cheapest.airline}`;

          if (results[0].bookingUrl) {
            response += `\n\n🔗 Book at: ${results[0].bookingUrl}`;
          }
        }

        return response;
      },
    }),

    searchHotels: llm.tool({
      description: getToolDescription('searchHotels'),
      parameters: z.object({
        destination: z.string().describe('City or area to search'),
        checkIn: z.string().describe('Check-in date'),
        checkOut: z.string().describe('Check-out date'),
        guests: z.number().optional().default(2).describe('Number of guests'),
        rooms: z.number().optional().default(1).describe('Number of rooms'),
      }),
      execute: async ({ destination, checkIn, checkOut, guests, rooms }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        const checkInDate = parseNaturalDate(checkIn);
        const checkOutDate = parseNaturalDate(checkOut);

        if (!checkInDate || !checkOutDate) {
          return `I couldn't understand those dates. Try "March 15" or "next Friday".`;
        }

        if (checkOutDate <= checkInDate) {
          return `Check-out date must be after check-in date.`;
        }

        const outcome = await searchHotels({
          destination,
          checkIn: checkInDate,
          checkOut: checkOutDate,
          guests,
          rooms,
        });
        if (outcome.status === 'unavailable') {
          return hotelsUnavailableText(destination);
        }
        const results = outcome.results;

        // Save search
        const search: HotelSearch = {
          id: generateId('hsearch'),
          userId,
          destination,
          checkIn: checkInDate,
          checkOut: checkOutDate,
          guests,
          rooms,
          results,
          createdAt: new Date(),
        };
        hotelSearches.set(search.id, search);

        const nights = Math.ceil(
          (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        const checkInStr = checkInDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });
        const checkOutStr = checkOutDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });

        let response = `🏨 **Hotels in ${destination}**\n`;
        response += `${checkInStr} - ${checkOutStr} (${nights} night${nights > 1 ? 's' : ''})\n`;
        response += `${guests} guest${guests > 1 ? 's' : ''}, ${rooms} room${rooms > 1 ? 's' : ''}\n\n`;

        if (results.length === 0) {
          response += `No hotels found. Try a different area or dates?`;
        } else {
          response += `**Options:**\n`;
          results.slice(0, 5).forEach((hotel, i) => {
            const stars = '⭐'.repeat(Math.round(hotel.rating));
            response += `${i + 1}. **${hotel.name}** ${stars}\n`;
            response += `   $${hotel.pricePerNight}/night ($${hotel.totalPrice} total)\n`;
            response += `   ${hotel.amenities.join(', ')}\n`;
          });

          const cheapest = results[0];
          response += `\n💰 Best deal: $${cheapest.pricePerNight}/night at ${cheapest.name}`;

          if (results[0].bookingUrl) {
            response += `\n\n🔗 Book at: ${results[0].bookingUrl}`;
          }
        }

        return response;
      },
    }),

    planTrip: llm.tool({
      description: getToolDescription('planTrip'),
      parameters: z.object({
        name: z.string().describe('Trip name (e.g., "Hawaii Vacation")'),
        destination: z.string().describe('Destination'),
        startDate: z.string().describe('Start date'),
        endDate: z.string().describe('End date'),
        budget: z.number().optional().describe('Total budget'),
        notes: z.string().optional().describe('Trip notes'),
      }),
      execute: async ({ name, destination, startDate, endDate, budget, notes }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        const start = parseNaturalDate(startDate);
        const end = parseNaturalDate(endDate);

        if (!start || !end) {
          return `I couldn't understand those dates. Try "March 15" or "in 2 weeks".`;
        }

        const trip: SavedTrip = {
          id: generateId('trip'),
          userId,
          name: sanitizePlainText(name, 100),
          destination,
          startDate: start,
          endDate: end,
          totalBudget: budget,
          notes,
          createdAt: new Date(),
        };

        savedTrips.set(trip.id, trip);

        // Sync trip dates to calendar
        try {
          await syncTravelToCalendar(userId, trip.id, destination, start, end, {
            tripName: trip.name,
            notes,
            budget,
          });
        } catch (calendarError) {
          getLogger().warn(
            { error: calendarError, tripId: trip.id },
            'Failed to sync trip to calendar'
          );
        }

        const nights = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        const startStr = start.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        });
        const endStr = end.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        });

        let response = `**Trip Saved: ${trip.name}**\n\n`;
        response += `${destination}\n`;
        response += `${startStr} - ${endStr}\n`;
        response += `${nights} night${nights > 1 ? 's' : ''}\n`;

        if (budget) {
          response += `Budget: $${budget.toLocaleString()}\n`;
        }

        if (notes) {
          response += `${notes}\n`;
        }

        response += `\nAdded to your calendar. Want me to search for flights or hotels?`;

        return response;
      },
    }),

    getSavedTrips: llm.tool({
      description: getToolDescription('getSavedTrips'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        const userTrips = Array.from(savedTrips.values())
          .filter((t) => t.userId === userId)
          .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

        if (userTrips.length === 0) {
          return `No trips planned yet. Say "plan a trip to [destination]" to get started!`;
        }

        let response = `**Your Trips**\n\n`;

        const now = new Date();
        const upcoming = userTrips.filter((t) => t.startDate > now);
        const past = userTrips.filter((t) => t.startDate <= now);

        if (upcoming.length > 0) {
          response += `**Upcoming:**\n`;
          upcoming.forEach((trip) => {
            const daysUntil = Math.ceil(
              (trip.startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
            );
            const dateStr = trip.startDate.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            });
            response += `• **${trip.name}** - ${trip.destination}\n`;
            response += `  ${dateStr} (${daysUntil} days away)`;
            if (trip.totalBudget) {
              response += ` | Budget: $${trip.totalBudget.toLocaleString()}`;
            }
            response += '\n';
          });
          response += '\n';
        }

        if (past.length > 0) {
          response += `**Past Trips:**\n`;
          past.slice(0, 3).forEach((trip) => {
            const dateStr = trip.startDate.toLocaleDateString('en-US', {
              month: 'short',
              year: 'numeric',
            });
            response += `• ${trip.name} - ${trip.destination} (${dateStr})\n`;
          });
        }

        return response;
      },
    }),

    getTripSuggestions: llm.tool({
      description: getToolDescription('getTripSuggestions'),
      parameters: z.object({
        type: z
          .enum(['beach', 'city', 'adventure', 'relaxation', 'budget', 'luxury'])
          .optional()
          .default('city')
          .describe('Type of trip'),
        budget: z.enum(['budget', 'moderate', 'luxury']).optional().default('moderate'),
      }),
      execute: async ({ type, budget }) => {
        const suggestions: Record<string, string[]> = {
          beach: ['Cancun, Mexico', 'Bali, Indonesia', 'Maldives', 'Costa Rica', 'Hawaii'],
          city: ['Tokyo, Japan', 'Barcelona, Spain', 'New York City', 'Paris, France', 'Singapore'],
          adventure: ['Iceland', 'New Zealand', 'Peru', 'Costa Rica', 'Norway'],
          relaxation: ['Maldives', 'Bora Bora', 'Santorini', 'Sedona', 'Lake Como'],
          budget: ['Portugal', 'Vietnam', 'Mexico', 'Thailand', 'Eastern Europe'],
          luxury: ['Maldives', 'Switzerland', 'Dubai', 'Monaco', 'French Riviera'],
        };

        const destinations = suggestions[type] || suggestions['city'];

        let response = `🌍 **${type.charAt(0).toUpperCase() + type.slice(1)} Destinations**\n\n`;
        response += `Perfect for ${budget} budgets:\n\n`;

        destinations.forEach((dest, i) => {
          response += `${i + 1}. ${dest}\n`;
        });

        response += `\nSay "search flights to [destination]" to check prices!`;

        return response;
      },
    }),

    getFlightPrice: llm.tool({
      description: getToolDescription('getFlightPrice'),
      parameters: z.object({
        origin: z.string().describe('From city/airport'),
        destination: z.string().describe('To city/airport'),
        when: z.string().describe('Approximate time (e.g., "next month", "in June")'),
      }),
      execute: async ({ origin, destination, when }) => {
        const originCode = findAirportCode(origin);
        const destCode = findAirportCode(destination);

        if (!isTravelApiConfigured().flights) {
          return flightsUnavailableText(originCode, destCode);
        }

        const depDate = parseNaturalDate(when);
        if (!depDate) {
          return `I can check live fares for a specific day. Which day are you thinking of?`;
        }

        const outcome = await searchFlights({
          origin: originCode,
          destination: destCode,
          departureDate: depDate,
          passengers: 1,
          cabinClass: 'economy',
        });
        if (outcome.status === 'unavailable' || outcome.results.length === 0) {
          return flightsUnavailableText(originCode, destCode);
        }

        const cheapest = outcome.results.reduce((a, b) => (b.price < a.price ? b : a));
        return (
          `💰 **Cheapest live fare: ${originCode} → ${destCode}**\n` +
          `$${cheapest.price} on ${cheapest.airline}, ${cheapest.duration}, ` +
          `${cheapest.stops === 0 ? 'nonstop' : `${cheapest.stops} stop(s)`}.\n` +
          `Prices change by the hour, so check before you book.`
        );
      },
    }),
  };
}

export default createTravelTools;
