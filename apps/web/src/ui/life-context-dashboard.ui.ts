/**
 * Life Context Dashboard UI
 *
 * Phase 6: Cross-Domain Life Context Synthesis visualization.
 * Shows domain stress levels, cross-domain patterns, and synthesis triggers.
 *
 * Design: Card-based layout with persona-colored indicators.
 */

import { t } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('LifeContextDashboard');

// ============================================================================
// TYPES
// ============================================================================

/** Domain stress indicator from backend */
export interface DomainStressIndicator {
  domain: 'sleep' | 'calendar' | 'finance' | 'goals' | 'relationships' | 'habits';
  stressLevel: number; // 0-1
  reason: string;
  sourcePersona: string;
}

/** Cross-domain pattern from backend */
export interface CrossDomainPattern {
  pattern: string;
  severity: 'low' | 'medium' | 'high';
  domains: string[];
  insight: string;
}

/** Synthesis trigger from backend */
export interface SynthesisTrigger {
  id: string;
  category: 'support' | 'celebration' | 'warning' | 'connection' | 'rest';
  priority: 'urgent' | 'high' | 'medium' | 'low';
  confidence: number;
  message: string;
  suggestedResponse: string;
  recommendedPersona?: string;
}

/** Life context snapshot from backend */
export interface LifeContextSnapshot {
  userId: string;
  timestamp: Date;
  stressIndicators: DomainStressIndicator[];
  patterns: CrossDomainPattern[];
  overallLoadScore: number; // 0-1
  wellbeingScore: number; // 0-1
  triggers?: SynthesisTrigger[];
}

export interface LifeContextDashboardState {
  data: LifeContextSnapshot | null;
  isLoading: boolean;
  error: string | null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Domain display configuration */
const DOMAIN_CONFIG: Record<
  string,
  { name: string; icon: string; color: string; persona: string }
> = {
  sleep: { name: 'Sleep', icon: 'moon', color: 'var(--color-maya)', persona: 'Maya' },
  calendar: {
    name: 'Schedule',
    icon: 'calendar',
    color: 'var(--color-alex)',
    persona: 'Alex',
  },
  finance: {
    name: 'Finances',
    icon: 'chart',
    color: 'var(--color-peter)',
    persona: 'Peter',
  },
  goals: { name: 'Goals', icon: 'target', color: 'var(--color-jordan)', persona: 'Jordan' },
  relationships: {
    name: 'Relationships',
    icon: 'heart',
    color: 'var(--color-nayan)',
    persona: 'Nayan',
  },
  habits: { name: 'Habits', icon: 'repeat', color: 'var(--color-maya)', persona: 'Maya' },
};

/** Trigger category display */
const TRIGGER_CATEGORY_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string }
> = {
  support: {
    label: 'Support',
    color: 'var(--color-ferni)',
    bgColor: 'var(--persona-tint, rgba(74, 103, 65, 0.1))',
  },
  celebration: {
    label: 'Celebrate',
    color: 'var(--color-jordan)',
    bgColor: 'var(--color-jordan-tint, rgba(203, 161, 53, 0.1))',
  },
  warning: {
    label: 'Attention',
    color: 'var(--color-maya)',
    bgColor: 'var(--color-maya-tint, rgba(166, 122, 106, 0.1))',
  },
  connection: {
    label: 'Connect',
    color: 'var(--color-nayan)',
    bgColor: 'var(--color-nayan-tint, rgba(90, 96, 106, 0.1))',
  },
  rest: {
    label: 'Rest',
    color: 'var(--color-alex)',
    bgColor: 'var(--color-alex-tint, rgba(58, 107, 115, 0.1))',
  },
};

// ============================================================================
// STYLES
// ============================================================================

