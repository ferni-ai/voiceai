/**
 * Trust Journey UI - "Better Than Human" Relationship Visualization
 *
 * A beautiful, cinematic visualization of the user's relationship with Ferni.
 * Shows growth, boundaries respected, shared moments, wins celebrated, and proactive care.
 *
 * DESIGN PHILOSOPHY:
 * - Warm, intimate feel - like looking at a scrapbook with a close friend
 * - Focus on the positive - celebrating growth, not highlighting failures
 * - Privacy-first - boundaries shown as counts, not content
 * - Delightful animations - Pixar-inspired, meaningful motion
 *
 * BRAND COMPLIANCE:
 * - Centered floating modal with backdrop blur
 * - Lucide SVG icons only - no emoji
 * - Ferni's sage green palette
 * - Plus Jakarta Sans display, Inter body
 * - Scale/fade animation from center
 * - Warm, human copy
 *
 * @module TrustJourneyUI
 */

import { t } from '../../i18n/index.js';
import { createLogger } from '../../utils/logger.js';
import { trapFocus } from '../../utils/accessibility.js';
import { toast } from '../toast.ui.js';
import { ICONS } from './icons.js';
import { injectStyles, removeStyles } from './styles.js';
import {
  fetchJourneyData,
  exportTrustData,
  getUserId,
  isOnline,
  clearCache,
} from './data.js';
import {
  renderLoading,
  renderSkeleton,
  renderError,
  renderContent,
  renderOfflineBanner,
  TIMELINE_PAGE_SIZE,
} from './render.js';
import type { TrustJourneyState, TrustJourneyData } from './types.js';

const log = createLogger('TrustJourney');

// ============================================================================
// STATE
// ============================================================================

const state: TrustJourneyState = {
  isInitialized: false,
  journeyPanel: null,
  styleElement: null,
  cachedData: null,
  isLoading: false,
  error: null,
  timelineOffset: 0,
  timelineFilter: 'all',
  focusCleanup: null,
};

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initTrustJourneyUI(): void {
  if (state.isInitialized) return;

  // HMR protection - clean up any orphaned elements
  document.querySelectorAll('.trust-journey-panel').forEach((el) => el.remove());
  document.querySelectorAll('style[data-trust-journey-styles]').forEach((el) => el.remove());

  state.styleElement = injectStyles();
  createJourneyPanel();

  // Listen for online/offline events
  window.addEventListener('online', handleOnlineStatusChange);
  window.addEventListener('offline', handleOnlineStatusChange);

  state.isInitialized = true;
  log.debug('Trust Journey UI initialized');
}

// ============================================================================
// PANEL CREATION
// ============================================================================

function createJourneyPanel(): void {
  state.journeyPanel = document.createElement('div');
  state.journeyPanel.className = 'trust-journey-panel';
  state.journeyPanel.setAttribute('role', 'dialog');
  state.journeyPanel.setAttribute('aria-modal', 'true');
  state.journeyPanel.setAttribute('aria-labelledby', 'trust-journey-title');

  state.journeyPanel.innerHTML = `
    <div class="trust-journey-backdrop"></div>
    <div class="trust-journey-card">
      <header class="trust-journey-header">
        <div class="trust-journey-header-content">
          <div class="trust-journey-eyebrow">
            ${ICONS.heart}
            <span>${t('trustJourney.eyebrow')}</span>
          </div>
          <h2 class="trust-journey-title" id="trust-journey-title">${t('trustJourney.title')}</h2>
          <p class="trust-journey-subtitle">${t('trustJourney.subtitle')}</p>
        </div>
        <div class="trust-journey-actions" role="button" tabindex="0">
          <button aria-label="Refresh" class="trust-journey-action-btn" data-action="refresh" title="${t('accessibility.refreshData')}">
            ${ICONS.refresh}
          </button>
          <button aria-label="Download" class="trust-journey-action-btn" data-action="export" title="${t('accessibility.exportData')}">
            ${ICONS.download}
          </button>
          <button aria-label="Close" class="trust-journey-action-btn" data-action="close" title="${t('common.close')}">
            ${ICONS.close}
          </button>
        </div>
      </header>
      <div class="trust-journey-content" aria-live="polite">
        ${renderSkeleton()}
      </div>
    </div>
  `;

  document.body.appendChild(state.journeyPanel);

  // Event handlers
  state.journeyPanel.querySelector('.trust-journey-backdrop')?.addEventListener('click', hideTrustJourney);

  state.journeyPanel.querySelectorAll('.trust-journey-action-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = (btn as HTMLElement).dataset.action;
      if (action === 'close') hideTrustJourney();
      else if (action === 'refresh') void refreshJourneyData();
      else if (action === 'export') void handleExport();
    });
  });

  // Escape key handler
  document.addEventListener('keydown', handleEscapeKey);
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function handleEscapeKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && state.journeyPanel?.classList.contains('visible')) {
    hideTrustJourney();
  }
}

function handleOnlineStatusChange(): void {
  if (state.journeyPanel?.classList.contains('visible')) {
    // Re-render with updated online status
    if (state.cachedData) {
      updateContent(state.cachedData);
    }
  }
}

function handleContentClick(e: Event): void {
  const target = e.target as HTMLElement;
  const actionEl = target.closest('[data-action]');
  const action = actionEl?.getAttribute('data-action');

  if (action === 'retry') {
    void refreshJourneyData();
  } else if (action === 'load-more') {
    loadMoreTimeline();
  } else if (action === 'filter') {
    const filter = actionEl?.dataset.filter as TrustJourneyState['timelineFilter'];
    if (filter) {
      setTimelineFilter(filter);
    }
  }
}

