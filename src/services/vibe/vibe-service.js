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
import { createLogger } from '../../utils/safe-logger.js';
import { getAllDevices, setLightsForVibe, playVibeMusic, } from '../../tools/domains/smart-home/smart-home.js';
import { getThermostatStatus, setTemperature, setClimateMode } from '../identity/ecobee-api.js';
import { isEcobeeConfigured } from '../identity/ecobee-auth.js';
import { getUserSmartHomeCredentials } from '../smart-home/user-credentials.js';
import * as sonosService from '../smart-home/sonos.js';
import * as homekitBridge from '../smart-home/homekit-bridge.js';
const log = createLogger({ module: 'vibe-service' });
// ============================================================================
// PRESET DEFINITIONS
// ============================================================================
export const VIBE_PRESETS = {
    // Primary vibes (shown in main grid)
    focus: {
        id: 'focus',
        name: 'Focus',
        description: 'Deep work mode. Calm music, bright lights, cool temp.',
        music: { genre: 'ambient', energy: 'low', volume: 30 },
        lights: { brightness: 80, colorTemp: 5000 },
        temperature: { target: 68, mode: 'home' },
    },
    relax: {
        id: 'relax',
        name: 'Relax',
        description: 'Wind down. Soft jazz, warm dim lights, cozy temp.',
        music: { genre: 'jazz', energy: 'low', volume: 40 },
        lights: { brightness: 40, colorTemp: 2700 },
        temperature: { target: 72, mode: 'home' },
    },
    energize: {
        id: 'energize',
        name: 'Energize',
        description: 'Get moving. Upbeat music, bright cool lights.',
        music: { genre: 'pop', energy: 'high', volume: 60 },
        lights: { brightness: 100, colorTemp: 6500 },
        temperature: { target: 66, mode: 'home' },
    },
    sleep: {
        id: 'sleep',
        name: 'Sleep',
        description: 'Time for rest. Quiet, dark, comfortable.',
        music: { genre: 'sleep', energy: 'low', volume: 15 },
        lights: { brightness: 5, colorTemp: 2200 },
        temperature: { target: 67, mode: 'sleep' },
    },
    social: {
        id: 'social',
        name: 'Gather',
        description: 'Having people over. Good music, warm inviting lights.',
        music: { genre: 'indie', energy: 'medium', volume: 50 },
        lights: { brightness: 70, colorTemp: 3000 },
        temperature: { target: 70, mode: 'home' },
    },
    // Activity vibes
    morning: {
        id: 'morning',
        name: 'Morning',
        description: 'Start the day gently. Bright lights, comfortable temp.',
        music: { genre: 'acoustic', energy: 'medium', volume: 35 },
        lights: { brightness: 90, colorTemp: 4500 },
        temperature: { target: 70, mode: 'home' },
    },
    romantic: {
        id: 'romantic',
        name: 'Romantic',
        description: 'Date night. Soft music, dim warm lights.',
        music: { genre: 'soul', energy: 'low', volume: 35 },
        lights: { brightness: 25, colorTemp: 2400 },
        temperature: { target: 72, mode: 'home' },
    },
    workout: {
        id: 'workout',
        name: 'Workout',
        description: 'Exercise time. High energy music, bright lights, cool.',
        music: { genre: 'electronic', energy: 'high', volume: 70 },
        lights: { brightness: 100, colorTemp: 6000 },
        temperature: { target: 64, mode: 'home' },
    },
    movie: {
        id: 'movie',
        name: 'Movie Night',
        description: 'Cinema at home. Dim lights, immersive sound.',
        music: { genre: 'cinematic', energy: 'low', volume: 20 },
        lights: { brightness: 10, colorTemp: 2400 },
        temperature: { target: 71, mode: 'home' },
    },
    cooking: {
        id: 'cooking',
        name: 'Cooking',
        description: 'Kitchen time. Upbeat tunes, bright task lighting.',
        music: { genre: 'world', energy: 'medium', volume: 45 },
        lights: { brightness: 100, colorTemp: 4000 },
        temperature: { target: 68, mode: 'home' },
    },
    reading: {
        id: 'reading',
        name: 'Reading',
        description: 'Book time. Soft background, warm reading light.',
        music: { genre: 'classical', energy: 'low', volume: 20 },
        lights: { brightness: 60, colorTemp: 3000 },
        temperature: { target: 71, mode: 'home' },
    },
    creative: {
        id: 'creative',
        name: 'Creative',
        description: 'Art and projects. Inspiring music, natural light feel.',
        music: { genre: 'lo-fi', energy: 'medium', volume: 35 },
        lights: { brightness: 85, colorTemp: 5500 },
        temperature: { target: 69, mode: 'home' },
    },
    meditation: {
        id: 'meditation',
        name: 'Meditation',
        description: 'Inner peace. Silence or nature sounds, soft ambient glow.',
        music: { genre: 'nature', energy: 'low', volume: 15 },
        lights: { brightness: 20, colorTemp: 2700 },
        temperature: { target: 72, mode: 'home' },
    },
    gaming: {
        id: 'gaming',
        name: 'Gaming',
        description: 'Game on. Dynamic lighting, comfortable temp.',
        music: { genre: 'electronic', energy: 'medium', volume: 40 },
        // Fixed: Using brand-compliant teal (#3a6b73 - Peter's color) instead of purple (#7c3aed)
        lights: { brightness: 30, colorTemp: 4500, color: '#3a6b73' },
        temperature: { target: 68, mode: 'home' },
    },
    dinner: {
        id: 'dinner',
        name: 'Dinner',
        description: 'Mealtime ambiance. Warm glow, pleasant background.',
        music: { genre: 'jazz', energy: 'low', volume: 30 },
        lights: { brightness: 50, colorTemp: 2800 },
        temperature: { target: 71, mode: 'home' },
    },
};
// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================
/**
 * Get the current state of all vibe components
 */
