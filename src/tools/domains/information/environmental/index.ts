/**
 * Environmental Health Tools
 *
 * Domain: Environmental factors affecting health and outdoor activities.
 * Provides air quality, UV index, pollen forecasts, and activity recommendations.
 *
 * "Better than human": No friend checks AQI, UV, and pollen for you daily.
 * We do, and we know if you have allergies or sensitive skin.
 *
 * TOOLS:
 *   getAirQuality       - Current AQI with health recommendations
 *   getUVIndex          - UV levels with skin-type-aware burn time
 *   getPollenForecast   - Pollen by type with allergy advice
 *   getOutdoorAdvice    - Combined recommendation for outdoor activities
 *   shouldIRunOutside   - Quick yes/no for outdoor exercise
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../../utils/safe-logger.js';
import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import { getToolDescription } from '../../../utils/tool-descriptions.js';

// Import implementations
import { getAirQuality, getAirQualitySummary, isAirQualitySafeForExercise } from './air-quality.js';
import { getUVIndex, getUVSummary, isUVSafeForOutdoors } from './uv-index.js';
import { getPollenForecast, getPollenSummary, isPollenSafeForAllergies } from './pollen.js';
import { getOutdoorActivityAdvice, shouldExerciseOutside } from './outdoor-advice.js';

// Re-export types and implementations
export * from './types.js';
export {
  getAirQuality,
  getAirQualitySummary,
  isAirQualitySafeForExercise,
  getUVIndex,
  getUVSummary,
  isUVSafeForOutdoors,
  getPollenForecast,
  getPollenSummary,
  isPollenSafeForAllergies,
  getOutdoorActivityAdvice,
  shouldExerciseOutside,
};

const log = getLogger();

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export const environmentalToolDefinitions: ToolDefinition[] = [
  // ────────────────────────────────────────────────────────────────────────
  // AIR QUALITY
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'getAirQuality',
    name: 'Get Air Quality',
    description:
      'Get current air quality index (AQI) with health recommendations. Includes PM2.5, ozone, and other pollutants.',
    domain: 'information',
    tags: ['information', 'health', 'air-quality', 'environment', 'aqi'],
    create: (ctx: ToolContext) =>
      llm.tool({
        description:
          "Get air quality for a location. Use when user asks about air quality, AQI, pollution, smog, or if it's safe to exercise outside. Returns AQI level, dominant pollutant, and health recommendations.",
        parameters: z.object({
          location: z
            .string()
            .optional()
            .describe(
              'City name (e.g., "Los Angeles", "Beijing"). Uses detected location if not provided.'
            ),
        }),
        execute: async ({ location }) => {
          const startTime = Date.now();

          // Use detected location if not provided
          let effectiveLocation = location;
          if (!effectiveLocation && ctx.userLocation?.city) {
            effectiveLocation = ctx.userLocation.regionCode
              ? `${ctx.userLocation.city}, ${ctx.userLocation.regionCode}`
              : ctx.userLocation.city;
            log.info({ detected: effectiveLocation }, '📍 Using detected location for air quality');
          }

          if (!effectiveLocation) {
            return "I don't know your location. Which city would you like air quality for?";
          }

          log.info({ location: effectiveLocation }, '🌬️ Air quality tool called');

          try {
            const result = await getAirQuality(effectiveLocation);
            log.info({ elapsed: Date.now() - startTime }, '🌬️ Air quality returned');
            return result;
          } catch (error) {
            log.error({ error: String(error) }, '🌬️ Air quality error');
            return `I couldn't get air quality for ${effectiveLocation}. Try again in a moment?`;
          }
        },
      }),
  },

  // ────────────────────────────────────────────────────────────────────────
  // UV INDEX
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'getUVIndex',
    name: 'Get UV Index',
    description:
      'Get UV index with sunscreen recommendations and estimated burn time based on skin type.',
    domain: 'information',
    tags: ['information', 'health', 'uv', 'sun', 'sunscreen', 'environment'],
    create: (ctx: ToolContext) =>
      llm.tool({
        description:
          'Get UV index for a location. Use when user asks about UV, sunburn risk, sunscreen needs, or mentions spending time in the sun. Can provide personalized burn time estimates based on skin type.',
        parameters: z.object({
          location: z
            .string()
            .optional()
            .describe('City name. Uses detected location if not provided.'),
          skinType: z
            .enum(['very_fair', 'fair', 'medium', 'olive', 'brown', 'dark'])
            .optional()
            .describe("User's skin type for personalized burn time estimate"),
        }),
        execute: async ({ location, skinType }) => {
          const startTime = Date.now();

          let effectiveLocation = location;
          if (!effectiveLocation && ctx.userLocation?.city) {
            effectiveLocation = ctx.userLocation.regionCode
              ? `${ctx.userLocation.city}, ${ctx.userLocation.regionCode}`
              : ctx.userLocation.city;
          }

          if (!effectiveLocation) {
            return "I don't know your location. Which city would you like UV info for?";
          }

          log.info({ location: effectiveLocation, skinType }, '☀️ UV index tool called');

          try {
            const result = await getUVIndex(effectiveLocation, skinType);
            log.info({ elapsed: Date.now() - startTime }, '☀️ UV index returned');
            return result;
          } catch (error) {
            log.error({ error: String(error) }, '☀️ UV index error');
            return `I couldn't get UV data for ${effectiveLocation}. Try again in a moment?`;
          }
        },
      }),
  },

  // ────────────────────────────────────────────────────────────────────────
  // POLLEN FORECAST
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'getPollenForecast',
    name: 'Get Pollen Forecast',
    description: 'Get pollen levels by type (tree, grass, weed) with allergy advice.',
    domain: 'information',
    tags: ['information', 'health', 'pollen', 'allergies', 'environment'],
    create: (ctx: ToolContext) =>
      llm.tool({
        description:
          'Get pollen forecast for a location. Use when user asks about pollen, allergies, hay fever, or mentions allergy symptoms. Returns levels for tree, grass, and weed pollen with health recommendations.',
        parameters: z.object({
          location: z
            .string()
            .optional()
            .describe('City name. Uses detected location if not provided.'),
        }),
        execute: async ({ location }) => {
          const startTime = Date.now();

          let effectiveLocation = location;
          if (!effectiveLocation && ctx.userLocation?.city) {
            effectiveLocation = ctx.userLocation.regionCode
              ? `${ctx.userLocation.city}, ${ctx.userLocation.regionCode}`
              : ctx.userLocation.city;
          }

          if (!effectiveLocation) {
            return "I don't know your location. Which city would you like pollen info for?";
          }

          log.info({ location: effectiveLocation }, '🌸 Pollen tool called');

          try {
            const result = await getPollenForecast(effectiveLocation);
            log.info({ elapsed: Date.now() - startTime }, '🌸 Pollen returned');
            return result;
          } catch (error) {
            log.error({ error: String(error) }, '🌸 Pollen error');
            return `I couldn't get pollen data for ${effectiveLocation}. Try again in a moment?`;
          }
        },
      }),
  },

  // ────────────────────────────────────────────────────────────────────────
  // OUTDOOR ACTIVITY ADVICE (COMBINED)
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'getOutdoorAdvice',
    name: 'Get Outdoor Activity Advice',
    description:
      'Get comprehensive advice for outdoor activities combining weather, air quality, UV, and pollen.',
    domain: 'information',
    tags: ['information', 'health', 'outdoor', 'exercise', 'environment', 'activity'],
    create: (ctx: ToolContext) =>
      llm.tool({
        description:
          'Get comprehensive outdoor activity advice. Use when user asks if conditions are good for running, cycling, hiking, or general outdoor activities. Combines air quality, UV, and pollen into a single recommendation with precautions.',
        parameters: z.object({
          location: z
            .string()
            .optional()
            .describe('City name. Uses detected location if not provided.'),
          activity: z
            .enum(['running', 'cycling', 'hiking', 'walking', 'sports', 'general'])
            .optional()
            .describe('Type of outdoor activity planned'),
          duration: z.number().optional().describe('Planned duration in minutes (default 60)'),
          hasAllergies: z.boolean().optional().describe('Whether user has pollen allergies'),
          hasAsthma: z
            .boolean()
            .optional()
            .describe('Whether user has asthma or respiratory conditions'),
        }),
        execute: async ({ location, activity, duration, hasAllergies, hasAsthma }) => {
          const startTime = Date.now();

          let effectiveLocation = location;
          if (!effectiveLocation && ctx.userLocation?.city) {
            effectiveLocation = ctx.userLocation.regionCode
              ? `${ctx.userLocation.city}, ${ctx.userLocation.regionCode}`
              : ctx.userLocation.city;
          }

          if (!effectiveLocation) {
            return "I don't know your location. Which city are you planning to be outdoors in?";
          }

          log.info(
            { location: effectiveLocation, activity, duration },
            '🏃 Outdoor advice tool called'
          );

          try {
            const result = await getOutdoorActivityAdvice(effectiveLocation, {
              activity,
              duration,
              userContext: {
                hasAllergies,
                hasAsthma,
              },
            });
            log.info({ elapsed: Date.now() - startTime }, '🏃 Outdoor advice returned');
            return result;
          } catch (error) {
            log.error({ error: String(error) }, '🏃 Outdoor advice error');
            return `I couldn't get outdoor conditions for ${effectiveLocation}. Try again in a moment?`;
          }
        },
      }),
  },

  // ────────────────────────────────────────────────────────────────────────
  // SHOULD I RUN OUTSIDE? (QUICK CHECK)
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'shouldIRunOutside',
    name: 'Should I Run Outside',
    description: 'Quick yes/no check if conditions are good for outdoor exercise.',
    domain: 'information',
    tags: ['information', 'health', 'exercise', 'running', 'quick-check'],
    create: (ctx: ToolContext) =>
      llm.tool({
        description:
          'Quick check if it\'s good to exercise outside. Use when user asks "should I run outside?" or "is it good to exercise outdoors today?" Returns a simple yes/no with brief reason.',
        parameters: z.object({
          location: z
            .string()
            .optional()
            .describe('City name. Uses detected location if not provided.'),
          hasAllergies: z.boolean().optional().describe('Whether user has allergies'),
          hasAsthma: z.boolean().optional().describe('Whether user has asthma'),
        }),
        execute: async ({ location, hasAllergies = false, hasAsthma = false }) => {
          let effectiveLocation = location;
          if (!effectiveLocation && ctx.userLocation?.city) {
            effectiveLocation = ctx.userLocation.regionCode
              ? `${ctx.userLocation.city}, ${ctx.userLocation.regionCode}`
              : ctx.userLocation.city;
          }

          if (!effectiveLocation) {
            return "I don't know your location. Which city are you in?";
          }

          log.info({ location: effectiveLocation }, '🏃 Quick outdoor check');

          try {
            const { recommended, reason } = await shouldExerciseOutside(
              effectiveLocation,
              hasAllergies,
              hasAsthma
            );
            return reason;
          } catch (error) {
            log.error({ error: String(error) }, '🏃 Quick check error');
            return "I couldn't check conditions right now. But if it looks nice out, go for it!";
          }
        },
      }),
  },
];

/**
 * Get environmental tool definitions
 */
export function getEnvironmentalToolDefinitions(): ToolDefinition[] {
  return environmentalToolDefinitions;
}

/**
 * Get brief environmental summary for morning briefing
 */
export async function getEnvironmentalBriefing(location: string): Promise<string | null> {
  const summaries: string[] = [];

  // Fetch all summaries in parallel
  const [aqSummary, uvSummary, pollenSummary] = await Promise.all([
    getAirQualitySummary(location),
    getUVSummary(location),
    getPollenSummary(location),
  ]);

  if (aqSummary) summaries.push(aqSummary);
  if (uvSummary) summaries.push(uvSummary);
  if (pollenSummary) summaries.push(pollenSummary);

  if (summaries.length === 0) {
    return null; // All conditions are good, no need to mention
  }

  return `Environmental note: ${summaries.join('. ')}.`;
}
