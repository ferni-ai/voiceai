/**
 * Handoff Factory - Dynamic Handoff Tool Generation
 *
 * Automatically generates handoff tools based on discovered agents.
 * No more hardcoded handoff tool definitions!
 *
 * USAGE:
 *   const { tools } = await buildHandoffTools();
 *   // tools is a Record<string, Tool> ready for the LLM
 *
 * HOW IT WORKS:
 *   1. Discovers all agents from bundles/registry
 *   2. Generates a handoff tool for each non-coordinator agent
 *   3. Each tool uses the generic executeHandoff() function
 *   4. Tools are cached and refreshed when agents change
 *
 * ADDING A NEW AGENT:
 *   1. Create the bundle in src/personas/bundles/my-agent/
 *   2. Restart the server
 *   3. Handoff tool is automatically available!
 */

import { llm, log } from '@livekit/agents';
import { z } from 'zod';
import { AgentRegistry, type Agent } from '../../personas/registry/unified-registry.js';
import { executeHandoff, getCurrentAgent, isSameAgent } from './executor.js';

// Safe logger that doesn't throw if not initialized
const getLogger = () => {
  try {
    return log();
  } catch {
    // Fall back to console if LiveKit logger not initialized
    return {
      debug: console.debug.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };
  }
};

// ============================================================================
// TYPES
// ============================================================================

/**
 * A generated handoff tool definition
 */
export interface HandoffToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodTypeAny;
  agentId: string;
  agentName: string;
  handoffTriggers: string[];
}

/**
 * All generated handoff tools
 */
export interface HandoffToolSet {
  tools: HandoffToolDefinition[];
  toolsByName: Map<string, HandoffToolDefinition>;
  toolsByAgentId: Map<string, HandoffToolDefinition>;
  coordinatorId: string;
  generatedAt: Date;
}

// ============================================================================
// TOOL GENERATION
// ============================================================================

/**
 * Generate a handoff tool definition for an agent
 */
function generateHandoffTool(agent: Agent, coordinator: Agent): HandoffToolDefinition {
  // Generate tool name from agent ID (e.g., 'nayan-patel' -> 'handoffToNayan')
  const firstName = agent.name.split(' ')[0];
  const toolName = `handoffTo${firstName}`;

  // Generate description from agent info
  const description = `Transfer the conversation to ${agent.name} (${agent.roleDescription}). ` +
    `Use when the user needs help with: ${agent.handoffTriggers.slice(0, 5).join(', ') || agent.roleDescription}.`;

  // Parameters schema
  const parameters = z.object({
    reason: z.string().describe(`Brief reason for handoff to ${agent.name}`),
    context_summary: z.string().optional().describe('Summary of relevant conversation context'),
    user_intent: z.string().optional().describe('What the user is trying to accomplish'),
  });

  return {
    name: toolName,
    description,
    parameters,
    agentId: agent.id,
    agentName: agent.name,
    handoffTriggers: agent.handoffTriggers,
  };
}

/**
 * Generate the "return to coordinator" tool
 */
function generateReturnToCoordinatorTool(coordinator: Agent): HandoffToolDefinition {
  const toolName = `handoffTo${coordinator.name.split(' ')[0]}`;

  return {
    name: toolName,
    description: `Return the conversation to ${coordinator.name}, the main coordinator. ` +
      `Use when: the user's request is outside your expertise, the user asks for another team member, ` +
      `or the conversation naturally concludes your specialty area.`,
    parameters: z.object({
      reason: z.string().describe(`Reason for returning to ${coordinator.name}`),
      handoff_note: z.string().optional().describe('Note for the coordinator about what was discussed'),
      task_completed: z.boolean().optional().describe('Whether the specialist task was completed'),
    }),
    agentId: coordinator.id,
    agentName: coordinator.name,
    handoffTriggers: ['return to coordinator', 'back to main', 'done with specialist'],
  };
}

// ============================================================================
// CACHE
// ============================================================================

let toolSetCache: HandoffToolSet | null = null;
let lastCacheTime: number = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Create handoff tools for all discovered agents.
 * Results are cached for performance.
 *
 * @param currentAgentId - ID of the current agent (to exclude from tools)
 * @returns HandoffToolSet with all generated tools
 */
