/**
 * Unified Smart Home Service
 *
 * Provides a unified interface for smart home control across multiple backends:
 * - HomeKit (via homekit-bridge.ts)
 * - Home Assistant (via home-assistant.ts)
 * - Sonos (via sonos.ts)
 *
 * Used by workflow actions to control lights, thermostats, and other devices.
 *
 * @module services/smart-home/unified-smart-home
 */
export interface SmartHomeResult {
    success: boolean;
    error?: string;
    data?: unknown;
}
export interface LightControlOptions {
    zone: string;
    state: 'on' | 'off' | 'dim';
    brightness?: number;
    color?: string;
}
export interface ThermostatOptions {
    temperature: number;
    mode?: 'heat' | 'cool' | 'auto';
}
/**
 * Control lights in a zone
 *
 * Attempts to use Home Assistant first, then falls back to HomeKit.
 */
export declare function controlLights(userId: string, options: LightControlOptions): Promise<SmartHomeResult>;
/**
 * Set thermostat temperature and mode
 */
export declare function setThermostat(userId: string, options: ThermostatOptions): Promise<SmartHomeResult>;
/**
 * Activate a smart home scene (e.g., "Movie Night", "Good Morning")
 */
export declare function activateScene(userId: string, sceneName: string): Promise<SmartHomeResult>;
declare const _default: {
    controlLights: typeof controlLights;
    setThermostat: typeof setThermostat;
    activateScene: typeof activateScene;
};
export default _default;
//# sourceMappingURL=unified-smart-home.d.ts.map