export async function getVibeState(userId) {
    const state = {
        activePreset: null,
        music: {
            connected: false,
            playing: false,
            volume: 50,
        },
        lights: {
            connected: false,
            brightness: 50,
            colorTemp: 4000,
            devices: [],
        },
        temperature: {
            connected: false,
            current: 70,
            target: 70,
            mode: 'home',
        },
    };
    // Load user credentials
    const credentials = await getUserSmartHomeCredentials(userId);
    // Check Sonos (music)
    if (credentials.sonos) {
        try {
            const connectionTest = await sonosService.testConnection(credentials.sonos);
            state.music.connected = connectionTest.connected;
            if (connectionTest.connected) {
                // Try to get current playback
                const households = await sonosService.getHouseholds(credentials.sonos);
                if (households.length > 0) {
                    const groups = await sonosService.getGroups(credentials.sonos, households[0].id);
                    if (groups.length > 0) {
                        state.music.playing = groups[0].playbackState === 'playing';
                        state.music.volume = groups[0].volume;
                        const track = await sonosService.getCurrentTrack(credentials.sonos, groups[0].id);
                        if (track) {
                            state.music.track = track.name;
                            state.music.artist = track.artist;
                        }
                    }
                }
            }
        }
        catch (error) {
            log.debug({ error: String(error) }, 'Failed to get Sonos status');
        }
    }
    // Check lights (Hue, LIFX, HomeKit) - pass userId for credentials
    try {
        const devices = await getAllDevices(userId);
        const lights = devices.filter((d) => d.type === 'light');
        state.lights.connected = lights.length > 0;
        state.lights.devices = lights.map((l) => ({
            name: l.name,
            state: l.state,
        }));
        // Calculate average brightness if we have lights
        if (lights.length > 0) {
            const brightnessValues = lights
                .map((l) => l.attributes?.brightness)
                .filter((b) => typeof b === 'number');
            if (brightnessValues.length > 0) {
                state.lights.brightness = Math.round(brightnessValues.reduce((a, b) => a + b, 0) / brightnessValues.length);
            }
        }
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Failed to get light devices');
    }
    // Check thermostat (Ecobee)
    try {
        const configured = await isEcobeeConfigured(userId);
        state.temperature.connected = configured;
        if (configured) {
            const thermoResult = await getThermostatStatus(userId);
            if (thermoResult.success && thermoResult.data) {
                state.temperature.current = thermoResult.data.currentTemp;
                state.temperature.target =
                    thermoResult.data.targetHeat || thermoResult.data.targetCool || 70;
                state.temperature.mode = thermoResult.data.mode || 'home';
                state.temperature.humidity = thermoResult.data.humidity;
            }
        }
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Failed to get thermostat status');
    }
    return state;
}
/**
 * Activate a vibe preset
 */
