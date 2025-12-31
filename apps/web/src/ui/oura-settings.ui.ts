/**
 * Oura Ring Settings UI
 *
 * Settings panel for Oura Ring integration.
 * Shows sleep, readiness, and activity data with OAuth connection flow.
 *
 * DESIGN PRINCIPLES:
 * - Safe DOM creation (no innerHTML for user data)
 * - Accessible with keyboard navigation
 * - Follows design system tokens
 * - Shows comprehensive health metrics
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { apiGet, apiDelete } from '../utils/api.js';
import { toast } from './toast.ui.js';
import { t } from '../i18n/index.js';

// ============================================================================
// TYPES
// ============================================================================

interface OuraSleepSummary {
  date: string;
  score: number;
  totalSleep: number;
  efficiency: number;
  remSleep: number;
  deepSleep: number;
  lightSleep: number;
  averageHrv: number;
  averageHeartRate: number;
}

interface OuraReadinessSummary {
  date: string;
  score: number;
  temperatureDeviation: number;
  contributors: {
    activityBalance: number;
    bodyTemperature: number;
    hrvBalance: number;
    previousNight: number;
    restingHeartRate: number;
    sleepBalance: number;
  };
}

interface OuraActivitySummary {
  date: string;
  score: number;
  steps: number;
  activeCalories: number;
  highActivityTime: number;
  mediumActivityTime: number;
}

interface OuraStatus {
  connected: boolean;
  sleep?: OuraSleepSummary;
  readiness?: OuraReadinessSummary;
  activity?: OuraActivitySummary;
  error?: string;
}

interface OuraSettingsCallbacks {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onClose?: () => void;
}

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;
let callbacks: OuraSettingsCallbacks = {};
let isLoading = false;

// ============================================================================
// SAFE ICON CREATION
// Static SVG icons - these are trusted content defined in code, not user input.
// We create them safely using DOMParser to avoid XSS risks.
// ============================================================================

const SVG_ICONS = {
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  ring: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  unlink: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m18.84 12.25 1.72-1.71a5 5 0 0 0-.12-7.07 5 5 0 0 0-6.95 0l-1.72 1.71"/><path d="m5.17 11.75-1.71 1.71a5 5 0 0 0 .12 7.07 5 5 0 0 0 6.95 0l1.71-1.71"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
} as const;

type IconName = keyof typeof SVG_ICONS;

/**
 * Create an SVG element from a trusted static icon string.
 * Uses DOMParser for safe parsing of static SVG content.
 */
function createIcon(name: IconName): SVGSVGElement | null {
  const svgString = SVG_ICONS[name];
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (svg && !doc.querySelector('parsererror')) {
    return svg;
  }
  return null;
}

// ============================================================================
// HELPERS
// ============================================================================

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options?: {
    className?: string;
    textContent?: string;
    attributes?: Record<string, string>;
  }
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (options?.className) el.className = options.className;
  if (options?.textContent) el.textContent = options.textContent;
  if (options?.attributes) {
    Object.entries(options.attributes).forEach(([key, value]) => {
      el.setAttribute(key, value);
    });
  }
  return el;
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

