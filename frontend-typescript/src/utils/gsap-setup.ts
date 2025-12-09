/**
 * GSAP Setup - Use global GSAP from CDN
 * 
 * The CDN version (loaded in index.html) has all plugins auto-registered.
 * This file provides typed access to the global gsap instance.
 * 
 * Import gsap from this file instead of 'gsap' directly to ensure
 * you're using the same instance as the CDN.
 */

// Use the global GSAP instance from CDN (loaded in index.html)
// The CDN UMD bundle auto-registers CSSPlugin and other plugins
const gsap = (window as any).gsap;

// Type assertion for TypeScript
import type { gsap as GsapType } from 'gsap';

// Re-export the global instance with proper typing
export { gsap };
export default gsap as typeof GsapType;

