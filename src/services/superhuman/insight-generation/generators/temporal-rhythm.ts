/**
 * Temporal Rhythm Insight Generator
 *
 * Generates insights about time-based patterns:
 * - "Sunday evenings are consistently hard for you"
 * - "Your energy peaks mid-morning"
 * - "January is always a heavy month"
 *
 * We track patterns humans don't notice about themselves.
 *
 * @module services/superhuman/insight-generation/generators/temporal-rhythm
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import {
  getHourlyPattern,
  getDayPattern,
  getSeasonalPattern,
  detectAnomaly,
} from '../../semantic-intelligence/temporal-patterns.js';
import { registerInsightGenerator } from '../engine.js';
import type { GeneratedInsight, InsightGenerator, InsightGeneratorContext } from '../types.js';

const log = createLogger({ module: 'insight-gen:temporal' });

// ============================================================================
// TEMPLATES
// ============================================================================

const TEMPORAL_TEMPLATES = {
  time_of_day: [
    'Your {timeOfDay}s tend to be {quality}. I see it in how you show up during those hours.',
    "I've noticed a pattern: {timeOfDay} is usually a {quality} time for you. Your energy shifts.",
    "Something about {timeOfDay}s is consistent for you—they're often {quality}.",
  ],
  day_of_week: [
    "{day}s seem {quality} for you. It's come up enough times that it's a pattern.",
    'I notice {day}s tend to land {quality}. Is there something about that day?',
    "There's a rhythm: {day}s are often {quality}. Your mood shifts predictably.",
  ],
  seasonal: [
    "{season} tends to be {quality} for you. I've seen it across our time together.",
    'This time of year—{season}—seems to affect you. The pattern is {quality}.',
    'As we move into {season}, I want to name something: this season tends to be {quality} for you.',
  ],
  transition: [
    'The transition from {from} to {to} is usually hard for you. How are you preparing?',
    'Sunday evenings, right? The shift from weekend to week hits you consistently.',
    "End of {period} tends to bring {feeling} for you. I'm here as we approach that.",
  ],
  anomaly: [
    "Interesting: usually at this time you're {expected}, but today feels different. What's shifted?",
    "This {timeframe} usually goes one way for you, but I'm sensing something different. Am I reading that right?",
    "I notice you're not following your usual pattern for this time. That could be good or worth exploring.",
  ],
};

// ============================================================================
// DATA FETCHING
// ============================================================================

interface TemporalInsightData {
  type: 'time_of_day' | 'day_of_week' | 'seasonal' | 'transition' | 'anomaly';
  timeframe: string;
  quality: string;
  intensity: number;
  occurrences: number;
  examples?: string[];
}

async function fetchTemporalData(
  userId: string,
  context: InsightGeneratorContext
): Promise<TemporalInsightData[]> {
  const insights: TemporalInsightData[] = [];

  try {
    // Check for time of day patterns
    const hourlyPattern = await getHourlyPattern(userId);
    if (hourlyPattern) {
      const significantHours = Object.entries(hourlyPattern)
        .filter(([_, data]) => data.sampleCount >= 5 && Math.abs(data.averageMood - 0.5) > 0.2)
        .sort((a, b) => Math.abs(b[1].averageMood - 0.5) - Math.abs(a[1].averageMood - 0.5));

      if (significantHours.length > 0) {
        const [hour, data] = significantHours[0];
        const timeOfDay = getTimeOfDayLabel(parseInt(hour, 10));
        const quality = data.averageMood > 0.5 ? 'energizing' : 'challenging';

        insights.push({
          type: 'time_of_day',
          timeframe: timeOfDay,
          quality,
          intensity: Math.abs(data.averageMood - 0.5) * 2,
          occurrences: data.sampleCount,
        });
      }
    }

    // Check for day of week patterns
    const dayPattern = await getDayPattern(userId);
    if (dayPattern) {
      const significantDays = Object.entries(dayPattern)
        .filter(([_, data]) => data.sampleCount >= 3 && Math.abs(data.averageMood - 0.5) > 0.2)
        .sort((a, b) => Math.abs(b[1].averageMood - 0.5) - Math.abs(a[1].averageMood - 0.5));

      if (significantDays.length > 0) {
        const [day, data] = significantDays[0];
        const quality = data.averageMood > 0.5 ? 'good' : 'heavy';

        insights.push({
          type: 'day_of_week',
          timeframe: getDayLabel(parseInt(day, 10)),
          quality,
          intensity: Math.abs(data.averageMood - 0.5) * 2,
          occurrences: data.sampleCount,
        });
      }
    }

    // Check for seasonal patterns
    const currentMonth = new Date().getMonth();
    const currentSeason = getCurrentSeason(currentMonth) as 'spring' | 'summer' | 'fall' | 'winter';
    const seasonalPattern = await getSeasonalPattern(userId, currentSeason);

    if (seasonalPattern) {
      const quality = seasonalPattern.moodBaseline > 0 ? 'lighter' : 'heavier';

      insights.push({
        type: 'seasonal',
        timeframe: currentSeason,
        quality,
        intensity: Math.abs(seasonalPattern.moodBaseline) * 0.5 + 0.5,
        occurrences: 5, // Seasonal patterns are based on accumulated data
      });
    }

    // Check for anomalies
    const anomalyMessage = await detectAnomaly(userId, {
      emotion: context.currentEmotion,
      energyLevel: context.voiceMetrics?.energy,
    });

    if (anomalyMessage) {
      insights.push({
        type: 'anomaly',
        timeframe: 'right now',
        quality: anomalyMessage.includes('more energetic') ? 'energized' : 'subdued',
        intensity: 0.6,
        occurrences: 1,
      });
    }
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Error fetching temporal data');
  }

  return insights.slice(0, 2);
}

function getTimeOfDayLabel(hour: number): string {
  if (hour >= 5 && hour < 9) return 'early morning';
  if (hour >= 9 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 14) return 'midday';
  if (hour >= 14 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 20) return 'evening';
  if (hour >= 20 && hour < 23) return 'night';
  return 'late night';
}

function getDayLabel(day: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[day] || 'weekday';
}

function getCurrentSeason(month: number): string {
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}

// ============================================================================
// GENERATOR
// ============================================================================

async function generateTemporalInsights(
  userId: string,
  context: InsightGeneratorContext
): Promise<GeneratedInsight[]> {
  const insights: GeneratedInsight[] = [];

  try {
    const temporalData = await fetchTemporalData(userId, context);

    for (const data of temporalData) {
      const insight = buildTemporalInsight(data, userId);
      if (insight) {
        insights.push(insight);
      }
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to generate temporal insights');
  }

  return insights;
}

function buildTemporalInsight(data: TemporalInsightData, userId: string): GeneratedInsight | null {
  const templates = TEMPORAL_TEMPLATES[data.type];
  if (!templates || templates.length === 0) {
    return null;
  }

  let message = templates[Math.floor(Math.random() * templates.length)];

  // Replace placeholders
  message = message
    .replace(/{timeOfDay}/g, data.timeframe)
    .replace(/{day}/g, data.timeframe)
    .replace(/{season}/g, data.timeframe)
    .replace(/{timeframe}/g, data.timeframe)
    .replace(/{quality}/g, data.quality)
    .replace(/{expected}/g, data.quality)
    .replace(/{from}/g, 'weekend')
    .replace(/{to}/g, 'weekday')
    .replace(/{period}/g, 'month')
    .replace(/{feeling}/g, 'heaviness');

  const headlines: Record<string, string> = {
    time_of_day: `${data.timeframe} pattern`,
    day_of_week: `${data.timeframe} tends to be ${data.quality}`,
    seasonal: `${data.timeframe} pattern`,
    transition: 'Transition period ahead',
    anomaly: "Today's different",
  };

  return {
    id: `temporal_${data.type}_${data.timeframe.replace(/\s+/g, '_')}_${Date.now()}`,
    userId,
    category: 'temporal_rhythm',
    priority: data.type === 'anomaly' ? 'medium' : 'low',
    headline: headlines[data.type],
    message,
    evidence: [
      `Pattern strength: ${Math.round(data.intensity * 100)}%`,
      `Based on ${data.occurrences} observations`,
      `Typically ${data.quality} during ${data.timeframe}`,
    ],
    surfacingMoment: data.type === 'anomaly' ? 'natural_pause' : 'session_start',
    tone:
      data.quality === 'challenging' || data.quality === 'heavy'
        ? 'protective_care'
        : 'warm_observation',
    triggerTopics: [data.timeframe, 'time', 'schedule', 'rhythm'],
    confidence: Math.min(data.intensity + (data.occurrences > 10 ? 0.2 : 0), 0.9),
    dataPoints: data.occurrences,
    generatedAt: new Date(),
    surfaced: false,
    dismissed: false,
  };
}

async function hasEnoughData(userId: string): Promise<boolean> {
  try {
    const dayPattern = await getDayPattern(userId);
    if (!dayPattern) return false;
    const totalSamples = Object.values(dayPattern).reduce((sum, d) => sum + d.sampleCount, 0);
    return totalSamples >= 5;
  } catch {
    return false;
  }
}

// ============================================================================
// REGISTRATION
// ============================================================================

const temporalRhythmGenerator: InsightGenerator = {
  category: 'temporal_rhythm',
  name: 'Temporal Rhythm Generator',
  description: 'Surfaces time-based patterns in mood and energy',
  generate: generateTemporalInsights,
  hasEnoughData,
};

registerInsightGenerator(temporalRhythmGenerator);

export { temporalRhythmGenerator };
