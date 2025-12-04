/**
 * Configuration - Central Export
 * 
 * Application configuration and constants.
 */

export * from './personas.js';
export * from './persona-colors.js';

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
// HANDOFF TIMING CONSTANTS
// FIX BUG #21 & #29 & #95: Synchronized with backend HANDOFF_DELAYS
// These should match src/agents/shared/constants.ts
// ============================================================================

export const HANDOFF_TIMING = {
  /** User tapped to switch - be snappy and responsive */
  USER_INITIATED_DELAY: 200,
  /** First time meeting this agent - brief theatrical pause */
  FIRST_MEETING_DELAY: 400,
  /** Coming back to the coach - warm, familiar transition */
  RETURNING_TO_COACH_DELAY: 300,
  /** Standard agent-suggested handoff */
  STANDARD_DELAY: 350,
  /** Max delay to wait for visual feedback cleanup */
  MAX_FEEDBACK_DELAY: 500,
  /** Debounce time for rapid handoff prevention */
  DEBOUNCE_MS: 800,
  /** Post-sound pause before voice starts (human-like timing) */
  POST_SOUND_PAUSE_BASE: 250,
  POST_SOUND_PAUSE_FIRST_MEETING_BONUS: 150,
  POST_SOUND_PAUSE_DRAMATIC_BONUS: 100,
} as const;

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
    'connect': 1.0,
    'disconnect': 1.0,
    'handoff-to-ferni': 1.0,    // Life coach - warm welcoming chime
    'handoff-to-peter': 1.0,
    'handoff-to-jack': 1.0,
    'handoff-to-alex': 0.85,    // Alex sound is slightly louder
    'handoff-to-maya': 0.85,    // Maya sound is slightly louder
    'handoff-to-jordan': 0.85,  // Jordan sound is slightly louder
    'handoff-to-nayan': 1.0,
    'dramatic-entrance': 0.8,   // Dramatic sounds tend to be louder
  } as Record<string, number>,
} as const;

