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

// Kyutai TTS (DSM - Delayed Streams Modeling, self-hosted)
export {
  KyutaiTTSProvider,
  createKyutaiProvider,
  getKyutaiProvider,
  resetKyutaiProvider,
  type KyutaiTTSProviderConfig,
} from './kyutai-tts.js';

// Local TTS (on-device: Qwen3-TTS MLX, Kokoro, etc.)
export {
  LocalTTSProvider,
  createLocalTTSProvider,
  getLocalTTSProvider,
  resetLocalTTSProvider,
  type LocalTTSProviderConfig,
} from './local-tts.js';

// Factory for selecting TTS provider
import type { ITTSProvider } from '../types.js';
import { getBTCWProvider } from './btcw.js';
import { getCartesiaProvider } from './cartesia.js';
import { getKyutaiProvider } from './kyutai-tts.js';
import { getLocalTTSProvider } from './local-tts.js';
import { LocalTTSProvider } from './local-tts.js';

// Higgs Audio V2 TTS singleton
let higgsProviderInstance: LocalTTSProvider | null = null;

function getHiggsProvider(): ITTSProvider {
  if (!higgsProviderInstance) {
    higgsProviderInstance = new LocalTTSProvider({
      serverUrl: process.env.HIGGS_TTS_URL || 'http://127.0.0.1:8501',
      defaultVoice: 'default',
      sampleRate: 24000,
      apiFormat: 'openai',
    });
  }
  return higgsProviderInstance;
}

export function resetHiggsProvider(): void {
  higgsProviderInstance = null;
}

/**
 * Get the active TTS provider based on configuration
 *
 * Priority: TTS_PROVIDER=higgs | TTS_PROVIDER=local | TTS_PROVIDER=kyutai | USE_BTCW_TTS=true | Cartesia
 */
export function getTTSProvider(): ITTSProvider {
  const provider = process.env.TTS_PROVIDER?.toLowerCase();

  if (provider === 'higgs') {
    return getHiggsProvider();
  }

  if (provider === 'local') {
    return getLocalTTSProvider();
  }

  if (provider === 'kyutai') {
    return getKyutaiProvider();
  }

  const useBTCW = process.env.USE_BTCW_TTS === 'true';
  if (useBTCW) {
    return getBTCWProvider();
  }

  return getCartesiaProvider();
}
