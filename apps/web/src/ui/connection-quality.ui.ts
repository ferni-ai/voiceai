/**
 * Connection Quality Indicator
 *
 * Real-time WebRTC connection quality feedback.
 * Shows users their connection status at a glance.
 *
 * "Users should never wonder why audio is choppy."
 *
 * @module @ferni/connection-quality
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ConnectionQuality');

// ============================================================================
// TYPES
// ============================================================================

export type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'disconnected';

export interface ConnectionStats {
  /** Round-trip time in ms */
  rtt?: number;
  /** Packet loss percentage (0-100) */
  packetLoss?: number;
  /** Jitter in ms */
  jitter?: number;
  /** Bitrate in kbps */
  bitrate?: number;
  /** Connection state */
  state?: 'connected' | 'connecting' | 'reconnecting' | 'disconnected';
}

export interface QualityIndicatorOptions {
  /** Position on screen */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Show detailed stats on hover */
  showDetails?: boolean;
  /** Size variant */
  size?: 'small' | 'medium' | 'large';
  /** Auto-hide when excellent */
  autoHide?: boolean;
  /** Update interval in ms */
  updateInterval?: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_OPTIONS: Required<QualityIndicatorOptions> = {
  position: 'top-right',
  showDetails: true,
  size: 'small',
  autoHide: false,
  updateInterval: 2000,
};

// Quality thresholds
const QUALITY_THRESHOLDS = {
  excellent: { rtt: 50, packetLoss: 0.5, jitter: 10 },
  good: { rtt: 100, packetLoss: 2, jitter: 30 },
  fair: { rtt: 200, packetLoss: 5, jitter: 50 },
  poor: { rtt: 500, packetLoss: 10, jitter: 100 },
};

// Quality colors (use CSS variables with fallbacks)
const QUALITY_COLORS: Record<ConnectionQuality, string> = {
  excellent: 'var(--color-semantic-success, #4a6741)',
  good: 'var(--color-semantic-success, #5a8a4a)',
  fair: 'var(--color-semantic-warning, #c49a5a)',
  poor: 'var(--color-semantic-error, #c46464)',
  disconnected: 'var(--color-text-muted, #756A5E)',
};

// Quality descriptions
const QUALITY_LABELS: Record<ConnectionQuality, string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor connection',
  disconnected: 'Disconnected',
};

// ============================================================================
// STATE
// ============================================================================

let indicator: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;
let currentQuality: ConnectionQuality = 'disconnected';
let currentStats: ConnectionStats = {};
let options: Required<QualityIndicatorOptions> = DEFAULT_OPTIONS;
let updateTimer: ReturnType<typeof setInterval> | null = null;
let statsCallback: (() => ConnectionStats) | null = null;

