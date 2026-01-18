/**
 * Whisper UI - Ferni's Gentle Voice
 *
 * Whispers are subtle notifications that feel like Ferni is briefly speaking.
 * They appear near the avatar, not as intrusive popups scattered across the screen.
 *
 * DESIGN PHILOSOPHY:
 * - "The avatar IS the notification system"
 * - Whispers feel like brief spoken status, not interruptions
 * - Queued so multiple messages don't overlap
 * - Position near avatar creates conversational feel
 *
 * VARIANTS:
 * - info: Default, neutral updates
 * - success: Confirmations (saved, connected, etc.)
 * - warning: Soft alerts, guidance
 * - error: Problems that need attention (slightly more prominent)
 * - celebration: Seeds earned, milestones (with sparkle effect)
 *
 * @module @ferni/whisper
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { getHapticsService } from '../services/haptics.service.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

const log = createLogger('WhisperUI');

const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export type WhisperType = 'info' | 'success' | 'warning' | 'error' | 'celebration';

export interface WhisperConfig {
  message: string;
  type?: WhisperType;
  duration?: number;
  /** Optional: amount for celebration whispers (e.g., "+5 seeds") */
  amount?: number;
  /** Optional: reason for celebration */
  reason?: string;
}

interface QueuedWhisper {
  id: string;
  config: WhisperConfig;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_DURATIONS: Record<WhisperType, number> = {
  info: 2000,
  success: 1800,
  warning: 2500,
  error: 3000,
  celebration: 3000,
};

// Glass styling with subtle accent colors
const TYPE_ACCENTS: Record<WhisperType, { accent: string; glow: string }> = {
  info: {
    accent: 'var(--persona-primary, #4a6741)',
    glow: 'rgba(74, 103, 65, 0.15)',
  },
  success: {
    accent: 'var(--color-semantic-success, #4a6741)',
    glow: 'rgba(74, 103, 65, 0.2)',
  },
  warning: {
    accent: 'var(--color-semantic-warning, #b8956a)',
    glow: 'rgba(184, 149, 106, 0.15)',
  },
  error: {
    accent: 'var(--color-semantic-error, #a86d55)',
    glow: 'rgba(168, 109, 85, 0.2)',
  },
  celebration: {
    accent: 'var(--persona-primary, #4a6741)',
    glow: 'rgba(74, 103, 65, 0.25)',
  },
};

// ============================================================================
// STATE
// ============================================================================

let whisperContainer: HTMLElement | null = null;
let activeWhisper: { id: string; element: HTMLElement; timeout?: ReturnType<typeof setTimeout> } | null = null;
let queue: QueuedWhisper[] = [];
let idCounter = 0;
let styleElement: HTMLStyleElement | null = null;
const haptics = getHapticsService();

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;

  styleElement = document.createElement('style');
  styleElement.id = 'whisper-styles';
  styleElement.textContent = `
    .whisper-container {
      /* Position NEAR the avatar for that "Ferni is speaking" feel */
      position: fixed;
      top: calc(260px + env(safe-area-inset-top, 0px));
      left: 50%;
      transform: translateX(-50%);
      z-index: var(--z-notification, 3000);
      pointer-events: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }

    .whisper {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      /* Glass styling - frosted, subtle, small */
      background: rgba(30, 30, 35, 0.75);
      backdrop-filter: blur(var(--glass-blur-medium, 16px));
      -webkit-backdrop-filter: blur(var(--glass-blur-medium, 16px));
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: var(--color-text-primary, #faf6f0);
      padding: 6px 14px;
      border-radius: 20px;
      font-family: var(--font-body, 'Inter', system-ui, sans-serif);
      font-size: clamp(11px, 2.5vw, 12px);
      font-weight: 500;
      letter-spacing: 0.01em;
      white-space: nowrap;
      max-width: calc(100vw - 48px);
      overflow: hidden;
      text-overflow: ellipsis;
      box-shadow: 0 4px 20px var(--whisper-glow, rgba(0, 0, 0, 0.15)), 0 2px 8px rgba(0, 0, 0, 0.2);
      pointer-events: auto;
      
      /* Entry animation - slides down from avatar */
      opacity: 0;
      transform: translateY(-8px) scale(0.95);
      animation: whisper-in ${DURATION.NORMAL}ms ${EASING.STANDARD} forwards;
    }

    /* Subtle accent indicator on left */
    .whisper::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 3px;
      border-radius: 20px 0 0 20px;
      background: var(--whisper-accent, var(--persona-primary, #4a6741));
      opacity: 0.8;
    }

    .whisper.exiting {
      animation: whisper-out ${DURATION.FAST}ms ${EASING.STANDARD} forwards;
    }

    @keyframes whisper-in {
      from {
        opacity: 0;
        transform: translateY(-8px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @keyframes whisper-out {
      from {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      to {
        opacity: 0;
        transform: translateY(-4px) scale(0.97);
      }
    }

    /* Celebration variant with shimmer animation */
    .whisper--celebration::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: linear-gradient(90deg, 
        transparent 0%, 
        rgba(255, 255, 255, 0.15) 50%, 
        transparent 100%
      );
      opacity: 0;
      animation: shimmer 1.2s ease-in-out;
    }

    @keyframes shimmer {
      0% {
        opacity: 0;
        transform: translateX(-100%);
      }
      30% {
        opacity: 1;
      }
      100% {
        opacity: 0;
        transform: translateX(100%);
      }
    }

    /* Celebration amount styling */
    .whisper__amount {
      font-weight: 600;
      color: var(--persona-primary, #4a6741);
      margin-right: 2px;
    }

    .whisper__reason {
      opacity: 0.8;
    }

    /* Sparkle particles for celebration */
    .whisper__sparkle {
      position: absolute;
      width: 3px;
      height: 3px;
      background: var(--persona-primary, #4a6741);
      border-radius: 50%;
      opacity: 0;
      animation: sparkle-burst 0.6s ${EASING.EXPO_OUT} forwards;
    }

    @keyframes sparkle-burst {
      0% {
        opacity: 0.8;
        transform: translate(0, 0) scale(1);
      }
      100% {
        opacity: 0;
        transform: translate(var(--spark-x), var(--spark-y)) scale(0);
      }
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .whisper {
        animation: none;
        opacity: 1;
        transform: none;
      }
      .whisper.exiting {
        animation: none;
        opacity: 0;
      }
      .whisper--celebration::after,
      .whisper__sparkle {
        animation: none;
      }
    }

    /* Mobile positioning - closer to avatar */
    @media (max-width: 480px) {
      .whisper-container {
        top: calc(220px + env(safe-area-inset-top, 0px));
      }
      .whisper {
        font-size: 11px;
        padding: 5px 12px;
      }
    }
  `;
  document.head.appendChild(styleElement);
}

