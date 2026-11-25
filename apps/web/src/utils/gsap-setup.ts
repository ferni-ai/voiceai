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
 *
 * If the CDN script didn't load, this exports an inert stand-in (gsap-inert.ts) and warns once,
 * so an animation call never throws (#3273).
 */

// Type assertion for TypeScript
import type { gsap as GsapType } from 'gsap';
import { createInertGsap } from './gsap-inert.js';
import { createLogger } from './logger.js';

// Use the global GSAP instance from CDN (loaded in index.html)
// The CDN UMD bundle includes CSSPlugin automatically
const cdnGsap = Reflect.get(window, 'gsap') as typeof GsapType | undefined;
if (!cdnGsap) {
  createLogger('GSAP').warn('GSAP did not load from the CDN; animations jump to their end');
}
const gsap = cdnGsap ?? createInertGsap();

// Re-export the global instance with proper typing
export { gsap };
export default gsap;
