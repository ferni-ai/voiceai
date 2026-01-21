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

import {
  HANDOFF_TIMING,
  getPostSoundPause,
  type TransitionStyle,
} from '../config/handoff-timing.js';
import { SOUND_EFFECTS } from '../config/index.js';
import { getPersona, getTransitionConfig, normalizeAgentId } from '../config/personas.js';
import { appState, setActivePersona } from '../state/app.state.js';
import type { DataMessage, HandoffEvent, NormalizedHandoff } from '../types/events.js';
import {
  isHandoffAcknowledged,
  isHandoffCancelled,
  isHandoffComplete,
  isHandoffFailed,
  isHandoffMessage,
  isHandoffProgress,
  isHandoffStarted,
  isSoftOpenComplete,
  isStateReset,
} from '../types/events.js';
import type { PersonaId } from '../types/persona.js';
import { getHandoffTimeoutMs } from '../utils/environment.js';
import { createLogger } from '../utils/logger.js';
import { audioService, type SoundEffect } from './audio.service.js';
// 🌟 Transcendent Animation Systems - Signature handoff moments
import { handleMomentTrigger, setEmotionalState } from '../systems/index.js';

const log = createLogger('Handoff');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Handoff event callback.
 */
export type HandoffCallback = (handoff: NormalizedHandoff) => void;

/**
 * Banter text for warm handoffs - what the departing and arriving personas say.
 */
export interface HandoffBanter {
  /** What the departing persona says about the arriving one (soft open) */
  softOpen?: string;
  /** What the arriving persona says as welcome */
  arriving?: string;
}

/**
 * Handoff phase callbacks for UI state management.
 */
export type HandoffStartCallback = (
  toPersona: PersonaId,
  fromPersona: PersonaId,
  banter?: HandoffBanter
) => void;
export type HandoffCompleteCallback = (toPersona: PersonaId) => void;
export type HandoffFailedCallback = (
  error: string,
  targetPersona: PersonaId,
  rollbackTo?: PersonaId
) => void;
/** FIX BUG #17: Callback for when backend acknowledges receiving handoff request */
export type HandoffAcknowledgedCallback = (
  target: PersonaId,
  success: boolean,
  error?: string
) => void;
/** FIX BUG #35: Callback for when handoff is rate limited */
export type HandoffRateLimitedCallback = (remainingMs: number) => void;
/** Callback for handoff progress heartbeat */
export type HandoffProgressCallback = (
  targetPersona: PersonaId,
  elapsedMs: number,
  timeoutMs: number
) => void;
/** FIX BUG #32: Callback for when handoff is cancelled */
export type HandoffCancelledCallback = (targetPersona: PersonaId, reason?: string) => void;

/**
 * Callback for when soft open is complete (departing persona finished speaking).
 * This signals the UI to begin the visual transition (roster move, avatar swap).
 * The toPersona is the incoming persona, fromPersona is the departing one.
 */
