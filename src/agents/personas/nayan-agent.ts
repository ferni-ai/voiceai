/**
 * Nayan Agent - Wisdom & Long-Term Perspective
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
import { createWisdomTools } from '../../tools/domains/information.js';

// Conversation tools - wrap up, end conversation, graceful exit (from domains)
import { createConversationTools } from '../../tools/domains/conversation/index.js';

import { getToolDescription } from '../../tools/utils/tool-descriptions.js';
// ============================================================================
// TYPES
// ============================================================================

interface NayanSessionData {
  userId?: string;
  userName?: string;
  personaId?: string;
  [key: string]: unknown;
}

type ToolSet = llm.ToolContext<NayanSessionData>;

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
 * Rich system prompt loaded from bundles/nayan-patel/identity/system-prompt.md
 */
export class NayanAgent extends voice.Agent<NayanSessionData> {
  private static systemPromptCache: string | null = null;

  constructor(systemPrompt: string, chatCtx?: llm.ChatContext) {
    const memoryTools = buildMemoryTools('nayan-patel');
    const wisdomTools = buildWisdomTools();
    const handoffTools = buildHandoffTools();

    const conversationTools = createConversationTools();
    const allTools = {
      ...memoryTools,
      ...wisdomTools,
      ...handoffTools,
      ...conversationTools,
    } as ToolSet;

    super({
      instructions: systemPrompt,
      chatCtx,
      tools: allTools,
    });

    process.stderr.write(`[NayanAgent] Initialized with ${Object.keys(allTools).length} tools\n`);
  }

  static async create(chatCtx?: llm.ChatContext): Promise<NayanAgent> {
    if (!NayanAgent.systemPromptCache) {
      NayanAgent.systemPromptCache = await loadSystemPrompt('nayan-patel');
    }
    return new NayanAgent(NayanAgent.systemPromptCache, chatCtx);
  }

  /**
   * Called when Nayan becomes the active agent.
   * NOTE: Greeting handled by handoff-handler.ts to avoid competing systems.
   */
  async onEnter(): Promise<void> {
    log.debug('Nayan onEnter - greeting will be handled by handoff handler');
  }

  async onExit(): Promise<void> {
    process.stderr.write(`[NayanAgent] Transitioning to another agent\n`);
  }
}

export async function createNayanAgent(chatCtx?: llm.ChatContext): Promise<NayanAgent> {
  return NayanAgent.create(chatCtx);
}
