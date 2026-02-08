/**
 * Persona Actor
 *
 * Wraps a persona bundle with Director-Mode-specific state.
 * Each PersonaActor is like an actor in a film production:
 * - Has their own voice, personality, and cognitive style
 * - Can receive private director instructions
 * - Has a "stage position" (lead, supporting, on-deck, off-stage)
 * - Voice and emotion can be overridden by the Director in real-time
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  getPersonaInstructProfile,
  checkTriggerPatterns,
  getEnergyInstruct,
  getLateNightInstruct,
  getRandomThinkingSound,
} from '../humanization/persona-instruct-profiles.js';
import { getVoiceCloneConfig } from '../config.js';

import type { PersonaInstructProfile } from '../humanization/persona-instruct-profiles.js';
import type { VoiceCloneConfig } from '../types.js';
import type {
  PersonaId,
  StagePosition,
  SceneMood,
  PersonaDirectorOverride,
  PersonaActorState,
  EnsembleCharacterBlock,
} from './types.js';

const log = createLogger({ module: 'PersonaActor' });

// =============================================================================
// TYPES
// =============================================================================

/** Minimal persona bundle interface (what we need from the full bundle) */
export interface PersonaBundleRef {
  readonly id: string;
  readonly name: string;
  readonly displayName?: string;
  readonly description: string;
  readonly role?: string;
  /** Excerpt from system-prompt.md for ensemble context */
  readonly systemPromptExcerpt: string;
  /** Cognitive style description */
  readonly cognitiveStyle: string;
  /** Domain expertise areas */
  readonly domains: readonly string[];
}

/** Emotional state tracked per-actor */
export interface ActorEmotionalState {
  userEmotion: string;
  agentTone: string;
  energy: number;
}

// =============================================================================
// PERSONA ACTOR CLASS
// =============================================================================

export class PersonaActor {
  readonly personaId: PersonaId;
  readonly bundle: PersonaBundleRef;
  readonly instructProfile: PersonaInstructProfile;
  readonly voiceCloneConfig: VoiceCloneConfig | undefined;

  // Director-controlled mutable state
  private _stagePosition: StagePosition;
  private _currentMood: SceneMood;
  private _emotionIntensity: number;
  private _isInterruptable: boolean;
  private _directorWhisper: string | null;
  private _overrides: PersonaDirectorOverride;
  private _emotionalState: ActorEmotionalState;

  // Session tracking
  private _turnCount: number;
  private _sessionStartTime: number;

  constructor(config: {
    personaId: PersonaId;
    bundle: PersonaBundleRef;
    initialPosition?: StagePosition;
    initialMood?: SceneMood;
  }) {
    this.personaId = config.personaId;
    this.bundle = config.bundle;
    this.instructProfile = getPersonaInstructProfile(config.personaId);
    this.voiceCloneConfig = getVoiceCloneConfig(config.personaId);

    this._stagePosition = config.initialPosition ?? 'off-stage';
    this._currentMood = config.initialMood ?? 'warm';
    this._emotionIntensity = 0.5;
    this._isInterruptable = true;
    this._directorWhisper = null;
    this._overrides = { personaId: config.personaId };
    this._emotionalState = {
      userEmotion: 'neutral',
      agentTone: 'warm',
      energy: 0.5,
    };
    this._turnCount = 0;
    this._sessionStartTime = Date.now();

    log.debug({ personaId: this.personaId, position: this._stagePosition }, 'PersonaActor created');
  }

  // ===========================================================================
  // GETTERS
  // ===========================================================================

  get stagePosition(): StagePosition {
    return this._stagePosition;
  }

  get currentMood(): SceneMood {
    return this._currentMood;
  }

  get emotionIntensity(): number {
    return this._emotionIntensity;
  }

  get isOnStage(): boolean {
    return this._stagePosition === 'lead' || this._stagePosition === 'supporting';
  }

  get isLead(): boolean {
    return this._stagePosition === 'lead';
  }

  get directorWhisper(): string | null {
    return this._directorWhisper;
  }

  get turnCount(): number {
    return this._turnCount;
  }

  get sessionDurationMs(): number {
    return Date.now() - this._sessionStartTime;
  }

  get sessionDurationMinutes(): number {
    return this.sessionDurationMs / 60000;
  }

  // ===========================================================================
  // STATE MUTATIONS
  // ===========================================================================

  /** Set the actor's stage position */
  setStagePosition(position: StagePosition): void {
    const previous = this._stagePosition;
    this._stagePosition = position;
    log.debug(
      { personaId: this.personaId, from: previous, to: position },
      'Stage position changed'
    );
  }

  /** Set the actor's mood (usually from scene-level mood) */
  setMood(mood: SceneMood, intensity?: number): void {
    this._currentMood = mood;
    if (intensity !== undefined) {
      this._emotionIntensity = Math.max(0, Math.min(1, intensity));
    }
  }

