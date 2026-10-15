/**
 * Screen reader regions and duplicate detection for the Moments pill.
 *
 * The container is layout only. It holds two live regions that exist before
 * any pill lands in them, so screen readers announce what is added: a polite
 * status region for everything except errors, and an alert region for errors.
 * Pills carry no role of their own, so no live region sits inside another.
 *
 * @module ui/moments/moment-regions
 */

import type { MomentState, NoticeConfig, WhisperConfig } from './types.js';

export interface MomentRegions {
  status: HTMLElement;
  alert: HTMLElement;
}

type ToastConfig = WhisperConfig | NoticeConfig;

export function createMomentRegions(container: HTMLElement): MomentRegions {
  const status = document.createElement('div');
  status.className = 'moments-region moments-region--status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const alert = document.createElement('div');
  alert.className = 'moments-region moments-region--alert';
  alert.setAttribute('role', 'alert');

  container.append(status, alert);
  return { status, alert };
}

/** Errors interrupt; everything else waits for a pause. */
export function regionFor(regions: MomentRegions, config: ToastConfig): HTMLElement {
  return config.type === 'error' ? regions.alert : regions.status;
}

/** The pill's text, in a span that wraps to two lines before it clamps. */
export function whisperText(message: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'moment-whisper__text';
  span.textContent = message;
  return span;
}

function sameText(a: ToastConfig, b: ToastConfig): boolean {
  const amountA = 'amount' in a ? a.amount : undefined;
  const amountB = 'amount' in b ? b.amount : undefined;
  return a.message === b.message && amountA === amountB;
}

/**
 * The id of a moment with the same text that is showing or queued, so a second
 * "Saved" is dropped instead of shown twice. A pill that is already leaving
 * doesn't count: the same message again should show again.
 */
export function findDuplicateMoment(
  config: ToastConfig,
  active: MomentState | null,
  queue: ReadonlyArray<{ id: string; config: ToastConfig }>
): string | null {
  if (active && active.status !== 'exiting' && 'message' in active.config) {
    if (sameText(active.config as ToastConfig, config)) return active.id;
  }
  return queue.find((entry) => sameText(entry.config, config))?.id ?? null;
}
