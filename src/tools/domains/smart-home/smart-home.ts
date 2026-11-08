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
 * - Sonos support
 *
 * Supported Platforms:
 * - Philips Hue (direct API for lights)
 * - LIFX (direct API for lights)
 * - Sonos (speakers)
 * - Ecobee (thermostats)
 *
 * @module tools/smart-home
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import { getLifxClient } from '../../../services/self-healing/index.js';
import { HUE_NEEDS_REMOTE_ACCESS } from '../../../services/smart-home/hue-remote-access.js';
import {
  getUserSmartHomeCredentials,
  type SmartHomeCredentials,
} from '../../../services/smart-home/user-credentials.js';
import * as sonos from '../../../services/smart-home/sonos.js';
import {
  getThermostatStatus,
  setTemperature as setEcobeeTemperature,
} from '../../../services/identity/ecobee-api.js';
import { isEcobeeConfigured } from '../../../services/identity/ecobee-auth.js';

// ============================================================================
// TYPES
// ============================================================================

export interface SmartDevice {
  id: string;
  name: string;
  type:
    | 'light'
    | 'switch'
    | 'thermostat'
    | 'lock'
    | 'sensor'
    | 'fan'
    | 'cover'
    | 'media'
    | 'speaker'
    | 'other';
  state: string;
  attributes?: Record<string, unknown>;
  platform: 'hue' | 'lifx' | 'nest' | 'sonos' | 'ecobee';
  room?: string;
}

interface DeviceCommand {
  deviceId: string;
  action: string;
  value?: unknown;
}

// User context for tools
export interface SmartHomeContext {
  userId: string;
  credentials?: SmartHomeCredentials;
}

// Cache for loaded credentials (per request, not global)
const credentialsCache = new Map<string, { credentials: SmartHomeCredentials; loadedAt: number }>();
const CACHE_TTL = 60000; // 1 minute

/**
 * Get credentials for a user (with caching)
 */
async function getCredentials(userId: string): Promise<SmartHomeCredentials> {
  const cached = credentialsCache.get(userId);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL) {
    return cached.credentials;
  }

  const credentials = await getUserSmartHomeCredentials(userId);
  credentialsCache.set(userId, { credentials, loadedAt: Date.now() });
  return credentials;
}

// ============================================================================
// PHILIPS HUE
// ============================================================================

/**
 * Hue lights: none, by design. A Hue bridge is on the user's home network,
 * which LiveKit Cloud cannot reach, and fetching a user-supplied host from
 * here is SSRF, so the agent never contacts a bridge (see hue-remote-access).
 */
function getHueLights(_credentials: SmartHomeCredentials): Promise<SmartDevice[]> {
  return Promise.resolve([]);
}

// ============================================================================
// LIFX API (with self-healing + user credentials)
// ============================================================================

type LifxCredentialsOnly = Pick<SmartHomeCredentials, 'lifx'> & { breakerKey?: string };
interface LifxLight {
  id?: string;
  label?: string;
  power?: string;
  brightness?: number;
  location?: { name: string };
  group?: { name: string };
}

