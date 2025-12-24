/**
 * Wearable Integration Types
 *
 * Type definitions for wearable device integrations.
 *
 * @module WearableTypes
 */

// ============================================================================
// PROVIDERS
// ============================================================================

/**
 * Supported wearable providers
 */
export type WearableProvider =
  | 'apple_health'
  | 'eight_sleep'
  | 'fitbit'
  | 'garmin'
  | 'oura'
  | 'whoop';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Wearable integration configuration
 */
export interface WearableConfig {
  /** Which providers are enabled */
  enabledProviders: WearableProvider[];

  /** How often to sync data (minutes) */
  syncIntervalMinutes: number;

  /** Enable stress detection from HRV */
  enableStressDetection: boolean;

  /** Enable sleep quality analysis */
  enableSleepAnalysis: boolean;

  /** Enable activity tracking */
  enableActivityTracking: boolean;

  /** Privacy mode - how data is shared with Ferni */
  privacyMode: 'raw' | 'aggregated' | 'insights_only';
}

// ============================================================================
// DATA TYPES
// ============================================================================

/**
 * Health metrics from wearables
 */
export interface HealthMetrics {
  /** Resting heart rate (bpm) */
  restingHeartRate: number;

  /** Heart rate variability (ms) */
  heartRateVariability: number;

  /** Respiratory rate (breaths per minute) */
  respiratoryRate: number;

  /** Blood oxygen level (%) */
  bloodOxygenLevel: number;

  /** Body temperature (°F) */
  bodyTemperature: number;
}

/**
 * Sleep data
 */
export interface SleepData {
  /** Sleep start time */
  startTime: Date;

  /** Sleep end time */
  endTime: Date;

  /** Total sleep minutes */
  totalMinutes: number;

  /** Deep sleep minutes */
  deepSleepMinutes: number;

  /** REM sleep minutes */
  remSleepMinutes: number;

  /** Light sleep minutes */
  lightSleepMinutes: number;

  /** Awake minutes */
  awakeMinutes: number;

  /** Sleep efficiency (0-1) */
  efficiency: number;
}

/**
 * Activity data
 */
export interface ActivityData {
  /** Steps taken */
  steps: number;

  /** Distance traveled (km) */
  distance: number;

  /** Calories burned */
  caloriesBurned: number;

  /** Active minutes */
  activeMinutes: number;

  /** Stand hours (Apple Watch) */
  standHours: number;

  /** Exercise minutes */
  exerciseMinutes: number;
}

/**
 * Heart rate data
 */
export interface HeartRateData {
  /** Current heart rate */
  current: number;

  /** Minimum in period */
  min: number;

  /** Maximum in period */
  max: number;

  /** Average in period */
  average: number;

  /** Time in each heart rate zone (minutes) */
  zones: {
    resting: number;
    fatBurn: number;
    cardio: number;
    peak: number;
  };
}

/**
 * Complete wearable data payload
 */
export interface WearableData {
  provider: WearableProvider;
  syncedAt: Date;
  healthMetrics: HealthMetrics;
  sleepData?: SleepData;
  activityData?: ActivityData;
  heartRateData: HeartRateData;
}

// ============================================================================
// STRESS DETECTION
// ============================================================================

/**
 * Stress indicators derived from wearable data
 */
export interface StressIndicators {
  /** Stress level 0-100 */
  stressLevel: number;

  /** Is stress elevated? */
  isElevated: boolean;

  /** Primary indicator used */
  primaryIndicator: 'heart_rate_variability' | 'resting_heart_rate' | 'skin_temperature';

  /** Secondary indicators */
  secondaryIndicators: string[];

  /** Suggested action if elevated */
  suggestedAction?: string;

  /** When detected */
  detectedAt: Date;
}

// ============================================================================
// API TYPES
// ============================================================================

/**
 * OAuth callback data
 */
export interface WearableOAuthCallback {
  provider: WearableProvider;
  code: string;
  state?: string;
}

/**
 * Connection response
 */
export interface WearableConnectionResponse {
  success: boolean;
  provider: WearableProvider;
  authUrl?: string;
  error?: string;
}

/**
 * Sync response
 */
export interface WearableSyncResponse {
  success: boolean;
  provider: WearableProvider;
  data?: WearableData;
  error?: string;
}

// ============================================================================
// INSIGHT TYPES
// ============================================================================

/**
 * Health insight derived from wearable data
 */
export interface HealthInsight {
  type: 'stress' | 'sleep' | 'activity' | 'recovery' | 'trend';
  severity: 'info' | 'attention' | 'warning';
  title: string;
  message: string;
  suggestedAction?: string;
  dataPoints: Array<{
    metric: string;
    value: number;
    unit: string;
    trend?: 'up' | 'down' | 'stable';
  }>;
  detectedAt: Date;
}

/**
 * Trend analysis
 */
export interface HealthTrend {
  metric: keyof HealthMetrics | 'sleepQuality' | 'activityLevel';
  period: 'day' | 'week' | 'month';
  direction: 'improving' | 'declining' | 'stable';
  changePercent: number;
  dataPoints: Array<{ date: Date; value: number }>;
}