const styles = `
  .life-context-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal-backdrop, 2000);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--duration-normal, 200ms) ease-out;
  }

  .life-context-modal-overlay.visible {
    opacity: 1;
    pointer-events: auto;
  }

  .life-context-modal-backdrop {
    position: absolute;
    inset: 0;
    background: var(--backdrop-page, rgba(44, 37, 32, 0.4));
    backdrop-filter: blur(var(--glass-blur-strong, 24px));
  }

  .life-context-modal {
    position: relative;
    width: 95%;
    max-width: clamp(476px, 90vw, 680px);
    max-height: 90vh;
    background: var(--color-background-elevated);
    border-radius: var(--radius-2xl, 24px);
    box-shadow: var(--shadow-2xl);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transform: scale(0.95);
    transition: transform var(--duration-slow, 300ms) var(--ease-spring);
  }

  .life-context-modal-overlay.visible .life-context-modal {
    transform: scale(1);
  }

  /* Header */
  .life-context-modal__header {
    padding: var(--space-6, 24px);
    border-bottom: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.1));
    flex-shrink: 0;
    text-align: center;
  }

  .life-context-modal__eyebrow {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-ferni);
    margin-bottom: var(--space-1, 4px);
  }

  .life-context-modal__title {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 24px;
    font-weight: 700;
    color: var(--color-text-primary);
    margin: 0;
  }

  .life-context-modal__subtitle {
    font-size: 14px;
    color: var(--color-text-secondary);
    margin-top: var(--space-1, 4px);
  }

  .life-context-modal__close {
    position: absolute;
    top: var(--space-4, 16px);
    right: var(--space-4, 16px);
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--color-background-secondary, rgba(112, 96, 90, 0.05));
    color: var(--color-text-secondary);
    border: none;
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
  }

  .life-context-modal__close:hover,
  .life-context-modal__close:focus-visible {
    background: var(--color-background-tertiary, rgba(112, 96, 90, 0.1));
    color: var(--color-text-primary);
  }

  .life-context-modal__close:focus-visible {
    outline: 2px solid var(--color-accent-primary, var(--color-ferni));
    outline-offset: 2px;
  }

  /* Content */
  .life-context-modal__content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-6, 24px);
  }

  /* Score Summary */
  .life-context-scores {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-4, 16px);
    margin-bottom: var(--space-8, 32px);
  }

  .life-context-score-card {
    text-align: center;
    padding: var(--space-5, 20px);
    background: var(--color-background-secondary, rgba(112, 96, 90, 0.03));
    border-radius: var(--radius-lg, 12px);
    border: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.1));
  }

  .life-context-score-card__value {
    font-size: 36px;
    font-weight: 700;
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    color: var(--color-text-primary);
  }

  .life-context-score-card__value--good {
    color: var(--color-ferni);
  }

  .life-context-score-card__value--warning {
    color: var(--color-jordan);
  }

  .life-context-score-card__value--concern {
    color: var(--color-maya);
  }

  .life-context-score-card__label {
    font-size: 13px;
    color: var(--color-text-secondary);
    margin-top: var(--space-1, 4px);
  }

  .life-context-score-card__bar {
    height: 6px;
    background: var(--color-border-subtle, rgba(112, 96, 90, 0.1));
    border-radius: var(--radius-full, 9999px);
    margin-top: var(--space-3, 12px);
    overflow: hidden;
  }

  .life-context-score-card__bar-fill {
    height: 100%;
    border-radius: var(--radius-full, 9999px);
    transition: width var(--duration-slow, 300ms) ease-out;
  }

  /* Section Title */
  .life-context-section-title {
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--color-text-muted);
    margin-bottom: var(--space-3, 12px);
  }

  /* Domain Cards */
  .life-context-domains {
    margin-bottom: var(--space-8, 32px);
  }

  .life-context-domain-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: var(--space-3, 12px);
  }

  .life-context-domain-card {
    padding: var(--space-4, 16px);
    background: var(--color-background-secondary, rgba(112, 96, 90, 0.03));
    border-radius: var(--radius-lg, 12px);
    border: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.1));
    transition: border-color var(--duration-fast, 100ms) ease;
  }

  .life-context-domain-card:hover {
    border-color: var(--persona-primary, var(--color-ferni));
  }

  .life-context-domain-card__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-2, 8px);
  }

  .life-context-domain-card__name {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .life-context-domain-card__icon {
    width: 16px;
    height: 16px;
  }

  .life-context-domain-card__icon svg {
    width: 100%;
    height: 100%;
  }

  .life-context-domain-card__level {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: var(--radius-full, 9999px);
    font-weight: 500;
  }

  .life-context-domain-card__level--low {
    background: var(--persona-tint, rgba(74, 103, 65, 0.1));
    color: var(--color-ferni);
  }

  .life-context-domain-card__level--medium {
    background: var(--color-jordan-tint, rgba(203, 161, 53, 0.1));
    color: var(--color-jordan);
  }

  .life-context-domain-card__level--high {
    background: var(--color-maya-tint, rgba(166, 122, 106, 0.15));
    color: var(--color-maya);
  }

  .life-context-domain-card__reason {
    font-size: 13px;
    color: var(--color-text-secondary);
    line-height: 1.4;
  }

  .life-context-domain-card__persona {
    font-size: 11px;
    color: var(--color-text-muted);
    margin-top: var(--space-2, 8px);
  }

  /* Patterns */
  .life-context-patterns {
    margin-bottom: var(--space-8, 32px);
  }

  .life-context-pattern {
    padding: var(--space-4, 16px);
    background: var(--gradient-prediction, linear-gradient(135deg, rgba(74, 103, 65, 0.03), rgba(58, 107, 115, 0.03)));
    border-radius: var(--radius-lg, 12px);
    border: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.1));
    margin-bottom: var(--space-3, 12px);
  }

  .life-context-pattern:last-child {
    margin-bottom: 0;
  }

  .life-context-pattern__header {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    margin-bottom: var(--space-2, 8px);
  }

  .life-context-pattern__name {
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .life-context-pattern__severity {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: var(--radius-full, 9999px);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .life-context-pattern__severity--low {
    background: var(--persona-tint, rgba(74, 103, 65, 0.1));
    color: var(--color-ferni);
  }

  .life-context-pattern__severity--medium {
    background: var(--color-jordan-tint, rgba(203, 161, 53, 0.1));
    color: var(--color-jordan);
  }

  .life-context-pattern__severity--high {
    background: var(--color-maya-tint, rgba(166, 122, 106, 0.15));
    color: var(--color-maya);
  }

  .life-context-pattern__insight {
    font-size: 14px;
    color: var(--color-text-secondary);
    line-height: 1.5;
  }

  .life-context-pattern__domains {
    display: flex;
    gap: var(--space-2, 8px);
    margin-top: var(--space-2, 8px);
    flex-wrap: wrap;
  }

  .life-context-pattern__domain-tag {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: var(--radius-full, 9999px);
    background: var(--color-background-tertiary, rgba(112, 96, 90, 0.08));
    color: var(--color-text-muted);
  }

  /* Triggers */
  .life-context-triggers {
    margin-bottom: var(--space-4, 16px);
  }

  .life-context-trigger {
    padding: var(--space-4, 16px);
    border-radius: var(--radius-lg, 12px);
    margin-bottom: var(--space-3, 12px);
    border-left: 4px solid;
  }

  .life-context-trigger:last-child {
    margin-bottom: 0;
  }

  .life-context-trigger__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-2, 8px);
  }

  .life-context-trigger__category {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: var(--radius-full, 9999px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .life-context-trigger__priority {
    font-size: 11px;
    color: var(--color-text-muted);
    font-weight: 500;
  }

  .life-context-trigger__message {
    font-size: 14px;
    color: var(--color-text-primary);
    font-weight: 500;
    margin-bottom: var(--space-2, 8px);
  }

  .life-context-trigger__response {
    font-size: 13px;
    color: var(--color-text-secondary);
    font-style: italic;
    line-height: 1.4;
  }

  .life-context-trigger__persona {
    font-size: 11px;
    color: var(--color-text-muted);
    margin-top: var(--space-2, 8px);
  }

  /* Empty State */
  .life-context-empty {
    text-align: center;
    padding: var(--space-12, 48px) var(--space-4, 16px);
  }

  .life-context-empty__icon {
    width: 48px;
    height: 48px;
    margin: 0 auto var(--space-3, 12px);
    opacity: 0.5;
    color: var(--color-text-muted);
  }

  .life-context-empty__icon svg {
    width: 100%;
    height: 100%;
  }

  .life-context-empty__title {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: var(--space-1, 4px);
  }

  .life-context-empty__message {
    font-size: 14px;
    color: var(--color-text-secondary);
  }

  /* Loading */
  .life-context-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-12, 48px);
  }

  .life-context-spinner {
    width: 40px;
    height: 40px;
    border: 4px solid var(--color-border-subtle, rgba(112, 96, 90, 0.1));
    border-top-color: var(--color-ferni);
    border-radius: 50%;
    animation: life-context-spin var(--duration-entrance, 1000ms) linear infinite;
  }

  @keyframes life-context-spin {
    to { transform: rotate(360deg); }
  }

  .life-context-loading__text {
    margin-top: var(--space-4, 16px);
    font-size: 14px;
    color: var(--color-text-secondary);
  }

  /* Footer */
  .life-context-modal__footer {
    padding: var(--space-4, 16px) var(--space-6, 24px);
    border-top: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.1));
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
  }

  .life-context-modal__footer-info {
    font-size: 12px;
    color: var(--color-text-muted);
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .life-context-modal-overlay,
    .life-context-modal,
    .life-context-domain-card,
    .life-context-score-card__bar-fill {
      transition: none;
    }
    .life-context-spinner {
      animation: none;
    }
  }

  /* Dark theme */
  [data-theme="midnight"] .life-context-modal {
    background: var(--color-background-elevated);
  }

  [data-theme="midnight"] .life-context-modal__header,
  [data-theme="midnight"] .life-context-modal__footer {
    border-color: var(--color-border-subtle, rgba(255, 255, 255, 0.1));
  }

  [data-theme="midnight"] .life-context-score-card,
  [data-theme="midnight"] .life-context-domain-card,
  [data-theme="midnight"] .life-context-pattern {
    background: var(--color-background-secondary);
    border-color: var(--color-border-subtle, rgba(255, 255, 255, 0.1));
  }

  [data-theme="midnight"] .life-context-modal__close {
    background: var(--color-background-tertiary);
    color: var(--color-text-secondary);
  }

  [data-theme="midnight"] .life-context-modal__close:hover,
  [data-theme="midnight"] .life-context-modal__close:focus-visible {
    background: var(--color-background-secondary);
    color: var(--color-text-primary);
  }

  [data-theme="midnight"] .life-context-spinner {
    border-color: var(--color-border-subtle, rgba(255, 255, 255, 0.1));
    border-top-color: var(--color-accent-secondary);
  }
`;

