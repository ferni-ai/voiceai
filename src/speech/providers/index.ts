/**
 * Speech providers (STT, etc.)
 *
 * @module speech/providers
 */

export {
  KyutaiSTTClient,
  createKyutaiSTTClient,
  isKyutaiSTTAvailable,
  type KyutaiSTTClientConfig,
  type KyutaiSTTTranscriptEvent,
  type KyutaiSTTVADEvent,
  type TranscriptCallback,
  type VADCallback,
} from './kyutai-stt.js';
