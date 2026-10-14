/**
 * Reports when the browser refuses to play the agent's audio, so the call UI
 * can offer "Tap to hear Ferni" (ui/tap-to-hear.ui.ts). Services don't import
 * ui/, so the report is a document event.
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('AudioPlayback');

/** Dispatched on document when an agent audio element's play() is refused. */
export const AUDIO_PLAY_BLOCKED_EVENT = 'ferni:audio-play-blocked';

function errorName(error: unknown): string {
  const name =
    typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined;
  return typeof name === 'string' ? name : typeof error;
}

/**
 * Logs a rejected play() with its context and asks for a tap. An AbortError
 * only means a newer load() or pause() interrupted this play, so it asks for nothing.
 */
export function reportPlayRejected(error: unknown, context: Record<string, unknown>): void {
  const name = errorName(error);
  log.warn('Agent audio did not start', { ...context, errorName: name, error: String(error) });
  if (name !== 'AbortError') document.dispatchEvent(new CustomEvent(AUDIO_PLAY_BLOCKED_EVENT));
}
