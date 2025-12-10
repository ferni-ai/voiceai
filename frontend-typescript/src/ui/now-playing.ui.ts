/**
 * Now Playing UI - Live Music Visualization
 *
 * A warm, minimal card that appears when music is playing.
 * Shows track info, artist, and a subtle waveform visualization.
 *
 * DESIGN PRINCIPLES:
 *   - Warm and human (not a flashy music player)
 *   - Minimal distraction from conversation
 *   - Subtle animations that match Ferni's personality
 *   - On-brand earthy colors, no emojis
 */

import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import type { MusicPlaybackState } from '../types/events.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('NowPlaying');

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
  // Default track duration fallback (45 seconds - slightly longer than typical 30s preview)
  private static readonly SAFETY_HIDE_DELAY_MS = 45000;

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
    this.resetSafetyTimer(track.duration);

    if (!this.isVisible) {
      this.container.classList.add('now-playing--visible');
      this.isVisible = true;

      // Animate in
      if (!prefersReducedMotion()) {
        this.container.animate(
          [
            { opacity: 0, transform: 'translateY(20px) scale(0.95)' },
            { opacity: 1, transform: 'translateY(0) scale(1)' },
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
      // Already visible - update was called for same/new track
      log.debug('Now Playing updated', { track: track.name, artist: track.artist });
    }
  }

  /**
   * Hide the Now Playing card
   */
  hide(): void {
    if (!this.container || !this.isVisible) {
      log.debug('Now Playing hide skipped (already hidden or no container)');
      return;
    }

    // 🎧 FIX: Clear safety timer - we're hiding properly
    if (this.safetyHideTimeoutId) {
      clearTimeout(this.safetyHideTimeoutId);
      this.safetyHideTimeoutId = null;
    }

    // 🎧 FIX: Clear any pending hide timeout to prevent double-hide
    if (this.hideTimeoutId) {
      clearTimeout(this.hideTimeoutId);
      this.hideTimeoutId = null;
    }

    this.stopWaveformAnimation();
    this.stopProgressTracking();

    // Animate out
    if (!prefersReducedMotion()) {
      this.container.animate(
        [
          { opacity: 1, transform: 'translateY(0) scale(1)' },
          { opacity: 0, transform: 'translateY(20px) scale(0.95)' },
        ],
        {
          duration: DURATION.NORMAL,
          easing: EASING.STANDARD,
          fill: 'forwards',
        }
      );
    }

    // 🎧 FIX: Track the timeout and clear state properly
    this.hideTimeoutId = setTimeout(() => {
      this.container?.classList.remove('now-playing--visible');
      this.isVisible = false;
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
          this.resetSafetyTimer(this.currentTrack?.duration);
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
   */
  private resetSafetyTimer(trackDuration?: number): void {
    // Clear existing safety timer
    if (this.safetyHideTimeoutId) {
      clearTimeout(this.safetyHideTimeoutId);
      this.safetyHideTimeoutId = null;
    }

    // Calculate delay: track duration + 5s buffer, or default safety delay
    const delay = trackDuration
      ? trackDuration + 5000 // Track duration + 5 second buffer
      : NowPlayingUI.SAFETY_HIDE_DELAY_MS;

    log.debug('Safety timer set', { delay: Math.round(delay / 1000) + 's' });

    this.safetyHideTimeoutId = setTimeout(() => {
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
  // PRIVATE METHODS
  // ==========================================================================

  private injectStyles(): void {
    if (document.getElementById('now-playing-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'now-playing-styles';
    styles.textContent = `
      .now-playing {
        position: fixed;
        top: calc(var(--space-6) + 60px);
        left: 50%;
        transform: translateX(-50%);
        z-index: 100;
        
        display: none;
        align-items: center;
        gap: var(--space-4);
        
        padding: var(--space-3) var(--space-4);
        background: var(--color-background-elevated);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-xl);
        box-shadow: var(--shadow-lg);
        
        opacity: 0;
        pointer-events: none;
        
        font-family: var(--font-body);
        color: var(--color-text-primary);
        
        max-width: 320px;
        min-width: 200px;
      }
      
      .now-playing--visible {
        display: flex;
        pointer-events: auto;
      }
      
      /* Icon container */
      .now-playing__icon {
        flex-shrink: 0;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        
        background: var(--persona-tint, rgba(74, 103, 65, 0.1));
        border-radius: var(--radius-lg);
        color: var(--color-text-secondary);
      }
      
      .now-playing__icon svg {
        width: 20px;
        height: 20px;
      }
      
      /* Track info */
      .now-playing__info {
        flex: 1;
        min-width: 0;
        overflow: hidden;
      }
      
      .now-playing__track {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--color-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin: 0;
      }
      
      .now-playing__artist {
        font-size: 0.75rem;
        color: var(--color-text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin: 0;
      }
      
      /* Waveform visualization */
      .now-playing__waveform {
        display: flex;
        align-items: center;
        gap: 2px;
        height: 24px;
        flex-shrink: 0;
      }
      
      .now-playing__bar {
        width: 3px;
        background: var(--persona-primary, #4a6741);
        border-radius: 1.5px;
        transition: height 0.15s ease;
      }
      
      /* Progress bar */
      .now-playing__progress {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 2px;
        background: var(--color-border);
        border-radius: 0 0 var(--radius-xl) var(--radius-xl);
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
        opacity: 0.7;
      }
      
      .now-playing--ducking .now-playing__bar {
        opacity: 0.5;
      }
      
      /* State: Fading (track ending) */
      .now-playing--fading {
        animation: now-playing-pulse 1.5s ease-in-out infinite;
      }
      
      @keyframes now-playing-pulse {
        0%, 100% { opacity: 0.9; }
        50% { opacity: 0.6; }
      }
      
      /* State: Paused */
      .now-playing--paused .now-playing__bar {
        height: 4px !important;
      }
      
      /* State: Changing (DJ crossfade) */
      .now-playing--changing {
        animation: now-playing-crossfade 1.5s ease-in-out;
      }
      
      .now-playing--changing .now-playing__bar {
        animation: now-playing-bar-crossfade 0.4s ease-in-out infinite alternate;
      }
      
      @keyframes now-playing-crossfade {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }
      
      @keyframes now-playing-bar-crossfade {
        0% { transform: scaleY(1); }
        100% { transform: scaleY(0.6); }
      }
      
      /* Ambient music indicator */
      .now-playing--ambient .now-playing__icon {
        background: var(--color-background-muted);
        color: var(--color-text-muted);
      }
      
      .now-playing--ambient .now-playing__bar {
        background: var(--color-text-muted);
        opacity: 0.5;
      }
      
      /* 💚 "Our Song" heart indicator - shared musical memory */
      .now-playing__our-song {
        display: none;
        width: 20px;
        height: 20px;
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
      
      /* Reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .now-playing,
        .now-playing__bar {
          transition: none !important;
          animation: none !important;
        }
      }
      
      /* Mobile adjustments */
      @media (max-width: 480px) {
        .now-playing {
          top: calc(var(--space-4) + 48px);
          left: var(--space-4);
          right: var(--space-4);
          transform: none;
          max-width: none;
        }
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
      <div class="now-playing__icon">
        ${ICONS.music}
      </div>
      <div class="now-playing__info">
        <p class="now-playing__track">Loading...</p>
        <p class="now-playing__artist"></p>
      </div>
      <div class="now-playing__our-song" title="A song we share" aria-label="Shared musical memory">
        ${ICONS.ourSong}
      </div>
      <div class="now-playing__waveform">
        ${Array(5)
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
      this.container.querySelectorAll('.now-playing__bar')
    ) as HTMLElement[];

    document.body.appendChild(this.container);
  }

  private updateTrackInfo(): void {
    if (!this.container || !this.currentTrack) return;

    const trackEl = this.container.querySelector('.now-playing__track');
    const artistEl = this.container.querySelector('.now-playing__artist');
    const ourSongEl = this.container.querySelector('.now-playing__our-song') as HTMLElement | null;

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
        ourSongEl.title = this.currentTrack.ourSongContext || 'A song we share';

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

    // Toggle ambient mode
    if (this.currentTrack.isAmbient) {
      this.container.classList.add('now-playing--ambient');
    } else {
      this.container.classList.remove('now-playing--ambient');
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
    this.stopWaveformAnimation();
    this.stopProgressTracking();

    // 🎧 FIX: Clear all timers on destroy
    if (this.hideTimeoutId) {
      clearTimeout(this.hideTimeoutId);
      this.hideTimeoutId = null;
    }
    if (this.safetyHideTimeoutId) {
      clearTimeout(this.safetyHideTimeoutId);
      this.safetyHideTimeoutId = null;
    }

    this.container?.remove();
    this.styleElement?.remove();
    this.container = null;
    this.styleElement = null;
    this.isVisible = false;
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
