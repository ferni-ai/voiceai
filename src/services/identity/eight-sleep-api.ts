/**
 * Eight Sleep API Client
 *
 * Handles mattress operations:
 * - Get sleep data and scores
 * - Get/set temperature settings
 * - Get biometric data (HRV, heart rate, respiratory rate)
 * - Manage smart alarms
 *
 * Uses circuit breaker pattern for resilience.
 */

import { getCircuitBreaker } from '../../utils/circuit-breaker.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getValidAccessToken, getUserTokens } from './eight-sleep-auth.js';
import type {
  EightSleepResult,
  EightSleepUser,
  EightSleepDevice,
  EightSleepInterval,
  SleepSummary,
  TemperatureState,
  SetTemperatureParams,
  SmartAlarm,
} from './eight-sleep-types.js';

const log = createLogger({ module: 'eight-sleep-api' });

// ============================================================================
// CONFIGURATION
// ============================================================================

const EIGHT_SLEEP_API_BASE = 'https://client-api.8slp.net/v1';

// Circuit breaker for Eight Sleep API
const eightSleepCircuitBreaker = getCircuitBreaker('eight-sleep-api', {
  failureThreshold: 5,
  resetTimeout: 30_000,
  successThreshold: 2,
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Make authenticated API request
 */
async function eightSleepRequest<T>(
  userId: string,
  method: 'GET' | 'POST' | 'PUT',
  endpoint: string,
  body?: object
): Promise<EightSleepResult<T>> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    return {
      success: false,
      error: 'Eight Sleep not connected. Please connect your mattress in Settings.',
    };
  }

  try {
    return await eightSleepCircuitBreaker.execute(async () => {
      const url = `${EIGHT_SLEEP_API_BASE}${endpoint}`;

      const options: RequestInit = {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      };

      if (body && (method === 'POST' || method === 'PUT')) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);

      if (!response.ok) {
        const error = await response.text();
        log.error({ status: response.status, error, endpoint }, 'Eight Sleep API error');

        if (response.status === 401) {
          return {
            success: false,
            error: 'Eight Sleep session expired. Please reconnect in Settings.',
          };
        }

        return { success: false, error: 'Failed to communicate with Eight Sleep' };
      }

      const data = (await response.json()) as T;
      return { success: true, data };
    });
  } catch (error) {
    log.error({ error: String(error), endpoint }, 'Eight Sleep API request failed');
    return { success: false, error: 'Unable to reach Eight Sleep. Please try again.' };
  }
}

/**
 * Get Eight Sleep user ID from stored tokens
 */
async function getEightSleepUserId(userId: string): Promise<string | null> {
  const tokens = await getUserTokens(userId);
  return tokens?.user_id || null;
}

// ============================================================================
// USER & DEVICE OPERATIONS
// ============================================================================

/**
 * Get user profile
 */
export async function getUser(userId: string): Promise<EightSleepResult<EightSleepUser>> {
  const eightSleepUserId = await getEightSleepUserId(userId);
  if (!eightSleepUserId) {
    return { success: false, error: 'Eight Sleep not connected' };
  }

  return eightSleepRequest<EightSleepUser>(userId, 'GET', `/users/${eightSleepUserId}`);
}

/**
 * Get user's devices
 */
export async function getDevices(userId: string): Promise<EightSleepResult<EightSleepDevice[]>> {
  const userResult = await getUser(userId);
  if (!userResult.success || !userResult.data) {
    return { success: false, error: userResult.error };
  }

  return { success: true, data: userResult.data.devices || [] };
}

/**
 * Get primary device (first device or specific side)
 */
export async function getPrimaryDevice(
  userId: string
): Promise<EightSleepResult<EightSleepDevice>> {
  const devicesResult = await getDevices(userId);
  if (!devicesResult.success || !devicesResult.data) {
    return { success: false, error: devicesResult.error };
  }

  if (devicesResult.data.length === 0) {
    return { success: false, error: 'No Eight Sleep devices found on your account.' };
  }

  return { success: true, data: devicesResult.data[0] };
}

// ============================================================================
// SLEEP DATA OPERATIONS
// ============================================================================

