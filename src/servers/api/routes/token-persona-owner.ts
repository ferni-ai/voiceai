/**
 * A token's persona_id may name a custom agent only if the caller owns it.
 * The check lives in services/custom-agent/custom-agent-owner.ts, so the live
 * call can make it again without importing this server layer.
 *
 * @module servers/api/routes/token-persona-owner
 */

import {
  FALLBACK_PERSONA_ID,
  personaForCaller,
} from '../../../services/custom-agent/custom-agent-owner.js';

export { FALLBACK_PERSONA_ID, personaForCaller };

/** /demo-token's persona: its persona_id (default Ferni), with no signed-in caller. */
export function demoPersonaFor(url: URL): Promise<string> {
  return personaForCaller(url.searchParams.get('persona_id') || FALLBACK_PERSONA_ID, undefined);
}
