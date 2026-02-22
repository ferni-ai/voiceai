/**
 * Fidelity-Style Insight Cards
 *
 * Modern financial service aesthetics with Ferni's warmth.
 * Data visualization that inspires confidence through clarity.
 *
 * @module @ferni/insight-cards
 */

import { createLogger } from '../utils/logger.js';
import { springToCubicBezier } from './emotional-springs.ui.js';

const log = createLogger('InsightCards');

// ============================================================================
// TYPES
// ============================================================================

export type CardSize = 'small' | 'medium' | 'large' | 'hero';
export type DataSentiment = 'positive' | 'negative' | 'neutral' | 'highlight';
export type ComparisonType = 'vsYesterday' | 'vsLastWeek' | 'vsLastMonth' | 'vsAverage' | 'vsBestWeek';

export interface InsightCardData {
  title: string;
  value: number | string;
  previousValue?: number;
  unit?: string;
  sentiment?: DataSentiment;
  comparison?: ComparisonType;
  trend?: number[]; // For sparklines
  description?: string;
}

export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

// ============================================================================
// DATA COLORS (from insights.json)
// ============================================================================

export const DATA_COLORS = {
  positive: {
    primary: '#4A7C59',
    gradient: 'linear-gradient(135deg, #4A7C59 0%, #6B9B7A 100%)',
    glow: 'rgba(74, 124, 89, 0.3)',
  },
  negative: {
    primary: '#9B6B6B',
    gradient: 'linear-gradient(135deg, #9B6B6B 0%, #B88888 100%)',
    glow: 'rgba(155, 107, 107, 0.3)',
  },
  neutral: {
    primary: '#8B7355',
    gradient: 'linear-gradient(135deg, #8B7355 0%, #A69076 100%)',
    glow: 'rgba(139, 115, 85, 0.3)',
  },
  highlight: {
    primary: '#C4A77D',
    gradient: 'linear-gradient(135deg, #C4A77D 0%, #D4BC9A 100%)',
    glow: 'rgba(196, 167, 125, 0.4)',
  },
  series: ['#4A7C59', '#6B8E9B', '#9B7B6B', '#7B6B9B', '#9B8B6B', '#6B9B8B'] as const,
};

/** Get a series color with guaranteed fallback */
function getSeriesColor(index: number): string {
  return DATA_COLORS.series[index % DATA_COLORS.series.length] ?? DATA_COLORS.positive.primary;
}

// ============================================================================
// CARD CONFIGURATIONS
// ============================================================================

const CARD_CONFIGS: Record<CardSize, { width: string; height: string; padding: string; borderRadius: string }> = {
  small: { width: '160px', height: '120px', padding: '16px', borderRadius: '16px' },
  medium: { width: '340px', height: '200px', padding: '20px', borderRadius: '20px' },
  large: { width: '100%', height: '320px', padding: '24px', borderRadius: '24px' },
  hero: { width: '100%', height: '400px', padding: '32px', borderRadius: '28px' },
};

const COMPARISON_CONFIG: Record<ComparisonType, { label: string; icon: string }> = {
  vsYesterday: { label: 'vs yesterday', icon: '○' },
  vsLastWeek: { label: 'vs last week', icon: '◐' },
  vsLastMonth: { label: 'vs last month', icon: '◉' },
  vsAverage: { label: 'your typical', icon: '≡' },
  vsBestWeek: { label: 'your best week', icon: '★' },
};

// ============================================================================
// CSS STYLES
// ============================================================================

