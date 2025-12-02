/**
 * Handoff Service
 * 
 * Manages agent handoffs between personas with delightful transitions.
 * Handles voice switching, UI updates, entrance animations, and sound effects.
 * 
 * New delightful handoff flow:
 * 1. handoff_started → Begin visual transition, show loading state
 * 2. handoff_complete → Agent ready, end loading state
 */

import type { PersonaId } from '../types/persona.js';
import type { HandoffEvent, NormalizedHandoff, DataMessage } from '../types/events.js';
import { isHandoffMessage, isHandoffStarted, isHandoffComplete } from '../types/events.js';
import { normalizeAgentId, getPersona } from '../config/personas.js';
import { appState, setActivePersona } from '../state/app.state.js';
import { audioService, type SoundEffect } from './audio.service.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Handoff event callback.
 */
export type HandoffCallback = (handoff: NormalizedHandoff) => void;

/**
 * Handoff phase callbacks for UI state management.
 */
export type HandoffStartCallback = (toPersona: PersonaId, fromPersona: PersonaId) => void;
export type HandoffCompleteCallback = (toPersona: PersonaId) => void;

/**
 * Extended handoff data with entrance info.
 */
export interface EnhancedHandoff extends NormalizedHandoff {
  /** Persona's entrance phrase */
  entrancePhrase: string;
  /** Whether this is the first time meeting this persona */
  isFirstMeeting: boolean;
}

// ============================================================================
// HANDOFF SERVICE
// ============================================================================

/**
 * Agent handoff management service.
 */
class HandoffService {
  private callbacks: Set<HandoffCallback> = new Set();
  private startCallbacks: Set<HandoffStartCallback> = new Set();
  private completeCallbacks: Set<HandoffCompleteCallback> = new Set();
  private lastHandoffTime: number = 0;
  private readonly DEBOUNCE_MS = 500;
  
  /** Track which personas we've met this session */
  private metPersonas: Set<PersonaId> = new Set(['jack-b']);
  
  /** Track if we're currently in a handoff transition */
  private _isTransitioning = false;
  private _targetPersona: PersonaId | null = null;

  /**
   * Check if currently transitioning between agents.
   */
  get isTransitioning(): boolean {
    return this._isTransitioning;
  }
  
  /**
   * Get the persona we're transitioning to (if any).
   */
  get targetPersona(): PersonaId | null {
    return this._targetPersona;
  }

  /**
   * Register a callback for handoff events (after sound plays).
   */
  onHandoff(callback: HandoffCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }
  
  /**
   * Register a callback for when handoff begins (for loading state).
   */
  onHandoffStart(callback: HandoffStartCallback): () => void {
    this.startCallbacks.add(callback);
    return () => this.startCallbacks.delete(callback);
  }
  
  /**
   * Register a callback for when handoff completes (agent ready).
   */
  onHandoffComplete(callback: HandoffCompleteCallback): () => void {
    this.completeCallbacks.add(callback);
    return () => this.completeCallbacks.delete(callback);
  }

