/**
 * Ecobee Thermostat Settings UI
 *
 * Connect Ecobee thermostat using PIN-based OAuth.
 * User gets a 4-char PIN, enters it at ecobee.com,
 * then we poll to verify authorization.
 *
 * DESIGN PRINCIPLES:
 *   - Clear step-by-step connection flow
 *   - Real-time polling feedback
 *   - Full thermostat control when connected
 *   - Temperature unit preference (°F/°C)
 *   - Climate mode switching
 *   - Uses safe DOM methods (no innerHTML)
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { apiGet, apiPost, apiDelete } from '../utils/api.js';
import { toast } from './toast.ui.js';

// ============================================================================
// TYPES
// ============================================================================

interface ThermostatStatus {
  name: string;
  currentTemp: number;
  targetHeat: number;
  targetCool: number;
  humidity: number;
  mode: string;
  isRunning: boolean;
  currentEvent?: string;
}

interface SensorReading {
  name: string;
  temperature: number;
  humidity?: number;
  occupied?: boolean;
}

interface EcobeeStatus {
  connected: boolean;
  thermostat?: ThermostatStatus | null;
  sensors?: SensorReading[];
  error?: string;
}

interface PendingAuth {
  status: 'pending' | 'connected' | 'expired' | 'no_pending_auth';
  pin?: string;
  remainingSeconds?: number;
  pollIntervalSeconds?: number;
}

interface EcobeeSettingsCallbacks {
  onClose?: () => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

type TemperatureUnit = 'F' | 'C';
type ClimateMode = 'home' | 'away' | 'sleep';

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
// TEMPERATURE CONVERSION
// ============================================================================

function fahrenheitToCelsius(f: number): number {
  return Math.round(((f - 32) * 5) / 9);
}

function celsiusToFahrenheit(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}

function formatTemp(tempF: number, unit: TemperatureUnit): string {
  if (unit === 'C') {
    return `${fahrenheitToCelsius(tempF)}°C`;
  }
  return `${tempF}°F`;
}

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let callbacks: EcobeeSettingsCallbacks = {};
let pollingInterval: ReturnType<typeof setInterval> | null = null;
let isPolling = false;
let abortController: AbortController | null = null;
let currentStatus: EcobeeStatus | null = null;
let temperatureUnit: TemperatureUnit = (localStorage.getItem('ecobee_temp_unit') as TemperatureUnit) || 'F';

// ============================================================================
// SVG PATHS
// ============================================================================

const ICONS = {
  thermometer: 'M14 14.76V3.5a2.5 2.5 0 1 0-5 0v11.26a4.5 4.5 0 1 0 5 0z',
  close: 'M18 6L6 18M6 6l12 12',
  check: 'M20 6L9 17l-5-5',
  refresh: 'M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  unlink: 'M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-3 3a5 5 0 0 0 0 7.07M5.16 11.75l-1.72 1.71a5 5 0 0 0 7.07 7.07l3-3a5 5 0 0 0 0-7.07M8.5 2v3M2 8.5h3M21 15.5h3M15.5 22v-3',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  home: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  briefcase: 'M20 7h-4V5c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zM10 5h4v2h-4V5z',
};

// ============================================================================
// STYLES
// ============================================================================

function getStyles(): string {
  return `
    .ecobee-overlay {
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

    .ecobee-overlay.visible {
      opacity: 1;
    }

    .ecobee-panel {
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

    .ecobee-overlay.visible .ecobee-panel {
      transform: scale(1) translateY(0);
    }

    .ecobee-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-lg, 24px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.1));
    }

    .ecobee-title {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 8px);
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--color-text-primary, #fff);
    }

    .ecobee-title svg {
      width: 24px;
      height: 24px;
      color: var(--color-accent-primary, #4a9eff);
    }

    .ecobee-close {
      background: transparent;
      border: none;
      padding: var(--space-xs, 4px);
      cursor: pointer;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      border-radius: var(--radius-md, 8px);
      transition: all ${DURATION.FAST}ms ease;
    }

    .ecobee-close:hover,
    .ecobee-close:focus-visible {
      background: var(--color-bg-tertiary, rgba(255, 255, 255, 0.1));
      color: var(--color-text-primary, #fff);
    }

    .ecobee-close svg {
      width: 20px;
      height: 20px;
    }

    .ecobee-content {
      padding: var(--space-lg, 24px);
    }

    .ecobee-status-card {
      background: var(--color-bg-secondary, rgba(255, 255, 255, 0.05));
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-lg, 24px);
      margin-bottom: var(--space-md, 16px);
    }

    .ecobee-temp-display {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-md, 16px);
      margin-bottom: var(--space-md, 16px);
    }

    .ecobee-temp-control {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-xs, 4px);
    }

    .ecobee-temp-btn {
      width: 44px;
      height: 44px;
      border-radius: var(--radius-full, 50%);
      border: none;
      background: var(--color-bg-tertiary, rgba(255, 255, 255, 0.1));
      color: var(--color-text-primary, #fff);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all ${DURATION.FAST}ms ease;
    }

    .ecobee-temp-btn:hover,
    .ecobee-temp-btn:focus-visible {
      background: var(--color-accent-primary, #4a9eff);
      transform: scale(1.05);
    }

    .ecobee-temp-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    .ecobee-temp-btn svg {
      width: 20px;
      height: 20px;
    }

    .ecobee-temp-value {
      font-size: 3.5rem;
      font-weight: 300;
      color: var(--color-text-primary, #fff);
      min-width: 140px;
      text-align: center;
    }

    .ecobee-temp-unit-toggle {
      display: flex;
      align-items: center;
      gap: var(--space-xs, 4px);
      margin-top: var(--space-sm, 8px);
      justify-content: center;
    }

    .ecobee-unit-btn {
      padding: var(--space-xs, 4px) var(--space-sm, 8px);
      border: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.2));
      background: transparent;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      border-radius: var(--radius-md, 8px);
      cursor: pointer;
      font-size: 0.875rem;
      transition: all ${DURATION.FAST}ms ease;
    }

    .ecobee-unit-btn.active {
      background: var(--color-accent-primary, #4a9eff);
      border-color: var(--color-accent-primary, #4a9eff);
      color: white;
    }

    .ecobee-unit-btn:hover:not(.active),
    .ecobee-unit-btn:focus-visible:not(.active) {
      border-color: var(--color-text-muted);
      color: var(--color-text-primary, #fff);
    }

    .ecobee-header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-md, 16px);
    }

    .ecobee-name {
      font-weight: 500;
      color: var(--color-text-primary, #fff);
    }

    .ecobee-mode-badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs, 4px);
      padding: var(--space-xs, 4px) var(--space-sm, 8px);
      background: var(--color-accent-primary, #4a9eff);
      color: white;
      border-radius: var(--radius-full, 9999px);
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: uppercase;
    }

    .ecobee-climate-controls {
      display: flex;
      gap: var(--space-sm, 8px);
      margin-top: var(--space-md, 16px);
      padding-top: var(--space-md, 16px);
      border-top: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.1));
    }

    .ecobee-climate-btn {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-xs, 4px);
      padding: var(--space-sm, 12px);
      background: var(--color-bg-tertiary, rgba(255, 255, 255, 0.05));
      border: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.1));
      border-radius: var(--radius-md, 8px);
      color: var(--color-text-secondary, rgba(255, 255, 255, 0.7));
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ease;
    }

    .ecobee-climate-btn:hover,
    .ecobee-climate-btn:focus-visible {
      background: var(--color-bg-secondary, rgba(255, 255, 255, 0.1));
      border-color: var(--color-accent-primary, #4a9eff);
      color: var(--color-text-primary, #fff);
    }

    .ecobee-climate-btn.active {
      background: var(--color-accent-primary, #4a9eff);
      border-color: var(--color-accent-primary, #4a9eff);
      color: white;
    }

    .ecobee-climate-btn svg {
      width: 24px;
      height: 24px;
    }

    .ecobee-climate-btn span {
      font-size: 0.75rem;
      font-weight: 500;
    }

    .ecobee-temp-details {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-sm, 8px);
      color: var(--color-text-secondary, rgba(255, 255, 255, 0.7));
      font-size: 0.875rem;
      margin-top: var(--space-md, 16px);
    }

    .ecobee-sensors {
      margin-top: var(--space-md, 16px);
    }

    .ecobee-sensor-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--space-sm, 8px) 0;
      border-bottom: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.05));
    }

    .ecobee-sensor-item:last-child {
      border-bottom: none;
    }

    .ecobee-sensor-name {
      color: var(--color-text-secondary, rgba(255, 255, 255, 0.7));
    }

    .ecobee-sensor-temp {
      font-weight: 500;
      color: var(--color-text-primary, #fff);
    }

    .ecobee-connect-section {
      text-align: center;
      padding: var(--space-xl, 40px) var(--space-lg, 24px);
    }

    .ecobee-connect-icon {
      width: 64px;
      height: 64px;
      margin: 0 auto var(--space-md, 16px);
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
    }

    .ecobee-connect-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--color-text-primary, #fff);
      margin-bottom: var(--space-sm, 8px);
    }

    .ecobee-connect-desc {
      color: var(--color-text-secondary, rgba(255, 255, 255, 0.7));
      font-size: 0.875rem;
      margin-bottom: var(--space-lg, 24px);
    }

    .ecobee-pin-display {
      background: var(--color-bg-secondary, rgba(255, 255, 255, 0.05));
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-lg, 24px);
      margin-bottom: var(--space-md, 16px);
    }

    .ecobee-pin-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      margin-bottom: var(--space-sm, 8px);
    }

    .ecobee-pin-code {
      font-family: var(--font-mono, monospace);
      font-size: 2.5rem;
      font-weight: 600;
      letter-spacing: 0.2em;
      color: var(--color-accent-primary, #4a9eff);
    }

    .ecobee-pin-instructions {
      margin-top: var(--space-md, 16px);
      color: var(--color-text-secondary, rgba(255, 255, 255, 0.7));
      font-size: 0.875rem;
    }

    .ecobee-pin-link {
      color: var(--color-accent-primary, #4a9eff);
      text-decoration: none;
    }

    .ecobee-pin-link:hover {
      text-decoration: underline;
    }

    .ecobee-polling {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-sm, 8px);
      margin-top: var(--space-md, 16px);
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
      font-size: 0.875rem;
    }

    .ecobee-polling svg {
      width: 16px;
      height: 16px;
      animation: ecobee-spin 1.5s linear infinite;
    }

    @keyframes ecobee-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .ecobee-btn {
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

    .ecobee-btn-primary {
      background: var(--color-accent-primary, #4a9eff);
      color: white;
      border: none;
    }

    .ecobee-btn-primary:hover,
    .ecobee-btn-primary:focus-visible {
      background: var(--color-accent-hover, #3a8eef);
      transform: translateY(-1px);
    }

    .ecobee-btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    .ecobee-btn-secondary {
      background: var(--color-bg-tertiary, rgba(255, 255, 255, 0.1));
      color: var(--color-text-primary, #fff);
      border: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.2));
    }

    .ecobee-btn-secondary:hover,
    .ecobee-btn-secondary:focus-visible {
      background: var(--color-bg-secondary, rgba(255, 255, 255, 0.15));
    }

    .ecobee-btn-danger {
      background: transparent;
      color: var(--color-semantic-error, #ef4444);
      border: 1px solid currentColor;
    }

    .ecobee-btn-danger:hover,
    .ecobee-btn-danger:focus-visible {
      background: var(--color-semantic-error, #ef4444);
      color: white;
    }

    .ecobee-footer {
      padding: var(--space-md, 16px) var(--space-lg, 24px);
      border-top: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.1));
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--space-sm, 8px);
    }

    .ecobee-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-xl, 40px);
      color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
    }

    .ecobee-loading svg {
      width: 32px;
      height: 32px;
      margin-bottom: var(--space-sm, 8px);
      animation: ecobee-spin 1.5s linear infinite;
    }

    .ecobee-skeleton {
      background: linear-gradient(
        90deg,
        var(--color-bg-secondary) 25%,
        var(--color-bg-tertiary) 50%,
        var(--color-bg-secondary) 75%
      );
      background-size: 200% 100%;
      animation: ecobee-shimmer 1.5s infinite;
      border-radius: var(--radius-md, 8px);
    }

    @keyframes ecobee-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    @media (prefers-reduced-motion: reduce) {
      .ecobee-overlay,
      .ecobee-panel,
      .ecobee-btn,
      .ecobee-polling svg,
      .ecobee-loading svg,
      .ecobee-skeleton {
        animation: none;
        transition: opacity ${DURATION.FAST}ms linear;
      }
    }
  `;
}

// ============================================================================
// RENDER FUNCTIONS
// ============================================================================

function renderLoadingState(): HTMLElement {
  const content = createElement('div', { className: 'ecobee-content' });
  const loading = createElement('div', { className: 'ecobee-loading' });
  loading.appendChild(createSvgIcon(ICONS.refresh));
  loading.appendChild(createElement('span', {}, ['Loading thermostat...']));
  content.appendChild(loading);
  return content;
}

function renderConnectedState(status: EcobeeStatus): HTMLElement {
  const content = createElement('div', { className: 'ecobee-content' });

  // Thermostat status card
  if (status.thermostat) {
    const card = createElement('div', { className: 'ecobee-status-card' });

    // Header with name and mode badge
    const headerRow = createElement('div', { className: 'ecobee-header-row' });
    headerRow.appendChild(createElement('span', { className: 'ecobee-name' }, [status.thermostat.name]));
    headerRow.appendChild(createElement('span', { className: 'ecobee-mode-badge' }, [status.thermostat.mode]));
    card.appendChild(headerRow);

    // Temperature display with controls
    const tempDisplay = createElement('div', { className: 'ecobee-temp-display' });

    // Decrease button
    const decreaseBtn = createElement('button', {
      className: 'ecobee-temp-btn',
      'aria-label': 'Decrease temperature',
    });
    decreaseBtn.appendChild(createSvgIcon(ICONS.minus));
    decreaseBtn.addEventListener('click', () => adjustTemperature(-1));

    // Current temperature value
    const tempValue = createElement('div', { className: 'ecobee-temp-value' }, [
      formatTemp(status.thermostat.currentTemp, temperatureUnit),
    ]);

    // Increase button
    const increaseBtn = createElement('button', {
      className: 'ecobee-temp-btn',
      'aria-label': 'Increase temperature',
    });
    increaseBtn.appendChild(createSvgIcon(ICONS.plus));
    increaseBtn.addEventListener('click', () => adjustTemperature(1));

    tempDisplay.appendChild(decreaseBtn);
    tempDisplay.appendChild(tempValue);
    tempDisplay.appendChild(increaseBtn);
    card.appendChild(tempDisplay);

    // Temperature unit toggle
    const unitToggle = createElement('div', { className: 'ecobee-temp-unit-toggle' });
    const fBtn = createElement('button', {
      className: `ecobee-unit-btn ${temperatureUnit === 'F' ? 'active' : ''}`,
      'aria-label': 'Fahrenheit',
    }, ['°F']);
    fBtn.addEventListener('click', () => setTemperatureUnit('F'));

    const cBtn = createElement('button', {
      className: `ecobee-unit-btn ${temperatureUnit === 'C' ? 'active' : ''}`,
      'aria-label': 'Celsius',
    }, ['°C']);
    cBtn.addEventListener('click', () => setTemperatureUnit('C'));

    unitToggle.appendChild(fBtn);
    unitToggle.appendChild(cBtn);
    card.appendChild(unitToggle);

    // Details grid
    const details = createElement('div', { className: 'ecobee-temp-details' }, [
      createElement('div', {}, [`Humidity: ${status.thermostat.humidity}%`]),
      createElement('div', {}, [`Heat: ${formatTemp(status.thermostat.targetHeat, temperatureUnit)}`]),
      createElement('div', {}, [`Cool: ${formatTemp(status.thermostat.targetCool, temperatureUnit)}`]),
      status.thermostat.currentEvent
        ? createElement('div', {}, [status.thermostat.currentEvent])
        : createElement('div', {}, [status.thermostat.isRunning ? 'Running' : 'Idle']),
    ]);
    card.appendChild(details);

    // Climate mode controls
    const climateControls = createElement('div', { className: 'ecobee-climate-controls' });

    const homeBtn = createClimateButton('home', 'Home', ICONS.home, status.thermostat.currentEvent);
    const awayBtn = createClimateButton('away', 'Away', ICONS.briefcase, status.thermostat.currentEvent);
    const sleepBtn = createClimateButton('sleep', 'Sleep', ICONS.moon, status.thermostat.currentEvent);

    climateControls.appendChild(homeBtn);
    climateControls.appendChild(awayBtn);
    climateControls.appendChild(sleepBtn);
    card.appendChild(climateControls);

    content.appendChild(card);
  }

  // Sensors
  if (status.sensors && status.sensors.length > 0) {
    const sensorsSection = createElement('div', { className: 'ecobee-sensors' }, [
      createElement('h3', {
        style: 'font-size: 0.875rem; font-weight: 600; margin-bottom: 8px; color: var(--color-text-secondary);',
      }, ['Remote Sensors']),
    ]);

    for (const sensor of status.sensors) {
      const sensorItem = createElement('div', { className: 'ecobee-sensor-item' }, [
        createElement('span', { className: 'ecobee-sensor-name' }, [sensor.name]),
        createElement('span', { className: 'ecobee-sensor-temp' }, [formatTemp(sensor.temperature, temperatureUnit)]),
      ]);
      sensorsSection.appendChild(sensorItem);
    }

    content.appendChild(sensorsSection);
  }

  return content;
}

function createClimateButton(climate: ClimateMode, label: string, iconPath: string, currentEvent?: string): HTMLElement {
  const isActive = currentEvent?.toLowerCase().includes(climate);
  const btn = createElement('button', {
    className: `ecobee-climate-btn ${isActive ? 'active' : ''}`,
    'aria-label': `Set ${label} mode`,
  });
  btn.appendChild(createSvgIcon(iconPath));
  btn.appendChild(createElement('span', {}, [label]));
  btn.addEventListener('click', () => setClimate(climate));
  return btn;
}

function renderPinState(pin: string, remainingSeconds?: number): HTMLElement {
  const content = createElement('div', { className: 'ecobee-content' });

  const pinSection = createElement('div', { className: 'ecobee-pin-display' });

  pinSection.appendChild(createElement('div', { className: 'ecobee-pin-label' }, ['Enter this PIN at ecobee.com']));
  pinSection.appendChild(createElement('div', { className: 'ecobee-pin-code' }, [pin]));

  const instructions = createElement('div', { className: 'ecobee-pin-instructions' });
  instructions.appendChild(document.createTextNode('Go to '));

  const link = createElement('a', {
    className: 'ecobee-pin-link',
    href: 'https://www.ecobee.com/consumerportal/index.html',
    target: '_blank',
    rel: 'noopener noreferrer',
  }, ['ecobee.com/consumerportal']);
  instructions.appendChild(link);

  instructions.appendChild(document.createTextNode(', click "Add Application", then enter this PIN.'));
  pinSection.appendChild(instructions);

  content.appendChild(pinSection);

  // Polling indicator
  const polling = createElement('div', { className: 'ecobee-polling' });
  polling.appendChild(createSvgIcon(ICONS.refresh));
  const pollingText = remainingSeconds
    ? `Waiting for authorization... (${Math.ceil(remainingSeconds / 60)} min left)`
    : 'Waiting for authorization...';
  polling.appendChild(document.createTextNode(pollingText));
  content.appendChild(polling);

  return content;
}

function renderDisconnectedState(): HTMLElement {
  const content = createElement('div', { className: 'ecobee-connect-section' });

  const icon = createSvgIcon(ICONS.thermometer);
  icon.classList.add('ecobee-connect-icon');
  content.appendChild(icon);

  content.appendChild(createElement('div', { className: 'ecobee-connect-title' }, ['Connect Your Ecobee']));
  content.appendChild(createElement('div', { className: 'ecobee-connect-desc' }, [
    'Control your thermostat with your voice. Just say "set it to 72" or "I\'m leaving".',
  ]));

  const btn = createElement('button', { className: 'ecobee-btn ecobee-btn-primary' }, ['Connect Ecobee']);
  btn.addEventListener('click', startLinkFlow);
  content.appendChild(btn);

  return content;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function fetchStatus(): Promise<EcobeeStatus> {
  try {
    const response = await apiGet<EcobeeStatus>('/api/ecobee/status');
    return response;
  } catch (error) {
    if (import.meta.env?.DEV) {
      console.debug('Failed to fetch Ecobee status:', error);
    }
    return { connected: false };
  }
}

async function startLinkFlow(): Promise<void> {
  try {
    const response = await apiPost<{ pin: string; expiresInMinutes: number }>('/api/ecobee/link/start');

    if (response.pin) {
      toast.info('Enter the PIN at ecobee.com');
      startPolling(response.pin);
      render({ status: 'pending', pin: response.pin, remainingSeconds: response.expiresInMinutes * 60 });
    }
  } catch (error) {
    if (import.meta.env?.DEV) {
      console.debug('Failed to start Ecobee link:', error);
    }
    toast.error("Couldn't connect to Ecobee. Try again?");
  }
}

async function checkAuthStatus(): Promise<PendingAuth> {
  try {
    return await apiGet<PendingAuth>('/api/ecobee/link/status');
  } catch {
    return { status: 'no_pending_auth' };
  }
}

async function disconnect(): Promise<void> {
  try {
    await apiDelete('/api/ecobee/disconnect');
    toast.success('Ecobee disconnected');
    stopPolling();
    callbacks.onDisconnected?.();
    render({ status: 'no_pending_auth' });
  } catch (error) {
    if (import.meta.env?.DEV) {
      console.debug('Failed to disconnect Ecobee:', error);
    }
    toast.error("Couldn't disconnect. Try again?");
  }
}

async function adjustTemperature(delta: number): Promise<void> {
  if (!currentStatus?.thermostat) return;

  const newHeat = currentStatus.thermostat.targetHeat + delta;
  const newCool = currentStatus.thermostat.targetCool + delta;

  try {
    await apiPost('/api/ecobee/temperature', {
      heat: newHeat,
      cool: newCool,
      holdType: 'nextTransition',
    });

    // Optimistic update
    if (currentStatus.thermostat) {
      currentStatus.thermostat.targetHeat = newHeat;
      currentStatus.thermostat.targetCool = newCool;
    }

    toast.success('Temperature updated');
    render({ status: 'connected', ...currentStatus });
  } catch (error) {
    if (import.meta.env?.DEV) {
      console.debug('Failed to set temperature:', error);
    }
    toast.error("Couldn't set temperature. Try again?");
  }
}

async function setClimate(climate: ClimateMode): Promise<void> {
  try {
    await apiPost('/api/ecobee/climate', {
      climate,
      holdType: 'nextTransition',
    });

    toast.success(`${climate.charAt(0).toUpperCase() + climate.slice(1)} mode set`);

    // Refresh status
    const status = await fetchStatus();
    currentStatus = status;
    if (status.connected) {
      render({ status: 'connected', ...status });
    }
  } catch (error) {
    if (import.meta.env?.DEV) {
      console.debug('Failed to set climate:', error);
    }
    toast.error("Couldn't change mode. Try again?");
  }
}

async function resumeScheduleFromUI(): Promise<void> {
  try {
    await apiPost('/api/ecobee/resume', {});
    toast.success('Schedule resumed');

    // Refresh status
    const status = await fetchStatus();
    currentStatus = status;
    if (status.connected) {
      render({ status: 'connected', ...status });
    }
  } catch (error) {
    if (import.meta.env?.DEV) {
      console.debug('Failed to resume schedule:', error);
    }
    toast.error("Couldn't resume schedule. Try again?");
  }
}

function setTemperatureUnit(unit: TemperatureUnit): void {
  temperatureUnit = unit;
  localStorage.setItem('ecobee_temp_unit', unit);

  // Re-render with new unit
  if (currentStatus?.connected) {
    render({ status: 'connected', ...currentStatus });
  }
}

// ============================================================================
// POLLING
// ============================================================================

function startPolling(pin: string): void {
  if (isPolling) return;
  isPolling = true;

  // Create abort controller for cleanup
  abortController = new AbortController();

  pollingInterval = setInterval(async () => {
    if (abortController?.signal.aborted) {
      stopPolling();
      return;
    }

    const result = await checkAuthStatus();

    if (result.status === 'connected') {
      stopPolling();
      toast.success('Ecobee connected!');
      callbacks.onConnected?.();

      // Refresh to show connected state
      const status = await fetchStatus();
      currentStatus = status;
      if (status.connected) {
        render({ status: 'connected', ...status });
      }
    } else if (result.status === 'expired') {
      stopPolling();
      toast.warning('PIN expired. Try again?');
      render({ status: 'no_pending_auth' });
    } else if (result.status === 'pending') {
      // Update remaining time display
      render({ status: 'pending', pin, remainingSeconds: result.remainingSeconds });
    }
  }, 5000); // Poll every 5 seconds
}

function stopPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  isPolling = false;
}

// ============================================================================
// RENDER
// ============================================================================

function render(state: PendingAuth | (EcobeeStatus & { status: string })): void {
  if (!container) return;

  const panel = container.querySelector('.ecobee-panel');
  if (!panel) return;

  // Remove old content
  const oldContent = panel.querySelector('.ecobee-content, .ecobee-connect-section');
  if (oldContent) {
    oldContent.remove();
  }

  // Render new content
  let content: HTMLElement;

  if (state.status === 'connected' && 'thermostat' in state) {
    content = renderConnectedState(state as EcobeeStatus);
  } else if (state.status === 'pending' && 'pin' in state) {
    content = renderPinState(state.pin!, state.remainingSeconds);
  } else {
    content = renderDisconnectedState();
  }

  // Insert before footer
  const footer = panel.querySelector('.ecobee-footer');
  if (footer) {
    panel.insertBefore(content, footer);
  } else {
    panel.appendChild(content);
  }

  // Update footer buttons
  updateFooter(state.status === 'connected');
}

function updateFooter(isConnected: boolean): void {
  if (!container) return;

  const footer = container.querySelector('.ecobee-footer');
  if (!footer) return;

  // Clear footer
  footer.replaceChildren();

  if (isConnected) {
    // Resume schedule button
    const resumeBtn = createElement('button', {
      className: 'ecobee-btn ecobee-btn-secondary',
    }, ['Resume Schedule']);
    resumeBtn.addEventListener('click', resumeScheduleFromUI);
    footer.appendChild(resumeBtn);

    // Disconnect button
    const disconnectBtn = createElement('button', {
      className: 'ecobee-btn ecobee-btn-danger',
    }, ['Disconnect']);
    disconnectBtn.addEventListener('click', disconnect);
    footer.appendChild(disconnectBtn);
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function showEcobeeSettings(): Promise<void> {
  if (container) return;

  // Create container
  container = createElement('div', { className: 'ecobee-overlay' });

  // Add styles
  const style = document.createElement('style');
  style.textContent = getStyles();
  container.appendChild(style);

  // Create panel
  const panel = createElement('div', { className: 'ecobee-panel' });

  // Header
  const header = createElement('div', { className: 'ecobee-header' });

  const title = createElement('div', { className: 'ecobee-title' });
  title.appendChild(createSvgIcon(ICONS.thermometer));
  title.appendChild(document.createTextNode('Ecobee Thermostat'));
  header.appendChild(title);

  const closeBtn = createElement('button', { className: 'ecobee-close', 'aria-label': 'Close' });
  closeBtn.appendChild(createSvgIcon(ICONS.close));
  closeBtn.addEventListener('click', hideEcobeeSettings);
  header.appendChild(closeBtn);

  panel.appendChild(header);

  // Loading state
  panel.appendChild(renderLoadingState());

  // Footer (will be populated by render)
  const footer = createElement('div', { className: 'ecobee-footer' });
  panel.appendChild(footer);

  container.appendChild(panel);

  // Close on backdrop click
  container.addEventListener('click', (e) => {
    if (e.target === container) {
      hideEcobeeSettings();
    }
  });

  // Close on Escape
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      hideEcobeeSettings();
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
  currentStatus = status;

  if (status.connected) {
    render({ status: 'connected', ...status });
  } else {
    // Check for pending auth
    const pending = await checkAuthStatus();
    if (pending.status === 'pending' && pending.pin) {
      startPolling(pending.pin);
      render(pending);
    } else {
      render({ status: 'no_pending_auth' });
    }
  }
}

export function hideEcobeeSettings(): void {
  if (!container) return;

  stopPolling();
  container.classList.remove('visible');

  setTimeout(() => {
    container?.remove();
    container = null;
    currentStatus = null;
    callbacks.onClose?.();
  }, DURATION.NORMAL);
}

export function setEcobeeSettingsCallbacks(cbs: EcobeeSettingsCallbacks): void {
  callbacks = cbs;
}

export default {
  show: showEcobeeSettings,
  hide: hideEcobeeSettings,
  setCallbacks: setEcobeeSettingsCallbacks,
};
