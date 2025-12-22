/**
 * Toast Notification UI
 *
 * Small, cute, centered pill toasts that feel like gentle whispers
 * rather than interruptions. Inspired by iOS/macOS subtle notifications.
 *
 * DESIGN PHILOSOPHY:
 * - Centered at bottom (not a corner)
 * - Pill-shaped, compact
 * - Single line, no icons
 * - Quick in, quick out
 * - Unobtrusive but noticeable
 *
 * @module @ferni/toast
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { getHapticsService } from '../services/haptics.service.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

const log = createLogger('ToastUI');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastConfig {
  type?: ToastType;
  message: string;
  duration?: number; // ms, default 2500
}

interface ActiveToast {
  id: string;
  element: HTMLElement;
  timeout?: ReturnType<typeof setTimeout>;
}

// ============================================================================
// TYPE COLORS - Subtle, brand-aligned
// ============================================================================

const TYPE_COLORS: Record<ToastType, { bg: string; text: string }> = {
  info: {
    bg: 'var(--persona-primary, #4a6741)',
    text: 'white',
  },
  success: {
    bg: 'var(--persona-primary, #4a6741)',
    text: 'white',
  },
  warning: {
    bg: 'var(--color-warning, #b8956a)',
    text: 'white',
  },
  error: {
    bg: 'var(--color-destructive, #a65a52)',
    text: 'white',
  },
};

// ============================================================================
// TOAST MANAGER - Simple & Clean
// ============================================================================

export class ToastManager {
  private activeToast: ActiveToast | null = null;
  private queue: ToastConfig[] = [];
  private idCounter: number = 0;
  private haptics = getHapticsService();
  private styleElement: HTMLStyleElement | null = null;

  constructor() {
    this.cleanupOrphanedElements();
    this.injectStyles();
    log.debug('ToastManager initialized');
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  private cleanupOrphanedElements(): void {
    document.querySelectorAll('.ferni-toast').forEach((el) => el.remove());
  }

  // ==========================================================================
  // STYLES
  // ==========================================================================

  private injectStyles(): void {
    if (document.getElementById('ferni-toast-styles')) return;

    this.styleElement = document.createElement('style');
    this.styleElement.id = 'ferni-toast-styles';
    this.styleElement.textContent = `
      @keyframes toast-in {
        from {
          opacity: 0;
          transform: translateX(-50%) translateY(20px) scale(0.9);
        }
        to {
          opacity: 1;
          transform: translateX(-50%) translateY(0) scale(1);
        }
      }
      
      @keyframes toast-out {
        from {
          opacity: 1;
          transform: translateX(-50%) translateY(0) scale(1);
        }
        to {
          opacity: 0;
          transform: translateX(-50%) translateY(-10px) scale(0.95);
        }
      }
    `;
    document.head.appendChild(this.styleElement);
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Show a toast notification
   */
  show(config: ToastConfig): string {
    // If there's already a toast, queue this one
    if (this.activeToast) {
      this.queue.push(config);
      return `queued-${this.idCounter}`;
    }

    return this.displayToast(config);
  }

  private displayToast(config: ToastConfig): string {
    const id = `toast-${++this.idCounter}`;
    const type = config.type || 'info';
    const colors = TYPE_COLORS[type];

    // Remove any existing toasts
    this.cleanupOrphanedElements();

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `ferni-toast ferni-toast--${type}`;
    toast.textContent = config.message;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');

    Object.assign(toast.style, {
      position: 'fixed',
      // Responsive bottom: uses CSS calc with safe area for notched devices
      // Mobile: closer to bottom, Desktop: more breathing room
      bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
      left: '50%',
      transform: 'translateX(-50%)',
      background: colors.bg,
      color: colors.text,
      // Explicit small values - cute & compact
      padding: '6px 14px',
      borderRadius: '100px',
      fontSize: 'clamp(11px, 2.5vw, 13px)', // Responsive font size
      fontFamily: 'var(--font-body, system-ui)',
      fontWeight: '500',
      letterSpacing: '0.01em',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
      zIndex: 'var(--z-tooltip)',
      animation: `toast-in ${DURATION.SLOW}ms ${EASING.SPRING}`,
      whiteSpace: 'nowrap',
      maxWidth: 'calc(100vw - 48px)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    });

    document.body.appendChild(toast);

    // Haptic feedback
    this.playHaptic(type);

    // Auto dismiss
    const duration = config.duration ?? 2500;
    const timeout = trackedTimeout(() => this.dismiss(id), duration);

    // Track toast
    this.activeToast = { id, element: toast, timeout };

    log.debug('Toast shown', { id, type, message: config.message });

    return id;
  }

  /**
   * Dismiss the active toast
   */
  dismiss(id: string): void {
    if (!this.activeToast || this.activeToast.id !== id) return;

    const { element, timeout } = this.activeToast;

    // Clear timeout
    if (timeout) clearTimeout(timeout);

    // Animate out
    element.style.animation = `toast-out ${DURATION.NORMAL}ms ${EASING.STANDARD} forwards`;

    trackedTimeout(() => {
      element.remove();
      this.activeToast = null;

      // Show next in queue
      if (this.queue.length > 0) {
        const next = this.queue.shift()!;
        this.displayToast(next);
      }
    }, DURATION.NORMAL);

    log.debug('Toast dismissed', { id });
  }

  /**
   * Dismiss all toasts and clear queue
   */
  dismissAll(): void {
    this.queue = [];
    if (this.activeToast) {
      this.dismiss(this.activeToast.id);
    }
  }

  /**
   * Quick toast helpers
   */
  info(message: string): string {
    return this.show({ type: 'info', message });
  }

  success(message: string): string {
    return this.show({ type: 'success', message });
  }

  warning(message: string): string {
    return this.show({ type: 'warning', message });
  }

  error(message: string): string {
    return this.show({ type: 'error', message, duration: 4000 });
  }

  // ==========================================================================
  // HAPTICS
  // ==========================================================================

  private playHaptic(type: ToastType): void {
    switch (type) {
      case 'success':
        this.haptics.play('success');
        break;
      case 'error':
        this.haptics.play('error');
        break;
      case 'warning':
        this.haptics.play('notification');
        break;
      default:
        this.haptics.play('softTap');
    }
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  destroy(): void {
    this.dismissAll();
    this.styleElement?.remove();
    log.debug('ToastManager destroyed');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let toastManagerInstance: ToastManager | null = null;

export function getToastManager(): ToastManager {
  if (!toastManagerInstance) {
    toastManagerInstance = new ToastManager();
  }
  return toastManagerInstance;
}

export function resetToastManager(): void {
  if (toastManagerInstance) {
    toastManagerInstance.destroy();
  }
  toastManagerInstance = null;
}

// ============================================================================
// CONVENIENCE EXPORTS - Simple API
// ============================================================================

export const toastInfo = (message: string) => getToastManager().info(message);
export const toastSuccess = (message: string) => getToastManager().success(message);
export const toastWarning = (message: string) => getToastManager().warning(message);
export const toastError = (message: string) => getToastManager().error(message);

export const showToast = (config: ToastConfig) => getToastManager().show(config);
export const dismissToast = (id: string) => getToastManager().dismiss(id);
export const dismissAllToasts = () => getToastManager().dismissAll();

// Simple object API
export const toast = {
  info: toastInfo,
  success: toastSuccess,
  warning: toastWarning,
  error: toastError,
  show: showToast,
  dismiss: dismissToast,
  dismissAll: dismissAllToasts,
};

// Expose on window for testing in dev
if (typeof window !== 'undefined') {
  (window as unknown as { ferniToast: typeof toast }).ferniToast = toast;
}
