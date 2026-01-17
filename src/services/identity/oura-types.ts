/**
 * Oura Ring Types
 *
 * Type definitions for Oura Ring integration.
 * Oura provides sleep tracking, readiness scores, activity, and HRV data.
 */

// ============================================================================
// OAUTH TYPES
// ============================================================================

export interface OuraTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
}

export interface OuraTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

// ============================================================================
// USER TYPES
// ============================================================================

export interface OuraUser {
  id: string;
  email: string;
  age: number;
  weight: number;
  height: number;
  biological_sex: string;
}

// ============================================================================
// SLEEP DATA TYPES
// ============================================================================

export interface OuraSleepDocument {
  id: string;
  day: string; // YYYY-MM-DD
  bedtime_start: string;
  bedtime_end: string;
  sleep_phase_5_min: string; // Encoded sleep stages
  average_breath: number;
  average_heart_rate: number;
  average_hrv: number;
  awake_time: number;
  deep_sleep_duration: number;
  efficiency: number;
  latency: number;
  light_sleep_duration: number;
  low_battery_alert: boolean;
  lowest_heart_rate: number;
  movement_30_sec: string;
  period: number;
  readiness_score_delta: number;
  rem_sleep_duration: number;
  restless_periods: number;
  sleep_score_delta: number;
  time_in_bed: number;
  total_sleep_duration: number;
  type: 'deleted' | 'sleep' | 'long_sleep' | 'late_nap' | 'rest';
}

export interface OuraSleepSummary {
  date: string;
  score: number;
  totalSleep: number; // minutes
  efficiency: number; // percentage
  latency: number; // minutes to fall asleep
  remSleep: number; // minutes
  deepSleep: number; // minutes
  lightSleep: number; // minutes
  awakeTime: number; // minutes
  averageHrv: number;
  averageHeartRate: number;
  lowestHeartRate: number;
  averageBreathing: number;
  restlessPeriods: number;
}

// ============================================================================
// READINESS TYPES
// ============================================================================

export interface OuraReadinessDocument {
  id: string;
  day: string;
  score: number;
  temperature_deviation: number;
  temperature_trend_deviation: number;
  contributors: {
    activity_balance: number;
    body_temperature: number;
    hrv_balance: number;
    previous_day_activity: number;
    previous_night: number;
    recovery_index: number;
    resting_heart_rate: number;
    sleep_balance: number;
  };
}

export interface ReadinessSummary {
  date: string;
  score: number;
  temperatureDeviation: number;
  contributors: {
    activityBalance: number;
    bodyTemperature: number;
    hrvBalance: number;
    previousDayActivity: number;
    previousNight: number;
    recoveryIndex: number;
    restingHeartRate: number;
    sleepBalance: number;
  };
}

// ============================================================================
// ACTIVITY TYPES
// ============================================================================

export interface OuraActivityDocument {
  id: string;
  day: string;
  score: number;
  active_calories: number;
  average_met_minutes: number;
  equivalent_walking_distance: number;
  high_activity_met_minutes: number;
  high_activity_time: number;
  inactivity_alerts: number;
  low_activity_met_minutes: number;
  low_activity_time: number;
  medium_activity_met_minutes: number;
  medium_activity_time: number;
  met: { interval: number; items: number[]; timestamp: string };
  meters_to_target: number;
  non_wear_time: number;
  resting_time: number;
  sedentary_met_minutes: number;
  sedentary_time: number;
  steps: number;
  target_calories: number;
  target_meters: number;
  total_calories: number;
  class_5_min: string;
}

export interface ActivitySummary {
  date: string;
  score: number;
  steps: number;
  activeCalories: number;
  totalCalories: number;
  highActivityTime: number; // minutes
  mediumActivityTime: number; // minutes
  lowActivityTime: number; // minutes
  restingTime: number; // minutes
  inactivityAlerts: number;
  metersToTarget: number;
}

// ============================================================================
// HEART RATE TYPES
// ============================================================================

export interface OuraHeartRateDocument {
  bpm: number;
  source: 'awake' | 'rest' | 'sleep' | 'session' | 'live';
  timestamp: string;
}

// ============================================================================
// RESULT TYPES
// ============================================================================

export interface OuraResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface OuraApiResponse<T> {
  data: T[];
  next_token?: string;
}
