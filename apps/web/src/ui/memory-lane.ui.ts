/**
 * Memory Lane UI - Your Journey with Ferni
 *
 * A centered modal that surfaces meaningful moments from past conversations,
 * creating a sense of shared history between the user and Ferni.
 *
 * Features:
 * - Highlights tab: Top-scored memorable moments
 * - On This Day tab: Anniversary memories from previous years
 * - Timeline tab: Chronological view grouped by month
 * - Reaction buttons: Love or dismiss memories
 *
 * Design principles:
 * - Centered modal (per brand guidelines, not side drawer)
 * - Warm, nostalgic feel with emotional theming
 * - Deepens the relationship feeling
 *
 * @module ui/memory-lane
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { apiGet, apiPatch } from '../utils/api.js';
import { toast } from './toast.ui.js';
import { getAuthState } from '../services/firebase-auth.service.js';

const log = createLogger('MemoryLane');

// ============================================================================
// TYPES
// ============================================================================

type TabId = 'highlights' | 'on-this-day' | 'timeline';

interface Memory {
  id: string;
  content: string;
  title?: string;
  type: string;
  emotionalTone: string;
  occurredAt: string;
  personaId?: string;
  personaName?: string;
  topicTags: string[];
  yearAgo: number;
  score?: number;
  userReaction?: 'loved' | 'dismissed' | 'shared' | 'revisited';
}

interface HighlightsResponse {
  memories: Memory[];
  hasMore: boolean;
  nextCursor?: string;
}

interface OnThisDayResponse {
  memories: Memory[];
  today: { month: number; date: number; formatted: string };
  hasContent: boolean;
}

interface TimelineGroup {
  label: string;
  memories: Memory[];
  count: number;
}

interface TimelineResponse {
  groups: TimelineGroup[];
  totalMemories: number;
  hasMore: boolean;
}

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;
let styleElement: HTMLStyleElement | null = null;
let modalElement: HTMLElement | null = null;
let isModalOpen = false;
let currentTab: TabId = 'highlights';
let highlightsCache: Memory[] = [];
let onThisDayCache: Memory[] = [];
let timelineCache: TimelineGroup[] = [];
let hasCheckedToday = false;

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'ferni_memory_lane_last_check';

// Lucide-style SVG icons (consistent with brand)
const ICONS = {
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  heartFilled: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`,
};

// Emotion tone icons (text-based for simplicity)
const EMOTION_ICONS: Record<string, string> = {
  joyful: '✨',
  meaningful: '💫',
  proud: '🏆',
  tender: '💕',
  funny: '😊',
  bittersweet: '🌅',
  hopeful: '🌱',
  grateful: '🙏',
  growth: '🌱',
  milestone: '⭐',
};

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initMemoryLaneUI(): void {
  if (isInitialized) return;

  injectStyles();
  checkForTodayMemories();

  isInitialized = true;
  log.info('Memory Lane UI initialized');
}

// ============================================================================
// MEMORY CHECKING (for proactive notification)
// ============================================================================

async function checkForTodayMemories(): Promise<void> {
  if (hasCheckedToday) return;

  const lastCheck = getLastCheckDate();
  const today = new Date().toDateString();
  if (lastCheck === today) {
    hasCheckedToday = true;
    return;
  }

  hasCheckedToday = true;
  saveLastCheckDate(today);

  const authState = getAuthState();
  if (!authState.isAuthenticated) return;

  try {
    const response = await apiGet<OnThisDayResponse>('/api/memories/on-this-day');
    if (response.ok && response.data?.memories?.length) {
      onThisDayCache = response.data.memories;
      const firstMemory = onThisDayCache[0];
      if (firstMemory) {
        showAnniversaryNotification(firstMemory, onThisDayCache.length);
      }
    }
  } catch (err) {
    log.debug('Could not fetch on-this-day memories', { error: String(err) });
  }
}

/**
 * Show a beautiful anniversary notification that can be clicked to open Memory Lane
 */
