/**
 * HomeKit Bridge Service
 *
 * Bridges iOS HomeKit with the Ferni backend.
 * The iOS app syncs HomeKit state to Firestore, and can receive
 * commands from the backend to execute via HomeKit.
 *
 * Architecture:
 * - iOS app has native HomeKit access
 * - iOS app syncs device state to Firestore on changes
 * - Backend reads state from Firestore
 * - Backend writes commands to Firestore
 * - iOS app polls/listens for commands and executes them
 *
 * This allows voice commands like "Hey Siri, set my home to relax mode"
 * to be coordinated with Ferni's vibe system.
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'homekit-bridge' });

// ============================================================================
// TYPES
// ============================================================================

export interface HomeKitDevice {
  id: string;
  name: string;
  type: 'light' | 'thermostat' | 'switch' | 'sensor' | 'lock' | 'speaker' | 'tv' | 'other';
  room?: string;
  state: HomeKitDeviceState;
  capabilities: string[];
  lastSeen: string;
}

export interface HomeKitDeviceState {
  // Common
  reachable: boolean;
  
  // Lights
  on?: boolean;
  brightness?: number;
  hue?: number;
  saturation?: number;
  colorTemperature?: number;
  
  // Thermostat
  currentTemperature?: number;
  targetTemperature?: number;
  heatingCoolingState?: 'off' | 'heat' | 'cool' | 'auto';
  
  // Locks
  lockState?: 'locked' | 'unlocked' | 'jammed' | 'unknown';
  
  // Sensors
  motionDetected?: boolean;
  contactState?: 'open' | 'closed';
  currentHumidity?: number;
  lightLevel?: number;
  
  // Speakers/TV
  volume?: number;
  muted?: boolean;
  playing?: boolean;
}

export interface HomeKitScene {
  id: string;
  name: string;
  room?: string;
  actions: Array<{
    deviceId: string;
    changes: Partial<HomeKitDeviceState>;
  }>;
}

export interface HomeKitHome {
  id: string;
  name: string;
  isPrimary: boolean;
  devices: HomeKitDevice[];
  scenes: HomeKitScene[];
  rooms: string[];
}

export interface HomeKitCommand {
  id: string;
  type: 'device_control' | 'scene_activate' | 'query';
  targetDeviceId?: string;
  targetSceneId?: string;
  changes?: Partial<HomeKitDeviceState>;
  query?: string;
  createdAt: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  error?: string;
  result?: unknown;
}

// ============================================================================
// FIRESTORE PATHS
// ============================================================================

function getHomeKitPath(userId: string) {
  return `bogle_users/${userId}/homekit`;
}

function getDevicesPath(userId: string) {
  return `${getHomeKitPath(userId)}/devices`;
}

function getCommandsPath(userId: string) {
  return `${getHomeKitPath(userId)}/commands`;
}

// ============================================================================
// STATE SYNC (Called by iOS app)
// ============================================================================

/**
 * Sync HomeKit home data from iOS
 * Called when iOS app starts or HomeKit changes are detected
 */
