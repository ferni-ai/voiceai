/**
 * Keyboard Shortcuts UI - Power user keyboard controls
 * 
 * Shortcuts:
 * - Space: Toggle connection
 * - 1-6: Select personas
 * - Escape: Disconnect
 * - ?: Show/hide shortcuts hint
 */

import type { PersonaId } from '../types/persona.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

// ============================================================================
// TYPES
// ============================================================================

// Track setTimeout calls for memory leak prevention
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

interface KeyboardCallbacks {
  onConnect: () => void;
  onDisconnect: () => void;
  onSelectPersona: (personaId: PersonaId) => void;
}

// ============================================================================
// STATE
// ============================================================================

let callbacks: KeyboardCallbacks | null = null;
let isConnected = false;
let hintElement: HTMLElement | null = null;
let hintTimeout: ReturnType<typeof setTimeout> | null = null;

// Persona mapping by number key
const PERSONA_KEYS: Record<string, PersonaId> = {
  '1': 'ferni',
  '2': 'nayan-patel',
  '3': 'peter-john',
  '4': 'alex-chen',
  '5': 'maya-santos',
  '6': 'jordan-taylor',
};

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initKeyboardUI(cbs: KeyboardCallbacks): void {
  callbacks = cbs;
  
  // Create hint element
  createHintElement();
  
  // Add keyboard listener
  document.addEventListener('keydown', handleKeyDown);
  
  // Show hint briefly on first load (after a delay)
  trackedTimeout(() => {
    showHint(3000);
  }, 2000);
  
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function handleKeyDown(event: KeyboardEvent): void {
  // Don't handle if user is typing in an input
  if (isTypingInInput(event)) return;
  
  const key = event.key.toLowerCase();
  
  switch (key) {
    case ' ':
      // Space: Toggle connection
      event.preventDefault();
      toggleConnection();
      break;
      
    case 'escape':
      // Escape: Disconnect
      if (isConnected) {
        callbacks?.onDisconnect();
      }
      break;
      
    case '?':
      // ?: Toggle hint
      toggleHint();
      break;
      
    case '1':
    case '2':
    case '3':
    case '4':
    case '5':
    case '6': {
      // Number keys: Select persona
      const personaId = PERSONA_KEYS[key];
      if (personaId) {
        callbacks?.onSelectPersona(personaId);
        flashKey(key);
      }
      break;
    }
  }
}

function isTypingInInput(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  );
}

function toggleConnection(): void {
  if (!callbacks) return;
  
  if (isConnected) {
    callbacks.onDisconnect();
  } else {
    callbacks.onConnect();
  }
}

// ============================================================================
// CONNECTION STATE
// ============================================================================

export function setConnected(connected: boolean): void {
  isConnected = connected;
}

// ============================================================================
// HINT UI
// ============================================================================

function createHintElement(): void {
  // Check if already exists
  if (document.getElementById('keyboardHint')) {
    hintElement = document.getElementById('keyboardHint');
    return;
  }

  hintElement = document.createElement('div');
  hintElement.id = 'keyboardHint';
  hintElement.className = 'keyboard-hint hidden';
  hintElement.setAttribute('role', 'tooltip');
  hintElement.setAttribute('aria-label', 'Keyboard shortcuts');
  hintElement.innerHTML = `
    <div class="keyboard-hint__header">Keyboard Shortcuts</div>
    <div class="key-combo">
      <span class="key">Space</span>
      <span class="key-label">Connect / Disconnect</span>
    </div>
    <div class="key-combo">
      <span class="key">1</span>
      <span class="key">-</span>
      <span class="key">6</span>
      <span class="key-label">Switch Personas</span>
    </div>
    <div class="key-combo">
      <span class="key">T</span>
      <span class="key-label">Toggle Theme</span>
    </div>
    <div class="key-combo">
      <span class="key">Esc</span>
      <span class="key-label">Disconnect</span>
    </div>
    <div class="key-combo">
      <span class="key">?</span>
      <span class="key-label">Toggle this hint</span>
    </div>
  `;

  // Add inline styles for consistent rendering
  addHintStyles();

  document.body.appendChild(hintElement);
}

/**
 * Add inline styles for keyboard hint (ensures consistent look)
 */
function addHintStyles(): void {
  const styleId = 'keyboard-hint-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .keyboard-hint {
      position: fixed;
      bottom: 1.5rem;
      right: 1.5rem;
      background: var(--color-bg-secondary, rgba(26, 26, 46, 0.95));
      backdrop-filter: blur(var(--glass-blur-medium));
      border: 1px solid var(--color-border-primary, rgba(255, 255, 255, 0.1));
      border-radius: 12px;
      padding: 1rem;
      font-size: 0.875rem;
      color: var(--color-text-secondary, rgba(255, 255, 255, 0.7));
      opacity: 0;
      transform: translateY(10px);
      transition: opacity 0.3s ease, transform 0.3s ease;
      z-index: var(--z-dropdown);
      box-shadow: var(--shadow-xl);
    }

    .keyboard-hint.visible {
      opacity: 1;
      transform: translateY(0);
    }

    .keyboard-hint.hidden {
      display: none;
    }

    .keyboard-hint__header {
      font-weight: 600;
      color: var(--color-text-primary, #fff);
      margin-bottom: 0.75rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--color-border-primary, rgba(255, 255, 255, 0.1));
    }

    .key-combo {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.25rem 0;
    }

    .key {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 1.5rem;
      height: 1.5rem;
      padding: 0 0.375rem;
      background: var(--color-bg-tertiary, rgba(255, 255, 255, 0.1));
      border: 1px solid var(--color-border-secondary, rgba(255, 255, 255, 0.2));
      border-radius: 4px;
      font-family: var(--font-mono, monospace);
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--color-text-primary, #fff);
      transition: background 0.15s ease, transform 0.1s ease;
    }

    .key.active {
      background: var(--persona-primary, #4a6741);
      transform: scale(0.95);
    }

    .key-label {
      color: var(--color-text-secondary, rgba(255, 255, 255, 0.6));
    }
  `;

  document.head.appendChild(style);
}

function showHint(duration?: number): void {
  if (!hintElement) return;
  
  hintElement.classList.remove('hidden');
  
  // Trigger animation
  requestAnimationFrame(() => {
    hintElement?.classList.add('visible');
  });
  
  // Auto-hide after duration
  if (duration) {
    if (hintTimeout) clearTimeout(hintTimeout);
    hintTimeout = trackedTimeout(() => {
      hideHint();
    }, duration);
  }
}

function hideHint(): void {
  if (!hintElement) return;
  
  hintElement.classList.remove('visible');
  
  // Remove from DOM after animation
  trackedTimeout(() => {
    hintElement?.classList.add('hidden');
  }, 300);
}

function toggleHint(): void {
  if (!hintElement) return;
  
  if (hintElement.classList.contains('visible')) {
    hideHint();
  } else {
    showHint();
  }
}

function flashKey(key: string): void {
  // Visual feedback when key is pressed
  const keyElements = hintElement?.querySelectorAll('.key');
  keyElements?.forEach(el => {
    if (el.textContent === key || el.textContent?.includes(key)) {
      el.classList.add('active');
      trackedTimeout(() => el.classList.remove('active'), 200);
    }
  });
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  document.removeEventListener('keydown', handleKeyDown);
  
  if (hintTimeout) {
    clearTimeout(hintTimeout);
  }
  
  if (hintElement) {
    hintElement.remove();
    hintElement = null;
  }
  
  callbacks = null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const keyboardUI = {
  init: initKeyboardUI,
  setConnected,
  dispose,
};

