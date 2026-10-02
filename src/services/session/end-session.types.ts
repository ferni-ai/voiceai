/**
 * End Session Types
 *
 * Option shapes for the session end lifecycle (end-session.ts).
 *
 * @module session-manager/end-session.types
 */

import type { HumanizingStateUpdate } from '../humanizing-state.js';
import type { GlobalServices, SessionServices } from '../types.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Options for ending a session
 */
export interface EndSessionOptions {
  sessionId: string;
  userId: string | undefined;
  validatedUserId: string | undefined;
  personaId: string | undefined;
  realtimeConversationId: string | undefined;
  sessionStartTime: number;
  services: SessionServices;
  global: GlobalServices;
  humanizingStateUpdates: HumanizingStateUpdate[];
  activeSessions: Map<string, SessionServices>;
}

/**
 * Options for finalizing a user session
 */
export interface FinalizeUserSessionOptions {
  sessionId: string;
  validatedUserId: string;
  personaId: string | undefined;
  sessionStartTime: number;
  services: SessionServices;
  global: GlobalServices;
  humanizingStateUpdates: HumanizingStateUpdate[];
  realtimeConversationId: string | undefined;
}
