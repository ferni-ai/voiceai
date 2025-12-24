/**
 * Insights Hub
 *
 * Unified dashboard that consolidates all insight views into one tabbed interface.
 * Combines: Analytics, Predictions, Wellbeing, Team Insights, Life Context, What I've Learned
 *
 * Design: Centered floating modal with tabs
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { t } from '../i18n/index.js';

const log = createLogger('InsightsHub');

// ============================================================================
// TYPES
// ============================================================================

type InsightTab = 'journey' | 'analytics' | 'predictions' | 'wellbeing' | 'team' | 'context';

interface InsightsHubCallbacks {
  onClose?: () => void;
}

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  journey: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  analytics: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3v18h18"/><path d="M7 16c0-4 1-8 4-10s5 2 6 6c1 4 2 4 4 4"/></svg>',
  predictions: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  wellbeing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',
  context: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 12-8.58 3.91a2 2 0 0 1-1.66 0L2.18 12"/><path d="m22 17-8.58 3.91a2 2 0 0 1-1.66 0L2.18 17"/></svg>',
};

// ============================================================================
// INSIGHTS HUB UI CLASS
// ============================================================================

class InsightsHubUI {
  private container: HTMLElement | null = null;
  private callbacks: InsightsHubCallbacks = {};
  private activeTab: InsightTab = 'journey';
  private isVisible = false;

  constructor() {
    this.cleanupOrphanedElements();
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  show(callbacks?: InsightsHubCallbacks): void {
    if (this.isVisible) return;
    
    this.callbacks = callbacks || {};
    this.cleanupOrphanedElements();
    this.createModal();
    this.isVisible = true;
    
    log.debug('Insights Hub opened');
  }

  hide(): void {
    if (!this.isVisible || !this.container) return;
    
    this.container.classList.remove('visible');
    setTimeout(() => {
      this.container?.remove();
      this.container = null;
      this.isVisible = false;
    }, DURATION.SLOW);
    
    this.callbacks.onClose?.();
    log.debug('Insights Hub closed');
  }

  setTab(tab: InsightTab): void {
    this.activeTab = tab;
    this.renderTabContent();
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  private createModal(): void {
    const modal = document.createElement('div');
    modal.className = 'insights-hub-overlay';
    modal.innerHTML = `
      <div class="insights-hub-backdrop"></div>
      <div class="insights-hub-modal">
        <header class="insights-hub-header">
          <div class="insights-hub-header-content">
            <span class="insights-hub-eyebrow">UNDERSTANDING YOU</span>
            <h2>${t('menu.items.insights')}</h2>
          </div>
          <button class="insights-hub-close" aria-label="${t('common.close')}">${ICONS.close}</button>
        </header>
        
        <nav class="insights-hub-tabs" role="tablist">
          ${this.renderTabs()}
        </nav>
        
        <main class="insights-hub-content" id="insights-hub-content">
          ${this.renderTabContent()}
        </main>
      </div>
    `;

    document.body.appendChild(modal);
    this.container = modal;

    // Bind events
    this.bindEvents();

    // Animate in
    requestAnimationFrame(() => {
      modal.classList.add('visible');
    });
  }

  private renderTabs(): string {
    const tabs: { id: InsightTab; icon: string; label: string }[] = [
      { id: 'journey', icon: ICONS.journey, label: 'Journey' },
      { id: 'analytics', icon: ICONS.analytics, label: 'Progress' },
      { id: 'predictions', icon: ICONS.predictions, label: 'Predictions' },
      { id: 'wellbeing', icon: ICONS.wellbeing, label: 'Wellbeing' },
      { id: 'team', icon: ICONS.team, label: 'Team' },
      { id: 'context', icon: ICONS.context, label: 'World' },
    ];

    return tabs
      .map(
        (tab) => `
        <button 
          class="insights-hub-tab ${this.activeTab === tab.id ? 'active' : ''}"
          data-tab="${tab.id}"
          role="tab"
          aria-selected="${this.activeTab === tab.id}"
        >
          <span class="insights-hub-tab-icon">${tab.icon}</span>
          <span class="insights-hub-tab-label">${tab.label}</span>
        </button>
      `
      )
      .join('');
  }

  private renderTabContent(): string {
    // This returns placeholder content - in the full implementation,
    // each tab would load its respective component
    const contentMap: Record<InsightTab, { title: string; description: string }> = {
      journey: {
        title: t('menu.items.yourJourney'),
        description: 'Your growth story with Ferni. Milestones, breakthroughs, and how far you\'ve come.',
      },
      analytics: {
        title: t('menu.items.progressAnalytics'),
        description: 'See patterns in your conversations, topics you explore, and trends over time.',
      },
      predictions: {
        title: t('menu.items.predictionAccuracy'),
        description: 'How well we\'re getting to know you. Our predictions and their accuracy.',
      },
      wellbeing: {
        title: t('menu.items.wellbeingDashboard'),
        description: 'Your emotional patterns, energy levels, and overall wellbeing trends.',
      },
      team: {
        title: t('menu.items.teamInsights'),
        description: 'What the whole team notices about you. Cross-persona observations.',
      },
      context: {
        title: t('menu.items.lifeContext'),
        description: 'The full picture of your life. Work, relationships, health, and more.',
      },
    };

    const content = contentMap[this.activeTab];
    
    return `
      <div class="insights-hub-panel" data-panel="${this.activeTab}">
        <div class="insights-hub-panel-header">
          <h3>${content.title}</h3>
          <p>${content.description}</p>
        </div>
        <div class="insights-hub-panel-body">
          <div class="insights-hub-loading">
            <div class="insights-hub-loading-spinner"></div>
            <span>Loading insights...</span>
          </div>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    if (!this.container) return;

    // Close button
    this.container.querySelector('.insights-hub-close')?.addEventListener('click', () => {
      this.hide();
    });

    // Backdrop click
    this.container.querySelector('.insights-hub-backdrop')?.addEventListener('click', () => {
      this.hide();
    });

    // Tab clicks
    this.container.querySelectorAll('.insights-hub-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const tabId = (tab as HTMLElement).dataset.tab as InsightTab;
        this.setTabActive(tabId);
      });
    });

    // Escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.hide();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  }

  private setTabActive(tab: InsightTab): void {
    this.activeTab = tab;
    
    // Update tab buttons
    this.container?.querySelectorAll('.insights-hub-tab').forEach((el) => {
      const isActive = (el as HTMLElement).dataset.tab === tab;
      el.classList.toggle('active', isActive);
      el.setAttribute('aria-selected', String(isActive));
    });

    // Update content
    const contentEl = this.container?.querySelector('.insights-hub-content');
    if (contentEl) {
      contentEl.innerHTML = this.renderTabContent();
    }
  }

  private cleanupOrphanedElements(): void {
    document.querySelectorAll('.insights-hub-overlay').forEach((el) => el.remove());
  }
}

// ============================================================================
// STYLES
// ============================================================================

const styles = `
.insights-hub-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal, 2100);
  opacity: 0;
  visibility: hidden;
  transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD},
              visibility ${DURATION.SLOW}ms ${EASING.STANDARD};
}

.insights-hub-overlay.visible {
  opacity: 1;
  visibility: visible;
}

.insights-hub-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(44, 37, 32, 0.4);
  backdrop-filter: blur(20px);
}

.insights-hub-modal {
  position: relative;
  background: var(--color-background-elevated, #fffdfb);
  border-radius: var(--radius-2xl, 24px);
  box-shadow: var(--shadow-2xl);
  width: calc(100% - var(--space-8, 32px));
  max-width: 720px;
  max-height: calc(100vh - var(--space-16, 64px));
  display: flex;
  flex-direction: column;
  transform: scale(0.95);
  transition: transform ${DURATION.SLOW}ms ${EASING.SPRING};
  overflow: hidden;
}

.insights-hub-overlay.visible .insights-hub-modal {
  transform: scale(1);
}

/* Header */
.insights-hub-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: var(--space-6, 24px);
  border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
}

