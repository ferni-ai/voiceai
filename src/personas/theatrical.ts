/**
 * Theatrical Personality System
 *
 * Makes agent transitions, celebrations, greetings, and goodbyes
 * memorable and distinctly THEM.
 *
 * This is about creating MOMENTS - the kind of thing users remember.
 *
 * NOTE: All theatrical content is now loaded from persona bundles.
 * See bundles/{persona}/content/behaviors/ for entrances, celebrations, etc.
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export type CelebrationType =
  | 'decision_made' // User made a choice
  | 'goal_reached' // Hit a milestone
  | 'breakthrough' // Aha moment
  | 'commitment' // User committed to something
  | 'learning' // Gained new understanding
  | 'progress' // Incremental progress
  | 'courage' // Facing something hard
  | 'win'; // General win

export interface StorytellingConfig {
  askAboutMusic: boolean; // Should we ask about background music?
  introPhrases: string[]; // How to start a story
  pacingStyle: 'measured' | 'animated' | 'calm' | 'energetic';
  pauseMultiplier: number; // Multiplier for dramatic pauses
}

// ============================================================================
// DYNAMIC ENTRANCE REGISTRY (for bundle-loaded entrances)
// ============================================================================

/**
 * Runtime registry for bundle-loaded entrances
 * Populated when persona bundles are loaded
 */
const bundleEntranceRegistry = new Map<string, string[]>();

/**
 * Register entrances from a bundle
 * Call this after loading a persona bundle
 */
export function registerBundleEntrances(personaId: string, entrances: string[]): void {
  bundleEntranceRegistry.set(personaId, entrances);
}

/**
 * Clear bundle entrances (useful for hot reload)
 */
export function clearBundleEntrances(personaId?: string): void {
  if (personaId) {
    bundleEntranceRegistry.delete(personaId);
  } else {
    bundleEntranceRegistry.clear();
  }
}

/**
 * Get all entrances for a persona
 */
export function getAllEntrancesForPersona(personaId: string): string[] {
  return bundleEntranceRegistry.get(personaId) || [];
}

/**
 * Get theatrical entrance for a persona
 */
export function getTheatricalEntrance(personaId: string): string {
  const entrances = bundleEntranceRegistry.get(personaId);
  if (entrances && entrances.length > 0) {
    return entrances[Math.floor(Math.random() * entrances.length)];
  }

  log.debug({ personaId }, 'No theatrical entrances found in bundle');
  return `Hello, I'm ${personaId}. What's on your mind?`;
}

// ============================================================================
// DYNAMIC CELEBRATION REGISTRY (for bundle-loaded celebrations)
// ============================================================================

/**
 * Runtime registry for bundle-loaded celebrations
 * Populated when persona bundles are loaded
 */
const bundleCelebrationRegistry = new Map<string, Record<string, string[]>>();

/**
 * Register celebrations from a bundle
 */
export function registerBundleCelebrations(
  personaId: string,
  celebrations: Record<string, string[]>
): void {
  bundleCelebrationRegistry.set(personaId, celebrations);
}

/**
 * Clear bundle celebrations (useful for hot reload)
 */
export function clearBundleCelebrations(personaId?: string): void {
  if (personaId) {
    bundleCelebrationRegistry.delete(personaId);
  } else {
    bundleCelebrationRegistry.clear();
  }
}

/**
 * Get celebration moment for a persona
 */
export function getCelebration(personaId: string, type: CelebrationType): string {
  const celebrations = bundleCelebrationRegistry.get(personaId);
  if (celebrations) {
    const phrases = celebrations[type] || celebrations['win'] || [];
    if (phrases.length > 0) {
      return phrases[Math.floor(Math.random() * phrases.length)];
    }
  }

  log.debug({ personaId, type }, 'No celebration found in bundle');
  return "That's great!";
}

// ============================================================================
// DYNAMIC GOODBYE REGISTRY (for bundle-loaded goodbyes)
// ============================================================================

/**
 * Runtime registry for bundle-loaded goodbyes
 * Populated when persona bundles are loaded
 */
const bundleGoodbyeRegistry = new Map<string, string[]>();