function showAnniversaryNotification(memory: Memory, totalCount: number): void {
  // Don't show if Memory Lane is already open
  if (isModalOpen) return;

  // Create notification element
  const notification = document.createElement('div');
  notification.className = 'memory-lane-anniversary-notification';
  notification.setAttribute('role', 'button');
  notification.setAttribute('tabindex', '0');
  notification.setAttribute('aria-label', 'View memory from this day');

  const yearsText = memory.yearAgo === 1 ? 'year' : 'years';
  const moreText = totalCount > 1 ? ` and ${totalCount - 1} more` : '';

  // Truncate content for preview
  const previewContent = memory.content.length > 80
    ? memory.content.slice(0, 77) + '...'
    : memory.content;

  notification.innerHTML = `
    <div class="anniversary-notification-icon">
      ${ICONS.heart}
    </div>
    <div class="anniversary-notification-content">
      <div class="anniversary-notification-title">
        ${memory.yearAgo} ${yearsText} ago today${moreText}
      </div>
      <div class="anniversary-notification-preview">
        "${previewContent}"
      </div>
    </div>
    <div class="anniversary-notification-action">
      View →
    </div>
  `;

  // Click handler to open Memory Lane
  const handleClick = () => {
    notification.remove();
    currentTab = 'on-this-day';
    void openMemoryLane();
  };

  notification.addEventListener('click', handleClick);
  notification.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  });

  document.body.appendChild(notification);

  // Animate in
  requestAnimationFrame(() => {
    notification.classList.add('visible');
  });

  // Auto-dismiss after 8 seconds
  setTimeout(() => {
    notification.classList.remove('visible');
    setTimeout(() => notification.remove(), DURATION.SLOW);
  }, 8000);

  log.info({ yearAgo: memory.yearAgo, totalCount }, 'Showed anniversary notification');
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
    // Ignore
  }
}

// ============================================================================
// MODAL MANAGEMENT
// ============================================================================

export async function openMemoryLane(): Promise<void> {
  if (isModalOpen) return;

  isModalOpen = true;
  createModal();

  // Fetch data for current tab
  await loadTabData(currentTab);
  renderTabContent();

  // Animate open
  requestAnimationFrame(() => {
    modalElement?.classList.add('memory-lane-modal--open');
  });
}

export function closeMemoryLane(): void {
  if (!isModalOpen || !modalElement) return;

  isModalOpen = false;
  modalElement.classList.remove('memory-lane-modal--open');

  setTimeout(() => {
    modalElement?.remove();
    modalElement = null;
  }, DURATION.SLOW);
}

function createModal(): void {
  // Cleanup any existing modal
  document.querySelectorAll('.memory-lane-modal').forEach((el) => el.remove());

  modalElement = document.createElement('div');
  modalElement.className = 'memory-lane-modal';
  modalElement.setAttribute('role', 'dialog');
  modalElement.setAttribute('aria-label', 'Memory Lane');
  modalElement.setAttribute('aria-modal', 'true');

  // Backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'memory-lane-modal__backdrop';
  backdrop.addEventListener('click', closeMemoryLane);

  // Card
  const card = document.createElement('div');
  card.className = 'memory-lane-modal__card';

  // Header
  const header = document.createElement('header');
  header.className = 'memory-lane-modal__header';

  const headerText = document.createElement('div');
  const eyebrow = document.createElement('span');
  eyebrow.className = 'memory-lane-modal__eyebrow';
  eyebrow.textContent = 'YOUR JOURNEY';

  const title = document.createElement('h2');
  title.className = 'memory-lane-modal__title';
  title.textContent = 'Memory Lane';

  headerText.appendChild(eyebrow);
  headerText.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'memory-lane-modal__close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.innerHTML = ICONS.close;
  closeBtn.addEventListener('click', closeMemoryLane);

  header.appendChild(headerText);
  header.appendChild(closeBtn);

  // Tabs
  const tabs = createTabs();

  // Content area
  const content = document.createElement('div');
  content.className = 'memory-lane-modal__content';
  content.id = 'memory-lane-content';

  // Loading state
  const loading = document.createElement('div');
  loading.className = 'memory-lane-loading';
  loading.textContent = 'Loading memories...';
  content.appendChild(loading);

  card.appendChild(header);
  card.appendChild(tabs);
  card.appendChild(content);

  modalElement.appendChild(backdrop);
  modalElement.appendChild(card);

  document.body.appendChild(modalElement);

  // Close on Escape
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeMemoryLane();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

function createTabs(): HTMLElement {
  const tabsContainer = document.createElement('div');
  tabsContainer.className = 'memory-lane-modal__tabs';
  tabsContainer.setAttribute('role', 'tablist');

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'highlights', label: 'Highlights' },
    { id: 'on-this-day', label: 'On This Day' },
    { id: 'timeline', label: 'Timeline' },
  ];

  for (const tab of tabs) {
    const tabBtn = document.createElement('button');
    tabBtn.className = 'memory-lane-modal__tab';
    tabBtn.setAttribute('role', 'tab');
    tabBtn.setAttribute('aria-selected', tab.id === currentTab ? 'true' : 'false');
    tabBtn.setAttribute('data-tab', tab.id);
    tabBtn.textContent = tab.label;

    if (tab.id === currentTab) {
      tabBtn.classList.add('memory-lane-modal__tab--active');
    }

    tabBtn.addEventListener('click', () => switchTab(tab.id));
    tabsContainer.appendChild(tabBtn);
  }

  return tabsContainer;
}

