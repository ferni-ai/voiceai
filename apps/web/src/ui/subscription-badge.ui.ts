/**
 * Subscription Badge UI - Subtle status indicator
 *
 * Philosophy: Founders Fund - Ferni is free forever.
 * Status is informative and welcoming, never guilting or gatekeeping.
 *
 * Design: Small pill badge that appears near the header
 * - Trial: Shows time remaining (e.g., "5:32 left")
 * - Community (free): Shows "Community" - warm, not limiting
 * - Founding Member/Patron: Shows gratitude, not privilege
 * - Clicking opens Founders Fund modal
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { modalCoordinator } from '../services/modal-coordinator.service.js';
import { appState } from '../state/app.state.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import {
  loadStatus as loadSubscriptionStatus,
  showUpgradeModal,
  type SubscriptionStatus,
} from './subscription.ui.js';

const log = createLogger('SubBadge');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

interface TrialStatus {
  inTrial: boolean;
  timeRemainingMs: number | null;
  approachingEnd: boolean;
  trialEnded: boolean;
  trialDurationMs: number;
  isEligible: boolean;
}

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  sparkle:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>',
  infinity:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z"/></svg>',
  // Timer/clock icon for trial countdown
  timer:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  // Gift icon for first taste
  gift: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/></svg>',
};

// ============================================================================
// STATE
// ============================================================================

let badgeElement: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;
let refreshInterval: ReturnType<typeof setInterval> | null = null;
let trialTimerInterval: ReturnType<typeof setInterval> | null = null;
let currentTrialStatus: TrialStatus | null = null;
let sessionStartTime: number | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initSubscriptionBadge(): void {
  cleanupOrphanedElements();
  injectStyles();
  createBadge();

  // Initial load
  void refreshStatus();

  // Refresh every 5 minutes
  refreshInterval = setInterval(() => void refreshStatus(), 5 * 60 * 1000);

  // Listen for conversation start to start trial timer
  window.addEventListener('voiceai-connected', () => {
    log.debug('Connected - starting trial timer if applicable');
    startTrialTimer();
    void refreshStatus();
  });

  // Listen for conversation end to stop trial timer and refresh
  window.addEventListener('voiceai-disconnected', () => {
    stopTrialTimer();
    trackedTimeout(() => void refreshStatus(), 2000);
  });

  // Listen for subscription upgrade to refresh immediately
  window.addEventListener('subscription-upgraded', () => {
    log.debug('Subscription upgrade detected, refreshing badge');
    void refreshStatus();
  });

  log.debug('Subscription badge initialized');
}

export function destroySubscriptionBadge(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
  badgeElement?.remove();
  badgeElement = null;
}

function cleanupOrphanedElements(): void {
  document.querySelectorAll('.subscription-badge').forEach((el) => el.remove());
  document.querySelectorAll('#subscription-badge-styles').forEach((el) => el.remove());
}

// ============================================================================
// BADGE CREATION
// ============================================================================

function createBadge(): void {
  badgeElement = document.createElement('button');
  badgeElement.className = 'subscription-badge';
  badgeElement.setAttribute('aria-label', 'View subscription options');
  badgeElement.setAttribute('role', 'status');

  // Insert after persona subtitle
  const subtitleEl = document.getElementById('personaSubtitle');
  if (subtitleEl && subtitleEl.parentNode) {
    subtitleEl.parentNode.insertBefore(badgeElement, subtitleEl.nextSibling);
  } else {
    // Fallback: append to coach element
    const coachEl = document.getElementById('coach');
    if (coachEl) {
      coachEl.appendChild(badgeElement);
    }
  }

  // Click handler
  badgeElement.addEventListener('click', (e) => {
    e.preventDefault();
    showUpgradeModal();
  });

  // Keyboard support
  badgeElement.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      showUpgradeModal();
    }
  });

  // Set initial loading state
  updateBadgeDisplay(null);
}

// ============================================================================
// STATUS REFRESH
// ============================================================================

async function refreshStatus(): Promise<void> {
  try {
    // FIRST CONVERSATION IS ONBOARDING - hide subscription badge for new users
    // Don't want to add ANY extra UI elements for first-time users
    if (!modalCoordinator.hasMinimumConversations(1)) {
      if (badgeElement) {
        badgeElement.style.display = 'none';
      }
      return;
    }

    // Show badge for returning users
    if (badgeElement) {
      badgeElement.style.display = '';
    }

    // First check trial status (for new users)
    await refreshTrialStatus();

    // If in trial, show trial timer instead of subscription badge
    if (currentTrialStatus?.inTrial) {
      updateTrialDisplay();
      return;
    }

    // Otherwise show regular subscription status
    const status = await loadSubscriptionStatus();
    updateBadgeDisplay(status);
  } catch (error) {
    log.warn('Failed to refresh subscription status:', error);
    updateBadgeDisplay(null);
  }
}

/**
 * Fetch trial status from API
 */
