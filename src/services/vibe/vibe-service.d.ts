/**
 * Vibe Service
 *
 * Orchestrates environment control for a unified "vibe" experience:
 * - Music: Sonos, Spotify playback control
 * - Lights: Hue, LIFX, HomeKit integration
 * - Temperature: Ecobee thermostat control
 *
 * Philosophy: Users think in vibes ("I need to focus"), not devices.
 * This service translates human intent into coordinated device control.
 *
 * IMPORTANT: This service now uses per-user credentials from Firestore.
 * All methods require a userId parameter.
 */
export interface VibePreset {
    id: string;
    name: string;
    description: string;
    music?: {
        genre?: string;
        energy?: 'low' | 'medium' | 'high';
        playlist?: string;
        volume?: number;
    };
    lights?: {
        brightness: number;
        colorTemp: number;
        color?: string;
    };
    temperature?: {
        target: number;
        mode: 'home' | 'away' | 'sleep';
    };
}
export interface VibeState {
    activePreset: string | null;
    music: {
        connected: boolean;
        playing: boolean;
        track?: string;
        artist?: string;
        volume: number;
    };
    lights: {
        connected: boolean;
        brightness: number;
        colorTemp: number;
        devices: Array<{
            name: string;
            state: string;
        }>;
    };
    temperature: {
        connected: boolean;
        current: number;
        target: number;
        mode: string;
        humidity?: number;
    };
}
export interface VibeActivationResult {
    success: boolean;
    preset: string;
    applied: {
        music: boolean;
        lights: boolean;
        temperature: boolean;
    };
    errors: string[];
    message: string;
}
export declare const VIBE_PRESETS: Record<string, VibePreset>;
/**
 * Get the current state of all vibe components
 */
export declare function getVibeState(userId: string): Promise<VibeState>;
/**
 * Activate a vibe preset
 */
export declare function activateVibe(userId: string, presetId: string): Promise<VibeActivationResult>;
/**
 * Set just the lights (brightness and/or color temperature)
 */
export declare function setLights(userId: string, brightness?: number, colorTemp?: number): Promise<{
    success: boolean;
    message: string;
}>;
/**
 * Control music playback
 */
export declare function controlMusic(userId: string, action: 'play' | 'pause' | 'volume' | 'skip', value?: number): Promise<{
    success: boolean;
    message: string;
}>;
/**
 * Get available vibe presets
 */
export declare function getAvailablePresets(): VibePreset[];
/**
 * Get a specific preset by ID
 */
export declare function getPreset(presetId: string): VibePreset | undefined;
/**
 * Get configured integrations summary for UI
 */
export declare function getConfiguredIntegrations(userId: string): Promise<{
    sonos: boolean;
    hue: boolean;
    lifx: boolean;
    homeKit: boolean;
    ecobee: boolean;
}>;
//# sourceMappingURL=vibe-service.d.ts.map