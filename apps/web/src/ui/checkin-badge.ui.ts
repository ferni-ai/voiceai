/**
 * Check-in Badge UI - Warm indicator that Ferni is thinking of you
 *
 * A subtle badge near the avatar that shows when Ferni has proactive
 * thoughts or wants to check in. Unlike notification-style indicators,
 * this feels like a gentle reminder that someone cares.
 *
 * Design principles:
 * - Warm, not pushy - feels like care, not interruption
 * - Near avatar - shows it comes from Ferni personally
 * - Gentle pulse - draws attention without demanding it
 * - Dismisses naturally - goes away when acknowledged
 *
 * Security note: All event handlers are on trusted elements.
 * SVG icons created via createElementNS for XSS safety.
 *
 * @module ui/checkin-badge
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { apiGet } from '../utils/api.js';
import { getAuthState } from '../services/firebase-auth.service.js';

const log = createLogger('CheckinBadge');

// ============================================================================
// TYPES
// ============================================================================

interface CheckinInfo {
  id: string;
  type: 'thinking_of_you' | 'gentle_checkin' | 'celebration' | 'support';
  message: string;
  personaId?: string;
  timestamp: string;
}

interface CheckinResponse {
  hasCheckin: boolean;
  checkin?: CheckinInfo;
}

type CheckinType = 'thinking_of_you' | 'gentle_checkin' | 'celebration' | 'support';

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;
let styleElement: HTMLStyleElement | null = null;
let badgeElement: HTMLElement | null = null;
let currentCheckin: CheckinInfo | null = null;
let checkInterval: ReturnType<typeof setInterval> | null = null;
let initialCheckTimeout: ReturnType<typeof setTimeout> | null = null;
let tooltipElement: HTMLElement | null = null;

// ============================================================================
// CONSTANTS
// ============================================================================

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes
const STORAGE_KEY = 'ferni_checkin_dismissed';
const SVG_NS = 'http://www.w3.org/2000/svg';

// ============================================================================
// SVG ICON CREATION (XSS-safe)
// ============================================================================

function createHeartIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute(
    'd',
    'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'
  );
  svg.appendChild(path);

  return svg;
}

function createChatIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z');
  svg.appendChild(path);

  return svg;
}

function createSparkleIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute(
    'd',
    'm12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z'
  );
  svg.appendChild(path);

  return svg;
}

function createSupportIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');

  // Hand/support icon - simplified palm
  const path1 = document.createElementNS(SVG_NS, 'path');
  path1.setAttribute('d', 'M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2');
  const path2 = document.createElementNS(SVG_NS, 'path');
  path2.setAttribute('d', 'M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2');
  const path3 = document.createElementNS(SVG_NS, 'path');
  path3.setAttribute('d', 'M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8');
  const path4 = document.createElementNS(SVG_NS, 'path');
  path4.setAttribute(
    'd',
    'M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15'
  );
  svg.appendChild(path1);
  svg.appendChild(path2);
  svg.appendChild(path3);
  svg.appendChild(path4);

  return svg;
}

function createIconForType(type: CheckinType): SVGSVGElement {
  switch (type) {
    case 'thinking_of_you':
      return createHeartIcon();
    case 'celebration':
      return createSparkleIcon();
    case 'support':
      return createSupportIcon();
    case 'gentle_checkin':
    default:
      return createChatIcon();
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initCheckinBadgeUI(): void {
  if (isInitialized) return;

  injectStyles();

  // Initial check after a brief delay
  initialCheckTimeout = setTimeout(() => {
    checkForCheckin();
  }, 3000);

  // Set up periodic checking
  checkInterval = setInterval(() => {
    checkForCheckin();
  }, CHECK_INTERVAL_MS);

  isInitialized = true;
  log.info('Check-in Badge UI initialized');
}

// ============================================================================
// CHECK-IN FETCHING
// ============================================================================

async function checkForCheckin(): Promise<void> {
  const authState = getAuthState();
  if (!authState.isAuthenticated) {
    return;
  }

  // Check if recently dismissed
  const dismissed = getDismissedTime();
  if (dismissed && Date.now() - dismissed < 60 * 60 * 1000) {
    // Don't show for 1 hour after dismissal
    return;
  }

  try {
    const response = await apiGet<CheckinResponse>('/api/outreach/pending-checkin');
    if (response.ok && response.data?.hasCheckin && response.data.checkin) {
      currentCheckin = response.data.checkin;
      showBadge();
    } else {
      hideBadge();
    }
  } catch (err) {
    log.debug('Could not check for check-in', { error: String(err) });
  }
}

function getDismissedTime(): number | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return parseInt(stored, 10);
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

function setDismissedTime(): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // Ignore storage errors
  }
}

// ============================================================================
// BADGE DISPLAY
// ============================================================================

function showBadge(): void {
  if (!currentCheckin) return;

  // Save checkin info before hideBadge clears it
  const checkinToShow = currentCheckin;

  // Remove existing badge element only (don't clear checkin data yet)
  if (badgeElement) {
    badgeElement.classList.remove('checkin-badge--visible');
    badgeElement.remove();
    badgeElement = null;
  }
  hideTooltip();

  // Find avatar container
  const avatarContainer = document.querySelector('.avatar-container');
  if (!avatarContainer) {
    log.debug('Avatar container not found');
    return;
  }

  // Create badge
  badgeElement = document.createElement('div');
  badgeElement.className = 'checkin-badge';
  badgeElement.setAttribute('role', 'button');
  badgeElement.setAttribute('tabindex', '0');
  badgeElement.setAttribute('aria-label', 'Ferni wants to check in');

  // Create icon using safe DOM methods
  const icon = createIconForType(checkinToShow.type);
  badgeElement.appendChild(icon);

  // Click handler - show tooltip then start conversation
  badgeElement.addEventListener('click', handleBadgeClick);
  badgeElement.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleBadgeClick();
    }
  });

  // Hover handler - show tooltip
  badgeElement.addEventListener('mouseenter', showTooltip);
  badgeElement.addEventListener('mouseleave', hideTooltip);
  badgeElement.addEventListener('focus', showTooltip);
  badgeElement.addEventListener('blur', hideTooltip);

  avatarContainer.appendChild(badgeElement);

  // Animate in
  requestAnimationFrame(() => {
    badgeElement?.classList.add('checkin-badge--visible');
  });

  log.debug('Check-in badge shown', { type: checkinToShow.type });
}

function hideBadge(): void {
  if (badgeElement) {
    badgeElement.classList.remove('checkin-badge--visible');
    setTimeout(() => {
      badgeElement?.remove();
      badgeElement = null;
    }, 300);
  }
  hideTooltip();
  currentCheckin = null;
}

function handleBadgeClick(): void {
  if (!currentCheckin) return;

  log.debug('Check-in badge clicked', { checkinId: currentCheckin.id });

  // Dispatch event to start conversation with this check-in context
  window.dispatchEvent(
    new CustomEvent('ferni:checkin-acknowledged', {
      detail: {
        checkinId: currentCheckin.id,
        message: currentCheckin.message,
        type: currentCheckin.type,
      },
    })
  );

  setDismissedTime();
  hideBadge();
}

// ============================================================================
// TOOLTIP
// ============================================================================

function showTooltip(): void {
  if (!badgeElement || !currentCheckin) return;

  hideTooltip();

  tooltipElement = document.createElement('div');
  tooltipElement.className = 'checkin-badge-tooltip';
  tooltipElement.textContent = currentCheckin.message || "I've been thinking about you";

  // Position tooltip above the badge
  const badgeRect = badgeElement.getBoundingClientRect();
  tooltipElement.style.position = 'fixed';
  tooltipElement.style.left = `${badgeRect.left + badgeRect.width / 2}px`;
  tooltipElement.style.top = `${badgeRect.top - 8}px`;

  document.body.appendChild(tooltipElement);

  // Animate in
  requestAnimationFrame(() => {
    tooltipElement?.classList.add('checkin-badge-tooltip--visible');
  });
}

function hideTooltip(): void {
  if (tooltipElement) {
    tooltipElement.classList.remove('checkin-badge-tooltip--visible');
    setTimeout(() => {
      tooltipElement?.remove();
      tooltipElement = null;
    }, 200);
  }
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;

  styleElement = document.createElement('style');
  styleElement.id = 'checkin-badge-styles';
  styleElement.textContent = `
    /* ========================================
       CHECK-IN BADGE
       Warm indicator near avatar
       ======================================== */

    .checkin-badge {
      position: absolute;
      top: -4px;
      right: -4px;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(
        135deg,
        var(--color-accent-primary, #4a6741) 0%,
        var(--color-accent-secondary, #5c7a50) 100%
      );
      border-radius: var(--radius-full, 999px);
      border: 2px solid var(--color-bg-primary, #0a0a0a);
      box-shadow:
        0 2px 8px rgba(74, 103, 65, 0.3),
        0 0 0 1px rgba(74, 103, 65, 0.2);
      color: white;
      cursor: pointer;
      opacity: 0;
      transform: scale(0.5);
      transition:
        opacity ${DURATION.NORMAL}ms ${EASING.SPRING},
        transform ${DURATION.NORMAL}ms ${EASING.SPRING},
        box-shadow ${DURATION.FAST}ms;
      z-index: var(--z-floating, 20);
      animation: checkinPulse 3s ${EASING.EASE_IN_OUT} infinite;
    }

    .checkin-badge--visible {
      opacity: 1;
      transform: scale(1);
    }

    .checkin-badge:hover {
      transform: scale(1.1);
      box-shadow:
        0 4px 12px rgba(74, 103, 65, 0.4),
        0 0 0 2px rgba(74, 103, 65, 0.3);
    }

    .checkin-badge:focus-visible {
      outline: 2px solid var(--color-accent-primary, #4a6741);
      outline-offset: 2px;
    }

    .checkin-badge svg {
      width: 14px;
      height: 14px;
      stroke-width: 2.5;
    }

    /* Gentle pulse animation */
    @keyframes checkinPulse {
      0%, 100% {
        box-shadow:
          0 2px 8px rgba(74, 103, 65, 0.3),
          0 0 0 1px rgba(74, 103, 65, 0.2);
      }
      50% {
        box-shadow:
          0 2px 12px rgba(74, 103, 65, 0.5),
          0 0 0 4px rgba(74, 103, 65, 0.1);
      }
    }

    /* Tooltip */
    .checkin-badge-tooltip {
      position: fixed;
      padding: var(--space-xs, 4px) var(--space-sm, 8px);
      background: var(--color-bg-elevated, rgba(255, 255, 255, 0.1));
      backdrop-filter: blur(var(--glass-blur-subtle, 8px));
      -webkit-backdrop-filter: blur(var(--glass-blur-subtle, 8px));
      border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.1));
      border-radius: var(--radius-md, 8px);
      color: var(--color-text-primary, #ffffff);
      font-size: var(--font-size-xs, 0.75rem);
      font-family: var(--font-body, system-ui);
      white-space: nowrap;
      transform: translateX(-50%) translateY(-100%);
      opacity: 0;
      transition:
        opacity ${DURATION.FAST}ms,
        transform ${DURATION.FAST}ms ${EASING.EXPO_OUT};
      pointer-events: none;
      z-index: var(--z-dropdown, 1000);
      max-width: 200px;
      white-space: normal;
      text-align: center;
    }

    .checkin-badge-tooltip--visible {
      opacity: 1;
      transform: translateX(-50%) translateY(-100%) translateY(-4px);
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .checkin-badge {
        animation: none;
        transition: opacity ${DURATION.FAST}ms;
        transform: scale(1);
      }

      .checkin-badge:hover {
        transform: scale(1);
      }
    }
  `;

  document.head.appendChild(styleElement);
}

// ============================================================================
// CLEANUP
// ============================================================================

export function disposeCheckinBadgeUI(): void {
  hideBadge();

  if (initialCheckTimeout) {
    clearTimeout(initialCheckTimeout);
    initialCheckTimeout = null;
  }

  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }

  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }

  isInitialized = false;
  log.debug('Check-in Badge UI disposed');
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Manually trigger a check-in badge (for testing or forced updates)
 */
export function triggerCheckin(info: CheckinInfo): void {
  currentCheckin = info;
  showBadge();
}

/**
 * Force refresh check-in status
 */
export function refreshCheckin(): void {
  checkForCheckin();
}

// ============================================================================
// EXPORTS
// ============================================================================

export const checkinBadgeUI = {
  init: initCheckinBadgeUI,
  dispose: disposeCheckinBadgeUI,
  trigger: triggerCheckin,
  refresh: refreshCheckin,
};