async function refreshTrialStatus(): Promise<void> {
  const deviceId = appState.getState().deviceId;
  if (!deviceId) return;

  try {
    const sessionTimeMs = sessionStartTime ? Date.now() - sessionStartTime : 0;
    const response = await fetch(
      `/subscription/trial?userId=${encodeURIComponent(deviceId)}&sessionTime=${sessionTimeMs}`
    );

    if (response.ok) {
      currentTrialStatus = (await response.json()) as TrialStatus;
      log.debug('Trial status fetched:', currentTrialStatus);
    }
  } catch (error) {
    log.warn('Failed to fetch trial status:', error);
  }
}

/**
 * Start the trial timer countdown (called when connected)
 */
export function startTrialTimer(): void {
  sessionStartTime = Date.now();

  // Update trial display every second while in trial
  if (trialTimerInterval) {
    clearInterval(trialTimerInterval);
  }

  trialTimerInterval = setInterval(() => {
    if (currentTrialStatus?.inTrial) {
      updateTrialDisplay();
    } else {
      // Trial ended, stop timer and refresh status
      stopTrialTimer();
      void refreshStatus();
    }
  }, 1000);

  log.debug('Trial timer started');
}

/**
 * Stop the trial timer (called when disconnected)
 */
export function stopTrialTimer(): void {
  if (trialTimerInterval) {
    clearInterval(trialTimerInterval);
    trialTimerInterval = null;
  }
  sessionStartTime = null;
  log.debug('Trial timer stopped');
}

/**
 * Format milliseconds as "M:SS" or "S sec"
 */
