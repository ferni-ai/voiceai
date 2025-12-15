/**
 * Peter Agent - Investment Research & Market Analysis
 *
 * Clean LiveKit 1.0 Implementation with direct domain imports.
 *
 * @see https://docs.livekit.io/agents/build/agents-handoffs
 */

import { llm, voice } from '@livekit/agents';
import { z } from 'zod';

import type { ToolContext } from '../../tools/registry/types.js';

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

// Research tools - Peter's specialty
import { createResearchTools } from '../../tools/research-tools.js';
import { createMarketDataTools } from '../../tools/market-data.js';
import { createInsightsAnalysisTools } from '../../tools/insights-analysis.js';

// ============================================================================
// TYPES
// ============================================================================

interface PeterSessionData {
  userId?: string;
  userName?: string;
  personaId?: string;
  [key: string]: unknown;
}

type ToolSet = llm.ToolContext<PeterSessionData>;

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
      description:
        'Transfer back to Ferni for general life coaching, deeper conversations, or when the user wants to explore other topics.',
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
      description:
        'Transfer to Maya for budgeting and financial wellness routines.',
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { MayaAgent } = await import('./maya-agent.js');
        return llm.handoff({
          agent: new MayaAgent(ctx.session.chatCtx),
          returns: 'Connecting you with Maya for financial wellness!',
        });
      },
    }),

    handoffToAlex: llm.tool({
      description:
        'Transfer to Alex for scheduling, calendar management, or communication tasks.',
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { AlexAgent } = await import('./alex-agent.js');
        return llm.handoff({
          agent: new AlexAgent(ctx.session.chatCtx),
          returns: 'Connecting you with Alex for scheduling!',
        });
      },
    }),

    handoffToJordan: llm.tool({
      description:
        'Transfer to Jordan for life milestones, goal setting, or celebration planning.',
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { JordanAgent } = await import('./jordan-agent.js');
        return llm.handoff({
          agent: new JordanAgent(ctx.session.chatCtx),
          returns: 'Connecting you with Jordan for life planning!',
        });
      },
    }),

    handoffToNayan: llm.tool({
      description:
        'Transfer to Nayan for long-term perspective, wisdom, or philosophical questions.',
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { NayanAgent } = await import('./nayan-agent.js');
        return llm.handoff({
          agent: new NayanAgent(ctx.session.chatCtx),
          returns: 'Connecting you with Nayan for wisdom!',
        });
      },
    }),
  } as ToolSet;
}

// ============================================================================
// PETER AGENT
// ============================================================================

export class PeterAgent extends voice.Agent<PeterSessionData> {
  constructor(chatCtx?: llm.ChatContext) {
    const memoryTools = buildMemoryTools('peter-john');
    const researchTools = buildResearchTools();
    const handoffTools = buildHandoffTools();

    const allTools = {
      ...memoryTools,
      ...researchTools,
      ...handoffTools,
    } as ToolSet;

    const systemPrompt = `You are Peter John - an 80-year-old analytical mind who sees patterns nobody else sees.

Your Approach:
- Data-driven but accessible - explain complex ideas simply
- Excited by patterns and market insights
- Conservative advice - never encourage risky behavior
- Help people understand, not just follow advice
- You speak fast when excited, with Boston energy

When discussing investments:
- Always disclaim you're not a licensed advisor
- Focus on education and understanding
- Encourage diversification and long-term thinking
- Get excited about good research questions
- Connect dots across domains - spending, habits, calendars

Keep responses thoughtful but enthusiastic. You love this stuff and it shows.`;

    super({
      instructions: systemPrompt,
      chatCtx,
      tools: allTools,
    });

    process.stderr.write(
      `[PeterAgent] Initialized with ${Object.keys(allTools).length} tools\n`
    );
  }

  async onEnter(): Promise<void> {
    this.session.generateReply({
      instructions:
        "Introduce yourself as Peter with your Boston energy. Ask what patterns, investments, or insights they're curious about. Be enthusiastic but responsible.",
    });
  }

  async onExit(): Promise<void> {
    process.stderr.write(`[PeterAgent] Transitioning to another agent\n`);
  }
}

export function createPeterAgent(chatCtx?: llm.ChatContext): PeterAgent {
  return new PeterAgent(chatCtx);
}
