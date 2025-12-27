/**
 * Energy Rings Visualization Builder
 *
 * Displays energy levels as concentric rings (Apple Watch style).
 * Adapts to different device sizes:
 * - Watch: Classic concentric rings with overall center
 * - Mobile: Rings with detailed breakdown cards
 * - Tablet: Full rings with sparklines and recommendations
 *
 * @module visualizations/builders/energy-rings
 */

import {
  createElement,
  createSvgElement,
  createFlexContainer,
  setStyles,
  createScreenReaderLabel,
  describeArc,
} from '../utils/dom.js';
import type {
  EnergyRingsData,
  DeviceContext,
  VisualizationResult,
} from '../types.js';
import { DEFAULT_COLORS } from '../types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const RING_COLORS = {
  emotional: DEFAULT_COLORS.energy.emotional,
  mental: DEFAULT_COLORS.energy.mental,
  physical: DEFAULT_COLORS.energy.physical,
};

const RING_LABELS = {
  emotional: 'Emotional',
  mental: 'Mental',
  physical: 'Physical',
};

// ============================================================================
// WATCH BUILDER
// ============================================================================

/**
 * Build classic energy rings for watch.
 */
function buildWatch(
  container: HTMLElement,
  data: EnergyRingsData
): VisualizationResult {
  container.replaceChildren();

  // Header
  const header = createElement('div', 'viz-header');
  header.appendChild(createElement('h3', '', 'Energy'));
  header.appendChild(createElement('p', '', 'Your capacity'));
  container.appendChild(header);

  // Rings container
  const ringsContainer = createElement('div');
  setStyles(ringsContainer, {
    display: 'flex',
    justifyContent: 'center',
    margin: '8px 0',
  });

  const svg = createSvgElement('svg');
  svg.setAttribute('viewBox', '0 0 70 70');
  setStyles(svg as unknown as HTMLElement, {
    width: '70px',
    height: '70px',
  });

  const centerX = 35;
  const centerY = 35;

  // Ring configurations (outer to inner)
  const rings = [
    { key: 'emotional', value: data.emotional, radius: 28, width: 6 },
    { key: 'mental', value: data.mental, radius: 20, width: 6 },
    { key: 'physical', value: data.physical, radius: 12, width: 6 },
  ] as const;

  // Draw background rings and progress
  rings.forEach((ring) => {
    // Background ring
    const bgCircle = createSvgElement('circle');
    bgCircle.setAttribute('cx', String(centerX));
    bgCircle.setAttribute('cy', String(centerY));
    bgCircle.setAttribute('r', String(ring.radius));
    bgCircle.setAttribute('fill', 'none');
    bgCircle.setAttribute('stroke', 'rgba(44, 37, 32, 0.1)');
    bgCircle.setAttribute('stroke-width', String(ring.width));
    svg.appendChild(bgCircle);

    // Progress arc
    if (ring.value > 0) {
      const endAngle = -90 + (ring.value / 100) * 360;
      const arcPath = createSvgElement('path');
      arcPath.setAttribute('d', describeArc(centerX, centerY, ring.radius, -90, endAngle));
      arcPath.setAttribute('fill', 'none');
      arcPath.setAttribute('stroke', RING_COLORS[ring.key]);
      arcPath.setAttribute('stroke-width', String(ring.width));
      arcPath.setAttribute('stroke-linecap', 'round');
      svg.appendChild(arcPath);
    }
  });

  ringsContainer.appendChild(svg);
  container.appendChild(ringsContainer);

  // Overall percentage
  const metric = createElement('div', 'watch-metric', `${data.overall}%`);
  container.appendChild(metric);

  // Status label
  const statusLabel = createElement('div');
  setStyles(statusLabel, {
    textAlign: 'center',
    fontSize: '0.7rem',
    color: getStatusColor(data.overall),
  });
  statusLabel.textContent = getStatusLabel(data.overall);
  container.appendChild(statusLabel);

  return {
    element: container,
    type: 'energy-rings',
    device: 'watch',
    ariaLabel: `Energy rings: ${data.emotional}% emotional, ${data.mental}% mental, ${data.physical}% physical. Overall: ${data.overall}%`,
  };
}

