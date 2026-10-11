/**
 * Avatar compositor: one owner per animated property.
 *
 * Behind `ferni:avatar-compositor` (localStorage, off by default). With it on:
 * - the speaking system owns the body pulse (inline transform on
 *   `.avatar-container`) and the ring (`#avatarRing` transform and opacity);
 * - the breathing loop composites with `add`, so the body pulse stacks on top
 *   of breathing instead of being hidden by it;
 * - the presence voice pulse and the coach ring writer stand down;
 * - the container's CSS `conversationalSpeaking` loop is switched off (the
 *   inner `#coachAvatar` keeps it), because a CSS animation would replace the
 *   inline pulse the same way the old breathing loop did.
 *
 * Avatar audit item 2, "One owner per property" (W3, W4, W16, W17).
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('AvatarCompositor');

export const AVATAR_COMPOSITOR_FLAG_KEY = 'ferni:avatar-compositor';
/** Set on `.avatar-container` while the compositor owns it. */
export const COMPOSITOR_ATTR = 'data-avatar-compositor';
const STYLE_ID = 'avatar-compositor-styles';

/**
 * `#coach.is-speaking .avatar-container` runs a CSS loop that would replace
 * the inline body pulse. The attribute selector is more specific, so this
 * wins only while the compositor has claimed the container.
 */
export const AVATAR_COMPOSITOR_CSS = `
#coach.is-speaking .avatar-container[${COMPOSITOR_ATTR}] { animation: none; }
`;

export function isAvatarCompositorEnabled(): boolean {
  try {
    return localStorage.getItem(AVATAR_COMPOSITOR_FLAG_KEY) === 'true';
  } catch (error) {
    log.debug('Could not read the avatar compositor flag, treating it as off', error);
    return false;
  }
}

/** Composite mode for the breathing loop: `add` under the flag. */
export function breathingComposite(): CompositeOperation {
  return isAvatarCompositorEnabled() ? 'add' : 'replace';
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = AVATAR_COMPOSITOR_CSS;
  document.head.appendChild(style);
}

function asKeyframeEffect(animation: Animation): KeyframeEffect | null {
  const effect = animation.effect;
  if (!effect || !('getKeyframes' in effect) || !('composite' in effect)) return null;
  return effect as KeyframeEffect;
}

/**
 * Cancel finished transform animations that still hold their last frame in
 * `replace` mode (a `fill: 'forwards'` settle, for example). They sit above
 * the inline body pulse and hide it for the rest of the session.
 */
export function releaseStaleTransformFills(element: Element): number {
  if (typeof element.getAnimations !== 'function') return 0;
  let released = 0;
  for (const animation of element.getAnimations()) {
    if (animation.playState !== 'finished') continue;
    const effect = asKeyframeEffect(animation);
    if (!effect || effect.composite !== 'replace') continue;
    const fill = effect.getTiming().fill;
    if (fill !== 'forwards' && fill !== 'both') continue;
    if (!effect.getKeyframes().some((frame) => frame.transform !== undefined)) continue;
    animation.cancel();
    released++;
  }
  if (released > 0) log.debug('Released stale transform fills', { released });
  return released;
}

/**
 * Take ownership of the container's transform for the body pulse. Returns
 * false (and does nothing) when the flag is off.
 */
export function claimAvatarContainer(container: HTMLElement): boolean {
  if (!isAvatarCompositorEnabled()) return false;
  ensureStyles();
  container.setAttribute(COMPOSITOR_ATTR, '');
  releaseStaleTransformFills(container);
  return true;
}
