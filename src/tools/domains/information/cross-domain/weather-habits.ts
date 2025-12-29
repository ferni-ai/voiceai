/**
 * Weather → Habits Cross-Domain Connection
 *
 * "Better Than Human" feature: Proactively suggests habit adjustments
 * based on weather and environmental conditions.
 *
 * Examples:
 * - "Rainy day! How about an indoor workout instead of your run?"
 * - "Air quality is poor today. Maybe skip the outdoor jog."
 * - "Beautiful day! Perfect for taking your walk outside."
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../../utils/safe-logger.js';
import { getCurrentWeather } from '../weather.js';
import { getAirQuality } from '../environmental/air-quality.js';
import { getPollenForecast } from '../environmental/pollen.js';
import { getUVIndex } from '../environmental/uv-index.js';
import type {
  CrossDomainInsight,
  HabitRecommendationContext,
  WeatherHabitMapping,
} from './types.js';
import { WEATHER_HABIT_MAPPINGS } from './types.js';

// Import habits module for real user habit data
import { getDueHabits, getUserHabits } from '../../habits/habits.js';
import type { Habit } from '../../habits/habits.js';

// ============================================================================
// HABIT CLASSIFICATION
// ============================================================================

/** Keywords indicating outdoor activities */
const OUTDOOR_KEYWORDS = [
  'run',
  'running',
  'jog',
  'jogging',
  'walk',
  'walking',
  'hike',
  'hiking',
  'cycle',
  'cycling',
  'bike',
  'biking',
  'swim',
  'swimming',
  'outdoor',
  'tennis',
  'golf',
  'soccer',
  'football',
  'basketball',
  'baseball',
  'garden',
  'gardening',
  'yard',
  'park',
  'nature',
  'trail',
];

/** Keywords indicating indoor activities */
const INDOOR_KEYWORDS = [
  'yoga',
  'meditation',
  'meditate',
  'gym',
  'weights',
  'strength',
  'treadmill',
  'elliptical',
  'indoor',
  'home workout',
  'stretching',
  'pilates',
  'crossfit',
  'read',
  'reading',
  'journal',
  'writing',
];

/**
 * Classify a habit as outdoor, indoor, or unknown
 */
function classifyHabit(habit: Habit): 'outdoor' | 'indoor' | 'unknown' {
  const name = habit.name.toLowerCase();
  const description = (habit.description || '').toLowerCase();
  const text = `${name} ${description}`;

  // Check outdoor keywords
  if (OUTDOOR_KEYWORDS.some((kw) => text.includes(kw))) {
    return 'outdoor';
  }

  // Check indoor keywords
  if (INDOOR_KEYWORDS.some((kw) => text.includes(kw))) {
    return 'indoor';
  }

  // Fitness category is often outdoor, but not always
  if (habit.category === 'fitness') {
    return 'outdoor'; // Default fitness to outdoor for weather warnings
  }

  return 'unknown';
}

/**
 * Get user's outdoor habits
 */
async function getUserOutdoorHabits(userId: string): Promise<Habit[]> {
  try {
    const habits = getUserHabits(userId);
    return habits.filter((h) => classifyHabit(h) === 'outdoor');
  } catch (error) {
    log.debug({ userId, error: String(error) }, 'Failed to get user habits');
    return [];
  }
}

/**
 * Get habit names as strings for insight generation
 */
function getHabitNames(habits: Habit[]): string[] {
  return habits.map((h) => h.name);
}

const log = getLogger();

// ============================================================================
// WEATHER CONDITION PARSING
// ============================================================================

interface ParsedWeatherConditions {
  isRainy: boolean;
  isHot: boolean;
  isCold: boolean;
  isNice: boolean;
  isStormy: boolean;
  isSnowy: boolean;
  isCloudy: boolean;
  temperature?: number;
  description: string;
}

