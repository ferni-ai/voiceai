/**
 * The avatar's life when nobody is moving it on purpose: the natural blink
 * (natural-blink.ts) and the idle breath, drift and glances (idle-life.ts).
 * Each stays behind its own switch in config/motion-flags.ts, off by default.
 *
 * @module ui/avatar-motion/idle-presence
 */

import { initIdleLife } from './idle-life.js';
import { initNaturalBlink } from './natural-blink.js';

export function initIdlePresence(): void {
  initNaturalBlink();
  initIdleLife();
}
