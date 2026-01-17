/**
 * Streak UI - Daily usage streak visualization
 *
 * Tracks consecutive daily visits and displays a flame icon with streak count.
 * Celebrates milestones (7, 14, 30, 60, 90, 100, 365 days).
 *
 * Design principles:
 * - Non-intrusive: small badge near avatar
 * - Motivating: flame animation pulses on milestone days
 * - Persistent: streak stored in localStorage
 * - Forgiving: 48-hour grace period (not strict 24h)
 *
 * Security note: All innerHTML contains only hardcoded content (no user input).
 *
 * @module ui/streak
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { moments } from './moments/index.js';

const log = createLogger('StreakUI');

// ============================================================================
// TYPES
// ============================================================================

interface StreakData {
  count: number;
  lastVisit: number; // timestamp
  longestStreak: number;
  milestonesCelebrated: number[]; // which milestones we've already celebrated
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'ferni_streak';
const DAY_MS = 24 * 60 * 60 * 1000;
const GRACE_PERIOD_MS = 48 * 60 * 60 * 1000; // 48 hours to maintain streak

// Milestone days that trigger celebration
const MILESTONES = [7, 14, 30, 60, 90, 100, 180, 365];

// Milestone messages (warm, human tone)
const MILESTONE_MESSAGES: Record<number, string> = {
  7: "A whole week together!",
  14: "Two weeks strong!",
  30: "One month! You're amazing.",
  60: "Two months of growth!",
  90: "90 days! Look how far you've come.",
  100: "100 days! This is huge.",
  180: "Half a year of conversations!",
  365: "One year! We've built something special.",
};

// ============================================================================
// STATE
// ============================================================================

let streakData: StreakData = {
  count: 0,
  lastVisit: 0,
  longestStreak: 0,
  milestonesCelebrated: [],
};

let container: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;
let isInitialized = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initStreakUI(): void {
  if (isInitialized) return;

  // Load existing streak data
  loadStreak();

  // Update streak for today's visit
  updateStreak();

  // Inject styles
  injectStyles();

  // Create the badge
  createStreakBadge();

  // Check for milestone celebration
  checkMilestone();

  isInitialized = true;
  log.info('Streak UI initialized', {
    count: streakData.count,
    longestStreak: streakData.longestStreak,
  });
}

// ============================================================================
// STREAK LOGIC
// ============================================================================

function loadStreak(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      streakData = JSON.parse(stored);
    }
  } catch (err) {
    log.warn('Failed to load streak', { error: String(err) });
    streakData = {
      count: 0,
      lastVisit: 0,
      longestStreak: 0,
      milestonesCelebrated: [],
    };
  }
}

function saveStreak(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(streakData));
  } catch (err) {
    log.warn('Failed to save streak', { error: String(err) });
  }
}

function updateStreak(): void {
  const now = Date.now();
  const timeSinceLastVisit = now - streakData.lastVisit;

  // First visit ever
  if (streakData.lastVisit === 0) {
    streakData.count = 1;
    streakData.lastVisit = now;
    streakData.longestStreak = 1;
    saveStreak();
    log.debug('First visit - streak started');
    return;
  }

  // Already visited today (same calendar day)
  if (isSameDay(streakData.lastVisit, now)) {
    log.debug('Already visited today', { count: streakData.count });
    return;
  }

  // Within grace period - streak continues
  if (timeSinceLastVisit <= GRACE_PERIOD_MS) {
    streakData.count += 1;
    streakData.lastVisit = now;
    if (streakData.count > streakData.longestStreak) {
      streakData.longestStreak = streakData.count;
    }
    saveStreak();
    log.debug('Streak continued', { count: streakData.count });
    return;
  }

  // Streak broken - start fresh
  log.info('Streak broken', {
    previousCount: streakData.count,
    daysSinceVisit: Math.floor(timeSinceLastVisit / DAY_MS),
  });
  streakData.count = 1;
  streakData.lastVisit = now;
  saveStreak();
}

function isSameDay(timestamp1: number, timestamp2: number): boolean {
  const d1 = new Date(timestamp1);
  const d2 = new Date(timestamp2);
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

// ============================================================================
// MILESTONE CELEBRATION
// ============================================================================

function checkMilestone(): void {
  const milestone = MILESTONES.find(
    (m) => streakData.count === m && !streakData.milestonesCelebrated.includes(m)
  );

  if (milestone) {
    // Mark as celebrated
    streakData.milestonesCelebrated.push(milestone);
    saveStreak();

    // Celebrate after a short delay (let UI render first)
    setTimeout(() => celebrateMilestone(milestone), 1000);
  }
}

function celebrateMilestone(days: number): void {
  const message = MILESTONE_MESSAGES[days] || `${days} days!`;

  // Show celebration
  moments.whisper(message, { type: 'success' });

  // Pulse the streak badge
  if (container) {
    container.classList.add('streak-badge--milestone');
    setTimeout(() => {
      container?.classList.remove('streak-badge--milestone');
    }, DURATION.SLOW * 3);
  }

  // Haptic feedback
  if ('vibrate' in navigator) {
    navigator.vibrate([50, 50, 50, 50, 100]);
  }

  log.info('Milestone celebrated', { days, message });
}

// ============================================================================
// UI CREATION
// ============================================================================

function createStreakBadge(): void {
  // Find the avatar container to position near
  const avatarContainer = document.querySelector('.avatar-container');
  if (!avatarContainer) {
    // Retry after a short delay
    setTimeout(() => {
      const retryAvatar = document.querySelector('.avatar-container');
      if (retryAvatar) {
        createBadgeElement(retryAvatar as HTMLElement);
      } else {
        log.warn('Avatar container not found for streak badge');
      }
    }, 1000);
    return;
  }

  createBadgeElement(avatarContainer as HTMLElement);
}

function createBadgeElement(avatarContainer: HTMLElement): void {
  // Don't show badge for streak of 0
  if (streakData.count < 1) return;

  container = document.createElement('div');
  container.className = 'streak-badge';
  container.setAttribute('role', 'status');
  container.setAttribute('aria-label', `${streakData.count} day streak`);
  container.title = `${streakData.count} day streak\nLongest: ${streakData.longestStreak} days`;

  // Create flame icon via DOM (safe approach)
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'streak-badge__flame');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute(
    'd',
    'M12 23c-3.866 0-7-3.134-7-7 0-2.31 1.065-4.385 2.742-5.742.33-.27.742-.41 1.158-.41.54 0 1.048.237 1.396.65.19.226.316.488.378.769.082.37.326.68.654.85.328.17.713.18 1.05.027a1.5 1.5 0 0 0 .728-.926c.19-.608.51-1.168.955-1.643C15.347 7.288 17 4.995 17 2c0-.414.168-.812.464-1.103S18.086.5 18.5.5c.828 0 1.5.672 1.5 1.5 0 3.584-1.342 6.852-3.565 9.344A6.97 6.97 0 0 1 19 16c0 3.866-3.134 7-7 7z'
  );

  svg.appendChild(path);

  // Create count text
  const countSpan = document.createElement('span');
  countSpan.className = 'streak-badge__count';
  countSpan.textContent = String(streakData.count);

  container.appendChild(svg);
  container.appendChild(countSpan);

  // Add click handler to show details
  container.addEventListener('click', showStreakDetails);

  // Position relative to avatar container
  avatarContainer.style.position = 'relative';
  avatarContainer.appendChild(container);

  // Animate in
  requestAnimationFrame(() => {
    container?.classList.add('streak-badge--visible');
  });
}

function showStreakDetails(): void {
  const daysText = streakData.count === 1 ? 'day' : 'days';
  const longestText =
    streakData.longestStreak > streakData.count
      ? ` (best: ${streakData.longestStreak})`
      : '';

  moments.whisper(`${streakData.count} ${daysText} in a row${longestText}`, { type: 'info' });
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;

  styleElement = document.createElement('style');
  styleElement.id = 'streak-ui-styles';
  styleElement.textContent = `
    /* ========================================
       STREAK BADGE
       Daily usage streak visualization
       ======================================== */

    .streak-badge {
      position: absolute;
      top: var(--space-xs, 4px);
      right: var(--space-xs, 4px);
      display: flex;
      align-items: center;
      gap: var(--space-2xs, 2px);
      padding: var(--space-2xs, 2px) var(--space-xs, 4px);
      background: var(--glass-background, rgba(255, 255, 255, 0.1));
      backdrop-filter: blur(var(--glass-blur-subtle, 8px));
      -webkit-backdrop-filter: blur(var(--glass-blur-subtle, 8px));
      border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.1));
      border-radius: var(--radius-full, 999px);
      color: var(--color-semantic-warning, #f59e0b);
      cursor: pointer;
      opacity: 0;
      transform: scale(0.8);
      transition:
        opacity ${DURATION.NORMAL}ms ${EASING.EXPO_OUT},
        transform ${DURATION.NORMAL}ms ${EASING.SPRING},
        background ${DURATION.FAST}ms;
      z-index: var(--z-floating, 20);
    }

    .streak-badge--visible {
      opacity: 1;
      transform: scale(1);
    }

    .streak-badge:hover {
      background: var(--color-bg-elevated, rgba(255, 255, 255, 0.15));
    }

    .streak-badge:focus-visible {
      outline: 2px solid var(--color-accent-primary, #4a6741);
      outline-offset: 2px;
    }

    .streak-badge__flame {
      animation: flameFlicker 2s ease-in-out infinite;
    }

    .streak-badge__count {
      font-family: var(--font-display, 'Plus Jakarta Sans', system-ui);
      font-size: var(--font-size-xs, 0.75rem);
      font-weight: 600;
      color: var(--color-text-primary, #ffffff);
    }

    /* Milestone celebration animation */
    .streak-badge--milestone {
      animation: milestonePulse ${DURATION.SLOW * 3}ms ${EASING.SPRING};
    }

    @keyframes milestonePulse {
      0%, 100% {
        transform: scale(1);
        filter: brightness(1);
      }
      20% {
        transform: scale(1.3);
        filter: brightness(1.5);
      }
      40% {
        transform: scale(1.1);
        filter: brightness(1.2);
      }
      60% {
        transform: scale(1.25);
        filter: brightness(1.4);
      }
      80% {
        transform: scale(1.05);
        filter: brightness(1.1);
      }
    }

    @keyframes flameFlicker {
      0%, 100% {
        transform: scaleY(1);
        opacity: 1;
      }
      25% {
        transform: scaleY(1.05);
        opacity: 0.9;
      }
      50% {
        transform: scaleY(0.95);
        opacity: 1;
      }
      75% {
        transform: scaleY(1.03);
        opacity: 0.95;
      }
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .streak-badge {
        transition: opacity ${DURATION.FAST}ms;
        transform: scale(1);
      }

      .streak-badge--visible {
        opacity: 1;
      }

      .streak-badge__flame {
        animation: none;
      }

      .streak-badge--milestone {
        animation: none;
      }
    }
  `;

  document.head.appendChild(styleElement);
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function getStreakCount(): number {
  return streakData.count;
}

export function getLongestStreak(): number {
  return streakData.longestStreak;
}

export function resetStreak(): void {
  streakData = {
    count: 0,
    lastVisit: 0,
    longestStreak: streakData.longestStreak, // Preserve longest
    milestonesCelebrated: [],
  };
  saveStreak();

  // Update UI
  if (container) {
    container.remove();
    container = null;
  }

  log.info('Streak reset');
}

// ============================================================================
// CLEANUP
// ============================================================================

export function disposeStreakUI(): void {
  if (container) {
    container.remove();
    container = null;
  }

  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }

  isInitialized = false;
  log.debug('Streak UI disposed');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const streakUI = {
  init: initStreakUI,
  dispose: disposeStreakUI,
  getCount: getStreakCount,
  getLongest: getLongestStreak,
  reset: resetStreak,
};
