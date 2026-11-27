/**
 * The fields a call's record starts with (bogle_users/{uid}/conversations/{id}),
 * written by realtime-memory's startConversation.
 *
 * ASSISTANT_ONLY_CALLS_UNCOUNTED=on (off by default, #3222): the record starts with
 * userTurnCount 0, so a call where only Ferni spoke (the greeting, then "are you
 * there?") is not a session together. Without it the field stays missing until the
 * caller speaks, and sessions-together reads a missing field as a call stored before
 * userTurnCount existed, where any two turns count. Records already stored keep that
 * reading: only new records get the field.
 *
 * @module services/memory/conversation-start
 */
import { flagOn, type Env } from '../../config/env-flag.js';

export function conversationStartFields(
  personaId: string,
  startedAt: Date,
  env: Env = process.env
): Record<string, unknown> {
  return {
    startedAt,
    personaId,
    turnCount: 0,
    ...(flagOn('ASSISTANT_ONLY_CALLS_UNCOUNTED', env) && { userTurnCount: 0 }),
    summarized: false,
  };
}
