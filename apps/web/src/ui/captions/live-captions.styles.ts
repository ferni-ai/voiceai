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
  .ferni-caption-line .ferni-caption-words,
  .ferni-caption-line:not(.ferni-caption-line--settled) .ferni-caption-words,
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

const BREATH_STYLE_ID = 'ferni-captions-breath-styles';

/**
 * Breath (captions-breath flag). Ferni's words rise in one at a time, each
 * from blurred to sharp and at most 6px up; the word being spoken is
 * underlined in the persona colour; a pause shows three breath dots. Only
 * injected when the flag is on, so flag-off pages get no new rules.
 */
const BREATH_CSS = `
.ferni-caption-word { display: inline-block; }
/* Motion is defined only for no-preference, so reduced motion has no rise and
   no dots to fight with: every word is simply there. Only the line still
   arriving rises; a settled line is redrawn with the same spans. */
@media (prefers-reduced-motion: no-preference) {
  .ferni-caption-line[data-speaker='agent']:not(.ferni-caption-line--settled) .ferni-caption-word {
    animation: ferni-breath-word ${DURATION.SLOW * 2}ms ${EASING.DECELERATE} both;
    animation-delay: var(--ferni-word-delay, 0ms);
  }
  .ferni-captions--breathing .ferni-caption-line[data-speaker='agent']:last-child::after {
    animation: ferni-breath-dots ${DURATION.SLOW * 6}ms ${EASING.STANDARD} infinite;
  }
}
/* A correction swaps words in without a second rise, as the plain path does. */
.ferni-caption-line[data-speaker='agent'] .ferni-caption-word.ferni-caption-word--quiet {
  animation: none;
}
@keyframes ferni-breath-word {
  from { opacity: 0; filter: blur(3px); transform: translateY(6px); }
}
.ferni-caption-line[data-speaker='agent']:not(.ferni-caption-line--final) .ferni-caption-word:last-child {
  /* A text decoration, not a background: axe reads a background-image as the
     text's background and fails the contrast check on the word. */
  text-decoration: underline var(--persona-primary) 3px;
  text-underline-offset: 0.2em;
}
.ferni-captions--breathing .ferni-caption-line[data-speaker='agent']:last-child::after {
  content: ''; display: inline-block; vertical-align: middle;
  width: var(--space-xs); height: var(--space-xs); margin-inline: var(--space-sm);
  border-radius: var(--radius-full); background: var(--persona-primary);
  box-shadow: calc(var(--space-sm) + var(--space-2xs)) 0 0 var(--persona-primary),
    calc(2 * (var(--space-sm) + var(--space-2xs))) 0 0 var(--persona-primary);
}
@keyframes ferni-breath-dots { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
`;

/** Add the Breath rules. Call only when the captions-breath flag is on. */
export function injectBreathStyles(): void {
  if (document.getElementById(BREATH_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = BREATH_STYLE_ID;
  style.textContent = BREATH_CSS;
  document.head.appendChild(style);
}

const HEARD_STYLE_ID = 'ferni-captions-heard-styles';

/**
 * Heard (captions-heard flag). The caller's line is faint and blurred while
 * its transcript is interim, and sharpens when it settles. Once Ferni takes
 * the turn, a persona-colour check pops beside the settled line. Only injected
 * when the flag is on, so flag-off pages get no new rules.
 */
const HEARD_CSS = `
.ferni-caption-line--interim { opacity: 0.6; filter: blur(var(--space-2xs)); }
.ferni-caption-check {
  display: inline-flex; align-items: center; justify-content: center; vertical-align: middle;
  width: 1.375rem; height: 1.375rem; margin-inline-start: var(--space-xs);
  border-radius: var(--radius-full); background: var(--persona-primary); color: var(--color-bg-elevated);
}
.ferni-caption-check svg { display: block; }
@media (prefers-reduced-motion: no-preference) {
  .ferni-caption-line[data-speaker='user'] {
    transition: opacity ${DURATION.SLOW}ms ${EASING.DECELERATE}, filter ${DURATION.SLOW}ms ${EASING.DECELERATE};
  }
  /* Caller's line one size down, and no region padding, so more of it fits. */
  .ferni-captions.ferni-captions--caller { padding-block: 0; }
  .ferni-captions--caller .ferni-caption-line[data-speaker='user'] { font-size: var(--text-base); }
  /* The fallback: the caller's line is set aside, the reply stays whole. */
  .ferni-captions--caller-aside .ferni-caption-line[data-speaker='user'] { display: none; }
  .ferni-caption-check--pop {
    animation: ferni-heard-pop ${DURATION.SLOW}ms ${EASING.SPRING} both;
  }
}
@keyframes ferni-heard-pop { from { transform: scale(0); } }
`;

/** Add the Heard rules. Call only when the captions-heard flag is on. */
export function injectHeardStyles(): void {
  if (document.getElementById(HEARD_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = HEARD_STYLE_ID;
  style.textContent = HEARD_CSS;
  document.head.appendChild(style);
}
