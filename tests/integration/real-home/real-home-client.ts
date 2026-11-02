/**
 * Real Home Integration Test Client
 *
 * Provides utilities for testing against actual smart home devices.
 * Supports Ecobee, Hue, and LIFX.
 */

import { createLogger } from '../../../src/utils/safe-logger.js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load test environment
dotenv.config({ path: path.join(process.cwd(), '.env.local'), quiet: true });

const log = createLogger({ module: 'real-home-client' });

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface RealHomeConfig {
  ecobee: {
    apiKey: string;
    userId: string;
    configured: boolean;
  };
  hue: {
    bridgeIp: string;
    username: string;
    configured: boolean;
  };
  lifx: {
    token: string;
    configured: boolean;
  };
  options: {
    dryRun: boolean;
    verbose: boolean;
    skipRestore: boolean;
    testRooms: string[];
    testDevices: string[];
  };
}

export function getConfig(): RealHomeConfig {
  return {
    ecobee: {
      apiKey: process.env.ECOBEE_API_KEY || '',
      userId: process.env.TEST_USER_ID || 'test-user',
      configured: !!process.env.ECOBEE_API_KEY,
    },
    hue: {
      bridgeIp: process.env.HUE_BRIDGE_IP || '',
      username: process.env.HUE_USERNAME || '',
      configured: !!(process.env.HUE_BRIDGE_IP && process.env.HUE_USERNAME),
    },
    lifx: {
      token: process.env.LIFX_TOKEN || '',
      configured: !!process.env.LIFX_TOKEN,
    },
    options: {
      dryRun: process.env.DRY_RUN === 'true',
      verbose: process.env.VERBOSE === 'true',
      skipRestore: process.env.SKIP_RESTORE === 'true',
      testRooms: process.env.TEST_ROOMS?.split(',').map((r) => r.trim()) || [],
      testDevices: process.env.TEST_DEVICES?.split(',').map((d) => d.trim()) || [],
    },
  };
}

// =============================================================================
// TYPES
// =============================================================================

export interface RealDevice {
  id: string;
  name: string;
  type: 'light' | 'switch' | 'thermostat' | 'lock' | 'media' | 'sensor' | 'climate' | 'fan' | 'cover';
  platform: 'ecobee' | 'hue' | 'lifx';
  state: string;
  attributes: Record<string, unknown>;
  room?: string;
}

export interface DeviceState {
  deviceId: string;
  state: string;
  attributes: Record<string, unknown>;
  capturedAt: Date;
}

export interface HomeState {
  devices: DeviceState[];
  thermostat?: {
    currentTemp: number;
    targetTemp: number;
    mode: string;
    humidity?: number;
  };
  capturedAt: Date;
}

export interface ControlResult {
  success: boolean;
  device: string;
  action: string;
  error?: string;
  dryRun?: boolean;
}

// =============================================================================
// PHILIPS HUE DIRECT CLIENT
// =============================================================================

export class HueDirectClient {
  private bridgeIp: string;
  private username: string;

  constructor(bridgeIp: string, username: string) {
    this.bridgeIp = bridgeIp;
    this.username = username;
  }

  private get baseUrl(): string {
    return `http://${this.bridgeIp}/api/${this.username}`;
  }

