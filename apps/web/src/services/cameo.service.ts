/**
 * Cameo Service - Frontend State Management
 *
 * Manages the frontend state for team member "pop-in" cameos.
 * Coordinates with the audio and UI systems to create a seamless
 * visual and auditory experience.
 *
 * USAGE:
 * ```typescript
 * import { cameoService } from './services/cameo.service.js';
 *
 * // Listen for cameo state changes
 * cameoService.onCameoStart((personaId) => {
 *   // Update UI for cameo persona
 * });
 *
 * cameoService.onCameoEnd(() => {
 *   // Return UI to host persona
 * });
 * ```
 */

import { CAMEO_SOUNDS, getCameoPersonaColors } from '../config/cameo-config.js';
import type { DataMessage } from '../types/events.js';
import { createLogger } from '../utils/logger.js';
import { audioService, type SoundEffect } from './audio.service.js';
import {
  rosterPreferences,
  type TeamMemberId as RosterTeamMemberId,
} from './roster-preferences.service.js';
import { isTeamMemberUnlocked, type TeamMemberId } from './team-unlock.service.js';

const log = createLogger('CameoService');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Cameo data message from backend
 *
 * Full lifecycle:
 * - cameo_starting: Visual prep (frontend should start animation)
 * - cameo_start: Voice switch happened, persona is speaking
 * - cameo_ending: Cameo wrapping up (persona said handback)
 * - cameo_complete: Back to Ferni
 * - cameo_cancelled/cameo_failed: Something went wrong
 */
export interface CameoDataMessage {
  type:
    | 'cameo_starting'
    | 'cameo_start'
    | 'cameo_ending'
    | 'cameo_complete'
    | 'cameo_cancelled'
    | 'cameo_failed';
  personaId: string;
  personaName: string;
  personaColor?: string;
  greeting?: string;
  isFirstCameo?: boolean;
  voiceId?: string;
  error?: string;
  cameoId?: string;
  duration?: number;
}

/**
 * Cameo state
 */
export interface CameoState {
  /** Whether a cameo is currently active */
  isActive: boolean;

  /** The persona currently doing the cameo */
  currentPersonaId: string | null;

  /** Display name of current cameo persona */
  currentPersonaName: string | null;

  /** When the current cameo started */
  startTime: number | null;

  /** Unique ID of current cameo */
  cameoId: string | null;

  /** Whether this is the first cameo from this persona this session */
  isFirstCameo: boolean;

  /** Personas who have done cameos this session */
  personasWhoCameoed: Set<string>;
}

/**
 * Callback types
 */
export type CameoStartCallback = (
  personaId: string,
  personaName: string,
  isFirstCameo: boolean
) => void;
export type CameoEndCallback = () => void;
export type CameoFailedCallback = (error: string) => void;

// ============================================================================
// CAMEO SERVICE
// ============================================================================

// ============================================================================
// CONFIGURATION
// ============================================================================

const CAMEO_SAFETY_CONFIG = {
  /** Max time a cameo can be active before auto-cleanup (ms) */
  MAX_CAMEO_DURATION: 30_000, // 30 seconds

  /** Debounce time to prevent double sounds (ms) */
  SOUND_DEBOUNCE: 500,
};

/**
 * Frontend cameo state management service
 */
class CameoService {
  private state: CameoState = {
    isActive: false,
    currentPersonaId: null,
    currentPersonaName: null,
    startTime: null,
    cameoId: null,
    isFirstCameo: false,
    personasWhoCameoed: new Set(),
  };

  private startCallbacks: Set<CameoStartCallback> = new Set();
  private endCallbacks: Set<CameoEndCallback> = new Set();
  private failedCallbacks: Set<CameoFailedCallback> = new Set();

  /** Timer for auto-cleanup of orphaned cameos */
  private cleanupTimer: ReturnType<typeof setTimeout> | null = null;

  /** Timestamp of last arrival sound to prevent double-play */
  private lastArrivalSoundTime: number = 0;

  /** Timestamp of last return sound to prevent double-play */
  private lastReturnSoundTime: number = 0;

  // ========================================
  // Public API
  // ========================================