  /**
   * Process an incoming data message, checking if it's a handoff.
   * Returns a promise that resolves to true if handoff was processed, false otherwise.
   * 
   * Handles three message types:
   * - handoff_started: Begin transition, show loading state
   * - handoff_complete: Agent ready, end loading state
   * - handoff: Legacy single-message format
   */
  async processDataMessage(message: DataMessage): Promise<boolean> {
    if (!isHandoffMessage(message)) {
      return false;
    }

    // Debounce rapid handoffs
    const now = Date.now();
    if (now - this.lastHandoffTime < this.DEBOUNCE_MS) {
      console.debug('Handoff debounced');
      return true;
    }
    this.lastHandoffTime = now;

    const event = message as HandoffEvent;
    const toPersona = normalizeAgentId(event.newAgent);
    const eventWithPrevious = event as HandoffEvent & { previousAgent?: string };
    const fromPersona = eventWithPrevious.previousAgent 
      ? normalizeAgentId(eventWithPrevious.previousAgent)
      : appState.get('activePersona').id;

    // Handle based on message type
    if (isHandoffStarted(message)) {
      // Handoff is starting - show loading state
      console.log(`🔄 Handoff starting: ${fromPersona} → ${toPersona}`);
      this._isTransitioning = true;
      this._targetPersona = toPersona;
      
      // Notify start callbacks
      for (const callback of this.startCallbacks) {
        try {
          callback(toPersona, fromPersona);
        } catch (error) {
          console.error('Handoff start callback error:', error);
        }
      }
      
      // Process like a normal handoff (plays sounds, updates UI)
      const handoff = this.normalizeHandoff(event);
      await this.handleHandoff(handoff);
      return true;
      
    } else if (isHandoffComplete(message)) {
      // Handoff completed - agent is ready
      console.log(`✅ Handoff complete: ${toPersona} ready`);
      this._isTransitioning = false;
      this._targetPersona = null;
      
      // Notify complete callbacks
      for (const callback of this.completeCallbacks) {
        try {
          callback(toPersona);
        } catch (error) {
          console.error('Handoff complete callback error:', error);
        }
      }
      return true;
      
    } else {
      // Legacy single handoff message - process normally
      const handoff = this.normalizeHandoff(event);
      await this.handleHandoff(handoff);
      return true;
    }
  }

  /**
   * Manually trigger a handoff (for testing or UI-initiated handoffs).
   */
  async triggerHandoff(toPersonaId: PersonaId): Promise<void> {
    const fromPersona = appState.get('activePersona');
    
    const handoff: NormalizedHandoff = {
      fromPersona: fromPersona.id,
      toPersona: toPersonaId,
      direction: this.determineDirection(fromPersona.id, toPersonaId),
    };

    await this.handleHandoff(handoff);
  }

  /**
   * Get the current active agent.
   */
  getCurrentAgent(): PersonaId {
    return appState.get('activePersona').id;
  }

  /**
   * Check if we've met a persona before this session.
   */
  hasMetPersona(personaId: PersonaId): boolean {
    return this.metPersonas.has(personaId);
  }

