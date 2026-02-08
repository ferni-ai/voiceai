/**
 * Director Mode Types
 *
 * Type definitions for the Director Mode system that enables real-time
 * voice direction of an ensemble of persona actors.
 *
 * Think of this as the type system for a live film production:
 * - Director sends commands to shape the conversation
 * - Personas are actors with distinct voices and personalities
 * - Scenes have moods, pacing, and emotional arcs
 * - The ensemble performs as a coordinated team
 */

// =============================================================================
// PERSONA & CAST TYPES
// =============================================================================

/** Persona identifiers for the core team */
export type CorePersonaId =
  | 'ferni'
  | 'peter-john'
  | 'alex-chen'
  | 'maya-santos'
  | 'jordan-taylor'
  | 'nayan-patel';

/** Extended persona IDs including legacy personas */
export type PersonaId = CorePersonaId | 'joel-dickson' | 'peter-lynch' | 'john-bogle';

/** Where a persona is relative to the "stage" */
export type StagePosition = 'lead' | 'supporting' | 'on-deck' | 'off-stage';

/** State of the entire cast */
export interface CastState {
  /** Personas currently in the scene (lead + supporting) */
  readonly activePersonas: readonly PersonaId[];
  /** The persona currently leading the conversation */
  readonly leadPersona: PersonaId;
  /** Personas ready to enter on cue */
  readonly onDeck: readonly PersonaId[];
  /** Personas not in the current scene */
  readonly offStage: readonly PersonaId[];
  /** Position map for quick lookup */
  readonly positions: Readonly<Record<PersonaId, StagePosition>>;
}

/** Per-persona state managed by the Director */
export interface PersonaActorState {
  readonly personaId: PersonaId;
  readonly stagePosition: StagePosition;
  readonly currentMood: SceneMood;
  readonly emotionIntensity: number;
  readonly isInterruptable: boolean;
  /** Director's private instruction for this persona */
  readonly directorWhisper: string | null;
  /** Overrides from the Director */
  readonly overrides: PersonaDirectorOverride;
}

// =============================================================================
// SCENE TYPES
// =============================================================================

/** Scene mood affects all personas' tone and approach */
export type SceneMood =
  | 'warm'
  | 'serious'
  | 'playful'
  | 'contemplative'
  | 'celebratory'
  | 'supportive'
  | 'challenging'
  | 'vulnerable'
  | 'empowering'
  | 'urgent'
  | 'intimate'
  | 'energized';

/** Conversation pacing */
export type ScenePace = 'contemplative' | 'natural' | 'energized' | 'urgent';

/** Overall scene state */
export interface SceneState {
  /** Current mood */
  readonly mood: SceneMood;
  /** Mood intensity (0-1) */
  readonly moodIntensity: number;
  /** Conversation pacing */
  readonly pace: ScenePace;
  /** Is the scene on hold (paused by Director) */
  readonly isHeld: boolean;
  /** Hold instruction from Director */
  readonly holdInstruction: string | null;
  /** Current emotion arc (if set) */
  readonly emotionArc: EmotionArc | null;
  /** Current phase index in emotion arc */
  readonly currentArcPhase: number;
  /** Turn count in current scene */
  readonly turnCount: number;
  /** Scene start timestamp */
  readonly startedAt: number;
  /** Director notes visible to the ensemble */
  readonly directorNotes: string;
}

// =============================================================================
// EMOTION ARC TYPES
// =============================================================================

/** A planned emotional trajectory for the conversation */
export interface EmotionArc {
  /** Human-readable arc name */
  readonly name: string;
  /** Description of the arc's intent */
  readonly description: string;
  /** Ordered phases of the arc */
  readonly phases: readonly EmotionPhase[];
  /** Auto-advance phases based on conversation signals */
  readonly autoAdvance: boolean;
}

/** A single phase in an emotion arc */
export interface EmotionPhase {
  /** Phase name */
  readonly name: string;
  /** Target mood for this phase */
  readonly mood: SceneMood;
  /** Intensity level (0-1) */
  readonly intensity: number;
  /** Suggested lead persona for this phase */
  readonly suggestedLead?: PersonaId;
  /** How long this phase should last */
  readonly durationHint?: 'brief' | 'medium' | 'extended';
  /** Conversation signal that advances to the next phase */
  readonly advanceTrigger?: string;
  /** Instructions for the lead persona during this phase */
  readonly instruction?: string;
}

