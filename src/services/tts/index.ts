/**
 * TTS Service Module
 *
 * Service layer components for Text-to-Speech.
 *
 * @module services/tts
 */

export {
  TTSCache,
  DelegatingTTSCache,
  getTTSCache,
  createTTSCache,
  createDelegatingTTSCache,
  setTTSCache,
  type TTSCacheConfig,
} from './tts-cache.js';
