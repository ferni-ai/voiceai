/**
 * Bookmark UI - Double-tap to save conversation moments
 *
 * Allows users to quickly bookmark interesting moments during conversation.
 * Double-tap the avatar to save the current moment with timestamp and context.
 *
 * Design principles:
 * - Non-intrusive: quick gesture that doesn't interrupt flow
 * - Visual feedback: subtle animation confirms the bookmark
 * - Persistent: bookmarks stored in localStorage for later review
 * - Accessible: keyboard shortcut (B) also works
 *
 * Security note: All innerHTML usage contains only hardcoded SVG icons (no user input).
 *
 * @module ui/bookmark
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { toast } from './whisper.ui.js';

const log = createLogger('BookmarkUI');

// ============================================================================
// TYPES
// ============================================================================

export interface Bookmark {
  id: string;
  timestamp: number;
  context?: string; // Recent transcript excerpt
  personaId?: string;
  personaName?: string;
  mood?: string;
  sessionId?: string;
}

interface BookmarkState {
  bookmarks: Bookmark[];
  lastTapTime: number;
  isInitialized: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'ferni_bookmarks';
const DOUBLE_TAP_THRESHOLD = 300; // ms
const MAX_BOOKMARKS = 100;

// ============================================================================
// STATE
// ============================================================================

const state: BookmarkState = {
  bookmarks: [],
  lastTapTime: 0,
  isInitialized: false,
};

let styleElement: HTMLStyleElement | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initBookmarkUI(): void {
  if (state.isInitialized) return;

  // Load existing bookmarks
  loadBookmarks();

  // Inject styles
  injectStyles();

  // Set up double-tap listener on avatar
  setupDoubleTapListener();

  // Set up keyboard shortcut
  setupKeyboardShortcut();

  state.isInitialized = true;
  log.info('Bookmark UI initialized', { bookmarkCount: state.bookmarks.length });
}

// ============================================================================
// DOUBLE-TAP DETECTION
// ============================================================================

function setupDoubleTapListener(): void {
  const avatarContainer = document.querySelector('.avatar-container');
  if (!avatarContainer) {
    // Retry after a short delay (avatar might not be mounted yet)
    setTimeout(() => {
      const retryAvatar = document.querySelector('.avatar-container');
      if (retryAvatar) {
        attachDoubleTapHandler(retryAvatar);
      } else {
        log.warn('Avatar container not found for bookmark double-tap');
      }
    }, 1000);
    return;
  }

  attachDoubleTapHandler(avatarContainer);
}

function attachDoubleTapHandler(element: Element): void {
  // Handle touch devices
  element.addEventListener('touchend', handleTapEnd as EventListener, { passive: true });

  // Handle mouse (for desktop testing)
  element.addEventListener('click', handleTapEnd as EventListener);

  log.debug('Double-tap handler attached to avatar');
}

function handleTapEnd(e: TouchEvent | MouseEvent): void {
  // Don't trigger if clicking on interactive elements
  const target = e.target as HTMLElement;
  if (target.closest('button, a, input, .now-playing, .settings-menu')) {
    return;
  }

  const now = Date.now();
  const timeSinceLastTap = now - state.lastTapTime;

  // Double tap detection
  if (timeSinceLastTap < DOUBLE_TAP_THRESHOLD && timeSinceLastTap > 50) {
    e.preventDefault();
    createBookmark();
  }

  state.lastTapTime = now;
}

// ============================================================================
// KEYBOARD SHORTCUT
// ============================================================================

function setupKeyboardShortcut(): void {
  document.addEventListener('keydown', (e) => {
    // B key to bookmark (when not typing)
    if (
      e.key.toLowerCase() === 'b' &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      !isTyping()
    ) {
      e.preventDefault();
      createBookmark();
    }
  });
}

function isTyping(): boolean {
  const activeElement = document.activeElement;
  return (
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement?.getAttribute('contenteditable') === 'true'
  );
}

// ============================================================================
// BOOKMARK CREATION
// ============================================================================

function createBookmark(): void {
  // Get current context
  const context = getCurrentContext();

  const bookmark: Bookmark = {
    id: generateId(),
    timestamp: Date.now(),
    context: context.transcript,
    personaId: context.personaId,
    personaName: context.personaName,
    mood: context.mood,
    sessionId: context.sessionId,
  };

  // Add to bookmarks
  state.bookmarks.unshift(bookmark);

  // Limit total bookmarks
  if (state.bookmarks.length > MAX_BOOKMARKS) {
    state.bookmarks = state.bookmarks.slice(0, MAX_BOOKMARKS);
  }

  // Save to storage
  saveBookmarks();

  // Show visual feedback
  showBookmarkFeedback();

  log.info('Bookmark created', {
    id: bookmark.id,
    personaName: bookmark.personaName,
    hasContext: !!bookmark.context,
  });
}

function getCurrentContext(): {
  transcript?: string;
  personaId?: string;
  personaName?: string;
  mood?: string;
  sessionId?: string;
} {
  // Try to get current persona from DOM
  const avatarText = document.querySelector('#avatarText')?.textContent;
  const personaName = document.querySelector('.team-member--active .team-name')?.textContent;

  // Try to get recent transcript from conversation UI (if available)
  let transcript: string | undefined;
  const transcriptEl = document.querySelector('.conversation__latest, .transcript-text');
  if (transcriptEl) {
    transcript = transcriptEl.textContent?.slice(-200); // Last 200 chars
  }

  // Try to get mood from avatar state
  const avatarContainer = document.querySelector('.avatar-container');
  const mood = avatarContainer?.getAttribute('data-mood') ?? undefined;

  // Try to get session ID from window state
  const sessionId = (window as unknown as { ferniSessionId?: string }).ferniSessionId;

  return {
    transcript,
    personaId: avatarText ?? undefined,
    personaName: personaName ?? undefined,
    mood,
    sessionId,
  };
}

function generateId(): string {
  return `bm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================================
// VISUAL FEEDBACK
// ============================================================================

function showBookmarkFeedback(): void {
  // Show toast
  toast.success('Moment saved');

  // Animate avatar
  const avatar = document.querySelector('#coachAvatar');
  if (avatar) {
    avatar.classList.add('bookmark-pulse');
    setTimeout(() => avatar.classList.remove('bookmark-pulse'), DURATION.SLOW);
  }

  // Create floating bookmark icon animation
  createFloatingBookmark();

  // Haptic feedback (if available)
  if ('vibrate' in navigator) {
    navigator.vibrate([20, 30, 20]);
  }
}

function createFloatingBookmark(): void {
  const avatar = document.querySelector('#coachAvatar');
  if (!avatar) return;

  const rect = avatar.getBoundingClientRect();

  const floater = document.createElement('div');
  floater.className = 'bookmark-floater';

  // Create SVG element via DOM (safe approach)
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z');

  svg.appendChild(path);
  floater.appendChild(svg);

  floater.style.left = `${rect.left + rect.width / 2}px`;
  floater.style.top = `${rect.top}px`;

  document.body.appendChild(floater);

  // Remove after animation
  setTimeout(() => floater.remove(), 1000);
}

// ============================================================================
// STORAGE
// ============================================================================

function loadBookmarks(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      state.bookmarks = JSON.parse(stored);
    }
  } catch (err) {
    log.warn('Failed to load bookmarks', { error: String(err) });
    state.bookmarks = [];
  }
}

function saveBookmarks(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.bookmarks));
  } catch (err) {
    log.warn('Failed to save bookmarks', { error: String(err) });
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function getBookmarks(): Bookmark[] {
  return [...state.bookmarks];
}

export function getBookmark(id: string): Bookmark | undefined {
  return state.bookmarks.find((b) => b.id === id);
}

export function deleteBookmark(id: string): boolean {
  const index = state.bookmarks.findIndex((b) => b.id === id);
  if (index === -1) return false;

  state.bookmarks.splice(index, 1);
  saveBookmarks();

  log.debug('Bookmark deleted', { id });
  return true;
}

export function clearAllBookmarks(): void {
  state.bookmarks = [];
  saveBookmarks();
  log.info('All bookmarks cleared');
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;

  styleElement = document.createElement('style');
  styleElement.id = 'bookmark-ui-styles';
  styleElement.textContent = `
    /* ========================================
       BOOKMARK UI
       Double-tap to save moments
       ======================================== */

    /* Bookmark pulse animation on avatar */
    #coachAvatar.bookmark-pulse {
      animation: bookmarkPulse ${DURATION.SLOW}ms ${EASING.SPRING};
    }

    @keyframes bookmarkPulse {
      0% {
        transform: scale(1);
        filter: brightness(1);
      }
      30% {
        transform: scale(1.08);
        filter: brightness(1.2);
      }
      100% {
        transform: scale(1);
        filter: brightness(1);
      }
    }

    /* Floating bookmark icon */
    .bookmark-floater {
      position: fixed;
      pointer-events: none;
      z-index: var(--z-notification, 3000);
      color: var(--color-accent-primary, #4a6741);
      animation: bookmarkFloat 1s ${EASING.EXPO_OUT} forwards;
      filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.3));
    }

    @keyframes bookmarkFloat {
      0% {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      100% {
        opacity: 0;
        transform: translateY(-60px) scale(1.3);
      }
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      #coachAvatar.bookmark-pulse {
        animation: none;
      }

      .bookmark-floater {
        animation: bookmarkFade 0.5s ease forwards;
      }

      @keyframes bookmarkFade {
        0% { opacity: 1; }
        100% { opacity: 0; }
      }
    }
  `;

  document.head.appendChild(styleElement);
}

// ============================================================================
// CLEANUP
// ============================================================================

export function disposeBookmarkUI(): void {
  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }

  state.isInitialized = false;
  log.debug('Bookmark UI disposed');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const bookmarkUI = {
  init: initBookmarkUI,
  dispose: disposeBookmarkUI,
  create: createBookmark,
  getAll: getBookmarks,
  get: getBookmark,
  delete: deleteBookmark,
  clearAll: clearAllBookmarks,
};
