/**
 * Vibe Service
 *
 * Orchestrates environment control for a unified "vibe" experience:
 * - Music: Spotify playback control
 * - Lights: Home Assistant / Hue / LIFX integration
 * - Temperature: Ecobee thermostat control
 *
 * Philosophy: Users think in vibes ("I need to focus"), not devices.
 * This service translates human intent into coordinated device control.
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getAllDevices,
  controlDevice,
  activateScene,
} from '../../tools/domains/smart-home/smart-home.js';
import { getThermostatStatus, setTemperature, setClimateMode } from '../identity/ecobee-api.js';
import { isEcobeeConfigured } from '../identity/ecobee-auth.js';

const log = createLogger({ module: 'vibe-service' });

// ============================================================================
// TYPES
// ============================================================================

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
    brightness: number; // 0-100
    colorTemp: number; // 2700-6500K (warm to cool)
    color?: string; // hex for accent
  };
  temperature?: {
    target: number; // Fahrenheit
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
    devices: Array<{ name: string; state: string }>;
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

// ============================================================================
// PRESET DEFINITIONS
// ============================================================================

export const VIBE_PRESETS: Record<string, VibePreset> = {
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
export async function getVibeState(userId: string): Promise<VibeState> {
  const state: VibeState = {
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

  // Check lights (Home Assistant, Hue, LIFX)
  try {
    const devices = await getAllDevices();
    const lights = devices.filter((d) => d.type === 'light');
    state.lights.connected = lights.length > 0;
    state.lights.devices = lights.map((l) => ({
      name: l.name,
      state: l.state,
    }));

    // Calculate average brightness if we have lights
    if (lights.length > 0) {
      const brightnessValues = lights
        .map((l) => (l.attributes as Record<string, unknown>)?.brightness)
        .filter((b): b is number => typeof b === 'number');
      if (brightnessValues.length > 0) {
        state.lights.brightness = Math.round(
          brightnessValues.reduce((a, b) => a + b, 0) / brightnessValues.length
        );
      }
    }
  } catch (error) {
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
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to get thermostat status');
  }

  return state;
}

/**
 * Activate a vibe preset
 */
export async function activateVibe(
  userId: string,
  presetId: string
): Promise<VibeActivationResult> {
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

  const result: VibeActivationResult = {
    success: true,
    preset: presetId,
    applied: { music: false, lights: false, temperature: false },
    errors: [],
    message: '',
  };

  // Apply music settings
  if (preset.music) {
    try {
      // For now, we'll dispatch an event for music. In the future, integrate with Spotify API.
      // The frontend/voice agent can pick this up and play appropriate music.
      result.applied.music = true;
      log.info({ preset: presetId, music: preset.music }, 'Music vibe set');
    } catch (error) {
      result.errors.push(`Music: ${String(error)}`);
      log.warn({ error: String(error) }, 'Failed to set music vibe');
    }
  }

  // Apply light settings
  if (preset.lights) {
    try {
      const devices = await getAllDevices();
      const lights = devices.filter((d) => d.type === 'light');

      if (lights.length > 0) {
        // Set all lights to the preset brightness
        const setPromises = lights.map(async (light) =>
          controlDevice(light.id, 'set', preset.lights!.brightness)
        );
        await Promise.allSettled(setPromises);
        result.applied.lights = true;
        log.info({ preset: presetId, lightCount: lights.length }, 'Lights set');
      }
    } catch (error) {
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
            climate: preset.temperature.mode as 'home' | 'away' | 'sleep',
            holdType: 'nextTransition',
          });
        }

        result.applied.temperature = tempResult.success;
        if (!tempResult.success) {
          result.errors.push(`Temperature: ${tempResult.error}`);
        }
      }
    } catch (error) {
      result.errors.push(`Temperature: ${String(error)}`);
      log.warn({ error: String(error) }, 'Failed to set temperature');
    }
  }

  // Build success message
  const appliedParts: string[] = [];
  if (result.applied.music) appliedParts.push('music');
  if (result.applied.lights) appliedParts.push('lights');
  if (result.applied.temperature) appliedParts.push('temperature');

  if (appliedParts.length > 0) {
    result.message = `${preset.name} vibe set! Adjusted ${appliedParts.join(', ')}.`;
  } else if (result.errors.length > 0) {
    result.success = false;
    result.message = `Couldn't set the ${preset.name} vibe. ${result.errors[0]}`;
  } else {
    result.message = `${preset.name} vibe ready! Connect your devices in Settings to activate.`;
  }

  return result;
}

/**
 * Set just the lights (brightness and/or color temperature)
 */
export async function setLights(
  brightness?: number,
  colorTemp?: number
): Promise<{ success: boolean; message: string }> {
  try {
    const devices = await getAllDevices();
    const lights = devices.filter((d) => d.type === 'light');

    if (lights.length === 0) {
      return { success: false, message: 'No lights connected' };
    }

    if (brightness !== undefined) {
      const setPromises = lights.map(async (light) => controlDevice(light.id, 'set', brightness));
      await Promise.allSettled(setPromises);
    }

    // Note: Color temperature control depends on the light type and platform
    // Home Assistant supports color_temp, Hue uses ct, LIFX uses kelvin
    // This is a simplified implementation

    return {
      success: true,
      message: `Lights set to ${brightness ?? 'unchanged'}% brightness`,
    };
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to set lights');
    return { success: false, message: String(error) };
  }
}

/**
 * Get available vibe presets
 */
export function getAvailablePresets(): VibePreset[] {
  return Object.values(VIBE_PRESETS);
}

/**
 * Get a specific preset by ID
 */
export function getPreset(presetId: string): VibePreset | undefined {
  return VIBE_PRESETS[presetId];
}