function getScoreColor(score: number): string {
  if (score >= 85) return 'var(--color-semantic-success, #228b22)';
  if (score >= 70) return 'var(--color-accent-primary, #2d5a3d)';
  if (score >= 50) return 'var(--color-semantic-warning, #b8860b)';
  return 'var(--color-semantic-error, #dc3545)';
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;

  styleElement = document.createElement('style');
  styleElement.textContent = `
    .oura-settings {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 2100);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      visibility: hidden;
      transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD}, visibility ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }

    .oura-settings--visible {
      opacity: 1;
      visibility: visible;
    }

    .oura-settings__backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.75);
    }

    .oura-settings__panel {
      position: relative;
      width: 90%;
      max-width: 420px;
      max-height: 85vh;
      background: var(--color-bg-elevated, #FFFDFB);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      border-radius: var(--radius-xl, 20px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
      display: flex;
      flex-direction: column;
      transform: scale(0.95);
      transition: transform ${DURATION.MODERATE}ms ${EASING.EXPO_OUT};
      overflow: hidden;
    }

    .oura-settings--visible .oura-settings__panel {
      transform: scale(1);
    }

    .oura-settings__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-5, 20px) var(--space-6, 24px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    }

    .oura-settings__title {
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
    }

    .oura-settings__title-icon {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #7c3aed, #a855f7);
      border-radius: var(--radius-lg, 0.75rem);
      color: white;
    }

    .oura-settings__title-icon svg {
      width: 20px;
      height: 20px;
    }

    .oura-settings__title h2 {
      font-family: var(--font-display);
      font-size: var(--text-lg, 1.125rem);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-primary, #2c2520);
      margin: 0;
    }

    .oura-settings__close {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-background-tertiary, #ebe6df);
      border: none;
      border-radius: var(--radius-full);
      color: var(--color-text-secondary);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .oura-settings__close:hover {
      background: var(--color-background-secondary);
      color: var(--color-text-primary);
    }

    .oura-settings__close:focus-visible {
      outline: 2px solid var(--color-accent-primary);
      outline-offset: 2px;
    }

    .oura-settings__close svg {
      width: 18px;
      height: 18px;
    }

    .oura-settings__content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-6, 24px);
    }

    /* Connect state */
    .oura-settings__connect {
      text-align: center;
      padding: var(--space-8, 32px) var(--space-4, 16px);
    }

    .oura-settings__connect-icon {
      width: 80px;
      height: 80px;
      margin: 0 auto var(--space-6, 24px);
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #7c3aed20, #a855f720);
      border-radius: var(--radius-full);
      color: #7c3aed;
    }

    .oura-settings__connect-icon svg {
      width: 40px;
      height: 40px;
    }

    .oura-settings__connect h3 {
      font-family: var(--font-display);
      font-size: var(--text-xl, 1.25rem);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-primary);
      margin: 0 0 var(--space-2, 8px);
    }

    .oura-settings__connect p {
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
      margin: 0 0 var(--space-6, 24px);
    }

    .oura-settings__connect-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-3, 12px) var(--space-6, 24px);
      background: linear-gradient(135deg, #7c3aed, #a855f7);
      border: none;
      border-radius: var(--radius-lg);
      font-family: var(--font-body);
      font-size: var(--text-base);
      font-weight: var(--font-weight-medium, 500);
      color: white;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .oura-settings__connect-btn:hover {
      transform: translateY(-1px);
      box-shadow: var(--shadow-lg);
    }

    .oura-settings__connect-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    .oura-settings__connect-btn svg {
      width: 18px;
      height: 18px;
    }

    /* Score cards */
    .oura-settings__scores {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-3, 12px);
      margin-bottom: var(--space-6, 24px);
    }

    .oura-settings__score-card {
      background: var(--color-background-secondary, #f5f2ed);
      border-radius: var(--radius-lg);
      padding: var(--space-4, 16px);
      text-align: center;
    }

    .oura-settings__score-icon {
      width: 32px;
      height: 32px;
      margin: 0 auto var(--space-2, 8px);
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-md);
    }

    .oura-settings__score-icon svg {
      width: 18px;
      height: 18px;
    }

    .oura-settings__score-value {
      font-family: var(--font-display);
      font-size: var(--text-2xl, 1.5rem);
      font-weight: var(--font-weight-bold, 700);
      margin-bottom: var(--space-1, 4px);
    }

    .oura-settings__score-label {
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    /* Data sections */
    .oura-settings__section {
      margin-bottom: var(--space-6, 24px);
    }

    .oura-settings__section:last-child {
      margin-bottom: 0;
    }

    .oura-settings__section-header {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      margin-bottom: var(--space-3, 12px);
    }

    .oura-settings__section-icon {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #7c3aed;
    }

    .oura-settings__section-icon svg {
      width: 18px;
      height: 18px;
    }

    .oura-settings__section-title {
      font-family: var(--font-display);
      font-size: var(--text-base);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-primary);
      margin: 0;
    }

    .oura-settings__metrics {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-3, 12px);
    }

    .oura-settings__metric {
      background: var(--color-background-secondary, #f5f2ed);
      border-radius: var(--radius-md);
      padding: var(--space-3, 12px);
    }

    .oura-settings__metric-value {
      font-family: var(--font-display);
      font-size: var(--text-lg, 1.125rem);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-primary);
    }

    .oura-settings__metric-label {
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
    }

    /* Disconnect button */
    .oura-settings__disconnect {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 8px);
      width: 100%;
      padding: var(--space-3, 12px);
      background: transparent;
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
      font-family: var(--font-body);
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
      cursor: pointer;
      margin-top: var(--space-6, 24px);
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .oura-settings__disconnect:hover {
      background: var(--color-semantic-error-bg, rgba(220, 53, 69, 0.1));
      border-color: var(--color-semantic-error);
      color: var(--color-semantic-error);
    }

    .oura-settings__disconnect:focus-visible {
      outline: 2px solid var(--color-accent-primary);
      outline-offset: 2px;
    }

    .oura-settings__disconnect svg {
      width: 16px;
      height: 16px;
    }

    /* Loading state */
    .oura-settings__loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-12, 48px) var(--space-4, 16px);
    }

    .oura-settings__spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--color-border-subtle);
      border-top-color: #7c3aed;
      border-radius: var(--radius-full);
      animation: oura-spin 1s linear infinite;
      margin-bottom: var(--space-4, 16px);
    }

    @keyframes oura-spin {
      to { transform: rotate(360deg); }
    }

    /* Dark theme */
    [data-theme="midnight"] .oura-settings__panel {
      background: var(--color-background-elevated, #504540);
    }

    [data-theme="midnight"] .oura-settings__title h2 {
      color: var(--color-text-primary, #faf6f0);
    }

    [data-theme="midnight"] .oura-settings__score-card,
    [data-theme="midnight"] .oura-settings__metric {
      background: var(--color-background-secondary, #60504a);
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .oura-settings,
      .oura-settings__panel {
        transition: none;
      }

      .oura-settings__spinner {
        animation: none;
      }
    }
  `;
  document.head.appendChild(styleElement);
}

