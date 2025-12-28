/**
 * Keyboard Shortcuts System
 *
 * Professional keyboard navigation for power users.
 * Every action should be accessible without a mouse.
 *
 * @module @ferni/keyboard-shortcuts
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { trapFocus, announce } from '../utils/accessibility.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('KeyboardShortcuts');

// ============================================================================
// TYPES
// ============================================================================

export interface Shortcut {
  /** Keyboard key (without modifiers) */
  key: string;
  /** Require Cmd/Ctrl */
  cmd?: boolean;
  /** Require Shift */
  shift?: boolean;
  /** Require Alt/Option */
  alt?: boolean;
  /** Display label */
  label: string;
  /** Description */
  description?: string;
  /** Category for grouping */
  category?: 'navigation' | 'actions' | 'media' | 'dev';
  /** Action to execute */
  action: () => void;
  /** Only in development */
  devOnly?: boolean;
  /** Prevent default browser behavior */
  preventDefault?: boolean;
}

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  keyboard: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" ry="2"/><path d="M6 8h.001"/><path d="M10 8h.001"/><path d="M14 8h.001"/><path d="M18 8h.001"/><path d="M8 12h.001"/><path d="M12 12h.001"/><path d="M16 12h.001"/><path d="M7 16h10"/></svg>`,
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
};

// ============================================================================
// DEFAULT SHORTCUTS
// ============================================================================

function getDefaultShortcuts(): Shortcut[] {
  return [
    // Navigation
    {
      key: 'k',
      cmd: true,
      label: '⌘K',
      description: 'Open command palette',
      category: 'navigation',
      action: () => window.dispatchEvent(new CustomEvent('ferni:toggle-command-palette')),
      preventDefault: true,
    },
    {
      key: '/',
      label: '/',
      description: 'Focus search',
      category: 'navigation',
      action: () => window.dispatchEvent(new CustomEvent('ferni:focus-search')),
    },
    {
      key: '?',
      label: '?',
      description: 'Show shortcuts',
      category: 'navigation',
      action: () => showShortcutsPanel(),
    },
    {
      key: 'Escape',
      label: 'Esc',
      description: 'Close modal / Cancel',
      category: 'navigation',
      action: () => window.dispatchEvent(new CustomEvent('ferni:escape')),
    },

    // Actions
    {
      key: ' ',
      label: 'Space',
      description: 'Push to talk (hold)',
      category: 'actions',
      action: () => window.dispatchEvent(new CustomEvent('ferni:push-to-talk')),
    },
    {
      key: 'm',
      label: 'M',
      description: 'Toggle mute',
      category: 'actions',
      action: () => window.dispatchEvent(new CustomEvent('ferni:toggle-mute')),
    },
    {
      key: 'r',
      label: 'R',
      description: 'Reconnect',
      category: 'actions',
      action: () => window.dispatchEvent(new CustomEvent('ferni:reconnect')),
    },
    {
      key: 'Enter',
      label: '↵',
      description: 'Start/end call',
      category: 'actions',
      action: () => window.dispatchEvent(new CustomEvent('ferni:toggle-call')),
    },

    // Quick navigation (number keys)
    {
      key: '1',
      label: '1',
      description: 'Talk to Ferni',
      category: 'navigation',
      action: () => window.dispatchEvent(new CustomEvent('ferni:switch-persona', { detail: { persona: 'ferni' } })),
    },
    {
      key: '2',
      label: '2',
      description: 'View team',
      category: 'navigation',
      action: () => window.dispatchEvent(new CustomEvent('ferni:open-team')),
    },
    {
      key: '3',
      label: '3',
      description: 'View journey',
      category: 'navigation',
      action: () => window.dispatchEvent(new CustomEvent('ferni:open-journey')),
    },
    {
      key: ',',
      cmd: true,
      label: '⌘,',
      description: 'Settings',
      category: 'navigation',
      action: () => window.dispatchEvent(new CustomEvent('ferni:open-settings')),
      preventDefault: true,
    },

    // Dev shortcuts
    {
      key: 'd',
      cmd: true,
      shift: true,
      label: '⌘⇧D',
      description: 'Toggle dev panel',
      category: 'dev',
      devOnly: true,
      action: () => window.dispatchEvent(new CustomEvent('ferni:toggle-dev-panel')),
      preventDefault: true,
    },
  ];
}