// ============================================================================
// STYLE INJECTION
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;
  if (typeof document === 'undefined') return;

  styleElement = document.createElement('style');
  styleElement.id = 'ferni-connection-quality';
  styleElement.textContent = `
    /* ============================================
       CONNECTION QUALITY INDICATOR
       ============================================ */

    .connection-quality {
      position: fixed;
      z-index: var(--z-notification, 3000);
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-2, 8px) var(--space-3, 12px);
      background: var(--glass-surface-2, rgba(255, 255, 255, 0.8));
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.1));
      border-radius: var(--radius-full, 9999px);
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-xs, 12px);
      color: var(--color-text-secondary, #5C544A);
      opacity: 0;
      transform: translateY(-10px);
      transition: 
        opacity ${DURATION.NORMAL}ms ${EASING.STANDARD},
        transform ${DURATION.NORMAL}ms ${EASING.STANDARD},
        background ${DURATION.FAST}ms ${EASING.STANDARD};
      pointer-events: none;
      user-select: none;
    }

    .connection-quality--visible {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }

    /* Position variants */
    .connection-quality--top-left {
      top: var(--space-4, 16px);
      left: var(--space-4, 16px);
    }

    .connection-quality--top-right {
      top: var(--space-4, 16px);
      right: var(--space-4, 16px);
    }

    .connection-quality--bottom-left {
      bottom: var(--space-4, 16px);
      left: var(--space-4, 16px);
    }

    .connection-quality--bottom-right {
      bottom: var(--space-4, 16px);
      right: var(--space-4, 16px);
    }

    /* Size variants */
    .connection-quality--small {
      padding: var(--space-1, 4px) var(--space-2, 8px);
    }

    .connection-quality--small .connection-quality__bars {
      width: 14px;
      height: 10px;
    }

    .connection-quality--medium .connection-quality__bars {
      width: 18px;
      height: 14px;
    }

    .connection-quality--large {
      padding: var(--space-3, 12px) var(--space-4, 16px);
    }

    .connection-quality--large .connection-quality__bars {
      width: 24px;
      height: 18px;
    }

    /* Bars indicator */
    .connection-quality__bars {
      display: flex;
      align-items: flex-end;
      gap: 2px;
      width: 18px;
      height: 14px;
    }

    .connection-quality__bar {
      flex: 1;
      background: var(--color-text-muted, #9a8a7a);
      border-radius: 1px;
      transition: 
        height ${DURATION.NORMAL}ms ${EASING.STANDARD},
        background ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }

    .connection-quality__bar:nth-child(1) { height: 25%; }
    .connection-quality__bar:nth-child(2) { height: 50%; }
    .connection-quality__bar:nth-child(3) { height: 75%; }
    .connection-quality__bar:nth-child(4) { height: 100%; }

    .connection-quality__bar--active {
      background: var(--quality-color, var(--color-semantic-success, #4a6741));
    }

    /* Label */
    .connection-quality__label {
      font-weight: var(--font-weight-medium, 500);
      color: var(--quality-color, var(--color-text-secondary));
      white-space: nowrap;
    }

    /* Details tooltip */
    .connection-quality__details {
      position: absolute;
      top: calc(100% + var(--space-2, 8px));
      right: 0;
      padding: var(--space-3, 12px);
      background: var(--color-background-elevated, white);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-lg, 12px);
      box-shadow: var(--shadow-lg);
      font-size: var(--text-xs, 12px);
      min-width: 180px;
      opacity: 0;
      visibility: hidden;
      transform: translateY(-5px);
      transition: 
        opacity ${DURATION.FAST}ms ${EASING.STANDARD},
        visibility ${DURATION.FAST}ms ${EASING.STANDARD},
        transform ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .connection-quality:hover .connection-quality__details {
      opacity: 1;
      visibility: visible;
      transform: translateY(0);
    }

    .connection-quality__stat {
      display: flex;
      justify-content: space-between;
      padding: var(--space-1, 4px) 0;
      border-bottom: 1px solid var(--color-border-subtle);
    }

    .connection-quality__stat:last-child {
      border-bottom: none;
    }

    .connection-quality__stat-label {
      color: var(--color-text-muted);
    }

    .connection-quality__stat-value {
      font-weight: var(--font-weight-medium, 500);
      font-variant-numeric: tabular-nums;
    }

    /* Warning pulse animation */
    .connection-quality--warning {
      animation: quality-pulse 2s ease-in-out infinite;
    }

    @keyframes quality-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }

    /* Reconnecting animation */
    .connection-quality--reconnecting .connection-quality__bars {
      animation: bars-reconnect 1.5s ease-in-out infinite;
    }

    @keyframes bars-reconnect {
      0%, 100% { opacity: 0.5; }
      50% { opacity: 1; }
    }

    /* Dark theme */
    [data-theme="midnight"] .connection-quality {
      background: var(--glass-surface-2, rgba(60, 50, 45, 0.8));
      border-color: var(--color-border-subtle, rgba(255, 255, 255, 0.1));
    }

    [data-theme="midnight"] .connection-quality__details {
      background: var(--color-background-elevated, #70605a);
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .connection-quality,
      .connection-quality__bar,
      .connection-quality__details {
        transition: none;
      }

      .connection-quality--warning,
      .connection-quality--reconnecting .connection-quality__bars {
        animation: none;
      }
    }
  `;

  document.head.appendChild(styleElement);
  log.debug('Connection quality styles injected');
}

