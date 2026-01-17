/**
 * Ecobee API Client
 *
 * Handles thermostat operations:
 * - Get thermostat status
 * - Set temperature (hold)
 * - Set climate mode (home/away/sleep)
 * - Get sensor readings
 * - Set HVAC mode
 *
 * Uses circuit breaker pattern for resilience.
 */

import { getCircuitBreaker } from '../../utils/circuit-breaker.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getValidAccessToken } from './ecobee-auth.js';
import type {
  EcobeeThermostat,
  EcobeeSensor,
  EcobeeResult,
  ThermostatStatus,
  SensorReading,
  EcobeeSelection,
  SetHoldParams,
  SetClimateParams,
  ClimateMode,
} from './ecobee-types.js';

const log = createLogger({ module: 'ecobee-api' });

// ============================================================================
// CONFIGURATION
// ============================================================================

const ECOBEE_API_BASE = 'https://api.ecobee.com/1';

// Circuit breaker for Ecobee API
const ecobeeCircuitBreaker = getCircuitBreaker('ecobee-api', {
  failureThreshold: 5,
  resetTimeout: 30_000,
  successThreshold: 2,
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert Ecobee temperature (Fahrenheit * 10) to regular Fahrenheit
 */
function fromEcobeeTemp(temp: number): number {
  return Math.round(temp / 10);
}

/**
 * Convert regular Fahrenheit to Ecobee format (Fahrenheit * 10)
 */
function toEcobeeTemp(temp: number): number {
  return Math.round(temp * 10);
}

/**
 * Make authenticated API request
 */
async function ecobeeRequest<T>(
  userId: string,
  method: 'GET' | 'POST',
  endpoint: string,
  body?: object
): Promise<EcobeeResult<T>> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    return {
      success: false,
      error: 'Ecobee not connected. Please connect your thermostat in Settings.',
    };
  }

  try {
    return await ecobeeCircuitBreaker.execute(async () => {
      const url =
        method === 'GET' && body
          ? `${ECOBEE_API_BASE}${endpoint}?json=${encodeURIComponent(JSON.stringify(body))}`
          : `${ECOBEE_API_BASE}${endpoint}`;

      const options: RequestInit = {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      };

      if (method === 'POST' && body) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);

      if (!response.ok) {
        const error = await response.text();
        log.error({ status: response.status, error, endpoint }, 'Ecobee API error');

        if (response.status === 401) {
          return { success: false, error: 'Ecobee session expired. Please reconnect in Settings.' };
        }

        return { success: false, error: 'Failed to communicate with thermostat' };
      }

      const data = (await response.json()) as { status?: { code: number; message: string } } & T;

      // Check Ecobee status code
      if (data.status && data.status.code !== 0) {
        log.warn(
          { statusCode: data.status.code, message: data.status.message },
          'Ecobee API returned error status'
        );
        return { success: false, error: data.status.message || 'Thermostat operation failed' };
      }

      return { success: true, data: data as T };
    });
  } catch (error) {
    log.error({ error: String(error), endpoint }, 'Ecobee API request failed');
    return { success: false, error: 'Unable to reach thermostat. Please try again.' };
  }
}

// ============================================================================
// THERMOSTAT OPERATIONS
// ============================================================================

/**
 * Get all thermostats for user
 */
export async function getThermostats(userId: string): Promise<EcobeeResult<EcobeeThermostat[]>> {
  const selection: EcobeeSelection = {
    selectionType: 'registered',
    includeRuntime: true,
    includeSettings: true,
    includeSensors: true,
    includeEvents: true,
  };

  const result = await ecobeeRequest<{ thermostatList: EcobeeThermostat[] }>(
    userId,
    'GET',
    '/thermostat',
    { selection }
  );

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return { success: true, data: result.data?.thermostatList || [] };
}

/**
 * Get thermostat status (formatted for voice response)
 */
