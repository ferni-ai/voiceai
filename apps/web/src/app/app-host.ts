/**
 * App Host
 *
 * The app actions that event handlers and callbacks in the app/ modules call
 * back into. VoiceAIApp implements it; modules only import the type, so they
 * never import app.ts.
 */

import type { PersonaId } from '../types/persona.js';

export interface AppHost {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  toggleMute(): void;
  selectPersona(personaId: PersonaId): void;
}
