/**
 * Session Stats UI - Beautiful session statistics overlay
 *
 * Shows:
 * - Time connected
 * - Messages exchanged
 * - Current persona
 * - Conversation topics
 */

import { createTimeoutTracker } from '../utils/tracked-timeout.js';

// Track setTimeout calls for memory leak prevention
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

interface SessionStats {
  startTime: number | null;
  messageCount: number;
  personaChanges: number;
  topicsDiscussed: string[];
  currentPersona: string;
}

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let isVisible = false;
let updateInterval: ReturnType<typeof setInterval> | null = null;

const stats: SessionStats = {
  startTime: null,
  messageCount: 0,
  personaChanges: 0,
  topicsDiscussed: [],
  currentPersona: 'Ferni',
};

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initStatsUI(): void {
  createStatsOverlay();
}

function createStatsOverlay(): void {
  container = document.createElement('div');
  container.id = 'statsOverlay';
  container.className = 'stats-overlay hidden';
  container.innerHTML = `
    <div class="stats-card">
      <button class="stats-close" aria-label="${t('accessibility.closeStats')}">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
      
      <h3 class="stats-title">Session Stats</h3>
      
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-value" id="statDuration">0:00</div>
          <div class="stat-label">Duration</div>
        </div>
        
        <div class="stat-item">
          <div class="stat-value" id="statMessages">0</div>
          <div class="stat-label">Messages</div>
        </div>
        
        <div class="stat-item">
          <div class="stat-value" id="statPersona">Ferni</div>
          <div class="stat-label">Coach</div>
        </div>
        
        <div class="stat-item">
          <div class="stat-value" id="statChanges">0</div>
          <div class="stat-label">Switches</div>
        </div>
      </div>
      
      <div class="stats-footer">
        <span class="stats-tip">Press <kbd>S</kbd> to toggle stats</span>
      </div>
    </div>
  `;
  
  document.body.appendChild(container);
  
  // Add close button listener
  const closeBtn = container.querySelector('.stats-close');
  closeBtn?.addEventListener('click', hide);
  
  // Add keyboard listener
  document.addEventListener('keydown', handleKeyDown);
}

// ============================================================================
// VISIBILITY
// ============================================================================

export function show(): void {
  if (!container) return;
  
  container.classList.remove('hidden');
  requestAnimationFrame(() => {
    container?.classList.add('visible');
  });
  
  isVisible = true;
  
  // Start updating
  updateDisplay();
  updateInterval = setInterval(updateDisplay, 1000);
}

export function hide(): void {
  if (!container) return;
  
  container.classList.remove('visible');
  trackedTimeout(() => {
    container?.classList.add('hidden');
  }, 300);
  
  isVisible = false;
  
  // Stop updating
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}

export function toggle(): void {
  if (isVisible) {
    hide();
  } else {
    show();
  }
}

// ============================================================================
// STAT TRACKING
// ============================================================================

export function startSession(): void {
  stats.startTime = Date.now();
  stats.messageCount = 0;
  stats.personaChanges = 0;
  stats.topicsDiscussed = [];
}

export function endSession(): void {
  stats.startTime = null;
}

export function incrementMessages(): void {
  stats.messageCount++;
  updateDisplay();
}

export function setPersona(name: string): void {
  if (stats.currentPersona !== name) {
    stats.personaChanges++;
  }
  stats.currentPersona = name;
  updateDisplay();
}

export function addTopic(topic: string): void {
  if (!stats.topicsDiscussed.includes(topic)) {
    stats.topicsDiscussed.push(topic);
    updateDisplay();
  }
}

export function getStats(): SessionStats {
  return { ...stats };
}

// ============================================================================
// DISPLAY
// ============================================================================

function updateDisplay(): void {
  if (!container) return;
  
  // Duration
  const durationEl = container.querySelector('#statDuration');
  if (durationEl) {
    durationEl.textContent = formatDuration(stats.startTime);
  }
  
  // Messages
  const messagesEl = container.querySelector('#statMessages');
  if (messagesEl) {
    messagesEl.textContent = String(stats.messageCount);
  }
  
  // Persona
  const personaEl = container.querySelector('#statPersona');
  if (personaEl) {
    personaEl.textContent = stats.currentPersona;
  }
  
  // Persona changes
  const changesEl = container.querySelector('#statChanges');
  if (changesEl) {
    changesEl.textContent = String(stats.personaChanges);
  }
}

function formatDuration(startTime: number | null): string {
  if (!startTime) return '0:00';
  
  const seconds = Math.floor((Date.now() - startTime) / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}:${String(remainingMins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// ============================================================================
// KEYBOARD
// ============================================================================

function handleKeyDown(e: KeyboardEvent): void {
  // Ignore if typing in input
  if (
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLTextAreaElement ||
    (e.target as HTMLElement).isContentEditable
  ) {
    return;
  }
  
  if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey) {
    toggle();
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  if (updateInterval) {
    clearInterval(updateInterval);
  }
  
  document.removeEventListener('keydown', handleKeyDown);
  
  if (container) {
    container.remove();
    container = null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const statsUI = {
  init: initStatsUI,
  show,
  hide,
  toggle,
  startSession,
  endSession,
  incrementMessages,
  setPersona,
  addTopic,
  getStats,
  dispose,
};

