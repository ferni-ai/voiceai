/**
 * Trust Journey Render
 *
 * Rendering functions for the Trust Journey content.
 */

import { t } from '../../i18n/index.js';
import { STAGGER } from '../../config/animation-constants.js';
import { ICONS } from './icons.js';
import type { TrustJourneyData, TimelineItem, TrustJourneyState, TimelineFilterType } from './types.js';

export const TIMELINE_PAGE_SIZE = 10;

const FILTER_OPTIONS: TimelineFilterType[] = ['all', 'growth', 'win', 'callback', 'boundary', 'outreach'];

// ============================================================================
// LOADING STATE
// ============================================================================

export function renderLoading(): string {
  return `
    <div class="trust-journey-loading" role="status" aria-label="${t('trustJourney.loading')}">
      <div class="trust-journey-loading-spinner"></div>
      <p class="trust-journey-loading-text">${t('trustJourney.loadingText')}</p>
    </div>
  `;
}

export function renderSkeleton(): string {
  return `
    <div class="trust-journey-skeleton" aria-hidden="true">
      <div class="skeleton-ring"></div>
      <div class="skeleton-text skeleton-text--short"></div>
      <div class="skeleton-text skeleton-text--medium"></div>
      <div class="skeleton-stats">
        <div class="skeleton-stat"></div>
        <div class="skeleton-stat"></div>
        <div class="skeleton-stat"></div>
      </div>
    </div>
  `;
}

// ============================================================================
// ERROR STATES
// ============================================================================

export function renderError(errorType: string, _onRetry: () => void): string {
  const errorConfig = getErrorConfig(errorType);

  return `
    <div class="trust-journey-error" role="alert">
      <div class="trust-journey-error-icon">${errorConfig.icon}</div>
      <h3 class="trust-journey-error-title">${errorConfig.title}</h3>
      <p class="trust-journey-error-text">${errorConfig.message}</p>
      ${
        errorConfig.showRetry
          ? `
        <button aria-label="${t('accessibility.refresh')}" class="trust-journey-retry-btn" data-action="retry">
          ${ICONS.refresh}
          <span>${t('common.tryAgain')}</span>
        </button>
      `
          : ''
      }
    </div>
  `;
}

function getErrorConfig(errorType: string): {
  icon: string;
  title: string;
  message: string;
  showRetry: boolean;
} {
  switch (errorType) {
    case 'offline':
      return {
        icon: ICONS.wifiOff,
        title: t('trustJourney.errors.offline.title'),
        message: t('trustJourney.errors.offline.message'),
        showRetry: true,
      };
    case 'notLoggedIn':
      return {
        icon: ICONS.alertCircle,
        title: t('trustJourney.errors.notLoggedIn.title'),
        message: t('trustJourney.errors.notLoggedIn.message'),
        showRetry: false,
      };
    case 'rateLimited':
      return {
        icon: ICONS.clock,
        title: t('trustJourney.errors.rateLimited.title'),
        message: t('trustJourney.errors.rateLimited.message'),
        showRetry: true,
      };
    case 'unauthorized':
      return {
        icon: ICONS.shield,
        title: t('trustJourney.errors.unauthorized.title'),
        message: t('trustJourney.errors.unauthorized.message'),
        showRetry: false,
      };
    default:
      return {
        icon: ICONS.alertCircle,
        title: t('trustJourney.errors.generic.title'),
        message: t('trustJourney.errors.generic.message'),
        showRetry: true,
      };
  }
}

// ============================================================================
// EMPTY STATE
// ============================================================================

export function renderEmpty(): string {
  return `
    <div class="trust-journey-empty">
      <div class="trust-journey-empty-icon">${ICONS.heart}</div>
      <h3 class="trust-journey-empty-title">${t('trustJourney.empty.title')}</h3>
      <p class="trust-journey-empty-text">${t('trustJourney.empty.message')}</p>
    </div>
  `;
}

// ============================================================================
// OFFLINE BANNER
// ============================================================================

export function renderOfflineBanner(): string {
  return `
    <div class="trust-journey-offline-banner" role="status">
      ${ICONS.wifiOff}
      <span>${t('trustJourney.offlineBanner')}</span>
    </div>
  `;
}

// ============================================================================
// MAIN CONTENT
// ============================================================================

