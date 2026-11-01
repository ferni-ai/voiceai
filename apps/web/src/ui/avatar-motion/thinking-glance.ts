/**
 * Thinking glance: Ferni glances away while he thinks, mid-call.
 *
 * Behind the thinkingGlance switch (config/motion-flags.ts, off by default). It follows
 * the turn driver's settled turns (the `ferni:avatar-turn` window event): a
 * `thinking` turn starts the glance, and the next other turn ends it.
 *
 * It deliberately does not follow `ferni:thinking`. That event is sent only
 * by dispatchThinking for the connection's connecting/connected states, and
 * while connecting the arrival keeps Ferni resting. The old avatar-soul
 * listener read `detail.isThinking` from it, which nothing sends, so the
 * glance never ran at all.
 *
 * @module ui/avatar-motion/thinking-glance
 */

import { isMotionFlagOn } from '../../config/motion-flags.js';

/** Window event fired once per settled turn change, detail `{ speaker }` (turn-driver.ts). */
export const AVATAR_TURN_EVENT = 'ferni:avatar-turn';

export function isThinkingGlanceEnabled(): boolean {
  return isMotionFlagOn('thinkingGlance');
}

function speakerOf(event: Event): unknown {
  return event instanceof CustomEvent && typeof event.detail === 'object' && event.detail !== null
    ? (event.detail as { speaker?: unknown }).speaker
    : undefined;
}

/**
 * Call `start` when a thinking turn settles and `end` when the next turn
 * replaces it. Does nothing (and returns a no-op) with the flag off.
 */
export function onThinkingTurns(start: () => void, end: () => void): () => void {
  if (!isThinkingGlanceEnabled()) return () => undefined;
  let thinking = false;
  const onTurn = (event: Event): void => {
    const speaker = speakerOf(event);
    if (speaker === undefined) return;
    if (speaker === 'thinking' && !thinking) {
      thinking = true;
      start();
    } else if (speaker !== 'thinking' && thinking) {
      thinking = false;
      end();
    }
  };
  window.addEventListener(AVATAR_TURN_EVENT, onTurn);
  return () => window.removeEventListener(AVATAR_TURN_EVENT, onTurn);
}
