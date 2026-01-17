/**
 * Mock Smart Home Simulator
 *
 * Simulates smart home platforms for testing vibe/home automation flows.
 * Supports Home Assistant, Philips Hue, LIFX, and Ecobee thermostats.
 *
 * This enables comprehensive E2E testing without real smart home devices.
 */

// ============================================================================
// TYPES
// ============================================================================

export type SmartHomePlatform = 'home_assistant' | 'hue' | 'lifx' | 'ecobee';

export type DeviceType = 'light' | 'switch' | 'thermostat' | 'lock' | 'sensor' | 'fan' | 'cover';

export type DeviceState = 'on' | 'off' | 'unknown' | 'unavailable';

export type ResponseBehavior =
  | 'success'
  | 'timeout'
  | 'circuit_open'
  | 'device_offline'
  | 'auth_failed'
  | 'rate_limited';

export interface MockDevice {
  id: string;
  name: string;
  type: DeviceType;
  platform: SmartHomePlatform;
  state: DeviceState;
  attributes: {
    brightness?: number; // 0-100
    colorTemp?: number; // 2000-7000K
    color?: string; // hex
    temperature?: number; // current temp
    targetTemp?: number;
    humidity?: number;
    locked?: boolean;
    position?: number; // 0-100 for covers
  };
  room?: string;
  online: boolean;
}

export interface MockSmartHomeConfig {
  name: string;
  platforms: SmartHomePlatform[];
  devices: MockDevice[];

  // Response behavior per platform
  behaviors: Partial<Record<SmartHomePlatform, ResponseBehavior>>;

  // Network simulation
  latency: number; // ms delay before responding
  failureRate: number; // 0-1 probability of random failure

  // State tracking
  commandHistory: CommandHistoryEntry[];
}

export interface CommandHistoryEntry {
  timestamp: Date;
  platform: SmartHomePlatform;
  deviceId: string;
  command: string;
  args: Record<string, unknown>;
  result: 'success' | 'failure';
  error?: string;
}

export interface DeviceCommandResult {
  success: boolean;
  device: MockDevice | null;
  error?: string;
  latency: number;
}

export interface VibeActivationResult {
  success: boolean;
  preset: string;
  applied: {
    music: boolean;
    lights: boolean;
    temperature: boolean;
  };
  deviceResults: Array<{
    device: string;
    success: boolean;
    error?: string;
  }>;
  errors: string[];
  message: string;
}

// ============================================================================
// MOCK SMART HOME CLASS
// ============================================================================

export class MockSmartHome {
  private config: MockSmartHomeConfig;
  private deviceStates: Map<string, MockDevice>;

  constructor(config: MockSmartHomeConfig) {
    this.config = config;
    this.deviceStates = new Map();

    // Initialize device states
    for (const device of config.devices) {
      this.deviceStates.set(device.id, { ...device });
    }
  }

  // ============================================================================
  // DEVICE QUERIES
  // ============================================================================

  /**
   * Get all devices (simulates getAllDevices)
   */
  async getAllDevices(): Promise<MockDevice[]> {
    await this.simulateLatency();

    if (this.shouldFail('home_assistant')) {
      throw new Error('Home Assistant unavailable');
    }

    return Array.from(this.deviceStates.values()).filter((d) => d.online);
  }

  /**
   * Get devices by type
   */
  async getDevicesByType(type: DeviceType): Promise<MockDevice[]> {
    const devices = await this.getAllDevices();
    return devices.filter((d) => d.type === type);
  }

  /**
   * Get devices by room
   */
  async getDevicesByRoom(room: string): Promise<MockDevice[]> {
    const devices = await this.getAllDevices();
    return devices.filter((d) => d.room?.toLowerCase() === room.toLowerCase());
  }

  /**
   * Get device by ID or name
   */
  async getDevice(idOrName: string): Promise<MockDevice | null> {
    await this.simulateLatency();

    // Try by ID
    let device = this.deviceStates.get(idOrName);

    // Try by name
    if (!device) {
      device = Array.from(this.deviceStates.values()).find(
        (d) => d.name.toLowerCase().includes(idOrName.toLowerCase())
      );
    }

    return device || null;
  }

  // ============================================================================
  // DEVICE CONTROL
  // ============================================================================