  /**
   * Register callback for cameo start
   */
  onCameoStart(callback: CameoStartCallback): () => void {
    this.startCallbacks.add(callback);
    return () => this.startCallbacks.delete(callback);
  }

  /**
   * Register callback for cameo end
   */
  onCameoEnd(callback: CameoEndCallback): () => void {
    this.endCallbacks.add(callback);
    return () => this.endCallbacks.delete(callback);
  }

  /**
   * Register callback for cameo failure
   */
  onCameoFailed(callback: CameoFailedCallback): () => void {
    this.failedCallbacks.add(callback);
    return () => this.failedCallbacks.delete(callback);
  }

  /**
   * Get current cameo state
   */
  getState(): Readonly<CameoState> {
    return { ...this.state, personasWhoCameoed: new Set(this.state.personasWhoCameoed) };
  }

  /**
   * Check if a cameo is currently active
   */
  isInCameo(): boolean {
    return this.state.isActive;
  }

  /**
   * Get current cameo persona ID (if in cameo)
   */
  getCurrentCameoPersona(): string | null {
    return this.state.currentPersonaId;
  }

  /**
   * Process a data message from the backend
   * Returns true if it was a cameo message
   */
  processDataMessage(message: DataMessage): boolean {
    if (!this.isCameoMessage(message)) {
      return false;
    }

    const cameoMessage = message as unknown as CameoDataMessage;

    switch (cameoMessage.type) {
      case 'cameo_starting':
        // Early signal - prepare UI but don't play sounds yet
        void this.handleCameoStarting(cameoMessage);
        return true;

      case 'cameo_start':
        void this.handleCameoStart(cameoMessage);
        return true;

      case 'cameo_ending':
        // Cameo wrapping up - persona said handback
        void this.handleCameoEnding(cameoMessage);
        return true;

      case 'cameo_complete':
        void this.handleCameoComplete(cameoMessage);
        return true;

      case 'cameo_cancelled':
        void this.handleCameoCancelled(cameoMessage);
        return true;

      case 'cameo_failed':
        void this.handleCameoFailed(cameoMessage);
        return true;

      default:
        return false;
    }
  }

  /**
   * Reset session state
   */
  resetSession(): void {
    this.state = {
      isActive: false,
      currentPersonaId: null,
      currentPersonaName: null,
      startTime: null,
      cameoId: null,
      isFirstCameo: false,
      personasWhoCameoed: new Set(),
    };
    log.info('Cameo session state reset');
  }

  /**
   * Dispose the service
   */
  dispose(): void {
    this.startCallbacks.clear();
    this.endCallbacks.clear();
    this.failedCallbacks.clear();
    this.resetSession();
  }

  // ========================================
  // Private Methods
  // ========================================

  /**
   * Check if a message is a cameo message
   */
  private isCameoMessage(message: DataMessage): boolean {
    const msg = message as unknown as { type?: string };
    return (
      msg.type === 'cameo_starting' ||
      msg.type === 'cameo_start' ||
      msg.type === 'cameo_ending' ||
      msg.type === 'cameo_complete' ||
      msg.type === 'cameo_cancelled' ||
      msg.type === 'cameo_failed'
    );
  }

  /**
   * Handle cameo_starting - early signal for UI prep
   *
   * This fires BEFORE the voice switch, giving the frontend time to:
   * - Prepare visual animations
   * - Start playing arrival sounds
   * - Set up CSS variables for persona colors
   *
   * The actual cameo callbacks are triggered on cameo_start (after voice switch)
   */
  private async handleCameoStarting(message: CameoDataMessage): Promise<void> {
    const { personaId, personaName, isFirstCameo } = message;

    // FIX BUG: Mutex check - don't start cameo during active handoff
    // This prevents voice state corruption from overlapping transitions
    const { handoffService } = await import('./handoff.service.js');
    if (handoffService.isTransitioning) {
      log.warn('🎬 Cameo blocked - handoff in progress', {
        personaId,
        handoffTarget: handoffService.targetPersona,
      });
      return;
    }

    log.info('🎬 Cameo starting (early signal)', { personaId, personaName, isFirstCameo });

    // Play arrival sound early for better UX (with debounce to prevent double-play)
    try {
      await this.playArrivalSoundDebounced();
    } catch (err) {
      log.warn('Failed to play cameo arrival sound', { error: String(err) });
    }

    // Pre-set CSS variables so animations can start immediately
    const colors = getCameoPersonaColors(personaId);
    document.documentElement.style.setProperty('--cameo-persona-primary', colors.primary);
    document.documentElement.style.setProperty('--cameo-persona-glow', colors.glow);

    log.debug('🎬 Cameo UI prep complete, waiting for cameo_start');
  }

