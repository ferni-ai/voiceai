/**
 * Flight Status & Travel Tools
 *
 * Track flight status, delays, and gate changes.
 *
 * APIs:
 * - AviationStack (free tier: 100 requests/month)
 * - FlightAware (alternative, requires paid plan)
 * - AeroDataBox (via RapidAPI, free tier available)
 *
 * @module tools/flights
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';

import { getToolDescription } from '../../utils/tool-descriptions.js';
// ============================================================================
// CONFIGURATION
// ============================================================================

const AVIATIONSTACK_API_KEY = process.env.AVIATIONSTACK_API_KEY || '';
const AERO_DATABOX_KEY = process.env.AERO_DATABOX_API_KEY || '';

// Fallback: Use free FlightRadar24 unofficial API structure
const FLIGHTRADAR_BASE = 'https://data-cloud.flightradar24.com/zones/fcgi/feed.js';

// ============================================================================
// TYPES
// ============================================================================

interface FlightInfo {
  flightNumber: string;
  airline: string;
  status: 'scheduled' | 'active' | 'landed' | 'cancelled' | 'diverted' | 'delayed' | 'unknown';
  departure: {
    airport: string;
    airportCode: string;
    scheduled: string;
    actual?: string;
    terminal?: string;
    gate?: string;
    delay?: number; // minutes
  };
  arrival: {
    airport: string;
    airportCode: string;
    scheduled: string;
    estimated?: string;
    actual?: string;
    terminal?: string;
    gate?: string;
    baggage?: string;
  };
  aircraft?: string;
}

// ============================================================================
// AIRLINE CODES
// ============================================================================

const AIRLINE_CODES: Record<string, string> = {
  AA: 'American Airlines',
  DL: 'Delta Air Lines',
  UA: 'United Airlines',
  WN: 'Southwest Airlines',
  B6: 'JetBlue Airways',
  AS: 'Alaska Airlines',
  NK: 'Spirit Airlines',
  F9: 'Frontier Airlines',
  G4: 'Allegiant Air',
  HA: 'Hawaiian Airlines',
  BA: 'British Airways',
  LH: 'Lufthansa',
  AF: 'Air France',
  KL: 'KLM',
  EK: 'Emirates',
  QR: 'Qatar Airways',
  SQ: 'Singapore Airlines',
  CX: 'Cathay Pacific',
  NH: 'ANA',
  JL: 'Japan Airlines',
  AC: 'Air Canada',
  QF: 'Qantas',
  VA: 'Virgin Atlantic',
  VS: 'Virgin Atlantic',
  IB: 'Iberia',
  AZ: 'ITA Airways',
  TK: 'Turkish Airlines',
  EY: 'Etihad Airways',
  LX: 'Swiss International',
  OS: 'Austrian Airlines',
  SK: 'SAS Scandinavian',
  AY: 'Finnair',
  TP: 'TAP Air Portugal',
  EI: 'Aer Lingus',
  FR: 'Ryanair',
  U2: 'easyJet',
  W6: 'Wizz Air',
};

function getAirlineName(code: string): string {
  const upperCode = code.toUpperCase().slice(0, 2);
  return AIRLINE_CODES[upperCode] || code;
}

// ============================================================================
// FLIGHT STATUS LOOKUP
// ============================================================================

/**
 * Get flight status from AviationStack API
 */
