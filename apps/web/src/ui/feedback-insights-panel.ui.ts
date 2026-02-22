/**
 * Feedback Insights Panel
 *
 * Surfaces feedback patterns back to users in a reflection-friendly way.
 * Shows insights like:
 * - "Maya's advice resonates 78% of the time"
 * - "Deep conversations after 8pm tend to land better"
 * - "You often skip feedback during career discussions"
 *
 * Design principles:
 * - Warm, human language (not metrics-heavy)
 * - Actionable insights, not just data
 * - Celebratory where appropriate
 * - Accessible via settings/profile area
 *
 * @module ui/feedback-insights-panel
 */

import { createLogger } from '../utils/logger.js';
import { getAuthToken } from '../services/firebase-auth.service.js';
import { DURATION, EASING } from '../config/animation-constants.js';

const log = createLogger('FeedbackInsightsPanel');

// ============================================================================
// TYPES
// ============================================================================

interface FeedbackInsights {
  userId: string;
  personaResonance: Record<string, number>;
  topicsWell: string[];
  topicsFlat: string[];
  preferredDepth: 'shallow' | 'medium' | 'deep';
  bestTimeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  skipPatterns: {
    highSkipTopics: string[];
    highSkipPersonas: string[];
  };
  generatedAt: Date;
}

interface FeedbackStats {
  totalPrompts: number;
  totalResponses: number;
  responseRate: number;
  reactionCounts: Record<string, number>;
  avgResponseTimeMs: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PERSONA_NAMES: Record<string, string> = {
  ferni: 'Ferni',
  maya: 'Maya',
  peter: 'Peter',
  alex: 'Alex',
  jordan: 'Jordan',
  nayan: 'Nayan',
};

const TIME_OF_DAY_NAMES: Record<string, string> = {
  morning: 'in the morning',
  afternoon: 'in the afternoon',
  evening: 'in the evening',
  night: 'late at night',
};

const DEPTH_DESCRIPTIONS: Record<string, string> = {
  shallow: 'light and supportive',
  medium: 'balanced depth',
  deep: 'thoughtful and deep',
};

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let isOpen = false;
let insights: FeedbackInsights | null = null;
let stats: FeedbackStats | null = null;
let loadError = false;
let currentUserId: string | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initFeedbackInsightsPanel(): void {
  // Cleanup orphaned elements (HMR)
  document.querySelectorAll('.feedback-insights-panel').forEach((el) => el.remove());
  document.querySelectorAll('.feedback-insights-overlay').forEach((el) => el.remove());

  injectStyles();
  log.info('Feedback Insights Panel initialized');
}

// ============================================================================
// CSS INJECTION
// ============================================================================

function injectStyles(): void {
  const styleId = 'feedback-insights-panel-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    /* ========================================
       FEEDBACK INSIGHTS PANEL
       ======================================== */

    .feedback-insights-overlay {
      position: fixed;
      inset: 0;
      background: var(--backdrop-heavy, rgba(44, 37, 32, 0.6));
      backdrop-filter: blur(var(--glass-blur-subtle, 8px));
      -webkit-backdrop-filter: blur(var(--glass-blur-subtle, 8px));
      z-index: var(--z-modal-backdrop, 90);
      opacity: 0;
      transition: opacity var(--duration-slow, 300ms) var(--ease-out-expo);
    }

    .feedback-insights-overlay--visible {
      opacity: 1;
    }

    .feedback-insights-panel {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) scale(0.95);
      width: min(90vw, 480px);
      max-height: 85vh;
      background: var(--color-background-elevated, #fffdfb);
      border-radius: var(--radius-2xl, 24px);
      box-shadow: var(--shadow-2xl, 0 25px 50px rgba(0, 0, 0, 0.15));
      z-index: var(--z-modal, 100);
      opacity: 0;
      overflow: hidden;
      transition:
        opacity var(--duration-slow, 300ms) var(--ease-out-expo),
        transform var(--duration-slow, 300ms) var(--ease-spring);
    }

    .feedback-insights-panel--visible {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }

    .feedback-insights-panel__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-4, 16px) var(--space-5, 20px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.1));
    }

    .feedback-insights-panel__title {
      display: flex;
      flex-direction: column;
      gap: var(--space-1, 4px);
    }

    .feedback-insights-panel__eyebrow {
      font-size: var(--font-size-xs, 0.75rem);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted, rgba(44, 37, 32, 0.5));
    }

    .feedback-insights-panel__heading {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--font-size-xl, 1.25rem);
      font-weight: 600;
      color: var(--color-text-primary, #2c2520);
      margin: 0;
    }

    .feedback-insights-panel__close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border: none;
      border-radius: var(--radius-full, 9999px);
      background: transparent;
      color: var(--color-text-muted, rgba(44, 37, 32, 0.5));
      cursor: pointer;
      transition: background var(--duration-fast, 150ms);
    }

    .feedback-insights-panel__close:hover {
      background: var(--color-bg-hover, rgba(44, 37, 32, 0.05));
    }

    .feedback-insights-panel__content {
      padding: var(--space-5, 20px);
      overflow-y: auto;
      max-height: calc(85vh - 80px);
    }

    .feedback-insights-panel__section {
      margin-bottom: var(--space-5, 20px);
    }

    .feedback-insights-panel__section:last-child {
      margin-bottom: 0;
    }

    .feedback-insights-panel__section-title {
      font-size: var(--font-size-sm, 0.875rem);
      font-weight: 600;
      color: var(--color-text-secondary, rgba(44, 37, 32, 0.7));
      margin: 0 0 var(--space-3, 12px) 0;
    }

    .feedback-insights-panel__insight {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3, 12px);
      padding: var(--space-3, 12px) var(--space-4, 16px);
      background: var(--color-bg-subtle, rgba(44, 37, 32, 0.03));
      border-radius: var(--radius-lg, 12px);
      margin-bottom: var(--space-2, 8px);
    }

    .feedback-insights-panel__insight:last-child {
      margin-bottom: 0;
    }

    .feedback-insights-panel__insight-icon {
      flex-shrink: 0;
      width: 24px;
      height: 24px;
      color: var(--persona-primary, #4a6741);
    }

    .feedback-insights-panel__insight-text {
      flex: 1;
      font-size: var(--font-size-base, 1rem);
      line-height: 1.5;
      color: var(--color-text-primary, #2c2520);
    }

    .feedback-insights-panel__insight-text strong {
      color: var(--persona-primary, #4a6741);
      font-weight: 600;
    }

    .feedback-insights-panel__empty {
      text-align: center;
      padding: var(--space-8, 32px) var(--space-5, 20px);
      color: var(--color-text-muted, rgba(44, 37, 32, 0.5));
    }

    .feedback-insights-panel__empty-icon {
      width: 48px;
      height: 48px;
      margin: 0 auto var(--space-4, 16px);
      opacity: 0.5;
    }

    .feedback-insights-panel__empty-text {
      font-size: var(--font-size-base, 1rem);
      line-height: 1.5;
    }

    .feedback-insights-panel__loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-8, 32px);
      color: var(--color-text-muted, rgba(44, 37, 32, 0.5));
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .feedback-insights-overlay,
      .feedback-insights-panel {
        transition: opacity var(--duration-fast, 150ms);
      }
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// DOM CREATION
// ============================================================================

function createPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'feedback-insights-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', 'feedback-insights-title');

  panel.innerHTML = `
    <header class="feedback-insights-panel__header">
      <div class="feedback-insights-panel__title">
        <span class="feedback-insights-panel__eyebrow">Conversation Insights</span>
        <h2 id="feedback-insights-title" class="feedback-insights-panel__heading">How we're connecting</h2>
      </div>
      <button class="feedback-insights-panel__close" aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </header>
    <div class="feedback-insights-panel__content">
      <div class="feedback-insights-panel__loading">Loading insights...</div>
    </div>
  `;

  // Close button handler
  panel.querySelector('.feedback-insights-panel__close')?.addEventListener('click', close);

  return panel;
}

