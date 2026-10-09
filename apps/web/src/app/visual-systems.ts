/**
 * Visual Systems Startup
 *
 * Starts the animation, color and typography systems once the app shell is up.
 * Must run after FerniEQ and the humanization bridge (the moment orchestrator
 * listens for their events).
 *
 * @module @ferni/visual-systems
 */

import { initTranscendentSystems } from '../systems/index.js';
import type { SpeakerId } from '../types/persona.js';
import { initColorSystem } from '../ui/color/index.js';
import { initTypographySystem } from '../ui/typography/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('VisualSystems');

/**
 * Each system starts on its own: a throw is logged and the rest still run.
 * The caller's later startup steps (notifications, voice events) once went
 * missing because an error in this block escaped it.
 */
function start(name: string, init: () => void): void {
  try {
    init();
  } catch (error) {
    log.error(`Failed to start ${name}`, error);
  }
}

/**
 * @param personaId - Active persona; seeds the mood palette and time-fading tint
 */
export function initVisualSystems(personaId: SpeakerId): void {
  start('animation systems', () => initTranscendentSystems());
  start('color system', () => initColorSystem(personaId));
  start('typography system', () => initTypographySystem());
}
