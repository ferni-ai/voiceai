/**
 * Qwen3-Omni Integration Types
 *
 * Type definitions for Qwen3-Omni (Thinker) + Qwen3-TTS voice pipeline.
 * Apache 2.0 licensed, end-to-end omni-modal LLM with native function calling.
 */

// =============================================================================
// CONFIGURATION TYPES
// =============================================================================

export interface Qwen3OmniConfig {
  /** Base URL for the Qwen3-Omni inference server (e.g., http://localhost:8000) */
  serverUrl: string;
  /** Base URL for the Qwen3-TTS server (e.g., http://localhost:8001) */
  ttsServerUrl: string;
  /** Model variant to use */
  model: Qwen3OmniModel;
  /** Enable debug logging */
  debug?: boolean;
  /** Connection timeout in ms */
  connectionTimeoutMs?: number;
  /** Audio output sample rate (default: 24000) */
  sampleRate?: number;
  /** Enable native function calling */
  enableFunctionCalling?: boolean;
  /** Maximum tokens for generation */
  maxTokens?: number;
  /** Temperature for text generation (0-2) */
  temperature?: number;
  /** Top-p sampling */
  topP?: number;
  /** Quantization mode for inference */
  quantization?: 'none' | 'int4' | 'int8' | 'gptq';
  /** When true, use text-in/text-out only (no STT/TTS/audio); for stress testing */
  textOnly?: boolean;
}

export type Qwen3OmniModel =
  | 'Qwen3-Omni'
  | 'Qwen3-Omni-7B'
  | 'Qwen3-Omni-Thinker'
  | 'Qwen3-Omni-Thinker-INT4';

// =============================================================================
// VOICE TYPES (Qwen3-TTS)
// =============================================================================

export interface VoiceCloneConfig {
  /** Persona ID */
  personaId: string;
  /** Cartesia voice ID for generating reference audio */
  cartesiaVoiceId: string;
  /** Reference audio file path or URL */
  referenceAudioPath: string;
  /** Transcript of the reference audio */
  referenceTranscript: string;
  /** Output filename for the cached voice prompt */
  cacheFilename: string;
  /** Voice design description (fallback if no reference audio) */
  voiceDesignDescription?: string;
}

export interface VoiceCloneResult {
  personaId: string;
  /** Path to the cached voice clone prompt */
  promptPath: string;
  /** Duration of reference audio in seconds */
  refDurationSec: number;
  /** Clone quality score (0-1) */
  qualityScore?: number;
  success: boolean;
  error?: string;
}

export interface Qwen3TTSConfig {
  /** TTS server URL */
  serverUrl: string;
  /** Language for synthesis */
  language: 'English' | 'Chinese' | 'Japanese' | 'Korean';
  /** Emotion/tone instruction for the TTS */
  instruct?: string;
  /** Enable streaming mode */
  streaming?: boolean;
}

export interface TTSSynthesisRequest {
  /** Text to synthesize */
  text: string;
  /** Persona ID for voice selection */
  personaId: string;
  /** Language */
  language?: string;
  /** Emotion/tone instruction */
  instruct?: string;
  /** Use streaming output */
  streaming?: boolean;
}

export interface TTSSynthesisResult {
  /** Audio data as raw bytes (24kHz PCM) */
  audioData: Uint8Array;
  /** Sample rate */
  sampleRate: number;
  /** Synthesis latency in ms */
  latencyMs: number;
  /** Text that was spoken */
  text: string;
}

// =============================================================================
// FUNCTION CALLING TYPES (Native FC)
// =============================================================================

export interface Qwen3FunctionDefinition {
  /** Function name */
  name: string;
  /** Function description */
  description: string;
  /** JSON Schema for parameters */
  parameters: {
    type: 'object';
    properties: Record<string, Qwen3FunctionParameter>;
    required?: string[];
  };
}

export interface Qwen3FunctionParameter {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  enum?: string[];
  items?: { type: string };
  default?: unknown;
}

