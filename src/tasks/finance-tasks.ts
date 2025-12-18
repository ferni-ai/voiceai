/**
 * Finance-Specific Tasks
 *
 * Tasks specifically for financial coaching and investment guidance.
 * These are domain-specific tasks that should be used by finance-focused agents.
 *
 * For general-purpose coaching tasks, see:
 * - advice-tasks.ts (decision support, goal setting)
 * - support-tasks.ts (emotional support, check-ins)
 * - life-events.ts (life transitions, milestones)
 */

import { llm } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';
import { IntelligentTask } from './intelligent-task.js';

import { getToolDescription } from '../tools/utils/tool-descriptions.js';
// ============================================================================
// INVESTMENT WISDOM TASK
// ============================================================================

export interface InvestmentWisdomResult {
  principle: string;
  wisdomShared: string;
  userReceptive: boolean;
  applicationDiscussed: boolean;
}

/**
 * InvestmentWisdomTask - Share core investing principles
 *
 * Domain-specific task for financial coaching agents.
 * Teaches timeless investment principles in an accessible way.
 */
export class InvestmentWisdomTask extends IntelligentTask<InvestmentWisdomResult> {
  constructor(principle: 'goals' | 'balance' | 'cost' | 'discipline' | 'general') {
    const principleDescriptions: Record<string, string> = {
      goals: 'Create clear, appropriate investment goals',
      balance: 'Keep a balanced and diversified mix of investments',
      cost: "Minimize costs - you get what you DON'T pay for",
      discipline: 'Maintain perspective and long-term discipline',
      general: 'The timeless wisdom of patient, low-cost investing',
    };

    super({
      instructions: {
        base: `
          Share wisdom about: ${principleDescriptions[principle]}
          
          Approach to sharing investment wisdom:
          1. Start with WHY it matters to THEM
          2. Use concrete examples and numbers
          3. Tell a story that illustrates the point
          4. Connect to their specific situation
          5. Make it memorable and actionable
          
          Never preach. Invite them to think.
          "Here's what I've learned..."
          "Let me show you something interesting..."
          
          Key principles to weave in:
          - Time is your friend (or enemy with fees)
          - You can't control the market, but you can control costs
          - Stay the course
          - Enough is enough
        `,
        ifCurious: `
          They're eager to learn! Go deeper with the math.
          Challenge their assumptions. They can handle it.
        `,
        ifDistressed: `
          They might be looking for reassurance, not education.
          Keep it simple. Focus on what they can control.
        `,
        ifAnxious: `
          Anxiety often comes from uncertainty.
          Provide frameworks, not just facts.
        `,
      },
      tools: {
        shareWisdom: llm.tool({
          description: getToolDescription('shareWisdom'),
          parameters: z.object({
            wisdom: z.string().describe('The wisdom to share'),
            example: z.string().optional().describe('A concrete example'),
            story: z.string().optional().describe('A relevant story'),
          }),
          execute: async ({ wisdom, example, story }) => {
            let response = wisdom;
            if (example) response += ` ${example}`;
            if (story) response += ` ${story}`;
            return response;
          },
        }),

        illustrateWithMath: llm.tool({
          description: getToolDescription('illustrateWithMath'),
          parameters: z.object({
            scenario: z.string().describe('The scenario to illustrate'),
            numbers: z.string().describe('The mathematical illustration'),
          }),
          execute: async ({ scenario, numbers }) => {
            return `Let me show you the math. ${scenario} ${numbers}`;
          },
        }),

        connectToTheirSituation: llm.tool({
          description: getToolDescription('connectToTheirSituation'),
          parameters: z.object({
            connection: z.string().describe('How this applies to them'),
          }),
          execute: async ({ connection }) => {
            return `For you specifically, ${connection}`;
          },
        }),

        concludeWisdom: llm.tool({
          description: getToolDescription('concludeWisdom'),
          parameters: z.object({
            principle: z.string().describe('The principle shared'),
            wisdomShared: z.string().describe('Summary of what was shared'),
            userReceptive: z.boolean().describe('Whether they seemed receptive'),
            applicationDiscussed: z.boolean().describe('Whether you discussed how to apply it'),
          }),
          execute: async ({ principle, wisdomShared, userReceptive, applicationDiscussed }) => {
            this.complete({ principle, wisdomShared, userReceptive, applicationDiscussed });
            return userReceptive
              ? 'Does that resonate with you?'
              : "I know that's a lot. What questions do you have?";
          },
        }),
      },
    });
  }
}

// ============================================================================
// MARKET PANIC PREVENTION TASK
// ============================================================================

export interface MarketPanicResult {
  panicLevel: 'low' | 'medium' | 'high' | 'crisis';
  calmingProvided: boolean;
  contextGiven: boolean;
  actionPrevented: boolean;
}