async function getFlightFromAviationStack(flightNumber: string): Promise<FlightInfo | null> {
  if (!AVIATIONSTACK_API_KEY) return null;

  try {
    const url = `http://api.aviationstack.com/v1/flights?access_key=${AVIATIONSTACK_API_KEY}&flight_iata=${flightNumber}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      data?: Array<{
        flight?: { iata?: string };
        airline?: { name?: string };
        flight_status?: string;
        departure?: {
          airport?: string;
          iata?: string;
          scheduled?: string;
          actual?: string;
          terminal?: string;
          gate?: string;
          delay?: number;
        };
        arrival?: {
          airport?: string;
          iata?: string;
          scheduled?: string;
          estimated?: string;
          actual?: string;
          terminal?: string;
          gate?: string;
          baggage?: string;
        };
        aircraft?: { registration?: string };
      }>;
    };

    const flight = data.data?.[0];
    if (!flight) return null;

    return {
      flightNumber: flight.flight?.iata || flightNumber,
      airline: flight.airline?.name || getAirlineName(flightNumber),
      status: (flight.flight_status as FlightInfo['status']) || 'unknown',
      departure: {
        airport: flight.departure?.airport || 'Unknown',
        airportCode: flight.departure?.iata || '',
        scheduled: flight.departure?.scheduled || '',
        actual: flight.departure?.actual,
        terminal: flight.departure?.terminal,
        gate: flight.departure?.gate,
        delay: flight.departure?.delay,
      },
      arrival: {
        airport: flight.arrival?.airport || 'Unknown',
        airportCode: flight.arrival?.iata || '',
        scheduled: flight.arrival?.scheduled || '',
        estimated: flight.arrival?.estimated,
        actual: flight.arrival?.actual,
        terminal: flight.arrival?.terminal,
        gate: flight.arrival?.gate,
        baggage: flight.arrival?.baggage,
      },
      aircraft: flight.aircraft?.registration,
    };
  } catch (error) {
    getLogger().warn({ error, flightNumber }, 'AviationStack API error');
    return null;
  }
}

/**
 * Get flight status from AeroDataBox (RapidAPI)
 */
async function getFlightFromAeroDataBox(flightNumber: string): Promise<FlightInfo | null> {
  if (!AERO_DATABOX_KEY) return null;

  try {
    const today = new Date().toISOString().split('T')[0];
    const url = `https://aerodatabox.p.rapidapi.com/flights/number/${flightNumber}/${today}`;

    const response = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': AERO_DATABOX_KEY,
        'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;

    const flights = (await response.json()) as Array<{
      number?: string;
      airline?: { name?: string };
      status?: string;
      departure?: {
        airport?: { name?: string; iata?: string };
        scheduledTimeLocal?: string;
        actualTimeLocal?: string;
        terminal?: string;
        gate?: string;
      };
      arrival?: {
        airport?: { name?: string; iata?: string };
        scheduledTimeLocal?: string;
        actualTimeLocal?: string;
        terminal?: string;
        gate?: string;
        baggageBelt?: string;
      };
      aircraft?: { model?: string };
    }>;

    const flight = flights?.[0];
    if (!flight) return null;

    return {
      flightNumber: flight.number || flightNumber,
      airline: flight.airline?.name || getAirlineName(flightNumber),
      status: mapAeroDataBoxStatus(flight.status || ''),
      departure: {
        airport: flight.departure?.airport?.name || 'Unknown',
        airportCode: flight.departure?.airport?.iata || '',
        scheduled: flight.departure?.scheduledTimeLocal || '',
        actual: flight.departure?.actualTimeLocal,
        terminal: flight.departure?.terminal,
        gate: flight.departure?.gate,
      },
      arrival: {
        airport: flight.arrival?.airport?.name || 'Unknown',
        airportCode: flight.arrival?.airport?.iata || '',
        scheduled: flight.arrival?.scheduledTimeLocal || '',
        actual: flight.arrival?.actualTimeLocal,
        terminal: flight.arrival?.terminal,
        gate: flight.arrival?.gate,
        baggage: flight.arrival?.baggageBelt,
      },
      aircraft: flight.aircraft?.model,
    };
  } catch (error) {
    getLogger().warn({ error, flightNumber }, 'AeroDataBox API error');
    return null;
  }
}

function mapAeroDataBoxStatus(status: string): FlightInfo['status'] {
  const statusLower = status.toLowerCase();
  if (statusLower.includes('landed') || statusLower.includes('arrived')) return 'landed';
  if (
    statusLower.includes('active') ||
    statusLower.includes('airborne') ||
    statusLower.includes('en route')
  )
    return 'active';
  if (statusLower.includes('cancelled')) return 'cancelled';
  if (statusLower.includes('diverted')) return 'diverted';
  if (statusLower.includes('delayed')) return 'delayed';
  if (statusLower.includes('scheduled')) return 'scheduled';
  return 'unknown';
}

/**
 * Main function to get flight status
 * Tries multiple APIs in order of preference
 */
