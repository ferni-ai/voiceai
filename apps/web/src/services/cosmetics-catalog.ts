/**
 * Cosmetics types and catalog data. Extracted from cosmetics.service.ts.
 */

export type CosmeticType = 'avatar-skin' | 'ui-theme' | 'voice-pack' | 'sound-pack' | 'emote';
export type CosmeticRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type SubscriptionTier = 'free' | 'friend' | 'partner';

export interface CosmeticItem {
  id: string;
  name: string;
  description: string;
  type: CosmeticType;
  rarity: CosmeticRarity;
  previewUrl?: string;
  /** Price in Seeds (null = earned/default) */
  priceInSeeds: number | null;
  /** Minimum tier to purchase */
  requiredTier: SubscriptionTier;
  /** Is this limited time? */
  isLimited: boolean;
  /** CSS variables or config for this cosmetic */
  config?: Record<string, string>;
}

export interface UserCosmetics {
  ownedItems: string[];
  equipped: {
    'avatar-skin': string | null;
    'ui-theme': string | null;
    'voice-pack': string | null;
    'sound-pack': string | null;
    emote: string | null;
  };
  seedBalance: number;
}

// ============================================================================
// DEFAULT COSMETICS (Available to everyone)
// ============================================================================

export const DEFAULT_AVATAR_SKINS: CosmeticItem[] = [
  {
    id: 'skin-default',
    name: 'Classic Ferni',
    description: 'The original sage green Ferni you know and love',
    type: 'avatar-skin',
    rarity: 'common',
    priceInSeeds: null,
    requiredTier: 'free',
    isLimited: false,
    config: {
      primaryColor: 'var(--color-ferni)',
      glowColor: 'var(--color-ferni-glow)',
    },
  },
];

export const DEFAULT_UI_THEMES: CosmeticItem[] = [
  {
    id: 'theme-default',
    name: 'Zen Garden',
    description: 'Clean, natural, serene light theme',
    type: 'ui-theme',
    rarity: 'common',
    priceInSeeds: null,
    requiredTier: 'free',
    isLimited: false,
    config: {
      systemTheme: 'zen', // Default light theme
    },
  },
];

// ============================================================================
// PREMIUM COSMETICS (Shop items)
// ============================================================================

export const PREMIUM_AVATAR_SKINS: CosmeticItem[] = [
  {
    id: 'skin-cosmic',
    name: 'Cosmic Ferni',
    description: 'Deep space purple with stardust particles',
    type: 'avatar-skin',
    rarity: 'epic',
    priceInSeeds: 500,
    requiredTier: 'friend',
    isLimited: false,
    config: {
      primaryColor: '#6B5B95',
      glowColor: '#9B8DC4',
      particleEffect: 'stardust',
    },
  },
  {
    id: 'skin-sunset',
    name: 'Golden Hour',
    description: 'Warm sunset gradient that glows',
    type: 'avatar-skin',
    rarity: 'rare',
    priceInSeeds: 300,
    requiredTier: 'friend',
    isLimited: false,
    config: {
      primaryColor: '#F4A460',
      glowColor: '#FFD700',
    },
  },
  {
    id: 'skin-ocean',
    name: 'Deep Ocean',
    description: 'Calming ocean blue with wave shimmer',
    type: 'avatar-skin',
    rarity: 'rare',
    priceInSeeds: 300,
    requiredTier: 'friend',
    isLimited: false,
    config: {
      primaryColor: '#4A90A4',
      glowColor: '#7EC8E3',
    },
  },
  {
    id: 'skin-aurora',
    name: 'Northern Lights',
    description: 'Shifting aurora borealis effect',
    type: 'avatar-skin',
    rarity: 'legendary',
    priceInSeeds: 1000,
    requiredTier: 'partner',
    isLimited: true,
    config: {
      primaryColor: '#00CED1',
      secondaryColor: '#9370DB',
      effect: 'aurora-shift',
    },
  },
];

