/**
 * Toast UI - Avatar-Based Feedback (No Text)
 *
 * The avatar IS the notification system.
 * All feedback is communicated through avatar behavior.
 * 
 * Text toasts are deprecated - use avatar animations instead.
 * This module now routes all toast calls through avatarFeedback.
 */

import type { MessageType } from '../types/events.js';
import { avatarFeedback } from './avatar-feedback.ui.js';

// ============================================================================
// TYPES
// ============================================================================

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

export interface ToastOptions {
  title: string;
  type?: ToastType;
  duration?: number;
  id?: string;
}

interface ActiveToast {
  id: string;
  timeoutId?: ReturnType<typeof setTimeout>;
  wasThinking: boolean; // Track if thinking was active when this toast started
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_DURATION = 4000;

// NOTE: Icons and colors removed - avatar feedback is visual, not text-based

// ============================================================================
// STATE
// ============================================================================

let ariaLiveRegion: HTMLElement | null = null;

let activeToast: ActiveToast | null = null;
let toastCounter = 0;

// NOTE: Original content storage removed - avatar feedback doesn't use thinking pill

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initToastUI(): void {
  // Initialize avatar feedback system
  avatarFeedback.init();

  createAriaLiveRegion();
}

function createAriaLiveRegion(): void {
  ariaLiveRegion = document.getElementById('toast-aria-live');

  if (!ariaLiveRegion) {
    ariaLiveRegion = document.createElement('div');
    ariaLiveRegion.id = 'toast-aria-live';
    ariaLiveRegion.className = 'sr-only';
    ariaLiveRegion.setAttribute('aria-live', 'polite');
    ariaLiveRegion.setAttribute('aria-atomic', 'true');
    ariaLiveRegion.style.cssText = `
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    `;
    document.body.appendChild(ariaLiveRegion);
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show feedback through avatar behavior with optional whisper text.
 * Routes to avatarFeedback for visual communication.
 * 
 * 🆕 Now shows a subtle whisper message near the avatar for context.
 * This feels more human - like the avatar is briefly speaking its state.
 * 
 * 🐛 FIX: Properly handles all message types including loading whispers.
 */
export function toast(options: ToastOptions | string): string {
  const opts: ToastOptions = typeof options === 'string'
    ? { title: options }
    : options;

  const id = opts.id ?? `toast-${++toastCounter}`;
  const type = opts.type ?? 'info';
  const message = opts.title || undefined; // Message for whisper (undefined = no whisper)
  const duration = opts.duration;

  // Route to avatar feedback - with optional whisper text
  switch (type) {
    case 'success':
      avatarFeedback.success(message);
      break;
    case 'error':
      avatarFeedback.error(message);
      break;
    case 'warning':
      avatarFeedback.warning(message);
      break;
    case 'loading':
      avatarFeedback.thinking();
      // 🐛 FIX: Loading states CAN show whisper - just stays visible until dismissed
      if (message) {
        avatarFeedback.whisper(message, 'info', 0); // 0 = stay visible
      }
      break;
    default:
      avatarFeedback.info(message);
  }

  // Announce to screen readers (accessibility still matters)
  announceToast(opts.title, type);

  // Store for tracking (minimal state)
  activeToast = { id, wasThinking: type === 'loading' };
  
  // Schedule auto-dismissal if duration is set and > 0
  if (duration && duration > 0) {
    activeToast.timeoutId = setTimeout(() => {
      dismiss(id);
    }, duration);
  }

  return id;
}

/**
 * Convenience methods
 */
export const toastSuccess = (title: string, options?: Partial<ToastOptions>) =>
  toast({ ...options, title, type: 'success' });

export const toastError = (title: string, options?: Partial<ToastOptions>) =>
  toast({ ...options, title, type: 'error', duration: options?.duration ?? 6000 });

export const toastWarning = (title: string, options?: Partial<ToastOptions>) =>
  toast({ ...options, title, type: 'warning' });

export const toastInfo = (title: string, options?: Partial<ToastOptions>) =>
  toast({ ...options, title, type: 'info' });

export const toastLoading = (title: string, options?: Partial<ToastOptions>) =>
  toast({ ...options, title, type: 'loading', duration: 0 });

/**
 * Dismiss the active toast (stop any loading animations and hide whisper).
 */
export function dismiss(id?: string): void {
  if (!activeToast || (id && activeToast.id !== id)) return;

  // Clear timeout
  if (activeToast.timeoutId) {
    clearTimeout(activeToast.timeoutId);
  }

  // Stop any thinking/loading animations
  avatarFeedback.stopThinking();
  
  // 🐛 FIX: Also hide any active whisper
  avatarFeedback.hideWhisper();

  activeToast = null;
}

/**
 * Dismiss all (same as dismiss since only one toast at a time)
 */
export function dismissAll(): void {
  dismiss();
}

/**
 * Update an existing toast (trigger new feedback with optional whisper).
 * 🐛 FIX: Now properly passes message to feedback functions for whisper display.
 */
export function update(id: string, options: Partial<ToastOptions>): void {
  if (!activeToast || activeToast.id !== id) return;

  const message = options.title || undefined;

  // Trigger new feedback based on updated type (with whisper message)
  if (options.type) {
    switch (options.type) {
      case 'success':
        avatarFeedback.stopThinking();
        avatarFeedback.success(message);
        break;
      case 'error':
        avatarFeedback.stopThinking();
        avatarFeedback.error(message);
        break;
      case 'warning':
        avatarFeedback.stopThinking();
        avatarFeedback.warning(message);
        break;
      case 'loading':
        avatarFeedback.thinking();
        // Loading shows thinking animation, whisper handled separately if needed
        if (message) {
          avatarFeedback.whisper(message, 'info', 0); // 0 = stay visible
        }
        break;
      default:
        avatarFeedback.stopThinking();
        avatarFeedback.info(message);
    }
  }

  // Announce update to screen readers
  if (options.title && options.type) {
    announceToast(options.title, options.type);
  }

  // Schedule dismissal if duration specified
  if (options.duration !== undefined && options.duration > 0) {
    if (activeToast.timeoutId) {
      clearTimeout(activeToast.timeoutId);
    }
    activeToast.timeoutId = setTimeout(() => {
      dismiss(id);
    }, options.duration);
  }
}

/**
 * Promise-based toast.
 */
export async function promise<T>(
  promiseFn: Promise<T>,
  options: {
    loading: string;
    success: string | ((data: T) => string);
    error: string | ((err: unknown) => string);
  }
): Promise<T> {
  const id = toastLoading(options.loading);

  try {
    const result = await promiseFn;
    const successMessage = typeof options.success === 'function'
      ? options.success(result)
      : options.success;
    update(id, { title: successMessage, type: 'success', duration: DEFAULT_DURATION });
    return result;
  } catch (err) {
    const errorMessage = typeof options.error === 'function'
      ? options.error(err)
      : options.error;
    update(id, { title: errorMessage, type: 'error', duration: 6000 });
    throw err;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function announceToast(title: string, type: ToastType): void {
  if (!ariaLiveRegion) return;

  const prefix = type === 'error' ? 'Error: '
    : type === 'success' ? 'Success: '
    : type === 'warning' ? 'Warning: '
    : '';

  ariaLiveRegion.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  ariaLiveRegion.textContent = `${prefix}${title}`;
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  dismissAll();
  ariaLiveRegion?.remove();
  ariaLiveRegion = null;
}

// ============================================================================
// LEGACY COMPATIBILITY
// ============================================================================

export function showMessage(
  text: string,
  type: MessageType = 'info',
  duration: number = DEFAULT_DURATION
): string {
  const toastType: ToastType = type === 'error' ? 'error'
    : type === 'success' ? 'success'
    : 'info';

  return toast({ title: text, type: toastType, duration });
}

export function clearMessage(): void {
  dismiss();
}

// ============================================================================
// EXPORTS
// ============================================================================

export const toastUI = {
  init: initToastUI,
  toast,
  success: toastSuccess,
  error: toastError,
  warning: toastWarning,
  info: toastInfo,
  loading: toastLoading,
  dismiss,
  dismissAll,
  update,
  promise,
  dispose,
  showMessage,
  clearMessage,
};

export default toastUI;
