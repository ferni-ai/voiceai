/**
 * The flight-search provider behind searchFlights and getFlightPrice.
 *
 * FLIGHT_PROVIDER picks the provider: `ignav` or `amadeus` (the default, and
 * what an unknown value falls back to). Keys are read when a search runs, so
 * a changed environment takes effect without reloading the module.
 *
 * @module tools/domains/travel/flight-provider
 */

import { searchAmadeusFlights, type FlightQuery } from './amadeus-flights.js';
import { IgnavFlightProvider } from './ignav-flights.js';
import type { FlightResult, LiveSearch } from './travel.js';

export type FlightProviderName = 'amadeus' | 'ignav';

/** The provider the FLIGHT_PROVIDER flag selects. Unset or unknown is Amadeus. */
export function selectedFlightProvider(): FlightProviderName {
  return process.env.FLIGHT_PROVIDER?.trim().toLowerCase() === 'ignav' ? 'ignav' : 'amadeus';
}

/** Whether the selected provider has the credentials it needs. */
export function flightProviderConfigured(): boolean {
  if (selectedFlightProvider() === 'ignav') return !!process.env.IGNAV_API_KEY;
  return !!(process.env.AMADEUS_API_KEY && process.env.AMADEUS_API_SECRET);
}

/** Live flight search with the selected provider. Never returns invented fares. */
export async function searchFlights(params: FlightQuery): Promise<LiveSearch<FlightResult>> {
  const outcome = await searchWithSelectedProvider(params);
  if (outcome.status === 'unavailable') return outcome;
  return { status: 'live', results: [...outcome.results].sort((a, b) => a.price - b.price) };
}

async function searchWithSelectedProvider(params: FlightQuery): Promise<LiveSearch<FlightResult>> {
  if (selectedFlightProvider() === 'ignav') {
    const apiKey = process.env.IGNAV_API_KEY;
    if (!apiKey) return { status: 'unavailable', reason: 'not-configured' };
    return new IgnavFlightProvider(apiKey).search(params);
  }

  const key = process.env.AMADEUS_API_KEY;
  const secret = process.env.AMADEUS_API_SECRET;
  if (!(key && secret)) {
    return { status: 'unavailable', reason: 'not-configured' };
  }
  return searchAmadeusFlights({ key, secret }, params);
}
