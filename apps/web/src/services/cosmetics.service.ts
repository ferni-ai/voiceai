/**
 * Cosmetics Service - Frontend
 *
 * Fortnite-style cosmetics system for Ferni.
 * Manages avatar skins, UI themes, voice packs, and other customizations.
 *
 * Philosophy: Cosmetics let users express themselves and feel ownership
 * of their Ferni experience. Premium users can customize, free users
 * can see what's available (creating aspiration).
 */

import { setTheme, type ThemeName } from '../theme/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('Cosmetics');

// ============================================================================
// TYPES
// ============================================================================

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

const DEFAULT_AVATAR_SKINS: CosmeticItem[] = [
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

const DEFAULT_UI_THEMES: CosmeticItem[] = [
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

const PREMIUM_AVATAR_SKINS: CosmeticItem[] = [
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

const PREMIUM_UI_THEMES: CosmeticItem[] = [
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

const PREMIUM_SOUND_PACKS: CosmeticItem[] = [
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

const DEFAULT_VOICE_PACKS: CosmeticItem[] = [
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

const PREMIUM_VOICE_PACKS: CosmeticItem[] = [
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

// ============================================================================
// CONSTANTS
// ============================================================================

/** Starter seeds for new users - "Seeds to get you growing" */
const STARTER_SEEDS = 25;

// ============================================================================
// STATE
// ============================================================================

function createDefaultCosmetics(): UserCosmetics {
  return {
    ownedItems: ['skin-default', 'theme-default', 'voice-default'],
    equipped: {
      'avatar-skin': 'skin-default',
      'ui-theme': 'theme-default',
      'voice-pack': 'voice-default',
      'sound-pack': null,
      emote: null,
    },
    seedBalance: STARTER_SEEDS, // New users start with seeds to explore
  };
}

let userCosmetics: UserCosmetics = createDefaultCosmetics();
let currentTier: SubscriptionTier = 'free';
const cosmeticsListeners = new Set<(cosmetics: UserCosmetics) => void>();

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Initialize cosmetics service
 */
export function initCosmeticsService(): void {
  // Load from localStorage
  const saved = localStorage.getItem('ferni_cosmetics');
  if (saved) {
    try {
      userCosmetics = JSON.parse(saved) as UserCosmetics;
      log.info('Loaded cosmetics from storage');
    } catch {
      log.warn('Failed to parse saved cosmetics, using defaults');
      userCosmetics = createDefaultCosmetics();
    }
  }

  // Apply equipped cosmetics
  applyEquippedCosmetics();

  log.info('Cosmetics service initialized');
}

/**
 * Set subscription tier (affects what can be purchased)
 */
export function setSubscriptionTier(tier: SubscriptionTier): void {
  currentTier = tier;
  log.debug({ tier }, 'Subscription tier set');
}

/**
 * Get all cosmetics (for shop display)
 */
export function getAllCosmetics(): CosmeticItem[] {
  return COSMETICS_CATALOG;
}

/**
 * Get cosmetics by type
 */
export function getCosmeticsByType(type: CosmeticType): CosmeticItem[] {
  return COSMETICS_CATALOG.filter((c) => c.type === type);
}

/**
 * Get user's owned cosmetics
 */
export function getOwnedCosmetics(): CosmeticItem[] {
  return COSMETICS_CATALOG.filter((c) => userCosmetics.ownedItems.includes(c.id));
}

/**
 * Get user's equipped cosmetics
 */
export function getEquippedCosmetics(): UserCosmetics['equipped'] {
  return { ...userCosmetics.equipped };
}

/**
 * Check if user owns a cosmetic
 */
export function ownsCosmetic(cosmeticId: string): boolean {
  return userCosmetics.ownedItems.includes(cosmeticId);
}

/**
 * Check if user can purchase a cosmetic
 */
export function canPurchase(cosmeticId: string): { canBuy: boolean; reason?: string } {
  const cosmetic = COSMETICS_CATALOG.find((c) => c.id === cosmeticId);

  if (!cosmetic) {
    return { canBuy: false, reason: 'Item not found' };
  }

  if (ownsCosmetic(cosmeticId)) {
    return { canBuy: false, reason: 'Already owned' };
  }

  if (cosmetic.priceInSeeds === null) {
    return { canBuy: false, reason: 'Not for sale (default item)' };
  }

  // Check tier requirement
  const tierOrder: SubscriptionTier[] = ['free', 'friend', 'partner'];
  const userTierIndex = tierOrder.indexOf(currentTier);
  const requiredTierIndex = tierOrder.indexOf(cosmetic.requiredTier);

  if (userTierIndex < requiredTierIndex) {
    return { canBuy: false, reason: `Requires ${cosmetic.requiredTier} tier` };
  }

  // Check seed balance
  if (userCosmetics.seedBalance < cosmetic.priceInSeeds) {
    return { canBuy: false, reason: 'Need more Seeds' };
  }

  return { canBuy: true };
}

/**
 * Purchase a cosmetic
 */
export function purchaseCosmetic(cosmeticId: string): boolean {
  const { canBuy, reason } = canPurchase(cosmeticId);

  if (!canBuy) {
    log.warn({ cosmeticId, reason }, 'Cannot purchase cosmetic');
    return false;
  }

  const cosmetic = COSMETICS_CATALOG.find((c) => c.id === cosmeticId);
  if (!cosmetic || cosmetic.priceInSeeds === null) return false;

  // Deduct seeds and add to owned
  userCosmetics.seedBalance -= cosmetic.priceInSeeds;
  userCosmetics.ownedItems.push(cosmeticId);

  // Save and notify
  saveCosmetics();
  notifyListeners();

  log.info({ cosmeticId, newBalance: userCosmetics.seedBalance }, 'Cosmetic purchased');
  return true;
}

/**
 * Equip a cosmetic
 */
export function equipCosmetic(cosmeticId: string): boolean {
  if (!ownsCosmetic(cosmeticId)) {
    log.warn({ cosmeticId }, 'Cannot equip - not owned');
    return false;
  }

  const cosmetic = COSMETICS_CATALOG.find((c) => c.id === cosmeticId);
  if (!cosmetic) return false;

  userCosmetics.equipped[cosmetic.type] = cosmeticId;

  // Save and apply
  saveCosmetics();
  applyEquippedCosmetics();
  notifyListeners();

  log.info({ cosmeticId, type: cosmetic.type }, 'Cosmetic equipped');
  return true;
}

/**
 * Unequip a cosmetic type (revert to default)
 */
export function unequipCosmetic(type: CosmeticType): void {
  // Find default for this type
  const defaultItem = COSMETICS_CATALOG.find(
    (c) => c.type === type && c.priceInSeeds === null && c.requiredTier === 'free'
  );

  userCosmetics.equipped[type] = defaultItem?.id ?? null;

  saveCosmetics();
  applyEquippedCosmetics();
  notifyListeners();

  log.info({ type }, 'Cosmetic unequipped');
}

/**
 * Get seed balance
 */
export function getSeedBalance(): number {
  return userCosmetics.seedBalance;
}

/**
 * Add seeds (for purchases, rewards, etc.)
 */
export function addSeeds(amount: number): void {
  userCosmetics.seedBalance += amount;
  saveCosmetics();
  notifyListeners();
  log.info({ amount, newBalance: userCosmetics.seedBalance }, 'Seeds added');
}

/**
 * Subscribe to cosmetics changes
 */
export function onCosmeticsChange(listener: (cosmetics: UserCosmetics) => void): () => void {
  cosmeticsListeners.add(listener);
  return () => cosmeticsListeners.delete(listener);
}

// ============================================================================
// COSMETIC APPLICATION
// ============================================================================

/**
 * Apply equipped cosmetics to the UI
 */
function applyEquippedCosmetics(): void {
  // Apply UI theme
  const themeId = userCosmetics.equipped['ui-theme'];
  if (themeId) {
    const theme = COSMETICS_CATALOG.find((c) => c.id === themeId);
    if (theme?.config) {
      applyThemeConfig(theme.config);
    }
  }

  // Apply avatar skin by setting CSS custom properties
  const skinId = userCosmetics.equipped['avatar-skin'];
  if (skinId) {
    const skin = COSMETICS_CATALOG.find((c) => c.id === skinId);
    if (skin?.config) {
      applySkinConfig(skin.config);
      // Also dispatch event for any components that want to listen
      document.dispatchEvent(
        new CustomEvent('ferni:skin-change', {
          detail: { skinId, config: skin.config },
        })
      );
    }
  }

  // Apply sound pack - dispatch event for ambient sounds service
  const soundPackId = userCosmetics.equipped['sound-pack'];
  document.dispatchEvent(
    new CustomEvent('ferni:sound-pack-change', {
      detail: { packId: soundPackId },
    })
  );

  // Apply voice pack - dispatch event for voice settings and send to backend
  const voicePackId = userCosmetics.equipped['voice-pack'];
  if (voicePackId) {
    const voicePack = COSMETICS_CATALOG.find((c) => c.id === voicePackId);
    if (voicePack?.config) {
      // Store voice preferences for backend to use
      localStorage.setItem('ferni_voice_style', JSON.stringify(voicePack.config));

      document.dispatchEvent(
        new CustomEvent('ferni:voice-pack-change', {
          detail: { packId: voicePackId, config: voicePack.config },
        })
      );

      // Send to backend via LiveKit data channel (if connected)
      sendVoicePackToBackend(voicePackId, voicePack.config);
    }
  }

  log.debug('Applied equipped cosmetics');
}

/**
 * Apply avatar skin by setting CSS custom properties
 * Skin colors override the default persona colors
 */
function applySkinConfig(config: Record<string, string>): void {
  const root = document.documentElement;

  // Map skin config properties to CSS custom properties
  if (config.primaryColor) {
    // Check if it's a CSS variable reference or a raw color
    if (config.primaryColor.startsWith('var(')) {
      root.style.setProperty('--skin-primary', config.primaryColor);
    } else {
      root.style.setProperty('--skin-primary', config.primaryColor);
      // Also set with alpha for glow effects
      const glowColor = config.glowColor || `${config.primaryColor}50`;
      root.style.setProperty('--skin-glow', glowColor);
    }
  }

  if (config.glowColor) {
    root.style.setProperty('--skin-glow', config.glowColor);
  }

  if (config.secondaryColor) {
    root.style.setProperty('--skin-secondary', config.secondaryColor);
  }

  // Store effect type if present (for avatar components to use)
  if (config.particleEffect) {
    root.setAttribute('data-skin-effect', config.particleEffect);
  }
  if (config.effect) {
    root.setAttribute('data-skin-effect', config.effect);
  }

  // For default skin, clear any custom skin variables
  const isDefaultSkin = !config.primaryColor || config.primaryColor.startsWith('var(--color-ferni');
  if (isDefaultSkin) {
    root.style.removeProperty('--skin-primary');
    root.style.removeProperty('--skin-secondary');
    root.style.removeProperty('--skin-glow');
    root.removeAttribute('data-skin-effect');
  }

  log.debug({ config, isDefaultSkin }, 'Applied skin config');
}

/**
 * Apply a UI theme config
 * Integrates with the main theme system (zen/midnight) and applies any additional CSS overrides
 */
function applyThemeConfig(config: Record<string, string>): void {
  const root = document.documentElement;

  // Apply system theme if specified (zen or midnight)
  if (config.systemTheme) {
    const themeName = config.systemTheme as ThemeName;
    if (themeName === 'zen' || themeName === 'midnight') {
      setTheme(themeName);
    }
  }

  // Apply accent hue shift if specified (for theme variations)
  if (config.accentHue) {
    root.style.setProperty('--theme-accent-hue', config.accentHue);
  } else {
    root.style.removeProperty('--theme-accent-hue');
  }

  // Apply any additional CSS custom properties
  for (const [property, value] of Object.entries(config)) {
    if (property.startsWith('--')) {
      root.style.setProperty(property, value);
    }
  }

  log.debug({ config }, 'Applied theme config');
}

/**
 * Send voice pack change to backend via LiveKit data channel
 * This allows the TTS to adjust voice parameters in real-time
 */
function sendVoicePackToBackend(packId: string, config: Record<string, string>): void {
  try {
    // Access LiveKit room from global window object (set by connection service)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const room = (window as any).__livekitRoom as {
      localParticipant?: {
        publishData: (data: Uint8Array, options?: { reliable?: boolean }) => Promise<void>;
      };
    } | null;

    if (room?.localParticipant) {
      const message = JSON.stringify({
        type: 'voice-pack-change',
        packId,
        config,
        timestamp: Date.now(),
      });

      void room.localParticipant.publishData(new TextEncoder().encode(message), {
        reliable: true,
      });

      log.debug({ packId }, 'Voice pack change sent to backend');
    } else {
      log.debug('No active LiveKit connection, voice pack stored locally');
    }
  } catch (error) {
    log.warn({ error }, 'Failed to send voice pack to backend');
  }
}

// ============================================================================
// PERSISTENCE
// ============================================================================

function saveCosmetics(): void {
  localStorage.setItem('ferni_cosmetics', JSON.stringify(userCosmetics));
}

function notifyListeners(): void {
  cosmeticsListeners.forEach((listener) => listener({ ...userCosmetics }));
}

// ============================================================================
// DEV HELPERS
// ============================================================================

/**
 * Give all cosmetics (dev mode only)
 */
export function devUnlockAllCosmetics(): void {
  userCosmetics.ownedItems = COSMETICS_CATALOG.map((c) => c.id);
  userCosmetics.seedBalance = 10000;
  saveCosmetics();
  notifyListeners();
  log.info('Dev: All cosmetics unlocked');
}

/**
 * Reset to defaults (dev mode only)
 */
export function devResetCosmetics(): void {
  userCosmetics = createDefaultCosmetics();
  saveCosmetics();
  applyEquippedCosmetics();
  notifyListeners();
  log.info('Dev: Cosmetics reset');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const cosmeticsService = {
  init: initCosmeticsService,
  setTier: setSubscriptionTier,
  getAll: getAllCosmetics,
  getByType: getCosmeticsByType,
  getOwned: getOwnedCosmetics,
  getEquipped: getEquippedCosmetics,
  owns: ownsCosmetic,
  canPurchase,
  purchase: purchaseCosmetic,
  equip: equipCosmetic,
  unequip: unequipCosmetic,
  getSeedBalance,
  addSeeds,
  onChange: onCosmeticsChange,
  // Dev helpers
  devUnlockAll: devUnlockAllCosmetics,
  devReset: devResetCosmetics,
  // Catalog
  CATALOG: COSMETICS_CATALOG,
};

export default cosmeticsService;
