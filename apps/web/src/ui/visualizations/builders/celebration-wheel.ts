/**
 * Celebration Wheel Visualization
 *
 * Displays celebration momentum from trust-systems/celebration-momentum.ts
 * Shows win types balance, streaks, and momentum score.
 *
 * Device adaptations:
 * - Watch: Momentum arc with score
 * - Mobile: Donut chart with win type segments
 * - Tablet/Desktop: Full wheel + streaks + legend
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

// Win types from celebration-momentum.ts
type WinType =
  | 'followed_through'
  | 'courage_moment'
  | 'self_care'
  | 'boundary_held'
  | 'hard_conversation'
  | 'showed_up'
  | 'tried_new_thing'
  | 'asked_for_help'
  | 'effort_made'
  | 'consistency'
  | 'breakthrough';

export interface CelebrationWheelData {
  momentumScore: number; // 0-100
  momentumTrend: 'building' | 'stable' | 'declining';
  totalWins: number;
  winsThisWeek: number;
  winsThisMonth: number;
  comebackDetected: boolean;
  breakthroughMoment: boolean;
  winsByType: Array<{ type: WinType; count: number }>;
  activeStreaks: Array<{ type: WinType; count: number; since: number }>;
  lastCelebration?: number;
}

// @design-tokens-ignore - SVG requires literal color values
const WIN_TYPE_COLORS: Record<WinType, string> = {
  followed_through: '#4a6741',
  courage_moment: '#e07b53',
  self_care: '#7c9a92',
  boundary_held: '#8b7355',
  hard_conversation: '#6b8e9f',
  showed_up: '#9b8bb0',
  tried_new_thing: '#c4a35a',
  asked_for_help: '#7aa095',
  effort_made: '#a0785c',
  consistency: '#5d7a6b',
  breakthrough: '#d4a574',
};

const WIN_TYPE_LABELS: Record<WinType, string> = {
  followed_through: 'Followed Through',
  courage_moment: 'Courage',
  self_care: 'Self Care',
  boundary_held: 'Boundaries',
  hard_conversation: 'Hard Talks',
  showed_up: 'Showed Up',
  tried_new_thing: 'Tried New',
  asked_for_help: 'Asked Help',
  effort_made: 'Effort',
  consistency: 'Consistency',
  breakthrough: 'Breakthrough',
};

/**
 * Build watch view - compact momentum arc
 */
function buildWatch(container: HTMLElement, data: CelebrationWheelData): VisualizationResult {
  container.replaceChildren();

  const wrapper = createElement('div');
  setStyles(wrapper, {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '8px',
  });

  const size = 120;
  const center = size / 2;
  const radius = 45;
  const strokeWidth = 10;

  const svg = createSvgElement('svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  setStyles(svg as unknown as HTMLElement, {
    width: '120px',
    height: '120px',
  });

  // Background arc
  const bgPath = createSvgElement('path');
  bgPath.setAttribute('d', describeArc(center, center, radius, -135, 135));
  bgPath.setAttribute('fill', 'none');
  bgPath.setAttribute('stroke', 'rgba(44, 37, 32, 0.1)');
  bgPath.setAttribute('stroke-width', String(strokeWidth));
  bgPath.setAttribute('stroke-linecap', 'round');
  svg.appendChild(bgPath);

  // Momentum arc
  const sweepAngle = -135 + (data.momentumScore / 100) * 270;
  if (data.momentumScore > 0) {
    const color =
      data.momentumScore >= 70
        ? DEFAULT_COLORS.status.thriving
        : data.momentumScore >= 40
          ? DEFAULT_COLORS.status.stretched
          : DEFAULT_COLORS.status.critical;

    const progressPath = createSvgElement('path');
    progressPath.setAttribute('d', describeArc(center, center, radius, -135, sweepAngle));
    progressPath.setAttribute('fill', 'none');
    progressPath.setAttribute('stroke', color);
    progressPath.setAttribute('stroke-width', String(strokeWidth));
    progressPath.setAttribute('stroke-linecap', 'round');
    svg.appendChild(progressPath);
  }

  // Center score
  const scoreText = createSvgElement('text');
  scoreText.setAttribute('x', String(center));
  scoreText.setAttribute('y', String(center + 4));
  scoreText.setAttribute('font-size', '20');
  scoreText.setAttribute('font-weight', '600');
  scoreText.setAttribute('fill', DEFAULT_COLORS.textPrimary);
  scoreText.setAttribute('text-anchor', 'middle');
  scoreText.textContent = String(data.momentumScore);
  svg.appendChild(scoreText);

  // Trend indicator
  const trendSymbol = data.momentumTrend === 'building' ? '+' : data.momentumTrend === 'declining' ? '-' : '=';
  const trendText = createSvgElement('text');
  trendText.setAttribute('x', String(center));
  trendText.setAttribute('y', String(center + 20));
  trendText.setAttribute('font-size', '14');
  trendText.setAttribute(
    'fill',
    data.momentumTrend === 'building'
      ? DEFAULT_COLORS.status.thriving
      : data.momentumTrend === 'declining'
        ? DEFAULT_COLORS.status.critical
        : DEFAULT_COLORS.textSecondary
  );
  trendText.setAttribute('text-anchor', 'middle');
  trendText.textContent = trendSymbol;
  svg.appendChild(trendText);

  wrapper.appendChild(svg);

  // Screen reader label
  const srLabel = createScreenReaderLabel(`Celebration momentum: ${data.momentumScore}%`);
  wrapper.appendChild(srLabel);

  container.appendChild(wrapper);

  return {
    element: wrapper,
    type: 'celebration-wheel',
    device: 'watch',
    ariaLabel: `Celebration momentum: ${data.momentumScore}%, trend ${data.momentumTrend}`,
  };
}