// ============================================================================
// QUALITY CALCULATION
// ============================================================================

function calculateQuality(stats: ConnectionStats): ConnectionQuality {
  if (stats.state === 'disconnected' || stats.state === 'reconnecting') {
    return 'disconnected';
  }

  const { rtt = 0, packetLoss = 0, jitter = 0 } = stats;

  // Check thresholds from best to worst
  if (
    rtt <= QUALITY_THRESHOLDS.excellent.rtt &&
    packetLoss <= QUALITY_THRESHOLDS.excellent.packetLoss &&
    jitter <= QUALITY_THRESHOLDS.excellent.jitter
  ) {
    return 'excellent';
  }

  if (
    rtt <= QUALITY_THRESHOLDS.good.rtt &&
    packetLoss <= QUALITY_THRESHOLDS.good.packetLoss &&
    jitter <= QUALITY_THRESHOLDS.good.jitter
  ) {
    return 'good';
  }

  if (
    rtt <= QUALITY_THRESHOLDS.fair.rtt &&
    packetLoss <= QUALITY_THRESHOLDS.fair.packetLoss &&
    jitter <= QUALITY_THRESHOLDS.fair.jitter
  ) {
    return 'fair';
  }

  return 'poor';
}

function getActiveBars(quality: ConnectionQuality): number {
  switch (quality) {
    case 'excellent':
      return 4;
    case 'good':
      return 3;
    case 'fair':
      return 2;
    case 'poor':
      return 1;
    case 'disconnected':
      return 0;
  }
}

// ============================================================================
// RENDER
// ============================================================================

function createIndicator(): HTMLElement {
  const el = document.createElement('div');
  el.className = `connection-quality connection-quality--${options.position} connection-quality--${options.size}`;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-label', 'Connection quality');

  el.innerHTML = `
    <div class="connection-quality__bars" aria-hidden="true">
      <div class="connection-quality__bar"></div>
      <div class="connection-quality__bar"></div>
      <div class="connection-quality__bar"></div>
      <div class="connection-quality__bar"></div>
    </div>
    <span class="connection-quality__label">Connecting...</span>
    ${options.showDetails ? `
      <div class="connection-quality__details">
        <div class="connection-quality__stat">
          <span class="connection-quality__stat-label">Latency</span>
          <span class="connection-quality__stat-value" data-stat="rtt">--</span>
        </div>
        <div class="connection-quality__stat">
          <span class="connection-quality__stat-label">Packet loss</span>
          <span class="connection-quality__stat-value" data-stat="packetLoss">--</span>
        </div>
        <div class="connection-quality__stat">
          <span class="connection-quality__stat-label">Jitter</span>
          <span class="connection-quality__stat-value" data-stat="jitter">--</span>
        </div>
      </div>
    ` : ''}
  `;

  return el;
}