/**
 * Get sleep intervals for a date range
 */
export async function getSleepIntervals(
  userId: string,
  startDate?: string,
  endDate?: string
): Promise<EightSleepResult<EightSleepInterval[]>> {
  const eightSleepUserId = await getEightSleepUserId(userId);
  if (!eightSleepUserId) {
    return { success: false, error: 'Eight Sleep not connected' };
  }

  // Default to last 7 days if no dates provided
  const end = endDate || new Date().toISOString().split('T')[0];
  const start =
    startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const result = await eightSleepRequest<{ intervals: EightSleepInterval[] }>(
    userId,
    'GET',
    `/users/${eightSleepUserId}/intervals?from=${start}&to=${end}`
  );

  if (!result.success || !result.data) {
    return { success: false, error: result.error };
  }

  return { success: true, data: result.data.intervals || [] };
}

/**
 * Get last night's sleep data
 */
export async function getLastNightSleep(
  userId: string
): Promise<EightSleepResult<EightSleepInterval>> {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const result = await getSleepIntervals(userId, yesterday, today);
  if (!result.success || !result.data) {
    return { success: false, error: result.error };
  }

  // Find the most recent complete sleep interval
  const completeSleeps = result.data.filter((i) => !i.incomplete);
  if (completeSleeps.length === 0) {
    // Try incomplete if no complete ones
    if (result.data.length > 0) {
      return { success: true, data: result.data[result.data.length - 1] };
    }
    return { success: false, error: 'No sleep data found for last night.' };
  }

  return { success: true, data: completeSleeps[completeSleeps.length - 1] };
}

/**
 * Get sleep summary (formatted for voice response)
 */
export async function getSleepSummary(
  userId: string,
  date?: string
): Promise<EightSleepResult<SleepSummary>> {
  const targetDate = date || new Date().toISOString().split('T')[0];
  const prevDate = new Date(new Date(targetDate).getTime() - 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const result = await getSleepIntervals(userId, prevDate, targetDate);
  if (!result.success || !result.data || result.data.length === 0) {
    return { success: false, error: result.error || 'No sleep data found.' };
  }

  const interval = result.data[result.data.length - 1];
  const stages = interval.stages || [];

  // Calculate stage durations
  let awakeTime = 0;
  let lightTime = 0;
  let deepTime = 0;
  let remTime = 0;

  for (const stage of stages) {
    switch (stage.stage) {
      case 'awake':
        awakeTime += stage.duration;
        break;
      case 'light':
        lightTime += stage.duration;
        break;
      case 'deep':
        deepTime += stage.duration;
        break;
      case 'rem':
        remTime += stage.duration;
        break;
    }
  }

  const totalSleepSeconds = lightTime + deepTime + remTime;
  const totalTimeInBed = awakeTime + totalSleepSeconds;
  const efficiency =
    totalTimeInBed > 0 ? Math.round((totalSleepSeconds / totalTimeInBed) * 100) : 0;

  // Calculate averages from timeseries
  const heartRates = interval.timeseries?.heartRate || [];
  const hrvData = interval.timeseries?.hrv || [];
  const respRates = interval.timeseries?.respiratoryRate || [];

  const avgHeartRate =
    heartRates.length > 0
      ? Math.round(heartRates.reduce((sum, d) => sum + d.value, 0) / heartRates.length)
      : 0;

  const avgHrv =
    hrvData.length > 0
      ? Math.round(hrvData.reduce((sum, d) => sum + d.value, 0) / hrvData.length)
      : 0;

  const avgRespRate =
    respRates.length > 0
      ? Math.round((respRates.reduce((sum, d) => sum + d.value, 0) / respRates.length) * 10) / 10
      : 0;

  const lowestHr = heartRates.length > 0 ? Math.min(...heartRates.map((d) => d.value)) : 0;

  // Count times awake
  const timesAwake = stages.filter((s) => s.stage === 'awake').length;

  // Estimate time to sleep (first non-awake stage)
  const firstSleepStage = stages.findIndex((s) => s.stage !== 'awake' && s.stage !== 'out');
  const timeToSleep =
    firstSleepStage > 0
      ? Math.round(stages.slice(0, firstSleepStage).reduce((sum, s) => sum + s.duration, 0) / 60)
      : 0;

  const summary: SleepSummary = {
    date: targetDate,
    score: interval.score || 0,
    sleepDuration: Math.round(totalSleepSeconds / 60), // Convert to minutes
    sleepEfficiency: efficiency,
    timeToSleep,
    timesAwake,
    stages: {
      awake: Math.round(awakeTime / 60),
      light: Math.round(lightTime / 60),
      deep: Math.round(deepTime / 60),
      rem: Math.round(remTime / 60),
    },
    averageHrv: avgHrv,
    averageHeartRate: avgHeartRate,
    averageRespiratoryRate: avgRespRate,
    lowestHeartRate: lowestHr,
  };

  return { success: true, data: summary };
}

// ============================================================================
// TEMPERATURE CONTROL
// ============================================================================

/**
 * Get current temperature state
 */
export async function getTemperatureState(
  userId: string
): Promise<EightSleepResult<TemperatureState>> {
  const deviceResult = await getPrimaryDevice(userId);
  if (!deviceResult.success || !deviceResult.data) {
    return { success: false, error: deviceResult.error };
  }

  const device = deviceResult.data;

  // Get current device state
  const result = await eightSleepRequest<{
    currentLevel: number;
    targetLevel: number;
    active: boolean;
    scheduleEnabled: boolean;
  }>(userId, 'GET', `/devices/${device.id}/temperature`);

  if (!result.success || !result.data) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    data: {
      currentLevel: result.data.currentLevel,
      targetLevel: result.data.targetLevel,
      active: result.data.active,
      scheduleEnabled: result.data.scheduleEnabled,
    },
  };
}