// =============================================================================
// DIRECTOR COMMAND TYPES
// =============================================================================

/** Transition styles for persona switches */
export type TransitionStyle =
  | 'smooth' // Natural conversation flow
  | 'dramatic' // Noticeable shift with pause
  | 'immediate' // Cut directly
  | 'gradual'; // Slow blend over multiple turns

/** Entrance styles for bringing a persona on stage */
export type EntranceStyle =
  | 'greeting' // Persona greets the user
  | 'chime-in' // Persona adds to current topic
  | 'takeover' // Persona takes over the conversation
  | 'observation' // Persona makes a brief observation
  | 'silent'; // Persona enters but doesn't speak yet

/** Exit styles for sending a persona off stage */
export type ExitStyle =
  | 'farewell' // Persona says goodbye
  | 'handoff' // Persona explicitly hands off
  | 'fade' // Persona quietly steps back
  | 'silent'; // Persona exits without speaking

/** Music/ambiance director actions */
export interface MusicDirectorAction {
  readonly type: 'play' | 'pause' | 'stop' | 'volume' | 'genre' | 'mood';
  readonly value?: string | number;
}

/** All commands the Director can send */
export type DirectorCommand =
  | {
      readonly type: 'SET_LEAD';
      readonly personaId: PersonaId;
      readonly transition?: TransitionStyle;
    }
  | { readonly type: 'BRING_ON'; readonly personaId: PersonaId; readonly entrance?: EntranceStyle }
  | { readonly type: 'SEND_OFF'; readonly personaId: PersonaId; readonly exit?: ExitStyle }
  | {
      readonly type: 'ENSEMBLE';
      readonly personaIds: readonly PersonaId[];
      readonly topic?: string;
    }
  | { readonly type: 'CAMEO'; readonly personaId: PersonaId; readonly instruction: string }
  | {
      readonly type: 'SET_MOOD';
      readonly mood: SceneMood;
      readonly intensity: number;
      readonly transition?: 'cut' | 'fade';
    }
  | { readonly type: 'SET_PACE'; readonly pace: ScenePace }
  | { readonly type: 'HOLD'; readonly instruction?: string }
  | { readonly type: 'RELEASE'; readonly instruction?: string }
  | { readonly type: 'WHISPER'; readonly personaId: PersonaId; readonly instruction: string }
  | { readonly type: 'EMOTION_ARC'; readonly arc: EmotionArc }
  | { readonly type: 'ADVANCE_ARC' }
  | { readonly type: 'MUSIC'; readonly action: MusicDirectorAction }
  | { readonly type: 'CUT'; readonly reason?: string }
  | { readonly type: 'OVERRIDE'; readonly override: PersonaDirectorOverride };

/** Result of executing a director command */
export interface DirectorCommandResult {
  readonly success: boolean;
  readonly command: DirectorCommand;
  readonly error?: string;
  readonly stateAfter: {
    readonly cast: CastState;
    readonly scene: SceneState;
  };
}

// =============================================================================
// DIRECTOR OVERRIDE TYPES
// =============================================================================

/** Per-persona overrides from the Director */
export interface PersonaDirectorOverride {
  readonly personaId: PersonaId;
  /** Override the voice design description */
  readonly voiceDesign?: string;
  /** Override emotion instruction for TTS */
  readonly emotionInstruction?: string;
  /** Speed multiplier (0.7 = slower, 1.3 = faster) */
  readonly speedMultiplier?: number;
  /** Intensity override (0-1) */
  readonly intensityOverride?: number;
  /** Private instruction only this persona sees */
  readonly specialInstruction?: string;
}

// =============================================================================
// DIRECTOR EVENT TYPES (Server → Director Console)
// =============================================================================

/** Events emitted by the Director Engine for the console UI */
export type DirectorEvent =
  | { readonly type: 'cast_changed'; readonly cast: CastState }
  | { readonly type: 'scene_changed'; readonly scene: SceneState }
  | { readonly type: 'persona_speaking'; readonly personaId: PersonaId; readonly text: string }
  | { readonly type: 'user_transcript'; readonly text: string; readonly emotion?: string }
  | { readonly type: 'director_transcript'; readonly text: string }
  | {
      readonly type: 'emotion_detected';
      readonly personaId: PersonaId;
      readonly emotion: string;
      readonly intensity: number;
    }
  | {
      readonly type: 'arc_phase_changed';
      readonly phase: EmotionPhase;
      readonly phaseIndex: number;
    }
  | { readonly type: 'suggestion'; readonly suggestion: DirectorSuggestion }
  | { readonly type: 'command_executed'; readonly result: DirectorCommandResult }
  | { readonly type: 'error'; readonly message: string };

