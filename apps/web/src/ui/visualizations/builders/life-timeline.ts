/**
 * Life Timeline Visualization Builder
 *
 * Displays life chapters and identity evolution as a narrative timeline.
 * Adapts to different device sizes:
 * - Watch: Current chapter dot with context
 * - Mobile: Card-based with chapter theme and timeline
 * - Tablet: Full timeline with chapter details and evolution
 *
 * @module visualizations/builders/life-timeline
 */

import {
  createElement,
  createFlexContainer,
  setStyles,
  createScreenReaderLabel,
  getCssVar,
} from '../utils/dom.js';
import type {
  LifeTimelineData,
  TimelineChapter,
  DeviceContext,
  VisualizationResult,
} from '../types.js';
import { CSS_COLOR_VARS } from '../types.js';
import { t } from '../../../i18n/index.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Literal color values for SVG and computed elements.
 * @design-tokens-ignore - Required for dynamic styling
 */
const CHAPTER_TYPE_COLORS: Record<TimelineChapter['type'], string> = {
  growth: getCssVar('--viz-accent', '#3D5A45'),
  challenge: getCssVar('--color-semantic-error', '#e74c3c'),
  transition: getCssVar('--color-semantic-warning', '#f5a623'),
  celebration: getCssVar('--color-semantic-success', '#27ae60'),
  reflection: getCssVar('--persona-eli-primary', '#8a7a9a'),
};

/**
 * CSS variable references for DOM styling.
 */
const CHAPTER_CSS_VARS: Record<TimelineChapter['type'], string> = {
  growth: 'var(--viz-accent)',
  challenge: 'var(--viz-chapter-challenge)',
  transition: 'var(--viz-chapter-transition)',
  celebration: 'var(--viz-chapter-celebration)',
  reflection: 'var(--viz-chapter-reflection)',
};

// ============================================================================
// WATCH BUILDER
// ============================================================================

/**
 * Build compact life timeline for watch.
 */
function buildWatch(
  container: HTMLElement,
  data: LifeTimelineData
): VisualizationResult {
  container.replaceChildren();

  // Header with design system classes
  const header = createElement('div', 'viz-header');
  const title = createElement('h3', 'viz-header__title viz-header__title--compact', t('visualizations.lifeTimeline.titleShort', 'Chapter'));
  const subtitle = createElement('p', 'viz-header__subtitle', t('visualizations.lifeTimeline.subtitleShort', 'Life narrative'));
  header.appendChild(title);
  header.appendChild(subtitle);
  container.appendChild(header);

  // Chapter dots row using design system spacing
  const dots = createElement('div', 'viz-flex viz-flex--row viz-flex--center');
  setStyles(dots, {
    gap: 'var(--viz-space-2xs)',
    margin: 'var(--viz-space-pause) 0',
  });

  // Find current chapter index
  const currentIndex = data.chapters.findIndex(ch => ch.isActive);

  // Show up to 5 dots for context
  const visibleChapters = getVisibleChapters(data.chapters, currentIndex, 5);

  visibleChapters.forEach((chapter) => {
    const isCurrent = chapter.isActive;
    const dot = createElement('div', `viz-timeline-dot${isCurrent ? ' viz-timeline-dot--active' : ''}`);
    dots.appendChild(dot);
  });

  container.appendChild(dots);

  // Current indicator with design system class
  const theme = createElement('div', 'viz-label viz-label--accent');
  theme.textContent = t('common.now', 'Now');
  container.appendChild(theme);

  // Chapter title with design system metric class
  const metric = createElement('div', 'viz-metric viz-metric--compact');
  const metricLabel = createElement('span', 'viz-metric__label');
  metricLabel.textContent = data.currentChapter.title;
  metric.appendChild(metricLabel);
  container.appendChild(metric);

  // Screen reader label
  container.appendChild(
    createScreenReaderLabel(
      `Life timeline showing current chapter: ${data.currentChapter.title}`
    )
  );

  return {
    element: container,
    type: 'life-timeline',
    device: 'watch',
    ariaLabel: `Life timeline showing current chapter: ${data.currentChapter.title}`,
  };
}

// ============================================================================
// MOBILE BUILDER
// ============================================================================

/**
 * Build life timeline for mobile (iOS/Android).
 */
