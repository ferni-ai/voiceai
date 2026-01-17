/**
 * Open Loops Visualization Builder
 *
 * Displays unfinished threads/commitments as trackable loops.
 * Adapts to different device sizes:
 * - Watch: Count with oldest loop indicator
 * - Mobile: Card-based list by priority
 * - Tablet: Full categorized view with timeline
 *
 * @module visualizations/builders/open-loops
 */

import {
  createElement,
  createSvgElement,
  setStyles,
  createScreenReaderLabel,
  getCssVar,
} from '../utils/dom.js';
import type {
  OpenLoopsData,
  OpenLoop,
  DeviceContext,
  VisualizationResult,
} from '../types.js';
import { CSS_COLOR_VARS } from '../types.js';
import { t } from '../../../i18n/index.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Literal color values for SVG elements.
 * @design-tokens-ignore - SVG requires literal color values
 */
const PRIORITY_COLORS: Record<OpenLoop['priority'], string> = {
  high: getCssVar('--color-semantic-error', '#e74c3c'),
  medium: getCssVar('--color-semantic-warning', '#f5a623'),
  low: getCssVar('--color-text-muted', '#9a8f85'),
};

/**
 * CSS variable references for DOM element styling.
 */
const PRIORITY_CSS_VARS: Record<OpenLoop['priority'], string> = {
  high: 'var(--viz-priority-high)',
  medium: 'var(--viz-priority-medium)',
  low: 'var(--viz-priority-low)',
};

const CATEGORY_LABELS: Record<OpenLoop['category'], string> = {
  commitment: 'Commitment',
  question: 'Question',
  intention: 'Intention',
  'follow-up': 'Follow-up',
};

const CATEGORY_ICONS: Record<OpenLoop['category'], string> = {
  commitment: '◉',
  question: '?',
  intention: '◇',
  'follow-up': '↻',
};

// ============================================================================
// WATCH BUILDER
// ============================================================================

/**
 * Build compact open loops for watch.
 */
function buildWatch(
  container: HTMLElement,
  data: OpenLoopsData
): VisualizationResult {
  container.replaceChildren();

  // Header with design system classes
  const header = createElement('div', 'viz-header');
  const title = createElement('h3', 'viz-header__title viz-header__title--compact', t('visualizations.openLoops.titleShort', 'Loops'));
  const subtitle = createElement('p', 'viz-header__subtitle', t('visualizations.openLoops.subtitleShort', 'Open threads'));
  header.appendChild(title);
  header.appendChild(subtitle);
  container.appendChild(header);

  // Loop count visualization using viz-ring class
  const countContainer = createElement('div', 'viz-flex viz-flex--center');
  setStyles(countContainer, { margin: 'var(--viz-space-breath) 0' });

  const svg = createSvgElement('svg');
  svg.setAttribute('viewBox', '0 0 60 60');
  setStyles(svg as unknown as HTMLElement, {
    width: '60px',
    height: '60px',
  });

  // Draw open loop circles - @design-tokens-ignore (SVG)
  const numCircles = Math.min(data.totalOpen, 5);
  for (let i = 0; i < numCircles; i++) {
    const radius = 22 - i * 4;
    const circle = createSvgElement('circle');
    circle.setAttribute('cx', '30');
    circle.setAttribute('cy', '30');
    circle.setAttribute('r', String(radius));
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', getCssVar('--viz-accent', '#3D5A45'));
    circle.setAttribute('stroke-width', '2');
    circle.setAttribute('opacity', String(1 - i * 0.15));
    circle.setAttribute('stroke-dasharray', '4 2');
    svg.appendChild(circle);
  }

  // Center count - @design-tokens-ignore (SVG)
  const countText = createSvgElement('text');
  countText.setAttribute('x', '30');
  countText.setAttribute('y', '34');
  countText.setAttribute('text-anchor', 'middle');
  countText.setAttribute('font-size', '14');
  countText.setAttribute('font-weight', '600');
  countText.setAttribute('fill', getCssVar('--viz-text-primary', '#2C2520'));
  countText.textContent = String(data.totalOpen);
  svg.appendChild(countText);

  countContainer.appendChild(svg);
  container.appendChild(countContainer);

  // Primary status with design system class
  const metric = createElement('div', 'viz-metric viz-metric--compact');
  const metricValue = createElement('span', 'viz-metric__value');
  metricValue.textContent = String(data.totalOpen);
  const metricLabel = createElement('span', 'viz-metric__label');
  metricLabel.textContent = t('visualizations.openLoops.open', 'open');
  metric.appendChild(metricValue);
  metric.appendChild(metricLabel);
  container.appendChild(metric);

  // Recently closed
  if (data.recentlyClosed > 0) {
    const closedLabel = createElement('div', 'viz-label');
    closedLabel.textContent = `${data.recentlyClosed} ${t('visualizations.openLoops.closedRecently', 'closed recently')}`;
    container.appendChild(closedLabel);
  }

  // Screen reader label
  container.appendChild(
    createScreenReaderLabel(
      `${data.totalOpen} open loops, ${data.recentlyClosed} recently closed`
    )
  );

  return {
    element: container,
    type: 'open-loops',
    device: 'watch',
    ariaLabel: `${data.totalOpen} open loops, ${data.recentlyClosed} recently closed`,
  };
}

