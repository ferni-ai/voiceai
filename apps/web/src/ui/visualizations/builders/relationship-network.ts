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
  
  // Container - the graph IS the component, everything else overlays
  setStyles(container, {
    position: 'relative',
    minHeight: '400px',
    padding: '0', // No padding - graph fills the space
  });

  // Full-width graph wrapper with overlaid elements
  const graphWrapper = createElement('div');
  setStyles(graphWrapper, {
    position: 'relative',
    width: '100%',
    minHeight: '400px',
    background: 'var(--tonal-surface1, rgba(44, 37, 32, 0.02))',
    borderRadius: 'var(--radius-xl, 1.25rem)',
    overflow: 'hidden',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '2rem 1rem',
  });

  // OVERLAID: Header at top-left
  const header = createElement('div');
  setStyles(header, {
    position: 'absolute',
    top: '1.25rem',
    left: '1.25rem',
    zIndex: '10',
    background: 'var(--glass-thick-bg, rgba(255, 255, 255, 0.85))',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    padding: '0.875rem 1.125rem',
    borderRadius: 'var(--radius-lg, 1rem)',
    boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)',
    border: '1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.06))',
  });

  const title = createElement('h3');
  setStyles(title, {
    fontFamily: 'var(--font-display, "Plus Jakarta Sans", sans-serif)',
    fontSize: '1rem',
    fontWeight: '600',
    lineHeight: '1.2',
    letterSpacing: '-0.01em',
    color: 'var(--color-text-primary, #2C2520)',
    margin: '0 0 0.125rem',
  });
  title.textContent = 'Your World';

  const subtitle = createElement('p');
  setStyles(subtitle, {
    fontFamily: 'var(--font-body, Inter, sans-serif)',
    fontSize: '0.6875rem',
    fontWeight: '500',
    color: 'var(--color-text-muted, #8a8279)',
    margin: '0',
    letterSpacing: '0.01em',
  });
  subtitle.textContent = `${data.totalConnections} connections`;

  header.appendChild(title);
  header.appendChild(subtitle);
  graphWrapper.appendChild(header);

  // OVERLAID: Stats panel at top-right
  const statsPanel = createElement('div');
  setStyles(statsPanel, {
    position: 'absolute',
    top: '1.25rem',
    right: '1.25rem',
    zIndex: '10',
    background: 'var(--glass-thick-bg, rgba(255, 255, 255, 0.85))',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    padding: '0.75rem 1rem',
    borderRadius: 'var(--radius-lg, 1rem)',
    boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)',
    border: '1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.06))',
    display: 'flex',
    gap: '1.25rem',
  });

  // Active stat
  const activeStat = createElement('div');
  setStyles(activeStat, { textAlign: 'center' });
  const activeValue = createElement('div');
  setStyles(activeValue, {
    fontFamily: 'var(--font-display, "Plus Jakarta Sans", sans-serif)',
    fontSize: '1.5rem',
    fontWeight: '700',
    color: 'var(--color-semantic-success, #3d7a52)',
    lineHeight: '1',
  });
  activeValue.textContent = String(data.activeConnections);
  const activeLabel = createElement('div');
  setStyles(activeLabel, {
    fontFamily: 'var(--font-body, Inter, sans-serif)',
    fontSize: '0.625rem',
    fontWeight: '600',
    color: 'var(--color-text-muted, #8a8279)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginTop: '0.125rem',
  });
  activeLabel.textContent = 'Active';
  activeStat.appendChild(activeValue);
  activeStat.appendChild(activeLabel);
  statsPanel.appendChild(activeStat);

  // Divider
  const divider = createElement('div');
  setStyles(divider, {
    width: '1px',
    background: 'var(--color-border-subtle, rgba(44, 37, 32, 0.1))',
    alignSelf: 'stretch',
  });
  statsPanel.appendChild(divider);

  // Needs attention stat
  const attentionStat = createElement('div');
  setStyles(attentionStat, { textAlign: 'center' });
  const attentionValue = createElement('div');
  setStyles(attentionValue, {
    fontFamily: 'var(--font-display, "Plus Jakarta Sans", sans-serif)',
    fontSize: '1.5rem',
    fontWeight: '700',
    color: data.needsAttention.length > 0 
      ? 'var(--color-semantic-warning, #a67c35)' 
      : 'var(--color-text-muted, #8a8279)',
    lineHeight: '1',
  });
  attentionValue.textContent = String(data.needsAttention.length);
  const attentionLabel = createElement('div');
  setStyles(attentionLabel, {
    fontFamily: 'var(--font-body, Inter, sans-serif)',
    fontSize: '0.625rem',
    fontWeight: '600',
    color: 'var(--color-text-muted, #8a8279)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginTop: '0.125rem',
  });
  attentionLabel.textContent = 'Reach out';
  attentionStat.appendChild(attentionValue);
  attentionStat.appendChild(attentionLabel);
  statsPanel.appendChild(attentionStat);

  graphWrapper.appendChild(statsPanel);

  // OVERLAID: Category legend at bottom-left (compact chips)
  const legendPanel = createElement('div');
  setStyles(legendPanel, {
    position: 'absolute',
    bottom: '1.25rem',
    left: '1.25rem',
    zIndex: '10',
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  });

  const categoriesData = getCategoryBreakdown(data.relationships);
  Object.entries(categoriesData).forEach(([category, count]) => {
    if (count === 0) return;

    const chip = createElement('div');
    setStyles(chip, {
      display: 'flex',
      alignItems: 'center',
      gap: '0.375rem',
      padding: '0.375rem 0.625rem',
      background: 'var(--glass-thick-bg, rgba(255, 255, 255, 0.85))',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      borderRadius: 'var(--radius-full, 9999px)',
      boxShadow: '0 1px 4px rgba(0, 0, 0, 0.06)',
      border: '1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.06))',
    });

    const dot = createElement('div');
    setStyles(dot, {
      width: '0.5rem',
      height: '0.5rem',
      borderRadius: '50%',
      background: CATEGORY_CSS_VARS[category as Relationship['category']],
      flexShrink: '0',
    });
    chip.appendChild(dot);

    const chipLabel = createElement('span');
    setStyles(chipLabel, {
      fontFamily: 'var(--font-body, Inter, sans-serif)',
      fontSize: '0.6875rem',
      fontWeight: '600',
      color: 'var(--color-text-secondary, #5c544a)',
      textTransform: 'capitalize',
    });
    chipLabel.textContent = `${category} (${count})`;
    chip.appendChild(chipLabel);

    legendPanel.appendChild(chip);
  });

  graphWrapper.appendChild(legendPanel);

  // OVERLAID: Reconnect prompt at bottom-right (if needed)
  if (data.needsAttention.length > 0) {
    const reconnectPanel = createElement('div');
    setStyles(reconnectPanel, {
      position: 'absolute',
      bottom: '1.25rem',
      right: '1.25rem',
      zIndex: '10',
      background: 'var(--color-semantic-warning-tint, rgba(166, 124, 53, 0.08))',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      padding: '0.75rem 1rem',
      borderRadius: 'var(--radius-lg, 1rem)',
      boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)',
      borderLeft: '3px solid var(--color-semantic-warning, #a67c35)',
      maxWidth: '180px',
    });

    const reconnectLabel = createElement('div');
    setStyles(reconnectLabel, {
      fontFamily: 'var(--font-body, Inter, sans-serif)',
      fontSize: '0.5625rem',
      fontWeight: '700',
      color: 'var(--color-semantic-warning-dark, #8a6830)',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      marginBottom: '0.375rem',
    });
    reconnectLabel.textContent = 'RECONNECT WITH';
    reconnectPanel.appendChild(reconnectLabel);

    const reconnectName = createElement('div');
    setStyles(reconnectName, {
      fontFamily: 'var(--font-body, Inter, sans-serif)',
      fontSize: '0.8125rem',
      fontWeight: '600',
      color: 'var(--color-text-primary, #2C2520)',
      lineHeight: '1.3',
    });
    reconnectName.textContent = data.needsAttention[0];
    if (data.needsAttention.length > 1) {
      const more = createElement('span');
      setStyles(more, {
        fontSize: '0.6875rem',
        fontWeight: '500',
        color: 'var(--color-text-muted)',
        marginLeft: '0.25rem',
      });
      more.textContent = `+${data.needsAttention.length - 1} more`;
      reconnectName.appendChild(more);
    }
    reconnectPanel.appendChild(reconnectName);

    graphWrapper.appendChild(reconnectPanel);
  }

  // THE GRAPH - Full size, centered
  const svg = createSvgElement('svg');
  svg.setAttribute('viewBox', '0 0 500 380'); // Even larger viewBox for full-width
  setStyles(svg as unknown as HTMLElement, {
    width: '100%',
    maxWidth: '600px',
    height: 'auto',
    minHeight: '300px',
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
  stop1.setAttribute('stop-opacity', '0.08');
  const stop2 = createSvgElement('stop');
  stop2.setAttribute('offset', '100%');
  stop2.setAttribute('stop-color', 'var(--color-accent, #3D5A45)');
  stop2.setAttribute('stop-opacity', '0');
  
  radialGrad.appendChild(stop1);
  radialGrad.appendChild(stop2);
  defs.appendChild(radialGrad);
  svg.appendChild(defs);
  
  // Background glow - larger to match new viewBox
  const bgCircle = createSvgElement('circle');
  bgCircle.setAttribute('cx', '250');
  bgCircle.setAttribute('cy', '190');
  bgCircle.setAttribute('r', '170');
  bgCircle.setAttribute('fill', 'url(#centerGlow)');
  svg.appendChild(bgCircle);

  // Center of the new larger viewBox (500x380)
  const centerX = 250;
  const centerY = 190;

  // Sort by strength for layout
  const sortedRels = [...data.relationships].sort((a, b) => b.strength - a.strength);

  // Position nodes with better spacing algorithm
  const positions: Array<{ rel: Relationship; x: number; y: number }> = [];
  
  // Use deterministic positioning based on index for consistent layout
  const seed = data.totalConnections; // Consistent "randomness"
  sortedRels.forEach((rel, i) => {
    // Inner ring for strong connections, outer for weaker - expanded for full-width graph
    const strengthFactor = 1 - rel.strength;
    const ringRadius = 80 + strengthFactor * 100; // 80-180px range for larger viewBox
    const angleOffset = (seed * 0.1) % (Math.PI * 0.5); // Consistent rotation
    const angle = (Math.PI * 2 * i) / sortedRels.length - Math.PI / 2 + angleOffset;

    // Deterministic jitter based on index
    const jitterX = Math.sin(i * 2.5 + seed) * 18;
    const jitterY = Math.cos(i * 3.1 + seed) * 18;

    const x = centerX + ringRadius * Math.cos(angle) + jitterX;
    const y = centerY + ringRadius * Math.sin(angle) + jitterY;

    positions.push({ rel, x, y });
  });

  // Draw connections first (behind nodes) - thicker for full-width graph
  positions.forEach(({ rel, x, y }) => {
    const line = createSvgElement('line');
    line.setAttribute('x1', String(centerX));
    line.setAttribute('y1', String(centerY));
    line.setAttribute('x2', String(x));
    line.setAttribute('y2', String(y));
    line.setAttribute('stroke', CATEGORY_COLORS[rel.category]);
    line.setAttribute('stroke-width', String(2 + rel.strength * 3.5)); // Thicker for prominence
    line.setAttribute('opacity', String(0.3 + rel.strength * 0.4));
    line.setAttribute('stroke-linecap', 'round');
    svg.appendChild(line);
  });

  // Center node with glow effect (you) - prominent hero element
  const centerGlow = createSvgElement('circle');
  centerGlow.setAttribute('cx', String(centerX));
  centerGlow.setAttribute('cy', String(centerY));
  centerGlow.setAttribute('r', '32'); // Large glow
  centerGlow.setAttribute('fill', 'var(--color-accent, #3D5A45)');
  centerGlow.setAttribute('opacity', '0.18');
  svg.appendChild(centerGlow);
  
  const centerCircle = createSvgElement('circle');
  centerCircle.setAttribute('cx', String(centerX));
  centerCircle.setAttribute('cy', String(centerY));
  centerCircle.setAttribute('r', '24'); // Prominent center node
  centerCircle.setAttribute('fill', 'var(--color-accent, #3D5A45)');
  svg.appendChild(centerCircle);

  const centerLabel = createSvgElement('text');
  centerLabel.setAttribute('x', String(centerX));
  centerLabel.setAttribute('y', String(centerY + 6));
  centerLabel.setAttribute('text-anchor', 'middle');
  centerLabel.setAttribute('font-size', '14');
  centerLabel.setAttribute('fill', 'white');
  centerLabel.setAttribute('font-weight', '600');
  centerLabel.setAttribute('font-family', 'var(--font-body, Inter, sans-serif)');
  centerLabel.textContent = t('common.you', 'You');
  svg.appendChild(centerLabel);

  // Draw nodes with improved styling - larger for full-width graph
  positions.forEach(({ rel, x, y }) => {
    const nodeSize = 12 + rel.strength * 10; // 12-22px range for full-width

    // Glow ring for fading relationships (needs attention)
    if (rel.trend === 'fading') {
      const pulseGlow = createSvgElement('circle');
      pulseGlow.setAttribute('cx', String(x));
      pulseGlow.setAttribute('cy', String(y));
      pulseGlow.setAttribute('r', String(nodeSize + 8));
      pulseGlow.setAttribute('fill', 'none');
      pulseGlow.setAttribute('stroke', 'var(--color-semantic-warning, #a67c35)');
      pulseGlow.setAttribute('stroke-width', '3');
      pulseGlow.setAttribute('opacity', '0.5');
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
      const labelY = y + nodeSize + 18;
      const displayName = truncateName(rel.name);
      
      // Label background for readability
      const labelBg = createSvgElement('rect');
      const textWidth = displayName.length * 7 + 12; // Larger for full-width
      labelBg.setAttribute('x', String(x - textWidth / 2));
      labelBg.setAttribute('y', String(labelY - 11));
      labelBg.setAttribute('width', String(textWidth));
      labelBg.setAttribute('height', '18');
      labelBg.setAttribute('rx', '9');
      labelBg.setAttribute('fill', 'var(--color-bg-elevated, #FFFDFB)');
      labelBg.setAttribute('opacity', '0.94');
      svg.appendChild(labelBg);
      
      const label = createSvgElement('text');
      label.setAttribute('x', String(x));
      label.setAttribute('y', String(labelY + 2));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size', '12');
      label.setAttribute('font-weight', '500');
      label.setAttribute('fill', 'var(--color-text-secondary, #5c544a)');
      label.setAttribute('font-family', 'var(--font-body, Inter, sans-serif)');
      label.textContent = displayName;
      svg.appendChild(label);
    }
  });

  // Add the SVG to the graph wrapper
  graphWrapper.appendChild(svg);
  container.appendChild(graphWrapper);

  // Screen reader label
  const categoriesDataForA11y = getCategoryBreakdown(data.relationships);
  container.appendChild(
    createScreenReaderLabel(
      `Your World - relationship network visualization showing ${data.totalConnections} connections across ${Object.keys(categoriesDataForA11y).filter(k => categoriesDataForA11y[k as Relationship['category']] > 0).length} categories. ${data.activeConnections} are active, ${data.needsAttention.length} need attention.`
    )
  );

  return {
    element: container,
    type: 'relationship-network',
    device: 'tablet',
    ariaLabel: `Your World - relationship network with ${data.totalConnections} connections`,
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
