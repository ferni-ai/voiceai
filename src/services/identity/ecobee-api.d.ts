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
import type { EcobeeThermostat, EcobeeResult, ThermostatStatus, SensorReading, SetHoldParams, SetClimateParams } from './ecobee-types.js';
/**
 * Get all thermostats for user
 */
export declare function getThermostats(userId: string): Promise<EcobeeResult<EcobeeThermostat[]>>;
/**
 * Get thermostat status (formatted for voice response)
 */
export declare function getThermostatStatus(userId: string, thermostatId?: string): Promise<EcobeeResult<ThermostatStatus>>;
/**
 * Set temperature hold
 */
export declare function setTemperature(userId: string, params: SetHoldParams): Promise<EcobeeResult<void>>;
/**
 * Set climate mode (home, away, sleep)
 */
export declare function setClimateMode(userId: string, params: SetClimateParams): Promise<EcobeeResult<void>>;
/**
 * Resume the regular schedule (cancel any holds)
 */
export declare function resumeSchedule(userId: string, thermostatId?: string): Promise<EcobeeResult<void>>;
/**
 * Set HVAC mode (heat, cool, auto, off)
 */
export declare function setHvacMode(userId: string, mode: 'heat' | 'cool' | 'auto' | 'off', thermostatId?: string): Promise<EcobeeResult<void>>;
/**
 * Get sensor readings (all remote sensors)
 */
export declare function getSensorReadings(userId: string, thermostatId?: string): Promise<EcobeeResult<SensorReading[]>>;
/**
 * Get sensor reading by name
 */
export declare function getSensorByName(userId: string, sensorName: string): Promise<EcobeeResult<SensorReading>>;
declare const _default: {
    getThermostats: typeof getThermostats;
    getThermostatStatus: typeof getThermostatStatus;
    setTemperature: typeof setTemperature;
    setClimateMode: typeof setClimateMode;
    resumeSchedule: typeof resumeSchedule;
    setHvacMode: typeof setHvacMode;
    getSensorReadings: typeof getSensorReadings;
    getSensorByName: typeof getSensorByName;
};
export default _default;
//# sourceMappingURL=ecobee-api.d.ts.map