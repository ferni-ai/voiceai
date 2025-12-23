/**
 * Now Playing UI - Compact Music Indicator
 *
 * A minimal floating pill that appears near the avatar when music plays.
 * Designed to be unobtrusive and out of the way of conversation.
 *
 * DESIGN PRINCIPLES:
 *   - Minimal footprint - doesn't block conversation
 *   - Starts expanded (shows track info), auto-collapses to icon only
 *   - Hover/tap to see full info
 *   - Shorter timers - matches 30s Spotify preview duration
 *   - Warm, human animation
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import type { MusicPlaybackState } from '../types/events.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

const log = createLogger('NowPlaying');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// ICONS (Lucide-style, 2px stroke, rounded)
// ============================================================================

const ICONS = {
  music:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  pause:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
  skipForward:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>',
  volume:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
  volumeMuted:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>',
  // 💚 "Our Song" heart - filled to indicate shared memory
  ourSong:
    '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
  // ✖️ Close/dismiss button
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
};

// ============================================================================
// TYPES
// ============================================================================

export interface NowPlayingTrack {
  name: string;
  artist: string;
  duration?: number; // ms
  isAmbient?: boolean;
  isOurSong?: boolean; // 💚 Song with shared memory
  ourSongContext?: string; // Brief context for tooltip
}

export interface NowPlayingCallbacks {
  onSkip?: () => void;
  onPause?: () => void;
  onResume?: () => void;
}

// ============================================================================
// NOW PLAYING UI CLASS
// ============================================================================

class NowPlayingUI {
  private container: HTMLElement | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private isVisible = false;
  private isCollapsed = false;
  private currentTrack: NowPlayingTrack | null = null;
  private _currentState: MusicPlaybackState = 'idle';
  private progressInterval: ReturnType<typeof setInterval> | null = null;
  private startTime: number | null = null;
  private _callbacks: NowPlayingCallbacks = {};
  private waveformBars: HTMLElement[] = [];
  // 🎧 FIX: Track hide animation to prevent race conditions
  private hideTimeoutId: ReturnType<typeof setTimeout> | null = null;
  // 🎧 FIX: Safety timer to auto-hide if no state update received
  private safetyHideTimeoutId: ReturnType<typeof setTimeout> | null = null;
  // 🎧 Absolute maximum timer - card can never stay visible longer than this
  private absoluteMaxTimeoutId: ReturnType<typeof setTimeout> | null = null;
  // 🎧 Auto-collapse timer - collapses to compact mode after showing full info
  private autoCollapseTimeoutId: ReturnType<typeof setTimeout> | null = null;
  // Default track duration fallback (35 seconds - just over typical 30s preview)
  // Tighter timing so card hides promptly when 'stopped' message is missed
  private static readonly SAFETY_HIDE_DELAY_MS = 35000;
  // 🎧 Maximum time the card can stay visible (40 seconds absolute max)
  // Most Spotify previews are 30s, so 40s is generous but not excessive
  private static readonly ABSOLUTE_MAX_VISIBLE_MS = 40000;
  // 🎧 Shorter timeout for ambient music (auto-plays, less important to show long)
  private static readonly AMBIENT_SAFETY_DELAY_MS = 33000;
  // 🎧 Auto-collapse delay - show full info for 4 seconds, then collapse
  private static readonly AUTO_COLLAPSE_DELAY_MS = 4000;

  initialize(): void {
    if (this.container) return;

    // HMR protection
    document.querySelectorAll('.now-playing').forEach((el) => el.remove());
    document.querySelectorAll('#now-playing-styles').forEach((el) => el.remove());

    this.injectStyles();
    this.createContainer();

    log.debug('Now Playing UI initialized');
  }

  setCallbacks(callbacks: NowPlayingCallbacks): void {
    this._callbacks = callbacks;
  }

  getCallbacks(): NowPlayingCallbacks {
    return this._callbacks;
  }

  /**
   * Show the Now Playing card with track info
   */
  show(track: NowPlayingTrack): void {
    this.initialize();
    if (!this.container) return;

    // 🎧 FIX: Cancel any pending hide operation (prevents race condition)
    if (this.hideTimeoutId) {
      clearTimeout(this.hideTimeoutId);
      this.hideTimeoutId = null;
    }

    this.currentTrack = track;
    this.startTime = Date.now();
    this.updateTrackInfo();
    this.startWaveformAnimation();
    this.startProgressTracking();

    // 🎧 FIX: Reset safety timer whenever card is shown
    // This ensures the card auto-hides even if backend doesn't send 'stopped'
    // Use shorter timeout for ambient music (less important to show long)
    this.resetSafetyTimer(track.duration, track.isAmbient);

    // 🎧 Set absolute max timer (1 minute) - card can never stay visible longer
    this.resetAbsoluteMaxTimer();

    // 🎧 Start expanded, auto-collapse after 4 seconds to minimize distraction
    this.expand();
    this.startAutoCollapseTimer();

    if (!this.isVisible) {
      this.container.classList.add('now-playing--visible');
      this.isVisible = true;

      // Animate in from the right side (near avatar)
      if (!prefersReducedMotion()) {
        this.container.animate(
          [
            { opacity: 0, transform: 'translateX(20px) scale(0.9)' },
            { opacity: 1, transform: 'translateX(0) scale(1)' },
          ],
          {
            duration: DURATION.MODERATE,
            easing: EASING.SPRING_GENTLE,
            fill: 'forwards',
          }
        );
      }

      log.debug('Now Playing shown', { track: track.name, artist: track.artist });
    } else {
      // Already visible - update was called for same/new track, re-expand to show new info
      this.expand();
      this.startAutoCollapseTimer();
      log.debug('Now Playing updated', { track: track.name, artist: track.artist });
    }
  }

  /**
   * Hide the Now Playing card
   */
  hide(): void {
    if (!this.container || !this.isVisible) {
      log.debug('🎧 Now Playing hide skipped (already hidden or no container)');
      return;
    }

    log.info('🎧 Now Playing hiding', {
      track: this.currentTrack?.name,
      showDuration: this.startTime
        ? Math.round((Date.now() - this.startTime) / 1000) + 's'
        : 'unknown',
    });

    // 🎧 FIX: Clear all timers - we're hiding properly
    this.clearSafetyTimer();
    this.clearAbsoluteMaxTimer();
    this.clearAutoCollapseTimer();

    // 🎧 FIX: Clear any pending hide timeout to prevent double-hide
    if (this.hideTimeoutId) {
      clearTimeout(this.hideTimeoutId);
      this.hideTimeoutId = null;
    }

    this.stopWaveformAnimation();
    this.stopProgressTracking();

    // Animate out (slide to right)
    if (!prefersReducedMotion()) {
      this.container.animate(
        [
          { opacity: 1, transform: 'translateX(0) scale(1)' },
          { opacity: 0, transform: 'translateX(20px) scale(0.9)' },
        ],
        {
          duration: DURATION.NORMAL,
          easing: EASING.STANDARD,
          fill: 'forwards',
        }
      );
    }

    // 🎧 FIX: Track the timeout and clear state properly
    this.hideTimeoutId = trackedTimeout(() => {
      this.container?.classList.remove('now-playing--visible', 'now-playing--collapsed');
      this.isVisible = false;
      this.isCollapsed = false;
      this.currentTrack = null;
      this.startTime = null;
      this._currentState = 'idle';
      this.hideTimeoutId = null;
      log.debug('Now Playing fully hidden');
    }, DURATION.NORMAL);

    log.debug('Now Playing hiding (animation started)');
  }

  /**
   * Get current music state
   */
  getState(): MusicPlaybackState {
    return this._currentState;
  }

  /**
   * Update music state (playing, ducking, fading, etc.)
   *
   * States:
   * - 'playing': Music actively playing, full waveform animation
   * - 'ducking': Agent speaking over music, subdued waveform
   * - 'fading': Track ending soon (~5 seconds left), pulse animation
   * - 'changing': DJ crossfade in progress, transition animation
   * - 'paused': Playback paused, static waveform
   * - 'stopped': Playback stopped, hide the card
   * - 'idle': No music loaded, hide the card
   */
  updateState(state: MusicPlaybackState): void {
    const previousState = this._currentState;
    this._currentState = state;

    log.debug('Music state update', { from: previousState, to: state });

    if (!this.container) return;

    // Remove all state classes
    this.container.classList.remove(
      'now-playing--ducking',
      'now-playing--fading',
      'now-playing--paused',
      'now-playing--changing'
    );

    // Add current state class
    switch (state) {
      case 'ducking':
        this.container.classList.add('now-playing--ducking');
        this.slowWaveform();
        // 🎧 FIX: Don't clear safety timer during ducking - track is still playing
        break;
      case 'fading':
        this.container.classList.add('now-playing--fading');
        this.fadeWaveform();
        // 🎧 Track is about to end - safety timer will handle if 'stopped' never arrives
        break;
      case 'changing':
        // DJ crossfade in progress - show subtle transition animation
        this.container.classList.add('now-playing--changing');
        this.crossfadeWaveform();
        // 🎧 Reset safety timer for the new track (will be updated when new track shows)
        break;
      case 'paused':
        this.container.classList.add('now-playing--paused');
        this.pauseWaveform();
        // 🎧 FIX: Clear safety timer when paused (user intentionally paused)
        this.clearSafetyTimer();
        break;
      case 'playing':
        // If coming back from 'changing', we might have a new track
        // Re-enable full waveform animation
        this.resumeWaveform();
        // 🎧 FIX: Reset safety timer when playing resumes (from pause or new track)
        if (previousState === 'paused') {
          this.resetSafetyTimer(this.currentTrack?.duration, this.currentTrack?.isAmbient);
        }
        break;
      case 'stopped':
      case 'idle':
        // Always hide on stopped/idle, regardless of previous state
        this.hide();
        break;
      default:
        // Unknown state - log and hide for safety
        log.warn('Unknown music state received', { state });
        this.hide();
        break;
    }
  }

  /**
   * Check if the Now Playing card is currently visible
   */
  isShowing(): boolean {
    return this.isVisible;
  }

  /**
   * Get current track info (if playing)
   */
  getCurrentTrack(): NowPlayingTrack | null {
    return this.currentTrack;
  }

  // ==========================================================================
  // SAFETY TIMER - Auto-hide fallback
  // ==========================================================================

  /**
   * 🎧 Reset the safety timer.
   * This is a fallback to auto-hide the card if the backend never sends 'stopped'.
   *
   * @param trackDuration - Track duration in ms (optional, uses default if not provided)
   * @param isAmbient - If true, use shorter ambient timeout
   */
  private resetSafetyTimer(trackDuration?: number, isAmbient?: boolean): void {
    // Clear existing safety timer
    if (this.safetyHideTimeoutId) {
      clearTimeout(this.safetyHideTimeoutId);
      this.safetyHideTimeoutId = null;
    }

    // Calculate delay:
    // - If we have track duration: duration + 3s buffer
    // - For ambient music: use shorter ambient delay
    // - Otherwise: use default safety delay
    let delay: number;
    if (trackDuration) {
      delay = trackDuration + 3000; // Track duration + 3 second buffer (tighter)
    } else if (isAmbient) {
      delay = NowPlayingUI.AMBIENT_SAFETY_DELAY_MS;
    } else {
      delay = NowPlayingUI.SAFETY_HIDE_DELAY_MS;
    }

    log.debug('Safety timer set', {
      delay: Math.round(delay / 1000) + 's',
      isAmbient,
      hasDuration: !!trackDuration,
    });

    this.safetyHideTimeoutId = trackedTimeout(() => {
      if (this.isVisible) {
        log.warn('Now Playing safety timer triggered - hiding stale card', {
          track: this.currentTrack?.name,
          wasShowingFor: this.startTime
            ? Math.round((Date.now() - this.startTime) / 1000) + 's'
            : 'unknown',
        });
        this.hide();
      }
    }, delay);
  }

  /**
   * 🎧 Clear the safety timer (called when we receive a proper state update).
   */
  private clearSafetyTimer(): void {
    if (this.safetyHideTimeoutId) {
      clearTimeout(this.safetyHideTimeoutId);
      this.safetyHideTimeoutId = null;
    }
  }

  /**
   * 🎧 Reset the absolute max timer.
   * This is a hard limit - the card will NEVER stay visible longer than 2 minutes.
   */
  private resetAbsoluteMaxTimer(): void {
    // Clear existing timer
    if (this.absoluteMaxTimeoutId) {
      clearTimeout(this.absoluteMaxTimeoutId);
      this.absoluteMaxTimeoutId = null;
    }

    this.absoluteMaxTimeoutId = trackedTimeout(() => {
      if (this.isVisible) {
        log.warn('🎧 Now Playing absolute max timer triggered - force hiding', {
          track: this.currentTrack?.name,
          wasShowingFor: this.startTime
            ? Math.round((Date.now() - this.startTime) / 1000) + 's'
            : 'unknown',
        });
        this.hide();
      }
    }, NowPlayingUI.ABSOLUTE_MAX_VISIBLE_MS);
  }

  /**
   * 🎧 Clear the absolute max timer.
   */
  private clearAbsoluteMaxTimer(): void {
    if (this.absoluteMaxTimeoutId) {
      clearTimeout(this.absoluteMaxTimeoutId);
      this.absoluteMaxTimeoutId = null;
    }
  }

  /**
   * 💚 Mark the current track as "our song" - a shared musical memory.
   * Shows a heart icon and updates the tooltip with context.
   *
   * @param context - Brief context for the tooltip (e.g., "When you got the job")
   */
  markAsOurSong(context?: string): void {
    if (!this.currentTrack || !this.container) return;

    this.currentTrack.isOurSong = true;
    this.currentTrack.ourSongContext = context;

    // Trigger visual update
    this.updateTrackInfo();

    log.debug('Track marked as "our song"', {
      track: this.currentTrack.name,
      context,
    });
  }

  // ==========================================================================
  // COLLAPSE / EXPAND METHODS
  // ==========================================================================

  /**
   * 🎧 Collapse to compact mode (just icon + mini waveform)
   * Reduces visual footprint during conversation
   */
  private collapse(): void {
    if (!this.container || this.isCollapsed) return;

    this.isCollapsed = true;
    this.container.classList.add('now-playing--collapsed');

    if (!prefersReducedMotion()) {
      this.container.animate([{ width: this.container.offsetWidth + 'px' }, { width: '52px' }], {
        duration: DURATION.NORMAL,
        easing: EASING.STANDARD,
        fill: 'forwards',
      });
    }

    log.debug('Now Playing collapsed');
  }

  /**
   * 🎧 Expand to show full track info
   * Called on hover/tap or when new track starts
   */
  private expand(): void {
    if (!this.container) return;

    // Always remove collapsed class when expanding, even if not currently collapsed
    // This handles the case where we're showing a new track
    if (this.isCollapsed) {
      log.debug('Now Playing expanded');
    }

    this.isCollapsed = false;
    this.container.classList.remove('now-playing--collapsed');
  }

  /**
   * 🎧 Start the auto-collapse timer
   * After showing full info for a few seconds, collapse to minimize distraction
   */
  private startAutoCollapseTimer(): void {
    // Clear existing timer
    if (this.autoCollapseTimeoutId) {
      clearTimeout(this.autoCollapseTimeoutId);
      this.autoCollapseTimeoutId = null;
    }

    this.autoCollapseTimeoutId = trackedTimeout(() => {
      if (this.isVisible && !this.isCollapsed) {
        this.collapse();
      }
    }, NowPlayingUI.AUTO_COLLAPSE_DELAY_MS);
  }

  /**
   * 🎧 Clear auto-collapse timer (called when hovering or hiding)
   */
  private clearAutoCollapseTimer(): void {
    if (this.autoCollapseTimeoutId) {
      clearTimeout(this.autoCollapseTimeoutId);
      this.autoCollapseTimeoutId = null;
    }
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  private injectStyles(): void {
    if (document.getElementById('now-playing-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'now-playing-styles';
    styles.textContent = `
      /* 🎧 Compact Now Playing - positioned at bottom-right for visibility */
      .now-playing {
        position: fixed;
        bottom: 140px;
        right: var(--space-4);
        z-index: 1900; /* Above dev panel (--z-tooltip: 1800) for visibility during testing */
        
        display: none;
        align-items: center;
        gap: var(--space-3);
        
        padding: var(--space-2) var(--space-3);
        background: var(--color-background-elevated);
        border: none;
        border-radius: var(--radius-full);
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
        
        opacity: 0;
        pointer-events: none;
        
        font-family: var(--font-body);
        color: var(--color-text-primary);
        
        max-width: min(240px, 100%);
        overflow: hidden;
        transition: width var(--duration-normal, 200ms) var(--ease-standard, ease-out),
                    max-width var(--duration-normal, 200ms) var(--ease-standard, ease-out);
        cursor: pointer;
      }
      
      .now-playing--visible {
        display: flex;
        pointer-events: auto;
      }
      
      /* 🎧 Collapsed state - just icon + mini waveform */
      .now-playing--collapsed {
        max-width: 52px;
        padding: var(--space-2);
        gap: var(--space-2);
      }
      
      .now-playing--collapsed .now-playing__info,
      .now-playing--collapsed .now-playing__our-song,
      .now-playing--collapsed .now-playing__progress {
        display: none;
      }
      
      .now-playing--collapsed .now-playing__icon {
        width: 28px;
        height: 28px;
      }
      
      .now-playing--collapsed .now-playing__icon svg {
        width: 14px;
        height: 14px;
      }
      
      .now-playing--collapsed .now-playing__waveform {
        height: 16px;
      }
      
      .now-playing--collapsed .now-playing__bar {
        width: 2px;
      }
      
      /* Icon container */
      .now-playing__icon {
        flex-shrink: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        
        background: var(--persona-tint, rgba(74, 103, 65, 0.1));
        border-radius: var(--radius-lg);
        color: var(--color-text-secondary);
        transition: width var(--duration-fast, 100ms), height var(--duration-fast, 100ms);
      }
      
      .now-playing__icon svg {
        width: 16px;
        height: 16px;
        transition: width var(--duration-fast, 100ms), height var(--duration-fast, 100ms);
      }
      
      /* Track info */
      .now-playing__info {
        flex: 1;
        min-width: 0;
        overflow: hidden;
      }
      
      .now-playing__track {
        font-size: 0.8125rem;
        font-weight: 500;
        color: var(--color-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin: 0;
        line-height: 1.2;
      }
      
      .now-playing__artist {
        font-size: 0.6875rem;
        color: var(--color-text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin: 0;
        line-height: 1.2;
      }
      
      /* Waveform visualization - more compact */
      .now-playing__waveform {
        display: flex;
        align-items: center;
        gap: 2px;
        height: 20px;
        flex-shrink: 0;
        transition: height var(--duration-fast, 100ms);
      }
      
      .now-playing__bar {
        width: 2.5px;
        background: var(--persona-primary, #4a6741);
        border-radius: 1.25px;
        transition: height 0.15s ease, width var(--duration-fast, 100ms);
      }
      
      /* Progress bar - thin line at bottom */
      .now-playing__progress {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 2px;
        background: var(--color-border);
        border-radius: 0 0 var(--radius-full) var(--radius-full);
        overflow: hidden;
      }
      
      .now-playing__progress-fill {
        height: 100%;
        background: var(--persona-primary, #4a6741);
        width: 0%;
        transition: width 0.5s linear;
      }
      
      /* State: Ducking (agent speaking) */
      .now-playing--ducking {
        opacity: 0.6;
      }
      
      .now-playing--ducking .now-playing__bar {
        opacity: 0.4;
      }
      
      /* State: Fading (track ending) */
      .now-playing--fading {
        animation: now-playing-pulse 1.2s ease-in-out infinite;
      }
      
      @keyframes now-playing-pulse {
        0%, 100% { opacity: 0.8; }
        50% { opacity: 0.5; }
      }
      
      /* State: Paused - show play icon */
      .now-playing--paused .now-playing__bar {
        height: 3px !important;
      }
      
      /* Hide music icon, show play icon when paused */
      .now-playing--paused .now-playing__icon--music {
        display: none;
      }
      
      .now-playing__icon--play {
        display: none;
      }
      
      .now-playing--paused .now-playing__icon--play {
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      
      .now-playing--paused .now-playing__icon--play:hover {
        background: var(--color-accent);
        color: var(--color-text-on-accent, #fff);
        transform: scale(1.05);
      }
      
      .now-playing--paused .now-playing__icon--play:active {
        transform: scale(0.95);
      }
      
      /* State: Changing (DJ crossfade) */
      .now-playing--changing {
        animation: now-playing-crossfade 1.2s ease-in-out;
      }
      
      .now-playing--changing .now-playing__bar {
        animation: now-playing-bar-crossfade 0.3s ease-in-out infinite alternate;
      }
      
      @keyframes now-playing-crossfade {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }
      
      @keyframes now-playing-bar-crossfade {
        0% { transform: scaleY(1); }
        100% { transform: scaleY(0.5); }
      }
      
      /* Ambient music indicator */
      .now-playing--ambient .now-playing__icon {
        background: var(--color-background-muted);
        color: var(--color-text-muted);
      }
      
      .now-playing--ambient .now-playing__bar {
        background: var(--color-text-muted);
        opacity: 0.4;
      }
      
      /* 💚 "Our Song" heart indicator - shared musical memory */
      .now-playing__our-song {
        display: none;
        width: 16px;
        height: 16px;
        color: var(--color-text-secondary);
        opacity: 0;
        transition: opacity var(--duration-normal) ease-out;
        cursor: help;
        flex-shrink: 0;
      }
      
      .now-playing__our-song svg {
        width: 100%;
        height: 100%;
      }
      
      .now-playing--our-song .now-playing__our-song {
        display: flex;
        opacity: 1;
        animation: heartPulse 2s ease-in-out infinite;
      }
      
      @keyframes heartPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
      }
      
      /* Heart glow effect on hover */
      .now-playing__our-song:hover {
        filter: drop-shadow(0 0 4px var(--persona-primary, #a67a6a));
      }
      
      /* Hover: expand if collapsed */
      .now-playing:hover {
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
      }
      
      /* Reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .now-playing,
        .now-playing__bar {
          transition: none !important;
          animation: none !important;
        }
      }
      
      /* Mobile adjustments - position below avatar area */
      @media (max-width: clamp(336px, 90vw, 480px)) {
        .now-playing {
          top: auto;
          bottom: 160px;
          right: var(--space-3);
          left: auto;
          max-width: min(200px, 100%);
        }
        
        .now-playing--collapsed {
          max-width: 48px;
        }
      }
      
      /* Dark theme adjustments */
      [data-theme="midnight"] .now-playing {
        background: var(--color-background-elevated, #3d3530);
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
      }
      
      /* ✖️ Dismiss button - appears on hover */
      .now-playing__dismiss {
        display: none;
        position: absolute;
        top: -6px;
        right: -6px;
        width: 20px;
        height: 20px;
        padding: 0;
        border: none;
        border-radius: var(--radius-full);
        background: var(--color-background-elevated);
        color: var(--color-text-muted);
        cursor: pointer;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
        transition: transform var(--duration-fast) ease,
                    background var(--duration-fast) ease,
                    color var(--duration-fast) ease;
        z-index: var(--z-docked);
      }
      
      .now-playing__dismiss svg {
        width: 12px;
        height: 12px;
      }
      
      .now-playing:hover .now-playing__dismiss {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .now-playing__dismiss:hover {
        background: var(--color-text-muted);
        color: var(--color-background-elevated);
        transform: scale(1.1);
      }
      
      .now-playing__dismiss:active {
        transform: scale(0.95);
      }
      
      /* 🎵 MINIMAL AMBIENT MODE - tiny pulsing indicator */
      .now-playing--ambient-minimal {
        max-width: 40px !important;
        padding: var(--space-2) !important;
        gap: 0 !important;
        border-radius: var(--radius-full) !important;
      }
      
      .now-playing--ambient-minimal .now-playing__info,
      .now-playing--ambient-minimal .now-playing__our-song,
      .now-playing--ambient-minimal .now-playing__progress,
      .now-playing--ambient-minimal .now-playing__waveform {
        display: none !important;
      }
      
      .now-playing--ambient-minimal .now-playing__icon {
        width: 24px;
        height: 24px;
        background: transparent;
        animation: ambient-pulse 3s ease-in-out infinite;
      }
      
      .now-playing--ambient-minimal .now-playing__icon svg {
        width: 14px;
        height: 14px;
        color: var(--color-text-muted);
      }
      
      @keyframes ambient-pulse {
        0%, 100% { 
          opacity: 0.5;
          transform: scale(1);
        }
        50% { 
          opacity: 0.8;
          transform: scale(1.05);
        }
      }
      
      /* Ambient minimal hover - show tooltip hint */
      .now-playing--ambient-minimal::after {
        content: attr(data-ambient-hint);
        position: absolute;
        top: 100%;
        right: 0;
        margin-top: var(--space-2);
        padding: var(--space-1) var(--space-2);
        background: var(--color-background-elevated);
        border-radius: var(--radius-md);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
        font-size: 0.6875rem;
        color: var(--color-text-secondary);
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: opacity var(--duration-fast) ease;
      }
      
      .now-playing--ambient-minimal:hover::after {
        opacity: 1;
      }
      
      /* Hide dismiss button in minimal mode (just tap to dismiss) */
      .now-playing--ambient-minimal .now-playing__dismiss {
        display: none !important;
      }
      
      .now-playing--ambient-minimal:hover .now-playing__dismiss {
        display: none !important;
      }
    `;
    document.head.appendChild(styles);
    this.styleElement = styles;
  }

  private createContainer(): void {
    this.container = document.createElement('div');
    this.container.className = 'now-playing';
    this.container.setAttribute('role', 'status');
    this.container.setAttribute('aria-live', 'polite');
    this.container.setAttribute('aria-label', 'Now playing');

    this.container.innerHTML = `
      <button class="now-playing__dismiss" aria-label="${t('accessibility.dismiss')}" title="${t('accessibility.dismiss')}">
        ${ICONS.close}
      </button>
      <div class="now-playing__icon now-playing__icon--music">
        ${ICONS.music}
      </div>
      <div class="now-playing__icon now-playing__icon--play" role="button" tabindex="0" aria-label="${t('accessibility.play')}" title="Resume playback">
        ${ICONS.play}
      </div>
      <div class="now-playing__info">
        <p class="now-playing__track">Loading...</p>
        <p class="now-playing__artist"></p>
      </div>
      <div class="now-playing__our-song" title="${t('titles.sharedSong')}" aria-label="${t('accessibility.sharedMusicalMemory')}">
        ${ICONS.ourSong}
      </div>
      <div class="now-playing__waveform">
        ${Array(4)
          .fill(0)
          .map(() => '<div class="now-playing__bar"></div>')
          .join('')}
      </div>
      <div class="now-playing__progress">
        <div class="now-playing__progress-fill"></div>
      </div>
    `;

    // Cache waveform bars
    this.waveformBars = Array.from(
      this.container.querySelectorAll<HTMLElement>('.now-playing__bar')
    );

    // 🎧 Hover/tap to expand when collapsed
    this.container.addEventListener('mouseenter', () => {
      if (this.isCollapsed) {
        this.expand();
        this.clearAutoCollapseTimer();
      }
    });

    this.container.addEventListener('mouseleave', () => {
      if (!this.isCollapsed && this.isVisible) {
        this.startAutoCollapseTimer();
      }
    });

    // Touch support - tap to expand (but not on dismiss button)
    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      // Don't expand if clicking the dismiss button
      if (target.closest('.now-playing__dismiss')) return;

      if (this.isCollapsed) {
        this.expand();
        // Re-start collapse timer after showing info
        this.startAutoCollapseTimer();
      }
    });

    // ✖️ Dismiss button - hide the card
    const dismissBtn = this.container.querySelector('.now-playing__dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Don't trigger expand
        log.debug('Now Playing dismissed by user');
        this.hide();
      });
    }

    // ▶️ Play button (visible when paused) - triggers resume callback
    const playBtn = this.container.querySelector('.now-playing__icon--play');
    if (playBtn) {
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Don't trigger expand
        log.debug('Play button clicked - resuming playback');
        if (this._callbacks.onResume) {
          this._callbacks.onResume();
        }
      });
      // Also handle keyboard activation for accessibility
      playBtn.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          log.debug('Play button activated via keyboard - resuming playback');
          if (this._callbacks.onResume) {
            this._callbacks.onResume();
          }
        }
      });
    }

    document.body.appendChild(this.container);
  }

  private updateTrackInfo(): void {
    if (!this.container || !this.currentTrack) return;

    const trackEl = this.container.querySelector('.now-playing__track');
    const artistEl = this.container.querySelector('.now-playing__artist');
    const ourSongEl = this.container.querySelector<HTMLElement>('.now-playing__our-song');

    if (trackEl) {
      trackEl.textContent = this.currentTrack.name;
    }
    if (artistEl) {
      artistEl.textContent = this.currentTrack.artist;
    }

    // 💚 "Our Song" indicator - shows a heart for shared musical memories
    if (ourSongEl) {
      if (this.currentTrack.isOurSong) {
        this.container.classList.add('now-playing--our-song');
        ourSongEl.title = this.currentTrack.ourSongContext ?? 'A song we share';

        // Animate heart appearance
        if (!prefersReducedMotion()) {
          ourSongEl.animate(
            [
              { transform: 'scale(0)', opacity: 0 },
              { transform: 'scale(1.2)', opacity: 1 },
              { transform: 'scale(1)', opacity: 1 },
            ],
            {
              duration: DURATION.MODERATE,
              easing: EASING.SPRING,
              fill: 'forwards',
            }
          );
        }
      } else {
        this.container.classList.remove('now-playing--our-song');
      }
    }

    // 🎵 AMBIENT MUSIC: Show minimal UI (tiny pulsing icon) instead of full card
    // This is less intrusive for background/thinking music
    if (this.currentTrack.isAmbient) {
      this.container.classList.add('now-playing--ambient', 'now-playing--ambient-minimal');
      // Set tooltip hint for hover
      this.container.setAttribute('data-ambient-hint', 'Thinking music...');
    } else {
      this.container.classList.remove('now-playing--ambient', 'now-playing--ambient-minimal');
      this.container.removeAttribute('data-ambient-hint');
    }
  }

  private startWaveformAnimation(): void {
    if (prefersReducedMotion()) return;

    // Animate bars with slightly different phases
    this.waveformBars.forEach((bar, index) => {
      const animate = () => {
        const phase = (Date.now() / 400 + index * 0.5) % (Math.PI * 2);
        const height = 8 + Math.sin(phase) * 8; // 8-16px range
        bar.style.height = `${height}px`;
      };

      // Initial animation
      animate();

      // Continue animation
      const intervalId = setInterval(animate, 50);
      (bar as HTMLElement & { _animInterval?: ReturnType<typeof setInterval> })._animInterval =
        intervalId;
    });
  }

  private stopWaveformAnimation(): void {
    this.waveformBars.forEach((bar) => {
      const intervalId = (bar as HTMLElement & { _animInterval?: ReturnType<typeof setInterval> })
        ._animInterval;
      if (intervalId) {
        clearInterval(intervalId);
      }
      bar.style.height = '4px';
    });
  }

  private pauseWaveform(): void {
    this.waveformBars.forEach((bar) => {
      const intervalId = (bar as HTMLElement & { _animInterval?: ReturnType<typeof setInterval> })
        ._animInterval;
      if (intervalId) {
        clearInterval(intervalId);
      }
    });
  }

  private resumeWaveform(): void {
    this.startWaveformAnimation();
  }

  private slowWaveform(): void {
    // Slow down the animation for ducking
    this.waveformBars.forEach((bar, index) => {
      const intervalId = (bar as HTMLElement & { _animInterval?: ReturnType<typeof setInterval> })
        ._animInterval;
      if (intervalId) {
        clearInterval(intervalId);
      }

      const animate = () => {
        const phase = (Date.now() / 800 + index * 0.5) % (Math.PI * 2); // Slower
        const height = 6 + Math.sin(phase) * 4; // Smaller range
        bar.style.height = `${height}px`;
      };

      const newIntervalId = setInterval(animate, 100);
      (bar as HTMLElement & { _animInterval?: ReturnType<typeof setInterval> })._animInterval =
        newIntervalId;
    });
  }

  private fadeWaveform(): void {
    // Fading animation for track ending
    this.waveformBars.forEach((bar, index) => {
      const intervalId = (bar as HTMLElement & { _animInterval?: ReturnType<typeof setInterval> })
        ._animInterval;
      if (intervalId) {
        clearInterval(intervalId);
      }

      const animate = () => {
        const phase = (Date.now() / 600 + index * 0.5) % (Math.PI * 2);
        const height = 4 + Math.sin(phase) * 4; // Smaller range
        bar.style.height = `${height}px`;
        bar.style.opacity = '0.5';
      };

      const newIntervalId = setInterval(animate, 80);
      (bar as HTMLElement & { _animInterval?: ReturnType<typeof setInterval> })._animInterval =
        newIntervalId;
    });
  }

  private crossfadeWaveform(): void {
    // DJ crossfade animation - quick pulse while switching tracks
    this.waveformBars.forEach((bar, index) => {
      const intervalId = (bar as HTMLElement & { _animInterval?: ReturnType<typeof setInterval> })
        ._animInterval;
      if (intervalId) {
        clearInterval(intervalId);
      }

      const animate = () => {
        const phase = (Date.now() / 200 + index * 0.8) % (Math.PI * 2);
        const height = 6 + Math.sin(phase) * 6; // Quick pulse
        bar.style.height = `${height}px`;
        bar.style.opacity = '0.7';
      };

      const newIntervalId = setInterval(animate, 40); // Faster animation
      (bar as HTMLElement & { _animInterval?: ReturnType<typeof setInterval> })._animInterval =
        newIntervalId;
    });
  }

  private startProgressTracking(): void {
    if (!this.currentTrack?.duration) return;

    this.progressInterval = setInterval(() => {
      this.updateProgress();
    }, 500);
  }

  private stopProgressTracking(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  private updateProgress(): void {
    if (!this.container || !this.currentTrack?.duration || !this.startTime) return;

    const elapsed = Date.now() - this.startTime;
    const progress = Math.min((elapsed / this.currentTrack.duration) * 100, 100);

    const progressFill = this.container.querySelector('.now-playing__progress-fill') as HTMLElement;
    if (progressFill) {
      progressFill.style.width = `${progress}%`;
    }
  }

  /**
   * Cleanup on destroy
   */
  destroy(): void {
    log.debug('🎧 Now Playing UI destroying');
    this.stopWaveformAnimation();
    this.stopProgressTracking();

    // 🎧 FIX: Clear all timers on destroy
    if (this.hideTimeoutId) {
      clearTimeout(this.hideTimeoutId);
      this.hideTimeoutId = null;
    }
    this.clearSafetyTimer();
    this.clearAbsoluteMaxTimer();
    this.clearAutoCollapseTimer();

    this.container?.remove();
    this.styleElement?.remove();
    this.container = null;
    this.styleElement = null;
    this.isVisible = false;
    this.isCollapsed = false;
    this._currentState = 'idle';
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: NowPlayingUI | null = null;

export function getNowPlayingUI(): NowPlayingUI {
  if (!instance) {
    instance = new NowPlayingUI();
  }
  return instance;
}

export function resetNowPlayingUI(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}

// Convenience export
export const nowPlayingUI = {
  get: getNowPlayingUI,
  reset: resetNowPlayingUI,

  show: (track: NowPlayingTrack) => getNowPlayingUI().show(track),
  hide: () => getNowPlayingUI().hide(),
  updateState: (state: MusicPlaybackState) => getNowPlayingUI().updateState(state),
  setCallbacks: (callbacks: NowPlayingCallbacks) => getNowPlayingUI().setCallbacks(callbacks),
};

export default nowPlayingUI;
