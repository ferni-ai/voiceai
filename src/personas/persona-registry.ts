/**
 * Every persona this process holds, by id. The two template personas are here
 * from load; bundle personas and their aliases join when index.ts loads the
 * bundles. livePersonaId (persona-ids.ts) reads it, so a persona the registry
 * holds always starts a call as itself.
 *
 * @module personas/persona-registry
 */

import { GENERIC_ADVISOR_PERSONA } from './generic-advisor/index.js';
import type { PersonaRegistry } from './types.js';
import { WELLNESS_COACH_PERSONA } from './wellness-coach/index.js';

/**
 * Templates for new personas via extendPersona() (see generic-advisor/index.ts).
 * Production personas come from bundles (initializeFromBundles in index.ts).
 */
export const personaRegistry: PersonaRegistry = new Map([
  [GENERIC_ADVISOR_PERSONA.id, GENERIC_ADVISOR_PERSONA],
  [WELLNESS_COACH_PERSONA.id, WELLNESS_COACH_PERSONA],
]);
