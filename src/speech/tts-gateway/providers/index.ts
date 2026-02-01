/**
 * TTS Providers Module
 *
 * Exports TTS provider implementations.
 *
 * @module speech/tts-gateway/providers
 */

// Cartesia TTS (fallback, commercial)
export {
  CartesiaTTSProvider,
  createCartesiaProvider,
  getCartesiaProvider,
  resetCartesiaProvider,
  type CartesiaProviderConfig,
} from './cartesia.js';

// BTCW TTS (primary, superhuman capabilities)
export {
  BTCWTTSProvider,
  createBTCWProvider,
  getBTCWProvider,
  resetBTCWProvider,
  type BTCWProviderConfig,
  type MemoryReference,
  type SuperhumanResult,
  type SuperhumanSessionContext,
} from './btcw.js';

// Factory for selecting TTS provider
import type { ITTSProvider } from '../types.js';
import { getBTCWProvider } from './btcw.js';
import { getCartesiaProvider } from './cartesia.js';

/**
 * Get the active TTS provider based on configuration
 *
 * Uses BTCW by default if USE_BTCW_TTS=true, falls back to Cartesia
 */
export function getTTSProvider(): ITTSProvider {
  const useBTCW = process.env.USE_BTCW_TTS === 'true';

  if (useBTCW) {
    return getBTCWProvider();
  }

  return getCartesiaProvider();
}
