/**
 * How each persona idles: its blink pace, and whether it takes the odd glance.
 *
 * Seth's taste calls (motion audit 2026-10-29, T1 and T3): each persona blinks
 * at its own pace, as a multiple of the base gap between blinks, and the
 * upbeat personas (Peter, Jordan) also glance aside now and then. Anyone not
 * listed (Ferni, Alex, the Legends) uses the base pace and no glances.
 *
 * @module ui/avatar-motion/persona-idle
 */

import { appState } from '../../state/app.state.js';
import type { SpeakerId } from '../../types/persona.js';

export interface PersonaIdle {
  /** Multiplies the gap between blinks: below 1 blinks more often. */
  readonly blinkPace: number;
  /** Takes an occasional glance aside while idle. */
  readonly glances: boolean;
}

const BASE_IDLE: PersonaIdle = { blinkPace: 1, glances: false };

const PERSONA_IDLE: Partial<Record<SpeakerId, PersonaIdle>> = {
  'peter-john': { blinkPace: 0.85, glances: true },
  'jordan-taylor': { blinkPace: 0.8, glances: true },
  'maya-santos': { blinkPace: 0.95, glances: false },
  'nayan-patel': { blinkPace: 1.1, glances: false },
};

export function personaIdle(id: SpeakerId): PersonaIdle {
  return PERSONA_IDLE[id] ?? BASE_IDLE;
}

/** The idle character of whoever is on screen now. */
export function activePersonaIdle(): PersonaIdle {
  return personaIdle(appState.get('activePersona').id);
}
