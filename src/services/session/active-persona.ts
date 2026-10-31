/**
 * Who is speaking on a call, and who the call started with (ACTIVE_PERSONA_ID, plan S1b).
 *
 * One services object serves every persona on a call. Without this, `services.personaId`
 * stayed the persona the call started with, so after Ferni handed off to Maya, a commitment
 * Maya heard was recorded as Ferni's and the after-call Maya habit check never ran.
 *
 * - `services.personaId`: the persona speaking now. With the flag on it follows each handoff.
 * - `services.startPersonaId`: the persona the call started with, kept at the first handoff.
 * - `services.handoffState.metPersonas`: every persona that spoke on this call.
 *
 * @module services/session/active-persona
 */
import { flagOn } from '../../config/env-flag.js';
import { markPersonaMet } from '../handoff/handoff-state.js';
import type { SessionServices } from '../types.js';

type CallPersonas = Pick<SessionServices, 'personaId' | 'startPersonaId' | 'handoffState'>;

export function activePersonaIdOn(): boolean {
  return flagOn('ACTIVE_PERSONA_ID');
}

/** A handoff to `toPersonaId` completed: it is the persona speaking now, and has spoken on the call. */
export function noteHandoffComplete(services: CallPersonas, toPersonaId: string): void {
  if (!activePersonaIdOn()) return;
  services.startPersonaId ??= services.personaId;
  services.personaId = toPersonaId;
  markPersonaMet(services.handoffState, toPersonaId);
}

/** The persona the call started with (`personaId` itself until the first handoff). */
export function startPersonaOf(services: CallPersonas): string {
  return services.startPersonaId || services.personaId || 'ferni';
}

/** Every persona that spoke on the call; with the flag off, only the one it started with. */
export function personasVisitedOf(services: CallPersonas): string[] {
  return [...services.handoffState.metPersonas];
}
