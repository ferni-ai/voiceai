/**
 * Energy Ring Visualization Builder
 *
 * One ring: the user's overall energy (0-100), the average of their real
 * energy readings. Readings carry a single score, so there are no
 * emotional/mental/physical rings; the caller renders nothing at all when
 * there are no readings.
 *
 * Sizes adapt to the device: small on watch, larger on tablet/desktop.
 *
 * @module visualizations/builders/energy-rings
 */

import {
  createElement,
  createSvgElement,
  setStyles,
  createScreenReaderLabel,
  describeArc,
} from '../utils/dom.js';
import type { EnergyRingsData, DeviceContext, VisualizationResult } from '../types.js';
import { DEFAULT_COLORS, CSS_COLOR_VARS } from '../types.js';
import { t } from '../../../i18n/index.js';

/** Ring diameter (px) and stroke per device. */
const RING_SIZE: Record<DeviceContext['type'], { size: number; stroke: number }> = {
  watch: { size: 70, stroke: 6 },
  mobile: { size: 110, stroke: 9 },
  tablet: { size: 160, stroke: 12 },
  desktop: { size: 160, stroke: 12 },
  tv: { size: 200, stroke: 14 },
};

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build the energy ring for the given device context.
 */
export function buildEnergyRings(
  container: HTMLElement,
  data: EnergyRingsData,
  context: DeviceContext
): VisualizationResult {
  container.replaceChildren();
  const overall = Math.max(0, Math.min(100, Math.round(data.overall)));
  const status = data.label || getStatusLabel(overall);
  const { size, stroke } = RING_SIZE[context.type];

  const header = createElement('div', 'viz-header');
  header.appendChild(
    createElement('h3', 'viz-header__title', t('visualizations.energyRings.title', 'Energy'))
  );
  header.appendChild(
    createElement(
      'p',
      'viz-header__subtitle',
      t('visualizations.energyRings.weekSubtitle', 'Your last 7 days')
    )
  );
  container.appendChild(header);

  const card = createElement('div', 'viz-card viz-animate-slide');
  const row = createElement('div', 'viz-flex viz-flex--row viz-flex--center viz-flex--gap-pause');
  setStyles(row, { justifyContent: 'center' });
  row.appendChild(buildRing(overall, size, stroke));

  const statusEl = createElement('span', `viz-badge viz-badge--status-${getStatusKey(overall)}`);
  statusEl.textContent = status;
  row.appendChild(statusEl);
  card.appendChild(row);

  if (data.recommendation) {
    const insight = createElement('p', 'viz-insight');
    setStyles(insight, {
      marginTop: 'var(--viz-space-breath)',
      color: CSS_COLOR_VARS.textSecondary,
    });
    insight.textContent = data.recommendation;
    card.appendChild(insight);
  }
  container.appendChild(card);

  const ariaLabel = `Energy: ${overall}% overall, ${status}.`;
  container.appendChild(createScreenReaderLabel(ariaLabel));

  return { element: container, type: 'energy-rings', device: context.type, ariaLabel };
}

/** One progress ring with the percentage in the middle. */
function buildRing(overall: number, size: number, stroke: number): SVGElement {
  const center = size / 2;
  const radius = center - stroke;

  const svg = createSvgElement('svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('class', 'viz-ring__svg');
  svg.setAttribute('aria-hidden', 'true');
  setStyles(svg as unknown as HTMLElement, { width: `${size}px`, height: `${size}px` });

  const bg = createSvgElement('circle');
  bg.setAttribute('cx', String(center));
  bg.setAttribute('cy', String(center));
  bg.setAttribute('r', String(radius));
  bg.setAttribute('fill', 'none');
  bg.setAttribute('stroke', 'rgba(44, 37, 32, 0.08)');
  bg.setAttribute('stroke-width', String(stroke));
  bg.setAttribute('class', 'viz-ring__bg');
  svg.appendChild(bg);

  if (overall > 0) {
    // A full circle can't be one arc; stop just short of 360°.
    const endAngle = -90 + (Math.min(overall, 99.9) / 100) * 360;
    const arc = createSvgElement('path');
    arc.setAttribute('d', describeArc(center, center, radius, -90, endAngle));
    arc.setAttribute('fill', 'none');
    arc.setAttribute('stroke', getStatusColor(overall));
    arc.setAttribute('stroke-width', String(stroke));
    arc.setAttribute('stroke-linecap', 'round');
    arc.setAttribute('class', 'viz-ring__progress viz-ring__progress--overall');
    svg.appendChild(arc);
  }

  const text = createSvgElement('text');
  text.setAttribute('x', String(center));
  text.setAttribute('y', String(center + size / 20));
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('font-size', String(Math.round(size / 6)));
  text.setAttribute('font-weight', '600');
  text.setAttribute('fill', DEFAULT_COLORS.textPrimary);
  text.textContent = `${overall}%`;
  svg.appendChild(text);

  return svg;
}

// ============================================================================
// HELPERS
// ============================================================================

/** Status label from the overall score, when the server sent none. */
function getStatusLabel(overall: number): string {
  if (overall >= 80) return t('visualizations.status.thriving', 'Thriving');
  if (overall >= 60) return t('visualizations.status.balanced', 'Balanced');
  if (overall >= 40) return t('visualizations.status.stretched', 'Stretched');
  if (overall >= 20) return t('visualizations.status.depleted', 'Depleted');
  return t('visualizations.status.critical', 'Critical');
}

/** Status key for CSS class mapping. */
function getStatusKey(overall: number): string {
  if (overall >= 80) return 'thriving';
  if (overall >= 60) return 'balanced';
  if (overall >= 40) return 'stretched';
  if (overall >= 20) return 'depleted';
  return 'critical';
}

/**
 * Status color for the ring.
 * @design-tokens-ignore - SVG stroke requires literal color values
 */
function getStatusColor(overall: number): string {
  if (overall >= 80) return DEFAULT_COLORS.status.thriving;
  if (overall >= 60) return DEFAULT_COLORS.status.balanced;
  if (overall >= 40) return DEFAULT_COLORS.status.stretched;
  if (overall >= 20) return DEFAULT_COLORS.status.depleted;
  return DEFAULT_COLORS.status.critical;
}

export default buildEnergyRings;
