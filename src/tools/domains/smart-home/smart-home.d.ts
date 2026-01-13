/**
 * Smart Home Control Tools
 *
 * Control lights, thermostats, locks, and other smart home devices.
 *
 * Now with:
 * - **User credentials from Firestore** (per-user configuration)
 * - Circuit breakers prevent cascading failures to smart home platforms
 * - Automatic retry with exponential backoff
 * - Graceful degradation when devices are offline
 * - Sonos and HomeKit support
 *
 * Supported Platforms:
 * - Home Assistant (most flexible, self-hosted) - Optional
 * - Philips Hue (direct API for lights)
 * - LIFX (direct API for lights)
 * - Sonos (speakers)
 * - HomeKit (via iOS bridge)
 * - Ecobee (thermostats)
 *
 * @module tools/smart-home
 */
import { llm } from '@livekit/agents';
import { type SmartHomeCredentials } from '../../../services/smart-home/user-credentials.js';
export interface SmartDevice {
    id: string;
    name: string;
    type: 'light' | 'switch' | 'thermostat' | 'lock' | 'sensor' | 'fan' | 'cover' | 'media' | 'speaker' | 'other';
    state: string;
    attributes?: Record<string, unknown>;
    platform: 'home_assistant' | 'hue' | 'smartthings' | 'lifx' | 'nest' | 'sonos' | 'homekit' | 'ecobee';
    room?: string;
}
export interface SmartHomeContext {
    userId: string;
    credentials?: SmartHomeCredentials;
}
export declare function getAllDevices(userId?: string): Promise<SmartDevice[]>;
export declare function controlDevice(deviceNameOrId: string, action: 'on' | 'off' | 'toggle' | 'set', value?: number | string, userId?: string): Promise<string>;
export declare function activateScene(sceneName: string, userId?: string): Promise<string>;
export interface VibeSettings {
    brightness?: number;
    colorTemperature?: number;
    temperature?: number;
    music?: boolean;
    volume?: number;
}
/**
 * Set lights for a vibe (called by vibe-service)
 */
export declare function setLightsForVibe(userId: string, brightness: number, colorTemperature?: number): Promise<{
    success: boolean;
    devices: string[];
}>;
/**
 * Play vibe music on Sonos
 */
export declare function playVibeMusic(userId: string, vibe: string, volume?: number): Promise<{
    success: boolean;
    message: string;
}>;
export declare function createSmartHomeTools(context?: SmartHomeContext): {
    controlLight: llm.FunctionTool<{
        room: string;
        action: "on" | "off" | "toggle";
        brightness?: number | undefined;
    }, unknown, string>;
    setThermostat: llm.FunctionTool<{
        temperature: number;
        mode?: "cool" | "auto" | "off" | "heat" | undefined;
    }, unknown, string>;
    controlLock: llm.FunctionTool<{
        lock: string;
        action: "status" | "lock" | "unlock";
    }, unknown, string>;
    controlSpeaker: llm.FunctionTool<{
        speaker: string;
        action: "play" | "volume" | "pause";
        volume?: number | undefined;
    }, unknown, string>;
    listDevices: llm.FunctionTool<{
        type: "all" | "thermostats" | "lights" | "locks" | "switches" | "speakers";
    }, unknown, string>;
    activateScene: llm.FunctionTool<{
        sceneName: string;
    }, unknown, string>;
};
export default createSmartHomeTools;
//# sourceMappingURL=smart-home.d.ts.map