// ============================================================================
// MOBILE BUILDER
// ============================================================================

/**
 * Build energy rings for mobile (iOS/Android).
 */
function buildMobile(
  container: HTMLElement,
  data: EnergyRingsData,
  context: DeviceContext
): VisualizationResult {
  container.replaceChildren();
  const isAndroid = context.platform === 'android';

  // Header
  const header = createElement('div', 'viz-header');
  header.appendChild(createElement('h3', '', 'Energy Levels'));
  header.appendChild(createElement('p', '', 'Your current capacity'));
  container.appendChild(header);

  // Rings visualization card
  const ringsCard = createElement('div', 'mobile-card');
  if (isAndroid) {
    setStyles(ringsCard, { borderLeft: '3px solid var(--color-accent)' });
  }

  const ringsContent = createFlexContainer('row', '16px', 'center', 'center');

  // SVG rings
  const svg = createSvgElement('svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  setStyles(svg as unknown as HTMLElement, {
    width: '100px',
    height: '100px',
  });

  const centerX = 50;
  const centerY = 50;

  const rings = [
    { key: 'emotional', value: data.emotional, radius: 42, width: 8 },
    { key: 'mental', value: data.mental, radius: 32, width: 8 },
    { key: 'physical', value: data.physical, radius: 22, width: 8 },
  ] as const;

  rings.forEach((ring) => {
    // Background
    const bgCircle = createSvgElement('circle');
    bgCircle.setAttribute('cx', String(centerX));
    bgCircle.setAttribute('cy', String(centerY));
    bgCircle.setAttribute('r', String(ring.radius));
    bgCircle.setAttribute('fill', 'none');
    bgCircle.setAttribute('stroke', 'rgba(44, 37, 32, 0.1)');
    bgCircle.setAttribute('stroke-width', String(ring.width));
    svg.appendChild(bgCircle);

    // Progress
    if (ring.value > 0) {
      const endAngle = -90 + (ring.value / 100) * 360;
      const arcPath = createSvgElement('path');
      arcPath.setAttribute('d', describeArc(centerX, centerY, ring.radius, -90, endAngle));
      arcPath.setAttribute('fill', 'none');
      arcPath.setAttribute('stroke', RING_COLORS[ring.key]);
      arcPath.setAttribute('stroke-width', String(ring.width));
      arcPath.setAttribute('stroke-linecap', 'round');
      svg.appendChild(arcPath);
    }
  });

  // Center overall
  const centerText = createSvgElement('text');
  centerText.setAttribute('x', String(centerX));
  centerText.setAttribute('y', String(centerY + 4));
  centerText.setAttribute('text-anchor', 'middle');
  centerText.setAttribute('font-size', '14');
  centerText.setAttribute('font-weight', '600');
  centerText.setAttribute('fill', 'var(--color-text-primary)');
  centerText.textContent = `${data.overall}%`;
  svg.appendChild(centerText);

  ringsContent.appendChild(svg);

  // Legend
  const legend = createElement('div');
  setStyles(legend, { display: 'flex', flexDirection: 'column', gap: '8px' });

  (['emotional', 'mental', 'physical'] as const).forEach((key) => {
    const row = createFlexContainer('row', '8px', 'flex-start', 'center');

    const dot = createElement('div');
    setStyles(dot, {
      width: '12px',
      height: '12px',
      borderRadius: '50%',
      background: RING_COLORS[key],
    });
    row.appendChild(dot);

    const label = createElement('span');
    setStyles(label, { fontSize: '0.85rem' });
    label.textContent = `${RING_LABELS[key]}: ${data[key]}%`;
    row.appendChild(label);

    legend.appendChild(row);
  });

  ringsContent.appendChild(legend);
  ringsCard.appendChild(ringsContent);
  container.appendChild(ringsCard);

  // Individual energy cards
  (['emotional', 'mental', 'physical'] as const).forEach((key) => {
    const value = data[key];
    const card = createElement('div', 'mobile-card');

    if (isAndroid) {
      setStyles(card, { borderLeft: `3px solid ${RING_COLORS[key]}` });
    }

    const cardHeader = createElement('div', 'mobile-card-header');
    cardHeader.appendChild(createElement('span', 'mobile-card-title', RING_LABELS[key]));

    const badge = createElement('span', 'mobile-card-badge', `${value}%`);
    setStyles(badge, { background: RING_COLORS[key] });
    cardHeader.appendChild(badge);
    card.appendChild(cardHeader);

    // Progress bar
    const bar = createElement('div');
    setStyles(bar, {
      height: '8px',
      background: 'rgba(44, 37, 32, 0.1)',
      borderRadius: isAndroid ? '0' : '4px',
      overflow: 'hidden',
      marginTop: '8px',
    });

    const fill = createElement('div');
    setStyles(fill, {
      width: `${value}%`,
      height: '100%',
      background: RING_COLORS[key],
      borderRadius: isAndroid ? '0' : '4px',
    });
    bar.appendChild(fill);
    card.appendChild(bar);

    // Status text
    const status = createElement('div');
    setStyles(status, {
      fontSize: '0.85rem',
      color: 'var(--color-text-secondary)',
      marginTop: '8px',
    });
    status.textContent = getEnergyInsight(key, value);
    card.appendChild(status);

    container.appendChild(card);
  });

  // Screen reader summary
  container.appendChild(
    createScreenReaderLabel(
      `Energy levels: ${data.emotional}% emotional, ${data.mental}% mental, ${data.physical}% physical. Overall: ${data.overall}%.`
    )
  );

  return {
    element: container,
    type: 'energy-rings',
    device: 'mobile',
    ariaLabel: `Energy rings showing ${data.overall}% overall capacity`,
  };
}

