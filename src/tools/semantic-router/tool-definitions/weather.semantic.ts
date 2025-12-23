/**
 * Weather Tool Definitions for Semantic Router
 *
 * Semantic routing for weather-related queries.
 * Routes to Open-Meteo-based weather tools.
 *
 * @module tools/semantic-router/tool-definitions/weather
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// CURRENT WEATHER TOOL
// ============================================================================

export const currentWeatherTool: SemanticToolDefinition = {
  id: 'weather_current',
  name: 'Current Weather',
  description:
    'Gets current weather conditions for a location including temperature, conditions, humidity, and wind.',
  shortDescription: 'check current weather',
  category: 'information',

  triggers: {
    phrases: [
      "what's the weather",
      "what's the weather like",
      'how is the weather',
      'what is the weather',
      'tell me the weather',
      "what's it like outside",
      "how's it outside",
      'is it raining',
      'is it cold',
      'is it hot',
      'is it sunny',
    ],
    patterns: [
      /^(?:what(?:'s| is)|how(?:'s| is))\s+the\s+weather/i,
      /^weather\s+(?:in|for|at)\s+(.+)/i,
      /^is\s+it\s+(?:raining|snowing|cold|hot|warm|sunny|cloudy)/i,
      /^do\s+i\s+need\s+(?:an?\s+)?(?:umbrella|jacket|coat)/i,
      /^(?:should|do)\s+i\s+(?:bring|take|wear)\s+(?:an?\s+)?(?:umbrella|jacket|coat)/i,
    ],
    keywords: [
      { word: 'weather', weight: 1.0 },
      { word: 'temperature', weight: 0.9 },
      { word: 'rain', weight: 0.8 },
      { word: 'raining', weight: 0.8 },
      { word: 'snow', weight: 0.8 },
      { word: 'snowing', weight: 0.8 },
      { word: 'sunny', weight: 0.7 },
      { word: 'cloudy', weight: 0.7 },
      { word: 'cold', weight: 0.6 },
      { word: 'hot', weight: 0.6 },
      { word: 'warm', weight: 0.6 },
      { word: 'umbrella', weight: 0.8 },
      { word: 'outside', weight: 0.5 },
      { word: 'forecast', weight: 0.7 },
    ],
    antiKeywords: ['email', 'calendar', 'meeting', 'music', 'play'],
  },

  examples: [
    "What's the weather?",
    "What's the weather like today?",
    "What's the weather in New York?",
    'Is it going to rain?',
    'Do I need an umbrella?',
    "How's the weather outside?",
    'Is it cold today?',
    'What temperature is it?',
    'Should I bring a jacket?',
    "What's it like outside?",
    'Is it sunny?',
    'How hot is it?',
  ],

  counterExamples: [
    'Play some jazz',
    "What's on my calendar?",
    'Send an email',
    'Set a reminder',
    'Call John',
  ],

  arguments: [
    {
      name: 'location',
      type: 'string',
      description: 'City or location to check weather for',
      required: false,
      extractionPatterns: [
        /weather\s+(?:in|for|at)\s+(.+?)(?:\s+today|\s+tomorrow)?$/i,
        /(?:in|for|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
      ],
      entityType: 'location',
    },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.3,
  },

  execute: async (
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    // This will be called by the semantic router when confidence is high
    // The actual execution delegates to the domain tool
    return {
      success: true,
      toolId: 'weather_current',
      args: { location: args.location || context.userLocation || undefined },
      delegateTo: 'domains/information/weather',
    };
  },
};

// ============================================================================
// WEATHER FORECAST TOOL
// ============================================================================

export const weatherForecastTool: SemanticToolDefinition = {
  id: 'weather_forecast',
  name: 'Weather Forecast',
  description: 'Gets weather forecast for the coming days including highs, lows, and conditions.',
  shortDescription: 'check weather forecast',
  category: 'information',

  triggers: {
    phrases: [
      'weather forecast',
      'weather this week',
      'weather tomorrow',
      "what's the forecast",
      'upcoming weather',
      'weather for the week',
    ],
    patterns: [
      /^(?:what(?:'s| is)|how(?:'s| is))\s+the\s+(?:weather\s+)?forecast/i,
      /^weather\s+(?:for\s+)?(?:this|next)\s+(?:week|few\s+days)/i,
      /^(?:what(?:'s| is)|how(?:'s| will))\s+the\s+weather\s+(?:be\s+)?(?:tomorrow|this\s+week|next\s+week)/i,
      /^will\s+it\s+(?:rain|snow)\s+(?:tomorrow|this\s+week)/i,
    ],
    keywords: [
      { word: 'forecast', weight: 1.0 },
      { word: 'week', weight: 0.7 },
      { word: 'tomorrow', weight: 0.8 },
      { word: 'days', weight: 0.6 },
      { word: 'upcoming', weight: 0.7 },
      { word: 'weather', weight: 0.8 },
    ],
    antiKeywords: ['current', 'now', 'right now'],
  },

  examples: [
    "What's the forecast for this week?",
    "What's the weather going to be like tomorrow?",
    'Will it rain this week?',
    'Weather forecast for New York',
    "What's the 5-day forecast?",
    'Is it going to snow tomorrow?',
  ],

  counterExamples: ["What's the weather right now?", 'Is it raining?', 'Current temperature'],

  arguments: [
    {
      name: 'location',
      type: 'string',
      description: 'City or location for forecast',
      required: false,
      extractionPatterns: [/forecast\s+(?:for|in)\s+(.+)/i],
      entityType: 'location',
    },
    {
      name: 'days',
      type: 'number',
      description: 'Number of days to forecast (1-7)',
      required: false,
      extractionPatterns: [/(\d+)\s*day/i],
    },
  ],

  confidence: {
    baseScore: 0.8,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.3,
  },

  execute: async (
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'weather_forecast',
      args: {
        location: args.location || context.userLocation || undefined,
        days: args.days || 5,
      },
      delegateTo: 'domains/information/weather',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const weatherTools: SemanticToolDefinition[] = [currentWeatherTool, weatherForecastTool];
