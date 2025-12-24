/**
 * Spotify Room Configuration Types
 *
 * Enables multi-room music playback by mapping Spotify devices
 * to user-defined "rooms" (e.g., "Living Room", "Kitchen").
 *
 * Users can say "play jazz in the living room" and Ferni will
 * route to the correct Spotify Connect device(s).
 */

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * A physical or virtual room where music can play
 */
export interface SpotifyRoom {
  /** Unique room identifier */
  id: string;

  /** User-friendly name (e.g., "Living Room", "Kitchen") */
  name: string;

  /** Spotify device IDs assigned to this room */
  deviceIds: string[];

  /** Default volume for this room (0-100) */
  defaultVolume: number;

  /** Optional icon for UI */
  icon?: 'living-room' | 'bedroom' | 'kitchen' | 'office' | 'bathroom' | 'outdoor' | 'custom';

  /** When room was created */
  createdAt: string;

  /** When room was last modified */
  updatedAt: string;
}

/**
 * Group of rooms for "whole house" or "downstairs" playback
 */
export interface SpotifyRoomGroup {
  /** Unique group identifier */
  id: string;

  /** Group name (e.g., "Everywhere", "Downstairs") */
  name: string;

  /** Room IDs in this group */
  roomIds: string[];

  /** When group was created */
  createdAt: string;
}

/**
 * User's complete room configuration
 */
export interface SpotifyRoomConfig {
  /** All configured rooms */
  rooms: SpotifyRoom[];

  /** Room groups for multi-room playback */
  roomGroups: SpotifyRoomGroup[];

  /** Default room for "play music" without location */
  defaultRoomId: string | null;

  /** Last time config was updated */
  updatedAt: string;
}

// ============================================================================
// SPOTIFY DEVICE (from Spotify API)
// ============================================================================

/**
 * Spotify device as returned by the API
 */
export interface SpotifyDevice {
  /** Spotify's device ID */
  id: string;

  /** Device name (e.g., "Living Room Speaker", "John's iPhone") */
  name: string;

  /** Device type */
  type:
    | 'Computer'
    | 'Smartphone'
    | 'Speaker'
    | 'TV'
    | 'AVR'
    | 'STB'
    | 'AudioDongle'
    | 'GameConsole'
    | 'CastVideo'
    | 'CastAudio'
    | 'Automobile'
    | 'Unknown';

  /** Whether this device is currently active */
  is_active: boolean;

  /** Whether this device is restricted */
  is_restricted: boolean;

  /** Whether volume can be set for this device */
  supports_volume: boolean;

  /** Current volume (0-100) */
  volume_percent: number;
}

// ============================================================================
// STORE OPERATIONS
// ============================================================================

/**
 * Result of a room operation
 */
export interface RoomResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Input for creating a new room
 */
export interface CreateRoomInput {
  name: string;
  deviceIds: string[];
  defaultVolume?: number;
  icon?: SpotifyRoom['icon'];
}

/**
 * Input for updating a room
 */
export interface UpdateRoomInput {
  id: string;
  name?: string;
  deviceIds?: string[];
  defaultVolume?: number;
  icon?: SpotifyRoom['icon'];
}

/**
 * Input for creating a room group
 */
export interface CreateRoomGroupInput {
  name: string;
  roomIds: string[];
}

// ============================================================================
// VOICE TOOL RESULTS
// ============================================================================

/**
 * Result of playing music in a room
 */
export interface PlayInRoomResult {
  success: boolean;
  roomName: string;
  deviceNames: string[];
  trackName?: string;
  artistName?: string;
  error?: string;
}

/**
 * Result of transferring music between rooms
 */
export interface TransferRoomResult {
  success: boolean;
  fromRoom?: string;
  toRoom: string;
  deviceName: string;
  error?: string;
}

/**
 * Result of listing rooms
 */
export interface ListRoomsResult {
  rooms: Array<{
    name: string;
    deviceCount: number;
    isPlaying: boolean;
  }>;
  groups: Array<{
    name: string;
    roomCount: number;
  }>;
  defaultRoom: string | null;
}
