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

// --leading-* on :root mix unitless numbers with vw inside clamp(), which is
// invalid, so they compute to the inherited 1.6. Captions set plain ratios.
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
  font-family: var(--font-body); font-size: var(--text-xl); line-height: 1.3;
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
.ferni-captions--words-off .ferni-captions__viewport { display: none; }
.ferni-captions__moments {
  display: flex; flex-wrap: wrap; justify-content: center; gap: var(--space-xs);
  margin: 0; padding: 0; list-style: none;
}
.ferni-captions__moments:not(:empty) { padding-top: var(--space-xs); }
/* Out of flow but still measured, so layout() can bring the chips back. */
.ferni-captions--moments-aside .ferni-captions__moments { position: absolute; visibility: hidden; }
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
  .ferni-captions { transition: opacity ${DURATION.NORMAL}ms linear; transform: translate(-50%, 0); }
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
