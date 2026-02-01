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

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'unified-smart-home' });

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// LIGHT CONTROL
// ============================================================================

/**
 * Control lights in a zone
 *
 * Attempts to use Home Assistant first, then falls back to HomeKit.
 */
export async function controlLights(
  userId: string,
  options: LightControlOptions
): Promise<SmartHomeResult> {
  const { zone, state, brightness } = options;

  log.debug({ userId, zone, state, brightness }, '💡 Controlling lights');

  try {
    // Try Home Assistant first
    const ha = await import('./home-assistant.js');
    if (ha.isHomeAssistantConfigured()) {
      // Find light entity by zone/room name
      const entities = await ha.findEntitiesByName(zone, 'light');
      if (entities.length > 0) {
        const entityId = entities[0]?.entity_id;
        if (entityId) {
          if (state === 'off') {
            await ha.turnOffLight(entityId);
          } else {
            await ha.turnOnLight(entityId, brightness || (state === 'dim' ? 50 : undefined));
          }
          log.info({ userId, zone, state, via: 'home_assistant' }, '💡 Lights controlled');
          return { success: true, data: { entityId } };
        }
      }
    }

    // Try HomeKit
    const hk = await import('./homekit-bridge.js');
    if (await hk.isHomeKitConnected(userId)) {
      const devices = await hk.getDevicesByRoom(userId, zone);
      const lights = devices.filter((d) => d.type === 'light');
      if (lights.length > 0) {
        for (const light of lights) {
          await hk.queueDeviceCommand(userId, light.id, {
            on: state !== 'off',
            brightness: state === 'dim' ? brightness || 50 : brightness,
          });
        }
        log.info({ userId, zone, state, via: 'homekit' }, '💡 Lights controlled');
        return { success: true, data: { deviceCount: lights.length } };
      }
    }

    // No smart home configured
    log.debug({ userId }, 'No smart home system configured');
    return { success: false, error: 'No smart home system configured' };
  } catch (error) {
    log.error({ userId, zone, error: String(error) }, 'Failed to control lights');
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// THERMOSTAT CONTROL
// ============================================================================

/**
 * Set thermostat temperature and mode
 */
export async function setThermostat(
  userId: string,
  options: ThermostatOptions
): Promise<SmartHomeResult> {
  const { temperature, mode } = options;

  log.debug({ userId, temperature, mode }, '🌡️ Setting thermostat');

  try {
    // Try Home Assistant first
    const ha = await import('./home-assistant.js');
    if (ha.isHomeAssistantConfigured()) {
      // Find thermostat entities
      const entities = await ha.findEntitiesByName('thermostat', 'climate');
      if (entities.length > 0) {
        const entityId = entities[0]?.entity_id;
        if (entityId) {
          // Map 'auto' to 'heat_cool' for Home Assistant
          const haMode = mode === 'auto' ? 'heat_cool' : mode;
          await ha.setThermostat(entityId, temperature, haMode || 'heat_cool');
          log.info({ userId, temperature, mode, via: 'home_assistant' }, '🌡️ Thermostat set');
          return { success: true, data: { entityId, temperature } };
        }
      }
    }

    // Try HomeKit
    const hk = await import('./homekit-bridge.js');
    if (await hk.isHomeKitConnected(userId)) {
      const devices = await hk.getDevicesByType(userId, 'thermostat');
      if (devices.length > 0) {
        for (const device of devices) {
          await hk.queueDeviceCommand(userId, device.id, {
            targetTemperature: temperature,
            // HomeKit doesn't support mode in device state, it's set separately
          });
        }
        log.info({ userId, temperature, mode, via: 'homekit' }, '🌡️ Thermostat set');
        return { success: true, data: { deviceCount: devices.length, temperature } };
      }
    }

    // No smart home configured
    log.debug({ userId }, 'No thermostat configured');
    return { success: false, error: 'No thermostat configured' };
  } catch (error) {
    log.error({ userId, temperature, error: String(error) }, 'Failed to set thermostat');
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// SCENE CONTROL
// ============================================================================

/**
 * Activate a smart home scene (e.g., "Movie Night", "Good Morning")
 */
export async function activateScene(userId: string, sceneName: string): Promise<SmartHomeResult> {
  log.debug({ userId, sceneName }, '🎬 Activating scene');

  try {
    // Try Home Assistant first
    const ha = await import('./home-assistant.js');
    if (ha.isHomeAssistantConfigured()) {
      // Find scene by name
      const entities = await ha.findEntitiesByName(sceneName, 'scene');
      if (entities.length > 0) {
        const entityId = entities[0]?.entity_id;
        if (entityId) {
          await ha.activateScene(entityId);
          log.info({ userId, sceneName, via: 'home_assistant' }, '🎬 Scene activated');
          return { success: true, data: { entityId } };
        }
      }
    }

    // Try HomeKit
    const hk = await import('./homekit-bridge.js');
    if (await hk.isHomeKitConnected(userId)) {
      // Find matching scene
      const scenes = await hk.getScenes(userId);
      const match = scenes.find(
        (s) =>
          s.name.toLowerCase().includes(sceneName.toLowerCase()) ||
          sceneName.toLowerCase().includes(s.name.toLowerCase())
      );
      if (match) {
        await hk.queueSceneCommand(userId, match.id);
        log.info({ userId, sceneName, via: 'homekit' }, '🎬 Scene activated');
        return { success: true, data: { sceneId: match.id } };
      }
    }

    return { success: false, error: 'Scene not found' };
  } catch (error) {
    log.error({ userId, sceneName, error: String(error) }, 'Failed to activate scene');
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  controlLights,
  setThermostat,
  activateScene,
};