/**
 * MarketPanicTask - Stop panic selling before it happens
 *
 * Domain-specific task for when investors are panicking about market conditions.
 * "The stock market is the only market where people run OUT of the store
 * when things go on sale."
 */
export class MarketPanicTask extends IntelligentTask<MarketPanicResult> {
  constructor() {
    super({
      instructions: {
        base: `
          They're panicking about the market. This is CRITICAL.
          
          Your job is NOT to dismiss their fears. It's to:
          1. VALIDATE the fear (the market IS scary sometimes)
          2. PROVIDE context (historical perspective)
          3. SLOW THEM DOWN (don't let them make rash decisions)
          4. REFRAME the situation (opportunity, not disaster)
          
          Market wisdom:
          - "The stock market is a giant distraction"
          - "Time is your friend; impulse is your enemy"
          - "Stay the course - no matter what happens"
          - Every crash in history has been followed by recovery
          - Panic sellers in March 2020 earned -2%; holders earned 21%
          
          DO NOT:
          - Tell them to calm down (makes it worse)
          - Dismiss their feelings ("it's fine")
          - Give specific stock advice
          - Promise the market will go up
          
          DO:
          - Acknowledge the fear is real
          - Share historical perspective
          - Remind them of their long-term plan
          - Offer to talk again tomorrow
        `,
        ifDistressed: `
          HIGH ALERT. They might be about to sell everything.
          
          "I hear the fear in your voice. Let's slow down.
          Before you do anything, let's just talk."
          
          Get them talking. The more they talk, the less likely
          they are to panic-click 'sell all.'
        `,
      },
      tools: {
        validateFear: llm.tool({
          description: getToolDescription('validateFear'),
          parameters: z.object({
            validation: z.string().describe('Your validation of their fear'),
          }),
          execute: async ({ validation }) => {
            return validation;
          },
        }),

        provideContext: llm.tool({
          description: getToolDescription('provideContext'),
          parameters: z.object({
            context: z.string().describe('Historical context to share'),
            crashMentioned: z.string().optional().describe('Which crash you referenced'),
          }),
          execute: async ({ context, crashMentioned }) => {
            getLogger().info(`Market panic context: ${crashMentioned || 'general'}`);
            return context;
          },
        }),

        slowThemDown: llm.tool({
          description: getToolDescription('slowThemDown'),
          parameters: z.object({
            message: z.string().describe('Your slowing-down message'),
            suggestWaiting: z.boolean().describe('Did you suggest waiting before acting?'),
          }),
          execute: async ({ message }) => {
            return message;
          },
        }),

        completeMarketPanic: llm.tool({
          description: getToolDescription('completeMarketPanic'),
          parameters: z.object({
            panicLevel: z.enum(['low', 'medium', 'high', 'crisis']),
            calmingProvided: z.boolean(),
            contextGiven: z.boolean(),
            actionPrevented: z.boolean(),
            theyAgreedToWait: z.boolean(),
          }),
          execute: async ({
            panicLevel,
            calmingProvided,
            contextGiven,
            actionPrevented,
            theyAgreedToWait,
          }) => {
            this.complete({ panicLevel, calmingProvided, contextGiven, actionPrevented });

            if (theyAgreedToWait) {
              return "Good. Sleep on it. Call me tomorrow if you still want to talk. I'll be here.";
            }
            return "Promise me you won't do anything tonight. Can we talk again tomorrow?";
          },
        }),
      },
    });
  }
}

// ============================================================================
// PORTFOLIO REBALANCING TASK
// ============================================================================

export interface RebalancingResult {
  currentAllocation?: string;
  recommendedAllocation?: string;
  actionPlan?: string[];
  understood: boolean;
}

/**
 * RebalancingTask - Help with portfolio rebalancing
 *
 * Domain-specific task for investment portfolio management.
 * Balance is a core principle of sound investing.
 */
