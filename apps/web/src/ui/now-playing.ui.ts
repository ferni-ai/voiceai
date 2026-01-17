/**
 * Now Playing UI - Compact Music Indicator (Rewritten)
 *
 * A minimal floating pill that appears near the avatar when music plays.
 * This is a PURE VIEW component - all state is managed by MusicStateManager.
 *
 * DESIGN PRINCIPLES:
 *   - Minimal footprint - doesn't block conversation
 *   - Starts expanded, auto-collapses to icon only
 *   - Hover/tap to see full info
 *   - All styling uses design system tokens
 *   - Pure view - subscribes to MusicStateManager for state
 *
 * @module ui/now-playing
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import type { MusicPlaybackState } from '../types/events.js';
import { createLogger } from '../utils/logger.js';
import {
  getMusicStateManager,
  type MusicTrack,
  type MusicStateEvent,
} from '../services/music-state-manager.js';

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
  ourSong:
    '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
  heartOutline:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  history:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
};

// ============================================================================
// TYPES
// ============================================================================

export interface NowPlayingTrack {
  name: string;
  artist: string;
  duration?: number;
  albumArt?: string;
  isAmbient?: boolean;
  isOurSong?: boolean;
  ourSongContext?: string;
}

export interface NowPlayingCallbacks {
  onSkip?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onVolumeChange?: (volume: number) => void;
  onFavorite?: (track: NowPlayingTrack) => void;
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
  private autoCollapseTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private trackHistory: Array<NowPlayingTrack & { playedAt: number }> = [];
  private unsubscribeStateManager: (() => void) | null = null;

  private static readonly MAX_HISTORY_SIZE = 20;
  private static readonly AUTO_COLLAPSE_DELAY_MS = 4000;

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  initialize(): void {
    if (this.container) return;

    // HMR protection
    document.querySelectorAll('.now-playing').forEach((el) => el.remove());
    document.querySelectorAll('#now-playing-styles').forEach((el) => el.remove());

    this.injectStyles();
    this.createContainer();
    this.subscribeToStateManager();

    log.debug('Now Playing UI initialized');
  }

  /**
   * Subscribe to MusicStateManager for state updates.
   */
  private subscribeToStateManager(): void {
    const stateManager = getMusicStateManager();
    stateManager.initialize();

    this.unsubscribeStateManager = stateManager.subscribe((event: MusicStateEvent) => {
      this.handleStateEvent(event);
    });
  }

  /**
   * Handle events from MusicStateManager.
   */
  private handleStateEvent(event: MusicStateEvent): void {
    switch (event.type) {
      case 'state_changed':
        this.updateState(event.state.state);
        break;
      case 'track_started':
        this.show(event.track);
        break;
      case 'track_ended':
        this.hide();
        break;
      case 'ducking_started':
        this.updateState('ducking');
        break;
      case 'ducking_ended':
        if (this._currentState === 'ducking') {
          this.updateState('playing');
        }
        break;
    }
  }

  setCallbacks(callbacks: NowPlayingCallbacks): void {
    this._callbacks = callbacks;
  }

  getCallbacks(): NowPlayingCallbacks {
    return this._callbacks;
  }

  // ============================================================================
  // SHOW / HIDE
  // ============================================================================

  /**
   * Show the Now Playing card with track info.
   */
  show(track: NowPlayingTrack | MusicTrack): void {
    this.initialize();
    if (!this.container) return;

    this.currentTrack = track;
    this.startTime = Date.now();
    this.addToHistory(track);
    this.updateTrackInfo();
    this.startWaveformAnimation();
    this.startProgressTracking();
    this.expand();
    this.startAutoCollapseTimer();

    if (!this.isVisible) {
      this.container.classList.add('now-playing--visible');
      this.isVisible = true;

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
      this.expand();
      this.startAutoCollapseTimer();
      log.debug('Now Playing updated', { track: track.name, artist: track.artist });
    }
  }

  /**
   * Hide the Now Playing card.
   */
  hide(): void {
    if (!this.container || !this.isVisible) return;

    log.info('Now Playing hiding', { track: this.currentTrack?.name });

    this.clearAutoCollapseTimer();
    this.stopWaveformAnimation();
    this.stopProgressTracking();

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

    setTimeout(() => {
      this.container?.classList.remove('now-playing--visible', 'now-playing--collapsed');
      this.isVisible = false;
      this.isCollapsed = false;
      this.currentTrack = null;
      this.startTime = null;
      this._currentState = 'idle';
    }, DURATION.NORMAL);
  }

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  getState(): MusicPlaybackState {
    return this._currentState;
  }

  /**
   * Update music state (playing, ducking, fading, etc.)
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

    switch (state) {
      case 'ducking':
        this.container.classList.add('now-playing--ducking');
        this.slowWaveform();
        break;
      case 'fading':
        this.container.classList.add('now-playing--fading');
        this.fadeWaveform();
        break;
      case 'changing':
        this.container.classList.add('now-playing--changing');
        this.crossfadeWaveform();
        break;
      case 'paused':
        this.container.classList.add('now-playing--paused');
        this.pauseWaveform();
        break;
      case 'playing':
        this.resumeWaveform();
        break;
      case 'stopped':
      case 'idle':
        this.hide();
        break;
    }
  }

  isShowing(): boolean {
    return this.isVisible;
  }

  getCurrentTrack(): NowPlayingTrack | null {
    return this.currentTrack;
  }

  // ============================================================================
  // COLLAPSE / EXPAND
  // ============================================================================

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

  private expand(): void {
    if (!this.container) return;

    if (this.isCollapsed) {
      log.debug('Now Playing expanded');
    }

    this.isCollapsed = false;
    this.container.classList.remove('now-playing--collapsed');
  }

  private startAutoCollapseTimer(): void {
    this.clearAutoCollapseTimer();

    this.autoCollapseTimeoutId = setTimeout(() => {
      if (this.isVisible && !this.isCollapsed) {
        this.collapse();
      }
    }, NowPlayingUI.AUTO_COLLAPSE_DELAY_MS);
  }

  private clearAutoCollapseTimer(): void {
    if (this.autoCollapseTimeoutId) {
      clearTimeout(this.autoCollapseTimeoutId);
      this.autoCollapseTimeoutId = null;
    }
  }

  // ============================================================================
  // "OUR SONG" FEATURE
  // ============================================================================

  markAsOurSong(context?: string): void {
    if (!this.currentTrack || !this.container) return;

    this.currentTrack.isOurSong = true;
    this.currentTrack.ourSongContext = context;
    this.updateTrackInfo();

    log.debug('Track marked as "our song"', { track: this.currentTrack.name, context });
  }

  // ============================================================================
  // STYLES (Design System Compliant)
  // ============================================================================

  private injectStyles(): void {
    if (document.getElementById('now-playing-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'now-playing-styles';
    styles.textContent = `
      /* Now Playing - Compact floating pill */
      .now-playing {
        position: fixed;
        bottom: 140px;
        right: var(--space-4);
        z-index: var(--z-tooltip);
        
        display: none;
        align-items: center;
        gap: var(--space-3);
        
        padding: var(--space-2) var(--space-3);
        background: var(--color-background-elevated);
        border: none;
        border-radius: var(--radius-full);
        box-shadow: var(--shadow-md);
        
        opacity: 0;
        pointer-events: none;
        
        font-family: var(--font-body);
        color: var(--color-text-primary);
        
        max-width: min(240px, 100%);
        overflow: hidden;
        transition: width var(--duration-normal) var(--ease-standard),
                    max-width var(--duration-normal) var(--ease-standard);
        cursor: pointer;
      }
      
      .now-playing--visible {
        display: flex;
        pointer-events: auto;
      }
      
      /* Collapsed state */
      .now-playing--collapsed {
        max-width: 52px;
        padding: var(--space-2);
        gap: var(--space-2);
      }
      
      .now-playing--collapsed .now-playing__info,
      .now-playing--collapsed .now-playing__our-song,
      .now-playing--collapsed .now-playing__progress,
      .now-playing--collapsed .now-playing__controls {
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
        
        background: var(--persona-tint);
        border-radius: var(--radius-lg);
        color: var(--color-text-secondary);
        transition: width var(--duration-fast), height var(--duration-fast);
      }
      
      .now-playing__icon svg {
        width: 16px;
        height: 16px;
        transition: width var(--duration-fast), height var(--duration-fast);
      }
      
      /* Track info */
      .now-playing__info {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        position: relative;
        cursor: pointer;
      }

      .now-playing__info-tooltip {
        position: absolute;
        bottom: calc(100% + var(--space-2));
        left: 50%;
        transform: translateX(-50%);
        background: var(--color-background-elevated);
        border-radius: var(--radius-md);
        padding: var(--space-2) var(--space-3);
        box-shadow: var(--shadow-lg);
        white-space: nowrap;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: opacity var(--duration-fast) ease, visibility var(--duration-fast) ease;
        z-index: var(--z-tooltip);
        max-width: 280px;
      }

      .now-playing__info-tooltip::after {
        content: '';
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        border: 6px solid transparent;
        border-top-color: var(--color-background-elevated);
      }

      .now-playing__info:hover .now-playing__info-tooltip,
      .now-playing__info:focus .now-playing__info-tooltip {
        opacity: 1;
        visibility: visible;
      }

      .now-playing__info-tooltip-track {
        font-size: var(--text-sm);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-primary);
        margin: 0;
        white-space: normal;
        word-break: break-word;
      }

      .now-playing__info-tooltip-artist {
        font-size: var(--text-xs);
        color: var(--color-text-secondary);
        margin: var(--space-1) 0 0 0;
        white-space: normal;
        word-break: break-word;
      }

      .now-playing__track {
        font-size: var(--text-sm);
        font-weight: var(--font-weight-medium);
        color: var(--color-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin: 0;
        line-height: var(--leading-tight);
      }
      
      .now-playing__artist {
        font-size: var(--text-xs);
        color: var(--color-text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin: 0;
        line-height: var(--leading-tight);
      }

      /* Time display */
      .now-playing__time {
        display: flex;
        align-items: center;
        gap: 2px;
        font-size: 10px;
        font-family: var(--font-mono, monospace);
        color: var(--color-text-muted);
        margin-top: 2px;
        line-height: 1;
      }

      .now-playing__time-current {
        min-width: 28px;
        text-align: right;
      }

      .now-playing__time-separator {
        opacity: 0.5;
      }

      .now-playing__time-total {
        min-width: 28px;
      }

      .now-playing--collapsed .now-playing__time {
        display: none;
      }

      /* Album art */
      .now-playing__album-art {
        display: none;
        flex-shrink: 0;
        width: 36px;
        height: 36px;
        border-radius: var(--radius-sm);
        overflow: hidden;
        background: var(--color-background-muted);
        position: relative;
      }

      .now-playing:not(.now-playing--collapsed) .now-playing__album-art {
        display: block;
      }

      .now-playing__album-art-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: none;
      }

      .now-playing__album-art-fallback {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        color: var(--color-text-muted);
      }

      .now-playing__album-art-fallback svg {
        width: 18px;
        height: 18px;
      }

      .now-playing__album-art--loaded .now-playing__album-art-img {
        display: block;
      }

      .now-playing__album-art--loaded .now-playing__album-art-fallback {
        display: none;
      }

      /* Ambient mode hides album art */
      .now-playing--ambient .now-playing__album-art {
        display: none !important;
      }
      
      /* Waveform visualization */
      .now-playing__waveform {
        display: flex;
        align-items: center;
        gap: 2px;
        height: 20px;
        flex-shrink: 0;
        transition: height var(--duration-fast);
      }
      
      .now-playing__bar {
        width: 2.5px;
        background: var(--persona-primary);
        border-radius: 1.25px;
        transition: height 0.15s ease, width var(--duration-fast);
      }
      
      /* Progress bar */
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
        background: var(--persona-primary);
        width: 0%;
        transition: width 0.5s linear;
      }
      
      /* State: Ducking */
      .now-playing--ducking {
        opacity: 0.6;
      }
      
      .now-playing--ducking .now-playing__bar {
        opacity: 0.4;
      }
      
      /* State: Fading */
      .now-playing--fading {
        animation: now-playing-pulse 1.2s ease-in-out infinite;
      }
      
      @keyframes now-playing-pulse {
        0%, 100% { opacity: 0.8; }
        50% { opacity: 0.5; }
      }
      
      /* State: Paused */
      .now-playing--paused .now-playing__bar {
        height: 3px !important;
      }

      .now-playing__icon--music {
        display: none;
      }

      .now-playing__icon--pause {
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }

      .now-playing__icon--pause:hover {
        background: var(--color-accent);
        color: var(--color-text-on-accent);
        transform: scale(1.05);
      }

      .now-playing__icon--pause:active {
        transform: scale(0.95);
      }

      .now-playing__icon--play {
        display: none;
      }

      .now-playing--paused .now-playing__icon--pause {
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
        color: var(--color-text-on-accent);
        transform: scale(1.05);
      }

      .now-playing--paused .now-playing__icon--play:active {
        transform: scale(0.95);
      }
      
      /* Controls */
      .now-playing__controls {
        display: flex;
        align-items: center;
        gap: var(--space-1);
        flex-shrink: 0;
      }

      .now-playing__btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        padding: 0;
        border: none;
        border-radius: var(--radius-md);
        background: transparent;
        color: var(--color-text-secondary);
        cursor: pointer;
        transition: background var(--duration-fast) ease,
                    color var(--duration-fast) ease,
                    transform var(--duration-fast) ease;
      }

      .now-playing__btn svg {
        width: 14px;
        height: 14px;
      }

      .now-playing__btn:hover {
        background: var(--color-background-hover);
        color: var(--color-text-primary);
      }

      .now-playing__btn:active {
        transform: scale(0.92);
      }

      .now-playing__btn--favorite:hover {
        color: var(--color-semantic-error);
      }

      .now-playing__btn--favorite.is-favorite {
        color: var(--color-semantic-error);
      }

      .now-playing__btn--favorite.is-favorite svg {
        fill: currentColor;
      }

      .now-playing__btn--skip:hover {
        color: var(--persona-primary);
      }

      .now-playing__btn--history:hover {
        color: var(--color-accent);
      }

      /* Volume control */
      .now-playing__volume-control {
        position: relative;
        display: flex;
        align-items: center;
      }

      .now-playing__volume-slider {
        position: absolute;
        right: 100%;
        margin-right: var(--space-1);
        width: 0;
        height: 4px;
        opacity: 0;
        pointer-events: none;
        transition: width var(--duration-normal) ease, opacity var(--duration-fast) ease;
        appearance: none;
        background: var(--color-border);
        border-radius: 2px;
        cursor: pointer;
      }

      .now-playing__volume-control:hover .now-playing__volume-slider,
      .now-playing__volume-slider:focus {
        width: 60px;
        opacity: 1;
        pointer-events: auto;
      }

      .now-playing__volume-slider::-webkit-slider-thumb {
        appearance: none;
        width: 12px;
        height: 12px;
        background: var(--persona-primary);
        border-radius: 50%;
        cursor: pointer;
      }

      .now-playing__volume-slider::-moz-range-thumb {
        width: 12px;
        height: 12px;
        background: var(--persona-primary);
        border-radius: 50%;
        border: none;
        cursor: pointer;
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
      
      /* Ambient music */
      .now-playing--ambient .now-playing__icon {
        background: var(--color-background-muted);
        color: var(--color-text-muted);
      }
      
      .now-playing--ambient .now-playing__bar {
        background: var(--color-text-muted);
        opacity: 0.4;
      }
      
      /* "Our Song" heart - Enhanced with warm glow */
      .now-playing__our-song {
        display: none;
        position: relative;
        width: 18px;
        height: 18px;
        color: #e85d75;
        opacity: 0;
        transition: opacity var(--duration-normal) ease-out, transform var(--duration-fast) ease;
        cursor: help;
        flex-shrink: 0;
        filter: drop-shadow(0 0 2px rgba(232, 93, 117, 0.4));
      }
      
      .now-playing__our-song svg {
        width: 100%;
        height: 100%;
      }
      
      .now-playing--our-song .now-playing__our-song {
        display: flex;
        opacity: 1;
        animation: heartPulse 1.8s ease-in-out infinite;
      }
      
      /* Warm glow background behind heart for "our song" */
      .now-playing--our-song {
        background: linear-gradient(
          135deg,
          var(--color-background-elevated) 0%,
          rgba(232, 93, 117, 0.08) 100%
        );
        box-shadow: var(--shadow-md), 0 0 20px rgba(232, 93, 117, 0.15);
      }
      
      @keyframes heartPulse {
        0%, 100% { 
          transform: scale(1); 
          filter: drop-shadow(0 0 3px rgba(232, 93, 117, 0.5));
        }
        50% { 
          transform: scale(1.15); 
          filter: drop-shadow(0 0 8px rgba(232, 93, 117, 0.8));
        }
      }
      
      .now-playing__our-song:hover {
        transform: scale(1.2);
        filter: drop-shadow(0 0 10px rgba(232, 93, 117, 0.9));
      }

      /* Our Song memory tooltip */
      .now-playing--our-song .now-playing__our-song::after {
        content: attr(title);
        position: absolute;
        bottom: calc(100% + 8px);
        left: 50%;
        transform: translateX(-50%) scale(0.9);
        background: var(--color-background-elevated);
        color: var(--color-text-secondary);
        font-size: 11px;
        font-style: italic;
        padding: 6px 10px;
        border-radius: var(--radius-sm);
        white-space: nowrap;
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
        box-shadow: var(--shadow-md);
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: opacity var(--duration-fast) ease, 
                    transform var(--duration-fast) ease,
                    visibility var(--duration-fast) ease;
        z-index: calc(var(--z-tooltip) + 1);
      }

      .now-playing--our-song .now-playing__our-song:hover::after {
        opacity: 1;
        visibility: visible;
        transform: translateX(-50%) scale(1);
      }

      /* Sparkle decoration for Our Song */
      .now-playing--our-song::before {
        content: '✨';
        position: absolute;
        top: -8px;
        right: -4px;
        font-size: 14px;
        animation: sparkle 2s ease-in-out infinite;
        pointer-events: none;
        opacity: 0.8;
      }

      @keyframes sparkle {
        0%, 100% { opacity: 0.6; transform: scale(1) rotate(0deg); }
        50% { opacity: 1; transform: scale(1.2) rotate(10deg); }
      }
      
      /* Hover effects */
      .now-playing:hover {
        box-shadow: var(--shadow-lg);
      }
      
      /* Dismiss button */
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
        box-shadow: var(--shadow-sm);
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
      
      /* Ambient minimal mode */
      .now-playing--ambient-minimal {
        max-width: 40px !important;
        padding: var(--space-2) !important;
        gap: 0 !important;
        border-radius: var(--radius-full) !important;
      }
      
      .now-playing--ambient-minimal .now-playing__info,
      .now-playing--ambient-minimal .now-playing__our-song,
      .now-playing--ambient-minimal .now-playing__progress,
      .now-playing--ambient-minimal .now-playing__waveform,
      .now-playing--ambient-minimal .now-playing__controls {
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
      
      .now-playing--ambient-minimal::after {
        content: attr(data-ambient-hint);
        position: absolute;
        top: 100%;
        right: 0;
        margin-top: var(--space-2);
        padding: var(--space-1) var(--space-2);
        background: var(--color-background-elevated);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-sm);
        font-size: var(--text-xs);
        color: var(--color-text-secondary);
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: opacity var(--duration-fast) ease;
      }
      
      .now-playing--ambient-minimal:hover::after {
        opacity: 1;
      }
      
      .now-playing--ambient-minimal .now-playing__dismiss,
      .now-playing--ambient-minimal:hover .now-playing__dismiss {
        display: none !important;
      }
      
      /* Reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .now-playing,
        .now-playing__bar {
          transition: none !important;
          animation: none !important;
        }
      }
      
      /* Mobile */
      @media (max-width: 480px) {
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
      
      /* Dark theme */
      [data-theme="midnight"] .now-playing {
        background: var(--color-background-elevated);
        box-shadow: var(--shadow-md);
      }
    `;
    document.head.appendChild(styles);
    this.styleElement = styles;
  }

  // ============================================================================
  // DOM CREATION
  // ============================================================================

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
      <div class="now-playing__album-art" aria-hidden="true">
        <img class="now-playing__album-art-img" src="" alt="Album art" />
        <div class="now-playing__album-art-fallback">
          ${ICONS.music}
        </div>
      </div>
      <div class="now-playing__icon now-playing__icon--music">
        ${ICONS.music}
      </div>
      <div class="now-playing__icon now-playing__icon--pause" role="button" tabindex="0" aria-label="${t('accessibility.pause')}" title="Pause music">
        ${ICONS.pause}
      </div>
      <div class="now-playing__icon now-playing__icon--play" role="button" tabindex="0" aria-label="${t('accessibility.play')}" title="Resume playback">
        ${ICONS.play}
      </div>
      <div class="now-playing__info" tabindex="0" role="button" aria-label="Track info">
        <p class="now-playing__track">Loading...</p>
        <p class="now-playing__artist"></p>
        <div class="now-playing__time">
          <span class="now-playing__time-current">0:00</span>
          <span class="now-playing__time-separator">/</span>
          <span class="now-playing__time-total">0:00</span>
        </div>
        <div class="now-playing__info-tooltip">
          <p class="now-playing__info-tooltip-track"></p>
          <p class="now-playing__info-tooltip-artist"></p>
        </div>
      </div>
      <div class="now-playing__controls">
        <button class="now-playing__btn now-playing__btn--favorite" aria-label="Add to favorites" title="Add to favorites">
          ${ICONS.heartOutline}
        </button>
        <button class="now-playing__btn now-playing__btn--skip" aria-label="Skip track" title="Skip to next track">
          ${ICONS.skipForward}
        </button>
        <div class="now-playing__volume-control">
          <button class="now-playing__btn now-playing__btn--volume" aria-label="Volume" title="Adjust volume">
            ${ICONS.volume}
          </button>
          <input type="range" class="now-playing__volume-slider" min="0" max="100" value="70" aria-label="Volume slider" />
        </div>
        <button class="now-playing__btn now-playing__btn--history" aria-label="Recently played" title="View recently played">
          ${ICONS.history}
        </button>
      </div>
      <div class="now-playing__our-song" title="${t('titles.sharedSong')}" aria-label="${t('accessibility.sharedMusicalMemory')}">
        ${ICONS.ourSong}
      </div>
      <div class="now-playing__waveform">
        ${Array(4).fill(0).map(() => '<div class="now-playing__bar"></div>').join('')}
      </div>
      <div class="now-playing__progress">
        <div class="now-playing__progress-fill"></div>
      </div>
    `;

    this.waveformBars = Array.from(
      this.container.querySelectorAll<HTMLElement>('.now-playing__bar')
    );

    this.bindEvents();
    document.body.appendChild(this.container);
  }

  private bindEvents(): void {
    if (!this.container) return;

    // Hover to expand
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

    // Click to expand (not on buttons)
    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.now-playing__dismiss')) return;

      if (this.isCollapsed) {
        this.expand();
        this.startAutoCollapseTimer();
      }
    });

    // Dismiss button
    this.container.querySelector('.now-playing__dismiss')?.addEventListener('click', (e) => {
      e.stopPropagation();
      log.debug('Now Playing dismissed by user');
      this.hide();
    });

    // Pause button
    const pauseBtn = this.container.querySelector('.now-playing__icon--pause');
    pauseBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._callbacks.onPause?.();
    });
    pauseBtn?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        this._callbacks.onPause?.();
      }
    });

    // Play button
    const playBtn = this.container.querySelector('.now-playing__icon--play');
    playBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._callbacks.onResume?.();
    });
    playBtn?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        this._callbacks.onResume?.();
      }
    });

    // Skip button
    this.container.querySelector('.now-playing__btn--skip')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._callbacks.onSkip?.();
    });

    // Favorite button
    const favoriteBtn = this.container.querySelector('.now-playing__btn--favorite');
    favoriteBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isFavorite = favoriteBtn.classList.toggle('is-favorite');
      if (this._callbacks.onFavorite && this.currentTrack) {
        this._callbacks.onFavorite(this.currentTrack);
      }
      favoriteBtn.setAttribute('aria-label', isFavorite ? 'Remove from favorites' : 'Add to favorites');
      favoriteBtn.setAttribute('title', isFavorite ? 'Remove from favorites' : 'Add to favorites');
    });

    // Volume slider
    const volumeSlider = this.container.querySelector<HTMLInputElement>('.now-playing__volume-slider');
    const volumeBtn = this.container.querySelector('.now-playing__btn--volume');
    if (volumeSlider) {
      volumeSlider.addEventListener('input', (e) => {
        e.stopPropagation();
        const volume = parseInt((e.target as HTMLInputElement).value, 10);
        this._callbacks.onVolumeChange?.(volume);
        if (volumeBtn) {
          volumeBtn.innerHTML = volume === 0 ? ICONS.volumeMuted : ICONS.volume;
        }
      });
    }

    // Volume mute toggle
    if (volumeBtn && volumeSlider) {
      let lastVolume = 70;
      volumeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentVolume = parseInt(volumeSlider.value, 10);
        if (currentVolume > 0) {
          lastVolume = currentVolume;
          volumeSlider.value = '0';
          volumeBtn.innerHTML = ICONS.volumeMuted;
          this._callbacks.onVolumeChange?.(0);
        } else {
          volumeSlider.value = String(lastVolume);
          volumeBtn.innerHTML = ICONS.volume;
          this._callbacks.onVolumeChange?.(lastVolume);
        }
      });
    }

    // History button
    this.container.querySelector('.now-playing__btn--history')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const { musicHistoryUI } = await import('./music-history.ui.js');
      musicHistoryUI.toggle();
    });
  }

  // ============================================================================
  // TRACK INFO
  // ============================================================================

  private updateTrackInfo(): void {
    if (!this.container || !this.currentTrack) return;

    const trackEl = this.container.querySelector('.now-playing__track');
    const artistEl = this.container.querySelector('.now-playing__artist');
    const ourSongEl = this.container.querySelector<HTMLElement>('.now-playing__our-song');
    const albumArtContainer = this.container.querySelector<HTMLElement>('.now-playing__album-art');
    const albumArtImg = this.container.querySelector<HTMLImageElement>('.now-playing__album-art-img');
    const albumArtFallback = this.container.querySelector<HTMLElement>('.now-playing__album-art-fallback');

    if (trackEl) trackEl.textContent = this.currentTrack.name;
    if (artistEl) artistEl.textContent = this.currentTrack.artist;

    // Album art
    if (albumArtContainer && albumArtImg && albumArtFallback) {
      if (this.currentTrack.albumArt) {
        albumArtImg.src = this.currentTrack.albumArt;
        albumArtImg.alt = `${this.currentTrack.name} album art`;
        albumArtImg.style.display = 'block';
        albumArtFallback.style.display = 'none';
        albumArtContainer.classList.add('now-playing__album-art--loaded');

        // Animate album art in
        if (!prefersReducedMotion()) {
          albumArtImg.animate(
            [
              { opacity: 0, transform: 'scale(0.8)' },
              { opacity: 1, transform: 'scale(1)' },
            ],
            { duration: DURATION.NORMAL, easing: EASING.SPRING, fill: 'forwards' }
          );
        }
      } else {
        albumArtImg.style.display = 'none';
        albumArtFallback.style.display = 'flex';
        albumArtContainer.classList.remove('now-playing__album-art--loaded');
      }
    }

    // Duration time display
    const totalTimeEl = this.container.querySelector('.now-playing__time-total');
    const currentTimeEl = this.container.querySelector('.now-playing__time-current');
    if (totalTimeEl && this.currentTrack.duration) {
      totalTimeEl.textContent = this.formatTime(this.currentTrack.duration);
    } else if (totalTimeEl) {
      totalTimeEl.textContent = '0:30'; // Default for 30-second previews
    }
    if (currentTimeEl) {
      currentTimeEl.textContent = '0:00';
    }

    // Tooltip
    const tooltipTrack = this.container.querySelector('.now-playing__info-tooltip-track');
    const tooltipArtist = this.container.querySelector('.now-playing__info-tooltip-artist');
    if (tooltipTrack) tooltipTrack.textContent = this.currentTrack.name;
    if (tooltipArtist) tooltipArtist.textContent = this.currentTrack.artist;

    // "Our Song" indicator
    if (ourSongEl) {
      if (this.currentTrack.isOurSong) {
        this.container.classList.add('now-playing--our-song');
        ourSongEl.title = this.currentTrack.ourSongContext ?? 'A song we share';

        if (!prefersReducedMotion()) {
          ourSongEl.animate(
            [
              { transform: 'scale(0)', opacity: 0 },
              { transform: 'scale(1.2)', opacity: 1 },
              { transform: 'scale(1)', opacity: 1 },
            ],
            { duration: DURATION.MODERATE, easing: EASING.SPRING, fill: 'forwards' }
          );
        }
      } else {
        this.container.classList.remove('now-playing--our-song');
      }
    }

    // Ambient mode
    if (this.currentTrack.isAmbient) {
      this.container.classList.add('now-playing--ambient', 'now-playing--ambient-minimal');
      this.container.setAttribute('data-ambient-hint', 'Thinking music...');
    } else {
      this.container.classList.remove('now-playing--ambient', 'now-playing--ambient-minimal');
      this.container.removeAttribute('data-ambient-hint');
    }
  }

  private formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  // ============================================================================
  // WAVEFORM ANIMATION
  // ============================================================================

  private startWaveformAnimation(): void {
    if (prefersReducedMotion()) return;

    this.waveformBars.forEach((bar, index) => {
      const animate = () => {
        const phase = (Date.now() / 400 + index * 0.5) % (Math.PI * 2);
        const height = 8 + Math.sin(phase) * 8;
        bar.style.height = `${height}px`;
      };

      animate();
      const intervalId = setInterval(animate, 50);
      (bar as HTMLElement & { _animInterval?: ReturnType<typeof setInterval> })._animInterval = intervalId;
    });
  }

  private stopWaveformAnimation(): void {
    this.waveformBars.forEach((bar) => {
      const intervalId = (bar as HTMLElement & { _animInterval?: ReturnType<typeof setInterval> })._animInterval;
      if (intervalId) clearInterval(intervalId);
      bar.style.height = '4px';
    });
  }

  private pauseWaveform(): void {
    this.waveformBars.forEach((bar) => {
      const intervalId = (bar as HTMLElement & { _animInterval?: ReturnType<typeof setInterval> })._animInterval;
      if (intervalId) clearInterval(intervalId);
    });
  }

  private resumeWaveform(): void {
    this.startWaveformAnimation();
  }

  private slowWaveform(): void {
    this.waveformBars.forEach((bar, index) => {
      const intervalId = (bar as HTMLElement & { _animInterval?: ReturnType<typeof setInterval> })._animInterval;
      if (intervalId) clearInterval(intervalId);

      const animate = () => {
        const phase = (Date.now() / 800 + index * 0.5) % (Math.PI * 2);
        const height = 6 + Math.sin(phase) * 4;
        bar.style.height = `${height}px`;
      };

      const newIntervalId = setInterval(animate, 100);
      (bar as HTMLElement & { _animInterval?: ReturnType<typeof setInterval> })._animInterval = newIntervalId;
    });
  }

  private fadeWaveform(): void {
    this.waveformBars.forEach((bar, index) => {
      const intervalId = (bar as HTMLElement & { _animInterval?: ReturnType<typeof setInterval> })._animInterval;
      if (intervalId) clearInterval(intervalId);

      const animate = () => {
        const phase = (Date.now() / 600 + index * 0.5) % (Math.PI * 2);
        const height = 4 + Math.sin(phase) * 4;
        bar.style.height = `${height}px`;
        bar.style.opacity = '0.5';
      };

      const newIntervalId = setInterval(animate, 80);
      (bar as HTMLElement & { _animInterval?: ReturnType<typeof setInterval> })._animInterval = newIntervalId;
    });
  }

  private crossfadeWaveform(): void {
    this.waveformBars.forEach((bar, index) => {
      const intervalId = (bar as HTMLElement & { _animInterval?: ReturnType<typeof setInterval> })._animInterval;
      if (intervalId) clearInterval(intervalId);

      const animate = () => {
        const phase = (Date.now() / 200 + index * 0.8) % (Math.PI * 2);
        const height = 6 + Math.sin(phase) * 6;
        bar.style.height = `${height}px`;
        bar.style.opacity = '0.7';
      };

      const newIntervalId = setInterval(animate, 40);
      (bar as HTMLElement & { _animInterval?: ReturnType<typeof setInterval> })._animInterval = newIntervalId;
    });
  }

  // ============================================================================
  // PROGRESS TRACKING
  // ============================================================================

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

    // Update progress bar
    const progressFill = this.container.querySelector('.now-playing__progress-fill') as HTMLElement;
    if (progressFill) {
      progressFill.style.width = `${progress}%`;
    }

    // Update current time display
    const currentTimeEl = this.container.querySelector('.now-playing__time-current');
    if (currentTimeEl) {
      const clampedElapsed = Math.min(elapsed, this.currentTrack.duration);
      currentTimeEl.textContent = this.formatTime(clampedElapsed);
    }
  }

  // ============================================================================
  // HISTORY
  // ============================================================================

  private addToHistory(track: NowPlayingTrack | MusicTrack): void {
    const lastTrack = this.trackHistory[0];
    if (
      lastTrack &&
      lastTrack.name === track.name &&
      lastTrack.artist === track.artist &&
      Date.now() - lastTrack.playedAt < 60000
    ) {
      return;
    }

    this.trackHistory.unshift({
      ...track,
      playedAt: Date.now(),
    });

    if (this.trackHistory.length > NowPlayingUI.MAX_HISTORY_SIZE) {
      this.trackHistory = this.trackHistory.slice(0, NowPlayingUI.MAX_HISTORY_SIZE);
    }
  }

  getHistory(): Array<NowPlayingTrack & { playedAt: number }> {
    return [...this.trackHistory];
  }

  clearHistory(): void {
    this.trackHistory = [];
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  destroy(): void {
    log.debug('Now Playing UI destroying');
    this.stopWaveformAnimation();
    this.stopProgressTracking();
    this.clearAutoCollapseTimer();

    if (this.unsubscribeStateManager) {
      this.unsubscribeStateManager();
      this.unsubscribeStateManager = null;
    }

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

export const nowPlayingUI = {
  get: getNowPlayingUI,
  reset: resetNowPlayingUI,

  show: (track: NowPlayingTrack) => getNowPlayingUI().show(track),
  hide: () => getNowPlayingUI().hide(),
  updateState: (state: MusicPlaybackState) => getNowPlayingUI().updateState(state),
  setCallbacks: (callbacks: NowPlayingCallbacks) => getNowPlayingUI().setCallbacks(callbacks),
  getHistory: () => getNowPlayingUI().getHistory(),
  clearHistory: () => getNowPlayingUI().clearHistory(),
};

export default nowPlayingUI;
