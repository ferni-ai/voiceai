/**
 * Ferni Knows UI
 *
 * Phase 18: Memory Experience Layer
 *
 * Summary panel showing what Ferni knows about the user.
 * "Better Than Human" transparency feature - users can see
 * what Ferni has learned and correct if needed.
 *
 * @module ui/memory/ferni-knows
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('FerniKnowsUI');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Knowledge category
 */
export type KnowledgeCategory =
  | 'about_you'       // Personal facts
  | 'relationships'   // People in your life
  | 'preferences'     // Likes, dislikes
  | 'goals'          // Goals and aspirations
  | 'commitments'     // Active commitments
  | 'milestones'      // Achievements
  | 'emotions';       // Emotional patterns

/**
 * Knowledge item
 */
export interface KnowledgeItem {
  /** Item ID */
  id: string;
  /** Category */
  category: KnowledgeCategory;
  /** What Ferni knows */
  content: string;
  /** Confidence (0-1) */
  confidence: number;
  /** Source ("You told me..." or "I noticed...") */
  source: 'explicit' | 'inferred';
  /** When learned */
  learnedAt: Date;
  /** Last confirmed/updated */
  updatedAt: Date;
  /** Related entity (person, topic) */
  relatedEntity?: string;
}

/**
 * Knowledge summary by category
 */
export interface KnowledgeSummary {
  /** Category */
  category: KnowledgeCategory;
  /** Category label */
  label: string;
  /** Icon */
  icon: string;
  /** Item count */
  count: number;
  /** Items in this category */
  items: KnowledgeItem[];
  /** Overall confidence for category */
  averageConfidence: number;
}

/**
 * Ferni Knows panel state
 */
