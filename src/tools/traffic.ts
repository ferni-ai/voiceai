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
import { getLogger } from '../utils/safe-logger.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
const HERE_API_KEY = process.env.HERE_API_KEY || '';

// ============================================================================
// TYPES
// ============================================================================

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

/**
 * Get traffic time from Google Maps Distance Matrix API
 */
async function getTrafficFromGoogle(
  origin: string,
  destination: string
): Promise<TrafficInfo | null> {
  if (!GOOGLE_MAPS_API_KEY) return null;

  try {
    const params = new URLSearchParams({
      origins: origin,
      destinations: destination,
      departure_time: 'now',
      traffic_model: 'best_guess',
      key: GOOGLE_MAPS_API_KEY,
    });

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!response.ok) return null;

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

    if (data.status !== 'OK') return null;

    const element = data.rows?.[0]?.elements?.[0];
    if (!element || element.status !== 'OK') return null;

    const normalDuration = Math.round((element.duration?.value || 0) / 60);
    const trafficDuration = Math.round((element.duration_in_traffic?.value || 0) / 60);
    const delay = trafficDuration - normalDuration;

    let trafficCondition: TrafficInfo['trafficCondition'] = 'unknown';
    if (delay <= 2) trafficCondition = 'light';
    else if (delay <= 10) trafficCondition = 'moderate';
    else if (delay <= 20) trafficCondition = 'heavy';
    else trafficCondition = 'severe';

    return {
      origin: data.origin_addresses?.[0] || origin,
      destination: data.destination_addresses?.[0] || destination,
      durationInTraffic: trafficDuration,
      durationNormal: normalDuration,
      distance: element.distance?.text || 'Unknown',
      trafficCondition,
    };
  } catch (error) {
    getLogger().warn({ error, origin, destination }, 'Google Maps API error');
    return null;
  }
}

/**
 * Get directions from Google Maps Directions API
 */
async function getDirectionsFromGoogle(
  origin: string,
  destination: string,
  mode: 'driving' | 'walking' | 'bicycling' | 'transit' = 'driving'
): Promise<DirectionsInfo | null> {
  if (!GOOGLE_MAPS_API_KEY) return null;

  try {
    const params = new URLSearchParams({
      origin,
      destination,
      mode,
      alternatives: 'true',
      departure_time: 'now',
      key: GOOGLE_MAPS_API_KEY,
    });

    const url = `https://maps.googleapis.com/maps/api/directions/json?${params}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!response.ok) return null;

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

    if (data.status !== 'OK' || !data.routes?.length) return null;

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

    return {
      origin,
      destination,
      distance: leg?.distance?.text || 'Unknown',
      duration: leg?.duration?.text || 'Unknown',
      steps,
      warnings: route.warnings,
      alternatives: alternatives.length > 0 ? alternatives : undefined,
    };
  } catch (error) {
    getLogger().warn({ error, origin, destination }, 'Google Directions API error');
    return null;
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

async function geocodeHere(query: string): Promise<{ lat: number; lng: number } | null> {
  const params = new URLSearchParams({ q: query, apiKey: HERE_API_KEY });
  const url = `https://geocode.search.hereapi.com/v1/geocode?${params}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    items?: Array<{ position?: { lat?: number; lng?: number } }>;
  };
  const pos = data.items?.[0]?.position;
  if (!pos || typeof pos.lat !== 'number' || typeof pos.lng !== 'number') return null;
  return { lat: pos.lat, lng: pos.lng };
}

async function getHereRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<{
  distanceText: string;
  durationSeconds: number;
  durationInTrafficSeconds: number;
  summary?: string;
} | null> {
  const params = new URLSearchParams({
    transportMode: 'car',
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    return: 'summary,typicalDuration',
    routingMode: 'fast',
    // enable traffic where supported
    departureTime: 'now',
    apiKey: HERE_API_KEY,
  });

  const url = `https://router.hereapi.com/v8/routes?${params}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) return null;

  const data = (await response.json()) as {
    routes?: Array<{
      sections?: Array<{
        summary?: {
          length?: number; // meters
          duration?: number; // seconds
          baseDuration?: number; // seconds (no traffic)
          typicalDuration?: number; // seconds
        };
      }>;
    }>;
  };

  const summary = data.routes?.[0]?.sections?.[0]?.summary;
  if (!summary) return null;

  const lengthMeters = summary.length ?? 0;
  const durationSeconds = summary.baseDuration ?? summary.typicalDuration ?? summary.duration ?? 0;
  const durationInTrafficSeconds = summary.duration ?? durationSeconds;

  if (durationInTrafficSeconds <= 0) return null;

  const distanceText =
    lengthMeters > 0
      ? lengthMeters >= 1000
        ? `${(lengthMeters / 1000).toFixed(1)} km`
        : `${Math.round(lengthMeters)} m`
      : 'Unknown';

  return {
    distanceText,
    durationSeconds,
    durationInTrafficSeconds,
  };
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
  let trafficInfo = await getTrafficFromGoogle(origin, destination);
  if (!trafficInfo) {
    trafficInfo = await getTrafficFromHERE(origin, destination);
  }

  if (!trafficInfo) {
    // No API configured
    if (!GOOGLE_MAPS_API_KEY && !HERE_API_KEY) {
      return `I don't have traffic data configured yet. To enable this:\n\n1. Get a Google Maps API key from console.cloud.google.com\n2. Enable Distance Matrix API\n3. Add GOOGLE_MAPS_API_KEY to your environment\n\nFor now, try Google Maps or Waze for traffic info.`;
    }
    return `I couldn't get traffic info for that route. Make sure both addresses are valid. Try being more specific with the addresses.`;
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

  if (!directions) {
    if (!GOOGLE_MAPS_API_KEY) {
      return `I don't have navigation configured yet. For directions, try:\n• Google Maps\n• Apple Maps\n• Waze`;
    }
    return `I couldn't find directions for that route. Check that both addresses are valid.`;
  }

  return formatDirections(directions, mode);
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

export function createTrafficTools() {
  return {
    getCommuteTime: llm.tool({
      description: `Get current traffic and commute time between two locations. Use when someone asks:
- "How long to get to work?"
- "What's traffic like to the airport?"
- "How long will it take to drive to mom's house?"
- "Traffic to downtown?"

Provide specific addresses or well-known locations for best results.`,
      parameters: z.object({
        origin: z
          .string()
          .describe('Starting location (address, place name, or "current location")'),
        destination: z
          .string()
          .describe('Destination (address, place name, or saved location like "work" or "home")'),
      }),
      execute: async ({ origin, destination }) => {
        return getTrafficTime(origin, destination);
      },
    }),

    getDirections: llm.tool({
      description: `Get turn-by-turn directions between two locations. Use when someone asks:
- "How do I get to..."
- "Directions to the airport"
- "Navigate to..."
- "What's the best way to get to..."`,
      parameters: z.object({
        origin: z.string().describe('Starting location'),
        destination: z.string().describe('Destination'),
        mode: z
          .enum(['driving', 'walking', 'bicycling', 'transit'])
          .optional()
          .default('driving')
          .describe('Travel mode'),
      }),
      execute: async ({ origin, destination, mode }) => {
        return getDirections(origin, destination, mode);
      },
    }),

    saveLocation: llm.tool({
      description: `Save a frequently used location (like home or work) for quick reference.`,
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