// ============================================================================
// RENDER FUNCTIONS
// ============================================================================

function renderConnectState(): void {
  if (!container) return;

  const content = container.querySelector('.oura-settings__content');
  if (!content) return;

  // Clear existing content safely
  while (content.firstChild) {
    content.removeChild(content.firstChild);
  }

  const connectDiv = createElement('div', { className: 'oura-settings__connect' });

  // Icon
  const iconDiv = createElement('div', { className: 'oura-settings__connect-icon' });
  const ringIcon = createIcon('ring');
  if (ringIcon) iconDiv.appendChild(ringIcon);
  connectDiv.appendChild(iconDiv);

  // Title
  const title = createElement('h3', { textContent: 'Connect Your Oura Ring' });
  connectDiv.appendChild(title);

  // Description
  const description = createElement('p', {
    textContent: 'Link your Oura Ring to get personalized insights about your sleep, readiness, and activity.',
  });
  connectDiv.appendChild(description);

  // Connect button
  const connectBtn = createElement('button', { className: 'oura-settings__connect-btn' });
  const linkIcon = createIcon('link');
  if (linkIcon) connectBtn.appendChild(linkIcon);
  connectBtn.appendChild(createElement('span', { textContent: 'Connect Oura' }));
  connectBtn.disabled = isLoading;
  connectBtn.addEventListener('click', () => { void handleConnect(); });
  connectDiv.appendChild(connectBtn);

  content.appendChild(connectDiv);
}

