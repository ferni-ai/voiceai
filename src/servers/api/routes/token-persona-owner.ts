/**
 * A token's persona_id may name a custom agent only if the caller owns it.
 * The check lives in services/custom-agent/custom-agent-owner.ts, so the live
 * call can make it again without importing this server layer.
 *
 * @module servers/api/routes/token-persona-owner
 */

import { flagOn, type Env } from '../../../config/env-flag.js';
import { ALIAS_TO_CANONICAL } from '../../../personas/index.js';
import {
  FALLBACK_PERSONA_ID,
  personaForCaller,
} from '../../../services/custom-agent/custom-agent-owner.js';

export { FALLBACK_PERSONA_ID, personaForCaller };

/**
 * /demo-token's persona: its persona_id (default Ferni), with no signed-in caller.
 * DEMO_TOKEN_CORE_PERSONAS_ONLY on: a built-in persona id or alias (persona-ids.ts)
 * becomes its canonical id and anything else becomes Ferni, because a demo with
 * another id starts on a generic stand-in prompt.
 */
export async function demoPersonaFor(url: URL, env: Env = process.env): Promise<string> {
  const personaId = await personaForCaller(
    url.searchParams.get('persona_id') || FALLBACK_PERSONA_ID,
    undefined
  );
  if (!flagOn('DEMO_TOKEN_CORE_PERSONAS_ONLY', env)) return personaId;
  const id = personaId.toLowerCase();
  // Main's prompt loader bundles `joel` as joel-dickson; the shared alias table doesn't list it.
  if (id === 'joel') return 'joel-dickson';
  // An own key only: `in` would let `__proto__` or `constructor` through as an object.
  return Object.hasOwn(ALIAS_TO_CANONICAL, id) ? ALIAS_TO_CANONICAL[id] : FALLBACK_PERSONA_ID;
}
