/**
 * In-call gate for the toast region (WCAG 2.2.4 Interruptions).
 *
 * While a voice call is live, only errors and `priority: 'system'` toasts
 * render. Plain info/success/warning feedback is handed to the transcript as a
 * `ferni:inline-feedback` event on window (nothing happens if no one listens).
 * Achievements, notices, cards the reader acts on or closes (action,
 * dismissible, persistent) and anything with `defer: true` are held and shown
 * once the call ends, before the post-call card.
 *
 * "Live" is the app's connection state, the same signal the "don't interrupt
 * the call" feedback fix reads (`appState.get('connection')`). 'reconnecting'
 * still counts as the call.
 *
 * @module ui/overlay/toast-call-gate
 */

import { appState } from '../../state/app.state.js';
import type { ConnectionState } from '../../types/events.js';

/** Defined here so the region imports the gate and not the other way round. */
export type ToastTone = 'info' | 'success' | 'warning' | 'error';

/** The toast options the gate reads (ToastOptions in toast-region.ts satisfies it). */
export interface GatedToast {
  message: string;
  tone?: ToastTone;
  priority?: string;
  kind?: string;
  key?: string;
  defer?: boolean;
  persistent?: boolean;
  dismissible?: boolean;
  action?: unknown;
}

export interface CallSignal {
  isLive(): boolean;
  /** Calls back each time a live call ends; returns an unsubscribe. */
  onCallEnd(callback: () => void): () => void;
}

const LIVE: ReadonlySet<ConnectionState> = new Set<ConnectionState>(['connected', 'reconnecting']);

export const appCallSignal: CallSignal = {
  isLive: () => LIVE.has(appState.get('connection')),
  onCallEnd: (callback) =>
    appState.subscribe('connection', (next, prev) => {
      if (LIVE.has(prev) && !LIVE.has(next)) callback();
    }),
};

/** show now, hand to the transcript, or hold until the call ends. */
export type CallRoute = 'show' | 'inline' | 'defer';

export function routeDuringCall(options: GatedToast): CallRoute {
  if (options.tone === 'error' || options.priority === 'system') return 'show';
  const held =
    options.defer ||
    options.kind === 'achievement' ||
    options.kind === 'notice' ||
    options.persistent ||
    options.dismissible ||
    options.action !== undefined;
  return held ? 'defer' : 'inline';
}

export const INLINE_FEEDBACK_EVENT = 'ferni:inline-feedback';

export interface InlineFeedbackDetail {
  message: string;
  tone: ToastTone;
  /** The toast key, so a "Saving" chip can become "Saved". */
  key?: string;
}

export function emitInlineFeedback(options: GatedToast): void {
  const detail: InlineFeedbackDetail = {
    message: options.message,
    tone: options.tone ?? 'info',
    key: options.key,
  };
  window.dispatchEvent(new CustomEvent(INLINE_FEEDBACK_EVENT, { detail }));
}