  /**
   * Control a device (simulates controlDevice)
   */
  async controlDevice(
    deviceIdOrName: string,
    action: 'on' | 'off' | 'toggle' | 'set',
    value?: number | string
  ): Promise<DeviceCommandResult> {
    const startTime = Date.now();
    await this.simulateLatency();

    const device = await this.getDevice(deviceIdOrName);
    if (!device) {
      return {
        success: false,
        device: null,
        error: `Device not found: ${deviceIdOrName}`,
        latency: Date.now() - startTime,
      };
    }

    // Check platform behavior
    if (this.shouldFail(device.platform)) {
      const error = this.getFailureError(device.platform);
      this.logCommand(device, 'control', { action, value }, 'failure', error);
      return {
        success: false,
        device,
        error,
        latency: Date.now() - startTime,
      };
    }

    // Check if device is online
    if (!device.online) {
      const error = `Device offline: ${device.name}`;
      this.logCommand(device, 'control', { action, value }, 'failure', error);
      return {
        success: false,
        device,
        error,
        latency: Date.now() - startTime,
      };
    }

    // Apply the action
    let newState: DeviceState;

    switch (action) {
      case 'on':
        newState = 'on';
        break;
      case 'off':
        newState = 'off';
        break;
      case 'toggle':
        newState = device.state === 'on' ? 'off' : 'on';
        break;
      case 'set':
        newState = 'on';
        if (typeof value === 'number' && device.type === 'light') {
          device.attributes.brightness = Math.min(100, Math.max(0, value));
        }
        if (typeof value === 'number' && device.type === 'thermostat') {
          device.attributes.targetTemp = value;
        }
        break;
      default:
        newState = device.state;
    }

    device.state = newState;
    this.deviceStates.set(device.id, device);
    this.logCommand(device, 'control', { action, value }, 'success');

    return {
      success: true,
      device,
      latency: Date.now() - startTime,
    };
  }

  /**
   * Set light brightness
   */
  async setLightBrightness(deviceIdOrName: string, brightness: number): Promise<DeviceCommandResult> {
    return this.controlDevice(deviceIdOrName, 'set', brightness);
  }

  /**
   * Set light color temperature
   */
  async setLightColorTemp(deviceIdOrName: string, colorTemp: number): Promise<DeviceCommandResult> {
    const device = await this.getDevice(deviceIdOrName);
    if (!device || device.type !== 'light') {
      return {
        success: false,
        device,
        error: 'Light not found',
        latency: 0,
      };
    }

    device.attributes.colorTemp = Math.min(7000, Math.max(2000, colorTemp));
    this.deviceStates.set(device.id, device);
    return {
      success: true,
      device,
      latency: 0,
    };
  }

  /**
   * Set thermostat temperature
   */
  async setThermostat(temperature: number, mode?: 'home' | 'away' | 'sleep'): Promise<DeviceCommandResult> {
    const startTime = Date.now();
    await this.simulateLatency();

    const thermostat = Array.from(this.deviceStates.values()).find((d) => d.type === 'thermostat');

    if (!thermostat) {
      return {
        success: false,
        device: null,
        error: 'No thermostat found',
        latency: Date.now() - startTime,
      };
    }

    if (!thermostat.online) {
      this.logCommand(thermostat, 'setTemperature', { temperature, mode }, 'failure', 'Thermostat offline');
      return {
        success: false,
        device: thermostat,
        error: 'Thermostat offline',
        latency: Date.now() - startTime,
      };
    }

    if (this.shouldFail('ecobee')) {
      const error = this.getFailureError('ecobee');
      this.logCommand(thermostat, 'setTemperature', { temperature, mode }, 'failure', error);
      return {
        success: false,
        device: thermostat,
        error,
        latency: Date.now() - startTime,
      };
    }

    thermostat.attributes.targetTemp = temperature;
    this.deviceStates.set(thermostat.id, thermostat);
    this.logCommand(thermostat, 'setTemperature', { temperature, mode }, 'success');

    return {
      success: true,
      device: thermostat,
      latency: Date.now() - startTime,
    };
  }

  /**
   * Get thermostat status
   */
  async getThermostatStatus(): Promise<{
    connected: boolean;
    current: number;
    target: number;
    humidity?: number;
    mode: string;
  }> {
    await this.simulateLatency();

    const thermostat = Array.from(this.deviceStates.values()).find((d) => d.type === 'thermostat');

    if (!thermostat || !thermostat.online) {
      return {
        connected: false,
        current: 70,
        target: 70,
        mode: 'home',
      };
    }

    return {
      connected: true,
      current: thermostat.attributes.temperature || 70,
      target: thermostat.attributes.targetTemp || 70,
      humidity: thermostat.attributes.humidity,
      mode: 'home',
    };
  }

