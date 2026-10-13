/**
 * Avatar glow pulse: the "heartbeat" under the breathing.
 *
 * It used to be an infinite WAAPI `filter: brightness() saturate()` loop on
 * #coachAvatar. A filter animation repaints the whole avatar every frame, on
 * the main thread, forever at idle. Now a white `soft-light` layer over the
 * avatar fades in and out: only its opacity animates, which the compositor
 * runs without the main thread. Measured on the idle avatar, the peak lifts
 * brightness as much as the old filter did; it adds no saturation (the old
 * peak added 8%).
 *
 * @module ui/avatar-motion/glow-layer
 */

import { EASING, safeAnimate } from '../../config/animation-constants.js';

const LAYER_CLASS = 'avatar-glow-layer';
const STYLE_ID = 'avatar-glow-layer-styles';

export const AVATAR_GLOW_LAYER_CSS = `
.${LAYER_CLASS} {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: white;
  mix-blend-mode: soft-light;
  opacity: 0;
  pointer-events: none;
  z-index: var(--z-docked);
}
`;

/** Opacity per keyframe offset: the old filter curve's shape. */
const GLOW_KEYFRAMES: Keyframe[] = [
  { opacity: 0, offset: 0 },
  { opacity: 0.04, offset: 0.4 },
  { opacity: 0.065, offset: 0.5 },
  { opacity: 0.027, offset: 0.7 },
  { opacity: 0, offset: 1 },
];

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = AVATAR_GLOW_LAYER_CSS;
  document.head.appendChild(style);
}

/** The glow layer inside `avatar`, created on first use. */
export function avatarGlowLayer(avatar: HTMLElement): HTMLElement {
  const existing = avatar.querySelector<HTMLElement>(`:scope > .${LAYER_CLASS}`);
  if (existing) return existing;
  ensureStyles();
  const layer = document.createElement('div');
  layer.className = LAYER_CLASS;
  layer.setAttribute('aria-hidden', 'true');
  avatar.appendChild(layer);
  return layer;
}

/** Start the infinite glow pulse; the caller owns (pauses, cancels) the animation. */
export function startAvatarGlowPulse(avatar: HTMLElement, duration: number): Animation {
  return safeAnimate(avatarGlowLayer(avatar), GLOW_KEYFRAMES, {
    duration,
    iterations: Infinity,
    easing: EASING.GENTLE,
    fill: 'both',
  });
}