export async function createHandoffTools(currentAgentId?: string): Promise<HandoffToolSet> {
  const now = Date.now();

  // Use cache if still valid
  if (toolSetCache && now - lastCacheTime < CACHE_TTL_MS) {
    // Filter out current agent if specified
    if (currentAgentId) {
      return filterToolsForAgent(toolSetCache, currentAgentId);
    }
    return toolSetCache;
  }

  getLogger().debug('Generating handoff tools from discovered agents...');
  const startTime = now;

  try {
    // Get all agents
    const allAgents = await AgentRegistry.getAllAgents();
    const coordinator = await AgentRegistry.getCoordinator();

    const tools: HandoffToolDefinition[] = [];
    const toolsByName = new Map<string, HandoffToolDefinition>();
    const toolsByAgentId = new Map<string, HandoffToolDefinition>();

    // Generate tools for team members (not coordinator)
    for (const agent of allAgents) {
      if (agent.isCoordinator) continue;
      if (!agent.enabled) continue;

      const tool = generateHandoffTool(agent, coordinator);
      tools.push(tool);
      toolsByName.set(tool.name.toLowerCase(), tool);
      toolsByAgentId.set(agent.id, tool);

      getLogger().debug({ toolName: tool.name, agentId: agent.id }, 'Generated handoff tool');
    }

    // Generate return-to-coordinator tool
    const coordinatorTool = generateReturnToCoordinatorTool(coordinator);
    tools.push(coordinatorTool);
    toolsByName.set(coordinatorTool.name.toLowerCase(), coordinatorTool);
    toolsByAgentId.set(coordinator.id, coordinatorTool);

    // Create tool set
    const toolSet: HandoffToolSet = {
      tools,
      toolsByName,
      toolsByAgentId,
      coordinatorId: coordinator.id,
      generatedAt: new Date(),
    };

    // Update cache
    toolSetCache = toolSet;
    lastCacheTime = now;

    const loadTime = Date.now() - startTime;
    getLogger().info(
      { toolCount: tools.length, loadTimeMs: loadTime },
      'Handoff tools generated'
    );

    // Filter for current agent if specified
    if (currentAgentId) {
      return filterToolsForAgent(toolSet, currentAgentId);
    }

    return toolSet;
  } catch (err) {
    getLogger().error({ error: err }, 'Failed to generate handoff tools');
    throw err;
  }
}

/**
 * Filter tools to exclude the current agent's own tool
 * and adjust based on whether we're the coordinator or not
 */
function filterToolsForAgent(toolSet: HandoffToolSet, currentAgentId: string): HandoffToolSet {
  const isCoordinator = currentAgentId === toolSet.coordinatorId;

  // If we're the coordinator, we can handoff to any team member
  // If we're a team member, we can only return to coordinator
  const filteredTools = isCoordinator
    ? toolSet.tools.filter((t) => t.agentId !== currentAgentId)
    : toolSet.tools.filter((t) => t.agentId === toolSet.coordinatorId);

  const filteredByName = new Map<string, HandoffToolDefinition>();
  const filteredByAgentId = new Map<string, HandoffToolDefinition>();

  for (const tool of filteredTools) {
    filteredByName.set(tool.name.toLowerCase(), tool);
    filteredByAgentId.set(tool.agentId, tool);
  }

  return {
    tools: filteredTools,
    toolsByName: filteredByName,
    toolsByAgentId: filteredByAgentId,
    coordinatorId: toolSet.coordinatorId,
    generatedAt: toolSet.generatedAt,
  };
}

/**
 * Get a specific handoff tool by name
 */
export async function getHandoffTool(toolName: string): Promise<HandoffToolDefinition | null> {
  const toolSet = await createHandoffTools();
  return toolSet.toolsByName.get(toolName.toLowerCase()) || null;
}

/**
 * Get the handoff tool for a specific agent
 */
export async function getHandoffToolForAgent(agentId: string): Promise<HandoffToolDefinition | null> {
  const toolSet = await createHandoffTools();
  return toolSet.toolsByAgentId.get(agentId) || null;
}

/**
 * Find which agent a handoff request is targeting based on trigger keywords
 */
export async function findHandoffTarget(userMessage: string): Promise<Agent | null> {
  const toolSet = await createHandoffTools();
  const messageLower = userMessage.toLowerCase();

  for (const tool of toolSet.tools) {
    for (const trigger of tool.handoffTriggers) {
      if (messageLower.includes(trigger.toLowerCase())) {
        const agent = await AgentRegistry.getAgentOrNull(tool.agentId);
        if (agent) {
          getLogger().debug(
            { trigger, agentId: tool.agentId },
            'Found handoff target from trigger'
          );
          return agent;
        }
      }
    }
  }

  return null;
}

/**
 * Get tool names for a Zod enum (useful for LLM function calling)
 */