// ============================================================================
// STATE
// ============================================================================

let shortcuts: Shortcut[] = [];
let panel: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;
let isPanelOpen = false;
let isInitialized = false;
let focusTrapCleanup: (() => void) | null = null;
let previousActiveElement: HTMLElement | null = null;

// Track which keys are currently pressed (for modifiers)
const pressedKeys = new Set<string>();

// ============================================================================
// STYLE INJECTION
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;
  if (typeof document === 'undefined') return;

  styleElement = document.createElement('style');
  styleElement.id = 'ferni-keyboard-shortcuts';
  styleElement.textContent = `
    /* ============================================
       KEYBOARD SHORTCUTS PANEL
       ============================================ */

    .shortcuts-panel {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 2100);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4, 16px);
      opacity: 0;
      visibility: hidden;
      transition: 
        opacity ${DURATION.FAST}ms ${EASING.STANDARD},
        visibility ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .shortcuts-panel--open {
      opacity: 1;
      visibility: visible;
    }

    .shortcuts-panel__backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.75);
    }

    .shortcuts-panel__card {
      position: relative;
      width: 100%;
      max-width: 480px;
      max-height: calc(100vh - 100px);
      background: var(--color-background-elevated, white);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xl, 16px);
      box-shadow: var(--shadow-2xl);
      overflow: hidden;
      transform: scale(0.95);
      transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
    }

    .shortcuts-panel--open .shortcuts-panel__card {
      transform: scale(1);
    }

    .shortcuts-panel__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-4, 16px) var(--space-5, 20px);
      border-bottom: 1px solid var(--color-border-subtle);
    }

    .shortcuts-panel__title-group {
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
    }

    .shortcuts-panel__icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      border-radius: var(--radius-lg, 12px);
      color: var(--persona-primary, #4a6741);
    }

    .shortcuts-panel__title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-lg, 18px);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-primary, #2C2520);
      margin: 0;
    }

    .shortcuts-panel__close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      background: transparent;
      border: none;
      border-radius: var(--radius-full, 9999px);
      color: var(--color-text-muted);
      cursor: pointer;
      transition: background ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .shortcuts-panel__close:hover {
      background: var(--color-background-secondary);
    }

    .shortcuts-panel__close:focus-visible {
      outline: 2px solid var(--persona-primary);
      outline-offset: 2px;
    }

    .shortcuts-panel__content {
      padding: var(--space-4, 16px) var(--space-5, 20px);
      overflow-y: auto;
      max-height: 400px;
    }

    .shortcuts-panel__category {
      margin-bottom: var(--space-5, 20px);
    }

    .shortcuts-panel__category:last-child {
      margin-bottom: 0;
    }

    .shortcuts-panel__category-title {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-xs, 12px);
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: var(--space-2, 8px);
    }

    .shortcuts-panel__list {
      display: flex;
      flex-direction: column;
      gap: var(--space-1, 4px);
    }

    .shortcuts-panel__item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-2, 8px) var(--space-3, 12px);
      border-radius: var(--radius-md, 8px);
      transition: background ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .shortcuts-panel__item:hover {
      background: var(--color-background-secondary, #F5F1E8);
    }

    .shortcuts-panel__item-label {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-sm, 14px);
      color: var(--color-text-primary, #2C2520);
    }

    .shortcuts-panel__keys {
      display: flex;
      gap: var(--space-1, 4px);
    }

    .shortcuts-panel__key {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 24px;
      height: 24px;
      padding: 0 var(--space-2, 8px);
      background: var(--color-background-tertiary, #E8E0D5);
      border-radius: var(--radius-sm, 4px);
      font-family: var(--font-mono, monospace);
      font-size: var(--text-xs, 12px);
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text-secondary);
    }

    .shortcuts-panel__footer {
      padding: var(--space-3, 12px) var(--space-5, 20px);
      border-top: 1px solid var(--color-border-subtle);
      font-size: var(--text-xs, 12px);
      color: var(--color-text-muted);
      text-align: center;
    }

    /* Dark theme */
    [data-theme="midnight"] .shortcuts-panel__backdrop {
      background: var(--backdrop-heavy, rgba(20, 18, 16, 0.6));
    }

    [data-theme="midnight"] .shortcuts-panel__card {
      background: var(--color-background-elevated, #70605a);
    }

    [data-theme="midnight"] .shortcuts-panel__key {
      background: var(--color-background-secondary, #60504a);
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .shortcuts-panel,
      .shortcuts-panel__card {
        transition: none;
      }
    }
  `;

  document.head.appendChild(styleElement);
  log.debug('Shortcuts styles injected');
}