// ============================================================================
// MOBILE BUILDER
// ============================================================================

/**
 * Build open loops for mobile (iOS/Android).
 */
function buildMobile(
  container: HTMLElement,
  data: OpenLoopsData,
  context: DeviceContext
): VisualizationResult {
  container.replaceChildren();
  const isAndroid = context.platform === 'android';

  // Header with design system classes
  const header = createElement('div', 'viz-header');
  const title = createElement('h3', 'viz-header__title', t('visualizations.openLoops.title', 'Open Loops'));
  const subtitle = createElement('p', 'viz-header__subtitle', t('visualizations.openLoops.subtitle', 'Threads waiting to be closed'));
  header.appendChild(title);
  header.appendChild(subtitle);
  container.appendChild(header);

  // Summary card with glass styling
  const summaryCard = createElement('div', 'viz-card viz-animate-slide');
  if (isAndroid) {
    summaryCard.classList.add('viz-card--accent-primary');
  }

  const summaryHeader = createElement('div', 'viz-flex viz-flex--row viz-flex--center viz-flex--between');
  const summaryTitle = createElement('span');
  setStyles(summaryTitle, {
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--viz-text-base)',
    fontWeight: '600',
    color: CSS_COLOR_VARS.textPrimary,
  });
  summaryTitle.textContent = t('visualizations.openLoops.summary', 'Summary');
  summaryHeader.appendChild(summaryTitle);

  const countBadge = createElement('span', 'viz-badge');
  countBadge.textContent = `${data.totalOpen} ${t('visualizations.openLoops.open', 'open')}`;
  summaryHeader.appendChild(countBadge);
  summaryCard.appendChild(summaryHeader);

  // Priority breakdown with design system spacing
  const priorityBreakdown = getPriorityBreakdown(data.loops);
  const priorityRow = createElement('div', 'viz-flex viz-flex--row');
  setStyles(priorityRow, {
    gap: 'var(--viz-space-pause)',
    marginTop: 'var(--viz-space-breath)',
  });

  Object.entries(priorityBreakdown).forEach(([priority, count]) => {
    if (count === 0) return;

    const item = createElement('div', 'viz-flex viz-flex--row viz-flex--center');
    setStyles(item, { gap: 'var(--viz-space-2xs)' });

    const dot = createElement('div', `viz-priority-dot viz-priority-dot--${priority}`);
    item.appendChild(dot);

    const label = createElement('span');
    setStyles(label, {
      fontSize: 'var(--viz-text-base)',
      color: CSS_COLOR_VARS.textSecondary,
    });
    label.textContent = `${count} ${priority}`;
    item.appendChild(label);

    priorityRow.appendChild(item);
  });

  summaryCard.appendChild(priorityRow);

  // Recently closed
  if (data.recentlyClosed > 0) {
    const closedText = createElement('div', 'viz-label');
    setStyles(closedText, { marginTop: 'var(--viz-space-breath)' });
    closedText.textContent = `${data.recentlyClosed} ${t('visualizations.openLoops.closedThisWeek', 'closed this week')}`;
    summaryCard.appendChild(closedText);
  }

  container.appendChild(summaryCard);

  // High priority loops
  const highPriority = data.loops.filter((l) => l.priority === 'high').slice(0, 3);
  if (highPriority.length > 0) {
    const highCard = createElement('div', 'viz-card viz-animate-slide viz-stagger-2');
    if (isAndroid) {
      highCard.classList.add('viz-card--priority-high');
    }

    const highHeader = createElement('div', 'viz-flex viz-flex--row viz-flex--center viz-flex--between');
    const highTitle = createElement('span');
    setStyles(highTitle, {
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--viz-text-base)',
      fontWeight: '600',
      color: CSS_COLOR_VARS.textPrimary,
    });
    highTitle.textContent = t('visualizations.openLoops.highPriority', 'High Priority');
    highHeader.appendChild(highTitle);
    highCard.appendChild(highHeader);

    highPriority.forEach((loop) => {
      const loopItem = buildMobileLoopItem(loop);
      highCard.appendChild(loopItem);
    });

    container.appendChild(highCard);
  }

  // Other loops (up to 4)
  const otherLoops = data.loops
    .filter((l) => l.priority !== 'high')
    .slice(0, 4);

  if (otherLoops.length > 0) {
    const otherCard = createElement('div', 'viz-card viz-animate-slide viz-stagger-3');
    if (isAndroid) {
      otherCard.classList.add('viz-card--accent-secondary');
    }

    const otherHeader = createElement('div', 'viz-flex viz-flex--row viz-flex--center viz-flex--between');
    const otherTitle = createElement('span');
    setStyles(otherTitle, {
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--viz-text-base)',
      fontWeight: '600',
      color: CSS_COLOR_VARS.textPrimary,
    });
    otherTitle.textContent = t('visualizations.openLoops.otherLoops', 'Other Loops');
    otherHeader.appendChild(otherTitle);
    otherCard.appendChild(otherHeader);

    otherLoops.forEach((loop) => {
      const loopItem = buildMobileLoopItem(loop);
      otherCard.appendChild(loopItem);
    });

    container.appendChild(otherCard);
  }

  // Oldest loop callout
  if (data.oldestLoop) {
    const oldestCard = createElement('div', 'viz-card viz-card--warning viz-animate-slide viz-stagger-4');
    if (isAndroid) {
      oldestCard.classList.add('viz-card--accent-warning');
    }

    const oldestHeader = createElement('div', 'viz-flex viz-flex--row viz-flex--center viz-flex--between');
    const oldestTitle = createElement('span');
    setStyles(oldestTitle, {
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--viz-text-base)',
      fontWeight: '600',
      color: CSS_COLOR_VARS.textPrimary,
    });
    oldestTitle.textContent = t('visualizations.openLoops.oldestOpen', 'Oldest Open');
    oldestHeader.appendChild(oldestTitle);
    oldestCard.appendChild(oldestHeader);

    const insight = createElement('p', 'viz-insight');
    insight.textContent = `"${truncate(data.oldestLoop.description, 60)}" - ${formatAge(data.oldestLoop.createdAt)}`;
    oldestCard.appendChild(insight);

    container.appendChild(oldestCard);
  }

  // Screen reader summary
  container.appendChild(
    createScreenReaderLabel(
      `${data.totalOpen} open loops: ${priorityBreakdown.high} high priority, ${priorityBreakdown.medium} medium, ${priorityBreakdown.low} low. ${data.recentlyClosed} recently closed.`
    )
  );

  return {
    element: container,
    type: 'open-loops',
    device: 'mobile',
    ariaLabel: `${data.totalOpen} open loops, ${priorityBreakdown.high} high priority`,
  };
}

