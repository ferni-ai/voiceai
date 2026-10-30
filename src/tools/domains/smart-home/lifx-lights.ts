/**
 * LIFX lights over the LIFX HTTP API, with a user's own saved token
 * (moved out of smart-home.ts, which may not grow). The caller-bound light tools
 * (caller-lifx-tools.ts) use only these, never the multi-platform aggregator.
 *
 * @module tools/domains/smart-home/lifx-lights
 */

import { getLogger } from '../../../utils/safe-logger.js';
import { getLifxClient } from '../../../services/self-healing/index.js';
import type { SmartHomeCredentials } from '../../../services/smart-home/user-credentials.js';
import type { SmartDevice } from './smart-home.js';

/** Only the LIFX credential: nothing here can read another platform's. */
type LifxSource = Pick<SmartHomeCredentials, 'lifx'>;

// Type for LIFX lights response
interface LifxLight {
  id?: string;
  label?: string;
  power?: string;
  brightness?: number;
  location?: { name: string };
  group?: { name: string };
}

export async function getLifxLights(credentials: LifxSource): Promise<SmartDevice[]> {
  const lifxConfig = credentials.lifx;
  if (!lifxConfig) {
    return [];
  }

  const lifxClient = getLifxClient();

  // Check circuit health
  if (!lifxClient.isHealthy()) {
    getLogger().debug('LIFX circuit is open, skipping request');
    return [];
  }

  const { data: lights, error } = await lifxClient.get<LifxLight[]>(
    'https://api.lifx.com/v1/lights/all',
    { headers: { Authorization: `Bearer ${lifxConfig.token}` } }
  );

  if (error || !lights) {
    if (error) {
      getLogger().warn({ error: error.message }, 'LIFX API error');
    }
    return [];
  }

  return lights.map((light) => ({
    id: `lifx_${light.id}`,
    name: light.label || 'LIFX Light',
    type: 'light' as const,
    state: light.power || 'off',
    attributes: { brightness: Math.round((light.brightness || 0) * 100) },
    platform: 'lifx' as const,
    room: light.group?.name || light.location?.name,
  }));
}

export async function setLifxLight(
  credentials: LifxSource,
  lightId: string,
  power?: 'on' | 'off',
  brightness?: number,
  colorTemp?: number
): Promise<boolean> {
  const lifxConfig = credentials.lifx;
  if (!lifxConfig) {
    return false;
  }

  const lifxClient = getLifxClient();

  if (!lifxClient.isHealthy()) {
    getLogger().debug('LIFX circuit is open, cannot control light');
    return false;
  }

  const id = lightId.replace('lifx_', '');
  const body: Record<string, unknown> = {};
  if (power) body.power = power;
  if (brightness !== undefined) body.brightness = brightness / 100;
  if (colorTemp !== undefined) body.color = `kelvin:${colorTemp}`;

  const { error } = await lifxClient.put(`https://api.lifx.com/v1/lights/${id}/state`, body, {
    headers: { Authorization: `Bearer ${lifxConfig.token}` },
  });

  if (error) {
    getLogger().warn({ error: error.message, lightId }, 'LIFX light control failed');
    return false;
  }

  return true;
}
