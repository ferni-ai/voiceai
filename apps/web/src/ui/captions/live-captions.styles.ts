/**
 * Live captions styles. Type follows the Apple Live
 * Captions scale (body-large, ~1.4 line height); colours, spacing, radii,
 * blur and z-index come from tokens.
 *
 * @module ui/captions/live-captions.styles
 */

import { DURATION, EASING } from '../../config/animation-constants.js';

const STYLE_ID = 'ferni-captions-styles';

const CSS = `
.ferni-captions {
  position: fixed; left: 50%; bottom: var(--ferni-captions-bottom, var(--space-xl));
  z-index: var(--z-sticky);
  display: flex; flex-direction: column; overflow: hidden;
  width: min(40rem, calc(100% - 2 * var(--space-md)));
  max-height: var(--ferni-captions-room, 100vh);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-xl);
  background: var(--color-bg-glass);
  -webkit-backdrop-filter: blur(var(--glass-blur-regular));
  backdrop-filter: blur(var(--glass-blur-regular));
  box-shadow: var(--shadow-md);
  opacity: 0; pointer-events: none; transform: translate(-50%, var(--space-sm));
  transition: opacity ${DURATION.NORMAL}ms ${EASING.DECELERATE},
    transform ${DURATION.NORMAL}ms ${EASING.DECELERATE};
}
.ferni-captions--visible { opacity: 1; pointer-events: auto; transform: translate(-50%, 0); }
.ferni-captions--no-room { visibility: hidden; }
.ferni-captions__header { flex: none; padding-inline-end: var(--space-xl); }
/* Captions v2 replaces the one-line pill that sat over the avatar. */
#transcriptContainer { display: none; }
.ferni-captions__viewport {
  /* Whole lines: layout() sets how many fit clear of the avatar (max 3). */
  flex: none; max-height: calc(var(--ferni-captions-lines, 3) * 1lh); overflow: hidden;
  padding-inline-end: var(--space-sm);
  font-family: var(--font-body); font-size: var(--text-lg); line-height: var(--leading-snug);
  font-weight: var(--font-weight-medium); color: var(--color-text-secondary);
}
.ferni-captions--overflowing .ferni-captions__viewport {
  -webkit-mask-image: linear-gradient(to bottom, transparent, black 0.75lh);
  mask-image: linear-gradient(to bottom, transparent, black 0.75lh);
}
.ferni-caption-line { margin: 0; overflow-wrap: anywhere; }
.ferni-caption-line:last-child { color: var(--color-text-primary); }
.ferni-caption-line.ferni-caption-note {
  margin-top: var(--space-2xs); font-size: var(--text-sm); color: var(--color-text-secondary);
}
.ferni-caption-line__name {
  display: inline-flex; align-items: center; gap: var(--space-xs); margin-inline-end: var(--space-sm);
  line-height: var(--leading-snug);
  font-size: var(--text-sm); font-weight: var(--font-weight-semibold); color: var(--color-text-secondary);
}
.ferni-caption-line__name::before {
  content: ''; width: var(--space-sm); height: var(--space-sm); border-radius: var(--radius-full);
  background: var(--persona-primary);
}
.ferni-caption-line[data-speaker='user'] .ferni-caption-line__name::before,
.ferni-captions__header .ferni-caption-line__name[data-speaker='user']::before { background: var(--color-text-muted); }
@media (prefers-reduced-motion: reduce) {
  .ferni-captions { transition: opacity ${DURATION.NORMAL}ms linear; transform: translate(-50%, 0); }
}
`;

export function injectCaptionStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
