/**
 * Calm boot: with the calm-idle flag on, decorative modules that only matter
 * once a call is running load when the first call starts instead of at boot.
 *
 * Only modules whose every entry point is in-call or self-triggered belong
 * here: nothing on the idle screen may depend on them being initialised.
 */

import { isCalmIdleOn } from '../config/calm-idle.js';
import { appState } from '../state/app.state.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('CalmBoot');

/** Boot module names (as app.ts passes them to deferredInit) loaded on first call. */
export const LOADED_ON_FIRST_CALL: ReadonlySet<string> = new Set([
  // Konami code, idle quirks, sleepy mode and a motion-permission prompt on first tap.
  'EasterEggsUI',
  // Snow and rain around the avatar; only the dev panel triggers it.
  'WeatherEffects',
  // Feedback chips the agent sends during natural pauses in a call.
  'ContextualFeedbackUI',
  // Double-tap the avatar to bookmark a moment of the conversation.
  'BookmarkUI',
]);

const held: Array<() => void> = [];
let unsubscribe: (() => void) | null = null;

function releaseHeld(): void {
  // Unsubscribe after the store finishes notifying: removing a subscriber
  // mid-notify would skip the next one.
  const stop = unsubscribe;
  unsubscribe = null;
  queueMicrotask(() => stop?.());
  const toRun = held.splice(0);
  log.debug({ count: toRun.length }, 'First call: loading held modules');
  toRun.forEach((run) => run());
}

/**
 * Returns true when `name` is held until the first call starts (it will then
 * call `run`); false when the caller should start it now as usual.
 */
export function holdUntilFirstCall(name: string, run: () => void): boolean {
  if (!LOADED_ON_FIRST_CALL.has(name) || !isCalmIdleOn()) return false;
  if (appState.get('connection') !== 'disconnected') return false;
  held.push(run);
  unsubscribe ??= appState.subscribe('connection', (state) => {
    if (state !== 'disconnected') releaseHeld();
  });
  log.debug({ name }, 'Held until the first call');
  return true;
}

/** Modules waiting for the first call (for measurement and tests). */
export function heldModuleCount(): number {
  return held.length;
}
