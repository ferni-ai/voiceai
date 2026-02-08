/**
 * LiveKit adapters for Qwen3-Omni
 *
 * Bridges Qwen3-Omni Thinker + Qwen3-TTS to LiveKit's LLM and TTS interfaces
 * so that AgentSession can use the same STT → LLM → TTS flow when USE_QWEN3_OMNI is set.
 *
 * Also exports the RealtimeModel adapter for Qwen3-Omni's native speech understanding
 * and the Director Mode integration layer.
 */

export { Qwen3LLMAdapter, type Qwen3LLMAdapterConfig } from './livekit-llm-adapter.js';
export { Qwen3OmniRealtimeModel, type Qwen3RealtimeModelConfig } from './livekit-realtime-model.js';
export {
  NativeOmniRealtimeModel,
  NativeOmniRealtimeSession,
  type NativeOmniRealtimeModelConfig,
} from './native-omni-adapter.js';
export {
  SessionManagerRealtimeModel,
  SessionManagerRealtimeSession,
  type SessionManagerRealtimeModelConfig,
} from './livekit-session-manager-adapter.js';
export { Qwen3TTSAdapter, type Qwen3TTSAdapterConfig } from './livekit-tts-adapter.js';