  /** Set interruptability */
  setInterruptable(value: boolean): void {
    this._isInterruptable = value;
  }

  /** Set a private director whisper (cleared after next turn) */
  setDirectorWhisper(instruction: string | null): void {
    this._directorWhisper = instruction;
  }

  /** Clear the director whisper (after it's been consumed) */
  consumeDirectorWhisper(): string | null {
    const whisper = this._directorWhisper;
    this._directorWhisper = null;
    return whisper;
  }

  /** Apply director overrides */
  applyOverride(override: Partial<PersonaDirectorOverride>): void {
    this._overrides = {
      ...this._overrides,
      ...override,
      personaId: this.personaId,
    };
    log.debug({ personaId: this.personaId, override }, 'Director override applied');
  }

  /** Clear all director overrides */
  clearOverrides(): void {
    this._overrides = { personaId: this.personaId };
  }

  /** Update emotional state from turn processing */
  updateEmotionalState(state: Partial<ActorEmotionalState>): void {
    this._emotionalState = { ...this._emotionalState, ...state };
  }

  /** Increment turn count */
  recordTurn(): void {
    this._turnCount++;
  }

  // ===========================================================================
  // VOICE & INSTRUCT GENERATION
  // ===========================================================================

  /**
   * Get the effective voice design description.
   *
   * Priority: Director override > Voice clone config > Instruct profile base
   */
  getEffectiveVoiceDesign(): string {
    if (this._overrides.voiceDesign) {
      return this._overrides.voiceDesign;
    }

    if (this.voiceCloneConfig?.voiceDesignDescription) {
      return this.voiceCloneConfig.voiceDesignDescription;
    }

    return this.instructProfile.baseInstruct;
  }

  /**
   * Get the effective emotion instruction for Qwen3-TTS.
   *
   * Composes layers: base persona → scene mood → detected emotion → director override → fatigue
   *
   * @param text - The text being spoken (for trigger pattern matching)
   * @returns Composed instruct string for Qwen3-TTS
   */
  getEffectiveEmotionInstruction(text?: string): string {
    const layers: string[] = [];

    // Layer 1: Base persona emotion
    if (this._overrides.emotionInstruction) {
      layers.push(this._overrides.emotionInstruction);
    } else {
      layers.push(this.instructProfile.defaultEmotionInstruct);
    }

    // Layer 2: Scene mood influence
    const moodInstruct = getMoodInstruct(this._currentMood, this._emotionIntensity);
    if (moodInstruct) {
      layers.push(moodInstruct);
    }

    // Layer 3: Detected user emotion response
    const emotionResponse = getEmotionResponseInstruct(
      this._emotionalState.userEmotion,
      this._emotionalState.energy
    );
    if (emotionResponse) {
      layers.push(emotionResponse);
    }

    // Layer 4: Trigger pattern match (content-specific)
    if (text) {
      const triggerMatch = checkTriggerPatterns(this.personaId, text);
      if (triggerMatch) {
        layers.push(triggerMatch.instruct);
      }
    }

    // Layer 5: Energy adjustment
    const energyInstruct = getEnergyInstruct(this.personaId, this._emotionalState.energy);
    if (energyInstruct) {
      layers.push(energyInstruct);
    }

    // Layer 6: Late night adjustment
    const hour = new Date().getHours();
    const lateNight = getLateNightInstruct(this.personaId, hour);
    if (lateNight) {
      layers.push(lateNight);
    }

    // Layer 7: Vocal fatigue (time-based)
    const fatigueInstruct = getVocalFatigueInstruct(this.sessionDurationMinutes);
    if (fatigueInstruct) {
      layers.push(fatigueInstruct);
    }

    // Layer 8: Speed override
    if (this._overrides.speedMultiplier) {
      const speedDesc = getSpeedOverrideInstruct(this._overrides.speedMultiplier);
      if (speedDesc) {
        layers.push(speedDesc);
      }
    }

    // Compose all layers into a natural language instruct
    return composeInstruct(layers);
  }

  /**
   * Get a thinking sound for this persona.
   * Returns empty string if probability check fails.
   */
  getThinkingSound(): string {
    if (Math.random() > 0.4) return ''; // 40% chance of thinking sound
    return getRandomThinkingSound(this.personaId);
  }

  // ===========================================================================
  // ENSEMBLE PROMPT BUILDING
  // ===========================================================================

