/**
 * Amadeus flight-offers client: the live fare lookup behind searchFlights.
 *
 * Every failure comes back as a typed outcome, never as an empty list, so the
 * tool can say what went wrong instead of leaving the model to guess.
 */

import { getLogger } from '../../utils/tool-helpers.js';
import type { CabinClass, FlightResult, LiveSearch } from './travel.js';

/**
 * Production host. The Amadeus test host (test.api.amadeus.com) no longer
 * resolves, and keys from the retired self-service portal are refused.
 */
export const AMADEUS_HOST = 'https://api.amadeus.com';

const TOKEN_TIMEOUT_MS = 10_000;
const SEARCH_TIMEOUT_MS = 15_000;

export interface AmadeusCredentials {
  key: string;
  secret: string;
}

export interface FlightQuery {
  origin: string;
  destination: string;
  departureDate: Date;
  returnDate?: Date;
  passengers: number;
  cabinClass: CabinClass;
}

interface FlightOffer {
  id: string;
  price: { total: string };
  itineraries: Array<{
    duration: string;
    segments: Array<{
      departure: { at: string };
      arrival: { at: string };
      carrierCode: string;
    }>;
  }>;
}

interface FlightOffersResponse {
  data?: FlightOffer[];
}

/**
 * The calendar day in the server's local zone, as YYYY-MM-DD. Not
 * toISOString(): that reads the UTC day, so an evening in the US reaches the
 * next day.
 */
export function formatLocalDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Amadeus cabin names are ECONOMY, PREMIUM_ECONOMY, BUSINESS and FIRST. */
export function amadeusCabin(cabin: CabinClass): string {
  return cabin.toUpperCase();
}

/** A refused key (revoked, retired or unauthorised) is 'provider-rejected'. */
function refusedStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 410;
}

function toFlightResult(offer: FlightOffer, query: FlightQuery): FlightResult {
  const first = offer.itineraries[0];
  const firstSegment = first?.segments[0];
  const lastSegment = first?.segments[first.segments.length - 1];
  return {
    id: offer.id,
    airline: firstSegment?.carrierCode || 'Unknown',
    price: parseFloat(offer.price.total),
    departureTime: new Date(firstSegment?.departure.at ?? '').toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    arrivalTime: new Date(lastSegment?.arrival.at ?? '').toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    duration: first?.duration.replace('PT', '').toLowerCase() || 'N/A',
    stops: (first?.segments.length || 1) - 1,
    bookingUrl: `https://www.google.com/flights?q=${query.origin}+to+${query.destination}`,
  };
}

/** Live fares for one route and day. Never returns invented fares. */
export async function searchAmadeusFlights(
  credentials: AmadeusCredentials,
  query: FlightQuery
): Promise<LiveSearch<FlightResult>> {
  try {
    const tokenResponse = await fetch(`${AMADEUS_HOST}/v1/security/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: credentials.key,
        client_secret: credentials.secret,
      }),
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
    if (!tokenResponse.ok) {
      getLogger().warn({ status: tokenResponse.status }, 'Amadeus refused the token request');
      return {
        status: 'unavailable',
        reason: refusedStatus(tokenResponse.status) ? 'provider-rejected' : 'provider-error',
      };
    }
    const { access_token: accessToken } = (await tokenResponse.json()) as { access_token: string };

    const searchParams = new URLSearchParams({
      originLocationCode: query.origin,
      destinationLocationCode: query.destination,
      departureDate: formatLocalDate(query.departureDate),
      adults: String(query.passengers),
      travelClass: amadeusCabin(query.cabinClass),
      max: '10',
    });
    if (query.returnDate) {
      searchParams.append('returnDate', formatLocalDate(query.returnDate));
    }

    const searchResponse = await fetch(
      `${AMADEUS_HOST}/v2/shopping/flight-offers?${searchParams}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      }
    );
    if (!searchResponse.ok) {
      getLogger().warn(
        { status: searchResponse.status },
        'Amadeus flight search returned an error'
      );
      return {
        status: 'unavailable',
        reason: refusedStatus(searchResponse.status) ? 'provider-rejected' : 'provider-error',
      };
    }

    const data = (await searchResponse.json()) as FlightOffersResponse;
    return {
      status: 'live',
      results: (data.data || []).map((offer) => toFlightResult(offer, query)),
    };
  } catch (error) {
    getLogger().warn(
      { error: String(error) },
      'Amadeus flight search failed; no live fares to show'
    );
    return { status: 'unavailable', reason: 'provider-error' };
  }
}