/**
 * Register goodbyes from a bundle
 */
export function registerBundleGoodbyes(personaId: string, goodbyes: string[]): void {
  bundleGoodbyeRegistry.set(personaId, goodbyes);
}

/**
 * Clear bundle goodbyes (useful for hot reload)
 */
export function clearBundleGoodbyes(personaId?: string): void {
  if (personaId) {
    bundleGoodbyeRegistry.delete(personaId);
  } else {
    bundleGoodbyeRegistry.clear();
  }
}

/**
 * Get goodbye for a persona
 */
export function getTheatricalGoodbye(personaId: string): string {
  const goodbyes = bundleGoodbyeRegistry.get(personaId);
  if (goodbyes && goodbyes.length > 0) {
    return goodbyes[Math.floor(Math.random() * goodbyes.length)];
  }

  return 'Take care!';
}

// ============================================================================
// DYNAMIC STORYTELLING REGISTRY (for bundle-loaded storytelling configs)
// ============================================================================

interface BundleStorytellingConfig {
  askAboutMusic: boolean;
  introPhrases: string[];
  pacingStyle: 'measured' | 'animated' | 'calm' | 'energetic';
  pauseMultiplier: number;
  musicOffers?: string[];
}

/**
 * Runtime registry for bundle-loaded storytelling configs
 * Populated when persona bundles are loaded
 */
const bundleStorytellingRegistry = new Map<string, BundleStorytellingConfig>();

/**
 * Register storytelling config from a bundle
 */
export function registerBundleStorytelling(
  personaId: string,
  config: BundleStorytellingConfig
): void {
  bundleStorytellingRegistry.set(personaId, config);
}

/**
 * Clear bundle storytelling (useful for hot reload)
 */
export function clearBundleStorytelling(personaId?: string): void {
  if (personaId) {
    bundleStorytellingRegistry.delete(personaId);
  } else {
    bundleStorytellingRegistry.clear();
  }
}

/**
 * Get storytelling config for a persona
 */
export function getStorytellingConfig(personaId: string): StorytellingConfig | null {
  const bundleConfig = bundleStorytellingRegistry.get(personaId);
  if (bundleConfig) {
    return {
      askAboutMusic: bundleConfig.askAboutMusic,
      introPhrases: bundleConfig.introPhrases,
      pacingStyle: bundleConfig.pacingStyle,
      pauseMultiplier: bundleConfig.pauseMultiplier,
    };
  }

  return null;
}

/**
 * Get storytelling intro for persona
 */
export function getStorytellingIntro(personaId: string): string {
  const config = bundleStorytellingRegistry.get(personaId);
  if (config && config.introPhrases.length > 0) {
    return config.introPhrases[Math.floor(Math.random() * config.introPhrases.length)];
  }
  return 'Let me tell you something...';
}

/**
 * Get music offer for storytelling (bundle-aware)
 */
export function getBundleStoryMusicOffer(personaId: string): string | null {
  const bundleConfig = bundleStorytellingRegistry.get(personaId);
  if (bundleConfig) {
    if (!bundleConfig.askAboutMusic) return null;
    const offers = bundleConfig.musicOffers;
    if (offers && offers.length > 0) {
      return offers[Math.floor(Math.random() * offers.length)];
    }
  }
  return null;
}

/**
 * Get music offer phrase for storytelling mode
 * @deprecated Use getBundleStoryMusicOffer instead
 */
export function getStoryMusicOffer(personaId: string): string | null {
  return getBundleStoryMusicOffer(personaId);
}

// ============================================================================
// DYNAMIC BACKCHANNEL REGISTRY (for bundle-loaded backchannels)
// ============================================================================

/**
 * Runtime registry for bundle-loaded backchannels
 * Populated when persona bundles are loaded
 */
const bundleBackchannelRegistry = new Map<string, Record<string, string[]>>();

/**
 * Register backchannels from a loaded bundle
 * Call this after loading a persona bundle
 */
export function registerBundleBackchannels(
  personaId: string,
  backchannels: Record<string, string[]>
): void {
  bundleBackchannelRegistry.set(personaId, backchannels);
}

