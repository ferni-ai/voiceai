/**
 * Music History Drawer UI
 *
 * A slide-out drawer that shows recently played tracks during the session.
 * Accessible via a small button on the now-playing card.
 *
 * Design principles:
 * - Glass effect drawer slides from right
 * - Shows track artwork, name, artist, and time played
 * - Tapping a track shows Spotify link option
 * - Respects reduced motion preferences
 *
 * Security note: Track names and artists are escaped with escapeHtml().
 * URLs come from Spotify backend (trusted source).
 *
 * @module ui/music-history
 */

import { nowPlayingUI } from './now-playing.ui.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('MusicHistoryUI');

// ============================================================================
// TYPES
// ============================================================================

interface HistoryTrack {
  name: string;
  artist: string;
  artworkUrl?: string;
  spotifyUrl?: string;
  playedAt: number;
}

// ============================================================================
// STATE
// ============================================================================

let drawer: HTMLElement | null = null;
let backdrop: HTMLElement | null = null;
let isOpen = false;
let isInitialized = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initMusicHistoryUI(): void {
  if (isInitialized) return;

  injectStyles();
  createDrawer();

  isInitialized = true;
  log.info('Music History UI initialized');
}

// ============================================================================
// CSS INJECTION
// ============================================================================

function injectStyles(): void {
  const styleId = 'music-history-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    /* ========================================
       MUSIC HISTORY DRAWER
       Glass effect slide-out panel
       ======================================== */

    .music-history-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
      opacity: 0;
      pointer-events: none;
      z-index: var(--z-modal-backdrop, 2000);
      transition: opacity var(--duration-normal, 200ms) var(--ease-out-expo);
    }

    .music-history-backdrop--visible {
      opacity: 1;
      pointer-events: auto;
    }

    .music-history {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: min(320px, 85vw);
      transform: translateX(100%);
      background: var(--glass-background, rgba(255, 255, 255, 0.1));
      backdrop-filter: blur(var(--glass-blur-heavy, 24px));
      -webkit-backdrop-filter: blur(var(--glass-blur-heavy, 24px));
      border-left: 1px solid var(--glass-border, rgba(255, 255, 255, 0.1));
      z-index: var(--z-modal, 2100);
      display: flex;
      flex-direction: column;
      transition: transform var(--duration-slow, 300ms) var(--ease-out-expo);
    }

    .music-history--open {
      transform: translateX(0);
    }

    .music-history__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-md, 16px);
      border-bottom: 1px solid var(--glass-border, rgba(255, 255, 255, 0.1));
    }

    .music-history__title {
      font-family: var(--font-display, 'Plus Jakarta Sans', system-ui);
      font-size: var(--font-size-lg, 1.125rem);
      font-weight: 600;
      color: var(--color-text-primary, #ffffff);
      margin: 0;
    }

    .music-history__close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: transparent;
      color: var(--color-text-secondary, rgba(255, 255, 255, 0.7));
      cursor: pointer;
      transition: background var(--duration-fast, 150ms);
    }

    .music-history__close:hover,
    .music-history__close:focus-visible {
      background: var(--color-bg-elevated, rgba(255, 255, 255, 0.1));
    }

    .music-history__close:focus-visible {
      outline: 2px solid var(--color-accent-primary, #4a6741);
      outline-offset: 2px;
    }

    .music-history__list {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-sm, 8px);
    }

    .music-history__empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 200px;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      text-align: center;
      gap: var(--space-sm, 8px);
    }

    .music-history__empty-icon {
      opacity: 0.5;
    }

    .music-history__track {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 8px);
      padding: var(--space-sm, 8px);
      border-radius: var(--radius-md, 8px);
      transition: background var(--duration-fast, 150ms);
    }

    .music-history__track:hover {
      background: var(--color-bg-elevated, rgba(255, 255, 255, 0.05));
    }

    .music-history__artwork {
      width: 48px;
      height: 48px;
      border-radius: var(--radius-sm, 4px);
      object-fit: cover;
      background: var(--color-bg-tertiary, rgba(255, 255, 255, 0.05));
    }

    .music-history__artwork--placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.3));
    }

    .music-history__info {
      flex: 1;
      min-width: 0;
    }

    .music-history__name {
      font-size: var(--font-size-sm, 0.875rem);
      font-weight: 500;
      color: var(--color-text-primary, #ffffff);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin: 0;
    }

    .music-history__artist {
      font-size: var(--font-size-xs, 0.75rem);
      color: var(--color-text-secondary, rgba(255, 255, 255, 0.7));
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin: 0;
    }

    .music-history__time {
      font-size: var(--font-size-xs, 0.75rem);
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      white-space: nowrap;
    }

    .music-history__link {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: transparent;
      border: none;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      cursor: pointer;
      transition: color var(--duration-fast, 150ms), background var(--duration-fast, 150ms);
    }

    .music-history__link:hover,
    .music-history__link:focus-visible {
      color: var(--color-spotify, #1DB954);
      background: rgba(29, 185, 84, 0.1);
    }

    .music-history__link:focus-visible {
      outline: 2px solid var(--color-spotify, #1DB954);
      outline-offset: 2px;
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .music-history-backdrop,
      .music-history {
        transition: none;
      }
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// DOM CREATION
// ============================================================================

function createDrawer(): void {
  // Create backdrop
  backdrop = document.createElement('div');
  backdrop.className = 'music-history-backdrop';
  backdrop.addEventListener('click', close);
  document.body.appendChild(backdrop);

  // Create drawer
  drawer = document.createElement('div');
  drawer.className = 'music-history';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');
  drawer.setAttribute('aria-label', 'Music history');

  // Header
  const header = document.createElement('div');
  header.className = 'music-history__header';

  const title = document.createElement('h2');
  title.className = 'music-history__title';
  title.textContent = 'Recently Played';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'music-history__close';
  closeBtn.setAttribute('type', 'button');
  closeBtn.setAttribute('aria-label', 'Close history');
  // Safe: hardcoded SVG icon
  closeBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  closeBtn.addEventListener('click', close);

  header.appendChild(title);
  header.appendChild(closeBtn);

  // List container
  const list = document.createElement('div');
  list.className = 'music-history__list';

  drawer.appendChild(header);
  drawer.appendChild(list);
  document.body.appendChild(drawer);

  // Keyboard handling
  drawer.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      close();
    }
  });
}

// ============================================================================
// OPEN / CLOSE
// ============================================================================

export function open(): void {
  if (!drawer || !backdrop) {
    initMusicHistoryUI();
  }
  if (!drawer || !backdrop || isOpen) return;

  // Populate with current history
  populateHistory();

  isOpen = true;
  backdrop.classList.add('music-history-backdrop--visible');
  drawer.classList.add('music-history--open');

  // Focus the close button for accessibility
  const closeBtn = drawer.querySelector('.music-history__close') as HTMLButtonElement;
  closeBtn?.focus();

  log.debug('Music history drawer opened');
}

export function close(): void {
  if (!drawer || !backdrop || !isOpen) return;

  isOpen = false;
  backdrop.classList.remove('music-history-backdrop--visible');
  drawer.classList.remove('music-history--open');

  log.debug('Music history drawer closed');
}

export function toggle(): void {
  if (isOpen) {
    close();
  } else {
    open();
  }
}

// ============================================================================
// POPULATE HISTORY
// ============================================================================

function populateHistory(): void {
  if (!drawer) return;

  const list = drawer.querySelector('.music-history__list');
  if (!list) return;

  const history = nowPlayingUI.getHistory();

  if (history.length === 0) {
    // Safe: hardcoded HTML with no user input
    list.innerHTML = `
      <div class="music-history__empty">
        <svg class="music-history__empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
          <line x1="9" y1="9" x2="9.01" y2="9"/>
          <line x1="15" y1="9" x2="15.01" y2="9"/>
        </svg>
        <p>No tracks played yet</p>
        <p style="font-size: 0.75rem;">Ask Ferni to play some music!</p>
      </div>
    `;
    return;
  }

  // Safe: renderTrack escapes user-provided text via escapeHtml()
  list.innerHTML = history.map((track) => renderTrack(track)).join('');
}

function renderTrack(track: HistoryTrack): string {
  const timeAgo = formatTimeAgo(track.playedAt);
  const hasArtwork = track.artworkUrl && track.artworkUrl.length > 0;

  // Spotify link button (only if we have a URL)
  // spotifyUrl comes from our backend (trusted Spotify API response)
  const linkButton = track.spotifyUrl
    ? `<a href="${track.spotifyUrl}" target="_blank" rel="noopener noreferrer" class="music-history__link" aria-label="Open in Spotify" title="Open in Spotify">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
        </svg>
      </a>`
    : '';

  // artworkUrl comes from Spotify API (trusted)
  const artwork = hasArtwork
    ? `<img class="music-history__artwork" src="${track.artworkUrl}" alt="" loading="lazy" />`
    : `<div class="music-history__artwork music-history__artwork--placeholder">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polygon points="10 8 16 12 10 16 10 8"/>
        </svg>
      </div>`;

  // IMPORTANT: Track name and artist are user-facing content, escaped for XSS protection
  return `
    <div class="music-history__track">
      ${artwork}
      <div class="music-history__info">
        <p class="music-history__name">${escapeHtml(track.name)}</p>
        <p class="music-history__artist">${escapeHtml(track.artist)}</p>
      </div>
      <span class="music-history__time">${timeAgo}</span>
      ${linkButton}
    </div>
  `;
}

// ============================================================================
// UTILITIES
// ============================================================================

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours}h ago`;
  }
  return 'Earlier';
}

/**
 * Escape HTML to prevent XSS attacks
 * Used for track names and artists which come from Spotify but could theoretically contain malicious content
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  drawer?.remove();
  backdrop?.remove();
  drawer = null;
  backdrop = null;
  isOpen = false;
  isInitialized = false;
  log.info('Music History UI disposed');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const musicHistoryUI = {
  init: initMusicHistoryUI,
  open,
  close,
  toggle,
  dispose,
};
