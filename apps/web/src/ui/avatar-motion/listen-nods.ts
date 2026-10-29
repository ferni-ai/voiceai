/**
 * Listen nods: the avatar nods with its own "mm-hmm" and smiles with its own
 * laugh, so the backchannel the caller hears is also seen.
 *
 * Pure logic. The agent (AVATAR_LISTEN_SIGNALS=on) sends:
 * - `backchannel_played { kind: 'backchannel' | 'laugh', wireDelayMs }` when a
 *   live backchannel or laugh clip plays. `wireDelayMs` is how long the clip
 *   takes from play() to the wire, so the nod is scheduled that far ahead and
 *   lands with the sound instead of before it.
 * - `humanization_signal { signalType: 'active_listening_nod', nodType }` at a
 *   caller pause. Nothing on the client nods for it today (the humanization
 *   bridge consumes it without a case), so this module does.
 *
 * At most one nod per MIN_NOD_GAP_MS. Under prefers-reduced-motion nothing
 * moves. Off unless the listenNods switch (config/motion-flags.ts) is on.
 *
 * The app-side wiring (real nod, smile, timers) is app/backchannel-signal.ts.
 *
 * @module ui/avatar-motion/listen-nods
 */

import { isMotionFlagOn } from '../../config/motion-flags.js';

/** Minimum gap between two nods, so a run of cues never reads as bobbing. */
export const MIN_NOD_GAP_MS = 1200;

/** A wire delay beyond this is treated as bad data and clamped. */
export const MAX_WIRE_DELAY_MS = 2000;

export type NodIntensity = 'micro' | 'subtle' | 'visible';

export type ListenCue =
  | { kind: 'backchannel'; delayMs: number }
  | { kind: 'laugh'; delayMs: number }
  | { kind: 'listening_nod'; intensity: NodIntensity };

export interface ListenNodDeps {
  nod: (intensity: NodIntensity) => void;
  smile: () => void;
  reducedMotion: () => boolean;
  now: () => number;
  schedule: (fn: () => void, delayMs: number) => void;
}

export interface ListenNods {
  handle: (cue: ListenCue) => void;
}

export function isListenNodsEnabled(): boolean {
  return isMotionFlagOn('listenNods');
}

function clampDelay(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(MAX_WIRE_DELAY_MS, Math.max(0, Math.round(value)));
}

function nodIntensity(value: unknown): NodIntensity {
  return value === 'subtle' || value === 'visible' ? value : 'micro';
}

/** Read a data message into a listen cue, or null when it is not one. */
export function listenCueFrom(message: unknown): ListenCue | null {
  if (typeof message !== 'object' || message === null) return null;
  const m = message as Record<string, unknown>;
  if (m.type === 'backchannel_played') {
    const delayMs = clampDelay(m.wireDelayMs);
    return m.kind === 'laugh' ? { kind: 'laugh', delayMs } : { kind: 'backchannel', delayMs };
  }
  if (m.type === 'humanization_signal' && m.signalType === 'active_listening_nod') {
    return { kind: 'listening_nod', intensity: nodIntensity(m.nodType) };
  }
  return null;
}

export function createListenNods(deps: ListenNodDeps): ListenNods {
  let lastNodAt = Number.NEGATIVE_INFINITY;

  const nodNow = (intensity: NodIntensity): void => {
    const now = deps.now();
    if (now - lastNodAt < MIN_NOD_GAP_MS) return;
    lastNodAt = now;
    deps.nod(intensity);
  };

  const at = (delayMs: number, fn: () => void): void => {
    if (delayMs > 0) deps.schedule(fn, delayMs);
    else fn();
  };

  return {
    handle(cue) {
      if (deps.reducedMotion()) return;
      switch (cue.kind) {
        case 'backchannel':
          at(cue.delayMs, () => nodNow('subtle'));
          break;
        case 'laugh':
          at(cue.delayMs, deps.smile);
          break;
        case 'listening_nod':
          nodNow(cue.intensity);
          break;
      }
    },
  };
}