const INSIGHT_STYLES = `
  .ferni-insight-card {
    background: var(--color-bg-elevated, #FFFDFB);
    border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    transition: transform 0.3s ${springToCubicBezier('gentle')},
                box-shadow 0.3s ${springToCubicBezier('gentle')};
  }

  .ferni-insight-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  }

  .ferni-insight-card__label {
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.7;
    color: var(--color-text-secondary, #a0a0a0);
    margin-bottom: 8px;
  }

  .ferni-insight-card__value {
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.1;
    color: var(--color-text-primary, #ffffff);
  }

  .ferni-insight-card__value--large { font-size: 48px; }
  .ferni-insight-card__value--medium { font-size: 32px; }
  .ferni-insight-card__value--small { font-size: 24px; }

  .ferni-insight-card__delta {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 14px;
    font-weight: 500;
    margin-top: 8px;
  }

  .ferni-insight-card__delta--positive { color: ${DATA_COLORS.positive.primary}; }
  .ferni-insight-card__delta--negative { color: ${DATA_COLORS.negative.primary}; }
  .ferni-insight-card__delta--neutral { color: ${DATA_COLORS.neutral.primary}; }

  .ferni-insight-card__comparison {
    font-size: 12px;
    opacity: 0.6;
    margin-left: 8px;
  }

  .ferni-insight-card__description {
    font-size: 14px;
    color: var(--color-text-muted, #e8e2da);
    margin-top: auto;
    line-height: 1.4;
  }

  /* Sparkline */
  .ferni-sparkline {
    height: 40px;
    margin-top: 12px;
    overflow: visible;
  }

  .ferni-sparkline__path {
    fill: none;
    stroke-width: 2px;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .ferni-sparkline__area {
    opacity: 0.15;
  }

  .ferni-sparkline__dot {
    fill: currentColor;
    transition: r 0.2s ease;
  }

  /* Progress Ring */
  .ferni-progress-ring {
    transform: rotate(-90deg);
  }

  .ferni-progress-ring__background {
    fill: none;
    opacity: 0.15;
  }

  .ferni-progress-ring__progress {
    fill: none;
    stroke-linecap: round;
    transition: stroke-dashoffset 1s ${springToCubicBezier('gentle')};
  }

  .ferni-progress-ring__text {
    font-size: 24px;
    font-weight: 600;
    text-anchor: middle;
    dominant-baseline: central;
  }

  /* Bar Chart */
  .ferni-bar-chart {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    height: 100%;
  }

  .ferni-bar-chart__bar {
    flex: 1;
    min-width: 24px;
    border-radius: 8px 8px 0 0;
    transition: transform 0.3s ${springToCubicBezier('gentle')};
    transform-origin: bottom;
  }

  .ferni-bar-chart__bar:hover {
    transform: scaleY(1.02);
  }

  .ferni-bar-chart__label {
    font-size: 10px;
    text-align: center;
    margin-top: 8px;
    opacity: 0.6;
  }

  /* Donut Chart */
  .ferni-donut-chart {
    position: relative;
  }

  .ferni-donut-chart__segment {
    fill: none;
    stroke-linecap: round;
    transition: stroke-width 0.2s ease;
  }

  .ferni-donut-chart__segment:hover {
    stroke-width: 28px;
  }

  .ferni-donut-chart__center {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
  }

  /* Animation keyframes */
  @keyframes ferni-draw-in {
    from { stroke-dashoffset: 100%; }
    to { stroke-dashoffset: 0%; }
  }

  @keyframes ferni-grow-up {
    0% { transform: scaleY(0); }
    60% { transform: scaleY(1.05); }
    100% { transform: scaleY(1); }
  }

  @keyframes ferni-count-up {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes ferni-pulse-glow {
    0%, 100% { filter: drop-shadow(0 0 8px var(--glow-color)); }
    50% { filter: drop-shadow(0 0 20px var(--glow-color)); }
  }
`;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Inject styles if not already present
 */
function injectStyles(): void {
  if (document.getElementById('ferni-insight-styles')) return;

  const style = document.createElement('style');
  style.id = 'ferni-insight-styles';
  style.textContent = INSIGHT_STYLES;
  document.head.appendChild(style);
}

/**
 * Calculate delta between current and previous values
 */