function renderConnectedState(status: OuraStatus): void {
  if (!container) return;

  const content = container.querySelector('.oura-settings__content');
  if (!content) return;

  // Clear existing content safely
  while (content.firstChild) {
    content.removeChild(content.firstChild);
  }

  // Score cards (if we have data)
  if (status.sleep || status.readiness || status.activity) {
    const scoresDiv = createElement('div', { className: 'oura-settings__scores' });

    // Sleep score
    if (status.sleep) {
      const sleepCard = createElement('div', { className: 'oura-settings__score-card' });
      const sleepIconDiv = createElement('div', { className: 'oura-settings__score-icon' });
      sleepIconDiv.style.background = `${getScoreColor(status.sleep.score)}20`;
      sleepIconDiv.style.color = getScoreColor(status.sleep.score);
      const moonIcon = createIcon('moon');
      if (moonIcon) sleepIconDiv.appendChild(moonIcon);
      sleepCard.appendChild(sleepIconDiv);

      const sleepValue = createElement('div', {
        className: 'oura-settings__score-value',
        textContent: String(status.sleep.score),
      });
      sleepValue.style.color = getScoreColor(status.sleep.score);
      sleepCard.appendChild(sleepValue);

      sleepCard.appendChild(createElement('div', {
        className: 'oura-settings__score-label',
        textContent: 'Sleep',
      }));
      scoresDiv.appendChild(sleepCard);
    }

    // Readiness score
    if (status.readiness) {
      const readyCard = createElement('div', { className: 'oura-settings__score-card' });
      const readyIconDiv = createElement('div', { className: 'oura-settings__score-icon' });
      readyIconDiv.style.background = `${getScoreColor(status.readiness.score)}20`;
      readyIconDiv.style.color = getScoreColor(status.readiness.score);
      const zapIcon = createIcon('zap');
      if (zapIcon) readyIconDiv.appendChild(zapIcon);
      readyCard.appendChild(readyIconDiv);

      const readyValue = createElement('div', {
        className: 'oura-settings__score-value',
        textContent: String(status.readiness.score),
      });
      readyValue.style.color = getScoreColor(status.readiness.score);
      readyCard.appendChild(readyValue);

      readyCard.appendChild(createElement('div', {
        className: 'oura-settings__score-label',
        textContent: 'Readiness',
      }));
      scoresDiv.appendChild(readyCard);
    }

    // Activity score
    if (status.activity) {
      const actCard = createElement('div', { className: 'oura-settings__score-card' });
      const actIconDiv = createElement('div', { className: 'oura-settings__score-icon' });
      actIconDiv.style.background = `${getScoreColor(status.activity.score)}20`;
      actIconDiv.style.color = getScoreColor(status.activity.score);
      const actIcon = createIcon('activity');
      if (actIcon) actIconDiv.appendChild(actIcon);
      actCard.appendChild(actIconDiv);

      const actValue = createElement('div', {
        className: 'oura-settings__score-value',
        textContent: String(status.activity.score),
      });
      actValue.style.color = getScoreColor(status.activity.score);
      actCard.appendChild(actValue);

      actCard.appendChild(createElement('div', {
        className: 'oura-settings__score-label',
        textContent: 'Activity',
      }));
      scoresDiv.appendChild(actCard);
    }

    content.appendChild(scoresDiv);
  }

  // Sleep details
  if (status.sleep) {
    const sleepSection = createElement('div', { className: 'oura-settings__section' });

    const sleepHeader = createElement('div', { className: 'oura-settings__section-header' });
    const sleepSectionIcon = createElement('div', { className: 'oura-settings__section-icon' });
    const moonIcon = createIcon('moon');
    if (moonIcon) sleepSectionIcon.appendChild(moonIcon);
    sleepHeader.appendChild(sleepSectionIcon);
    sleepHeader.appendChild(createElement('h3', { className: 'oura-settings__section-title', textContent: 'Sleep Details' }));
    sleepSection.appendChild(sleepHeader);

    const sleepMetrics = createElement('div', { className: 'oura-settings__metrics' });

    // Total sleep
    const totalMetric = createElement('div', { className: 'oura-settings__metric' });
    totalMetric.appendChild(createElement('div', {
      className: 'oura-settings__metric-value',
      textContent: formatMinutes(status.sleep.totalSleep),
    }));
    totalMetric.appendChild(createElement('div', {
      className: 'oura-settings__metric-label',
      textContent: 'Total Sleep',
    }));
    sleepMetrics.appendChild(totalMetric);

    // Deep sleep
    const deepMetric = createElement('div', { className: 'oura-settings__metric' });
    deepMetric.appendChild(createElement('div', {
      className: 'oura-settings__metric-value',
      textContent: formatMinutes(status.sleep.deepSleep),
    }));
    deepMetric.appendChild(createElement('div', {
      className: 'oura-settings__metric-label',
      textContent: 'Deep Sleep',
    }));
    sleepMetrics.appendChild(deepMetric);

    // REM sleep
    const remMetric = createElement('div', { className: 'oura-settings__metric' });
    remMetric.appendChild(createElement('div', {
      className: 'oura-settings__metric-value',
      textContent: formatMinutes(status.sleep.remSleep),
    }));
    remMetric.appendChild(createElement('div', {
      className: 'oura-settings__metric-label',
      textContent: 'REM Sleep',
    }));
    sleepMetrics.appendChild(remMetric);

    // HRV
    const hrvMetric = createElement('div', { className: 'oura-settings__metric' });
    hrvMetric.appendChild(createElement('div', {
      className: 'oura-settings__metric-value',
      textContent: `${status.sleep.averageHrv} ms`,
    }));
    hrvMetric.appendChild(createElement('div', {
      className: 'oura-settings__metric-label',
      textContent: 'Avg HRV',
    }));
    sleepMetrics.appendChild(hrvMetric);

    sleepSection.appendChild(sleepMetrics);
    content.appendChild(sleepSection);
  }

  // Activity details
  if (status.activity) {
    const actSection = createElement('div', { className: 'oura-settings__section' });

    const actHeader = createElement('div', { className: 'oura-settings__section-header' });
    const actSectionIcon = createElement('div', { className: 'oura-settings__section-icon' });
    const activityIcon = createIcon('activity');
    if (activityIcon) actSectionIcon.appendChild(activityIcon);
    actHeader.appendChild(actSectionIcon);
    actHeader.appendChild(createElement('h3', { className: 'oura-settings__section-title', textContent: 'Activity' }));
    actSection.appendChild(actHeader);

    const actMetrics = createElement('div', { className: 'oura-settings__metrics' });

    // Steps
    const stepsMetric = createElement('div', { className: 'oura-settings__metric' });
    stepsMetric.appendChild(createElement('div', {
      className: 'oura-settings__metric-value',
      textContent: status.activity.steps.toLocaleString(),
    }));
    stepsMetric.appendChild(createElement('div', {
      className: 'oura-settings__metric-label',
      textContent: 'Steps',
    }));
    actMetrics.appendChild(stepsMetric);

    // Active calories
    const calMetric = createElement('div', { className: 'oura-settings__metric' });
    calMetric.appendChild(createElement('div', {
      className: 'oura-settings__metric-value',
      textContent: `${status.activity.activeCalories} kcal`,
    }));
    calMetric.appendChild(createElement('div', {
      className: 'oura-settings__metric-label',
      textContent: 'Active Calories',
    }));
    actMetrics.appendChild(calMetric);

    actSection.appendChild(actMetrics);
    content.appendChild(actSection);
  }

  // Disconnect button
  const disconnectBtn = createElement('button', { className: 'oura-settings__disconnect' });
  const unlinkIcon = createIcon('unlink');
  if (unlinkIcon) disconnectBtn.appendChild(unlinkIcon);
  disconnectBtn.appendChild(createElement('span', { textContent: 'Disconnect Oura' }));
  disconnectBtn.addEventListener('click', handleDisconnect);
  content.appendChild(disconnectBtn);
}