export async function getLifxLights(credentials: LifxCredentialsOnly): Promise<SmartDevice[]> {
  const lifxConfig = credentials.lifx;
  if (!lifxConfig) {
    return [];
  }

  const lifxClient = getLifxClient(credentials.breakerKey);

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
  credentials: LifxCredentialsOnly,
  lightId: string,
  power?: 'on' | 'off',
  brightness?: number,
  colorTemp?: number
): Promise<boolean> {
  const lifxConfig = credentials.lifx;
  if (!lifxConfig) {
    return false;
  }

  const lifxClient = getLifxClient(credentials.breakerKey);

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

// ============================================================================
// SONOS API (user credentials)
// ============================================================================

async function getSonosDevices(credentials: SmartHomeCredentials): Promise<SmartDevice[]> {
  const sonosConfig = credentials.sonos;
  if (!sonosConfig) {
    return [];
  }

  try {
    const households = await sonos.getHouseholds(sonosConfig);
    const devices: SmartDevice[] = [];

    for (const household of households) {
      const groups = await sonos.getGroups(sonosConfig, household.id);

      for (const group of groups) {
        devices.push({
          id: `sonos_${group.id}`,
          name: group.name,
          type: 'speaker' as const,
          state: group.playbackState,
          attributes: { volume: group.volume, muted: group.muted },
          platform: 'sonos' as const,
        });
      }
    }

    return devices;
  } catch (error) {
    getLogger().warn({ error: String(error) }, 'Failed to get Sonos devices');
    return [];
  }
}

async function controlSonos(
  credentials: SmartHomeCredentials,
  groupId: string,
  action: 'play' | 'pause' | 'volume' | 'mute',
  value?: number | boolean
): Promise<boolean> {
  const sonosConfig = credentials.sonos;
  if (!sonosConfig) {
    return false;
  }

  const id = groupId.replace('sonos_', '');

  try {
    switch (action) {
      case 'play':
        await sonos.setPlaybackState(sonosConfig, id, 'play');
        break;
      case 'pause':
        await sonos.setPlaybackState(sonosConfig, id, 'pause');
        break;
      case 'volume':
        if (typeof value === 'number') {
          await sonos.setGroupVolume(sonosConfig, id, value);
        }
        break;
      case 'mute':
        await sonos.setGroupMute(sonosConfig, id, value === true);
        break;
    }
    return true;
  } catch (error) {
    getLogger().warn({ error: String(error), groupId, action }, 'Failed to control Sonos');
    return false;
  }
}

// ============================================================================
// ECOBEE API
// ============================================================================

async function getEcobeeDevices(userId?: string): Promise<SmartDevice[]> {
  if (!userId) return [];

  const configured = await isEcobeeConfigured(userId);
  if (!configured) {
    return [];
  }

  try {
    const result = await getThermostatStatus(userId);
    if (!result.success || !result.data) {
      return [];
    }

    const status = result.data;
    return [
      {
        id: 'ecobee_thermostat',
        name: status.name || 'Ecobee Thermostat',
        type: 'thermostat' as const,
        state: status.mode || 'auto',
        attributes: {
          currentTemp: status.currentTemp,
          targetTemp: status.targetHeat || status.targetCool,
          humidity: status.humidity,
          hvacMode: status.mode,
        },
        platform: 'ecobee' as const,
      },
    ];
  } catch (error) {
    getLogger().warn({ error: String(error) }, 'Failed to get Ecobee status');
    return [];
  }
}

async function controlEcobee(userId: string, temperature: number): Promise<boolean> {
  const configured = await isEcobeeConfigured(userId);
  if (!configured) {
    return false;
  }

  try {
    const result = await setEcobeeTemperature(userId, {
      heatHoldTemp: temperature,
      coolHoldTemp: temperature + 3,
      holdType: 'nextTransition',
    });
    return result.success;
  } catch (error) {
    getLogger().warn({ error: String(error), temperature }, 'Failed to control Ecobee');
    return false;
  }
}

// ============================================================================
// UNIFIED DEVICE CONTROL
// ============================================================================

export async function getAllDevices(userId?: string): Promise<SmartDevice[]> {
  const devices: SmartDevice[] = [];

  // Load user credentials if userId provided
  const credentials = userId
    ? await getCredentials(userId)
    : {
        hue: null,
        lifx: null,
        sonos: null,
      };

  // Gather from all configured platforms in parallel
  const [hueDevices, lifxDevices, sonosDevices, ecobeeDevices] = await Promise.all([
    credentials.hue ? getHueLights(credentials) : Promise.resolve([]),
    credentials.lifx ? getLifxLights(credentials) : Promise.resolve([]),
    credentials.sonos ? getSonosDevices(credentials) : Promise.resolve([]),
    getEcobeeDevices(userId),
  ]);

  devices.push(...hueDevices, ...lifxDevices, ...sonosDevices, ...ecobeeDevices);

  return devices;
}

export async function controlDevice(
  deviceNameOrId: string,
  action: 'on' | 'off' | 'toggle' | 'set',
  value?: number | string,
  userId?: string
): Promise<string> {
  const devices = await getAllDevices(userId);
  const credentials = userId
    ? await getCredentials(userId)
    : {
        hue: null,
        lifx: null,
        sonos: null,
      };

  // Find device by name (fuzzy) or ID
  const device = devices.find(
    (d) => d.id === deviceNameOrId || d.name.toLowerCase().includes(deviceNameOrId.toLowerCase())
  );

  if (!device) {
    // A saved Hue bridge lists no lights: say why, calmly, rather than "not found".
    const hueNote = credentials.hue ? `\n\n${HUE_NEEDS_REMOTE_ACCESS}` : '';
    if (devices.length === 0) {
      return credentials.hue ? HUE_NEEDS_REMOTE_ACCESS : getConfigurationHelp();
    }
    return `I couldn't find a device called "${deviceNameOrId}". Here are your devices:\n\n${devices.map((d) => `• ${d.name} (${d.type})`).join('\n')}${hueNote}`;
  }

  getLogger().info({ device: device.name, action, value }, '🏠 Controlling smart device');

  let success = false;
  let newState: string = action;

  switch (device.platform) {
    case 'lifx':
      if (device.type === 'light') {
        const lifxPower =
          action === 'on' || action === 'set' ? 'on' : action === 'off' ? 'off' : undefined;
        success = await setLifxLight(
          credentials,
          device.id,
          lifxPower,
          typeof value === 'number' ? value : undefined
        );
      }
      break;

    case 'sonos':
      if (device.type === 'speaker') {
        if (action === 'on') {
          success = await controlSonos(credentials, device.id, 'play');
          newState = 'playing';
        } else if (action === 'off') {
          success = await controlSonos(credentials, device.id, 'pause');
          newState = 'paused';
        } else if (action === 'set' && typeof value === 'number') {
          success = await controlSonos(credentials, device.id, 'volume', value);
          newState = `volume ${value}%`;
        }
      }
      break;

    case 'ecobee':
      if (device.type === 'thermostat' && typeof value === 'number' && userId) {
        success = await controlEcobee(userId, value);
        newState = `${value}°`;
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
            : device.type === 'speaker'
              ? '🔊'
              : '✅';
    return `${emoji} **${device.name}** is now ${newState}`;
  } else {
    return `I had trouble controlling ${device.name}. The device might be offline or unresponsive.`;
  }
}

function getConfigurationHelp(): string {
  return `**Smart Home Not Connected Yet**

I don't see any smart home devices. Let me help you connect them!

Open **Set the Mood** in the app's menu to connect:

• **Philips Hue** - Smart lights
• **LIFX** - Smart lights  
• **Sonos** - Speakers and music
• **Ecobee** - Smart thermostat

Once connected, you can say things like:
• "Turn off the living room lights"
• "Set the thermostat to 72"
• "Play some music on Sonos"
• "Set the vibe to relax"`;
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

export async function activateScene(sceneName: string, userId?: string): Promise<string> {
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
    const result = await controlDevice(cmd.device, cmd.action, cmd.value, userId);
    results.push(result);
  }

  return `🎬 **${scene.name}** activated\n\n${results.join('\n')}`;
}

// ============================================================================
// VIBE INTEGRATION
// ============================================================================

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
export async function setLightsForVibe(
  userId: string,
  brightness: number,
  colorTemperature?: number
): Promise<{ success: boolean; devices: string[] }> {
  const credentials = await getCredentials(userId);
  const controlledDevices: string[] = [];

  // Get all light devices
  const devices = await getAllDevices(userId);
  const lights = devices.filter((d) => d.type === 'light');

  for (const light of lights) {
    let success = false;

    switch (light.platform) {
      case 'lifx':
        success = await setLifxLight(
          credentials,
          light.id,
          brightness > 0 ? 'on' : 'off',
          brightness,
          colorTemperature
        );
        break;
    }

    if (success) {
      controlledDevices.push(light.name);
    }
  }

  return {
    success: controlledDevices.length > 0,
    devices: controlledDevices,
  };
}

/**
 * Play vibe music on Sonos
 */
export async function playVibeMusic(
  userId: string,
  vibe: string,
  volume?: number
): Promise<{ success: boolean; message: string }> {
  const credentials = await getCredentials(userId);

  if (!credentials.sonos) {
    return { success: false, message: 'Sonos not connected' };
  }

  try {
    // Set volume if specified
    if (volume !== undefined) {
      await sonos.setAllGroupsVolume(credentials.sonos, volume);
    }

    // Try to play matching music
    const played = await sonos.playVibeMusic(credentials.sonos, vibe);

    if (played) {
      return { success: true, message: `Playing ${vibe} music on Sonos` };
    } else {
      return { success: false, message: `No ${vibe} playlist found in Sonos favorites` };
    }
  } catch (error) {
    return { success: false, message: String(error) };
  }
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createSmartHomeTools(context?: SmartHomeContext) {
  const userId = context?.userId;

  return {
    controlLight: llm.tool({
      description: getToolDescription('controlLight'),
      parameters: z.object({
        room: z.string().describe('Room or light name (e.g., "living room", "bedroom", "kitchen")'),
        action: z.enum(['on', 'off', 'toggle']).describe('What to do with the light'),
        brightness: z.number().min(0).max(100).optional().describe('Brightness level 0-100'),
      }),
      execute: async ({ room, action, brightness }) => {
        return controlDevice(room, brightness !== undefined ? 'set' : action, brightness, userId);
      },
    }),

    setThermostat: llm.tool({
      description: getToolDescription('setThermostat'),
      parameters: z.object({
        temperature: z.number().describe('Target temperature in Fahrenheit'),
        mode: z.enum(['heat', 'cool', 'auto', 'off']).optional().describe('HVAC mode'),
      }),
      execute: async ({ temperature, mode }) => {
        return controlDevice('thermostat', 'set', temperature, userId);
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
          const devices = await getAllDevices(userId);
          const lockDevice = devices.find(
            (d) => d.type === 'lock' && d.name.toLowerCase().includes(lock.toLowerCase())
          );
          if (lockDevice) {
            return `🔒 **${lockDevice.name}** is ${lockDevice.state}`;
          }
          return `I couldn't find a lock called "${lock}"`;
        }
        return controlDevice(lock, action === 'lock' ? 'on' : 'off', undefined, userId);
      },
    }),

    controlSpeaker: llm.tool({
      description: 'Control Sonos or other smart speakers',
      parameters: z.object({
        speaker: z.string().describe('Speaker name or room'),
        action: z.enum(['play', 'pause', 'volume']).describe('What to do'),
        volume: z.number().min(0).max(100).optional().describe('Volume level 0-100'),
      }),
      execute: async ({ speaker, action, volume }) => {
        if (action === 'volume' && volume !== undefined) {
          return controlDevice(speaker, 'set', volume, userId);
        }
        return controlDevice(speaker, action === 'play' ? 'on' : 'off', undefined, userId);
      },
    }),

    listDevices: llm.tool({
      description: getToolDescription('listDevices'),
      parameters: z.object({
        type: z
          .enum(['all', 'lights', 'thermostats', 'locks', 'switches', 'speakers'])
          .optional()
          .default('all')
          .describe('Filter by device type'),
      }),
      execute: async ({ type }) => {
        const devices = await getAllDevices(userId);

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
                  : deviceType === 'speaker'
                    ? '🔊'
                    : '📱';
          response += `**${emoji} ${deviceType.charAt(0).toUpperCase() + deviceType.slice(1)}s**\n`;
          deviceList.forEach((d) => {
            response += `• ${d.name}: ${d.state}${d.room ? ` (${d.room})` : ''}\n`;
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
        return activateScene(sceneName, userId);
      },
    }),
  };
}

export default createSmartHomeTools;