// ============================================================================
// TABLET BUILDER
// ============================================================================

/**
 * Build energy rings for tablet with full details.
 */
function buildTablet(
  container: HTMLElement,
  data: EnergyRingsData,
  _context: DeviceContext
): VisualizationResult {
  container.replaceChildren();

  // Header
  const header = createElement('div', 'viz-header');
  header.appendChild(createElement('h3', '', 'Energy Rings'));
  header.appendChild(createElement('p', '', 'Your capacity across dimensions'));
  container.appendChild(header);

  // Main content
  const contentGrid = createFlexContainer('row', '32px');
  setStyles(contentGrid, { padding: '16px' });

  // Left: Large rings visualization
  const ringsSection = createElement('div');
  setStyles(ringsSection, {
    flex: '1',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  });

  const svg = createSvgElement('svg');
  svg.setAttribute('viewBox', '0 0 200 200');
  setStyles(svg as unknown as HTMLElement, {
    width: '200px',
    height: '200px',
  });

  const centerX = 100;
  const centerY = 100;

  const rings = [
    { key: 'emotional', value: data.emotional, radius: 85, width: 14 },
    { key: 'mental', value: data.mental, radius: 65, width: 14 },
    { key: 'physical', value: data.physical, radius: 45, width: 14 },
  ] as const;

  rings.forEach((ring) => {
    // Background
    const bgCircle = createSvgElement('circle');
    bgCircle.setAttribute('cx', String(centerX));
    bgCircle.setAttribute('cy', String(centerY));
    bgCircle.setAttribute('r', String(ring.radius));
    bgCircle.setAttribute('fill', 'none');
    bgCircle.setAttribute('stroke', 'rgba(44, 37, 32, 0.1)');
    bgCircle.setAttribute('stroke-width', String(ring.width));
    svg.appendChild(bgCircle);

    // Progress arc
    if (ring.value > 0) {
      const endAngle = -90 + (ring.value / 100) * 360;
      const arcPath = createSvgElement('path');
      arcPath.setAttribute('d', describeArc(centerX, centerY, ring.radius, -90, endAngle));
      arcPath.setAttribute('fill', 'none');
      arcPath.setAttribute('stroke', RING_COLORS[ring.key]);
      arcPath.setAttribute('stroke-width', String(ring.width));
      arcPath.setAttribute('stroke-linecap', 'round');
      svg.appendChild(arcPath);

      // End cap glow effect
      if (ring.value >= 100) {
        const glowCircle = createSvgElement('circle');
        const angle = (-90 + (ring.value / 100) * 360) * (Math.PI / 180);
        glowCircle.setAttribute('cx', String(centerX + ring.radius * Math.cos(angle)));
        glowCircle.setAttribute('cy', String(centerY + ring.radius * Math.sin(angle)));
        glowCircle.setAttribute('r', String(ring.width / 2 + 2));
        glowCircle.setAttribute('fill', RING_COLORS[ring.key]);
        glowCircle.setAttribute('opacity', '0.6');
        svg.appendChild(glowCircle);
      }
    }
  });

  // Center overall display
  const centerBg = createSvgElement('circle');
  centerBg.setAttribute('cx', String(centerX));
  centerBg.setAttribute('cy', String(centerY));
  centerBg.setAttribute('r', '25');
  centerBg.setAttribute('fill', 'var(--color-bg-elevated)');
  svg.appendChild(centerBg);

  const overallText = createSvgElement('text');
  overallText.setAttribute('x', String(centerX));
  overallText.setAttribute('y', String(centerY + 6));
  overallText.setAttribute('text-anchor', 'middle');
  overallText.setAttribute('font-size', '18');
  overallText.setAttribute('font-weight', '600');
  overallText.setAttribute('fill', getStatusColor(data.overall));
  overallText.textContent = `${data.overall}%`;
  svg.appendChild(overallText);

  ringsSection.appendChild(svg);

  // Overall status below rings
  const statusBadge = createElement('div');
  setStyles(statusBadge, {
    marginTop: '12px',
    padding: '6px 16px',
    background: 'var(--color-background)',
    borderRadius: '16px',
    fontSize: '0.9rem',
    fontWeight: '600',
    color: getStatusColor(data.overall),
  });
  statusBadge.textContent = getStatusLabel(data.overall);
  ringsSection.appendChild(statusBadge);

  contentGrid.appendChild(ringsSection);

  // Right: Details
  const detailsSection = createElement('div');
  setStyles(detailsSection, { flex: '1' });

  // Individual energy panels
  (['emotional', 'mental', 'physical'] as const).forEach((key) => {
    const value = data[key];

    const panel = createElement('div');
    setStyles(panel, {
      padding: '16px',
      background: 'var(--color-bg-elevated)',
      borderRadius: '12px',
      border: '1px solid var(--color-border-subtle)',
      marginBottom: '12px',
    });

    // Header row
    const headerRow = createFlexContainer('row', '8px', 'flex-start', 'center');
    setStyles(headerRow, { marginBottom: '8px' });

    const colorDot = createElement('div');
    setStyles(colorDot, {
      width: '12px',
      height: '12px',
      borderRadius: '50%',
      background: RING_COLORS[key],
    });
    headerRow.appendChild(colorDot);

    const title = createElement('span');
    setStyles(title, {
      fontSize: '1rem',
      fontWeight: '600',
    });
    title.textContent = RING_LABELS[key];
    headerRow.appendChild(title);

    const valueLabel = createElement('span');
    setStyles(valueLabel, {
      marginLeft: 'auto',
      fontSize: '1.2rem',
      fontWeight: '600',
      color: RING_COLORS[key],
    });
    valueLabel.textContent = `${value}%`;
    headerRow.appendChild(valueLabel);

    panel.appendChild(headerRow);

    // Progress bar
    const progressBar = createElement('div');
    setStyles(progressBar, {
      height: '8px',
      background: 'var(--color-border-subtle)',
      borderRadius: '4px',
      overflow: 'hidden',
    });

    const progressFill = createElement('div');
    setStyles(progressFill, {
      width: `${value}%`,
      height: '100%',
      background: RING_COLORS[key],
      borderRadius: '4px',
      transition: 'width 300ms ease',
    });
    progressBar.appendChild(progressFill);
    panel.appendChild(progressBar);

    // Insight
    const insight = createElement('p');
    setStyles(insight, {
      fontSize: '0.85rem',
      color: 'var(--color-text-secondary)',
      marginTop: '8px',
      lineHeight: '1.4',
    });
    insight.textContent = getEnergyInsight(key, value);
    panel.appendChild(insight);

    detailsSection.appendChild(panel);
  });

  // Recommendation panel
  const recPanel = createElement('div');
  setStyles(recPanel, {
    padding: '12px',
    background: 'var(--color-background)',
    borderRadius: '8px',
  });

  const recLabel = createElement('div');
  setStyles(recLabel, {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: 'var(--color-text-muted)',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  });
  recLabel.textContent = 'Recommendation';
  recPanel.appendChild(recLabel);

  const recText = createElement('p');
  setStyles(recText, {
    fontSize: '0.85rem',
    color: 'var(--color-text-secondary)',
  });
  recText.textContent = getRecommendation(data);
  recPanel.appendChild(recText);

  detailsSection.appendChild(recPanel);
  contentGrid.appendChild(detailsSection);
  container.appendChild(contentGrid);

  return {
    element: container,
    type: 'energy-rings',
    device: 'tablet',
    ariaLabel: `Energy rings: ${data.emotional}% emotional, ${data.mental}% mental, ${data.physical}% physical. Overall: ${data.overall}%`,
  };
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build energy rings visualization for the given device context.
 */
export function buildEnergyRings(
  container: HTMLElement,
  data: EnergyRingsData,
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
 * Get status label based on overall energy.
 */
function getStatusLabel(overall: number): string {
  if (overall >= 80) return 'Thriving';
  if (overall >= 60) return 'Balanced';
  if (overall >= 40) return 'Stretched';
  if (overall >= 20) return 'Depleted';
  return 'Critical';
}

/**
 * Get status color based on overall energy.
 */
function getStatusColor(overall: number): string {
  if (overall >= 80) return DEFAULT_COLORS.status.thriving;
  if (overall >= 60) return DEFAULT_COLORS.status.balanced;
  if (overall >= 40) return DEFAULT_COLORS.status.stretched;
  if (overall >= 20) return DEFAULT_COLORS.status.depleted;
  return DEFAULT_COLORS.status.critical;
}

/**
 * Get insight text for a specific energy type.
 */
function getEnergyInsight(
  type: 'emotional' | 'mental' | 'physical',
  value: number
): string {
  const insights: Record<typeof type, Record<string, string>> = {
    emotional: {
      high: 'Emotionally centered and resilient',
      medium: 'Some emotional demands present',
      low: 'Emotional reserves running low',
    },
    mental: {
      high: 'Sharp focus and clear thinking',
      medium: 'Some mental fatigue building',
      low: 'Mental energy depleted',
    },
    physical: {
      high: 'Body feeling energized',
      medium: 'Physical energy adequate',
      low: 'Body needs rest and recovery',
    },
  };

  const level = value >= 70 ? 'high' : value >= 40 ? 'medium' : 'low';
  return insights[type][level];
}

/**
 * Get overall recommendation based on energy levels.
 */
function getRecommendation(data: EnergyRingsData): string {
  const lowest = Math.min(data.emotional, data.mental, data.physical);
  const lowestKey =
    data.emotional === lowest
      ? 'emotional'
      : data.mental === lowest
        ? 'mental'
        : 'physical';

  const recommendations: Record<typeof lowestKey, string> = {
    emotional: 'Consider connecting with someone supportive or practicing self-compassion today.',
    mental: 'A short break or mindful pause could help restore mental clarity.',
    physical: 'Gentle movement or rest could help replenish your physical energy.',
  };

  if (data.overall >= 80) {
    return 'All systems balanced. Great time for challenging tasks or meaningful connections.';
  }

  return recommendations[lowestKey];
}

// ============================================================================
// EXPORTS
// ============================================================================

export default buildEnergyRings;
