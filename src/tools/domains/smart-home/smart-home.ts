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
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import {
  getHomeAssistantClient,
  getHueClient,
  getLifxClient,
} from '../../../services/self-healing/index.js';
import {
  getUserSmartHomeCredentials,
  type SmartHomeCredentials,
} from '../../../services/smart-home/user-credentials.js';
import * as sonos from '../../../services/smart-home/sonos.js';
import * as homekit from '../../../services/smart-home/homekit-bridge.js';
import { getThermostatStatus, setTemperature as setEcobeeTemperature } from '../../../services/identity/ecobee-api.js';
import { isEcobeeConfigured } from '../../../services/identity/ecobee-auth.js';

// ============================================================================
// CONFIGURATION (Fallback to env vars for backward compatibility)
// ============================================================================

// Home Assistant (optional - recommended for advanced users)
const HOME_ASSISTANT_URL = process.env.HOME_ASSISTANT_URL || '';
const HOME_ASSISTANT_TOKEN = process.env.HOME_ASSISTANT_TOKEN || '';

// ============================================================================
// TYPES
// ============================================================================

export interface SmartDevice {
  id: string;
  name: string;
  type: 'light' | 'switch' | 'thermostat' | 'lock' | 'sensor' | 'fan' | 'cover' | 'media' | 'speaker' | 'other';
  state: string;
  attributes?: Record<string, unknown>;
  platform: 'home_assistant' | 'hue' | 'smartthings' | 'lifx' | 'nest' | 'sonos' | 'homekit' | 'ecobee';
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
// HOME ASSISTANT API (with self-healing)
// ============================================================================

async function homeAssistantRequest<T = unknown>(
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown
): Promise<T | null> {
  if (!HOME_ASSISTANT_URL || !HOME_ASSISTANT_TOKEN) {
    return null;
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
// PHILIPS HUE API (with self-healing + user credentials)
// ============================================================================

// Type for Hue lights response
type HueLightsResponse = Record<
  string,
  {
    name?: string;
    state?: { on?: boolean; bri?: number };
  }
>;

async function getHueLights(credentials: SmartHomeCredentials): Promise<SmartDevice[]> {
  const hueConfig = credentials.hue;
  if (!hueConfig) {
    return [];
  }

  const hueClient = getHueClient();

  // Check circuit health
  if (!hueClient.isHealthy()) {
    getLogger().debug('Hue circuit is open, skipping request');
    return [];
  }

  const url = `http://${hueConfig.bridgeIp}/api/${hueConfig.username}/lights`;
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

async function setHueLight(
  credentials: SmartHomeCredentials,
  lightId: string,
  on: boolean,
  brightness?: number,
  colorTemp?: number
): Promise<boolean> {
  const hueConfig = credentials.hue;
  if (!hueConfig) {
    return false;
  }

  const hueClient = getHueClient();

  if (!hueClient.isHealthy()) {
    getLogger().debug('Hue circuit is open, cannot control light');
    return false;
  }

  const id = lightId.replace('hue_', '');
  const body: { on: boolean; bri?: number; ct?: number } = { on };
  if (brightness !== undefined) {
    body.bri = Math.round(brightness * 2.54); // Convert 0-100 to 0-254
  }
  if (colorTemp !== undefined) {
    // Convert Kelvin to mireds (Hue uses mireds: 153-500 for 6500K-2000K)
    body.ct = Math.round(1000000 / colorTemp);
  }

  const url = `http://${hueConfig.bridgeIp}/api/${hueConfig.username}/lights/${id}/state`;
  const { error } = await hueClient.put(url, body);

  if (error) {
    getLogger().warn({ error: error.message, lightId }, 'Hue light control failed');
    return false;
  }

  return true;
}

// ============================================================================
// LIFX API (with self-healing + user credentials)
// ============================================================================

// Type for LIFX lights response
interface LifxLight {
  id?: string;
  label?: string;
  power?: string;
  brightness?: number;
  location?: { name: string };
  group?: { name: string };
}

async function getLifxLights(credentials: SmartHomeCredentials): Promise<SmartDevice[]> {
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

async function setLifxLight(
  credentials: SmartHomeCredentials,
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

  const { error } = await lifxClient.put(
    `https://api.lifx.com/v1/lights/${id}/state`,
    body,
    { headers: { Authorization: `Bearer ${lifxConfig.token}` } }
  );

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
// HOMEKIT API (via bridge)
// ============================================================================

async function getHomeKitDevices(userId: string): Promise<SmartDevice[]> {
  try {
    const devices = await homekit.getDevices(userId);
    
    return devices.map((device) => ({
      id: `homekit_${device.id}`,
      name: device.name,
      type: device.type === 'tv' ? 'media' : device.type,
      state: device.state.on ? 'on' : device.state.reachable ? 'off' : 'offline',
      attributes: device.state as unknown as Record<string, unknown>,
      platform: 'homekit' as const,
      room: device.room,
    }));
  } catch (error) {
    getLogger().warn({ error: String(error) }, 'Failed to get HomeKit devices');
    return [];
  }
}

async function controlHomeKit(
  userId: string,
  deviceId: string,
  changes: Partial<homekit.HomeKitDeviceState>
): Promise<boolean> {
  const id = deviceId.replace('homekit_', '');
  
  try {
    await homekit.queueDeviceCommand(userId, id, changes);
    return true;
  } catch (error) {
    getLogger().warn({ error: String(error), deviceId }, 'Failed to control HomeKit device');
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
    return [{
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
    }];
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
  const credentials = userId ? await getCredentials(userId) : {
    hue: null,
    lifx: null,
    sonos: null,
    homeKit: null,
  };

  // Gather from all configured platforms in parallel
  const [haDevices, hueDevices, lifxDevices, sonosDevices, homekitDevices, ecobeeDevices] = await Promise.all([
    HOME_ASSISTANT_TOKEN ? getHomeAssistantDevices() : Promise.resolve([]),
    credentials.hue ? getHueLights(credentials) : Promise.resolve([]),
    credentials.lifx ? getLifxLights(credentials) : Promise.resolve([]),
    credentials.sonos ? getSonosDevices(credentials) : Promise.resolve([]),
    userId ? getHomeKitDevices(userId) : Promise.resolve([]),
    getEcobeeDevices(userId),
  ]);

  devices.push(...haDevices, ...hueDevices, ...lifxDevices, ...sonosDevices, ...homekitDevices, ...ecobeeDevices);

  return devices;
}

export async function controlDevice(
  deviceNameOrId: string,
  action: 'on' | 'off' | 'toggle' | 'set',
  value?: number | string,
  userId?: string
): Promise<string> {
  const devices = await getAllDevices(userId);
  const credentials = userId ? await getCredentials(userId) : {
    hue: null,
    lifx: null,
    sonos: null,
    homeKit: null,
  };

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
          credentials,
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

    case 'homekit':
      if (userId) {
        const changes: Partial<homekit.HomeKitDeviceState> = {};
        if (action === 'on') changes.on = true;
        else if (action === 'off') changes.on = false;
        else if (action === 'set' && typeof value === 'number') {
          changes.on = true;
          changes.brightness = value;
        }
        success = await controlHomeKit(userId, device.id, changes);
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

Go to **Settings → Your Home** in the app to connect:

• **Philips Hue** - Smart lights
• **LIFX** - Smart lights  
• **Sonos** - Speakers and music
• **Ecobee** - Smart thermostat
• **HomeKit** - Apple devices (via iOS app)

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
      case 'hue':
        success = await setHueLight(credentials, light.id, brightness > 0, brightness, colorTemperature);
        break;
      case 'lifx':
        success = await setLifxLight(
          credentials,
          light.id,
          brightness > 0 ? 'on' : 'off',
          brightness,
          colorTemperature
        );
        break;
      case 'homekit':
        success = await controlHomeKit(userId, light.id, {
          on: brightness > 0,
          brightness,
          colorTemperature,
        });
        break;
      case 'home_assistant':
        // Home Assistant lights support brightness via service call
        if (HOME_ASSISTANT_TOKEN && HOME_ASSISTANT_URL) {
          try {
            const service = brightness > 0 ? 'turn_on' : 'turn_off';
            const serviceData: Record<string, unknown> = { entity_id: light.id };
            if (brightness > 0) {
              // Convert 0-100 to 0-255 for HA
              serviceData.brightness = Math.round((brightness / 100) * 255);
            }
            if (colorTemperature && brightness > 0) {
              // HA uses mireds (1,000,000 / kelvin)
              serviceData.color_temp = Math.round(1000000 / colorTemperature);
            }
            await homeAssistantRequest<unknown>(
              `/api/services/light/${service}`,
              'POST',
              serviceData
            );
            success = true;
          } catch {
            success = false;
          }
        }
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
