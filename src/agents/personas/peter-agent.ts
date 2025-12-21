/**
 * Peter Agent - Investment Research & Market Analysis
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

const log = createLogger({ module: 'PeterAgent' });

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

// Research tools - Peter's specialty (from domains)
import { createResearchTools, createInsightsAnalysisTools } from '../../tools/domains/agent.js';
import { createMarketDataTools } from '../../tools/domains/financial.js';

// Conversation tools - wrap up, end conversation, graceful exit (from domains)
import { createConversationTools } from '../../tools/domains/conversation/index.js';

import { getToolDescription } from '../../tools/utils/tool-descriptions.js';
// ============================================================================
// TYPES
// ============================================================================

// PeterAgent uses PersonaVoiceAgent's session data type
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
    agentDisplayName: 'Peter',
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
 * Build research/analysis tools - Peter's specialty.
 * Stock research, market data, and pattern analysis.
 */
function buildResearchTools(): ToolSet {
  const research = createResearchTools();
  const marketData = createMarketDataTools();
  const insights = createInsightsAnalysisTools();

  return {
    // Stock research (Peter Lynch style)
    analyzeStock: research.analyzeStock,
    findStockCategory: research.findStockCategory,
    calculatePEGRatio: research.calculatePEGRatio,
    findTenBaggers: research.findTenBaggers,
    explainStockCategory: research.explainStockCategory,
    // Market data
    getStockQuote: marketData.getStockQuote,
    getMarketSummary: marketData.getMarketSummary,
    getCurrentDateTime: marketData.getCurrentDateTime,
    // Insights & pattern analysis
    synthesizeInsights: insights.synthesizeInsights,
    generateBehavioralInsight: insights.generateBehavioralInsight,
    spotAnomalies: insights.spotAnomalies,
    findCorrelation: insights.findCorrelation,
    projectTrends: insights.projectTrends,
    findTheLever: insights.findTheLever,
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
        } catch (err) {
          // Fallback to default prompt if file not found
          process.stderr.write(
            `[peter-agent] Using fallback system prompt: ${err instanceof Error ? err.message : String(err)}\n`
          );
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
          returns: 'Connecting you with Maya for financial wellness!',
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
          returns: 'Connecting you with Alex for scheduling!',
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
          returns: 'Connecting you with Jordan for life planning!',
        });
      },
    }),

    handoffToNayan: llm.tool({
      description: getToolDescription('handoffToNayan'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { NayanAgent } = await import('./nayan-agent.js');
        return llm.handoff({
          agent: await NayanAgent.create(ctx.session.chatCtx),
          returns: 'Connecting you with Nayan for wisdom!',
        });
      },
    }),
  } as ToolSet;
}

// ============================================================================
// PETER AGENT
// ============================================================================

/**
 * Peter John - Investment Research & Market Analysis
 *
 * Extends PersonaVoiceAgent for shared TTS processing.
 * Rich system prompt loaded from bundles/peter-john/identity/system-prompt.md
 */
export class PeterAgent extends PersonaVoiceAgent {
  private static systemPromptCache: string | null = null;

  constructor(systemPrompt: string, options?: PersonaVoiceAgentOptions) {
    const memoryTools = buildMemoryTools('peter-john');
    const researchTools = buildResearchTools();
    const handoffTools = buildHandoffTools();

    const conversationTools = createConversationTools();
    const allTools = {
      ...memoryTools,
      ...researchTools,
      ...handoffTools,
      ...conversationTools,
    } as ToolSet;

    // Pass tools to PersonaVoiceAgent (which passes to voice.Agent)
    super(systemPrompt, {
      ...options,
      tools: allTools,
      skipGreeting: true, // Greeting handled by handoff-handler.ts
    });

    log.info({ totalTools: Object.keys(allTools).length }, 'PeterAgent initialized');
  }

  static async create(chatCtx?: llm.ChatContext): Promise<PeterAgent> {
    if (!PeterAgent.systemPromptCache) {
      PeterAgent.systemPromptCache = await loadSystemPrompt('peter-john');
    }
    return new PeterAgent(PeterAgent.systemPromptCache, { chatCtx });
  }

  /**
   * Called when Peter becomes the active agent.
   * NOTE: Greeting handled by handoff-handler.ts to avoid competing systems.
   */
  async onEnter(): Promise<void> {
    log.debug('Peter onEnter - greeting will be handled by handoff handler');
  }

  async onExit(): Promise<void> {
    log.debug('Transitioning to another agent');
  }
}

export async function createPeterAgent(chatCtx?: llm.ChatContext): Promise<PeterAgent> {
  return PeterAgent.create(chatCtx);
}
