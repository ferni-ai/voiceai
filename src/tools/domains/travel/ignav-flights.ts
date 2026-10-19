/**
 * Ignav flight-fare client (https://ignav.com/docs): the live fare lookup
 * behind searchFlights when FLIGHT_PROVIDER=ignav.
 *
 * One request per search: POST /fares/one-way. Booking links are a second
 * request per itinerary, so they are not fetched here. Every failure comes
 * back as a typed outcome, never as an empty list.
 */

import { z } from 'zod';
import { getLogger } from '../../utils/tool-helpers.js';
import { formatLocalDate, type FlightQuery } from './amadeus-flights.js';
import type { FlightResult, LiveSearch } from './travel.js';

export const IGNAV_BASE_URL = 'https://ignav.com/api';

const SEARCH_TIMEOUT_MS = 15_000;
/** Replies stay short: the caller reads out the three cheapest options. */
const TOP_RESULTS = 3;

const clockTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, 'local time as YYYY-MM-DDTHH:MM');

// Per the OpenAPI spec (FareSearchResponseModel, ItineraryModel, LegModel,
// SegmentModel): carrier, duration and the segment carrier names may be null.
const segmentSchema = z.object({
  marketing_carrier_code: z.string().nullish(),
  operating_carrier_name: z.string().nullish(),
  departure_airport: z.string(),
  arrival_airport: z.string(),
  departure_time_local: clockTime,
  arrival_time_local: clockTime,
});

const itinerarySchema = z.object({
  ignav_id: z.string(),
  price: z.object({ amount: z.number(), currency: z.string() }),
  outbound: z.object({
    carrier: z.string().nullish(),
    duration_minutes: z.number().int().nullish(),
    segments: z.array(segmentSchema).min(1),
  }),
});

type Itinerary = z.infer<typeof itinerarySchema>;

// Each itinerary is parsed on its own, so one malformed option drops only itself.
const searchResponseSchema = z.object({
  itineraries: z.array(z.unknown()),
});

/** 401 and 403 are a refused key; 402 is billing that has stopped the account. */
function refusedStatus(status: number): boolean {
  return status === 401 || status === 402 || status === 403;
}

/** "2026-10-23T08:05:00" to "8:05 AM", read from the local clock string as sent. */
function clockLabel(local: string): string {
  const [hour, minute] = local.slice(11, 16).split(':').map(Number);
  const suffix = hour < 12 ? 'AM' : 'PM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function durationLabel(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** The carrier the caller hears: the leg's carrier, else the first segment's. */
function airlineName(itinerary: Itinerary): string {
  const [first] = itinerary.outbound.segments;
  return (
    itinerary.outbound.carrier ??
    first.operating_carrier_name ??
    first.marketing_carrier_code ??
    'Unknown'
  );
}

function toFlightResult(itinerary: Itinerary, query: FlightQuery): FlightResult {
  const { segments, duration_minutes: minutes } = itinerary.outbound;
  return {
    id: itinerary.ignav_id,
    airline: airlineName(itinerary),
    price: itinerary.price.amount,
    currency: itinerary.price.currency,
    departureTime: clockLabel(segments[0].departure_time_local),
    arrivalTime: clockLabel(segments[segments.length - 1].arrival_time_local),
    duration: minutes == null ? 'N/A' : durationLabel(minutes),
    stops: segments.length - 1,
    bookingUrl: `https://www.google.com/flights?q=${query.origin}+to+${query.destination}`,
  };
}

export class IgnavFlightProvider {
  constructor(private readonly apiKey: string) {}

  /** One-way fares for one route and day. Round trips and groups are not supported yet. */
  async search(query: FlightQuery): Promise<LiveSearch<FlightResult>> {
    if (query.returnDate || query.passengers !== 1) {
      return { status: 'unavailable', reason: 'unsupported-query' };
    }

    try {
      const response = await fetch(`${IGNAV_BASE_URL}/fares/one-way`, {
        method: 'POST',
        headers: { 'X-Api-Key': this.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: query.origin,
          destination: query.destination,
          departure_date: formatLocalDate(query.departureDate),
          cabin_class: query.cabinClass,
        }),
        signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { code?: unknown };
        } | null;
        getLogger().warn(
          { status: response.status, code: body?.error?.code },
          'Ignav flight search returned an error'
        );
        return {
          status: 'unavailable',
          reason: refusedStatus(response.status) ? 'provider-rejected' : 'provider-error',
        };
      }

      const envelope = searchResponseSchema.safeParse(await response.json());
      if (!envelope.success) {
        getLogger().warn('Ignav reply had no itineraries list');
        return { status: 'unavailable', reason: 'provider-error' };
      }

      const parsed = envelope.data.itineraries.map((item) => itinerarySchema.safeParse(item));
      const usable = parsed.flatMap((item) => (item.success ? [item.data] : []));
      const dropped = parsed.length - usable.length;
      if (dropped > 0) {
        getLogger().warn({ dropped }, 'Ignav reply had itineraries with an unexpected shape');
      }
      if (parsed.length > 0 && usable.length === 0) {
        return { status: 'unavailable', reason: 'provider-error' };
      }

      const results = usable
        .filter((itinerary) => itinerary.price.amount > 0)
        .map((itinerary) => toFlightResult(itinerary, query))
        .sort((a, b) => a.price - b.price)
        .slice(0, TOP_RESULTS);
      return { status: 'live', results };
    } catch (error) {
      getLogger().warn(
        { error: String(error) },
        'Ignav flight search failed; no live fares to show'
      );
      return { status: 'unavailable', reason: 'provider-error' };
    }
  }
}