function calculateDelta(current: number, previous: number): { value: number; percentage: number; sentiment: DataSentiment } {
  const delta = current - previous;
  const percentage = previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : 0;

  let sentiment: DataSentiment = 'neutral';
  if (delta > 0) sentiment = 'positive';
  else if (delta < 0) sentiment = 'negative';

  return { value: delta, percentage, sentiment };
}

/**
 * Format number with appropriate precision
 */
function formatNumber(value: number, precision = 1): string {
  if (Math.abs(value) >= 1000000) {
    return (value / 1000000).toFixed(precision) + 'M';
  }
  if (Math.abs(value) >= 1000) {
    return (value / 1000).toFixed(precision) + 'K';
  }
  return value.toFixed(precision).replace(/\.0$/, '');
}

/**
 * Animate counting up a number
 */
export function animateCountUp(
  element: HTMLElement,
  from: number,
  to: number,
  duration = 1200,
  formatter: (n: number) => string = formatNumber
): void {
  const startTime = performance.now();

  const tick = (currentTime: number) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Ease out cubic
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    const currentValue = from + (to - from) * easeProgress;

    element.textContent = formatter(currentValue);

    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  };

  requestAnimationFrame(tick);
}

// ============================================================================
// INSIGHT CARD COMPONENT
// ============================================================================

/**
 * Create an insight card element
 */
export function createInsightCard(
  data: InsightCardData,
  size: CardSize = 'medium'
): HTMLElement {
  injectStyles();

  const config = CARD_CONFIGS[size];
  const card = document.createElement('div');
  card.className = 'ferni-insight-card';
  card.style.width = config.width;
  card.style.minHeight = config.height;
  card.style.padding = config.padding;
  card.style.borderRadius = config.borderRadius;

  // Label
  const label = document.createElement('div');
  label.className = 'ferni-insight-card__label';
  label.textContent = data.title;
  card.appendChild(label);

  // Value
  const valueSize = size === 'small' ? 'small' : size === 'medium' ? 'medium' : 'large';
  const valueEl = document.createElement('div');
  valueEl.className = `ferni-insight-card__value ferni-insight-card__value--${valueSize}`;

  if (typeof data.value === 'number') {
    valueEl.textContent = '0';
    // Animate count up after a brief delay
    setTimeout(() => animateCountUp(valueEl, 0, data.value as number), 100);
  } else {
    valueEl.textContent = data.value;
  }

  if (data.unit) {
    const unit = document.createElement('span');
    unit.style.fontSize = '0.5em';
    unit.style.opacity = '0.7';
    unit.style.marginLeft = '4px';
    unit.textContent = data.unit;
    valueEl.appendChild(unit);
  }

  card.appendChild(valueEl);

  // Delta (change from previous)
  if (data.previousValue !== undefined && typeof data.value === 'number') {
    const delta = calculateDelta(data.value, data.previousValue);
    const deltaEl = document.createElement('div');
    deltaEl.className = `ferni-insight-card__delta ferni-insight-card__delta--${delta.sentiment}`;

    const arrow = delta.value > 0 ? '↑' : delta.value < 0 ? '↓' : '→';
    const prefix = delta.value > 0 ? '+' : '';
    deltaEl.textContent = `${arrow} ${prefix}${delta.percentage.toFixed(1)}%`;

    if (data.comparison) {
      const comparisonEl = document.createElement('span');
      comparisonEl.className = 'ferni-insight-card__comparison';
      comparisonEl.textContent = COMPARISON_CONFIG[data.comparison].label;
      deltaEl.appendChild(comparisonEl);
    }

    card.appendChild(deltaEl);
  }

  // Sparkline
  if (data.trend && data.trend.length > 1 && (size === 'medium' || size === 'large' || size === 'hero')) {
    const sparkline = createSparkline(data.trend, data.sentiment || 'neutral');
    card.appendChild(sparkline);
  }

  // Description
  if (data.description && size !== 'small') {
    const desc = document.createElement('div');
    desc.className = 'ferni-insight-card__description';
    desc.textContent = data.description;
    card.appendChild(desc);
  }

  return card;
}

