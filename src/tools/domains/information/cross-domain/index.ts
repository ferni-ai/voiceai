/**
 * Cross-Domain Connections Index
 *
 * Aggregates all cross-domain connection tools for "Better Than Human" features.
 *
 * These tools connect information from different domains to provide
 * proactive, contextually aware insights that anticipate user needs.
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import type { ToolDefinition, ToolContext } from '../../../registry/types.js';
import { createWeatherHabitsTools } from './weather-habits.js';
import { createNewsMoodTools } from './news-mood.js';
import { createTrafficProductivityTools } from './traffic-productivity.js';

export function createCrossDomainTools() {
  return {
    ...createWeatherHabitsTools(),
    ...createNewsMoodTools(),
    ...createTrafficProductivityTools(),
  };
}

/**
 * Get tool definitions for cross-domain connection tools
 */
export function getCrossDomainToolDefinitions(): ToolDefinition[] {
  const tools = createCrossDomainTools();

  return [
    {
      id: 'getWeatherHabitInsights',
      name: 'Get Weather-Habit Insights',
      description:
        'Analyze weather and environmental conditions to suggest habit adjustments. "Better than human" - suggests indoor workout when rainy, outdoor activities when nice.',
      domain: 'information',
      tags: ['cross-domain', 'weather', 'habits', 'insights'],
      create: (_ctx: ToolContext) => tools.getWeatherHabitInsights,
    },
    {
      id: 'getHabitRecommendation',
      name: 'Get Habit Recommendation',
      description:
        'Get a personalized recommendation for a specific habit based on current weather and environmental conditions.',
      domain: 'information',
      tags: ['cross-domain', 'weather', 'habits', 'recommendation'],
      create: (_ctx: ToolContext) => tools.getHabitRecommendation,
    },
    {
      id: 'analyzeNewsMoodImpact',
      name: 'Analyze News Mood Impact',
      description:
        'Analyze news headlines for emotional impact and determine the best way to deliver them based on content heaviness and user mood. "Better than human" - protects user from overwhelming news.',
      domain: 'information',
      tags: ['cross-domain', 'news', 'mood', 'emotional'],
      create: (_ctx: ToolContext) => tools.analyzeNewsMoodImpact,
    },
    {
      id: 'getPositiveNewsOnly',
      name: 'Get Positive News Only',
      description:
        'Filter news to show only positive, uplifting stories. Use when user needs a mood boost or wants to avoid heavy news.',
      domain: 'information',
      tags: ['cross-domain', 'news', 'positive', 'mood'],
      create: (_ctx: ToolContext) => tools.getPositiveNewsOnly,
    },
    {
      id: 'shouldSkipNews',
      name: 'Should Skip News',
      description:
        'Determine if news should be skipped based on user mood and news content. Returns a recommendation and reason.',
      domain: 'information',
      tags: ['cross-domain', 'news', 'mood', 'recommendation'],
      create: (_ctx: ToolContext) => tools.shouldSkipNews,
    },
    {
      id: 'getCommuteSuggestions',
      name: 'Get Commute Suggestions',
      description:
        'Get personalized suggestions for making commute time productive or enjoyable. Considers commute length, traffic severity, and upcoming meetings.',
      domain: 'information',
      tags: ['cross-domain', 'traffic', 'productivity', 'commute'],
      create: (_ctx: ToolContext) => tools.getCommuteSuggestions,
    },
    {
      id: 'getTrafficProductivityInsights',
      name: 'Get Traffic-Productivity Insights',
      description:
        'Analyze traffic situation and generate insights about how to use commute time productively.',
      domain: 'information',
      tags: ['cross-domain', 'traffic', 'productivity', 'insights'],
      create: (_ctx: ToolContext) => tools.getTrafficProductivityInsights,
    },
    {
      id: 'suggestPreMeetingPepTalk',
      name: 'Suggest Pre-Meeting Pep Talk',
      description:
        'Offer a pep talk or confidence boost before an important meeting during commute.',
      domain: 'information',
      tags: ['cross-domain', 'meeting', 'motivation', 'pep-talk'],
      create: (_ctx: ToolContext) => tools.suggestPreMeetingPepTalk,
    },
  ];
}

// Re-export individual tool creators
export { createWeatherHabitsTools } from './weather-habits.js';
export { createNewsMoodTools } from './news-mood.js';
export { createTrafficProductivityTools } from './traffic-productivity.js';

// Re-export types
export type {
  CrossDomainInsight,
  DomainType,
  ConnectionType,
  MoodContext,
  MoodState,
  HabitRecommendationContext,
  NewsMoodAnalysis,
  TrafficProductivityContext,
  CommuteSuggestion,
  WeatherHabitMapping,
  GrayDayPattern,
} from './types.js';

// Re-export utility functions
export { getWeatherHabitInsights, getHabitRecommendation } from './weather-habits.js';
export {
  analyzeNewsMoodImpact,
  generateNewsMoodIntro,
  getNewsMoodInsights,
  filterPositiveNews,
  generateUpliftingNewsSummary,
} from './news-mood.js';
export {
  generateCommuteSuggestions,
  getTrafficProductivityInsights,
  formatCommuteSuggestions,
} from './traffic-productivity.js';
