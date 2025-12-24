/**
 * Jordan Agent - Life Planning & Milestone Celebrations
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

const log = createLogger({ module: 'JordanAgent' });

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

// Life planning tools - Jordan's specialty (from domains)
import { createGoalManagementTools } from '../../tools/domains/life-planning/goal-management.js';
import { createEventPlanningTools } from '../../tools/domains/life-planning/event-planning.js';
import { createLifeFirstsTools } from '../../tools/domains/life-planning/life-firsts-tracker.js';

// Conversation tools - wrap up, end conversation, graceful exit (from domains)
import { createConversationTools } from '../../tools/domains/conversation/index.js';

import { getToolDescription } from '../../tools/utils/tool-descriptions.js';
// ============================================================================
// TYPES
// ============================================================================

// JordanAgent uses PersonaVoiceAgent's session data type
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
    agentDisplayName: 'Jordan',
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
 * Build life-planning tools - Jordan's specialty.
 * Goals, milestones, events, and life celebrations.
 */
function buildLifePlanningTools(): ToolSet {
  const goals = createGoalManagementTools();
  const events = createEventPlanningTools();
  const lifeFirsts = createLifeFirstsTools();

  return {
    // Goal management
    createGoal: goals.createGoal,
    updateGoalProgress: goals.updateGoalProgress,
    getGoalsSummary: goals.getGoalsSummary,
    getLifePortfolio: goals.getLifePortfolio,
    runQuarterlyReview: goals.runQuarterlyReview,
    addGoalReflection: goals.addGoalReflection,
    // Event planning
    createEvent: events.createEvent,
    getEventSummary: events.getEventSummary,
    addGuests: events.addGuests,
    getChecklist: events.getChecklist,
    trackExpense: events.trackExpense,
    planMajorPurchase: events.planMajorPurchase,
    planVacation: events.planVacation,
    // Life milestones (firsts)
    createLifeMilestone: lifeFirsts.createLifeMilestone,
    viewLifeMilestones: lifeFirsts.viewLifeMilestones,
    getMilestoneTips: lifeFirsts.getMilestoneTips,
    getMilestoneCountdown: lifeFirsts.getMilestoneCountdown,
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
            `[jordan-agent] Using fallback system prompt: ${err instanceof Error ? err.message : String(err)}\n`
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
          returns: 'Connecting you with Maya for habit building!',
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

    handoffToPeter: llm.tool({
      description: getToolDescription('handoffToPeter'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { PeterAgent } = await import('./peter-agent.js');
        return llm.handoff({
          agent: await PeterAgent.create(ctx.session.chatCtx),
          returns: 'Connecting you with Peter for investment insights!',
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
          returns: 'Connecting you with Nayan for perspective!',
        });
      },
    }),
  } as ToolSet;
}

// ============================================================================
// JORDAN AGENT
// ============================================================================

/**
 * Jordan Taylor - Life Planning & Milestone Celebrations
 *
 * Extends PersonaVoiceAgent for shared TTS processing.
 * Rich system prompt loaded from bundles/jordan-taylor/identity/system-prompt.md
 */
export class JordanAgent extends PersonaVoiceAgent {
  private static systemPromptCache: string | null = null;

  constructor(systemPrompt: string, options?: PersonaVoiceAgentOptions) {
    const memoryTools = buildMemoryTools('jordan-taylor');
    const lifePlanningTools = buildLifePlanningTools();
    const handoffTools = buildHandoffTools();

    const conversationTools = createConversationTools();
    const allTools = {
      ...memoryTools,
      ...lifePlanningTools,
      ...handoffTools,
      ...conversationTools,
    } as ToolSet;

    // Pass tools to PersonaVoiceAgent (which passes to voice.Agent)
    super(systemPrompt, {
      ...options,
      tools: allTools,
      skipGreeting: true, // Greeting handled by handoff-handler.ts
    });

    log.info({ totalTools: Object.keys(allTools).length }, 'JordanAgent initialized');
  }

  static async create(chatCtx?: llm.ChatContext): Promise<JordanAgent> {
    if (!JordanAgent.systemPromptCache) {
      JordanAgent.systemPromptCache = await loadSystemPrompt('jordan-taylor');
    }
    return new JordanAgent(JordanAgent.systemPromptCache, { chatCtx });
  }

  /**
   * Called when Jordan becomes the active agent.
   * NOTE: Greeting handled by handoff-handler.ts to avoid competing systems.
   */
  async onEnter(): Promise<void> {
    log.debug('Jordan onEnter - greeting will be handled by handoff handler');
  }

  async onExit(): Promise<void> {
    log.debug('Transitioning to another agent');
  }
}

export async function createJordanAgent(chatCtx?: llm.ChatContext): Promise<JordanAgent> {
  return JordanAgent.create(chatCtx);
}