// ============================================================================
// SVG ICONS
// ============================================================================

const ICONS: Record<string, string> = {
  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`,
  chart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"></line><line x1="18" y1="20" x2="18" y2="4"></line><line x1="6" y1="20" x2="6" y2="16"></line></svg>`,
  target: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`,
  repeat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  layers: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>`,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getStressLevel(value: number): 'low' | 'medium' | 'high' {
  if (value >= 0.7) return 'high';
  if (value >= 0.4) return 'medium';
  return 'low';
}

function getScoreClass(value: number, inverse = false): string {
  // For wellbeing, higher is better; for load, lower is better
  const adjusted = inverse ? 1 - value : value;
  if (adjusted >= 0.6) return 'good';
  if (adjusted >= 0.35) return 'warning';
  return 'concern';
}

function formatPercentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatPatternName(pattern: string): string {
  // Convert snake_case to Title Case
  return pattern
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ============================================================================
// STATE
// ============================================================================

let modalElement: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;
let currentState: LifeContextDashboardState = {
  data: null,
  isLoading: false,
  error: null,
};

// ============================================================================
// RENDER FUNCTIONS
// ============================================================================

function renderScores(data: LifeContextSnapshot): string {
  const loadClass = getScoreClass(data.overallLoadScore, true); // Higher load = worse
  const wellbeingClass = getScoreClass(data.wellbeingScore); // Higher wellbeing = better

  return `
    <div class="life-context-scores">
      <div class="life-context-score-card">
        <div class="life-context-score-card__value life-context-score-card__value--${loadClass}">
          ${formatPercentage(data.overallLoadScore)}
        </div>
        <div class="life-context-score-card__label">${t('lifeContext.scores.load', "How Much You're Carrying")}</div>
        <div class="life-context-score-card__bar">
          <div class="life-context-score-card__bar-fill" style="width: ${data.overallLoadScore * 100}%; background: var(--color-${loadClass === 'good' ? 'ferni' : loadClass === 'warning' ? 'jordan' : 'maya'})"></div>
        </div>
      </div>
      <div class="life-context-score-card">
        <div class="life-context-score-card__value life-context-score-card__value--${wellbeingClass}">
          ${formatPercentage(data.wellbeingScore)}
        </div>
        <div class="life-context-score-card__label">${t('lifeContext.scores.wellbeing', "How You're Doing")}</div>
        <div class="life-context-score-card__bar">
          <div class="life-context-score-card__bar-fill" style="width: ${data.wellbeingScore * 100}%; background: var(--color-${wellbeingClass === 'good' ? 'ferni' : wellbeingClass === 'warning' ? 'jordan' : 'maya'})"></div>
        </div>
      </div>
    </div>
  `;
}

function renderDomainCard(indicator: DomainStressIndicator): string {
  const config = DOMAIN_CONFIG[indicator.domain] || {
    name: indicator.domain,
    icon: 'layers',
    color: 'var(--color-ferni)',
    persona: 'Ferni',
  };
  const level = getStressLevel(indicator.stressLevel);
  const levelLabel = t(`lifeContext.levels.${level}`, level === 'high' ? 'Needs attention' : level === 'medium' ? 'Worth watching' : 'Looking good');

  return `
    <div class="life-context-domain-card" style="--domain-color: ${config.color}">
      <div class="life-context-domain-card__header">
        <div class="life-context-domain-card__name">
          <span class="life-context-domain-card__icon" style="color: ${config.color}">
            ${ICONS[config.icon] || ICONS.layers}
          </span>
          ${config.name}
        </div>
        <span class="life-context-domain-card__level life-context-domain-card__level--${level}">
          ${levelLabel}
        </span>
      </div>
      <div class="life-context-domain-card__reason">${indicator.reason}</div>
      <div class="life-context-domain-card__persona">${t('lifeContext.noticedBy', 'noticed by {name}').replace('{name}', config.persona)}</div>
    </div>
  `;
}

function renderDomains(indicators: DomainStressIndicator[]): string {
  if (indicators.length === 0) {
    return `
      <div class="life-context-domains">
        <div class="life-context-section-title">${t('lifeContext.sections.areas', 'Areas of Your Life')}</div>
        <div class="life-context-empty">
          <div class="life-context-empty__message">${t('lifeContext.balanced', 'Everything seems balanced right now')}</div>
        </div>
      </div>
    `;
  }

  // Sort by stress level (highest first)
  const sorted = [...indicators].sort((a, b) => b.stressLevel - a.stressLevel);

  return `
    <div class="life-context-domains">
      <div class="life-context-section-title">${t('lifeContext.sections.areas', 'Areas of Your Life')}</div>
      <div class="life-context-domain-grid">
        ${sorted.map((i) => renderDomainCard(i)).join('')}
      </div>
    </div>
  `;
}

function renderPattern(pattern: CrossDomainPattern): string {
  // More human-friendly severity labels via i18n
  const severityLabel = t(`lifeContext.severity.${pattern.severity}`, pattern.severity);

  return `
    <div class="life-context-pattern">
      <div class="life-context-pattern__header">
        <span class="life-context-pattern__name">${formatPatternName(pattern.pattern)}</span>
        <span class="life-context-pattern__severity life-context-pattern__severity--${pattern.severity}">
          ${severityLabel}
        </span>
      </div>
      <div class="life-context-pattern__insight">${pattern.insight}</div>
      <div class="life-context-pattern__domains">
        ${pattern.domains.map((d) => `<span class="life-context-pattern__domain-tag">${DOMAIN_CONFIG[d]?.name || d}</span>`).join('')}
      </div>
    </div>
  `;
}

function renderPatterns(patterns: CrossDomainPattern[]): string {
  if (patterns.length === 0) {
    return '';
  }

  return `
    <div class="life-context-patterns">
      <div class="life-context-section-title">${t('lifeContext.sections.patterns', "Patterns I'm Noticing")}</div>
      ${patterns.map((p) => renderPattern(p)).join('')}
    </div>
  `;
}

function renderTrigger(trigger: SynthesisTrigger): string {
  const categoryConfig = TRIGGER_CATEGORY_CONFIG[trigger.category] || {
    label: trigger.category,
    color: 'var(--color-ferni)',
    bgColor: 'var(--persona-tint)',
  };

  // More human-friendly priority labels via i18n
  const priorityLabel = t(`lifeContext.priority.${trigger.priority}`, trigger.priority);

  return `
    <div class="life-context-trigger" role="button" tabindex="0" style="border-color: ${categoryConfig.color}; background: ${categoryConfig.bgColor}">
      <div class="life-context-trigger__header" role="button" tabindex="0">
        <span class="life-context-trigger__category" role="button" tabindex="0" style="background: ${categoryConfig.color}; color: white">
          ${categoryConfig.label}
        </span>
        <span class="life-context-trigger__priority" role="button" tabindex="0">${priorityLabel}</span>
      </div>
      <div class="life-context-trigger__message" role="button" tabindex="0">${trigger.message}</div>
      <div class="life-context-trigger__response" role="button" tabindex="0">"${trigger.suggestedResponse}"</div>
      ${trigger.recommendedPersona ? `<div class="life-context-trigger__persona" role="button" tabindex="0">${t('lifeContext.personaHint', '{name} might be good to talk to about this').replace('{name}', trigger.recommendedPersona)}</div>` : ''}
    </div>
  `;
}

function renderTriggers(triggers?: SynthesisTrigger[]): string {
  if (!triggers || triggers.length === 0) {
    return '';
  }

  // Sort by priority
  const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...triggers].sort(
    (a, b) => (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3)
  );

  return `
    <div class="life-context-triggers" role="button" tabindex="0">
      <div class="life-context-section-title">${t('lifeContext.sections.thoughts', "What's On My Mind")}</div>
      ${sorted.map((trig) => renderTrigger(trig)).join('')}
    </div>
  `;
}

function renderContent(): string {
  if (currentState.isLoading) {
    return `
      <div class="life-context-loading">
        <div class="life-context-spinner"></div>
        <div class="life-context-loading__text">${t('lifeContext.loading', 'Checking in on your world...')}</div>
      </div>
    `;
  }

  if (currentState.error) {
    return `
      <div class="life-context-empty">
        <div class="life-context-empty__icon">${ICONS.layers}</div>
        <div class="life-context-empty__title">${t('lifeContext.error.title', "Couldn't check in right now")}</div>
        <div class="life-context-empty__message">${currentState.error}</div>
      </div>
    `;
  }

  if (!currentState.data) {
    return `
      <div class="life-context-empty">
        <div class="life-context-empty__icon">${ICONS.layers}</div>
        <div class="life-context-empty__title">${t('lifeContext.empty.title', 'Still getting to know you')}</div>
        <div class="life-context-empty__message">${t('lifeContext.empty.message', "As we talk more, I'll start to notice patterns and share what I see across your life.")}</div>
      </div>
    `;
  }

  const data = currentState.data;

  return `
    ${renderScores(data)}
    ${renderDomains(data.stressIndicators)}
    ${renderPatterns(data.patterns)}
    ${renderTriggers(data.triggers)}
  `;
}

function renderModal(): string {
  const timestampText = currentState.data
    ? formatTimestamp(new Date(currentState.data.timestamp))
    : '';

  return `
    <div class="life-context-modal-backdrop"></div>
    <div class="life-context-modal" role="dialog" aria-modal="true" aria-labelledby="life-context-title">
      <div class="life-context-modal__header">
        <div class="life-context-modal__eyebrow">${t('lifeContext.eyebrow', 'WHAT I NOTICE').toUpperCase()}</div>
        <h2 id="life-context-title" class="life-context-modal__title">
          ${t('lifeContext.title', 'Your World')}
        </h2>
        <p class="life-context-modal__subtitle">
          ${t('lifeContext.subtitle', 'How things are looking across your life')}
        </p>
        <button class="life-context-modal__close" aria-label="${t('common.close', 'Close')}" data-action="close">
          ${ICONS.close}
        </button>
      </div>
      <div class="life-context-modal__content">
        ${renderContent()}
      </div>
      <div class="life-context-modal__footer">
        <span class="life-context-modal__footer-info">
          ${timestampText ? t('lifeContext.footer.updated', 'Updated {time}').replace('{time}', timestampText) : t('lifeContext.footer.watching', 'Keeping an eye on things')}
        </span>
      </div>
    </div>
  `;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize the Life Context Dashboard.
 * Call this once on app startup.
 */
export function initLifeContextDashboard(): void {
  // Inject styles
  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.textContent = styles;
    document.head.appendChild(styleElement);
    log.debug('Life context dashboard styles injected');
  }
}

/**
 * Show the Life Context Dashboard modal.
 */
export function showLifeContextDashboard(data?: LifeContextSnapshot): void {
  if (data) {
    currentState = { data, isLoading: false, error: null };
  }

  if (!modalElement) {
    modalElement = document.createElement('div');
    modalElement.className = 'life-context-modal-overlay';
    modalElement.innerHTML = renderModal();
    document.body.appendChild(modalElement);

    // Event listeners
    modalElement.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (
        target.classList.contains('life-context-modal-backdrop') ||
        target.closest('[data-action="close"]')
      ) {
        hideLifeContextDashboard();
      }
    });

    // Keyboard
    modalElement.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        hideLifeContextDashboard();
      }
    });
  } else {
    modalElement.innerHTML = renderModal();
  }

  // Show with animation
  requestAnimationFrame(() => {
    modalElement?.classList.add('visible');
    // Focus the close button for accessibility
    const closeBtn = modalElement?.querySelector<HTMLButtonElement>('.life-context-modal__close');
    closeBtn?.focus();
  });

  log.debug('Life context dashboard shown');
}