export async function activateVibe(userId, presetId) {
    const preset = VIBE_PRESETS[presetId];
    if (!preset) {
        return {
            success: false,
            preset: presetId,
            applied: { music: false, lights: false, temperature: false },
            errors: [`Unknown preset: ${presetId}`],
            message: `I don't know a vibe called "${presetId}".`,
        };
    }
    log.info({ userId, preset: presetId }, 'Activating vibe preset');
    const result = {
        success: true,
        preset: presetId,
        applied: { music: false, lights: false, temperature: false },
        errors: [],
        message: '',
    };
    // Load user credentials
    const credentials = await getUserSmartHomeCredentials(userId);
    // Apply music settings via Sonos
    if (preset.music) {
        try {
            if (credentials.sonos) {
                // Set volume first
                if (preset.music.volume !== undefined) {
                    await sonosService.setAllGroupsVolume(credentials.sonos, preset.music.volume);
                }
                // Try to play matching music from favorites
                const musicResult = await playVibeMusic(userId, presetId, preset.music.volume);
                result.applied.music = musicResult.success;
                if (!musicResult.success) {
                    log.info({ preset: presetId, music: preset.music }, 'Music vibe set (no matching playlist)');
                }
                else {
                    log.info({ preset: presetId, music: preset.music }, 'Playing vibe music on Sonos');
                }
            }
            else {
                // No Sonos connected, just mark as "set" (frontend can handle)
                result.applied.music = true;
                log.info({ preset: presetId, music: preset.music }, 'Music vibe set (no Sonos)');
            }
        }
        catch (error) {
            result.errors.push(`Music: ${String(error)}`);
            log.warn({ error: String(error) }, 'Failed to set music vibe');
        }
    }
    // Apply light settings via all platforms (pass userId)
    if (preset.lights) {
        try {
            // Use the new setLightsForVibe which handles all platforms
            const lightResult = await setLightsForVibe(userId, preset.lights.brightness, preset.lights.colorTemp);
            if (lightResult.success) {
                result.applied.lights = true;
                log.info({ preset: presetId, lightCount: lightResult.devices.length }, 'Lights set for vibe');
            }
            // Also try HomeKit scenes if available
            if (credentials.homeKit?.enabled) {
                const sceneActivated = await homekitBridge.activateMatchingScene(userId, presetId);
                if (sceneActivated) {
                    result.applied.lights = true;
                    log.info({ preset: presetId }, 'Activated HomeKit scene');
                }
            }
        }
        catch (error) {
            result.errors.push(`Lights: ${String(error)}`);
            log.warn({ error: String(error) }, 'Failed to set lights');
        }
    }
    // Apply temperature settings
    if (preset.temperature) {
        try {
            const configured = await isEcobeeConfigured(userId);
            if (configured) {
                // Set temperature
                const tempResult = await setTemperature(userId, {
                    heatHoldTemp: preset.temperature.target,
                    coolHoldTemp: preset.temperature.target + 3,
                    holdType: 'nextTransition',
                });
                // Set climate mode
                if (tempResult.success && preset.temperature.mode !== 'home') {
                    await setClimateMode(userId, {
                        climate: preset.temperature.mode,
                        holdType: 'nextTransition',
                    });
                }
                result.applied.temperature = tempResult.success;
                if (!tempResult.success) {
                    result.errors.push(`Temperature: ${tempResult.error}`);
                }
            }
            // Also try HomeKit thermostats if configured
            if (credentials.homeKit?.enabled) {
                await homekitBridge.activateHomeKitVibe(userId, presetId, {
                    temperature: preset.temperature.target,
                    brightness: preset.lights?.brightness,
                    colorTemperature: preset.lights?.colorTemp,
                });
                // Don't override Ecobee result, just supplement
            }
        }
        catch (error) {
            result.errors.push(`Temperature: ${String(error)}`);
            log.warn({ error: String(error) }, 'Failed to set temperature');
        }
    }
    // Build success message
    const appliedParts = [];
    if (result.applied.music)
        appliedParts.push('music');
    if (result.applied.lights)
        appliedParts.push('lights');
    if (result.applied.temperature)
        appliedParts.push('temperature');
    if (appliedParts.length > 0) {
        result.message = `${preset.name} vibe set! Adjusted ${appliedParts.join(', ')}.`;
    }
    else if (result.errors.length > 0) {
        result.success = false;
        result.message = `Couldn't set the ${preset.name} vibe. ${result.errors[0]}`;
    }
    else {
        result.message = `${preset.name} vibe ready! Connect your devices in Settings → Your Home to activate.`;
    }
    return result;
}
/**
 * Set just the lights (brightness and/or color temperature)
 */
