/**
 * Growth Journal UI - Auto-generated reflections on your journey
 *
 * Unlike a traditional journal, Ferni writes these entries for you.
 * They surface patterns, celebrate wins, and provide gentle insights
 * about your growth that you might not notice yourself.
 *
 * Design principles:
 * - Written BY Ferni, not the user - observational, not demanding
 * - Celebrates progress - focuses on wins, not criticism
 * - Pattern recognition - surfaces themes the user might miss
 * - Gentle nudges - suggests next steps without pressure
 *
 * Security note: All event handlers are on trusted elements.
 *
 * @module ui/growth-journal
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { apiGet } from '../utils/api.js';
import { getAuthState } from '../services/firebase-auth.service.js';

const log = createLogger('GrowthJournal');

// ============================================================================
// TYPES
// ============================================================================

interface GrowthEntry {
  id: string;
  date: string;
  title: string;
  content: string;
  type: 'milestone' | 'pattern' | 'insight' | 'celebration' | 'nudge';
  tags: string[];
  personaId?: string;
}

interface GrowthJournalResponse {
  entries: GrowthEntry[];
  lastUpdated: string;
  streakDays: number;
}

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;
let styleElement: HTMLStyleElement | null = null;
let journalDrawer: HTMLElement | null = null;
let entries: GrowthEntry[] = [];
let isOpen = false;

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'ferni_growth_journal_cache';
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

const TYPE_ICONS: Record<string, string> = {
  milestone: '🏆',
  pattern: '🔄',
  insight: '💡',
  celebration: '🎉',
  nudge: '🌱',
};

const TYPE_COLORS: Record<string, string> = {
  milestone: 'rgba(255, 215, 0, 0.1)',    // Gold
  pattern: 'rgba(100, 180, 255, 0.1)',    // Blue
  insight: 'rgba(255, 180, 100, 0.1)',    // Orange
  celebration: 'rgba(255, 100, 180, 0.1)', // Pink
  nudge: 'rgba(100, 200, 150, 0.1)',      // Green
};

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initGrowthJournalUI(): void {
  if (isInitialized) return;

  injectStyles();

  // Load cached entries
  loadCachedEntries();

  isInitialized = true;
  log.info('Growth Journal UI initialized');
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchEntries(): Promise<void> {
  const authState = getAuthState();
  if (!authState.isAuthenticated) {
    entries = getDefaultEntries();
    return;
  }

  try {
    const response = await apiGet<GrowthJournalResponse>('/api/journal/growth');
    if (response.ok && response.data?.entries) {
      entries = response.data.entries;
      cacheEntries(entries);
    } else {
      entries = getDefaultEntries();
    }
  } catch (err) {
    log.debug('Could not fetch growth entries', { error: String(err) });
    if (entries.length === 0) {
      entries = getDefaultEntries();
    }
  }
}

function loadCachedEntries(): void {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      const data = JSON.parse(cached) as { entries: GrowthEntry[]; timestamp: number };
      const age = Date.now() - data.timestamp;
      if (age < CACHE_DURATION_MS) {
        entries = data.entries;
      }
    }
  } catch {
    // Ignore cache errors
  }
}

function cacheEntries(data: GrowthEntry[]): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        entries: data,
        timestamp: Date.now(),
      })
    );
  } catch {
    // Ignore cache errors
  }
}

function getDefaultEntries(): GrowthEntry[] {
  return [
    {
      id: 'welcome',
      date: new Date().toISOString(),
      title: 'Your journey begins',
      content:
        "I'm excited to get to know you. As we talk, I'll notice patterns and growth that you might not see yourself. This journal will fill with observations about your journey.",
      type: 'insight',
      tags: ['welcome'],
    },
  ];
}

// ============================================================================
// DRAWER
// ============================================================================

export async function openGrowthJournal(): Promise<void> {
  if (isOpen) return;

  // Fetch fresh entries
  await fetchEntries();

  createDrawer();
  isOpen = true;
}

export function closeGrowthJournal(): void {
  if (!isOpen || !journalDrawer) return;

  journalDrawer.classList.remove('growth-journal-drawer--open');

  setTimeout(() => {
    journalDrawer?.remove();
    journalDrawer = null;
    isOpen = false;
  }, 300);
}

function createDrawer(): void {
  if (journalDrawer) {
    journalDrawer.remove();
  }

  journalDrawer = document.createElement('div');
  journalDrawer.className = 'growth-journal-drawer';
  journalDrawer.setAttribute('role', 'dialog');
  journalDrawer.setAttribute('aria-modal', 'true');
  journalDrawer.setAttribute('aria-label', 'Growth Journal');

  // Header
  const header = document.createElement('div');
  header.className = 'growth-journal-header';

  const titleWrapper = document.createElement('div');

  const title = document.createElement('h2');
  title.className = 'growth-journal-title';
  title.textContent = 'Your Growth Journal';

  const subtitle = document.createElement('p');
  subtitle.className = 'growth-journal-subtitle';
  subtitle.textContent = 'Observations from our conversations';

  titleWrapper.appendChild(title);
  titleWrapper.appendChild(subtitle);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'growth-journal-close';
  closeBtn.setAttribute('aria-label', 'Close journal');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', closeGrowthJournal);

  header.appendChild(titleWrapper);
  header.appendChild(closeBtn);

  // Content
  const content = document.createElement('div');
  content.className = 'growth-journal-content';

  if (entries.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'growth-journal-empty';

    const emptyIcon = document.createElement('span');
    emptyIcon.textContent = '📓';
    emptyIcon.setAttribute('aria-hidden', 'true');

    const emptyText = document.createElement('p');
    emptyText.textContent = 'Keep chatting - entries will appear as I notice patterns';

    emptyState.appendChild(emptyIcon);
    emptyState.appendChild(emptyText);
    content.appendChild(emptyState);
  } else {
    for (const entry of entries) {
      const entryCard = createEntryCard(entry);
      content.appendChild(entryCard);
    }
  }

  journalDrawer.appendChild(header);
  journalDrawer.appendChild(content);
  document.body.appendChild(journalDrawer);

  // Animate in
  requestAnimationFrame(() => {
    journalDrawer?.classList.add('growth-journal-drawer--open');
  });

  // Escape key to close
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeGrowthJournal();
      document.removeEventListener('keydown', handleKeydown);
    }
  };
  document.addEventListener('keydown', handleKeydown);

  log.debug('Growth Journal opened', { entryCount: entries.length });
}

function createEntryCard(entry: GrowthEntry): HTMLElement {
  const card = document.createElement('div');
  card.className = `growth-journal-entry growth-journal-entry--${entry.type}`;
  card.style.setProperty('--entry-bg', TYPE_COLORS[entry.type] || 'transparent');

  // Date and type
  const meta = document.createElement('div');
  meta.className = 'growth-journal-entry-meta';

  const typeIcon = document.createElement('span');
  typeIcon.className = 'growth-journal-entry-icon';
  typeIcon.textContent = TYPE_ICONS[entry.type] || '📝';
  typeIcon.setAttribute('aria-hidden', 'true');

  const date = document.createElement('span');
  date.className = 'growth-journal-entry-date';
  date.textContent = formatDate(entry.date);

  meta.appendChild(typeIcon);
  meta.appendChild(date);

  // Title
  const titleEl = document.createElement('h3');
  titleEl.className = 'growth-journal-entry-title';
  titleEl.textContent = entry.title;

  // Content
  const contentEl = document.createElement('p');
  contentEl.className = 'growth-journal-entry-content';
  contentEl.textContent = entry.content;

  // Tags
  if (entry.tags && entry.tags.length > 0) {
    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'growth-journal-entry-tags';

    for (const tag of entry.tags) {
      const tagEl = document.createElement('span');
      tagEl.className = 'growth-journal-entry-tag';
      tagEl.textContent = tag;
      tagsContainer.appendChild(tagEl);
    }

    card.appendChild(tagsContainer);
  }

  card.appendChild(meta);
  card.appendChild(titleEl);
  card.appendChild(contentEl);

  return card;
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;

  styleElement = document.createElement('style');
  styleElement.id = 'growth-journal-styles';
  styleElement.textContent = `
    /* ========================================
       GROWTH JOURNAL
       Auto-generated reflections drawer
       ======================================== */

    .growth-journal-drawer {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      max-width: 400px;
      background: var(--color-bg-secondary, #1a1a2e);
      border-left: 1px solid var(--glass-border, rgba(255, 255, 255, 0.1));
      z-index: var(--z-modal, 2100);
      display: flex;
      flex-direction: column;
      transform: translateX(100%);
      transition: transform ${DURATION.SLOW}ms ${EASING.EXPO_OUT};
      box-shadow: -4px 0 20px rgba(0, 0, 0, 0.3);
    }

    .growth-journal-drawer--open {
      transform: translateX(0);
    }

    /* Header */
    .growth-journal-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      padding: var(--space-lg, 26px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.05));
      flex-shrink: 0;
    }

    .growth-journal-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', system-ui);
      font-size: var(--font-size-lg, 1.25rem);
      font-weight: 700;
      color: var(--color-text-primary, #ffffff);
      margin: 0;
    }

    .growth-journal-subtitle {
      font-size: var(--font-size-sm, 0.875rem);
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      margin: var(--space-2xs, 2px) 0 0;
    }

    .growth-journal-close {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: var(--radius-full, 999px);
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      font-size: 24px;
      cursor: pointer;
      flex-shrink: 0;
      transition: color ${DURATION.FAST}ms, background ${DURATION.FAST}ms;
    }

    .growth-journal-close:hover {
      color: var(--color-text-primary, #ffffff);
      background: var(--color-bg-elevated, rgba(255, 255, 255, 0.1));
    }

    .growth-journal-close:focus-visible {
      outline: 2px solid var(--color-accent-primary, #4a6741);
      outline-offset: 2px;
    }

    /* Content */
    .growth-journal-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-md, 16px);
      display: flex;
      flex-direction: column;
      gap: var(--space-md, 16px);
    }

    /* Empty state */
    .growth-journal-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: var(--space-xl, 42px);
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
    }

    .growth-journal-empty span {
      font-size: 2rem;
      margin-bottom: var(--space-sm, 8px);
    }

    /* Entry cards */
    .growth-journal-entry {
      background: var(--entry-bg, transparent);
      border: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.05));
      border-radius: var(--radius-lg, 16px);
      padding: var(--space-md, 16px);
      transition: transform ${DURATION.FAST}ms, box-shadow ${DURATION.FAST}ms;
    }

    .growth-journal-entry:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }

    .growth-journal-entry-meta {
      display: flex;
      align-items: center;
      gap: var(--space-xs, 4px);
      margin-bottom: var(--space-sm, 8px);
    }

    .growth-journal-entry-icon {
      font-size: 1rem;
    }

    .growth-journal-entry-date {
      font-size: var(--font-size-xs, 0.75rem);
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
    }

    .growth-journal-entry-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', system-ui);
      font-size: var(--font-size-md, 1rem);
      font-weight: 600;
      color: var(--color-text-primary, #ffffff);
      margin: 0 0 var(--space-xs, 4px);
    }

    .growth-journal-entry-content {
      font-size: var(--font-size-sm, 0.875rem);
      color: var(--color-text-secondary, rgba(255, 255, 255, 0.7));
      line-height: 1.5;
      margin: 0;
    }

    .growth-journal-entry-tags {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-xs, 4px);
      margin-top: var(--space-sm, 8px);
    }

    .growth-journal-entry-tag {
      padding: var(--space-2xs, 2px) var(--space-xs, 4px);
      background: var(--color-bg-elevated, rgba(255, 255, 255, 0.05));
      border-radius: var(--radius-sm, 4px);
      font-size: var(--font-size-xs, 0.75rem);
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
    }

    /* Mobile responsive */
    @media (max-width: 480px) {
      .growth-journal-drawer {
        max-width: 100%;
      }
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .growth-journal-drawer,
      .growth-journal-entry {
        transition: opacity ${DURATION.FAST}ms;
        transform: translateX(0);
      }

      .growth-journal-entry:hover {
        transform: none;
      }
    }
  `;

  document.head.appendChild(styleElement);
}

// ============================================================================
// CLEANUP
// ============================================================================

export function disposeGrowthJournalUI(): void {
  closeGrowthJournal();

  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }

  entries = [];
  isInitialized = false;

  log.debug('Growth Journal UI disposed');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const growthJournalUI = {
  init: initGrowthJournalUI,
  dispose: disposeGrowthJournalUI,
  open: openGrowthJournal,
  close: closeGrowthJournal,
};
