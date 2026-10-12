/**
 * Live captions styles. No panel: Ferni's words sit in the open space between
 * the persona and the controls, centred, and fade in as they are spoken. The
 * user's words use a quieter register (smaller, secondary colour), so the
 * speaker shows without labels. Colours, spacing, type and z-index are tokens.
 *
 * @module ui/captions/live-captions.styles
 */

import { DURATION, EASING } from '../../config/animation-constants.js';

const STYLE_ID = 'ferni-captions-styles';

/** On <body> for the whole call while captions are on; the picker yields to them. */
export const CAPTIONS_CALL_CLASS = 'ferni-captions-call';

const CSS = `
.ferni-captions {
  position: fixed; left: 50%; bottom: var(--ferni-captions-bottom, var(--space-xl));
  z-index: var(--z-sticky);
  display: flex; flex-direction: column; overflow: hidden;
  width: min(38rem, calc(100% - 2 * var(--space-md)));
  max-height: var(--ferni-captions-room, 100vh);
  padding: var(--space-xs) var(--space-md);
  text-align: center;
  opacity: 0; pointer-events: none; transform: translate(-50%, var(--space-sm));
  transition: opacity ${DURATION.SLOW}ms ${EASING.DECELERATE},
    transform ${DURATION.SLOW}ms ${EASING.DECELERATE};
}
.ferni-captions--visible { opacity: 1; pointer-events: auto; transform: translate(-50%, 0); }
.ferni-captions--no-room { visibility: hidden; }
/* Captions v2 replaces the one-line pill that sat over the avatar. */
#transcriptContainer { display: none; }
.ferni-captions__viewport {
  /* Whole lines: layout() sets how many fit clear of the avatar (max 2). */
  flex: none; max-height: calc(var(--ferni-captions-lines, 2) * 1lh); overflow: hidden;
  font-family: var(--font-body); font-size: var(--text-xl); line-height: var(--leading-snug);
  font-weight: var(--font-weight-medium); color: var(--color-text-primary);
  border-radius: var(--radius-lg); cursor: pointer;
}
.ferni-captions__viewport:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }
.ferni-captions--overflowing .ferni-captions__viewport {
  -webkit-mask-image: linear-gradient(to bottom, transparent, black 0.8lh);
  mask-image: linear-gradient(to bottom, transparent, black 0.8lh);
}
.ferni-caption-line { margin: 0; overflow-wrap: anywhere; }
.ferni-caption-line--settled { color: var(--color-text-secondary); }
.ferni-caption-line[data-speaker='user'] {
  font-size: var(--text-lg); font-weight: var(--font-weight-normal); color: var(--color-text-secondary);
}
.ferni-caption-line.ferni-caption-note {
  margin-top: var(--space-2xs); font-size: var(--text-sm); color: var(--color-text-secondary);
}
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
/* In a call with captions on, the persona picker yields its row to them, and
   the page keeps room for two caption lines above the waveform (the region is
   fixed, so nothing else in the layout would leave a gap). The picker leaves
   at once, inside the avatar's own connect transition: a fade would hold its
   row (and put captions over it) until the fade ended, and a picker that
   mounts late in the call causes no reflow. */
body[data-connected='true'].${CAPTIONS_CALL_CLASS} #teamRoster { display: none; }
body[data-connected='true'].${CAPTIONS_CALL_CLASS} #waveformContainer {
  /* Sized for the boxed captions (padding, a name row and two --text-lg
     lines); that is more than two unboxed --text-xl lines need, so it still
     leaves room for them. --leading-snug is a clamp() that mixes numbers and
     lengths, which calc() rejects, so its upper bound stands in. */
  margin-block-start: calc(2 * var(--space-sm) + 1.4 * (var(--text-sm) + 2 * var(--text-lg)));
}
@media (prefers-reduced-motion: reduce) {
  .ferni-captions { transition: opacity ${DURATION.NORMAL}ms linear; transform: translate(-50%, 0); }
  .ferni-caption-line .ferni-caption-words { animation: none; }
}
`;

export function injectCaptionStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
