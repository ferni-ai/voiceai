/**
 * 🎨 GENERATED FILE - DO NOT EDIT DIRECTLY
 *
 * Persona avatar images generated from design-system/tokens/persona-kits.json
 * Regenerate with: npm run build:avatar-images
 *
 * Central source of truth for all persona avatar images.
 * Update images in persona-kits.json, then run the generator.
 *
 * Generated: 2026-02-08T22:58:23.523Z
 */

/**
 * Avatar image configuration for a persona.
 */
export interface AvatarImageConfig {
  /** Image source URL or path */
  src: string;
  /** Alt text for accessibility */
  alt: string;
  /** Fallback initials when image fails to load */
  fallbackInitials: string;
  /** Display name of the persona */
  personaName: string;
  /** Role/title of the persona */
  role: string;
  /** Optional Replicate generation ID for reference */
  replicateId?: string;
}

/**
 * Avatar image configurations from design tokens.
 * These are the canonical avatar images for each persona.
 */
export const PERSONA_AVATAR_IMAGES: Record<string, AvatarImageConfig> = {
  'ferni': {
    src: '/images/avatars/avatar-ferni.png',
    alt: 'Ferni - Your Life Coach',
    fallbackInitials: 'FE',
    personaName: 'Ferni',
    role: 'Life Coach',
  },

  'peter': {
    src: '/images/avatars/avatar-peter.png',
    alt: 'Peter - Your Research Guide',
    fallbackInitials: 'PJ',
    personaName: 'Peter',
    role: 'Research Guide',
  },

  'alex': {
    src: '/images/avatars/avatar-alex.png',
    alt: 'Alex - Your Communication Coach',
    fallbackInitials: 'AC',
    personaName: 'Alex',
    role: 'Communications Coach',
  },

  'maya': {
    src: '/images/avatars/avatar-maya.png',
    alt: 'Maya - Your Habits & Routines Coach',
    fallbackInitials: 'MS',
    personaName: 'Maya',
    role: 'Habit Architect',
  },

  'jordan': {
    src: '/images/avatars/avatar-jordan.png',
    alt: 'Jordan - Your Celebration Catalyst',
    fallbackInitials: 'JT',
    personaName: 'Jordan',
    role: 'Celebration Catalyst',
  },

  'nayan': {
    src: '/images/avatars/avatar-nayan.png',
    alt: 'Nayan - Your Wisdom Guide',
    fallbackInitials: 'NP',
    personaName: 'Nayan',
    role: 'Wisdom Guide',
  }
};

/**
 * List of all persona IDs with avatar images.
 */
export const AVATAR_PERSONA_IDS = [
  "ferni",
  "peter",
  "alex",
  "maya",
  "jordan",
  "nayan"
] as const;

/**
 * Type for valid persona IDs with avatars.
 */
export type AvatarPersonaId = typeof AVATAR_PERSONA_IDS[number];

/**
 * Check if a string is a valid persona ID with an avatar.
 */
export function hasAvatarImage(id: string): id is AvatarPersonaId {
  return AVATAR_PERSONA_IDS.includes(id as AvatarPersonaId);
}

/**
 * Get avatar image config for a persona.
 * Returns undefined if persona not found.
 */
export function getAvatarImage(personaId: string): AvatarImageConfig | undefined {
  return PERSONA_AVATAR_IMAGES[personaId.toLowerCase()];
}

/**
 * Get the avatar image URL for a persona.
 * Returns a default gradient-based avatar path if not found.
 */
export function getAvatarSrc(personaId: string): string {
  const config = getAvatarImage(personaId);
  return config?.src || `/images/avatars/avatar-${personaId}.png`;
}

/**
 * Get fallback initials for a persona.
 */
export function getAvatarInitials(personaId: string): string {
  const config = getAvatarImage(personaId);
  return config?.fallbackInitials || personaId.substring(0, 2).toUpperCase();
}