export async function getThermostatStatus(
  userId: string,
  thermostatId?: string
): Promise<EcobeeResult<ThermostatStatus>> {
  const thermostatsResult = await getThermostats(userId);
  if (!thermostatsResult.success || !thermostatsResult.data) {
    return { success: false, error: thermostatsResult.error };
  }

  const thermostats = thermostatsResult.data;
  if (thermostats.length === 0) {
    return { success: false, error: 'No thermostats found on your account.' };
  }

  // Find specific thermostat or use first one
  const thermostat = thermostatId
    ? thermostats.find(
        (t) =>
          t.identifier === thermostatId || t.name.toLowerCase().includes(thermostatId.toLowerCase())
      )
    : thermostats[0];

  if (!thermostat) {
    return { success: false, error: `Couldn't find thermostat "${thermostatId}".` };
  }

  const runtime = thermostat.runtime;
  const settings = thermostat.settings;

  // Determine current event/state
  let currentEvent: string | undefined;
  const runningEvent = thermostat.events?.find((e) => e.running);
  if (runningEvent) {
    if (runningEvent.holdClimateRef) {
      currentEvent = `${runningEvent.holdClimateRef} hold`;
    } else if (runningEvent.type === 'hold') {
      currentEvent = 'temperature hold';
    } else if (runningEvent.type === 'vacation') {
      currentEvent = 'vacation mode';
    }
  }

  // Check if HVAC is running
  const isRunning = settings.hvacMode !== 'off';

  const status: ThermostatStatus = {
    name: thermostat.name,
    currentTemp: fromEcobeeTemp(runtime.actualTemperature),
    targetHeat: fromEcobeeTemp(runtime.desiredHeat),
    targetCool: fromEcobeeTemp(runtime.desiredCool),
    humidity: runtime.actualHumidity,
    mode: settings.hvacMode,
    isRunning,
    currentEvent,
  };

  return { success: true, data: status };
}

/**
 * Set temperature hold
 */
export async function setTemperature(
  userId: string,
  params: SetHoldParams
): Promise<EcobeeResult<void>> {
  const {
    thermostatId,
    heatHoldTemp,
    coolHoldTemp,
    holdType = 'nextTransition',
    holdHours,
  } = params;

  // Get current thermostat to determine which one to control
  const thermostatsResult = await getThermostats(userId);
  if (!thermostatsResult.success || !thermostatsResult.data) {
    return { success: false, error: thermostatsResult.error };
  }

  const thermostats = thermostatsResult.data;
  if (thermostats.length === 0) {
    return { success: false, error: 'No thermostats found.' };
  }

  const thermostat = thermostatId
    ? thermostats.find(
        (t) =>
          t.identifier === thermostatId || t.name.toLowerCase().includes(thermostatId.toLowerCase())
      )
    : thermostats[0];

  if (!thermostat) {
    return { success: false, error: `Couldn't find thermostat "${thermostatId}".` };
  }

  // Build the hold params
  const holdParams: Record<string, unknown> = {
    holdType,
  };

  if (holdHours && holdType === 'holdHours') {
    holdParams.holdHours = holdHours;
  }

  // Set temperatures - if only one is provided, we need to get current values
  const runtime = thermostat.runtime;
  holdParams.heatHoldTemp = heatHoldTemp ? toEcobeeTemp(heatHoldTemp) : runtime.desiredHeat;
  holdParams.coolHoldTemp = coolHoldTemp ? toEcobeeTemp(coolHoldTemp) : runtime.desiredCool;

  // Make sure cool >= heat with proper delta
  const minDelta = thermostat.settings.heatCoolMinDelta || 50; // 5°F default
  if ((holdParams.coolHoldTemp as number) - (holdParams.heatHoldTemp as number) < minDelta) {
    if (heatHoldTemp) {
      holdParams.coolHoldTemp = (holdParams.heatHoldTemp as number) + minDelta;
    } else {
      holdParams.heatHoldTemp = (holdParams.coolHoldTemp as number) - minDelta;
    }
  }

  const requestBody = {
    selection: {
      selectionType: 'thermostats',
      selectionMatch: thermostat.identifier,
    },
    functions: [
      {
        type: 'setHold',
        params: holdParams,
      },
    ],
  };

  log.info({ userId, thermostatId: thermostat.identifier, holdParams }, 'Setting temperature hold');

  const result = await ecobeeRequest<void>(userId, 'POST', '/thermostat', requestBody);

  if (!result.success) {
    return result;
  }

  return { success: true };
}