/**
 * Clear bundle backchannels (useful for hot reload)
 */
export function clearBundleBackchannels(personaId?: string): void {
  if (personaId) {
    bundleBackchannelRegistry.delete(personaId);
  } else {
    bundleBackchannelRegistry.clear();
  }
}

/**
 * Get all available backchannels for a persona
 */
export function getAllBackchannelsForPersona(personaId: string): Record<string, string[]> | null {
  return bundleBackchannelRegistry.get(personaId) || null;
}

/**
 * Track recently used backchannels to avoid repetition
 * Map of personaId -> recent backchannels (keeps last 5)
 */
const recentBackchannels = new Map<string, string[]>();

/**
 * Get enhanced backchannel for persona with anti-repetition logic
 * 
 * PHILOSOPHY: Real humans don't say "mmhmm" 5 times in a row.
 * Track recent backchannels and avoid repeating them.
 */
export function getEnhancedBackchannel(
  personaId: string,
  emotion:
    | 'neutral'
    | 'engaged'
    | 'empathetic'
    | 'excited'
    | 'thoughtful'
    | 'supportive'
    | 'efficient'
    | 'encouraging'
    | 'understanding'
    | 'playful'
    | 'celebration'
): string {
  const backchannels = bundleBackchannelRegistry.get(personaId);
  if (backchannels) {
    // Try the exact emotion first, then fallbacks
    const emotionOptions = [
      emotion,
      emotion === 'excited' ? 'celebration' : null,
      emotion === 'supportive' ? 'empathetic' : null,
      emotion === 'playful' ? 'engaged' : null,
      'neutral',
    ].filter(Boolean) as string[];

    for (const emotionKey of emotionOptions) {
      const phrases = backchannels[emotionKey];
      if (phrases && phrases.length > 0) {
        // Get recent backchannels for this persona
        const recent = recentBackchannels.get(personaId) || [];
        
        // Filter out recently used phrases (avoid repetition)
        const available = phrases.filter(p => !recent.includes(p));
        
        // If all phrases were recently used, allow any (reset)
        const pool = available.length > 0 ? available : phrases;
        
        // Pick randomly from available pool
        const chosen = pool[Math.floor(Math.random() * pool.length)];
        
        // Track this backchannel
        recent.push(chosen);
        // Keep only last 5 to allow cycling back eventually
        if (recent.length > 5) recent.shift();
        recentBackchannels.set(personaId, recent);
        
        return chosen;
      }
    }
  }

  // Simple fallback for personas without bundle data
  return 'Mm-hmm';
}

/**
 * Clear recent backchannels for a persona (useful for new sessions)
 */
export function clearRecentBackchannels(personaId?: string): void {
  if (personaId) {
    recentBackchannels.delete(personaId);
  } else {
    recentBackchannels.clear();
  }
}

// ============================================================================
// TESTING UTILITIES
// ============================================================================

/**
 * Clear all registries (for testing)
 */
export function clearAllTheatricalRegistries(): void {
  bundleEntranceRegistry.clear();
  bundleCelebrationRegistry.clear();
  bundleGoodbyeRegistry.clear();
  bundleStorytellingRegistry.clear();
  bundleBackchannelRegistry.clear();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Entrances
  getTheatricalEntrance,
  registerBundleEntrances,
  clearBundleEntrances,
  getAllEntrancesForPersona,
  // Celebrations
  getCelebration,
  registerBundleCelebrations,
  clearBundleCelebrations,
  // Goodbyes
  getTheatricalGoodbye,
  registerBundleGoodbyes,
  clearBundleGoodbyes,
  // Storytelling
  getStorytellingConfig,
  getStorytellingIntro,
  getBundleStoryMusicOffer,
  getStoryMusicOffer,
  registerBundleStorytelling,
  clearBundleStorytelling,
  // Backchannels
  getEnhancedBackchannel,
  registerBundleBackchannels,
  clearBundleBackchannels,
  getAllBackchannelsForPersona,
  clearRecentBackchannels,
  // Testing
  clearAllTheatricalRegistries,
};
