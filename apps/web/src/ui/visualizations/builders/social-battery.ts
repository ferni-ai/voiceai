/**
 * Social Battery Visualization
 *
 * Displays social energy levels from superhuman/social-battery.ts
 * Shows current level, drain/recharge rates, and social tendency.
 *
 * Device adaptations:
 * - Watch: Simple battery arc with percentage
 * - Mobile: Vertical battery with rates and warning
 * - Tablet/Desktop: Battery + stats grid + recent activity
 */

import {
  createElement,
  createSvgElement,
  setStyles,
  createScreenReaderLabel,
  describeArc,
} from '../utils/dom.js';
import type { DeviceContext, VisualizationResult } from '../types.js';
import { DEFAULT_COLORS } from '../types.js';

export interface SocialBatteryData {
  currentLevel: number; // 0-100
  drainRatePerHour: number;
  rechargeRatePerHour: number;
  fullRechargeHours: number;
  warningThreshold: number;
  socialTendency: number; // 0 = introvert, 1 = extrovert
  trend?: 'draining' | 'recharging' | 'stable';
  recentEvents?: Array<{ type: string; impact: number; timestamp: number }>;
}

// @design-tokens-ignore - SVG requires literal color values
const BATTERY_COLORS = {
  high: DEFAULT_COLORS.status.thriving,
  medium: DEFAULT_COLORS.status.stretched,
  low: DEFAULT_COLORS.status.critical,
  background: 'rgba(44, 37, 32, 0.1)',
};

function getBatteryColor(level: number, warning: number): string {
  if (level >= 70) return BATTERY_COLORS.high;
  if (level >= warning) return BATTERY_COLORS.medium;
  return BATTERY_COLORS.low;
}

/**
 * Build watch view - compact battery arc
 */
function buildWatch(container: HTMLElement, data: SocialBatteryData): VisualizationResult {
  container.replaceChildren();

  const wrapper = createElement('div');
  setStyles(wrapper, {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '8px',
  });

  const size = 100;
  const center = size / 2;
  const radius = 38;
  const strokeWidth = 8;

  const svg = createSvgElement('svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  setStyles(svg as unknown as HTMLElement, {
    width: '100px',
    height: '100px',
  });

  // Background arc
  const bgPath = createSvgElement('path');
  bgPath.setAttribute('d', describeArc(center, center, radius, -135, 135));
  bgPath.setAttribute('fill', 'none');
  bgPath.setAttribute('stroke', BATTERY_COLORS.background);
  bgPath.setAttribute('stroke-width', String(strokeWidth));
  bgPath.setAttribute('stroke-linecap', 'round');
  svg.appendChild(bgPath);

  // Progress arc
  const sweepAngle = -135 + (data.currentLevel / 100) * 270;
  const color = getBatteryColor(data.currentLevel, data.warningThreshold);

  const progressPath = createSvgElement('path');
  progressPath.setAttribute('d', describeArc(center, center, radius, -135, sweepAngle));
  progressPath.setAttribute('fill', 'none');
  progressPath.setAttribute('stroke', color);
  progressPath.setAttribute('stroke-width', String(strokeWidth));
  progressPath.setAttribute('stroke-linecap', 'round');
  svg.appendChild(progressPath);

  // Center percentage
  const percentText = createSvgElement('text');
  percentText.setAttribute('x', String(center));
  percentText.setAttribute('y', String(center + 6));
  percentText.setAttribute('font-size', '18');
  percentText.setAttribute('font-weight', '600');
  percentText.setAttribute('fill', DEFAULT_COLORS.textPrimary);
  percentText.setAttribute('text-anchor', 'middle');
  percentText.textContent = `${data.currentLevel}%`;
  svg.appendChild(percentText);

  wrapper.appendChild(svg);

  // Label
  const label = createElement('div', '', 'Social Battery');
  setStyles(label, {
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    marginTop: '4px',
  });
  wrapper.appendChild(label);

  const srLabel = createScreenReaderLabel(`Social battery at ${data.currentLevel}%`);
  wrapper.appendChild(srLabel);

  container.appendChild(wrapper);

  return {
    element: wrapper,
    type: 'social-battery',
    device: 'watch',
    ariaLabel: `Social battery at ${data.currentLevel}%`,
  };
}

/**
 * Build mobile view - vertical battery with details
 */
