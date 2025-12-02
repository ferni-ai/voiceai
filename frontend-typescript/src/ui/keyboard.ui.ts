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

// ============================================================================
// TYPES
// ============================================================================

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
  '1': 'jack-b',
  '2': 'jack-bogle',
  '3': 'peter-lynch',
  '4': 'comm-specialist',
  '5': 'spend-save',
  '6': 'event-planner',
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
  setTimeout(() => {
    showHint(3000);
  }, 2000);
  
  console.log('⌨️ Keyboard shortcuts initialized');
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
    case '6':
      // Number keys: Select persona
      const personaId = PERSONA_KEYS[key];
      if (personaId) {
        callbacks?.onSelectPersona(personaId);
        flashKey(key);
      }
      break;
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
  hintElement.innerHTML = `
    <div class="key-combo">
      <span class="key">Space</span>
      <span class="key-label">Connect</span>
    </div>
    <div class="key-combo">
      <span class="key">1</span>
      <span class="key">-</span>
      <span class="key">6</span>
      <span class="key-label">Personas</span>
    </div>
    <div class="key-combo">
      <span class="key">Esc</span>
      <span class="key-label">Disconnect</span>
    </div>
  `;
  
  document.body.appendChild(hintElement);
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
    hintTimeout = setTimeout(() => {
      hideHint();
    }, duration);
  }
}

function hideHint(): void {
  if (!hintElement) return;
  
  hintElement.classList.remove('visible');
  
  // Remove from DOM after animation
  setTimeout(() => {
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
      setTimeout(() => el.classList.remove('active'), 200);
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

