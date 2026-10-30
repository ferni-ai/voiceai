/**
 * Traffic & Navigation Tools
 *
 * Get traffic conditions, commute times, and directions.
 *
 * APIs:
 * - Google Maps Distance Matrix API (requires API key)
 * - Google Maps Directions API (requires API key)
 * - HERE API (alternative, free tier available)
 * - TomTom API (alternative)
 *
 * @module tools/traffic
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import {
  googleMapsKey,
  googleMapsKeySource,
  mapsHttpOutcome,
  mapsStatusOutcome,
  type MapsFailure,
} from '../../../config/google-maps-key.js';
import { getLogger } from '../../../utils/safe-logger.js';

import { getToolDescription } from '../../utils/tool-descriptions.js';
import { resolveCallerLocation } from '../../shared/caller-location.js';
import { geocodeHere, getHereRoute } from './traffic-here.js';
// ============================================================================
// CONFIGURATION
// ============================================================================

// The Google key is resolved per call by googleMapsKey() (config/google-maps-key.ts).
const HERE_API_KEY = process.env.HERE_API_KEY || '';

// ============================================================================
// TYPES
// ============================================================================

/** A Google lookup: the value, or why there is none (unconfigured, unauthorized, ...). */
type Lookup<T> = { outcome: 'ok'; value: T } | { outcome: MapsFailure };

/** What the caller hears when a lookup fails. Never blames the addresses for a key or network fault. */
const TRAFFIC_FAILED =
  "I can't look up traffic right now, so I don't have a drive time for you. Google Maps or Waze will have it.";
const DIRECTIONS_FAILED =
  "I can't look up directions right now. Google Maps or Apple Maps will have them.";
const NO_ROUTE = "I couldn't find a route between those two places.";

interface TrafficInfo {
  origin: string;
  destination: string;
  durationInTraffic: number; // minutes
  durationNormal: number; // minutes
  distance: string;
  trafficCondition: 'light' | 'moderate' | 'heavy' | 'severe' | 'unknown';
  summary?: string;
  departureTime?: string;
}

interface DirectionsInfo {
  origin: string;
  destination: string;
  distance: string;
  duration: string;
  steps: string[];
  warnings?: string[];
  alternatives?: Array<{
    via: string;
    duration: string;
    distance: string;
  }>;
}

// ============================================================================
// GOOGLE MAPS API
// ============================================================================

/** Logs a failed lookup by outcome and key source (never the key or the addresses). */
function failed(
  api: string,
  outcome: MapsFailure,
  detail?: number | string
): { outcome: MapsFailure } {
  getLogger().warn(
    { api, outcome, detail, keySource: googleMapsKeySource() },
    'Google Maps lookup failed'
  );
  return { outcome };
}

/**
 * Get traffic time from Google Maps Distance Matrix API
 */
async function getTrafficFromGoogle(
  origin: string,
  destination: string
): Promise<Lookup<TrafficInfo>> {
  const key = googleMapsKey();
  if (!key) return { outcome: 'unconfigured' };

  try {
    const params = new URLSearchParams({
      origins: origin,
      destinations: destination,
      departure_time: 'now',
      traffic_model: 'best_guess',
      key,
    });

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!response.ok)
      return failed('distancematrix', mapsHttpOutcome(response.status), response.status);

    const data = (await response.json()) as {
      status: string;
      origin_addresses?: string[];
      destination_addresses?: string[];
      rows?: Array<{
        elements?: Array<{
          status: string;
          distance?: { text?: string };
          duration?: { value?: number };
          duration_in_traffic?: { value?: number };
        }>;
      }>;
    };

    const status = mapsStatusOutcome(data.status);
    if (status !== 'ok') return failed('distancematrix', status, data.status);

    const element = data.rows?.[0]?.elements?.[0];
    if (!element || element.status !== 'OK') return { outcome: 'no_data' };

    const normalDuration = Math.round((element.duration?.value || 0) / 60);
    const trafficDuration = Math.round((element.duration_in_traffic?.value || 0) / 60);
    const delay = trafficDuration - normalDuration;

    let trafficCondition: TrafficInfo['trafficCondition'] = 'unknown';
    if (delay <= 2) trafficCondition = 'light';
    else if (delay <= 10) trafficCondition = 'moderate';
    else if (delay <= 20) trafficCondition = 'heavy';
    else trafficCondition = 'severe';

    const value: TrafficInfo = {
      origin: data.origin_addresses?.[0] || origin,
      destination: data.destination_addresses?.[0] || destination,
      durationInTraffic: trafficDuration,
      durationNormal: normalDuration,
      distance: element.distance?.text || 'Unknown',
      trafficCondition,
    };
    return { outcome: 'ok', value };
  } catch (error) {
    return failed('distancematrix', 'unreachable', error instanceof Error ? error.name : 'unknown');
  }
}

/**
 * Get directions from Google Maps Directions API
 */
