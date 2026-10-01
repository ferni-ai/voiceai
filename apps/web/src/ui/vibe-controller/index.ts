/**
 * Vibe Controller UI
 *
 * A unified interface for controlling your environment's atmosphere:
 * - Music: What you hear
 * - Color: What you see (lights/ambiance)
 * - Temperature: What you feel
 *
 * Philosophy: Ferni helps you set the vibe, not manage devices.
 * "Set the mood for focus" > "Turn on Philips Hue, set to 4000K, 80%"
 *
 * DESIGN PRINCIPLES:
 *   - Human-centered, not vendor-centered
 *   - Preset vibes for quick setup
 *   - Individual controls for fine-tuning
 *   - Warm, earthy Ferni brand colors
 *   - Smooth animations per brand guidelines
 */

import { t } from '../../i18n/index.js';
import { fetchState } from './actions.js';
import { createElement, createSvgIcon, ICONS } from './dom.js';
import { renderLightsSection, renderTemperatureSection } from './render-devices.js';
import { renderMusicSection } from './render-music.js';
import { renderPresets } from './presets.js';
import {
  callbacks,
  currentState,
  loadingState,
  render,
  setRenderer,
  setVibeCallbacks,
} from './state.js';
import { getCoreStyles } from './styles-core.js';
import { getFlowStyles } from './styles-flows.js';
import type { VibeControllerCallbacks, VibeState } from './types.js';

export type { VibeControllerCallbacks, VibeState } from './types.js';

// ============================================================================
// STATE (panel lifecycle; shared view state lives in state.ts)
// ============================================================================

let container: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;
let isVisible = false;

// Focus trap elements for accessibility
let previouslyFocusedElement: HTMLElement | null = null;
let focusTrapActive = false;

setRenderer(renderView);

// ============================================================================
// HMR CLEANUP - Prevent duplicate modals on hot reload
// ============================================================================

function cleanupOrphanedElements(): void {
  // Remove any existing vibe overlay elements (from HMR)
  document.querySelectorAll('.vibe-overlay').forEach((el) => el.remove());

  // Remove orphaned Ecobee PIN dialogs
  document.querySelectorAll('.ecobee-pin-dialog').forEach((el) => el.remove());

  // Remove orphaned style elements
  document.querySelectorAll('style').forEach((el) => {
    if (el.textContent?.includes('.vibe-overlay')) {
      el.remove();
    }
  });

  // Reset module state
  container = null;
  styleElement = null;
  isVisible = false;
  focusTrapActive = false;
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;

  styleElement = document.createElement('style');
  styleElement.textContent = getCoreStyles() + getFlowStyles();

  document.head.appendChild(styleElement);
}

// ============================================================================
// RENDER FUNCTIONS
// ============================================================================

function renderHeader(): HTMLElement {
  const header = createElement('div', { className: 'vibe-header' });

  const left = createElement('div', { className: 'vibe-header__left' });
  left.appendChild(
    createElement('span', { className: 'vibe-header__eyebrow' }, [
      t('vibe.eyebrow', 'Your Environment'),
    ])
  );
  left.appendChild(
    createElement('h2', { className: 'vibe-header__title' }, [t('vibe.title', 'Set the Vibe')])
  );
  header.appendChild(left);

  const closeBtn = createElement('button', {
    className: 'vibe-close',
    'aria-label': t('common.close', 'Close'),
  });
  closeBtn.appendChild(createSvgIcon(ICONS.close));
  closeBtn.addEventListener('click', hide);
  header.appendChild(closeBtn);

  return header;
}

function renderView(): void {
  if (!container) return;

  const content = container.querySelector('.vibe-body');
  if (!content) return;

  content.textContent = '';
  content.appendChild(renderPresets());
  content.appendChild(renderMusicSection());
  content.appendChild(renderLightsSection());
  content.appendChild(renderTemperatureSection());
}

// ============================================================================
// FOCUS TRAP - Accessibility helper
// ============================================================================

function getFocusableElements(): HTMLElement[] {
  if (!container) return [];
  const panel = container.querySelector('.vibe-panel');
  if (!panel) return [];

  const elements = panel.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  return Array.from(elements).filter(
    (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
  );
}

function handleFocusTrap(e: KeyboardEvent): void {
  if (!focusTrapActive || e.key !== 'Tab') return;

  const focusable = getFocusableElements();
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last?.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first?.focus();
  }
}

function activateFocusTrap(): void {
  previouslyFocusedElement = document.activeElement as HTMLElement | null;
  focusTrapActive = true;

  // Focus the first focusable element
  const focusable = getFocusableElements();
  if (focusable.length > 0) {
    focusable[0]?.focus();
  }
}

function deactivateFocusTrap(): void {
  focusTrapActive = false;

  // Restore focus to previously focused element
  if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === 'function') {
    previouslyFocusedElement.focus();
  }
  previouslyFocusedElement = null;
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function initialize(): void {
  // HMR cleanup - prevent duplicate modals
  cleanupOrphanedElements();

  if (container) return;

  injectStyles();

  container = createElement('div', { className: 'vibe-overlay' });

  const panel = createElement('div', {
    className: 'vibe-panel',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'vibe-title',
  });
  panel.appendChild(renderHeader());

  const body = createElement('div', { className: 'vibe-body' });
  panel.appendChild(body);

  container.appendChild(panel);

  // Close on backdrop click
  container.addEventListener('click', (e) => {
    if (e.target === container) hide();
  });

  // Keyboard handling
  document.addEventListener('keydown', (e) => {
    if (!isVisible) return;

    // Close on Escape
    if (e.key === 'Escape') {
      hide();
      return;
    }

    // Focus trap
    handleFocusTrap(e);
  });

  document.body.appendChild(container);
}

export async function show(): Promise<void> {
  initialize();
  if (!container) return;

  loadingState.fetchingState = true;
  render();

  await fetchState();

  loadingState.fetchingState = false;
  render();

  container.classList.add('vibe-overlay--visible');
  isVisible = true;

  // Activate focus trap for accessibility
  activateFocusTrap();
}

export function hide(): void {
  if (!container) return;

  container.classList.remove('vibe-overlay--visible');
  isVisible = false;

  // Deactivate focus trap
  deactivateFocusTrap();

  callbacks.onClose?.();
}

export function setCallbacks(cbs: VibeControllerCallbacks): void {
  setVibeCallbacks(cbs);
}

export function getState(): VibeState {
  return { ...currentState };
}

// Default export for easy import
export default {
  initialize,
  show,
  hide,
  setCallbacks,
  getState,
};
