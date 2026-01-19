/**
 * TTS Providers Module
 *
 * Exports TTS provider implementations.
 *
 * @module speech/tts-gateway/providers
 */

export {
  CartesiaTTSProvider,
  getCartesiaProvider,
  createCartesiaProvider,
  resetCartesiaProvider,
  type CartesiaProviderConfig,
} from './cartesia.js';
