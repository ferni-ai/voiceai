/**
 * Maya Agent - Habits & Financial Wellness Coach
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

// Habit tools - Maya's specialty
import { createHabitTools } from '../../tools/habits.js';

// Habit coaching tools - glidepath system, setbacks, strategies
import { createHabitCoachingTools } from '../../tools/habit-coaching.js';

// Gamification tools - streaks, badges, XP
import { createGamificationToolsV2 } from '../../tools/gamification-v2.js';

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
      description:
        'Transfer back to Ferni for general life coaching, deeper conversations, or when the user wants to explore other topics.',
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
      description:
        'Transfer to Alex for calendar management, email drafting, scheduling, and communication coaching.',
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { AlexAgent } = await import('./alex-agent.js');
        return llm.handoff({
          agent: new AlexAgent(ctx.session.chatCtx),
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
 */
export class MayaAgent extends voice.Agent<MayaSessionData> {
  constructor(chatCtx?: llm.ChatContext) {
    // Build all tools from domains
    const memoryTools = buildMemoryTools('maya-santos');
    const habitTools = buildHabitTools();
    const handoffTools = buildHandoffTools();

    // Merge all tools
    const allTools = {
      ...memoryTools,
      ...habitTools,
      ...handoffTools,
    } as ToolSet;

    // Maya's system prompt - warm, practical habits coach
    const systemPrompt = `You are Maya Santos - a warm, practical habits coach who believes in starting small.

Core Philosophy:
- Start tiny: 2-minute habits that grow
- Celebrate every win, no matter how small
- No judgment for setbacks - they're data, not failure
- The glidepath system: tiny → mini → full → lifestyle

Your Approach:
- Make habits feel achievable, not overwhelming
- Stack new habits onto existing routines
- Use gamification to make it fun (streaks, XP, badges)
- Be the friend who checks in, not the drill sergeant

When someone fails at a habit:
- Never disappointed, always curious
- Ask "what got in the way?" with genuine interest
- Help them find a smaller version that works
- Remind them: "Perfect is the enemy of good enough"

Keep responses conversational and encouraging. You're their habits buddy, not their boss.`;

    super({
      instructions: systemPrompt,
      chatCtx,
      tools: allTools,
    });

    process.stderr.write(
      `[MayaAgent] Initialized with ${Object.keys(allTools).length} tools (memory: ${Object.keys(memoryTools).length}, habits: ${Object.keys(habitTools).length}, handoffs: ${Object.keys(handoffTools).length})\n`
    );
  }

  async onEnter(): Promise<void> {
    this.session.generateReply({
      instructions:
        "Introduce yourself briefly as Maya, the habits coach. Be warm and practical. Ask what habit or routine they want to work on, or if they'd like a check-in on existing habits. Keep it conversational.",
    });
  }

  async onExit(): Promise<void> {
    process.stderr.write(`[MayaAgent] Transitioning to another agent\n`);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createMayaAgent(chatCtx?: llm.ChatContext): MayaAgent {
  return new MayaAgent(chatCtx);
}
