/**
 * Relationship Network Visualization Builder
 *
 * Displays relationship network as a constellation/network graph.
 * Adapts to different device sizes:
 * - Watch: Connection count with top relationship
 * - Mobile: Card-based relationship list with strength indicators
 * - Tablet: Full network visualization with nodes and connections
 *
 * @module visualizations/builders/relationship-network
 */

import {
  createElement,
  createSvgElement,
  createFlexContainer,
  setStyles,
  createScreenReaderLabel,
} from '../utils/dom.js';
import type {
  RelationshipNetworkData,
  Relationship,
  DeviceContext,
  VisualizationResult,
} from '../types.js';
import { DEFAULT_COLORS } from '../types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const CATEGORY_COLORS: Record<Relationship['category'], string> = {
  family: '#e74c3c',
  friend: DEFAULT_COLORS.accent,
  colleague: '#3a6b73',
  mentor: '#8a7a9a',
  other: '#9a8f85',
};

const TREND_LABELS: Record<Relationship['trend'], string> = {
  deepening: 'Growing closer',
  stable: 'Steady',
  fading: 'Needs attention',
};

// ============================================================================
// WATCH BUILDER
// ============================================================================

/**
 * Build compact relationship network for watch.
 */
function buildWatch(
  container: HTMLElement,
  data: RelationshipNetworkData
): VisualizationResult {
  container.replaceChildren();

  // Header
  const header = createElement('div', 'viz-header');
  header.appendChild(createElement('h3', '', 'Network'));
  header.appendChild(createElement('p', '', 'Your connections'));
  container.appendChild(header);

  // Connection count ring
  const ringContainer = createElement('div');
  setStyles(ringContainer, {
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

  // Draw mini constellation
  const centerX = 30;
  const centerY = 30;

  // Center node (you)
  const centerDot = createSvgElement('circle');
  centerDot.setAttribute('cx', String(centerX));
  centerDot.setAttribute('cy', String(centerY));
  centerDot.setAttribute('r', '6');
  centerDot.setAttribute('fill', 'var(--color-accent)');
  svg.appendChild(centerDot);

  // Connection nodes (up to 6)
  const topConnections = [...data.relationships]
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 6);

  topConnections.forEach((rel, i) => {
    const angle = (Math.PI * 2 * i) / topConnections.length - Math.PI / 2;
    const distance = 18;
    const x = centerX + distance * Math.cos(angle);
    const y = centerY + distance * Math.sin(angle);

    // Connection line
    const line = createSvgElement('line');
    line.setAttribute('x1', String(centerX));
    line.setAttribute('y1', String(centerY));
    line.setAttribute('x2', String(x));
    line.setAttribute('y2', String(y));
    line.setAttribute('stroke', CATEGORY_COLORS[rel.category]);
    line.setAttribute('stroke-width', String(1 + rel.strength));
    line.setAttribute('opacity', String(0.3 + rel.strength * 0.5));
    svg.appendChild(line);

    // Node
    const node = createSvgElement('circle');
    node.setAttribute('cx', String(x));
    node.setAttribute('cy', String(y));
    node.setAttribute('r', String(3 + rel.strength * 2));
    node.setAttribute('fill', CATEGORY_COLORS[rel.category]);
    svg.appendChild(node);
  });

  ringContainer.appendChild(svg);
  container.appendChild(ringContainer);

  // Active count
  const metric = createElement('div', 'watch-metric', `${data.activeConnections} active`);
  container.appendChild(metric);

  // Needs attention indicator
  if (data.needsAttention.length > 0) {
    const attention = createElement('div');
    setStyles(attention, {
      textAlign: 'center',
      fontSize: '0.65rem',
      color: 'var(--color-semantic-warning)',
    });
    attention.textContent = `${data.needsAttention.length} need attention`;
    container.appendChild(attention);
  }

  return {
    element: container,
    type: 'relationship-network',
    device: 'watch',
    ariaLabel: `Relationship network with ${data.activeConnections} active connections out of ${data.totalConnections}`,
  };
}

// ============================================================================
// MOBILE BUILDER
// ============================================================================

/**
 * Build relationship network for mobile (iOS/Android).
 */
function buildMobile(
  container: HTMLElement,
  data: RelationshipNetworkData,
  context: DeviceContext
): VisualizationResult {
  container.replaceChildren();
  const isAndroid = context.platform === 'android';

  // Header
  const header = createElement('div', 'viz-header');
  header.appendChild(createElement('h3', '', 'Relationship Network'));
  header.appendChild(createElement('p', '', `${data.activeConnections} of ${data.totalConnections} active`));
  container.appendChild(header);

  // Summary card
  const summaryCard = createElement('div', 'mobile-card');
  if (isAndroid) {
    setStyles(summaryCard, { borderLeft: '3px solid var(--color-accent)' });
  }

  const summaryHeader = createElement('div', 'mobile-card-header');
  summaryHeader.appendChild(createElement('span', 'mobile-card-title', 'Your Circle'));
  summaryCard.appendChild(summaryHeader);

  // Category breakdown
  const categories = getCategoryBreakdown(data.relationships);
  const categoryRow = createFlexContainer('row', '12px', 'flex-start');
  setStyles(categoryRow, { flexWrap: 'wrap', marginTop: '8px' });

  Object.entries(categories).forEach(([category, count]) => {
    if (count === 0) return;

    const chip = createElement('div');
    setStyles(chip, {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      padding: '4px 8px',
      background: 'var(--color-background)',
      borderRadius: isAndroid ? '4px' : '12px',
      fontSize: '0.75rem',
    });

    const dot = createElement('div');
    setStyles(dot, {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: CATEGORY_COLORS[category as Relationship['category']],
    });
    chip.appendChild(dot);

    chip.appendChild(createElement('span', '', `${count} ${category}`));
    categoryRow.appendChild(chip);
  });

  summaryCard.appendChild(categoryRow);
  container.appendChild(summaryCard);

  // Top relationships
  const topRelationships = [...data.relationships]
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 4);

  topRelationships.forEach((rel) => {
    const card = createElement('div', 'mobile-card');
    const color = CATEGORY_COLORS[rel.category];

    if (isAndroid) {
      setStyles(card, { borderLeft: `3px solid ${color}` });
    }

    const cardHeader = createElement('div', 'mobile-card-header');

    const nameRow = createFlexContainer('row', '8px', 'flex-start', 'center');
    const nameEl = createElement('span', 'mobile-card-title', rel.name);
    nameRow.appendChild(nameEl);

    // Trend indicator
    const trendEl = createElement('span');
    setStyles(trendEl, {
      fontSize: '0.75rem',
      color: rel.trend === 'fading' ? 'var(--color-semantic-warning)' : 'var(--color-text-muted)',
    });
    trendEl.textContent = TREND_LABELS[rel.trend];
    nameRow.appendChild(trendEl);
    cardHeader.appendChild(nameRow);

    const categoryBadge = createElement('span', 'mobile-card-badge', rel.category);
    setStyles(categoryBadge, { background: color, textTransform: 'capitalize' });
    cardHeader.appendChild(categoryBadge);
    card.appendChild(cardHeader);

    // Strength bar
    const strengthRow = createFlexContainer('row', '8px', 'flex-start', 'center');
    setStyles(strengthRow, { marginTop: '8px' });

    const strengthLabel = createElement('span', '', 'Connection');
    setStyles(strengthLabel, { fontSize: '0.85rem', color: 'var(--color-text-secondary)' });
    strengthRow.appendChild(strengthLabel);

    const strengthBar = createElement('div');
    setStyles(strengthBar, {
      flex: '1',
      height: '6px',
      background: 'rgba(44, 37, 32, 0.1)',
      borderRadius: isAndroid ? '0' : '3px',
      overflow: 'hidden',
    });

    const strengthFill = createElement('div');
    setStyles(strengthFill, {
      width: `${rel.strength * 100}%`,
      height: '100%',
      background: color,
      borderRadius: isAndroid ? '0' : '3px',
    });
    strengthBar.appendChild(strengthFill);
    strengthRow.appendChild(strengthBar);
    card.appendChild(strengthRow);

    // Last contact
    const lastContact = createElement('div');
    setStyles(lastContact, {
      fontSize: '0.75rem',
      color: 'var(--color-text-muted)',
      marginTop: '4px',
    });
    lastContact.textContent = `Last contact: ${formatRelativeDate(rel.lastContact)}`;
    card.appendChild(lastContact);

    container.appendChild(card);
  });

  // Needs attention card
  if (data.needsAttention.length > 0) {
    const attentionCard = createElement('div', 'mobile-card');
    if (isAndroid) {
      setStyles(attentionCard, { borderLeft: '3px solid var(--color-semantic-warning)' });
    }

    const attentionHeader = createElement('div', 'mobile-card-header');
    attentionHeader.appendChild(createElement('span', 'mobile-card-title', 'Needs Attention'));
    attentionCard.appendChild(attentionHeader);

    const attentionList = createElement('p', 'mobile-insight');
    attentionList.textContent = data.needsAttention.join(', ');
    attentionCard.appendChild(attentionList);
    container.appendChild(attentionCard);
  }

  // Screen reader summary
  container.appendChild(
    createScreenReaderLabel(
      `Relationship network with ${data.totalConnections} connections, ${data.activeConnections} active. ${data.needsAttention.length} relationships need attention.`
    )
  );

  return {
    element: container,
    type: 'relationship-network',
    device: 'mobile',
    ariaLabel: `Relationship network with ${data.totalConnections} connections`,
  };
}

