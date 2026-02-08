/**
 * Director Engine
 *
 * The brain of Director Mode. Receives commands from the Director,
 * manages the cast of persona actors, controls scene state, and
 * coordinates with the Qwen3-Omni RealtimeSession.
 *
 * Think of this as the stage manager + assistant director:
 * - Executes Director commands (bring on, send off, set mood, etc.)
 * - Manages cast state (who's on stage, who's leading)
 * - Tracks scene state (mood, pace, emotion arc)
 * - Rebuilds the ensemble system prompt when state changes
 * - Dispatches events to the Director Console
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../../utils/safe-logger.js';
import { PersonaActor } from './persona-actor.js';
import { buildEnsembleSystemPrompt, buildSoloSystemPrompt } from './ensemble-prompt.js';

import type { PersonaBundleRef } from './persona-actor.js';
import type {
  PersonaId,
  CastState,
  SceneState,
  SceneMood,
  ScenePace,
  StagePosition,
  DirectorCommand,
  DirectorCommandResult,
  DirectorEvent,
  DirectorSessionConfig,
  DirectorStateSnapshot,
  PersonaDirectorOverride,
  EmotionArc,
  AutoDirectorMode,
  DirectorSuggestion,
  EnsemblePromptConfig,
  TransitionStyle,
  EntranceStyle,
  ExitStyle,
} from './types.js';

const log = createLogger({ module: 'DirectorEngine' });

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_MAX_ENSEMBLE_SIZE = 4;
const DEFAULT_MOOD: SceneMood = 'warm';
const DEFAULT_PACE: ScenePace = 'natural';
const DEFAULT_MOOD_INTENSITY = 0.6;

// =============================================================================
// DIRECTOR ENGINE CLASS
// =============================================================================

export class DirectorEngine extends EventEmitter {
  // Configuration
  private readonly config: DirectorSessionConfig;

  // Actors registry (all personas, whether on stage or not)
  private readonly actors: Map<PersonaId, PersonaActor> = new Map();

  // Scene state (mutable)
  private sceneState: SceneState;

  // Cast state (derived from actors)
  private _leadPersonaId: PersonaId;

  // Auto-director
  private _autoDirectorMode: AutoDirectorMode;
  private _pendingSuggestions: DirectorSuggestion[] = [];

  // Director audio state
  private _isDirectorAudioActive = false;

  // Track whether system prompt needs rebuild
  private _promptDirty = true;
  private _cachedPrompt: string | null = null;

  constructor(config: DirectorSessionConfig) {
    super();
    this.config = config;
    this._leadPersonaId = config.initialLead;
    this._autoDirectorMode = config.autoDirectorMode;

    this.sceneState = {
      mood: config.initialMood ?? DEFAULT_MOOD,
      moodIntensity: DEFAULT_MOOD_INTENSITY,
      pace: DEFAULT_PACE,
      isHeld: false,
      holdInstruction: null,
      emotionArc: null,
      currentArcPhase: 0,
      turnCount: 0,
      startedAt: Date.now(),
      directorNotes: '',
    };

    log.info(
      {
        sessionId: config.sessionId,
        initialLead: config.initialLead,
        initialCast: config.initialCast,
      },
      'DirectorEngine initialized'
    );
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  /**
   * Register a persona actor with the engine.
   * Must be called for each persona before they can be managed.
   */
  registerActor(actor: PersonaActor): void {
    this.actors.set(actor.personaId, actor);
    log.debug({ personaId: actor.personaId }, 'Actor registered');
  }

  /**
   * Initialize the cast based on config.
   * Sets up initial lead and supporting actors.
   */
  initializeCast(): void {
    // Set all actors to off-stage first
    for (const actor of this.actors.values()) {
      actor.setStagePosition('off-stage');
      actor.setMood(this.sceneState.mood, this.sceneState.moodIntensity);
    }

    // Bring initial cast on stage
    for (const personaId of this.config.initialCast) {
      const actor = this.actors.get(personaId);
      if (actor) {
        if (personaId === this._leadPersonaId) {
          actor.setStagePosition('lead');
        } else {
          actor.setStagePosition('supporting');
        }
      }
    }

    this.markPromptDirty();
    this.emitEvent({ type: 'cast_changed', cast: this.getCastState() });

    log.info(
      {
        lead: this._leadPersonaId,
        onStage: this.config.initialCast,
      },
      'Cast initialized'
    );
  }

  // ===========================================================================
  // COMMAND EXECUTION
  // ===========================================================================

  /**
   * Execute a Director command.
   * This is the main entry point for all Director actions.
   */
  async executeCommand(command: DirectorCommand): Promise<DirectorCommandResult> {
    log.debug({ commandType: command.type }, 'Executing director command');

    try {
      switch (command.type) {
        case 'SET_LEAD':
          await this.switchLead(command.personaId, command.transition);
          break;

        case 'BRING_ON':
          await this.bringOnStage(command.personaId, command.entrance);
          break;

        case 'SEND_OFF':
          await this.sendOffStage(command.personaId, command.exit);
          break;

        case 'ENSEMBLE':
          await this.setEnsemble(command.personaIds as PersonaId[], command.topic);
          break;

        case 'CAMEO':
          await this.triggerCameo(command.personaId, command.instruction);
          break;

        case 'SET_MOOD':
          this.setMood(command.mood, command.intensity, command.transition);
          break;

        case 'SET_PACE':
          this.setPace(command.pace);
          break;

        case 'HOLD':
          this.holdScene(command.instruction);
          break;

        case 'RELEASE':
          this.releaseScene(command.instruction);
          break;

        case 'WHISPER':
          this.whisperToPersona(command.personaId, command.instruction);
          break;

        case 'EMOTION_ARC':
          this.setEmotionArc(command.arc);
          break;

        case 'ADVANCE_ARC':
          this.advanceEmotionArc();
          break;

        case 'MUSIC':
          // Music is handled by the DJ controller — we just forward the event
          this.emitEvent({
            type: 'command_executed',
            result: {
              success: true,
              command,
              stateAfter: {
                cast: this.getCastState(),
                scene: this.sceneState,
              },
            },
          });
          break;

        case 'CUT':
          this.cutScene(command.reason);
          break;

        case 'OVERRIDE':
          this.applyOverride(command.override);
          break;

        default: {
          const exhaustiveCheck: never = command;
          log.warn({ command: exhaustiveCheck }, 'Unknown director command');
        }
      }

      const result: DirectorCommandResult = {
        success: true,
        command,
        stateAfter: {
          cast: this.getCastState(),
          scene: this.sceneState,
        },
      };

      this.emitEvent({ type: 'command_executed', result });
      return result;
    } catch (error) {
      const result: DirectorCommandResult = {
        success: false,
        command,
        error: String(error),
        stateAfter: {
          cast: this.getCastState(),
          scene: this.sceneState,
        },
      };

      this.emitEvent({ type: 'error', message: String(error) });
      return result;
    }
  }

  // ===========================================================================
  // CAST MANAGEMENT
  // ===========================================================================

  private async switchLead(personaId: PersonaId, transition?: TransitionStyle): Promise<void> {
    const newLead = this.actors.get(personaId);
    if (!newLead) {
      throw new Error(`Persona ${personaId} not registered`);
    }

    const oldLead = this.actors.get(this._leadPersonaId);

    // Demote old lead to supporting
    if (oldLead && oldLead.personaId !== personaId) {
      oldLead.setStagePosition('supporting');
    }

    // Promote new lead
    newLead.setStagePosition('lead');
    this._leadPersonaId = personaId;

    // Bring on stage if not already
    if (!newLead.isOnStage) {
      newLead.setStagePosition('lead');
    }

    this.markPromptDirty();
    this.emitEvent({ type: 'cast_changed', cast: this.getCastState() });

    log.info({ from: oldLead?.personaId, to: personaId, transition }, 'Lead switched');
  }

  private async bringOnStage(personaId: PersonaId, entrance?: EntranceStyle): Promise<void> {
    const actor = this.actors.get(personaId);
    if (!actor) {
      throw new Error(`Persona ${personaId} not registered`);
    }

    if (actor.isOnStage) {
      log.debug({ personaId }, 'Already on stage');
      return;
    }

    // Check ensemble size limit
    const onStageCount = this.getActivePersonas().length;
    if (onStageCount >= (this.config.maxEnsembleSize ?? DEFAULT_MAX_ENSEMBLE_SIZE)) {
      throw new Error(
        `Cannot bring ${personaId} on stage: ensemble limit of ${this.config.maxEnsembleSize ?? DEFAULT_MAX_ENSEMBLE_SIZE} reached`
      );
    }

    actor.setStagePosition('supporting');
    actor.setMood(this.sceneState.mood, this.sceneState.moodIntensity);

    this.markPromptDirty();
    this.emitEvent({ type: 'cast_changed', cast: this.getCastState() });

    log.info({ personaId, entrance }, 'Persona brought on stage');
  }

  private async sendOffStage(personaId: PersonaId, exit?: ExitStyle): Promise<void> {
    const actor = this.actors.get(personaId);
    if (!actor) {
      throw new Error(`Persona ${personaId} not registered`);
    }

    if (actor.isLead) {
      throw new Error(`Cannot send off the lead persona (${personaId}). Switch lead first.`);
    }

    actor.setStagePosition('off-stage');
    actor.clearOverrides();
    actor.setDirectorWhisper(null);

    this.markPromptDirty();
    this.emitEvent({ type: 'cast_changed', cast: this.getCastState() });

    log.info({ personaId, exit }, 'Persona sent off stage');
  }

  private async setEnsemble(personaIds: PersonaId[], topic?: string): Promise<void> {
    if (personaIds.length === 0) {
      throw new Error('Ensemble must have at least one persona');
    }

    const maxSize = this.config.maxEnsembleSize ?? DEFAULT_MAX_ENSEMBLE_SIZE;
    if (personaIds.length > maxSize) {
      throw new Error(`Ensemble size ${personaIds.length} exceeds maximum ${maxSize}`);
    }

    // Send everyone off stage first
    for (const actor of this.actors.values()) {
      actor.setStagePosition('off-stage');
    }

    // Bring ensemble on stage
    const leadId = personaIds[0] as PersonaId;
    this._leadPersonaId = leadId;

    for (const personaId of personaIds) {
      const actor = this.actors.get(personaId);
      if (actor) {
        actor.setStagePosition(personaId === leadId ? 'lead' : 'supporting');
        actor.setMood(this.sceneState.mood, this.sceneState.moodIntensity);
      }
    }

    if (topic) {
      this.updateDirectorNotes(`Focus the ensemble on: ${topic}`);
    }

    this.markPromptDirty();
    this.emitEvent({ type: 'cast_changed', cast: this.getCastState() });

    log.info({ personaIds, lead: leadId, topic }, 'Ensemble set');
  }

  private async triggerCameo(personaId: PersonaId, instruction: string): Promise<void> {
    const actor = this.actors.get(personaId);
    if (!actor) {
      throw new Error(`Persona ${personaId} not registered`);
    }

    // Temporarily bring on stage with a one-shot instruction
    const wasOnStage = actor.isOnStage;
    if (!wasOnStage) {
      actor.setStagePosition('supporting');
    }

    actor.setDirectorWhisper(
      `CAMEO: Make a brief, relevant observation: "${instruction}". Then step back.`
    );

    this.markPromptDirty();

    log.info({ personaId, instruction }, 'Cameo triggered');

    // Note: The actor will be sent back off-stage after the cameo turn
    // by the turn processing logic checking consumeDirectorWhisper()
  }

  // ===========================================================================
  // SCENE CONTROL
  // ===========================================================================

  private setMood(mood: SceneMood, intensity: number, transition?: 'cut' | 'fade'): void {
    this.sceneState = {
      ...this.sceneState,
      mood,
      moodIntensity: Math.max(0, Math.min(1, intensity)),
    };

    // Propagate mood to all on-stage actors
    for (const actor of this.actors.values()) {
      if (actor.isOnStage) {
        actor.setMood(mood, intensity);
      }
    }

    this.markPromptDirty();
    this.emitEvent({ type: 'scene_changed', scene: this.sceneState });

    log.info({ mood, intensity, transition }, 'Mood set');
  }

  private setPace(pace: ScenePace): void {
    this.sceneState = { ...this.sceneState, pace };
    this.markPromptDirty();
    this.emitEvent({ type: 'scene_changed', scene: this.sceneState });
  }

  private holdScene(instruction?: string): void {
    this.sceneState = {
      ...this.sceneState,
      isHeld: true,
      holdInstruction: instruction ?? null,
    };

    this.markPromptDirty();
    this.emitEvent({ type: 'scene_changed', scene: this.sceneState });
    log.info({ instruction }, 'Scene held');
  }

  private releaseScene(instruction?: string): void {
    this.sceneState = {
      ...this.sceneState,
      isHeld: false,
      holdInstruction: null,
    };

    if (instruction) {
      this.updateDirectorNotes(instruction);
    }

    this.markPromptDirty();
    this.emitEvent({ type: 'scene_changed', scene: this.sceneState });
    log.info({ instruction }, 'Scene released');
  }

  private cutScene(reason?: string): void {
    // Reset to defaults
    this.sceneState = {
      ...this.sceneState,
      mood: DEFAULT_MOOD,
      moodIntensity: DEFAULT_MOOD_INTENSITY,
      pace: DEFAULT_PACE,
      isHeld: false,
      holdInstruction: null,
      directorNotes: reason ? `After cut: ${reason}` : '',
    };

    // Clear all actor overrides and whispers
    for (const actor of this.actors.values()) {
      actor.clearOverrides();
      actor.setDirectorWhisper(null);
      if (actor.isOnStage) {
        actor.setMood(DEFAULT_MOOD, DEFAULT_MOOD_INTENSITY);
      }
    }

    this.markPromptDirty();
    this.emitEvent({ type: 'scene_changed', scene: this.sceneState });
    log.info({ reason }, 'Scene cut');
  }

  // ===========================================================================
  // EMOTION ARC
  // ===========================================================================

  private setEmotionArc(arc: EmotionArc): void {
    this.sceneState = {
      ...this.sceneState,
      emotionArc: arc,
      currentArcPhase: 0,
    };

    // Apply first phase
    if (arc.phases.length > 0) {
      const firstPhase = arc.phases[0]!;
      this.setMood(firstPhase.mood, firstPhase.intensity);

      if (firstPhase.suggestedLead) {
        const actor = this.actors.get(firstPhase.suggestedLead);
        if (actor && actor.isOnStage) {
          this.switchLead(firstPhase.suggestedLead);
        }
      }
    }

    this.markPromptDirty();
    this.emitEvent({ type: 'scene_changed', scene: this.sceneState });
    log.info({ arcName: arc.name, phases: arc.phases.length }, 'Emotion arc set');
  }

  advanceEmotionArc(): void {
    const arc = this.sceneState.emotionArc;
    if (!arc) return;

    const nextPhase = this.sceneState.currentArcPhase + 1;
    if (nextPhase >= arc.phases.length) {
      log.info('Emotion arc completed');
      return;
    }

    this.sceneState = {
      ...this.sceneState,
      currentArcPhase: nextPhase,
    };

    const phase = arc.phases[nextPhase]!;
    this.setMood(phase.mood, phase.intensity);

    if (phase.suggestedLead) {
      const actor = this.actors.get(phase.suggestedLead);
      if (actor && actor.isOnStage) {
        this.switchLead(phase.suggestedLead);
      }
    }

    this.emitEvent({
      type: 'arc_phase_changed',
      phase,
      phaseIndex: nextPhase,
    });

    log.info({ phaseName: phase.name, phaseIndex: nextPhase }, 'Emotion arc advanced');
  }

  // ===========================================================================
  // WHISPER & OVERRIDES
  // ===========================================================================

  private whisperToPersona(personaId: PersonaId, instruction: string): void {
    const actor = this.actors.get(personaId);
    if (!actor) {
      throw new Error(`Persona ${personaId} not registered`);
    }

    actor.setDirectorWhisper(instruction);
    this.markPromptDirty();

    log.debug({ personaId }, 'Whisper sent to persona');
  }

  private applyOverride(override: PersonaDirectorOverride): void {
    const actor = this.actors.get(override.personaId);
    if (!actor) {
      throw new Error(`Persona ${override.personaId} not registered`);
    }

    actor.applyOverride(override);
    this.markPromptDirty();
  }

  // ===========================================================================
  // DIRECTOR AUDIO
  // ===========================================================================

  /** Mark director audio as active (voice direction mode) */
  setDirectorAudioActive(active: boolean): void {
    this._isDirectorAudioActive = active;
    log.info({ active }, 'Director audio mode changed');
  }

  /** Check if director audio is active */
  get isDirectorAudioActive(): boolean {
    return this._isDirectorAudioActive;
  }

  /**
   * Inject a director voice instruction (from STT of director audio).
   *
   * The instruction is injected as a whisper to the current lead persona,
   * or as a scene-level note if prefixed with "everyone" or "scene".
   */
  injectVoiceInstruction(transcript: string): void {
    const lower = transcript.toLowerCase().trim();

    if (lower.startsWith('everyone') || lower.startsWith('scene')) {
      // Scene-level direction
      const instruction = transcript.replace(/^(everyone|scene)\s*/i, '');
      this.updateDirectorNotes(instruction);
      this.markPromptDirty();
    } else {
      // Whisper to lead persona
      this.whisperToPersona(this._leadPersonaId, transcript);
    }

    this.emitEvent({ type: 'director_transcript', text: transcript });
    log.debug({ transcript }, 'Voice instruction injected');
  }

  // ===========================================================================
  // SYSTEM PROMPT GENERATION
  // ===========================================================================

  /**
   * Get the current ensemble system prompt.
   * Returns cached version if state hasn't changed.
   */
  getSystemPrompt(config: { userName: string; crossPersonaInsights?: string }): string {
    if (!this._promptDirty && this._cachedPrompt) {
      return this._cachedPrompt;
    }

    const activeActors = this.getActiveActors();

    if (activeActors.length <= 1) {
      // Solo mode
      const actor = activeActors[0] ?? this.actors.get(this._leadPersonaId);
      if (!actor) {
        throw new Error('No active persona for system prompt');
      }

      this._cachedPrompt = buildSoloSystemPrompt({
        character: actor.buildCharacterBlock(),
        sceneState: this.sceneState,
        userName: config.userName,
        crossPersonaInsights: config.crossPersonaInsights,
        directorNotes: this.sceneState.directorNotes || undefined,
      });
    } else {
      // Ensemble mode
      const characters = activeActors.map((a) => a.buildCharacterBlock());

      const ensembleConfig: EnsemblePromptConfig = {
        characters,
        leadPersonaId: this._leadPersonaId,
        sceneState: this.sceneState,
        userName: config.userName,
        crossPersonaInsights: config.crossPersonaInsights ?? '',
        directorNotes: this.sceneState.directorNotes,
        emotionArc: this.sceneState.emotionArc,
        currentArcPhase: this.sceneState.currentArcPhase,
      };

      this._cachedPrompt = buildEnsembleSystemPrompt(ensembleConfig);
    }

    this._promptDirty = false;
    return this._cachedPrompt;
  }

  // ===========================================================================
  // STATE QUERIES
  // ===========================================================================

  /** Get current cast state */
  getCastState(): CastState {
    const active: PersonaId[] = [];
    const onDeck: PersonaId[] = [];
    const offStage: PersonaId[] = [];
    const positions: Record<string, StagePosition> = {};

    for (const [id, actor] of this.actors) {
      positions[id] = actor.stagePosition;

      switch (actor.stagePosition) {
        case 'lead':
        case 'supporting':
          active.push(id);
          break;
        case 'on-deck':
          onDeck.push(id);
          break;
        case 'off-stage':
          offStage.push(id);
          break;
      }
    }

    return {
      activePersonas: active,
      leadPersona: this._leadPersonaId,
      onDeck,
      offStage,
      positions: positions as Record<PersonaId, StagePosition>,
    };
  }

  /** Get current scene state */
  getSceneState(): SceneState {
    return { ...this.sceneState };
  }

  /** Get the current lead persona ID */
  get leadPersonaId(): PersonaId {
    return this._leadPersonaId;
  }

  /** Get a specific actor */
  getActor(personaId: PersonaId): PersonaActor | undefined {
    return this.actors.get(personaId);
  }

  /** Get all actors currently on stage */
  getActiveActors(): PersonaActor[] {
    return Array.from(this.actors.values()).filter((a) => a.isOnStage);
  }

  /** Get all active persona IDs */
  getActivePersonas(): PersonaId[] {
    return this.getActiveActors().map((a) => a.personaId);
  }

  /** Get full state snapshot for Director Console */
  getStateSnapshot(): DirectorStateSnapshot {
    return {
      cast: this.getCastState(),
      scene: this.sceneState,
      actors: Array.from(this.actors.values()).map((a) => a.getState()),
      autoDirectorMode: this._autoDirectorMode,
      pendingSuggestions: [...this._pendingSuggestions],
      isDirectorAudioActive: this._isDirectorAudioActive,
    };
  }

  /** Check if we're in ensemble mode (multiple personas on stage) */
  get isEnsembleMode(): boolean {
    return this.getActiveActors().length > 1;
  }

  // ===========================================================================
  // AUTO-DIRECTOR
  // ===========================================================================

  /** Set auto-director mode */
  setAutoDirectorMode(mode: AutoDirectorMode): void {
    this._autoDirectorMode = mode;
    log.info({ mode }, 'Auto-director mode changed');
  }

  /** Add a suggestion from the auto-director */
  async addSuggestion(suggestion: DirectorSuggestion): Promise<void> {
    this._pendingSuggestions.push(suggestion);
    this.emitEvent({ type: 'suggestion', suggestion });

    // Auto-execute if in autopilot and high confidence
    if (
      this._autoDirectorMode === 'autopilot' &&
      suggestion.confidence > 0.8 &&
      suggestion.priority === 'high'
    ) {
      await this.executeCommand(suggestion.command);
      this._pendingSuggestions = this._pendingSuggestions.filter((s) => s.id !== suggestion.id);
    }
  }

  /** Accept a suggestion (execute it) */
  async acceptSuggestion(suggestionId: string): Promise<void> {
    const suggestion = this._pendingSuggestions.find((s) => s.id === suggestionId);
    if (!suggestion) return;

    await this.executeCommand(suggestion.command);
    this._pendingSuggestions = this._pendingSuggestions.filter((s) => s.id !== suggestionId);
  }

  /** Dismiss a suggestion */
  dismissSuggestion(suggestionId: string): void {
    this._pendingSuggestions = this._pendingSuggestions.filter((s) => s.id !== suggestionId);
  }

  // ===========================================================================
  // TURN TRACKING
  // ===========================================================================

  /** Record that a turn has been processed */
  recordTurn(): void {
    this.sceneState = {
      ...this.sceneState,
      turnCount: this.sceneState.turnCount + 1,
    };

    // Record turn on all active actors
    for (const actor of this.getActiveActors()) {
      actor.recordTurn();
    }
  }

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  /** Clean up all resources */
  cleanup(): void {
    this.actors.clear();
    this._pendingSuggestions = [];
    this._cachedPrompt = null;
    this.removeAllListeners();
    log.info({ sessionId: this.config.sessionId }, 'DirectorEngine cleaned up');
  }

  // ===========================================================================
  // INTERNAL HELPERS
  // ===========================================================================

  private markPromptDirty(): void {
    this._promptDirty = true;
    this._cachedPrompt = null;
  }

  private updateDirectorNotes(notes: string): void {
    this.sceneState = {
      ...this.sceneState,
      directorNotes: notes,
    };
  }

  private emitEvent(event: DirectorEvent): void {
    this.emit('director_event', event);
  }
}
