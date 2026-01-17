/**
 * Oura Ring API Client
 *
 * Provides access to Oura Ring data:
 * - Sleep data (duration, stages, quality)
 * - Readiness scores (recovery, HRV balance)
 * - Activity data (steps, calories, movement)
 * - Heart rate data
 */

import { createLogger } from '../../utils/safe-logger.js';
import { createResilientClient } from '../self-healing/resilient-http.js';
import { getValidAccessToken } from './oura-auth.js';
import type {
  OuraResult,
  OuraApiResponse,
  OuraSleepDocument,
  OuraSleepSummary,
  OuraReadinessDocument,
  ReadinessSummary,
  OuraActivityDocument,
  ActivitySummary,
  OuraHeartRateDocument,
} from './oura-types.js';

const log = createLogger({ module: 'oura-api' });

// ============================================================================
// CONFIGURATION
// ============================================================================

const OURA_API_BASE = 'https://api.ouraring.com/v2/usercollection';
const REQUEST_TIMEOUT_MS = 15000;

// Create resilient HTTP client for Oura API
const ouraClient = createResilientClient('oura-api', {
  timeout: REQUEST_TIMEOUT_MS,
  maxRetries: 2,
  failureThreshold: 5,
  recoveryTimeout: 30000,
});

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

async function ouraRequest<T>(
  userId: string,
  endpoint: string,
  params?: Record<string, string>
): Promise<OuraResult<T>> {
  const token = await getValidAccessToken(userId);
  if (!token) {
    return { success: false, error: 'No valid Oura token' };
  }

  const url = new URL(`${OURA_API_BASE}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  try {
    const response = await ouraClient.get<T>(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.error || !response.data) {
      log.error(
        { status: response.status, endpoint, error: response.error?.message },
        'Oura API error'
      );
      return { success: false, error: `API error: ${response.status || 'unknown'}` };
    }

    return { success: true, data: response.data };
  } catch (error) {
    log.error({ error: String(error), endpoint }, 'Oura API request failed');
    return { success: false, error: 'Request failed' };
  }
}

/**
 * Get date string in YYYY-MM-DD format
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Get date range for recent days
 */
function getDateRange(daysBack = 7): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - daysBack);

  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
  };
}

// ============================================================================
// SLEEP DATA
// ============================================================================

/**
 * Get sleep data for a date range
 */
export async function getSleepData(
  userId: string,
  startDate?: string,
  endDate?: string
): Promise<OuraResult<OuraSleepDocument[]>> {
  const range = startDate && endDate ? { startDate, endDate } : getDateRange(7);

  const result = await ouraRequest<OuraApiResponse<OuraSleepDocument>>(userId, '/sleep', {
    start_date: range.startDate,
    end_date: range.endDate,
  });

  if (!result.success || !result.data) {
    return { success: false, error: result.error };
  }

  return { success: true, data: result.data.data };
}

/**
 * Get sleep summary for a specific date or most recent
 */
export async function getSleepSummary(
  userId: string,
  date?: string
): Promise<OuraResult<OuraSleepSummary>> {
  const targetDate = date || formatDate(new Date());
  const startDate = date || formatDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

  const result = await getSleepData(userId, startDate, targetDate);

  if (!result.success || !result.data || result.data.length === 0) {
    return { success: false, error: result.error || 'No sleep data found' };
  }

  // Get the most recent sleep session
  const latestSleep = result.data
    .filter((s) => s.type === 'long_sleep' || s.type === 'sleep')
    .sort((a, b) => new Date(b.bedtime_end).getTime() - new Date(a.bedtime_end).getTime())[0];

  if (!latestSleep) {
    return { success: false, error: 'No sleep data found' };
  }

  const summary: OuraSleepSummary = {
    date: latestSleep.day,
    score: Math.round(latestSleep.efficiency * 100) || 0,
    totalSleep: Math.round(latestSleep.total_sleep_duration / 60),
    efficiency: latestSleep.efficiency,
    latency: Math.round(latestSleep.latency / 60),
    remSleep: Math.round(latestSleep.rem_sleep_duration / 60),
    deepSleep: Math.round(latestSleep.deep_sleep_duration / 60),
    lightSleep: Math.round(latestSleep.light_sleep_duration / 60),
    awakeTime: Math.round(latestSleep.awake_time / 60),
    averageHrv: latestSleep.average_hrv,
    averageHeartRate: latestSleep.average_heart_rate,
    lowestHeartRate: latestSleep.lowest_heart_rate,
    averageBreathing: latestSleep.average_breath,
    restlessPeriods: latestSleep.restless_periods,
  };

  return { success: true, data: summary };
}

// ============================================================================
// READINESS DATA
// ============================================================================

/**
 * Get readiness data for a date range
 */
export async function getReadinessData(
  userId: string,
  startDate?: string,
  endDate?: string
): Promise<OuraResult<OuraReadinessDocument[]>> {
  const range = startDate && endDate ? { startDate, endDate } : getDateRange(7);

  const result = await ouraRequest<OuraApiResponse<OuraReadinessDocument>>(
    userId,
    '/daily_readiness',
    {
      start_date: range.startDate,
      end_date: range.endDate,
    }
  );

  if (!result.success || !result.data) {
    return { success: false, error: result.error };
  }

  return { success: true, data: result.data.data };
}

/**
 * Get readiness summary for today or specific date
 */
export async function getReadinessSummary(
  userId: string,
  date?: string
): Promise<OuraResult<ReadinessSummary>> {
  const targetDate = date || formatDate(new Date());
  const startDate = date || formatDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

  const result = await getReadinessData(userId, startDate, targetDate);

  if (!result.success || !result.data || result.data.length === 0) {
    return { success: false, error: result.error || 'No readiness data found' };
  }

  // Get most recent readiness
  const latest = result.data.sort(
    (a, b) => new Date(b.day).getTime() - new Date(a.day).getTime()
  )[0];

  if (!latest) {
    return { success: false, error: 'No readiness data found' };
  }

  const summary: ReadinessSummary = {
    date: latest.day,
    score: latest.score,
    temperatureDeviation: latest.temperature_deviation,
    contributors: {
      activityBalance: latest.contributors.activity_balance,
      bodyTemperature: latest.contributors.body_temperature,
      hrvBalance: latest.contributors.hrv_balance,
      previousDayActivity: latest.contributors.previous_day_activity,
      previousNight: latest.contributors.previous_night,
      recoveryIndex: latest.contributors.recovery_index,
      restingHeartRate: latest.contributors.resting_heart_rate,
      sleepBalance: latest.contributors.sleep_balance,
    },
  };

  return { success: true, data: summary };
}

// ============================================================================
// ACTIVITY DATA
// ============================================================================

/**
 * Get activity data for a date range
 */
export async function getActivityData(
  userId: string,
  startDate?: string,
  endDate?: string
): Promise<OuraResult<OuraActivityDocument[]>> {
  const range = startDate && endDate ? { startDate, endDate } : getDateRange(7);

  const result = await ouraRequest<OuraApiResponse<OuraActivityDocument>>(
    userId,
    '/daily_activity',
    {
      start_date: range.startDate,
      end_date: range.endDate,
    }
  );

  if (!result.success || !result.data) {
    return { success: false, error: result.error };
  }

  return { success: true, data: result.data.data };
}

/**
 * Get activity summary for today or specific date
 */
export async function getActivitySummary(
  userId: string,
  date?: string
): Promise<OuraResult<ActivitySummary>> {
  const targetDate = date || formatDate(new Date());
  const startDate = date || formatDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

  const result = await getActivityData(userId, startDate, targetDate);

  if (!result.success || !result.data || result.data.length === 0) {
    return { success: false, error: result.error || 'No activity data found' };
  }

  // Get most recent activity
  const latest = result.data.sort(
    (a, b) => new Date(b.day).getTime() - new Date(a.day).getTime()
  )[0];

  if (!latest) {
    return { success: false, error: 'No activity data found' };
  }

  const summary: ActivitySummary = {
    date: latest.day,
    score: latest.score,
    steps: latest.steps,
    activeCalories: latest.active_calories,
    totalCalories: latest.total_calories,
    highActivityTime: Math.round(latest.high_activity_time / 60),
    mediumActivityTime: Math.round(latest.medium_activity_time / 60),
    lowActivityTime: Math.round(latest.low_activity_time / 60),
    restingTime: Math.round(latest.resting_time / 60),
    inactivityAlerts: latest.inactivity_alerts,
    metersToTarget: latest.meters_to_target,
  };

  return { success: true, data: summary };
}

// ============================================================================
// HEART RATE DATA
// ============================================================================

/**
 * Get heart rate data for a date range
 */
export async function getHeartRateData(
  userId: string,
  startDate?: string,
  endDate?: string
): Promise<OuraResult<OuraHeartRateDocument[]>> {
  const range = startDate && endDate ? { startDate, endDate } : getDateRange(1);

  const result = await ouraRequest<OuraApiResponse<OuraHeartRateDocument>>(userId, '/heartrate', {
    start_datetime: `${range.startDate}T00:00:00+00:00`,
    end_datetime: `${range.endDate}T23:59:59+00:00`,
  });

  if (!result.success || !result.data) {
    return { success: false, error: result.error };
  }

  return { success: true, data: result.data.data };
}

/**
 * Get resting heart rate average
 */
export async function getRestingHeartRate(
  userId: string,
  date?: string
): Promise<OuraResult<number>> {
  const targetDate = date || formatDate(new Date());
  const result = await getHeartRateData(userId, targetDate, targetDate);

  if (!result.success || !result.data || result.data.length === 0) {
    return { success: false, error: result.error || 'No heart rate data' };
  }

  // Filter for resting/sleep heart rates
  const restingHR = result.data.filter((hr) => hr.source === 'rest' || hr.source === 'sleep');
  if (restingHR.length === 0) {
    return { success: false, error: 'No resting heart rate data' };
  }

  const avgHR = Math.round(restingHR.reduce((sum, hr) => sum + hr.bpm, 0) / restingHR.length);
  return { success: true, data: avgHR };
}

// ============================================================================
// COMBINED STATUS
// ============================================================================

export interface OuraStatus {
  connected: boolean;
  sleep?: OuraSleepSummary;
  readiness?: ReadinessSummary;
  activity?: ActivitySummary;
  error?: string;
}

/**
 * Get comprehensive Oura status (sleep, readiness, activity)
 */
export async function getOuraStatus(userId: string): Promise<OuraResult<OuraStatus>> {
  const [sleepResult, readinessResult, activityResult] = await Promise.all([
    getSleepSummary(userId),
    getReadinessSummary(userId),
    getActivitySummary(userId),
  ]);

  // If all fail, connection might be broken
  if (!sleepResult.success && !readinessResult.success && !activityResult.success) {
    return {
      success: true,
      data: {
        connected: true,
        error: sleepResult.error || 'No data available',
      },
    };
  }

  return {
    success: true,
    data: {
      connected: true,
      sleep: sleepResult.success ? sleepResult.data : undefined,
      readiness: readinessResult.success ? readinessResult.data : undefined,
      activity: activityResult.success ? activityResult.data : undefined,
    },
  };
}
