/**
 * Configuration - Central Export
 *
 * Application configuration and constants.
 */

export * from './persona-colors.js';
export * from './personas.js';

// ============================================================================
// API ENDPOINTS
// ============================================================================

export const API = {
  TOKEN: '/token',
  SPOTIFY_TOKEN: '/spotify/token',
  SPOTIFY_STATUS: '/spotify/status',
  SPOTIFY_PLAY: '/spotify/play',
  SPOTIFY_PAUSE: '/spotify/pause',
} as const;

// ============================================================================
// STORAGE KEYS
// ============================================================================

export const STORAGE_KEYS = {
  USER_NAME: 'voiceai_userName',
  DEVICE_ID: 'voiceai_deviceId',
  SELECTED_PERSONA: 'voiceai_selectedPersona',
  /** User ID for API calls - Firebase UID or device:{uuid} for legacy */
  USER_ID: 'ferni_user_id',
  /** Firebase UID (if authenticated) */
  FIREBASE_UID: 'ferni_firebase_uid',
} as const;

// ============================================================================
// TIMING CONSTANTS
// ============================================================================

export const TIMING = {
  /** Message display duration in ms */
  MESSAGE_DURATION: 3000,
  /** Quote rotation interval in ms */
  QUOTE_INTERVAL: 8000,
  /** Reconnection delay in ms */
  RECONNECT_DELAY: 2000,
  /** Audio visualization update interval in ms */
  AUDIO_VIZ_INTERVAL: 50,
} as const;

// ============================================================================
// HANDOFF TIMING CONSTANTS
// REFACTORED: Now exported from handoff-timing.ts
// ============================================================================

// Re-export from dedicated module for backwards compatibility
export { HANDOFF_TIMING } from './handoff-timing.js';

// ============================================================================
// AUDIO CONSTANTS
// ============================================================================

/**
 * FIX BUG #23 & #98: Sound effect keys as constants to prevent string typos.
 * These match the SoundEffect type in audio.service.ts.
 */
export const SOUND_EFFECTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  HANDOFF_TO_FERNI: 'handoff-to-ferni',
  HANDOFF_TO_PETER: 'handoff-to-peter',
  HANDOFF_TO_JACK: 'handoff-to-jack',
  HANDOFF_TO_ALEX: 'handoff-to-alex',
  HANDOFF_TO_MAYA: 'handoff-to-maya',
  HANDOFF_TO_JORDAN: 'handoff-to-jordan',
  HANDOFF_TO_NAYAN: 'handoff-to-nayan',
  DRAMATIC_ENTRANCE: 'dramatic-entrance',
} as const;

export const AUDIO = {
  /** Sound effect paths */
  SOUNDS: {
    CONNECT: '/sounds/connect.mp3',
    DISCONNECT: '/sounds/disconnect.mp3',
    HANDOFF_TO_FERNI: '/sounds/handoff-to-ferni.mp3',
    HANDOFF_TO_PETER: '/sounds/handoff-to-peter.mp3',
    HANDOFF_TO_JACK: '/sounds/handoff-to-jack.mp3',
    HANDOFF_TO_ALEX: '/sounds/handoff-to-alex.mp3',
    HANDOFF_TO_MAYA: '/sounds/handoff-to-maya.mp3',
    HANDOFF_TO_JORDAN: '/sounds/handoff-to-jordan.mp3',
    HANDOFF_TO_NAYAN: '/sounds/handoff-to-nayan.mp3',
    DRAMATIC_ENTRANCE: '/sounds/dramatic-entrance.mp3',
  },
  /** Default volumes */
  VOLUMES: {
    EFFECTS: 0.5,
    VOICE: 1.0,
  },
  /**
   * FIX BUG #60: Per-sound volume multipliers for normalization.
   * Adjust these if certain sounds are louder/quieter than others.
   * Value of 1.0 = normal, 0.5 = half volume, 1.5 = 50% louder
   */
  SOUND_VOLUME_MULTIPLIERS: {
    connect: 1.0,
    disconnect: 1.0,
    'handoff-to-ferni': 1.0, // Life coach - warm welcoming chime
    'handoff-to-peter': 1.0,
    'handoff-to-jack': 1.0,
    'handoff-to-alex': 0.85, // Alex sound is slightly louder
    'handoff-to-maya': 0.85, // Maya sound is slightly louder
    'handoff-to-jordan': 0.85, // Jordan sound is slightly louder
    'handoff-to-nayan': 1.0,
    'dramatic-entrance': 0.8, // Dramatic sounds tend to be louder
  } as Record<string, number>,
} as const;