function parseWeatherConditions(weatherResponse: string): ParsedWeatherConditions {
  const lower = weatherResponse.toLowerCase();

  // Extract temperature if present
  const tempMatch = lower.match(/(\d+)\s*°?f/);
  const temperature = tempMatch ? parseInt(tempMatch[1], 10) : undefined;

  return {
    isRainy: /rain|shower|drizzle|precipitation/.test(lower),
    isHot: (temperature !== undefined && temperature > 85) || /hot|scorching|heat/.test(lower),
    isCold: (temperature !== undefined && temperature < 40) || /cold|freezing|frigid/.test(lower),
    isNice:
      /nice|pleasant|beautiful|perfect|gorgeous|lovely/.test(lower) ||
      (temperature !== undefined && temperature >= 60 && temperature <= 80),
    isStormy: /storm|thunder|lightning|severe/.test(lower),
    isSnowy: /snow|blizzard|flurr/.test(lower),
    isCloudy: /cloud|overcast|gray|grey/.test(lower),
    temperature,
    description: weatherResponse,
  };
}

// ============================================================================
// ENVIRONMENTAL CONDITION PARSING
// ============================================================================

interface ParsedEnvironmentalConditions {
  airQualityGood: boolean;
  pollenHigh: boolean;
  uvHigh: boolean;
  aqi?: number;
  uvIndex?: number;
}

function parseAirQualityResponse(response: string): { good: boolean; aqi?: number } {
  const lower = response.toLowerCase();
  const aqiMatch = response.match(/aqi[:\s]+(\d+)/i);
  const aqi = aqiMatch ? parseInt(aqiMatch[1], 10) : undefined;

  const good =
    aqi !== undefined
      ? aqi <= 50
      : /good|excellent|healthy|safe/.test(lower) && !/unhealthy|hazardous|poor/.test(lower);

  return { good, aqi };
}

function parsePollenResponse(response: string): boolean {
  const lower = response.toLowerCase();
  return /high|very high|extreme|elevated/.test(lower);
}

function parseUVResponse(response: string): { high: boolean; index?: number } {
  const lower = response.toLowerCase();
  const uvMatch = response.match(/uv[:\s]+(\d+)/i);
  const index = uvMatch ? parseInt(uvMatch[1], 10) : undefined;

  const high = index !== undefined ? index >= 6 : /high|very high|extreme/.test(lower);

  return { high, index };
}

// ============================================================================
// MAIN INSIGHT GENERATION
// ============================================================================

/**
 * Generate habit insights based on weather and environmental conditions
 *
 * @param location - City name for weather data
 * @param userHabitsOrUserId - Either an array of habit names OR a userId to fetch real habits
 */
