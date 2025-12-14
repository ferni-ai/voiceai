/**
 * Speaker Change Indicator UI
 *
 * Shows a visual indicator when voice authentication detects
 * a different speaker, prompting gentle verification.
 *
 * Design: Follows Ferni's warm, non-intrusive style - not alarming,
 * just curious and caring.
 */

import { t } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import type { ContinuousAuthStatus } from '../services/voice-auth.service.js';

const log = createLogger('SpeakerChangeIndicator');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export interface SpeakerChangeEvent {
  status: ContinuousAuthStatus;
  suggestedPrompt?: string;
  previousUserId?: string;
}

type IndicatorState = 'hidden' | 'suspicious' | 'speaker_changed' | 'verifying';

// ============================================================================
// CONSTANTS (Design System Compliant)
// ============================================================================

/** Animation duration for transitions (exported for consistency with design system) */
export const ANIMATION_DURATION = 300;
const AUTO_DISMISS_MS = 10000;
const SUSPICIOUS_THRESHOLD = 2; // Show after 2 suspicious events

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let currentState: IndicatorState = 'hidden';
let suspiciousCount = 0;
let dismissTimeout: ReturnType<typeof setTimeout> | null = null;
let onVerifyCallback: ((confirmed: boolean) => void) | null = null;

// ============================================================================
// STYLES
// ============================================================================

const styles = `
  .speaker-change-indicator {
    position: fixed;
    top: calc(var(--space-4, 16px) + env(safe-area-inset-top));
    left: 50%;
    transform: translateX(-50%) translateY(-120%);
    z-index: 1000;
    
    display: flex;
    align-items: center;
    gap: var(--space-3, 12px);
    padding: var(--space-3, 12px) var(--space-4, 16px);
    
    background: var(--color-background-elevated, #fffdfb);
    border: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.1));
    border-radius: var(--radius-full, 9999px);
    box-shadow: var(--shadow-lg, 0 10px 25px rgba(0,0,0,0.1));
    
    font-family: var(--font-body, Inter, sans-serif);
    font-size: 14px;
    color: var(--color-text-primary, #2c2520);
    
    opacity: 0;
    transition: transform var(--duration-slow, 300ms) var(--ease-spring),
                opacity var(--duration-normal, 200ms) ease-out;
    
    pointer-events: none;
  }
  
  .speaker-change-indicator.visible {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
    pointer-events: auto;
  }
  
  .speaker-change-indicator__icon {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    
    transition: background-color var(--duration-normal, 200ms) ease;
  }
  
  .speaker-change-indicator--suspicious .speaker-change-indicator__icon {
    background: rgba(196, 133, 106, 0.15);
    color: var(--color-jordan, #c4856a);
  }
  
  .speaker-change-indicator--changed .speaker-change-indicator__icon {
    background: rgba(74, 103, 65, 0.15);
    color: var(--color-ferni, #4a6741);
  }
  
  .speaker-change-indicator--verifying .speaker-change-indicator__icon {
    background: rgba(58, 107, 115, 0.15);
    color: var(--color-peter, #3a6b73);
    animation: pulse-icon 1.5s ease-in-out infinite;
  }
  
  @keyframes pulse-icon {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }
  
  .speaker-change-indicator__content {
    display: flex;
    flex-direction: column;
    gap: var(--space-1, 4px);
    min-width: 0;
  }
  
  .speaker-change-indicator__title {
    font-weight: 600;
    font-size: 14px;
    color: var(--color-text-primary, #2c2520);
  }
  
  .speaker-change-indicator__message {
    font-size: 13px;
    color: var(--color-text-secondary, #70605a);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 250px;
  }
  
  .speaker-change-indicator__actions {
    display: flex;
    gap: var(--space-2, 8px);
    margin-left: var(--space-2, 8px);
  }
  
  .speaker-change-indicator__btn {
    padding: var(--space-2, 8px) var(--space-3, 12px);
    border-radius: var(--radius-full, 9999px);
    border: none;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
  }
  
  .speaker-change-indicator__btn--primary {
    background: var(--color-ferni, #4a6741);
    color: white;
  }
  
  .speaker-change-indicator__btn--primary:hover {
    background: var(--color-ferni-dark, #3d5a35);
    transform: scale(1.02);
  }
  
  .speaker-change-indicator__btn--secondary {
    background: transparent;
    color: var(--color-text-secondary, #70605a);
  }
  
  .speaker-change-indicator__btn--secondary:hover {
    background: var(--color-background-subtle, rgba(112, 96, 90, 0.05));
  }
  
  .speaker-change-indicator__dismiss {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: none;
    background: var(--color-background-elevated, #fffdfb);
    box-shadow: var(--shadow-sm);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity var(--duration-fast, 100ms) ease;
  }
  
  .speaker-change-indicator:hover .speaker-change-indicator__dismiss {
    opacity: 1;
  }
  
  @media (prefers-reduced-motion: reduce) {
    .speaker-change-indicator,
    .speaker-change-indicator__icon,
    .speaker-change-indicator__btn {
      transition: none;
    }
    
    .speaker-change-indicator--verifying .speaker-change-indicator__icon {
      animation: none;
    }
  }
`;