/**
 * Hide the Life Context Dashboard modal.
 */
export function hideLifeContextDashboard(): void {
  if (modalElement) {
    modalElement.classList.remove('visible');
    setTimeout(() => {
      modalElement?.remove();
      modalElement = null;
    }, 300); // Match transition duration
  }
  log.debug('Life context dashboard hidden');
}

/**
 * Update the dashboard with new data.
 */
export function updateLifeContextDashboard(data: LifeContextSnapshot): void {
  currentState = { data, isLoading: false, error: null };
  if (modalElement) {
    const content = modalElement.querySelector('.life-context-modal__content');
    if (content) {
      content.innerHTML = renderContent();
    }
    const footer = modalElement.querySelector('.life-context-modal__footer-info');
    if (footer) {
      footer.textContent = `Updated ${formatTimestamp(new Date(data.timestamp))}`;
    }
  }
}

/**
 * Set loading state for the dashboard.
 */
export function setLifeContextLoading(isLoading: boolean): void {
  currentState = { ...currentState, isLoading, error: null };
  if (modalElement) {
    const content = modalElement.querySelector('.life-context-modal__content');
    if (content) {
      content.innerHTML = renderContent();
    }
  }
}

/**
 * Set error state for the dashboard.
 */
export function setLifeContextError(error: string): void {
  currentState = { ...currentState, isLoading: false, error };
  if (modalElement) {
    const content = modalElement.querySelector('.life-context-modal__content');
    if (content) {
      content.innerHTML = renderContent();
    }
  }
}

/**
 * Get current dashboard state.
 */
export function getLifeContextState(): LifeContextDashboardState {
  return { ...currentState };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  init: initLifeContextDashboard,
  show: showLifeContextDashboard,
  hide: hideLifeContextDashboard,
  update: updateLifeContextDashboard,
  setLoading: setLifeContextLoading,
  setError: setLifeContextError,
  getState: getLifeContextState,
};
