/**
 * Smart Home Control Tools
 *
 * Control lights, thermostats, locks, and other smart home devices.
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
import { getLogger } from '../utils/safe-logger.js';

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
// HOME ASSISTANT API
// ============================================================================

async function homeAssistantRequest(
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown
): Promise<unknown> {
  if (!HOME_ASSISTANT_URL || !HOME_ASSISTANT_TOKEN) {
    throw new Error('Home Assistant not configured');
  }

  const url = `${HOME_ASSISTANT_URL}/api/${endpoint}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${HOME_ASSISTANT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Home Assistant error: ${response.status}`);
  }

  return response.json();
}

async function getHomeAssistantDevices(): Promise<SmartDevice[]> {
  try {
    const states = (await homeAssistantRequest('states')) as Array<{
      entity_id?: string;
      attributes?: { friendly_name?: string; [key: string]: unknown };
      state?: string;
    }>;

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
  } catch (error) {
    getLogger().warn({ error }, 'Home Assistant error');
    return [];
  }
}

async function callHomeAssistantService(
  domain: string,
  service: string,
  entityId: string,
  data?: Record<string, unknown>
): Promise<boolean> {
  try {
    await homeAssistantRequest(`services/${domain}/${service}`, 'POST', {
      entity_id: entityId,
      ...data,
    });
    return true;
  } catch (error) {
    getLogger().error({ error, domain, service, entityId }, 'Home Assistant service call failed');
    return false;
  }
}

// ============================================================================
// PHILIPS HUE API
// ============================================================================

async function hueRequest(
  endpoint: string,
  method: 'GET' | 'PUT' = 'GET',
  body?: unknown
): Promise<unknown> {
  if (!HUE_BRIDGE_IP || !HUE_USERNAME) {
    throw new Error('Hue not configured');
  }

  const url = `http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/${endpoint}`;
  const response = await fetch(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  });

  return response.json();
}

async function getHueLights(): Promise<SmartDevice[]> {
  try {
    const lights = (await hueRequest('lights')) as Record<
      string,
      {
        name?: string;
        state?: { on?: boolean; bri?: number };
      }
    >;

    return Object.entries(lights).map(([id, light]) => ({
      id: `hue_${id}`,
      name: light.name || `Hue Light ${id}`,
      type: 'light' as const,
      state: light.state?.on ? 'on' : 'off',
      attributes: { brightness: light.state?.bri },
      platform: 'hue' as const,
    }));
  } catch (error) {
    getLogger().warn({ error }, 'Hue API error');
    return [];
  }
}

async function setHueLight(lightId: string, on: boolean, brightness?: number): Promise<boolean> {
  try {
    const id = lightId.replace('hue_', '');
    const body: { on: boolean; bri?: number } = { on };
    if (brightness !== undefined) {
      body.bri = Math.round(brightness * 2.54); // Convert 0-100 to 0-254
    }
    await hueRequest(`lights/${id}/state`, 'PUT', body);
    return true;
  } catch (error) {
    getLogger().error({ error, lightId }, 'Hue light control failed');
    return false;
  }
}

// ============================================================================
// LIFX API
// ============================================================================

async function lifxRequest(
  endpoint: string,
  method: 'GET' | 'PUT' | 'POST' = 'GET',
  body?: unknown
): Promise<unknown> {
  if (!LIFX_TOKEN) {
    throw new Error('LIFX not configured');
  }

  const url = `https://api.lifx.com/v1/${endpoint}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${LIFX_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });

  return response.json();
}

async function getLifxLights(): Promise<SmartDevice[]> {
  try {
    const lights = (await lifxRequest('lights/all')) as Array<{
      id?: string;
      label?: string;
      power?: string;
      brightness?: number;
    }>;

    return lights.map((light) => ({
      id: `lifx_${light.id}`,
      name: light.label || 'LIFX Light',
      type: 'light' as const,
      state: light.power || 'off',
      attributes: { brightness: Math.round((light.brightness || 0) * 100) },
      platform: 'lifx' as const,
    }));
  } catch (error) {
    getLogger().warn({ error }, 'LIFX API error');
    return [];
  }
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
        try {
          await lifxRequest(`lights/${device.id.replace('lifx_', '')}/state`, 'PUT', {
            power:
              action === 'on' || action === 'set' ? 'on' : action === 'off' ? 'off' : undefined,
            brightness: typeof value === 'number' ? value / 100 : undefined,
          });
          success = true;
        } catch {
          success = false;
        }
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
      description: `Control smart lights. Use when someone says:
- "Turn on the lights"
- "Turn off the bedroom light"
- "Dim the living room to 50%"
- "Make it brighter"`,
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
      description: `Set the thermostat temperature. Use when someone says:
- "Set the temperature to 72"
- "Make it cooler/warmer"
- "Turn up the heat"
- "Turn on the AC"`,
      parameters: z.object({
        temperature: z.number().describe('Target temperature in Fahrenheit'),
        mode: z.enum(['heat', 'cool', 'auto', 'off']).optional().describe('HVAC mode'),
      }),
      execute: async ({ temperature, mode }) => {
        return controlDevice('thermostat', 'set', temperature);
      },
    }),

    controlLock: llm.tool({
      description: `Control smart locks. Use when someone says:
- "Lock the front door"
- "Unlock the back door"
- "Is the door locked?"`,
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
      description: `List all smart home devices and their status. Use when someone asks:
- "What smart devices do I have?"
- "Show me all my lights"
- "What's the status of my home?"`,
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
      description: `Activate a smart home scene/routine. Use when someone says:
- "Good night" (turns off lights, sets thermostat)
- "Good morning" (turns on lights)
- "Movie time" (dims lights)`,
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
