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
import { initColorSystem } from '../ui/color/index.js';
import { initTypographySystem } from '../ui/typography/index.js';

/**
 * @param personaId - Active persona; seeds the mood palette and time-fading tint
 */
export function initVisualSystems(personaId: string): void {
  initTranscendentSystems();
  initColorSystem(personaId);
  initTypographySystem();
}
