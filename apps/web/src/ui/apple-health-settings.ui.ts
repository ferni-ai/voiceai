/**
 * Apple Health Settings UI
 *
 * Settings panel for Apple Health integration.
 * Shows synced health data from iOS HealthKit.
 *
 * Unlike OAuth integrations, Apple Health uses a push model:
 * - Setup happens in the native iOS app (not web)
 * - iOS app syncs HealthKit data to our backend
 * - This UI shows connection status and synced data
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

// ============================================================================
// TYPES
// ============================================================================

interface SleepSummary {
  inBed: number;
  asleep: number;
  awake: number;
  rem: number;
  deep: number;
  core: number;
  quality?: number;
}

interface ActivitySummary {
  steps: number;
  distance: number;
  activeEnergy: number;
  exerciseMinutes: number;
  standHours: number;
}

interface HeartSummary {
  resting?: number;
  average?: number;
  min?: number;
  max?: number;
  hrv?: number;
}

interface AppleHealthStatus {
  connected: boolean;
  deviceName?: string;
  lastSync?: string;
}

interface AppleHealthSummary {
  date: string;
  sleep?: SleepSummary;
  activity?: ActivitySummary;
  heart?: HeartSummary;
  steps?: number;
  mindfulMinutes?: number;
}

interface AppleHealthSettingsCallbacks {
  onDisconnected?: () => void;
  onClose?: () => void;
}

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;
let callbacks: AppleHealthSettingsCallbacks = {};
let _isLoading = false;

// ============================================================================
// SAFE ICON CREATION
// ============================================================================

const SVG_ICONS = {
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  heart:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  activity:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  footprints:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6-1.87 0-2.5 1.8-2.5 3.5 0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/></svg>',
  smartphone:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>',
  unlink:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m18.84 12.25 1.72-1.71a5 5 0 0 0-.12-7.07 5 5 0 0 0-6.95 0l-1.72 1.71"/><path d="m5.17 11.75-1.71 1.71a5 5 0 0 0 .12 7.07 5 5 0 0 0 6.95 0l1.71-1.71"/></svg>',
  refresh:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
  brain:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M12 5v13"/></svg>',
} as const;

type IconName = keyof typeof SVG_ICONS;

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
  const mins = Math.round(minutes % 60);
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

function formatDistance(meters: number): string {
  const km = meters / 1000;
  const miles = km * 0.621371;
  return `${miles.toFixed(1)} mi`;
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString();
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;

  styleElement = document.createElement('style');
  styleElement.textContent = `
    .apple-health-settings {
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

    .apple-health-settings--visible {
      opacity: 1;
      visibility: visible;
    }

    .apple-health-settings__backdrop {
      position: absolute;
      inset: 0;
      background: var(--backdrop-modal, rgba(44, 37, 32, 0.4));
    }

    .apple-health-settings__panel {
      position: relative;
      width: 90%;
      max-width: 420px;
      max-height: 85vh;
      background: var(--color-background-elevated, #fffdfb);
      border-radius: var(--radius-xl, 1rem);
      box-shadow: var(--shadow-2xl);
      display: flex;
      flex-direction: column;
      transform: scale(0.95);
      transition: transform ${DURATION.MODERATE}ms ${EASING.EXPO_OUT};
      overflow: hidden;
    }

    .apple-health-settings--visible .apple-health-settings__panel {
      transform: scale(1);
    }

    .apple-health-settings__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-5, 20px) var(--space-6, 24px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    }

    .apple-health-settings__title {
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
    }

    .apple-health-settings__title-icon {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #ff2d55, #ff6b8a);
      border-radius: var(--radius-lg, 0.75rem);
      color: white;
    }

    .apple-health-settings__title-icon svg {
      width: 20px;
      height: 20px;
    }

    .apple-health-settings__title h2 {
      font-family: var(--font-display);
      font-size: var(--text-lg, 1.125rem);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-primary, #2c2520);
      margin: 0;
    }

    .apple-health-settings__close {
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

    .apple-health-settings__close:hover {
      background: var(--color-background-secondary);
      color: var(--color-text-primary);
    }

    .apple-health-settings__close:focus-visible {
      outline: 2px solid var(--color-accent-primary);
      outline-offset: 2px;
    }

    .apple-health-settings__close svg {
      width: 18px;
      height: 18px;
    }

    .apple-health-settings__content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-6, 24px);
    }

    /* Not connected state */
    .apple-health-settings__not-connected {
      text-align: center;
      padding: var(--space-8, 32px) var(--space-4, 16px);
    }

    .apple-health-settings__not-connected-icon {
      width: 80px;
      height: 80px;
      margin: 0 auto var(--space-6, 24px);
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #ff2d5520, #ff6b8a20);
      border-radius: var(--radius-full);
      color: #ff2d55;
    }

    .apple-health-settings__not-connected-icon svg {
      width: 40px;
      height: 40px;
    }

    .apple-health-settings__not-connected h3 {
      font-family: var(--font-display);
      font-size: var(--text-xl, 1.25rem);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-primary);
      margin: 0 0 var(--space-2, 8px);
    }

    .apple-health-settings__not-connected p {
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
      margin: 0 0 var(--space-6, 24px);
      line-height: 1.5;
    }

    .apple-health-settings__instructions {
      background: var(--color-background-secondary, #f5f2ed);
      border-radius: var(--radius-lg);
      padding: var(--space-4, 16px);
      text-align: left;
    }

    .apple-health-settings__instructions h4 {
      font-size: var(--text-sm);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-primary);
      margin: 0 0 var(--space-3, 12px);
    }

    .apple-health-settings__instructions ol {
      margin: 0;
      padding-left: var(--space-5, 20px);
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
    }

    .apple-health-settings__instructions li {
      margin-bottom: var(--space-2, 8px);
    }

    .apple-health-settings__instructions li:last-child {
      margin-bottom: 0;
    }

    /* Connection status */
    .apple-health-settings__status {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--color-background-secondary, #f5f2ed);
      border-radius: var(--radius-lg);
      padding: var(--space-4, 16px);
      margin-bottom: var(--space-6, 24px);
    }

    .apple-health-settings__status-info {
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
    }

    .apple-health-settings__status-icon {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #ff2d5530, #ff6b8a30);
      border-radius: var(--radius-md);
      color: #ff2d55;
    }

    .apple-health-settings__status-icon svg {
      width: 18px;
      height: 18px;
    }

    .apple-health-settings__status-text {
      display: flex;
      flex-direction: column;
    }

    .apple-health-settings__device-name {
      font-size: var(--text-sm);
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text-primary);
    }

    .apple-health-settings__last-sync {
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
    }

    .apple-health-settings__refresh {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: var(--radius-md);
      color: var(--color-text-secondary);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .apple-health-settings__refresh:hover {
      background: var(--color-background-tertiary);
      color: var(--color-text-primary);
    }

    .apple-health-settings__refresh:focus-visible {
      outline: 2px solid var(--color-accent-primary);
      outline-offset: 2px;
    }

    .apple-health-settings__refresh svg {
      width: 16px;
      height: 16px;
    }

    .apple-health-settings__refresh--spinning svg {
      animation: apple-health-spin 1s linear infinite;
    }

    @keyframes apple-health-spin {
      to { transform: rotate(360deg); }
    }

    /* Data sections */
    .apple-health-settings__section {
      margin-bottom: var(--space-6, 24px);
    }

    .apple-health-settings__section:last-child {
      margin-bottom: 0;
    }

    .apple-health-settings__section-header {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      margin-bottom: var(--space-3, 12px);
    }

    .apple-health-settings__section-icon {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ff2d55;
    }

    .apple-health-settings__section-icon svg {
      width: 18px;
      height: 18px;
    }

    .apple-health-settings__section-title {
      font-family: var(--font-display);
      font-size: var(--text-base);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-primary);
      margin: 0;
    }

    .apple-health-settings__metrics {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-3, 12px);
    }

    .apple-health-settings__metric {
      background: var(--color-background-secondary, #f5f2ed);
      border-radius: var(--radius-md);
      padding: var(--space-3, 12px);
    }

    .apple-health-settings__metric-value {
      font-family: var(--font-display);
      font-size: var(--text-lg, 1.125rem);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-primary);
    }

    .apple-health-settings__metric-label {
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
    }

    /* Large metric */
    .apple-health-settings__metric--large {
      grid-column: span 2;
      display: flex;
      align-items: center;
      gap: var(--space-4, 16px);
    }

    .apple-health-settings__metric--large .apple-health-settings__metric-icon {
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #ff2d5520, #ff6b8a20);
      border-radius: var(--radius-lg);
      color: #ff2d55;
      flex-shrink: 0;
    }

    .apple-health-settings__metric--large .apple-health-settings__metric-icon svg {
      width: 24px;
      height: 24px;
    }

    .apple-health-settings__metric--large .apple-health-settings__metric-value {
      font-size: var(--text-2xl, 1.5rem);
    }

    /* Disconnect button */
    .apple-health-settings__disconnect {
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

    .apple-health-settings__disconnect:hover {
      background: var(--color-semantic-error-bg, rgba(220, 53, 69, 0.1));
      border-color: var(--color-semantic-error);
      color: var(--color-semantic-error);
    }

    .apple-health-settings__disconnect:focus-visible {
      outline: 2px solid var(--color-accent-primary);
      outline-offset: 2px;
    }

    .apple-health-settings__disconnect svg {
      width: 16px;
      height: 16px;
    }

    /* Loading state */
    .apple-health-settings__loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-12, 48px) var(--space-4, 16px);
    }

    .apple-health-settings__spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--color-border-subtle);
      border-top-color: #ff2d55;
      border-radius: var(--radius-full);
      animation: apple-health-spin 1s linear infinite;
      margin-bottom: var(--space-4, 16px);
    }

    /* No data state */
    .apple-health-settings__no-data {
      text-align: center;
      padding: var(--space-6, 24px);
      color: var(--color-text-secondary);
      font-size: var(--text-sm);
    }

    /* Dark theme */
    [data-theme="midnight"] .apple-health-settings__panel {
      background: var(--color-background-elevated, #504540);
    }

    [data-theme="midnight"] .apple-health-settings__title h2 {
      color: var(--color-text-primary, #faf6f0);
    }

    [data-theme="midnight"] .apple-health-settings__status,
    [data-theme="midnight"] .apple-health-settings__metric,
    [data-theme="midnight"] .apple-health-settings__instructions {
      background: var(--color-background-secondary, #60504a);
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .apple-health-settings,
      .apple-health-settings__panel {
        transition: none;
      }

      .apple-health-settings__spinner,
      .apple-health-settings__refresh--spinning svg {
        animation: none;
      }
    }
  `;
  document.head.appendChild(styleElement);
}

// ============================================================================
// RENDER FUNCTIONS
// ============================================================================

function renderNotConnected(): void {
  if (!container) return;

  const content = container.querySelector('.apple-health-settings__content');
  if (!content) return;

  while (content.firstChild) {
    content.removeChild(content.firstChild);
  }

  const notConnectedDiv = createElement('div', { className: 'apple-health-settings__not-connected' });

  // Icon
  const iconDiv = createElement('div', { className: 'apple-health-settings__not-connected-icon' });
  const heartIcon = createIcon('heart');
  if (heartIcon) iconDiv.appendChild(heartIcon);
  notConnectedDiv.appendChild(iconDiv);

  // Title
  const title = createElement('h3', { textContent: 'Connect Apple Health' });
  notConnectedDiv.appendChild(title);

  // Description
  const description = createElement('p', {
    textContent:
      'Sync your health data from iPhone to get personalized insights about sleep, activity, and heart rate.',
  });
  notConnectedDiv.appendChild(description);

  // Instructions
  const instructions = createElement('div', { className: 'apple-health-settings__instructions' });

  const instructionsTitle = createElement('h4', { textContent: 'How to connect:' });
  instructions.appendChild(instructionsTitle);

  const ol = createElement('ol');
  const steps = [
    'Download the Ferni iOS app',
    'Open Settings in the app',
    'Tap "Connect Apple Health"',
    'Allow access to your health data',
    'Data will sync automatically',
  ];

  steps.forEach((step) => {
    const li = createElement('li', { textContent: step });
    ol.appendChild(li);
  });

  instructions.appendChild(ol);
  notConnectedDiv.appendChild(instructions);

  content.appendChild(notConnectedDiv);
}

function renderConnectedState(status: AppleHealthStatus, summary: AppleHealthSummary | null): void {
  if (!container) return;

  const content = container.querySelector('.apple-health-settings__content');
  if (!content) return;

  while (content.firstChild) {
    content.removeChild(content.firstChild);
  }

  // Connection status bar
  const statusBar = createElement('div', { className: 'apple-health-settings__status' });

  const statusInfo = createElement('div', { className: 'apple-health-settings__status-info' });

  const statusIconDiv = createElement('div', { className: 'apple-health-settings__status-icon' });
  const phoneIcon = createIcon('smartphone');
  if (phoneIcon) statusIconDiv.appendChild(phoneIcon);
  statusInfo.appendChild(statusIconDiv);

  const statusText = createElement('div', { className: 'apple-health-settings__status-text' });
  statusText.appendChild(
    createElement('span', {
      className: 'apple-health-settings__device-name',
      textContent: status.deviceName ?? 'iPhone',
    })
  );
  statusText.appendChild(
    createElement('span', {
      className: 'apple-health-settings__last-sync',
      textContent: status.lastSync ? `Last sync: ${formatTime(status.lastSync)}` : 'Never synced',
    })
  );
  statusInfo.appendChild(statusText);
  statusBar.appendChild(statusInfo);

  const refreshBtn = createElement('button', {
    className: 'apple-health-settings__refresh',
    attributes: { 'aria-label': 'Refresh data' },
  });
  const refreshIcon = createIcon('refresh');
  if (refreshIcon) refreshBtn.appendChild(refreshIcon);
  refreshBtn.addEventListener('click', () => { void handleRefresh(); });
  statusBar.appendChild(refreshBtn);

  content.appendChild(statusBar);

  // Show data or "no data" message
  if (!summary) {
    const noData = createElement('div', { className: 'apple-health-settings__no-data' });
    noData.textContent = 'No health data synced yet. Open the iOS app to sync.';
    content.appendChild(noData);
  } else {
    // Steps (large)
    if (summary.steps !== undefined) {
      const stepsSection = createElement('div', { className: 'apple-health-settings__section' });
      const stepsMetric = createElement('div', {
        className: 'apple-health-settings__metric apple-health-settings__metric--large',
      });

      const stepsIconDiv = createElement('div', { className: 'apple-health-settings__metric-icon' });
      const footIcon = createIcon('footprints');
      if (footIcon) stepsIconDiv.appendChild(footIcon);
      stepsMetric.appendChild(stepsIconDiv);

      const stepsContent = createElement('div');
      stepsContent.appendChild(
        createElement('div', {
          className: 'apple-health-settings__metric-value',
          textContent: summary.steps.toLocaleString(),
        })
      );
      stepsContent.appendChild(
        createElement('div', {
          className: 'apple-health-settings__metric-label',
          textContent: 'Steps Today',
        })
      );
      stepsMetric.appendChild(stepsContent);
      stepsSection.appendChild(stepsMetric);
      content.appendChild(stepsSection);
    }

    // Sleep section
    if (summary.sleep) {
      const sleepSection = createElement('div', { className: 'apple-health-settings__section' });

      const sleepHeader = createElement('div', { className: 'apple-health-settings__section-header' });
      const sleepIconDiv = createElement('div', { className: 'apple-health-settings__section-icon' });
      const moonIcon = createIcon('moon');
      if (moonIcon) sleepIconDiv.appendChild(moonIcon);
      sleepHeader.appendChild(sleepIconDiv);
      sleepHeader.appendChild(createElement('h3', { className: 'apple-health-settings__section-title', textContent: 'Sleep' }));
      sleepSection.appendChild(sleepHeader);

      const sleepMetrics = createElement('div', { className: 'apple-health-settings__metrics' });

      // Time asleep
      const asleepMetric = createElement('div', { className: 'apple-health-settings__metric' });
      asleepMetric.appendChild(
        createElement('div', {
          className: 'apple-health-settings__metric-value',
          textContent: formatMinutes(summary.sleep.asleep),
        })
      );
      asleepMetric.appendChild(
        createElement('div', {
          className: 'apple-health-settings__metric-label',
          textContent: 'Time Asleep',
        })
      );
      sleepMetrics.appendChild(asleepMetric);

      // Deep sleep
      if (summary.sleep.deep) {
        const deepMetric = createElement('div', { className: 'apple-health-settings__metric' });
        deepMetric.appendChild(
          createElement('div', {
            className: 'apple-health-settings__metric-value',
            textContent: formatMinutes(summary.sleep.deep),
          })
        );
        deepMetric.appendChild(
          createElement('div', {
            className: 'apple-health-settings__metric-label',
            textContent: 'Deep Sleep',
          })
        );
        sleepMetrics.appendChild(deepMetric);
      }

      // REM sleep
      if (summary.sleep.rem) {
        const remMetric = createElement('div', { className: 'apple-health-settings__metric' });
        remMetric.appendChild(
          createElement('div', {
            className: 'apple-health-settings__metric-value',
            textContent: formatMinutes(summary.sleep.rem),
          })
        );
        remMetric.appendChild(
          createElement('div', {
            className: 'apple-health-settings__metric-label',
            textContent: 'REM',
          })
        );
        sleepMetrics.appendChild(remMetric);
      }

      // Time awake
      if (summary.sleep.awake) {
        const awakeMetric = createElement('div', { className: 'apple-health-settings__metric' });
        awakeMetric.appendChild(
          createElement('div', {
            className: 'apple-health-settings__metric-value',
            textContent: formatMinutes(summary.sleep.awake),
          })
        );
        awakeMetric.appendChild(
          createElement('div', {
            className: 'apple-health-settings__metric-label',
            textContent: 'Awake',
          })
        );
        sleepMetrics.appendChild(awakeMetric);
      }

      sleepSection.appendChild(sleepMetrics);
      content.appendChild(sleepSection);
    }

    // Activity section
    if (summary.activity) {
      const actSection = createElement('div', { className: 'apple-health-settings__section' });

      const actHeader = createElement('div', { className: 'apple-health-settings__section-header' });
      const actIconDiv = createElement('div', { className: 'apple-health-settings__section-icon' });
      const actIcon = createIcon('activity');
      if (actIcon) actIconDiv.appendChild(actIcon);
      actHeader.appendChild(actIconDiv);
      actHeader.appendChild(createElement('h3', { className: 'apple-health-settings__section-title', textContent: 'Activity' }));
      actSection.appendChild(actHeader);

      const actMetrics = createElement('div', { className: 'apple-health-settings__metrics' });

      // Active calories
      const calMetric = createElement('div', { className: 'apple-health-settings__metric' });
      calMetric.appendChild(
        createElement('div', {
          className: 'apple-health-settings__metric-value',
          textContent: `${Math.round(summary.activity.activeEnergy)} kcal`,
        })
      );
      calMetric.appendChild(
        createElement('div', {
          className: 'apple-health-settings__metric-label',
          textContent: 'Active Calories',
        })
      );
      actMetrics.appendChild(calMetric);

      // Distance
      if (summary.activity.distance) {
        const distMetric = createElement('div', { className: 'apple-health-settings__metric' });
        distMetric.appendChild(
          createElement('div', {
            className: 'apple-health-settings__metric-value',
            textContent: formatDistance(summary.activity.distance),
          })
        );
        distMetric.appendChild(
          createElement('div', {
            className: 'apple-health-settings__metric-label',
            textContent: 'Distance',
          })
        );
        actMetrics.appendChild(distMetric);
      }

      // Exercise minutes
      if (summary.activity.exerciseMinutes) {
        const exerciseMetric = createElement('div', { className: 'apple-health-settings__metric' });
        exerciseMetric.appendChild(
          createElement('div', {
            className: 'apple-health-settings__metric-value',
            textContent: `${summary.activity.exerciseMinutes}m`,
          })
        );
        exerciseMetric.appendChild(
          createElement('div', {
            className: 'apple-health-settings__metric-label',
            textContent: 'Exercise',
          })
        );
        actMetrics.appendChild(exerciseMetric);
      }

      // Stand hours
      if (summary.activity.standHours) {
        const standMetric = createElement('div', { className: 'apple-health-settings__metric' });
        standMetric.appendChild(
          createElement('div', {
            className: 'apple-health-settings__metric-value',
            textContent: `${summary.activity.standHours}h`,
          })
        );
        standMetric.appendChild(
          createElement('div', {
            className: 'apple-health-settings__metric-label',
            textContent: 'Stand Hours',
          })
        );
        actMetrics.appendChild(standMetric);
      }

      actSection.appendChild(actMetrics);
      content.appendChild(actSection);
    }

    // Heart section
    if (summary.heart) {
      const heartSection = createElement('div', { className: 'apple-health-settings__section' });

      const heartHeader = createElement('div', { className: 'apple-health-settings__section-header' });
      const heartIconDiv = createElement('div', { className: 'apple-health-settings__section-icon' });
      const heartIcon = createIcon('heart');
      if (heartIcon) heartIconDiv.appendChild(heartIcon);
      heartHeader.appendChild(heartIconDiv);
      heartHeader.appendChild(createElement('h3', { className: 'apple-health-settings__section-title', textContent: 'Heart' }));
      heartSection.appendChild(heartHeader);

      const heartMetrics = createElement('div', { className: 'apple-health-settings__metrics' });

      // Resting heart rate
      if (summary.heart.resting) {
        const restingMetric = createElement('div', { className: 'apple-health-settings__metric' });
        restingMetric.appendChild(
          createElement('div', {
            className: 'apple-health-settings__metric-value',
            textContent: `${summary.heart.resting} bpm`,
          })
        );
        restingMetric.appendChild(
          createElement('div', {
            className: 'apple-health-settings__metric-label',
            textContent: 'Resting HR',
          })
        );
        heartMetrics.appendChild(restingMetric);
      }

      // HRV
      if (summary.heart.hrv) {
        const hrvMetric = createElement('div', { className: 'apple-health-settings__metric' });
        hrvMetric.appendChild(
          createElement('div', {
            className: 'apple-health-settings__metric-value',
            textContent: `${summary.heart.hrv} ms`,
          })
        );
        hrvMetric.appendChild(
          createElement('div', {
            className: 'apple-health-settings__metric-label',
            textContent: 'HRV',
          })
        );
        heartMetrics.appendChild(hrvMetric);
      }

      heartSection.appendChild(heartMetrics);
      content.appendChild(heartSection);
    }

    // Mindfulness
    if (summary.mindfulMinutes) {
      const mindSection = createElement('div', { className: 'apple-health-settings__section' });

      const mindHeader = createElement('div', { className: 'apple-health-settings__section-header' });
      const mindIconDiv = createElement('div', { className: 'apple-health-settings__section-icon' });
      const brainIcon = createIcon('brain');
      if (brainIcon) mindIconDiv.appendChild(brainIcon);
      mindHeader.appendChild(mindIconDiv);
      mindHeader.appendChild(createElement('h3', { className: 'apple-health-settings__section-title', textContent: 'Mindfulness' }));
      mindSection.appendChild(mindHeader);

      const mindMetrics = createElement('div', { className: 'apple-health-settings__metrics' });
      const mindMetric = createElement('div', { className: 'apple-health-settings__metric' });
      mindMetric.appendChild(
        createElement('div', {
          className: 'apple-health-settings__metric-value',
          textContent: `${summary.mindfulMinutes}m`,
        })
      );
      mindMetric.appendChild(
        createElement('div', {
          className: 'apple-health-settings__metric-label',
          textContent: 'Mindful Minutes',
        })
      );
      mindMetrics.appendChild(mindMetric);
      mindSection.appendChild(mindMetrics);
      content.appendChild(mindSection);
    }
  }

  // Disconnect button
  const disconnectBtn = createElement('button', { className: 'apple-health-settings__disconnect' });
  const unlinkIcon = createIcon('unlink');
  if (unlinkIcon) disconnectBtn.appendChild(unlinkIcon);
  disconnectBtn.appendChild(createElement('span', { textContent: 'Disconnect Apple Health' }));
  disconnectBtn.addEventListener('click', handleDisconnect);
  content.appendChild(disconnectBtn);
}

function renderLoading(): void {
  if (!container) return;

  const content = container.querySelector('.apple-health-settings__content');
  if (!content) return;

  while (content.firstChild) {
    content.removeChild(content.firstChild);
  }

  const loadingDiv = createElement('div', { className: 'apple-health-settings__loading' });
  loadingDiv.appendChild(createElement('div', { className: 'apple-health-settings__spinner' }));
  loadingDiv.appendChild(createElement('p', { textContent: 'Loading...' }));
  content.appendChild(loadingDiv);
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

async function handleRefresh(): Promise<void> {
  const refreshBtn = container?.querySelector('.apple-health-settings__refresh');
  if (refreshBtn) {
    refreshBtn.classList.add('apple-health-settings__refresh--spinning');
  }

  await loadStatus();

  if (refreshBtn) {
    refreshBtn.classList.remove('apple-health-settings__refresh--spinning');
  }
}

async function handleDisconnect(): Promise<void> {
  if (!confirm('Disconnect Apple Health?')) return;

  _isLoading = true;
  renderLoading();

  try {
    await apiDelete('/api/apple-health/disconnect');
    toast.success('Apple Health disconnected');
    callbacks.onDisconnected?.();
    renderNotConnected();
  } catch {
    toast.error("Couldn't disconnect. Try again?");
    await loadStatus();
  } finally {
    _isLoading = false;
  }
}

async function loadStatus(): Promise<void> {
  _isLoading = true;
  renderLoading();

  try {
    const [statusResponse, summaryResponse] = await Promise.all([
      apiGet<AppleHealthStatus>('/api/apple-health/status'),
      apiGet<AppleHealthSummary>('/api/apple-health/summary'),
    ]);

    if (!statusResponse.ok) {
      throw new Error(statusResponse.error ?? 'Failed to load status');
    }

    const status = statusResponse.data;
    if (status?.connected) {
      renderConnectedState(status, summaryResponse.ok ? summaryResponse.data || null : null);
    } else {
      renderNotConnected();
    }
  } catch {
    renderNotConnected();
  } finally {
    _isLoading = false;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function showAppleHealthSettings(): Promise<void> {
  if (container) return;

  injectStyles();

  // Create container
  container = createElement('div', { className: 'apple-health-settings' });
  container.setAttribute('role', 'dialog');
  container.setAttribute('aria-label', 'Apple Health settings');

  // Backdrop
  const backdrop = createElement('div', { className: 'apple-health-settings__backdrop' });
  backdrop.addEventListener('click', hideAppleHealthSettings);
  container.appendChild(backdrop);

  // Panel
  const panel = createElement('div', { className: 'apple-health-settings__panel' });

  // Header
  const header = createElement('div', { className: 'apple-health-settings__header' });

  const titleDiv = createElement('div', { className: 'apple-health-settings__title' });
  const titleIconDiv = createElement('div', { className: 'apple-health-settings__title-icon' });
  const heartIcon = createIcon('heart');
  if (heartIcon) titleIconDiv.appendChild(heartIcon);
  titleDiv.appendChild(titleIconDiv);
  const titleText = createElement('h2', { textContent: 'Apple Health' });
  titleDiv.appendChild(titleText);
  header.appendChild(titleDiv);

  const closeBtn = createElement('button', {
    className: 'apple-health-settings__close',
    attributes: { 'aria-label': 'Close' },
  });
  const closeIcon = createIcon('close');
  if (closeIcon) closeBtn.appendChild(closeIcon);
  closeBtn.addEventListener('click', hideAppleHealthSettings);
  header.appendChild(closeBtn);

  panel.appendChild(header);

  // Content
  const content = createElement('div', { className: 'apple-health-settings__content' });
  panel.appendChild(content);

  container.appendChild(panel);
  document.body.appendChild(container);

  // Animate in
  requestAnimationFrame(() => {
    container?.classList.add('apple-health-settings--visible');
  });

  // Load status
  await loadStatus();

  // Escape to close
  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      hideAppleHealthSettings();
    }
  };
  document.addEventListener('keydown', handleKeyDown);
}

export function hideAppleHealthSettings(): void {
  if (!container) return;

  container.classList.remove('apple-health-settings--visible');
  callbacks.onClose?.();

  setTimeout(() => {
    container?.remove();
    container = null;
  }, DURATION.NORMAL);
}

export function setAppleHealthSettingsCallbacks(cbs: AppleHealthSettingsCallbacks): void {
  callbacks = cbs;
}

export default {
  show: showAppleHealthSettings,
  hide: hideAppleHealthSettings,
  setCallbacks: setAppleHealthSettingsCallbacks,
};