.insights-hub-eyebrow {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--color-accent, #3D5A45);
  text-transform: uppercase;
  margin-bottom: var(--space-1, 4px);
  display: block;
}

.insights-hub-header h2 {
  font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text-primary, #2C2520);
  margin: 0;
}

.insights-hub-close {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--radius-full, 9999px);
  color: var(--color-text-muted, #9a8f85);
  cursor: pointer;
  transition: background ${DURATION.FAST}ms, color ${DURATION.FAST}ms;
}

.insights-hub-close:hover {
  background: var(--color-background-subtle, rgba(44, 37, 32, 0.04));
  color: var(--color-text-primary, #2C2520);
}

.insights-hub-close svg {
  width: 20px;
  height: 20px;
}

/* Tabs */
.insights-hub-tabs {
  display: flex;
  gap: var(--space-1, 4px);
  padding: var(--space-3, 12px) var(--space-6, 24px);
  border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.insights-hub-tab {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  padding: var(--space-2, 8px) var(--space-3, 12px);
  background: transparent;
  border: none;
  border-radius: var(--radius-lg, 12px);
  color: var(--color-text-muted, #9a8f85);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background ${DURATION.FAST}ms, color ${DURATION.FAST}ms;
}

.insights-hub-tab:hover {
  background: var(--color-background-subtle, rgba(44, 37, 32, 0.04));
  color: var(--color-text-secondary, #5c544a);
}

.insights-hub-tab.active {
  background: var(--color-accent, #3D5A45);
  color: white;
}

.insights-hub-tab-icon svg {
  width: 18px;
  height: 18px;
}

/* Content */
.insights-hub-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-6, 24px);
}

.insights-hub-panel-header {
  margin-bottom: var(--space-6, 24px);
}

.insights-hub-panel-header h3 {
  font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text-primary, #2C2520);
  margin: 0 0 var(--space-2, 8px);
}

.insights-hub-panel-header p {
  font-size: 0.9rem;
  color: var(--color-text-muted, #9a8f85);
  margin: 0;
  line-height: 1.5;
}

.insights-hub-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-12, 48px);
  color: var(--color-text-muted, #9a8f85);
  gap: var(--space-3, 12px);
}

.insights-hub-loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--color-border-subtle, rgba(44, 37, 32, 0.1));
  border-top-color: var(--color-accent, #3D5A45);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Mobile adjustments */
@media (max-width: 640px) {
  .insights-hub-modal {
    max-height: calc(100vh - var(--space-8, 32px));
    border-radius: var(--radius-xl, 16px);
  }

  .insights-hub-tabs {
    padding: var(--space-2, 8px) var(--space-4, 16px);
  }

  .insights-hub-tab-label {
    display: none;
  }

  .insights-hub-tab {
    padding: var(--space-2, 8px);
  }
}

/* Dark theme */
[data-theme="midnight"] .insights-hub-backdrop {
  background: rgba(10, 10, 12, 0.7);
}

[data-theme="midnight"] .insights-hub-modal {
  background: var(--color-background-elevated, #1a1a1e);
}

[data-theme="midnight"] .insights-hub-header,
[data-theme="midnight"] .insights-hub-tabs {
  border-bottom-color: rgba(255, 255, 255, 0.06);
}
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
}

// ============================================================================
// EXPORTS
// ============================================================================

const insightsHubUI = new InsightsHubUI();

export function showInsightsHub(callbacks?: InsightsHubCallbacks): void {
  insightsHubUI.show(callbacks);
}

export function hideInsightsHub(): void {
  insightsHubUI.hide();
}

export { insightsHubUI };

