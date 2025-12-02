/**
 * Spotify UI Component
 * 
 * Displays Spotify status and currently playing track info.
 */

import type { SpotifyState } from '../types/events.js';
import type { TrackInfo } from '../services/spotify.service.js';
import { spotifyService } from '../services/spotify.service.js';
import { getElementByIdOrNull, setText, addClass, removeClass, setClasses } from '../utils/dom.js';

// ============================================================================
// ELEMENT REFERENCES
// ============================================================================

let statusContainer: HTMLElement | null = null;
let statusText: HTMLElement | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the Spotify UI component.
 */
export function initSpotifyUI(): void {
  statusContainer = getElementByIdOrNull('spotifyStatus');
  statusText = getElementByIdOrNull('spotifyStatusText');

  if (!statusContainer || !statusText) {
    console.warn('Spotify UI elements not found');
    return;
  }

  // Subscribe to Spotify state changes
  spotifyService.onStateChange(handleStateChange);

  console.log('✅ Spotify UI initialized');
}

// ============================================================================
// STATE HANDLING
// ============================================================================

/**
 * Handle Spotify state changes.
 * 
 * Since iTunes is now the default (free for everyone), we only show
 * Spotify status when actively playing music via Spotify - not for
 * errors or initialization states.
 */
function handleStateChange(state: SpotifyState, trackInfo?: TrackInfo): void {
  const container = statusContainer;
  const text = statusText;
  if (!container || !text) return;

  // Update classes
  setClasses(container, {
    'ready': state === 'ready',
    'playing': state === 'playing',
    'paused': state === 'paused',
    'error': false, // Never show error state - iTunes is the fallback
  });

  // Update text based on state
  switch (state) {
    case 'uninitialized':
    case 'initializing':
    case 'ready':
    case 'error':
      // Keep hidden - iTunes is the default, no need to show Spotify status
      addClass(container, 'hidden');
      break;
    case 'playing':
      // Only show when actually playing via Spotify
      if (trackInfo) {
        removeClass(container, 'hidden');
        setText(text, `🎵 ${trackInfo.name} - ${trackInfo.artist}`);
      }
      break;
    case 'paused':
      setText(text, 'Paused');
      // Hide after a bit
      setTimeout(() => {
        if (spotifyService.getState() === 'paused' && statusContainer) {
          addClass(statusContainer, 'hidden');
        }
      }, 2000);
      break;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show the Spotify status.
 * 
 * Only shows for 'playing' state - errors and info are hidden
 * since iTunes is the default fallback for everyone.
 */
export function showSpotifyStatus(text: string, type: 'info' | 'ready' | 'playing' | 'error' = 'info'): void {
  if (!statusContainer || !statusText) return;

  // Only show for playing state - all other states stay hidden
  // iTunes is the default, so Spotify issues are not user-facing
  if (type === 'error' || type === 'info') {
    addClass(statusContainer as Element, 'hidden');
    return;
  }

  removeClass(statusContainer as Element, 'hidden');
  setText(statusText as Element, text);

  // Remove all type classes first
  removeClass(statusContainer as Element, 'ready', 'playing', 'error');
  
  if (type === 'ready' || type === 'playing') {
    addClass(statusContainer as Element, type);
  }
}

/**
 * Hide the Spotify status.
 */
export function hideSpotifyStatus(): void {
  if (!statusContainer) return;
  addClass(statusContainer as Element, 'hidden');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const spotifyUI = {
  init: initSpotifyUI,
  show: showSpotifyStatus,
  hide: hideSpotifyStatus,
};