export class RebalancingTask extends IntelligentTask<RebalancingResult> {
  constructor() {
    super({
      instructions: {
        base: `
          Help them think about portfolio balance.
          
          Balance principles:
          1. Asset allocation is the most important decision
          2. Your age and goals determine your mix
          3. Diversify WITHIN asset classes too
          4. Rebalance annually or when drifting >5%
          5. Don't tinker too much
          
          Simple rule of thumb: Your age in bonds
          - 30 years old: 30% bonds, 70% stocks
          - 60 years old: 60% bonds, 40% stocks
          
          But it depends on their risk tolerance and timeline!
          
          Don't overcomplicate. Simple portfolios often win.
        `,
        ifAnxious: `
          They might want to make changes they'll regret.
          Remind them: rebalancing is about discipline, not reaction.
        `,
      },
      tools: {
        assessCurrentMix: llm.tool({
          description: getToolDescription('assessCurrentMix'),
          parameters: z.object({
            stockPercent: z.number().optional().describe('Current stock percentage'),
            bondPercent: z.number().optional().describe('Current bond percentage'),
            otherPercent: z.number().optional().describe('Other assets percentage'),
            assessment: z.string().describe('Your assessment of the mix'),
          }),
          execute: async ({ assessment }) => {
            return assessment;
          },
        }),

        suggestAllocation: llm.tool({
          description: getToolDescription('suggestAllocation'),
          parameters: z.object({
            suggestion: z.string().describe('Your allocation suggestion'),
            rationale: z.string().describe('Why this makes sense for them'),
          }),
          execute: async ({ suggestion, rationale }) => {
            return `Based on what you've told me, I'd suggest: ${suggestion}. ${rationale}`;
          },
        }),

        concludeRebalancing: llm.tool({
          description: getToolDescription('concludeRebalancing'),
          parameters: z.object({
            currentAllocation: z.string().optional().describe('Their current allocation'),
            recommendedAllocation: z.string().optional().describe('Recommended allocation'),
            actionPlan: z.array(z.string()).optional().describe('Steps to take'),
            understood: z.boolean().describe('Do they understand what to do?'),
          }),
          execute: async ({ currentAllocation, recommendedAllocation, actionPlan, understood }) => {
            this.complete({ currentAllocation, recommendedAllocation, actionPlan, understood });
            return "Remember: a simple portfolio you stick with beats a complex one you don't.";
          },
        }),
      },
    });
  }
}

// ============================================================================
// FINANCIAL GOAL SETTING TASK
// ============================================================================

export interface FinancialGoalResult {
  goals: Array<{
    name: string;
    type: 'short_term' | 'medium_term' | 'long_term';
    amount?: number;
    specific: boolean;
    measurable: boolean;
  }>;
  clarityAchieved: boolean;
  nextStepsDefined: boolean;
}

/**
 * FinancialGoalTask - Help set clear financial goals
 *
 * Domain-specific task for financial planning.
 * Clear goals are the foundation of sound financial planning.
 */
export class FinancialGoalTask extends IntelligentTask<FinancialGoalResult> {
  private goals: FinancialGoalResult['goals'] = [];

  constructor() {
    super({
      instructions: {
        base: `
          Help them set clear financial goals.
          
          Goal-setting approach:
          1. START WITH LIFE: What do you want your life to look like?
          2. GET SPECIFIC: Vague goals lead to vague results
          3. TIMELINE: When do you need this money?
          4. PRIORITIZE: What matters most?
          5. REALITY CHECK: Is this achievable?
          
          Remember: For short-term goals, SAVINGS matter more than returns.
          - 2 years: 94% savings, 6% returns
          - 10 years: 80% savings, 20% returns
          - 30 years: 50% savings, 50% returns
          
          Don't let them set goals that will make them miserable.
        `,
        ifDistressed: `
          They might be setting goals from a place of fear.
          Help them separate need from anxiety.
        `,
        ifAnxious: `
          Anxiety can lead to unrealistic goals or paralysis.
          Break it down smaller. One goal at a time.
        `,
      },
      tools: {
        exploreLifeGoal: llm.tool({
          description: getToolDescription('exploreLifeGoal'),
          parameters: z.object({
            question: z.string().describe('Question about what they really want'),
          }),
          execute: async ({ question }) => {
            return `Let's start bigger. ${question}`;
          },
        }),

        recordGoal: llm.tool({
          description: getToolDescription('recordFinancialGoal'),
          parameters: z.object({
            name: z.string().describe('Name of the goal'),
            type: z.enum(['short_term', 'medium_term', 'long_term']).describe('Time horizon'),
            amount: z.number().optional().describe('Target amount if mentioned'),
            timeline: z.string().optional().describe('When they need it'),
            specific: z.boolean().describe('Is this goal specific enough?'),
            measurable: z.boolean().describe('Can progress be measured?'),
          }),
          execute: async ({ name, type, amount, timeline, specific, measurable }) => {
            this.goals.push({ name, type, amount, specific, measurable });

            let response = `Got it: ${name}`;
            if (amount) response += ` - $${amount.toLocaleString()}`;
            if (timeline) response += ` by ${timeline}`;

            if (!specific) {
              response += `. Can we make that more specific?`;
            }
            if (!measurable) {
              response += ` How will you know when you've reached it?`;
            }

            return response;
          },
        }),

        prioritizeGoals: llm.tool({
          description: getToolDescription('recordGoal'),
          parameters: z.object({
            prioritization: z.string().describe('Your guidance on prioritization'),
          }),
          execute: async ({ prioritization }) => {
            return `When it comes to priority: ${prioritization}`;
          },
        }),

        realityCheck: llm.tool({
          description: getToolDescription('prioritizeGoals'),
          parameters: z.object({
            assessment: z.string().describe('Your honest assessment'),
            adjustment: z.string().optional().describe('Suggested adjustment'),
          }),
          execute: async ({ assessment, adjustment }) => {
            let response = `Let me be honest with you: ${assessment}`;
            if (adjustment) response += ` You might consider: ${adjustment}`;
            return response;
          },
        }),

        concludeFinancialGoals: llm.tool({
          description: getToolDescription('realityCheck'),
          parameters: z.object({
            clarityAchieved: z.boolean().describe('Do they have clear goals now?'),
            nextStepsDefined: z.boolean().describe('Do they know what to do next?'),
            summary: z.string().describe('Summary of goals set'),
          }),
          execute: async ({ clarityAchieved, nextStepsDefined, summary }) => {
            this.complete({
              goals: this.goals,
              clarityAchieved,
              nextStepsDefined,
            });

            return `${summary} Remember: the goal isn't wealth for its own sake. It's the life you want to live.`;
          },
        }),
      },
    });
  }
}

