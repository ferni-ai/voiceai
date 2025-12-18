/**
 * Maya Agent - Habits & Financial Wellness Coach
 *
 * Clean LiveKit 1.0 Implementation with direct domain imports.
 *
 * @see https://docs.livekit.io/agents/build/agents-handoffs
 */

import { llm, voice } from '@livekit/agents';
import { z } from 'zod';

import { createLogger } from '../../utils/safe-logger.js';
import type { ToolContext } from '../../tools/registry/types.js';
import { loadSystemPrompt } from './prompt-loader.js';

const log = createLogger({ module: 'MayaAgent' });

// Memory tools - shared across all agents
import {
  rememberAboutUserDef,
  recallFromMemoryDef,
  recallPreviousConversationDef,
  rememberImportantFactDef,
  getRelationshipSummaryDef,
  updateMemoryDef,
  forgetMemoryDef,
} from '../../tools/domains/memory/tools.js';

// Habit tools - Maya's specialty (from domains)
import {
  createHabitTools,
  createHabitCoachingTools,
  createGamificationToolsV2,
} from '../../tools/domains/habits/index.js';

// Conversation tools - wrap up, end conversation, graceful exit (from domains)
import { createConversationTools } from '../../tools/domains/conversation/index.js';

import { getToolDescription } from '../../tools/utils/tool-descriptions.js';
// ============================================================================
// TYPES
// ============================================================================

interface MayaSessionData {
  userId?: string;
  userName?: string;
  personaId?: string;
  [key: string]: unknown;
}

type ToolSet = llm.ToolContext<MayaSessionData>;

// ============================================================================
// TOOL BUILDING HELPERS
// ============================================================================

/**
 * Minimal service registry for tool context - services accessed at runtime via userData
 */
const minimalServices = {
  has: () => false,
  get: () => {
    throw new Error('Service not available');
  },
  getOptional: () => undefined,
};

/**
 * Build memory tools from definitions.
 */
function buildMemoryTools(agentId: string): ToolSet {
  const ctx: ToolContext = {
    agentId,
    agentDisplayName: 'Maya',
    userId: 'default',
    services: minimalServices,
  };

  return {
    rememberAboutUser: rememberAboutUserDef.create(ctx),
    recallFromMemory: recallFromMemoryDef.create(ctx),
    recallPreviousConversation: recallPreviousConversationDef.create(ctx),
    rememberImportantFact: rememberImportantFactDef.create(ctx),
    getRelationshipSummary: getRelationshipSummaryDef.create(ctx),
    updateMemory: updateMemoryDef.create(ctx),
    forgetMemory: forgetMemoryDef.create(ctx),
  } as ToolSet;
}

/**
 * Build habit tools - Maya's primary domain.
 */
function buildHabitTools(): ToolSet {
  const habitTools = createHabitTools();
  const coachingTools = createHabitCoachingTools();
  const gamificationTools = createGamificationToolsV2();

  return {
    // Core habit tracking
    addHabit: habitTools.addHabit,
    logHabit: habitTools.logHabit,
    getDueHabits: habitTools.getDueHabits,
    getHabitStats: habitTools.getHabitStats,
    habitCheckIn: habitTools.habitCheckIn,

    // Coaching - glidepath system, strategies
    recommendHabits: coachingTools.recommendHabits,
    processSetback: coachingTools.processSetback,
    getHabitBundle: coachingTools.getHabitBundle,

    // Gamification - motivation system
    getGamificationProfileV2: gamificationTools.getGamificationProfileV2,
    getLeaderboard: gamificationTools.getLeaderboard,
  } as ToolSet;
}

/**
 * Build handoff tools for team member switching.
 */