// =============================================================================
// AUTO-DIRECTOR TYPES
// =============================================================================

/** AI-generated suggestion for the Director */
export interface DirectorSuggestion {
  readonly id: string;
  /** What the auto-director suggests */
  readonly command: DirectorCommand;
  /** Why this is suggested */
  readonly reason: string;
  /** Confidence level (0-1) */
  readonly confidence: number;
  /** Priority level */
  readonly priority: 'low' | 'medium' | 'high';
  /** Timestamp */
  readonly timestamp: number;
}

/** Auto-director operating mode */
export type AutoDirectorMode =
  | 'off' // No suggestions
  | 'suggest' // Suggest but don't execute
  | 'autopilot'; // Auto-execute high-confidence suggestions

// =============================================================================
// DIRECTOR SESSION TYPES
// =============================================================================

/** Configuration for a Director Mode session */
export interface DirectorSessionConfig {
  /** Session ID */
  readonly sessionId: string;
  /** User ID being coached */
  readonly userId: string;
  /** Director's user ID */
  readonly directorUserId: string;
  /** Initial lead persona */
  readonly initialLead: PersonaId;
  /** Initial cast (on stage) */
  readonly initialCast: readonly PersonaId[];
  /** Initial scene mood */
  readonly initialMood: SceneMood;
  /** Auto-director mode */
  readonly autoDirectorMode: AutoDirectorMode;
  /** Maximum ensemble size */
  readonly maxEnsembleSize: number;
  /** Enable music/ambiance control */
  readonly enableMusic: boolean;
}

/** Full state snapshot for Director Console */
export interface DirectorStateSnapshot {
  readonly cast: CastState;
  readonly scene: SceneState;
  readonly actors: readonly PersonaActorState[];
  readonly autoDirectorMode: AutoDirectorMode;
  readonly pendingSuggestions: readonly DirectorSuggestion[];
  readonly isDirectorAudioActive: boolean;
}

// =============================================================================
// DIRECTOR CHANNEL PROTOCOL
// =============================================================================

/** Messages from Director Console → Server */
export type DirectorChannelInbound =
  | { readonly type: 'command'; readonly command: DirectorCommand }
  | { readonly type: 'override'; readonly override: PersonaDirectorOverride }
  | { readonly type: 'query'; readonly query: 'state' | 'suggestions' | 'cast' | 'scene' }
  | { readonly type: 'set_auto_director'; readonly mode: AutoDirectorMode }
  | { readonly type: 'accept_suggestion'; readonly suggestionId: string }
  | { readonly type: 'dismiss_suggestion'; readonly suggestionId: string };

/** Messages from Server → Director Console */
export type DirectorChannelOutbound =
  | { readonly type: 'state'; readonly snapshot: DirectorStateSnapshot }
  | { readonly type: 'event'; readonly event: DirectorEvent }
  | { readonly type: 'error'; readonly message: string };

// =============================================================================
// DATA CHANNEL MESSAGE TYPES (for LiveKit data channel)
// =============================================================================

/** Director-related data channel messages */
export type DirectorDataChannelMessage =
  | { readonly type: 'director_mode_enabled'; readonly directorUserId: string }
  | { readonly type: 'director_mode_disabled' }
  | { readonly type: 'director_command'; readonly command: DirectorCommand };

// =============================================================================
// ENSEMBLE PROMPT TYPES
// =============================================================================

/** Character block in the ensemble prompt */
export interface EnsembleCharacterBlock {
  readonly personaId: PersonaId;
  readonly name: string;
  readonly role: string;
  readonly stagePosition: StagePosition;
  readonly voiceDesign: string;
  readonly emotionInstruction: string;
  readonly systemPromptExcerpt: string;
  readonly cognitiveStyle: string;
  readonly specialInstructions: string | null;
}

/** Configuration for building the ensemble system prompt */
export interface EnsemblePromptConfig {
  readonly characters: readonly EnsembleCharacterBlock[];
  readonly leadPersonaId: PersonaId;
  readonly sceneState: SceneState;
  readonly userName: string;
  readonly crossPersonaInsights: string;
  readonly directorNotes: string;
  readonly emotionArc: EmotionArc | null;
  readonly currentArcPhase: number;
}
