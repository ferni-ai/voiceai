/**
 * Test helper: a call's first agent built as agent setup builds it, and a
 * caller turn's request built as PersonaVoiceAgent.llmNode builds it.
 *
 * - Agent: the essential tool set, the always-on tools and the initial cap
 *   (agent-setup.ts), then the session loader and its post-greeting update
 *   through the real updateAgentTools, then wireCallToolLoader.
 * - Turn: toolsForTurn, the tool step of llmNode, with a fresh reply tool
 *   context as the SDK makes one per reply (AgentActivity.tools); the reply
 *   runs its tool calls against that same context.
 */
import { llm } from '@livekit/agents';
import { vi } from 'vitest';
import { capToolsToLimit } from '../../../config/tool-config.js';
import { createSessionToolLoader } from '../../../tools/dynamic-loader/index.js';
import { buildEssentialToolSet } from '../../multi-agent/essential-tool-set.js';
import { withAlwaysOnTools } from '../../multi-agent/everyday-basics.js';
import { DEFAULT_INITIAL_TOOL_LIMIT } from '../../multi-agent/initial-tools.js';
import { updateAgentTools } from '../../shared/tool-updater.js';
import { wireCallToolLoader } from '../../voice-agent/deferred-tool-update.js';
import { rememberDispatchIdentity } from '../../voice-agent-entry/caller-recognition.js';
import { preloadTopicDomains } from '../same-turn-tools.js';
import { toolsForTurn } from '../turn-request.js';

export interface FakeAgent {
  toolCtx: llm.ToolContext;
  updateTools(tools: Record<string, unknown>): Promise<void>;
}

const log = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };

export async function startCall(userId: string) {
  const ctx = { userId, sessionId: `s-${userId}`, agentId: 'ferni', agentDisplayName: 'Ferni' };
  const { tools } = await buildEssentialToolSet({ personaId: 'ferni', userId, services: {} });
  const initial = capToolsToLimit(
    await withAlwaysOnTools(tools, ctx, false),
    DEFAULT_INITIAL_TOOL_LIMIT
  );
  const agent: FakeAgent = {
    toolCtx: new llm.ToolContext(initial as never),
    async updateTools(next) {
      this.toolCtx = new llm.ToolContext(next as never);
    },
  };
  const loader = createSessionToolLoader({ enableAutoUnload: false });
  await loader.initialize({ ...ctx, services: undefined } as never);
  await updateAgentTools(agent as never, loader.getCurrentTools(), {
    domains: loader.getLoadedDomains(),
  });
  // A signed-in owner: a caller who isn't one loses the tools that reach other people.
  rememberDispatchIdentity(ctx.sessionId, 'firebase', '{}');
  const userData = { userId, services: { sessionId: ctx.sessionId } };
  const session = { userData, on: vi.fn(), off: vi.fn() };
  wireCallToolLoader(session as never, agent as never, loader, log as never);
  await preloadTopicDomains(); // wireCallToolLoader started it; wait for it here
  return {
    agent,
    session,
    loader,
    initialNames: Object.keys(initial),
    initialCount: Object.keys(initial).length,
  };
}

export type Call = Awaited<ReturnType<typeof startCall>>;

/** One caller turn: the tools its request carries, the reply's own, the agent's. */
export async function turn(call: Call, said: string) {
  const chatCtx = llm.ChatContext.empty();
  chatCtx.addMessage({ role: 'user', content: said });
  const replyTools = new llm.ToolContext(call.agent.toolCtx.tools as never);
  const request = await toolsForTurn(call.session, chatCtx, replyTools, {
    loggedLockedHandoffs: true,
    agent: call.agent,
  });
  return {
    request: Object.keys(request.functionTools),
    reply: Object.keys(replyTools.functionTools),
    agent: Object.keys(call.agent.toolCtx.functionTools),
  };
}