  // ============================================================================
  // VIBE SIMULATION
  // ============================================================================

  /**
   * Simulate activating a vibe preset
   */
  async activateVibe(preset: VibePresetConfig): Promise<VibeActivationResult> {
    const result: VibeActivationResult = {
      success: true,
      preset: preset.id,
      applied: {
        music: false,
        lights: false,
        temperature: false,
      },
      deviceResults: [],
      errors: [],
      message: '',
    };

    // Apply music (simulated)
    if (preset.music) {
      result.applied.music = true;
    }

    // Apply lights - wrapped in try/catch for graceful degradation
    if (preset.lights) {
      try {
        const lights = await this.getDevicesByType('light');
        let lightsSuccess = false;

        for (const light of lights) {
          const controlResult = await this.controlDevice(light.id, 'set', preset.lights.brightness);
          result.deviceResults.push({
            device: light.name,
            success: controlResult.success,
            error: controlResult.error,
          });

          if (controlResult.success) {
            lightsSuccess = true;
            if (preset.lights.colorTemp) {
              await this.setLightColorTemp(light.id, preset.lights.colorTemp);
            }
          }
        }

        result.applied.lights = lightsSuccess;
        if (!lightsSuccess && lights.length > 0) {
          result.errors.push('Failed to control lights');
        }
      } catch (err) {
        result.errors.push(err instanceof Error ? err.message : 'Lights unavailable');
      }
    }

    // Apply temperature
    if (preset.temperature) {
      const tempResult = await this.setThermostat(preset.temperature.target);
      result.applied.temperature = tempResult.success;

      if (!tempResult.success) {
        result.errors.push(tempResult.error || 'Failed to set temperature');
      }
    }

    // Build message
    const appliedParts: string[] = [];
    if (result.applied.music) appliedParts.push('music');
    if (result.applied.lights) appliedParts.push('lights');
    if (result.applied.temperature) appliedParts.push('temperature');

    if (appliedParts.length > 0) {
      result.message = `${preset.name} vibe set! Adjusted ${appliedParts.join(', ')}.`;
    } else {
      result.success = false;
      result.message = `Couldn't set ${preset.name} vibe. ${result.errors[0] || 'No devices responded.'}`;
    }

    return result;
  }

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  /**
   * Set device online/offline status
   */
  setDeviceOnline(deviceId: string, online: boolean): void {
    const device = this.deviceStates.get(deviceId);
    if (device) {
      device.online = online;
      this.deviceStates.set(deviceId, device);
    }
  }

  /**
   * Set platform behavior
   */
  setPlatformBehavior(platform: SmartHomePlatform, behavior: ResponseBehavior): void {
    this.config.behaviors[platform] = behavior;
  }

  /**
   * Reset all devices to default state
   */
  reset(): void {
    for (const device of this.config.devices) {
      this.deviceStates.set(device.id, { ...device });
    }
    this.config.commandHistory = [];
  }

  /**
   * Get command history
   */
  getCommandHistory(): CommandHistoryEntry[] {
    return [...this.config.commandHistory];
  }

  /**
   * Get state snapshot
   */
  getStateSnapshot(): Record<string, MockDevice> {
    const snapshot: Record<string, MockDevice> = {};
    for (const [id, device] of this.deviceStates) {
      snapshot[id] = { ...device };
    }
    return snapshot;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private async simulateLatency(): Promise<void> {
    if (this.config.latency > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latency));
    }
  }

  private shouldFail(platform: SmartHomePlatform): boolean {
    // Check explicit behavior
    const behavior = this.config.behaviors[platform];
    if (behavior && behavior !== 'success') {
      return true;
    }

    // Random failure
    if (this.config.failureRate > 0 && Math.random() < this.config.failureRate) {
      return true;
    }

    return false;
  }

  private getFailureError(platform: SmartHomePlatform): string {
    const behavior = this.config.behaviors[platform] || 'success';

    switch (behavior) {
      case 'timeout':
        return `${platform} request timed out`;
      case 'circuit_open':
        return `${platform} circuit breaker is open`;
      case 'device_offline':
        return `${platform} device is offline`;
      case 'auth_failed':
        return `${platform} authentication failed`;
      case 'rate_limited':
        return `${platform} rate limit exceeded`;
      default:
        return 'Unknown error';
    }
  }

  private logCommand(
    device: MockDevice,
    command: string,
    args: Record<string, unknown>,
    result: 'success' | 'failure',
    error?: string
  ): void {
    this.config.commandHistory.push({
      timestamp: new Date(),
      platform: device.platform,
      deviceId: device.id,
      command,
      args,
      result,
      error,
    });
  }
}

