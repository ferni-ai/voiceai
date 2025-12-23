/**
 * Offline Banner UI
 *
 * Shows a subtle banner when the user goes offline.
 * Automatically hides when back online.
 *
 * DESIGN:
 * - Minimal, non-intrusive banner at top of screen
 * - Animates in/out smoothly
 * - Brand-compliant colors
 */

import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { t } from '../i18n/index.js';
import { isOffline, onOfflineChange } from '../services/offline.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('OfflineBanner');

// ============================================================================
// STATE
// ============================================================================

let bannerElement: HTMLElement | null = null;
let unsubscribe: (() => void) | null = null;
let isVisible = false;

// ============================================================================
// STYLES
// ============================================================================

const BANNER_STYLES = `
  .offline-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: var(--z-notification, 3000);
    
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm, 0.5rem);
    
    padding: var(--space-sm, 0.5rem) var(--space-md, 1rem);
    
    background: var(--color-semantic-warning-bg, #fef3cd);
    color: var(--color-semantic-warning-text, #856404);
    
    font-family: var(--font-body, 'Inter', sans-serif);
    font-size: 0.875rem;
    font-weight: 500;
    text-align: center;
    
    transform: translateY(-100%);
    opacity: 0;
    transition: transform var(--duration-normal, 200ms) var(--ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1)),
                opacity var(--duration-normal, 200ms) ease-out;
  }
  
  .offline-banner.visible {
    transform: translateY(0);
    opacity: 1;
  }
  
  .offline-banner__icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }
  
  .offline-banner__text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .offline-banner__retry {
    background: none;
    border: none;
    color: inherit;
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
    padding: 0;
    margin-left: var(--space-xs, 0.25rem);
  }
  
  .offline-banner__retry:hover {
    opacity: 0.8;
  }
  
  @media (prefers-reduced-motion: reduce) {
    .offline-banner {
      transition: opacity var(--duration-fast, 150ms) ease-out;
      transform: translateY(0);
    }
    
    .offline-banner:not(.visible) {
      display: none;
    }
  }
`;

// ============================================================================
// ICONS
// ============================================================================

const WIFI_OFF_ICON = `
  <svg class="offline-banner__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="1" y1="1" x2="23" y2="23"></line>
    <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
    <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
    <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
    <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
    <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
    <line x1="12" y1="20" x2="12.01" y2="20"></line>
  </svg>
`;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize offline banner
 */
export function initOfflineBanner(): void {
  // Add styles
  addStyles();
  
  // Create banner element
  createBanner();
  
  // Subscribe to offline changes
  unsubscribe = onOfflineChange(handleOfflineChange);
  
  // Check initial state
  if (isOffline()) {
    showBanner();
  }
  
  log.debug('Offline banner initialized');
}

/**
 * Dispose offline banner
 */
export function disposeOfflineBanner(): void {
  unsubscribe?.();
  unsubscribe = null;
  
  bannerElement?.remove();
  bannerElement = null;
  
  isVisible = false;
}

// ============================================================================
// INTERNAL
// ============================================================================

function addStyles(): void {
  if (document.getElementById('offline-banner-styles')) {
    return;
  }
  
  const styleEl = document.createElement('style');
  styleEl.id = 'offline-banner-styles';
  styleEl.textContent = BANNER_STYLES;
  document.head.appendChild(styleEl);
}

function createBanner(): void {
  // Remove existing
  document.querySelector('.offline-banner')?.remove();
  
  bannerElement = document.createElement('div');
  bannerElement.className = 'offline-banner';
  bannerElement.setAttribute('role', 'alert');
  bannerElement.setAttribute('aria-live', 'polite');
  
  bannerElement.innerHTML = `
    ${WIFI_OFF_ICON}
    <span class="offline-banner__text">${t('common.offline') || 'You\'re offline'}</span>
    <button class="offline-banner__retry" type="button">${t('common.retry') || 'Retry'}</button>
  `;
  
  // Add retry button handler
  const retryBtn = bannerElement.querySelector('.offline-banner__retry');
  retryBtn?.addEventListener('click', () => {
    window.location.reload();
  });
  
  document.body.appendChild(bannerElement);
}

function handleOfflineChange(offline: boolean): void {
  if (offline) {
    showBanner();
  } else {
    hideBanner();
  }
}

function showBanner(): void {
  if (isVisible || !bannerElement) {
    return;
  }
  
  isVisible = true;
  
  // Force reflow for animation
  bannerElement.offsetHeight;
  
  bannerElement.classList.add('visible');
  log.debug('Offline banner shown');
}

function hideBanner(): void {
  if (!isVisible || !bannerElement) {
    return;
  }
  
  isVisible = false;
  bannerElement.classList.remove('visible');
  log.debug('Offline banner hidden');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const offlineBanner = {
  init: initOfflineBanner,
  dispose: disposeOfflineBanner,
  show: showBanner,
  hide: hideBanner,
};

export default offlineBanner;