export function renderContent(data: TrustJourneyData, state: TrustJourneyState): string {
  // Check if we have meaningful data
  const hasData =
    data.summary.trustSignalsDetected > 0 ||
    data.summary.winsCelebrated > 0 ||
    data.timeline.length > 0;

  if (!hasData) {
    return renderEmpty();
  }

  const strengthPercent = data.summary.relationshipStrength;
  const circumference = 440; // 2 * π * 70 (radius)
  const strokeDashoffset = circumference - (circumference * strengthPercent) / 100;
  const timelineOffset = state.timelineOffset || 0;
  const currentFilter = state.timelineFilter || 'all';
  
  // Filter timeline items based on selected filter
  const filteredTimeline = currentFilter === 'all' 
    ? data.timeline 
    : data.timeline.filter(item => item.type === currentFilter);
  
  const visibleTimeline = filteredTimeline.slice(0, timelineOffset + TIMELINE_PAGE_SIZE);
  const hasMoreTimeline = filteredTimeline.length > visibleTimeline.length;

  return `
    <!-- SVG Gradient Definition -->
    <svg width="0" height="0">
      <defs>
        <linearGradient id="trustGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="var(--persona-secondary, #3d5a35)" />
          <stop offset="100%" stop-color="var(--persona-primary, #4a6741)" />
        </linearGradient>
      </defs>
    </svg>
    
    <!-- Relationship Strength -->
    <section class="trust-strength-section" aria-labelledby="strength-heading">
      <h3 id="strength-heading" class="sr-only">${t('trustJourney.sections.strength')}</h3>
      <div class="trust-strength-ring" role="img" aria-label="${t('trustJourney.strengthLabel', { value: strengthPercent })}">
        <svg width="180" height="180" viewBox="0 0 180 180">
          <circle class="trust-strength-bg" cx="90" cy="90" r="70" />
          <circle class="trust-strength-fill" cx="90" cy="90" r="70" 
                  style="stroke-dashoffset: ${strokeDashoffset}" />
        </svg>
        <div class="trust-strength-center">
          <div class="trust-strength-value">${strengthPercent}</div>
          <div class="trust-strength-label">${t('trustJourney.trustScore')}</div>
        </div>
      </div>
      <p class="trust-strength-description">${getStrengthDescription(strengthPercent)}</p>
    </section>
    
    <!-- Stats Grid -->
    <div class="trust-stats-grid" role="list" aria-label="${t('trustJourney.sections.stats')}">
      <div class="trust-stat-card" role="listitem">
        <div class="trust-stat-icon">${ICONS.leaf}</div>
        <div class="trust-stat-value">${data.summary.growthMomentsNoticed}</div>
        <div class="trust-stat-label">${t('trustJourney.stats.growthMoments')}</div>
      </div>
      <div class="trust-stat-card" role="listitem">
        <div class="trust-stat-icon">${ICONS.trophy}</div>
        <div class="trust-stat-value">${data.summary.winsCelebrated}</div>
        <div class="trust-stat-label">${t('trustJourney.stats.winsCelebrated')}</div>
      </div>
      <div class="trust-stat-card" role="listitem">
        <div class="trust-stat-icon">${ICONS.messageHeart}</div>
        <div class="trust-stat-value">${data.summary.sharedMomentsCount}</div>
        <div class="trust-stat-label">${t('trustJourney.stats.sharedMoments')}</div>
      </div>
    </div>
    
    <!-- Boundaries Section -->
    ${
      data.boundaries.totalBoundaries > 0
        ? `
      <section class="trust-section" aria-labelledby="boundaries-heading">
        <h3 id="boundaries-heading" class="sr-only">${t('trustJourney.sections.boundaries')}</h3>
        <div class="boundaries-message">
          <div class="boundaries-icon">${ICONS.shield}</div>
          <p class="boundaries-text">${data.boundaries.message}</p>
        </div>
      </section>
    `
        : ''
    }
    
    <!-- Growth Patterns -->
    ${
      data.growth.patterns.length > 0
        ? `
      <section class="trust-section" aria-labelledby="growth-heading">
        <div class="trust-section-header">
          <div class="trust-section-icon">${ICONS.leaf}</div>
          <h3 class="trust-section-title" id="growth-heading">${t('trustJourney.sections.growth')}</h3>
        </div>
        <div class="growth-patterns-list" role="list">
          ${data.growth.patterns
            .map(
              (p) => `
            <span class="growth-pattern-tag" role="listitem">
              ${formatGrowthType(p.type)}
              <span class="growth-pattern-count">${p.count}</span>
            </span>
          `
            )
            .join('')}
        </div>
      </section>
    `
        : ''
    }
    
    <!-- Timeline -->
    ${
      data.timeline.length > 0
        ? `
      <section class="trust-section" aria-labelledby="timeline-heading">
        <div class="trust-section-header">
          <div class="trust-section-icon">${ICONS.clock}</div>
          <h3 class="trust-section-title" id="timeline-heading">${t('trustJourney.sections.timeline')}</h3>
        </div>
        
        <!-- Timeline Filter Tabs -->
        <div class="timeline-filter-tabs" role="tablist" aria-label="${t('trustJourney.filterLabel')}">
          ${renderFilterTabs(state.timelineFilter, data.timeline)}
        </div>
        
        <div class="trust-timeline" role="list" aria-label="${t('trustJourney.timelineLabel')}">
          ${visibleTimeline.map((item, i) => renderTimelineItem(item, i)).join('')}
        </div>
        ${
          hasMoreTimeline
            ? `
          <div class="timeline-load-more">
            <button aria-label="${t('accessibility.moveDown')}" class="timeline-load-more-btn" data-action="load-more">
              ${ICONS.chevronDown}
              <span>${t('trustJourney.loadMore', { count: Math.min(TIMELINE_PAGE_SIZE, data.timeline.length - visibleTimeline.length) })}</span>
            </button>
          </div>
        `
            : ''
        }
      </section>
    `
        : ''
    }
  `;
}

