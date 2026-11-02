/**
 * Unified Smart Home Service
 *
 * The one entry point workflow actions (life automations, action-executor) use to
 * control lights and thermostats. No backend serves these actions today: the only
 * one was the HomeKit server bridge, removed because Apple's licence keeps HomeKit
 * data on the device (ADPLA §3.3 I). A vendor cloud (LIFX, Sonos) plugs in here.
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

/** Control lights in a zone */
export async function controlLights(
  userId: string,
  options: LightControlOptions
): Promise<SmartHomeResult> {
  log.debug(
    { userId, zone: options.zone, state: options.state },
    'No smart home system configured'
  );
  return { success: false, error: 'No smart home system configured' };
}

// ============================================================================
// THERMOSTAT CONTROL
// ============================================================================

/** Set thermostat temperature and mode */
export async function setThermostat(
  userId: string,
  options: ThermostatOptions
): Promise<SmartHomeResult> {
  log.debug({ userId, temperature: options.temperature }, 'No thermostat configured');
  return { success: false, error: 'No thermostat configured' };
}