function createOverlay(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'feedback-insights-overlay';
  overlay.addEventListener('click', close);
  return overlay;
}

// ============================================================================
// CONTENT RENDERING
// ============================================================================

function renderContent(): void {
  if (!container) return;

  const content = container.querySelector('.feedback-insights-panel__content');
  if (!content) return;

  if (loadError) {
    content.innerHTML = `
      <div class="feedback-insights-panel__error" style="text-align: center; padding: var(--space-8, 32px); color: var(--color-text-muted, rgba(44, 37, 32, 0.5));">
        Couldn't load data. <button type="button" style="color: var(--color-ferni); background: none; border: none; cursor: pointer; text-decoration: underline;">Try again?</button>
      </div>
    `;
    content.querySelector('button')?.addEventListener('click', () => {
      loadError = false;
      if (currentUserId) void fetchInsights(currentUserId);
    });
    return;
  }

  if (!insights && !stats) {
    content.innerHTML = `
      <div class="feedback-insights-panel__empty">
        <svg class="feedback-insights-panel__empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 20h9"/>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
        </svg>
        <p class="feedback-insights-panel__empty-text">
          Keep chatting! After a few conversations, I'll share insights about what's resonating.
        </p>
      </div>
    `;
    return;
  }

  const sections: string[] = [];

  // Resonance section
  if (insights?.personaResonance && Object.keys(insights.personaResonance).length > 0) {
    const resonanceInsights = Object.entries(insights.personaResonance)
      .filter(([, rate]) => rate > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([personaId, rate]) => {
        const name = PERSONA_NAMES[personaId] || personaId;
        const percentage = Math.round(rate * 100);
        return `<strong>${name}'s</strong> guidance resonates <strong>${percentage}%</strong> of the time`;
      });

    if (resonanceInsights.length > 0) {
      sections.push(`
        <div class="feedback-insights-panel__section">
          <h3 class="feedback-insights-panel__section-title">What's landing</h3>
          ${resonanceInsights.map((text) => createInsightCard('heart', text)).join('')}
        </div>
      `);
    }
  }

  // Topics section
  if (insights?.topicsWell && insights.topicsWell.length > 0) {
    const topicsText = insights.topicsWell.slice(0, 3).join(', ');
    sections.push(`
      <div class="feedback-insights-panel__section">
        <h3 class="feedback-insights-panel__section-title">Your sweet spots</h3>
        ${createInsightCard('lightbulb', `Conversations about <strong>${topicsText}</strong> tend to feel most helpful`)}
      </div>
    `);
  }

  // Depth preference
  if (insights?.preferredDepth) {
    const depthDesc = DEPTH_DESCRIPTIONS[insights.preferredDepth];
    sections.push(`
      <div class="feedback-insights-panel__section">
        <h3 class="feedback-insights-panel__section-title">Your style</h3>
        ${createInsightCard('compass', `You seem to prefer conversations that are <strong>${depthDesc}</strong>`)}
      </div>
    `);
  }

  // Time of day
  if (insights?.bestTimeOfDay) {
    const timeDesc = TIME_OF_DAY_NAMES[insights.bestTimeOfDay];
    sections.push(`
      <div class="feedback-insights-panel__section">
        <h3 class="feedback-insights-panel__section-title">Best times</h3>
        ${createInsightCard('clock', `Our conversations tend to land better <strong>${timeDesc}</strong>`)}
      </div>
    `);
  }

  // Skip patterns (framed positively)
  if (insights?.skipPatterns?.highSkipTopics && insights.skipPatterns.highSkipTopics.length > 0) {
    const skipTopics = insights.skipPatterns.highSkipTopics.slice(0, 2).join(' and ');
    sections.push(`
      <div class="feedback-insights-panel__section">
        <h3 class="feedback-insights-panel__section-title">Areas to explore</h3>
        ${createInsightCard('compass', `When we touch on <strong>${skipTopics}</strong>, it might help to take it slower`)}
      </div>
    `);
  }

  // Engagement stats
  if (stats && stats.totalPrompts > 0) {
    const engagementRate = Math.round(stats.responseRate * 100);
    sections.push(`
      <div class="feedback-insights-panel__section">
        <h3 class="feedback-insights-panel__section-title">Our connection</h3>
        ${createInsightCard('activity', `You've shared feedback <strong>${stats.totalResponses}</strong> times, engaging <strong>${engagementRate}%</strong> of the time`)}
      </div>
    `);
  }

  if (sections.length === 0) {
    content.innerHTML = `
      <div class="feedback-insights-panel__empty">
        <svg class="feedback-insights-panel__empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 20h9"/>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
        </svg>
        <p class="feedback-insights-panel__empty-text">
          Not enough data yet. Keep sharing feedback during our chats!
        </p>
      </div>
    `;
  } else {
    content.innerHTML = sections.join('');
  }
}

function createInsightCard(icon: string, text: string): string {
  const icons: Record<string, string> = {
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    lightbulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
    compass: '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  };

  return `
    <div class="feedback-insights-panel__insight">
      <svg class="feedback-insights-panel__insight-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        ${icons[icon] || icons.heart}
      </svg>
      <p class="feedback-insights-panel__insight-text">${text}</p>
    </div>
  `;
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchInsights(userId: string): Promise<void> {
  try {
    const token = await getAuthToken();
    if (!token) {
      log.warn('No auth token for insights fetch');
      return;
    }

    // Fetch both insights and stats in parallel
    const [insightsRes, statsRes] = await Promise.all([
      fetch(`/api/feedback/insights/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`/api/feedback/stats/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);

    if (insightsRes.ok) {
      const insightsData = await insightsRes.json();
      insights = insightsData.data;
    }

    if (statsRes.ok) {
      const statsData = await statsRes.json();
      stats = statsData.data;
    }

    renderContent();
  } catch (error) {
    log.warn({ error }, 'Failed to fetch insights');
    loadError = true;
    renderContent();
  }
}

// ============================================================================
// OPEN / CLOSE
// ============================================================================

/**
 * Open the feedback insights panel.
 */
export async function openFeedbackInsightsPanel(userId: string): Promise<void> {
  if (isOpen) return;

  log.info({ userId }, 'Opening feedback insights panel');
  currentUserId = userId;

  // Create elements
  const overlay = createOverlay();
  container = createPanel();

  document.body.appendChild(overlay);
  document.body.appendChild(container);

  // Trigger animation
  requestAnimationFrame(() => {
    overlay.classList.add('feedback-insights-overlay--visible');
    container?.classList.add('feedback-insights-panel--visible');
  });

  isOpen = true;

  // Fetch data
  await fetchInsights(userId);

  // Close on escape
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

/**
 * Close the feedback insights panel.
 */
export function close(): void {
  if (!isOpen) return;

  const overlay = document.querySelector('.feedback-insights-overlay');
  overlay?.classList.remove('feedback-insights-overlay--visible');
  container?.classList.remove('feedback-insights-panel--visible');

  setTimeout(() => {
    overlay?.remove();
    container?.remove();
    container = null;
    isOpen = false;
    insights = null;
    stats = null;
    currentUserId = null;
  }, DURATION.SLOW);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const feedbackInsightsPanel = {
  init: initFeedbackInsightsPanel,
  open: openFeedbackInsightsPanel,
  close,
};

export default feedbackInsightsPanel;