/**
 * Build mobile view - donut chart with segments
 */
function buildMobile(container: HTMLElement, data: CelebrationWheelData): VisualizationResult {
  container.replaceChildren();

  const wrapper = createElement('div');
  setStyles(wrapper, {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    padding: '16px',
  });

  // Donut chart
  const chartSize = 180;
  const center = chartSize / 2;
  const outerRadius = 75;
  const innerRadius = 45;

  const svg = createSvgElement('svg');
  svg.setAttribute('viewBox', `0 0 ${chartSize} ${chartSize}`);
  setStyles(svg as unknown as HTMLElement, {
    width: '180px',
    height: '180px',
  });

  const total = data.winsByType.reduce((sum, w) => sum + w.count, 0);

  if (total > 0) {
    let currentAngle = -90;

    data.winsByType
      .filter((w) => w.count > 0)
      .sort((a, b) => b.count - a.count)
      .forEach((win) => {
        const percentage = win.count / total;
        const sweepAngle = percentage * 360;

        const startAngleRad = (currentAngle * Math.PI) / 180;
        const endAngleRad = ((currentAngle + sweepAngle) * Math.PI) / 180;

        const x1Outer = center + outerRadius * Math.cos(startAngleRad);
        const y1Outer = center + outerRadius * Math.sin(startAngleRad);
        const x2Outer = center + outerRadius * Math.cos(endAngleRad);
        const y2Outer = center + outerRadius * Math.sin(endAngleRad);

        const x1Inner = center + innerRadius * Math.cos(endAngleRad);
        const y1Inner = center + innerRadius * Math.sin(endAngleRad);
        const x2Inner = center + innerRadius * Math.cos(startAngleRad);
        const y2Inner = center + innerRadius * Math.sin(startAngleRad);

        const largeArc = sweepAngle > 180 ? 1 : 0;

        const segment = createSvgElement('path');
        segment.setAttribute(
          'd',
          `M ${x1Outer} ${y1Outer} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2Outer} ${y2Outer} L ${x1Inner} ${y1Inner} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x2Inner} ${y2Inner} Z`
        );
        segment.setAttribute('fill', WIN_TYPE_COLORS[win.type]);
        segment.setAttribute('stroke', '#fff');
        segment.setAttribute('stroke-width', '1');

        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = `${WIN_TYPE_LABELS[win.type]}: ${win.count}`;
        segment.appendChild(title);

        svg.appendChild(segment);
        currentAngle += sweepAngle;
      });
  } else {
    const emptyRing = createSvgElement('circle');
    emptyRing.setAttribute('cx', String(center));
    emptyRing.setAttribute('cy', String(center));
    emptyRing.setAttribute('r', String((outerRadius + innerRadius) / 2));
    emptyRing.setAttribute('fill', 'none');
    emptyRing.setAttribute('stroke', 'rgba(44, 37, 32, 0.1)');
    emptyRing.setAttribute('stroke-width', String(outerRadius - innerRadius));
    svg.appendChild(emptyRing);
  }

  // Center content
  const scoreText = createSvgElement('text');
  scoreText.setAttribute('x', String(center));
  scoreText.setAttribute('y', String(center - 2));
  scoreText.setAttribute('font-size', '28');
  scoreText.setAttribute('font-weight', '600');
  scoreText.setAttribute('fill', DEFAULT_COLORS.textPrimary);
  scoreText.setAttribute('text-anchor', 'middle');
  scoreText.textContent = String(data.momentumScore);
  svg.appendChild(scoreText);

  const labelText = createSvgElement('text');
  labelText.setAttribute('x', String(center));
  labelText.setAttribute('y', String(center + 16));
  labelText.setAttribute('font-size', '11');
  labelText.setAttribute('fill', DEFAULT_COLORS.textSecondary);
  labelText.setAttribute('text-anchor', 'middle');
  labelText.textContent = 'momentum';
  svg.appendChild(labelText);

  wrapper.appendChild(svg);

  // Stats row
  const statsRow = createElement('div');
  setStyles(statsRow, {
    display: 'flex',
    justifyContent: 'center',
    gap: '24px',
  });

  const stats = [
    { label: 'this week', value: data.winsThisWeek },
    { label: 'this month', value: data.winsThisMonth },
    { label: 'total', value: data.totalWins },
  ];

  stats.forEach((stat) => {
    const statDiv = createElement('div');
    setStyles(statDiv, { textAlign: 'center' });

    const valueEl = createElement('div', '', String(stat.value));
    setStyles(valueEl, {
      fontSize: '20px',
      fontWeight: '600',
      color: 'var(--color-text-primary)',
    });

    const labelEl = createElement('div', '', stat.label);
    setStyles(labelEl, {
      fontSize: '12px',
      color: 'var(--color-text-secondary)',
    });

    statDiv.appendChild(valueEl);
    statDiv.appendChild(labelEl);
    statsRow.appendChild(statDiv);
  });

  wrapper.appendChild(statsRow);

  // Special state banner
  if (data.breakthroughMoment || data.comebackDetected) {
    const banner = createElement('div');
    setStyles(banner, {
      padding: '8px 16px',
      borderRadius: '20px',
      fontSize: '13px',
      fontWeight: '500',
      background: data.breakthroughMoment ? 'var(--color-accent-warm)' : 'var(--color-accent)',
      color: 'white',
    });
    banner.textContent = data.breakthroughMoment ? 'Breakthrough moment!' : 'Comeback detected!';
    wrapper.appendChild(banner);
  }

  container.appendChild(wrapper);

  return {
    element: wrapper,
    type: 'celebration-wheel',
    device: 'mobile',
    ariaLabel: `Win distribution: ${data.totalWins} total wins, momentum ${data.momentumScore}%`,
  };
}

