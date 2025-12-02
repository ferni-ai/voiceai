/**
 * Configuration - Central Export
 * 
 * Application configuration and constants.
 */

export * from './personas.js';

// ============================================================================
// API ENDPOINTS
// ============================================================================

export const API = {
  TOKEN: '/token',
  SPOTIFY_TOKEN: '/spotify/token',
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
// AUDIO CONSTANTS
// ============================================================================

export const AUDIO = {
  /** Sound effect paths */
  SOUNDS: {
    CONNECT: '/sounds/connect.mp3',
    DISCONNECT: '/sounds/disconnect.mp3',
    HANDOFF_TO_PETER: '/sounds/handoff-to-peter.mp3',
    HANDOFF_TO_JACK: '/sounds/handoff-to-jack.mp3',
    HANDOFF_TO_ALEX: '/sounds/handoff-to-alex.mp3',
    HANDOFF_TO_MAYA: '/sounds/handoff-to-maya.mp3',
    HANDOFF_TO_JORDAN: '/sounds/handoff-to-jordan.mp3',
    DRAMATIC_ENTRANCE: '/sounds/dramatic-entrance.mp3',
  },
  /** Default volumes */
  VOLUMES: {
    EFFECTS: 0.5,
    VOICE: 1.0,
  },
} as const;