export async function getFlightStatus(flightNumber: string): Promise<string> {
  // Normalize flight number (remove spaces, uppercase)
  const normalizedFlight = flightNumber.replace(/\s+/g, '').toUpperCase();

  getLogger().info({ flightNumber: normalizedFlight }, '✈️ Looking up flight status');

  // Try APIs in order
  let flightInfo = await getFlightFromAviationStack(normalizedFlight);

  if (!flightInfo) {
    flightInfo = await getFlightFromAeroDataBox(normalizedFlight);
  }

  if (!flightInfo) {
    // No API configured or no data found
    if (!AVIATIONSTACK_API_KEY && !AERO_DATABOX_KEY) {
      return `I don't have flight tracking configured yet. To enable this feature, you'll need to add an API key for AviationStack or AeroDataBox.\n\nIn the meantime, you can check:\n• FlightAware.com\n• FlightRadar24.com\n• The airline's website or app`;
    }
    return `I couldn't find flight ${normalizedFlight}. Double-check the flight number? It should be like "AA123" or "United 456". If it's a future flight, I can only track flights within the next 24 hours.`;
  }

  // Format the response
  return formatFlightStatus(flightInfo);
}

function formatFlightStatus(flight: FlightInfo): string {
  const statusEmoji: Record<string, string> = {
    scheduled: '📅',
    active: '✈️',
    landed: '✅',
    cancelled: '❌',
    diverted: '⚠️',
    delayed: '⏰',
    unknown: '❓',
  };

  const emoji = statusEmoji[flight.status] || '✈️';
  let response = `${emoji} **${flight.airline} ${flight.flightNumber}**\n\n`;

  // Status
  const statusText = flight.status.charAt(0).toUpperCase() + flight.status.slice(1);
  response += `**Status:** ${statusText}\n\n`;

  // Departure info
  response += `**Departure:** ${flight.departure.airport} (${flight.departure.airportCode})\n`;
  if (flight.departure.scheduled) {
    response += `• Scheduled: ${formatFlightTime(flight.departure.scheduled)}\n`;
  }
  if (flight.departure.actual) {
    response += `• Actual: ${formatFlightTime(flight.departure.actual)}\n`;
  }
  if (flight.departure.delay && flight.departure.delay > 0) {
    response += `• ⏰ Delayed ${flight.departure.delay} minutes\n`;
  }
  if (flight.departure.terminal) {
    response += `• Terminal: ${flight.departure.terminal}\n`;
  }
  if (flight.departure.gate) {
    response += `• Gate: ${flight.departure.gate}\n`;
  }
  response += '\n';

  // Arrival info
  response += `**Arrival:** ${flight.arrival.airport} (${flight.arrival.airportCode})\n`;
  if (flight.arrival.scheduled) {
    response += `• Scheduled: ${formatFlightTime(flight.arrival.scheduled)}\n`;
  }
  if (flight.arrival.estimated && flight.arrival.estimated !== flight.arrival.scheduled) {
    response += `• Estimated: ${formatFlightTime(flight.arrival.estimated)}\n`;
  }
  if (flight.arrival.actual) {
    response += `• Actual: ${formatFlightTime(flight.arrival.actual)}\n`;
  }
  if (flight.arrival.terminal) {
    response += `• Terminal: ${flight.arrival.terminal}\n`;
  }
  if (flight.arrival.gate) {
    response += `• Gate: ${flight.arrival.gate}\n`;
  }
  if (flight.arrival.baggage) {
    response += `• Baggage: Carousel ${flight.arrival.baggage}\n`;
  }

  return response;
}

function formatFlightTime(isoTime: string): string {
  try {
    const date = new Date(isoTime);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    });
  } catch {
    return isoTime;
  }
}

// ============================================================================
// AIRPORT INFO
// ============================================================================