/**
 * Set climate mode (home, away, sleep)
 */
export async function setClimateMode(
  userId: string,
  params: SetClimateParams
): Promise<EcobeeResult<void>> {
  const { thermostatId, climate, holdType = 'nextTransition', holdHours } = params;

  // Validate climate mode
  const validClimateRefs: Record<ClimateMode, string> = {
    home: 'home',
    away: 'away',
    sleep: 'sleep',
  };

  const climateRef = validClimateRefs[climate];
  if (!climateRef) {
    return {
      success: false,
      error: `Unknown climate mode "${climate}". Use home, away, or sleep.`,
    };
  }

  // Get thermostat
  const thermostatsResult = await getThermostats(userId);
  if (!thermostatsResult.success || !thermostatsResult.data) {
    return { success: false, error: thermostatsResult.error };
  }

  const thermostats = thermostatsResult.data;
  if (thermostats.length === 0) {
    return { success: false, error: 'No thermostats found.' };
  }

  const thermostat = thermostatId
    ? thermostats.find(
        (t) =>
          t.identifier === thermostatId || t.name.toLowerCase().includes(thermostatId.toLowerCase())
      )
    : thermostats[0];

  if (!thermostat) {
    return { success: false, error: `Couldn't find thermostat "${thermostatId}".` };
  }

  const holdParams: Record<string, unknown> = {
    holdType,
    holdClimateRef: climateRef,
  };

  if (holdHours && holdType === 'holdHours') {
    holdParams.holdHours = holdHours;
  }

  const requestBody = {
    selection: {
      selectionType: 'thermostats',
      selectionMatch: thermostat.identifier,
    },
    functions: [
      {
        type: 'setHold',
        params: holdParams,
      },
    ],
  };

  log.info({ userId, thermostatId: thermostat.identifier, climate }, 'Setting climate mode');

  const result = await ecobeeRequest<void>(userId, 'POST', '/thermostat', requestBody);

  if (!result.success) {
    return result;
  }

  return { success: true };
}

/**
 * Resume the regular schedule (cancel any holds)
 */
export async function resumeSchedule(
  userId: string,
  thermostatId?: string
): Promise<EcobeeResult<void>> {
  const thermostatsResult = await getThermostats(userId);
  if (!thermostatsResult.success || !thermostatsResult.data) {
    return { success: false, error: thermostatsResult.error };
  }

  const thermostats = thermostatsResult.data;
  if (thermostats.length === 0) {
    return { success: false, error: 'No thermostats found.' };
  }

  const thermostat = thermostatId
    ? thermostats.find(
        (t) =>
          t.identifier === thermostatId || t.name.toLowerCase().includes(thermostatId.toLowerCase())
      )
    : thermostats[0];

  if (!thermostat) {
    return { success: false, error: `Couldn't find thermostat "${thermostatId}".` };
  }

  const requestBody = {
    selection: {
      selectionType: 'thermostats',
      selectionMatch: thermostat.identifier,
    },
    functions: [
      {
        type: 'resumeProgram',
        params: {
          resumeAll: true,
        },
      },
    ],
  };

  log.info({ userId, thermostatId: thermostat.identifier }, 'Resuming schedule');

  const result = await ecobeeRequest<void>(userId, 'POST', '/thermostat', requestBody);

  if (!result.success) {
    return result;
  }

  return { success: true };
}

