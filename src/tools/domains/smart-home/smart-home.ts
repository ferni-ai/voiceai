/**
 * Smart Home Control Tools
 *
 * Control lights, thermostats, locks, and other smart home devices.
 *
 * Now with self-healing resilience:
 * - Circuit breakers prevent cascading failures to smart home platforms
 * - Automatic retry with exponential backoff
 * - Graceful degradation when devices are offline
 *
 * Supported Platforms:
 * - Home Assistant (most flexible, self-hosted)
 * - SmartThings (Samsung)
 * - Philips Hue (direct API for lights)
 * - Nest (Google, thermostats)
 * - LIFX (direct API for lights)
 *
 * @module tools/smart-home
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import {
  getHomeAssistantClient,
  getHueClient,
  getLifxClient,
} from '../../../services/self-healing/index.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Home Assistant (recommended - most flexible)
const HOME_ASSISTANT_URL = process.env.HOME_ASSISTANT_URL || ''; // e.g., http://homeassistant.local:8123
const HOME_ASSISTANT_TOKEN = process.env.HOME_ASSISTANT_TOKEN || '';

// Philips Hue (direct integration)
const HUE_BRIDGE_IP = process.env.HUE_BRIDGE_IP || '';
const HUE_USERNAME = process.env.HUE_USERNAME || '';

// SmartThings
const SMARTTHINGS_TOKEN = process.env.SMARTTHINGS_TOKEN || '';

// LIFX
const LIFX_TOKEN = process.env.LIFX_TOKEN || '';

// ============================================================================
// TYPES
// ============================================================================

interface SmartDevice {
  id: string;
  name: string;
  type: 'light' | 'switch' | 'thermostat' | 'lock' | 'sensor' | 'fan' | 'cover' | 'media' | 'other';
  state: string;
  attributes?: Record<string, unknown>;
  platform: 'home_assistant' | 'hue' | 'smartthings' | 'lifx' | 'nest';
}

interface DeviceCommand {
  deviceId: string;
  action: string;
  value?: unknown;
}

// ============================================================================
// HOME ASSISTANT API (with self-healing)
// ============================================================================

async function homeAssistantRequest<T = unknown>(
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown
): Promise<T | null> {
  if (!HOME_ASSISTANT_URL || !HOME_ASSISTANT_TOKEN) {
    throw new Error('Home Assistant not configured');
  }

  const haClient = getHomeAssistantClient();

  // Check circuit health - fail fast if Home Assistant is down
  if (!haClient.isHealthy()) {
    getLogger().debug('Home Assistant circuit is open, skipping request');
    return null;
  }

  const url = `${HOME_ASSISTANT_URL}/api/${endpoint}`;

  if (method === 'POST') {
    const { data, error } = await haClient.post<T>(url, body, {
      headers: { Authorization: `Bearer ${HOME_ASSISTANT_TOKEN}` },
    });

    if (error) {
      getLogger().warn({ endpoint, error: error.message }, 'Home Assistant request failed');
      return null;
    }
    return data;
  } else {
    const { data, error } = await haClient.get<T>(url, {
      headers: { Authorization: `Bearer ${HOME_ASSISTANT_TOKEN}` },
    });

    if (error) {
      getLogger().warn({ endpoint, error: error.message }, 'Home Assistant request failed');
      return null;
    }
    return data;
  }
}

// Type for Home Assistant states response
interface HomeAssistantState {
  entity_id?: string;
  attributes?: { friendly_name?: string; [key: string]: unknown };
  state?: string;
}

async function getHomeAssistantDevices(): Promise<SmartDevice[]> {
  const states = await homeAssistantRequest<HomeAssistantState[]>('states');

  if (!states) {
    return [];
  }

  return states
    .filter((s) => {
      const domain = s.entity_id?.split('.')[0];
      return ['light', 'switch', 'climate', 'lock', 'fan', 'cover', 'media_player'].includes(
        domain || ''
      );
    })
    .map((s) => {
      const domain = s.entity_id?.split('.')[0] || 'other';
      const typeMap: Record<string, SmartDevice['type']> = {
        light: 'light',
        switch: 'switch',
        climate: 'thermostat',
        lock: 'lock',
        fan: 'fan',
        cover: 'cover',
        media_player: 'media',
      };

      return {
        id: s.entity_id || '',
        name: s.attributes?.friendly_name || s.entity_id || 'Unknown',
        type: typeMap[domain] || 'other',
        state: s.state || 'unknown',
        attributes: s.attributes,
        platform: 'home_assistant' as const,
      };
    });
}

async function callHomeAssistantService(
  domain: string,
  service: string,
  entityId: string,
  data?: Record<string, unknown>
): Promise<boolean> {
  const result = await homeAssistantRequest(`services/${domain}/${service}`, 'POST', {
    entity_id: entityId,
    ...data,
  });

  return result !== null;
}

// ============================================================================
// PHILIPS HUE API (with self-healing)
// ============================================================================

// Type for Hue lights response
type HueLightsResponse = Record<
  string,
  {
    name?: string;
    state?: { on?: boolean; bri?: number };
  }
>;

async function getHueLights(): Promise<SmartDevice[]> {
  if (!HUE_BRIDGE_IP || !HUE_USERNAME) {
    return [];
  }

  const hueClient = getHueClient();

  // Check circuit health
  if (!hueClient.isHealthy()) {
    getLogger().debug('Hue circuit is open, skipping request');
    return [];
  }

  const url = `http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights`;
  const { data: lights, error } = await hueClient.get<HueLightsResponse>(url);

  if (error || !lights) {
    if (error) {
      getLogger().warn({ error: error.message }, 'Hue API error');
    }
    return [];
  }

  return Object.entries(lights).map(([id, light]) => ({
    id: `hue_${id}`,
    name: light.name || `Hue Light ${id}`,
    type: 'light' as const,
    state: light.state?.on ? 'on' : 'off',
    attributes: { brightness: light.state?.bri },
    platform: 'hue' as const,
  }));
}

async function setHueLight(lightId: string, on: boolean, brightness?: number): Promise<boolean> {
  if (!HUE_BRIDGE_IP || !HUE_USERNAME) {
    return false;
  }

  const hueClient = getHueClient();

  if (!hueClient.isHealthy()) {
    getLogger().debug('Hue circuit is open, cannot control light');
    return false;
  }

  const id = lightId.replace('hue_', '');
  const body: { on: boolean; bri?: number } = { on };
  if (brightness !== undefined) {
    body.bri = Math.round(brightness * 2.54); // Convert 0-100 to 0-254
  }

  const url = `http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights/${id}/state`;
  const { error } = await hueClient.put(url, body);

  if (error) {
    getLogger().warn({ error: error.message, lightId }, 'Hue light control failed');
    return false;
  }

  return true;
}

// ============================================================================
// LIFX API (with self-healing)
// ============================================================================

// Type for LIFX lights response
interface LifxLight {
  id?: string;
  label?: string;
  power?: string;
  brightness?: number;
}

async function getLifxLights(): Promise<SmartDevice[]> {
  if (!LIFX_TOKEN) {
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
    { headers: { Authorization: `Bearer ${LIFX_TOKEN}` } }
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
  }));
}

async function setLifxLight(
  lightId: string,
  power?: 'on' | 'off',
  brightness?: number
): Promise<boolean> {
  if (!LIFX_TOKEN) {
    return false;
  }

  const lifxClient = getLifxClient();

  if (!lifxClient.isHealthy()) {
    getLogger().debug('LIFX circuit is open, cannot control light');
    return false;
  }

  const id = lightId.replace('lifx_', '');
  const { error } = await lifxClient.put(
    `https://api.lifx.com/v1/lights/${id}/state`,
    {
      power,
      brightness: brightness !== undefined ? brightness / 100 : undefined,
    },
    { headers: { Authorization: `Bearer ${LIFX_TOKEN}` } }
  );

  if (error) {
    getLogger().warn({ error: error.message, lightId }, 'LIFX light control failed');
    return false;
  }

  return true;
}

// ============================================================================
// UNIFIED DEVICE CONTROL
// ============================================================================

export async function getAllDevices(): Promise<SmartDevice[]> {
  const devices: SmartDevice[] = [];

  // Gather from all configured platforms in parallel
  const [haDevices, hueDevices, lifxDevices] = await Promise.all([
    HOME_ASSISTANT_TOKEN ? getHomeAssistantDevices() : Promise.resolve([]),
    HUE_USERNAME ? getHueLights() : Promise.resolve([]),
    LIFX_TOKEN ? getLifxLights() : Promise.resolve([]),
  ]);

  devices.push(...haDevices, ...hueDevices, ...lifxDevices);

  return devices;
}

export async function controlDevice(
  deviceNameOrId: string,
  action: 'on' | 'off' | 'toggle' | 'set',
  value?: number | string
): Promise<string> {
  const devices = await getAllDevices();

  // Find device by name (fuzzy) or ID
  const device = devices.find(
    (d) => d.id === deviceNameOrId || d.name.toLowerCase().includes(deviceNameOrId.toLowerCase())
  );

  if (!device) {
    if (devices.length === 0) {
      return getConfigurationHelp();
    }
    return `I couldn't find a device called "${deviceNameOrId}". Here are your devices:\n\n${devices.map((d) => `• ${d.name} (${d.type})`).join('\n')}`;
  }

  getLogger().info({ device: device.name, action, value }, '🏠 Controlling smart device');

  let success = false;
  let newState: string = action;

  switch (device.platform) {
    case 'home_assistant':
      if (device.type === 'light' || device.type === 'switch') {
        const service =
          action === 'toggle'
            ? 'toggle'
            : action === 'on' || action === 'set'
              ? 'turn_on'
              : 'turn_off';
        const data = typeof value === 'number' ? { brightness_pct: value } : undefined;
        success = await callHomeAssistantService('light', service, device.id, data);
      } else if (device.type === 'thermostat' && typeof value === 'number') {
        success = await callHomeAssistantService('climate', 'set_temperature', device.id, {
          temperature: value,
        });
        newState = `${value}°`;
      } else if (device.type === 'lock') {
        success = await callHomeAssistantService(
          'lock',
          action === 'on' ? 'lock' : 'unlock',
          device.id
        );
        newState = action === 'on' ? 'locked' : 'unlocked';
      }
      break;

    case 'hue':
      if (device.type === 'light') {
        const turnOn =
          action === 'on' || action === 'set' || (action === 'toggle' && device.state === 'off');
        success = await setHueLight(
          device.id,
          turnOn,
          typeof value === 'number' ? value : undefined
        );
      }
      break;

    case 'lifx':
      if (device.type === 'light') {
        const lifxPower =
          action === 'on' || action === 'set' ? 'on' : action === 'off' ? 'off' : undefined;
        success = await setLifxLight(
          device.id,
          lifxPower,
          typeof value === 'number' ? value : undefined
        );
      }
      break;
  }

  if (success) {
    const emoji =
      device.type === 'light'
        ? '💡'
        : device.type === 'thermostat'
          ? '🌡️'
          : device.type === 'lock'
            ? '🔒'
            : '✅';
    return `${emoji} **${device.name}** is now ${newState}`;
  } else {
    return `I had trouble controlling ${device.name}. The device might be offline or unresponsive.`;
  }
}

function getConfigurationHelp(): string {
  return `**Smart Home Not Configured**

I don't have any smart home integrations set up yet. Here's how to enable them:

**Recommended: Home Assistant**
1. Set up Home Assistant (homeassistant.io)
2. Create a Long-Lived Access Token in your profile
3. Set environment variables:
   \`\`\`
   HOME_ASSISTANT_URL=http://your-ha-ip:8123
   HOME_ASSISTANT_TOKEN=your_token
   \`\`\`

**Alternative: Philips Hue**
1. Press the link button on your Hue Bridge
2. Get credentials using the Hue API
3. Set environment variables:
   \`\`\`
   HUE_BRIDGE_IP=192.168.1.x
   HUE_USERNAME=your_username
   \`\`\`

**Alternative: LIFX**
1. Get an API token from cloud.lifx.com
2. Set: \`LIFX_TOKEN=your_token\`

Once configured, you can say things like:
• "Turn off the living room lights"
• "Set the thermostat to 72"
• "Lock the front door"`;
}

// ============================================================================
// SCENE/ROUTINE SUPPORT
// ============================================================================

interface Scene {
  name: string;
  devices: Array<{
    device: string;
    action: 'on' | 'off' | 'set';
    value?: number;
  }>;
}

const builtInScenes: Record<string, Scene> = {
  'good morning': {
    name: 'Good Morning',
    devices: [
      { device: 'bedroom', action: 'on', value: 50 },
      { device: 'kitchen', action: 'on', value: 100 },
    ],
  },
  'good night': {
    name: 'Good Night',
    devices: [
      { device: 'living room', action: 'off' },
      { device: 'bedroom', action: 'off' },
      { device: 'thermostat', action: 'set', value: 68 },
    ],
  },
  movie: {
    name: 'Movie Time',
    devices: [
      { device: 'living room', action: 'set', value: 15 },
      { device: 'tv', action: 'on' },
    ],
  },
};

export async function activateScene(sceneName: string): Promise<string> {
  const scene = builtInScenes[sceneName.toLowerCase()];

  if (!scene) {
    return `I don't have a scene called "${sceneName}". Available scenes:\n${Object.keys(
      builtInScenes
    )
      .map((s) => `• ${s}`)
      .join('\n')}`;
  }

  const results: string[] = [];
  for (const cmd of scene.devices) {
    const result = await controlDevice(cmd.device, cmd.action, cmd.value);
    results.push(result);
  }

  return `🎬 **${scene.name}** activated\n\n${results.join('\n')}`;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createSmartHomeTools() {
  return {
    controlLight: llm.tool({
      description: getToolDescription('controlLight'),
      parameters: z.object({
        room: z.string().describe('Room or light name (e.g., "living room", "bedroom", "kitchen")'),
        action: z.enum(['on', 'off', 'toggle']).describe('What to do with the light'),
        brightness: z.number().min(0).max(100).optional().describe('Brightness level 0-100'),
      }),
      execute: async ({ room, action, brightness }) => {
        return controlDevice(room, brightness !== undefined ? 'set' : action, brightness);
      },
    }),

    setThermostat: llm.tool({
      description: getToolDescription('setThermostat'),
      parameters: z.object({
        temperature: z.number().describe('Target temperature in Fahrenheit'),
        mode: z.enum(['heat', 'cool', 'auto', 'off']).optional().describe('HVAC mode'),
      }),
      execute: async ({ temperature, mode }) => {
        return controlDevice('thermostat', 'set', temperature);
      },
    }),

    controlLock: llm.tool({
      description: getToolDescription('controlLock'),
      parameters: z.object({
        lock: z.string().describe('Which lock (e.g., "front door", "back door", "garage")'),
        action: z.enum(['lock', 'unlock', 'status']).describe('What to do'),
      }),
      execute: async ({ lock, action }) => {
        if (action === 'status') {
          const devices = await getAllDevices();
          const lockDevice = devices.find(
            (d) => d.type === 'lock' && d.name.toLowerCase().includes(lock.toLowerCase())
          );
          if (lockDevice) {
            return `🔒 **${lockDevice.name}** is ${lockDevice.state}`;
          }
          return `I couldn't find a lock called "${lock}"`;
        }
        return controlDevice(lock, action === 'lock' ? 'on' : 'off');
      },
    }),

    listDevices: llm.tool({
      description: getToolDescription('listDevices'),
      parameters: z.object({
        type: z
          .enum(['all', 'lights', 'thermostats', 'locks', 'switches'])
          .optional()
          .default('all')
          .describe('Filter by device type'),
      }),
      execute: async ({ type }) => {
        const devices = await getAllDevices();

        if (devices.length === 0) {
          return getConfigurationHelp();
        }

        const filtered =
          type === 'all'
            ? devices
            : devices.filter((d) => d.type === (type.replace(/s$/, '') as SmartDevice['type']));

        if (filtered.length === 0) {
          return `No ${type} found.`;
        }

        let response = `**Smart Home Devices**\n\n`;

        const byType = filtered.reduce(
          (acc, d) => {
            acc[d.type] = acc[d.type] || [];
            acc[d.type].push(d);
            return acc;
          },
          {} as Record<string, SmartDevice[]>
        );

        for (const [deviceType, deviceList] of Object.entries(byType)) {
          const emoji =
            deviceType === 'light'
              ? '💡'
              : deviceType === 'thermostat'
                ? '🌡️'
                : deviceType === 'lock'
                  ? '🔒'
                  : '📱';
          response += `**${emoji} ${deviceType.charAt(0).toUpperCase() + deviceType.slice(1)}s**\n`;
          deviceList.forEach((d) => {
            response += `• ${d.name}: ${d.state}\n`;
          });
          response += '\n';
        }

        return response;
      },
    }),

    activateScene: llm.tool({
      description: getToolDescription('activateScene'),
      parameters: z.object({
        sceneName: z
          .string()
          .describe('Name of the scene (e.g., "good night", "movie", "good morning")'),
      }),
      execute: async ({ sceneName }) => {
        return activateScene(sceneName);
      },
    }),
  };
}

export default createSmartHomeTools;