const MAJOR_AIRPORTS: Record<string, { name: string; city: string; timezone: string }> = {
  ATL: { name: 'Hartsfield-Jackson', city: 'Atlanta', timezone: 'America/New_York' },
  LAX: { name: 'Los Angeles International', city: 'Los Angeles', timezone: 'America/Los_Angeles' },
  ORD: { name: "O'Hare International", city: 'Chicago', timezone: 'America/Chicago' },
  DFW: { name: 'Dallas/Fort Worth', city: 'Dallas', timezone: 'America/Chicago' },
  DEN: { name: 'Denver International', city: 'Denver', timezone: 'America/Denver' },
  JFK: { name: 'John F. Kennedy', city: 'New York', timezone: 'America/New_York' },
  SFO: {
    name: 'San Francisco International',
    city: 'San Francisco',
    timezone: 'America/Los_Angeles',
  },
  SEA: { name: 'Seattle-Tacoma', city: 'Seattle', timezone: 'America/Los_Angeles' },
  LAS: { name: 'Harry Reid International', city: 'Las Vegas', timezone: 'America/Los_Angeles' },
  MCO: { name: 'Orlando International', city: 'Orlando', timezone: 'America/New_York' },
  EWR: { name: 'Newark Liberty', city: 'Newark', timezone: 'America/New_York' },
  MIA: { name: 'Miami International', city: 'Miami', timezone: 'America/New_York' },
  PHX: { name: 'Phoenix Sky Harbor', city: 'Phoenix', timezone: 'America/Phoenix' },
  IAH: { name: 'George Bush Intercontinental', city: 'Houston', timezone: 'America/Chicago' },
  BOS: { name: 'Logan International', city: 'Boston', timezone: 'America/New_York' },
  MSP: { name: 'Minneapolis-Saint Paul', city: 'Minneapolis', timezone: 'America/Chicago' },
  DTW: { name: 'Detroit Metropolitan', city: 'Detroit', timezone: 'America/Detroit' },
  PHL: { name: 'Philadelphia International', city: 'Philadelphia', timezone: 'America/New_York' },
  LGA: { name: 'LaGuardia', city: 'New York', timezone: 'America/New_York' },
  BWI: { name: 'Baltimore/Washington', city: 'Baltimore', timezone: 'America/New_York' },
  // International
  LHR: { name: 'Heathrow', city: 'London', timezone: 'Europe/London' },
  CDG: { name: 'Charles de Gaulle', city: 'Paris', timezone: 'Europe/Paris' },
  FRA: { name: 'Frankfurt', city: 'Frankfurt', timezone: 'Europe/Berlin' },
  AMS: { name: 'Schiphol', city: 'Amsterdam', timezone: 'Europe/Amsterdam' },
  DXB: { name: 'Dubai International', city: 'Dubai', timezone: 'Asia/Dubai' },
  HND: { name: 'Haneda', city: 'Tokyo', timezone: 'Asia/Tokyo' },
  NRT: { name: 'Narita', city: 'Tokyo', timezone: 'Asia/Tokyo' },
  SIN: { name: 'Changi', city: 'Singapore', timezone: 'Asia/Singapore' },
  HKG: { name: 'Hong Kong International', city: 'Hong Kong', timezone: 'Asia/Hong_Kong' },
  SYD: { name: 'Sydney Kingsford Smith', city: 'Sydney', timezone: 'Australia/Sydney' },
  YYZ: { name: 'Toronto Pearson', city: 'Toronto', timezone: 'America/Toronto' },
  MEX: { name: 'Mexico City International', city: 'Mexico City', timezone: 'America/Mexico_City' },
  GRU: { name: 'São Paulo–Guarulhos', city: 'São Paulo', timezone: 'America/Sao_Paulo' },
};

export function getAirportInfo(code: string): string {
  const airport = MAJOR_AIRPORTS[code.toUpperCase()];
  if (!airport) {
    return `I don't have detailed info for ${code}. Check the airport's website for terminal maps and amenities.`;
  }

  const currentTime = new Date().toLocaleTimeString('en-US', {
    timeZone: airport.timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return `**${airport.name} (${code.toUpperCase()})**\nCity: ${airport.city}\nLocal time: ${currentTime}`;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createFlightTools() {
  return {
    getFlightStatus: llm.tool({
      description: getToolDescription('getFlightStatus'),
      parameters: z.object({
        flightNumber: z.string().describe('Flight number (e.g., "AA123", "United 456", "DL789")'),
      }),
      execute: async ({ flightNumber }) => {
        return getFlightStatus(flightNumber);
      },
    }),

    getAirportInfo: llm.tool({
      description: getToolDescription('getAirportInfo'),
      parameters: z.object({
        airportCode: z.string().describe('Three-letter airport code (e.g., "JFK", "LAX", "LHR")'),
      }),
      execute: async ({ airportCode }) => {
        return getAirportInfo(airportCode);
      },
    }),
  };
}

export default createFlightTools;
