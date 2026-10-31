/**
 * How each persona idles: its blink pace.
 *
 * Seth's taste call (motion audit 2026-10-29, T1): each persona blinks at its
 * own pace, as a multiple of the base gap between blinks. Anyone not listed
 * (Ferni, Alex, the Legends) uses the base pace.
 *
 * @module ui/avatar-motion/persona-idle
 */

import { appState } from '../../state/app.state.js';
import type { SpeakerId } from '../../types/persona.js';

export interface PersonaIdle {
  /** Multiplies the gap between blinks: below 1 blinks more often. */
  readonly blinkPace: number;
}

const BASE_IDLE: PersonaIdle = { blinkPace: 1 };

const PERSONA_IDLE: Partial<Record<SpeakerId, PersonaIdle>> = {
  'peter-john': { blinkPace: 0.85 },
  'jordan-taylor': { blinkPace: 0.8 },
  'maya-santos': { blinkPace: 0.95 },
  'nayan-patel': { blinkPace: 1.1 },
};

export function personaIdle(id: SpeakerId): PersonaIdle {
  return PERSONA_IDLE[id] ?? BASE_IDLE;
}

/** The idle character of whoever is on screen now. */
export function activePersonaIdle(): PersonaIdle {
  return personaIdle(appState.get('activePersona').id);
}
