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
} from '../utils/dom.js';
import type {
  LifeTimelineData,
  TimelineChapter,
  DeviceContext,
  VisualizationResult,
} from '../types.js';
import { DEFAULT_COLORS } from '../types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const CHAPTER_TYPE_COLORS: Record<TimelineChapter['type'], string> = {
  growth: DEFAULT_COLORS.accent,
  challenge: '#e74c3c',
  transition: '#f5a623',
  celebration: '#27ae60',
  reflection: '#8a7a9a',
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

  // Header
  const header = createElement('div', 'viz-header');
  header.appendChild(createElement('h3', '', 'Chapter'));
  header.appendChild(createElement('p', '', 'Life narrative'));
  container.appendChild(header);

  // Chapter dots row
  const dots = createElement('div');
  setStyles(dots, {
    display: 'flex',
    gap: '6px',
    justifyContent: 'center',
    margin: '12px 0',
  });

  // Find current chapter index
  const currentIndex = data.chapters.findIndex(ch => ch.isActive);

  // Show up to 5 dots for context
  const visibleChapters = getVisibleChapters(data.chapters, currentIndex, 5);

  visibleChapters.forEach((chapter) => {
    const isCurrent = chapter.isActive;
    const dot = createElement('div');
    setStyles(dot, {
      width: isCurrent ? '14px' : '8px',
      height: isCurrent ? '14px' : '8px',
      borderRadius: '50%',
      background: isCurrent ? 'var(--color-accent)' : 'var(--color-text-muted)',
      opacity: isCurrent ? '1' : '0.4',
    });
    dots.appendChild(dot);
  });

  container.appendChild(dots);

  // Current indicator
  const theme = createElement('div');
  setStyles(theme, {
    textAlign: 'center',
    fontSize: '0.9rem',
    color: 'var(--color-accent)',
    fontWeight: '600',
  });
  theme.textContent = 'Now';
  container.appendChild(theme);

  // Chapter title
  const metric = createElement('div', 'watch-metric', data.currentChapter.title);
  container.appendChild(metric);

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

  // Header
  const header = createElement('div', 'viz-header');
  header.appendChild(createElement('h3', '', 'Life Timeline'));
  header.appendChild(createElement('p', '', 'Your story chapters'));
  container.appendChild(header);

  // Current chapter card
  const card1 = createElement('div', 'mobile-card');
  if (isAndroid) {
    setStyles(card1, { borderLeft: '3px solid var(--color-accent)' });
  }

  const cardHeader = createElement('div', 'mobile-card-header');
  cardHeader.appendChild(createElement('span', 'mobile-card-title', 'Current Chapter'));

  // Year badge from start date
  const yearBadge = createElement('span', 'mobile-card-badge', getYear(data.currentChapter.startDate));
  cardHeader.appendChild(yearBadge);
  card1.appendChild(cardHeader);

  // Theme title
  const theme = createElement('div');
  setStyles(theme, {
    fontSize: '1.2rem',
    color: 'var(--color-accent)',
    fontWeight: '600',
    margin: '8px 0',
  });
  theme.textContent = `"${data.currentChapter.title}"`;
  card1.appendChild(theme);

  // Chapter summary
  if (data.currentChapter.summary) {
    const insight = createElement('p', 'mobile-insight', data.currentChapter.summary);
    card1.appendChild(insight);
  }

  container.appendChild(card1);

  // Journey timeline card
  const card2 = createElement('div', 'mobile-card');
  if (isAndroid) {
    setStyles(card2, { borderLeft: '3px solid var(--persona-nayan)' });
  }

  const journeyHeader = createElement('div', 'mobile-card-header');
  journeyHeader.appendChild(createElement('span', 'mobile-card-title', 'Your Journey'));
  card2.appendChild(journeyHeader);

  // Timeline dots
  const timeline = createElement('div');
  setStyles(timeline, {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    margin: '12px 0',
  });

  // Show key chapters as dots with years
  const keyChapters = getKeyChapters(data.chapters, 4);
  keyChapters.forEach((chapter) => {
    const isActive = chapter.isActive;
    const dot = createElement('div');
    setStyles(dot, {
      width: isActive ? '16px' : '10px',
      height: isActive ? '16px' : '10px',
      borderRadius: '50%',
      background: isActive ? 'var(--color-accent)' : 'var(--color-text-muted)',
      opacity: isActive ? '1' : '0.5',
    });
    timeline.appendChild(dot);
  });

  // Future arrow
  const arrow = createElement('div');
  setStyles(arrow, {
    color: 'var(--color-text-muted)',
    fontSize: '1rem',
  });
  arrow.textContent = '→';
  timeline.appendChild(arrow);

  card2.appendChild(timeline);
  container.appendChild(card2);

  // Narrative summary card (if available)
  if (data.narrativeSummary) {
    const card3 = createElement('div', 'mobile-card');
    if (isAndroid) {
      setStyles(card3, { borderLeft: '3px solid var(--persona-maya)' });
    }

    const evolHeader = createElement('div', 'mobile-card-header');
    evolHeader.appendChild(createElement('span', 'mobile-card-title', 'The Theme'));
    card3.appendChild(evolHeader);

    const evolution = createElement('p', 'mobile-insight', data.narrativeSummary);
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

  // Header
  const header = createElement('div', 'viz-header');
  header.appendChild(createElement('h3', '', 'Your Life Chapters'));
  header.appendChild(createElement('p', '', 'The story of your journey'));
  container.appendChild(header);

  // Timeline visualization
  const timelineContainer = createElement('div', 'timeline-container');
  setStyles(timelineContainer, {
    position: 'relative',
    padding: '24px 16px',
    background: 'var(--color-background)',
    borderRadius: '12px',
    marginBottom: '16px',
  });

  // Timeline line
  const line = createElement('div', 'timeline-line');
  setStyles(line, {
    position: 'absolute',
    top: '50%',
    left: '24px',
    right: '24px',
    height: '2px',
    background: 'var(--color-border-subtle)',
  });
  timelineContainer.appendChild(line);

  // Chapters
  const chaptersRow = createElement('div', 'timeline-chapters');
  setStyles(chaptersRow, {
    display: 'flex',
    justifyContent: 'space-between',
    position: 'relative',
    zIndex: '1',
  });

  data.chapters.forEach((chapter) => {
    const chapterEl = createElement('div');
    setStyles(chapterEl, {
      textAlign: 'center',
      position: 'relative',
    });

    // Dot
    const dot = createElement('div', 'timeline-dot');
    const typeColor = CHAPTER_TYPE_COLORS[chapter.type] || DEFAULT_COLORS.accent;
    setStyles(dot, {
      width: chapter.isActive ? '18px' : '12px',
      height: chapter.isActive ? '18px' : '12px',
      borderRadius: '50%',
      background: chapter.isActive ? typeColor : 'var(--color-text-muted)',
      margin: '0 auto',
      cursor: 'pointer',
      transition: 'transform 150ms ease',
    });
    if (chapter.isActive) {
      setStyles(dot, { transform: 'scale(1.2)' });
    }
    chapterEl.appendChild(dot);

    // Title
    const title = createElement('div');
    setStyles(title, {
      fontSize: '0.75rem',
      marginTop: '8px',
      color: chapter.isActive ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
      fontWeight: chapter.isActive ? '600' : '400',
    });
    title.textContent = chapter.title;
    chapterEl.appendChild(title);

    // Year
    const year = createElement('div');
    setStyles(year, {
      fontSize: '0.65rem',
      color: 'var(--color-text-muted)',
    });
    year.textContent = getYear(chapter.startDate);
    chapterEl.appendChild(year);

    chaptersRow.appendChild(chapterEl);
  });

  timelineContainer.appendChild(chaptersRow);
  container.appendChild(timelineContainer);

  // Details grid
  const detailsGrid = createFlexContainer('row', '16px');
  setStyles(detailsGrid, { marginTop: '16px' });

  // Current chapter panel
  const currentPanel = createElement('div');
  setStyles(currentPanel, {
    flex: '1',
    padding: '16px',
    background: 'var(--color-bg-elevated)',
    borderRadius: '12px',
    border: '1px solid var(--color-border-subtle)',
  });

  const currentHeader = createElement('div');
  setStyles(currentHeader, {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: 'var(--color-text-muted)',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  });
  currentHeader.textContent = 'Current Theme';
  currentPanel.appendChild(currentHeader);

  const themeEl = createElement('p');
  setStyles(themeEl, {
    fontSize: '1.2rem',
    color: 'var(--color-accent)',
    fontWeight: '600',
    margin: '8px 0',
  });
  themeEl.textContent = `"${data.currentChapter.title}"`;
  currentPanel.appendChild(themeEl);

  if (data.currentChapter.summary) {
    const summary = createElement('p');
    setStyles(summary, {
      fontSize: '0.85rem',
      color: 'var(--color-text-secondary)',
      lineHeight: '1.5',
    });
    summary.textContent = data.currentChapter.summary;
    currentPanel.appendChild(summary);
  }

  detailsGrid.appendChild(currentPanel);

  // Progress/evolution panel
  const progressPanel = createElement('div');
  setStyles(progressPanel, {
    flex: '1',
    padding: '16px',
    background: 'var(--color-bg-elevated)',
    borderRadius: '12px',
    border: '1px solid var(--color-border-subtle)',
  });

  const progressHeader = createElement('div');
  setStyles(progressHeader, {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: 'var(--color-text-muted)',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  });
  progressHeader.textContent = 'Chapter Progress';
  progressPanel.appendChild(progressHeader);

  // Progress bar
  const progressBar = createElement('div');
  setStyles(progressBar, {
    height: '8px',
    background: 'var(--color-border-subtle)',
    borderRadius: '4px',
    overflow: 'hidden',
    marginTop: '12px',
  });

  const progressFill = createElement('div');
  setStyles(progressFill, {
    width: `${data.currentChapter.progress * 100}%`,
    height: '100%',
    background: CHAPTER_TYPE_COLORS[data.currentChapter.type] || DEFAULT_COLORS.accent,
    borderRadius: '4px',
    transition: 'width 300ms ease',
  });
  progressBar.appendChild(progressFill);
  progressPanel.appendChild(progressBar);

  // Progress percentage
  const progressLabel = createElement('div');
  setStyles(progressLabel, {
    fontSize: '0.85rem',
    color: 'var(--color-text-secondary)',
    marginTop: '8px',
  });
  progressLabel.textContent = `${Math.round(data.currentChapter.progress * 100)}% through this chapter`;
  progressPanel.appendChild(progressLabel);

  // Narrative summary if available
  if (data.narrativeSummary) {
    const narrativeEl = createElement('p');
    setStyles(narrativeEl, {
      fontSize: '0.85rem',
      color: 'var(--color-text-secondary)',
      lineHeight: '1.5',
      marginTop: '12px',
      fontStyle: 'italic',
    });
    narrativeEl.textContent = data.narrativeSummary;
    progressPanel.appendChild(narrativeEl);
  }

  detailsGrid.appendChild(progressPanel);
  container.appendChild(detailsGrid);

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
