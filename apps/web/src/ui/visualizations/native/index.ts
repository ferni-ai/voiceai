/**
 * Native SDK Type Exports
 *
 * This module provides type definitions and schema generators for
 * native iOS (Swift) and Android (Kotlin) implementations.
 *
 * Usage:
 * - For Swift: Reference swift-types.ts JSDoc comments
 * - For Kotlin: Reference kotlin-types.ts JSDoc comments
 * - For JSON Schema: Use visualizationSchemas for runtime validation
 *
 * @module visualizations/native
 */

// Re-export all types for native SDKs
export type {
  DeviceType,
  Platform,
  DeviceContext,
  MoodType,
  MoodEntry,
  MoodCalendarData,
  BurnoutGaugeData,
  TimelineChapter,
  LifeTimelineData,
  GrowthDimension,
  GrowthRadarData,
  EmotionalArcPhase,
  EmotionalArcsData,
  Prediction,
  PredictionsData,
  Relationship,
  RelationshipNetworkData,
  OpenLoop,
  OpenLoopsData,
  EnergyRingsData,
  VisualizationApiResponse,
  VisualizationColors,
} from '../types.js';

export { DEFAULT_COLORS } from '../types.js';

// ============================================================================
// JSON SCHEMA DEFINITIONS
// ============================================================================

/**
 * JSON Schema definitions for API validation.
 * Can be used by native SDKs for request/response validation.
 */
export const visualizationSchemas = {
  MoodCalendarData: {
    type: 'object',
    required: ['entries', 'summary', 'period'],
    properties: {
      entries: {
        type: 'array',
        items: {
          type: 'object',
          required: ['date', 'mood', 'intensity'],
          properties: {
            date: { type: 'string', format: 'date' },
            mood: {
              type: 'string',
              enum: ['calm', 'joyful', 'anxious', 'tired', 'focused', 'reflective', 'stressed', 'energized', 'peaceful', 'uncertain'],
            },
            intensity: { type: 'number', minimum: 0, maximum: 1 },
            note: { type: 'string' },
          },
        },
      },
      summary: {
        type: 'object',
        required: ['dominantMood', 'calmDays', 'trend'],
        properties: {
          dominantMood: { type: 'string' },
          calmDays: { type: 'integer' },
          trend: { type: 'string', enum: ['improving', 'stable', 'declining'] },
        },
      },
      period: { type: 'string', enum: ['week', 'month', 'quarter'] },
    },
  },

  BurnoutGaugeData: {
    type: 'object',
    required: ['capacity', 'trend', 'status', 'factors', 'updatedAt'],
    properties: {
      capacity: { type: 'integer', minimum: 0, maximum: 100 },
      trend: { type: 'string', enum: ['recovering', 'stable', 'declining'] },
      status: { type: 'string', enum: ['thriving', 'balanced', 'stretched', 'depleted', 'critical'] },
      factors: {
        type: 'object',
        required: ['emotional', 'mental', 'physical'],
        properties: {
          emotional: { type: 'integer', minimum: 0, maximum: 100 },
          mental: { type: 'integer', minimum: 0, maximum: 100 },
          physical: { type: 'integer', minimum: 0, maximum: 100 },
        },
      },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },

  GrowthRadarData: {
    type: 'object',
    required: ['dimensions', 'overallGrowth'],
    properties: {
      dimensions: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name', 'value', 'trend'],
          properties: {
            name: { type: 'string' },
            value: { type: 'number', minimum: 0, maximum: 1 },
            previousValue: { type: 'number', minimum: 0, maximum: 1 },
            trend: { type: 'string', enum: ['growing', 'stable', 'needs-attention'] },
          },
        },
      },
      overallGrowth: { type: 'number', minimum: 0, maximum: 1 },
      focusArea: { type: 'string' },
    },
  },

  EnergyRingsData: {
    type: 'object',
    required: ['emotional', 'mental', 'physical', 'overall'],
    properties: {
      emotional: { type: 'integer', minimum: 0, maximum: 100 },
      mental: { type: 'integer', minimum: 0, maximum: 100 },
      physical: { type: 'integer', minimum: 0, maximum: 100 },
      overall: { type: 'integer', minimum: 0, maximum: 100 },
    },
  },
} as const;

// ============================================================================
// COLOR TOKEN EXPORTS (for native theming)
// ============================================================================

/**
 * Color tokens in hex format for native SDKs.
 */
export const nativeColorTokens = {
  accent: '#3D5A45',
  accentSecondary: '#4a6741',
  background: '#fffdfb',
  backgroundElevated: '#ffffff',
  textPrimary: '#2C2520',
  textSecondary: '#5c544a',
  textMuted: '#9a8f85',
  borderSubtle: '#0a14200a',

  moods: {
    calm: '#3D5A45',
    joyful: '#f5a623',
    anxious: '#e74c3c',
    tired: '#9a8f85',
    focused: '#3a6b73',
    reflective: '#8a7a9a',
    stressed: '#c0392b',
    energized: '#27ae60',
    peaceful: '#5a8b73',
    uncertain: '#7f8c8d',
  },

  energy: {
    emotional: '#a67a6a',
    mental: '#3a6b73',
    physical: '#4a6741',
  },

  status: {
    thriving: '#27ae60',
    balanced: '#3D5A45',
    stretched: '#f5a623',
    depleted: '#e67e22',
    critical: '#e74c3c',
  },
} as const;

/**
 * Convert hex color to RGB components for native color constructors.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length !== 6) return null;

  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;

  return { r, g, b };
}

/**
 * Generate iOS UIColor string from hex.
 */
export function toUIColorString(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return 'UIColor.gray';

  const r = (rgb.r / 255).toFixed(3);
  const g = (rgb.g / 255).toFixed(3);
  const b = (rgb.b / 255).toFixed(3);

  return `UIColor(red: ${r}, green: ${g}, blue: ${b}, alpha: 1)`;
}

/**
 * Generate Android Compose Color string from hex.
 */
export function toComposeColorString(hex: string): string {
  const cleanHex = hex.replace('#', '').toUpperCase();
  return `Color(0xFF${cleanHex})`;
}
