/**
 * Smart Home Settings UI
 *
 * A warm, inviting settings panel for connecting your smart home devices.
 * Ferni can help set the perfect atmosphere for any moment.
 *
 * SUPPORTED INTEGRATIONS:
 * - Ecobee (thermostat) - Direct API
 * - Philips Hue (lights) - Direct bridge communication
 * - LIFX (lights) - Cloud API
 *
 * DESIGN PRINCIPLES:
 * - Warm, human copy (Ferni voice)
 * - Self-service setup with clear guidance
 * - Progress indicators for multi-step flows
 * - Celebrates successful connections
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { t } from '../i18n/index.js';
import { appState } from '../state/index.js';
import { apiDelete, apiGet, apiPost } from '../utils/api.js';
import { toast } from './whisper.ui.js';

// ============================================================================
// TYPES
// ============================================================================

interface IntegrationStatus {
  ecobee: {
    connected: boolean;
    thermostatName?: string;
    currentTemp?: number;
    targetTemp?: number;
    mode?: string;
    needsAuth?: boolean;
  };
  hue: {
    connected: boolean;
    bridgeIp?: string;
    lightCount?: number;
    lights?: Array<{ name: string; on: boolean }>;
  };
  lifx: {
    connected: boolean;
    lightCount?: number;
    lights?: Array<{ name: string; power: string }>;
  };
  sonos: {
    connected: boolean;
    speakerCount?: number;
    households?: number;
    primaryGroup?: string;
  };
  homeKit: {
    connected: boolean;
    homeName?: string;
    deviceCount?: number;
    sceneCount?: number;
  };
}

interface SmartHomeCallbacks {
  onConnected?: (integration: string) => void;
  onDisconnected?: (integration: string) => void;
  onClose?: () => void;
}

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;
let callbacks: SmartHomeCallbacks = {};
let isLoading = false;
let currentSetupFlow: 'ecobee' | 'hue' | 'lifx' | 'sonos' | 'homekit' | null = null;
let setupStep = 0;

// Hue pairing state
let hueBridgeIp = '';
let hueUsername = '';

// Sonos state (OAuth flow) - check URL params for pending/completion status
// sonosAuthPending is set when user starts OAuth, but when they return,
// the URL params tell us the result. We clean this up on page load.
let sonosAuthPending = false;

// Check if we're returning from Sonos OAuth
function checkSonosOAuthReturn(): 'success' | 'error' | null {
  const params = new URLSearchParams(window.location.search);
  const smartHomeStatus = params.get('smart_home');
  const integration = params.get('integration');

  if (integration === 'sonos') {
    // Clean up URL params after reading
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.delete('smart_home');
    newUrl.searchParams.delete('integration');
    newUrl.searchParams.delete('reason');
    window.history.replaceState({}, '', newUrl);

    sonosAuthPending = false;
    return smartHomeStatus === 'success' ? 'success' : 'error';
  }
  return null;
}

// ============================================================================
// SAFE ICON CREATION
// ============================================================================

const SVG_ICONS = {
  close:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  home: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  thermometer:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>',
  lightbulb:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>',
  sun: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
  check:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  link: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  unlink:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18.84 12.25 1.72-1.71a5 5 0 0 0-.12-7.07 5 5 0 0 0-6.95 0l-1.72 1.71"/><path d="m5.17 11.75-1.71 1.71a5 5 0 0 0 .12 7.07 5 5 0 0 0 6.95 0l1.71-1.71"/></svg>',
  chevronRight:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
  chevronLeft:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
  wifi: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>',
  sparkles:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>',
  speaker:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><circle cx="12" cy="14" r="4"/><line x1="12" y1="6" x2="12.01" y2="6"/></svg>',
  apple:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z"/><path d="M10 2c1 .5 2 2 2 5"/></svg>',
} as const;

type IconName = keyof typeof SVG_ICONS;

function createIcon(name: IconName): SVGSVGElement | null {
  const svgString = SVG_ICONS[name];
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (svg && !doc.querySelector('parsererror')) {
    // Import the node from the XML document into the current HTML document
    // This ensures the SVG renders correctly
    return document.importNode(svg, true);
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

function getUserId(): string {
  return appState.get('deviceId') || 'anonymous';
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;

  styleElement = document.createElement('style');
  styleElement.textContent = `
    .smart-home-settings {
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

    .smart-home-settings--visible {
      opacity: 1;
      visibility: visible;
    }

    .smart-home-settings__backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.75);
      backdrop-filter: var(--glass-blur-subtle, blur(8px));
    }

    .smart-home-settings__panel {
      position: relative;
      width: 90%;
      max-width: 480px;
      max-height: 85vh;
      background: var(--color-bg-elevated, #FFFDFB);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      border-radius: var(--radius-xl, 20px);
      box-shadow: var(--shadow-xl, 0 8px 32px rgba(0, 0, 0, 0.12));
      display: flex;
      flex-direction: column;
      transform: scale(0.95);
      transition: transform ${DURATION.MODERATE}ms ${EASING.EXPO_OUT};
      overflow: hidden;
    }

    .smart-home-settings--visible .smart-home-settings__panel {
      transform: scale(1);
    }

    .smart-home-settings__header {
      padding: 20px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    }

    .smart-home-settings__title {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .smart-home-settings__title-icon {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      border-radius: var(--radius-lg, 12px);
      color: var(--color-ferni, #4a6741);
    }

    .smart-home-settings__title-icon svg {
      width: 18px;
      height: 18px;
    }

    .smart-home-settings__title h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
    }

    .smart-home-settings__close {
      width: 36px;
      height: 36px;
      border: none;
      background: transparent;
      border-radius: var(--radius-full, 50%);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-muted, #8A8178);
      transition: background ${DURATION.FAST}ms ${EASING.STANDARD}, color ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .smart-home-settings__close:hover {
      background: var(--color-bg-hover, rgba(44, 37, 32, 0.05));
      color: var(--color-text-primary, #2C2520);
    }

    .smart-home-settings__close svg {
      width: 20px;
      height: 20px;
    }

    .smart-home-settings__content {
      padding: 24px;
      overflow-y: auto;
      flex: 1;
    }

    /* Welcome message */
    .smart-home-settings__welcome {
      text-align: center;
      margin-bottom: 24px;
    }

    .smart-home-settings__welcome-text {
      color: var(--color-text-secondary, #5C5650);
      font-size: 0.95rem;
      line-height: 1.5;
      margin: 0;
    }

    /* Integration cards */
    .smart-home-settings__integrations {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .smart-home-settings__card {
      background: var(--color-bg-card, #FFFFFF);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      border-radius: var(--radius-lg, 12px);
      padding: 16px;
      cursor: pointer;
      transition: transform ${DURATION.FAST}ms ${EASING.STANDARD}, box-shadow ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .smart-home-settings__card:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.08));
    }

    .smart-home-settings__card--connected {
      border-color: var(--color-ferni, #4a6741);
      background: var(--persona-tint, rgba(74, 103, 65, 0.05));
    }

    .smart-home-settings__card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .smart-home-settings__card-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .smart-home-settings__card-icon {
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-bg-hover, rgba(44, 37, 32, 0.05));
      border-radius: var(--radius-md, 8px);
      color: var(--color-text-secondary, #5C5650);
    }

    .smart-home-settings__card--connected .smart-home-settings__card-icon {
      background: var(--color-ferni, #4a6741);
      color: white;
    }

    .smart-home-settings__card-icon svg {
      width: 22px;
      height: 22px;
    }

    .smart-home-settings__card-text h3 {
      margin: 0 0 4px;
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
    }

    .smart-home-settings__card-text p {
      margin: 0;
      font-size: 0.85rem;
      color: var(--color-text-muted, #8A8178);
    }

    .smart-home-settings__card-status {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.8rem;
      font-weight: 500;
    }

    .smart-home-settings__card-status--connected {
      color: var(--color-ferni, #4a6741);
    }

    .smart-home-settings__card-status--disconnected {
      color: var(--color-text-muted, #8A8178);
    }

    .smart-home-settings__card-status svg {
      width: 14px;
      height: 14px;
    }

    .smart-home-settings__card-details {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
    }

    .smart-home-settings__detail {
      font-size: 0.85rem;
    }

    .smart-home-settings__detail-label {
      color: var(--color-text-muted, #8A8178);
    }

    .smart-home-settings__detail-value {
      color: var(--color-text-primary, #2C2520);
      font-weight: 500;
    }

    /* Setup flow */
    .smart-home-settings__setup {
      padding: 24px;
    }

    .smart-home-settings__setup-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
    }

    .smart-home-settings__back-btn {
      width: 36px;
      height: 36px;
      border: none;
      background: var(--color-bg-hover, rgba(44, 37, 32, 0.05));
      border-radius: var(--radius-full, 50%);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-secondary, #5C5650);
      transition: background ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .smart-home-settings__back-btn:hover {
      background: var(--color-bg-hover-strong, rgba(44, 37, 32, 0.1));
    }

    .smart-home-settings__back-btn svg {
      width: 18px;
      height: 18px;
    }

    .smart-home-settings__setup-title {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin: 0;
    }

    .smart-home-settings__step-indicator {
      display: flex;
      gap: 8px;
      margin-bottom: 24px;
    }

    .smart-home-settings__step-dot {
      width: 8px;
      height: 8px;
      border-radius: var(--radius-full, 50%);
      background: var(--color-border-subtle, rgba(44, 37, 32, 0.2));
      transition: background ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .smart-home-settings__step-dot--active {
      background: var(--color-ferni, #4a6741);
    }

    .smart-home-settings__step-dot--complete {
      background: var(--color-ferni, #4a6741);
    }

    .smart-home-settings__step-content {
      text-align: center;
    }

    .smart-home-settings__step-icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      border-radius: var(--radius-xl, 20px);
      color: var(--color-ferni, #4a6741);
    }

    .smart-home-settings__step-icon svg {
      width: 32px;
      height: 32px;
    }

    .smart-home-settings__step-title {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin: 0 0 8px;
    }

    .smart-home-settings__step-description {
      font-size: 0.95rem;
      color: var(--color-text-secondary, #5C5650);
      line-height: 1.5;
      margin: 0 0 20px;
    }

    .smart-home-settings__input-group {
      margin-bottom: 16px;
      text-align: left;
    }

    .smart-home-settings__input-label {
      display: block;
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--color-text-secondary, #5C5650);
      margin-bottom: 6px;
    }

    .smart-home-settings__input {
      width: 100%;
      padding: 12px 16px;
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.15));
      border-radius: var(--radius-md, 8px);
      font-size: 1rem;
      background: var(--color-bg-card, #FFFFFF);
      color: var(--color-text-primary, #2C2520);
      transition: border-color ${DURATION.FAST}ms ${EASING.STANDARD};
      box-sizing: border-box;
    }

    .smart-home-settings__input:focus {
      outline: none;
      border-color: var(--color-ferni, #4a6741);
    }

    .smart-home-settings__input::placeholder {
      color: var(--color-text-muted, #8A8178);
    }

    .smart-home-settings__hint {
      font-size: 0.8rem;
      color: var(--color-text-muted, #8A8178);
      margin-top: 8px;
      line-height: 1.4;
    }

    .smart-home-settings__btn {
      width: 100%;
      padding: 14px 24px;
      border: none;
      border-radius: var(--radius-lg, 12px);
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: transform ${DURATION.FAST}ms ${EASING.STANDARD}, background ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .smart-home-settings__btn:hover {
      transform: scale(1.02);
    }

    .smart-home-settings__btn:active {
      transform: scale(0.98);
    }

    .smart-home-settings__btn--primary {
      background: var(--color-ferni, #4a6741);
      color: white;
    }

    .smart-home-settings__btn--secondary {
      background: var(--color-bg-hover, rgba(44, 37, 32, 0.08));
      color: var(--color-text-primary, #2C2520);
    }

    .smart-home-settings__btn--danger {
      background: var(--color-semantic-error-bg, rgba(220, 53, 69, 0.1));
      color: var(--color-semantic-error, #dc3545);
    }

    .smart-home-settings__btn svg {
      width: 18px;
      height: 18px;
    }

    .smart-home-settings__btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    /* Loading state */
    .smart-home-settings__loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
    }

    .smart-home-settings__spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--color-border-subtle, rgba(44, 37, 32, 0.15));
      border-top-color: var(--color-ferni, #4a6741);
      border-radius: 50%;
      animation: smart-home-spin 0.8s linear infinite;
    }

    @keyframes smart-home-spin {
      to { transform: rotate(360deg); }
    }

    .smart-home-settings__loading p {
      margin-top: 16px;
      color: var(--color-text-muted, #8A8178);
      font-size: 0.95rem;
    }

    /* Success celebration */
    .smart-home-settings__success {
      text-align: center;
      padding: 24px;
    }

    .smart-home-settings__success-icon {
      width: 80px;
      height: 80px;
      margin: 0 auto 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-ferni, #4a6741);
      border-radius: var(--radius-full, 50%);
      color: white;
      animation: smart-home-pop 0.4s ${EASING.SPRING};
    }

    @keyframes smart-home-pop {
      0% { transform: scale(0); }
      70% { transform: scale(1.1); }
      100% { transform: scale(1); }
    }

    .smart-home-settings__success-icon svg {
      width: 40px;
      height: 40px;
    }

    .smart-home-settings__success-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin: 0 0 8px;
    }

    .smart-home-settings__success-message {
      font-size: 0.95rem;
      color: var(--color-text-secondary, #5C5650);
      line-height: 1.5;
      margin: 0 0 24px;
    }

    /* External link */
    .smart-home-settings__external-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--color-ferni, #4a6741);
      font-size: 0.9rem;
      text-decoration: none;
      margin-top: 12px;
    }

    .smart-home-settings__external-link:hover {
      text-decoration: underline;
    }
  `;
  document.head.appendChild(styleElement);
}

// ============================================================================
// API CALLS
// ============================================================================

async function fetchStatus(): Promise<IntegrationStatus> {
  const userId = getUserId();

  // Short timeout options for fast UX - show disconnected rather than spinning forever
  const fastTimeout = { timeout: 8000 }; // 8 seconds max per call

  // Fetch status for all integrations in parallel with aggressive timeout
  // Note: Ecobee uses /api/ecobee/status (separate route)
  const [ecobeeRes, hueRes, lifxRes, sonosRes, homekitRes] = await Promise.all([
    apiGet<IntegrationStatus['ecobee']>(`/api/ecobee/status`, { userId }, fastTimeout).catch(
      () => ({ ok: false, data: null })
    ),
    apiGet<IntegrationStatus['hue']>(`/api/smart-home/hue/status`, { userId }, fastTimeout).catch(
      () => ({ ok: false, data: null })
    ),
    apiGet<IntegrationStatus['lifx']>(`/api/smart-home/lifx/status`, { userId }, fastTimeout).catch(
      () => ({ ok: false, data: null })
    ),
    apiGet<IntegrationStatus['sonos']>(
      `/api/smart-home/sonos/status`,
      { userId },
      fastTimeout
    ).catch(() => ({ ok: false, data: null })),
    apiGet<IntegrationStatus['homeKit']>(
      `/api/smart-home/homekit/status`,
      { userId },
      fastTimeout
    ).catch(() => ({ ok: false, data: null })),
  ]);

  return {
    ecobee: ecobeeRes.ok && ecobeeRes.data ? ecobeeRes.data : { connected: false },
    hue: hueRes.ok && hueRes.data ? hueRes.data : { connected: false },
    lifx: lifxRes.ok && lifxRes.data ? lifxRes.data : { connected: false },
    sonos: sonosRes.ok && sonosRes.data ? sonosRes.data : { connected: false },
    homeKit: homekitRes.ok && homekitRes.data ? homekitRes.data : { connected: false },
  };
}

// ============================================================================
// RENDER FUNCTIONS
// ============================================================================

function renderLoadingState(): void {
  const content = container?.querySelector('.smart-home-settings__content');
  if (!content) return;

  while (content.firstChild) content.removeChild(content.firstChild);

  const loading = createElement('div', { className: 'smart-home-settings__loading' });
  loading.appendChild(createElement('div', { className: 'smart-home-settings__spinner' }));
  loading.appendChild(createElement('p', { textContent: 'Checking your devices...' }));
  content.appendChild(loading);
}

function renderMainView(status: IntegrationStatus): void {
  const content = container?.querySelector('.smart-home-settings__content');
  if (!content) return;

  while (content.firstChild) content.removeChild(content.firstChild);

  // Welcome message
  const welcome = createElement('div', { className: 'smart-home-settings__welcome' });
  const welcomeText = createElement('p', {
    className: 'smart-home-settings__welcome-text',
    textContent:
      "Connect your home and I can help set the perfect atmosphere—dimming lights for movie night, warming things up when you're chilly, or creating calm when you need to focus.",
  });
  welcome.appendChild(welcomeText);
  content.appendChild(welcome);

  // Integration cards
  const integrations = createElement('div', { className: 'smart-home-settings__integrations' });

  // Ecobee card
  integrations.appendChild(
    createIntegrationCard({
      id: 'ecobee',
      name: 'Ecobee',
      description: 'Thermostat & sensors',
      icon: 'thermometer',
      connected: status.ecobee.connected,
      details: status.ecobee.connected
        ? [
            { label: 'Name', value: status.ecobee.thermostatName || 'My Thermostat' },
            { label: 'Current', value: `${status.ecobee.currentTemp || '--'}°F` },
            { label: 'Mode', value: status.ecobee.mode || 'auto' },
          ]
        : undefined,
    })
  );

  // Philips Hue card
  integrations.appendChild(
    createIntegrationCard({
      id: 'hue',
      name: 'Philips Hue',
      description: 'Smart lights (local)',
      icon: 'lightbulb',
      connected: status.hue.connected,
      details: status.hue.connected
        ? [
            { label: 'Bridge', value: status.hue.bridgeIp || 'Connected' },
            { label: 'Lights', value: `${status.hue.lightCount || 0}` },
          ]
        : undefined,
    })
  );

  // LIFX card
  integrations.appendChild(
    createIntegrationCard({
      id: 'lifx',
      name: 'LIFX',
      description: 'Smart lights (cloud)',
      icon: 'sun',
      connected: status.lifx.connected,
      details: status.lifx.connected
        ? [{ label: 'Lights', value: `${status.lifx.lightCount || 0}` }]
        : undefined,
    })
  );

  // Sonos card
  integrations.appendChild(
    createIntegrationCard({
      id: 'sonos',
      name: 'Sonos',
      description: 'Speakers & music',
      icon: 'speaker',
      connected: status.sonos.connected,
      details: status.sonos.connected
        ? [
            { label: 'Speakers', value: `${status.sonos.speakerCount || 0}` },
            { label: 'Now Playing', value: status.sonos.primaryGroup || 'Idle' },
          ]
        : undefined,
    })
  );

  // HomeKit card
  integrations.appendChild(
    createIntegrationCard({
      id: 'homekit',
      name: 'HomeKit',
      description: 'Apple home & Siri',
      icon: 'apple',
      connected: status.homeKit.connected,
      details: status.homeKit.connected
        ? [
            { label: 'Home', value: status.homeKit.homeName || 'My Home' },
            { label: 'Devices', value: `${status.homeKit.deviceCount || 0}` },
            { label: 'Scenes', value: `${status.homeKit.sceneCount || 0}` },
          ]
        : undefined,
    })
  );

  content.appendChild(integrations);
}

function createIntegrationCard(options: {
  id: string;
  name: string;
  description: string;
  icon: IconName;
  connected: boolean;
  details?: Array<{ label: string; value: string }>;
}): HTMLElement {
  const card = createElement('div', {
    className: `smart-home-settings__card${options.connected ? ' smart-home-settings__card--connected' : ''}`,
  });

  const header = createElement('div', { className: 'smart-home-settings__card-header' });

  const info = createElement('div', { className: 'smart-home-settings__card-info' });

  const iconDiv = createElement('div', { className: 'smart-home-settings__card-icon' });
  const icon = createIcon(options.icon);
  if (icon) iconDiv.appendChild(icon);
  info.appendChild(iconDiv);

  const text = createElement('div', { className: 'smart-home-settings__card-text' });
  text.appendChild(createElement('h3', { textContent: options.name }));
  text.appendChild(createElement('p', { textContent: options.description }));
  info.appendChild(text);

  header.appendChild(info);

  const status = createElement('div', {
    className: `smart-home-settings__card-status smart-home-settings__card-status--${options.connected ? 'connected' : 'disconnected'}`,
  });
  const statusIcon = createIcon(options.connected ? 'check' : 'chevronRight');
  if (statusIcon) status.appendChild(statusIcon);
  status.appendChild(
    createElement('span', { textContent: options.connected ? 'Connected' : 'Set up' })
  );
  header.appendChild(status);

  card.appendChild(header);

  // Details for connected integrations
  if (options.details && options.details.length > 0) {
    const details = createElement('div', { className: 'smart-home-settings__card-details' });
    for (const detail of options.details) {
      const detailEl = createElement('div', { className: 'smart-home-settings__detail' });
      detailEl.appendChild(
        createElement('span', {
          className: 'smart-home-settings__detail-label',
          textContent: `${detail.label}: `,
        })
      );
      detailEl.appendChild(
        createElement('span', {
          className: 'smart-home-settings__detail-value',
          textContent: detail.value,
        })
      );
      details.appendChild(detailEl);
    }
    card.appendChild(details);
  }

  card.addEventListener('click', () => {
    if (options.connected) {
      showDisconnectConfirm(options.id, options.name);
    } else {
      startSetupFlow(options.id as 'ecobee' | 'hue' | 'lifx' | 'sonos' | 'homekit');
    }
  });

  return card;
}

// ============================================================================
// SETUP FLOWS
// ============================================================================

function startSetupFlow(integration: 'ecobee' | 'hue' | 'lifx' | 'sonos' | 'homekit'): void {
  currentSetupFlow = integration;
  setupStep = 0;
  renderSetupStep();
}

function renderSetupStep(): void {
  const content = container?.querySelector('.smart-home-settings__content');
  if (!content || !currentSetupFlow) return;

  while (content.firstChild) content.removeChild(content.firstChild);

  const setup = createElement('div', { className: 'smart-home-settings__setup' });

  // Header with back button
  const header = createElement('div', { className: 'smart-home-settings__setup-header' });

  const backBtn = createElement('button', { className: 'smart-home-settings__back-btn' });
  const backIcon = createIcon('chevronLeft');
  if (backIcon) backBtn.appendChild(backIcon);
  backBtn.addEventListener('click', () => {
    if (setupStep > 0) {
      setupStep--;
      renderSetupStep();
    } else {
      currentSetupFlow = null;
      loadAndRenderStatus();
    }
  });
  header.appendChild(backBtn);

  const titles: Record<string, string> = {
    ecobee: 'Connect Ecobee',
    hue: 'Connect Philips Hue',
    lifx: 'Connect LIFX',
    sonos: 'Connect Sonos',
    homekit: 'Connect HomeKit',
  };
  const title = titles[currentSetupFlow] || 'Set up';
  header.appendChild(
    createElement('h3', { className: 'smart-home-settings__setup-title', textContent: title })
  );
  setup.appendChild(header);

  // Render specific setup step
  if (currentSetupFlow === 'ecobee') {
    renderEcobeeSetup(setup);
  } else if (currentSetupFlow === 'hue') {
    renderHueSetup(setup);
  } else if (currentSetupFlow === 'lifx') {
    renderLifxSetup(setup);
  } else if (currentSetupFlow === 'sonos') {
    renderSonosSetup(setup);
  } else if (currentSetupFlow === 'homekit') {
    renderHomeKitSetup(setup);
  }

  content.appendChild(setup);
}

function renderEcobeeSetup(container: HTMLElement): void {
  const totalSteps = 2;

  // Step indicator
  const indicator = createElement('div', { className: 'smart-home-settings__step-indicator' });
  for (let i = 0; i < totalSteps; i++) {
    const dot = createElement('div', {
      className: `smart-home-settings__step-dot${i === setupStep ? ' smart-home-settings__step-dot--active' : i < setupStep ? ' smart-home-settings__step-dot--complete' : ''}`,
    });
    indicator.appendChild(dot);
  }
  container.appendChild(indicator);

  const content = createElement('div', { className: 'smart-home-settings__step-content' });

  if (setupStep === 0) {
    // Step 1: Get API Key
    const iconDiv = createElement('div', { className: 'smart-home-settings__step-icon' });
    const icon = createIcon('thermometer');
    if (icon) iconDiv.appendChild(icon);
    content.appendChild(iconDiv);

    content.appendChild(
      createElement('h4', {
        className: 'smart-home-settings__step-title',
        textContent: 'Get your Ecobee API Key',
      })
    );

    content.appendChild(
      createElement('p', {
        className: 'smart-home-settings__step-description',
        textContent:
          "First, we need a key from Ecobee's developer portal. Don't worry, it's quick!",
      })
    );

    const btn = createElement('button', {
      className: 'smart-home-settings__btn smart-home-settings__btn--primary',
      textContent: 'Open Ecobee Developer Portal',
    });
    btn.addEventListener('click', () => {
      window.open('https://www.ecobee.com/developers/', '_blank');
    });
    content.appendChild(btn);

    const hint = createElement('p', {
      className: 'smart-home-settings__hint',
      textContent:
        '1. Sign in with your Ecobee account\n2. Click "Create New" to register an app\n3. Copy your API Key',
    });
    hint.style.whiteSpace = 'pre-line';
    content.appendChild(hint);

    // Next button
    const nextBtn = createElement('button', {
      className: 'smart-home-settings__btn smart-home-settings__btn--secondary',
      textContent: 'I have my API key',
    });
    nextBtn.style.marginTop = '16px';
    nextBtn.addEventListener('click', () => {
      setupStep = 1;
      renderSetupStep();
    });
    content.appendChild(nextBtn);
  } else if (setupStep === 1) {
    // Step 2: Enter API Key & Authorize
    const iconDiv = createElement('div', { className: 'smart-home-settings__step-icon' });
    const icon = createIcon('link');
    if (icon) iconDiv.appendChild(icon);
    content.appendChild(iconDiv);

    content.appendChild(
      createElement('h4', {
        className: 'smart-home-settings__step-title',
        textContent: 'Connect your thermostat',
      })
    );

    content.appendChild(
      createElement('p', {
        className: 'smart-home-settings__step-description',
        textContent: "Paste your API key below and we'll guide you through the authorization.",
      })
    );

    const inputGroup = createElement('div', { className: 'smart-home-settings__input-group' });
    inputGroup.appendChild(
      createElement('label', {
        className: 'smart-home-settings__input-label',
        textContent: 'Ecobee API Key',
      })
    );
    const input = createElement('input', {
      className: 'smart-home-settings__input',
      attributes: { type: 'text', placeholder: 'Paste your API key here...' },
    });
    inputGroup.appendChild(input);
    content.appendChild(inputGroup);

    const btn = createElement('button', {
      className: 'smart-home-settings__btn smart-home-settings__btn--primary',
    });
    btn.textContent = t('ui.smarthomesettings.connectEcobee');
    btn.addEventListener('click', async () => {
      const apiKey = input.value.trim();
      if (!apiKey) {
        toast.warning(t('toasts.enterApiKeyFirst'));
        return;
      }
      await connectEcobee(apiKey);
    });
    content.appendChild(btn);
  }

  container.appendChild(content);
}

function renderHueSetup(container: HTMLElement): void {
  const totalSteps = 3;

  // Step indicator
  const indicator = createElement('div', { className: 'smart-home-settings__step-indicator' });
  for (let i = 0; i < totalSteps; i++) {
    const dot = createElement('div', {
      className: `smart-home-settings__step-dot${i === setupStep ? ' smart-home-settings__step-dot--active' : i < setupStep ? ' smart-home-settings__step-dot--complete' : ''}`,
    });
    indicator.appendChild(dot);
  }
  container.appendChild(indicator);

  const content = createElement('div', { className: 'smart-home-settings__step-content' });

  if (setupStep === 0) {
    // Step 1: Find bridge
    const iconDiv = createElement('div', { className: 'smart-home-settings__step-icon' });
    const icon = createIcon('wifi');
    if (icon) iconDiv.appendChild(icon);
    content.appendChild(iconDiv);

    content.appendChild(
      createElement('h4', {
        className: 'smart-home-settings__step-title',
        textContent: 'Find your Hue Bridge',
      })
    );

    content.appendChild(
      createElement('p', {
        className: 'smart-home-settings__step-description',
        textContent:
          "Let's find your Hue Bridge on your network. Make sure you're connected to the same WiFi as your bridge.",
      })
    );

    const inputGroup = createElement('div', { className: 'smart-home-settings__input-group' });
    inputGroup.appendChild(
      createElement('label', {
        className: 'smart-home-settings__input-label',
        textContent: 'Bridge IP Address',
      })
    );
    const input = createElement('input', {
      className: 'smart-home-settings__input',
      attributes: { type: 'text', placeholder: 'e.g., 192.168.1.100' },
    });
    if (hueBridgeIp) input.value = hueBridgeIp;
    inputGroup.appendChild(input);

    const hint = createElement('p', {
      className: 'smart-home-settings__hint',
      textContent:
        'You can find this in the Hue app under Settings → Hue Bridges, or check your router.',
    });
    inputGroup.appendChild(hint);
    content.appendChild(inputGroup);

    const btn = createElement('button', {
      className: 'smart-home-settings__btn smart-home-settings__btn--primary',
    });
    btn.textContent = t('ui.smarthomesettings.findBridge');
    btn.addEventListener('click', async () => {
      const ip = input.value.trim();
      if (!ip) {
        toast.warning(t('toasts.enterBridgeIp'));
        return;
      }
      hueBridgeIp = ip;

      // Test connection
      try {
        const response = await fetch(`http://${ip}/api/config`, {
          signal: AbortSignal.timeout(5000),
        });
        if (response.ok) {
          toast.success(t('toasts.bridgeFound'));
          setupStep = 1;
          renderSetupStep();
        } else {
          toast.error("Couldn't reach that IP. Check the address.");
        }
      } catch {
        toast.error("Couldn't connect. Make sure you're on the same network.");
      }
    });
    content.appendChild(btn);
  } else if (setupStep === 1) {
    // Step 2: Press link button
    const iconDiv = createElement('div', { className: 'smart-home-settings__step-icon' });
    const icon = createIcon('link');
    if (icon) iconDiv.appendChild(icon);
    content.appendChild(iconDiv);

    content.appendChild(
      createElement('h4', {
        className: 'smart-home-settings__step-title',
        textContent: 'Press the link button',
      })
    );

    content.appendChild(
      createElement('p', {
        className: 'smart-home-settings__step-description',
        textContent:
          'Walk over to your Hue Bridge and press the big button on top. This lets Ferni talk to your lights.',
      })
    );

    const btn = createElement('button', {
      className: 'smart-home-settings__btn smart-home-settings__btn--primary',
    });
    btn.textContent = t('ui.smarthomesettings.iPressedIt');
    btn.addEventListener('click', async () => {
      await pairHueBridge();
    });
    content.appendChild(btn);

    const hint = createElement('p', {
      className: 'smart-home-settings__hint',
      textContent:
        'The button is usually in the center of the bridge. Press it and tap the button above within 30 seconds.',
    });
    content.appendChild(hint);
  } else if (setupStep === 2) {
    // Step 3: Success
    renderSuccessState(container, 'Philips Hue', 'hue');
    return;
  }

  container.appendChild(content);
}

function renderLifxSetup(container: HTMLElement): void {
  const totalSteps = 2;

  // Step indicator
  const indicator = createElement('div', { className: 'smart-home-settings__step-indicator' });
  for (let i = 0; i < totalSteps; i++) {
    const dot = createElement('div', {
      className: `smart-home-settings__step-dot${i === setupStep ? ' smart-home-settings__step-dot--active' : i < setupStep ? ' smart-home-settings__step-dot--complete' : ''}`,
    });
    indicator.appendChild(dot);
  }
  container.appendChild(indicator);

  const content = createElement('div', { className: 'smart-home-settings__step-content' });

  if (setupStep === 0) {
    // Step 1: Get token
    const iconDiv = createElement('div', { className: 'smart-home-settings__step-icon' });
    const icon = createIcon('sun');
    if (icon) iconDiv.appendChild(icon);
    content.appendChild(iconDiv);

    content.appendChild(
      createElement('h4', {
        className: 'smart-home-settings__step-title',
        textContent: 'Get your LIFX token',
      })
    );

    content.appendChild(
      createElement('p', {
        className: 'smart-home-settings__step-description',
        textContent: "LIFX uses a simple cloud token. Let's grab one from their website.",
      })
    );

    const btn = createElement('button', {
      className: 'smart-home-settings__btn smart-home-settings__btn--primary',
      textContent: 'Open LIFX Settings',
    });
    btn.addEventListener('click', () => {
      window.open('https://cloud.lifx.com/settings', '_blank');
    });
    content.appendChild(btn);

    const hint = createElement('p', {
      className: 'smart-home-settings__hint',
      textContent:
        '1. Sign in with your LIFX account\n2. Find "Personal Access Tokens"\n3. Generate a new token and copy it',
    });
    hint.style.whiteSpace = 'pre-line';
    content.appendChild(hint);

    // Next button
    const nextBtn = createElement('button', {
      className: 'smart-home-settings__btn smart-home-settings__btn--secondary',
      textContent: 'I have my token',
    });
    nextBtn.style.marginTop = '16px';
    nextBtn.addEventListener('click', () => {
      setupStep = 1;
      renderSetupStep();
    });
    content.appendChild(nextBtn);
  } else if (setupStep === 1) {
    // Step 2: Enter token
    const iconDiv = createElement('div', { className: 'smart-home-settings__step-icon' });
    const icon = createIcon('link');
    if (icon) iconDiv.appendChild(icon);
    content.appendChild(iconDiv);

    content.appendChild(
      createElement('h4', {
        className: 'smart-home-settings__step-title',
        textContent: 'Connect your lights',
      })
    );

    content.appendChild(
      createElement('p', {
        className: 'smart-home-settings__step-description',
        textContent: "Paste your token below and we'll connect to your LIFX lights.",
      })
    );

    const inputGroup = createElement('div', { className: 'smart-home-settings__input-group' });
    inputGroup.appendChild(
      createElement('label', {
        className: 'smart-home-settings__input-label',
        textContent: 'LIFX Token',
      })
    );
    const input = createElement('input', {
      className: 'smart-home-settings__input',
      attributes: { type: 'text', placeholder: 'Paste your token here...' },
    });
    inputGroup.appendChild(input);
    content.appendChild(inputGroup);

    const btn = createElement('button', {
      className: 'smart-home-settings__btn smart-home-settings__btn--primary',
    });
    btn.textContent = t('ui.smarthomesettings.connectLifx');
    btn.addEventListener('click', async () => {
      const token = input.value.trim();
      if (!token) {
        toast.warning(t('toasts.enterTokenFirst'));
        return;
      }
      await connectLifx(token);
    });
    content.appendChild(btn);
  }

  container.appendChild(content);
}

function renderSonosSetup(container: HTMLElement): void {
  const content = createElement('div', { className: 'smart-home-settings__step-content' });

  // Sonos uses OAuth - single step
  const iconDiv = createElement('div', { className: 'smart-home-settings__step-icon' });
  const icon = createIcon('speaker');
  if (icon) iconDiv.appendChild(icon);
  content.appendChild(iconDiv);

  content.appendChild(
    createElement('h4', {
      className: 'smart-home-settings__step-title',
      textContent: 'Sign in with Sonos',
    })
  );

  content.appendChild(
    createElement('p', {
      className: 'smart-home-settings__step-description',
      textContent:
        'Connect your Sonos account to let me play music that matches your mood. I can set the vibe with just the right playlist.',
    })
  );

  const btn = createElement('button', {
    className: 'smart-home-settings__btn smart-home-settings__btn--primary',
    textContent: 'Connect with Sonos',
  });
  btn.addEventListener('click', async () => {
    await startSonosOAuth();
  });
  content.appendChild(btn);

  const hint = createElement('p', {
    className: 'smart-home-settings__hint',
    textContent: "You'll be redirected to Sonos to sign in, then brought back here automatically.",
  });
  content.appendChild(hint);

  container.appendChild(content);
}

function renderHomeKitSetup(container: HTMLElement): void {
  const content = createElement('div', { className: 'smart-home-settings__step-content' });

  const iconDiv = createElement('div', { className: 'smart-home-settings__step-icon' });
  const icon = createIcon('apple');
  if (icon) iconDiv.appendChild(icon);
  content.appendChild(iconDiv);

  content.appendChild(
    createElement('h4', {
      className: 'smart-home-settings__step-title',
      textContent: 'Connect via iOS app',
    })
  );

  content.appendChild(
    createElement('p', {
      className: 'smart-home-settings__step-description',
      textContent:
        'HomeKit connects through the Ferni iOS app. Open the app on your iPhone to link your Apple Home.',
    })
  );

  // Check if they have the iOS app
  const checkBtn = createElement('button', {
    className: 'smart-home-settings__btn smart-home-settings__btn--primary',
    textContent: 'Open Ferni iOS App',
  });
  checkBtn.addEventListener('click', () => {
    // Try to open the iOS app via deep link
    window.location.href = 'ferni://settings/homekit';

    // Fallback to app store after a delay
    setTimeout(() => {
      toast.info("Don't have the app? Get it from the App Store!");
    }, 2000);
  });
  content.appendChild(checkBtn);

  const hint = createElement('p', {
    className: 'smart-home-settings__hint',
    textContent:
      'Once connected, say "Hey Siri, tell Ferni to set the vibe to relax" and your whole home responds.',
  });
  content.appendChild(hint);

  // Already connected button
  const alreadyBtn = createElement('button', {
    className: 'smart-home-settings__btn smart-home-settings__btn--secondary',
    textContent: "I've already connected",
  });
  alreadyBtn.style.marginTop = '12px';
  alreadyBtn.addEventListener('click', async () => {
    // Check if HomeKit is actually connected
    const userId = getUserId();
    const status = await apiGet<IntegrationStatus['homeKit']>(
      `/api/smart-home/homekit/status?userId=${userId}`
    );

    if (status.ok && status.data?.connected) {
      toast.success(t('toasts.homeKitConnected'));
      currentSetupFlow = null;
      loadAndRenderStatus();
    } else {
      toast.warning(t('toasts.homeKitNotConnected'));
    }
  });
  content.appendChild(alreadyBtn);

  container.appendChild(content);
}

function renderSuccessState(
  parentContainer: HTMLElement,
  name: string,
  _integration: string
): void {
  const success = createElement('div', { className: 'smart-home-settings__success' });

  const iconDiv = createElement('div', { className: 'smart-home-settings__success-icon' });
  const icon = createIcon('check');
  if (icon) iconDiv.appendChild(icon);
  success.appendChild(iconDiv);

  success.appendChild(
    createElement('h4', {
      className: 'smart-home-settings__success-title',
      textContent: `${name} connected!`,
    })
  );

  success.appendChild(
    createElement('p', {
      className: 'smart-home-settings__success-message',
      textContent:
        'You\'re all set! Just ask me to set the mood—"dim the lights" or "make it cozy"—and I\'ll take care of it.',
    })
  );

  const btn = createElement('button', {
    className: 'smart-home-settings__btn smart-home-settings__btn--primary',
  });
  const sparklesIcon = createIcon('sparkles');
  if (sparklesIcon) btn.appendChild(sparklesIcon);
  btn.appendChild(createElement('span', { textContent: 'Done' }));
  btn.addEventListener('click', () => {
    currentSetupFlow = null;
    loadAndRenderStatus();
  });
  success.appendChild(btn);

  parentContainer.appendChild(success);
}

// ============================================================================
// CONNECTION HANDLERS
// ============================================================================

async function connectEcobee(_apiKey: string): Promise<void> {
  isLoading = true;
  renderLoadingState();

  try {
    const userId = getUserId();

    // Start the Ecobee link flow (gets PIN)
    const response = await apiPost<{ pin: string; expiresIn: number }>('/api/ecobee/link/start', {
      userId,
    });

    if (!response.ok || !response.data?.pin) {
      throw new Error(response.error || 'Failed to get PIN');
    }

    // Show PIN to user
    toast.info(t('toasts.yourPinResponsedatapin'));

    // Open Ecobee authorization page
    window.open('https://www.ecobee.com/consumerportal/index.html#/my-apps/add/new', '_blank');

    // Poll for completion
    const checkInterval = setInterval(async () => {
      const statusRes = await apiGet<{ authorized: boolean }>('/api/ecobee/link/status', {
        userId,
      });

      if (statusRes.ok && statusRes.data?.authorized) {
        clearInterval(checkInterval);
        toast.success(t('toasts.ecobeeConnected'));
        callbacks.onConnected?.('ecobee');
        currentSetupFlow = null;
        loadAndRenderStatus();
      }
    }, 3000);

    // Stop polling after 5 minutes
    setTimeout(() => {
      clearInterval(checkInterval);
    }, 300000);

    isLoading = false;
    renderEcobeeWaitingState();
  } catch (error) {
    toast.error("Couldn't connect to Ecobee. Try again?");
    setupStep = 1;
    renderSetupStep();
    isLoading = false;
  }
}

function renderEcobeeWaitingState(): void {
  const content = container?.querySelector('.smart-home-settings__content');
  if (!content) return;

  while (content.firstChild) content.removeChild(content.firstChild);

  const waiting = createElement('div', { className: 'smart-home-settings__step-content' });

  const iconDiv = createElement('div', { className: 'smart-home-settings__step-icon' });
  const icon = createIcon('thermometer');
  if (icon) iconDiv.appendChild(icon);
  waiting.appendChild(iconDiv);

  waiting.appendChild(
    createElement('h4', {
      className: 'smart-home-settings__step-title',
      textContent: 'Waiting for authorization...',
    })
  );

  waiting.appendChild(
    createElement('p', {
      className: 'smart-home-settings__step-description',
      textContent: "Enter the PIN on ecobee.com, then come back here. I'll know when you're done!",
    })
  );

  const hint = createElement('p', {
    className: 'smart-home-settings__hint',
    textContent: "Tip: Look for 'My Apps' → 'Add Application' on ecobee.com",
  });
  waiting.appendChild(hint);

  const cancelBtn = createElement('button', {
    className: 'smart-home-settings__btn smart-home-settings__btn--secondary',
  });
  cancelBtn.textContent = t('ui.smarthomesettings.cancel');
  cancelBtn.addEventListener('click', () => {
    currentSetupFlow = null;
    loadAndRenderStatus();
  });
  waiting.appendChild(cancelBtn);

  content.appendChild(waiting);
}

async function pairHueBridge(): Promise<void> {
  isLoading = true;
  renderLoadingState();

  try {
    const response = await fetch(`http://${hueBridgeIp}/api`, {
      method: 'POST',
      body: JSON.stringify({ devicetype: 'ferni#smart-home' }),
    });

    if (!response.ok) {
      throw new Error('Failed to communicate with bridge');
    }

    const result = (await response.json()) as Array<{
      success?: { username: string };
      error?: { description: string };
    }>;

    if (result[0]?.success?.username) {
      hueUsername = result[0].success.username;

      // Save to backend
      const userId = getUserId();
      await apiPost('/api/smart-home/hue/save', {
        userId,
        bridgeIp: hueBridgeIp,
        username: hueUsername,
      });

      toast.success(t('toasts.hueConnected'));
      callbacks.onConnected?.('hue');
      setupStep = 2;
      renderSetupStep();
    } else if (result[0]?.error) {
      if (result[0].error.description.includes('link button')) {
        toast.warning(t('toasts.pressLinkButton'));
      } else {
        toast.error(result[0].error.description);
      }
      setupStep = 1;
      renderSetupStep();
    }
  } catch {
    toast.error("Couldn't connect to bridge. Try again.");
    setupStep = 1;
    renderSetupStep();
  } finally {
    isLoading = false;
  }
}

async function connectLifx(token: string): Promise<void> {
  isLoading = true;
  renderLoadingState();

  try {
    // Test the token first
    const testResponse = await fetch('https://api.lifx.com/v1/lights/all', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!testResponse.ok) {
      throw new Error('Invalid token');
    }

    const lights = (await testResponse.json()) as Array<{ label: string }>;

    // Save to backend
    const userId = getUserId();
    await apiPost('/api/smart-home/lifx/save', {
      userId,
      token,
    });

    toast.success(`Found ${lights.length} light${lights.length === 1 ? '' : 's'}!`);
    callbacks.onConnected?.('lifx');
    currentSetupFlow = null;
    loadAndRenderStatus();
  } catch {
    toast.error(t('toasts.invalidTokenCheckAndTryAgain'));
    setupStep = 1;
    renderSetupStep();
  } finally {
    isLoading = false;
  }
}

async function startSonosOAuth(): Promise<void> {
  const userId = getUserId();

  try {
    // Get OAuth URL from backend
    const response = await apiPost<{ authUrl: string }>('/api/smart-home/sonos/auth-url', {
      userId,
    });

    if (response.ok && response.data?.authUrl) {
      sonosAuthPending = true;
      // Redirect to Sonos OAuth
      window.location.href = response.data.authUrl;
    } else {
      toast.error("Couldn't start Sonos connection. Try again?");
    }
  } catch {
    toast.error("Couldn't connect to Sonos. Try again?");
  }
}

async function disconnectIntegration(integration: string): Promise<void> {
  isLoading = true;
  renderLoadingState();

  try {
    const userId = getUserId();

    // Ecobee uses a different route
    if (integration === 'ecobee') {
      await apiDelete(`/api/ecobee/disconnect?userId=${userId}`);
    } else {
      await apiDelete(`/api/smart-home/${integration}/disconnect?userId=${userId}`);
    }

    toast.success(t('toasts.disconnected'));
    callbacks.onDisconnected?.(integration);
    loadAndRenderStatus();
  } catch {
    toast.error("Couldn't disconnect. Try again?");
    loadAndRenderStatus();
  } finally {
    isLoading = false;
  }
}

function showDisconnectConfirm(integration: string, name: string): void {
  if (confirm(`Disconnect ${name}?`)) {
    void disconnectIntegration(integration);
  }
}

// ============================================================================
// LIFECYCLE
// ============================================================================

async function loadAndRenderStatus(): Promise<void> {
  isLoading = true;
  renderLoadingState();

  // Failsafe timeout - never spin for more than 15 seconds total
  const timeout = new Promise<IntegrationStatus>((resolve) => {
    setTimeout(() => {
      resolve({
        ecobee: { connected: false },
        hue: { connected: false },
        lifx: { connected: false },
        sonos: { connected: false },
        homeKit: { connected: false },
      });
    }, 15000);
  });

  try {
    const status = await Promise.race([fetchStatus(), timeout]);
    renderMainView(status);
  } catch {
    renderMainView({
      ecobee: { connected: false },
      hue: { connected: false },
      lifx: { connected: false },
      sonos: { connected: false },
      homeKit: { connected: false },
    });
  } finally {
    isLoading = false;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function showSmartHomeSettings(cbs?: SmartHomeCallbacks): Promise<void> {
  if (container) return;

  callbacks = cbs || {};
  injectStyles();

  // Create container
  container = createElement('div', { className: 'smart-home-settings' });
  container.setAttribute('role', 'dialog');
  container.setAttribute('aria-label', 'Smart Home Settings');

  // Backdrop
  const backdrop = createElement('div', { className: 'smart-home-settings__backdrop' });
  backdrop.addEventListener('click', hideSmartHomeSettings);
  container.appendChild(backdrop);

  // Panel
  const panel = createElement('div', { className: 'smart-home-settings__panel' });

  // Header
  const header = createElement('div', { className: 'smart-home-settings__header' });

  const titleDiv = createElement('div', { className: 'smart-home-settings__title' });
  const titleIconDiv = createElement('div', { className: 'smart-home-settings__title-icon' });
  const homeIcon = createIcon('home');
  if (homeIcon) titleIconDiv.appendChild(homeIcon);
  titleDiv.appendChild(titleIconDiv);
  titleDiv.appendChild(createElement('h2', { textContent: 'Your Home' }));
  header.appendChild(titleDiv);

  const closeBtn = createElement('button', {
    className: 'smart-home-settings__close',
    attributes: { 'aria-label': 'Close' },
  });
  const closeIcon = createIcon('close');
  if (closeIcon) closeBtn.appendChild(closeIcon);
  closeBtn.addEventListener('click', hideSmartHomeSettings);
  header.appendChild(closeBtn);

  panel.appendChild(header);

  // Content
  const content = createElement('div', { className: 'smart-home-settings__content' });
  panel.appendChild(content);

  container.appendChild(panel);
  document.body.appendChild(container);

  // Animate in
  requestAnimationFrame(() => {
    container?.classList.add('smart-home-settings--visible');
  });

  // Load status
  await loadAndRenderStatus();

  // Check for OAuth callbacks
  const urlParams = new URLSearchParams(window.location.search);
  const smartHomeResult = urlParams.get('smart_home');
  if (smartHomeResult === 'success') {
    const integration = urlParams.get('integration');
    toast.success(t('toasts.integrationConnected'));
    callbacks.onConnected?.(integration || '');
    // Clean URL
    const url = new URL(window.location.href);
    url.searchParams.delete('smart_home');
    url.searchParams.delete('integration');
    window.history.replaceState({}, '', url.toString());
  }
}

export function hideSmartHomeSettings(): void {
  if (!container) return;

  container.classList.remove('smart-home-settings--visible');

  setTimeout(() => {
    container?.remove();
    container = null;
    currentSetupFlow = null;
    setupStep = 0;
    callbacks.onClose?.();
  }, DURATION.NORMAL);
}

export function initSmartHomeSettings(): void {
  // Check for OAuth callback on page load
  const oauthResult = checkSonosOAuthReturn();

  if (oauthResult) {
    // User is returning from OAuth flow
    void showSmartHomeSettings().then(() => {
      // Show appropriate toast after panel renders
      setTimeout(() => {
        if (oauthResult === 'success') {
          toast.success(t('toasts.sonosConnected'));
        } else {
          toast.error("Couldn't connect Sonos. Try again?");
        }
      }, 300);
    });
    return;
  }

  // Legacy check for other smart_home params
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('smart_home')) {
    void showSmartHomeSettings();
  }
}