function updateIndicator(): void {
  if (!indicator) return;

  const bars = indicator.querySelectorAll('.connection-quality__bar');
  const label = indicator.querySelector('.connection-quality__label');
  const activeBars = getActiveBars(currentQuality);
  const color = QUALITY_COLORS[currentQuality];

  // Update CSS variable for color
  indicator.style.setProperty('--quality-color', color);

  // Update bars
  bars.forEach((bar, i) => {
    bar.classList.toggle('connection-quality__bar--active', i < activeBars);
  });

  // Update label
  if (label) {
    label.textContent = QUALITY_LABELS[currentQuality];
  }

  // Update warning/reconnecting states
  indicator.classList.toggle('connection-quality--warning', currentQuality === 'poor');
  indicator.classList.toggle(
    'connection-quality--reconnecting',
    currentStats.state === 'reconnecting'
  );

  // Update stats if showing details
  if (options.showDetails) {
    const rttEl = indicator.querySelector('[data-stat="rtt"]');
    const packetLossEl = indicator.querySelector('[data-stat="packetLoss"]');
    const jitterEl = indicator.querySelector('[data-stat="jitter"]');

    if (rttEl) rttEl.textContent = currentStats.rtt ? `${Math.round(currentStats.rtt)}ms` : '--';
    if (packetLossEl)
      packetLossEl.textContent = currentStats.packetLoss !== undefined
        ? `${currentStats.packetLoss.toFixed(1)}%`
        : '--';
    if (jitterEl)
      jitterEl.textContent = currentStats.jitter ? `${Math.round(currentStats.jitter)}ms` : '--';
  }

  // Auto-hide if excellent and option enabled
  if (options.autoHide && currentQuality === 'excellent') {
    indicator.classList.remove('connection-quality--visible');
  } else if (currentQuality !== 'disconnected') {
    indicator.classList.add('connection-quality--visible');
  }

  // Update aria-label for screen readers
  indicator.setAttribute(
    'aria-label',
    `Connection quality: ${QUALITY_LABELS[currentQuality]}. ` +
    (currentStats.rtt ? `Latency ${Math.round(currentStats.rtt)}ms.` : '')
  );
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize connection quality indicator
 */
export function initConnectionQuality(opts: QualityIndicatorOptions = {}): void {
  if (indicator) return;
  if (typeof document === 'undefined') return;

  options = { ...DEFAULT_OPTIONS, ...opts };

  injectStyles();

  indicator = createIndicator();
  document.body.appendChild(indicator);

  log.info('Connection quality indicator initialized');
}

/**
 * Update connection stats
 */
export function updateConnectionStats(stats: ConnectionStats): void {
  currentStats = stats;
  currentQuality = calculateQuality(stats);
  updateIndicator();

  log.debug('Connection stats updated', { quality: currentQuality, stats });
}

/**
 * Set quality directly (without stats)
 */
export function setQuality(quality: ConnectionQuality): void {
  currentQuality = quality;
  updateIndicator();
}

/**
 * Start automatic updates with a callback
 */
export function startAutoUpdate(getStats: () => ConnectionStats): void {
  statsCallback = getStats;

  const update = () => {
    if (statsCallback) {
      updateConnectionStats(statsCallback());
    }
  };

  // Initial update
  update();

  // Start interval
  updateTimer = setInterval(update, options.updateInterval);
  log.debug('Auto-update started');
}

/**
 * Stop automatic updates
 */
export function stopAutoUpdate(): void {
  if (updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
  }
  statsCallback = null;
  log.debug('Auto-update stopped');
}

/**
 * Show the indicator
 */
export function show(): void {
  indicator?.classList.add('connection-quality--visible');
}

/**
 * Hide the indicator
 */
export function hide(): void {
  indicator?.classList.remove('connection-quality--visible');
}

/**
 * Get current quality
 */
export function getCurrentQuality(): ConnectionQuality {
  return currentQuality;
}

/**
 * Dispose connection quality indicator
 */
export function disposeConnectionQuality(): void {
  stopAutoUpdate();

  if (indicator) {
    indicator.remove();
    indicator = null;
  }

  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }

  currentQuality = 'disconnected';
  currentStats = {};

  log.debug('Connection quality indicator disposed');
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const connectionQuality = {
  init: initConnectionQuality,
  update: updateConnectionStats,
  setQuality,
  startAutoUpdate,
  stopAutoUpdate,
  show,
  hide,
  getQuality: getCurrentQuality,
  dispose: disposeConnectionQuality,
};

// Aliases for backward compatibility with app.ts
export const connectionQualityUI = connectionQuality;
export const initConnectionQualityUI = initConnectionQuality;
