/**
 * Whisper / toast API, delegating to the Moments system.
 *
 * This module used to render its own toasts: a translucent dark pill at the
 * same spot as Moments whispers, one stacking level above them. With both
 * systems live, toasts overlapped each other and the avatar subtitle, and the
 * pill took the theme's text color, which is dark brown in the light theme,
 * so its text was unreadable. Every call now goes through the Moments
 * manager, which owns one queue, one position and the solid, themed styles.
 *
 * The exports are unchanged so the ~65 existing call sites keep working.
 *
 * @module ui/whisper
 */

import { moments, resetMomentsManager } from './moments/index.js';

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

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastConfig {
  message: string;
  type?: ToastType;
  duration?: number;
}

// ============================================================================
// CORE
// ============================================================================

/** Show a whisper. Returns its id; Moments queues it if another is showing. */
export function showWhisper(config: WhisperConfig): string {
  if (config.type === 'celebration') {
    return moments.notice(config.reason ?? config.message, {
      type: 'seeds',
      amount: config.amount,
      duration: config.duration,
    });
  }
  return moments.whisper(config.message, { type: config.type ?? 'info', duration: config.duration });
}

export function dismissWhisper(id?: string): void {
  moments.dismiss(id);
}

export function dismissAll(): void {
  moments.dismissAll();
}

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
  return showWhisper({ message: `+${amount} ${reason ?? 'seeds'}`, type: 'celebration', amount, reason, duration });
}

export function disposeWhisper(): void {
  resetMomentsManager();
}

// ============================================================================
// PUBLIC APIS
// ============================================================================

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

export const showToast = (config: ToastConfig) => showWhisper({ ...config, type: config.type ?? 'info' });

/** Toast-shaped API used by most call sites. */
export const toast = {
  info: whisperInfo,
  success: whisperSuccess,
  warning: whisperWarning,
  error: whisperError,
  show: showToast,
  dismiss: dismissWhisper,
  dismissAll,
};

export function getToastManager() {
  return toast;
}

export function resetToastManager(): void {
  disposeWhisper();
}

export const toastInfo = (message: string) => whisperInfo(message);
export const toastSuccess = (message: string) => whisperSuccess(message);
export const toastWarning = (message: string) => whisperWarning(message);
export const toastError = (message: string) => whisperError(message);
export const dismissToast = (id: string) => dismissWhisper(id);
export const dismissAllToasts = () => dismissAll();

export default whisper;