// ============================================================================
// TABLET BUILDER
// ============================================================================

/**
 * Build relationship network for tablet with full visualization.
 */
function buildTablet(
  container: HTMLElement,
  data: RelationshipNetworkData,
  _context: DeviceContext
): VisualizationResult {
  container.replaceChildren();

  // Header
  const header = createElement('div', 'viz-header');
  header.appendChild(createElement('h3', '', 'Relationship Network'));
  header.appendChild(createElement('p', '', 'Your constellation of connections'));
  container.appendChild(header);

  // Main content
  const contentGrid = createFlexContainer('row', '24px');
  setStyles(contentGrid, { padding: '16px' });

  // Left: Network visualization
  const networkSection = createElement('div');
  setStyles(networkSection, { flex: '2', display: 'flex', justifyContent: 'center' });

  const svg = createSvgElement('svg');
  svg.setAttribute('viewBox', '0 0 300 250');
  setStyles(svg as unknown as HTMLElement, { width: '100%', maxWidth: '350px' });

  const centerX = 150;
  const centerY = 125;

  // Sort by strength for layout
  const sortedRels = [...data.relationships].sort((a, b) => b.strength - a.strength);

  // Position nodes in concentric rings based on strength
  const positions: Array<{ rel: Relationship; x: number; y: number }> = [];

  sortedRels.forEach((rel, i) => {
    // Inner ring for strong, outer for weak
    const ringRadius = 40 + (1 - rel.strength) * 60;
    const angle = (Math.PI * 2 * i) / sortedRels.length - Math.PI / 2;

    // Add some randomness for organic feel
    const jitterX = (Math.random() - 0.5) * 15;
    const jitterY = (Math.random() - 0.5) * 15;

    const x = centerX + ringRadius * Math.cos(angle) + jitterX;
    const y = centerY + ringRadius * Math.sin(angle) + jitterY;

    positions.push({ rel, x, y });
  });

  // Draw connections first (behind nodes)
  positions.forEach(({ rel, x, y }) => {
    const line = createSvgElement('line');
    line.setAttribute('x1', String(centerX));
    line.setAttribute('y1', String(centerY));
    line.setAttribute('x2', String(x));
    line.setAttribute('y2', String(y));
    line.setAttribute('stroke', CATEGORY_COLORS[rel.category]);
    line.setAttribute('stroke-width', String(1 + rel.strength * 2));
    line.setAttribute('opacity', String(0.2 + rel.strength * 0.3));
    svg.appendChild(line);
  });

  // Center node (you)
  const centerCircle = createSvgElement('circle');
  centerCircle.setAttribute('cx', String(centerX));
  centerCircle.setAttribute('cy', String(centerY));
  centerCircle.setAttribute('r', '12');
  centerCircle.setAttribute('fill', 'var(--color-accent)');
  svg.appendChild(centerCircle);

  const centerLabel = createSvgElement('text');
  centerLabel.setAttribute('x', String(centerX));
  centerLabel.setAttribute('y', String(centerY + 3));
  centerLabel.setAttribute('text-anchor', 'middle');
  centerLabel.setAttribute('font-size', '8');
  centerLabel.setAttribute('fill', 'white');
  centerLabel.setAttribute('font-weight', '600');
  centerLabel.textContent = 'You';
  svg.appendChild(centerLabel);

  // Draw nodes
  positions.forEach(({ rel, x, y }) => {
    const nodeSize = 6 + rel.strength * 6;

    // Glow for fading relationships
    if (rel.trend === 'fading') {
      const glow = createSvgElement('circle');
      glow.setAttribute('cx', String(x));
      glow.setAttribute('cy', String(y));
      glow.setAttribute('r', String(nodeSize + 4));
      glow.setAttribute('fill', 'var(--color-semantic-warning)');
      glow.setAttribute('opacity', '0.3');
      svg.appendChild(glow);
    }

    const node = createSvgElement('circle');
    node.setAttribute('cx', String(x));
    node.setAttribute('cy', String(y));
    node.setAttribute('r', String(nodeSize));
    node.setAttribute('fill', CATEGORY_COLORS[rel.category]);
    svg.appendChild(node);

    // Name label (only for top connections)
    if (rel.strength >= 0.6) {
      const label = createSvgElement('text');
      label.setAttribute('x', String(x));
      label.setAttribute('y', String(y + nodeSize + 12));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size', '9');
      label.setAttribute('fill', 'var(--color-text-secondary)');
      label.textContent = truncateName(rel.name);
      svg.appendChild(label);
    }
  });

  networkSection.appendChild(svg);
  contentGrid.appendChild(networkSection);

  // Right: Details
  const detailsSection = createElement('div');
  setStyles(detailsSection, { flex: '1' });

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
  statsLabel.textContent = 'Network Stats';
  statsPanel.appendChild(statsLabel);

  // Stat rows
  const stats = [
    { label: 'Total Connections', value: data.totalConnections },
    { label: 'Active', value: data.activeConnections },
    { label: 'Needs Attention', value: data.needsAttention.length },
  ];

  stats.forEach((stat) => {
    const row = createFlexContainer('row', '8px', 'space-between');
    setStyles(row, { marginBottom: '8px' });

    row.appendChild(createElement('span', '', stat.label));

    const value = createElement('span', '', String(stat.value));
    setStyles(value, { fontWeight: '600' });
    row.appendChild(value);

    statsPanel.appendChild(row);
  });

  detailsSection.appendChild(statsPanel);

  // Category legend
  const legendPanel = createElement('div');
  setStyles(legendPanel, {
    padding: '12px',
    background: 'var(--color-background)',
    borderRadius: '8px',
  });

  const legendLabel = createElement('div');
  setStyles(legendLabel, {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: 'var(--color-text-muted)',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  });
  legendLabel.textContent = 'Categories';
  legendPanel.appendChild(legendLabel);

  const categories = getCategoryBreakdown(data.relationships);
  Object.entries(categories).forEach(([category, count]) => {
    if (count === 0) return;

    const row = createFlexContainer('row', '8px', 'flex-start', 'center');
    setStyles(row, { marginBottom: '4px' });

    const dot = createElement('div');
    setStyles(dot, {
      width: '10px',
      height: '10px',
      borderRadius: '50%',
      background: CATEGORY_COLORS[category as Relationship['category']],
    });
    row.appendChild(dot);

    const label = createElement('span', '', `${category} (${count})`);
    setStyles(label, {
      fontSize: '0.85rem',
      textTransform: 'capitalize',
    });
    row.appendChild(label);

    legendPanel.appendChild(row);
  });

  detailsSection.appendChild(legendPanel);

  // Needs attention list
  if (data.needsAttention.length > 0) {
    const attentionPanel = createElement('div');
    setStyles(attentionPanel, {
      padding: '12px',
      background: 'rgba(230, 126, 34, 0.1)',
      borderRadius: '8px',
      marginTop: '12px',
      border: '1px solid var(--color-semantic-warning)',
    });

    const attentionLabel = createElement('div');
    setStyles(attentionLabel, {
      fontSize: '0.75rem',
      fontWeight: '600',
      color: 'var(--color-semantic-warning)',
      marginBottom: '8px',
    });
    attentionLabel.textContent = 'Reconnect With';
    attentionPanel.appendChild(attentionLabel);

    data.needsAttention.slice(0, 3).forEach((name) => {
      const nameEl = createElement('div');
      setStyles(nameEl, {
        fontSize: '0.85rem',
        marginBottom: '4px',
      });
      nameEl.textContent = name;
      attentionPanel.appendChild(nameEl);
    });

    detailsSection.appendChild(attentionPanel);
  }

  contentGrid.appendChild(detailsSection);
  container.appendChild(contentGrid);

  return {
    element: container,
    type: 'relationship-network',
    device: 'tablet',
    ariaLabel: `Relationship network with ${data.totalConnections} connections in ${Object.keys(categories).length} categories`,
  };
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build relationship network visualization for the given device context.
 */
export function buildRelationshipNetwork(
  container: HTMLElement,
  data: RelationshipNetworkData,
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
 * Get count of relationships per category.
 */
function getCategoryBreakdown(
  relationships: Relationship[]
): Record<Relationship['category'], number> {
  const breakdown: Record<Relationship['category'], number> = {
    family: 0,
    friend: 0,
    colleague: 0,
    mentor: 0,
    other: 0,
  };

  relationships.forEach((rel) => {
    breakdown[rel.category]++;
  });

  return breakdown;
}

/**
 * Format ISO date to relative date string.
 */
function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

/**
 * Truncate name for display.
 */
function truncateName(name: string): string {
  if (name.length <= 10) return name;
  return name.split(' ')[0]; // First name only
}

// ============================================================================
// EXPORTS
// ============================================================================

export default buildRelationshipNetwork;
