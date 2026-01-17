/**
 * Apple Health Types
 *
 * Type definitions for Apple Health integration.
 * Apple Health data comes from the native iOS app via sync API.
 *
 * Unlike Ecobee/Oura/Eight Sleep, Apple Health doesn't have a web API.
 * The native app reads HealthKit data and syncs it to our backend.
 */

// ============================================================================
// SYNC TYPES (Data pushed from native app)
// ============================================================================

export interface AppleHealthSyncPayload {
  userId: string;
  deviceId: string;
  syncedAt: string;
  data: {
    sleep?: AppleHealthSleepData[];
    activity?: AppleHealthActivityData[];
    heartRate?: AppleHealthHeartRateData[];
    hrv?: AppleHealthHrvData[];
    steps?: AppleHealthStepsData[];
    workouts?: AppleHealthWorkoutData[];
    mindfulness?: AppleHealthMindfulnessData[];
  };
}

// ============================================================================
// SLEEP DATA
// ============================================================================

export interface AppleHealthSleepData {
  id: string;
  startDate: string;
  endDate: string;
  value: 'inBed' | 'asleepUnspecified' | 'awake' | 'asleepCore' | 'asleepDeep' | 'asleepREM';
  sourceName: string;
  sourceId: string;
}

export interface AppleHealthSleepSummary {
  date: string;
  totalSleep: number; // minutes
  inBed: number; // minutes
  awake: number; // minutes
  core: number; // minutes (light sleep)
  deep: number; // minutes
  rem: number; // minutes
  efficiency: number; // percentage
  sources: string[];
}

// ============================================================================
// ACTIVITY DATA
// ============================================================================

export interface AppleHealthActivityData {
  date: string;
  activeEnergyBurned: number; // kcal
  basalEnergyBurned: number; // kcal
  appleExerciseTime: number; // minutes
  appleStandHours: number;
  appleMoveMinutes: number;
}

export interface AppleHealthStepsData {
  startDate: string;
  endDate: string;
  value: number;
  sourceName: string;
}

export interface AppleHealthWorkoutData {
  id: string;
  workoutType: string;
  startDate: string;
  endDate: string;
  duration: number; // seconds
  totalEnergyBurned: number; // kcal
  totalDistance?: number; // meters
  sourceName: string;
}

// ============================================================================
// HEART DATA
// ============================================================================

export interface AppleHealthHeartRateData {
  startDate: string;
  value: number; // bpm
  motionContext?: 'notSet' | 'sedentary' | 'active';
  sourceName: string;
}

export interface AppleHealthHrvData {
  startDate: string;
  value: number; // ms (SDNN)
  sourceName: string;
}

// ============================================================================
// MINDFULNESS DATA
// ============================================================================

export interface AppleHealthMindfulnessData {
  startDate: string;
  endDate: string;
  duration: number; // seconds
  sourceName: string;
}

// ============================================================================
// AGGREGATED SUMMARIES (Computed from synced data)
// ============================================================================

export interface AppleHealthDailySummary {
  date: string;
  sleep: AppleHealthSleepSummary | null;
  activity: {
    steps: number;
    activeCalories: number;
    totalCalories: number;
    exerciseMinutes: number;
    standHours: number;
  } | null;
  heart: {
    restingHeartRate: number | null;
    averageHeartRate: number | null;
    maxHeartRate: number | null;
    hrv: number | null;
  } | null;
  mindfulness: {
    totalMinutes: number;
    sessions: number;
  } | null;
}

export interface AppleHealthWeekSummary {
  startDate: string;
  endDate: string;
  averageSleepDuration: number;
  averageSteps: number;
  averageActiveCalories: number;
  averageRestingHeartRate: number | null;
  averageHrv: number | null;
  totalExerciseMinutes: number;
  totalMindfulnessMinutes: number;
  workouts: number;
}

// ============================================================================
// AUTHORIZATION STATUS
// ============================================================================

export interface AppleHealthAuthStatus {
  connected: boolean;
  lastSyncAt: string | null;
  authorizedTypes: string[];
  deviceName: string | null;
}

// ============================================================================
// RESULT TYPES
// ============================================================================

export interface AppleHealthResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================================================
// FIRESTORE SCHEMA
// ============================================================================

/**
 * Firestore structure:
 *
 * apple_health_status/{userId}
 *   - connected: boolean
 *   - lastSyncAt: timestamp
 *   - deviceId: string
 *   - deviceName: string
 *   - authorizedTypes: string[]
 *
 * apple_health_data/{userId}/daily/{date}
 *   - AppleHealthDailySummary
 *
 * apple_health_data/{userId}/raw/{syncId}
 *   - Raw sync payloads for debugging
 */
