/**
 * John Bogle Onboarding Tasks
 *
 * A series of tasks for onboarding users in Jack Bogle's warm, human style.
 * These tasks collect information while maintaining Jack's persona.
 */

import { llm, log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';
import { AgentTask, TaskGroup } from './agent-task.js';

// ============================================================================
// RESULT TYPES
// ============================================================================

export interface WelcomeResult {
  name: string;
  mood: 'good' | 'okay' | 'struggling' | 'unknown';
}

export interface FinancialSituationResult {
  hasInvestments: boolean;
  primaryConcern: 'retirement' | 'savings' | 'debt' | 'education' | 'general' | 'none';
  riskTolerance: 'conservative' | 'moderate' | 'aggressive' | 'unknown';
}

export interface GoalsResult {
  shortTermGoal?: string;
  longTermGoal?: string;
  timeHorizon: 'short' | 'medium' | 'long' | 'unknown';
}

// ============================================================================
// TASK IMPLEMENTATIONS
// ============================================================================

/**
 * Welcome task - get to know the person first (Jack's style)
 */
export class WelcomeTask extends AgentTask<WelcomeResult> {
  private _name = '';
  private _mood: WelcomeResult['mood'] = 'unknown';

  constructor() {
    super({
      instructions: `
        You're Jack Bogle, warm and grandfatherly.
        Your FIRST priority is connecting as humans - NOT discussing finance.
        
        1. Greet them warmly like an old friend
        2. Ask how they're REALLY doing (not just the polite answer)
        3. Get their name and remember it
        4. Show genuine interest in THEM as a person
        
        Don't rush. Let the conversation breathe.
        Only complete when you've genuinely connected.
      `,
      tools: {
        recordIntroduction: llm.tool({
          description:
            "Record the user's name and how they seem to be doing. Use after you've had a genuine exchange.",
          parameters: z.object({
            name: z.string().describe("The user's name"),
            mood: z
              .enum(['good', 'okay', 'struggling', 'unknown'])
              .describe('How they seem to be doing'),
            notes: z.string().optional().describe('Any important context they shared'),
          }),
          execute: async ({ name, mood, notes }) => {
            this._name = name;
            this._mood = mood;
            getLogger().info(`Welcome: ${name} is feeling ${mood}. Notes: ${notes || 'none'}`);
            this.complete({ name, mood });
            return `Great to meet you, ${name}.`;
          },
        }),
      },
    });
  }

  async onEnter(): Promise<void> {
    getLogger().info('WelcomeTask: Starting warm greeting');
  }
}

/**
 * Financial situation task - understand where they're at
 */
export class FinancialSituationTask extends AgentTask<FinancialSituationResult> {
  constructor() {
    super({
      instructions: `
        Now that you've connected personally, gently explore their financial situation.
        
        Ask permission first: "Would you mind if I asked a bit about your financial situation?"
        
        Understand:
        - Do they have any investments currently?
        - What's their primary financial concern?
        - How do they feel about risk?
        
        Be gentle. Use their name. Don't interrogate - have a conversation.
        Validate any worries they express.
      `,
      tools: {
        recordSituation: llm.tool({
          description: "Record the user's financial situation after understanding it.",
          parameters: z.object({
            hasInvestments: z.boolean().describe('Whether they currently have investments'),
            primaryConcern: z
              .enum(['retirement', 'savings', 'debt', 'education', 'general', 'none'])
              .describe('Their main financial concern'),
            riskTolerance: z
              .enum(['conservative', 'moderate', 'aggressive', 'unknown'])
              .describe('How they feel about risk'),
          }),
          execute: async ({ hasInvestments, primaryConcern, riskTolerance }) => {
            getLogger().info(
              `Situation: investments=${hasInvestments}, concern=${primaryConcern}, risk=${riskTolerance}`
            );
            this.complete({ hasInvestments, primaryConcern, riskTolerance });
            return 'I appreciate you sharing that with me.';
          },
        }),
        skipFinancials: llm.tool({
          description: "Use if the user doesn't want to discuss finances right now.",
          parameters: z.object({}),
          execute: async () => {
            this.complete({
              hasInvestments: false,
              primaryConcern: 'none',
              riskTolerance: 'unknown',
            });
            return "That's perfectly fine. We can just talk.";
          },
        }),
      },
    });
  }

  async onEnter(): Promise<void> {
    getLogger().info('FinancialSituationTask: Exploring financial context');
  }
}

/**
 * Goals task - understand what they want to achieve
 */
export class GoalsTask extends AgentTask<GoalsResult> {
  constructor() {
    super({
      instructions: `
        Help them think about their financial goals - but in Jack's holistic way.
        
        Remember: goals aren't just about money. They're about:
        - Security for family
        - Freedom to make choices
        - Peace of mind
        - Legacy
        
        Ask: "What does financial success look like to you?"
        Ask: "When do you need this money?"
        
        Connect their goals to their life, not just numbers.
      `,
      tools: {
        recordGoals: llm.tool({
          description: "Record the user's financial goals.",
          parameters: z.object({
            shortTermGoal: z.string().optional().describe('What they want in the next 1-5 years'),
            longTermGoal: z.string().optional().describe('What they want for the long term'),
            timeHorizon: z
              .enum(['short', 'medium', 'long', 'unknown'])
              .describe('Their investment time horizon'),
          }),
          execute: async ({ shortTermGoal, longTermGoal, timeHorizon }) => {
            getLogger().info(
              `Goals: short=${shortTermGoal}, long=${longTermGoal}, horizon=${timeHorizon}`
            );
            this.complete({ shortTermGoal, longTermGoal, timeHorizon });
            return 'Those are wonderful goals. Let me share some thoughts.';
          },
        }),
        noGoalsYet: llm.tool({
          description: "Use if they're not sure about their goals.",
          parameters: z.object({}),
          execute: async () => {
            this.complete({ timeHorizon: 'unknown' });
            return "That's okay. Figuring out what you want is half the journey.";
          },
        }),
      },
    });
  }

  async onEnter(): Promise<void> {
    getLogger().info('GoalsTask: Exploring financial goals');
  }
}

// ============================================================================
// COMPLETE ONBOARDING FLOW
// ============================================================================

export interface OnboardingResult {
  welcome: WelcomeResult;
  situation: FinancialSituationResult;
  goals: GoalsResult;
}

/**
 * Create a complete onboarding TaskGroup
 */
export function createOnboardingFlow(): TaskGroup {
  const group = new TaskGroup();

  group.add(() => new WelcomeTask(), {
    id: 'welcome',
    description: 'Warm greeting and getting to know the user',
  });

  group.add(() => new FinancialSituationTask(), {
    id: 'situation',
    description: 'Understanding their current financial situation',
  });

  group.add(() => new GoalsTask(), {
    id: 'goals',
    description: 'Exploring their financial goals',
  });

  return group;
}

/**
 * Run the complete onboarding flow and get typed results
 */
export async function runOnboarding(session: any): Promise<OnboardingResult> {
  const group = createOnboardingFlow();
  const results = await group.start(session);

  return {
    welcome: results.taskResults.welcome as WelcomeResult,
    situation: results.taskResults.situation as FinancialSituationResult,
    goals: results.taskResults.goals as GoalsResult,
  };
}

export default {
  WelcomeTask,
  FinancialSituationTask,
  GoalsTask,
  createOnboardingFlow,
  runOnboarding,
};
