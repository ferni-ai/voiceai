/**
 * Registering tools that a topic just loaded with the agent, mid-session
 * (transcript-handler.ts, dynamic tool loading).
 *
 * @module voice-agent/deferred-tool-update
 */

import { voice } from '@livekit/agents';
import { flagOn } from '../../config/env-flag.js';
import { sameTurnToolsEnabled } from '../../config/same-turn-tools-config.js';
import {
  preloadTopicDomains,
  registerSameTurnLoader,
  type SameTurnLoader,
} from '../personas/same-turn-tools.js';
import type { FallbackLogger } from '../../utils/safe-logger.js';
import { agentOnCall } from '../multi-agent/persona-swap.js';
import { applyAfterReplyStarts, updateAgentTools } from '../shared/tool-updater.js';
import type { UserData } from '../shared/types.js';

/**
 * Give the agent the newly loaded domains' tools once this reply has started.
 * Only those: updateAgentTools() puts the tools it is offered first, so the cap
 * evicts the agent's oldest tools instead of them. Offered the loader's whole
 * catalog (~211 tools, essential domains first), the cap cut the new domain.
 *
 * Changing the tool set as the turn ends voids LiveKit's preemptive reply
 * (it's reused only if the tools are unchanged), so every reply waited the
 * full LLM time after the caller stopped. Applied after the reply starts, the
 * new tools serve the next turn. DEFER_TOOL_UPDATES=off applies them at once,
 * and the returned promise waits for that.
 *
 * TOOLS_FOLLOW_AGENT=on: the tools go to the agent on the call when they are
 * applied. The transcript handler is wired once per call with the first
 * persona's agent, so after a single-session handoff every topic load went to
 * that agent, which no longer talks, and the teammate kept its ~55 starting
 * tools all call (prod 2026-10-17: the weather ask loaded `information` onto
 * Ferni's agent, 96 -> 120 tools, while Peter stayed at 55).
 */
export async function updateToolsAfterReplyStarts(
  session: voice.AgentSession<UserData>,
  agent: voice.Agent<UserData>,
  dynamicToolLoader: {
    getToolsForDomains: (domains: readonly string[]) => Record<string, unknown>;
  },
  loadedDomains: readonly string[],
  toolUpdaterLog: FallbackLogger
): Promise<void> {
  const apply = async (): Promise<void> => {
    try {
      const newTools = dynamicToolLoader.getToolsForDomains(loadedDomains);
      const target = flagOn('TOOLS_FOLLOW_AGENT')
        ? agentOnCall(session as unknown as voice.AgentSession<never>, agent)()
        : agent;
      const updated = await updateAgentTools(target, newTools, {
        domains: loadedDomains,
      });
      if (updated) {
        toolUpdaterLog.info(
          {
            loadedDomains,
            newToolCount: Object.keys(newTools).length,
          },
          '🔧 Agent tools updated mid-session'
        );
      }
    } catch (updateError) {
      toolUpdaterLog.warn(
        { error: String(updateError) },
        'Failed to update agent tools mid-session'
      );
    }
  };
  if (process.env.DEFER_TOOL_UPDATES === 'off') await apply();
  else applyAfterReplyStarts(session, apply);
}

/**
 * TOOLS_FOLLOW_AGENT=on: when a handoff swaps a new agent into the session, give
 * it the domains this call has loaded so far (the call's essential domains and
 * every topic since), as the first agent had them. A handed-to agent otherwise
 * starts from the gateway's Tier 0 and only gains topics loaded after it joined.
 * The swap shows as the agent's state changing with a different current agent.
 * Returns the unsubscribe; a no-op when the flag is off.
 */
export function giveLoadedDomainsToNewAgents(
  session: voice.AgentSession<UserData>,
  firstAgent: voice.Agent<UserData>,
  dynamicToolLoader: {
    getLoadedDomains: () => readonly string[];
    getToolsForDomains: (domains: readonly string[]) => Record<string, unknown>;
  },
  toolUpdaterLog: FallbackLogger
): () => void {
  if (!flagOn('TOOLS_FOLLOW_AGENT')) return () => {};
  const agentNow = agentOnCall(session as unknown as voice.AgentSession<never>, firstAgent);
  let known = agentNow();
  const onState = (): void => {
    const agent = agentNow();
    if (agent === known) return;
    known = agent;
    const domains = dynamicToolLoader.getLoadedDomains();
    if (domains.length === 0) return;
    void updateAgentTools(agent, dynamicToolLoader.getToolsForDomains(domains), { domains })
      .then((updated) => {
        if (updated) toolUpdaterLog.info({ domains }, '🔧 Loaded domains given to the new agent');
      })
      .catch((error: unknown) =>
        toolUpdaterLog.warn({ error: String(error) }, 'Could not give domains to the new agent')
      );
  };
  session.on(voice.AgentSessionEventTypes.AgentStateChanged, onState);
  return () => session.off(voice.AgentSessionEventTypes.AgentStateChanged, onState);
}

/**
 * Agent setup, once per call: hand-offs get the loaded domains
 * (giveLoadedDomainsToNewAgents), and with TOOLS_SAME_TURN the persona agent's
 * llmNode gets this call's loader (agents/personas/same-turn-tools.ts) while
 * every topic domain is imported into the registry in the background, so the
 * first turn that names one finds it. Returns the unsubscribe.
 */
export function wireCallToolLoader(
  session: voice.AgentSession<UserData>,
  firstAgent: voice.Agent<UserData>,
  dynamicToolLoader: Parameters<typeof giveLoadedDomainsToNewAgents>[2] & SameTurnLoader,
  toolUpdaterLog: FallbackLogger
): () => void {
  if (sameTurnToolsEnabled()) {
    registerSameTurnLoader(session, dynamicToolLoader);
    preloadTopicDomains().catch((error: unknown) =>
      toolUpdaterLog.warn({ error: String(error) }, 'Could not preload the topic domains')
    );
  }
  return giveLoadedDomainsToNewAgents(session, firstAgent, dynamicToolLoader, toolUpdaterLog);
}
