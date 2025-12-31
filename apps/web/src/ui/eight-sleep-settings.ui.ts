/**
 * Eight Sleep Settings UI
 *
 * Connect Eight Sleep smart mattress using OAuth.
 * Displays sleep data, temperature control, and biometrics.
 *
 * DESIGN PRINCIPLES:
 *   - Clean OAuth redirect flow (simpler than Ecobee's PIN)
 *   - Sleep score visualization
 *   - Temperature control slider
 *   - Uses safe DOM methods (no innerHTML)
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { apiGet, apiDelete, apiPut } from '../utils/api.js';
import { toast } from './toast.ui.js';
import { createLogger } from '../utils/logger.js';
import { t } from '../i18n/index.js';

const log = createLogger('EightSleep');

// ============================================================================
// TYPES
// ============================================================================

interface SleepSummary {
  date: string;
  score: number;
  sleepDuration: number;
  sleepEfficiency: number;
  timeToSleep: number;
  timesAwake: number;
  stages: {
    awake: number;
    light: number;
    deep: number;
    rem: number;
  };
  averageHrv: number;
  averageHeartRate: number;
  lowestHeartRate: number;
}

interface TemperatureState {
  currentLevel: number;
  targetLevel: number;
  active: boolean;
  scheduleEnabled: boolean;
}

interface Biometrics {
  averageHrv: number;
  averageRestingHeartRate: number;
  averageRespiratoryRate: number;
  hrvTrend: 'improving' | 'declining' | 'stable';
}

interface EightSleepStatus {
  connected: boolean;
  lastNightSleep?: SleepSummary | null;
  temperature?: TemperatureState | null;
  biometrics?: Biometrics | null;
  error?: string;
}

interface EightSleepSettingsCallbacks {
  onClose?: () => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

// ============================================================================
// SAFE DOM HELPERS
// ============================================================================

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  children?: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'className') {
        el.className = value;
      } else {
        el.setAttribute(key, value);
      }
    }
  }
  if (children) {
    for (const child of children) {
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else {
        el.appendChild(child);
      }
    }
  }
  return el;
}

function createSvgIcon(pathD: string, viewBox = '0 0 24 24'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathD);
  svg.appendChild(path);

  return svg;
}

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let callbacks: EightSleepSettingsCallbacks = {};

// ============================================================================
// SVG PATHS
// ============================================================================

const ICONS = {
  bed: 'M3 18v-6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v6M3 18h18M5 9V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3',
  close: 'M18 6L6 18M6 6l12 12',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  heart: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
  thermometer: 'M14 14.76V3.5a2.5 2.5 0 1 0-5 0v11.26a4.5 4.5 0 1 0 5 0z',
  trendUp: 'M23 6l-9.5 9.5-5-5L1 18',
  trendDown: 'M23 18l-9.5-9.5-5 5L1 6',
};

// ============================================================================
// STYLES
// ============================================================================

function getStyles(): string {
  return `
    .eightsleep-overlay {
      position: fixed;
      inset: 0;
      background: var(--backdrop-heavy, rgba(0, 0, 0, 0.6));
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: var(--z-modal, 2100);
      opacity: 0;
      transition: opacity ${DURATION.NORMAL}ms ${EASING.OUT_EXPO};
    }

    .eightsleep-overlay.visible {
      opacity: 1;
    }

    .eightsleep-panel {
      background: var(--color-bg-elevated, #1a1a2e);
      border-radius: var(--radius-2xl, 16px);
      max-width: 480px;
      width: calc(100% - 32px);
      max-height: calc(100vh - 64px);
      overflow-y: auto;
      box-shadow: var(--shadow-lg, 0 10px 40px rgba(0, 0, 0, 0.4));
      transform: scale(0.95) translateY(10px);
      transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
    }

    .eightsleep-overlay.visible .eightsleep-panel {
      transform: scale(1) translateY(0);
    }

    .eightsleep-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-lg, 24px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.1));
    }

    .eightsleep-title {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 8px);
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--color-text-primary, #fff);
    }

    .eightsleep-title svg {
      width: 24px;
      height: 24px;
      color: var(--color-accent-primary, #4a9eff);
    }

    .eightsleep-close {
      background: transparent;
      border: none;
      padding: var(--space-xs, 4px);
      cursor: pointer;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      border-radius: var(--radius-md, 8px);
      transition: all ${DURATION.FAST}ms ease;
    }

    .eightsleep-close:hover,
    .eightsleep-close:focus-visible {
      background: var(--color-bg-tertiary, rgba(255, 255, 255, 0.1));
      color: var(--color-text-primary, #fff);
    }

    .eightsleep-close svg {
      width: 20px;
      height: 20px;
    }

    .eightsleep-content {
      padding: var(--space-lg, 24px);
    }

    .eightsleep-score-card {
      background: var(--color-bg-secondary, rgba(255, 255, 255, 0.05));
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-lg, 24px);
      margin-bottom: var(--space-md, 16px);
      text-align: center;
    }

    .eightsleep-score-ring {
      position: relative;
      width: 100px;
      height: 100px;
      margin: 0 auto var(--space-md, 16px);
    }

    .eightsleep-score-ring svg {
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
    }

    .eightsleep-score-ring circle {
      fill: none;
      stroke-width: 8;
    }

    .eightsleep-score-ring .bg {
      stroke: var(--color-bg-tertiary, rgba(255, 255, 255, 0.1));
    }

    .eightsleep-score-ring .progress {
      stroke: var(--color-accent-primary, #4a9eff);
      stroke-linecap: round;
      transition: stroke-dasharray ${DURATION.SLOW}ms ${EASING.OUT_EXPO};
    }

    .eightsleep-score-value {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 1.75rem;
      font-weight: 600;
      color: var(--color-text-primary, #fff);
    }

    .eightsleep-score-label {
      font-size: 0.875rem;
      color: var(--color-text-secondary, rgba(255, 255, 255, 0.7));
    }

    .eightsleep-stages {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--space-sm, 8px);
      margin-top: var(--space-md, 16px);
    }

    .eightsleep-stage {
      text-align: center;
    }

    .eightsleep-stage-value {
      font-size: 1rem;
      font-weight: 500;
      color: var(--color-text-primary, #fff);
    }

    .eightsleep-stage-label {
      font-size: 0.75rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      text-transform: uppercase;
    }

    .eightsleep-temp-card {
      background: var(--color-bg-secondary, rgba(255, 255, 255, 0.05));
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-lg, 24px);
      margin-bottom: var(--space-md, 16px);
    }

    .eightsleep-temp-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-md, 16px);
    }

    .eightsleep-temp-title {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 8px);
      font-weight: 500;
      color: var(--color-text-primary, #fff);
    }

    .eightsleep-temp-title svg {
      width: 20px;
      height: 20px;
      color: var(--color-accent-primary, #4a9eff);
    }

    .eightsleep-temp-status {
      font-size: 0.875rem;
      color: var(--color-text-secondary, rgba(255, 255, 255, 0.7));
    }

    .eightsleep-temp-slider {
      width: 100%;
      height: 8px;
      border-radius: var(--radius-full, 9999px);
      background: linear-gradient(to right, #3b82f6, #8b5cf6, #ef4444);
      -webkit-appearance: none;
      appearance: none;
    }

    .eightsleep-temp-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: white;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    }

    .eightsleep-temp-labels {
      display: flex;
      justify-content: space-between;
      margin-top: var(--space-xs, 4px);
      font-size: 0.75rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
    }

    .eightsleep-biometrics {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-sm, 8px);
      margin-bottom: var(--space-md, 16px);
    }

    .eightsleep-biometric {
      background: var(--color-bg-secondary, rgba(255, 255, 255, 0.05));
      border-radius: var(--radius-md, 8px);
      padding: var(--space-md, 16px);
      text-align: center;
    }

    .eightsleep-biometric-icon {
      width: 20px;
      height: 20px;
      margin: 0 auto var(--space-xs, 4px);
      color: var(--color-accent-primary, #4a9eff);
    }

    .eightsleep-biometric-value {
      font-size: 1.25rem;
      font-weight: 500;
      color: var(--color-text-primary, #fff);
    }

    .eightsleep-biometric-label {
      font-size: 0.75rem;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
    }

    .eightsleep-connect-section {
      text-align: center;
      padding: var(--space-xl, 40px) var(--space-lg, 24px);
    }

    .eightsleep-connect-icon {
      width: 64px;
      height: 64px;
      margin: 0 auto var(--space-md, 16px);
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
    }

    .eightsleep-connect-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--color-text-primary, #fff);
      margin-bottom: var(--space-sm, 8px);
    }

    .eightsleep-connect-desc {
      color: var(--color-text-secondary, rgba(255, 255, 255, 0.7));
      font-size: 0.875rem;
      margin-bottom: var(--space-lg, 24px);
    }

    .eightsleep-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-sm, 8px);
      padding: var(--space-sm, 12px) var(--space-lg, 24px);
      border-radius: var(--radius-full, 9999px);
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ease;
    }

    .eightsleep-btn-primary {
      background: var(--color-accent-primary, #4a9eff);
      color: white;
      border: none;
    }

    .eightsleep-btn-primary:hover,
    .eightsleep-btn-primary:focus-visible {
      background: var(--color-accent-hover, #3a8eef);
      transform: translateY(-1px);
    }

    .eightsleep-btn-danger {
      background: transparent;
      color: var(--color-semantic-error, #ef4444);
      border: 1px solid currentColor;
    }

    .eightsleep-btn-danger:hover,
    .eightsleep-btn-danger:focus-visible {
      background: var(--color-semantic-error, #ef4444);
      color: white;
    }

    .eightsleep-footer {
      padding: var(--space-md, 16px) var(--space-lg, 24px);
      border-top: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.1));
      display: flex;
      justify-content: flex-end;
      gap: var(--space-sm, 8px);
    }

    @media (prefers-reduced-motion: reduce) {
      .eightsleep-overlay,
      .eightsleep-panel,
      .eightsleep-btn {
        animation: none;
        transition: opacity ${DURATION.FAST}ms linear;
      }
    }
  `;
}

// ============================================================================
// RENDER FUNCTIONS
// ============================================================================

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function renderScoreRing(score: number): HTMLElement {
  const container = createElement('div', { className: 'eightsleep-score-ring' });

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');

  const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  bgCircle.setAttribute('class', 'bg');
  bgCircle.setAttribute('cx', '50');
  bgCircle.setAttribute('cy', '50');
  bgCircle.setAttribute('r', '42');
  svg.appendChild(bgCircle);

  const progressCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  progressCircle.setAttribute('class', 'progress');
  progressCircle.setAttribute('cx', '50');
  progressCircle.setAttribute('cy', '50');
  progressCircle.setAttribute('r', '42');

  const circumference = 2 * Math.PI * 42;
  const _progress = (score / 100) * circumference;
  progressCircle.setAttribute('stroke-dasharray', `${_progress} ${circumference}`);
  svg.appendChild(progressCircle);

  container.appendChild(svg);

  const valueEl = createElement('div', { className: 'eightsleep-score-value' }, [String(score)]);
  container.appendChild(valueEl);

  return container;
}

function renderConnectedState(status: EightSleepStatus): HTMLElement {
  const content = createElement('div', { className: 'eightsleep-content' });

  // Sleep score card
  if (status.lastNightSleep) {
    const sleep = status.lastNightSleep;
    const scoreCard = createElement('div', { className: 'eightsleep-score-card' });

    scoreCard.appendChild(renderScoreRing(sleep.score));
    scoreCard.appendChild(createElement('div', { className: 'eightsleep-score-label' }, [
      `${formatDuration(sleep.sleepDuration)} of sleep`,
    ]));

    // Sleep stages
    const stages = createElement('div', { className: 'eightsleep-stages' });
    const stageData = [
      { label: 'Deep', value: formatDuration(sleep.stages.deep) },
      { label: 'REM', value: formatDuration(sleep.stages.rem) },
      { label: 'Light', value: formatDuration(sleep.stages.light) },
      { label: 'Awake', value: formatDuration(sleep.stages.awake) },
    ];

    for (const stage of stageData) {
      const stageEl = createElement('div', { className: 'eightsleep-stage' }, [
        createElement('div', { className: 'eightsleep-stage-value' }, [stage.value]),
        createElement('div', { className: 'eightsleep-stage-label' }, [stage.label]),
      ]);
      stages.appendChild(stageEl);
    }

    scoreCard.appendChild(stages);
    content.appendChild(scoreCard);
  }

  // Temperature control
  if (status.temperature) {
    const tempCard = createElement('div', { className: 'eightsleep-temp-card' });

    const tempHeader = createElement('div', { className: 'eightsleep-temp-header' });
    const tempTitle = createElement('div', { className: 'eightsleep-temp-title' });
    tempTitle.appendChild(createSvgIcon(ICONS.thermometer));
    tempTitle.appendChild(document.createTextNode('Bed Temperature'));
    tempHeader.appendChild(tempTitle);

    const _tempStatus = createElement('div', { className: 'eightsleep-temp-status' }, [
      status.temperature.active ? `Level ${status.temperature.currentLevel}` : 'Off',
    ]);
    tempHeader.appendChild(_tempStatus);
    tempCard.appendChild(tempHeader);

    // Slider
    const slider = createElement('input', {
      className: 'eightsleep-temp-slider',
      type: 'range',
      min: '-10',
      max: '10',
      value: String(status.temperature.targetLevel),
    });

    slider.addEventListener('change', () => {
      const level = parseInt(slider.value, 10);
      void setTemperature(level);
    });

    tempCard.appendChild(slider);

    const labels = createElement('div', { className: 'eightsleep-temp-labels' }, [
      createElement('span', {}, ['Cool']),
      createElement('span', {}, ['Warm']),
    ]);
    tempCard.appendChild(labels);

    content.appendChild(tempCard);
  }

  // Biometrics
  if (status.biometrics) {
    const bio = status.biometrics;
    const biometrics = createElement('div', { className: 'eightsleep-biometrics' });

    const bioData = [
      { icon: ICONS.heart, value: `${bio.averageRestingHeartRate}`, label: 'Resting HR' },
      { icon: ICONS.heart, value: `${bio.averageHrv}ms`, label: 'HRV' },
      {
        icon: bio.hrvTrend === 'improving' ? ICONS.trendUp : bio.hrvTrend === 'declining' ? ICONS.trendDown : ICONS.heart,
        value: bio.hrvTrend.charAt(0).toUpperCase() + bio.hrvTrend.slice(1),
        label: 'Trend',
      },
    ];

    for (const item of bioData) {
      const bioEl = createElement('div', { className: 'eightsleep-biometric' });

      const iconEl = createSvgIcon(item.icon);
      iconEl.classList.add('eightsleep-biometric-icon');
      bioEl.appendChild(iconEl);

      bioEl.appendChild(createElement('div', { className: 'eightsleep-biometric-value' }, [item.value]));
      bioEl.appendChild(createElement('div', { className: 'eightsleep-biometric-label' }, [item.label]));

      biometrics.appendChild(bioEl);
    }

    content.appendChild(biometrics);
  }

  return content;
}

function renderDisconnectedState(): HTMLElement {
  const content = createElement('div', { className: 'eightsleep-connect-section' });

  const icon = createSvgIcon(ICONS.bed);
  icon.classList.add('eightsleep-connect-icon');
  content.appendChild(icon);

  content.appendChild(createElement('div', { className: 'eightsleep-connect-title' }, ['Connect Eight Sleep']));
  content.appendChild(createElement('div', { className: 'eightsleep-connect-desc' }, [
    'Track your sleep, control bed temperature, and see your biometrics.',
  ]));

  const btn = createElement('button', { className: 'eightsleep-btn eightsleep-btn-primary' }, ['Connect Eight Sleep']);
  btn.addEventListener('click', () => { void startAuthFlow(); });
  content.appendChild(btn);

  return content;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function fetchStatus(): Promise<EightSleepStatus> {
  try {
    const response = await apiGet<EightSleepStatus>('/api/eight-sleep/status');
    return response.data || { connected: false };
  } catch (error) {
    log.error('Failed to fetch Eight Sleep status:', error);
    return { connected: false };
  }
}

async function startAuthFlow(): Promise<void> {
  try {
    const response = await apiGet<{ url: string }>('/api/eight-sleep/auth/url');

    if (response.data?.url) {
      // Redirect to Eight Sleep OAuth
      window.location.href = response.data.url;
    }
  } catch (error) {
    log.error('Failed to start Eight Sleep auth:', error);
    toast.error("Couldn't connect to Eight Sleep. Try again?");
  }
}

async function setTemperature(level: number): Promise<void> {
  try {
    await apiPut('/api/eight-sleep/temperature', { level });
    toast.success(t('toasts.bedSetToLevelLevel'));
  } catch (error) {
    log.error('Failed to set temperature:', error);
    toast.error("Couldn't set temperature. Try again?");
  }
}

async function disconnect(): Promise<void> {
  try {
    await apiDelete('/api/eight-sleep/disconnect');
    toast.success(t('toasts.eightSleepDisconnected'));
    callbacks.onDisconnected?.();
    render({ connected: false });
  } catch (error) {
    log.error('Failed to disconnect Eight Sleep:', error);
    toast.error("Couldn't disconnect. Try again?");
  }
}

// ============================================================================
// RENDER
// ============================================================================

function render(status: EightSleepStatus): void {
  if (!container) return;

  const panel = container.querySelector('.eightsleep-panel');
  if (!panel) return;

  // Remove old content
  const oldContent = panel.querySelector('.eightsleep-content, .eightsleep-connect-section');
  if (oldContent) {
    oldContent.remove();
  }

  // Render new content
  const content = status.connected
    ? renderConnectedState(status)
    : renderDisconnectedState();

  // Insert before footer
  const footer = panel.querySelector('.eightsleep-footer');
  if (footer) {
    panel.insertBefore(content, footer);
  } else {
    panel.appendChild(content);
  }

  // Update footer buttons
  updateFooter(status.connected);
}

function updateFooter(isConnected: boolean): void {
  if (!container) return;

  const footer = container.querySelector('.eightsleep-footer');
  if (!footer) return;

  // Clear footer
  footer.replaceChildren();

  if (isConnected) {
    const disconnectBtn = createElement('button', {
      className: 'eightsleep-btn eightsleep-btn-danger',
    }, ['Disconnect']);
    disconnectBtn.addEventListener('click', disconnect);
    footer.appendChild(disconnectBtn);
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function showEightSleepSettings(): Promise<void> {
  if (container) return;

  // Create container
  container = createElement('div', { className: 'eightsleep-overlay' });

  // Add styles
  const style = document.createElement('style');
  style.textContent = getStyles();
  container.appendChild(style);

  // Create panel
  const panel = createElement('div', { className: 'eightsleep-panel' });

  // Header
  const header = createElement('div', { className: 'eightsleep-header' });

  const title = createElement('div', { className: 'eightsleep-title' });
  title.appendChild(createSvgIcon(ICONS.bed));
  title.appendChild(document.createTextNode('Eight Sleep'));
  header.appendChild(title);

  const closeBtn = createElement('button', { className: 'eightsleep-close', 'aria-label': 'Close' });
  closeBtn.appendChild(createSvgIcon(ICONS.close));
  closeBtn.addEventListener('click', hideEightSleepSettings);
  header.appendChild(closeBtn);

  panel.appendChild(header);

  // Footer (will be populated by render)
  const footer = createElement('div', { className: 'eightsleep-footer' });
  panel.appendChild(footer);

  container.appendChild(panel);

  // Close on backdrop click
  container.addEventListener('click', (e) => {
    if (e.target === container) {
      hideEightSleepSettings();
    }
  });

  // Close on Escape
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      hideEightSleepSettings();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  document.body.appendChild(container);

  // Animate in
  requestAnimationFrame(() => {
    container?.classList.add('visible');
  });

  // Fetch initial state
  const status = await fetchStatus();
  render(status);
}

export function hideEightSleepSettings(): void {
  if (!container) return;

  container.classList.remove('visible');

  setTimeout(() => {
    container?.remove();
    container = null;
    callbacks.onClose?.();
  }, DURATION.NORMAL);
}

export function setEightSleepSettingsCallbacks(cbs: EightSleepSettingsCallbacks): void {
  callbacks = cbs;
}

export default {
  show: showEightSleepSettings,
  hide: hideEightSleepSettings,
  setCallbacks: setEightSleepSettingsCallbacks,
};
