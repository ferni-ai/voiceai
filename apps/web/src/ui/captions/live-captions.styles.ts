/**
 * Live captions styles, variant C ("refined minimal"): one calm line under
 * Ferni's name, no bubble. Words fade in as they are spoken (opacity only),
 * the caller's words in the secondary colour, a moment as a quiet dotted
 * line beneath. Type is 15-16px at 1.35, never wider than ~38 characters.
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
  display: none; flex-direction: column; align-items: center; gap: var(--space-xs);
  width: 100%; max-width: 38ch; margin: var(--space-sm) auto 0; text-align: center;
  font-family: var(--font-body); font-size: var(--text-base); line-height: 1.35;
}
body[data-connected='true'] .ferni-captions { display: flex; }
/* Captions v2 replaces the one-line pill that sat over the avatar. */
#transcriptContainer { display: none; }
.ferni-captions__viewport {
  /* The slot is reserved while captions are on, so the roster never jumps. */
  /* One line. It stays centred while it fits; past that the newest words
     hold the right edge and the earliest slide out left under a soft fade
     (rtl box, ltr text: auto margins centre, overflow runs leftwards). */
  display: none; direction: rtl; width: 100%; height: 1lh; overflow: hidden;
  font-weight: var(--font-weight-normal); color: var(--color-text-primary);
  border-radius: var(--radius-lg); cursor: pointer;
  transition: opacity ${DURATION.SLOW}ms ${EASING.DECELERATE};
}
.ferni-captions--on .ferni-captions__viewport { display: flex; }
.ferni-captions--overflowing .ferni-captions__viewport {
  -webkit-mask-image: linear-gradient(to right, transparent, black 3ch);
  mask-image: linear-gradient(to right, transparent, black 3ch);
}
.ferni-captions--words-off .ferni-captions__viewport { opacity: 0; pointer-events: none; }
.ferni-captions__viewport:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }
.ferni-caption-line { margin: 0; overflow-wrap: anywhere; }
.ferni-caption-line { flex: none; direction: ltr; white-space: nowrap; margin-inline: auto; }
.ferni-caption-line--settled { display: none; }
.ferni-caption-line[data-speaker='user'] { color: var(--color-text-secondary); }
.ferni-captions__moments {
  display: flex; flex-wrap: wrap; justify-content: center; gap: var(--space-xs);
  margin: 0; padding: 0; list-style: none;
}

.ferni-moment {
  display: inline-block; max-width: 100%;
  font-size: var(--text-sm); line-height: 1.35; color: var(--color-text-secondary);
  white-space: nowrap;
  animation: ferni-moment-in ${DURATION.MODERATE}ms ${EASING.SPRING_GENTLE} both;
  transition: opacity ${DURATION.SLOW}ms ${EASING.DECELERATE};
}
.ferni-moment::before {
  content: ''; display: inline-block; vertical-align: middle; width: var(--space-xs); height: var(--space-xs);
  margin-inline-end: var(--space-sm); border-radius: var(--radius-full); background: var(--persona-primary);
}
.ferni-moment__label {
  margin-inline-end: var(--space-xs); font-weight: var(--font-weight-medium); color: var(--color-text-secondary);
}
.ferni-moment--leaving { opacity: 0; }
@keyframes ferni-moment-in { from { opacity: 0; transform: translateY(var(--space-xs)); } }
.ferni-caption-line:not(.ferni-caption-line--settled) .ferni-caption-words {
  animation: ferni-words-in ${DURATION.DELIBERATE}ms ${EASING.DECELERATE} both;
}
/* Opacity only (animation standard #1037): words surface as they're said. */
@keyframes ferni-words-in { from { opacity: 0; } }
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
