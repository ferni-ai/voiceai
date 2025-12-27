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
  createFlexContainer,
  setStyles,
  createScreenReaderLabel,
} from '../utils/dom.js';
import type {
  OpenLoopsData,
  OpenLoop,
  DeviceContext,
  VisualizationResult,
} from '../types.js';
import { DEFAULT_COLORS } from '../types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const PRIORITY_COLORS: Record<OpenLoop['priority'], string> = {
  high: '#e74c3c',
  medium: DEFAULT_COLORS.status.stretched,
  low: '#9a8f85',
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

  // Header
  const header = createElement('div', 'viz-header');
  header.appendChild(createElement('h3', '', 'Loops'));
  header.appendChild(createElement('p', '', 'Open threads'));
  container.appendChild(header);

  // Loop count visualization
  const countContainer = createElement('div');
  setStyles(countContainer, {
    display: 'flex',
    justifyContent: 'center',
    margin: '8px 0',
  });

  const svg = createSvgElement('svg');
  svg.setAttribute('viewBox', '0 0 60 60');
  setStyles(svg as unknown as HTMLElement, {
    width: '60px',
    height: '60px',
  });

  // Draw open loop circles
  const numCircles = Math.min(data.totalOpen, 5);
  for (let i = 0; i < numCircles; i++) {
    const radius = 22 - i * 4;
    const circle = createSvgElement('circle');
    circle.setAttribute('cx', '30');
    circle.setAttribute('cy', '30');
    circle.setAttribute('r', String(radius));
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', 'var(--color-accent)');
    circle.setAttribute('stroke-width', '2');
    circle.setAttribute('opacity', String(1 - i * 0.15));
    circle.setAttribute('stroke-dasharray', '4 2');
    svg.appendChild(circle);
  }

  // Center count
  const countText = createSvgElement('text');
  countText.setAttribute('x', '30');
  countText.setAttribute('y', '34');
  countText.setAttribute('text-anchor', 'middle');
  countText.setAttribute('font-size', '14');
  countText.setAttribute('font-weight', '600');
  countText.setAttribute('fill', 'var(--color-text-primary)');
  countText.textContent = String(data.totalOpen);
  svg.appendChild(countText);

  countContainer.appendChild(svg);
  container.appendChild(countContainer);

  // Primary status
  const metric = createElement('div', 'watch-metric', `${data.totalOpen} open`);
  container.appendChild(metric);

  // Recently closed
  if (data.recentlyClosed > 0) {
    const closedLabel = createElement('div');
    setStyles(closedLabel, {
      textAlign: 'center',
      fontSize: '0.65rem',
      color: 'var(--color-text-muted)',
    });
    closedLabel.textContent = `${data.recentlyClosed} closed recently`;
    container.appendChild(closedLabel);
  }

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

  // Header
  const header = createElement('div', 'viz-header');
  header.appendChild(createElement('h3', '', 'Open Loops'));
  header.appendChild(createElement('p', '', 'Unfinished threads to close'));
  container.appendChild(header);

  // Summary card
  const summaryCard = createElement('div', 'mobile-card');
  if (isAndroid) {
    setStyles(summaryCard, { borderLeft: '3px solid var(--color-accent)' });
  }

  const summaryHeader = createElement('div', 'mobile-card-header');
  summaryHeader.appendChild(createElement('span', 'mobile-card-title', 'Summary'));

  const countBadge = createElement('span', 'mobile-card-badge', `${data.totalOpen} open`);
  summaryHeader.appendChild(countBadge);
  summaryCard.appendChild(summaryHeader);

  // Priority breakdown
  const priorityBreakdown = getPriorityBreakdown(data.loops);
  const priorityRow = createFlexContainer('row', '16px', 'flex-start');
  setStyles(priorityRow, { marginTop: '8px' });

  Object.entries(priorityBreakdown).forEach(([priority, count]) => {
    if (count === 0) return;

    const item = createFlexContainer('row', '4px', 'flex-start', 'center');

    const dot = createElement('div');
    setStyles(dot, {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: PRIORITY_COLORS[priority as OpenLoop['priority']],
    });
    item.appendChild(dot);

    const label = createElement('span', '', `${count} ${priority}`);
    setStyles(label, { fontSize: '0.85rem' });
    item.appendChild(label);

    priorityRow.appendChild(item);
  });

  summaryCard.appendChild(priorityRow);

  // Recently closed
  if (data.recentlyClosed > 0) {
    const closedText = createElement('div');
    setStyles(closedText, {
      fontSize: '0.85rem',
      color: 'var(--color-text-muted)',
      marginTop: '8px',
    });
    closedText.textContent = `${data.recentlyClosed} closed this week`;
    summaryCard.appendChild(closedText);
  }

  container.appendChild(summaryCard);

  // High priority loops
  const highPriority = data.loops.filter((l) => l.priority === 'high').slice(0, 3);
  if (highPriority.length > 0) {
    const highCard = createElement('div', 'mobile-card');
    if (isAndroid) {
      setStyles(highCard, { borderLeft: `3px solid ${PRIORITY_COLORS.high}` });
    }

    const highHeader = createElement('div', 'mobile-card-header');
    highHeader.appendChild(createElement('span', 'mobile-card-title', 'High Priority'));
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
    const otherCard = createElement('div', 'mobile-card');
    if (isAndroid) {
      setStyles(otherCard, { borderLeft: '3px solid var(--persona-nayan)' });
    }

    const otherHeader = createElement('div', 'mobile-card-header');
    otherHeader.appendChild(createElement('span', 'mobile-card-title', 'Other Loops'));
    otherCard.appendChild(otherHeader);

    otherLoops.forEach((loop) => {
      const loopItem = buildMobileLoopItem(loop);
      otherCard.appendChild(loopItem);
    });

    container.appendChild(otherCard);
  }

  // Oldest loop callout
  if (data.oldestLoop) {
    const oldestCard = createElement('div', 'mobile-card');
    if (isAndroid) {
      setStyles(oldestCard, { borderLeft: '3px solid var(--color-semantic-warning)' });
    }

    const oldestHeader = createElement('div', 'mobile-card-header');
    oldestHeader.appendChild(createElement('span', 'mobile-card-title', 'Oldest Open'));
    oldestCard.appendChild(oldestHeader);

    const insight = createElement('p', 'mobile-insight');
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
  const item = createElement('div');
  setStyles(item, {
    padding: '8px 0',
    borderBottom: '1px solid var(--color-border-subtle)',
  });

  const topRow = createFlexContainer('row', '8px', 'flex-start', 'center');

  // Category icon
  const icon = createElement('span');
  setStyles(icon, {
    fontSize: '0.9rem',
    color: PRIORITY_COLORS[loop.priority],
  });
  icon.textContent = CATEGORY_ICONS[loop.category];
  topRow.appendChild(icon);

  // Description
  const desc = createElement('span');
  setStyles(desc, {
    fontSize: '0.9rem',
    flex: '1',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  });
  desc.textContent = loop.description;
  topRow.appendChild(desc);

  item.appendChild(topRow);

  // Meta row
  const metaRow = createFlexContainer('row', '8px', 'flex-start');
  setStyles(metaRow, { marginTop: '4px' });

  const categoryLabel = createElement('span');
  setStyles(categoryLabel, {
    fontSize: '0.75rem',
    color: 'var(--color-text-muted)',
  });
  categoryLabel.textContent = CATEGORY_LABELS[loop.category];
  metaRow.appendChild(categoryLabel);

  if (loop.relatedPerson) {
    const personLabel = createElement('span');
    setStyles(personLabel, {
      fontSize: '0.75rem',
      color: 'var(--color-text-muted)',
    });
    personLabel.textContent = `with ${loop.relatedPerson}`;
    metaRow.appendChild(personLabel);
  }

  const ageLabel = createElement('span');
  setStyles(ageLabel, {
    fontSize: '0.75rem',
    color: 'var(--color-text-muted)',
    marginLeft: 'auto',
  });
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

  // Header
  const header = createElement('div', 'viz-header');
  header.appendChild(createElement('h3', '', 'Open Loops'));
  header.appendChild(createElement('p', '', 'Threads waiting to be closed'));
  container.appendChild(header);

  // Main content
  const contentGrid = createFlexContainer('row', '24px');
  setStyles(contentGrid, { padding: '16px' });

  // Left: Loops by category
  const loopsSection = createElement('div');
  setStyles(loopsSection, { flex: '2' });

  // Group by category
  const byCategory = groupByCategory(data.loops);

  Object.entries(byCategory).forEach(([category, loops]) => {
    if (loops.length === 0) return;

    const categoryPanel = createElement('div');
    setStyles(categoryPanel, {
      marginBottom: '16px',
      padding: '12px',
      background: 'var(--color-background)',
      borderRadius: '8px',
    });

    // Category header
    const catHeader = createFlexContainer('row', '8px', 'flex-start', 'center');
    setStyles(catHeader, { marginBottom: '8px' });

    const catIcon = createElement('span');
    setStyles(catIcon, {
      fontSize: '1rem',
      color: 'var(--color-accent)',
    });
    catIcon.textContent = CATEGORY_ICONS[category as OpenLoop['category']];
    catHeader.appendChild(catIcon);

    const catTitle = createElement('span');
    setStyles(catTitle, {
      fontSize: '0.9rem',
      fontWeight: '600',
    });
    catTitle.textContent = `${CATEGORY_LABELS[category as OpenLoop['category']]} (${loops.length})`;
    catHeader.appendChild(catTitle);

    categoryPanel.appendChild(catHeader);

    // Loop items
    loops.slice(0, 5).forEach((loop) => {
      const row = createFlexContainer('row', '8px', 'flex-start', 'center');
      setStyles(row, {
        padding: '8px 0',
        borderBottom: '1px solid var(--color-border-subtle)',
      });

      // Priority indicator
      const priorityDot = createElement('div');
      setStyles(priorityDot, {
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: PRIORITY_COLORS[loop.priority],
        flexShrink: '0',
      });
      row.appendChild(priorityDot);

      // Description
      const desc = createElement('span');
      setStyles(desc, {
        fontSize: '0.85rem',
        flex: '1',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      });
      desc.textContent = loop.description;
      row.appendChild(desc);

      // Age
      const age = createElement('span');
      setStyles(age, {
        fontSize: '0.75rem',
        color: 'var(--color-text-muted)',
        flexShrink: '0',
      });
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

  // Stats panel
  const statsPanel = createElement('div');
  setStyles(statsPanel, {
    padding: '16px',
    background: 'var(--color-bg-elevated)',
    borderRadius: '12px',
    border: '1px solid var(--color-border-subtle)',
    marginBottom: '12px',
  });

  const statsLabel = createElement('div');
  setStyles(statsLabel, {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: 'var(--color-text-muted)',
    marginBottom: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  });
  statsLabel.textContent = 'Overview';
  statsPanel.appendChild(statsLabel);

  // Total
  const totalRow = createFlexContainer('row', '8px', 'space-between');
  setStyles(totalRow, { marginBottom: '8px' });
  totalRow.appendChild(createElement('span', '', 'Total Open'));
  const totalValue = createElement('span', '', String(data.totalOpen));
  setStyles(totalValue, { fontWeight: '600', fontSize: '1.2rem', color: 'var(--color-accent)' });
  totalRow.appendChild(totalValue);
  statsPanel.appendChild(totalRow);

  // Recently closed
  const closedRow = createFlexContainer('row', '8px', 'space-between');
  setStyles(closedRow, { marginBottom: '12px' });
  closedRow.appendChild(createElement('span', '', 'Closed This Week'));
  const closedValue = createElement('span', '', String(data.recentlyClosed));
  setStyles(closedValue, { fontWeight: '600' });
  closedRow.appendChild(closedValue);
  statsPanel.appendChild(closedRow);

  // Priority breakdown
  const priorityLabel = createElement('div');
  setStyles(priorityLabel, {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: 'var(--color-text-muted)',
    marginBottom: '8px',
    marginTop: '12px',
  });
  priorityLabel.textContent = 'By Priority';
  statsPanel.appendChild(priorityLabel);

  const priorityBreakdown = getPriorityBreakdown(data.loops);
  Object.entries(priorityBreakdown).forEach(([priority, count]) => {
    const row = createFlexContainer('row', '8px', 'flex-start', 'center');
    setStyles(row, { marginBottom: '4px' });

    const dot = createElement('div');
    setStyles(dot, {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: PRIORITY_COLORS[priority as OpenLoop['priority']],
    });
    row.appendChild(dot);

    const label = createElement('span');
    setStyles(label, { fontSize: '0.85rem', textTransform: 'capitalize', flex: '1' });
    label.textContent = priority;
    row.appendChild(label);

    const value = createElement('span');
    setStyles(value, { fontWeight: '600' });
    value.textContent = String(count);
    row.appendChild(value);

    statsPanel.appendChild(row);
  });

  statsSection.appendChild(statsPanel);

  // Oldest loop
  if (data.oldestLoop) {
    const oldestPanel = createElement('div');
    setStyles(oldestPanel, {
      padding: '12px',
      background: 'rgba(230, 126, 34, 0.1)',
      borderRadius: '8px',
      border: '1px solid var(--color-semantic-warning)',
    });

    const oldestLabel = createElement('div');
    setStyles(oldestLabel, {
      fontSize: '0.75rem',
      fontWeight: '600',
      color: 'var(--color-semantic-warning)',
      marginBottom: '8px',
    });
    oldestLabel.textContent = 'Oldest Open Loop';
    oldestPanel.appendChild(oldestLabel);

    const oldestDesc = createElement('p');
    setStyles(oldestDesc, {
      fontSize: '0.85rem',
      marginBottom: '4px',
    });
    oldestDesc.textContent = data.oldestLoop.description;
    oldestPanel.appendChild(oldestDesc);

    const oldestAge = createElement('div');
    setStyles(oldestAge, {
      fontSize: '0.75rem',
      color: 'var(--color-text-muted)',
    });
    oldestAge.textContent = `Open for ${formatAge(data.oldestLoop.createdAt)}`;
    oldestPanel.appendChild(oldestAge);

    statsSection.appendChild(oldestPanel);
  }

  contentGrid.appendChild(statsSection);
  container.appendChild(contentGrid);

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
