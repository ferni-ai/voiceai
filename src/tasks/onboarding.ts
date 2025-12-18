/**
 * Onboarding Tasks
 *
 * A series of tasks for onboarding users in a warm, human style.
 * These tasks collect information while building genuine connection.
 *
 * Designed to work with any agent persona - the persona's character
 * should come through in the instructions and conversation style.
 */

import { llm } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';
import { AgentTask, TaskGroup } from './agent-task.js';

import { getToolDescription } from '../tools/utils/tool-descriptions.js';
// ============================================================================
// RESULT TYPES
// ============================================================================

export interface WelcomeResult {
  name: string;
  mood: 'good' | 'okay' | 'struggling' | 'unknown';
}

export interface SituationResult {
  primaryConcern: string;
  context?: string;
  urgency: 'immediate' | 'soon' | 'exploring' | 'unknown';
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
 * Welcome task - get to know the person first
 *
 * The FIRST priority is connecting as humans - building rapport before
 * diving into any specific topics or problem-solving.
 */
export class WelcomeTask extends AgentTask<WelcomeResult> {
  private _name = '';
  private _mood: WelcomeResult['mood'] = 'unknown';

  constructor() {
    super({
      instructions: `
        Your FIRST priority is connecting as humans - NOT diving into topics.
        
        1. Greet them warmly
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
 * Situation assessment task - understand where they're at
 *
 * Gently explore what brought them here and what's on their mind.
 * Be sensitive - don't interrogate, have a conversation.
 */
export class SituationAssessmentTask extends AgentTask<SituationResult> {
  constructor() {
    super({
      instructions: `
        Now that you've connected personally, gently explore what's on their mind.
        
        Ask permission first: "Would you mind telling me a bit about what brought you here?"
        
        Understand:
        - What's their primary concern or interest?
        - Any relevant context or background?
        - How urgent does this feel for them?
        
        Be gentle. Use their name. Don't interrogate - have a conversation.
        Validate whatever they share.
      `,
      tools: {
        recordSituation: llm.tool({
          description: getToolDescription('recordSituation'),
          parameters: z.object({
            primaryConcern: z.string().describe('Their main concern or what brought them here'),
            context: z.string().optional().describe('Any relevant background or context'),
            urgency: z
              .enum(['immediate', 'soon', 'exploring', 'unknown'])
              .describe('How urgent this feels to them'),
          }),
          execute: async ({ primaryConcern, context, urgency }) => {
            getLogger().info(
              `Situation: concern=${primaryConcern}, context=${context || 'none'}, urgency=${urgency}`
            );
            this.complete({ primaryConcern, context, urgency });
            return 'I appreciate you sharing that with me.';
          },
        }),
        skipSituation: llm.tool({
          description: getToolDescription('deferConversation'),
          parameters: z.object({}),
          execute: async () => {
            this.complete({
              primaryConcern: 'not shared',
              urgency: 'unknown',
            });
            return "That's perfectly fine. We can just talk.";
          },
        }),
      },
    });
  }

  async onEnter(): Promise<void> {
    getLogger().info('SituationAssessmentTask: Exploring what brought them here');
  }
}

/**
 * Goals task - understand what they want to achieve
 *
 * Help them think about their goals in a holistic way.
 * Goals aren't just about outcomes - they're about what matters to them.
 */
export class GoalsTask extends AgentTask<GoalsResult> {
  constructor() {
    super({
      instructions: `
        Help them think about their goals - but in a holistic way.
        
        Remember: goals aren't just about outcomes. They're about:
        - What matters to them
        - How they want to feel
        - Who they want to become
        - The life they want to live
        
        Ask: "What does success look like to you?"
        Ask: "When do you want to achieve this?"
        
        Connect their goals to their life and values, not just metrics.
      `,
      tools: {
        recordGoals: llm.tool({
          description: getToolDescription('recordGoals'),
          parameters: z.object({
            shortTermGoal: z.string().optional().describe('What they want in the near term'),
            longTermGoal: z.string().optional().describe('What they want for the long term'),
            timeHorizon: z
              .enum(['short', 'medium', 'long', 'unknown'])
              .describe('Their time horizon'),
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
          description: getToolDescription('noGoalsYet'),
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
    getLogger().info('GoalsTask: Exploring goals');
  }
}

// ============================================================================
// COMPLETE ONBOARDING FLOW
// ============================================================================

export interface OnboardingResult {
  welcome: WelcomeResult;
  situation: SituationResult;
  goals: GoalsResult;
}

/**
 * Create a complete onboarding TaskGroup
 */
export function createOnboardingFlow(): TaskGroup {
  const group = new TaskGroup();

  group.add(() => new WelcomeTask(), {
    id: 'welcome',
    description: getToolDescription('recordIntroduction'),
  });

  group.add(() => new SituationAssessmentTask(), {
    id: 'situation',
    description: getToolDescription('recordSituation'),
  });

  group.add(() => new GoalsTask(), {
    id: 'goals',
    description: getToolDescription('skipSituation'),
  });

  return group;
}

/**
 * Run the complete onboarding flow and get typed results
 */
export async function runOnboarding(session: unknown): Promise<OnboardingResult> {
  const group = createOnboardingFlow();
  // Cast session to expected type - caller is responsible for passing valid session
  const results = await group.start(session as Parameters<typeof group.start>[0]);

  return {
    welcome: results.taskResults.welcome as WelcomeResult,
    situation: results.taskResults.situation as SituationResult,
    goals: results.taskResults.goals as GoalsResult,
  };
}

// Legacy exports for backwards compatibility
export {
  SituationAssessmentTask as FinancialSituationTask,
  type SituationResult as FinancialSituationResult,
};

export default {
  WelcomeTask,
  SituationAssessmentTask,
  GoalsTask,
  createOnboardingFlow,
  runOnboarding,
};