function setTimelineFilter(filter: TrustJourneyState['timelineFilter']): void {
  state.timelineFilter = filter;
  state.timelineOffset = 0; // Reset pagination when filter changes
  if (state.cachedData) {
    updateContent(state.cachedData);
  }
}

// ============================================================================
// DATA OPERATIONS
// ============================================================================

async function loadData(forceRefresh = false): Promise<void> {
  state.isLoading = true;
  state.error = null;

  const content = state.journeyPanel?.querySelector('.trust-journey-content');
  if (content) {
    content.innerHTML = renderSkeleton();
  }

  const { data, error, fromCache } = await fetchJourneyData(state, forceRefresh);

  state.isLoading = false;
  state.cachedData = data;

  if (error && !data) {
    state.error = error;
    renderErrorState(error);
    return;
  }

  if (data) {
    // Show offline banner if using cached data while offline
    if (fromCache && !isOnline()) {
      state.error = 'fetchFailedUsingCache';
    }
    updateContent(data);
  }
}

async function refreshJourneyData(): Promise<void> {
  const refreshBtn = state.journeyPanel?.querySelector('[data-action="refresh"]');
  if (refreshBtn) {
    refreshBtn.classList.add('loading');
  }

  state.timelineOffset = 0;
  state.timelineFilter = 'all';
  clearCache();

  await loadData(true);

  if (refreshBtn) {
    refreshBtn.classList.remove('loading');
  }
}

async function handleExport(): Promise<void> {
  const exportBtn = state.journeyPanel?.querySelector('[data-action="export"]');
  if (exportBtn) {
    exportBtn.classList.add('loading');
  }

  const result = await exportTrustData();

  if (exportBtn) {
    exportBtn.classList.remove('loading');
  }

  if (result.success) {
    toast.success(t('trustJourney.exportSuccess'));
  } else {
    const errorKey = result.error || 'exportFailed';
    toast.error(t(`trustJourney.errors.${errorKey}.message`));
  }
}

function loadMoreTimeline(): void {
  state.timelineOffset += TIMELINE_PAGE_SIZE;
  if (state.cachedData) {
    updateContent(state.cachedData);
  }
}

// ============================================================================
// RENDERING
// ============================================================================

function updateContent(data: TrustJourneyData): void {
  const content = state.journeyPanel?.querySelector('.trust-journey-content');
  if (!content) return;

  // Add offline banner if needed
  const offlineBanner = state.error === 'fetchFailedUsingCache' ? renderOfflineBanner() : '';

  content.innerHTML = offlineBanner + renderContent(data, state);

  // Attach event listeners for dynamic content
  content.removeEventListener('click', handleContentClick);
  content.addEventListener('click', handleContentClick);

  // Animate the strength ring after render
  requestAnimationFrame(() => {
    const fill = content.querySelector('.trust-strength-fill') as SVGCircleElement;
    if (fill) {
      const strengthPercent = data.summary.relationshipStrength;
      const circumference = 440;
      const strokeDashoffset = circumference - (circumference * strengthPercent) / 100;
      fill.style.strokeDashoffset = String(strokeDashoffset);
    }
  });
}

function renderErrorState(errorType: string): void {
  const content = state.journeyPanel?.querySelector('.trust-journey-content');
  if (!content) return;

  content.innerHTML = renderError(errorType, () => void refreshJourneyData());

  // Attach retry handler
  content.removeEventListener('click', handleContentClick);
  content.addEventListener('click', handleContentClick);
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function showTrustJourney(): Promise<void> {
  if (!state.journeyPanel) return;

  // Check if user is logged in
  const userId = getUserId();
  if (!userId) {
    toast.error(t('trustJourney.errors.notLoggedIn.message'));
    return;
  }

  state.journeyPanel.classList.add('visible');

  // Set up focus trap
  const card = state.journeyPanel.querySelector('.trust-journey-card') as HTMLElement;
  if (card) {
    state.focusCleanup = trapFocus(card);
  }

  // Focus close button
  const closeBtn = state.journeyPanel.querySelector('[data-action="close"]') as HTMLElement;
  closeBtn?.focus();

  // Load data
  await loadData();

  log.debug('Trust Journey shown');
}

export function hideTrustJourney(): void {
  if (!state.journeyPanel) return;

  state.journeyPanel.classList.remove('visible');

  // Clean up focus trap
  if (state.focusCleanup) {
    state.focusCleanup();
    state.focusCleanup = null;
  }

  log.debug('Trust Journey hidden');
}

export function toggleTrustJourney(): void {
  if (state.journeyPanel?.classList.contains('visible')) {
    hideTrustJourney();
  } else {
    void showTrustJourney();
  }
}

export function dispose(): void {
  // Remove event listeners
  document.removeEventListener('keydown', handleEscapeKey);
  window.removeEventListener('online', handleOnlineStatusChange);
  window.removeEventListener('offline', handleOnlineStatusChange);

  // Clean up focus trap
  if (state.focusCleanup) {
    state.focusCleanup();
  }

  // Remove DOM elements
  state.journeyPanel?.remove();
  removeStyles(state.styleElement);

  // Reset state
  state.journeyPanel = null;
  state.styleElement = null;
  state.cachedData = null;
  state.isInitialized = false;
  state.error = null;
  state.timelineOffset = 0;
  state.timelineFilter = 'all';
  state.focusCleanup = null;

  log.debug('Trust Journey disposed');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const trustJourneyUI = {
  init: initTrustJourneyUI,
  show: showTrustJourney,
  hide: hideTrustJourney,
  toggle: toggleTrustJourney,
  dispose,
};

// Re-export types
export type { TrustJourneyData, TrustJourneyState } from './types.js';

