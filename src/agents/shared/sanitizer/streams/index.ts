/**
 * Streams Module
 *
 * Exports transform stream utilities for sanitization.
 *
 * @module agents/shared/sanitizer/streams
 */

export {
  createSanitizerTransformStream,
  createSanitizerWithMusicFallback,
  stripGuidanceBlocks,
  createGuidanceStripStream,
  type AnyTransformStream,
} from './transform-stream.js';