/**
 * Set temperature level (-10 to +10)
 */
export async function setTemperature(
  userId: string,
  params: SetTemperatureParams
): Promise<EightSleepResult<void>> {
  const { level, durationMinutes } = params;

  // Validate level
  if (level < -10 || level > 10) {
    return { success: false, error: 'Temperature level must be between -10 and +10' };
  }

  const deviceResult = await getPrimaryDevice(userId);
  if (!deviceResult.success || !deviceResult.data) {
    return { success: false, error: deviceResult.error };
  }

  const device = deviceResult.data;

  const body: Record<string, unknown> = {
    level,
  };

  if (durationMinutes) {
    body.durationMinutes = durationMinutes;
  }

  log.info(
    { userId, deviceId: device.id, level, durationMinutes },
    'Setting Eight Sleep temperature'
  );

  const result = await eightSleepRequest<void>(
    userId,
    'PUT',
    `/devices/${device.id}/temperature`,
    body
  );

  if (!result.success) {
    return result;
  }

  return { success: true };
}

/**
 * Turn bed warming/cooling on
 */
export async function turnOn(userId: string, level?: number): Promise<EightSleepResult<void>> {
  const deviceResult = await getPrimaryDevice(userId);
  if (!deviceResult.success || !deviceResult.data) {
    return { success: false, error: deviceResult.error };
  }

  const device = deviceResult.data;

  const body: Record<string, unknown> = {
    active: true,
  };

  if (level !== undefined) {
    if (level < -10 || level > 10) {
      return { success: false, error: 'Temperature level must be between -10 and +10' };
    }
    body.level = level;
  }

  log.info({ userId, deviceId: device.id, level }, 'Turning Eight Sleep on');

  return eightSleepRequest<void>(userId, 'PUT', `/devices/${device.id}/temperature`, body);
}

/**
 * Turn bed warming/cooling off
 */
export async function turnOff(userId: string): Promise<EightSleepResult<void>> {
  const deviceResult = await getPrimaryDevice(userId);
  if (!deviceResult.success || !deviceResult.data) {
    return { success: false, error: deviceResult.error };
  }

  const device = deviceResult.data;

  log.info({ userId, deviceId: device.id }, 'Turning Eight Sleep off');

  return eightSleepRequest<void>(userId, 'PUT', `/devices/${device.id}/temperature`, {
    active: false,
  });
}