// ============================================================================
// VIBE PRESET TYPES
// ============================================================================

export interface VibePresetConfig {
  id: string;
  name: string;
  music?: {
    genre: string;
    energy: 'low' | 'medium' | 'high';
    volume: number;
  };
  lights?: {
    brightness: number;
    colorTemp: number;
    color?: string;
  };
  temperature?: {
    target: number;
    mode: 'home' | 'away' | 'sleep';
  };
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a fully connected smart home (happy path)
 */
export function createConnectedHome(overrides?: Partial<MockSmartHomeConfig>): MockSmartHomeConfig {
  return {
    name: 'Connected Smart Home',
    platforms: ['home_assistant', 'hue', 'ecobee'],
    devices: [
      {
        id: 'light.living_room',
        name: 'Living Room Light',
        type: 'light',
        platform: 'home_assistant',
        state: 'on',
        attributes: { brightness: 80, colorTemp: 4000 },
        room: 'Living Room',
        online: true,
      },
      {
        id: 'light.bedroom',
        name: 'Bedroom Light',
        type: 'light',
        platform: 'hue',
        state: 'off',
        attributes: { brightness: 0, colorTemp: 2700 },
        room: 'Bedroom',
        online: true,
      },
      {
        id: 'light.kitchen',
        name: 'Kitchen Light',
        type: 'light',
        platform: 'hue',
        state: 'on',
        attributes: { brightness: 100, colorTemp: 5000 },
        room: 'Kitchen',
        online: true,
      },
      {
        id: 'thermostat.main',
        name: 'Main Thermostat',
        type: 'thermostat',
        platform: 'ecobee',
        state: 'on',
        attributes: { temperature: 72, targetTemp: 70, humidity: 45 },
        online: true,
      },
      {
        id: 'lock.front',
        name: 'Front Door Lock',
        type: 'lock',
        platform: 'home_assistant',
        state: 'on',
        attributes: { locked: true },
        online: true,
      },
    ],
    behaviors: {
      home_assistant: 'success',
      hue: 'success',
      ecobee: 'success',
    },
    latency: 50,
    failureRate: 0,
    commandHistory: [],
    ...overrides,
  };
}

/**
 * Create a home with partial device availability
 */
export function createPartialHome(overrides?: Partial<MockSmartHomeConfig>): MockSmartHomeConfig {
  const config = createConnectedHome(overrides);
  config.name = 'Partial Smart Home';

  // Some devices offline
  config.devices[1].online = false; // Bedroom light offline
  config.behaviors.ecobee = 'timeout'; // Thermostat slow

  return config;
}

/**
 * Create a home with no devices (edge case)
 */
export function createEmptyHome(overrides?: Partial<MockSmartHomeConfig>): MockSmartHomeConfig {
  return {
    name: 'Empty Home',
    platforms: [],
    devices: [],
    behaviors: {},
    latency: 0,
    failureRate: 0,
    commandHistory: [],
    ...overrides,
  };
}

/**
 * Create a home with circuit breaker open
 */
export function createCircuitOpenHome(overrides?: Partial<MockSmartHomeConfig>): MockSmartHomeConfig {
  const config = createConnectedHome(overrides);
  config.name = 'Circuit Open Home';
  config.behaviors = {
    home_assistant: 'circuit_open',
    hue: 'circuit_open',
    ecobee: 'circuit_open',
  };
  return config;
}

/**
 * Create a home with high latency
 */
export function createSlowHome(overrides?: Partial<MockSmartHomeConfig>): MockSmartHomeConfig {
  const config = createConnectedHome(overrides);
  config.name = 'Slow Home';
  config.latency = 500; // 500ms delay per operation
  return config;
}

/**
 * Create a home with flaky connections
 */
export function createFlakyHome(overrides?: Partial<MockSmartHomeConfig>): MockSmartHomeConfig {
  const config = createConnectedHome(overrides);
  config.name = 'Flaky Home';
  config.failureRate = 0.3; // 30% random failure rate
  return config;
}

// ============================================================================
// VIBE PRESET FACTORIES
// ============================================================================

export const MOCK_VIBE_PRESETS: Record<string, VibePresetConfig> = {
  focus: {
    id: 'focus',
    name: 'Focus',
    music: { genre: 'ambient', energy: 'low', volume: 30 },
    lights: { brightness: 80, colorTemp: 5000 },
    temperature: { target: 68, mode: 'home' },
  },
  relax: {
    id: 'relax',
    name: 'Relax',
    music: { genre: 'jazz', energy: 'low', volume: 40 },
    lights: { brightness: 40, colorTemp: 2700 },
    temperature: { target: 72, mode: 'home' },
  },
  energize: {
    id: 'energize',
    name: 'Energize',
    music: { genre: 'pop', energy: 'high', volume: 60 },
    lights: { brightness: 100, colorTemp: 6500 },
    temperature: { target: 66, mode: 'home' },
  },
  sleep: {
    id: 'sleep',
    name: 'Sleep',
    music: { genre: 'sleep', energy: 'low', volume: 15 },
    lights: { brightness: 5, colorTemp: 2200 },
    temperature: { target: 67, mode: 'sleep' },
  },
  social: {
    id: 'social',
    name: 'Gather',
    music: { genre: 'indie', energy: 'medium', volume: 50 },
    lights: { brightness: 70, colorTemp: 3000 },
    temperature: { target: 70, mode: 'home' },
  },
  // Additional vibes for voice command tests
  movie: {
    id: 'movie',
    name: 'Movie Night',
    music: { genre: 'cinematic', energy: 'low', volume: 20 },
    lights: { brightness: 10, colorTemp: 2400 },
    temperature: { target: 71, mode: 'home' },
  },
  meditation: {
    id: 'meditation',
    name: 'Meditation',
    music: { genre: 'nature', energy: 'low', volume: 15 },
    lights: { brightness: 20, colorTemp: 2700 },
    temperature: { target: 72, mode: 'home' },
  },
  workout: {
    id: 'workout',
    name: 'Workout',
    music: { genre: 'electronic', energy: 'high', volume: 70 },
    lights: { brightness: 100, colorTemp: 6000 },
    temperature: { target: 64, mode: 'home' },
  },
  romantic: {
    id: 'romantic',
    name: 'Romantic',
    music: { genre: 'soul', energy: 'low', volume: 35 },
    lights: { brightness: 25, colorTemp: 2400 },
    temperature: { target: 72, mode: 'home' },
  },
  cooking: {
    id: 'cooking',
    name: 'Cooking',
    music: { genre: 'world', energy: 'medium', volume: 45 },
    lights: { brightness: 100, colorTemp: 4000 },
    temperature: { target: 68, mode: 'home' },
  },
  reading: {
    id: 'reading',
    name: 'Reading',
    music: { genre: 'classical', energy: 'low', volume: 20 },
    lights: { brightness: 60, colorTemp: 3000 },
    temperature: { target: 71, mode: 'home' },
  },
  creative: {
    id: 'creative',
    name: 'Creative',
    music: { genre: 'lo-fi', energy: 'medium', volume: 35 },
    lights: { brightness: 85, colorTemp: 5500 },
    temperature: { target: 69, mode: 'home' },
  },
  gaming: {
    id: 'gaming',
    name: 'Gaming',
    music: { genre: 'electronic', energy: 'medium', volume: 40 },
    lights: { brightness: 30, colorTemp: 4500 },
    temperature: { target: 68, mode: 'home' },
  },
  dinner: {
    id: 'dinner',
    name: 'Dinner',
    music: { genre: 'jazz', energy: 'low', volume: 30 },
    lights: { brightness: 50, colorTemp: 2800 },
    temperature: { target: 71, mode: 'home' },
  },
  morning: {
    id: 'morning',
    name: 'Morning',
    music: { genre: 'acoustic', energy: 'medium', volume: 35 },
    lights: { brightness: 90, colorTemp: 4500 },
    temperature: { target: 70, mode: 'home' },
  },
};

export function getVibePreset(id: string): VibePresetConfig | undefined {
  return MOCK_VIBE_PRESETS[id];
}
