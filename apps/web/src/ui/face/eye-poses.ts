/**
 * The eye-acting pose for every expression: which lids, brows and gaze carry
 * each feeling (geometry in ./eye-acting.ts). Joy and surprise also squash and
 * stretch the eye; nothing else does.
 *
 * @module ui/face/eye-poses
 */

import type { DOME_POSES } from './dome-poses.js';
import type { BrowPose, EyePose, LidPose } from './eye-acting.js';

/** Every expression the lids can show (the same names as the dome table). */
export type EyeExpression = keyof typeof DOME_POSES;

const OPEN: LidPose = { top: 0, bottom: 0, arch: 0, tilt: 0, sx: 1, sy: 1 };
const REST: BrowPose = { lift: 0, inner: 0 };

/** A pose with the same lids and brow on both sides. */
function both(lid: Partial<LidPose>, brow: Partial<BrowPose> = {}, gx = 0, gy = 0): EyePose {
  const l = { ...OPEN, ...lid };
  const b = { ...REST, ...brow };
  return { left: l, right: l, brows: { left: b, right: b }, gx, gy, roll: 0 };
}

/** A pose that differs per side (doubt, curiosity, a knowing look). */
function sides(
  left: Partial<LidPose>,
  right: Partial<LidPose>,
  browLeft: Partial<BrowPose>,
  browRight: Partial<BrowPose>,
  look: { gx?: number; gy?: number; roll?: number } = {}
): EyePose {
  return {
    left: { ...OPEN, ...left },
    right: { ...OPEN, ...right },
    brows: { left: { ...REST, ...browLeft }, right: { ...REST, ...browRight } },
    gx: look.gx ?? 0,
    gy: look.gy ?? 0,
    roll: look.roll ?? 0,
  };
}

/**
 * The pose for every expression.
 *
 * The crisis faces (config/crisis-faces.ts: holdingSpace, empathetic,
 * attentive) are calm by rule: no squash, no roll, no asymmetry, a soft
 * slant at most, and brows that never knit or rise in alarm.
 */