/**
 * Set HVAC mode (heat, cool, auto, off)
 */
export async function setHvacMode(
  userId: string,
  mode: 'heat' | 'cool' | 'auto' | 'off',
  thermostatId?: string
): Promise<EcobeeResult<void>> {
  const thermostatsResult = await getThermostats(userId);
  if (!thermostatsResult.success || !thermostatsResult.data) {
    return { success: false, error: thermostatsResult.error };
  }

  const thermostats = thermostatsResult.data;
  if (thermostats.length === 0) {
    return { success: false, error: 'No thermostats found.' };
  }

  const thermostat = thermostatId
    ? thermostats.find(
        (t) =>
          t.identifier === thermostatId || t.name.toLowerCase().includes(thermostatId.toLowerCase())
      )
    : thermostats[0];

  if (!thermostat) {
    return { success: false, error: `Couldn't find thermostat "${thermostatId}".` };
  }

  const requestBody = {
    selection: {
      selectionType: 'thermostats',
      selectionMatch: thermostat.identifier,
    },
    thermostat: {
      settings: {
        hvacMode: mode,
      },
    },
  };

  log.info({ userId, thermostatId: thermostat.identifier, mode }, 'Setting HVAC mode');

  const result = await ecobeeRequest<void>(userId, 'POST', '/thermostat', requestBody);

  if (!result.success) {
    return result;
  }

  return { success: true };
}

/**
 * Get sensor readings (all remote sensors)
 */
export async function getSensorReadings(
  userId: string,
  thermostatId?: string
): Promise<EcobeeResult<SensorReading[]>> {
  const thermostatsResult = await getThermostats(userId);
  if (!thermostatsResult.success || !thermostatsResult.data) {
    return { success: false, error: thermostatsResult.error };
  }

  const thermostats = thermostatsResult.data;
  if (thermostats.length === 0) {
    return { success: false, error: 'No thermostats found.' };
  }

  // Get sensors from specific thermostat or all thermostats
  const readings: SensorReading[] = [];

  const targetThermostats = thermostatId
    ? thermostats.filter(
        (t) =>
          t.identifier === thermostatId || t.name.toLowerCase().includes(thermostatId.toLowerCase())
      )
    : thermostats;

  for (const thermostat of targetThermostats) {
    const sensors = thermostat.remoteSensors || [];

    for (const sensor of sensors) {
      if (!sensor.inUse) continue;

      const reading: SensorReading = {
        name: sensor.name,
        temperature: 0,
      };

      for (const cap of sensor.capability) {
        if (cap.type === 'temperature' && cap.value !== 'unknown') {
          reading.temperature = fromEcobeeTemp(parseInt(cap.value, 10));
        } else if (cap.type === 'humidity' && cap.value !== 'unknown') {
          reading.humidity = parseInt(cap.value, 10);
        } else if (cap.type === 'occupancy') {
          reading.occupied = cap.value === 'true';
        }
      }

      readings.push(reading);
    }
  }

  return { success: true, data: readings };
}

/**
 * Get sensor reading by name
 */
export async function getSensorByName(
  userId: string,
  sensorName: string
): Promise<EcobeeResult<SensorReading>> {
  const result = await getSensorReadings(userId);
  if (!result.success || !result.data) {
    return { success: false, error: result.error };
  }

  const sensor = result.data.find((s) => s.name.toLowerCase().includes(sensorName.toLowerCase()));

  if (!sensor) {
    const availableSensors = result.data.map((s) => s.name).join(', ');
    return {
      success: false,
      error: `Couldn't find sensor "${sensorName}". Available sensors: ${availableSensors || 'none'}`,
    };
  }

  return { success: true, data: sensor };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getThermostats,
  getThermostatStatus,
  setTemperature,
  setClimateMode,
  resumeSchedule,
  setHvacMode,
  getSensorReadings,
  getSensorByName,
};
