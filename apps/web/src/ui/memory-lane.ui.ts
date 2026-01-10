/**
 * Memory Lane UI - "On This Day" memories and highlights
 *
 * Surfaces meaningful moments from past conversations, creating
 * a sense of shared history between the user and Ferni.
 *
 * Design principles:
 * - Nostalgic but not intrusive
 * - "On this day" style anniversary moments
 * - Emotional highlights from conversations
 * - Deepens the relationship feeling
 *
 * Security note: Memory content comes from backend API only.
 * All DOM content is created via safe DOM methods, no innerHTML.
 *
 * @module ui/memory-lane
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { apiGet } from '../utils/api.js';
import { toast } from './toast.ui.js';
import { getAuthState } from '../services/firebase-auth.service.js';

const log = createLogger('MemoryLane');

// ============================================================================
// TYPES
// ============================================================================

interface Memory {
  id: string;
  date: string; // ISO date
  content: string;
  emotionalTone: 'joyful' | 'meaningful' | 'growth' | 'milestone' | 'funny';
  personaId?: string;
  yearAgo: number; // How many years ago
}

interface MemoryLaneResponse {
  memories: Memory[];
  hasMoreMemories: boolean;
}

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;
let styleElement: HTMLStyleElement | null = null;
let memoryLaneButton: HTMLElement | null = null;
let memoryLaneDrawer: HTMLElement | null = null;
let memories: Memory[] = [];
let isDrawerOpen = false;
let hasCheckedToday = false;

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'ferni_memory_lane_last_check';

// Emotion-specific icons (using text symbols for simplicity)
const EMOTION_ICONS: Record<string, string> = {
  joyful: '✨',
  meaningful: '💫',
  growth: '🌱',
  milestone: '⭐',
  funny: '😊',
};

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initMemoryLaneUI(): void {
  if (isInitialized) return;

  injectStyles();
  createMemoryLaneButton();

  // Check for "on this day" memories on load (once per day)
  checkForTodayMemories();

  isInitialized = true;
  log.info('Memory Lane UI initialized');
}

// ============================================================================
// BUTTON CREATION
// ============================================================================

function createMemoryLaneButton(): void {
  const avatarContainer = document.querySelector('.avatar-container');
  if (!avatarContainer) {
    // Retry after delay
    setTimeout(() => {
      const retryContainer = document.querySelector('.avatar-container');
      if (retryContainer) {
        createButtonElement(retryContainer as HTMLElement);
      }
    }, 1000);
    return;
  }

  createButtonElement(avatarContainer as HTMLElement);
}

function createButtonElement(container: HTMLElement): void {
  memoryLaneButton = document.createElement('button');
  memoryLaneButton.className = 'memory-lane-button';
  memoryLaneButton.setAttribute('aria-label', 'View memories');
  memoryLaneButton.setAttribute('title', 'Memory Lane');

  // Book/photo album icon via SVG (created with DOM)
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');

  // Book path
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute(
    'd',
    'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253'
  );
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');

  svg.appendChild(path);
  memoryLaneButton.appendChild(svg);

  memoryLaneButton.addEventListener('click', toggleMemoryLane);

  container.appendChild(memoryLaneButton);

  // Animate in
  requestAnimationFrame(() => {
    memoryLaneButton?.classList.add('memory-lane-button--visible');
  });
}

// ============================================================================
// MEMORY CHECKING
// ============================================================================

async function checkForTodayMemories(): Promise<void> {
  if (hasCheckedToday) return;

  // Check if we already checked today
  const lastCheck = getLastCheckDate();
  const today = new Date().toDateString();
  if (lastCheck === today) {
    hasCheckedToday = true;
    return;
  }

  hasCheckedToday = true;
  saveLastCheckDate(today);

  // Fetch "on this day" memories
  const authState = getAuthState();
  if (!authState.isAuthenticated) return;

  try {
    const response = await apiGet<MemoryLaneResponse>('/api/memories/on-this-day');
    if (response.ok && response.data?.memories?.length) {
      memories = response.data.memories;
      const firstMemory = memories[0];
      if (firstMemory) {
        showMemoryNotification(firstMemory);
      }
    }
  } catch (err) {
    log.debug('Could not fetch memories', { error: String(err) });
  }
}

function getLastCheckDate(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveLastCheckDate(date: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, date);
  } catch {
    // Ignore localStorage errors
  }
}

function showMemoryNotification(memory: Memory): void {
  // Add a subtle indicator to the button
  memoryLaneButton?.classList.add('memory-lane-button--has-memory');

  // Show a gentle toast
  const yearsText = memory.yearAgo === 1 ? 'year' : 'years';
  toast.info(`${memory.yearAgo} ${yearsText} ago today...`);
}

// ============================================================================
// DRAWER
// ============================================================================

function toggleMemoryLane(): void {
  if (isDrawerOpen) {
    closeDrawer();
  } else {
    openDrawer();
  }
}

async function openDrawer(): Promise<void> {
  if (isDrawerOpen) return;

  isDrawerOpen = true;
  createDrawer();

  // Fetch memories if we haven't already
  if (memories.length === 0) {
    await fetchMemories();
  }

  renderMemories();

  // Animate open
  requestAnimationFrame(() => {
    memoryLaneDrawer?.classList.add('memory-lane-drawer--open');
  });
}

function closeDrawer(): void {
  if (!isDrawerOpen || !memoryLaneDrawer) return;

  isDrawerOpen = false;
  memoryLaneDrawer.classList.remove('memory-lane-drawer--open');

  // Remove after animation
  setTimeout(() => {
    memoryLaneDrawer?.remove();
    memoryLaneDrawer = null;
  }, 300);
}

function createDrawer(): void {
  if (memoryLaneDrawer) return;

  memoryLaneDrawer = document.createElement('div');
  memoryLaneDrawer.className = 'memory-lane-drawer';
  memoryLaneDrawer.setAttribute('role', 'dialog');
  memoryLaneDrawer.setAttribute('aria-label', 'Memory Lane');

  // Header
  const header = document.createElement('div');
  header.className = 'memory-lane-drawer__header';

  const title = document.createElement('h2');
  title.className = 'memory-lane-drawer__title';
  title.textContent = 'Memory Lane';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'memory-lane-drawer__close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', closeDrawer);

  header.appendChild(title);
  header.appendChild(closeBtn);

  // Content
  const content = document.createElement('div');
  content.className = 'memory-lane-drawer__content';
  content.id = 'memory-lane-content';

  // Loading state (safe DOM creation)
  const loadingText = document.createElement('p');
  loadingText.className = 'memory-lane-loading';
  loadingText.textContent = 'Loading memories...';
  content.appendChild(loadingText);

  memoryLaneDrawer.appendChild(header);
  memoryLaneDrawer.appendChild(content);

  document.body.appendChild(memoryLaneDrawer);

  // Close on backdrop click
  memoryLaneDrawer.addEventListener('click', (e) => {
    if (e.target === memoryLaneDrawer) {
      closeDrawer();
    }
  });

  // Close on Escape
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeDrawer();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

async function fetchMemories(): Promise<void> {
  const authState = getAuthState();
  if (!authState.isAuthenticated) {
    memories = [];
    return;
  }

  try {
    const response = await apiGet<MemoryLaneResponse>('/api/memories/highlights');
    if (response.ok && response.data) {
      memories = response.data.memories ?? [];
    }
  } catch (err) {
    log.warn('Failed to fetch memories', { error: String(err) });
    memories = [];
  }
}

function renderMemories(): void {
  const content = document.getElementById('memory-lane-content');
  if (!content) return;

  // Clear existing content
  content.textContent = '';

  if (memories.length === 0) {
    // Empty state (safe DOM creation)
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'memory-lane-empty';

    const emptyText = document.createElement('p');
    emptyText.className = 'memory-lane-empty__text';
    emptyText.textContent = 'No memories yet';

    const emptySubtext = document.createElement('p');
    emptySubtext.className = 'memory-lane-empty__subtext';
    emptySubtext.textContent = 'Keep talking with Ferni to build your shared history';

    emptyDiv.appendChild(emptyText);
    emptyDiv.appendChild(emptySubtext);
    content.appendChild(emptyDiv);
    return;
  }

  // Render each memory
  for (const memory of memories) {
    const card = createMemoryCard(memory);
    content.appendChild(card);
  }
}

function createMemoryCard(memory: Memory): HTMLElement {
  const card = document.createElement('div');
  card.className = `memory-lane-card memory-lane-card--${memory.emotionalTone}`;

  // Date badge
  const dateBadge = document.createElement('div');
  dateBadge.className = 'memory-lane-card__date';
  dateBadge.textContent = formatMemoryDate(memory.date, memory.yearAgo);

  // Emotion icon
  const icon = document.createElement('span');
  icon.className = 'memory-lane-card__icon';
  icon.textContent = EMOTION_ICONS[memory.emotionalTone] ?? '💭';
  icon.setAttribute('aria-hidden', 'true');

  // Content
  const contentDiv = document.createElement('p');
  contentDiv.className = 'memory-lane-card__content';
  contentDiv.textContent = memory.content;

  card.appendChild(dateBadge);
  card.appendChild(icon);
  card.appendChild(contentDiv);

  return card;
}

function formatMemoryDate(isoDate: string, yearAgo: number): string {
  const date = new Date(isoDate);
  const month = date.toLocaleString('default', { month: 'short' });
  const day = date.getDate();

  if (yearAgo === 0) {
    return 'Earlier this year';
  } else if (yearAgo === 1) {
    return `${month} ${day}, 1 year ago`;
  } else {
    return `${month} ${day}, ${yearAgo} years ago`;
  }
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;

  styleElement = document.createElement('style');
  styleElement.id = 'memory-lane-styles';
  styleElement.textContent = `
    /* ========================================
       MEMORY LANE
       On This Day memories and highlights
       ======================================== */

    /* Memory Lane Button */
    .memory-lane-button {
      position: absolute;
      top: var(--space-xs, 4px);
      left: var(--space-xs, 4px);
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--glass-background, rgba(255, 255, 255, 0.1));
      backdrop-filter: blur(var(--glass-blur-subtle, 8px));
      -webkit-backdrop-filter: blur(var(--glass-blur-subtle, 8px));
      border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.1));
      border-radius: var(--radius-full, 999px);
      color: var(--color-text-secondary, rgba(255, 255, 255, 0.7));
      cursor: pointer;
      opacity: 0;
      transform: scale(0.8);
      transition:
        opacity ${DURATION.NORMAL}ms ${EASING.EXPO_OUT},
        transform ${DURATION.NORMAL}ms ${EASING.SPRING},
        background ${DURATION.FAST}ms,
        color ${DURATION.FAST}ms;
      z-index: var(--z-floating, 20);
    }

    .memory-lane-button--visible {
      opacity: 1;
      transform: scale(1);
    }

    .memory-lane-button:hover {
      background: var(--color-bg-elevated, rgba(255, 255, 255, 0.15));
      color: var(--color-text-primary, #ffffff);
    }

    .memory-lane-button:focus-visible {
      outline: 2px solid var(--color-accent-primary, #4a6741);
      outline-offset: 2px;
    }

    /* Has memory indicator */
    .memory-lane-button--has-memory::after {
      content: '';
      position: absolute;
      top: 2px;
      right: 2px;
      width: 8px;
      height: 8px;
      background: var(--color-semantic-warning, #f59e0b);
      border-radius: 50%;
      animation: memoryPulse 2s infinite;
    }

    @keyframes memoryPulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.2); opacity: 0.8; }
    }

    /* Memory Lane Drawer */
    .memory-lane-drawer {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      display: flex;
      align-items: flex-end;
      justify-content: center;
      z-index: var(--z-modal, 2100);
      opacity: 0;
      transition: opacity ${DURATION.NORMAL}ms;
    }

    .memory-lane-drawer--open {
      opacity: 1;
    }

    .memory-lane-drawer__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-md, 16px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.1));
    }

    .memory-lane-drawer__title {
      font-family: var(--font-display, 'Plus Jakarta Sans', system-ui);
      font-size: var(--font-size-lg, 1.125rem);
      font-weight: 600;
      color: var(--color-text-primary, #ffffff);
      margin: 0;
    }

    .memory-lane-drawer__close {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: var(--radius-full, 999px);
      color: var(--color-text-secondary, rgba(255, 255, 255, 0.7));
      font-size: 24px;
      cursor: pointer;
      transition: background ${DURATION.FAST}ms, color ${DURATION.FAST}ms;
    }

    .memory-lane-drawer__close:hover {
      background: var(--color-bg-elevated, rgba(255, 255, 255, 0.1));
      color: var(--color-text-primary, #ffffff);
    }

    .memory-lane-drawer__content {
      background: var(--color-bg-secondary, #1a1612);
      border-radius: var(--radius-xl, 24px) var(--radius-xl, 24px) 0 0;
      max-height: 60vh;
      width: 100%;
      max-width: 480px;
      overflow-y: auto;
      transform: translateY(100%);
      transition: transform ${DURATION.SLOW}ms ${EASING.EXPO_OUT};
    }

    .memory-lane-drawer--open .memory-lane-drawer__content {
      transform: translateY(0);
    }

    /* Loading state */
    .memory-lane-loading {
      padding: var(--space-xl, 42px);
      text-align: center;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      font-style: italic;
    }

    /* Empty state */
    .memory-lane-empty {
      padding: var(--space-xl, 42px);
      text-align: center;
    }

    .memory-lane-empty__text {
      color: var(--color-text-secondary, rgba(255, 255, 255, 0.7));
      font-size: var(--font-size-md, 1rem);
      margin: 0 0 var(--space-sm, 8px);
    }

    .memory-lane-empty__subtext {
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      font-size: var(--font-size-sm, 0.875rem);
      margin: 0;
    }

    /* Memory Cards */
    .memory-lane-card {
      padding: var(--space-md, 16px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.05));
      position: relative;
    }

    .memory-lane-card:last-child {
      border-bottom: none;
    }

    .memory-lane-card__date {
      font-size: var(--font-size-xs, 0.75rem);
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      margin-bottom: var(--space-xs, 4px);
    }

    .memory-lane-card__icon {
      position: absolute;
      top: var(--space-md, 16px);
      right: var(--space-md, 16px);
      font-size: 1.25rem;
      opacity: 0.8;
    }

    .memory-lane-card__content {
      font-size: var(--font-size-sm, 0.875rem);
      color: var(--color-text-primary, #ffffff);
      line-height: 1.5;
      margin: 0;
      padding-right: var(--space-xl, 42px);
    }

    /* Emotion-specific card tints */
    .memory-lane-card--joyful {
      background: rgba(255, 220, 100, 0.05);
    }

    .memory-lane-card--meaningful {
      background: rgba(180, 200, 255, 0.05);
    }

    .memory-lane-card--growth {
      background: rgba(100, 200, 150, 0.05);
    }

    .memory-lane-card--milestone {
      background: rgba(255, 200, 100, 0.05);
    }

    .memory-lane-card--funny {
      background: rgba(255, 180, 180, 0.05);
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .memory-lane-button,
      .memory-lane-drawer,
      .memory-lane-drawer__content {
        transition: opacity ${DURATION.FAST}ms;
        transform: none !important;
      }

      .memory-lane-button--has-memory::after {
        animation: none;
      }
    }

    /* Mobile adjustments */
    @media (max-width: 480px) {
      .memory-lane-drawer__content {
        max-height: 80vh;
        border-radius: var(--radius-lg, 16px) var(--radius-lg, 16px) 0 0;
      }
    }
  `;

  document.head.appendChild(styleElement);
}

// ============================================================================
// CLEANUP
// ============================================================================

export function disposeMemoryLaneUI(): void {
  if (memoryLaneButton) {
    memoryLaneButton.remove();
    memoryLaneButton = null;
  }

  closeDrawer();

  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }

  memories = [];
  isDrawerOpen = false;
  hasCheckedToday = false;
  isInitialized = false;

  log.debug('Memory Lane UI disposed');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const memoryLaneUI = {
  init: initMemoryLaneUI,
  dispose: disposeMemoryLaneUI,
  open: openDrawer,
  close: closeDrawer,
};