function buildMobile(container: HTMLElement, data: SocialBatteryData): VisualizationResult {
  container.replaceChildren();

  const wrapper = createElement('div');
  setStyles(wrapper, {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    padding: '16px',
  });

  // Battery shape
  const batteryWidth = 80;
  const batteryHeight = 140;
  const capHeight = 12;

  const svg = createSvgElement('svg');
  svg.setAttribute('viewBox', `0 0 ${batteryWidth} ${batteryHeight + capHeight}`);
  setStyles(svg as unknown as HTMLElement, {
    width: `${batteryWidth}px`,
    height: `${batteryHeight + capHeight}px`,
  });

  // Battery cap
  const cap = createSvgElement('rect');
  cap.setAttribute('x', String(batteryWidth / 2 - 15));
  cap.setAttribute('y', '0');
  cap.setAttribute('width', '30');
  cap.setAttribute('height', String(capHeight));
  cap.setAttribute('rx', '4');
  cap.setAttribute('fill', BATTERY_COLORS.background);
  svg.appendChild(cap);

  // Battery body outline
  const body = createSvgElement('rect');
  body.setAttribute('x', '4');
  body.setAttribute('y', String(capHeight));
  body.setAttribute('width', String(batteryWidth - 8));
  body.setAttribute('height', String(batteryHeight));
  body.setAttribute('rx', '8');
  body.setAttribute('fill', 'none');
  body.setAttribute('stroke', BATTERY_COLORS.background);
  body.setAttribute('stroke-width', '3');
  svg.appendChild(body);

  // Fill level
  const fillHeight = (data.currentLevel / 100) * (batteryHeight - 12);
  const color = getBatteryColor(data.currentLevel, data.warningThreshold);

  const fill = createSvgElement('rect');
  fill.setAttribute('x', '10');
  fill.setAttribute('y', String(capHeight + batteryHeight - fillHeight - 6));
  fill.setAttribute('width', String(batteryWidth - 20));
  fill.setAttribute('height', String(fillHeight));
  fill.setAttribute('rx', '4');
  fill.setAttribute('fill', color);
  svg.appendChild(fill);

  // Warning threshold line
  const warningY = capHeight + batteryHeight - (data.warningThreshold / 100) * (batteryHeight - 12) - 6;
  const warningLine = createSvgElement('line');
  warningLine.setAttribute('x1', '6');
  warningLine.setAttribute('y1', String(warningY));
  warningLine.setAttribute('x2', String(batteryWidth - 6));
  warningLine.setAttribute('y2', String(warningY));
  warningLine.setAttribute('stroke', BATTERY_COLORS.low);
  warningLine.setAttribute('stroke-width', '2');
  warningLine.setAttribute('stroke-dasharray', '4,4');
  warningLine.setAttribute('opacity', '0.6');
  svg.appendChild(warningLine);

  // Percentage text
  const percentText = createSvgElement('text');
  percentText.setAttribute('x', String(batteryWidth / 2));
  percentText.setAttribute('y', String(capHeight + batteryHeight / 2 + 8));
  percentText.setAttribute('font-size', '24');
  percentText.setAttribute('font-weight', '600');
  percentText.setAttribute('fill', data.currentLevel > 50 ? '#fff' : DEFAULT_COLORS.textPrimary);
  percentText.setAttribute('text-anchor', 'middle');
  percentText.textContent = `${data.currentLevel}%`;
  svg.appendChild(percentText);

  wrapper.appendChild(svg);

  // Stats row
  const statsRow = createElement('div');
  setStyles(statsRow, {
    display: 'flex',
    gap: '20px',
    fontSize: '13px',
  });

  // Drain rate
  const drainStat = createElement('div');
  setStyles(drainStat, { textAlign: 'center' });

  const drainValue = createElement('div', '', `-${data.drainRatePerHour}/hr`);
  setStyles(drainValue, {
    fontWeight: '600',
    color: 'var(--color-text-primary)',
  });

  const drainLabel = createElement('div', '', 'drain');
  setStyles(drainLabel, { color: 'var(--color-text-secondary)' });

  drainStat.appendChild(drainValue);
  drainStat.appendChild(drainLabel);
  statsRow.appendChild(drainStat);

  // Recharge rate
  const rechargeStat = createElement('div');
  setStyles(rechargeStat, { textAlign: 'center' });

  const rechargeValue = createElement('div', '', `+${data.rechargeRatePerHour}/hr`);
  setStyles(rechargeValue, {
    fontWeight: '600',
    color: 'var(--color-text-primary)',
  });

  const rechargeLabel = createElement('div', '', 'recharge');
  setStyles(rechargeLabel, { color: 'var(--color-text-secondary)' });

  rechargeStat.appendChild(rechargeValue);
  rechargeStat.appendChild(rechargeLabel);
  statsRow.appendChild(rechargeStat);

  wrapper.appendChild(statsRow);

  // Warning banner if low
  if (data.currentLevel <= data.warningThreshold) {
    const warning = createElement('div');
    setStyles(warning, {
      padding: '8px 16px',
      borderRadius: '20px',
      fontSize: '13px',
      fontWeight: '500',
      background: 'var(--color-status-critical)',
      color: 'white',
    });
    warning.textContent = `Low battery - ${Math.ceil(data.fullRechargeHours)}hr to full`;
    wrapper.appendChild(warning);
  }

  container.appendChild(wrapper);

  return {
    element: wrapper,
    type: 'social-battery',
    device: 'mobile',
    ariaLabel: `Social battery at ${data.currentLevel}%, ${data.drainRatePerHour} drain per hour`,
  };
}

