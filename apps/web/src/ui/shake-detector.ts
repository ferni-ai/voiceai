/**
 * Shake detection for the shake easter egg (easter-eggs.ui.ts).
 *
 * A shake is the phone's own movement, so gravity must not count. The old
 * check summed |x|+|y|+|z| of `accelerationIncludingGravity` against 15 m/s².
 * Gravity alone sums to 9.8-17.0 depending on how the phone is held, so a
 * phone lying still at a normal hand angle (45° pitch, 20° roll: 15.8) read as
 * shaking on every motion event: the surprise fired about every 500 ms and its
 * chime played every 2 s for the whole session (the "constant chime" on
 * phones, 2026-10-18).
 *
 * Here a hit is the movement alone: `acceleration` (gravity already removed)
 * when the device gives it, else how far the total's magnitude is from 1 g.
 * SHAKE_HITS hits within SHAKE_WINDOW_MS is a shake, and one shake is
 * reported at most once per SHAKE_COOLDOWN_MS.
 *
 * @module ui/shake-detector
 */

/** Standard gravity, m/s². */
export const GRAVITY = 9.81;
/** Movement (gravity removed) that counts as one hit of a shake, m/s². Walking peaks around 3-6. */
export const SHAKE_HIT_MS2 = 12;
/** Hits closer together than this are one hit (events arrive at ~60 Hz). */
export const SHAKE_HIT_GAP_MS = 100;
export const SHAKE_HITS = 5;
export const SHAKE_WINDOW_MS = 2000;
/** At most one surprise (and one chime) per this long, however long the shaking goes on. */
export const SHAKE_COOLDOWN_MS = 30_000;

interface Vec {
  x?: number | null;
  y?: number | null;
  z?: number | null;
}

/** The slice of a DeviceMotionEvent the detector reads. */
export interface MotionSample {
  acceleration?: Vec | null;
  accelerationIncludingGravity?: Vec | null;
}

const magnitude = (v: Vec): number => Math.hypot(v.x ?? 0, v.y ?? 0, v.z ?? 0);

const hasAxes = (v: Vec | null | undefined): v is Vec =>
  !!v && (v.x != null || v.y != null || v.z != null);

/** How hard the phone itself is moving, in m/s², with gravity left out. */
export function movement(sample: MotionSample): number {
  if (hasAxes(sample.acceleration)) return magnitude(sample.acceleration);
  if (hasAxes(sample.accelerationIncludingGravity)) {
    return Math.abs(magnitude(sample.accelerationIncludingGravity) - GRAVITY);
  }
  return 0;
}

export interface ShakeDetector {
  /** Feed one motion event; true when it completes a shake that should be reported. */
  onMotion(sample: MotionSample): boolean;
}

export function createShakeDetector(now: () => number = () => Date.now()): ShakeDetector {
  let hits: number[] = [];
  let lastHitAt = Number.NEGATIVE_INFINITY;
  let lastShakeAt = Number.NEGATIVE_INFINITY;

  return {
    onMotion(sample) {
      if (movement(sample) <= SHAKE_HIT_MS2) return false;
      const t = now();
      if (t - lastHitAt <= SHAKE_HIT_GAP_MS) return false;
      lastHitAt = t;
      hits = hits.filter((h) => t - h < SHAKE_WINDOW_MS);
      hits.push(t);
      if (hits.length < SHAKE_HITS) return false;
      hits = [];
      if (t - lastShakeAt < SHAKE_COOLDOWN_MS) return false;
      lastShakeAt = t;
      return true;
    },
  };
}
