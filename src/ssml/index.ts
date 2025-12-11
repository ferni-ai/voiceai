/**
 * SSML Module Index
 *
 * Re-exports all SSML functionality for backwards compatibility.
 * The main ssml-tagger.ts file imports from this module.
 */

// Types
export * from './types.js';

// Constants
export * from './constants.js';

// Tag helpers
export {
  clampSpeed,
  clampVolume,
  speedTag,
  volumeTag,
  breakTag,
  emotionTag,
  spellTag,
  mapToCartesiaEmotion,
  getContextualEmotion,
} from './tags.js';

// Detection
export { detectEmotion, detectPacing, detectVolume, detectVocalCues } from './detection.js';

// Core functionality
export {
  tagTextWithSsmlPersonaAware,
  tagTextWithSsmlPersonaAware as tagTextWithSsml, // Alias for backwards compatibility
  stripSsmlTags,
  hasSsmlTags,
  sanitizeSsml,
} from './core.js';

// Re-export thinking time types for consumers
export type { ThinkingContext, ThinkingInjection } from '../conversation/thinking-time-injector.js';

// Regex cache for performance optimization
const regexCacheMap = new Map<string, RegExp>();

export const regexCache = {
  get(pattern: string, flags?: string): RegExp {
    const key = `${pattern}:${flags || ''}`;
    let cached = regexCacheMap.get(key);
    if (!cached) {
      cached = new RegExp(pattern, flags);
      regexCacheMap.set(key, cached);
    }
    return cached;
  },
  clear(): void {
    regexCacheMap.clear();
  },
  get size(): number {
    return regexCacheMap.size;
  },
};