async function switchTab(tabId: TabId): Promise<void> {
  if (tabId === currentTab) return;

  currentTab = tabId;

  // Update tab UI
  const tabs = modalElement?.querySelectorAll('.memory-lane-modal__tab');
  tabs?.forEach((tab) => {
    const isActive = tab.getAttribute('data-tab') === tabId;
    tab.classList.toggle('memory-lane-modal__tab--active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  // Load and render data
  const content = document.getElementById('memory-lane-content');
  if (content) {
    content.innerHTML = '<div class="memory-lane-loading">Loading...</div>';
  }

  await loadTabData(tabId);
  renderTabContent();
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadTabData(tabId: TabId): Promise<void> {
  const authState = getAuthState();
  if (!authState.isAuthenticated) return;

  try {
    switch (tabId) {
      case 'highlights':
        if (highlightsCache.length === 0) {
          const response = await apiGet<HighlightsResponse>('/api/memories/highlights');
          if (response.ok && response.data) {
            highlightsCache = response.data.memories ?? [];
          }
        }
        break;

      case 'on-this-day':
        if (onThisDayCache.length === 0) {
          const response = await apiGet<OnThisDayResponse>('/api/memories/on-this-day');
          if (response.ok && response.data) {
            onThisDayCache = response.data.memories ?? [];
          }
        }
        break;

      case 'timeline':
        if (timelineCache.length === 0) {
          const response = await apiGet<TimelineResponse>('/api/memories/timeline');
          if (response.ok && response.data) {
            timelineCache = response.data.groups ?? [];
          }
        }
        break;
    }
  } catch (err) {
    log.warn('Failed to load memory data', { error: String(err), tabId });
  }
}

// ============================================================================
// RENDERING
// ============================================================================

function renderTabContent(): void {
  const content = document.getElementById('memory-lane-content');
  if (!content) return;

  content.innerHTML = '';

  switch (currentTab) {
    case 'highlights':
      renderMemoryList(content, highlightsCache);
      break;

    case 'on-this-day':
      renderOnThisDay(content);
      break;

    case 'timeline':
      renderTimeline(content);
      break;
  }
}

function renderMemoryList(container: HTMLElement, memories: Memory[]): void {
  if (memories.length === 0) {
    renderEmptyState(container, 'highlights');
    return;
  }

  const list = document.createElement('div');
  list.className = 'memory-lane-list';

  for (const memory of memories) {
    const card = createMemoryCard(memory);
    list.appendChild(card);
  }

  container.appendChild(list);
}

function renderOnThisDay(container: HTMLElement): void {
  if (onThisDayCache.length === 0) {
    renderEmptyState(container, 'on-this-day');
    return;
  }

  // Date header
  const today = new Date();
  const dateHeader = document.createElement('div');
  dateHeader.className = 'memory-lane-date-header';
  dateHeader.textContent = today.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
  });
  container.appendChild(dateHeader);

  const list = document.createElement('div');
  list.className = 'memory-lane-list';

  for (const memory of onThisDayCache) {
    const card = createMemoryCard(memory, true);
    list.appendChild(card);
  }

  container.appendChild(list);
}

function renderTimeline(container: HTMLElement): void {
  if (timelineCache.length === 0) {
    renderEmptyState(container, 'timeline');
    return;
  }

  const timeline = document.createElement('div');
  timeline.className = 'memory-lane-timeline';

  for (const group of timelineCache) {
    const groupEl = document.createElement('div');
    groupEl.className = 'memory-lane-timeline__group';

    const groupHeader = document.createElement('div');
    groupHeader.className = 'memory-lane-timeline__header';
    groupHeader.textContent = group.label;
    groupEl.appendChild(groupHeader);

    for (const memory of group.memories) {
      const card = createMemoryCard(memory);
      groupEl.appendChild(card);
    }

    timeline.appendChild(groupEl);
  }

  container.appendChild(timeline);
}

function renderEmptyState(container: HTMLElement, tab: TabId): void {
  const empty = document.createElement('div');
  empty.className = 'memory-lane-empty';

  const text = document.createElement('p');
  text.className = 'memory-lane-empty__text';

  const subtext = document.createElement('p');
  subtext.className = 'memory-lane-empty__subtext';

  switch (tab) {
    case 'highlights':
      text.textContent = 'No highlights yet';
      subtext.textContent = 'Keep talking with Ferni to build your shared history';
      break;
    case 'on-this-day':
      text.textContent = 'No memories on this day';
      subtext.textContent = 'Check back on another date!';
      break;
    case 'timeline':
      text.textContent = 'Your timeline is empty';
      subtext.textContent = 'Memories will appear here as you chat with Ferni';
      break;
  }

  empty.appendChild(text);
  empty.appendChild(subtext);
  container.appendChild(empty);
}

function createMemoryCard(memory: Memory, showYearsAgo = false): HTMLElement {
  const card = document.createElement('div');
  card.className = `memory-lane-card memory-lane-card--${memory.emotionalTone}`;
  card.setAttribute('data-memory-id', memory.id);

  // Date badge
  const dateBadge = document.createElement('div');
  dateBadge.className = 'memory-lane-card__date';
  dateBadge.textContent = formatMemoryDate(memory.occurredAt, memory.yearAgo, showYearsAgo);
  card.appendChild(dateBadge);

  // Emotion icon
  const icon = document.createElement('span');
  icon.className = 'memory-lane-card__icon';
  icon.textContent = EMOTION_ICONS[memory.emotionalTone] ?? '💭';
  icon.setAttribute('aria-hidden', 'true');
  card.appendChild(icon);

  // Content
  const content = document.createElement('p');
  content.className = 'memory-lane-card__content';
  content.textContent = memory.content;
  card.appendChild(content);

  // Persona badge (if applicable)
  if (memory.personaName) {
    const persona = document.createElement('span');
    persona.className = 'memory-lane-card__persona';
    persona.textContent = `with ${memory.personaName}`;
    card.appendChild(persona);
  }

  // Reaction buttons
  const reactions = document.createElement('div');
  reactions.className = 'memory-lane-card__reactions';

  const loveBtn = document.createElement('button');
  loveBtn.className = 'memory-lane-card__reaction';
  if (memory.userReaction === 'loved') {
    loveBtn.classList.add('memory-lane-card__reaction--active');
  }
  loveBtn.innerHTML = memory.userReaction === 'loved' ? ICONS.heartFilled : ICONS.heart;
  loveBtn.setAttribute('aria-label', 'Love this memory');
  loveBtn.setAttribute('title', 'Love');
  loveBtn.addEventListener('click', () => handleReaction(memory.id, 'loved', loveBtn));

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'memory-lane-card__reaction memory-lane-card__reaction--dismiss';
  dismissBtn.innerHTML = ICONS.x;
  dismissBtn.setAttribute('aria-label', 'Dismiss this memory');
  dismissBtn.setAttribute('title', 'Not for me');
  dismissBtn.addEventListener('click', () => handleReaction(memory.id, 'dismissed', dismissBtn));

  reactions.appendChild(loveBtn);
  reactions.appendChild(dismissBtn);
  card.appendChild(reactions);

  return card;
}

function formatMemoryDate(isoDate: string, yearAgo: number, showYearsAgo: boolean): string {
  const date = new Date(isoDate);
  const month = date.toLocaleString('default', { month: 'short' });
  const day = date.getDate();

  if (showYearsAgo && yearAgo > 0) {
    const yearsText = yearAgo === 1 ? '1 year ago' : `${yearAgo} years ago`;
    return `${month} ${day}, ${yearsText}`;
  }

  if (yearAgo === 0) {
    return 'Earlier this year';
  }

  return `${month} ${day}, ${date.getFullYear()}`;
}

// ============================================================================
// REACTIONS
// ============================================================================

async function handleReaction(
  memoryId: string,
  reaction: 'loved' | 'dismissed',
  button: HTMLButtonElement
): Promise<void> {
  try {
    const response = await apiPatch(`/api/memories/${memoryId}/reaction`, { reaction });

    if (response.ok) {
      if (reaction === 'loved') {
        button.classList.add('memory-lane-card__reaction--active');
        button.innerHTML = ICONS.heartFilled;
        toast.success('Loved!');
      } else {
        // Remove the card with animation
        const card = button.closest('.memory-lane-card');
        if (card) {
          card.classList.add('memory-lane-card--dismissed');
          setTimeout(() => card.remove(), DURATION.SLOW);
        }
        toast.info('Got it');
      }

      // Update cache
      updateMemoryInCache(memoryId, reaction);
    }
  } catch (err) {
    log.warn('Failed to record reaction', { error: String(err), memoryId, reaction });
    toast.error("Couldn't save that");
  }
}

function updateMemoryInCache(memoryId: string, reaction: 'loved' | 'dismissed'): void {
  const updateMemory = (memories: Memory[]) => {
    const memory = memories.find((m) => m.id === memoryId);
    if (memory) {
      memory.userReaction = reaction;
    }
    if (reaction === 'dismissed') {
      return memories.filter((m) => m.id !== memoryId);
    }
    return memories;
  };

  highlightsCache = updateMemory(highlightsCache);
  onThisDayCache = updateMemory(onThisDayCache);
  for (const group of timelineCache) {
    group.memories = updateMemory(group.memories);
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
       MEMORY LANE MODAL
       Centered modal with tabs (brand compliant)
       ======================================== */

    .memory-lane-modal {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: var(--z-modal, 2100);
      opacity: 0;
      pointer-events: none;
      transition: opacity ${DURATION.NORMAL}ms ${EASING.EXPO_OUT};
    }

    .memory-lane-modal--open {
      opacity: 1;
      pointer-events: auto;
    }

    .memory-lane-modal__backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.4);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
    }

    .memory-lane-modal__card {
      position: relative;
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-2xl, 24px);
      box-shadow: var(--shadow-2xl, 0 25px 50px -12px rgba(0, 0, 0, 0.25));
      width: 90%;
      max-width: 520px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: scale(0.95);
      transition: transform ${DURATION.SLOW}ms ${EASING.SPRING};
    }

    .memory-lane-modal--open .memory-lane-modal__card {
      transform: scale(1);
    }

    /* Header */
    .memory-lane-modal__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      padding: var(--space-lg, 24px) var(--space-lg, 24px) var(--space-md, 16px);
    }

    .memory-lane-modal__eyebrow {
      display: block;
      font-size: var(--font-size-xs, 0.75rem);
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--color-accent, #3D5A45);
      margin-bottom: var(--space-xs, 4px);
    }

    .memory-lane-modal__title {
      font-family: var(--font-display, 'Plus Jakarta Sans', system-ui);
      font-size: var(--font-size-xl, 1.5rem);
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin: 0;
    }

    .memory-lane-modal__close {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: var(--radius-full, 999px);
      color: var(--color-text-secondary, #70605a);
      cursor: pointer;
      transition: background ${DURATION.FAST}ms, color ${DURATION.FAST}ms;
    }

    .memory-lane-modal__close:hover {
      background: var(--color-bg-subtle, rgba(0, 0, 0, 0.05));
      color: var(--color-text-primary, #2C2520);
    }

    .memory-lane-modal__close svg {
      width: 20px;
      height: 20px;
    }

    /* Tabs */
    .memory-lane-modal__tabs {
      display: flex;
      gap: var(--space-xs, 4px);
      padding: 0 var(--space-lg, 24px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08));
    }

    .memory-lane-modal__tab {
      padding: var(--space-sm, 12px) var(--space-md, 16px);
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      font-family: var(--font-body, 'Inter', system-ui);
      font-size: var(--font-size-sm, 0.875rem);
      font-weight: 500;
      color: var(--color-text-muted, #9a8a82);
      cursor: pointer;
      transition: color ${DURATION.FAST}ms, border-color ${DURATION.FAST}ms;
    }

    .memory-lane-modal__tab:hover {
      color: var(--color-text-secondary, #70605a);
    }

    .memory-lane-modal__tab--active {
      color: var(--color-accent, #3D5A45);
      border-bottom-color: var(--color-accent, #3D5A45);
    }

    /* Content */
    .memory-lane-modal__content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-md, 16px) var(--space-lg, 24px) var(--space-lg, 24px);
    }

    /* Loading */
    .memory-lane-loading {
      padding: var(--space-xl, 48px);
      text-align: center;
      color: var(--color-text-muted, #9a8a82);
      font-style: italic;
    }

    /* Empty state */
    .memory-lane-empty {
      padding: var(--space-xl, 48px) var(--space-lg, 24px);
      text-align: center;
    }

    .memory-lane-empty__text {
      font-size: var(--font-size-md, 1rem);
      color: var(--color-text-secondary, #70605a);
      margin: 0 0 var(--space-xs, 8px);
    }

    .memory-lane-empty__subtext {
      font-size: var(--font-size-sm, 0.875rem);
      color: var(--color-text-muted, #9a8a82);
      margin: 0;
    }

    /* Date header (On This Day) */
    .memory-lane-date-header {
      font-family: var(--font-display, 'Plus Jakarta Sans', system-ui);
      font-size: var(--font-size-lg, 1.125rem);
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      text-align: center;
      padding: var(--space-sm, 12px) 0 var(--space-md, 16px);
    }

    /* Memory list */
    .memory-lane-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm, 12px);
    }

    /* Timeline */
    .memory-lane-timeline {
      display: flex;
      flex-direction: column;
      gap: var(--space-lg, 24px);
    }

    .memory-lane-timeline__header {
      font-family: var(--font-display, 'Plus Jakarta Sans', system-ui);
      font-size: var(--font-size-sm, 0.875rem);
      font-weight: 600;
      color: var(--color-text-muted, #9a8a82);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: var(--space-sm, 12px);
    }

    .memory-lane-timeline__group {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm, 12px);
    }

    /* Memory Cards */
    .memory-lane-card {
      background: var(--color-bg-subtle, rgba(0, 0, 0, 0.02));
      border-radius: var(--radius-lg, 16px);
      padding: var(--space-md, 16px);
      position: relative;
      transition: transform ${DURATION.FAST}ms, opacity ${DURATION.SLOW}ms;
    }

    .memory-lane-card--dismissed {
      opacity: 0;
      transform: translateX(-20px);
    }

    .memory-lane-card__date {
      font-size: var(--font-size-xs, 0.75rem);
      color: var(--color-text-muted, #9a8a82);
      margin-bottom: var(--space-xs, 4px);
    }

    .memory-lane-card__icon {
      position: absolute;
      top: var(--space-md, 16px);
      right: var(--space-md, 16px);
      font-size: 1.25rem;
      opacity: 0.7;
    }

    .memory-lane-card__content {
      font-size: var(--font-size-sm, 0.875rem);
      color: var(--color-text-primary, #2C2520);
      line-height: 1.5;
      margin: 0;
      padding-right: var(--space-xl, 48px);
    }

    .memory-lane-card__persona {
      display: block;
      font-size: var(--font-size-xs, 0.75rem);
      color: var(--color-text-muted, #9a8a82);
      margin-top: var(--space-xs, 4px);
    }

    .memory-lane-card__reactions {
      display: flex;
      gap: var(--space-xs, 8px);
      margin-top: var(--space-sm, 12px);
    }

    .memory-lane-card__reaction {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.1));
      border-radius: var(--radius-full, 999px);
      color: var(--color-text-muted, #9a8a82);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .memory-lane-card__reaction:hover {
      background: var(--color-bg-hover, rgba(0, 0, 0, 0.05));
      color: var(--color-text-secondary, #70605a);
    }

    .memory-lane-card__reaction--active {
      background: var(--color-accent-subtle, rgba(61, 90, 69, 0.1));
      border-color: var(--color-accent, #3D5A45);
      color: var(--color-accent, #3D5A45);
    }

    .memory-lane-card__reaction--dismiss:hover {
      border-color: var(--color-semantic-error, #dc2626);
      color: var(--color-semantic-error, #dc2626);
    }

    .memory-lane-card__reaction svg {
      width: 16px;
      height: 16px;
    }

    /* Emotion-specific card tints */
    .memory-lane-card--joyful {
      background: rgba(255, 220, 100, 0.08);
    }

    .memory-lane-card--meaningful {
      background: rgba(100, 150, 200, 0.08);
    }

    .memory-lane-card--proud {
      background: rgba(255, 180, 100, 0.08);
    }

    .memory-lane-card--tender {
      background: rgba(255, 180, 200, 0.08);
    }

    .memory-lane-card--funny {
      background: rgba(255, 200, 180, 0.08);
    }

    .memory-lane-card--hopeful {
      background: rgba(100, 200, 150, 0.08);
    }

    .memory-lane-card--growth {
      background: rgba(100, 200, 150, 0.08);
    }

    .memory-lane-card--grateful {
      background: rgba(200, 180, 150, 0.08);
    }

    .memory-lane-card--milestone {
      background: rgba(255, 200, 100, 0.08);
    }

    .memory-lane-card--bittersweet {
      background: rgba(180, 150, 200, 0.08);
    }

    /* ========================================
       ANNIVERSARY NOTIFICATION
       Proactive surfacing of "On This Day" memories
       ======================================== */

    .memory-lane-anniversary-notification {
      position: fixed;
      bottom: calc(var(--safe-area-bottom, 0px) + 100px);
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-xl, 20px);
      box-shadow: var(--shadow-xl, 0 20px 40px -12px rgba(0, 0, 0, 0.2));
      display: flex;
      align-items: center;
      gap: var(--space-md, 16px);
      padding: var(--space-md, 16px) var(--space-lg, 20px);
      max-width: min(400px, 90vw);
      cursor: pointer;
      opacity: 0;
      z-index: var(--z-toast, 9000);
      transition: opacity ${DURATION.SLOW}ms ${EASING.EXPO_OUT},
                  transform ${DURATION.SLOW}ms ${EASING.SPRING};
    }

    .memory-lane-anniversary-notification.visible {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }

    .memory-lane-anniversary-notification:hover {
      transform: translateX(-50%) scale(1.02);
    }

    .memory-lane-anniversary-notification:active {
      transform: translateX(-50%) scale(0.98);
    }

    .anniversary-notification-icon {
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-accent-soft, rgba(61, 90, 69, 0.1));
      border-radius: var(--radius-full, 999px);
      color: var(--color-accent, #3D5A45);
    }

    .anniversary-notification-icon svg {
      width: 20px;
      height: 20px;
    }

    .anniversary-notification-content {
      flex: 1;
      min-width: 0;
    }

    .anniversary-notification-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', system-ui);
      font-size: var(--font-size-sm, 0.875rem);
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin-bottom: 2px;
    }

    .anniversary-notification-preview {
      font-family: var(--font-body, 'Inter', system-ui);
      font-size: var(--font-size-xs, 0.75rem);
      color: var(--color-text-muted, #9a8a82);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-style: italic;
    }

    .anniversary-notification-action {
      flex-shrink: 0;
      font-size: var(--font-size-sm, 0.875rem);
      font-weight: 500;
      color: var(--color-accent, #3D5A45);
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .memory-lane-modal,
      .memory-lane-modal__card,
      .memory-lane-card,
      .memory-lane-anniversary-notification {
        transition: opacity ${DURATION.FAST}ms;
      }

      .memory-lane-modal__card {
        transform: none !important;
      }

      .memory-lane-anniversary-notification {
        transform: translateX(-50%) !important;
      }
    }

    /* Mobile adjustments */
    @media (max-width: 480px) {
      .memory-lane-modal__card {
        width: 100%;
        max-width: none;
        max-height: 90vh;
        border-radius: var(--radius-xl, 20px) var(--radius-xl, 20px) 0 0;
        margin-top: auto;
      }

      .memory-lane-modal {
        align-items: flex-end;
      }
    }
  `;

  document.head.appendChild(styleElement);
}

// ============================================================================
// CLEANUP
// ============================================================================

export function disposeMemoryLaneUI(): void {
  closeMemoryLane();

  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }

  highlightsCache = [];
  onThisDayCache = [];
  timelineCache = [];
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
  open: openMemoryLane,
  close: closeMemoryLane,
};
