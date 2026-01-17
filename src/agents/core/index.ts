/**
 * Core Agent Abstractions
 *
 * Foundation types, errors, and utilities for the voice agent architecture.
 * All modules depend on these abstractions.
 *
 * @module agents/core
 */

// Types
export type {
  AccentType,
  // Emotion & Mood
  EmotionAnalysis,
  EmotionType,
  HandlerContext,
  // Handlers
  HandlerResult,
  HumanizingState,
  LLMAdapter,
  LLMChunk,
  LLMContext,
  LLMMessage,
  LLMResponse,
  Logger,
  MoodState,
  ParticipantAdapter,
  // Persona
  PersonaConfig,
  PersonalityConfig,
  RelationshipStage,
  // Adapters
  RoomAdapter,
  // Session Context
  SessionContext,
  SessionContextBuilder,
  SessionFlags,
  // Services
  SessionServices,
  SessionState,
  SessionStateSnapshot,
  // Options
  SpeakOptions,
  SpeechCharacteristics,
  TTSAdapter,
  TrialStatus,
  UserProfile,
  VoiceConfig,
} from './types.js';

// Result Type
export {
  andThen,
  andThenAsync,
  collect,
  collectAll,
  err,
  fromPromise,
  isErr,
  isOk,
  map,
  mapAsync,
  mapErr,
  ok,
  orElse,
  tryAsync,
  unwrap,
  unwrapOr,
  unwrapOrElse,
  type Err,
  type Ok,
  type Result,
} from './result.js';

// Pipeline
export {
  BaseStep,
  Pipeline,
  SideEffectStep,
  TransformStep,
  createStep,
  optionalStep,
  withRetry,
  withTimeout,
  type PipelineStep,
  type StepOptions,
} from './pipeline.js';

// Errors
export {
  AgentError,
  HandlerError,
  LLMError,
  PersonaLoadError,
  PersonaNotFoundError,
  PipelineStepError,
  RoomConnectionError,
  RoomDisconnectedError,
  SessionSetupError,
  SessionTimeoutError,
  TTSError,
  UserIdentificationError,
  getUserMessage,
  isRecoverable,
  withErrorBoundary,
  wrapError,
  type SessionPhase,
} from './errors.js';

// Inference Executor
export { InProcessInferenceExecutor } from './inference-executor.js';