async function getDirectionsFromGoogle(
  origin: string,
  destination: string,
  mode: 'driving' | 'walking' | 'bicycling' | 'transit' = 'driving'
): Promise<Lookup<DirectionsInfo>> {
  const key = googleMapsKey();
  if (!key) return { outcome: 'unconfigured' };

  try {
    const params = new URLSearchParams({
      origin,
      destination,
      mode,
      alternatives: 'true',
      departure_time: 'now',
      key,
    });

    const url = `https://maps.googleapis.com/maps/api/directions/json?${params}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!response.ok)
      return failed('directions', mapsHttpOutcome(response.status), response.status);

    const data = (await response.json()) as {
      status: string;
      routes?: Array<{
        summary?: string;
        legs?: Array<{
          distance?: { text?: string };
          duration?: { text?: string };
          steps?: Array<{
            html_instructions?: string;
            distance?: { text?: string };
          }>;
        }>;
        warnings?: string[];
      }>;
    };

    const status = mapsStatusOutcome(data.status);
    if (status !== 'ok') return failed('directions', status, data.status);
    if (!data.routes?.length) return { outcome: 'no_data' };

    const route = data.routes[0];
    const leg = route.legs?.[0];

    const steps =
      leg?.steps?.map((step) => {
        // Strip HTML tags from instructions
        const instruction = step.html_instructions?.replace(/<[^>]*>/g, '') || '';
        return `${instruction} (${step.distance?.text || ''})`;
      }) || [];

    const alternatives = data.routes.slice(1, 3).map((alt) => ({
      via: alt.summary || 'Alternative route',
      duration: alt.legs?.[0]?.duration?.text || '',
      distance: alt.legs?.[0]?.distance?.text || '',
    }));

    const value: DirectionsInfo = {
      origin,
      destination,
      distance: leg?.distance?.text || 'Unknown',
      duration: leg?.duration?.text || 'Unknown',
      steps,
      warnings: route.warnings,
      alternatives: alternatives.length > 0 ? alternatives : undefined,
    };
    return { outcome: 'ok', value };
  } catch (error) {
    return failed('directions', 'unreachable', error instanceof Error ? error.name : 'unknown');
  }
}

// ============================================================================
// HERE API (Alternative)
// ============================================================================

async function getTrafficFromHERE(
  origin: string,
  destination: string
): Promise<TrafficInfo | null> {
  if (!HERE_API_KEY) return null;

  try {
    const originPos = await geocodeHere(origin);
    const destinationPos = await geocodeHere(destination);
    if (!originPos || !destinationPos) return null;

    const route = await getHereRoute(originPos, destinationPos);
    if (!route) return null;

    const normalDuration = Math.round(route.durationSeconds / 60);
    const trafficDuration = Math.round(route.durationInTrafficSeconds / 60);
    const delay = trafficDuration - normalDuration;

    let trafficCondition: TrafficInfo['trafficCondition'] = 'unknown';
    if (delay <= 2) trafficCondition = 'light';
    else if (delay <= 10) trafficCondition = 'moderate';
    else if (delay <= 20) trafficCondition = 'heavy';
    else trafficCondition = 'severe';

    return {
      origin,
      destination,
      durationInTraffic: trafficDuration,
      durationNormal: normalDuration,
      distance: route.distanceText,
      trafficCondition,
      summary: route.summary,
    };
  } catch (error) {
    getLogger().warn({ error, origin, destination }, 'HERE API error');
    return null;
  }
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Get traffic/commute time between two locations
 */
export async function getTrafficTime(origin: string, destination: string): Promise<string> {
  getLogger().info({ origin, destination }, '🚗 Getting traffic info');

  // Try Google first, then HERE
  const google = await getTrafficFromGoogle(origin, destination);
  const trafficInfo =
    google.outcome === 'ok' ? google.value : await getTrafficFromHERE(origin, destination);

  if (!trafficInfo) {
    getLogger().info({ outcome: google.outcome }, '🚗 No traffic info');
    return google.outcome === 'no_data' ? NO_ROUTE : TRAFFIC_FAILED;
  }

  return formatTrafficInfo(trafficInfo);
}

function formatTrafficInfo(info: TrafficInfo): string {
  const conditionEmoji: Record<string, string> = {
    light: '🟢',
    moderate: '🟡',
    heavy: '🟠',
    severe: '🔴',
    unknown: '⚪',
  };

  const emoji = conditionEmoji[info.trafficCondition];
  let response = `**${info.origin}** → **${info.destination}**\n\n`;

  response += `${emoji} **Traffic:** ${info.trafficCondition.charAt(0).toUpperCase() + info.trafficCondition.slice(1)}\n\n`;
  response += `⏱️ **Current time:** ${info.durationInTraffic} minutes\n`;
  response += `📏 **Distance:** ${info.distance}\n`;

  // Compare to normal
  const delay = info.durationInTraffic - info.durationNormal;
  if (delay > 0) {
    response += `\n⚠️ Taking about ${delay} minutes longer than usual due to traffic.`;
  } else if (delay < -2) {
    response += `\n✨ Actually ${Math.abs(delay)} minutes faster than usual!`;
  } else {
    response += `\n✅ Normal traffic conditions.`;
  }

  return response;
}

/**
 * Get directions between two locations
 */
export async function getDirections(
  origin: string,
  destination: string,
  mode: 'driving' | 'walking' | 'bicycling' | 'transit' = 'driving'
): Promise<string> {
  getLogger().info({ origin, destination, mode }, '🗺️ Getting directions');

  const directions = await getDirectionsFromGoogle(origin, destination, mode);
  if (directions.outcome !== 'ok') {
    return directions.outcome === 'no_data' ? NO_ROUTE : DIRECTIONS_FAILED;
  }
  return formatDirections(directions.value, mode);
}

function formatDirections(info: DirectionsInfo, mode: string): string {
  const modeEmoji: Record<string, string> = {
    driving: '🚗',
    walking: '🚶',
    bicycling: '🚴',
    transit: '🚇',
  };

  let response = `${modeEmoji[mode] || '🗺️'} **Directions: ${mode.charAt(0).toUpperCase() + mode.slice(1)}**\n\n`;
  response += `**From:** ${info.origin}\n`;
  response += `**To:** ${info.destination}\n\n`;
  response += `📏 **Distance:** ${info.distance}\n`;
  response += `⏱️ **Duration:** ${info.duration}\n\n`;

  // Key turns only (not every step)
  if (info.steps.length > 0) {
    response += `**Key directions:**\n`;
    // Show first few and last few steps
    const importantSteps =
      info.steps.length <= 5
        ? info.steps
        : [...info.steps.slice(0, 3), '...', ...info.steps.slice(-2)];

    importantSteps.forEach((step, i) => {
      if (step === '...') {
        response += `• ...\n`;
      } else {
        response += `${i + 1}. ${step}\n`;
      }
    });
  }

  // Alternatives
  if (info.alternatives && info.alternatives.length > 0) {
    response += `\n**Alternative routes:**\n`;
    info.alternatives.forEach((alt) => {
      response += `• Via ${alt.via}: ${alt.duration} (${alt.distance})\n`;
    });
  }

  // Warnings
  if (info.warnings && info.warnings.length > 0) {
    response += `\n⚠️ ${info.warnings.join(', ')}`;
  }

  return response;
}

// ============================================================================
// SAVED LOCATIONS
// ============================================================================

// User's saved locations (home, work, etc.)
// In production, these would be stored per-user in the database
interface SavedLocation {
  name: string;
  address: string;
}

const defaultLocations: Record<string, SavedLocation> = {};

export function setSavedLocation(userId: string, name: string, address: string): void {
  // In production, save to database
  defaultLocations[`${userId}:${name.toLowerCase()}`] = { name, address };
}

export function getSavedLocation(userId: string, name: string): SavedLocation | null {
  return defaultLocations[`${userId}:${name.toLowerCase()}`] || null;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

/** Asked only when the model gave no origin and the caller's location is unknown. */
const ORIGIN_UNKNOWN = "Where are you starting from? I don't have your location.";

export function createTrafficTools() {
  return {
    getCommuteTime: llm.tool({
      description: getToolDescription('getCommuteTime'),
      parameters: z.object({
        origin: z
          .string()
          .optional()
          .describe(
            "Starting location. Optional - leave it out to start from the caller's location"
          ),
        destination: z
          .string()
          .describe('Destination (address, place name, or saved location like "work" or "home")'),
      }),
      execute: async ({ origin, destination }, opts) => {
        const from = resolveCallerLocation(origin, opts);
        if (!from) return ORIGIN_UNKNOWN;
        return getTrafficTime(from, destination);
      },
    }),

    getDirections: llm.tool({
      description: getToolDescription('getDirections'),
      parameters: z.object({
        origin: z
          .string()
          .optional()
          .describe(
            "Starting location. Optional - leave it out to start from the caller's location"
          ),
        destination: z.string().describe('Destination'),
        mode: z
          .enum(['driving', 'walking', 'bicycling', 'transit'])
          .optional()
          .default('driving')
          .describe('Travel mode'),
      }),
      execute: async ({ origin, destination, mode }, opts) => {
        const from = resolveCallerLocation(origin, opts);
        if (!from) return ORIGIN_UNKNOWN;
        return getDirections(from, destination, mode);
      },
    }),

    saveLocation: llm.tool({
      description: getToolDescription('saveLocation'),
      parameters: z.object({
        name: z.string().describe('Name for this location (e.g., "home", "work", "gym")'),
        address: z.string().describe('Full address'),
      }),
      execute: async ({ name, address }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData?.userId || 'default';
        setSavedLocation(userId, name, address);
        return `✅ Saved "${name}" as ${address}. Now you can just say "How long to get to ${name}?"`;
      },
    }),
  };
}

export default createTrafficTools;