/**
 * Build a mobile loop item row.
 */
function buildMobileLoopItem(loop: OpenLoop): HTMLElement {
  const item = createElement('div', 'viz-loop-item');

  const topRow = createElement('div', 'viz-flex viz-flex--row viz-flex--center');
  setStyles(topRow, { gap: 'var(--viz-space-breath)' });

  // Category icon with priority color
  const icon = createElement('span', `viz-loop-icon viz-loop-icon--${loop.priority}`);
  icon.textContent = CATEGORY_ICONS[loop.category];
  topRow.appendChild(icon);

  // Description
  const desc = createElement('span', 'viz-loop-desc');
  desc.textContent = loop.description;
  topRow.appendChild(desc);

  item.appendChild(topRow);

  // Meta row
  const metaRow = createElement('div', 'viz-flex viz-flex--row');
  setStyles(metaRow, {
    gap: 'var(--viz-space-breath)',
    marginTop: 'var(--viz-space-2xs)',
  });

  const categoryLabel = createElement('span', 'viz-label');
  categoryLabel.textContent = CATEGORY_LABELS[loop.category];
  metaRow.appendChild(categoryLabel);

  if (loop.relatedPerson) {
    const personLabel = createElement('span', 'viz-label');
    personLabel.textContent = `with ${loop.relatedPerson}`;
    metaRow.appendChild(personLabel);
  }

  const ageLabel = createElement('span', 'viz-label');
  setStyles(ageLabel, { marginLeft: 'auto' });
  ageLabel.textContent = formatAge(loop.createdAt);
  metaRow.appendChild(ageLabel);

  item.appendChild(metaRow);

  return item;
}

