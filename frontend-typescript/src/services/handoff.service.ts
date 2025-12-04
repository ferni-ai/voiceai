/**
 * Handoff Service
 * 
 * Manages agent handoffs between personas with delightful transitions.
 * Handles voice switching, UI updates, entrance animations, and sound effects.
 * 
 * New delightful handoff flow:
 * 1. handoff_acknowledged → Request received
 * 2. handoff_started → Begin visual transition, show loading state
 * 3. handoff_complete → Agent ready, end loading state
 * 4. handoff_failed/cancelled → Error recovery or user abort
 * 
 * REFACTOR TODO #96: Consider extracting state management into a HandoffStateManager
 * that encapsulates: isTransitioning, targetPersona, lastSeq, handoffPhase, metPersonas,
 * and provides methods for state transitions with validation.
 */

import type { PersonaId } from '../types/persona.js';
import type { HandoffEvent, NormalizedHandoff, DataMessage } from '../types/events.js';
import { isHandoffMessage, isHandoffStarted, isHandoffComplete, isHandoffFailed, isHandoffAcknowledged, isHandoffCancelled, isStateReset } from '../types/events.js';
import { normalizeAgentId, getPersona } from '../config/personas.js';
import { HANDOFF_TIMING, SOUND_EFFECTS } from '../config/index.js';
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
export type HandoffFailedCallback = (error: string, targetPersona: PersonaId) => void;
/** FIX BUG #17: Callback for when backend acknowledges receiving handoff request */
export type HandoffAcknowledgedCallback = (target: PersonaId, success: boolean, error?: string) => void;
/** FIX BUG #35: Callback for when handoff is rate limited */
export type HandoffRateLimitedCallback = (remainingMs: number) => void;
/** FIX BUG #32: Callback for when handoff is cancelled */
export type HandoffCancelledCallback = (targetPersona: PersonaId, reason?: string) => void;

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
  private failedCallbacks: Set<HandoffFailedCallback> = new Set();
  /** FIX BUG #17: Track acknowledged callbacks */
  private acknowledgedCallbacks: Set<HandoffAcknowledgedCallback> = new Set();
  /** FIX BUG #35: Track rate limited callbacks for visual feedback */
  private rateLimitedCallbacks: Set<HandoffRateLimitedCallback> = new Set();
  /** FIX BUG #32: Track cancelled callbacks */
  private cancelledCallbacks: Set<HandoffCancelledCallback> = new Set();
  private lastHandoffTime: number = 0;
  /**
   * FIX BUG #18 & #21: Use configurable constant synchronized with backend.
   * Imported from shared config to stay in sync with backend HANDOFF_DELAYS.
   */
  private readonly DEBOUNCE_MS = HANDOFF_TIMING.DEBOUNCE_MS;
  
  /** Track which personas we've met this session */
  private metPersonas: Set<PersonaId> = new Set(['ferni']);
  
  /** Track if we're currently in a handoff transition */
  private _isTransitioning = false;
  private _targetPersona: PersonaId | null = null;

  /** FIX BUG #31: Track sequence numbers for ordering and out-of-order detection */
  private lastSeq: number = -1;
  private currentHandoffId: string | null = null;
  
  /** FIX BUG #16: Track handoff phase to detect out-of-order events */
  private _handoffPhase: 'idle' | 'started' | 'complete' | 'failed' = 'idle';
  
  /** FIX BUG #38: Track whether sound has played for current handoff to handle recovery */
  private _soundPlayedForCurrentHandoff = false;

  /**
   * FIX BUG #55: Per-user rate limiting state
   * Prevents excessive handoff requests within a sliding window
   */
  private _requestsInWindow: number = 0;
  private _windowStart: number = Date.now();
  private readonly RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
  private readonly MAX_REQUESTS_PER_WINDOW = 15; // 15 handoffs per minute is already a lot

  /**
   * FIX BUG: Handoff timeout to prevent stuck states
   * If backend doesn't respond within timeout, reset transition state
   */
  private _handoffTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private readonly HANDOFF_TIMEOUT_MS = 15000; // 15 seconds max for handoff

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
   * Register a callback for when handoff fails (for error recovery).
   */
  onHandoffFailed(callback: HandoffFailedCallback): () => void {
    this.failedCallbacks.add(callback);
    return () => this.failedCallbacks.delete(callback);
  }

  /**
   * FIX BUG #17: Register a callback for when backend acknowledges handoff request.
   */
  onHandoffAcknowledged(callback: HandoffAcknowledgedCallback): () => void {
    this.acknowledgedCallbacks.add(callback);
    return () => this.acknowledgedCallbacks.delete(callback);
  }

  /**
   * FIX BUG #35: Register a callback for when handoff is rate limited.
   * Called with the remaining cooldown time in milliseconds.
   */
  onHandoffRateLimited(callback: HandoffRateLimitedCallback): () => void {
    this.rateLimitedCallbacks.add(callback);
    return () => this.rateLimitedCallbacks.delete(callback);
  }

  /**
   * FIX BUG #32: Register a callback for when handoff is cancelled.
   */
  onHandoffCancelled(callback: HandoffCancelledCallback): () => void {
    this.cancelledCallbacks.add(callback);
    return () => this.cancelledCallbacks.delete(callback);
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
    // FIX BUG #33: Handle state reset messages from backend
    if (isStateReset(message)) {
      console.log('📍 State reset received from backend:', message.activePersona);
      this.resetSession();
      // Update app state to match backend
      const personaId = normalizeAgentId(message.activePersona);
      setActivePersona(personaId);
      return true;
    }

    if (!isHandoffMessage(message)) {
      console.log(`🔍 [Handoff] Message NOT recognized as handoff: type=${(message as Record<string, unknown>).type}`);
      return false;
    }

    console.log(`✅ [Handoff] Processing handoff message: type=${message.type}`);

    // FIX BUG: Only debounce handoff_started messages (user-initiated transitions)
    // Do NOT debounce handoff_complete, handoff_failed, handoff_acknowledged, handoff_cancelled
    // These are backend responses that MUST be processed to properly reset state
    const messageType = (message as HandoffEvent).type;
    const shouldDebounce = messageType === 'handoff_started' || messageType === 'handoff';
    
    if (shouldDebounce) {
      const now = Date.now();
      if (now - this.lastHandoffTime < this.DEBOUNCE_MS) {
        // FIX BUG #35: Notify callbacks that handoff was rate limited so UI can show feedback
        console.debug('Handoff debounced - notifying rate limit callbacks');
        for (const callback of this.rateLimitedCallbacks) {
          try {
            callback(this.DEBOUNCE_MS - (now - this.lastHandoffTime));
          } catch (err) {
            console.error('Rate limited callback error:', err);
          }
        }
        return true;
      }
      this.lastHandoffTime = now;
    }

    const event = message as HandoffEvent;
    // FIX BUG: Backend may send 'target' OR 'newAgent' - accept either
    const eventWithTarget = event as HandoffEvent & { target?: string };
    const agentId = event.newAgent || eventWithTarget.target || '';
    const toPersona = normalizeAgentId(agentId);
    const eventWithPrevious = event as HandoffEvent & { previousAgent?: string };
    const fromPersona = eventWithPrevious.previousAgent 
      ? normalizeAgentId(eventWithPrevious.previousAgent)
      : appState.get('activePersona').id;
    
    console.log(`🔄 [Handoff] type=${event.type}, agentId=${agentId}, toPersona=${toPersona}, fromPersona=${fromPersona}`);

    // FIX BUG #31: Detect out-of-order events using sequence numbers
    if (event.seq !== undefined && event.seq <= this.lastSeq) {
      console.warn(`Ignoring out-of-order handoff event: seq=${event.seq}, lastSeq=${this.lastSeq}`);
      return true;
    }
    if (event.seq !== undefined) {
      this.lastSeq = event.seq;
    }
    
    // Track handoff correlation ID
    if (event.handoffId) {
      this.currentHandoffId = event.handoffId;
    }

    // Handle based on message type
    // FIX BUG #17: Handle acknowledgment first
    if (isHandoffAcknowledged(message)) {
      const ackEvent = event as HandoffEvent & { target?: string; success?: boolean; error?: string };
      const target = normalizeAgentId(ackEvent.target || ackEvent.newAgent);
      const success = ackEvent.success ?? true;
      const error = ackEvent.error;
      
      console.log(`📬 Handoff acknowledged: target=${target}, success=${success}`);
      
      // Notify acknowledged callbacks
      for (const callback of this.acknowledgedCallbacks) {
        try {
          callback(target, success, error);
        } catch (err) {
          console.error('Handoff acknowledged callback error:', err);
        }
      }
      return true;
    }
    
    if (isHandoffStarted(message)) {
      // Handoff is starting - show loading state
      this._isTransitioning = true;
      this._targetPersona = toPersona;
      this._handoffPhase = 'started';
      
      // FIX BUG: Start timeout to prevent stuck states
      this.startHandoffTimeout(toPersona);
      
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
      // FIX BUG #16: Check if we got complete before started (out of order)
      if (this._handoffPhase !== 'started') {
        console.warn(`⚠️ Received handoff_complete but phase is '${this._handoffPhase}' - possible out-of-order delivery`);
        // Still process it, but log the anomaly
      }
      
      // FIX BUG: Clear timeout since handoff completed successfully
      this.clearHandoffTimeout();
      
      // Handoff completed - agent is ready
      console.log(`✅ [Handoff] Completing handoff: setting isTransitioning=false (was ${this._isTransitioning})`);
      this._isTransitioning = false;
      this._targetPersona = null;
      this._handoffPhase = 'complete';
      // FIX BUG #38: Reset sound flag on successful completion
      this._soundPlayedForCurrentHandoff = false;
      
      console.log(`✅ [Handoff] State after complete: isTransitioning=${this._isTransitioning}, targetPersona=${this._targetPersona}`);
      
      // Notify complete callbacks
      for (const callback of this.completeCallbacks) {
        try {
          callback(toPersona);
        } catch (error) {
          console.error('Handoff complete callback error:', error);
        }
      }
      return true;
      
    } else if (isHandoffFailed(message)) {
      // FIX BUG: Clear timeout on failure
      this.clearHandoffTimeout();
      
      // Handoff failed - recover gracefully
      const errorMsg = (event as HandoffEvent & { error?: string }).error ?? 'Unknown error';
      console.error(`❌ Handoff failed: ${errorMsg}`);
      
      // FIX BUG #38: If we already played a handoff sound, play recovery sound
      // so the user knows the transition failed (auditory feedback)
      if (this._soundPlayedForCurrentHandoff) {
        try {
          // Play disconnect sound as "failure" indicator
          await audioService.playSound(SOUND_EFFECTS.DISCONNECT as SoundEffect);
          console.debug('Played recovery sound after failed handoff');
        } catch {
          // Non-critical - ignore if sound fails
        }
        this._soundPlayedForCurrentHandoff = false;
      }
      
      this._isTransitioning = false;
      this._targetPersona = null;
      this._handoffPhase = 'failed';
      
      // Notify failure callbacks
      for (const callback of this.failedCallbacks) {
        try {
          callback(errorMsg, toPersona);
        } catch (error) {
          console.error('Handoff failed callback error:', error);
        }
      }
      return true;
      
    } else if (isHandoffCancelled(message)) {
      // FIX BUG: Clear timeout on cancel
      this.clearHandoffTimeout();
      
      // FIX BUG #32: Handoff was cancelled - reset state gracefully
      const reason = (event as HandoffEvent & { reason?: string }).reason ?? 'Cancelled by user';
      console.log(`🚫 Handoff cancelled: ${reason}`);
      this._isTransitioning = false;
      this._targetPersona = null;
      this._handoffPhase = 'idle';
      // FIX BUG #38: Reset sound flag on cancel
      this._soundPlayedForCurrentHandoff = false;
      
      // Notify cancellation callbacks
      for (const callback of this.cancelledCallbacks) {
        try {
          callback(toPersona, reason);
        } catch (error) {
          console.error('Handoff cancelled callback error:', error);
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
   * FIX BUG #55: Check if request is rate limited based on sliding window.
   * Returns remaining wait time in ms if limited, 0 if allowed.
   */
  private checkRateLimit(): number {
    const now = Date.now();
    
    // Reset window if expired
    if (now - this._windowStart > this.RATE_LIMIT_WINDOW_MS) {
      this._requestsInWindow = 0;
      this._windowStart = now;
    }
    
    if (this._requestsInWindow >= this.MAX_REQUESTS_PER_WINDOW) {
      const remainingMs = this.RATE_LIMIT_WINDOW_MS - (now - this._windowStart);
      console.warn(`Handoff rate limited: ${this._requestsInWindow} requests in window. Wait ${remainingMs}ms`);
      return remainingMs;
    }
    
    return 0;
  }

  /**
   * FIX BUG #55: Increment request counter for rate limiting.
   */
  private recordRequest(): void {
    const now = Date.now();
    // Reset window if expired
    if (now - this._windowStart > this.RATE_LIMIT_WINDOW_MS) {
      this._requestsInWindow = 0;
      this._windowStart = now;
    }
    this._requestsInWindow++;
  }

  /**
   * FIX BUG: Start a timeout for handoff transitions.
   * If backend doesn't respond within timeout, reset state to prevent stuck UI.
   */
  private startHandoffTimeout(targetPersona: PersonaId): void {
    // Clear any existing timeout
    this.clearHandoffTimeout();
    
    this._handoffTimeoutId = setTimeout(() => {
      console.warn(`⏰ Handoff timeout: no response for ${targetPersona} after ${this.HANDOFF_TIMEOUT_MS}ms`);
      
      // Reset transition state
      this._isTransitioning = false;
      this._targetPersona = null;
      this._handoffPhase = 'idle';
      this._soundPlayedForCurrentHandoff = false;
      
      // Notify failed callbacks with timeout error
      for (const callback of this.failedCallbacks) {
        try {
          callback('Connection timeout - please try again', targetPersona);
        } catch (err) {
          console.error('Handoff timeout callback error:', err);
        }
      }
    }, this.HANDOFF_TIMEOUT_MS);
  }

  /**
   * FIX BUG: Clear the handoff timeout.
   */
  private clearHandoffTimeout(): void {
    if (this._handoffTimeoutId) {
      clearTimeout(this._handoffTimeoutId);
      this._handoffTimeoutId = null;
    }
  }

  /**
   * Manually trigger a handoff (for testing or UI-initiated handoffs).
   * FIX BUG #55: Now includes per-user rate limiting check.
   */
  async triggerHandoff(toPersonaId: PersonaId): Promise<void> {
    // FIX BUG #55: Check rate limit before processing
    const remainingMs = this.checkRateLimit();
    if (remainingMs > 0) {
      // Notify listeners about rate limiting
      for (const callback of this.rateLimitedCallbacks) {
        try {
          callback(remainingMs);
        } catch (err) {
          console.error('Rate limit callback error:', err);
        }
      }
      return;
    }
    
    this.recordRequest();
    const fromPersona = appState.get('activePersona');
    
    const handoff: NormalizedHandoff = {
      fromPersona: fromPersona.id,
      toPersona: toPersonaId,
      direction: this.determineDirection(fromPersona.id, toPersonaId),
    };

    await this.handleHandoff(handoff);
  }

  /**
   * FIX BUG #37: Cancel an in-progress handoff.
   * This allows users to abort a handoff mid-transition if they change their mind.
   * @returns true if a handoff was cancelled, false if no handoff was in progress
   */
  cancelHandoff(): boolean {
    if (!this._isTransitioning) {
      console.log('No handoff in progress to cancel');
      return false;
    }
    
    const cancelledTarget = this._targetPersona;
    
    // Reset transition state
    this._isTransitioning = false;
    this._targetPersona = null;
    this._handoffPhase = 'idle';
    this._soundPlayedForCurrentHandoff = false;
    
    console.log(`🚫 Handoff to ${cancelledTarget} cancelled by user`);
    
    // Notify cancelled callbacks
    for (const callback of this.cancelledCallbacks) {
      try {
        callback(cancelledTarget as PersonaId, 'User cancelled');
      } catch (err) {
        console.error('Handoff cancelled callback error:', err);
      }
    }
    
    // Optionally notify backend (if it supports cancellation)
    void import('./connection.service.js').then(({ connectionService }) => {
      const room = connectionService.getRoom();
      if (room?.localParticipant && this.currentHandoffId) {
        const message = JSON.stringify({
          type: 'handoff_cancel',
          handoffId: this.currentHandoffId,
          reason: 'User cancelled',
          timestamp: Date.now(),
        });
        room.localParticipant.publishData(
          new TextEncoder().encode(message),
          { reliable: true }
        ).catch((err) => console.warn('Failed to notify backend of cancellation:', err));
      }
    });
    
    return true;
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
    // FIX BUG: Clear timeout to prevent stuck states
    this.clearHandoffTimeout();
    
    this.metPersonas.clear();
    this.metPersonas.add('ferni');
    this._isTransitioning = false;
    this._targetPersona = null;
    // FIX BUG #31: Reset sequence tracking on session reset
    this.lastSeq = -1;
    this.currentHandoffId = null;
    // FIX BUG #16: Reset phase tracking
    this._handoffPhase = 'idle';
    // FIX BUG #38: Reset sound tracking
    this._soundPlayedForCurrentHandoff = false;
  }

  /**
   * FIX BUG #44: Dispose all resources and clear callbacks.
   * Call this when the application is shutting down to prevent memory leaks.
   */
  dispose(): void {
    // FIX BUG: Clear timeout to prevent stuck states
    this.clearHandoffTimeout();
    
    this.callbacks.clear();
    this.startCallbacks.clear();
    this.completeCallbacks.clear();
    this.failedCallbacks.clear();
    this.acknowledgedCallbacks.clear();
    this.rateLimitedCallbacks.clear();
    this.cancelledCallbacks.clear(); // FIX BUG #32
    this.metPersonas.clear();
    this._isTransitioning = false;
    this._targetPersona = null;
    this.lastHandoffTime = 0;
    // FIX BUG #31: Clear sequence tracking on dispose
    this.lastSeq = -1;
    this.currentHandoffId = null;
    // FIX BUG #16: Clear phase tracking on dispose
    this._handoffPhase = 'idle';
    // FIX BUG #38: Clear sound tracking on dispose
    this._soundPlayedForCurrentHandoff = false;
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
   * FIX BUG #22: Uses role-based logic instead of hardcoded persona IDs
   * to be more extensible when adding new personas.
   */
  private determineDirection(
    from: PersonaId,
    to: PersonaId
  ): NormalizedHandoff['direction'] {
    const fromPersona = getPersona(from);
    const toPersona = getPersona(to);

    // FIX BUG #22: Use role-based detection instead of hardcoded IDs
    // This allows new personas to work correctly without code changes
    
    // Peter Lynch has special theatrical transitions
    if (toPersona.id === 'peter-lynch') {
      return 'jack-to-peter';
    }
    if (fromPersona.id === 'peter-lynch') {
      return 'peter-to-jack';
    }

    // Role-based direction determination
    if (fromPersona.role === 'coach' && toPersona.role === 'team') {
      return 'coach-to-team';
    }
    if (fromPersona.role === 'team' && toPersona.role === 'coach') {
      return 'team-to-coach';
    }
    
    // Team to team (specialist handoffs)
    if (fromPersona.role === 'team' && toPersona.role === 'team') {
      return 'coach-to-team'; // Use same sound effect for team-to-team
    }

    // Default fallback
    return 'coach-to-team';
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
    const isFirstMeeting = !this.metPersonas.has(handoff.toPersona);
    

    // Track that we've met this persona
    this.metPersonas.add(handoff.toPersona);

    // Calculate post-sound pause for human-like timing
    const pauseAfterSound = this.calculatePauseAfterSound(handoff.direction, isFirstMeeting);
    
    // FIX BUG #38: Mark that we're about to play a sound for this handoff
    this._soundPlayedForCurrentHandoff = true;
    
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
   * FIX BUG #21 & #29: Uses configurable constants synchronized with backend.
   */
  private calculatePauseAfterSound(direction: NormalizedHandoff['direction'], isFirstMeeting: boolean): number {
    // Base pause after sound in ms (gives time for the sound to "land")
    let pause = HANDOFF_TIMING.POST_SOUND_PAUSE_BASE;
    
    // First meetings deserve a beat of anticipation
    if (isFirstMeeting) {
      pause += HANDOFF_TIMING.POST_SOUND_PAUSE_FIRST_MEETING_BONUS;
    }
    
    // Peter Lynch handoffs are more theatrical
    if (direction === 'jack-to-peter') {
      pause += HANDOFF_TIMING.POST_SOUND_PAUSE_DRAMATIC_BONUS;
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
    
    // FIX BUG #23 & #98: Use constants instead of string literals
    // Use persona-specific sound if available
    if (toPersona.handoffSound) {
      soundToPlay = toPersona.handoffSound as SoundEffect;
    } else if (isFirstMeeting && handoff.direction === 'coach-to-team') {
      // First meeting gets dramatic entrance
      soundToPlay = SOUND_EFFECTS.DRAMATIC_ENTRANCE as SoundEffect;
    } else {
      // Fall back to direction-based sounds
      switch (handoff.direction) {
        case 'jack-to-peter':
          soundToPlay = SOUND_EFFECTS.HANDOFF_TO_PETER as SoundEffect;
          break;
        case 'peter-to-jack':
          soundToPlay = SOUND_EFFECTS.HANDOFF_TO_JACK as SoundEffect;
          break;
        case 'coach-to-team':
          soundToPlay = SOUND_EFFECTS.DRAMATIC_ENTRANCE as SoundEffect;
          break;
        case 'team-to-coach':
          soundToPlay = SOUND_EFFECTS.CONNECT as SoundEffect;
          break;
        default:
          soundToPlay = SOUND_EFFECTS.CONNECT as SoundEffect;
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