// ============================================================================
// SPARKLINE COMPONENT
// ============================================================================

/**
 * Create a sparkline SVG
 */
export function createSparkline(
  data: number[],
  sentiment: DataSentiment = 'neutral',
  options: { width?: number; height?: number; showArea?: boolean } = {}
): SVGElement {
  const { width = 200, height = 40, showArea = true } = options;
  const color = DATA_COLORS[sentiment].primary;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'ferni-sparkline');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.width = '100%';
  svg.style.height = `${height}px`;
  svg.style.color = color;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 4;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * (width - padding * 2) + padding;
    const y = height - padding - ((value - min) / range) * (height - padding * 2);
    return { x, y };
  });

  const pathD = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');

  // Area fill
  if (showArea && points.length > 0) {
    const area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const lastPt = points[points.length - 1];
    const firstPt = points[0];
    if (lastPt && firstPt) {
      const areaD = `${pathD} L ${lastPt.x} ${height} L ${firstPt.x} ${height} Z`;
      area.setAttribute('d', areaD);
      area.setAttribute('class', 'ferni-sparkline__area');
      area.setAttribute('fill', color);
      svg.appendChild(area);
    }
  }

  // Line
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line.setAttribute('d', pathD);
  line.setAttribute('class', 'ferni-sparkline__path');
  line.setAttribute('stroke', color);

  // Animate drawing
  const pathLength = line.getTotalLength?.() || 500;
  line.style.strokeDasharray = String(pathLength);
  line.style.strokeDashoffset = String(pathLength);
  line.style.animation = 'ferni-draw-in 1.2s ease-out forwards';

  svg.appendChild(line);

  // End dot
  const lastPoint = points[points.length - 1];
  if (lastPoint) {
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', String(lastPoint.x));
    dot.setAttribute('cy', String(lastPoint.y));
    dot.setAttribute('r', '4');
    dot.setAttribute('class', 'ferni-sparkline__dot');
    svg.appendChild(dot);
  }

  return svg;
}

// ============================================================================
// PROGRESS RING COMPONENT
// ============================================================================

/**
 * Create a circular progress ring
 */