/**
 * Build desktop view - full wheel with streaks and legend
 */
function buildDesktop(container: HTMLElement, data: CelebrationWheelData): VisualizationResult {
  container.replaceChildren();

  const wrapper = createElement('div');
  setStyles(wrapper, {
    display: 'grid',
    gridTemplateColumns: '280px 1fr',
    gap: '32px',
    padding: '24px',
  });

  // Left: Wheel section
  const wheelSection = createElement('div');
  setStyles(wheelSection, {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
  });

  const chartSize = 240;
  const center = chartSize / 2;
  const outerRadius = 100;
  const innerRadius = 60;

  const svg = createSvgElement('svg');
  svg.setAttribute('viewBox', `0 0 ${chartSize} ${chartSize}`);
  setStyles(svg as unknown as HTMLElement, {
    width: '240px',
    height: '240px',
  });

  const total = data.winsByType.reduce((sum, w) => sum + w.count, 0);

  if (total > 0) {
    let currentAngle = -90;

    data.winsByType
      .filter((w) => w.count > 0)
      .sort((a, b) => b.count - a.count)
      .forEach((win) => {
        const percentage = win.count / total;
        const sweepAngle = percentage * 360;

        const startAngleRad = (currentAngle * Math.PI) / 180;
        const endAngleRad = ((currentAngle + sweepAngle) * Math.PI) / 180;

        const x1Outer = center + outerRadius * Math.cos(startAngleRad);
        const y1Outer = center + outerRadius * Math.sin(startAngleRad);
        const x2Outer = center + outerRadius * Math.cos(endAngleRad);
        const y2Outer = center + outerRadius * Math.sin(endAngleRad);

        const x1Inner = center + innerRadius * Math.cos(endAngleRad);
        const y1Inner = center + innerRadius * Math.sin(endAngleRad);
        const x2Inner = center + innerRadius * Math.cos(startAngleRad);
        const y2Inner = center + innerRadius * Math.sin(startAngleRad);

        const largeArc = sweepAngle > 180 ? 1 : 0;

        const segment = createSvgElement('path');
        segment.setAttribute(
          'd',
          `M ${x1Outer} ${y1Outer} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2Outer} ${y2Outer} L ${x1Inner} ${y1Inner} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x2Inner} ${y2Inner} Z`
        );
        segment.setAttribute('fill', WIN_TYPE_COLORS[win.type]);
        segment.setAttribute('stroke', '#fff');
        segment.setAttribute('stroke-width', '2');

        svg.appendChild(segment);
        currentAngle += sweepAngle;
      });
  } else {
    const emptyRing = createSvgElement('circle');
    emptyRing.setAttribute('cx', String(center));
    emptyRing.setAttribute('cy', String(center));
    emptyRing.setAttribute('r', String((outerRadius + innerRadius) / 2));
    emptyRing.setAttribute('fill', 'none');
    emptyRing.setAttribute('stroke', 'rgba(44, 37, 32, 0.1)');
    emptyRing.setAttribute('stroke-width', String(outerRadius - innerRadius));
    svg.appendChild(emptyRing);
  }

  // Center background
  const centerBg = createSvgElement('circle');
  centerBg.setAttribute('cx', String(center));
  centerBg.setAttribute('cy', String(center));
  centerBg.setAttribute('r', String(innerRadius - 5));
  centerBg.setAttribute('fill', '#fff');
  svg.appendChild(centerBg);

  // Center score
  const scoreText = createSvgElement('text');
  scoreText.setAttribute('x', String(center));
  scoreText.setAttribute('y', String(center - 5));
  scoreText.setAttribute('font-size', '32');
  scoreText.setAttribute('font-weight', '600');
  scoreText.setAttribute('fill', DEFAULT_COLORS.textPrimary);
  scoreText.setAttribute('text-anchor', 'middle');
  scoreText.textContent = String(data.momentumScore);
  svg.appendChild(scoreText);

  // Trend text
  const trendLabel =
    data.momentumTrend === 'building' ? '+ building' : data.momentumTrend === 'declining' ? '- declining' : '= stable';
  const trendText = createSvgElement('text');
  trendText.setAttribute('x', String(center));
  trendText.setAttribute('y', String(center + 18));
  trendText.setAttribute('font-size', '11');
  trendText.setAttribute(
    'fill',
    data.momentumTrend === 'building'
      ? DEFAULT_COLORS.status.thriving
      : data.momentumTrend === 'declining'
        ? DEFAULT_COLORS.status.critical
        : DEFAULT_COLORS.textSecondary
  );
  trendText.setAttribute('text-anchor', 'middle');
  trendText.textContent = trendLabel;
  svg.appendChild(trendText);

  wheelSection.appendChild(svg);

  // Stats under wheel
  const wheelStats = createElement('div');
  setStyles(wheelStats, {
    display: 'flex',
    gap: '20px',
  });

  const statsConfig = [
    { label: 'this week', value: data.winsThisWeek },
    { label: 'this month', value: data.winsThisMonth },
    { label: 'all time', value: data.totalWins },
  ];

  statsConfig.forEach((stat) => {
    const statDiv = createElement('div');
    setStyles(statDiv, { textAlign: 'center' });

    const valueEl = createElement('div', '', String(stat.value));
    setStyles(valueEl, {
      fontSize: '18px',
      fontWeight: '600',
      color: 'var(--color-text-primary)',
    });

    const labelEl = createElement('div', '', stat.label);
    setStyles(labelEl, {
      fontSize: '12px',
      color: 'var(--color-text-secondary)',
    });

    statDiv.appendChild(valueEl);
    statDiv.appendChild(labelEl);
    wheelStats.appendChild(statDiv);
  });

  wheelSection.appendChild(wheelStats);
  wrapper.appendChild(wheelSection);

  // Right: Info section
  const infoSection = createElement('div');
  setStyles(infoSection, {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  });

  // Legend
  const legend = createElement('div');
  setStyles(legend, {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  });

  data.winsByType
    .filter((w) => w.count > 0)
    .sort((a, b) => b.count - a.count)
    .forEach((win) => {
      const item = createElement('div');
      setStyles(item, {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        background: 'var(--color-bg-secondary)',
        borderRadius: '16px',
        fontSize: '12px',
      });

      const dot = createElement('span');
      setStyles(dot, {
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        background: WIN_TYPE_COLORS[win.type],
      });

      const label = createElement('span', '', WIN_TYPE_LABELS[win.type]);
      setStyles(label, { color: 'var(--color-text-primary)' });

      const count = createElement('span', '', String(win.count));
      setStyles(count, { color: 'var(--color-text-secondary)', fontWeight: '500' });

      item.appendChild(dot);
      item.appendChild(label);
      item.appendChild(count);
      legend.appendChild(item);
    });

  infoSection.appendChild(legend);

  // Active streaks
  if (data.activeStreaks.length > 0) {
    const streaksSection = createElement('div');
    setStyles(streaksSection, { marginTop: '8px' });

    const streaksTitle = createElement('div', '', 'Active Streaks');
    setStyles(streaksTitle, {
      fontSize: '13px',
      fontWeight: '600',
      color: 'var(--color-text-secondary)',
      marginBottom: '8px',
    });
    streaksSection.appendChild(streaksTitle);

    const streaksList = createElement('div');
    setStyles(streaksList, {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
    });

    data.activeStreaks.slice(0, 5).forEach((streak) => {
      const daysSince = Math.floor((Date.now() - streak.since) / (1000 * 60 * 60 * 24));
      const streakItem = createElement('div');
      setStyles(streakItem, {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 10px',
        background: 'var(--color-bg-secondary)',
        borderRadius: '8px',
        borderLeft: `3px solid ${WIN_TYPE_COLORS[streak.type]}`,
      });

      const icon = createElement('span', '', '~');
      setStyles(icon, { fontSize: '16px' });

      const label = createElement('span', '', WIN_TYPE_LABELS[streak.type]);
      setStyles(label, { flex: '1', fontSize: '13px', color: 'var(--color-text-primary)' });

      const countEl = createElement('span', '', `${streak.count}x`);
      setStyles(countEl, { fontSize: '13px', fontWeight: '600', color: 'var(--color-text-primary)' });

      const daysEl = createElement('span', '', `${daysSince}d`);
      setStyles(daysEl, { fontSize: '11px', color: 'var(--color-text-secondary)' });

      streakItem.appendChild(icon);
      streakItem.appendChild(label);
      streakItem.appendChild(countEl);
      streakItem.appendChild(daysEl);
      streaksList.appendChild(streakItem);
    });

    streaksSection.appendChild(streaksList);
    infoSection.appendChild(streaksSection);
  }

  // Special states
  if (data.breakthroughMoment || data.comebackDetected) {
    const specialState = createElement('div');
    setStyles(specialState, {
      padding: '12px 16px',
      borderRadius: '12px',
      background: data.breakthroughMoment
        ? 'linear-gradient(135deg, rgba(212, 165, 116, 0.15), rgba(212, 165, 116, 0.05))'
        : 'linear-gradient(135deg, rgba(122, 160, 149, 0.15), rgba(122, 160, 149, 0.05))',
      border: data.breakthroughMoment ? '1px solid rgba(212, 165, 116, 0.3)' : '1px solid rgba(122, 160, 149, 0.3)',
    });

    const title = createElement('div', '', data.breakthroughMoment ? 'Breakthrough Moment' : 'Comeback Detected');
    setStyles(title, {
      fontSize: '15px',
      fontWeight: '600',
      color: 'var(--color-text-primary)',
      marginBottom: '4px',
    });

    const desc = createElement(
      'div',
      '',
      data.breakthroughMoment
        ? "You're experiencing a significant leap in growth."
        : "You've bounced back after a difficult period."
    );
    setStyles(desc, { fontSize: '13px', color: 'var(--color-text-secondary)' });

    specialState.appendChild(title);
    specialState.appendChild(desc);
    infoSection.appendChild(specialState);
  }

  wrapper.appendChild(infoSection);
  container.appendChild(wrapper);

  return {
    element: wrapper,
    type: 'celebration-wheel',
    device: 'desktop',
    ariaLabel: `Celebration wheel with ${data.totalWins} wins, momentum ${data.momentumScore}%`,
  };
}

/**
 * Main builder - routes to device-specific implementation
 */
export function buildCelebrationWheel(
  container: HTMLElement,
  data: CelebrationWheelData,
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
