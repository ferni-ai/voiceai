/**
 * TTS Providers Module
 *
 * Exports TTS provider implementations.
 * Default: Cartesia (production). Optional: Sonata (native addon).
 *
 * @module speech/tts-gateway/providers
 */

// Cartesia (REST API — production default)
export {
  CartesiaTTSProvider,
  getCartesiaProvider,
  createCartesiaProvider,
  resetCartesiaProvider,
} from './cartesia.js';

// Sonata (pocket-voice: Kyutai DSM TTS 1.6B on Metal GPU via NAPI)
export {
  SonataTTSProvider,
  createSonataProvider,
  getSonataProvider,
  resetSonataProvider,
  type SonataProviderConfig,
} from './sonata.js';

// Factory for selecting TTS provider
import { createRequire } from 'module';
import type { ITTSProvider } from '../types.js';
import { getCartesiaProvider } from './cartesia.js';
import { getSonataProvider } from './sonata.js';

const require = createRequire(import.meta.url);

function isSonataResolvable(): boolean {
  try {
    require.resolve('@ferni/sonata');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the configured TTS provider.
 *
 * - Default: Cartesia (REST API, no native addon required).
 * - Set TTS_PROVIDER=sonata to use Sonata when the native addon is built.
 */
export function getTTSProvider(): ITTSProvider {
  const want = process.env.TTS_PROVIDER?.toLowerCase();
  if (want === 'sonata' && isSonataResolvable()) {
    return getSonataProvider();
  }
  return getCartesiaProvider();
}