// ============================================================================
// CONTAINER
// ============================================================================

function ensureContainer(): HTMLElement {
  if (!whisperContainer) {
    whisperContainer = document.createElement('div');
    whisperContainer.className = 'whisper-container';
    whisperContainer.setAttribute('role', 'status');
    whisperContainer.setAttribute('aria-live', 'polite');
    document.body.appendChild(whisperContainer);
  }
  return whisperContainer;
}

// ============================================================================
// WHISPER MANAGER
// ============================================================================

/**
 * Show a whisper notification.
 * If another whisper is active, this one will be queued.
 */
export function showWhisper(config: WhisperConfig): string {
  injectStyles();
  
  const id = `whisper-${++idCounter}`;
  
  // If we have an active whisper, queue this one
  if (activeWhisper) {
    queue.push({ id, config });
    log.debug({ id, message: config.message }, 'Whisper queued');
    return id;
  }

  displayWhisper(id, config);
  return id;
}

function displayWhisper(id: string, config: WhisperConfig): void {
  const container = ensureContainer();
  const type = config.type || 'info';
  const accents = TYPE_ACCENTS[type];

  // Create whisper element
  const whisper = document.createElement('div');
  whisper.className = `whisper whisper--${type}`;
  whisper.setAttribute('role', 'alert');

  // Set CSS custom properties for accent colors
  whisper.style.setProperty('--whisper-accent', accents.accent);
  whisper.style.setProperty('--whisper-glow', accents.glow);

  // Build content
  if (type === 'celebration' && config.amount !== undefined) {
    whisper.innerHTML = `
      <span class="whisper__amount">+${config.amount}</span>
      <span class="whisper__reason">${config.reason || 'seeds'}</span>
    `;
  } else {
    whisper.textContent = config.message;
  }

  container.appendChild(whisper);

  // Add sparkles for celebration
  if (type === 'celebration') {
    createSparkles(whisper);
  }

  // Haptic feedback
  playHaptic(type);

  // Auto-dismiss
  const duration = config.duration ?? DEFAULT_DURATIONS[type];
  const timeout = trackedTimeout(() => dismissWhisper(id), duration);

  activeWhisper = { id, element: whisper, timeout };

  log.debug({ id, type, message: config.message }, 'Whisper shown');
}

function createSparkles(whisper: HTMLElement): void {
  const sparkleCount = 6;
  for (let i = 0; i < sparkleCount; i++) {
    const sparkle = document.createElement('div');
    sparkle.className = 'whisper__sparkle';
    
    // Random direction
    const angle = (Math.PI * 2 * i) / sparkleCount + (Math.random() - 0.5) * 0.5;
    const distance = 20 + Math.random() * 15;
    sparkle.style.setProperty('--spark-x', `${Math.cos(angle) * distance}px`);
    sparkle.style.setProperty('--spark-y', `${Math.sin(angle) * distance}px`);
    sparkle.style.left = '50%';
    sparkle.style.top = '50%';
    sparkle.style.animationDelay = `${i * 50}ms`;

    whisper.appendChild(sparkle);
  }
}