  /**
   * Handle cameo_ending - persona is wrapping up
   *
   * This fires when the cameo persona says their handback phrase,
   * giving the frontend time to prepare the exit animation.
   */
  private async handleCameoEnding(message: CameoDataMessage): Promise<void> {
    const { personaId, duration } = message;

    log.info('🎬 Cameo ending', { personaId, duration });

    // Play return sound early so it syncs with exit animation (with debounce)
    try {
      await this.playReturnSoundDebounced();
    } catch (err) {
      log.warn('Failed to play cameo return sound', { error: String(err) });
    }

    log.debug('🎬 Cameo exit prep complete, waiting for cameo_complete');
  }

  /**
   * Handle cameo start (cameo_start) - voice switch has happened
   *
   * NOTE: Sound is played in handleCameoStarting (which fires first).
   * This handler focuses on state updates and triggering UI callbacks.
   *
   * AUTO-ADD TO ROSTER: If this team member is unlocked but not in the user's
   * roster, we automatically add them so they appear visually when Ferni
   * calls them back.
   */
  private async handleCameoStart(message: CameoDataMessage): Promise<void> {
    const { personaId, personaName, isFirstCameo, cameoId } = message;

    log.info('🎬 Cameo started (voice switched)', { personaId, personaName, isFirstCameo });

    // AUTO-ADD TO ROSTER: If this team member is unlocked but not in the user's
    // roster, add them so they show up visually when Ferni calls them.
    // This creates the "Ferni brought them back" experience.
    const isUnlocked = isTeamMemberUnlocked(personaId as TeamMemberId);
    const isInRoster = rosterPreferences.isMemberVisible(personaId as RosterTeamMemberId);

    if (isUnlocked && !isInRoster) {
      log.info('🎬 Auto-adding team member to roster (Ferni called them back):', personaId);
      rosterPreferences.addMember(personaId as RosterTeamMemberId);

      // Dispatch event to trigger roster rebuild so they appear
      document.dispatchEvent(new CustomEvent('ferni:roster-changed'));
    }

    // Clear any existing cleanup timer (in case of rapid cameos)
    this.clearCleanupTimer();

    // Update state
    const wasFirstCameo = !this.state.personasWhoCameoed.has(personaId);
    this.state = {
      isActive: true,
      currentPersonaId: personaId,
      currentPersonaName: personaName,
      startTime: Date.now(),
      cameoId: cameoId || null,
      isFirstCameo: isFirstCameo ?? wasFirstCameo,
      personasWhoCameoed: new Set([...this.state.personasWhoCameoed, personaId]),
    };

    // Set CSS variables for persona colors (may already be set from cameo_starting)
    const colors = getCameoPersonaColors(personaId);
    document.documentElement.style.setProperty('--cameo-persona-primary', colors.primary);
    document.documentElement.style.setProperty('--cameo-persona-glow', colors.glow);
    document.body.setAttribute('data-cameo-active', 'true');
    document.body.setAttribute('data-cameo-persona', personaId);

    // Start cleanup timer in case cameo_complete never arrives
    this.startCleanupTimer(personaId);

    // Notify callbacks - THIS triggers the visual pop-in animation
    for (const callback of this.startCallbacks) {
      try {
        callback(personaId, personaName, this.state.isFirstCameo);
      } catch (err) {
        log.error('Cameo start callback error', { error: String(err) });
      }
    }

    log.info('🎬 Cameo callbacks fired', {
      personaId,
      duration: Date.now() - this.state.startTime!,
    });
  }

