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

// Higgs Pipeline (Rust WebSocket: STT + TTS + biomarkers)
// Protocol last synced: Feb 2026 (Phase 6)
export {
  HiggsPipelineProvider,
  createHiggsPipelineProvider,
  getHiggsPipelineProvider,
  resetHiggsPipelineProvider,
  type HiggsPipelineConfig,
  type TranscriptResult,
  type VoiceBiomarkers,
} from './higgs-pipeline.js';

// Factory for selecting TTS provider
import type { ITTSProvider } from '../types.js';
import { getBTCWProvider } from './btcw.js';
import { getCartesiaProvider } from './cartesia.js';
import { getHiggsPipelineProvider } from './higgs-pipeline.js';
import { getKyutaiProvider } from './kyutai-tts.js';
import { getLocalTTSProvider } from './local-tts.js';

/**
 * Get the configured TTS provider.
 *
 * Environment variable: TTS_PROVIDER
 * Valid values:
 * - 'higgs-pipeline' or 'higgs' — Rust Higgs pipeline (STT + TTS + biomarkers)
 * - 'local' — Local TTS server (e.g., Qwen3-TTS MLX)
 * - 'kyutai' — Kyutai Moshi TTS
 * - 'cartesia' — Cartesia cloud TTS (default)
 *
 * Also checks: USE_BTCW_TTS=true for BTCW provider
 *
 * Related env vars:
 * - HIGGS_PIPELINE_URL — WebSocket URL for Higgs (default: ws://localhost:8600/ws)
 * - LOCAL_TTS_URL — URL for local TTS server
 * - CARTESIA_API_KEY — API key for Cartesia
 */
export function getTTSProvider(): ITTSProvider {
  const provider = process.env.TTS_PROVIDER?.toLowerCase();

  if (provider === 'higgs-pipeline' || provider === 'higgs') {
    return getHiggsPipelineProvider();
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