export type SoftOpenCompleteCallback = (toPersona: PersonaId, fromPersona: PersonaId) => void;

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
  /** WARM HANDOFF: Track soft open complete callbacks for voice-to-visual sync */
  private softOpenCompleteCallbacks: Set<SoftOpenCompleteCallback> = new Set();
  /** Track progress heartbeat callbacks for UI indicators */
  private progressCallbacks: Set<HandoffProgressCallback> = new Set();
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

  /** FIX: Track if sound failed so UI can show visual fallback */
  private _soundFailedForCurrentHandoff = false;

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
  // FIX BUG: Make handoff timeout configurable per environment
  private get HANDOFF_TIMEOUT_MS(): number {
    return getHandoffTimeoutMs();
  }

  /**
   * WARM HANDOFF: Pending soft_open_complete callback
   * Used when soft_open_complete arrives before handoff_started (race condition)
   */
  private _pendingSoftOpenCallback: (() => void) | null = null;

  /** FIX: Timeout ID for pending soft_open_complete callback cleanup */
  private _pendingSoftOpenTimeoutId: ReturnType<typeof setTimeout> | null = null;

  /** FIX: Max time to wait for handoff_started after soft_open_complete (ms) */
  private readonly PENDING_SOFT_OPEN_TIMEOUT_MS = 5000;

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
   * WARM HANDOFF: Register a callback for when soft open is complete.
   * This is when the departing persona has finished speaking their warm sendoff.
   * Use this to trigger the visual transition (roster move, avatar swap).
   */
  onSoftOpenComplete(callback: SoftOpenCompleteCallback): () => void {
    this.softOpenCompleteCallbacks.add(callback);
    return () => this.softOpenCompleteCallbacks.delete(callback);
  }

  /**
   * Register a callback for handoff progress updates.
   * Called periodically during handoff to show progress indicator.
   */
  onHandoffProgress(callback: HandoffProgressCallback): () => void {
    this.progressCallbacks.add(callback);
    return () => this.progressCallbacks.delete(callback);
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
      const personaId = normalizeAgentId(message.activePersona);
      log.info('State reset received from backend:', personaId);
      // BUG FIX: Pass the starting persona so metPersonas is correctly initialized
      this.resetSession(personaId);
      // Update app state to match backend
      setActivePersona(personaId);
      return true;
    }

    if (!isHandoffMessage(message)) {
      log.debug('Message NOT recognized as handoff:', {
        type: (message as Record<string, unknown>).type,
      });
      return false;
    }

    log.debug('Processing handoff message:', { type: message.type });

    // FIX BUG: Only debounce handoff_started messages (user-initiated transitions)
    // Do NOT debounce handoff_complete, handoff_failed, handoff_acknowledged, handoff_cancelled
    // These are backend responses that MUST be processed to properly reset state
    const messageType = (message as HandoffEvent).type;
    const shouldDebounce = messageType === 'handoff_started' || messageType === 'handoff';

    if (shouldDebounce) {
      const now = Date.now();
      if (now - this.lastHandoffTime < this.DEBOUNCE_MS) {
        // FIX BUG #35: Notify callbacks that handoff was rate limited so UI can show feedback
        log.debug('Handoff debounced - notifying rate limit callbacks');
        for (const callback of this.rateLimitedCallbacks) {
          try {
            callback(this.DEBOUNCE_MS - (now - this.lastHandoffTime));
          } catch (err) {
            log.error('Rate limited callback error:', err);
          }
        }
        return true;
      }
      this.lastHandoffTime = now;
    }

    const event = message as HandoffEvent;
    // FIX BUG: Backend may send 'target' OR 'newAgent' - accept either
    const eventWithTarget = event as HandoffEvent & { target?: string };
    const agentId = event.newAgent ?? eventWithTarget.target ?? '';
    const toPersona = normalizeAgentId(agentId);
    const eventWithPrevious = event as HandoffEvent & { previousAgent?: string };
    const fromPersona = eventWithPrevious.previousAgent
      ? normalizeAgentId(eventWithPrevious.previousAgent)
      : appState.get('activePersona').id;

    log.debug('Processing event:', { type: event.type, agentId, toPersona, fromPersona });

    // FIX BUG #31: Detect out-of-order events using sequence numbers
    if (event.seq !== undefined && event.seq <= this.lastSeq) {
      log.warn('Ignoring out-of-order handoff event:', { seq: event.seq, lastSeq: this.lastSeq });
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
      const ackEvent = event as HandoffEvent & {
        target?: string;
        success?: boolean;
        error?: string;
      };
      const target = normalizeAgentId(ackEvent.target ?? ackEvent.newAgent);
      const success = ackEvent.success ?? true;
      const error = ackEvent.error;

      log.info('Handoff acknowledged:', { target, success });

      // Notify acknowledged callbacks
      for (const callback of this.acknowledgedCallbacks) {
        try {
          callback(target, success, error);
        } catch (err) {
          log.error('Handoff acknowledged callback error:', err);
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

      // WARM HANDOFF: Extract banter text from the event
      const banter: HandoffBanter | undefined =
        event.softOpenBanter ?? event.arrivingBanter
          ? { softOpen: event.softOpenBanter, arriving: event.arrivingBanter }
          : undefined;

      // Notify start callbacks (with banter if available)
      for (const callback of this.startCallbacks) {
        try {
          callback(toPersona, fromPersona, banter);
        } catch (error) {
          log.error('Handoff start callback error:', error);
        }
      }

      // WARM HANDOFF: Fire any pending soft_open_complete that arrived before us
      // FIX: Also clear the timeout since handoff_started arrived
      if (this._pendingSoftOpenCallback) {
        log.info('Executing deferred soft_open_complete callback');
        this.clearPendingSoftOpenTimeout();
        this._pendingSoftOpenCallback();
        this._pendingSoftOpenCallback = null;
      }

      // Process like a normal handoff (plays sounds, updates UI)
      const handoff = this.normalizeHandoff(event);
      await this.handleHandoff(handoff);
      return true;
    } else if (isSoftOpenComplete(message)) {
      // WARM HANDOFF: Departing persona finished speaking their warm sendoff.
      // This is the signal to begin the visual transition (avatar swap, roster move).

      // RACE CONDITION GUARD: Check if we received handoff_started first
      if (this._handoffPhase !== 'started') {
        log.warn('Received soft_open_complete before handoff_started - queueing until started:', {
          phase: this._handoffPhase,
          toPersona,
          fromPersona,
        });
        // Queue the callback to fire when handoff_started arrives
        // Use a one-time listener on start callbacks
        const pendingCallback = () => {
          log.info('Soft open complete - deferred execution after handoff_started');
          for (const callback of this.softOpenCompleteCallbacks) {
            try {
              callback(toPersona, fromPersona);
            } catch (error) {
              log.error('Soft open complete callback error:', error);
            }
          }
        };
        // Store pending soft open to fire after next handoff_started
        this._pendingSoftOpenCallback = pendingCallback;

        // FIX: Add timeout to clear pending callback if handoff_started never arrives
        this.clearPendingSoftOpenTimeout();
        this._pendingSoftOpenTimeoutId = setTimeout(() => {
          if (this._pendingSoftOpenCallback) {
            log.warn('Pending soft_open_complete timed out - clearing callback', {
              timeoutMs: this.PENDING_SOFT_OPEN_TIMEOUT_MS,
            });
            this._pendingSoftOpenCallback = null;
            // Dispatch event for UI to show recovery message
            document.dispatchEvent(
              new CustomEvent('ferni:handoff-timeout', {
                detail: { type: 'soft_open_timeout', targetPersona: toPersona },
              })
            );
          }
        }, this.PENDING_SOFT_OPEN_TIMEOUT_MS);

        return true;
      }

      log.info('Soft open complete - beginning visual transition:', { toPersona, fromPersona });

      // Notify soft open complete callbacks - UI should start visual transition NOW
      for (const callback of this.softOpenCompleteCallbacks) {
        try {
          callback(toPersona, fromPersona);
        } catch (error) {
          log.error('Soft open complete callback error:', error);
        }
      }
      return true;
    } else if (isHandoffProgress(message)) {
      // Progress heartbeat - notify UI to show progress indicator
      const elapsedMs = event.elapsedMs ?? 0;
      const timeoutMs = event.timeoutMs ?? 8000;

      log.debug('Handoff progress:', { toPersona, elapsedMs, timeoutMs });

      for (const callback of this.progressCallbacks) {
        try {
          callback(toPersona, elapsedMs, timeoutMs);
        } catch (error) {
          log.error('Handoff progress callback error:', error);
        }
      }
      return true;
    } else if (isHandoffComplete(message)) {
      // FIX BUG #16: Check if we got complete before started (out of order)
      if (this._handoffPhase !== 'started') {
        log.warn(
          'Received handoff_complete in unexpected phase - possible out-of-order delivery:',
          { phase: this._handoffPhase }
        );
        // Still process it, but log the anomaly
      }

      // FIX BUG: Clear timeout since handoff completed successfully
      this.clearHandoffTimeout();

      // Handoff completed - agent is ready
      log.debug('Completing handoff: setting isTransitioning=false', {
        was: this._isTransitioning,
      });
      this._isTransitioning = false;
      this._targetPersona = null;
      // FIX: Reset to 'idle' after a brief moment so next handoff can start cleanly
      // This allows any completion callbacks to see 'complete' state briefly
      this._handoffPhase = 'complete';
      // FIX BUG #38: Reset sound flags on successful completion
      this._soundPlayedForCurrentHandoff = false;
      this._soundFailedForCurrentHandoff = false;

      // FIX: Reset handoff phase to idle after completion processing
      // Use microtask to ensure callbacks see 'complete' state first
      queueMicrotask(() => {
        if (this._handoffPhase === 'complete') {
          this._handoffPhase = 'idle';
          log.debug('Handoff phase reset to idle');
        }
      });

      log.debug('State after complete:', {
        isTransitioning: this._isTransitioning,
        targetPersona: this._targetPersona,
      });

      // FIX: Ensure UI is updated even if handoff_started was missed or arrived late
      // This is a defensive call - if persona is already set, setActivePersona handles it gracefully
      setActivePersona(toPersona);

      // Notify complete callbacks
      for (const callback of this.completeCallbacks) {
        try {
          callback(toPersona);
        } catch (error) {
          log.error('Handoff complete callback error:', error);
        }
      }
      return true;
    } else if (isHandoffFailed(message)) {
      // FIX BUG: Clear timeout on failure
      this.clearHandoffTimeout();

      // Handoff failed - recover gracefully
      const errorMsg = (event as HandoffEvent & { error?: string }).error ?? 'Unknown error';
      // FIX AUDIT GAP #1: Extract rollbackTo for UI state recovery
      const rollbackTo = (event as HandoffEvent & { rollbackTo?: string }).rollbackTo;
      const rollbackPersona = rollbackTo ? normalizeAgentId(rollbackTo) : undefined;

      log.error('Handoff failed:', { errorMsg, rollbackTo: rollbackPersona });

      // FIX BUG #38: If we already played a handoff sound, play recovery sound
      // so the user knows the transition failed (auditory feedback)
      if (this._soundPlayedForCurrentHandoff) {
        try {
          // Play disconnect sound as "failure" indicator
          await audioService.playSound(SOUND_EFFECTS.DISCONNECT as SoundEffect);
          log.debug('Played recovery sound after failed handoff');
        } catch (soundErr) {
          // Non-critical - FIX BUG: Log for debugging even if not re-throwing
          log.debug('Recovery sound failed to play:', soundErr);
        }
        this._soundPlayedForCurrentHandoff = false;
      }

      this._isTransitioning = false;
      this._targetPersona = null;
      this._handoffPhase = 'failed';

      // FIX AUDIT GAP #1: Restore UI to previous persona if rollbackTo provided
      if (rollbackPersona) {
        log.info('Rolling back UI state to:', rollbackPersona);
        setActivePersona(rollbackPersona);
      }

      // Notify failure callbacks (now includes rollbackTo)
      for (const callback of this.failedCallbacks) {
        try {
          callback(errorMsg, toPersona, rollbackPersona);
        } catch (error) {
          log.error('Handoff failed callback error:', error);
        }
      }
      return true;
    } else if (isHandoffCancelled(message)) {
      // FIX BUG: Clear timeout on cancel
      this.clearHandoffTimeout();

      // FIX BUG #32: Handoff was cancelled - reset state gracefully
      const reason = (event as HandoffEvent & { reason?: string }).reason ?? 'Cancelled by user';
      log.info('Handoff cancelled:', reason);
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
          log.error('Handoff cancelled callback error:', error);
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
      log.warn('Handoff rate limited:', {
        requestsInWindow: this._requestsInWindow,
        waitMs: remainingMs,
      });
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
   * Also restores the UI to the previous state.
   *
   * FIX AUDIT GAP #2: Store fromPersona at timeout start for reliable rollback.
   * The timeout captures the "from" persona at the moment the handoff starts,
   * ensuring we always have accurate rollback info even if state changes during transition.
   */
  private startHandoffTimeout(targetPersona: PersonaId): void {
    // Clear any existing timeout
    this.clearHandoffTimeout();

    // Store the current persona before transition for recovery
    // FIX AUDIT GAP #2: Capture at the EXACT moment handoff starts for reliable rollback
    const fromPersona = appState.get('activePersona').id;

    this._handoffTimeoutId = setTimeout(() => {
      log.warn('Handoff timeout - restoring UI:', {
        targetPersona,
        timeoutMs: this.HANDOFF_TIMEOUT_MS,
        fromPersona,
      });

      // Reset transition state
      this._isTransitioning = false;
      this._targetPersona = null;
      this._handoffPhase = 'idle';
      this._soundPlayedForCurrentHandoff = false;

      // FIX AUDIT GAP #2: Restore the UI to the "from" persona captured at start
      // This ensures the button moves back to the correct position
      setActivePersona(fromPersona);

      // FIX AUDIT GAP #2: Notify failed callbacks with timeout error AND rollback info
      // This allows app.ts handlers to also update waveform/avatar persona
      for (const callback of this.failedCallbacks) {
        try {
          callback('Connection timeout - please try again', targetPersona, fromPersona);
        } catch (err) {
          log.error('Handoff timeout callback error:', err);
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
   * FIX: Clear the pending soft open timeout.
   */
  private clearPendingSoftOpenTimeout(): void {
    if (this._pendingSoftOpenTimeoutId) {
      clearTimeout(this._pendingSoftOpenTimeoutId);
      this._pendingSoftOpenTimeoutId = null;
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
          log.error('Rate limit callback error:', err);
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
      log.debug('No handoff in progress to cancel');
      return false;
    }

    const cancelledTarget = this._targetPersona;

    // Reset transition state
    this._isTransitioning = false;
    this._targetPersona = null;
    this._handoffPhase = 'idle';
    this._soundPlayedForCurrentHandoff = false;

    log.info('Handoff cancelled by user:', { target: cancelledTarget });

    // Notify cancelled callbacks
    for (const callback of this.cancelledCallbacks) {
      try {
        callback(cancelledTarget as PersonaId, 'User cancelled');
      } catch (err) {
        log.error('Handoff cancelled callback error:', err);
      }
    }

    // FIX AUDIT GAP #4: Notify backend with better error handling and retry logic
    // Use IIFE to properly handle async errors without losing the cancel result
    (async () => {
      try {
        const { connectionService } = await import('./connection.service.js');
        const room = connectionService.getRoom();

        if (!room?.localParticipant) {
          log.debug('No room/participant available to send cancel - likely already disconnected');
          return;
        }

        // Include target persona for backend state cleanup
        const message = JSON.stringify({
          type: 'handoff_cancel',
          handoffId: this.currentHandoffId,
          targetPersona: cancelledTarget,
          reason: 'User cancelled',
          timestamp: Date.now(),
        });

        // Retry once if first send fails
        let sendAttempt = 0;
        const maxAttempts = 2;

        while (sendAttempt < maxAttempts) {
          try {
            await room.localParticipant.publishData(new TextEncoder().encode(message), {
              reliable: true,
            });
            log.debug('Backend notified of cancellation:', { handoffId: this.currentHandoffId });
            return;
          } catch (sendErr) {
            sendAttempt++;
            if (sendAttempt >= maxAttempts) {
              log.warn('Failed to notify backend of cancellation after retries:', {
                error: String(sendErr),
                attempts: maxAttempts,
              });
            } else {
              // Brief delay before retry
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
          }
        }
      } catch (importErr) {
        // Module import failed - connection service not available
        log.warn('Could not load connection service for cancellation:', String(importErr));
      }
    })();

    return true;
  }

  /**
   * Send a handoff request to the backend via data channel.
   * This is the canonical way to initiate a handoff from any UI component.
   *
   * Features:
   * - Rate limiting (800ms debounce)
   * - Persona ID validation
   * - Retry logic (up to 2 retries)
   * - Proper error handling with callbacks
   *
   * @param targetPersonaId - The persona to hand off to
   * @param options - Optional configuration
   * @returns Promise that resolves when request is sent (not when handoff completes)
   */
  async sendHandoffRequest(
    targetPersonaId: PersonaId,
    options?: {
      /** Skip rate limiting check (use with caution) */
      skipRateLimit?: boolean;
      /** Custom failure handler */
      onFailure?: (error: Error) => void;
    }
  ): Promise<boolean> {
    const { skipRateLimit = false, onFailure } = options ?? {};

    // Rate limit check
    if (!skipRateLimit) {
      const remainingMs = this.checkRateLimit();
      if (remainingMs > 0) {
        log.warn('Handoff request rate limited:', { remainingMs, target: targetPersonaId });
        for (const callback of this.rateLimitedCallbacks) {
          try {
            callback(remainingMs);
          } catch (err) {
            log.error('Rate limit callback error:', err);
          }
        }
        return false;
      }
      this.recordRequest();
    }

    // FIX BUG: Mutex check - don't start handoff during active cameo
    // This prevents voice state corruption from overlapping transitions
    const { cameoService } = await import('./cameo.service.js');
    if (cameoService.isInCameo()) {
      log.warn('Handoff blocked - cameo in progress', {
        target: targetPersonaId,
        cameoPersona: cameoService.getCurrentCameoPersona(),
      });
      const error = new Error('Cannot handoff during active cameo');
      onFailure?.(error);
      return false;
    }

    // Validate persona ID
    const persona = getPersona(targetPersonaId);
    if (!persona || (persona.id === 'ferni' && targetPersonaId !== 'ferni')) {
      const error = new Error(`Invalid persona ID: ${targetPersonaId}`);
      log.error('Invalid handoff target:', { targetPersonaId });
      onFailure?.(error);
      return false;
    }

    // Check if already transitioning
    if (this._isTransitioning) {
      log.warn('Handoff already in progress, ignoring request:', {
        current: this._targetPersona,
        requested: targetPersonaId,
      });
      return false;
    }

    // Set transitioning state
    this._isTransitioning = true;
    this._targetPersona = targetPersonaId;

    // Retry logic
    const MAX_RETRIES = 2;
    const RETRY_DELAY_MS = 500;

    const attemptSend = async (attempt: number = 0): Promise<boolean> => {
      try {
        const { connectionService } = await import('./connection.service.js');
        const room = connectionService.getRoom();

        if (!room?.localParticipant) {
          throw new Error('No room or local participant available');
        }

        const message = JSON.stringify({
          type: 'handoff_request',
          target: targetPersonaId,
          timestamp: Date.now(),
          attempt: attempt + 1,
        });

        log.debug('Sending handoff request:', { attempt: attempt + 1, target: targetPersonaId });

        await room.localParticipant.publishData(new TextEncoder().encode(message), {
          reliable: true,
        });

        log.info('Handoff request sent successfully:', { target: targetPersonaId });

        // Start timeout for handoff completion
        this.startHandoffTimeout(targetPersonaId);

        return true;
      } catch (err) {
        if (attempt < MAX_RETRIES) {
          log.warn('Handoff request failed, retrying:', {
            attempt: attempt + 1,
            error: String(err),
          });
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          return attemptSend(attempt + 1);
        }

        // All retries failed
        const error = err instanceof Error ? err : new Error(String(err));
        log.error('Handoff request failed after all retries:', { error: error.message });

        // Reset state
        this._isTransitioning = false;
        this._targetPersona = null;

        // Notify failure
        onFailure?.(error);
        for (const callback of this.failedCallbacks) {
          try {
            callback(error.message, targetPersonaId);
          } catch (cbErr) {
            log.error('Failed callback error:', cbErr);
          }
        }

        return false;
      }
    };

    return attemptSend();
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
   * BUG FIX: Now accepts the starting persona to properly initialize metPersonas.
   * If no persona provided, defaults to 'ferni' for backward compatibility.
   */
  resetSession(startingPersonaId?: PersonaId): void {
    // FIX BUG: Clear timeouts to prevent stuck states
    this.clearHandoffTimeout();
    this.clearPendingSoftOpenTimeout();

    this.metPersonas.clear();
    // BUG FIX: Use the actual starting persona, not always 'ferni'
    this.metPersonas.add(startingPersonaId ?? 'ferni');
    this._isTransitioning = false;
    this._targetPersona = null;
    // FIX BUG #31: Reset sequence tracking on session reset
    this.lastSeq = -1;
    this.currentHandoffId = null;
    // FIX BUG #16: Reset phase tracking
    this._handoffPhase = 'idle';
    // FIX BUG #38: Reset sound tracking
    this._soundPlayedForCurrentHandoff = false;
    this._soundFailedForCurrentHandoff = false;
    // WARM HANDOFF: Clear pending soft open callback
    this._pendingSoftOpenCallback = null;
  }

  /**
   * FIX BUG #44: Dispose all resources and clear callbacks.
   * Call this when the application is shutting down to prevent memory leaks.
   */
  dispose(): void {
    // FIX BUG: Clear timeouts to prevent stuck states
    this.clearHandoffTimeout();
    this.clearPendingSoftOpenTimeout();

    this.callbacks.clear();
    this.startCallbacks.clear();
    this.completeCallbacks.clear();
    this.failedCallbacks.clear();
    this.acknowledgedCallbacks.clear();
    this.rateLimitedCallbacks.clear();
    this.cancelledCallbacks.clear(); // FIX BUG #32
    this.softOpenCompleteCallbacks.clear(); // WARM HANDOFF
    this.progressCallbacks.clear();
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
    this._soundFailedForCurrentHandoff = false;
    // WARM HANDOFF: Clear pending soft open callback
    this._pendingSoftOpenCallback = null;
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
   * - New format: 'target' field (from coordinator)
   */
  private normalizeHandoff(event: HandoffEvent): NormalizedHandoff {
    // Use previousAgent from event if available, otherwise get from current state
    const eventWithPrevious = event as HandoffEvent & { previousAgent?: string };
    const fromPersona = eventWithPrevious.previousAgent
      ? normalizeAgentId(eventWithPrevious.previousAgent)
      : appState.get('activePersona').id;
    
    // FIX BUG: Backend sends 'target' (from coordinator) OR 'newAgent' (legacy)
    // Accept either field to prevent undefined being passed to normalizeAgentId
    const eventWithTarget = event as HandoffEvent & { target?: string };
    const agentId = event.newAgent ?? eventWithTarget.target;
    const toPersona = normalizeAgentId(agentId);

    log.debug('Normalizing handoff:', {
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
   *
   * REFACTORED: Now fully role-based, no hardcoded persona IDs.
   * Direction determines sound effects and animation style.
   */
  private determineDirection(from: PersonaId, to: PersonaId): NormalizedHandoff['direction'] {
    const fromPersona = getPersona(from);
    const toPersona = getPersona(to);

    // Get transition style from persona config (if available)
    // This allows dramatic/subtle transitions without hardcoding IDs
    const transitionStyle = this.getTransitionStyle(toPersona.id);

    // Dramatic transitions get special direction
    if (transitionStyle === 'dramatic') {
      return 'jack-to-peter'; // Legacy name, but now role-based
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
   * Get the transition style for a persona.
   * Now reads from manifest-generated config instead of hardcoded lists.
   */
  private getTransitionStyle(personaId: PersonaId): TransitionStyle {
    // Get transition config from generated manifest data
    const config = getTransitionConfig(personaId);
    return config.style;
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

    // 🌟 Transcendent: Trigger recognition moment for first meetings
    // This is the powerful "I see you" moment that creates instant connection
    if (isFirstMeeting) {
      handleMomentTrigger('recognition');
    }

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

    // 🌟 Transcendent: Trigger the signature handoff moment
    // This creates a multi-phase orchestrated transition animation
    handleMomentTrigger('handoff');
    // Set emotional state to anticipation (excitement for the new persona)
    setEmotionalState('anticipation');

    // Notify all callbacks
    for (const callback of this.callbacks) {
      try {
        callback(enhanced);
      } catch (error) {
        log.error('Handoff callback error:', error);
      }
    }
  }

  /**
   * Calculate appropriate pause after sound for human-like timing.
   * First meetings and dramatic entrances get longer pauses.
   *
   * REFACTORED: Now uses shared timing function from handoff-timing.ts.
   */
  private calculatePauseAfterSound(
    direction: NormalizedHandoff['direction'],
    isFirstMeeting: boolean
  ): number {
    // Determine transition style from direction
    const style: TransitionStyle = direction === 'jack-to-peter' ? 'dramatic' : 'standard';

    // Use shared timing calculation
    return getPostSoundPause(style, isFirstMeeting);
  }

  /**
   * Play the appropriate handoff sound effect and wait with proper timing.
   * Returns a promise that resolves after sound + pause.
   * FIX: Now dispatches event if sound fails so UI can show visual fallback.
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

    try {
      // Play sound, wait for it to finish, then add the pause
      await audioService.playHandoffSound(soundToPlay, pauseAfterMs);
    } catch (error) {
      // FIX: Track that sound failed and dispatch event for UI fallback
      this._soundFailedForCurrentHandoff = true;
      log.warn('Handoff sound failed - dispatching visual fallback event:', {
        sound: soundToPlay,
        error: String(error),
      });

      // Dispatch event so UI can show visual indicator instead of sound
      document.dispatchEvent(
        new CustomEvent('ferni:sound-fallback', {
          detail: {
            type: 'handoff',
            targetPersona: handoff.toPersona,
            fromPersona: handoff.fromPersona,
            isFirstMeeting,
          },
        })
      );
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/**
 * Singleton handoff service instance.
 */
export const handoffService = new HandoffService();