// ============================================================================
// SHORTCUT MATCHING
// ============================================================================

function matchesShortcut(e: KeyboardEvent, shortcut: Shortcut): boolean {
  // Check modifiers
  const cmdRequired = shortcut.cmd || false;
  const shiftRequired = shortcut.shift || false;
  const altRequired = shortcut.alt || false;

  const cmdPressed = e.metaKey || e.ctrlKey;
  const shiftPressed = e.shiftKey;
  const altPressed = e.altKey;

  if (cmdRequired !== cmdPressed) return false;
  if (shiftRequired !== shiftPressed) return false;
  if (altRequired !== altPressed) return false;

  // Check key
  const key = shortcut.key.toLowerCase();
  const pressedKey = e.key.toLowerCase();

  // Handle special keys
  if (key === ' ' && e.code === 'Space') return true;
  if (key === '?' && pressedKey === '?' && shiftPressed) return true;

  return pressedKey === key;
}

function isInputFocused(): boolean {
  const active = document.activeElement;
  if (!active) return false;

  const tagName = active.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true;
  }

  if (active.getAttribute('contenteditable') === 'true') {
    return true;
  }

  return false;
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function handleKeydown(e: KeyboardEvent): void {
  // Track pressed key
  pressedKeys.add(e.key.toLowerCase());

  // Skip if in input
  if (isInputFocused()) return;

  // Check dev mode
  const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

  for (const shortcut of shortcuts) {
    if (shortcut.devOnly && !isDev) continue;

    if (matchesShortcut(e, shortcut)) {
      if (shortcut.preventDefault !== false) {
        e.preventDefault();
      }

      try {
        shortcut.action();
        log.debug('Shortcut executed', { label: shortcut.label });
      } catch (error) {
        log.error('Shortcut action failed', { label: shortcut.label, error });
      }

      return;
    }
  }
}

function handleKeyup(e: KeyboardEvent): void {
  pressedKeys.delete(e.key.toLowerCase());
}

// ============================================================================
// PANEL RENDER
// ============================================================================

