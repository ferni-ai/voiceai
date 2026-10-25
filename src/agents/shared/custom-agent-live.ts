/**
 * CUSTOM_AGENT_LIVE: a live call to a custom agent speaks as that agent.
 *
 * A call to an agent_/custom_/ca_ id used to load nothing: buildSessionPersona
 * knows only bundled personas, so the call got a generic coach named after the
 * raw id, in Ferni's voice, with the prompt "You are agent_x, a helpful
 * companion." (loadCustomAgentAsPersona was reachable only from the uncalled
 * loadPersonaPhase.) With the flag on, once the caller is known (STEP 4):
 * - the caller must own the agent (services/custom-agent/custom-agent-owner.ts,
 *   the check the token routes make); anyone else, or a failed load, gets the
 *   default persona, logged with ids only;
 * - an owned agent loads with its personality, memories and stock voice, and a
 *   prompt that keeps the owner's text as data (custom-agent-live-prompt.ts), on an
 *   allowlisted persona that carries no raw owner text (custom-agent-live-persona.ts).
 *
 * The loaded persona is remembered here (a WeakMap, so nothing outlives the call):
 * loadCallerPrompt takes its prompt, session-creator skips accent localization
 * (which would localize Ferni's voice for an id it doesn't know), and the
 * multi-agent path, which only builds bundled personas, steps aside for the
 * single-agent session. Off, nothing is ever remembered and every call is as before.
 * A cohort flag: read after applyCallerFlags.
 *
 * @module agents/shared/custom-agent-live
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import type { PersonaConfig } from '../../personas/types.js';
import { isCustomAgentId } from '../../services/custom-agent/custom-agent-ids.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CustomAgentLive' });

export function customAgentLiveEnabled(env: Env = process.env): boolean {
  return flagOn('CUSTOM_AGENT_LIVE', env);
}

/** Custom agents loaded for a live call, each with its live prompt. */
const livePrompts = new WeakMap<object, string>();

/** True for a persona resolveLiveCustomAgent loaded (only ever with the flag on). */
export function isLiveCustomAgent(persona: object | null | undefined): boolean {
  return !!persona && livePrompts.has(persona);
}

/** The live prompt of a persona resolveLiveCustomAgent loaded, else undefined. */
export function liveCustomAgentPrompt(persona: object | null | undefined): string | undefined {
  return persona ? livePrompts.get(persona) : undefined;
}

export type LiveCustomAgent =
  { kind: 'unchanged' } | { kind: 'loaded'; persona: PersonaConfig } | { kind: 'refused' };

export interface LiveCustomAgentDeps {
  personaForCaller(personaId: string, uid: string | undefined): Promise<string>;
  loadCustomAgentAsPersona(agentId: string, userId: string): Promise<PersonaConfig | null>;
  liveCallPersona(loaded: PersonaConfig): Promise<PersonaConfig>;
}

const productionDeps: LiveCustomAgentDeps = {
  personaForCaller: async (personaId, uid) =>
    (await import('../../services/custom-agent/custom-agent-owner.js')).personaForCaller(
      personaId,
      uid
    ),
  loadCustomAgentAsPersona: async (agentId, userId) =>
    (
      await import('../../services/custom-agent/custom-agent-runtime-service.js')
    ).loadCustomAgentAsPersona(agentId, userId),
  liveCallPersona: async (loaded) =>
    (await import('../../services/custom-agent/custom-agent-live-persona.js')).liveCallPersona(
      loaded
    ),
};

/**
 * What this call speaks as. `unchanged`: flag off or not a custom agent id.
 * `loaded`: the caller's own agent. `refused`: someone else's, no caller, or a
 * failed load; the caller hears the default persona and is told nothing about
 * whether the agent exists.
 */
export async function resolveLiveCustomAgent(
  persona: PersonaConfig,
  userId: string | null | undefined,
  env: Env = process.env,
  deps: LiveCustomAgentDeps = productionDeps
): Promise<LiveCustomAgent> {
  if (!customAgentLiveEnabled(env) || !isCustomAgentId(persona.id)) return { kind: 'unchanged' };
  const agentId = persona.id;
  try {
    const owned = !!userId && (await deps.personaForCaller(agentId, userId)) === agentId;
    const loaded = owned && userId ? await deps.loadCustomAgentAsPersona(agentId, userId) : null;
    if (loaded && loaded.id === agentId) {
      const live = await deps.liveCallPersona(loaded);
      livePrompts.set(live, live.systemPrompt);
      log.info({ agentId: agentId.slice(0, 64) }, 'Custom agent loaded for its owner');
      return { kind: 'loaded', persona: live };
    }
  } catch (error) {
    log.warn(
      { agentId: agentId.slice(0, 64), error: error instanceof Error ? error.name : 'unknown' },
      'Custom agent load failed'
    );
  }
  log.warn(
    { agentId: agentId.slice(0, 64), signedIn: !!userId },
    'Custom agent not loaded for this caller, using the default persona'
  );
  return { kind: 'refused' };
}