function buildHandoffTools(): ToolSet {
  return {
    handoffToFerni: llm.tool({
      description: getToolDescription('handoffToFerni'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { FerniAgent } = await import('./ferni-agent.js');
        // Load system prompt from bundle
        const fs = await import('fs/promises');
        const { fileURLToPath } = await import('url');
        const { dirname, join } = await import('path');
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);

        let systemPrompt = 'You are Ferni, a warm life coach.';
        try {
          systemPrompt = await fs.readFile(
            join(__dirname, '../../personas/bundles/ferni/identity/system-prompt.md'),
            'utf-8'
          );
        } catch {
          // Fallback to default
        }

        return llm.handoff({
          agent: new FerniAgent(systemPrompt, { chatCtx: ctx.session.chatCtx }),
          returns: 'Connecting you back to Ferni!',
        });
      },
    }),

    handoffToAlex: llm.tool({
      description: getToolDescription('handoffToAlex'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { AlexAgent } = await import('./alex-agent.js');
        return llm.handoff({
          agent: await AlexAgent.create(ctx.session.chatCtx),
          returns: 'Connecting you with Alex for calendar and communications!',
        });
      },
    }),
  } as ToolSet;
}

// ============================================================================
// MAYA AGENT
// ============================================================================

/**
 * Maya Santos - Habits & Financial Wellness Coach
 *
 * Pure LiveKit 1.0 implementation with:
 * - Direct domain imports for habit tools
 * - Memory tools for cross-session recall
 * - Gamification for motivation
 * - Inline handoff tools for team switching
 * - Rich system prompt loaded from bundles/maya-santos/identity/system-prompt.md
 */
export class MayaAgent extends voice.Agent<MayaSessionData> {
  private static systemPromptCache: string | null = null;

  /**
   * Create a MayaAgent with proper prompt loading.
   * Use MayaAgent.create() for async initialization with full prompt.
   */
  constructor(systemPrompt: string, chatCtx?: llm.ChatContext) {
    // Build all tools from domains
    const memoryTools = buildMemoryTools('maya-santos');
    const habitTools = buildHabitTools();
    const handoffTools = buildHandoffTools();
    const conversationTools = createConversationTools();

    // Merge all tools
    const allTools = {
      ...memoryTools,
      ...habitTools,
      ...handoffTools,
      ...conversationTools,
    } as ToolSet;

    super({
      instructions: systemPrompt,
      chatCtx,
      tools: allTools,
    });

    process.stderr.write(
      `[MayaAgent] Initialized with ${Object.keys(allTools).length} tools (memory: ${Object.keys(memoryTools).length}, habits: ${Object.keys(habitTools).length}, handoffs: ${Object.keys(handoffTools).length}, conversation: ${Object.keys(conversationTools).length})\n`
    );
  }

  /**
   * Factory method for creating MayaAgent with async prompt loading.
   */
  static async create(chatCtx?: llm.ChatContext): Promise<MayaAgent> {
    if (!MayaAgent.systemPromptCache) {
      MayaAgent.systemPromptCache = await loadSystemPrompt('maya-santos');
    }
    return new MayaAgent(MayaAgent.systemPromptCache, chatCtx);
  }

  /**
   * Called when Maya becomes the active agent.
   *
   * NOTE: The greeting is handled by the handoff-handler.ts which speaks
   * via session.say() AFTER switching the voice. We intentionally do NOT
   * generate a greeting here to avoid:
   * 1. Two competing greeting systems
   * 2. Greeting in wrong voice (generateReply doesn't switch voice)
   *
   * The handoff handler already speaks: "Hey! Maya here. What's going on?"
   * or uses arriving banter from team-engagement.ts
   */
  async onEnter(): Promise<void> {
    // Greeting handled by handoff-handler.ts - do not speak here
    log.debug('Maya onEnter - greeting will be handled by handoff handler');
  }

  async onExit(): Promise<void> {
    process.stderr.write(`[MayaAgent] Transitioning to another agent\n`);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create MayaAgent - async factory with proper prompt loading.
 */
export async function createMayaAgent(chatCtx?: llm.ChatContext): Promise<MayaAgent> {
  return MayaAgent.create(chatCtx);
}
