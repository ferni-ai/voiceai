/**
 * Live captions styles. During a call the captions take the persona's own
 * slot, under the name and above the team roster, in the layout rather than
 * over it. Ferni's words read as a speech bubble from the face; the caller's
 * words use a quieter register. Colours, spacing and type are tokens.
 *
 * @module ui/captions/live-captions.styles
 */

import { DURATION, EASING } from '../../config/animation-constants.js';

const STYLE_ID = 'ferni-captions-styles';

// --leading-* on :root mix unitless numbers with vw inside clamp(), which is
// invalid, so they compute to the inherited 1.6. Captions set plain ratios.
const CSS = `
/* During a call the tagline and plan chip step out and the captions take
   their slot. The AI companion pill (#928) stays. */
body[data-connected='true'] #personaSubtitle,
body[data-connected='true'] #coach .subscription-badge { display: none; }
.ferni-captions {
  --ferni-captions-lines: 2;
  display: none; flex-direction: column; align-items: center; gap: var(--space-xs);
  width: min(34rem, 100%); margin: var(--space-sm) auto; text-align: center;
}
body[data-connected='true'] .ferni-captions { display: flex; }
@media (max-height: 600px) { .ferni-captions { --ferni-captions-lines: 1; } }
/* Captions v2 replaces the one-line pill that sat over the avatar. */
#transcriptContainer { display: none; }
.ferni-captions__viewport {
  /* The slot is reserved while captions are on, so the roster never jumps. */
  display: none; flex-direction: column; align-items: center; gap: var(--space-xs);
  width: 100%; box-sizing: border-box; overflow: hidden;
  height: calc(var(--ferni-captions-lines) * 1lh + var(--space-md) + var(--space-xs));
  padding-top: var(--space-sm);
  font-family: var(--font-body); font-size: var(--text-lg); line-height: 1.3;
  font-weight: var(--font-weight-medium); color: var(--color-text-primary);
  border-radius: var(--radius-lg); cursor: pointer;
  transition: opacity ${DURATION.SLOW}ms ${EASING.DECELERATE};
}
.ferni-captions--on .ferni-captions__viewport { display: flex; }
.ferni-captions--words-off .ferni-captions__viewport { opacity: 0; pointer-events: none; }
.ferni-captions__viewport:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }
.ferni-captions--overflowing .ferni-captions__viewport {
  -webkit-mask-image: linear-gradient(to bottom, transparent, black 0.8lh);
  mask-image: linear-gradient(to bottom, transparent, black 0.8lh);
}
.ferni-caption-line { margin: 0; overflow-wrap: anywhere; }
/* Ferni's words: a soft bubble with a small tail up toward the face. */
.ferni-captions .ferni-caption-line[data-speaker='agent'] {
  position: relative; max-width: 100%; box-sizing: border-box;
  padding: var(--space-2xs) var(--space-md); border-radius: var(--radius-xl);
  background: var(--color-bg-elevated); box-shadow: var(--shadow-sm);
}
.ferni-captions .ferni-caption-line[data-speaker='agent']:first-child::before {
  content: ''; position: absolute; top: calc(-1 * var(--space-xs)); left: 50%;
  width: var(--space-sm); height: var(--space-sm); background: inherit;
  transform: translateX(-50%) rotate(45deg);
}
.ferni-caption-line--settled { color: var(--color-text-secondary); }
.ferni-caption-line[data-speaker='user'] {
  font-size: var(--text-base); font-weight: var(--font-weight-normal); color: var(--color-text-secondary);
}
.ferni-captions__moments {
  display: flex; flex-wrap: wrap; justify-content: center; gap: var(--space-xs);
  margin: 0; padding: 0; list-style: none;
}

.ferni-moment {
  display: inline-block; max-width: 100%;
  padding: var(--space-xs) var(--space-md); border-radius: var(--radius-xl);
  background: var(--color-bg-elevated); box-shadow: var(--shadow-sm);
  border: 1px solid var(--color-border-subtle);
  font-size: var(--text-sm); line-height: 1.25; color: var(--color-text-primary);
  white-space: nowrap;
  animation: ferni-moment-in ${DURATION.SLOW * 2}ms ${EASING.SPRING} both;
  transition: opacity ${DURATION.SLOW}ms ${EASING.DECELERATE};
}
.ferni-moment::before {
  content: ''; display: inline-block; vertical-align: middle; width: var(--space-sm); height: var(--space-sm);
  margin-inline-end: var(--space-sm); border-radius: var(--radius-full); background: var(--persona-primary);
}
.ferni-moment__label {
  margin-inline-end: var(--space-xs); font-weight: var(--font-weight-semibold); color: var(--color-text-secondary);
}
.ferni-moment--leaving { opacity: 0; }
@keyframes ferni-moment-in { from { opacity: 0; transform: translateY(var(--space-xs)) scale(0.96); } }
.ferni-caption-line:not(.ferni-caption-line--settled) .ferni-caption-words {
  animation: ferni-words-in ${DURATION.SLOW * 2}ms ${EASING.DECELERATE} both;
}
@keyframes ferni-words-in { from { opacity: 0; filter: blur(var(--space-2xs)); } }
.ferni-caption-line__name {
  display: inline-flex; align-items: center; gap: var(--space-xs); margin-inline-end: var(--space-sm);
  line-height: var(--leading-snug);
  font-size: var(--text-sm); font-weight: var(--font-weight-semibold); color: var(--color-text-secondary);
}
.ferni-caption-line__name::before {
  content: ''; width: var(--space-sm); height: var(--space-sm); border-radius: var(--radius-full);
  background: var(--persona-primary);
}
.ferni-caption-line[data-speaker='user'] .ferni-caption-line__name::before { background: var(--color-text-muted); }
.engagement-triggers .ferni-captions-toggle--on { color: var(--persona-primary); border-color: var(--persona-primary); }
@media (prefers-reduced-motion: reduce) {
  .ferni-captions__viewport { transition: none; }
  .ferni-caption-line .ferni-caption-words,
  .ferni-moment { animation: none; }
}
`;

export function injectCaptionStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