export interface Qwen3FunctionCall {
  /** Function name */
  name: string;
  /** Arguments as parsed JSON */
  arguments: Record<string, unknown>;
}

export interface Qwen3FunctionCallResult {
  /** Function name */
  name: string;
  /** Result content */
  content: string;
}

// =============================================================================
// INFERENCE TYPES
// =============================================================================

export interface Qwen3OmniMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: Qwen3MessageContent[];
  /** Tool call ID (for tool role messages) */
  tool_call_id?: string;
}

export type Qwen3MessageContent =
  | { type: 'text'; text: string }
  | { type: 'audio'; audio_url: string }
  | { type: 'image'; image_url: string }
  | { type: 'video'; video_url: string };

export interface Qwen3OmniRequest {
  /** Model identifier */
  model: string;
  /** Messages array */
  messages: Qwen3OmniMessage[];
  /** Tool definitions for native function calling */
  tools?: Qwen3FunctionDefinition[];
  /** Temperature (0-2) */
  temperature?: number;
  /** Top-p sampling */
  top_p?: number;
  /** Maximum tokens */
  max_tokens?: number;
  /** Enable streaming */
  stream?: boolean;
  /** Audio output options */
  modalities?: Array<'text' | 'audio'>;
  /** Audio output config */
  audio?: {
    voice?: string;
    format?: 'wav' | 'pcm' | 'opus';
    sample_rate?: number;
  };
}

export interface Qwen3OmniResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Qwen3OmniChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface Qwen3OmniChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }>;
    audio?: {
      data: string; // base64 encoded audio
      format: string;
    };
  };
  finish_reason: 'stop' | 'tool_calls' | 'length';
}

export interface Qwen3OmniStreamChunk {
  id: string;
  object: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
}

// =============================================================================
// SESSION TYPES
// =============================================================================

export interface Qwen3OmniSessionConfig {
  /** Session ID */
  sessionId: string;
  /** User ID */
  userId: string;
  /** Initial persona ID */
  personaId: string;
  /** User profile (optional) */
  userProfile?: unknown;
  /** Session services (DI container) */
  services: unknown;
  /** Qwen3-Omni server URL */
  serverUrl?: string;
  /** Qwen3-TTS server URL */
  ttsServerUrl?: string;
  /** Enable music/DJ controller */
  enableMusic?: boolean;
  /** Enable handoffs */
  enableHandoffs?: boolean;
  /** Quantization mode */
  quantization?: 'none' | 'int4' | 'int8';
  /** Enable streaming responses (emit textChunk events, lower latency) */
  streamingEnabled?: boolean;
  /** Callback to send data messages to the client (e.g. LiveKit data channel for emotion events). Signature: (type, payload) => void | Promise<void>. */
  sendDataMessage?: (type: string, payload: Record<string, unknown>) => void | Promise<void>;
}

export interface Qwen3OmniSessionState {
  /** Current persona bundle */
  persona: unknown;
  /** Cognitive profile */
  cognitiveProfile: unknown;
  /** Available tools as Qwen3 function definitions */
  tools: Map<string, Qwen3FunctionDefinition>;
  /** STM buffer */
  stmBuffer: unknown;
  /** Conversation messages history */
  messages: Qwen3OmniMessage[];
  /** Turn count */
  turnCount: number;
  /** Is active */
  isActive: boolean;
  /** Last user transcript */
  lastUserTranscript: string;
  /** Last agent text response */
  lastAgentResponse: string;
  /** Emotional state */
  emotionalState: {
    userEmotion: string;
    agentTone: string;
    energy: number;
  };
  /** Trust level (0-10) */
  trustLevel: number;
  /** Emotional trajectory across turns (improving | declining | volatile) */
  emotionalTrajectory?: 'improving' | 'declining' | 'volatile' | 'stable';
  /** Distress level (0-1) from analysis */
  distressLevel?: number;
  /** Personality emergence context (from BuildPersonalityContext) */
  personalityContext?: unknown;
  /** Conversation quality metrics */
  qualityMetrics?: {
    averageDepth: number;
    engagementTrend: 'increasing' | 'stable' | 'declining';
    emotionalRange: number;
    turnsSinceDeepMoment: number;
  };
}

