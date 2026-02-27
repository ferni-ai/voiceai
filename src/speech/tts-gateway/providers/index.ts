/**
 * TTS Providers Module
 *
 * Exports TTS provider implementations.
 * After Sonata migration (Feb 2026), only Sonata remains.
 *
 * @module speech/tts-gateway/providers
 */

// Sonata (pocket-voice: Kyutai DSM TTS 1.6B on Metal GPU via NAPI)
export {
  SonataTTSProvider,
  createSonataProvider,
  getSonataProvider,
  resetSonataProvider,
  type SonataProviderConfig,
} from './sonata.js';

// Factory for selecting TTS provider
import type { ITTSProvider } from '../types.js';
import { getSonataProvider } from './sonata.js';

/**
 * Get the configured TTS provider.
 *
 * After the Sonata migration (Feb 2026), all TTS goes through Sonata.
 */
export function getTTSProvider(): ITTSProvider {
  return getSonataProvider();
}