// ============================================================================
// TABLET BUILDER
// ============================================================================

/**
 * Build open loops for tablet with full categorization.
 */
function buildTablet(
  container: HTMLElement,
  data: OpenLoopsData,
  _context: DeviceContext
): VisualizationResult {
  container.replaceChildren();

  // Header with design system classes
  const header = createElement('div', 'viz-header');
  const title = createElement('h3', 'viz-header__title', t('visualizations.openLoops.title', 'Open Loops'));
  const subtitle = createElement('p', 'viz-header__subtitle', t('visualizations.openLoops.subtitle', 'Threads waiting to be closed'));
  header.appendChild(title);
  header.appendChild(subtitle);
  container.appendChild(header);

  // Main content grid
  const contentGrid = createElement('div', 'viz-flex viz-flex--row');
  setStyles(contentGrid, {
    gap: 'var(--viz-space-rest)',
    padding: 'var(--viz-space-pause)',
  });

  // Left: Loops by category
  const loopsSection = createElement('div');
  setStyles(loopsSection, { flex: '2' });

  // Group by category
  const byCategory = groupByCategory(data.loops);

  Object.entries(byCategory).forEach(([category, loops]) => {
    if (loops.length === 0) return;

    const categoryPanel = createElement('div', 'viz-card viz-animate-slide');
    setStyles(categoryPanel, { marginBottom: 'var(--viz-space-pause)' });

    // Category header
    const catHeader = createElement('div', 'viz-flex viz-flex--row viz-flex--center');
    setStyles(catHeader, {
      gap: 'var(--viz-space-breath)',
      marginBottom: 'var(--viz-space-breath)',
    });

    const catIcon = createElement('span', 'viz-category-icon');
    catIcon.textContent = CATEGORY_ICONS[category as OpenLoop['category']];
    catHeader.appendChild(catIcon);

    const catTitle = createElement('span');
    setStyles(catTitle, {
      fontSize: 'var(--viz-text-base)',
      fontWeight: '600',
      color: CSS_COLOR_VARS.textPrimary,
    });
    catTitle.textContent = `${CATEGORY_LABELS[category as OpenLoop['category']]} (${loops.length})`;
    catHeader.appendChild(catTitle);

    categoryPanel.appendChild(catHeader);

    // Loop items
    loops.slice(0, 5).forEach((loop) => {
      const row = createElement('div', 'viz-loop-item');

      // Priority indicator
      const priorityDot = createElement('div', `viz-priority-dot viz-priority-dot--${loop.priority}`);
      row.appendChild(priorityDot);

      // Description
      const desc = createElement('span', 'viz-loop-desc');
      desc.textContent = loop.description;
      row.appendChild(desc);

      // Age
      const age = createElement('span', 'viz-label');
      setStyles(age, { flexShrink: '0' });
      age.textContent = formatAge(loop.createdAt);
      row.appendChild(age);

      categoryPanel.appendChild(row);
    });

    loopsSection.appendChild(categoryPanel);
  });

  contentGrid.appendChild(loopsSection);

  // Right: Stats
  const statsSection = createElement('div');
  setStyles(statsSection, { flex: '1' });

  // Stats panel with glass styling
  const statsPanel = createElement('div', 'viz-card viz-animate-slide viz-stagger-2');
  setStyles(statsPanel, { marginBottom: 'var(--viz-space-pause)' });

  const statsLabel = createElement('div', 'viz-label viz-label--section');
  statsLabel.textContent = t('common.overview', 'Overview');
  statsPanel.appendChild(statsLabel);

  // Total stat
  const totalRow = createElement('div', 'viz-stat-row');
  const totalLabel = createElement('span', 'viz-stat-row__label');
  totalLabel.textContent = t('visualizations.openLoops.totalOpen', 'Total Open');
  totalRow.appendChild(totalLabel);
  const totalValue = createElement('span', 'viz-stat-row__value viz-stat-row__value--accent');
  totalValue.textContent = String(data.totalOpen);
  totalRow.appendChild(totalValue);
  statsPanel.appendChild(totalRow);

  // Recently closed
  const closedRow = createElement('div', 'viz-stat-row');
  const closedLabel = createElement('span', 'viz-stat-row__label');
  closedLabel.textContent = t('visualizations.openLoops.closedThisWeek', 'Closed This Week');
  closedRow.appendChild(closedLabel);
  const closedValue = createElement('span', 'viz-stat-row__value');
  closedValue.textContent = String(data.recentlyClosed);
  closedRow.appendChild(closedValue);
  statsPanel.appendChild(closedRow);

  // Priority breakdown section
  const priorityLabel = createElement('div', 'viz-label viz-label--section');
  setStyles(priorityLabel, { marginTop: 'var(--viz-space-pause)' });
  priorityLabel.textContent = t('visualizations.byPriority', 'By Priority');
  statsPanel.appendChild(priorityLabel);

  const priorityBreakdown = getPriorityBreakdown(data.loops);
  Object.entries(priorityBreakdown).forEach(([priority, count]) => {
    const row = createElement('div', 'viz-flex viz-flex--row viz-flex--center');
    setStyles(row, {
      gap: 'var(--viz-space-breath)',
      marginBottom: 'var(--viz-space-2xs)',
    });

    const dot = createElement('div', `viz-priority-dot viz-priority-dot--${priority}`);
    row.appendChild(dot);

    const label = createElement('span');
    setStyles(label, {
      fontSize: 'var(--viz-text-base)',
      textTransform: 'capitalize',
      flex: '1',
      color: CSS_COLOR_VARS.textSecondary,
    });
    label.textContent = priority;
    row.appendChild(label);

    const value = createElement('span');
    setStyles(value, {
      fontWeight: '600',
      color: CSS_COLOR_VARS.textPrimary,
    });
    value.textContent = String(count);
    row.appendChild(value);

    statsPanel.appendChild(row);
  });

  statsSection.appendChild(statsPanel);

  // Oldest loop card with warning styling
  if (data.oldestLoop) {
    const oldestPanel = createElement('div', 'viz-card viz-card--warning viz-animate-slide viz-stagger-3');

    const oldestLabel = createElement('div', 'viz-label viz-label--warning');
    oldestLabel.textContent = t('visualizations.oldestOpenLoop', 'Oldest Open Loop');
    oldestPanel.appendChild(oldestLabel);

    const oldestDesc = createElement('p');
    setStyles(oldestDesc, {
      fontSize: 'var(--viz-text-base)',
      marginBottom: 'var(--viz-space-2xs)',
      color: CSS_COLOR_VARS.textPrimary,
    });
    oldestDesc.textContent = data.oldestLoop.description;
    oldestPanel.appendChild(oldestDesc);

    const oldestAge = createElement('div', 'viz-label');
    oldestAge.textContent = `${t('visualizations.openLoops.openFor', 'Open for')} ${formatAge(data.oldestLoop.createdAt)}`;
    oldestPanel.appendChild(oldestAge);

    statsSection.appendChild(oldestPanel);
  }

  contentGrid.appendChild(statsSection);
  container.appendChild(contentGrid);

  // Screen reader summary
  container.appendChild(
    createScreenReaderLabel(
      `${data.totalOpen} open loops across ${Object.keys(byCategory).length} categories`
    )
  );

  return {
    element: container,
    type: 'open-loops',
    device: 'tablet',
    ariaLabel: `${data.totalOpen} open loops across ${Object.keys(byCategory).length} categories`,
  };
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build open loops visualization for the given device context.
 */
export function buildOpenLoops(
  container: HTMLElement,
  data: OpenLoopsData,
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
 * Get count of loops per priority.
 */
function getPriorityBreakdown(loops: OpenLoop[]): Record<OpenLoop['priority'], number> {
  const breakdown: Record<OpenLoop['priority'], number> = {
    high: 0,
    medium: 0,
    low: 0,
  };

  loops.forEach((loop) => {
    breakdown[loop.priority]++;
  });

  return breakdown;
}

/**
 * Group loops by category.
 */
function groupByCategory(loops: OpenLoop[]): Record<OpenLoop['category'], OpenLoop[]> {
  const grouped: Record<OpenLoop['category'], OpenLoop[]> = {
    commitment: [],
    question: [],
    intention: [],
    'follow-up': [],
  };

  loops.forEach((loop) => {
    grouped[loop.category].push(loop);
  });

  // Sort each group by priority then by age
  Object.values(grouped).forEach((group) => {
    group.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  });

  return grouped;
}

/**
 * Format age of a loop.
 */
function formatAge(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1 day';
  if (diffDays < 7) return `${diffDays} days`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months`;
  return `${Math.floor(diffDays / 365)} years`;
}

/**
 * Truncate text.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}

// ============================================================================
// EXPORTS
// ============================================================================

export default buildOpenLoops;
