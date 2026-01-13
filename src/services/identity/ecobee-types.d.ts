/**
 * Ecobee Types
 *
 * Type definitions for Ecobee thermostat integration.
 * Ecobee uses PIN-based OAuth which is simpler for voice-first devices.
 */
/**
 * Ecobee tokens stored in Firestore
 */
export interface EcobeeTokens {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    token_type: string;
    scope?: string;
}
/**
 * Response from Ecobee authorize endpoint
 */
export interface EcobeeAuthorizeResponse {
    ecobeePin: string;
    code: string;
    scope: string;
    expires_in: number;
    interval: number;
}
/**
 * Response from Ecobee token endpoint
 */
export interface EcobeeTokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    scope: string;
}
/**
 * Authorization state (for polling)
 */
export interface EcobeePendingAuth {
    code: string;
    pin: string;
    expiresAt: number;
    interval: number;
    userId: string;
}
/**
 * Ecobee thermostat object (simplified)
 */
export interface EcobeeThermostat {
    identifier: string;
    name: string;
    modelNumber: string;
    lastModified: string;
    runtime: EcobeeRuntime;
    settings: EcobeeSettings;
    remoteSensors?: EcobeeSensor[];
    events?: EcobeeEvent[];
}
/**
 * Current runtime state
 */
export interface EcobeeRuntime {
    lastStatusModified: string;
    actualTemperature: number;
    actualHumidity: number;
    desiredHeat: number;
    desiredCool: number;
    desiredFanMode: 'auto' | 'on';
}
/**
 * Thermostat settings
 */
export interface EcobeeSettings {
    hvacMode: 'auto' | 'auxHeatOnly' | 'cool' | 'heat' | 'off';
    lastServiceDate: string;
    serviceRemindMe: boolean;
    monthlyElectricityCost: number;
    coolStages: number;
    heatStages: number;
    hasHumidifier: boolean;
    hasDehumidifier: boolean;
    ventilatorType: string;
    heatCoolMinDelta: number;
    tempCorrection: number;
    holdAction: 'nextTransition' | 'indefinite' | 'askMe';
}
/**
 * Remote sensor data
 */
export interface EcobeeSensor {
    id: string;
    name: string;
    type: 'ecobee3_remote_sensor' | 'thermostat' | 'control_sensor';
    inUse: boolean;
    capability: Array<{
        id: string;
        type: 'temperature' | 'humidity' | 'occupancy';
        value: string;
    }>;
}
/**
 * Scheduled or running events (holds, vacations, etc.)
 */
export interface EcobeeEvent {
    type: string;
    name: string;
    running: boolean;
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    holdClimateRef?: string;
    heatHoldTemp?: number;
    coolHoldTemp?: number;
}
/**
 * Climate/comfort setting presets
 */
export interface EcobeeClimate {
    name: string;
    climateRef: string;
    isOccupied: boolean;
    coolTemp: number;
    heatTemp: number;
}
/**
 * Standard comfort settings
 */
export type ClimateMode = 'home' | 'away' | 'sleep';
export interface EcobeeResult<T> {
    success: boolean;
    data?: T;
    error?: string;
}
/**
 * Thermostat status for voice responses
 */
export interface ThermostatStatus {
    name: string;
    currentTemp: number;
    targetHeat: number;
    targetCool: number;
    humidity: number;
    mode: string;
    isRunning: boolean;
    currentEvent?: string;
}
/**
 * Sensor reading for voice responses
 */
export interface SensorReading {
    name: string;
    temperature: number;
    humidity?: number;
    occupied?: boolean;
}
/**
 * Selection object for API requests
 */
export interface EcobeeSelection {
    selectionType: 'registered' | 'thermostats';
    selectionMatch?: string;
    includeRuntime?: boolean;
    includeSettings?: boolean;
    includeSensors?: boolean;
    includeEvents?: boolean;
    includeProgram?: boolean;
    includeEquipmentStatus?: boolean;
}
/**
 * Set hold function params
 */
export interface SetHoldParams {
    thermostatId?: string;
    heatHoldTemp?: number;
    coolHoldTemp?: number;
    holdType?: 'nextTransition' | 'indefinite' | 'holdHours';
    holdHours?: number;
}
/**
 * Set climate function params
 */
export interface SetClimateParams {
    thermostatId?: string;
    climate: ClimateMode;
    holdType?: 'nextTransition' | 'indefinite' | 'holdHours';
    holdHours?: number;
}
//# sourceMappingURL=ecobee-types.d.ts.map