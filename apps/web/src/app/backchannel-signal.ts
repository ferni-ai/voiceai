/**
 * Wires listen nods (ui/avatar-motion/listen-nods.ts) to the real avatar:
 * the EQ micro-nod, a brief 'pleased' lid shape for a laugh, and timers.
 *
 * `observeListenSignal` is called for every data message and never consumes
 * one, so the handlers that already read `humanization_signal` keep running.
 * Off unless localStorage `ferni:listen-nods` is 'true'. With `ferni:spring-body`
 * also on, the nod gives the spring body a small downward kick and the smile a
 * small upward bounce; without it those kicks do nothing.
 *
 * While the crisis face is held (ui/avatar-motion/motion-allowed.ts) the nods
 * stay but only at the gentlest ('micro') amplitude and without the kick, and
 * the laugh smile does not play.
 *
 * @module app/backchannel-signal
 */

import { DURATION } from '../config/animation-constants.js';
import { performMicroNod } from '../eq/index.js';
import {
  createListenNods,
  isListenNodsEnabled,
  listenCueFrom,
  type ListenNods,
} from '../ui/avatar-motion/listen-nods.js';
import { avatarMotionAllowed } from '../ui/avatar-motion/motion-allowed.js';
import { springBody } from '../ui/avatar-motion/spring-body.js';
import { ferniExpressions } from '../ui/ferni-expressions.ui.js';
import { prefersReducedMotion } from '../utils/accessibility.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('BackchannelSignal');

let nods: ListenNods | null = null;

function listenNods(): ListenNods {
  nods ??= createListenNods({
    nod: (intensity) => {
      const full = avatarMotionAllowed('fullNod');
      performMicroNod(full ? intensity : 'micro');
      if (full) springBody.kick('nod'); // no-op unless the spring body runs
    },
    smile: () => {
      if (!avatarMotionAllowed('smile')) return;
      ferniExpressions.setExpression('pleased', DURATION.STANDARD, DURATION.ENTRANCE);
      springBody.kick('laugh');
    },
    reducedMotion: prefersReducedMotion,
    now: () => Date.now(),
    schedule: (fn, delayMs) => {
      setTimeout(fn, delayMs);
    },
  });
  return nods;
}

/** Nod or smile for a listen cue when the flag is on. Never consumes the message. */
export function observeListenSignal(message: unknown): void {
  if (!isListenNodsEnabled()) return;
  const cue = listenCueFrom(message);
  if (!cue) return;
  try {
    listenNods().handle(cue);
  } catch (error) {
    log.warn('Listen nod failed', { cue: cue.kind, error: String(error) });
  }
}

/** Test seam: forget the rate-limit state. */
export function resetListenSignalForTests(): void {
  nods = null;
}
