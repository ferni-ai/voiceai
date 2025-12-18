/**
 * 🔊 GENERATED FILE - DO NOT EDIT DIRECTLY
 *
 * Sound file paths generated from design-system/assets/sounds/
 * Regenerate with: npm run build:sounds
 *
 * Generated: 2025-12-15T21:43:38.305Z
 */

// ============================================================================
// SOUND FILE PATHS
// ============================================================================

/**
 * All available sound files as constants.
 */
export const SOUND_FILES = {
  CONNECT: '/sounds/connect.mp3',
  DISCONNECT: '/sounds/disconnect.mp3',
  DRAMATIC_ENTRANCE: '/sounds/dramatic-entrance.mp3',
  HANDOFF_TO_ALEX: '/sounds/handoff-to-alex.mp3',
  HANDOFF_TO_FERNI: '/sounds/handoff-to-ferni.mp3',
  HANDOFF_TO_JACK: '/sounds/handoff-to-jack.mp3',
  HANDOFF_TO_JORDAN: '/sounds/handoff-to-jordan.mp3',
  HANDOFF_TO_MAYA: '/sounds/handoff-to-maya.mp3',
  HANDOFF_TO_NAYAN: '/sounds/handoff-to-nayan.mp3',
  HANDOFF_TO_PETER: '/sounds/handoff-to-peter.mp3'
} as const;

/**
 * Sound files with camelCase keys for easier access.
 */
export const SOUNDS = {
  connect: '/sounds/connect.mp3',
  disconnect: '/sounds/disconnect.mp3',
  dramaticEntrance: '/sounds/dramatic-entrance.mp3',
  handoffToAlex: '/sounds/handoff-to-alex.mp3',
  handoffToFerni: '/sounds/handoff-to-ferni.mp3',
  handoffToJack: '/sounds/handoff-to-jack.mp3',
  handoffToJordan: '/sounds/handoff-to-jordan.mp3',
  handoffToMaya: '/sounds/handoff-to-maya.mp3',
  handoffToNayan: '/sounds/handoff-to-nayan.mp3',
  handoffToPeter: '/sounds/handoff-to-peter.mp3'
} as const;

// ============================================================================
// SOUND CATEGORIES
// ============================================================================

/**
 * System sounds (connect, disconnect, etc.)
 */
export const SYSTEM_SOUNDS = [
  '/sounds/connect.mp3',
  '/sounds/disconnect.mp3',
  '/sounds/dramatic-entrance.mp3'
] as const;

/**
 * Handoff sounds mapped by persona ID.
 * Usage: HANDOFF_SOUNDS['alex'] → '/sounds/handoff-to-alex.mp3'
 */
export const HANDOFF_SOUNDS: Record<string, string> = {
  'alex': '/sounds/handoff-to-alex.mp3',
  'ferni': '/sounds/handoff-to-ferni.mp3',
  'jack': '/sounds/handoff-to-jack.mp3',
  'jordan': '/sounds/handoff-to-jordan.mp3',
  'maya': '/sounds/handoff-to-maya.mp3',
  'nayan': '/sounds/handoff-to-nayan.mp3',
  'peter': '/sounds/handoff-to-peter.mp3'
};

// ============================================================================
// TYPES
// ============================================================================

/**
 * Type for all sound keys.
 */
export type SoundKey = 'connect' | 'disconnect' | 'dramaticEntrance' | 'handoffToAlex' | 'handoffToFerni' | 'handoffToJack' | 'handoffToJordan' | 'handoffToMaya' | 'handoffToNayan' | 'handoffToPeter';

/**
 * Type for sound file paths.
 */
export type SoundPath = typeof SOUNDS[SoundKey];

/**
 * Persona IDs that have handoff sounds.
 */
export type HandoffSoundPersona = 'alex' | 'ferni' | 'jack' | 'jordan' | 'maya' | 'nayan' | 'peter';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the handoff sound path for a persona.
 * Returns undefined if no handoff sound exists.
 */
export function getHandoffSound(personaId: string): string | undefined {
  // Normalize persona ID (handle variations like 'alex-chen' → 'alex')
  const parts = personaId.toLowerCase().split('-');
  const normalized = parts[0] ?? personaId.toLowerCase();
  return HANDOFF_SOUNDS[normalized];
}

/**
 * Check if a sound file exists in our manifest.
 */
export function isSoundPath(path: string): path is SoundPath {
  return Object.values(SOUNDS).includes(path as SoundPath);
}

/**
 * Get all sound file paths.
 */
export function getAllSoundPaths(): string[] {
  return Object.values(SOUNDS);
}

/**
 * Preload all sounds (returns Audio elements).
 * Call this on app init for instant playback.
 */
export function preloadSounds(): Map<string, HTMLAudioElement> {
  const audioMap = new Map<string, HTMLAudioElement>();
  
  for (const [key, path] of Object.entries(SOUNDS)) {
    const audio = new Audio(path);
    audio.preload = 'auto';
    audioMap.set(key, audio);
  }
  
  return audioMap;
}

/**
 * Play a sound by key.
 * Returns the Audio element for control (pause, etc.)
 */
export function playSound(key: SoundKey): HTMLAudioElement | null {
  const path = SOUNDS[key];
  if (!path) return null;
  
  const audio = new Audio(path);
  audio.play().catch(() => {
    // Ignore autoplay errors (user hasn't interacted yet)
  });
  return audio;
}

/**
 * Play the handoff sound for a persona.
 */
export function playHandoffSound(personaId: string): HTMLAudioElement | null {
  const path = getHandoffSound(personaId);
  if (!path) return null;
  
  const audio = new Audio(path);
  audio.play().catch(() => {});
  return audio;
}