function buildMobile(
  container: HTMLElement,
  data: LifeTimelineData,
  context: DeviceContext
): VisualizationResult {
  container.replaceChildren();
  const isAndroid = context.platform === 'android';

  // Header with design system classes
  const header = createElement('div', 'viz-header');
  const headerTitle = createElement('h3', 'viz-header__title', t('visualizations.lifeTimeline.title', 'Your Growth'));
  const headerSubtitle = createElement('p', 'viz-header__subtitle', t('visualizations.lifeTimeline.subtitle', 'Your Life Chapters'));
  header.appendChild(headerTitle);
  header.appendChild(headerSubtitle);
  container.appendChild(header);

  // Current chapter card with glass styling
  const card1 = createElement('div', 'viz-card viz-animate-slide');
  if (isAndroid) {
    card1.classList.add('viz-card--accent-primary');
  }

  const cardHeader = createElement('div', 'viz-flex viz-flex--row viz-flex--center viz-flex--between');
  const chapterTitle = createElement('span');
  setStyles(chapterTitle, {
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--viz-text-base)',
    fontWeight: '600',
    color: CSS_COLOR_VARS.textPrimary,
  });
  chapterTitle.textContent = t('visualizations.lifeTimeline.currentChapter', 'Current Chapter');
  cardHeader.appendChild(chapterTitle);

  // Year badge from start date
  const yearBadge = createElement('span', 'viz-badge');
  yearBadge.textContent = getYear(data.currentChapter.startDate);
  cardHeader.appendChild(yearBadge);
  card1.appendChild(cardHeader);

  // Theme title with design system styling
  const theme = createElement('div', 'viz-chapter-title');
  theme.textContent = `"${data.currentChapter.title}"`;
  card1.appendChild(theme);

  // Chapter summary
  if (data.currentChapter.summary) {
    const insight = createElement('p', 'viz-insight');
    insight.textContent = data.currentChapter.summary;
    card1.appendChild(insight);
  }

  container.appendChild(card1);

  // Journey timeline card
  const card2 = createElement('div', 'viz-card viz-animate-slide viz-stagger-2');
  if (isAndroid) {
    card2.classList.add('viz-card--accent-secondary');
  }

  const journeyHeader = createElement('div', 'viz-flex viz-flex--row viz-flex--center viz-flex--between');
  const journeyTitle = createElement('span');
  setStyles(journeyTitle, {
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--viz-text-base)',
    fontWeight: '600',
    color: CSS_COLOR_VARS.textPrimary,
  });
  journeyTitle.textContent = t('visualizations.lifeTimeline.yourJourney', 'Your Journey');
  journeyHeader.appendChild(journeyTitle);
  card2.appendChild(journeyHeader);

  // Timeline dots using design system
  const timeline = createElement('div', 'viz-flex viz-flex--row viz-flex--between viz-flex--center');
  setStyles(timeline, { margin: 'var(--viz-space-pause) 0' });

  // Show key chapters as dots with years
  const keyChapters = getKeyChapters(data.chapters, 4);
  keyChapters.forEach((chapter) => {
    const isActive = chapter.isActive;
    const dot = createElement('div', `viz-timeline-dot${isActive ? ' viz-timeline-dot--active' : ''}`);
    setStyles(dot, {
      width: isActive ? '16px' : '10px',
      height: isActive ? '16px' : '10px',
    });
    timeline.appendChild(dot);
  });

  // Future arrow
  const arrow = createElement('div', 'viz-arrow');
  arrow.textContent = '→';
  timeline.appendChild(arrow);

  card2.appendChild(timeline);
  container.appendChild(card2);

  // Narrative summary card (if available)
  if (data.narrativeSummary) {
    const card3 = createElement('div', 'viz-card viz-animate-slide viz-stagger-3');
    if (isAndroid) {
      card3.classList.add('viz-card--accent-emotional');
    }

    const evolHeader = createElement('div', 'viz-flex viz-flex--row viz-flex--center viz-flex--between');
    const evolTitle = createElement('span');
    setStyles(evolTitle, {
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--viz-text-base)',
      fontWeight: '600',
      color: CSS_COLOR_VARS.textPrimary,
    });
    evolTitle.textContent = t('visualizations.lifeTimeline.theTheme', 'The Theme');
    evolHeader.appendChild(evolTitle);
    card3.appendChild(evolHeader);

    const evolution = createElement('p', 'viz-insight');
    evolution.textContent = data.narrativeSummary;
    card3.appendChild(evolution);
    container.appendChild(card3);
  }

  // Screen reader summary
  container.appendChild(
    createScreenReaderLabel(
      `Life timeline with ${data.totalChapters} chapters. Current chapter: ${data.currentChapter.title}.`
    )
  );

  return {
    element: container,
    type: 'life-timeline',
    device: 'mobile',
    ariaLabel: `Life timeline showing ${data.totalChapters} chapters, current: ${data.currentChapter.title}`,
  };
}

