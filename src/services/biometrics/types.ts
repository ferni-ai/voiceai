/**
 * Biometrics Type Definitions
 *
 * Type definitions for biometric data from wearable platforms.
 *
 * @module services/biometrics/types
 */

// ============================================================================
// PLATFORM TYPES
// ============================================================================

/**
 * Supported biometric platforms
 * Note: 'terra' aggregates HealthKit, Fitbit, and 300+ other wearables via web OAuth
 * Recommended for web apps that need Apple Health data without a native iOS app
 */
export type BiometricPlatform = 'healthkit' | 'googlefit' | 'oura' | 'whoop' | 'fitbit' | 'terra';

/** Stress level categorization */
export type StressLevel = 'low' | 'moderate' | 'high' | 'elevated';

// ============================================================================
// DATA TYPES
// ============================================================================

export interface SleepData {
  /** Total sleep duration in hours */
  duration: number;
  /** Deep sleep percentage */
  deepSleepPercent: number;
  /** REM sleep percentage */
  remSleepPercent: number;
  /** Number of wake-ups during night */
  disturbances: number;
  /** Sleep quality score 0-100 */
  qualityScore: number;
  /** Sleep start time */
  bedtime: Date;
  /** Wake time */
  wakeTime: Date;
}

export interface HRVData {
  /** Current HRV in milliseconds */
  current: number;
  /** 7-day average HRV */
  baseline: number;
  /** Percent deviation from baseline */
  deviationPercent: number;
  /** Timestamp of measurement */
  timestamp: Date;
}

export interface ActivityData {
  /** Steps today */
  steps: number;
  /** Active minutes today */
  activeMinutes: number;
  /** Calories burned */
  caloriesBurned: number;
  /** Hours since last activity */
  hoursSinceActivity: number;
  /** Standing hours (for sedentary detection) */
  standingHours: number;
}

export interface RecoveryData {
  /** Recovery score 0-100 */
  score: number;
  /** Readiness for physical activity */
  readiness: 'low' | 'moderate' | 'high' | 'peak';
  /** Factors affecting recovery */
  factors: {
    sleep: number;
    hrv: number;
    restingHR: number;
    activity: number;
  };
}

// ============================================================================
// COMPOSITE TYPES
// ============================================================================

export interface BiometricSnapshot {
  userId: string;
  platform: BiometricPlatform;
  timestamp: Date;
  hrv: HRVData | null;
  sleep: SleepData | null;
  activity: ActivityData | null;
  recovery: RecoveryData | null;
  stressLevel: StressLevel;
  /** Raw data for debugging */
  raw?: Record<string, unknown>;
}

export interface BiometricEvent {
  type: 'hrv_spike' | 'poor_sleep' | 'sedentary' | 'recovery_low' | 'stress_elevated';
  severity: 'info' | 'warning' | 'alert';
  message: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

export interface BiometricInsight {
  type: 'sleep' | 'stress' | 'activity' | 'recovery';
  insight: string;
  suggestion?: string;
  confidence: number;
}

// ============================================================================
// INTERNAL TYPES
// ============================================================================

/** Persisted token data for storage */
export interface PersistedBiometricTokens {
  platform: BiometricPlatform;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: string; // ISO date string
  lastSync: string; // ISO date string
}

/** User biometrics state */
export interface UserBiometrics {
  platform: BiometricPlatform;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: Date;
  lastSync: Date;
  snapshot: BiometricSnapshot | null;
  history: BiometricSnapshot[];
  eventCallbacks: Set<(event: BiometricEvent) => void>;
}

// ============================================================================
// CONVERSATION AWARENESS TYPES
// ============================================================================

export interface ConversationAwareness {
  /** Whether biometrics should influence conversation */
  shouldInfluence: boolean;
  /** Suggested tone adjustment */
  toneAdjustment: 'gentle' | 'neutral' | 'energetic';
  /** Topics to be sensitive about */
  sensitiveTopics: string[];
  /** Proactive check-ins to consider */
  proactiveCheckIns: string[];
  /** Context for the AI */
  contextForAI: string;
}