export const PREMIUM_UI_THEMES: CosmeticItem[] = [
  {
    id: 'theme-forest',
    name: 'Deep Forest',
    description: 'Rich forest greens for a grounding experience',
    type: 'ui-theme',
    rarity: 'uncommon',
    priceInSeeds: 200,
    requiredTier: 'friend',
    isLimited: false,
    config: {
      systemTheme: 'zen', // Light base
      accentHue: '120', // Green accent shift
    },
  },
  {
    id: 'theme-midnight',
    name: 'Midnight',
    description: 'True dark mode with warm cedar tones',
    type: 'ui-theme',
    rarity: 'rare',
    priceInSeeds: 300,
    requiredTier: 'friend',
    isLimited: false,
    config: {
      systemTheme: 'midnight', // Dark mode
    },
  },
  {
    id: 'theme-cozy',
    name: 'Cozy Cabin',
    description: 'Warm amber tones like firelight',
    type: 'ui-theme',
    rarity: 'epic',
    priceInSeeds: 500,
    requiredTier: 'partner',
    isLimited: false,
    config: {
      systemTheme: 'midnight', // Dark base
      accentHue: '35', // Warm amber shift
    },
  },
];

export const PREMIUM_SOUND_PACKS: CosmeticItem[] = [
  {
    id: 'sounds-rain',
    name: 'Gentle Rain',
    description: 'Soft rainfall ambient sounds',
    type: 'sound-pack',
    rarity: 'uncommon',
    priceInSeeds: 150,
    requiredTier: 'friend',
    isLimited: false,
  },
  {
    id: 'sounds-fireplace',
    name: 'Crackling Fire',
    description: 'Cozy fireplace ambience',
    type: 'sound-pack',
    rarity: 'uncommon',
    priceInSeeds: 150,
    requiredTier: 'friend',
    isLimited: false,
  },
  {
    id: 'sounds-nature',
    name: 'Forest Morning',
    description: 'Birds and gentle wind through trees',
    type: 'sound-pack',
    rarity: 'rare',
    priceInSeeds: 250,
    requiredTier: 'friend',
    isLimited: false,
  },
];

export const DEFAULT_VOICE_PACKS: CosmeticItem[] = [
  {
    id: 'voice-default',
    name: 'Natural',
    description: "Ferni's natural, balanced voice",
    type: 'voice-pack',
    rarity: 'common',
    priceInSeeds: null,
    requiredTier: 'free',
    isLimited: false,
    config: {
      voiceStyle: 'natural',
      speed: '1.0',
      pitch: '0',
    },
  },
];

export const PREMIUM_VOICE_PACKS: CosmeticItem[] = [
  {
    id: 'voice-warm',
    name: 'Extra Warm',
    description: 'A warmer, more comforting tone',
    type: 'voice-pack',
    rarity: 'uncommon',
    priceInSeeds: 200,
    requiredTier: 'friend',
    isLimited: false,
    config: {
      voiceStyle: 'warm',
      speed: '0.95',
      pitch: '-2',
    },
  },
  {
    id: 'voice-calm',
    name: 'Zen Calm',
    description: 'Slower, more meditative pace',
    type: 'voice-pack',
    rarity: 'rare',
    priceInSeeds: 300,
    requiredTier: 'friend',
    isLimited: false,
    config: {
      voiceStyle: 'calm',
      speed: '0.9',
      pitch: '-1',
    },
  },
  {
    id: 'voice-energetic',
    name: 'Energetic',
    description: 'More upbeat and motivating',
    type: 'voice-pack',
    rarity: 'rare',
    priceInSeeds: 300,
    requiredTier: 'friend',
    isLimited: false,
    config: {
      voiceStyle: 'energetic',
      speed: '1.05',
      pitch: '+1',
    },
  },
];

// ============================================================================
// ALL COSMETICS CATALOG
// ============================================================================

export const COSMETICS_CATALOG: CosmeticItem[] = [
  ...DEFAULT_AVATAR_SKINS,
  ...DEFAULT_UI_THEMES,
  ...DEFAULT_VOICE_PACKS,
  ...PREMIUM_AVATAR_SKINS,
  ...PREMIUM_UI_THEMES,
  ...PREMIUM_SOUND_PACKS,
  ...PREMIUM_VOICE_PACKS,
];
