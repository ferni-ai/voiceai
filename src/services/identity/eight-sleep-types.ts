/**
 * Eight Sleep Types
 *
 * Type definitions for Eight Sleep smart mattress integration.
 * Eight Sleep provides sleep tracking, temperature control, and biometrics.
 */

// ============================================================================
// OAUTH TYPES
// ============================================================================

export interface EightSleepTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user_id: string;
}

export interface EightSleepTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  userId: string;
}

// ============================================================================
// USER & DEVICE TYPES
// ============================================================================

export interface EightSleepUser {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  timezone: string;
  devices: EightSleepDevice[];
}

export interface EightSleepDevice {
  id: string;
  side: 'left' | 'right' | 'solo';
  ownerId: string;
  features: string[];
  firmwareVersion: string;
}

// ============================================================================
// SLEEP DATA TYPES
// ============================================================================

export interface EightSleepInterval {
  id: string;
  ts: string; // ISO timestamp
  stages: SleepStage[];
  score: number;
  timeseries: {
    tnt: TimeSeriesData[]; // Toss and turns
    tempRoomC: TimeSeriesData[];
    tempBedC: TimeSeriesData[];
    respiratoryRate: TimeSeriesData[];
    heartRate: TimeSeriesData[];
    hrv: TimeSeriesData[];
  };
  incomplete: boolean;
}

export interface SleepStage {
  stage: 'awake' | 'light' | 'deep' | 'rem' | 'out';
  duration: number; // seconds
}

export interface TimeSeriesData {
  time: string; // ISO timestamp
  value: number;
}

export interface SleepSummary {
  date: string;
  score: number;
  sleepDuration: number; // minutes
  sleepEfficiency: number; // percentage
  timeToSleep: number; // minutes
  timesAwake: number;
  stages: {
    awake: number;
    light: number;
    deep: number;
    rem: number;
  };
  averageHrv: number;
  averageHeartRate: number;
  averageRespiratoryRate: number;
  lowestHeartRate: number;
}

// ============================================================================
// TEMPERATURE CONTROL TYPES
// ============================================================================

export interface TemperatureState {
  currentLevel: number; // -10 to +10
  targetLevel: number;
  active: boolean;
  scheduleEnabled: boolean;
}

export interface TemperatureSchedule {
  enabled: boolean;
  phases: TemperaturePhase[];
}

export interface TemperaturePhase {
  operation: 'on' | 'off';
  startHour: number;
  startMinute: number;
  temperature: number; // -10 to +10
}

export interface SetTemperatureParams {
  level: number; // -10 to +10
  durationMinutes?: number;
}

// ============================================================================
// ALARM TYPES
// ============================================================================

export interface SmartAlarm {
  enabled: boolean;
  time: string; // HH:MM
  vibrationPattern: 'gentle' | 'moderate' | 'strong';
  thermalAlarm: boolean; // Use temperature to wake
  windowMinutes: number; // Smart wake window
}

// ============================================================================
// RESULT TYPES
// ============================================================================

export interface EightSleepResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface EightSleepApiResponse<T> {
  result: T;
  session?: {
    userId: string;
    token: string;
    expirationDate: string;
  };
}
