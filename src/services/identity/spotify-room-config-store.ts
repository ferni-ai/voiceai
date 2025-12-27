/**
 * Spotify Room Config Store
 *
 * Firestore persistence for room configurations.
 * Maps Spotify devices to user-defined rooms for multi-room playback.
 *
 * Path: bogle_users/{userId}/spotify_room_config/config
 */

import crypto from 'node:crypto';
import type { Firestore as FirestoreType } from '@google-cloud/firestore';
import { removeUndefined, cleanForFirestore } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import type {
  CreateRoomGroupInput,
  CreateRoomInput,
  RoomResult,
  SpotifyRoom,
  SpotifyRoomConfig,
  SpotifyRoomGroup,
  UpdateRoomInput,
} from './spotify-room-types.js';

const log = createLogger({ module: 'spotify-room-config' });

// ============================================================================
// CONFIGURATION
// ============================================================================

const USERS_COLLECTION = 'bogle_users';
const ROOM_CONFIG_DOC = 'spotify_room_config';
const CONFIG_DOC = 'config';

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

let db: FirestoreType | null = null;

async function getFirestore(): Promise<FirestoreType | null> {
  if (db) return db;

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    log.info('Spotify room config Firestore initialized');
    return db;
  } catch (error) {
    log.warn({ error: String(error) }, 'Firestore not available for room config');
    return null;
  }
}

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================

const configCache = new Map<string, SpotifyRoomConfig>();
const loadedUsers = new Set<string>();

