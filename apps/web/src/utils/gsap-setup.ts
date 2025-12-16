/**
 * GSAP Setup - Use global GSAP from CDN
 *
 * The CDN version (loaded in index.html) has CSSPlugin built-in.
 * This file provides typed access to the global gsap instance.
 *
 * Import gsap from this file instead of 'gsap' directly to ensure
 * you're using the same instance as the CDN.
 *
 * Note: force3D is a gsap.config() option in GSAP 3, not a tween property.
 * It's set globally in initGSAP() in gsap-animations.ts.
 */

// Type assertion for TypeScript
import type { gsap as GsapType } from 'gsap';

// Use the global GSAP instance from CDN (loaded in index.html)
// The CDN UMD bundle includes CSSPlugin automatically
const gsap = (window as unknown as { gsap: typeof GsapType }).gsap;

// Re-export the global instance with proper typing
export { gsap };
export default gsap;
