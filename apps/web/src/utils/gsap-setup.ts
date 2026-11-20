/**
 * GSAP Setup: the one gsap instance the app uses, bundled from the `gsap`
 * package (its main entry registers CSSPlugin).
 *
 * Import gsap from this file instead of 'gsap' directly, so every module shares
 * this instance and its config.
 *
 * Until 2026-10-31 this read `window.gsap` from a cdnjs script tag. When that
 * host was slow or blocked, gsap was undefined and the avatar's eye motion
 * (avatar-soul.ui.ts) threw every few seconds.
 *
 * Note: force3D is a gsap.config() option in GSAP 3, not a tween property.
 * It's set globally in initGSAP() in gsap-animations.ts.
 */

import { gsap } from 'gsap';

export { gsap };
export default gsap;
