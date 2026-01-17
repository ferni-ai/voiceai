/**
 * Nayan Agent - Wisdom & Long-Term Perspective
 *
 * Extends PersonaVoiceAgent for shared TTS processing (sanitization, FinOps, interrupt handling).
 * Clean LiveKit 1.0 Implementation with direct domain imports.
 *
 * @see https://docs.livekit.io/agents/build/agents-handoffs
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';

import { createLogger } from '../../utils/safe-logger.js';
import type { ToolContext } from '../../tools/registry/types.js';
import { loadSystemPrompt } from './prompt-loader.js';
import { PersonaVoiceAgent, type PersonaVoiceAgentOptions } from './ferni-agent.js';

const log = createLogger({ module: 'NayanAgent' });

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

// Wisdom tools - Nayan's specialty (from domains)
import { createWisdomTools } from '../../tools/domains/wisdom/wisdom.js';

// Superhuman Wisdom Tools - Nayan's "Better Than Human" capabilities
import { getToolDefinitions as getNayanWisdomTools } from '../../tools/domains/nayan-wisdom/index.js';

// Conversation tools - wrap up, end conversation, graceful exit (from domains)
import { createConversationTools } from '../../tools/domains/conversation/index.js';

import { getToolDescription } from '../../tools/utils/tool-descriptions.js';
// ============================================================================
// TYPES
// ============================================================================

// NayanAgent uses PersonaVoiceAgent's session data type
type ToolSet = llm.ToolContext<Record<string, unknown>>;

// ============================================================================
// TOOL BUILDING HELPERS
// ============================================================================

const minimalServices = {
  has: () => false,
  get: () => {
    throw new Error('Service not available');
  },
  getOptional: () => undefined,
};

function buildMemoryTools(agentId: string): ToolSet {
  const ctx: ToolContext = {
    agentId,
    agentDisplayName: 'Nayan',
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
 * Build wisdom tools - Nayan's specialty.
 * Quotes, perspective, life wisdom, and long-term thinking.
 */
function buildWisdomTools(): ToolSet {
  const wisdom = createWisdomTools();

  return {
    // Quotes and wisdom
    getWisdomQuote: wisdom.getWisdomQuote,
    getBogleQuote: wisdom.getBogleQuote,
    getResearchInsight: wisdom.getResearchInsight,
    getLifeWisdom: wisdom.getLifeWisdom,
    // Historical perspective
    getThisDayInHistory: wisdom.getThisDayInHistory,
    getCrashPerspective: wisdom.getCrashPerspective,
    // Financial wisdom
    getCostImpact: wisdom.getCostImpact,
  } as ToolSet;
}

/**
 * Build Nayan's Superhuman Wisdom tools.
 * These are "Better Than Human" capabilities unique to Nayan:
 * - holdParadox: Track contradictory desires without resolution
 * - mortalityPerspective: Concrete mortality awareness for clarity
 * - generatePersonalKoan: Personalized paradoxes to break patterns
 * - trackEnough: Remember when "enough" was declared
 * - ancestralWisdom: Connect to lineage wisdom
 * - trackWisdomIncubation: Perfect patience for things ripening
 */
async function buildSuperhumanWisdomTools(userId: string): Promise<ToolSet> {
  const toolDefs = await getNayanWisdomTools();
  const ctx: ToolContext = {
    agentId: 'nayan-patel',
    agentDisplayName: 'Nayan',
    userId,
    services: minimalServices,
  };

  const tools: Record<string, unknown> = {};
  for (const def of toolDefs) {
    tools[def.id] = def.create(ctx);
  }

  log.debug({ toolCount: Object.keys(tools).length }, 'Built Nayan superhuman wisdom tools');
  return tools as ToolSet;
}