  async checkConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/lights`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async getLights(): Promise<Record<string, { name: string; state: { on: boolean; bri: number; ct?: number } }> | null> {
    try {
      const response = await fetch(`${this.baseUrl}/lights`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async setLight(lightId: string, state: { on?: boolean; bri?: number; ct?: number }): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/lights/${lightId}/state`, {
        method: 'PUT',
        body: JSON.stringify(state),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async setAllLights(brightness: number, colorTemp?: number): Promise<boolean> {
    const lights = await this.getLights();
    if (!lights) return false;

    const results = await Promise.all(
      Object.keys(lights).map((lightId) =>
        this.setLight(lightId, {
          on: brightness > 0,
          bri: Math.round((brightness / 100) * 254),
          ct: colorTemp ? Math.round(1000000 / colorTemp) : undefined, // Convert Kelvin to Mired
        })
      )
    );

    return results.every(Boolean);
  }
}

// =============================================================================
// LIFX DIRECT CLIENT (Cloud API)
// =============================================================================

export class LifxDirectClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async request<T>(endpoint: string, method = 'GET', body?: unknown): Promise<T | null> {
    try {
      const response = await fetch(`https://api.lifx.com/v1/${endpoint}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) return null;
      return (await response.json()) as T;
    } catch {
      return null;
    }
  }

  async checkConnection(): Promise<boolean> {
    const lights = await this.request('lights/all');
    return lights !== null;
  }

  async getLights(): Promise<Array<{ id: string; label: string; power: string; brightness: number; color: { kelvin: number } }> | null> {
    return this.request('lights/all');
  }

  async setState(selector: string, state: { power?: string; brightness?: number; kelvin?: number; duration?: number }): Promise<boolean> {
    const result = await this.request(`lights/${selector}/state`, 'PUT', state);
    return result !== null;
  }

  async setAllLights(brightness: number, colorTemp?: number): Promise<boolean> {
    return this.setState('all', {
      power: brightness > 0 ? 'on' : 'off',
      brightness: brightness / 100,
      kelvin: colorTemp,
      duration: 0.5,
    });
  }
}

// =============================================================================
// REAL HOME TEST CLIENT
// =============================================================================

export class RealHomeClient {
  private config: RealHomeConfig;
  private hueClient: HueDirectClient | null = null;
  private lifxClient: LifxDirectClient | null = null;
  private savedState: HomeState | null = null;

  constructor(config?: RealHomeConfig) {
    this.config = config || getConfig();
    
    // Initialize direct clients FIRST (preferred)
    if (this.config.hue.configured) {
      this.hueClient = new HueDirectClient(
        this.config.hue.bridgeIp,
        this.config.hue.username
      );
    }

    if (this.config.lifx.configured) {
      this.lifxClient = new LifxDirectClient(this.config.lifx.token);
    }
  }

  // ---------------------------------------------------------------------------
  // CONNECTION CHECKS
  // ---------------------------------------------------------------------------

  async checkConnections(): Promise<{
    ecobee: boolean;
    hue: boolean;
    lifx: boolean;
    anyDirectIntegration: boolean;
  }> {
    const results = {
      ecobee: false,
      hue: false,
      lifx: false,
      anyDirectIntegration: false,
    };

    // Check direct integrations FIRST (preferred)
    
    // Check Ecobee (via our service)
    if (this.config.ecobee.configured) {
      try {
        const { isEcobeeConfigured } = await import('../../../src/services/identity/ecobee-auth.js');
        results.ecobee = await isEcobeeConfigured(this.config.ecobee.userId);
      } catch {
        results.ecobee = false;
      }
    }

    // Check Hue (direct bridge)
    if (this.hueClient) {
      results.hue = await this.hueClient.checkConnection();
    }

    // Check LIFX (cloud API)
    if (this.lifxClient) {
      results.lifx = await this.lifxClient.checkConnection();
    }

    // Track if any direct integration works
    results.anyDirectIntegration = results.ecobee || results.hue || results.lifx;

    return results;
  }

  // ---------------------------------------------------------------------------
  // DEVICE DISCOVERY
  // ---------------------------------------------------------------------------

  async discoverDevices(): Promise<RealDevice[]> {
    const devices: RealDevice[] = [];

    // =========================================================================
    // DIRECT INTEGRATIONS FIRST (preferred)
    // =========================================================================

    // Ecobee thermostat (direct API)
    if (this.config.ecobee.configured) {
      try {
        const { getThermostatStatus } = await import('../../../src/services/identity/ecobee-api.js');
        const result = await getThermostatStatus(this.config.ecobee.userId);
        if (result.success && result.data) {
          devices.push({
            id: 'ecobee_thermostat',
            name: result.data.name || 'Ecobee Thermostat',
            type: 'thermostat',
            platform: 'ecobee',
            state: result.data.mode,
            attributes: {
              currentTemp: result.data.currentTemp,
              targetHeat: result.data.targetHeat,
              targetCool: result.data.targetCool,
              humidity: result.data.humidity,
              isRunning: result.data.isRunning,
            },
          });
        }
      } catch (error) {
        log.debug({ error }, 'Failed to get Ecobee status');
      }
    }

    // Philips Hue lights (direct bridge)
    if (this.hueClient) {
      const hueLights = await this.hueClient.getLights();
      if (hueLights) {
        for (const [id, light] of Object.entries(hueLights)) {
          devices.push({
            id: `hue_${id}`,
            name: light.name,
            type: 'light',
            platform: 'hue',
            state: light.state.on ? 'on' : 'off',
            attributes: {
              brightness: Math.round((light.state.bri / 254) * 100),
              colorTemp: light.state.ct ? Math.round(1000000 / light.state.ct) : undefined,
            },
          });
        }
      }
    }

    // LIFX lights (cloud API)
    if (this.lifxClient) {
      const lifxLights = await this.lifxClient.getLights();
      if (lifxLights) {
        for (const light of lifxLights) {
          devices.push({
            id: `lifx_${light.id}`,
            name: light.label,
            type: 'light',
            platform: 'lifx',
            state: light.power,
            attributes: {
              brightness: Math.round(light.brightness * 100),
              colorTemp: light.color?.kelvin,
            },
          });
        }
      }
    }

    return devices;
  }

  // ---------------------------------------------------------------------------
  // STATE CAPTURE & RESTORE
  // ---------------------------------------------------------------------------

  async captureState(): Promise<HomeState> {
    const devices = await this.discoverDevices();
    
    const state: HomeState = {
      devices: devices.map((d) => ({
        deviceId: d.id,
        state: d.state,
        attributes: d.attributes,
        capturedAt: new Date(),
      })),
      capturedAt: new Date(),
    };

    // Capture thermostat state
    const thermostat = devices.find((d) => d.type === 'thermostat' || d.type === 'climate');
    if (thermostat) {
      state.thermostat = {
        currentTemp: thermostat.attributes.currentTemp as number || thermostat.attributes.current_temperature as number || 70,
        targetTemp: thermostat.attributes.targetHeat as number || thermostat.attributes.temperature as number || 70,
        mode: thermostat.state,
        humidity: thermostat.attributes.humidity as number,
      };
    }

    this.savedState = state;
    log.info({ deviceCount: devices.length }, '📸 Home state captured');

    return state;
  }

  /**
   * Restore is not supported for the direct Hue/LIFX/Ecobee clients.
   * Reset devices by hand after a live run.
   */
  async restoreState(): Promise<{ restored: number; failed: number }> {
    log.warn('State restore is not supported for direct integrations; reset devices manually');
    return { restored: 0, failed: 0 };
  }

  // ---------------------------------------------------------------------------
  // DEVICE CONTROL
  // ---------------------------------------------------------------------------

  async controlDevice(
    deviceId: string,
    action: 'on' | 'off' | 'set',
    value?: number
  ): Promise<ControlResult> {
    if (this.config.options.dryRun) {
      log.info({ deviceId, action, value }, '🏃 DRY RUN - would control device');
      return { success: true, device: deviceId, action, dryRun: true };
    }

    // =========================================================================
    // DIRECT INTEGRATIONS FIRST
    // =========================================================================

    // Ecobee thermostat (direct)
    if (deviceId === 'ecobee_thermostat' && this.config.ecobee.configured) {
      try {
        const { setTemperature } = await import('../../../src/services/identity/ecobee-api.js');
        const result = await setTemperature(this.config.ecobee.userId, {
          heatHoldTemp: value,
          holdType: 'nextTransition',
        });
        return { success: result.success, device: deviceId, action, error: result.error };
      } catch (error) {
        return { success: false, device: deviceId, action, error: String(error) };
      }
    }

    // Philips Hue light (direct bridge)
    if (deviceId.startsWith('hue_') && this.hueClient) {
      const lightId = deviceId.replace('hue_', '');
      let success = false;

      if (action === 'on') {
        success = await this.hueClient.setLight(lightId, { on: true, bri: value ? Math.round((value / 100) * 254) : 254 });
      } else if (action === 'off') {
        success = await this.hueClient.setLight(lightId, { on: false });
      } else if (action === 'set' && value !== undefined) {
        success = await this.hueClient.setLight(lightId, { on: true, bri: Math.round((value / 100) * 254) });
      }

      return { success, device: deviceId, action };
    }

    // LIFX light (cloud API)
    if (deviceId.startsWith('lifx_') && this.lifxClient) {
      const selector = `id:${deviceId.replace('lifx_', '')}`;
      let success = false;

      if (action === 'on') {
        success = await this.lifxClient.setState(selector, { power: 'on', brightness: value ? value / 100 : 1 });
      } else if (action === 'off') {
        success = await this.lifxClient.setState(selector, { power: 'off' });
      } else if (action === 'set' && value !== undefined) {
        success = await this.lifxClient.setState(selector, { power: 'on', brightness: value / 100 });
      }

      return { success, device: deviceId, action };
    }

    return { success: false, device: deviceId, action, error: 'Unknown device' };
  }

  // ---------------------------------------------------------------------------
  // BULK LIGHT CONTROL (for vibe activation)
  // ---------------------------------------------------------------------------

  async setAllLights(brightness: number, colorTemp?: number): Promise<{ success: boolean; platforms: string[] }> {
    const platforms: string[] = [];
    const results: boolean[] = [];

    if (this.config.options.dryRun) {
      log.info({ brightness, colorTemp }, '🏃 DRY RUN - would set all lights');
      return { success: true, platforms: ['dry_run'] };
    }

    // Hue direct
    if (this.hueClient) {
      const result = await this.hueClient.setAllLights(brightness, colorTemp);
      if (result) platforms.push('hue');
      results.push(result);
    }

    // LIFX direct
    if (this.lifxClient) {
      const result = await this.lifxClient.setAllLights(brightness, colorTemp);
      if (result) platforms.push('lifx');
      results.push(result);
    }

    return { success: results.length > 0 && results.some(Boolean), platforms };
  }

  // ---------------------------------------------------------------------------
  // VIBE TESTING
  // ---------------------------------------------------------------------------

  async testVibe(vibePreset: string): Promise<{
    success: boolean;
    lightsSet: boolean;
    temperatureSet: boolean;
    errors: string[];
  }> {
    const { activateVibe } = await import('../../../src/services/vibe/vibe-service.js');
    
    if (this.config.options.dryRun) {
      log.info({ vibePreset }, '🏃 DRY RUN - would activate vibe');
      return { success: true, lightsSet: false, temperatureSet: false, errors: ['DRY RUN'] };
    }

    const result = await activateVibe(this.config.ecobee.userId, vibePreset);
    
    return {
      success: result.success,
      lightsSet: result.applied.lights,
      temperatureSet: result.applied.temperature,
      errors: result.errors,
    };
  }

  // ---------------------------------------------------------------------------
  // GETTERS
  // ---------------------------------------------------------------------------

  getConfig(): RealHomeConfig {
    return this.config;
  }

  isDryRun(): boolean {
    return this.config.options.dryRun;
  }
}

// =============================================================================
// FACTORY
// =============================================================================

let clientInstance: RealHomeClient | null = null;

export function getRealHomeClient(): RealHomeClient {
  if (!clientInstance) {
    clientInstance = new RealHomeClient();
  }
  return clientInstance;
}

export function resetRealHomeClient(): void {
  clientInstance = null;
}