  /**
   * Build this actor's character block for the ensemble system prompt.
   */
  buildCharacterBlock(): EnsembleCharacterBlock {
    const whisper = this._directorWhisper;
    const specialInstruction = this._overrides.specialInstruction;
    const combined = [whisper, specialInstruction].filter(Boolean).join('. ');

    return {
      personaId: this.personaId,
      name: this.bundle.name,
      role: this.bundle.role ?? this.bundle.description,
      stagePosition: this._stagePosition,
      voiceDesign: this.getEffectiveVoiceDesign(),
      emotionInstruction: this.getEffectiveEmotionInstruction(),
      systemPromptExcerpt: this.bundle.systemPromptExcerpt,
      cognitiveStyle: this.bundle.cognitiveStyle,
      specialInstructions: combined || null,
    };
  }

  /**
   * Get the full actor state snapshot for the Director Console.
   */
  getState(): PersonaActorState {
    return {
      personaId: this.personaId,
      stagePosition: this._stagePosition,
      currentMood: this._currentMood,
      emotionIntensity: this._emotionIntensity,
      isInterruptable: this._isInterruptable,
      directorWhisper: this._directorWhisper,
      overrides: { ...this._overrides },
    };
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Convert scene mood to an instruct fragment.
 */
function getMoodInstruct(mood: SceneMood, intensity: number): string | null {
  const intensityDesc = intensity > 0.8 ? 'deeply ' : intensity > 0.5 ? '' : 'gently ';

  const moodMap: Record<SceneMood, string> = {
    warm: `${intensityDesc}warm and caring`,
    serious: `${intensityDesc}serious and focused`,
    playful: `${intensityDesc}playful and light`,
    contemplative: `${intensityDesc}contemplative and reflective`,
    celebratory: `${intensityDesc}celebratory and joyful`,
    supportive: `${intensityDesc}supportive and encouraging`,
    challenging: `${intensityDesc}direct and challenging, with care`,
    vulnerable: `${intensityDesc}gentle, creating safety`,
    empowering: `${intensityDesc}empowering and confident`,
    urgent: `${intensityDesc}focused with urgency`,
    intimate: `${intensityDesc}intimate and personal`,
    energized: `${intensityDesc}energized and alive`,
  };

  return moodMap[mood] ?? null;
}

/**
 * Convert detected user emotion to a response instruct fragment.
 */
function getEmotionResponseInstruct(userEmotion: string, energy: number): string | null {
  if (userEmotion === 'neutral') return null;

  const responseMap: Record<string, string> = {
    happy: 'Matching their joy with genuine warmth',
    excited: 'Reflecting their excitement with bright energy',
    sad: 'Gentle compassion, speaking more slowly with care',
    anxious: 'Calm and grounding, like a safe harbor',
    angry: 'Patient and measured, acknowledging without escalating',
    frustrated: 'Understanding and validating their frustration',
    confused: 'Clear and reassuring, slightly slower for clarity',
    fearful: 'Soothing and protective, radiating safety',
    hopeful: 'Encouraging and uplifting, reflecting their hope',
    grateful: 'Gracious and warm, receiving sincerely',
    vulnerable: 'Extra gentle, creating deep safety with voice',
    overwhelmed: 'Very slow and calm, a peaceful presence',
    lonely: 'Deep warmth and connection in every word',
    grief: 'Quiet, holding compassion, minimal words, maximum presence',
  };

  return responseMap[userEmotion] ?? null;
}

/**
 * Get vocal fatigue instruct based on session duration.
 */
function getVocalFatigueInstruct(durationMinutes: number): string | null {
  if (durationMinutes < 5) return null;
  if (durationMinutes < 10) return 'Naturally settling into a slightly slower, more relaxed pace';
  if (durationMinutes < 20) return 'Warm but with a natural tiredness, speaking more softly';
  return 'Deep in conversation comfort, very natural and relaxed pacing';
}

/**
 * Get speed override instruct from multiplier.
 */
function getSpeedOverrideInstruct(multiplier: number): string | null {
  if (multiplier < 0.8) return 'Speaking very slowly and deliberately';
  if (multiplier < 0.95) return 'Speaking at a slower, more deliberate pace';
  if (multiplier > 1.15) return 'Speaking quickly with energetic pace';
  if (multiplier > 1.05) return 'Speaking at a slightly quicker pace';
  return null; // Normal speed
}

/**
 * Compose multiple instruct layers into a single natural language string.
 * Deduplicates similar concepts and keeps the result concise.
 */
function composeInstruct(layers: readonly string[]): string {
  if (layers.length === 0) return 'Warm and natural conversational tone';
  if (layers.length === 1) return layers[0] as string;

  // Take the first layer as base, append others as modifiers
  const base = layers[0];
  const modifiers = layers.slice(1);

  // Join with natural connectors, keeping it under ~200 chars for TTS efficiency
  let result = base as string;
  for (const modifier of modifiers) {
    const candidate = `${result}. ${modifier}`;
    if (candidate.length > 250) break; // Don't make it too long
    result = candidate;
  }

  return result;
}
