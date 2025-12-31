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
import { DEFAULT_COLORS, CSS_COLOR_VARS } from '../types.js';
import { t } from '../../../i18n/index.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Ring colors for SVG stroke attributes.
 * Uses design-system aligned colors from DEFAULT_COLORS.
 * @design-tokens-ignore - SVG stroke requires literal color values
 */
const RING_COLORS = {
  emotional: DEFAULT_COLORS.energy.emotional,
  mental: DEFAULT_COLORS.energy.mental,
  physical: DEFAULT_COLORS.energy.physical,
};

/**
 * CSS variable references for DOM elements (not SVG).
 */
const RING_CSS_VARS = {
  emotional: CSS_COLOR_VARS.energyEmotional,
  mental: CSS_COLOR_VARS.energyMental,
  physical: CSS_COLOR_VARS.energyPhysical,
};

const RING_LABELS = {
  emotional: t('visualizations.energy.emotional', 'Emotional'),
  mental: t('visualizations.energy.mental', 'Mental'),
  physical: t('visualizations.energy.physical', 'Physical'),
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

  // Header with proper viz-header classes
  const header = createElement('div', 'viz-header');
  const title = createElement('h3', 'viz-header__title', t('visualizations.energyRings.title', 'Energy Levels'));
  const subtitle = createElement('p', 'viz-header__subtitle', t('visualizations.energyRings.subtitle', 'Your current capacity'));
  header.appendChild(title);
  header.appendChild(subtitle);
  container.appendChild(header);

  // Main rings visualization card with glass styling
  const ringsCard = createElement('div', `viz-card viz-animate-slide${isAndroid ? ' viz-card--accent-primary' : ''}`);

  const ringsContent = createElement('div', 'viz-flex viz-flex--row viz-flex--center viz-flex--gap-pause');
  setStyles(ringsContent, { justifyContent: 'center' });

  // SVG rings with improved styling
  const svg = createSvgElement('svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'viz-ring__svg');
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
    // Background ring with softer color
    const bgCircle = createSvgElement('circle');
    bgCircle.setAttribute('cx', String(centerX));
    bgCircle.setAttribute('cy', String(centerY));
    bgCircle.setAttribute('r', String(ring.radius));
    bgCircle.setAttribute('fill', 'none');
    bgCircle.setAttribute('stroke', 'rgba(44, 37, 32, 0.06)');
    bgCircle.setAttribute('stroke-width', String(ring.width));
    bgCircle.setAttribute('class', 'viz-ring__bg');
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
      arcPath.setAttribute('class', `viz-ring__progress viz-ring__progress--${ring.key}`);
      svg.appendChild(arcPath);
    }
  });

  // Center overall percentage
  const centerText = createSvgElement('text');
  centerText.setAttribute('x', String(centerX));
  centerText.setAttribute('y', String(centerY + 4));
  centerText.setAttribute('text-anchor', 'middle');
  centerText.setAttribute('font-size', '14');
  centerText.setAttribute('font-weight', '600');
  centerText.setAttribute('fill', DEFAULT_COLORS.textPrimary);
  centerText.textContent = `${data.overall}%`;
  svg.appendChild(centerText);

  ringsContent.appendChild(svg);

  // Legend with proper classes
  const legend = createElement('div', 'viz-flex viz-flex--col');
  setStyles(legend, { gap: 'var(--viz-space-breath)' });

  (['emotional', 'mental', 'physical'] as const).forEach((key) => {
    const row = createElement('div', 'viz-flex viz-flex--row viz-flex--center');

    const dot = createElement('div', `viz-dot viz-dot--${key}`);
    row.appendChild(dot);

    const label = createElement('span');
    setStyles(label, {
      fontSize: 'var(--viz-text-base)',
      color: CSS_COLOR_VARS.textSecondary,
    });
    label.textContent = `${RING_LABELS[key]}: ${data[key]}%`;
    row.appendChild(label);

    legend.appendChild(row);
  });

  ringsContent.appendChild(legend);
  ringsCard.appendChild(ringsContent);
  container.appendChild(ringsCard);

  // Individual energy cards with stagger animation
  (['emotional', 'mental', 'physical'] as const).forEach((key, index) => {
    const value = data[key];
    const accentClass = isAndroid ? ` viz-card--accent-${key}` : '';
    const card = createElement('div', `viz-card viz-animate-slide viz-stagger-${index + 2}${accentClass}`);

    // Card header with flex layout
    const cardHeader = createElement('div', 'viz-flex viz-flex--row viz-flex--center viz-flex--between');

    const titleEl = createElement('span');
    setStyles(titleEl, {
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--viz-text-base)',
      fontWeight: '600',
      color: CSS_COLOR_VARS.textPrimary,
    });
    titleEl.textContent = RING_LABELS[key];
    cardHeader.appendChild(titleEl);

    // Badge with energy color
    const badge = createElement('span', 'viz-badge');
    setStyles(badge, {
      background: RING_CSS_VARS[key],
      color: 'white',
    });
    badge.textContent = `${value}%`;
    cardHeader.appendChild(badge);
    card.appendChild(cardHeader);

    // Progress bar with design system classes
    const barContainer = createElement('div', 'viz-progress');
    setStyles(barContainer, { marginTop: 'var(--viz-space-breath)' });

    const fill = createElement('div', `viz-progress__fill viz-progress__fill--${key}`);
    setStyles(fill, { width: `${value}%` });
    barContainer.appendChild(fill);
    card.appendChild(barContainer);

    // Insight text
    const insight = createElement('p', 'viz-insight');
    setStyles(insight, { marginTop: 'var(--viz-space-breath)' });
    insight.textContent = getEnergyInsight(key, value);
    card.appendChild(insight);

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

  // Header with design system classes
  const header = createElement('div', 'viz-header');
  const title = createElement('h3', 'viz-header__title', t('visualizations.energyRings.title', 'Energy Rings'));
  const subtitle = createElement('p', 'viz-header__subtitle', t('visualizations.energyRings.subtitle', 'Your capacity across dimensions'));
  header.appendChild(title);
  header.appendChild(subtitle);
  container.appendChild(header);

  // Main content with proper spacing
  const contentGrid = createElement('div', 'viz-flex viz-flex--row viz-flex--gap-rest viz-animate-fade');
  setStyles(contentGrid, { padding: 'var(--viz-space-pause)' });

  // Left: Large rings visualization
  const ringsSection = createElement('div', 'viz-flex viz-flex--col viz-flex--center');
  setStyles(ringsSection, { flex: '1' });

  const svg = createSvgElement('svg');
  svg.setAttribute('viewBox', '0 0 200 200');
  svg.setAttribute('class', 'viz-ring__svg');
  setStyles(svg as unknown as HTMLElement, {
    width: '200px',
    height: '200px',
    transform: 'rotate(0deg)', // Override rotation for tablet
  });

  const centerX = 100;
  const centerY = 100;

  const rings = [
    { key: 'emotional', value: data.emotional, radius: 85, width: 14 },
    { key: 'mental', value: data.mental, radius: 65, width: 14 },
    { key: 'physical', value: data.physical, radius: 45, width: 14 },
  ] as const;

  rings.forEach((ring) => {
    // Background ring
    const bgCircle = createSvgElement('circle');
    bgCircle.setAttribute('cx', String(centerX));
    bgCircle.setAttribute('cy', String(centerY));
    bgCircle.setAttribute('r', String(ring.radius));
    bgCircle.setAttribute('fill', 'none');
    bgCircle.setAttribute('stroke', 'rgba(44, 37, 32, 0.06)');
    bgCircle.setAttribute('stroke-width', String(ring.width));
    bgCircle.setAttribute('class', 'viz-ring__bg');
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
      arcPath.setAttribute('class', `viz-ring__progress viz-ring__progress--${ring.key}`);
      svg.appendChild(arcPath);

      // End cap glow effect for 100%
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

  // Center overall display with glass effect
  const centerBg = createSvgElement('circle');
  centerBg.setAttribute('cx', String(centerX));
  centerBg.setAttribute('cy', String(centerY));
  centerBg.setAttribute('r', '25');
  centerBg.setAttribute('fill', DEFAULT_COLORS.backgroundElevated);
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

  // Overall status badge below rings
  const statusBadge = createElement('span', `viz-badge viz-badge--status-${getStatusKey(data.overall)}`);
  setStyles(statusBadge, { marginTop: 'var(--viz-space-pause)' });
  statusBadge.textContent = getStatusLabel(data.overall);
  ringsSection.appendChild(statusBadge);

  contentGrid.appendChild(ringsSection);

  // Right: Details section
  const detailsSection = createElement('div', 'viz-flex viz-flex--col');
  setStyles(detailsSection, { flex: '1', gap: 'var(--viz-space-pause)' });

  // Individual energy panels with glass treatment
  (['emotional', 'mental', 'physical'] as const).forEach((key, index) => {
    const value = data[key];

    const panel = createElement('div', `viz-card viz-card--elevated viz-animate-slide viz-stagger-${index + 1}`);

    // Header row
    const headerRow = createElement('div', 'viz-flex viz-flex--row viz-flex--center viz-flex--between');

    const leftGroup = createElement('div', 'viz-flex viz-flex--row viz-flex--center');
    const colorDot = createElement('div', `viz-dot viz-dot--lg viz-dot--${key}`);
    leftGroup.appendChild(colorDot);

    const titleEl = createElement('span');
    setStyles(titleEl, {
      fontSize: 'var(--viz-text-lg)',
      fontWeight: '600',
      color: CSS_COLOR_VARS.textPrimary,
    });
    titleEl.textContent = RING_LABELS[key];
    leftGroup.appendChild(titleEl);
    headerRow.appendChild(leftGroup);

    const valueLabel = createElement('span', 'viz-metric__value viz-metric__value--sm');
    setStyles(valueLabel, { color: RING_CSS_VARS[key] });
    valueLabel.textContent = `${value}%`;
    headerRow.appendChild(valueLabel);

    panel.appendChild(headerRow);

    // Progress bar
    const progressBar = createElement('div', 'viz-progress');
    setStyles(progressBar, { marginTop: 'var(--viz-space-breath)' });

    const progressFill = createElement('div', `viz-progress__fill viz-progress__fill--${key}`);
    setStyles(progressFill, { width: `${value}%` });
    progressBar.appendChild(progressFill);
    panel.appendChild(progressBar);

    // Insight
    const insight = createElement('p', 'viz-insight');
    setStyles(insight, { marginTop: 'var(--viz-space-breath)' });
    insight.textContent = getEnergyInsight(key, value);
    panel.appendChild(insight);

    detailsSection.appendChild(panel);
  });

  // Recommendation panel
  const recPanel = createElement('div', 'viz-card viz-animate-slide viz-stagger-4');

  const recLabel = createElement('div', 'viz-label');
  setStyles(recLabel, { marginBottom: 'var(--viz-space-breath)' });
  recLabel.textContent = t('visualizations.recommendation', 'Recommendation');
  recPanel.appendChild(recLabel);

  const recText = createElement('p', 'viz-insight');
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
  if (overall >= 80) return t('visualizations.status.thriving', 'Thriving');
  if (overall >= 60) return t('visualizations.status.balanced', 'Balanced');
  if (overall >= 40) return t('visualizations.status.stretched', 'Stretched');
  if (overall >= 20) return t('visualizations.status.depleted', 'Depleted');
  return t('visualizations.status.critical', 'Critical');
}

/**
 * Get status key for CSS class mapping.
 */
function getStatusKey(overall: number): string {
  if (overall >= 80) return 'thriving';
  if (overall >= 60) return 'balanced';
  if (overall >= 40) return 'stretched';
  if (overall >= 20) return 'depleted';
  return 'critical';
}

/**
 * Get status color based on overall energy.
 * @design-tokens-ignore - SVG fill requires literal color values
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
