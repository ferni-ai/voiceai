/**
 * Energy Wave Visualization Builder
 *
 * Displays energy patterns as flowing waves across day/week.
 * Shows when users are most receptive to different interactions.
 *
 * Adapts to different device sizes:
 * - Watch: Simple current energy arc with high/medium/low indicator
 * - Mobile: 24-hour wave with current time marker
 * - Tablet/Desktop: Weekly pattern grid with optimal time highlights
 *
 * @module visualizations/builders/energy-wave
 */

import {
  createElement,
  createSvgElement,
  createPath,
  createCircle,
  createText,
  createScreenReaderLabel,
  setStyles,
  describeArc,
  DURATION,
  EASING,
} from '../utils/dom.js';
import type { DeviceContext, VisualizationResult, VisualizationType } from '../types.js';
import { DEFAULT_COLORS, CSS_COLOR_VARS } from '../types.js';
import { t } from '../../../i18n/index.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Energy wave visualization data.
 * Mirrors the backend EnergyWaveProfile structure.
 */
export interface EnergyWaveData {
  /** 24-hour energy pattern (0-1 for each hour) */
  hourlyEnergy: number[];
  /** Weekly energy pattern (0-1 for each day, 0=Sunday) */
  weeklyEnergy: number[];
  /** Current hour (0-23) */
  currentHour: number;
  /** Current day of week (0-6, 0=Sunday) */
  currentDay: number;
  /** Peak hours for deep work */
  peakHours: number[];
  /** Low energy hours */
  lowHours: number[];
  /** High energy days */
  highEnergyDays: number[];
  /** Low energy days */
  lowEnergyDays: number[];
  /** Current energy level (0-1) */
  currentEnergy: number;
  /** Energy type classification */
  energyType?: 'morning-person' | 'night-owl' | 'consistent';
  /** Optimal time for next deep conversation */
  nextOptimalTime?: { hour: number; day: number };
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LABELS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Energy level colors for SVG.
 * @design-tokens-ignore - SVG requires literal color values
 */
const ENERGY_COLORS = {
  high: DEFAULT_COLORS.status.thriving,
  medium: DEFAULT_COLORS.status.balanced,
  low: DEFAULT_COLORS.status.depleted,
  peak: DEFAULT_COLORS.accent,
  current: DEFAULT_COLORS.accentSecondary,
};

/**
 * CSS variable references for DOM elements.
 */
const ENERGY_CSS_VARS = {
  high: CSS_COLOR_VARS.statusThriving,
  medium: CSS_COLOR_VARS.statusBalanced,
  low: CSS_COLOR_VARS.statusDepleted,
  accent: CSS_COLOR_VARS.accent,
};

// ============================================================================
// WATCH BUILDER
// ============================================================================

/**
 * Build energy wave for watch - simple arc gauge.
 */
function buildWatch(
  container: HTMLElement,
  data: EnergyWaveData
): VisualizationResult {
  container.replaceChildren();

  // Header
  const header = createElement('div', 'viz-header');
  header.appendChild(createElement('h3', '', t('visualizations.energyWave.title', 'Energy')));
  header.appendChild(createElement('p', '', t('visualizations.energyWave.watchSubtitle', 'Current level')));
  container.appendChild(header);

  // Arc gauge container
  const gaugeContainer = createElement('div');
  setStyles(gaugeContainer, {
    display: 'flex',
    justifyContent: 'center',
    margin: '8px 0',
  });

  const svg = createSvgElement('svg');
  svg.setAttribute('viewBox', '0 0 80 50');
  setStyles(svg as unknown as HTMLElement, {
    width: '80px',
    height: '50px',
  });

  const centerX = 40;
  const centerY = 45;
  const radius = 35;

  // Background arc (180 degrees, bottom half hidden)
  const bgPath = createPath(
    describeArc(centerX, centerY, radius, -180, 0),
    'rgba(44, 37, 32, 0.1)',
    6
  );
  svg.appendChild(bgPath);

  // Energy arc based on current level (0-1 maps to -180 to 0)
  const energyAngle = -180 + data.currentEnergy * 180;
  const energyColor = getEnergyColor(data.currentEnergy);
  const energyPath = createPath(
    describeArc(centerX, centerY, radius, -180, energyAngle),
    energyColor,
    6
  );
  energyPath.setAttribute('stroke-linecap', 'round');
  svg.appendChild(energyPath);

  // Current position marker
  const markerAngle = energyAngle * (Math.PI / 180);
  const markerX = centerX + radius * Math.cos(markerAngle - Math.PI / 2);
  const markerY = centerY + radius * Math.sin(markerAngle - Math.PI / 2);
  const marker = createCircle(markerX, markerY, 4, energyColor);
  svg.appendChild(marker);

  gaugeContainer.appendChild(svg);
  container.appendChild(gaugeContainer);

  // Energy level label
  const levelLabel = createElement('div', 'watch-metric');
  levelLabel.textContent = getEnergyLabel(data.currentEnergy);
  setStyles(levelLabel, { color: energyColor });
  container.appendChild(levelLabel);

  // Energy type indicator
  if (data.energyType) {
    const typeLabel = createElement('div');
    setStyles(typeLabel, {
      textAlign: 'center',
      fontSize: '0.65rem',
      color: CSS_COLOR_VARS.textMuted,
      marginTop: '4px',
    });
    typeLabel.textContent = formatEnergyType(data.energyType);
    container.appendChild(typeLabel);
  }

  return {
    element: container,
    type: 'energy-wave', // Reusing existing type
    device: 'watch',
    ariaLabel: `Energy level: ${Math.round(data.currentEnergy * 100)}%, ${getEnergyLabel(data.currentEnergy)}`,
  };
}

// ============================================================================
// MOBILE BUILDER
// ============================================================================

/**
 * Build energy wave for mobile - 24-hour wave with current time.
 */
function buildMobile(
  container: HTMLElement,
  data: EnergyWaveData,
  context: DeviceContext
): VisualizationResult {
  container.replaceChildren();
  const isAndroid = context.platform === 'android';

  // Header
  const header = createElement('div', 'viz-header');
  const title = createElement('h3', 'viz-header__title', t('visualizations.energyWave.title', 'Energy Wave'));
  const subtitle = createElement('p', 'viz-header__subtitle', t('visualizations.energyWave.subtitle', 'Your daily rhythm'));
  header.appendChild(title);
  header.appendChild(subtitle);
  container.appendChild(header);

  // Current energy card
  const currentCard = createElement('div', `viz-card viz-animate-slide${isAndroid ? ' viz-card--accent-primary' : ''}`);

  const currentRow = createElement('div', 'viz-flex viz-flex--row viz-flex--center viz-flex--between');

  const currentLabel = createElement('span');
  setStyles(currentLabel, {
    fontSize: 'var(--viz-text-base)',
    fontWeight: '500',
    color: CSS_COLOR_VARS.textPrimary,
  });
  currentLabel.textContent = t('visualizations.energyWave.currentEnergy', 'Current Energy');
  currentRow.appendChild(currentLabel);

  const currentValue = createElement('span', 'viz-badge');
  setStyles(currentValue, {
    background: getEnergyColor(data.currentEnergy),
    color: 'white',
  });
  currentValue.textContent = getEnergyLabel(data.currentEnergy);
  currentRow.appendChild(currentValue);

  currentCard.appendChild(currentRow);
  container.appendChild(currentCard);

  // Wave visualization card
  const waveCard = createElement('div', 'viz-card viz-animate-slide viz-stagger-2');

  // SVG wave
  const svg = createSvgElement('svg');
  const width = 300;
  const height = 80;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  setStyles(svg as unknown as HTMLElement, {
    width: '100%',
    height: '80px',
  });

  // Build wave path from hourly data
  const wavePath = buildWavePath(data.hourlyEnergy, width, height, 10);

  // Gradient definition
  const defs = createSvgElement('defs');
  const gradient = createSvgElement('linearGradient');
  gradient.setAttribute('id', 'energy-wave-gradient');
  gradient.setAttribute('x1', '0%');
  gradient.setAttribute('y1', '0%');
  gradient.setAttribute('x2', '0%');
  gradient.setAttribute('y2', '100%');

  const stop1 = createSvgElement('stop');
  stop1.setAttribute('offset', '0%');
  stop1.setAttribute('stop-color', ENERGY_COLORS.high);
  stop1.setAttribute('stop-opacity', '0.3');
  gradient.appendChild(stop1);

  const stop2 = createSvgElement('stop');
  stop2.setAttribute('offset', '100%');
  stop2.setAttribute('stop-color', ENERGY_COLORS.high);
  stop2.setAttribute('stop-opacity', '0.05');
  gradient.appendChild(stop2);

  defs.appendChild(gradient);
  svg.appendChild(defs);

  // Filled area under wave
  const fillPath = createPath(
    wavePath + ` L ${width} ${height} L 0 ${height} Z`,
    undefined,
    undefined,
    'url(#energy-wave-gradient)'
  );
  svg.appendChild(fillPath);

  // Wave line
  const line = createPath(wavePath, ENERGY_COLORS.peak, 2);
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(line);

  // Current time marker
  const currentX = (data.currentHour / 24) * width;
  const currentY = height - 10 - data.currentEnergy * (height - 20);

  // Vertical line at current time
  const timeLine = createPath(`M ${currentX} 0 L ${currentX} ${height}`, ENERGY_COLORS.current, 1);
  timeLine.setAttribute('stroke-dasharray', '4,4');
  timeLine.setAttribute('opacity', '0.5');
  svg.appendChild(timeLine);

  // Current position dot
  const currentDot = createCircle(currentX, currentY, 6, ENERGY_COLORS.current);
  svg.appendChild(currentDot);

  // Highlight peak hours
  data.peakHours.forEach((hour) => {
    const peakX = (hour / 24) * width;
    const peakMarker = createCircle(peakX, height - 5, 3, ENERGY_COLORS.peak);
    peakMarker.setAttribute('opacity', '0.6');
    svg.appendChild(peakMarker);
  });

  waveCard.appendChild(svg);

  // Time labels
  const timeLabels = createElement('div', 'viz-flex viz-flex--row viz-flex--between');
  setStyles(timeLabels, { marginTop: 'var(--viz-space-breath)' });

  ['12am', '6am', '12pm', '6pm', '12am'].forEach((label, i) => {
    const timeEl = createElement('span');
    setStyles(timeEl, {
      fontSize: '0.7rem',
      color: CSS_COLOR_VARS.textMuted,
    });
    // Highlight current period
    const hour = i * 6;
    if (data.currentHour >= hour && data.currentHour < hour + 6) {
      setStyles(timeEl, { color: CSS_COLOR_VARS.accent, fontWeight: '600' });
    }
    timeEl.textContent = label;
    timeLabels.appendChild(timeEl);
  });

  waveCard.appendChild(timeLabels);
  container.appendChild(waveCard);

  // Insights card
  const insightCard = createElement('div', 'viz-card viz-animate-slide viz-stagger-3');

  const insightLabel = createElement('div', 'viz-label');
  insightLabel.textContent = t('visualizations.energyWave.insights', 'Today\'s Pattern');
  insightCard.appendChild(insightLabel);

  const insightText = createElement('p', 'viz-insight');
  insightText.textContent = getEnergyInsight(data);
  insightCard.appendChild(insightText);

  container.appendChild(insightCard);

  // Screen reader summary
  container.appendChild(
    createScreenReaderLabel(
      `Energy wave: Currently at ${Math.round(data.currentEnergy * 100)}% energy. ` +
      `Peak hours: ${data.peakHours.map((h) => formatHour(h)).join(', ')}.`
    )
  );

  return {
    element: container,
    type: 'energy-wave',
    device: 'mobile',
    ariaLabel: `Energy wave showing daily pattern. Current energy: ${Math.round(data.currentEnergy * 100)}%`,
  };
}

// ============================================================================
// TABLET/DESKTOP BUILDER
// ============================================================================

/**
 * Build energy wave for tablet/desktop - weekly grid with hourly details.
 */
function buildTablet(
  container: HTMLElement,
  data: EnergyWaveData,
  _context: DeviceContext
): VisualizationResult {
  container.replaceChildren();

  // Header
  const header = createElement('div', 'viz-header');
  const title = createElement('h3', 'viz-header__title', t('visualizations.energyWave.title', 'Energy Wave'));
  const subtitle = createElement(
    'p',
    'viz-header__subtitle',
    t('visualizations.energyWave.weeklySubtitle', 'Your weekly rhythm patterns')
  );
  header.appendChild(title);
  header.appendChild(subtitle);
  container.appendChild(header);

  // Main content grid
  const contentGrid = createElement('div', 'viz-flex viz-flex--row viz-flex--gap-rest viz-animate-fade');
  setStyles(contentGrid, { padding: 'var(--viz-space-pause)' });

  // Left: Weekly heatmap
  const heatmapSection = createElement('div', 'viz-flex viz-flex--col');
  setStyles(heatmapSection, { flex: '2' });

  const heatmapLabel = createElement('div', 'viz-label');
  heatmapLabel.textContent = t('visualizations.energyWave.weeklyHeatmap', 'Weekly Pattern');
  heatmapSection.appendChild(heatmapLabel);

  const heatmapCard = createElement('div', 'viz-card viz-card--elevated viz-animate-slide');
  heatmapCard.appendChild(buildWeeklyHeatmap(data));
  heatmapSection.appendChild(heatmapCard);

  contentGrid.appendChild(heatmapSection);

  // Right: Stats and insights
  const statsSection = createElement('div', 'viz-flex viz-flex--col');
  setStyles(statsSection, { flex: '1', gap: 'var(--viz-space-pause)' });

  // Current status card
  const statusCard = createElement('div', 'viz-card viz-card--elevated viz-animate-slide viz-stagger-1');

  const statusHeader = createElement('div', 'viz-flex viz-flex--row viz-flex--center viz-flex--between');

  const statusLabel = createElement('span', 'viz-label');
  statusLabel.textContent = t('visualizations.energyWave.currentStatus', 'Current');
  statusHeader.appendChild(statusLabel);

  const statusBadge = createElement('span', `viz-badge viz-badge--status-${getEnergyStatusKey(data.currentEnergy)}`);
  statusBadge.textContent = getEnergyLabel(data.currentEnergy);
  statusHeader.appendChild(statusBadge);

  statusCard.appendChild(statusHeader);

  // Energy meter
  const meterContainer = createElement('div', 'viz-progress');
  setStyles(meterContainer, { marginTop: 'var(--viz-space-pause)' });

  const meterFill = createElement('div', 'viz-progress__fill');
  setStyles(meterFill, {
    width: `${data.currentEnergy * 100}%`,
    background: getEnergyColor(data.currentEnergy),
  });
  meterContainer.appendChild(meterFill);
  statusCard.appendChild(meterContainer);

  const energyPercent = createElement('div');
  setStyles(energyPercent, {
    textAlign: 'center',
    fontSize: 'var(--viz-text-lg)',
    fontWeight: '600',
    marginTop: 'var(--viz-space-breath)',
    color: getEnergyColor(data.currentEnergy),
  });
  energyPercent.textContent = `${Math.round(data.currentEnergy * 100)}%`;
  statusCard.appendChild(energyPercent);

  statsSection.appendChild(statusCard);

  // Energy type card
  if (data.energyType) {
    const typeCard = createElement('div', 'viz-card viz-animate-slide viz-stagger-2');

    const typeLabel = createElement('div', 'viz-label');
    typeLabel.textContent = t('visualizations.energyWave.energyType', 'Your Pattern');
    typeCard.appendChild(typeLabel);

    const typeName = createElement('div');
    setStyles(typeName, {
      fontSize: 'var(--viz-text-lg)',
      fontWeight: '600',
      color: CSS_COLOR_VARS.textPrimary,
      marginTop: 'var(--viz-space-breath)',
    });
    typeName.textContent = formatEnergyType(data.energyType);
    typeCard.appendChild(typeName);

    const typeDesc = createElement('p', 'viz-insight');
    typeDesc.textContent = getEnergyTypeDescription(data.energyType);
    typeCard.appendChild(typeDesc);

    statsSection.appendChild(typeCard);
  }

  // Optimal times card
  const optimalCard = createElement('div', 'viz-card viz-animate-slide viz-stagger-3');

  const optimalLabel = createElement('div', 'viz-label');
  optimalLabel.textContent = t('visualizations.energyWave.optimalTimes', 'Best Times');
  optimalCard.appendChild(optimalLabel);

  const peakList = createElement('div', 'viz-flex viz-flex--col');
  setStyles(peakList, { gap: 'var(--viz-space-breath)', marginTop: 'var(--viz-space-breath)' });

  data.peakHours.slice(0, 3).forEach((hour) => {
    const peakRow = createElement('div', 'viz-flex viz-flex--row viz-flex--center');

    const dot = createElement('div');
    setStyles(dot, {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: ENERGY_CSS_VARS.high,
      marginRight: 'var(--viz-space-breath)',
    });
    peakRow.appendChild(dot);

    const timeText = createElement('span');
    setStyles(timeText, {
      fontSize: 'var(--viz-text-base)',
      color: CSS_COLOR_VARS.textPrimary,
    });
    timeText.textContent = formatHour(hour);
    peakRow.appendChild(timeText);

    peakList.appendChild(peakRow);
  });

  optimalCard.appendChild(peakList);
  statsSection.appendChild(optimalCard);

  // Insight card
  const insightCard = createElement('div', 'viz-card viz-animate-slide viz-stagger-4');

  const insightLabel = createElement('div', 'viz-label');
  insightLabel.textContent = t('visualizations.energyWave.recommendation', 'Recommendation');
  insightCard.appendChild(insightLabel);

  const insightText = createElement('p', 'viz-insight');
  insightText.textContent = getEnergyRecommendation(data);
  insightCard.appendChild(insightText);

  statsSection.appendChild(insightCard);

  contentGrid.appendChild(statsSection);
  container.appendChild(contentGrid);

  return {
    element: container,
    type: 'energy-wave',
    device: 'tablet',
    ariaLabel: `Weekly energy pattern. Current energy: ${Math.round(data.currentEnergy * 100)}%. Peak hours: ${data.peakHours.map((h) => formatHour(h)).join(', ')}.`,
  };
}

// ============================================================================
// WEEKLY HEATMAP
// ============================================================================

/**
 * Build a weekly energy heatmap grid.
 */
function buildWeeklyHeatmap(data: EnergyWaveData): HTMLElement {
  const container = createElement('div');
  setStyles(container, {
    display: 'grid',
    gridTemplateColumns: 'auto repeat(24, 1fr)',
    gap: '2px',
    padding: 'var(--viz-space-breath)',
  });

  // Hour labels (top row)
  const cornerCell = createElement('div');
  container.appendChild(cornerCell);

  for (let h = 0; h < 24; h += 4) {
    const hourLabel = createElement('div');
    setStyles(hourLabel, {
      fontSize: '0.65rem',
      color: CSS_COLOR_VARS.textMuted,
      textAlign: 'center',
      gridColumn: `span 4`,
    });
    hourLabel.textContent = formatHour(h);
    container.appendChild(hourLabel);
  }

  // Day rows
  for (let d = 0; d < 7; d++) {
    // Day label
    const dayLabel = createElement('div');
    setStyles(dayLabel, {
      fontSize: '0.75rem',
      fontWeight: '500',
      color: d === data.currentDay ? CSS_COLOR_VARS.accent : CSS_COLOR_VARS.textSecondary,
      paddingRight: 'var(--viz-space-breath)',
      display: 'flex',
      alignItems: 'center',
    });
    dayLabel.textContent = DAY_LABELS[d] ?? '';
    container.appendChild(dayLabel);

    // Hour cells
    for (let h = 0; h < 24; h++) {
      const cell = createElement('div');

      // Calculate energy for this cell (combine daily and weekly patterns)
      const hourEnergy = data.hourlyEnergy[h] ?? 0.5;
      const dayMultiplier = data.weeklyEnergy[d] ?? 1;
      const cellEnergy = hourEnergy * dayMultiplier;

      // Check if this is a peak hour on a high energy day
      const isPeak = data.peakHours.includes(h) && data.highEnergyDays.includes(d);
      const isLow = data.lowHours.includes(h) || data.lowEnergyDays.includes(d);
      const isCurrent = d === data.currentDay && h === data.currentHour;

      setStyles(cell, {
        width: '100%',
        paddingBottom: '100%', // Square cells
        borderRadius: '2px',
        background: getCellColor(cellEnergy, isPeak, isLow),
        border: isCurrent ? `2px solid ${ENERGY_COLORS.current}` : 'none',
        boxShadow: isCurrent ? `0 0 4px ${ENERGY_COLORS.current}` : 'none',
      });

      container.appendChild(cell);
    }
  }

  return container;
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build energy wave visualization for the given device context.
 */
export function buildEnergyWave(
  container: HTMLElement,
  data: EnergyWaveData,
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
 * Build SVG path for wave from hourly data.
 */
function buildWavePath(
  hourlyEnergy: number[],
  width: number,
  height: number,
  padding: number
): string {
  const usableHeight = height - padding * 2;
  const points: { x: number; y: number }[] = [];

  for (let h = 0; h < 24; h++) {
    const x = (h / 23) * width;
    const energy = hourlyEnergy[h] ?? 0.5;
    const y = padding + (1 - energy) * usableHeight;
    points.push({ x, y });
  }

  // Create smooth curve using quadratic bezier
  const firstPoint = points[0];
  if (!firstPoint) return '';

  let path = `M ${firstPoint.x} ${firstPoint.y}`;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    if (!prev || !curr) continue;
    const cpX = (prev.x + curr.x) / 2;
    path += ` Q ${prev.x + (curr.x - prev.x) * 0.5} ${prev.y}, ${cpX} ${(prev.y + curr.y) / 2}`;
  }

  // Final point
  const last = points[points.length - 1];
  if (last) {
    path += ` L ${last.x} ${last.y}`;
  }

  return path;
}

/**
 * Get energy color based on level.
 * @design-tokens-ignore - SVG requires literal color values
 */
function getEnergyColor(energy: number): string {
  if (energy >= 0.7) return ENERGY_COLORS.high;
  if (energy >= 0.4) return ENERGY_COLORS.medium;
  return ENERGY_COLORS.low;
}

/**
 * Get cell color for heatmap.
 * @design-tokens-ignore - SVG requires literal color values
 */
function getCellColor(energy: number, isPeak: boolean, isLow: boolean): string {
  if (isPeak) return `${ENERGY_COLORS.peak}`;
  if (isLow) return `rgba(44, 37, 32, 0.1)`;

  // Gradient from low to high
  const alpha = 0.1 + energy * 0.5;
  return `rgba(61, 90, 69, ${alpha})`; // Sage green with varying opacity
}

/**
 * Get energy level label.
 */
function getEnergyLabel(energy: number): string {
  if (energy >= 0.8) return t('visualizations.energy.thriving', 'Thriving');
  if (energy >= 0.6) return t('visualizations.energy.energized', 'Energized');
  if (energy >= 0.4) return t('visualizations.energy.balanced', 'Balanced');
  if (energy >= 0.2) return t('visualizations.energy.resting', 'Resting');
  return t('visualizations.energy.recovering', 'Recovering');
}

/**
 * Get status key for CSS class.
 */
function getEnergyStatusKey(energy: number): string {
  if (energy >= 0.7) return 'thriving';
  if (energy >= 0.4) return 'balanced';
  if (energy >= 0.2) return 'stretched';
  return 'depleted';
}

/**
 * Format hour for display.
 */
function formatHour(hour: number): string {
  if (hour === 0 || hour === 24) return '12am';
  if (hour === 12) return '12pm';
  if (hour < 12) return `${hour}am`;
  return `${hour - 12}pm`;
}

/**
 * Format energy type for display.
 */
function formatEnergyType(type: 'morning-person' | 'night-owl' | 'consistent'): string {
  switch (type) {
    case 'morning-person':
      return t('visualizations.energyType.morning', 'Morning Person');
    case 'night-owl':
      return t('visualizations.energyType.nightOwl', 'Night Owl');
    case 'consistent':
      return t('visualizations.energyType.consistent', 'Steady & Consistent');
  }
}

/**
 * Get energy type description.
 */
function getEnergyTypeDescription(type: 'morning-person' | 'night-owl' | 'consistent'): string {
  switch (type) {
    case 'morning-person':
      return 'You tend to have peak energy in the early hours. Best for deep work before noon.';
    case 'night-owl':
      return 'Your energy builds throughout the day. Evening hours are often your most productive.';
    case 'consistent':
      return 'Your energy stays relatively stable. You can handle demanding tasks at various times.';
  }
}

/**
 * Get energy insight based on current data.
 */
function getEnergyInsight(data: EnergyWaveData): string {
  const isPeakNow = data.peakHours.includes(data.currentHour);
  const isLowNow = data.lowHours.includes(data.currentHour);

  if (isPeakNow) {
    return 'You\'re in a peak energy window right now. Great time for focused work or important conversations.';
  }

  if (isLowNow) {
    const nextPeak = data.peakHours.find((h) => h > data.currentHour) ?? data.peakHours[0];
    return `Energy is lower right now. Your next peak window is around ${formatHour(nextPeak ?? 9)}.`;
  }

  if (data.currentEnergy >= 0.7) {
    return 'Your energy is strong. Consider tackling something meaningful while it lasts.';
  }

  if (data.currentEnergy < 0.4) {
    return 'Running a bit low. Light activities or a short break could help restore your rhythm.';
  }

  return 'Steady energy right now. A good time for regular tasks and light planning.';
}

/**
 * Get energy recommendation.
 */
function getEnergyRecommendation(data: EnergyWaveData): string {
  if (data.nextOptimalTime) {
    const dayLabel = DAY_LABELS[data.nextOptimalTime.day];
    const hourLabel = formatHour(data.nextOptimalTime.hour);
    return `Your next optimal window for deep conversation is ${dayLabel} at ${hourLabel}.`;
  }

  if (data.peakHours.length > 0) {
    const peakTimes = data.peakHours.slice(0, 2).map((h) => formatHour(h)).join(' and ');
    return `Your best times for focused work are typically around ${peakTimes}.`;
  }

  return 'Track more conversations to discover your optimal timing patterns.';
}

// ============================================================================
// EXPORTS
// ============================================================================

export default buildEnergyWave;
