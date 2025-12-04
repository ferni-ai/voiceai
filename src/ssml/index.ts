/**
 * SSML Module - Human-Like Natural Speech
 * 
 * Modular SSML tagging system for Cartesia Sonic-3.
 * 
 * Fully implements Cartesia Sonic-3 SSML tags:
 * - Speed: <speed ratio="0.6-1.5"/>
 * - Volume: <volume ratio="0.5-2.0"/>
 * - Emotion: <emotion value="angry|sad|surprised|curious|affectionate"/> (beta)
 * - Break: <break time="500ms"/> or <break time="1s"/>
 * - Spell: <spell>ABC123</spell>
 * 
 * @see https://docs.cartesia.ai/build-with-cartesia/sonic-3/ssml-tags
 */

// Type exports
export * from './types.js';

// Cartesia tag helpers
export {
  breakTag,
  speedTag,
  volumeTag,
  emotionTag,
  spellTag,
  clampSpeed,
  clampVolume,
  CARTESIA_EMOTIONS,
} from './cartesia.js';
export type { CartesiaEmotion } from './cartesia.js';

// Persona-aware SSML tagging
export {
  tagTextWithSsmlPersonaAware,
  stripSsmlTags,
  hasSsmlTags,
  sanitizeSsml,
  regexCache,
} from './core.js';
export type { PersonaAwareSsmlOptions } from './core.js';

// Re-export from legacy ssml-tagger for backwards compatibility
export { tagTextWithSsml, tagTextFragments } from '../ssml-tagger.js';

