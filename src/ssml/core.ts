/**
 * Core SSML Tagging Module - Persona-Aware
 *
 * This module provides persona-aware SSML tagging that adapts:
 * - Speaking speed per persona
 * - Default emotion per persona
 * - Humanization features (disfluencies, thinking sounds)
 *
 * Uses the legacy tagTextWithSsml from ssml-tagger.ts as a base,
 * with persona-specific overlays.
 */

import { tagTextWithSsml, sanitizeSsml } from '../ssml-tagger.js';
import { breakTag, speedTag, volumeTag, emotionTag, clampSpeed } from './cartesia.js';

/**
 * Options for persona-aware SSML tagging
 */
export interface PersonaAwareSsmlOptions {
  /** Persona ID for persona-specific styling */
  personaId?: string;
  /** Enable humanization features (disfluencies, thinking sounds) */
  humanize?: boolean;
  /** Base speaking speed multiplier */
  baseSpeed?: number;
  /** Base volume multiplier */
  baseVolume?: number;
  /** Default emotion for neutral text */
  defaultEmotion?: string;
}

/**
 * Persona-specific SSML configurations
 */
const PERSONA_CONFIGS: Record<
  string,
  {
    baseSpeed: number;
    defaultEmotion: string;
    humanizeLevel: 'low' | 'medium' | 'high';
  }
> = {
  'nayan-patel': {
    baseSpeed: 0.78,
    defaultEmotion: 'affectionate',
    humanizeLevel: 'high', // Jack has lots of thinking sounds, pauses
  },
  'peter-john': {
    baseSpeed: 0.92,
    defaultEmotion: 'curious',
    humanizeLevel: 'medium', // Peter is more energetic
  },
  'alex-chen': {
    baseSpeed: 0.88,
    defaultEmotion: 'content',
    humanizeLevel: 'low', // Alex is professional, efficient
  },
  'maya-santos': {
    baseSpeed: 0.85,
    defaultEmotion: 'affectionate',
    humanizeLevel: 'medium', // Maya is warm but focused
  },
  'jordan-taylor': {
    baseSpeed: 0.9,
    defaultEmotion: 'excited',
    humanizeLevel: 'medium', // Jordan is enthusiastic
  },
  ferni: {
    baseSpeed: 0.82,
    defaultEmotion: 'content',
    humanizeLevel: 'medium', // Ferni is the balanced coach
  },
};

/**
 * Cache for compiled regex patterns (performance optimization)
 * Provides a .get(pattern, flags) method that creates and caches RegExp instances
 */
class RegexCache {
  private cache = new Map<string, RegExp>();

  /**
   * Get or create a cached regex
   */
  get(pattern: string, flags: string): RegExp {
    const key = `${pattern}:${flags}`;
    if (!this.cache.has(key)) {
      this.cache.set(key, new RegExp(pattern, flags));
    }
    return this.cache.get(key)!;
  }

  /**
   * Clear all cached patterns
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Number of cached patterns
   */
  get size(): number {
    return this.cache.size;
  }
}

export const regexCache = new RegexCache();

/**
 * Tag text with SSML, with persona-specific adaptations
 *
 * @param text - The text to tag with SSML
 * @param options - Persona-aware options
 * @returns SSML-tagged text
 */
export function tagTextWithSsmlPersonaAware(
  text: string,
  options: PersonaAwareSsmlOptions = {}
): string {
  if (!text || text.trim().length === 0) {
    return text;
  }

  const {
    personaId = 'ferni',
    humanize = true,
    baseSpeed: customSpeed,
    defaultEmotion: customEmotion,
  } = options;

  // Get persona config or use defaults
  const config = PERSONA_CONFIGS[personaId] || PERSONA_CONFIGS['ferni'];
  const baseSpeed = customSpeed ?? config.baseSpeed;
  const defaultEmotion = customEmotion ?? config.defaultEmotion;

  // For now, delegate to the legacy tagger
  // In the future, this will use a fully modular pipeline
  let result = tagTextWithSsml(text);

  // Apply persona-specific speed adjustment if different from default
  if (baseSpeed !== 0.8) {
    // The legacy tagger uses 0.8 as default
    // Adjust by prepending a speed tag
    const speedRatio = clampSpeed(baseSpeed);
    result = speedTag(speedRatio) + result;
  }

  // Apply persona-specific emotion if text doesn't already have emotion tags
  if (!result.includes('<emotion') && defaultEmotion !== 'affectionate') {
    result = emotionTag(defaultEmotion) + result;
  }

  // Add humanization based on persona level
  if (humanize && config.humanizeLevel === 'high') {
    // High humanization: add occasional thinking pauses at start
    if (text.length > 50 && Math.random() < 0.15) {
      const thinkingPhrases = ['Hmm... ', 'Well... ', 'Let me think... '];
      const phrase = thinkingPhrases[Math.floor(Math.random() * thinkingPhrases.length)];
      result = phrase + breakTag('200ms') + result;
    }
  }

  return result;
}

/**
 * Strip all SSML tags from text
 */
export function stripSsmlTags(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\[laughter\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if text contains SSML tags
 */
export function hasSsmlTags(text: string): boolean {
  return /<[^>]+>/.test(text);
}

// Re-export sanitizeSsml for convenience
export { sanitizeSsml } from '../ssml-tagger.js';
