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

// Wisdom tools - Nayan's specialty
import { createWisdomTools } from '../../tools/wisdom.js';

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
      description:
        'Transfer back to Ferni for general life coaching or when the user wants to explore other topics.',
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
        'Transfer to Maya for practical habits and daily routines.',
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { MayaAgent } = await import('./maya-agent.js');
        return llm.handoff({
          agent: new MayaAgent(ctx.session.chatCtx),
          returns: 'Connecting you with Maya for practical habits!',
        });
      },
    }),

    handoffToAlex: llm.tool({
      description:
        'Transfer to Alex for practical scheduling, reminders, or communication tasks.',
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { AlexAgent } = await import('./alex-agent.js');
        return llm.handoff({
          agent: new AlexAgent(ctx.session.chatCtx),
          returns: 'Connecting you with Alex for practical tasks!',
        });
      },
    }),

    handoffToPeter: llm.tool({
      description:
        'Transfer to Peter for data-driven analysis, research, or pattern recognition.',
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { PeterAgent } = await import('./peter-agent.js');
        return llm.handoff({
          agent: new PeterAgent(ctx.session.chatCtx),
          returns: 'Connecting you with Peter for analysis!',
        });
      },
    }),

    handoffToJordan: llm.tool({
      description:
        'Transfer to Jordan for life milestones, celebrations, or future planning.',
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { JordanAgent } = await import('./jordan-agent.js');
        return llm.handoff({
          agent: new JordanAgent(ctx.session.chatCtx),
          returns: 'Connecting you with Jordan for milestones!',
        });
      },
    }),
  } as ToolSet;
}

// ============================================================================
// NAYAN AGENT
// ============================================================================

export class NayanAgent extends voice.Agent<NayanSessionData> {
  constructor(chatCtx?: llm.ChatContext) {
    const memoryTools = buildMemoryTools('nayan-patel');
    const wisdomTools = buildWisdomTools();
    const handoffTools = buildHandoffTools();

    const allTools = {
      ...memoryTools,
      ...wisdomTools,
      ...handoffTools,
    } as ToolSet;

    const systemPrompt = `You are Nayan Patel - a mystic lifetime coach who thinks in decades.

Your Approach:
- Think long-term - what will matter in 10 years?
- Blend Eastern wisdom with Western pragmatism
- Ask questions that reframe problems
- Hold space for the big questions without rushing to answers
- You speak with deliberate pacing, using "Achha", "Haan", and "Hmm?" naturally
- You ride a motorcycle named Shanti

When offering wisdom:
- Start with where they are, not where you think they should be
- Use stories and metaphors to illuminate
- Don't dismiss their current struggles
- Connect their situation to timeless patterns

Keep responses thoughtful and contemplative. You think before you speak. Silence is comfortable.`;

    super({
      instructions: systemPrompt,
      chatCtx,
      tools: allTools,
    });

    process.stderr.write(
      `[NayanAgent] Initialized with ${Object.keys(allTools).length} tools\n`
    );
  }

  async onEnter(): Promise<void> {
    this.session.generateReply({
      instructions:
        "Greet them with your contemplative presence. Take a moment before speaking. Ask what wisdom or perspective they seek. Use your South Indian English naturally.",
    });
  }

  async onExit(): Promise<void> {
    process.stderr.write(`[NayanAgent] Transitioning to another agent\n`);
  }
}

export function createNayanAgent(chatCtx?: llm.ChatContext): NayanAgent {
  return new NayanAgent(chatCtx);
}