function playHaptic(type: WhisperType): void {
  switch (type) {
    case 'success':
    case 'celebration':
      haptics.play('sparkle');
      break;
    case 'warning':
      haptics.play('warning');
      break;
    case 'error':
      haptics.play('error');
      break;
    default:
      haptics.play('tap');
  }
}

/**
 * Dismiss the active whisper.
 */
export function dismissWhisper(id?: string): void {
  if (!activeWhisper) return;
  if (id && activeWhisper.id !== id) return;

  const { element, timeout } = activeWhisper;

  if (timeout) {
    clearTimeout(timeout);
  }

  // Exit animation
  element.classList.add('exiting');

  trackedTimeout(() => {
    element.remove();
    activeWhisper = null;

    // Process next in queue
    if (queue.length > 0) {
      const next = queue.shift()!;
      displayWhisper(next.id, next.config);
    }
  }, DURATION.FAST);
}

/**
 * Dismiss all whispers and clear queue.
 */
export function dismissAll(): void {
  queue = [];
  if (activeWhisper) {
    dismissWhisper(activeWhisper.id);
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

export function whisperInfo(message: string, duration?: number): string {
  return showWhisper({ message, type: 'info', duration });
}

export function whisperSuccess(message: string, duration?: number): string {
  return showWhisper({ message, type: 'success', duration });
}

export function whisperWarning(message: string, duration?: number): string {
  return showWhisper({ message, type: 'warning', duration });
}

export function whisperError(message: string, duration?: number): string {
  return showWhisper({ message, type: 'error', duration });
}

export function whisperCelebration(amount: number, reason?: string, duration?: number): string {
  return showWhisper({
    message: `+${amount} ${reason || 'seeds'}`,
    type: 'celebration',
    amount,
    reason,
    duration,
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * Whisper API - Drop-in replacement for toast
 *
 * @example
 * import { whisper } from './whisper.ui.js';
 *
 * whisper.success('Saved!');
 * whisper.info('Processing...');
 * whisper.warning('Check your input');
 * whisper.error("That didn't work");
 * whisper.celebration(10, 'First conversation!');
 */
export const whisper = {
  show: showWhisper,
  info: whisperInfo,
  success: whisperSuccess,
  warning: whisperWarning,
  error: whisperError,
  celebration: whisperCelebration,
  dismiss: dismissWhisper,
  dismissAll,
};

// ============================================================================
// CLEANUP
// ============================================================================

export function disposeWhisper(): void {
  clearAllTimeouts();
  dismissAll();
  
  if (whisperContainer) {
    whisperContainer.remove();
    whisperContainer = null;
  }
  
  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }
}

// ============================================================================
// TOAST COMPATIBILITY LAYER
// ============================================================================

/**
 * Toast-compatible API for gradual migration.
 * Import this as 'toast' to use whispers with existing toast calls.
 *
 * @example
 * // Instead of: import { toast } from './toast.ui.js';
 * import { toast } from './whisper.ui.js';
 *
 * // Existing code works unchanged:
 * toast.success('Saved!');
 */
export const toast = {
  info: whisperInfo,
  success: whisperSuccess,
  warning: whisperWarning,
  error: whisperError,
  show: (config: { message: string; type?: 'info' | 'success' | 'warning' | 'error'; duration?: number }) => {
    return showWhisper({
      message: config.message,
      type: config.type || 'info',
      duration: config.duration,
    });
  },
  dismiss: dismissWhisper,
  dismissAll,
};

// ============================================================================
// BACKWARD COMPATIBILITY - Toast API aliases
// These provide full compatibility with the old toast.ui.ts API
// ============================================================================

/** Type alias for backward compatibility */
export type ToastType = 'info' | 'success' | 'warning' | 'error';

/** Config alias for backward compatibility */
export interface ToastConfig {
  message: string;
  type?: ToastType;
  duration?: number;
}

/** Get whisper manager (toast manager alias) */
export function getToastManager() {
  return {
    info: whisperInfo,
    success: whisperSuccess,
    warning: whisperWarning,
    error: whisperError,
    show: (config: ToastConfig) => showWhisper({ ...config, type: config.type || 'info' }),
    dismiss: dismissWhisper,
    dismissAll,
  };
}

/** Reset whisper manager (toast manager alias) */
export function resetToastManager(): void {
  disposeWhisper();
}

// Toast convenience functions
export const toastInfo = (message: string) => whisperInfo(message);
export const toastSuccess = (message: string) => whisperSuccess(message);
export const toastWarning = (message: string) => whisperWarning(message);
export const toastError = (message: string) => whisperError(message);

export const showToast = (config: ToastConfig) => showWhisper({ ...config, type: config.type || 'info' });
export const dismissToast = (id: string) => dismissWhisper(id);
export const dismissAllToasts = () => dismissAll();

export default whisper;