function renderLoadingState(): void {
  if (!container) return;

  const content = container.querySelector('.oura-settings__content');
  if (!content) return;

  // Clear existing content safely
  while (content.firstChild) {
    content.removeChild(content.firstChild);
  }

  const loadingDiv = createElement('div', { className: 'oura-settings__loading' });
  loadingDiv.appendChild(createElement('div', { className: 'oura-settings__spinner' }));
  loadingDiv.appendChild(createElement('p', { textContent: 'Loading...' }));
  content.appendChild(loadingDiv);
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

async function handleConnect(): Promise<void> {
  isLoading = true;
  renderLoadingState();

  try {
    const response = await apiGet<{ url: string }>('/api/oura/auth/url');

    if (!response.ok || !response.data?.url) {
      throw new Error(response.error || 'Failed to get authorization URL');
    }

    window.location.href = response.data.url;
  } catch {
    isLoading = false;
    toast.error("Couldn't connect to Oura. Try again?");
    renderConnectState();
  }
}

async function handleDisconnect(): Promise<void> {
  if (!confirm('Disconnect your Oura Ring?')) return;

  isLoading = true;
  renderLoadingState();

  try {
    await apiDelete('/api/oura/disconnect');
    toast.success(t('toasts.ouraDisconnected'));
    callbacks.onDisconnected?.();
    renderConnectState();
  } catch {
    toast.error("Couldn't disconnect. Try again?");
    await loadStatus();
  } finally {
    isLoading = false;
  }
}

async function loadStatus(): Promise<void> {
  isLoading = true;
  renderLoadingState();

  try {
    const response = await apiGet<OuraStatus>('/api/oura/status');

    if (!response.ok) {
      throw new Error(response.error || 'Failed to load status');
    }

    const status = response.data;
    if (status?.connected) {
      renderConnectedState(status);
    } else {
      renderConnectState();
    }
  } catch {
    renderConnectState();
  } finally {
    isLoading = false;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function showOuraSettings(): Promise<void> {
  if (container) return;

  injectStyles();

  // Create container
  container = createElement('div', { className: 'oura-settings' });
  container.setAttribute('role', 'dialog');
  container.setAttribute('aria-label', 'Oura Ring settings');

  // Backdrop
  const backdrop = createElement('div', { className: 'oura-settings__backdrop' });
  backdrop.addEventListener('click', hideOuraSettings);
  container.appendChild(backdrop);

  // Panel
  const panel = createElement('div', { className: 'oura-settings__panel' });

  // Header
  const header = createElement('div', { className: 'oura-settings__header' });

  const titleDiv = createElement('div', { className: 'oura-settings__title' });
  const titleIconDiv = createElement('div', { className: 'oura-settings__title-icon' });
  const ringIcon = createIcon('ring');
  if (ringIcon) titleIconDiv.appendChild(ringIcon);
  titleDiv.appendChild(titleIconDiv);
  const titleText = createElement('h2', { textContent: 'Oura Ring' });
  titleDiv.appendChild(titleText);
  header.appendChild(titleDiv);

  const closeBtn = createElement('button', {
    className: 'oura-settings__close',
    attributes: { 'aria-label': 'Close' },
  });
  const closeIcon = createIcon('close');
  if (closeIcon) closeBtn.appendChild(closeIcon);
  closeBtn.addEventListener('click', hideOuraSettings);
  header.appendChild(closeBtn);

  panel.appendChild(header);

  // Content (will be populated by render functions)
  const content = createElement('div', { className: 'oura-settings__content' });
  panel.appendChild(content);

  container.appendChild(panel);
  document.body.appendChild(container);

  // Animate in
  requestAnimationFrame(() => {
    container?.classList.add('oura-settings--visible');
  });

  // Load status
  await loadStatus();

  // Check for OAuth callback results
  const urlParams = new URLSearchParams(window.location.search);
  const ouraResult = urlParams.get('oura');
  if (ouraResult === 'success') {
    toast.success(t('toasts.ouraRingConnected'));
    callbacks.onConnected?.();
    // Clean up URL
    const url = new URL(window.location.href);
    url.searchParams.delete('oura');
    window.history.replaceState({}, '', url.toString());
  } else if (ouraResult === 'error') {
    const message = urlParams.get('message');
    toast.error(message || "Couldn't connect Oura");
    // Clean up URL
    const url = new URL(window.location.href);
    url.searchParams.delete('oura');
    url.searchParams.delete('message');
    window.history.replaceState({}, '', url.toString());
  }

  // Escape to close
  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      hideOuraSettings();
    }
  };
  document.addEventListener('keydown', handleKeyDown);
}

export function hideOuraSettings(): void {
  if (!container) return;

  container.classList.remove('oura-settings--visible');
  callbacks.onClose?.();

  setTimeout(() => {
    container?.remove();
    container = null;
  }, DURATION.NORMAL);
}

export function setOuraSettingsCallbacks(cbs: OuraSettingsCallbacks): void {
  callbacks = cbs;
}

export default {
  show: showOuraSettings,
  hide: hideOuraSettings,
  setCallbacks: setOuraSettingsCallbacks,
};