function getDefaultConfig(): SpotifyRoomConfig {
  return {
    rooms: [],
    roomGroups: [],
    defaultRoomId: null,
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// LOAD / SAVE
// ============================================================================

/**
 * Load room config from Firestore into cache
 */
async function loadUserConfig(userId: string): Promise<SpotifyRoomConfig> {
  if (loadedUsers.has(userId) && configCache.has(userId)) {
    return configCache.get(userId)!;
  }

  const firestore = await getFirestore();
  if (!firestore) {
    const config = getDefaultConfig();
    configCache.set(userId, config);
    return config;
  }

  try {
    const doc = await firestore
      .collection(USERS_COLLECTION)
      .doc(userId)
      .collection(ROOM_CONFIG_DOC)
      .doc(CONFIG_DOC)
      .get();

    if (doc.exists) {
      const data = doc.data() as SpotifyRoomConfig;
      configCache.set(userId, data);
      loadedUsers.add(userId);
      log.debug({ userId, roomCount: data.rooms.length }, 'Loaded room config from Firestore');
      return data;
    }

    // No config yet, use default
    const config = getDefaultConfig();
    configCache.set(userId, config);
    loadedUsers.add(userId);
    return config;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to load room config');
    const config = getDefaultConfig();
    configCache.set(userId, config);
    return config;
  }
}

/**
 * Save room config to Firestore
 */
async function saveUserConfig(userId: string, config: SpotifyRoomConfig): Promise<boolean> {
  config.updatedAt = new Date().toISOString();
  configCache.set(userId, config);

  const firestore = await getFirestore();
  if (!firestore) {
    log.warn({ userId }, 'Firestore not available, room config saved to cache only');
    return true;
  }

  try {
    await firestore
      .collection(USERS_COLLECTION)
      .doc(userId)
      .collection(ROOM_CONFIG_DOC)
      .doc(CONFIG_DOC)
      .set(removeUndefined(config));

    log.debug({ userId, roomCount: config.rooms.length }, 'Saved room config to Firestore');
    return true;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to save room config');
    return false;
  }
}

// ============================================================================
// ROOM CRUD OPERATIONS
// ============================================================================

/**
 * Get user's room configuration
 */
export async function getRoomConfig(userId: string): Promise<RoomResult<SpotifyRoomConfig>> {
  try {
    const config = await loadUserConfig(userId);
    return { success: true, data: config };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get room config');
    return { success: false, error: 'Failed to get room configuration' };
  }
}

/**
 * Create a new room
 */
export async function createRoom(
  userId: string,
  input: CreateRoomInput
): Promise<RoomResult<SpotifyRoom>> {
  try {
    const config = await loadUserConfig(userId);

    // Check for duplicate name
    if (config.rooms.some((r) => r.name.toLowerCase() === input.name.toLowerCase())) {
      return { success: false, error: `Room "${input.name}" already exists` };
    }

    const room: SpotifyRoom = {
      id: crypto.randomUUID(),
      name: input.name,
      deviceIds: input.deviceIds,
      defaultVolume: input.defaultVolume ?? 50,
      icon: input.icon,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    config.rooms.push(room);

    // If this is the first room, make it default
    if (config.rooms.length === 1) {
      config.defaultRoomId = room.id;
    }

    const saved = await saveUserConfig(userId, config);
    if (!saved) {
      return { success: false, error: 'Failed to save room' };
    }

    log.info({ userId, roomId: room.id, roomName: room.name }, 'Room created');
    return { success: true, data: room };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to create room');
    return { success: false, error: 'Failed to create room' };
  }
}

/**
 * Update an existing room
 */
export async function updateRoom(
  userId: string,
  input: UpdateRoomInput
): Promise<RoomResult<SpotifyRoom>> {
  try {
    const config = await loadUserConfig(userId);

    const roomIndex = config.rooms.findIndex((r) => r.id === input.id);
    if (roomIndex === -1) {
      return { success: false, error: 'Room not found' };
    }

    // Check for duplicate name (if changing name)
    if (
      input.name &&
      config.rooms.some(
        (r) => r.id !== input.id && r.name.toLowerCase() === input.name!.toLowerCase()
      )
    ) {
      return { success: false, error: `Room "${input.name}" already exists` };
    }

    const room = config.rooms[roomIndex];
    const updatedRoom: SpotifyRoom = {
      ...room,
      name: input.name ?? room.name,
      deviceIds: input.deviceIds ?? room.deviceIds,
      defaultVolume: input.defaultVolume ?? room.defaultVolume,
      icon: input.icon ?? room.icon,
      updatedAt: new Date().toISOString(),
    };

    config.rooms[roomIndex] = updatedRoom;

    const saved = await saveUserConfig(userId, config);
    if (!saved) {
      return { success: false, error: 'Failed to save room' };
    }

    log.info({ userId, roomId: room.id, roomName: updatedRoom.name }, 'Room updated');
    return { success: true, data: updatedRoom };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to update room');
    return { success: false, error: 'Failed to update room' };
  }
}

/**
 * Delete a room
 */
export async function deleteRoom(userId: string, roomId: string): Promise<RoomResult<void>> {
  try {
    const config = await loadUserConfig(userId);

    const roomIndex = config.rooms.findIndex((r) => r.id === roomId);
    if (roomIndex === -1) {
      return { success: false, error: 'Room not found' };
    }

    const room = config.rooms[roomIndex];
    config.rooms.splice(roomIndex, 1);

    // Remove from any groups
    for (const group of config.roomGroups) {
      group.roomIds = group.roomIds.filter((id) => id !== roomId);
    }

    // Update default if needed
    if (config.defaultRoomId === roomId) {
      config.defaultRoomId = config.rooms[0]?.id ?? null;
    }

    const saved = await saveUserConfig(userId, config);
    if (!saved) {
      return { success: false, error: 'Failed to delete room' };
    }

    log.info({ userId, roomId, roomName: room.name }, 'Room deleted');
    return { success: true };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to delete room');
    return { success: false, error: 'Failed to delete room' };
  }
}

/**
 * Set the default room
 */
export async function setDefaultRoom(
  userId: string,
  roomId: string | null
): Promise<RoomResult<void>> {
  try {
    const config = await loadUserConfig(userId);

    if (roomId !== null && !config.rooms.some((r) => r.id === roomId)) {
      return { success: false, error: 'Room not found' };
    }

    config.defaultRoomId = roomId;

    const saved = await saveUserConfig(userId, config);
    if (!saved) {
      return { success: false, error: 'Failed to set default room' };
    }

    log.info({ userId, roomId }, 'Default room set');
    return { success: true };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to set default room');
    return { success: false, error: 'Failed to set default room' };
  }
}

// ============================================================================
// ROOM GROUP OPERATIONS
// ============================================================================

/**
 * Create a room group
 */
export async function createRoomGroup(
  userId: string,
  input: CreateRoomGroupInput
): Promise<RoomResult<SpotifyRoomGroup>> {
  try {
    const config = await loadUserConfig(userId);

    // Check for duplicate name
    if (config.roomGroups.some((g) => g.name.toLowerCase() === input.name.toLowerCase())) {
      return { success: false, error: `Group "${input.name}" already exists` };
    }

    // Validate room IDs
    const validRoomIds = input.roomIds.filter((id) => config.rooms.some((r) => r.id === id));
    if (validRoomIds.length === 0) {
      return { success: false, error: 'No valid rooms specified' };
    }

    const group: SpotifyRoomGroup = {
      id: crypto.randomUUID(),
      name: input.name,
      roomIds: validRoomIds,
      createdAt: new Date().toISOString(),
    };

    config.roomGroups.push(group);

    const saved = await saveUserConfig(userId, config);
    if (!saved) {
      return { success: false, error: 'Failed to save group' };
    }

    log.info({ userId, groupId: group.id, groupName: group.name }, 'Room group created');
    return { success: true, data: group };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to create room group');
    return { success: false, error: 'Failed to create room group' };
  }
}

/**
 * Delete a room group
 */
export async function deleteRoomGroup(userId: string, groupId: string): Promise<RoomResult<void>> {
  try {
    const config = await loadUserConfig(userId);

    const groupIndex = config.roomGroups.findIndex((g) => g.id === groupId);
    if (groupIndex === -1) {
      return { success: false, error: 'Group not found' };
    }

    const group = config.roomGroups[groupIndex];
    config.roomGroups.splice(groupIndex, 1);

    const saved = await saveUserConfig(userId, config);
    if (!saved) {
      return { success: false, error: 'Failed to delete group' };
    }

    log.info({ userId, groupId, groupName: group.name }, 'Room group deleted');
    return { success: true };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to delete room group');
    return { success: false, error: 'Failed to delete room group' };
  }
}

// ============================================================================
// LOOKUP HELPERS
// ============================================================================

/**
 * Find a room by name (case-insensitive, fuzzy)
 */
export async function findRoomByName(
  userId: string,
  roomName: string
): Promise<RoomResult<SpotifyRoom>> {
  try {
    const config = await loadUserConfig(userId);
    const normalizedName = roomName.toLowerCase().trim();

    // Exact match first
    let room = config.rooms.find((r) => r.name.toLowerCase() === normalizedName);

    // Fuzzy match if no exact match
    if (!room) {
      room = config.rooms.find(
        (r) =>
          r.name.toLowerCase().includes(normalizedName) ||
          normalizedName.includes(r.name.toLowerCase())
      );
    }

    if (!room) {
      return { success: false, error: `Room "${roomName}" not found` };
    }

    return { success: true, data: room };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to find room');
    return { success: false, error: 'Failed to find room' };
  }
}

/**
 * Find a room group by name (case-insensitive, fuzzy)
 */
export async function findRoomGroupByName(
  userId: string,
  groupName: string
): Promise<RoomResult<SpotifyRoomGroup & { roomIds: string[] }>> {
  try {
    const config = await loadUserConfig(userId);
    const normalizedName = groupName.toLowerCase().trim();

    // Check for special keywords
    if (normalizedName === 'everywhere' || normalizedName === 'all') {
      // Return all rooms as a virtual group
      return {
        success: true,
        data: {
          id: 'everywhere',
          name: 'Everywhere',
          roomIds: config.rooms.map((r) => r.id),
          createdAt: new Date().toISOString(),
        },
      };
    }

    // Exact match first
    let group = config.roomGroups.find((g) => g.name.toLowerCase() === normalizedName);

    // Fuzzy match if no exact match
    if (!group) {
      group = config.roomGroups.find(
        (g) =>
          g.name.toLowerCase().includes(normalizedName) ||
          normalizedName.includes(g.name.toLowerCase())
      );
    }

    if (!group) {
      return { success: false, error: `Group "${groupName}" not found` };
    }

    return { success: true, data: group };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to find room group');
    return { success: false, error: 'Failed to find room group' };
  }
}

/**
 * Get all device IDs for a room (or rooms in a group)
 */
export async function getDevicesForRoom(
  userId: string,
  roomOrGroupName: string
): Promise<RoomResult<string[]>> {
  try {
    const config = await loadUserConfig(userId);
    const normalizedName = roomOrGroupName.toLowerCase().trim();

    // Check for "everywhere" / "all"
    if (normalizedName === 'everywhere' || normalizedName === 'all') {
      const allDeviceIds = config.rooms.flatMap((r) => r.deviceIds);
      return { success: true, data: [...new Set(allDeviceIds)] };
    }

    // Try as a room first
    const room = config.rooms.find(
      (r) =>
        r.name.toLowerCase() === normalizedName ||
        r.name.toLowerCase().includes(normalizedName) ||
        normalizedName.includes(r.name.toLowerCase())
    );

    if (room) {
      return { success: true, data: room.deviceIds };
    }

    // Try as a group
    const group = config.roomGroups.find(
      (g) =>
        g.name.toLowerCase() === normalizedName ||
        g.name.toLowerCase().includes(normalizedName) ||
        normalizedName.includes(g.name.toLowerCase())
    );

    if (group) {
      const deviceIds = group.roomIds.flatMap(
        (roomId) => config.rooms.find((r) => r.id === roomId)?.deviceIds ?? []
      );
      return { success: true, data: [...new Set(deviceIds)] };
    }

    return { success: false, error: `Room or group "${roomOrGroupName}" not found` };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get devices for room');
    return { success: false, error: 'Failed to get devices' };
  }
}

/**
 * Get the default room
 */
export async function getDefaultRoom(userId: string): Promise<RoomResult<SpotifyRoom | null>> {
  try {
    const config = await loadUserConfig(userId);

    if (!config.defaultRoomId) {
      return { success: true, data: null };
    }

    const room = config.rooms.find((r) => r.id === config.defaultRoomId);
    return { success: true, data: room ?? null };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get default room');
    return { success: false, error: 'Failed to get default room' };
  }
}

/**
 * List all rooms (for voice tool response)
 */
export async function listRooms(userId: string): Promise<
  RoomResult<{
    rooms: SpotifyRoom[];
    groups: SpotifyRoomGroup[];
    defaultRoomId: string | null;
  }>
> {
  try {
    const config = await loadUserConfig(userId);
    return {
      success: true,
      data: {
        rooms: config.rooms,
        groups: config.roomGroups,
        defaultRoomId: config.defaultRoomId,
      },
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to list rooms');
    return { success: false, error: 'Failed to list rooms' };
  }
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clear cache for a user (call on session end)
 */
export function clearUserCache(userId: string): void {
  configCache.delete(userId);
  loadedUsers.delete(userId);
  log.debug({ userId }, 'Cleared room config cache');
}

/**
 * Clear all caches (for testing/reset)
 */
export function clearAllCaches(): void {
  configCache.clear();
  loadedUsers.clear();
  log.debug('Cleared all room config caches');
}