export function createProgressRing(
  progress: number,  // 0-1
  options: {
    size?: number;
    strokeWidth?: number;
    color?: string;
    showLabel?: boolean;
    labelFormatter?: (p: number) => string;
    animated?: boolean;
  } = {}
): HTMLElement {
  injectStyles();

  const {
    size = 120,
    strokeWidth = 8,
    color = DATA_COLORS.positive.primary,
    showLabel = true,
    labelFormatter = (p) => `${Math.round(p * 100)}%`,
    animated = true,
  } = options;

  const container = document.createElement('div');
  container.style.position = 'relative';
  container.style.width = `${size}px`;
  container.style.height = `${size}px`;

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'ferni-progress-ring');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));

  // Background circle
  const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  bgCircle.setAttribute('class', 'ferni-progress-ring__background');
  bgCircle.setAttribute('cx', String(size / 2));
  bgCircle.setAttribute('cy', String(size / 2));
  bgCircle.setAttribute('r', String(radius));
  bgCircle.setAttribute('stroke', color);
  bgCircle.setAttribute('stroke-width', String(strokeWidth));
  svg.appendChild(bgCircle);

  // Progress circle
  const progressCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  progressCircle.setAttribute('class', 'ferni-progress-ring__progress');
  progressCircle.setAttribute('cx', String(size / 2));
  progressCircle.setAttribute('cy', String(size / 2));
  progressCircle.setAttribute('r', String(radius));
  progressCircle.setAttribute('stroke', color);
  progressCircle.setAttribute('stroke-width', String(strokeWidth));
  progressCircle.setAttribute('stroke-dasharray', String(circumference));

  const offset = circumference - (progress * circumference);
  if (animated) {
    progressCircle.setAttribute('stroke-dashoffset', String(circumference));
    // Animate after adding to DOM
    setTimeout(() => {
      progressCircle.setAttribute('stroke-dashoffset', String(offset));
    }, 50);
  } else {
    progressCircle.setAttribute('stroke-dashoffset', String(offset));
  }

  // Glow effect for high progress
  if (progress >= 0.9) {
    progressCircle.style.setProperty('--glow-color', DATA_COLORS.positive.glow);
    progressCircle.style.animation = 'ferni-pulse-glow 0.6s ease-in-out 3';
  }

  svg.appendChild(progressCircle);
  container.appendChild(svg);

  // Center label
  if (showLabel) {
    const labelContainer = document.createElement('div');
    labelContainer.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
    `;

    const label = document.createElement('div');
    label.className = 'ferni-progress-ring__text';
    label.style.color = 'var(--color-text-primary, #faf6f0)';

    if (animated) {
      animateCountUp(label, 0, progress * 100, 1000, (n) => `${Math.round(n)}%`);
    } else {
      label.textContent = labelFormatter(progress);
    }

    labelContainer.appendChild(label);
    container.appendChild(labelContainer);
  }

  return container;
}

// ============================================================================
// BAR CHART COMPONENT
// ============================================================================

/**
 * Create a horizontal bar chart
 */
export function createBarChart(
  data: ChartDataPoint[],
  options: {
    height?: number;
    animated?: boolean;
    showLabels?: boolean;
  } = {}
): HTMLElement {
  injectStyles();

  const { height = 200, animated = true, showLabels = true } = options;

  const container = document.createElement('div');
  container.className = 'ferni-bar-chart';
  container.style.height = `${height}px`;

  const maxValue = Math.max(...data.map(d => d.value));

  data.forEach((item, index) => {
    const barContainer = document.createElement('div');
    barContainer.style.flex = '1';
    barContainer.style.display = 'flex';
    barContainer.style.flexDirection = 'column';
    barContainer.style.alignItems = 'center';
    barContainer.style.justifyContent = 'flex-end';
    barContainer.style.height = '100%';

    const bar = document.createElement('div');
    bar.className = 'ferni-bar-chart__bar';
    bar.style.width = '100%';
    bar.style.background = item.color || getSeriesColor(index);

    const targetHeight = (item.value / maxValue) * 100;

    if (animated) {
      bar.style.height = '0%';
      bar.style.animation = `ferni-grow-up 0.8s ${springToCubicBezier('gentle')} forwards`;
      bar.style.animationDelay = `${index * 0.1}s`;
      // Set final height after animation
      setTimeout(() => {
        bar.style.height = `${targetHeight}%`;
      }, 50);
    } else {
      bar.style.height = `${targetHeight}%`;
    }

    barContainer.appendChild(bar);

    if (showLabels) {
      const label = document.createElement('div');
      label.className = 'ferni-bar-chart__label';
      label.textContent = item.label;
      label.style.color = 'var(--color-text-muted, #e8e2da)';
      barContainer.appendChild(label);
    }

    container.appendChild(barContainer);
  });

  return container;
}

// ============================================================================
// DONUT CHART COMPONENT
// ============================================================================

/**
 * Create a donut chart
 */
export function createDonutChart(
  data: ChartDataPoint[],
  options: {
    size?: number;
    strokeWidth?: number;
    showCenter?: boolean;
    centerLabel?: string;
    centerValue?: string;
  } = {}
): HTMLElement {
  injectStyles();

  const {
    size = 200,
    strokeWidth = 24,
    showCenter = true,
    centerLabel,
    centerValue,
  } = options;

  const container = document.createElement('div');
  container.className = 'ferni-donut-chart';
  container.style.width = `${size}px`;
  container.style.height = `${size}px`;
  container.style.position = 'relative';

  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.style.transform = 'rotate(-90deg)';

  let currentOffset = 0;

  data.forEach((item, index) => {
    const percentage = item.value / total;
    const segmentLength = percentage * circumference;
    const gap = 4; // Gap between segments

    const segment = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    segment.setAttribute('class', 'ferni-donut-chart__segment');
    segment.setAttribute('cx', String(size / 2));
    segment.setAttribute('cy', String(size / 2));
    segment.setAttribute('r', String(radius));
    segment.setAttribute('stroke', item.color || getSeriesColor(index));
    segment.setAttribute('stroke-width', String(strokeWidth));
    segment.setAttribute('stroke-dasharray', `${segmentLength - gap} ${circumference}`);
    segment.setAttribute('stroke-dashoffset', String(-currentOffset));

    // Animation
    segment.style.animation = `ferni-draw-in 1s ${springToCubicBezier('gentle')} forwards`;
    segment.style.animationDelay = `${index * 0.15}s`;

    svg.appendChild(segment);
    currentOffset += segmentLength;
  });

  container.appendChild(svg);

  // Center content
  if (showCenter) {
    const center = document.createElement('div');
    center.className = 'ferni-donut-chart__center';

    if (centerValue) {
      const value = document.createElement('div');
      value.style.fontSize = '24px';
      value.style.fontWeight = '600';
      value.style.color = 'var(--color-text-primary, #ffffff)';
      value.textContent = centerValue;
      center.appendChild(value);
    }

    if (centerLabel) {
      const label = document.createElement('div');
      label.style.fontSize = '12px';
      label.style.opacity = '0.7';
      label.style.color = 'var(--color-text-secondary, #a0a0a0)';
      label.textContent = centerLabel;
      center.appendChild(label);
    }

    container.appendChild(center);
  }

  return container;
}

// ============================================================================
// METRIC DISPLAY COMPONENT
// ============================================================================

/**
 * Create a large metric display
 */
export function createMetricDisplay(
  value: number | string,
  label: string,
  options: {
    size?: 'small' | 'medium' | 'large';
    sentiment?: DataSentiment;
    unit?: string;
    animated?: boolean;
  } = {}
): HTMLElement {
  injectStyles();

  const { size = 'medium', sentiment, unit, animated = true } = options;

  const container = document.createElement('div');
  container.style.textAlign = 'center';

  // Label
  const labelEl = document.createElement('div');
  labelEl.className = 'ferni-insight-card__label';
  labelEl.textContent = label;
  container.appendChild(labelEl);

  // Value
  const valueEl = document.createElement('div');
  valueEl.className = `ferni-insight-card__value ferni-insight-card__value--${size}`;

  if (sentiment) {
    const colorMap: Record<DataSentiment, string> = {
      positive: 'var(--color-semantic-success, #4A7C59)',
      negative: 'var(--color-semantic-error, #9B6B6B)',
      neutral: 'var(--color-text-muted, #8B7355)',
      highlight: 'var(--color-ferni, #4a6741)',
    };
    valueEl.style.color = colorMap[sentiment];
  }

  if (typeof value === 'number' && animated) {
    valueEl.textContent = '0';
    setTimeout(() => animateCountUp(valueEl, 0, value, 1200), 100);
  } else {
    valueEl.textContent = String(value);
  }

  if (unit) {
    const unitEl = document.createElement('span');
    unitEl.style.fontSize = '0.5em';
    unitEl.style.opacity = '0.7';
    unitEl.style.marginLeft = '4px';
    unitEl.textContent = unit;
    valueEl.appendChild(unitEl);
  }

  container.appendChild(valueEl);

  return container;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let initialized = false;

export function initInsightCards(): void {
  if (initialized) return;
  initialized = true;

  injectStyles();
  log.info('Insight cards initialized');
}

// Auto-initialize on module load
if (typeof window !== 'undefined') {
  initInsightCards();
}