/**
 * Build desktop view - full battery with details and history
 */
function buildDesktop(container: HTMLElement, data: SocialBatteryData): VisualizationResult {
  container.replaceChildren();

  const wrapper = createElement('div');
  setStyles(wrapper, {
    display: 'grid',
    gridTemplateColumns: '160px 1fr',
    gap: '32px',
    padding: '24px',
  });

  // Left: Battery gauge
  const gaugeSection = createElement('div');
  setStyles(gaugeSection, {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  });

  // Circular gauge
  const size = 140;
  const center = size / 2;
  const radius = 55;
  const strokeWidth = 12;

  const svg = createSvgElement('svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  setStyles(svg as unknown as HTMLElement, {
    width: '140px',
    height: '140px',
  });

  // Background circle
  const bgCircle = createSvgElement('circle');
  bgCircle.setAttribute('cx', String(center));
  bgCircle.setAttribute('cy', String(center));
  bgCircle.setAttribute('r', String(radius));
  bgCircle.setAttribute('fill', 'none');
  bgCircle.setAttribute('stroke', BATTERY_COLORS.background);
  bgCircle.setAttribute('stroke-width', String(strokeWidth));
  svg.appendChild(bgCircle);

  // Progress arc
  const endAngle = -90 + (data.currentLevel / 100) * 360;
  const color = getBatteryColor(data.currentLevel, data.warningThreshold);

  const progressPath = createSvgElement('path');
  progressPath.setAttribute('d', describeArc(center, center, radius, -90, endAngle));
  progressPath.setAttribute('fill', 'none');
  progressPath.setAttribute('stroke', color);
  progressPath.setAttribute('stroke-width', String(strokeWidth));
  progressPath.setAttribute('stroke-linecap', 'round');
  svg.appendChild(progressPath);

  // Center content
  const percentText = createSvgElement('text');
  percentText.setAttribute('x', String(center));
  percentText.setAttribute('y', String(center));
  percentText.setAttribute('font-size', '28');
  percentText.setAttribute('font-weight', '600');
  percentText.setAttribute('fill', DEFAULT_COLORS.textPrimary);
  percentText.setAttribute('text-anchor', 'middle');
  percentText.setAttribute('dominant-baseline', 'middle');
  percentText.textContent = `${data.currentLevel}%`;
  svg.appendChild(percentText);

  gaugeSection.appendChild(svg);

  // Tendency label
  const tendencyLabel =
    data.socialTendency > 0.6 ? 'Extrovert' : data.socialTendency < 0.4 ? 'Introvert' : 'Ambivert';
  const tendency = createElement('div', '', tendencyLabel);
  setStyles(tendency, {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    background: 'var(--color-bg-secondary)',
    padding: '4px 12px',
    borderRadius: '12px',
  });
  gaugeSection.appendChild(tendency);

  wrapper.appendChild(gaugeSection);

  // Right: Stats and activity
  const infoSection = createElement('div');
  setStyles(infoSection, {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  });

  // Stats grid
  const statsGrid = createElement('div');
  setStyles(statsGrid, {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  });

  const stats = [
    { label: 'Drain Rate', value: `-${data.drainRatePerHour}/hr` },
    { label: 'Recharge Rate', value: `+${data.rechargeRatePerHour}/hr` },
    { label: 'Full Recharge', value: `${Math.ceil(data.fullRechargeHours)}hr` },
    { label: 'Warning At', value: `${data.warningThreshold}%` },
  ];

  stats.forEach((stat) => {
    const card = createElement('div');
    setStyles(card, {
      padding: '12px',
      background: 'var(--color-bg-secondary)',
      borderRadius: '8px',
    });

    const value = createElement('div', '', stat.value);
    setStyles(value, {
      fontSize: '18px',
      fontWeight: '600',
      color: 'var(--color-text-primary)',
    });

    const label = createElement('div', '', stat.label);
    setStyles(label, {
      fontSize: '12px',
      color: 'var(--color-text-secondary)',
      marginTop: '2px',
    });

    card.appendChild(value);
    card.appendChild(label);
    statsGrid.appendChild(card);
  });

  infoSection.appendChild(statsGrid);

  // Recent activity
  if (data.recentEvents && data.recentEvents.length > 0) {
    const activitySection = createElement('div');

    const activityTitle = createElement('div', '', 'Recent Activity');
    setStyles(activityTitle, {
      fontSize: '13px',
      fontWeight: '600',
      color: 'var(--color-text-secondary)',
      marginBottom: '8px',
    });
    activitySection.appendChild(activityTitle);

    const activityList = createElement('div');
    setStyles(activityList, {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
    });

    data.recentEvents.slice(0, 5).forEach((event) => {
      const item = createElement('div');
      setStyles(item, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        background: 'var(--color-bg-secondary)',
        borderRadius: '6px',
      });

      const eventType = createElement('span', '', event.type);
      setStyles(eventType, {
        fontSize: '13px',
        color: 'var(--color-text-primary)',
      });

      const impact = createElement('span', '', `${event.impact > 0 ? '+' : ''}${event.impact}`);
      setStyles(impact, {
        fontSize: '13px',
        fontWeight: '500',
        color: event.impact > 0 ? BATTERY_COLORS.high : BATTERY_COLORS.low,
      });

      item.appendChild(eventType);
      item.appendChild(impact);
      activityList.appendChild(item);
    });

    activitySection.appendChild(activityList);
    infoSection.appendChild(activitySection);
  }

  // Warning banner
  if (data.currentLevel <= data.warningThreshold) {
    const warning = createElement('div');
    setStyles(warning, {
      padding: '12px 16px',
      borderRadius: '8px',
      background: 'linear-gradient(135deg, rgba(181, 69, 58, 0.15), rgba(181, 69, 58, 0.05))',
      border: '1px solid rgba(181, 69, 58, 0.3)',
    });

    const warningTitle = createElement('div', '', 'Low Social Battery');
    setStyles(warningTitle, {
      fontSize: '14px',
      fontWeight: '600',
      color: 'var(--color-text-primary)',
      marginBottom: '4px',
    });

    const warningDesc = createElement(
      'div',
      '',
      `Consider some quiet time. Full recharge in ~${Math.ceil(data.fullRechargeHours)} hours.`
    );
    setStyles(warningDesc, {
      fontSize: '13px',
      color: 'var(--color-text-secondary)',
    });

    warning.appendChild(warningTitle);
    warning.appendChild(warningDesc);
    infoSection.appendChild(warning);
  }

  wrapper.appendChild(infoSection);
  container.appendChild(wrapper);

  return {
    element: wrapper,
    type: 'social-battery',
    device: 'desktop',
    ariaLabel: `Social battery at ${data.currentLevel}%, ${tendencyLabel} tendency`,
  };
}

/**
 * Main builder - routes to device-specific implementation
 */
export function buildSocialBattery(
  container: HTMLElement,
  data: SocialBatteryData,
  context: DeviceContext
): VisualizationResult {
  switch (context.type) {
    case 'watch':
      return buildWatch(container, data);
    case 'mobile':
      return buildMobile(container, data);
    case 'tablet':
    case 'desktop':
    case 'tv':
      return buildDesktop(container, data);
    default:
      return buildMobile(container, data);
  }
}