function renderTimelineItem(item: TimelineItem, index: number): string {
  return `
    <div class="timeline-item timeline-item--${item.type}" 
         style="animation-delay: ${index * STAGGER.NORMAL}ms"
         role="listitem">
      <div class="timeline-date">${formatRelativeDate(item.date)}</div>
      <div class="timeline-title">${escapeHtml(item.title)}</div>
      <div class="timeline-description">${escapeHtml(item.description)}</div>
    </div>
  `;
}

function renderFilterTabs(currentFilter: TimelineFilterType, timeline: TimelineItem[]): string {
  // Count items per type
  const counts: Record<string, number> = { all: timeline.length };
  timeline.forEach(item => {
    counts[item.type] = (counts[item.type] || 0) + 1;
  });

  // Only show filters that have items (except 'all' which always shows)
  const availableFilters = FILTER_OPTIONS.filter(f => f === 'all' || counts[f] > 0);

  return availableFilters.map(filter => `
    <button
      aria-label="${t(`trustJourney.filters.${filter}`)}"
      class="timeline-filter-tab ${filter === currentFilter ? 'timeline-filter-tab--active' : ''}"
      data-action="filter"
      data-filter="${filter}"
      role="tab"
      aria-selected="${filter === currentFilter}"
      aria-controls="timeline-list"
    >
      <span class="timeline-filter-label">${t(`trustJourney.filters.${filter}`)}</span>
      <span class="timeline-filter-count">${counts[filter] || 0}</span>
    </button>
  `).join('');
}

// ============================================================================
// HELPERS
// ============================================================================

function getStrengthDescription(percent: number): string {
  if (percent >= 80) return t('trustJourney.strengthDescriptions.deep');
  if (percent >= 60) return t('trustJourney.strengthDescriptions.growing');
  if (percent >= 40) return t('trustJourney.strengthDescriptions.building');
  if (percent >= 20) return t('trustJourney.strengthDescriptions.starting');
  return t('trustJourney.strengthDescriptions.beginning');
}

function formatGrowthType(type: string): string {
  const key = `trustJourney.growthTypes.${type}`;
  const translated = t(key);
  // Fallback if no translation exists
  if (translated === key) {
    return type.replace(/_/g, ' ');
  }
  return translated;
}

function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return t('common.today');
  if (diffDays === 1) return t('common.yesterday');
  if (diffDays < 7) return t('common.daysAgo', { count: diffDays });
  if (diffDays < 30) return t('common.weeksAgo', { count: Math.floor(diffDays / 7) });
  if (diffDays < 365) return t('common.monthsAgo', { count: Math.floor(diffDays / 30) });
  return date.toLocaleDateString();
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}


