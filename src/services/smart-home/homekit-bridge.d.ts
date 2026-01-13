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
    reachable: boolean;
    on?: boolean;
    brightness?: number;
    hue?: number;
    saturation?: number;
    colorTemperature?: number;
    currentTemperature?: number;
    targetTemperature?: number;
    heatingCoolingState?: 'off' | 'heat' | 'cool' | 'auto';
    lockState?: 'locked' | 'unlocked' | 'jammed' | 'unknown';
    motionDetected?: boolean;
    contactState?: 'open' | 'closed';
    currentHumidity?: number;
    lightLevel?: number;
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
/**
 * Sync HomeKit home data from iOS
 * Called when iOS app starts or HomeKit changes are detected
 */
export declare function syncHomeKitState(userId: string, home: HomeKitHome): Promise<void>;
/**
 * Update a single device state (real-time updates from iOS)
 */
export declare function updateDeviceState(userId: string, deviceId: string, state: Partial<HomeKitDeviceState>): Promise<void>;
/**
 * Get all HomeKit devices for a user
 */
export declare function getDevices(userId: string): Promise<HomeKitDevice[]>;
/**
 * Get devices by type
 */
export declare function getDevicesByType(userId: string, type: HomeKitDevice['type']): Promise<HomeKitDevice[]>;
/**
 * Get devices in a room
 */
export declare function getDevicesByRoom(userId: string, room: string): Promise<HomeKitDevice[]>;
/**
 * Get available scenes
 */
export declare function getScenes(userId: string): Promise<HomeKitScene[]>;
/**
 * Check if HomeKit is connected
 */
export declare function isHomeKitConnected(userId: string): Promise<boolean>;
/**
 * Get HomeKit status summary
 */
export declare function getHomeKitStatus(userId: string): Promise<{
    connected: boolean;
    homeName?: string;
    deviceCount: number;
    sceneCount: number;
    lastSync?: string;
}>;
/**
 * Queue a device control command
 */
export declare function queueDeviceCommand(userId: string, deviceId: string, changes: Partial<HomeKitDeviceState>): Promise<string>;
/**
 * Queue a scene activation command
 */
export declare function queueSceneCommand(userId: string, sceneId: string): Promise<string>;
/**
 * Get pending commands (iOS app polls this)
 */
export declare function getPendingCommands(userId: string): Promise<HomeKitCommand[]>;
/**
 * Update command status (iOS app calls this after execution)
 */
export declare function updateCommandStatus(userId: string, commandId: string, status: 'executing' | 'completed' | 'failed', result?: unknown, error?: string): Promise<void>;
/**
 * Activate a vibe through HomeKit
 * Coordinates lights, thermostats, and speakers
 */
export declare function activateHomeKitVibe(userId: string, vibe: string, options?: {
    brightness?: number;
    temperature?: number;
    colorTemperature?: number;
}): Promise<{
    success: boolean;
    commands: string[];
}>;
/**
 * Find and activate a matching HomeKit scene
 */
export declare function activateMatchingScene(userId: string, vibe: string): Promise<boolean>;
/**
 * Process a Siri command forwarded from iOS
 * Returns structured response for Ferni to speak
 */
export declare function processSiriCommand(userId: string, command: string): Promise<{
    understood: boolean;
    action?: string;
    response: string;
}>;
//# sourceMappingURL=homekit-bridge.d.ts.map