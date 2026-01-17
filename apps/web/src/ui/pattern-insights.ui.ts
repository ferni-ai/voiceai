/**
 * Pattern Insights UI - Behavioral patterns visualization
 *
 * Shows insights about the user's patterns from conversations:
 * - Best time of day to chat
 * - Mood trends over time
 * - Conversation frequency
 * - Topic preferences
 *
 * Design principles:
 * - Informative but not intrusive
 * - Accessible from settings/profile area
 * - Warm, supportive framing (not data-driven/clinical)
 * - Celebrates positive patterns
 *
 * Security note: All insights come from backend API.
 *
 * @module ui/pattern-insights
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { apiGet } from '../utils/api.js';
import { getAuthState } from '../services/firebase-auth.service.js';

const log = createLogger('PatternInsights');

// ============================================================================
// TYPES
// ============================================================================

interface PatternInsight {
  id: string;
  type: 'timing' | 'mood' | 'frequency' | 'topic' | 'growth';
  title: string;
  description: string;
  icon: string;
  trend?: 'up' | 'down' | 'stable';
  value?: string;
}

interface PatternInsightsResponse {
  insights: PatternInsight[];
  lastUpdated: string;
}

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;
let styleElement: HTMLStyleElement | null = null;
let insightsCard: HTMLElement | null = null;
let insights: PatternInsight[] = [];
let isExpanded = false;

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'ferni_pattern_insights_cache';
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

// Icons for each insight type
const TYPE_ICONS: Record<string, string> = {
  timing: '🕐',
  mood: '🌈',
  frequency: '📊',
  topic: '💬',
  growth: '🌱',
};

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initPatternInsightsUI(): void {
  if (isInitialized) return;

  injectStyles();

  // Load cached insights initially
  loadCachedInsights();

  isInitialized = true;
  log.info('Pattern Insights UI initialized');
}

// ============================================================================
// CARD CREATION (called from settings or profile)
// ============================================================================

export async function showPatternInsightsCard(container: HTMLElement): Promise<void> {
  if (insightsCard) {
    insightsCard.remove();
  }

  // Fetch fresh insights
  await fetchInsights();

  // Create the card
  insightsCard = createInsightsCard();
  container.appendChild(insightsCard);

  // Animate in
  requestAnimationFrame(() => {
    insightsCard?.classList.add('pattern-insights-card--visible');
  });
}

export function hidePatternInsightsCard(): void {
  if (!insightsCard) return;

  insightsCard.classList.remove('pattern-insights-card--visible');

  setTimeout(() => {
    insightsCard?.remove();
    insightsCard = null;
  }, 300);
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchInsights(): Promise<void> {
  const authState = getAuthState();
  if (!authState.isAuthenticated) {
    insights = getDefaultInsights();
    return;
  }

  try {
    const response = await apiGet<PatternInsightsResponse>('/api/insights/patterns');
    if (response.ok && response.data?.insights) {
      insights = response.data.insights;
      cacheInsights(response.data);
    } else {
      insights = getDefaultInsights();
    }
  } catch (err) {
    log.debug('Could not fetch pattern insights', { error: String(err) });
    // Use cached or defaults
    if (insights.length === 0) {
      insights = getDefaultInsights();
    }
  }
}

function loadCachedInsights(): void {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      const data = JSON.parse(cached) as { insights: PatternInsight[]; timestamp: number };
      const age = Date.now() - data.timestamp;
      if (age < CACHE_DURATION_MS) {
        insights = data.insights;
      }
    }
  } catch {
    // Ignore cache errors
  }
}

function cacheInsights(data: PatternInsightsResponse): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        insights: data.insights,
        timestamp: Date.now(),
      })
    );
  } catch {
    // Ignore cache errors
  }
}

function getDefaultInsights(): PatternInsight[] {
  return [
    {
      id: 'welcome',
      type: 'growth',
      title: 'Getting to know you',
      description: 'Chat more to unlock personalized insights',
      icon: '✨',
    },
  ];
}

// ============================================================================
// CARD CREATION
// ============================================================================

function createInsightsCard(): HTMLElement {
  const card = document.createElement('div');
  card.className = 'pattern-insights-card';
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Pattern Insights');

  // Header
  const header = document.createElement('div');
  header.className = 'pattern-insights-card__header';

  const titleWrapper = document.createElement('div');

  const title = document.createElement('h3');
  title.className = 'pattern-insights-card__title';
  title.textContent = 'Your Patterns';

  const subtitle = document.createElement('p');
  subtitle.className = 'pattern-insights-card__subtitle';
  subtitle.textContent = 'Insights from our conversations';

  titleWrapper.appendChild(title);
  titleWrapper.appendChild(subtitle);

  // Toggle button
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'pattern-insights-card__toggle';
  toggleBtn.setAttribute('aria-expanded', String(isExpanded));
  toggleBtn.setAttribute('aria-label', isExpanded ? 'Collapse' : 'Expand');
  toggleBtn.textContent = isExpanded ? '−' : '+';
  toggleBtn.addEventListener('click', () => toggleExpand(toggleBtn));

  header.appendChild(titleWrapper);
  header.appendChild(toggleBtn);

  // Content
  const content = document.createElement('div');
  content.className = 'pattern-insights-card__content';
  content.id = 'pattern-insights-content';

  if (isExpanded) {
    content.classList.add('pattern-insights-card__content--expanded');
    renderInsights(content);
  }

  card.appendChild(header);
  card.appendChild(content);

  // Make header clickable
  header.style.cursor = 'pointer';
  header.addEventListener('click', () => toggleExpand(toggleBtn));

  return card;
}

function toggleExpand(toggleBtn: HTMLElement): void {
  isExpanded = !isExpanded;

  const content = document.getElementById('pattern-insights-content');
  if (!content) return;

  toggleBtn.setAttribute('aria-expanded', String(isExpanded));
  toggleBtn.setAttribute('aria-label', isExpanded ? 'Collapse' : 'Expand');
  toggleBtn.textContent = isExpanded ? '−' : '+';

  if (isExpanded) {
    content.classList.add('pattern-insights-card__content--expanded');
    renderInsights(content);
  } else {
    content.classList.remove('pattern-insights-card__content--expanded');
    // Clear content after animation
    setTimeout(() => {
      if (!isExpanded && content) {
        content.textContent = '';
      }
    }, 300);
  }
}

function renderInsights(container: HTMLElement): void {
  container.textContent = '';

  if (insights.length === 0) {
    const emptyText = document.createElement('p');
    emptyText.className = 'pattern-insights-card__empty';
    emptyText.textContent = 'Keep chatting to build insights';
    container.appendChild(emptyText);
    return;
  }

  for (const insight of insights) {
    const item = createInsightItem(insight);
    container.appendChild(item);
  }
}

function createInsightItem(insight: PatternInsight): HTMLElement {
  const item = document.createElement('div');
  item.className = `pattern-insights-item pattern-insights-item--${insight.type}`;

  // Icon
  const icon = document.createElement('span');
  icon.className = 'pattern-insights-item__icon';
  icon.textContent = insight.icon || TYPE_ICONS[insight.type] || '💭';
  icon.setAttribute('aria-hidden', 'true');

  // Content wrapper
  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'pattern-insights-item__content';

  // Title with optional trend indicator
  const titleRow = document.createElement('div');
  titleRow.className = 'pattern-insights-item__title-row';

  const titleText = document.createElement('span');
  titleText.className = 'pattern-insights-item__title';
  titleText.textContent = insight.title;

  titleRow.appendChild(titleText);

  if (insight.trend) {
    const trendIndicator = document.createElement('span');
    trendIndicator.className = `pattern-insights-item__trend pattern-insights-item__trend--${insight.trend}`;
    trendIndicator.setAttribute('aria-label', `Trend: ${insight.trend}`);
    trendIndicator.textContent = insight.trend === 'up' ? '↑' : insight.trend === 'down' ? '↓' : '→';
    titleRow.appendChild(trendIndicator);
  }

  // Description
  const description = document.createElement('p');
  description.className = 'pattern-insights-item__description';
  description.textContent = insight.description;

  // Value if present
  if (insight.value) {
    const value = document.createElement('span');
    value.className = 'pattern-insights-item__value';
    value.textContent = insight.value;
    titleRow.appendChild(value);
  }

  contentWrapper.appendChild(titleRow);
  contentWrapper.appendChild(description);

  item.appendChild(icon);
  item.appendChild(contentWrapper);

  return item;
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;

  styleElement = document.createElement('style');
  styleElement.id = 'pattern-insights-styles';
  styleElement.textContent = `
    /* ========================================
       PATTERN INSIGHTS CARD
       Behavioral patterns visualization
       ======================================== */

    .pattern-insights-card {
      background: var(--glass-background, rgba(255, 255, 255, 0.05));
      backdrop-filter: blur(var(--glass-blur-subtle, 8px));
      -webkit-backdrop-filter: blur(var(--glass-blur-subtle, 8px));
      border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.1));
      border-radius: var(--radius-lg, 16px);
      overflow: hidden;
      opacity: 0;
      transform: translateY(8px);
      transition:
        opacity ${DURATION.NORMAL}ms ${EASING.EXPO_OUT},
        transform ${DURATION.NORMAL}ms ${EASING.SPRING};
    }

    .pattern-insights-card--visible {
      opacity: 1;
      transform: translateY(0);
    }

    .pattern-insights-card__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-md, 16px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.05));
    }

    .pattern-insights-card__title {
      font-family: var(--font-display, 'Plus Jakarta Sans', system-ui);
      font-size: var(--font-size-md, 1rem);
      font-weight: 600;
      color: var(--color-text-primary, #ffffff);
      margin: 0;
    }

    .pattern-insights-card__subtitle {
      font-size: var(--font-size-xs, 0.75rem);
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      margin: var(--space-2xs, 2px) 0 0;
    }

    .pattern-insights-card__toggle {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-bg-elevated, rgba(255, 255, 255, 0.1));
      border: none;
      border-radius: var(--radius-full, 999px);
      color: var(--color-text-secondary, rgba(255, 255, 255, 0.7));
      font-size: 18px;
      font-weight: bold;
      cursor: pointer;
      transition: background ${DURATION.FAST}ms, color ${DURATION.FAST}ms;
    }

    .pattern-insights-card__toggle:hover {
      background: var(--color-bg-tertiary, rgba(255, 255, 255, 0.15));
      color: var(--color-text-primary, #ffffff);
    }

    .pattern-insights-card__toggle:focus-visible {
      outline: 2px solid var(--color-accent-primary, #4a6741);
      outline-offset: 2px;
    }

    .pattern-insights-card__content {
      max-height: 0;
      overflow: hidden;
      transition: max-height ${DURATION.SLOW}ms ${EASING.EXPO_OUT};
    }

    .pattern-insights-card__content--expanded {
      max-height: 400px;
      overflow-y: auto;
    }

    .pattern-insights-card__empty {
      padding: var(--space-lg, 26px);
      text-align: center;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      font-style: italic;
      margin: 0;
    }

    /* Insight Items */
    .pattern-insights-item {
      display: flex;
      gap: var(--space-sm, 8px);
      padding: var(--space-md, 16px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.05));
    }

    .pattern-insights-item:last-child {
      border-bottom: none;
    }

    .pattern-insights-item__icon {
      font-size: 1.25rem;
      line-height: 1;
      flex-shrink: 0;
    }

    .pattern-insights-item__content {
      flex: 1;
      min-width: 0;
    }

    .pattern-insights-item__title-row {
      display: flex;
      align-items: center;
      gap: var(--space-xs, 4px);
      flex-wrap: wrap;
    }

    .pattern-insights-item__title {
      font-size: var(--font-size-sm, 0.875rem);
      font-weight: 500;
      color: var(--color-text-primary, #ffffff);
    }

    .pattern-insights-item__trend {
      font-size: var(--font-size-xs, 0.75rem);
      font-weight: 600;
    }

    .pattern-insights-item__trend--up {
      color: var(--color-semantic-success, #4a6741);
    }

    .pattern-insights-item__trend--down {
      color: var(--color-semantic-warning, #a6854a);
    }

    .pattern-insights-item__trend--stable {
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
    }

    .pattern-insights-item__value {
      font-size: var(--font-size-xs, 0.75rem);
      color: var(--color-accent-primary, #4a6741);
      font-weight: 500;
      margin-left: auto;
    }

    .pattern-insights-item__description {
      font-size: var(--font-size-xs, 0.75rem);
      color: var(--color-text-secondary, rgba(255, 255, 255, 0.7));
      line-height: 1.4;
      margin: var(--space-2xs, 2px) 0 0;
    }

    /* Type-specific backgrounds */
    .pattern-insights-item--timing {
      background: rgba(100, 180, 255, 0.03);
    }

    .pattern-insights-item--mood {
      background: rgba(255, 180, 200, 0.03);
    }

    .pattern-insights-item--frequency {
      background: rgba(180, 255, 200, 0.03);
    }

    .pattern-insights-item--topic {
      background: rgba(255, 220, 150, 0.03);
    }

    .pattern-insights-item--growth {
      background: rgba(150, 220, 180, 0.03);
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .pattern-insights-card,
      .pattern-insights-card__content {
        transition: opacity ${DURATION.FAST}ms;
        transform: none !important;
      }
    }
  `;

  document.head.appendChild(styleElement);
}

// ============================================================================
// CLEANUP
// ============================================================================

export function disposePatternInsightsUI(): void {
  hidePatternInsightsCard();

  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }

  insights = [];
  isExpanded = false;
  isInitialized = false;

  log.debug('Pattern Insights UI disposed');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const patternInsightsUI = {
  init: initPatternInsightsUI,
  dispose: disposePatternInsightsUI,
  show: showPatternInsightsCard,
  hide: hidePatternInsightsCard,
  getInsights: () => insights,
};