  /**
   * Handle cameo complete
   *
   * NOTE: Sound is played in handleCameoEnding (which fires first).
   * This handler focuses on state cleanup and triggering UI callbacks.
   */
  private async handleCameoComplete(message: CameoDataMessage): Promise<void> {
    const { personaId } = message;
    const duration = this.state.startTime ? Date.now() - this.state.startTime : 0;

    log.info('🎬 Cameo complete', { personaId, duration });

    // Clear the cleanup timer - cameo completed normally
    this.clearCleanupTimer();

    // Update state
    this.state.isActive = false;
    this.state.currentPersonaId = null;
    this.state.currentPersonaName = null;
    this.state.startTime = null;
    this.state.cameoId = null;
    this.state.isFirstCameo = false;

    // Clear CSS variables
    document.documentElement.style.removeProperty('--cameo-persona-primary');
    document.documentElement.style.removeProperty('--cameo-persona-glow');
    document.body.removeAttribute('data-cameo-active');
    document.body.removeAttribute('data-cameo-persona');

    // Notify callbacks - THIS triggers the visual pop-out animation
    for (const callback of this.endCallbacks) {
      try {
        callback();
      } catch (err) {
        log.error('Cameo end callback error', { error: String(err) });
      }
    }

    log.info('🎬 Cameo end callbacks fired', { personaId, totalDuration: duration });
  }

  /**
   * Handle cameo cancelled
   */
  private async handleCameoCancelled(message: CameoDataMessage): Promise<void> {
    const { personaId, error } = message;

    log.info('Cameo cancelled', { personaId, reason: error });

    // Clear the cleanup timer
    this.clearCleanupTimer();

    // Reset state
    this.state.isActive = false;
    this.state.currentPersonaId = null;
    this.state.currentPersonaName = null;
    this.state.startTime = null;
    this.state.cameoId = null;
    this.state.isFirstCameo = false;

    // Clear CSS variables
    document.documentElement.style.removeProperty('--cameo-persona-primary');
    document.documentElement.style.removeProperty('--cameo-persona-glow');
    document.body.removeAttribute('data-cameo-active');
    document.body.removeAttribute('data-cameo-persona');

    // Notify end callbacks (cancelled is a type of end)
    for (const callback of this.endCallbacks) {
      try {
        callback();
      } catch (err) {
        log.error('Cameo end callback error', { error: String(err) });
      }
    }
  }

  /**
   * Handle cameo failed
   */
  private async handleCameoFailed(message: CameoDataMessage): Promise<void> {
    const { personaId, error } = message;

    log.error('Cameo failed', { personaId, error });

    // Clear the cleanup timer
    this.clearCleanupTimer();

    // Reset state
    this.state.isActive = false;
    this.state.currentPersonaId = null;
    this.state.currentPersonaName = null;
    this.state.startTime = null;
    this.state.cameoId = null;
    this.state.isFirstCameo = false;

    // Clear CSS variables
    document.documentElement.style.removeProperty('--cameo-persona-primary');
    document.documentElement.style.removeProperty('--cameo-persona-glow');
    document.body.removeAttribute('data-cameo-active');
    document.body.removeAttribute('data-cameo-persona');

    // Notify failed callbacks
    for (const callback of this.failedCallbacks) {
      try {
        callback(error || 'Unknown error');
      } catch (err) {
        log.error('Cameo failed callback error', { error: String(err) });
      }
    }
  }

  // ========================================
  // Cleanup Timer Management
  // ========================================

  /**
   * Start cleanup timer for orphaned cameos
   * If cameo_complete never arrives, auto-cleanup after MAX_CAMEO_DURATION
   */
  private startCleanupTimer(personaId: string): void {
    this.clearCleanupTimer();

    this.cleanupTimer = setTimeout(() => {
      if (this.state.isActive) {
        log.warn('🎬 Cameo timeout - auto-cleaning orphaned state', {
          personaId,
          wasActive: this.state.currentPersonaId,
          maxDuration: CAMEO_SAFETY_CONFIG.MAX_CAMEO_DURATION,
        });

        // Force cleanup
        this.forceCleanup();
      }
    }, CAMEO_SAFETY_CONFIG.MAX_CAMEO_DURATION);

    log.debug('🎬 Cleanup timer started', {
      personaId,
      timeout: CAMEO_SAFETY_CONFIG.MAX_CAMEO_DURATION,
    });
  }