export interface FerniKnowsState {
  /** Is panel open */
  isOpen: boolean;
  /** Selected category */
  selectedCategory?: KnowledgeCategory;
  /** Search query */
  searchQuery: string;
  /** Sort order */
  sortBy: 'recent' | 'confidence' | 'category';
  /** Show low confidence items */
  showLowConfidence: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CATEGORY_CONFIG: Record<KnowledgeCategory, { label: string; icon: string }> = {
  about_you: { label: 'About You', icon: '👤' },
  relationships: { label: 'People', icon: '👥' },
  preferences: { label: 'Preferences', icon: '❤️' },
  goals: { label: 'Goals', icon: '🎯' },
  commitments: { label: 'Commitments', icon: '✅' },
  milestones: { label: 'Milestones', icon: '🎉' },
  emotions: { label: 'Emotional Patterns', icon: '💭' },
};

// ============================================================================
// STATE
// ============================================================================

let panelState: FerniKnowsState = {
  isOpen: false,
  searchQuery: '',
  sortBy: 'recent',
  showLowConfidence: false,
};

let panelElement: HTMLElement | null = null;

/**
 * Get current panel state
 */
export function getFerniKnowsState(): FerniKnowsState {
  return { ...panelState };
}

/**
 * Update panel state
 */
export function updateFerniKnowsState(update: Partial<FerniKnowsState>): void {
  panelState = { ...panelState, ...update };
}

// ============================================================================
// PANEL RENDERING
// ============================================================================

/**
 * Initialize Ferni Knows panel
 */
export function initFerniKnowsPanel(): void {
  if (panelElement) return;

  // Create panel container
  panelElement = document.createElement('div');
  panelElement.id = 'ferni-knows-panel';
  panelElement.className = 'ferni-knows-panel';
  panelElement.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    width: 400px;
    height: 100vh;
    background: var(--color-background-elevated);
    box-shadow: var(--shadow-xl);
    transform: translateX(100%);
    transition: transform var(--duration-slow) var(--ease-spring);
    z-index: 1000;
    display: flex;
    flex-direction: column;
  `;

  document.body.appendChild(panelElement);

  log.debug('Ferni Knows panel initialized');
}

/**
 * Open Ferni Knows panel
 */
export function openFerniKnowsPanel(
  knowledge: KnowledgeItem[],
  onCorrection?: (itemId: string) => void
): void {
  if (!panelElement) {
    initFerniKnowsPanel();
  }

  if (!panelElement) return;

  panelState.isOpen = true;

  // Render content
  renderPanelContent(panelElement, knowledge, onCorrection);

  // Animate open
  requestAnimationFrame(() => {
    if (panelElement) {
      panelElement.style.transform = 'translateX(0)';
    }
  });

  log.debug({ itemCount: knowledge.length }, 'Ferni Knows panel opened');
}

/**
 * Close Ferni Knows panel
 */
export function closeFerniKnowsPanel(): void {
  if (!panelElement) return;

  panelState.isOpen = false;
  panelElement.style.transform = 'translateX(100%)';
}

/**
 * Render panel content
 */
function renderPanelContent(
  container: HTMLElement,
  knowledge: KnowledgeItem[],
  onCorrection?: (itemId: string) => void
): void {
  container.innerHTML = '';

  // Header
  const header = createPanelHeader();
  container.appendChild(header);

  // Group by category
  const summaries = groupByCategory(knowledge);

  // Category tabs
  const tabs = createCategoryTabs(summaries);
  container.appendChild(tabs);

  // Content area
  const content = document.createElement('div');
  content.className = 'ferni-knows-content';
  content.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4);
  `;

  // Render items
  const selectedSummary = panelState.selectedCategory
    ? summaries.find(s => s.category === panelState.selectedCategory)
    : summaries[0];

  if (selectedSummary) {
    renderCategoryItems(content, selectedSummary, onCorrection);
  }

  container.appendChild(content);
}

/**
 * Create panel header
 */
function createPanelHeader(): HTMLElement {
  const header = document.createElement('div');
  header.className = 'ferni-knows-header';
  header.style.cssText = `
    padding: var(--space-4);
    border-bottom: 1px solid var(--color-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;

  header.innerHTML = `
    <div>
      <h2 style="font-size: var(--font-size-lg); font-weight: 600; color: var(--color-text-primary); margin: 0;">
        What Ferni Knows
      </h2>
      <p style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin: var(--space-1) 0 0;">
        Everything I've learned about you
      </p>
    </div>
  `;

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '✕';
  closeBtn.style.cssText = `
    background: none;
    border: none;
    font-size: 1.2em;
    cursor: pointer;
    padding: var(--space-2);
    color: var(--color-text-secondary);
  `;
  closeBtn.addEventListener('click', closeFerniKnowsPanel);
  header.appendChild(closeBtn);

  return header;
}

/**
 * Group knowledge by category
 */
function groupByCategory(knowledge: KnowledgeItem[]): KnowledgeSummary[] {
  const groups: Record<KnowledgeCategory, KnowledgeItem[]> = {
    about_you: [],
    relationships: [],
    preferences: [],
    goals: [],
    commitments: [],
    milestones: [],
    emotions: [],
  };

  for (const item of knowledge) {
    groups[item.category].push(item);
  }

  return Object.entries(groups)
    .filter(([_, items]) => items.length > 0)
    .map(([category, items]) => {
      const config = CATEGORY_CONFIG[category as KnowledgeCategory];
      const avgConfidence = items.reduce((sum, i) => sum + i.confidence, 0) / items.length;

      return {
        category: category as KnowledgeCategory,
        label: config.label,
        icon: config.icon,
        count: items.length,
        items: items.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
        averageConfidence: avgConfidence,
      };
    });
}

/**
 * Create category tabs
 */
function createCategoryTabs(summaries: KnowledgeSummary[]): HTMLElement {
  const tabs = document.createElement('div');
  tabs.className = 'ferni-knows-tabs';
  tabs.style.cssText = `
    display: flex;
    gap: var(--space-2);
    padding: var(--space-3);
    border-bottom: 1px solid var(--color-border);
    overflow-x: auto;
  `;

  for (const summary of summaries) {
    const tab = document.createElement('button');
    const isSelected = panelState.selectedCategory === summary.category ||
      (!panelState.selectedCategory && summaries.indexOf(summary) === 0);

    tab.className = 'ferni-knows-tab';
    tab.style.cssText = `
      padding: var(--space-2) var(--space-3);
      border: none;
      border-radius: var(--radius-full);
      cursor: pointer;
      font-size: var(--font-size-sm);
      white-space: nowrap;
      background: ${isSelected ? 'var(--color-accent)' : 'var(--color-background-subtle)'};
      color: ${isSelected ? 'white' : 'var(--color-text-secondary)'};
      transition: all var(--duration-normal);
    `;
    tab.innerHTML = `${summary.icon} ${summary.label} (${summary.count})`;

    tab.addEventListener('click', () => {
      panelState.selectedCategory = summary.category;
      // Re-render tabs and content
      const panel = document.getElementById('ferni-knows-panel');
      if (panel) {
        const knowledge = summaries.flatMap(s => s.items);
        renderPanelContent(panel, knowledge);
      }
    });

    tabs.appendChild(tab);
  }

  return tabs;
}

/**
 * Render category items
 */
function renderCategoryItems(
  container: HTMLElement,
  summary: KnowledgeSummary,
  onCorrection?: (itemId: string) => void
): void {
  for (const item of summary.items) {
    const itemEl = createKnowledgeItem(item, onCorrection);
    container.appendChild(itemEl);
  }
}

/**
 * Create knowledge item element
 */
function createKnowledgeItem(
  item: KnowledgeItem,
  onCorrection?: (itemId: string) => void
): HTMLElement {
  const el = document.createElement('div');
  el.className = 'knowledge-item';
  el.style.cssText = `
    padding: var(--space-3);
    margin-bottom: var(--space-3);
    background: var(--color-background-subtle);
    border-radius: var(--radius-md);
    border-left: 3px solid ${item.confidence > 0.8 ? 'var(--color-success)' : item.confidence > 0.5 ? 'var(--color-warning)' : 'var(--color-muted)'};
  `;

  const sourceLabel = item.source === 'explicit' ? 'You told me' : 'I noticed';
  const timeAgo = getTimeAgo(item.learnedAt);

  el.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
      <div style="flex: 1;">
        <p style="color: var(--color-text-primary); margin: 0 0 var(--space-1);">
          ${item.content}
        </p>
        <p style="font-size: var(--font-size-sm); color: var(--color-text-muted); margin: 0;">
          ${sourceLabel} • ${timeAgo} • ${Math.round(item.confidence * 100)}% confident
        </p>
      </div>
    </div>
  `;

  // Add correction button
  if (onCorrection) {
    const correctBtn = document.createElement('button');
    correctBtn.innerHTML = 'Correct';
    correctBtn.style.cssText = `
      background: none;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      padding: var(--space-1) var(--space-2);
      font-size: var(--font-size-sm);
      cursor: pointer;
      color: var(--color-text-secondary);
      margin-top: var(--space-2);
    `;
    correctBtn.addEventListener('click', () => onCorrection(item.id));
    el.appendChild(correctBtn);
  }

  return el;
}

/**
 * Get human-readable time ago
 */
function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)} weeks ago`;
  return `${Math.floor(seconds / 2592000)} months ago`;
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Cleanup Ferni Knows UI
 */
export function cleanupFerniKnowsUI(): void {
  if (panelElement) {
    panelElement.remove();
    panelElement = null;
  }

  panelState = {
    isOpen: false,
    searchQuery: '',
    sortBy: 'recent',
    showLowConfidence: false,
  };
}
