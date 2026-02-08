/**
 * Qwen3-Omni Integration
 *
 * End-to-end omni-modal speech-to-speech integration for Ferni.
 * Architecture: Qwen3-Omni Thinker (reasoning) + Qwen3-TTS (persona voices)
 *
 * Key features:
 * - Native function calling (no regex-based tool detection)
 * - 3-second voice cloning for all 9 persona voices
 * - Large context window for rich persona prompts
 * - Apache 2.0 licensed (self-hosted, no API costs)
 * - OpenAI-compatible API
 *
 * @module @ferni/integrations/qwen3-omni
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

export {
  CONVERSATION_STYLE_SUFFIX,
  GPU_MEMORY_REQUIREMENTS,
  MAX_SYSTEM_PROMPT_LENGTH,
  VOICE_CLONE_CONFIGS,
  getEmotionInstruction,
  getInferenceBackend,
  getModelWeightPath,
  getQwen3OmniConfig,
  getVoiceCloneConfig,
  isQwen3OmniEnabled,
  isQwen3OmniTextOnly,
  logQwen3OmniConfig,
  validateModelWeights,
} from './config.js';

export type { InferenceBackend } from './config.js';

// =============================================================================
// TYPES
// =============================================================================

export type {
  Qwen3FunctionCall,
  Qwen3FunctionCallResult,
  Qwen3FunctionDefinition,
  Qwen3FunctionParameter,
  Qwen3OmniChoice,
  Qwen3OmniConfig,
  Qwen3OmniHealthStatus,
  Qwen3OmniMessage,
  Qwen3OmniMetrics,
  Qwen3OmniModel,
  Qwen3OmniRequest,
  Qwen3OmniResponse,
  Qwen3OmniSessionConfig,
  Qwen3OmniSessionState,
  Qwen3OmniStreamChunk,
  Qwen3OmniTurnContext,
  Qwen3TTSConfig,
  TTSSynthesisRequest,
  TTSSynthesisResult,
  VoiceCloneConfig,
  VoiceCloneResult,
} from './types.js';

// =============================================================================
// CLIENTS
// =============================================================================

export { Qwen3OmniClient, createQwen3OmniClient } from './client.js';
export { Qwen3TTSClient, createQwen3TTSClient } from './tts-client.js';

// =============================================================================
// SESSION MANAGEMENT
// =============================================================================

export { Qwen3OmniSessionManager, createQwen3OmniSession } from './session/index.js';

// =============================================================================
// DIRECTOR MODE
// =============================================================================

export {
  AudioRouter,
  AutoDirector,
  DirectorEngine,
  PersonaActor,
  buildEnsembleSystemPrompt,
  buildSoloSystemPrompt,
} from './director/index.js';

export type {
  AutoDirectorMode,
  CastState,
  DirectorCommand,
  DirectorEvent,
  DirectorSessionConfig,
  DirectorStateSnapshot,
  EmotionArc,
  EnsemblePromptConfig,
  PersonaId,
  SceneMood,
  ScenePace,
  SceneState,
} from './director/index.js';

// =============================================================================
// HUMANIZATION (Qwen3-TTS)
// =============================================================================

export {
  checkTriggerPatterns,
  getAllInstructProfiles,
  getPersonaInstructProfile,
} from './humanization/persona-instruct-profiles.js';

export {
  buildInstruct,
  splitIntoInstructSegments,
  stripSsmlTags,
  translateBreaksToText,
} from './humanization/instruct-builder.js';

export { humanizeForQwen3, lightHumanize } from './humanization/text-humanizer.js';

// =============================================================================
// NATIVE ENGINE (Candle NAPI)
// =============================================================================

export {
  NativeOmniEngine,
  isNativeOmniAvailable,
} from './native-engine.js';
export type { NativeOmniEngineOptions, OmniTimingsNAPI } from './native-engine.js';

// =============================================================================
// UTILITIES
// =============================================================================

export {
  bytesToInt16,
  int16ToBytes,
  pcmToWav,
  pcmToWavDataUrl,
  wavDataUrlToPcm,
  wavToPcm,
} from './utils/wav-encoder.js';
