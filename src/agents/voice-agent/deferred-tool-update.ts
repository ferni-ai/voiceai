/**
 * Registering tools that a topic just loaded with the agent, mid-session
 * (transcript-handler.ts, dynamic tool loading).
 *
 * @module voice-agent/deferred-tool-update
 */

import type { voice } from '@livekit/agents';
import type { FallbackLogger } from '../../utils/safe-logger.js';
import { applyAfterReplyStarts, updateAgentTools } from '../shared/tool-updater.js';
import type { UserData } from '../shared/types.js';

/**
 * Give the agent the loader's current tools once this reply has started.
 *
 * Changing the tool set as the turn ends voids LiveKit's preemptive reply
 * (it's reused only if the tools are unchanged), so every reply waited the
 * full LLM time after the caller stopped. Applied after the reply starts, the
 * new tools serve the next turn. DEFER_TOOL_UPDATES=off applies them at once,
 * and the returned promise waits for that.
 */
export async function updateToolsAfterReplyStarts(
  session: voice.AgentSession<UserData>,
  agent: voice.Agent<UserData>,
  dynamicToolLoader: { getCurrentTools: () => Record<string, unknown> },
  loadedDomains: string[],
  toolUpdaterLog: FallbackLogger
): Promise<void> {
  const apply = async (): Promise<void> => {
    try {
      const newTools = dynamicToolLoader.getCurrentTools();
      const updated = await updateAgentTools(agent, newTools, {
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
