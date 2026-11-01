/**
 * Feeling posture: the body lifts a little for a light feeling and sinks a
 * little for a heavy one (motion T2 "C"). It is an additive transform layer,
 * so it stacks on breathing, the speaking pulse and the spring body instead of
 * replacing them, and the layer exists only while the posture is off zero.
 */

import { gsap } from '../../utils/gsap-setup.js';
import { addTransformLayer, type TransformLayer } from './compositor.js';

const posture = { y: 0 };
let host: Element | null = null;
let layer: TransformLayer | null = null;

function writePosture(): void {
  if (!host) return;
  if (posture.y === 0) {
    layer?.dispose();
    layer = null;
    return;
  }
  layer ??= addTransformLayer(host);
  layer.set(`translateY(${posture.y}px)`);
}

/** Add the move to `liftPx` (negative lifts) to an expression timeline. */
export function tweenFeelingPosture(
  timeline: gsap.core.Timeline,
  body: Element | null,
  liftPx: number,
  motion: { durationS: number; ease: string; atS: number }
): void {
  if (posture.y === liftPx || !body || typeof body.animate !== 'function') return;
  if (host !== body) {
    layer?.dispose();
    layer = null;
    host = body;
  }
  timeline.to(
    posture,
    { y: liftPx, duration: motion.durationS, ease: motion.ease, onUpdate: writePosture },
    motion.atS
  );
}

export function resetFeelingPosture(): void {
  gsap.killTweensOf(posture);
  posture.y = 0;
  layer?.dispose();
  layer = null;
  host = null;
}