// ============================================================================
// SMART ALARM
// ============================================================================

/**
 * Get smart alarm settings
 */
export async function getAlarm(userId: string): Promise<EightSleepResult<SmartAlarm>> {
  const deviceResult = await getPrimaryDevice(userId);
  if (!deviceResult.success || !deviceResult.data) {
    return { success: false, error: deviceResult.error };
  }

  const device = deviceResult.data;

  const result = await eightSleepRequest<SmartAlarm>(userId, 'GET', `/devices/${device.id}/alarm`);

  if (!result.success || !result.data) {
    return { success: false, error: result.error };
  }

  return result;
}

/**
 * Set smart alarm
 */
export async function setAlarm(
  userId: string,
  alarm: Partial<SmartAlarm>
): Promise<EightSleepResult<void>> {
  const deviceResult = await getPrimaryDevice(userId);
  if (!deviceResult.success || !deviceResult.data) {
    return { success: false, error: deviceResult.error };
  }

  const device = deviceResult.data;

  log.info({ userId, deviceId: device.id, alarm }, 'Setting Eight Sleep alarm');

  return eightSleepRequest<void>(userId, 'PUT', `/devices/${device.id}/alarm`, alarm);
}

// ============================================================================
// BIOMETRICS
// ============================================================================

/**
 * Get recent biometrics (HRV, heart rate, respiratory rate trends)
 */
export async function getRecentBiometrics(
  userId: string,
  days: number = 7
): Promise<
  EightSleepResult<{
    averageHrv: number;
    averageRestingHeartRate: number;
    averageRespiratoryRate: number;
    hrvTrend: 'improving' | 'declining' | 'stable';
  }>
> {
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const result = await getSleepIntervals(userId, startDate, endDate);
  if (!result.success || !result.data || result.data.length === 0) {
    return { success: false, error: result.error || 'No biometric data available.' };
  }

  const intervals = result.data.filter((i) => !i.incomplete);

  let totalHrv = 0;
  let totalHr = 0;
  let totalResp = 0;
  let count = 0;
  const hrvValues: number[] = [];

  for (const interval of intervals) {
    const hrvData = interval.timeseries?.hrv || [];
    const hrData = interval.timeseries?.heartRate || [];
    const respData = interval.timeseries?.respiratoryRate || [];

    if (hrvData.length > 0) {
      const avgHrv = hrvData.reduce((sum, d) => sum + d.value, 0) / hrvData.length;
      totalHrv += avgHrv;
      hrvValues.push(avgHrv);
    }

    if (hrData.length > 0) {
      totalHr += hrData.reduce((sum, d) => sum + d.value, 0) / hrData.length;
    }

    if (respData.length > 0) {
      totalResp += respData.reduce((sum, d) => sum + d.value, 0) / respData.length;
    }

    count++;
  }

  if (count === 0) {
    return { success: false, error: 'No complete sleep data found for biometrics.' };
  }

  // Determine HRV trend
  let hrvTrend: 'improving' | 'declining' | 'stable' = 'stable';
  if (hrvValues.length >= 3) {
    const firstHalf = hrvValues.slice(0, Math.floor(hrvValues.length / 2));
    const secondHalf = hrvValues.slice(Math.floor(hrvValues.length / 2));
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const changePct = ((secondAvg - firstAvg) / firstAvg) * 100;
    if (changePct > 5) hrvTrend = 'improving';
    else if (changePct < -5) hrvTrend = 'declining';
  }

  return {
    success: true,
    data: {
      averageHrv: Math.round(totalHrv / count),
      averageRestingHeartRate: Math.round(totalHr / count),
      averageRespiratoryRate: Math.round((totalResp / count) * 10) / 10,
      hrvTrend,
    },
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // User & Device
  getUser,
  getDevices,
  getPrimaryDevice,

  // Sleep Data
  getSleepIntervals,
  getLastNightSleep,
  getSleepSummary,

  // Temperature Control
  getTemperatureState,
  setTemperature,
  turnOn,
  turnOff,

  // Smart Alarm
  getAlarm,
  setAlarm,

  // Biometrics
  getRecentBiometrics,
};