export const EYE_POSES = {
  neutral: both({ top: 0.06 }),
  // Joy: the lower lid pushes up, and the eye squashes a little.
  happy: both({ top: 0.04, arch: 0.85, sx: 1.08, sy: 0.9 }, { lift: 1.5 }, 0, -1.5),
  delighted: both({ top: 0.02, arch: 0.9, sx: 1.1, sy: 0.88 }, { lift: 2 }, 0, -1.5),
  celebrating: both({ top: 0, arch: 0.95, sx: 1.1, sy: 0.86 }, { lift: 2.5 }, 0, -2),
  // Surprise: the eye stretches tall, the brows fly up.
  surprised: both({ sx: 0.9, sy: 1.24 }, { lift: 5, inner: 0.5 }, 0, -2),
  excited: both({ arch: 0.3, sx: 0.98, sy: 1.04 }, { lift: 3 }, 0, -1),
  realizing: both({ sy: 1.04 }, { lift: 2.5, inner: 0.4 }, 0, -1),
  curious: sides(
    { top: 0.02, sy: 1.04 },
    { top: 0.26, bottom: 0.1 },
    { lift: 3.2, inner: 0.5 },
    { lift: -0.6, inner: -0.8 },
    { gx: 2, gy: -0.5, roll: 6 }
  ),
  curiousLean: sides(
    { top: 0.04 },
    { top: 0.16, bottom: 0.06 },
    { lift: 2 },
    { lift: 0 },
    { gx: 1.5, roll: 3 }
  ),
  skeptical: sides(
    { top: 0.28, bottom: 0.12 },
    { top: 0.04 },
    { lift: -0.8, inner: -1.2 },
    { lift: 3, inner: 0.4 },
    { gx: 1, roll: -2 }
  ),
  // Worry and sadness: the outer corners drop, the inner brows rise.
  worried: both({ top: 0.2, bottom: 0.06, tilt: 0.75 }, { lift: 1.2, inner: 7 }, 0, 0.5),
  sad: both({ top: 0.3, tilt: 0.55 }, { lift: 0.4, inner: 5 }, 0, 2),
  sleepy: both({ top: 0.5, bottom: 0.1 }, { lift: -0.6 }, 0, 1),
  // Thought: the gaze goes away, one lid lower than the other.
  thinking: sides(
    { top: 0.2, bottom: 0.14, tilt: -0.12 },
    { top: 0.3, bottom: 0.14, tilt: -0.12 },
    { lift: 2, inner: -0.5 },
    { lift: -0.4, inner: -1.4 },
    { gx: -3, gy: -3, roll: -3 }
  ),
  contemplative: both({ top: 0.24, bottom: 0.1 }, { lift: 0.6 }, -2, -1.5),
  processing: sides(
    { top: 0.26, bottom: 0.1 },
    { top: 0.26, bottom: 0.1 },
    { lift: 1 },
    { lift: 0.4, inner: -0.4 },
    { gx: -1.5, gy: -2 }
  ),
  reflecting: both({ top: 0.18, bottom: 0.06 }, { lift: 0.4, inner: 1 }, 0, 0.5),
  noticing: sides(
    { top: 0.02, bottom: 0.04 },
    { top: 0.02, bottom: 0.04 },
    { lift: 1.2 },
    { lift: 0.4 },
    { gx: 1.5 }
  ),
  shifting: both({ top: 0.08 }, {}, -1),
  settling: both({ top: 0.2, arch: 0.2 }, { lift: -0.2 }, 0, 0.5),
  // Crisis faces: calm by rule (see above).
  holdingSpace: both({ top: 0.1, arch: 0.25, tilt: 0.15 }, { lift: 0.2, inner: 1.5 }, 0, 1),
  empathetic: both({ top: 0.1, arch: 0.3, tilt: 0.2 }, { lift: 0.4, inner: 2 }, 0, 0.8),
  attentive: both({ top: 0.03 }, { lift: 0.8, inner: 0.6 }),
  // Listening and presence.
  absorbing: both({ top: 0.22, bottom: 0.08 }, { lift: 0.2, inner: 2.4 }, 0, 1),
  receiving: both({ top: 0.14, arch: 0.3, tilt: 0.12 }, { lift: 0.6, inner: 1.8 }),
  present: both({ top: 0.05 }, { lift: 0.2 }),
  holding: both({ top: 0.18, arch: 0.2, tilt: 0.15 }, { lift: 0.3, inner: 1.6 }),
  accompanying: both({ top: 0.16, arch: 0.25, tilt: 0.2 }, { lift: 0.4, inner: 2 }, 0, 0.6),
  waiting: both({ top: 0.1 }, { lift: 0.8 }, 0, -0.3),
  // Warmth: soft lids, a gentle cheek push.
  warm: both({ top: 0.18, arch: 0.42, tilt: 0.22 }, { lift: 0.6, inner: 2.6 }, 0, 1),
  pleased: both({ top: 0.12, arch: 0.55, tilt: 0.12 }, { lift: 1, inner: 1 }),
  proud: both({ top: 0.06, arch: 0.7 }, { lift: 1.6, inner: 0.6 }, 0, -0.5),
  encouraging: both({ top: 0.08, arch: 0.5 }, { lift: 1.4, inner: 1 }),
  challenging: both({ top: 0.14, bottom: 0.06 }, { lift: -0.4, inner: -0.8 }),
  recognizing: both({ top: 0.1, arch: 0.6, tilt: 0.1 }, { lift: 1.2, inner: 1.2 }),
  remembering: both({ top: 0.16, arch: 0.4 }, { lift: 1, inner: 0.8 }, -1.5, -1.5),
  reconnecting: both({ top: 0.04, arch: 0.7 }, { lift: 2, inner: 0.6 }, 0, -1),
  insider: sides(
    { top: 0.1, arch: 0.6 },
    { top: 0.28, arch: 0.6 },
    { lift: 1.5 },
    { lift: 0.2 },
    { roll: 3 }
  ),
  growing: both({ top: 0.06, arch: 0.65 }, { lift: 1.4, inner: 1 }),
  farewell: both({ top: 0.2, arch: 0.5, tilt: 0.35 }, { lift: 0.5, inner: 3 }, 0, 0.8),
} as const satisfies Readonly<Record<EyeExpression, EyePose>>;
