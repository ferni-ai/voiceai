/**
 * Live captions styles, variant A: a small speech bubble beside Ferni.
 * Calm type (15-16px at 1.35, ~38 characters wide), a light translucent
 * material with a hairline edge, a vector tail, spacing on the 4/8 grid.
 * Colours, spacing, radii, blur and type are tokens; motion is transform
 * and opacity only.
 *
 * @module ui/captions/live-captions.styles
 */

import { DURATION, EASING } from '../../config/animation-constants.js';

const STYLE_ID = 'ferni-captions-styles';

// --leading-* on :root mix unitless numbers with vw inside clamp(), which is
// invalid, so they compute to the inherited 1.6. Captions set plain ratios.
const CSS = `
/* Captions v2 replaces the one-line pill that sat over the avatar. */
#transcriptContainer { display: none; }
.ferni-bubble {
  --bubble-fill: color-mix(in srgb, var(--color-bg-elevated) 86%, transparent);
  --bubble-edge: var(--color-border-subtle);
  position: absolute; left: var(--bubble-x, 0); top: var(--bubble-y, 0); z-index: var(--z-raised);
  display: none; flex-direction: column; gap: var(--space-sm);
  box-sizing: border-box; width: max-content;
  max-width: min(var(--bubble-max, 100%), calc(38ch + 2 * var(--space-md)));
  padding: var(--space-sm) calc(var(--space-sm) + var(--space-xs));
  font-family: var(--font-body); font-size: var(--text-base); line-height: 1.35;
  text-align: start; transform-origin: 0 var(--space-md);
  opacity: 0; pointer-events: none;
  transition: opacity ${DURATION.SLOW}ms ${EASING.DECELERATE};
}
body[data-connected='true'] .ferni-bubble { display: flex; }
.ferni-bubble.ferni-captions--visible { opacity: 1; pointer-events: auto; }
/* Portrait phones: in the flow under the avatar, nudged right, tail up. */
.ferni-bubble[data-mode='below'] {
  position: relative; left: auto; top: auto; align-self: center;
  margin: var(--space-sm) 0 0 var(--space-xl); transform-origin: 28% 0;
}
.ferni-bubble__bg {
  position: absolute; inset: 0; z-index: -1; border-radius: var(--radius-lg);
  background: var(--bubble-fill); border: 1px solid var(--bubble-edge);
  -webkit-backdrop-filter: blur(var(--glass-blur-regular)); backdrop-filter: blur(var(--glass-blur-regular));
  box-shadow: var(--shadow-sm); transform-origin: 0 var(--space-md);
}
.ferni-bubble__tail {
  position: absolute; left: calc(-1 * var(--space-sm) - var(--space-xs) + 1px); top: var(--space-sm);
  width: calc(var(--space-sm) + var(--space-xs)); height: var(--space-md); overflow: visible;
  transition: opacity ${DURATION.NORMAL}ms ${EASING.DECELERATE};
}
.ferni-bubble[data-mode='below'] .ferni-bubble__tail {
  /* Rotated a quarter turn its base (bottom 2px of the 16px box after the
     turn) meets the bubble's top edge, overlapping the hairline by 1px. */
  left: 28%; top: calc(-1 * var(--space-md) + var(--space-2xs) + 1px); transform: rotate(90deg);
}
.ferni-bubble__tail-fill { fill: var(--bubble-fill); }
.ferni-bubble__tail-edge { fill: none; stroke: var(--bubble-edge); stroke-width: 1; vector-effect: non-scaling-stroke; }
/* The caller's words: same bubble, quieter, no tail (it isn't Ferni talking). */
.ferni-bubble[data-speaker='user'] .ferni-bubble__tail { opacity: 0; }
.ferni-bubble[data-speaker='user'] .ferni-caption-line { color: var(--color-text-secondary); }
.ferni-captions__viewport {
  display: none; max-height: 2lh; overflow: hidden;
  color: var(--color-text-primary); font-weight: var(--font-weight-normal);
  border-radius: var(--radius-sm); cursor: pointer;
}
.ferni-captions--on .ferni-captions__viewport { display: block; }
.ferni-captions--words-off .ferni-captions__viewport { display: none; }
.ferni-captions__viewport:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }
.ferni-captions--overflowing .ferni-captions__viewport {
  -webkit-mask-image: linear-gradient(to bottom, transparent, black 0.8lh);
  mask-image: linear-gradient(to bottom, transparent, black 0.8lh);
}
.ferni-caption-line { margin: 0; overflow-wrap: anywhere; text-wrap: pretty; }
.ferni-caption-line .ferni-caption-words {
  animation: ferni-words-in ${DURATION.DELIBERATE}ms ${EASING.DECELERATE} both;
}
@keyframes ferni-words-in { from { opacity: 0; } }
/* Moments sit inside the bubble, under the words, after a hairline. */
.ferni-captions__moments { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
.ferni-captions__moments:empty { display: none; }
.ferni-captions--on:not(.ferni-captions--words-off) .ferni-captions__moments:not(:empty) {
  padding-top: var(--space-sm); border-top: 1px solid var(--bubble-edge);
}
.ferni-moment {
  display: block; max-width: 100%; white-space: nowrap;
  font-size: var(--text-sm); line-height: 1.35; color: var(--color-text-secondary);
  animation: ferni-moment-in ${DURATION.MODERATE}ms ${EASING.SPRING_GENTLE} both;
  transition: opacity ${DURATION.SLOW}ms ${EASING.DECELERATE};
}
.ferni-moment::before {
  content: ''; display: inline-block; vertical-align: middle; width: var(--space-xs); height: var(--space-xs);
  margin-inline-end: var(--space-sm); border-radius: var(--radius-full); background: var(--persona-primary);
}
.ferni-moment__label { margin-inline-end: var(--space-xs); font-weight: var(--font-weight-medium); }
.ferni-moment__text { color: var(--color-text-primary); }
.ferni-moment--leaving { opacity: 0; }
@keyframes ferni-moment-in { from { opacity: 0; transform: translateY(var(--space-xs)); } }
/* Names, used in the conversation sheet. */
.ferni-caption-line__name {
  display: inline-flex; align-items: center; gap: var(--space-xs); margin-inline-end: var(--space-sm);
  font-size: var(--text-sm); font-weight: var(--font-weight-semibold); color: var(--color-text-secondary);
}
.ferni-caption-line__name::before {
  content: ''; width: var(--space-sm); height: var(--space-sm); border-radius: var(--radius-full);
  background: var(--persona-primary);
}
.ferni-caption-line[data-speaker='user'] .ferni-caption-line__name::before { background: var(--color-text-muted); }
.engagement-triggers .ferni-captions-toggle--on { color: var(--persona-primary); border-color: var(--persona-primary); }
@media (prefers-reduced-motion: reduce) {
  .ferni-bubble, .ferni-bubble__tail { transition: none; }
  .ferni-caption-line .ferni-caption-words, .ferni-moment { animation: none; }
}
`;

export function injectCaptionStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