export async function getWeatherHabitInsights(
  location: string,
  userHabitsOrUserId: string[] | string = []
): Promise<CrossDomainInsight[]> {
  // Handle both formats: array of habit names OR userId string
  let userHabits: string[];
  let userId: string | undefined;

  if (typeof userHabitsOrUserId === 'string') {
    // It's a userId - fetch their real habits
    userId = userHabitsOrUserId;
    const outdoorHabits = await getUserOutdoorHabits(userId);
    userHabits = getHabitNames(outdoorHabits);
    log.info(
      { location, userId, outdoorHabitCount: userHabits.length },
      '🌤️→💪 Fetched user outdoor habits'
    );
  } else {
    userHabits = userHabitsOrUserId;
  }

  log.info(
    { location, habitCount: userHabits.length },
    '🌤️→💪 Analyzing weather-habit connections'
  );

  const insights: CrossDomainInsight[] = [];

  try {
    // Fetch weather and environmental data in parallel
    const [weatherResponse, airQualityResponse, pollenResponse, uvResponse] =
      await Promise.allSettled([
        getCurrentWeather(location),
        getAirQuality(location),
        getPollenForecast(location),
        getUVIndex(location),
      ]);

    // Parse weather conditions
    const weatherData =
      weatherResponse.status === 'fulfilled' ? parseWeatherConditions(weatherResponse.value) : null;

    // Parse environmental conditions
    const airQuality =
      airQualityResponse.status === 'fulfilled'
        ? parseAirQualityResponse(airQualityResponse.value)
        : null;

    const pollenHigh =
      pollenResponse.status === 'fulfilled' ? parsePollenResponse(pollenResponse.value) : false;

    const uvData = uvResponse.status === 'fulfilled' ? parseUVResponse(uvResponse.value) : null;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 6 * 60 * 60 * 1000); // 6 hours

    // Check for rainy conditions
    if (weatherData?.isRainy || weatherData?.isStormy) {
      const mapping = WEATHER_HABIT_MAPPINGS.find((m) => m.condition === 'rainy');
      if (mapping) {
        const affectedUserHabits = userHabits.filter((h) =>
          mapping.affectedHabits.some(
            (a) => h.toLowerCase().includes(a.replace('_', ' ')) || a.includes(h.toLowerCase())
          )
        );

        insights.push({
          id: `weather-habit-rain-${now.getTime()}`,
          sourceDomain: 'weather',
          targetDomain: 'habits',
          connectionType: 'weather_habit',
          message: weatherData.isStormy
            ? 'Storms in the forecast! Definitely an indoor activity day.'
            : mapping.suggestion,
          suggestion:
            affectedUserHabits.length > 0
              ? `Your ${affectedUserHabits[0]} habit might be affected. Try ${mapping.alternatives[0]} instead?`
              : `Consider ${mapping.alternatives.slice(0, 2).join(' or ')} instead of outdoor activities.`,
          confidence: weatherData.isStormy ? 0.95 : 0.85,
          generatedAt: now,
          expiresAt,
          context: {
            weatherCondition: 'rainy',
            alternatives: mapping.alternatives,
            affectedUserHabits,
          },
        });
      }
    }

    // Check for hot conditions
    if (weatherData?.isHot) {
      const mapping = WEATHER_HABIT_MAPPINGS.find((m) => m.condition === 'very_hot');
      if (mapping) {
        insights.push({
          id: `weather-habit-hot-${now.getTime()}`,
          sourceDomain: 'weather',
          targetDomain: 'habits',
          connectionType: 'weather_habit',
          message: mapping.suggestion,
          suggestion: `Stay hydrated! ${mapping.alternatives[0]} might be a better choice today.`,
          confidence: 0.8,
          generatedAt: now,
          expiresAt,
          context: {
            weatherCondition: 'hot',
            temperature: weatherData.temperature,
            alternatives: mapping.alternatives,
          },
        });
      }
    }

    // Check for cold conditions
    if (weatherData?.isCold) {
      const mapping = WEATHER_HABIT_MAPPINGS.find((m) => m.condition === 'very_cold');
      if (mapping) {
        insights.push({
          id: `weather-habit-cold-${now.getTime()}`,
          sourceDomain: 'weather',
          targetDomain: 'habits',
          connectionType: 'weather_habit',
          message: mapping.suggestion,
          suggestion: 'Warm up properly if you do go outside!',
          confidence: 0.8,
          generatedAt: now,
          expiresAt,
          context: {
            weatherCondition: 'cold',
            temperature: weatherData.temperature,
            alternatives: mapping.alternatives,
          },
        });
      }
    }

    // Check for poor air quality
    if (airQuality && !airQuality.good) {
      const mapping = WEATHER_HABIT_MAPPINGS.find((m) => m.condition === 'poor_air_quality');
      if (mapping) {
        insights.push({
          id: `weather-habit-aqi-${now.getTime()}`,
          sourceDomain: 'environmental',
          targetDomain: 'habits',
          connectionType: 'environmental_wellness',
          message: mapping.suggestion,
          suggestion: 'Indoor activities are healthier when air quality is compromised.',
          confidence: 0.9,
          generatedAt: now,
          expiresAt,
          context: {
            condition: 'poor_air_quality',
            aqi: airQuality.aqi,
            alternatives: mapping.alternatives,
          },
        });
      }
    }

    // Check for high pollen
    if (pollenHigh) {
      const mapping = WEATHER_HABIT_MAPPINGS.find((m) => m.condition === 'high_pollen');
      if (mapping) {
        insights.push({
          id: `weather-habit-pollen-${now.getTime()}`,
          sourceDomain: 'environmental',
          targetDomain: 'habits',
          connectionType: 'environmental_wellness',
          message: mapping.suggestion,
          suggestion: 'Allergy sufferers might want to stay indoors today.',
          confidence: 0.75,
          generatedAt: now,
          expiresAt,
          context: {
            condition: 'high_pollen',
            alternatives: mapping.alternatives,
          },
        });
      }
    }

    // Check for nice weather (positive insight!)
    if (weatherData?.isNice && !pollenHigh && airQuality?.good !== false) {
      const mapping = WEATHER_HABIT_MAPPINGS.find((m) => m.condition === 'nice_weather');
      if (mapping) {
        insights.push({
          id: `weather-habit-nice-${now.getTime()}`,
          sourceDomain: 'weather',
          targetDomain: 'habits',
          connectionType: 'weather_habit',
          message: mapping.suggestion,
          suggestion: "Don't miss this opportunity to enjoy the outdoors!",
          confidence: 0.85,
          generatedAt: now,
          expiresAt,
          context: {
            weatherCondition: 'nice',
            temperature: weatherData.temperature,
            alternatives: mapping.alternatives,
          },
        });
      }
    }

    log.info({ location, insightCount: insights.length }, '🌤️→💪 Generated weather-habit insights');
  } catch (error) {
    log.error(
      { location, error: String(error) },
      '🌤️→💪 Failed to generate weather-habit insights'
    );
  }

  return insights;
}

