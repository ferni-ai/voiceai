/**
 * Spotify UI Component
 * 
 * Displays Spotify status, currently playing track info,
 * and provides a link/unlink option for users.
 */

import type { SpotifyState } from '../types/events.js';
import type { TrackInfo } from '../services/spotify.service.js';
import { spotifyService } from '../services/spotify.service.js';
import { getElementByIdOrNull, setText, addClass, removeClass, setClasses } from '../utils/dom.js';
import { getDeviceId } from '../state/app.state.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('SpotifyUI');

// ============================================================================
// ELEMENT REFERENCES
// ============================================================================

let statusContainer: HTMLElement | null = null;
let statusText: HTMLElement | null = null;
let linkButton: HTMLElement | null = null;

// Store link status
let isSpotifyLinked = false;
let spotifyConfigured = false;

// Callback for state changes (used by menu)
let onLinkStateChangeCallback: ((linked: boolean, configured: boolean) => void) | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the Spotify UI component.
 */
export function initSpotifyUI(): void {
  statusContainer = getElementByIdOrNull('spotifyStatus');
  statusText = getElementByIdOrNull('spotifyStatusText');
  linkButton = getElementByIdOrNull('spotifyLinkButton');

  if (!statusContainer || !statusText) {
    log.warn('Spotify UI elements not found');
    return;
  }

  // Subscribe to Spotify state changes
  spotifyService.onStateChange(handleStateChange);

  // Check Spotify link status on init
  checkSpotifyStatus();

  // Handle URL parameters (after OAuth callback)
  handleOAuthCallback();

  // Set up link button click handler
  if (linkButton) {
    linkButton.addEventListener('click', handleLinkClick);
  }
}

/**
 * Check Spotify link status for current device.
 */
async function checkSpotifyStatus(): Promise<void> {
  const deviceId = getDeviceId();
  if (!deviceId) return;

  try {
    const response = await fetch(`/spotify/status?device_id=${encodeURIComponent(deviceId)}`);
    if (response.ok) {
      const data = await response.json();
      spotifyConfigured = data.spotify_configured;
      isSpotifyLinked = data.linked;
      updateLinkButton();
    }
  } catch (e) {
    log.warn('Could not check Spotify status:', e);
  }
}

/**
 * Handle OAuth callback URL parameters.
 */
function handleOAuthCallback(): void {
  const params = new URLSearchParams(window.location.search);
  
  if (params.get('spotify_linked') === 'true') {
    isSpotifyLinked = true;
    updateLinkButton();
    showSpotifyStatus('Spotify connected — full songs unlocked', 'ready');
    
    // Clear URL params
    window.history.replaceState({}, '', window.location.pathname);
    
    // Hide after a few seconds
    setTimeout(() => hideSpotifyStatus(), 4000);
  }

  if (params.has('spotify_error')) {
    const error = params.get('spotify_error');
    log.error('Spotify OAuth error:', error);
    showSpotifyStatus('Could not connect to Spotify', 'error');
    
    // Clear URL params
    window.history.replaceState({}, '', window.location.pathname);
    
    // Hide after a few seconds
    setTimeout(() => hideSpotifyStatus(), 4000);
  }
}

/**
 * Handle link/unlink button click.
 */
async function handleLinkClick(): Promise<void> {
  const deviceId = getDeviceId();
  if (!deviceId) return;

  if (isSpotifyLinked) {
    // Unlink
    try {
      await fetch(`/spotify/unlink?device_id=${encodeURIComponent(deviceId)}`);
      isSpotifyLinked = false;
      updateLinkButton();
      showSpotifyStatus('Spotify disconnected', 'info');
      setTimeout(() => hideSpotifyStatus(), 2500);
    } catch (e) {
      log.error('Could not unlink Spotify:', e);
    }
  } else {
    // Redirect to OAuth
    const returnUrl = encodeURIComponent(window.location.origin + window.location.pathname);
    window.location.href = `/spotify/login?device_id=${encodeURIComponent(deviceId)}&return_url=${returnUrl}`;
  }
}

/**
 * Update the link button text and visibility.
 * Also notifies the state change callback for menu updates.
 */
function updateLinkButton(): void {
  // Notify callback for menu updates
  onLinkStateChangeCallback?.(isSpotifyLinked, spotifyConfigured);
  
  // Legacy button support (if still present in DOM)
  if (!linkButton) return;

  if (!spotifyConfigured) {
    addClass(linkButton, 'hidden');
    return;
  }

  removeClass(linkButton, 'hidden');
  
  // Update the text span (keep the SVG icon intact)
  const textSpan = linkButton.querySelector('.spotify-button-text');
  if (textSpan) {
    textSpan.textContent = isSpotifyLinked ? 'Spotify Connected' : 'Link Spotify';
  }
  
  linkButton.classList.toggle('linked', isSpotifyLinked);
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

/**
 * Get current Spotify link status.
 */
export function getSpotifyLinkStatus(): { linked: boolean; configured: boolean } {
  return { linked: isSpotifyLinked, configured: spotifyConfigured };
}

/**
 * Register callback for link state changes.
 */
export function onSpotifyLinkStateChange(callback: (linked: boolean, configured: boolean) => void): void {
  onLinkStateChangeCallback = callback;
}

/**
 * Trigger the Spotify link/unlink flow.
 * Exposed for use by settings menu.
 */
export async function triggerSpotifyLinkToggle(): Promise<void> {
  await handleLinkClick();
}

export const spotifyUI = {
  init: initSpotifyUI,
  show: showSpotifyStatus,
  hide: hideSpotifyStatus,
  getLinkStatus: getSpotifyLinkStatus,
  onLinkStateChange: onSpotifyLinkStateChange,
  toggleLink: triggerSpotifyLinkToggle,
};

