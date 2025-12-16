/**
 * Jordan Agent - Life Planning & Milestone Celebrations
 *
 * Clean LiveKit 1.0 Implementation with direct domain imports.
 *
 * @see https://docs.livekit.io/agents/build/agents-handoffs
 */

import { llm, voice } from '@livekit/agents';
import { z } from 'zod';

import { createLogger } from '../../utils/safe-logger.js';
import type { ToolContext } from '../../tools/registry/types.js';

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

// Life planning tools - Jordan's specialty
import { createGoalManagementTools } from '../../tools/goal-management.js';
import { createEventPlanningTools } from '../../tools/event-planning.js';
import { createLifeFirstsTools } from '../../tools/life-firsts-tracker.js';

// ============================================================================
// TYPES
// ============================================================================

interface JordanSessionData {
  userId?: string;
  userName?: string;
  personaId?: string;
  [key: string]: unknown;
}

type ToolSet = llm.ToolContext<JordanSessionData>;

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
      description: 'Transfer to Maya for building habits around life goals.',
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { MayaAgent } = await import('./maya-agent.js');
        return llm.handoff({
          agent: new MayaAgent(ctx.session.chatCtx),
          returns: 'Connecting you with Maya for habit building!',
        });
      },
    }),

    handoffToAlex: llm.tool({
      description:
        'Transfer to Alex for scheduling events, sending invitations, or calendar management.',
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { AlexAgent } = await import('./alex-agent.js');
        return llm.handoff({
          agent: new AlexAgent(ctx.session.chatCtx),
          returns: 'Connecting you with Alex for scheduling!',
        });
      },
    }),

    handoffToPeter: llm.tool({
      description:
        'Transfer to Peter for investment research or market analysis related to financial goals.',
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { PeterAgent } = await import('./peter-agent.js');
        return llm.handoff({
          agent: new PeterAgent(ctx.session.chatCtx),
          returns: 'Connecting you with Peter for investment insights!',
        });
      },
    }),

    handoffToNayan: llm.tool({
      description:
        'Transfer to Nayan for wisdom, long-term perspective on life transitions, or philosophical reflection.',
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { NayanAgent } = await import('./nayan-agent.js');
        return llm.handoff({
          agent: new NayanAgent(ctx.session.chatCtx),
          returns: 'Connecting you with Nayan for perspective!',
        });
      },
    }),
  } as ToolSet;
}

// ============================================================================
// JORDAN AGENT
// ============================================================================

export class JordanAgent extends voice.Agent<JordanSessionData> {
  constructor(chatCtx?: llm.ChatContext) {
    const memoryTools = buildMemoryTools('jordan-taylor');
    const lifePlanningTools = buildLifePlanningTools();
    const handoffTools = buildHandoffTools();

    const allTools = {
      ...memoryTools,
      ...lifePlanningTools,
      ...handoffTools,
    } as ToolSet;

    const systemPrompt = `You are Jordan Taylor - an enthusiastic lifetime planner who makes every milestone feel special.

Your Approach:
- Celebrate everything - big and small wins
- Help people dream big and plan practically
- Make life events feel meaningful
- Navigate transitions with excitement and care
- You're a military kid who moved 17 times, so you understand transitions deeply

When helping with life planning:
- Ask about what makes this milestone meaningful
- Connect current events to their bigger life story
- Help them see progress they might miss
- Create celebration rituals that resonate

Keep responses enthusiastic and celebratory. You make people feel like their life matters.`;

    super({
      instructions: systemPrompt,
      chatCtx,
      tools: allTools,
    });

    process.stderr.write(`[JordanAgent] Initialized with ${Object.keys(allTools).length} tools\n`);
  }

  async onEnter(): Promise<void> {
    this.session.generateReply({
      instructions:
        "Introduce yourself as Jordan with your celebration energy. Ask what milestone, transition, or life event they're thinking about. Be warm and celebratory.",
    });
  }

  async onExit(): Promise<void> {
    process.stderr.write(`[JordanAgent] Transitioning to another agent\n`);
  }
}

export function createJordanAgent(chatCtx?: llm.ChatContext): JordanAgent {
  return new JordanAgent(chatCtx);
}