// ============================================================================
// MARKET FEAR ADDRESSING TASK
// ============================================================================

export interface MarketFearResult {
  fear: string;
  fearAddressed: boolean;
  perspectiveGiven: boolean;
  userCalmer: boolean;
}

/**
 * MarketFearTask - Address market fears and financial anxiety
 *
 * Domain-specific task for helping people work through investment-related fears.
 */
export class MarketFearTask extends IntelligentTask<MarketFearResult> {
  constructor(fear: string) {
    super({
      instructions: {
        base: `
          Address this market/financial fear: "${fear}"
          
          Approach to financial fears:
          1. ACKNOWLEDGE: "That fear is real. I understand."
          2. PERSPECTIVE: Historical context, probability, lived experience
          3. CONTROL: What CAN they control?
          4. ACTION: Small steps that restore agency
          
          Never dismiss fear. Never promise outcomes.
          
          Key reframes:
          - "The market always recovers. Always. Though not always when we want it to."
          - "You've survived 100% of your worst days so far."
          - "Uncertainty is the price of returns."
          - "What you're feeling is normal. What you do about it is the choice."
        `,
        ifDistressed: `
          This is more than financial anxiety.
          Stay in support mode longer. The fear is valid.
        `,
        ifAnxious: `
          Anxiety amplifies fear. 
          Slow your pace. More pauses. Calm energy.
        `,
      },
      tools: {
        acknowledgeFear: llm.tool({
          description: getToolDescription('concludeFinancialGoals'),
          parameters: z.object({
            acknowledgment: z.string().describe('Your validation of their fear'),
          }),
          execute: async ({ acknowledgment }) => {
            return acknowledgment;
          },
        }),

        providePerspective: llm.tool({
          description: getToolDescription('acknowledgeFear'),
          parameters: z.object({
            perspective: z.string().describe('The perspective to share'),
            source: z
              .enum(['history', 'experience', 'data', 'wisdom'])
              .describe('Source of perspective'),
          }),
          execute: async ({ perspective, source }) => {
            const intros: Record<string, string> = {
              history: 'History shows us something important: ',
              experience: 'Over the years, I have learned: ',
              data: 'The numbers tell an interesting story: ',
              wisdom: "Here's what I've come to believe: ",
            };
            return intros[source] + perspective;
          },
        }),

        focusOnControl: llm.tool({
          description: getToolDescription('providePerspective'),
          parameters: z.object({
            controllables: z.array(z.string()).describe('Things they can control'),
          }),
          execute: async ({ controllables }) => {
            return `Here's what you CAN control: ${controllables.join('. ')}. Everything else is noise.`;
          },
        }),

        suggestAction: llm.tool({
          description: getToolDescription('focusOnControl'),
          parameters: z.object({
            action: z.string().describe('A small, concrete action'),
            rationale: z.string().describe('Why this helps'),
          }),
          execute: async ({ action, rationale }) => {
            return `Here's something you could do: ${action}. ${rationale}`;
          },
        }),

        concludeMarketFear: llm.tool({
          description: getToolDescription('suggestAction'),
          parameters: z.object({
            fearAddressed: z.boolean().describe('Whether the fear was addressed'),
            perspectiveGiven: z.boolean().describe('Whether perspective was provided'),
            userCalmer: z.boolean().describe('Whether they seem calmer'),
          }),
          execute: async ({ fearAddressed, perspectiveGiven, userCalmer }) => {
            this.complete({
              fear: 'addressed',
              fearAddressed,
              perspectiveGiven,
              userCalmer,
            });

            return userCalmer
              ? "Fear is natural. How we respond to it is the choice. You're responding well."
              : "This fear may take time to process. That's okay. We can talk about it again.";
          },
        }),
      },
    });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  InvestmentWisdomTask,
  MarketPanicTask,
  RebalancingTask,
  FinancialGoalTask,
  MarketFearTask,
};