export async function syncHomeKitState(userId: string, home: HomeKitHome): Promise<void> {
  const db = getFirestore();
  const batch = db.batch();

  // Save home config
  const homeRef = db.doc(`${getHomeKitPath(userId)}/config`);
  batch.set(homeRef, {
    id: home.id,
    name: home.name,
    isPrimary: home.isPrimary,
    rooms: home.rooms,
    deviceCount: home.devices.length,
    sceneCount: home.scenes.length,
    lastSync: FieldValue.serverTimestamp(),
  }, { merge: true });

  // Save scenes
  const scenesRef = db.doc(`${getHomeKitPath(userId)}/scenes`);
  batch.set(scenesRef, {
    scenes: home.scenes,
    lastSync: FieldValue.serverTimestamp(),
  }, { merge: true });

  // Save each device
  for (const device of home.devices) {
    const deviceRef = db.doc(`${getDevicesPath(userId)}/${device.id}`);
    batch.set(deviceRef, {
      ...device,
      lastSync: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  await batch.commit();
  log.info({ userId, homeId: home.id, deviceCount: home.devices.length }, 'Synced HomeKit state');
}

/**
 * Update a single device state (real-time updates from iOS)
 */
export async function updateDeviceState(
  userId: string,
  deviceId: string,
  state: Partial<HomeKitDeviceState>
): Promise<void> {
  const db = getFirestore();
  const deviceRef = db.doc(`${getDevicesPath(userId)}/${deviceId}`);

  await deviceRef.set({
    state,
    lastSeen: new Date().toISOString(),
    lastSync: FieldValue.serverTimestamp(),
  }, { merge: true });
}

// ============================================================================
// STATE READING (Called by backend)
// ============================================================================

/**
 * Get all HomeKit devices for a user
 */
export async function getDevices(userId: string): Promise<HomeKitDevice[]> {
  const db = getFirestore();
  const snapshot = await db.collection(getDevicesPath(userId)).get();

  return snapshot.docs.map((doc) => doc.data() as HomeKitDevice);
}

/**
 * Get devices by type
 */
export async function getDevicesByType(userId: string, type: HomeKitDevice['type']): Promise<HomeKitDevice[]> {
  const devices = await getDevices(userId);
  return devices.filter((d) => d.type === type);
}

/**
 * Get devices in a room
 */
export async function getDevicesByRoom(userId: string, room: string): Promise<HomeKitDevice[]> {
  const devices = await getDevices(userId);
  return devices.filter((d) => d.room?.toLowerCase() === room.toLowerCase());
}

/**
 * Get available scenes
 */
export async function getScenes(userId: string): Promise<HomeKitScene[]> {
  const db = getFirestore();
  const doc = await db.doc(`${getHomeKitPath(userId)}/scenes`).get();

  if (!doc.exists) return [];
  const data = doc.data() as { scenes: HomeKitScene[] } | undefined;
  return data?.scenes ?? [];
}

/**
 * Check if HomeKit is connected
 */
export async function isHomeKitConnected(userId: string): Promise<boolean> {
  const db = getFirestore();
  const doc = await db.doc(`${getHomeKitPath(userId)}/config`).get();
  return doc.exists;
}

/**
 * Get HomeKit status summary
 */
export async function getHomeKitStatus(userId: string): Promise<{
  connected: boolean;
  homeName?: string;
  deviceCount: number;
  sceneCount: number;
  lastSync?: string;
}> {
  const db = getFirestore();
  const configDoc = await db.doc(`${getHomeKitPath(userId)}/config`).get();

  if (!configDoc.exists) {
    return {
      connected: false,
      deviceCount: 0,
      sceneCount: 0,
    };
  }

  const config = configDoc.data() as {
    name: string;
    deviceCount: number;
    sceneCount: number;
    lastSync: { toDate(): Date };
  };

  return {
    connected: true,
    homeName: config.name,
    deviceCount: config.deviceCount,
    sceneCount: config.sceneCount,
    lastSync: config.lastSync?.toDate?.().toISOString(),
  };
}

// ============================================================================
// COMMAND QUEUE (Backend sends commands to iOS)
// ============================================================================

/**
 * Queue a device control command
 */
export async function queueDeviceCommand(
  userId: string,
  deviceId: string,
  changes: Partial<HomeKitDeviceState>
): Promise<string> {
  const db = getFirestore();
  const commandRef = db.collection(getCommandsPath(userId)).doc();

  const command: HomeKitCommand = {
    id: commandRef.id,
    type: 'device_control',
    targetDeviceId: deviceId,
    changes,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };

  await commandRef.set(command);
  log.info({ userId, deviceId, changes }, 'Queued HomeKit device command');

  return commandRef.id;
}

/**
 * Queue a scene activation command
 */
export async function queueSceneCommand(userId: string, sceneId: string): Promise<string> {
  const db = getFirestore();
  const commandRef = db.collection(getCommandsPath(userId)).doc();

  const command: HomeKitCommand = {
    id: commandRef.id,
    type: 'scene_activate',
    targetSceneId: sceneId,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };

  await commandRef.set(command);
  log.info({ userId, sceneId }, 'Queued HomeKit scene command');

  return commandRef.id;
}

/**
 * Get pending commands (iOS app polls this)
 */
export async function getPendingCommands(userId: string): Promise<HomeKitCommand[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection(getCommandsPath(userId))
    .where('status', '==', 'pending')
    .orderBy('createdAt', 'asc')
    .limit(10)
    .get();

  return snapshot.docs.map((doc) => doc.data() as HomeKitCommand);
}

/**
 * Update command status (iOS app calls this after execution)
 */
export async function updateCommandStatus(
  userId: string,
  commandId: string,
  status: 'executing' | 'completed' | 'failed',
  result?: unknown,
  error?: string
): Promise<void> {
  const db = getFirestore();
  const commandRef = db.doc(`${getCommandsPath(userId)}/${commandId}`);

  await commandRef.update({
    status,
    result,
    error,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

// ============================================================================
// VIBE INTEGRATION
// ============================================================================

/**
 * Activate a vibe through HomeKit
 * Coordinates lights, thermostats, and speakers
 */
export async function activateHomeKitVibe(
  userId: string,
  vibe: string,
  options?: {
    brightness?: number;
    temperature?: number;
    colorTemperature?: number;
  }
): Promise<{ success: boolean; commands: string[] }> {
  const commandIds: string[] = [];

  // Get all devices
  const lights = await getDevicesByType(userId, 'light');
  const thermostats = await getDevicesByType(userId, 'thermostat');

  // Vibe presets
  const vibeSettings: Record<string, {
    brightness: number;
    colorTemp: number;
    targetTemp: number;
  }> = {
    relax: { brightness: 40, colorTemp: 2700, targetTemp: 72 },
    focus: { brightness: 80, colorTemp: 4000, targetTemp: 70 },
    sleep: { brightness: 10, colorTemp: 2200, targetTemp: 68 },
    energy: { brightness: 100, colorTemp: 5000, targetTemp: 68 },
    romance: { brightness: 30, colorTemp: 2500, targetTemp: 72 },
    movie: { brightness: 20, colorTemp: 2700, targetTemp: 72 },
  };

  const settings = vibeSettings[vibe.toLowerCase()] || vibeSettings.relax;
  const brightness = options?.brightness ?? settings.brightness;
  const colorTemp = options?.colorTemperature ?? settings.colorTemp;
  const targetTemp = options?.temperature ?? settings.targetTemp;

  // Control lights
  for (const light of lights) {
    if (light.state.reachable) {
      const commandId = await queueDeviceCommand(userId, light.id, {
        on: brightness > 0,
        brightness,
        colorTemperature: colorTemp,
      });
      commandIds.push(commandId);
    }
  }

  // Control thermostats
  for (const thermostat of thermostats) {
    if (thermostat.state.reachable) {
      const commandId = await queueDeviceCommand(userId, thermostat.id, {
        targetTemperature: targetTemp,
        heatingCoolingState: 'auto',
      });
      commandIds.push(commandId);
    }
  }

  log.info({ userId, vibe, lightCount: lights.length, thermostatCount: thermostats.length }, 'Activated HomeKit vibe');

  return {
    success: commandIds.length > 0,
    commands: commandIds,
  };
}

/**
 * Find and activate a matching HomeKit scene
 */
export async function activateMatchingScene(userId: string, vibe: string): Promise<boolean> {
  const scenes = await getScenes(userId);

  // Look for scene names that match the vibe
  const vibeKeywords: Record<string, string[]> = {
    relax: ['relax', 'chill', 'evening', 'wind down', 'calm'],
    focus: ['focus', 'work', 'bright', 'productive', 'office'],
    sleep: ['sleep', 'night', 'bedtime', 'goodnight', 'dim'],
    energy: ['energy', 'morning', 'bright', 'wake'],
    romance: ['romantic', 'dinner', 'date', 'intimate'],
    movie: ['movie', 'theater', 'cinema', 'watch'],
    party: ['party', 'celebration', 'fun'],
  };

  const keywords = vibeKeywords[vibe.toLowerCase()] || [vibe];

  const matchingScene = scenes.find((scene) =>
    keywords.some((keyword) => scene.name.toLowerCase().includes(keyword))
  );

  if (matchingScene) {
    await queueSceneCommand(userId, matchingScene.id);
    return true;
  }

  return false;
}

// ============================================================================
// SIRI INTEGRATION
// ============================================================================

/**
 * Process a Siri command forwarded from iOS
 * Returns structured response for Ferni to speak
 */
export async function processSiriCommand(
  userId: string,
  command: string
): Promise<{ understood: boolean; action?: string; response: string }> {
  const lowercased = command.toLowerCase();

  // Scene activation patterns
  if (lowercased.includes('set') && lowercased.includes('vibe')) {
    const vibes = ['relax', 'focus', 'sleep', 'energy', 'romance', 'movie', 'party'];
    const matchedVibe = vibes.find((v) => lowercased.includes(v));

    if (matchedVibe) {
      await activateHomeKitVibe(userId, matchedVibe);
      return {
        understood: true,
        action: `activate_vibe_${matchedVibe}`,
        response: `Setting your home to ${matchedVibe} mode.`,
      };
    }
  }

  // Light control
  if (lowercased.includes('light')) {
    const lights = await getDevicesByType(userId, 'light');
    
    if (lowercased.includes('off') || lowercased.includes('turn off')) {
      for (const light of lights) {
        await queueDeviceCommand(userId, light.id, { on: false });
      }
      return {
        understood: true,
        action: 'lights_off',
        response: 'Turning off your lights.',
      };
    }

    if (lowercased.includes('on') || lowercased.includes('turn on')) {
      for (const light of lights) {
        await queueDeviceCommand(userId, light.id, { on: true, brightness: 100 });
      }
      return {
        understood: true,
        action: 'lights_on',
        response: 'Turning on your lights.',
      };
    }

    if (lowercased.includes('dim')) {
      for (const light of lights) {
        await queueDeviceCommand(userId, light.id, { on: true, brightness: 30 });
      }
      return {
        understood: true,
        action: 'lights_dim',
        response: 'Dimming your lights.',
      };
    }
  }

  // Temperature control
  if (lowercased.includes('temperature') || lowercased.includes('thermostat')) {
    const thermostats = await getDevicesByType(userId, 'thermostat');
    
    // Extract temperature number
    const tempMatch = lowercased.match(/(\d{2})\s*(degrees?)?/);
    if (tempMatch) {
      const temp = parseInt(tempMatch[1], 10);
      for (const thermostat of thermostats) {
        await queueDeviceCommand(userId, thermostat.id, { targetTemperature: temp });
      }
      return {
        understood: true,
        action: `set_temp_${temp}`,
        response: `Setting temperature to ${temp} degrees.`,
      };
    }
  }

  return {
    understood: false,
    response: "I'm not sure what you want me to do with your home. Could you try again?",
  };
}