// ============================================================================
// TABLET BUILDER
// ============================================================================

/**
 * Build life timeline for tablet with full chapter details.
 */
function buildTablet(
  container: HTMLElement,
  data: LifeTimelineData,
  _context: DeviceContext
): VisualizationResult {
  container.replaceChildren();

  // Header with design system classes
  const header = createElement('div', 'viz-header');
  const headerTitle = createElement('h3', 'viz-header__title', t('visualizations.lifeTimeline.title', 'Your Life Chapters'));
  const headerSubtitle = createElement('p', 'viz-header__subtitle', t('visualizations.lifeTimeline.subtitle', 'The story of your journey'));
  header.appendChild(headerTitle);
  header.appendChild(headerSubtitle);
  container.appendChild(header);

  // Timeline visualization card
  const timelineCard = createElement('div', 'viz-card viz-animate-slide');
  setStyles(timelineCard, {
    position: 'relative',
    padding: 'var(--viz-space-rest) var(--viz-space-pause)',
    marginBottom: 'var(--viz-space-pause)',
  });

  // Timeline line
  const line = createElement('div', 'viz-timeline-line');
  timelineCard.appendChild(line);

  // Chapters
  const chaptersRow = createElement('div', 'viz-flex viz-flex--row viz-flex--between');
  setStyles(chaptersRow, {
    position: 'relative',
    zIndex: '1',
  });

  data.chapters.forEach((chapter) => {
    const chapterEl = createElement('div', 'viz-timeline-chapter');

    // Dot with type-based color
    const dot = createElement('div', `viz-timeline-dot viz-timeline-dot--${chapter.type}${chapter.isActive ? ' viz-timeline-dot--active' : ''}`);
    chapterEl.appendChild(dot);

    // Title
    const titleEl = createElement('div', chapter.isActive ? 'viz-timeline-chapter__title viz-timeline-chapter__title--active' : 'viz-timeline-chapter__title');
    titleEl.textContent = chapter.title;
    chapterEl.appendChild(titleEl);

    // Year
    const year = createElement('div', 'viz-timeline-chapter__year');
    year.textContent = getYear(chapter.startDate);
    chapterEl.appendChild(year);

    chaptersRow.appendChild(chapterEl);
  });

  timelineCard.appendChild(chaptersRow);
  container.appendChild(timelineCard);

  // Details grid
  const detailsGrid = createElement('div', 'viz-flex viz-flex--row');
  setStyles(detailsGrid, {
    gap: 'var(--viz-space-pause)',
    marginTop: 'var(--viz-space-pause)',
  });

  // Current chapter panel
  const currentPanel = createElement('div', 'viz-card viz-animate-slide viz-stagger-2');
  setStyles(currentPanel, { flex: '1' });

  const currentHeader = createElement('div', 'viz-label viz-label--section');
  currentHeader.textContent = t('visualizations.currentTheme', 'Current Theme');
  currentPanel.appendChild(currentHeader);

  const themeEl = createElement('p', 'viz-chapter-title');
  themeEl.textContent = `"${data.currentChapter.title}"`;
  currentPanel.appendChild(themeEl);

  if (data.currentChapter.summary) {
    const summary = createElement('p');
    setStyles(summary, {
      fontSize: 'var(--viz-text-base)',
      color: CSS_COLOR_VARS.textSecondary,
      lineHeight: 'var(--line-height-normal)',
    });
    summary.textContent = data.currentChapter.summary;
    currentPanel.appendChild(summary);
  }

  detailsGrid.appendChild(currentPanel);

  // Progress/evolution panel
  const progressPanel = createElement('div', 'viz-card viz-animate-slide viz-stagger-3');
  setStyles(progressPanel, { flex: '1' });

  const progressHeader = createElement('div', 'viz-label viz-label--section');
  progressHeader.textContent = t('visualizations.chapterProgress', 'Chapter Progress');
  progressPanel.appendChild(progressHeader);

  // Progress bar with design system classes
  const progressBar = createElement('div', 'viz-progress');
  setStyles(progressBar, { marginTop: 'var(--viz-space-pause)' });

  const progressFill = createElement('div', `viz-progress__fill viz-progress__fill--${data.currentChapter.type}`);
  setStyles(progressFill, { width: `${data.currentChapter.progress * 100}%` });
  progressBar.appendChild(progressFill);
  progressPanel.appendChild(progressBar);

  // Progress percentage
  const progressLabel = createElement('div');
  setStyles(progressLabel, {
    fontSize: 'var(--viz-text-base)',
    color: CSS_COLOR_VARS.textSecondary,
    marginTop: 'var(--viz-space-breath)',
  });
  progressLabel.textContent = `${Math.round(data.currentChapter.progress * 100)}% ${t('visualizations.lifeTimeline.throughChapter', 'through this chapter')}`;
  progressPanel.appendChild(progressLabel);

  // Narrative summary if available
  if (data.narrativeSummary) {
    const narrativeEl = createElement('p', 'viz-insight');
    setStyles(narrativeEl, {
      marginTop: 'var(--viz-space-pause)',
      fontStyle: 'italic',
    });
    narrativeEl.textContent = data.narrativeSummary;
    progressPanel.appendChild(narrativeEl);
  }

  detailsGrid.appendChild(progressPanel);
  container.appendChild(detailsGrid);

  // Screen reader summary
  container.appendChild(
    createScreenReaderLabel(
      `Life timeline with ${data.totalChapters} chapters, currently in "${data.currentChapter.title}"`
    )
  );

  return {
    element: container,
    type: 'life-timeline',
    device: 'tablet',
    ariaLabel: `Life timeline with ${data.totalChapters} chapters, currently in "${data.currentChapter.title}"`,
  };
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build life timeline visualization for the given device context.
 */
export function buildLifeTimeline(
  container: HTMLElement,
  data: LifeTimelineData,
  context: DeviceContext
): VisualizationResult {
  switch (context.type) {
    case 'watch':
      return buildWatch(container, data);
    case 'mobile':
      return buildMobile(container, data, context);
    case 'tablet':
    case 'desktop':
      return buildTablet(container, data, context);
    default:
      return buildMobile(container, data, context);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get visible chapters centered around the current index.
 */
function getVisibleChapters(
  chapters: TimelineChapter[],
  currentIndex: number,
  maxVisible: number
): TimelineChapter[] {
  if (chapters.length <= maxVisible) return chapters;

  const halfVisible = Math.floor(maxVisible / 2);
  let start = Math.max(0, currentIndex - halfVisible);
  let end = start + maxVisible;

  if (end > chapters.length) {
    end = chapters.length;
    start = Math.max(0, end - maxVisible);
  }

  return chapters.slice(start, end);
}

/**
 * Get key chapters for a condensed timeline view.
 */
function getKeyChapters(chapters: TimelineChapter[], maxCount: number): TimelineChapter[] {
  if (chapters.length <= maxCount) return chapters;

  // Always include first, last, and current
  const result: TimelineChapter[] = [];
  const currentIndex = chapters.findIndex(ch => ch.isActive);

  // Add first
  if (chapters.length > 0) result.push(chapters[0]);

  // Add some middle chapters
  if (currentIndex > 0 && currentIndex < chapters.length - 1) {
    result.push(chapters[currentIndex]);
  }

  // Add last
  if (chapters.length > 1) {
    result.push(chapters[chapters.length - 1]);
  }

  return result.slice(0, maxCount);
}

/**
 * Get year from ISO date string.
 */
function getYear(dateStr: string): string {
  try {
    return new Date(dateStr).getFullYear().toString();
  } catch {
    return dateStr.slice(0, 4);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default buildLifeTimeline;