  /**
   * Clear the cleanup timer
   */
  private clearCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
      log.debug('🎬 Cleanup timer cleared');
    }
  }

  /**
   * Force cleanup of orphaned cameo state
   * Called by timeout or when page visibility changes
   *
   * NOTE: This does not notify the backend to switch voice back.
   * The backend has its own max duration timeout that will handle voice recovery.
   * If backend gets out of sync, the next handoff/cameo will reset state.
   */
  private forceCleanup(): void {
    log.warn(
      '🎬 Forcing cameo cleanup (frontend timeout - backend voice may still be cameo persona)'
    );

    // Reset state
    this.state.isActive = false;
    this.state.currentPersonaId = null;
    this.state.currentPersonaName = null;
    this.state.startTime = null;
    this.state.cameoId = null;
    this.state.isFirstCameo = false;

    // Clear CSS variables
    document.documentElement.style.removeProperty('--cameo-persona-primary');
    document.documentElement.style.removeProperty('--cameo-persona-glow');
    document.body.removeAttribute('data-cameo-active');
    document.body.removeAttribute('data-cameo-persona');

    // Notify end callbacks
    for (const callback of this.endCallbacks) {
      try {
        callback();
      } catch (err) {
        log.error('Cameo force cleanup callback error', { error: String(err) });
      }
    }
  }

  // ========================================
  // Sound Playing (with debounce)
  // ========================================

  /**
   * Play the cameo arrival sound with debounce to prevent double-play
   * Tries: cameo-arrive → dramatic-entrance → connect
   */
  private async playArrivalSoundDebounced(): Promise<void> {
    const now = Date.now();
    if (now - this.lastArrivalSoundTime < CAMEO_SAFETY_CONFIG.SOUND_DEBOUNCE) {
      log.debug('🎬 Arrival sound debounced (already played recently)');
      return;
    }
    this.lastArrivalSoundTime = now;

    await this.playArrivalSound();
  }

  /**
   * Play the cameo arrival sound
   * Tries: cameo-arrive → dramatic-entrance → connect
   */
  private async playArrivalSound(): Promise<void> {
    const soundsToTry: SoundEffect[] = [
      CAMEO_SOUNDS.ARRIVAL as SoundEffect,
      CAMEO_SOUNDS.ARRIVAL_FALLBACK as SoundEffect,
      CAMEO_SOUNDS.FALLBACK as SoundEffect,
    ];

    for (const sound of soundsToTry) {
      try {
        await audioService.playSound(sound);
        log.debug('Played cameo arrival sound', { sound });
        return;
      } catch (soundErr) {
        // FIX BUG: Log failed attempt for debugging
        log.debug('Cameo arrival sound failed, trying next:', { sound, error: String(soundErr) });
      }
    }
    log.warn('No cameo arrival sound available');
  }

  /**
   * Play the cameo return sound with debounce to prevent double-play
   * Tries: cameo-return → connect
   */
  private async playReturnSoundDebounced(): Promise<void> {
    const now = Date.now();
    if (now - this.lastReturnSoundTime < CAMEO_SAFETY_CONFIG.SOUND_DEBOUNCE) {
      log.debug('🎬 Return sound debounced (already played recently)');
      return;
    }
    this.lastReturnSoundTime = now;

    await this.playReturnSound();
  }

  /**
   * Play the cameo return sound
   * Tries: cameo-return → connect
   */
  private async playReturnSound(): Promise<void> {
    const soundsToTry: SoundEffect[] = [
      CAMEO_SOUNDS.RETURN as SoundEffect,
      CAMEO_SOUNDS.RETURN_FALLBACK as SoundEffect,
      CAMEO_SOUNDS.FALLBACK as SoundEffect,
    ];

    for (const sound of soundsToTry) {
      try {
        await audioService.playSound(sound);
        log.debug('Played cameo return sound', { sound });
        return;
      } catch (soundErr) {
        // FIX BUG: Log failed attempt for debugging
        log.debug('Cameo return sound failed, trying next:', { sound, error: String(soundErr) });
      }
    }
    log.warn('No cameo return sound available');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const cameoService = new CameoService();

export default cameoService;
