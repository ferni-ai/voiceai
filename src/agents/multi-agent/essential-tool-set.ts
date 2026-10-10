/**
 * The first agent's tool set: this session's handoff tools plus the essential
 * domain tools (music, weather, memory, safety...). Used by agent-setup.ts for
 * the initial agent (essential-only policy) and as the timeout fallback.
 *
 * The essential domains include a "handoff" domain built once per process with
 * no user, so it carries a handoff to every persona: the speaker itself and
 * teammates this user hasn't unlocked. Spreading it over the session handoffs
 * put those back (and its handoffToPeter replaced the session's), so only the
 * session build's handoffs are kept here.
 *
 * @module agents/multi-agent/essential-tool-set
 */

import { loadEssentialDomains } from '../../tools/dynamic-loader/index.js';
import { buildHandoffTools } from '../../tools/handoff/handoff-factory.js';
import { withoutSharedHandoffs } from '../../tools/handoff/handoff-availability.js';
import type { UserProfile } from '../../types/user-profile.js';
import { getLogger } from '../../utils/safe-logger.js';

export interface EssentialToolSetInput {
  personaId: string;
  userId: string | null | undefined;
  services: {
    userProfile?: UserProfile | null;
    devMode?: { enabled: boolean; bypassUnlocks: boolean };
  };
}

export interface EssentialToolSet {
  /** Handoffs first, then the essential domain tools. */
  tools: Record<string, unknown>;
  /** This session's handoff (and team-intro) tools. */
  handoffTools: Record<string, unknown>;
  /** Essential domain tools, without the shared handoffs. */
  essentialTools: Record<string, unknown>;
}

export async function buildEssentialToolSet(
  input: EssentialToolSetInput
): Promise<EssentialToolSet> {
  const { personaId, userId, services } = input;
  const subscriptionTier =
    (services.userProfile?.subscription?.tier as 'free' | 'friend' | 'partner') || 'free';
  // A signed-in person's profile may still be loading (deferred startup): that's unknown,
  // not "new". Filtering on null dropped every teammate they had unlocked from the first
  // agent's tools; the handoff's runtime check still refuses one that's locked.
  const userProfile = services.userProfile ?? (userId ? undefined : null);

  const { tools: handoffTools } = await buildHandoffTools({
    currentAgentId: personaId,
    userProfile,
    subscriptionTier,
    services,
  });

  let essentialTools: Record<string, unknown> = {};
  try {
    essentialTools = withoutSharedHandoffs(
      await loadEssentialDomains(userId || 'anonymous', services)
    );
  } catch (error) {
    getLogger().warn(
      { error: String(error) },
      '⚠️ Failed to load essential tools - only handoffs available'
    );
    // This logger is silent inside the job context; a call without its
    // domain tools must be visible in the agent log.
    process.stderr.write(`🚨 Essential tools failed to load: ${String(error)}\n`);
  }

  return { tools: { ...handoffTools, ...essentialTools }, handoffTools, essentialTools };
}