export async function getHandoffToolNames(currentAgentId?: string): Promise<string[]> {
  const toolSet = await createHandoffTools(currentAgentId);
  return toolSet.tools.map((t) => t.name);
}

/**
 * Clear the handoff tool cache
 * Call this when agents are added/removed
 */
export function clearHandoffToolCache(): void {
  toolSetCache = null;
  lastCacheTime = 0;
  getLogger().debug('Handoff tool cache cleared');
}

/**
 * Check if a tool name is a handoff tool
 */
export function isHandoffToolName(toolName: string): boolean {
  return toolName.toLowerCase().startsWith('handoffto');
}

/**
 * Extract agent name from handoff tool name
 * e.g., 'handoffToJack' -> 'Jack'
 */
export function getAgentNameFromToolName(toolName: string): string | null {
  const match = toolName.match(/^handoffTo(.+)$/i);
  return match ? match[1] : null;
}

// ============================================================================
// LLM TOOL GENERATION (NEW)
// ============================================================================

/**
 * Build actual LLM tools for handoffs.
 * Returns tools ready to be used with the voice agent.
 *
 * @param currentAgentId - Current agent to exclude from available handoffs
 * @returns Record of tool name -> tool
 */
export async function buildHandoffTools(
  currentAgentId?: string
): Promise<{
  tools: Record<string, unknown>;
  toolCount: number;
  agentIds: string[];
}> {
  const toolSet = await createHandoffTools(currentAgentId);
  const tools: Record<string, unknown> = {};
  const agentIds: string[] = [];

  for (const def of toolSet.tools) {
    // Create the actual LLM tool
    const tool = llm.tool({
      description: def.description,
      parameters: z.object({
        reason: z.string().describe(`Brief reason for handoff to ${def.agentName}`),
        context_summary: z.string().optional().describe('Summary of relevant conversation context'),
      }),
      execute: async ({ reason, context_summary }) => {
        // Use the generic executor
        const result = await executeHandoff(def.agentId, reason, {
          context: context_summary ? { summary: context_summary } : undefined,
        });

        if (!result.success) {
          return { error: result.error, rateLimited: result.rateLimited };
        }

        return {
          handoff_complete: true,
          new_agent: result.targetAgentName,
          greeting: result.greeting,
          instructions: result.instructions,
          voice_id: result.voiceId,
        };
      },
    });

    tools[def.name] = tool;
    agentIds.push(def.agentId);
  }

  // Add meetTheTeam tool
  tools.meetTheTeam = llm.tool({
    description: `Introduce the user to your team of specialists.
Use when user asks: "Who's on your team?", "What specialists do you have?", "Who can help me?"`,
    parameters: z.object({}),
    execute: async () => {
      const allAgents = await AgentRegistry.getAllAgents();
      const coordinator = await AgentRegistry.getCoordinator();

      let teamIntro = `I've got an amazing team! Let me introduce you:\n\n`;
      teamIntro += `🎯 **Me (${coordinator.name})** - ${coordinator.roleDescription}\n\n`;

      for (const agent of allAgents) {
        if (agent.isCoordinator || !agent.enabled) continue;
        const emoji = await getAgentEmoji(agent.id);
        teamIntro += `${emoji} **${agent.name}** - ${agent.roleDescription}\n\n`;
      }

      teamIntro += `Who would you like to talk to? Or just tell me what you need!`;

      return {
        teamIntro,
        instructions: `Present this team introduction naturally, with energy and warmth. Then ask who they'd like to meet.`,
      };
    },
  });

  getLogger().info(
    { toolCount: Object.keys(tools).length, agentIds },
    'Built handoff tools'
  );

  return {
    tools,
    toolCount: Object.keys(tools).length,
    agentIds,
  };
}

/**
 * Get an emoji for an agent based on their role.
 *
 * REFACTORED: Now uses AgentDirectory which derives emoji from agent domains.
 * No hardcoded emoji map - new agents get emojis automatically!
 */
async function getAgentEmoji(agentId: string): Promise<string> {
  const { AgentDirectory } = await import('../../personas/agent-directory.js');
  return AgentDirectory.getEmoji(agentId);
}

/**
 * Get handoff tools for a specific agent.
 * Convenience wrapper that filters tools based on the current agent.
 *
 * @param currentAgentId - The current agent's ID
 * @returns Tools available for this agent to use
 */
export async function getHandoffToolsForAgent(
  currentAgentId: string
): Promise<Record<string, unknown>> {
  const { tools } = await buildHandoffTools(currentAgentId);
  return tools;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { createHandoffTools as default };

