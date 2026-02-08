/**
 * Director Mode for Qwen3-Omni
 *
 * Enables real-time voice direction of an ensemble of persona actors.
 * The Director can shape conversations like a film director shapes scenes:
 * controlling who speaks, the emotional arc, mood, pacing, and more.
 *
 * @module @ferni/integrations/qwen3-omni/director
 */

// =============================================================================
// TYPES (re-export everything)
// =============================================================================

export type {
  CorePersonaId,
  PersonaId,
  StagePosition,
  CastState,
  PersonaActorState,
  SceneMood,
  ScenePace,
  SceneState,
  EmotionArc,
  EmotionPhase,
  TransitionStyle,
  EntranceStyle,
  ExitStyle,
  MusicDirectorAction,
  DirectorCommand,
  DirectorCommandResult,
  PersonaDirectorOverride,
  DirectorEvent,
  DirectorSuggestion,
  AutoDirectorMode,
  DirectorSessionConfig,
  DirectorStateSnapshot,
  DirectorChannelInbound,
  DirectorChannelOutbound,
  DirectorDataChannelMessage,
  EnsembleCharacterBlock,
  EnsemblePromptConfig,
} from './types.js';

// =============================================================================
// CORE ENGINE
// =============================================================================

export { DirectorEngine } from './director-engine.js';

// =============================================================================
// PERSONA ACTORS
// =============================================================================

export { PersonaActor } from './persona-actor.js';
export type { PersonaBundleRef, ActorEmotionalState } from './persona-actor.js';

// =============================================================================
// ENSEMBLE PROMPT
// =============================================================================

export { buildEnsembleSystemPrompt, buildSoloSystemPrompt } from './ensemble-prompt.js';

// =============================================================================
// AUDIO ROUTING
// =============================================================================

export { AudioRouter } from './audio-router.js';
export type { AudioRouteDecision, AudioRouteHandlers } from './audio-router.js';

// =============================================================================
// AUTO-DIRECTOR
// =============================================================================

export { AutoDirector } from './auto-director.js';
export type { TurnAnalysisContext, AutoDirectorConfig } from './auto-director.js';