// ============================================================================
// ICONS (Lucide-style SVGs)
// ============================================================================

const ICONS = {
  user: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  users: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  loader: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>`,
  x: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the speaker change indicator.
 * Call this once during app startup.
 */
export function initSpeakerChangeIndicator(): void {
  // Cleanup any existing instance (HMR protection)
  cleanupSpeakerChangeIndicator();

  // Inject styles
  const styleEl = document.createElement('style');
  styleEl.id = 'speaker-change-indicator-styles';
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);

  // Create container
  container = document.createElement('div');
  container.className = 'speaker-change-indicator';
  container.setAttribute('role', 'alert');
  container.setAttribute('aria-live', 'polite');
  document.body.appendChild(container);

  // Listen for speaker change events from voice agent
  window.addEventListener('ferni:speaker-change', handleSpeakerChange as EventListener);

  log.debug('Speaker change indicator initialized');
}

/**
 * Cleanup the speaker change indicator.
 */
export function cleanupSpeakerChangeIndicator(): void {
  // Remove event listeners
  window.removeEventListener('ferni:speaker-change', handleSpeakerChange as EventListener);

  // Remove DOM elements
  document.getElementById('speaker-change-indicator-styles')?.remove();
  document.querySelector('.speaker-change-indicator')?.remove();

  // Clear state
  container = null;
  currentState = 'hidden';
  suspiciousCount = 0;
  if (dismissTimeout) {
    clearTimeout(dismissTimeout);
    dismissTimeout = null;
  }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function handleSpeakerChange(event: CustomEvent<SpeakerChangeEvent>): void {
  const { status, suggestedPrompt } = event.detail;

  log.debug('Speaker change event received:', status.status);

  switch (status.status) {
    case 'suspicious':
      suspiciousCount++;
      if (suspiciousCount >= SUSPICIOUS_THRESHOLD) {
        showIndicator('suspicious', 'Just checking...', "Voice sounds a bit different. Still you?");
      }
      break;

    case 'speaker_changed':
      suspiciousCount = 0;
      showIndicator(
        'speaker_changed',
        'Someone new?',
        suggestedPrompt || "Hi there! Is someone else joining the conversation?"
      );
      break;

    case 'verified':
      suspiciousCount = 0;
      hide();
      break;

    default:
      // Reset on unknown status
      suspiciousCount = 0;
  }
}

// ============================================================================
// UI UPDATES
// ============================================================================

function showIndicator(state: IndicatorState, title: string, message: string): void {
  if (!container) return;

  currentState = state;
  
  const icon = state === 'verifying' ? ICONS.loader : state === 'speaker_changed' ? ICONS.users : ICONS.user;
  const stateClass = state === 'speaker_changed' ? 'changed' : state;

  container.className = `speaker-change-indicator speaker-change-indicator--${stateClass}`;
  container.innerHTML = `
    <button class="speaker-change-indicator__dismiss" aria-label="${t('accessibility.dismiss')}">${ICONS.x}</button>
    <div class="speaker-change-indicator__icon">${icon}</div>
    <div class="speaker-change-indicator__content">
      <span class="speaker-change-indicator__title">${title}</span>
      <span class="speaker-change-indicator__message">${message}</span>
    </div>
    ${state === 'speaker_changed' ? `
      <div class="speaker-change-indicator__actions">
        <button class="speaker-change-indicator__btn speaker-change-indicator__btn--primary" data-action="yes">
          Yes, it's me
        </button>
        <button class="speaker-change-indicator__btn speaker-change-indicator__btn--secondary" data-action="new">
          Someone new
        </button>
      </div>
    ` : ''}
  `;

  // Add event listeners
  container.querySelector('.speaker-change-indicator__dismiss')?.addEventListener('click', hide);
  container.querySelector('[data-action="yes"]')?.addEventListener('click', () => handleVerify(true));
  container.querySelector('[data-action="new"]')?.addEventListener('click', () => handleVerify(false));

  // Show with animation
  requestAnimationFrame(() => {
    container?.classList.add('visible');
  });

  // Auto-dismiss for non-critical states
  if (state === 'suspicious') {
    scheduleAutoDismiss();
  } else {
    clearAutoDismiss();
  }

  log.info({ state, title }, 'Showing speaker change indicator');
}

function hide(): void {
  if (!container) return;

  container.classList.remove('visible');
  currentState = 'hidden';
  clearAutoDismiss();

  log.debug('Speaker change indicator hidden');
}

function handleVerify(isSameUser: boolean): void {
  // Show verifying state briefly
  if (container) {
    showIndicator('verifying', 'Got it!', isSameUser ? 'Welcome back!' : 'Nice to meet you!');
    
    // Dispatch verification response event
    window.dispatchEvent(new CustomEvent('ferni:speaker-verified', {
      detail: { isSameUser, timestamp: Date.now() }
    }));

    // Hide after brief confirmation
    trackedTimeout(hide, 1500);
  }

  if (onVerifyCallback) {
    onVerifyCallback(isSameUser);
    onVerifyCallback = null;
  }
}

function scheduleAutoDismiss(): void {
  clearAutoDismiss();
  dismissTimeout = trackedTimeout(hide, AUTO_DISMISS_MS);
}

function clearAutoDismiss(): void {
  if (dismissTimeout) {
    clearTimeout(dismissTimeout);
    dismissTimeout = null;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Manually show speaker change indicator.
 * Usually called automatically via events, but available for testing.
 */
export function showSpeakerChangePrompt(
  type: 'suspicious' | 'speaker_changed',
  options?: { customMessage?: string; onVerify?: (confirmed: boolean) => void }
): void {
  onVerifyCallback = options?.onVerify || null;

  if (type === 'suspicious') {
    showIndicator('suspicious', 'Just checking...', options?.customMessage || "Voice sounds different. Still you?");
  } else {
    showIndicator('speaker_changed', 'Someone new?', options?.customMessage || "Is someone else joining?");
  }
}

/**
 * Hide the speaker change indicator.
 */
export function hideSpeakerChangeIndicator(): void {
  hide();
}

/**
 * Get current indicator state.
 */
export function getSpeakerIndicatorState(): IndicatorState {
  return currentState;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const speakerChangeIndicator = {
  init: initSpeakerChangeIndicator,
  cleanup: cleanupSpeakerChangeIndicator,
  show: showSpeakerChangePrompt,
  hide: hideSpeakerChangeIndicator,
  getState: getSpeakerIndicatorState,
};

export default speakerChangeIndicator;