function formatTrialTime(ms: number): string {
  if (ms <= 0) return '0:00';

  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${seconds}s`;
}

/**
 * Update badge to show trial countdown
 */
function updateTrialDisplay(): void {
  if (!badgeElement || !currentTrialStatus) return;

  // Calculate remaining time
  const sessionTimeMs = sessionStartTime ? Date.now() - sessionStartTime : 0;
  const trialTimeUsedMs = (currentTrialStatus as { trialTimeUsedMs?: number }).trialTimeUsedMs || 0;
  const totalUsed = trialTimeUsedMs + sessionTimeMs;
  const remaining = Math.max(0, currentTrialStatus.trialDurationMs - totalUsed);

  // Check if trial has ended
  if (remaining <= 0) {
    currentTrialStatus.inTrial = false;
    currentTrialStatus.trialEnded = true;
    void refreshStatus();
    return;
  }

  // Determine urgency level
  const isLow = remaining <= 60000; // Last minute
  const isVeryLow = remaining <= 30000; // Last 30 seconds

  badgeElement.classList.remove('subscription-badge--hidden');
  badgeElement.classList.remove('subscription-badge--premium');
  badgeElement.classList.toggle('subscription-badge--low', isLow);
  badgeElement.classList.toggle('subscription-badge--trial', true);
  badgeElement.classList.toggle('subscription-badge--urgent', isVeryLow);

  const timeDisplay = formatTrialTime(remaining);
  const icon = isLow ? ICONS.timer : ICONS.gift;

  badgeElement.innerHTML = `
    <span class="subscription-badge__icon">${icon}</span>
    <span class="subscription-badge__text">${timeDisplay} left</span>
  `;

  badgeElement.setAttribute(
    'aria-label',
    `${timeDisplay} remaining in your free trial. Click for more info.`
  );

  // Ensure visible
  if (!badgeElement.classList.contains('subscription-badge--visible')) {
    requestAnimationFrame(() => {
      badgeElement?.classList.add('subscription-badge--visible');
    });
  }
}

export async function forceRefresh(): Promise<void> {
  await refreshStatus();
}

// ============================================================================
// DISPLAY UPDATE
// ============================================================================

function updateBadgeDisplay(status: SubscriptionStatus | null): void {
  if (!badgeElement) return;

  if (!status) {
    // Loading or error state - hide badge
    badgeElement.classList.add('subscription-badge--hidden');
    return;
  }

  badgeElement.classList.remove('subscription-badge--hidden');

  if (status.tier === 'free') {
    // Founders Fund philosophy: Ferni is FREE FOREVER
    // Don't show "conversations remaining" - that contradicts our message
    // Instead, show a warm invitation to support if they want to
    badgeElement.innerHTML = `
      <span class="subscription-badge__icon">${ICONS.sparkle}</span>
      <span class="subscription-badge__text">Community</span>
    `;
    badgeElement.classList.remove('subscription-badge--low');
    badgeElement.classList.remove('subscription-badge--premium');
    badgeElement.setAttribute(
      'aria-label',
      'Community member. Want to help us grow? Click to learn more.'
    );
  } else {
    // Show tier name for Founders with gratitude
    const tierDisplay: Record<string, { short: string; full: string }> = {
      friend: { short: 'Founder', full: 'Founding Member' },
      partner: { short: 'Patron', full: 'Founding Patron' },
    };
    const display = tierDisplay[status.tier] || { short: status.tier, full: status.tier };

    badgeElement.innerHTML = `
      <span class="subscription-badge__icon">${ICONS.sparkle}</span>
      <span class="subscription-badge__text">${display.short}</span>
    `;
    badgeElement.classList.remove('subscription-badge--low');
    badgeElement.classList.add('subscription-badge--premium');
    badgeElement.setAttribute(
      'aria-label',
      `${display.full}. Thank you for believing in us! Click to manage.`
    );
  }

  // Animate in if newly visible
  if (!badgeElement.classList.contains('subscription-badge--visible')) {
    requestAnimationFrame(() => {
      badgeElement?.classList.add('subscription-badge--visible');
    });
  }
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('subscription-badge-styles')) return;

  styleElement = document.createElement('style');
  styleElement.id = 'subscription-badge-styles';
  styleElement.textContent = `
    .subscription-badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1, 4px);
      padding: var(--space-1, 4px) var(--space-2, 8px);
      margin-top: var(--space-2, 8px);
      background: var(--color-background-secondary, rgba(255, 253, 251, 0.8));
      border: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.1));
      border-radius: var(--radius-full, 9999px);
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--color-text-secondary, #5a5048);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      opacity: 0;
      transform: translateY(-4px);
    }
    
    .subscription-badge--visible {
      opacity: 1;
      transform: translateY(0);
    }
    
    .subscription-badge--hidden {
      display: none;
    }
    
    .subscription-badge:hover {
      background: var(--color-background-tertiary, #f5f3f0);
      border-color: var(--color-border, #d4d0c8);
    }
    
    .subscription-badge:focus {
      outline: none;
      box-shadow: 0 0 0 2px var(--persona-tint, rgba(74, 103, 65, 0.3));
    }
    
    .subscription-badge:focus:not(:focus-visible) {
      box-shadow: none;
    }
    
    .subscription-badge__icon {
      width: 12px;
      height: 12px;
      color: var(--persona-primary, #4a6741);
    }
    
    .subscription-badge__icon svg {
      width: 100%;
      height: 100%;
    }
    
    .subscription-badge__text {
      white-space: nowrap;
    }
    
    /* Low usage state - gentle warning */
    .subscription-badge--low {
      background: var(--color-warning-tint, rgba(202, 138, 4, 0.1));
      border-color: var(--color-warning, #ca8a04);
      color: var(--color-warning-text, #854d0e);
    }
    
    .subscription-badge--low .subscription-badge__icon {
      color: var(--color-warning, #ca8a04);
    }
    
    /* Premium state */
    .subscription-badge--premium {
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      border-color: var(--persona-primary, #4a6741);
      color: var(--persona-primary, #4a6741);
    }
    
    /* Trial state - special "gift" styling */
    .subscription-badge--trial {
      background: linear-gradient(135deg, rgba(74, 103, 65, 0.1), rgba(106, 138, 97, 0.15));
      border-color: var(--persona-primary, #4a6741);
      color: var(--persona-primary, #4a6741);
    }
    
    .subscription-badge--trial .subscription-badge__icon {
      color: var(--persona-primary, #4a6741);
    }
    
    /* Trial urgent state - last 30 seconds */
    .subscription-badge--urgent {
      animation: pulse-gentle 1s ease-in-out infinite;
    }
    
    @keyframes pulse-gentle {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
    
    /* Dark theme - use data-theme attribute (not prefers-color-scheme) */
    [data-theme="midnight"] .subscription-badge {
      background: var(--color-background-secondary);
      border-color: var(--color-border-subtle);
      color: var(--color-text-secondary);
    }
    
    [data-theme="midnight"] .subscription-badge:hover {
      background: var(--color-background-tertiary);
    }
    
    [data-theme="midnight"] .subscription-badge--low {
      background: rgba(224, 184, 96, 0.15);
      color: var(--color-semantic-warning);
    }
    
    [data-theme="midnight"] .subscription-badge--premium {
      background: rgba(106, 138, 97, 0.2);
      border-color: rgba(106, 138, 97, 0.4);
      /* Use accent text for readability on dark background */
      color: var(--color-accent-text);
    }
    
    [data-theme="midnight"] .subscription-badge--premium .subscription-badge__icon {
      color: var(--color-accent-text);
    }
    
    [data-theme="midnight"] .subscription-badge--trial {
      background: linear-gradient(135deg, rgba(74, 103, 65, 0.15), rgba(106, 138, 97, 0.2));
      color: var(--color-accent-text);
    }
    
    [data-theme="midnight"] .subscription-badge--trial .subscription-badge__icon {
      color: var(--color-accent-text);
    }
    
    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .subscription-badge {
        transition: none;
        opacity: 1;
        transform: none;
      }
    }
    
    /* Mobile - slightly larger touch target */
    @media (max-width: clamp(538px, 90vw, 768px)) {
      .subscription-badge {
        padding: var(--space-2, 8px) var(--space-3, 12px);
        font-size: 0.8125rem;
      }
      
      .subscription-badge__icon {
        width: 14px;
        height: 14px;
      }
    }
  `;

  document.head.appendChild(styleElement);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const subscriptionBadgeUI = {
  init: initSubscriptionBadge,
  destroy: destroySubscriptionBadge,
  refresh: forceRefresh,
  startTrialTimer,
  stopTrialTimer,
};