export async function setLights(userId, brightness, colorTemp) {
    try {
        const lightResult = await setLightsForVibe(userId, brightness ?? 50, colorTemp);
        if (!lightResult.success) {
            return { success: false, message: 'No lights connected' };
        }
        return {
            success: true,
            message: `Lights set to ${brightness ?? 'unchanged'}% brightness`,
        };
    }
    catch (error) {
        log.warn({ error: String(error) }, 'Failed to set lights');
        return { success: false, message: String(error) };
    }
}
/**
 * Control music playback
 */
export async function controlMusic(userId, action, value) {
    const credentials = await getUserSmartHomeCredentials(userId);
    if (!credentials.sonos) {
        return {
            success: false,
            message: 'Sonos not connected. Go to Settings → Your Home to connect.',
        };
    }
    try {
        const households = await sonosService.getHouseholds(credentials.sonos);
        if (households.length === 0) {
            return { success: false, message: 'No Sonos households found' };
        }
        const groups = await sonosService.getGroups(credentials.sonos, households[0].id);
        if (groups.length === 0) {
            return { success: false, message: 'No Sonos groups found' };
        }
        const groupId = groups[0].id;
        switch (action) {
            case 'play':
                await sonosService.setPlaybackState(credentials.sonos, groupId, 'play');
                return { success: true, message: 'Playing' };
            case 'pause':
                await sonosService.setPlaybackState(credentials.sonos, groupId, 'pause');
                return { success: true, message: 'Paused' };
            case 'volume':
                if (value !== undefined) {
                    await sonosService.setGroupVolume(credentials.sonos, groupId, value);
                    return { success: true, message: `Volume set to ${value}%` };
                }
                return { success: false, message: 'Volume value required' };
            case 'skip':
                await sonosService.skipToNext(credentials.sonos, groupId);
                return { success: true, message: 'Skipped to next track' };
            default:
                return { success: false, message: `Unknown action: ${action}` };
        }
    }
    catch (error) {
        log.warn({ error: String(error), action }, 'Failed to control music');
        return { success: false, message: String(error) };
    }
}
/**
 * Get available vibe presets
 */
export function getAvailablePresets() {
    return Object.values(VIBE_PRESETS);
}
/**
 * Get a specific preset by ID
 */
export function getPreset(presetId) {
    return VIBE_PRESETS[presetId];
}
/**
 * Get configured integrations summary for UI
 */
export async function getConfiguredIntegrations(userId) {
    const credentials = await getUserSmartHomeCredentials(userId);
    const ecobeeConfigured = await isEcobeeConfigured(userId);
    return {
        sonos: !!credentials.sonos,
        hue: !!credentials.hue,
        lifx: !!credentials.lifx,
        homeKit: !!credentials.homeKit?.enabled,
        ecobee: ecobeeConfigured,
    };
}
//# sourceMappingURL=vibe-service.js.map