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
 * If the CDN script didn't load (offline, blocked by an extension or a strict
 * network), an inert stand-in is exported instead: every call is a chainable
 * no-op and completion callbacks still fire, so the app keeps working without
 * motion instead of throwing "Cannot read properties of undefined" on every
 * animation frame.
 */

// Type assertion for TypeScript
import type { gsap as GsapType } from 'gsap';
import { createLogger } from './logger.js';

const log = createLogger('GSAP');

const CALLBACK_KEYS = ['onStart', 'onComplete'] as const;

/** Fire start/complete callbacks found in tween/timeline vars, asynchronously like GSAP. */
function fireCallbacks(args: readonly unknown[]): void {
  for (const arg of args) {
    if (typeof arg !== 'object' || arg === null) continue;
    for (const key of CALLBACK_KEYS) {
      const callback = (arg as Record<string, unknown>)[key];
      if (typeof callback === 'function') {
        setTimeout(() => {
          try {
            (callback as () => void)();
          } catch (error) {
            log.warn({ error: String(error) }, `Animation ${key} callback failed`);
          }
        }, 0);
      }
    }
  }
}

function createInertGsap(): typeof GsapType {
  const target = function inert(): void {
    // Callable so both gsap.to(...) and gsap.timeline().to(...) work.
  };
  const inert: unknown = new Proxy(target, {
    get(_target, property) {
      // Not a thenable: `await tl` must not hang.
      if (property === 'then') return undefined;
      if (property === Symbol.toPrimitive) return () => 0;
      return inert;
    },
    apply(_target, _thisArg, args: unknown[]) {
      fireCallbacks(args);
      return inert;
    },
  });
  return inert as typeof GsapType;
}

const globalGsap = (window as unknown as { gsap?: typeof GsapType }).gsap;

if (!globalGsap) {
  log.warn('GSAP did not load; animations are disabled');
}

// Use the global GSAP instance from CDN (loaded in index.html)
// The CDN UMD bundle includes CSSPlugin automatically
const gsap: typeof GsapType = globalGsap ?? createInertGsap();

// Re-export the global instance with proper typing
export { gsap };
export default gsap;