function createPanel(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'shortcuts-panel';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Keyboard shortcuts');

  // Group shortcuts by category
  const grouped = new Map<string, Shortcut[]>();
  const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

  for (const s of shortcuts) {
    if (s.devOnly && !isDev) continue;
    const cat = s.category || 'other';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(s);
  }

  let categoriesHtml = '';
  const categoryOrder = ['navigation', 'actions', 'media', 'dev'];

  for (const cat of categoryOrder) {
    const catShortcuts = grouped.get(cat);
    if (!catShortcuts || catShortcuts.length === 0) continue;

    const catLabel = cat.charAt(0).toUpperCase() + cat.slice(1);
    let itemsHtml = '';

    for (const s of catShortcuts) {
      itemsHtml += `
        <div class="shortcuts-panel__item">
          <span class="shortcuts-panel__item-label">${s.description || s.label}</span>
          <div class="shortcuts-panel__keys">
            <kbd class="shortcuts-panel__key">${s.label}</kbd>
          </div>
        </div>
      `;
    }

    categoriesHtml += `
      <div class="shortcuts-panel__category">
        <h4 class="shortcuts-panel__category-title">${catLabel}</h4>
        <div class="shortcuts-panel__list">
          ${itemsHtml}
        </div>
      </div>
    `;
  }

  el.innerHTML = `
    <div class="shortcuts-panel__backdrop"></div>
    <div class="shortcuts-panel__card">
      <header class="shortcuts-panel__header">
        <div class="shortcuts-panel__title-group">
          <div class="shortcuts-panel__icon">${ICONS.keyboard}</div>
          <h3 class="shortcuts-panel__title">Keyboard Shortcuts</h3>
        </div>
        <button class="shortcuts-panel__close" aria-label="Close">${ICONS.close}</button>
      </header>
      <div class="shortcuts-panel__content">
        ${categoriesHtml}
      </div>
      <footer class="shortcuts-panel__footer">
        Press <kbd class="shortcuts-panel__key">?</kbd> anytime to see shortcuts
      </footer>
    </div>
  `;

  return el;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize keyboard shortcuts system
 */
export function initKeyboardShortcuts(customShortcuts: Shortcut[] = []): void {
  if (isInitialized) return;
  if (typeof document === 'undefined') return;

  injectStyles();

  // Set up shortcuts
  shortcuts = [...getDefaultShortcuts(), ...customShortcuts];

  // Add event listeners
  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('keyup', handleKeyup);

  // Clear pressed keys on window blur
  window.addEventListener('blur', () => pressedKeys.clear());

  isInitialized = true;
  log.info('Keyboard shortcuts initialized', { count: shortcuts.length });
}

/**
 * Show keyboard shortcuts panel
 */
export function showShortcutsPanel(): void {
  if (isPanelOpen) return;

  // Store current focus
  previousActiveElement = document.activeElement as HTMLElement;

  // Create panel
  if (panel) panel.remove();
  panel = createPanel();
  document.body.appendChild(panel);

  // Show panel
  isPanelOpen = true;
  requestAnimationFrame(() => {
    panel?.classList.add('shortcuts-panel--open');
  });

  // Focus trap
  const card = panel.querySelector('.shortcuts-panel__card') as HTMLElement;
  if (card) {
    focusTrapCleanup = trapFocus(card);
  }

  // Focus close button
  const closeBtn = panel.querySelector('.shortcuts-panel__close') as HTMLElement;
  closeBtn?.focus();

  // Event listeners
  closeBtn?.addEventListener('click', hideShortcutsPanel);
  panel.querySelector('.shortcuts-panel__backdrop')?.addEventListener('click', hideShortcutsPanel);

  announce('Keyboard shortcuts panel opened');
}

/**
 * Hide keyboard shortcuts panel
 */
export function hideShortcutsPanel(): void {
  if (!isPanelOpen || !panel) return;

  isPanelOpen = false;
  panel.classList.remove('shortcuts-panel--open');

  // Clean up after animation
  setTimeout(() => {
    panel?.remove();
    panel = null;
  }, DURATION.NORMAL);

  // Clean up focus trap
  focusTrapCleanup?.();
  focusTrapCleanup = null;

  // Restore focus
  previousActiveElement?.focus();

  announce('Keyboard shortcuts panel closed');
}

/**
 * Register a custom shortcut
 */
export function registerShortcut(shortcut: Shortcut): void {
  shortcuts.push(shortcut);
  log.debug('Shortcut registered', { label: shortcut.label });
}

/**
 * Unregister a shortcut
 */
export function unregisterShortcut(label: string): void {
  shortcuts = shortcuts.filter((s) => s.label !== label);
  log.debug('Shortcut unregistered', { label });
}

/**
 * Get all registered shortcuts
 */
export function getShortcuts(): Shortcut[] {
  return [...shortcuts];
}

/**
 * Check if shortcuts panel is open
 */
export function isShortcutsPanelOpen(): boolean {
  return isPanelOpen;
}

/**
 * Dispose keyboard shortcuts system
 */
export function disposeKeyboardShortcuts(): void {
  hideShortcutsPanel();

  document.removeEventListener('keydown', handleKeydown);
  document.removeEventListener('keyup', handleKeyup);

  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }

  shortcuts = [];
  isInitialized = false;

  log.debug('Keyboard shortcuts disposed');
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const keyboardShortcuts = {
  init: initKeyboardShortcuts,
  show: showShortcutsPanel,
  hide: hideShortcutsPanel,
  register: registerShortcut,
  unregister: unregisterShortcut,
  getAll: getShortcuts,
  isOpen: isShortcutsPanelOpen,
  dispose: disposeKeyboardShortcuts,
};

