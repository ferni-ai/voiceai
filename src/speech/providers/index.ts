/**
 * Speech providers (STT, etc.)
 *
 * After Sonata migration (Feb 2026), only Sonata STT remains.
 *
 * @module speech/providers
 */

export {
  SonataSTT,
  type SonataSTTAdapterConfig,
} from './sonata-stt-adapter.js';

export {
  SonataSTTClient,
  type SonataSTTConfig,
} from './sonata-stt.js';
