/**
 * A custom agent id names a persona only for the user who owns it.
 *
 * /token and /demo-token passed any `persona_id` into the room metadata. A
 * custom agent id (agent_/custom_/ca_, custom-agent-ids.ts) that isn't the
 * caller's own never loads, so the call fell through to a generic stand-in
 * named after the raw id. Now such a call gets Ferni instead.
 *
 * The lookup reads only the caller's own agents (users/{uid}/customAgents), so
 * a refusal is the same whether or not someone else has an agent with that id:
 * nothing here can tell a caller that another user's agent exists. Used by the
 * token routes and, with CUSTOM_AGENT_LIVE=on, again by the live call
 * (agents/shared/custom-agent-live.ts).
 *
 * @module services/custom-agent/custom-agent-owner
 */

import { createLogger } from '../../utils/safe-logger.js';
import { isCustomAgentId } from './custom-agent-ids.js';

const log = createLogger({ module: 'TokenPersonaOwner' });

export const FALLBACK_PERSONA_ID = 'ferni';

/** `personaId`, or Ferni when it is a custom agent `uid` doesn't own (or there is no caller). */
export async function personaForCaller(
  personaId: string,
  uid: string | undefined
): Promise<string> {
  if (!isCustomAgentId(personaId)) return personaId;

  if (uid) {
    try {
      const { getCustomAgent } = await import('./custom-agent-persistence-service.js');
      if (await getCustomAgent(uid, personaId)) return personaId;
    } catch (error) {
      log.warn({ error: String(error) }, 'Custom agent owner lookup failed, using Ferni');
      return FALLBACK_PERSONA_ID;
    }
  }

  log.warn(
    { personaId: personaId.slice(0, 64), signedIn: !!uid },
    'persona_id names a custom agent the caller does not own, using Ferni'
  );
  return FALLBACK_PERSONA_ID;
}