function buildHandoffTools(): ToolSet {
  return {
    handoffToFerni: llm.tool({
      description: getToolDescription('handoffToFerni'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { FerniAgent } = await import('./ferni-agent.js');
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
          // Fallback
        }

        return llm.handoff({
          agent: new FerniAgent(systemPrompt, { chatCtx: ctx.session.chatCtx }),
          returns: 'Connecting you back to Ferni!',
        });
      },
    }),

    handoffToMaya: llm.tool({
      description: getToolDescription('handoffToMaya'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { MayaAgent } = await import('./maya-agent.js');
        return llm.handoff({
          agent: await MayaAgent.create(ctx.session.chatCtx),
          returns: 'Connecting you with Maya for practical habits!',
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
          returns: 'Connecting you with Alex for practical tasks!',
        });
      },
    }),

    handoffToPeter: llm.tool({
      description: getToolDescription('handoffToPeter'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { PeterAgent } = await import('./peter-agent.js');
        return llm.handoff({
          agent: await PeterAgent.create(ctx.session.chatCtx),
          returns: 'Connecting you with Peter for analysis!',
        });
      },
    }),

    handoffToJordan: llm.tool({
      description: getToolDescription('handoffToJordan'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { JordanAgent } = await import('./jordan-agent.js');
        return llm.handoff({
          agent: await JordanAgent.create(ctx.session.chatCtx),
          returns: 'Connecting you with Jordan for milestones!',
        });
      },
    }),
  } as ToolSet;
}

// ============================================================================
// NAYAN AGENT
// ============================================================================

/**
 * Nayan Patel - Wisdom & Long-Term Perspective
 *
 * Extends PersonaVoiceAgent for shared TTS processing.
 * Rich system prompt loaded from bundles/nayan-patel/identity/system-prompt.md
 */
export class NayanAgent extends PersonaVoiceAgent {
  private static systemPromptCache: string | null = null;

  constructor(systemPrompt: string, tools: ToolSet, options?: PersonaVoiceAgentOptions) {
    // Pass tools to PersonaVoiceAgent (which passes to voice.Agent)
    super(systemPrompt, {
      ...options,
      tools,
      skipGreeting: true, // Greeting handled by handoff-handler.ts
    });

    log.info({ totalTools: Object.keys(tools).length }, 'NayanAgent initialized');
  }

  static async create(chatCtx?: llm.ChatContext, userId?: string): Promise<NayanAgent> {
    if (!NayanAgent.systemPromptCache) {
      NayanAgent.systemPromptCache = await loadSystemPrompt('nayan-patel');
    }

    // Build all tools including superhuman wisdom tools
    const memoryTools = buildMemoryTools('nayan-patel');
    const wisdomTools = buildWisdomTools();
    const handoffTools = buildHandoffTools();
    const conversationTools = createConversationTools();

    // Superhuman wisdom tools (Nayan's "Better Than Human" capabilities)
    let superhumanWisdomTools: ToolSet = {} as ToolSet;
    try {
      superhumanWisdomTools = await buildSuperhumanWisdomTools(userId || 'anonymous');
      log.info({ count: Object.keys(superhumanWisdomTools).length }, 'Loaded Nayan superhuman wisdom tools');
    } catch (err) {
      log.warn({ error: String(err) }, 'Failed to load superhuman wisdom tools (non-blocking)');
    }

    const allTools = {
      ...memoryTools,
      ...wisdomTools,
      ...superhumanWisdomTools,
      ...handoffTools,
      ...conversationTools,
    } as ToolSet;

    return new NayanAgent(NayanAgent.systemPromptCache, allTools, { chatCtx });
  }

  /**
   * Called when Nayan becomes the active agent.
   * NOTE: Greeting handled by handoff-handler.ts to avoid competing systems.
   */
  async onEnter(): Promise<void> {
    log.debug('Nayan onEnter - greeting will be handled by handoff handler');
  }

  async onExit(): Promise<void> {
    log.debug('Transitioning to another agent');
  }
}

export async function createNayanAgent(chatCtx?: llm.ChatContext, userId?: string): Promise<NayanAgent> {
  return NayanAgent.create(chatCtx, userId);
}
