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

import { CAMEO_SOUNDS, CAMEO_TIMING, getCameoPersonaColors } from '../config/cameo-config.js';
import type { DataMessage } from '../types/events.js';
import { createLogger } from '../utils/logger.js';
import { audioService, type SoundEffect } from './audio.service.js';

const log = createLogger('CameoService');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Cameo data message from backend
 */
export interface CameoDataMessage {
  type: 'cameo_start' | 'cameo_complete' | 'cameo_cancelled' | 'cameo_failed';
  personaId: string;
  personaName: string;
  personaColor?: string;
  greeting?: string;
  isFirstCameo?: boolean;
  voiceId?: string;
  error?: string;
  cameoId?: string;
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
      case 'cameo_start':
        void this.handleCameoStart(cameoMessage);
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
      msg.type === 'cameo_start' ||
      msg.type === 'cameo_complete' ||
      msg.type === 'cameo_cancelled' ||
      msg.type === 'cameo_failed'
    );
  }

  /**
   * Handle cameo start
   */
  private async handleCameoStart(message: CameoDataMessage): Promise<void> {
    const { personaId, personaName, isFirstCameo, cameoId } = message;

    log.info('Cameo starting', { personaId, personaName, isFirstCameo });

    // Play arrival sound
    try {
      await this.playArrivalSound();
    } catch (err) {
      log.warn('Failed to play cameo arrival sound', { error: String(err) });
    }

    // Wait for sound
    await this.sleep(CAMEO_TIMING.ARRIVAL_SOUND_WAIT);

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

    // Set CSS variables for persona colors
    const colors = getCameoPersonaColors(personaId);
    document.documentElement.style.setProperty('--cameo-persona-primary', colors.primary);
    document.documentElement.style.setProperty('--cameo-persona-glow', colors.glow);
    document.body.setAttribute('data-cameo-active', 'true');
    document.body.setAttribute('data-cameo-persona', personaId);

    // Notify callbacks
    for (const callback of this.startCallbacks) {
      try {
        callback(personaId, personaName, this.state.isFirstCameo);
      } catch (err) {
        log.error('Cameo start callback error', { error: String(err) });
      }
    }

    log.info('Cameo started', { personaId, duration: Date.now() - this.state.startTime! });
  }

  /**
   * Handle cameo complete
   */
  private async handleCameoComplete(message: CameoDataMessage): Promise<void> {
    const { personaId } = message;
    const duration = this.state.startTime ? Date.now() - this.state.startTime : 0;

    log.info('Cameo completing', { personaId, duration });

    // Play return sound
    try {
      await this.playReturnSound();
    } catch (err) {
      log.warn('Failed to play cameo return sound', { error: String(err) });
    }

    // Wait for sound
    await this.sleep(CAMEO_TIMING.RETURN_SOUND_WAIT);

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

    // Notify callbacks
    for (const callback of this.endCallbacks) {
      try {
        callback();
      } catch (err) {
        log.error('Cameo end callback error', { error: String(err) });
      }
    }

    log.info('Cameo complete', { personaId, totalDuration: duration });
  }

  /**
   * Handle cameo cancelled
   */
  private async handleCameoCancelled(message: CameoDataMessage): Promise<void> {
    const { personaId, error } = message;

    log.info('Cameo cancelled', { personaId, reason: error });

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
      } catch {
        // Try next sound
      }
    }
    log.warn('No cameo arrival sound available');
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
      } catch {
        // Try next sound
      }
    }
    log.warn('No cameo return sound available');
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const cameoService = new CameoService();

export default cameoService;
