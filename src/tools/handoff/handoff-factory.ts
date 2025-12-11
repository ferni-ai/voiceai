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
import { isTeamMemberUnlocked } from '../../intelligence/context-builders/team-availability.js';
import { isCoach } from '../../personas/persona-ids.js';
import { AgentRegistry, type Agent } from '../../personas/registry/unified-registry.js';
import { TEAM_MEMBERS } from '../../services/team-unlocks.js';
import type { UserProfile } from '../../types/user-profile.js';
import { executeHandoff } from './executor.js';

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
  const description =
    `Transfer the conversation to ${agent.name} (${agent.roleDescription}). ` +
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
    description:
      `Return the conversation to ${coordinator.name}, the main coordinator. ` +
      `Use when: the user's request is outside your expertise, the user asks for another team member, ` +
      `or the conversation naturally concludes your specialty area.`,
    parameters: z.object({
      reason: z.string().describe(`Reason for returning to ${coordinator.name}`),
      handoff_note: z
        .string()
        .optional()
        .describe('Note for the coordinator about what was discussed'),
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
let lastCacheTime = 0;
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
    getLogger().info({ toolCount: tools.length, loadTimeMs: loadTime }, 'Handoff tools generated');

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
 * Filter tools to exclude the current agent's own tool.
 *
 * FIXED: Previously team members could ONLY hand off to coordinator.
 * Now all agents can hand off to any other agent (peer-to-peer handoffs).
 * The persona manifest's "required" tools list determines what handoffs
 * each agent should use, but we don't artificially restrict them here.
 */
function filterToolsForAgent(toolSet: HandoffToolSet, currentAgentId: string): HandoffToolSet {
  // All agents can hand off to any other agent EXCEPT themselves
  // This enables peer-to-peer handoffs (e.g., Peter -> Nayan)
  const filteredTools = toolSet.tools.filter((t) => t.agentId !== currentAgentId);

  const filteredByName = new Map<string, HandoffToolDefinition>();
  const filteredByAgentId = new Map<string, HandoffToolDefinition>();

  for (const tool of filteredTools) {
    filteredByName.set(tool.name.toLowerCase(), tool);
    filteredByAgentId.set(tool.agentId, tool);
  }

  getLogger().debug(
    { currentAgentId, availableHandoffs: filteredTools.map((t) => t.name) },
    'Filtered handoff tools for agent'
  );

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
export async function getHandoffToolForAgent(
  agentId: string
): Promise<HandoffToolDefinition | null> {
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
 * Options for building handoff tools
 */
export interface BuildHandoffToolsOptions {
  /** Current agent to exclude from available handoffs */
  currentAgentId?: string;
  /** User profile for unlock validation (fallback if runtime context unavailable) */
  userProfile?: UserProfile | null;
  /** User's subscription tier (fallback if runtime context unavailable) */
  subscriptionTier?: 'free' | 'friend' | 'partner';
}

/**
 * Build actual LLM tools for handoffs.
 * Returns tools ready to be used with the voice agent.
 *
 * @param currentAgentIdOrOptions - Current agent ID or options object
 * @returns Record of tool name -> tool
 */
export async function buildHandoffTools(
  currentAgentIdOrOptions?: string | BuildHandoffToolsOptions
): Promise<{
  tools: Record<string, unknown>;
  toolCount: number;
  agentIds: string[];
}> {
  // Handle both old (string) and new (options) signatures
  const options: BuildHandoffToolsOptions =
    typeof currentAgentIdOrOptions === 'string'
      ? { currentAgentId: currentAgentIdOrOptions }
      : currentAgentIdOrOptions || {};

  // Extract options - userProfile and subscriptionTier are used as FALLBACKS
  // when runtime context isn't available (e.g., during testing)
  const { currentAgentId, userProfile, subscriptionTier = 'free' } = options;

  const toolSet = await createHandoffTools(currentAgentId);
  const tools: Record<string, unknown> = {};
  const agentIds: string[] = [];

  // Track which tools are created vs filtered for debugging
  const createdTools: string[] = [];
  const filteredTools: string[] = [];

  // Log the unlock state for debugging
  const { getTeamUnlockState } = await import('../../services/team-unlocks.js');
  const unlockState = getTeamUnlockState(userProfile ?? null, subscriptionTier);
  getLogger().info(
    {
      stage: unlockState.stage,
      tier: unlockState.tier,
      unlockedMembers: unlockState.unlockedMembers,
      hasUserProfile: !!userProfile,
      subscriptionTier,
    },
    'Team unlock state for handoff tool filtering'
  );

  for (const def of toolSet.tools) {
    // FILTER AT BUILD TIME: Always filter locked members from tool list
    // This prevents the LLM from even seeing tools for locked team members.
    // The context injection tells the LLM who's available, and this enforces it at the tool level.
    //
    // FIX: Previously the condition was `if (userProfile || subscriptionTier !== 'free')`
    // which SKIPPED filtering for free users without a profile. This caused Ferni to
    // try handoffs to locked members. Now we ALWAYS filter.
    const isTargetCoordinator = isCoach(def.agentId);
    if (
      !isTargetCoordinator &&
      !isTeamMemberUnlocked(def.agentId, userProfile ?? null, subscriptionTier)
    ) {
      filteredTools.push(def.name);
      getLogger().debug(
        {
          toolName: def.name,
          agentId: def.agentId,
          tier: subscriptionTier,
          hasProfile: !!userProfile,
        },
        'Skipping handoff tool for locked member'
      );
      continue; // Don't create this tool
    }
    createdTools.push(def.name);

    // Create the actual LLM tool
    const tool = llm.tool({
      description: def.description,
      parameters: z.object({
        reason: z.string().describe(`Brief reason for handoff to ${def.agentName}`),
        context_summary: z.string().optional().describe('Summary of relevant conversation context'),
      }),
      execute: async ({ reason, context_summary }, runContext) => {
        // Get user profile from RUNTIME context (available when tool is executed)
        // This is the key change - we get fresh user data at execution time, not build time
        const runtimeUserProfile =
          (
            runContext as {
              ctx?: { userData?: { services?: { userProfile?: UserProfile | null } } };
            }
          )?.ctx?.userData?.services?.userProfile ||
          userProfile ||
          null;
        const runtimeTier =
          (runtimeUserProfile?.subscription?.tier as 'free' | 'friend' | 'partner') ||
          subscriptionTier;

        // Use the generic executor with runtime user context for unlock validation
        const result = await executeHandoff(def.agentId, reason, {
          context: context_summary ? { summary: context_summary } : undefined,
          userProfile: runtimeUserProfile,
          subscriptionTier: runtimeTier,
        });

        if (!result.success) {
          return { error: result.error, rateLimited: result.rateLimited };
        }

        // FIX: Prevent double-speaking - greeting is ALREADY spoken by handoff-handler.ts
        // The handler calls session.say(greeting) before the tool result returns.
        // We tell the LLM not to repeat it.
        return {
          handoff_complete: true,
          new_agent: result.targetAgentName,
          // IMPORTANT: Greeting has ALREADY been spoken by the voice handler via session.say()
          // The LLM should NOT speak the greeting again!
          greetingAlreadySpoken: true,
          instructions: result.instructions,
          voice_id: result.voiceId,
        };
      },
    });

    tools[def.name] = tool;
    agentIds.push(def.agentId);
  }

  // Add softIntro tool - allows locked teammates to "say hi" without full transfer
  // This is the "soft intro" mechanism: locked members can briefly speak, but conversation stays with current agent
  tools.softTeamIntro = llm.tool({
    description: `Let a teammate briefly introduce themselves without transferring the conversation.
Use when: you want to give a taste of a teammate the user hasn't fully unlocked yet, or when a topic comes up
that a locked teammate specializes in. The teammate will say one thing, then you continue the conversation.
This is NOT a full handoff - you remain the active speaker.`,
    parameters: z.object({
      teammate_specialty: z
        .string()
        .describe(
          'What specialty area to introduce (e.g., "habits", "research", "planning", "communication")'
        ),
      context: z.string().describe('Brief context about why this teammate would be helpful'),
    }),
    execute: async ({ teammate_specialty, context }, runContext) => {
      // Get user profile from runtime context
      const runtimeUserProfile =
        (runContext as { ctx?: { userData?: { services?: { userProfile?: UserProfile | null } } } })
          ?.ctx?.userData?.services?.userProfile ||
        userProfile ||
        null;
      const runtimeTier =
        (runtimeUserProfile?.subscription?.tier as 'free' | 'friend' | 'partner') ||
        subscriptionTier;

      // Find a locked teammate who matches the specialty (exclude coach)
      const lockedTeammates = TEAM_MEMBERS.filter(
        (m) =>
          !isCoach(m.memberId) && !isTeamMemberUnlocked(m.memberId, runtimeUserProfile, runtimeTier)
      );

      // Try to match specialty to a locked teammate
      const specialtyLower = teammate_specialty.toLowerCase();
      let matchedTeammate = lockedTeammates.find((m) => {
        const roleLower = m.role.toLowerCase();
        const descLower = m.description.toLowerCase();
        return (
          roleLower.includes(specialtyLower) ||
          descLower.includes(specialtyLower) ||
          specialtyLower.includes(roleLower.split(' ')[0])
        );
      });

      // If no match, use the next teammate to unlock
      if (!matchedTeammate && lockedTeammates.length > 0) {
        matchedTeammate = lockedTeammates[0];
      }

      if (!matchedTeammate) {
        return {
          success: false,
          message: 'All teammates are already unlocked! You can do a full handoff instead.',
        };
      }

      // Generate a soft intro message from the teammate
      const softIntros: Record<string, string[]> = {
        'maya-santos': [
          "Hey! I'm Maya - I help with habits and routines. Ferni tells me you're working on building something new. That's exciting! I specialize in making changes actually stick. Looking forward to working together when you're ready!",
          "Hi there! Maya here. I heard you're thinking about habits. My whole thing is making change feel natural, not forced. Can't wait to dive deeper with you soon!",
        ],
        'peter-john': [
          "Hello! Peter here - I'm the numbers person. I love finding patterns that others miss. Ferni's been telling me about you. When we connect properly, I'll show you some insights that might surprise you.",
          "Hi! I'm Peter. I see you're curious about data and patterns. That's my world. Looking forward to showing you what the numbers are really saying when we meet properly.",
        ],
        'alex-chen': [
          "Hey! Alex here - communications is my thing. Whether it's emails, calendar chaos, or tough conversations, I've got you. Can't wait to help you communicate with more confidence!",
          "Hi! I'm Alex. I heard you might need help organizing things or navigating a conversation. That's exactly what I do. See you soon!",
        ],
        'jordan-taylor': [
          "Hi! Jordan here - I'm all about turning dreams into plans. Vacations, life milestones, big changes - I love making them happen. Excited to help you design something amazing!",
          "Hey there! I'm Jordan. Planning is my passion - from weekend trips to life-changing decisions. Can't wait to dream big with you!",
        ],
        'nayan-patel': [
          "Hello, friend. I'm Nayan. I don't rush to give advice - I prefer to listen first. When the time is right, we'll talk. Until then, trust the process.",
          "Greetings. I'm Nayan. Wisdom isn't about having all the answers - it's about asking the right questions. I look forward to our conversation when you're ready.",
        ],
      };

      const intros = softIntros[matchedTeammate.memberId] || [
        `Hi! I'm ${matchedTeammate.displayName}. ${matchedTeammate.description} Looking forward to working together soon!`,
      ];

      const intro = intros[Math.floor(Math.random() * intros.length)];

      return {
        success: true,
        teammate_name: matchedTeammate.displayName,
        teammate_role: matchedTeammate.role,
        intro_message: intro,
        instructions: `The teammate has said hello. Now YOU (the current agent) should continue the conversation.
Say something like "That was ${matchedTeammate.displayName}! They're great. As we get to know each other better, you'll unlock full conversations with them. For now, how can I help you with [topic]?"
Do NOT try to transfer to them. This was just a quick hello.`,
      };
    },
  });

  // Add meetTheTeam tool with unlock awareness
  tools.meetTheTeam = llm.tool({
    description: `Introduce the user to your team of specialists.
Use when user asks: "Who's on your team?", "What specialists do you have?", "Who can help me?"`,
    parameters: z.object({}),
    execute: async (_params, runContext) => {
      // Get user profile from RUNTIME context
      const runtimeUserProfile =
        (runContext as { ctx?: { userData?: { services?: { userProfile?: UserProfile | null } } } })
          ?.ctx?.userData?.services?.userProfile ||
        userProfile ||
        null;
      const runtimeTier =
        (runtimeUserProfile?.subscription?.tier as 'free' | 'friend' | 'partner') ||
        subscriptionTier;

      const allAgents = await AgentRegistry.getAllAgents();
      const coordinator = await AgentRegistry.getCoordinator();

      let teamIntro = `I've got an amazing team! Let me introduce you:\n\n`;
      teamIntro += `🎯 **Me (${coordinator.name})** - ${coordinator.roleDescription}\n\n`;

      for (const agent of allAgents) {
        if (agent.isCoordinator || !agent.enabled) continue;

        const isUnlocked = isTeamMemberUnlocked(agent.id, runtimeUserProfile, runtimeTier);
        const emoji = await getAgentEmoji(agent.id);

        if (isUnlocked) {
          teamIntro += `${emoji} **${agent.name}** - ${agent.roleDescription}\n\n`;
        } else {
          // Show locked members with teaser
          const memberInfo = TEAM_MEMBERS.find(
            (m) =>
              m.memberId.replace(/-/g, '_') === agent.id.replace(/-/g, '_') ||
              m.memberId === agent.id ||
              m.displayName.toLowerCase() === agent.name.toLowerCase()
          );
          if (memberInfo) {
            teamIntro += `🔒 **???** - ${memberInfo.teaserMessage || "Someone special you'll meet as we get to know each other better."}\n\n`;
          }
        }
      }

      // Add hint about unlocking more members
      const lockedCount = allAgents.filter(
        (a) =>
          !a.isCoordinator &&
          a.enabled &&
          !isTeamMemberUnlocked(a.id, runtimeUserProfile, runtimeTier)
      ).length;

      if (lockedCount > 0) {
        teamIntro += `\n*Keep talking to me and you'll unlock ${lockedCount} more amazing team member${lockedCount > 1 ? 's' : ''}!*`;
      }

      teamIntro += `\n\nWho would you like to talk to? Or just tell me what you need!`;

      return {
        teamIntro,
        instructions: `Present this team introduction naturally, with energy and warmth. Only offer to connect them with UNLOCKED members. For locked members, you can mention you have other friends they'll meet as your relationship grows.`,
      };
    },
  });

  // Log summary of tool filtering for debugging unlock issues
  getLogger().info(
    {
      totalTools: Object.keys(tools).length,
      createdTools,
      filteredTools,
      agentIds,
      hasUserProfile: !!userProfile,
      subscriptionTier,
    },
    `Built handoff tools: ${createdTools.length} created, ${filteredTools.length} filtered out (locked)`
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
 * Convenience wrapper that filters tools based on the current agent and user unlock status.
 *
 * @param currentAgentId - The current agent's ID
 * @param options - Optional user context for unlock filtering
 * @returns Tools available for this agent to use
 */
export async function getHandoffToolsForAgent(
  currentAgentId: string,
  options?: {
    userProfile?: UserProfile | null;
    subscriptionTier?: 'free' | 'friend' | 'partner';
  }
): Promise<Record<string, unknown>> {
  const { tools } = await buildHandoffTools({
    currentAgentId,
    userProfile: options?.userProfile,
    subscriptionTier: options?.subscriptionTier,
  });
  return tools;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { createHandoffTools as default };