export interface Qwen3OmniTurnContext {
  /** User's speech transcript */
  userTranscript: string;
  /** Analysis results */
  analysis: unknown;
  /** Memory context */
  memoryContext: string;
  /** Tool context (function definitions) */
  toolDefinitions: Qwen3FunctionDefinition[];
  /** Behavioral signals */
  behavioralSignals: Record<string, unknown>;
  /** Humanization guidance */
  humanizationGuidance: string;
  /** Full system prompt */
  systemPrompt: string;
  /** Agent text response */
  agentResponse?: string;
  /** Tool calls made */
  toolCalls?: Qwen3FunctionCall[];
  /** Synthesized audio */
  audio?: TTSSynthesisResult;
}

// =============================================================================
// AUDIO MODALITY TYPES (Qwen3-Omni Talker)
// =============================================================================

/** Request for audio-output chat completion */
export interface Qwen3AudioCompletionRequest extends Qwen3OmniRequest {
  /** Must include 'audio' for Talker output */
  modalities: Array<'text' | 'audio'>;
  /** Audio output configuration */
  audio: {
    /** Voice name, voice design, or voice ID */
    voice?: string;
    /** Audio format */
    format?: 'wav' | 'pcm' | 'opus';
    /** Sample rate in Hz */
    sample_rate?: number;
  };
  /** Voice design description (natural language) */
  voice_design?: string;
  /** Instruct parameter for emotion/tone control */
  instruct?: string;
}

/** Stream chunk with audio delta */
export interface Qwen3AudioStreamChunk extends Qwen3OmniStreamChunk {
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      audio?: {
        /** Incremental base64 audio data */
        data?: string;
        /** Audio format */
        format?: string;
      };
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
}

// =============================================================================
// DIRECTOR SESSION TYPES
// =============================================================================

/** Configuration for a Director Mode Qwen3-Omni session */
export interface Qwen3DirectorSessionConfig extends Qwen3OmniSessionConfig {
  /** Director's user ID */
  directorUserId: string;
  /** Initial cast of personas */
  initialCast: readonly string[];
  /** Initial lead persona */
  initialLead: string;
  /** Initial scene mood */
  initialMood?: string;
  /** Auto-director mode */
  autoDirectorMode?: 'off' | 'suggest' | 'autopilot';
  /** Maximum ensemble size */
  maxEnsembleSize?: number;
  /** Enable music/ambiance control */
  enableMusicControl?: boolean;
}

// =============================================================================
// HEALTH & METRICS
// =============================================================================

export interface Qwen3OmniHealthStatus {
  /** Is the Thinker model healthy */
  thinkerHealthy: boolean;
  /** Is the TTS model healthy */
  ttsHealthy: boolean;
  /** GPU memory usage in GB */
  gpuMemoryUsedGB: number;
  /** GPU memory total in GB */
  gpuMemoryTotalGB: number;
  /** GPU utilization percentage */
  gpuUtilization: number;
  /** Average inference latency in ms */
  avgInferenceLatencyMs: number;
  /** Average TTS latency in ms */
  avgTTSLatencyMs: number;
  /** Uptime in seconds */
  uptimeSeconds: number;
  /** Model loaded */
  modelLoaded: string;
  /** Quantization active */
  quantization: string;
}

export interface Qwen3OmniMetrics {
  /** Total requests processed */
  totalRequests: number;
  /** Total function calls executed */
  totalFunctionCalls: number;
  /** Average E2E latency (audio in -> audio out) ms */
  avgE2ELatencyMs: number;
  /** P95 E2E latency */
  p95E2ELatencyMs: number;
  /** Average Thinker inference latency ms */
  avgThinkerLatencyMs: number;
  /** Average TTS synthesis latency ms */
  avgTTSLatencyMs: number;
  /** Voice clone cache hit rate */
  voiceCloneCacheHitRate: number;
  /** Persona voice map */
  activeVoices: Record<string, string>;
}
