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
  getCssVar,
} from '../utils/dom.js';
import type {
  RelationshipNetworkData,
  Relationship,
  DeviceContext,
  VisualizationResult,
} from '../types.js';
import { t } from '../../../i18n/index.js';

// ============================================================================
// CONSTANTS - Using CSS Variables for brand consistency
// ============================================================================

// CSS variable names for consistent theming
const CATEGORY_CSS_VARS: Record<Relationship['category'], string> = {
  family: 'var(--color-semantic-error, #e74c3c)',
  friend: 'var(--color-accent, #3D5A45)',
  colleague: 'var(--persona-peter-primary, #3a6b73)',
  mentor: 'var(--persona-eli-primary, #8a7a9a)',
  other: 'var(--color-text-muted, #9a8f85)',
};

// Computed colors for SVG attributes that need hex values
const CATEGORY_COLORS: Record<Relationship['category'], string> = {
  family: getCssVar('--color-semantic-error', '#e74c3c'),
  friend: getCssVar('--color-accent', '#3D5A45'),
  colleague: getCssVar('--persona-peter-primary', '#3a6b73'),
  mentor: getCssVar('--persona-eli-primary', '#8a7a9a'),
  other: getCssVar('--color-text-muted', '#9a8f85'),
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
  const categoryRow = createFlexContainer('row', '10px', 'flex-start');
  setStyles(categoryRow, {
    flexWrap: 'wrap',
    marginTop: '0.625rem',
    gap: '0.5rem',
  });

  Object.entries(categories).forEach(([category, count]) => {
    if (count === 0) return;

    const chip = createElement('div');
    setStyles(chip, {
      display: 'flex',
      alignItems: 'center',
      gap: '0.375rem',
      padding: '0.375rem 0.625rem',
      background: 'var(--tonal-surface1, rgba(44, 37, 32, 0.04))',
      borderRadius: isAndroid ? 'var(--radius-sm, 0.375rem)' : 'var(--radius-full, 9999px)',
      fontSize: '0.75rem',
      fontWeight: '500',
      color: 'var(--color-text-secondary)',
      transition: 'background 150ms',
    });

    const dot = createElement('div');
    setStyles(dot, {
      width: '0.5rem',
      height: '0.5rem',
      borderRadius: '50%',
      background: CATEGORY_CSS_VARS[category as Relationship['category']],
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
    });
    chip.appendChild(dot);

    const label = createElement('span');
    label.textContent = `${count} ${category}`;
    setStyles(label, { textTransform: 'capitalize' });
    chip.appendChild(label);
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
 * 
 * Design improvements:
 * - Larger, more prominent network graph
 * - Better proportions (65/35 split)
 * - MA spacing philosophy (pause=13px, rest=21px, silence=34px)
 * - Glass morphism panels
 * - Improved typography hierarchy
 */
function buildTablet(
  container: HTMLElement,
  data: RelationshipNetworkData,
  _context: DeviceContext
): VisualizationResult {
  container.replaceChildren();
  
  // Apply container styles
  setStyles(container, {
    padding: '1.5rem', // More generous padding
    minHeight: '320px',
  });

  // Header with improved typography
  const header = createElement('div', 'viz-header');
  setStyles(header, {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1.3125rem', // MA: rest (21px)
    paddingBottom: '0.8125rem', // MA: pause (13px)
    borderBottom: '1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.06))',
  });
  
  const headerText = createElement('div');
  const title = createElement('h3');
  setStyles(title, {
    fontFamily: 'var(--font-display, "Plus Jakarta Sans", sans-serif)',
    fontSize: '1.0625rem', // cardTitle
    fontWeight: '600',
    lineHeight: '1.3',
    letterSpacing: '-0.01em',
    color: 'var(--color-text-primary, #2C2520)',
    margin: '0 0 0.25rem',
  });
  title.textContent = 'Relationship Network';
  
  const subtitle = createElement('p');
  setStyles(subtitle, {
    fontFamily: 'var(--font-body, Inter, sans-serif)',
    fontSize: '0.75rem', // caption
    fontWeight: '500',
    color: 'var(--color-text-muted, #8a8279)',
    margin: '0',
    letterSpacing: '0.01em',
  });
  subtitle.textContent = 'Your constellation of connections';
  
  headerText.appendChild(title);
  headerText.appendChild(subtitle);
  header.appendChild(headerText);
  
  // Active badge in header
  const activeBadge = createElement('div');
  setStyles(activeBadge, {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    padding: '0.375rem 0.75rem',
    background: 'var(--color-accent-subtle, rgba(61, 90, 69, 0.08))',
    borderRadius: 'var(--radius-full, 9999px)',
    fontSize: '0.6875rem',
    fontWeight: '600',
    color: 'var(--color-accent, #3D5A45)',
    letterSpacing: '0.02em',
  });
  activeBadge.textContent = `${data.activeConnections} active`;
  header.appendChild(activeBadge);
  
  container.appendChild(header);

  // Main content grid - 65/35 split for better proportions
  const contentGrid = createElement('div');
  setStyles(contentGrid, {
    display: 'grid',
    gridTemplateColumns: '1fr 220px', // Fixed width sidebar
    gap: '1.5rem', // More breathing room
    alignItems: 'start',
  });

  // Left: Network visualization with better sizing
  const networkSection = createElement('div');
  setStyles(networkSection, {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    background: 'var(--tonal-surface1, rgba(44, 37, 32, 0.015))',
    borderRadius: 'var(--radius-xl, 1.25rem)',
    padding: '1rem',
    minHeight: '240px',
  });

  const svg = createSvgElement('svg');
  svg.setAttribute('viewBox', '0 0 360 280'); // Larger viewBox
  setStyles(svg as unknown as HTMLElement, {
    width: '100%',
    maxWidth: '400px',
    height: 'auto',
  });
  
  // Add subtle background gradient to SVG
  const defs = createSvgElement('defs');
  const radialGrad = createSvgElement('radialGradient');
  radialGrad.setAttribute('id', 'centerGlow');
  radialGrad.setAttribute('cx', '50%');
  radialGrad.setAttribute('cy', '50%');
  radialGrad.setAttribute('r', '50%');
  
  const stop1 = createSvgElement('stop');
  stop1.setAttribute('offset', '0%');
  stop1.setAttribute('stop-color', 'var(--color-accent, #3D5A45)');
  stop1.setAttribute('stop-opacity', '0.06');
  const stop2 = createSvgElement('stop');
  stop2.setAttribute('offset', '100%');
  stop2.setAttribute('stop-color', 'var(--color-accent, #3D5A45)');
  stop2.setAttribute('stop-opacity', '0');
  
  radialGrad.appendChild(stop1);
  radialGrad.appendChild(stop2);
  defs.appendChild(radialGrad);
  svg.appendChild(defs);
  
  // Background glow
  const bgCircle = createSvgElement('circle');
  bgCircle.setAttribute('cx', '180');
  bgCircle.setAttribute('cy', '140');
  bgCircle.setAttribute('r', '120');
  bgCircle.setAttribute('fill', 'url(#centerGlow)');
  svg.appendChild(bgCircle);

  const centerX = 180;
  const centerY = 140;

  // Sort by strength for layout
  const sortedRels = [...data.relationships].sort((a, b) => b.strength - a.strength);

  // Position nodes with better spacing algorithm
  const positions: Array<{ rel: Relationship; x: number; y: number }> = [];
  
  // Use deterministic positioning based on index for consistent layout
  const seed = data.totalConnections; // Consistent "randomness"
  sortedRels.forEach((rel, i) => {
    // Inner ring for strong connections, outer for weaker
    const strengthFactor = 1 - rel.strength;
    const ringRadius = 55 + strengthFactor * 65; // 55-120px range
    const angleOffset = (seed * 0.1) % (Math.PI * 0.5); // Consistent rotation
    const angle = (Math.PI * 2 * i) / sortedRels.length - Math.PI / 2 + angleOffset;

    // Deterministic jitter based on index
    const jitterX = Math.sin(i * 2.5 + seed) * 12;
    const jitterY = Math.cos(i * 3.1 + seed) * 12;

    const x = centerX + ringRadius * Math.cos(angle) + jitterX;
    const y = centerY + ringRadius * Math.sin(angle) + jitterY;

    positions.push({ rel, x, y });
  });

  // Draw connections first (behind nodes) with gradient strokes
  positions.forEach(({ rel, x, y }) => {
    const line = createSvgElement('line');
    line.setAttribute('x1', String(centerX));
    line.setAttribute('y1', String(centerY));
    line.setAttribute('x2', String(x));
    line.setAttribute('y2', String(y));
    line.setAttribute('stroke', CATEGORY_COLORS[rel.category]);
    line.setAttribute('stroke-width', String(1.5 + rel.strength * 2.5));
    line.setAttribute('opacity', String(0.25 + rel.strength * 0.35));
    line.setAttribute('stroke-linecap', 'round');
    svg.appendChild(line);
  });

  // Center node with glow effect (you)
  const centerGlow = createSvgElement('circle');
  centerGlow.setAttribute('cx', String(centerX));
  centerGlow.setAttribute('cy', String(centerY));
  centerGlow.setAttribute('r', '22');
  centerGlow.setAttribute('fill', 'var(--color-accent, #3D5A45)');
  centerGlow.setAttribute('opacity', '0.15');
  svg.appendChild(centerGlow);
  
  const centerCircle = createSvgElement('circle');
  centerCircle.setAttribute('cx', String(centerX));
  centerCircle.setAttribute('cy', String(centerY));
  centerCircle.setAttribute('r', '16');
  centerCircle.setAttribute('fill', 'var(--color-accent, #3D5A45)');
  svg.appendChild(centerCircle);

  const centerLabel = createSvgElement('text');
  centerLabel.setAttribute('x', String(centerX));
  centerLabel.setAttribute('y', String(centerY + 4));
  centerLabel.setAttribute('text-anchor', 'middle');
  centerLabel.setAttribute('font-size', '11');
  centerLabel.setAttribute('fill', 'white');
  centerLabel.setAttribute('font-weight', '600');
  centerLabel.setAttribute('font-family', 'var(--font-body, Inter, sans-serif)');
  centerLabel.textContent = t('common.you', 'You');
  svg.appendChild(centerLabel);

  // Draw nodes with improved styling
  positions.forEach(({ rel, x, y }) => {
    const nodeSize = 8 + rel.strength * 7; // 8-15px range

    // Glow ring for fading relationships (needs attention)
    if (rel.trend === 'fading') {
      const pulseGlow = createSvgElement('circle');
      pulseGlow.setAttribute('cx', String(x));
      pulseGlow.setAttribute('cy', String(y));
      pulseGlow.setAttribute('r', String(nodeSize + 6));
      pulseGlow.setAttribute('fill', 'none');
      pulseGlow.setAttribute('stroke', 'var(--color-semantic-warning, #e67e22)');
      pulseGlow.setAttribute('stroke-width', '2');
      pulseGlow.setAttribute('opacity', '0.4');
      svg.appendChild(pulseGlow);
    }
    
    // Outer ring for depth
    const outerRing = createSvgElement('circle');
    outerRing.setAttribute('cx', String(x));
    outerRing.setAttribute('cy', String(y));
    outerRing.setAttribute('r', String(nodeSize + 2));
    outerRing.setAttribute('fill', CATEGORY_COLORS[rel.category]);
    outerRing.setAttribute('opacity', '0.2');
    svg.appendChild(outerRing);

    // Main node
    const node = createSvgElement('circle');
    node.setAttribute('cx', String(x));
    node.setAttribute('cy', String(y));
    node.setAttribute('r', String(nodeSize));
    node.setAttribute('fill', CATEGORY_COLORS[rel.category]);
    svg.appendChild(node);

    // Name label with background pill for top connections
    if (rel.strength >= 0.5) {
      const labelY = y + nodeSize + 14;
      const displayName = truncateName(rel.name);
      
      // Label background for readability
      const labelBg = createSvgElement('rect');
      const textWidth = displayName.length * 5 + 8;
      labelBg.setAttribute('x', String(x - textWidth / 2));
      labelBg.setAttribute('y', String(labelY - 9));
      labelBg.setAttribute('width', String(textWidth));
      labelBg.setAttribute('height', '14');
      labelBg.setAttribute('rx', '7');
      labelBg.setAttribute('fill', 'var(--color-bg-elevated, #FFFDFB)');
      labelBg.setAttribute('opacity', '0.9');
      svg.appendChild(labelBg);
      
      const label = createSvgElement('text');
      label.setAttribute('x', String(x));
      label.setAttribute('y', String(labelY));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size', '10');
      label.setAttribute('font-weight', '500');
      label.setAttribute('fill', 'var(--color-text-secondary, #5c544a)');
      label.setAttribute('font-family', 'var(--font-body, Inter, sans-serif)');
      label.textContent = displayName;
      svg.appendChild(label);
    }
  });

  networkSection.appendChild(svg);
  contentGrid.appendChild(networkSection);

  // Right: Details sidebar with improved spacing
  const detailsSection = createElement('div');
  setStyles(detailsSection, {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.8125rem', // MA: pause (13px)
  });

  // Stats panel with glass morphism
  const statsPanel = createElement('div');
  setStyles(statsPanel, {
    padding: '1rem 1.125rem',
    background: 'var(--color-bg-elevated, #FFFDFB)',
    borderRadius: 'var(--radius-lg, 1rem)',
    border: '1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.06))',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)',
  });

  const statsLabel = createElement('div');
  setStyles(statsLabel, {
    fontFamily: 'var(--font-body, Inter, sans-serif)',
    fontSize: '0.625rem', // 10px
    fontWeight: '700',
    color: 'var(--color-text-muted, #8a8279)',
    marginBottom: '0.875rem',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  });
  statsLabel.textContent = t('visualizations.networkStats', 'NETWORK STATS');
  statsPanel.appendChild(statsLabel);

  // Stat rows with improved typography
  const stats = [
    { label: 'Total Connections', value: data.totalConnections, color: 'var(--color-text-primary, #2C2520)' },
    { label: 'Active', value: data.activeConnections, color: 'var(--color-semantic-success, #27ae60)' },
    { label: 'Needs Attention', value: data.needsAttention.length, color: 'var(--color-semantic-warning, #e67e22)' },
  ];

  stats.forEach((stat, idx) => {
    const row = createElement('div');
    setStyles(row, {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: idx > 0 ? '0.625rem' : '0',
      paddingBottom: idx < stats.length - 1 ? '0.625rem' : '0',
      borderBottom: idx < stats.length - 1 ? '1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.06))' : 'none',
    });

    const label = createElement('span', '', stat.label);
    setStyles(label, {
      fontFamily: 'var(--font-body, Inter, sans-serif)',
      fontSize: '0.8125rem', // bodySmall
      fontWeight: '500',
      color: 'var(--color-text-secondary, #5c544a)',
    });
    row.appendChild(label);

    const value = createElement('span', '', String(stat.value));
    setStyles(value, {
      fontFamily: 'var(--font-display, "Plus Jakarta Sans", sans-serif)',
      fontWeight: '700',
      fontSize: '1rem',
      color: stat.color,
      letterSpacing: '-0.02em',
    });
    row.appendChild(value);

    statsPanel.appendChild(row);
  });

  detailsSection.appendChild(statsPanel);

  // Category legend with pill chips
  const legendPanel = createElement('div');
  setStyles(legendPanel, {
    padding: '1rem 1.125rem',
    background: 'var(--color-bg-elevated, #FFFDFB)',
    borderRadius: 'var(--radius-lg, 1rem)',
    border: '1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.06))',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)',
  });

  const legendLabel = createElement('div');
  setStyles(legendLabel, {
    fontFamily: 'var(--font-body, Inter, sans-serif)',
    fontSize: '0.625rem',
    fontWeight: '700',
    color: 'var(--color-text-muted, #8a8279)',
    marginBottom: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  });
  legendLabel.textContent = t('visualizations.categories', 'CATEGORIES');
  legendPanel.appendChild(legendLabel);

  // Categories as inline chips
  const categoriesContainer = createElement('div');
  setStyles(categoriesContainer, {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  });

  const categoriesData = getCategoryBreakdown(data.relationships);
  Object.entries(categoriesData).forEach(([category, count]) => {
    if (count === 0) return;

    const chip = createElement('div');
    setStyles(chip, {
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '0.375rem 0',
    });

    const dot = createElement('div');
    setStyles(dot, {
      width: '0.5rem',
      height: '0.5rem',
      borderRadius: '50%',
      background: CATEGORY_CSS_VARS[category as Relationship['category']],
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.15)',
      flexShrink: '0',
    });
    chip.appendChild(dot);

    const chipLabel = createElement('span');
    setStyles(chipLabel, {
      fontFamily: 'var(--font-body, Inter, sans-serif)',
      fontSize: '0.8125rem',
      fontWeight: '500',
      color: 'var(--color-text-secondary, #5c544a)',
      textTransform: 'capitalize',
    });
    chipLabel.textContent = category;
    chip.appendChild(chipLabel);

    const chipCount = createElement('span');
    setStyles(chipCount, {
      fontFamily: 'var(--font-body, Inter, sans-serif)',
      fontSize: '0.75rem',
      fontWeight: '600',
      color: 'var(--color-text-muted, #8a8279)',
      marginLeft: 'auto',
    });
    chipCount.textContent = `(${count})`;
    chip.appendChild(chipCount);

    categoriesContainer.appendChild(chip);
  });

  legendPanel.appendChild(categoriesContainer);
  detailsSection.appendChild(legendPanel);

  // Needs attention card with warm styling
  if (data.needsAttention.length > 0) {
    const attentionPanel = createElement('div');
    setStyles(attentionPanel, {
      padding: '1rem 1.125rem',
      background: 'var(--color-semantic-warning-subtle, rgba(230, 126, 34, 0.06))',
      borderRadius: 'var(--radius-lg, 1rem)',
      borderLeft: '4px solid var(--color-semantic-warning, #e67e22)',
    });

    const attentionLabel = createElement('div');
    setStyles(attentionLabel, {
      fontFamily: 'var(--font-body, Inter, sans-serif)',
      fontSize: '0.625rem',
      fontWeight: '700',
      color: 'var(--color-semantic-warning-dark, #d35400)',
      marginBottom: '0.625rem',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    });
    attentionLabel.textContent = t('visualizations.reconnectWith', 'RECONNECT WITH');
    attentionPanel.appendChild(attentionLabel);

    data.needsAttention.slice(0, 3).forEach((name, idx) => {
      const nameEl = createElement('div');
      setStyles(nameEl, {
        fontFamily: 'var(--font-body, Inter, sans-serif)',
        fontSize: '0.875rem',
        fontWeight: '500',
        color: 'var(--color-text-primary, #2C2520)',
        marginBottom: idx < Math.min(data.needsAttention.length - 1, 2) ? '0.375rem' : '0',
      });
      nameEl.textContent = name;
      attentionPanel.appendChild(nameEl);
    });

    detailsSection.appendChild(attentionPanel);
  }

  contentGrid.appendChild(detailsSection);
  container.appendChild(contentGrid);

  // Screen reader label
  container.appendChild(
    createScreenReaderLabel(
      `Relationship network visualization showing ${data.totalConnections} connections across ${Object.keys(categoriesData).filter(k => categoriesData[k as Relationship['category']] > 0).length} categories. ${data.activeConnections} are active, ${data.needsAttention.length} need attention.`
    )
  );

  return {
    element: container,
    type: 'relationship-network',
    device: 'tablet',
    ariaLabel: `Relationship network with ${data.totalConnections} connections`,
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