  /**
   * Reset session state (call on disconnect).
   */
  resetSession(): void {
    this.metPersonas.clear();
    this.metPersonas.add('jack-b');
    this._isTransitioning = false;
    this._targetPersona = null;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Normalize a handoff message to our internal format.
   * Handles all agent ID formats from the backend including:
   * - Full IDs: 'jack-bogle', 'peter-lynch', 'comm-specialist', etc.
   * - Short aliases: 'jack', 'peter', 'alex', 'maya', 'jordan'
   * - Legacy names: 'generic-advisor', 'debt-counselor', 'retirement-specialist'
   */
  private normalizeHandoff(event: HandoffEvent): NormalizedHandoff {
    // Use previousAgent from event if available, otherwise get from current state
    const eventWithPrevious = event as HandoffEvent & { previousAgent?: string };
    const fromPersona = eventWithPrevious.previousAgent 
      ? normalizeAgentId(eventWithPrevious.previousAgent)
      : appState.get('activePersona').id;
    const toPersona = normalizeAgentId(event.newAgent);
    
    console.debug('🔄 Normalizing handoff:', { 
      rawNewAgent: event.newAgent, 
      normalizedTo: toPersona,
      rawPreviousAgent: eventWithPrevious.previousAgent,
      normalizedFrom: fromPersona,
    });
    
    return {
      fromPersona,
      toPersona,
      direction: event.direction ?? this.determineDirection(fromPersona, toPersona),
    };
  }

  /**
   * Determine handoff direction from persona IDs.
   */
  private determineDirection(
    from: PersonaId,
    to: PersonaId
  ): NormalizedHandoff['direction'] {
    // Peter Lynch is involved
    if (to === 'peter-lynch') {
      return 'jack-to-peter';
    }
    if (from === 'peter-lynch') {
      return 'peter-to-jack';
    }

    // Coach to team or team to coach
    const fromPersona = getPersona(from);
    const toPersona = getPersona(to);

    if (fromPersona.role === 'coach' && toPersona.role === 'team') {
      return 'coach-to-team';
    }
    if (fromPersona.role === 'team' && toPersona.role === 'coach') {
      return 'team-to-coach';
    }

    // Default to jack-to-peter for any other case
    return 'jack-to-peter';
  }

  /**
   * Handle a normalized handoff event.
   * 
   * Orchestrates a smooth, human-like transition:
   * 1. Log and validate the handoff
   * 2. Track persona meeting history
   * 3. Play transition sound → wait for completion → pause
   * 4. Update UI state
   * 5. Notify callbacks for additional UI updates
   * 
   * The timing creates: Sound → Pause → UI Update → Voice
   * This feels natural, like a person taking a breath before speaking.
   */
  private async handleHandoff(handoff: NormalizedHandoff): Promise<void> {
    const toPersona = getPersona(handoff.toPersona);
    const fromPersona = getPersona(handoff.fromPersona);
    const isFirstMeeting = !this.metPersonas.has(handoff.toPersona);
    
    console.log(`🔄 Handoff: ${fromPersona.name} → ${toPersona.name}${isFirstMeeting ? ' (first meeting!)' : ''}`);

    // Track that we've met this persona
    this.metPersonas.add(handoff.toPersona);

    // Calculate post-sound pause for human-like timing
    const pauseAfterSound = this.calculatePauseAfterSound(handoff.direction, isFirstMeeting);
    
    // Play sound and WAIT for it to finish, then pause
    await this.playHandoffSoundWithTiming(handoff, isFirstMeeting, pauseAfterSound);

    // Create enhanced handoff data
    const enhanced: EnhancedHandoff = {
      ...handoff,
      entrancePhrase: toPersona.entrancePhrase,
      isFirstMeeting,
    };

    // Update active persona in state
    setActivePersona(handoff.toPersona);

    // Notify all callbacks
    for (const callback of this.callbacks) {
      try {
        callback(enhanced);
      } catch (error) {
        console.error('Handoff callback error:', error);
      }
    }
  }

  /**
   * Calculate appropriate pause after sound for human-like timing.
   * First meetings and dramatic entrances get longer pauses.
   */
  private calculatePauseAfterSound(direction: NormalizedHandoff['direction'], isFirstMeeting: boolean): number {
    // Base pause after sound in ms (gives time for the sound to "land")
    const BASE_PAUSE = 250;
    const FIRST_MEETING_BONUS = 150;
    const DRAMATIC_BONUS = 100;
    
    let pause = BASE_PAUSE;
    
    // First meetings deserve a beat of anticipation
    if (isFirstMeeting) {
      pause += FIRST_MEETING_BONUS;
    }
    
    // Peter Lynch handoffs are more theatrical
    if (direction === 'jack-to-peter') {
      pause += DRAMATIC_BONUS;
    }
    
    return pause;
  }

  /**
   * Play the appropriate handoff sound effect and wait with proper timing.
   * Returns a promise that resolves after sound + pause.
   */
  private async playHandoffSoundWithTiming(
    handoff: NormalizedHandoff, 
    isFirstMeeting: boolean,
    pauseAfterMs: number
  ): Promise<void> {
    const toPersona = getPersona(handoff.toPersona);
    let soundToPlay: SoundEffect;
    
    // Use persona-specific sound if available
    if (toPersona.handoffSound) {
      soundToPlay = toPersona.handoffSound as SoundEffect;
    } else if (isFirstMeeting && handoff.direction === 'coach-to-team') {
      // First meeting gets dramatic entrance
      soundToPlay = 'dramatic-entrance';
    } else {
      // Fall back to direction-based sounds
      switch (handoff.direction) {
        case 'jack-to-peter':
          soundToPlay = 'handoff-to-peter';
          break;
        case 'peter-to-jack':
          soundToPlay = 'handoff-to-jack';
          break;
        case 'coach-to-team':
          soundToPlay = 'dramatic-entrance';
          break;
        case 'team-to-coach':
          soundToPlay = 'connect';
          break;
        default:
          soundToPlay = 'connect';
      }
    }
    
    // Play sound, wait for it to finish, then add the pause
    await audioService.playHandoffSound(soundToPlay, pauseAfterMs);
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/**
 * Singleton handoff service instance.
 */
export const handoffService = new HandoffService();
