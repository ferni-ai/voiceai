/**
 * Voice ID Badge UI Component
 *
 * Shows a small badge on the avatar indicating voice enrollment status.
 * - Hidden when not enrolled
 * - Shows checkmark when enrolled
 * - Pulses subtly when actively verifying
 *
 * @module VoiceIdBadge
 */

import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { getVoiceAuthService } from '../services/voice-auth.service.js';
import { DURATION, EASING } from '../config/animation-constants.js';

const log = createLogger('VoiceIdBadge');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// CONSTANTS
// ============================================================================

const BADGE_ID = 'voice-id-badge';

const BADGE_STYLES = `
  .voice-id-badge {
    position: absolute;
    bottom: 2px;
    right: 2px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--persona-primary, #4a6741);
    border: 2px solid var(--color-background-elevated, #fff);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transform: scale(0);
    transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD},
                transform ${DURATION.NORMAL}ms ${EASING.SPRING};
    z-index: var(--z-docked);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }
  
  .voice-id-badge.enrolled {
    opacity: 1;
    transform: scale(1);
  }
  
  .voice-id-badge.verifying {
    animation: voice-id-pulse 1.5s ease-in-out infinite;
  }
  
  .voice-id-badge svg {
    width: 14px;
    height: 14px;
    stroke: white;
    stroke-width: 2.5;
    fill: none;
  }
  
  @keyframes voice-id-pulse {
    0%, 100% {
      transform: scale(1);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }
    50% {
      transform: scale(1.1);
      box-shadow: 0 2px 12px var(--persona-glow, rgba(74, 103, 65, 0.4));
    }
  }
  
  /* Dark mode adjustments */
  [data-theme="dark"] .voice-id-badge {
    border-color: var(--color-background-subtle, #2c2520);
  }
  
  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .voice-id-badge.verifying {
      animation: none;
    }
  }
`;

// Checkmark SVG icon
const CHECKMARK_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
`;

// ============================================================================
// BADGE MANAGEMENT
// ============================================================================

let badgeElement: HTMLElement | null = null;
let isInitialized = false;

/**
 * Create and inject the badge element.
 */
function createBadge(): HTMLElement {
  // Inject styles if not already present
  if (!document.getElementById('voice-id-badge-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'voice-id-badge-styles';
    styleEl.textContent = BADGE_STYLES;
    document.head.appendChild(styleEl);
  }
  
  // Create badge element
  const badge = document.createElement('div');
  badge.id = BADGE_ID;
  badge.className = 'voice-id-badge';
  badge.setAttribute('role', 'status');
  badge.setAttribute('aria-label', 'Voice ID enrolled');
  badge.innerHTML = CHECKMARK_ICON;
  
  return badge;
}

/**
 * Find the avatar container and attach the badge.
 */
function attachBadgeToAvatar(): boolean {
  const avatarContainer = document.querySelector('.avatar-container');
  if (!avatarContainer) {
    log.warn('Avatar container not found - badge not attached');
    return false;
  }
  
  // Make sure container is positioned
  const style = getComputedStyle(avatarContainer);
  if (style.position === 'static') {
    (avatarContainer as HTMLElement).style.position = 'relative';
  }
  
  // Remove existing badge if any
  const existing = document.getElementById(BADGE_ID);
  if (existing) {
    existing.remove();
  }
  
  // Create and attach badge
  badgeElement = createBadge();
  avatarContainer.appendChild(badgeElement);
  
  log.debug('Voice ID badge attached to avatar');
  return true;
}

/**
 * Update badge visibility based on enrollment status.
 */
export async function updateBadgeStatus(): Promise<void> {
  if (!badgeElement) {
    if (!attachBadgeToAvatar()) {
      return;
    }
  }
  
  try {
    const voiceAuth = getVoiceAuthService();
    const profile = await voiceAuth.getProfile();
    
    if (profile.enrolled) {
      badgeElement!.classList.add('enrolled');
      badgeElement!.setAttribute('aria-label', 'Voice ID enrolled');
      log.debug('Voice ID badge shown (enrolled)');
    } else {
      badgeElement!.classList.remove('enrolled');
      badgeElement!.setAttribute('aria-label', 'Voice ID not enrolled');
      log.debug('Voice ID badge hidden (not enrolled)');
    }
  } catch (error) {
    log.warn('Failed to check voice enrollment status:', error);
    badgeElement!.classList.remove('enrolled');
  }
}

/**
 * Show verifying animation on badge.
 */
export function showVerifying(): void {
  if (badgeElement) {
    badgeElement.classList.add('verifying');
  }
}

/**
 * Hide verifying animation.
 */
export function hideVerifying(): void {
  if (badgeElement) {
    badgeElement.classList.remove('verifying');
  }
}

/**
 * Initialize the Voice ID badge.
 * Call this after the DOM is ready.
 */
export function initVoiceIdBadge(): void {
  if (isInitialized) {
    return;
  }
  
  // Wait for avatar to be in DOM
  const checkAndInit = () => {
    if (attachBadgeToAvatar()) {
      isInitialized = true;
      void updateBadgeStatus();
      
      // Listen for enrollment changes
      window.addEventListener('ferni:voice-enrolled', () => {
        void updateBadgeStatus();
      });
      
      window.addEventListener('ferni:voice-unenrolled', () => {
        void updateBadgeStatus();
      });
      
      log.info('Voice ID badge initialized');
    } else {
      // Retry after a short delay
      trackedTimeout(checkAndInit, 500);
    }
  };
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAndInit);
  } else {
    checkAndInit();
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  init: initVoiceIdBadge,
  updateStatus: updateBadgeStatus,
  showVerifying,
  hideVerifying,
};

