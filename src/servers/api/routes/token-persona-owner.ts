/**
 * A token's persona_id may name a custom agent only if the caller owns it.
 *
 * /token and /demo-token passed any `persona_id` into the room metadata. A
 * custom agent id (agent_/custom_/ca_, see load-persona) that isn't the
 * caller's own never loads, so the call fell through to a generic stand-in
 * named after the raw id. Now such a call gets Ferni instead.
 *
 * @module servers/api/routes/token-persona-owner
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'TokenPersonaOwner' });

export const FALLBACK_PERSONA_ID = 'ferni';

/** `personaId`, or Ferni when it is a custom agent `uid` doesn't own (or there is no caller). */
export async function personaForCaller(
  personaId: string,
  uid: string | undefined
): Promise<string> {
  const { isCustomAgentId } =
    await import('../../../services/custom-agent/custom-agent-runtime-service.js');
  if (!isCustomAgentId(personaId)) return personaId;

  if (uid) {
    try {
      const { getCustomAgent } =
        await import('../../../services/custom-agent/custom-agent-persistence-service.js');
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

/** /demo-token's persona: its persona_id (default Ferni), with no signed-in caller. */
export function demoPersonaFor(url: URL): Promise<string> {
  return personaForCaller(url.searchParams.get('persona_id') || FALLBACK_PERSONA_ID, undefined);
}