/**
 * Get a personalized habit recommendation based on current conditions
 */
export async function getHabitRecommendation(
  location: string,
  habitName: string,
  habitType: 'outdoor' | 'indoor' | 'any' = 'any'
): Promise<string> {
  log.info({ location, habitName, habitType }, '💪 Getting habit recommendation');

  try {
    const insights = await getWeatherHabitInsights(location, [habitName]);

    // If outdoor habit and we have concerns
    if (habitType === 'outdoor' && insights.length > 0) {
      const relevantInsight = insights.find(
        (i) => i.connectionType === 'weather_habit' || i.connectionType === 'environmental_wellness'
      );

      if (relevantInsight) {
        return `${relevantInsight.message} ${relevantInsight.suggestion || ''}`;
      }
    }

    // No concerns - encourage the habit!
    if (habitType === 'outdoor') {
      return `Conditions look good for your ${habitName}! Enjoy!`;
    }

    return `Great time to work on your ${habitName}!`;
  } catch (error) {
    log.error({ location, habitName, error: String(error) }, '💪 Habit recommendation failed');
    return `Ready to work on your ${habitName}? Let me know if you need any help!`;
  }
}

// ============================================================================
// TOOL EXPORTS
// ============================================================================

export function createWeatherHabitsTools() {
  return {
    getWeatherHabitInsights: llm.tool({
      description:
        'Analyze weather and environmental conditions to suggest habit adjustments. ' +
        'Returns proactive insights like "Rainy day - try indoor workout instead." ' +
        'Can either provide a userId to fetch their real habits, or a list of habit names.',
      parameters: z.object({
        location: z.string().describe('City name for weather analysis'),
        userId: z.string().optional().describe('User ID to fetch their actual habits'),
        userHabits: z
          .array(z.string())
          .optional()
          .describe('List of habit names if userId not provided'),
      }),
      execute: async ({ location, userId, userHabits }) => {
        // Prefer userId (real habits) over manual habit list
        const habitsInput = userId || userHabits || [];
        const insights = await getWeatherHabitInsights(location, habitsInput);

        if (insights.length === 0) {
          return 'No weather-related habit adjustments needed today. Conditions look good!';
        }

        return insights
          .map((i) => `${i.message}${i.suggestion ? ` ${i.suggestion}` : ''}`)
          .join('\n\n');
      },
    }),

    getHabitRecommendation: llm.tool({
      description:
        'Get a personalized recommendation for a specific habit based on current weather ' +
        'and environmental conditions.',
      parameters: z.object({
        location: z.string().describe('City name'),
        habitName: z.string().describe('Name of the habit'),
        habitType: z.enum(['outdoor', 'indoor', 'any']).optional().describe('Type of habit'),
      }),
      execute: async ({ location, habitName, habitType }) => {
        return getHabitRecommendation(location, habitName, habitType || 'any');
      },
    }),
  };
}
