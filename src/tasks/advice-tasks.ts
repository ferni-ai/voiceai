/**
 * Advice Tasks
 *
 * Tasks for giving financial advice in Jack's wise, human way.
 * Never just data - always wisdom.
 */

import { llm, log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';
import { IntelligentTask } from './intelligent-task.js';

// ============================================================================
// WISDOM SHARING TASK
// ============================================================================

export interface WisdomResult {
  principle: string;
  wisdomShared: string;
  userReceptive: boolean;
  applicationDiscussed: boolean;
}

/**
 * WisdomSharingTask - Share Jack's core investing principles
 *
 * Not just information - wisdom that changes behavior.
 */
export class WisdomSharingTask extends IntelligentTask<WisdomResult> {
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
          
          Jack's approach to sharing wisdom:
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
          description: "Share a piece of Jack's investment wisdom.",
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
          description: 'Use numbers to make the point concrete.',
          parameters: z.object({
            scenario: z.string().describe('The scenario to illustrate'),
            numbers: z.string().describe('The mathematical illustration'),
          }),
          execute: async ({ scenario, numbers }) => {
            return `Let me show you the math. ${scenario} ${numbers}`;
          },
        }),

        connectToTheirSituation: llm.tool({
          description: 'Connect the wisdom to their specific situation.',
          parameters: z.object({
            connection: z.string().describe('How this applies to them'),
          }),
          execute: async ({ connection }) => {
            return `For you specifically, ${connection}`;
          },
        }),

        concludeWisdom: llm.tool({
          description: 'Conclude the wisdom sharing.',
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
// DECISION SUPPORT TASK
// ============================================================================

export interface DecisionResult {
  decision: string;
  optionsConsidered: string[];
  frameworkUsed: string;
  outcomeClarity: 'clear' | 'clearer' | 'still_unclear';
  decisionMade?: string;
}

/**
 * DecisionSupportTask - Help with financial decisions
 *
 * Jack helps them think, not tells them what to do.
 */
export class DecisionSupportTask extends IntelligentTask<DecisionResult> {
  private decision: string;
  private optionsConsidered: string[] = [];

  constructor(decision: string) {
    super({
      instructions: {
        base: `
          Help them think through: "${decision}"
          
          Jack's decision framework:
          1. CLARIFY: What are you really deciding?
          2. OPTIONS: What are all the possibilities?
          3. VALUES: What matters most to you?
          4. CONSEQUENCES: What happens with each option?
          5. REVERSIBILITY: Is this reversible? (Most things are)
          
          Never decide FOR them. Help them decide well.
          
          Ask questions like:
          - "What would success look like?"
          - "What's the worst case, and can you live with it?"
          - "What would you tell a friend in this situation?"
          - "What does your gut tell you?"
        `,
        ifDistressed: `
          Decisions feel harder when we're stressed.
          Slow it down. Maybe they don't need to decide today.
        `,
        ifAnxious: `
          Their anxiety might be about the uncertainty, not the decision.
          Help them get comfortable with imperfect information.
        `,
      },
      tools: {
        clarifyDecision: llm.tool({
          description: "Clarify what they're really deciding.",
          parameters: z.object({
            clarification: z.string().describe('Clarifying question or reframe'),
          }),
          execute: async ({ clarification }) => {
            return `Let's make sure I understand. ${clarification}`;
          },
        }),

        exploreOption: llm.tool({
          description: 'Explore one of the options.',
          parameters: z.object({
            option: z.string().describe('The option being explored'),
            pros: z.array(z.string()).describe('Potential benefits'),
            cons: z.array(z.string()).describe('Potential drawbacks'),
          }),
          execute: async ({ option, pros, cons }) => {
            this.optionsConsidered.push(option);
            return `If you chose ${option}: The upside is ${pros.join(', ')}. The downside is ${cons.join(', ')}.`;
          },
        }),

        checkValues: llm.tool({
          description: 'Check what values are driving this decision.',
          parameters: z.object({
            valueQuestion: z.string().describe('Question to surface their values'),
          }),
          execute: async ({ valueQuestion }) => {
            return `Here's an important question: ${valueQuestion}`;
          },
        }),

        offerPerspective: llm.tool({
          description: "Offer Jack's perspective on the decision.",
          parameters: z.object({
            perspective: z.string().describe("Jack's take"),
            caveat: z.string().optional().describe('Important caveat'),
          }),
          execute: async ({ perspective, caveat }) => {
            let response = `Here's how I see it: ${perspective}`;
            if (caveat) response += ` But remember: ${caveat}`;
            return response;
          },
        }),

        concludeDecision: llm.tool({
          description: 'Conclude the decision support.',
          parameters: z.object({
            frameworkUsed: z.string().describe('What framework you used to help'),
            outcomeClarity: z
              .enum(['clear', 'clearer', 'still_unclear'])
              .describe('How clear they seem'),
            decisionMade: z.string().optional().describe('What they decided, if they decided'),
          }),
          execute: async ({ frameworkUsed, outcomeClarity, decisionMade }) => {
            this.complete({
              decision: this.decision,
              optionsConsidered: this.optionsConsidered,
              frameworkUsed,
              outcomeClarity,
              decisionMade,
            });

            if (decisionMade) {
              return `Sounds like you've made a decision. Trust yourself - you thought this through.`;
            }
            if (outcomeClarity === 'still_unclear') {
              return `That's okay. Some decisions need more time. Sleep on it if you can.`;
            }
            return `You're thinking about this the right way. The answer will become clear.`;
          },
        }),
      },
    });

    this.decision = decision;
  }
}

// ============================================================================
// FEAR ADDRESSING TASK
// ============================================================================

export interface FearResult {
  fear: string;
  fearAddressed: boolean;
  perspectiveGiven: boolean;
  userCalmer: boolean;
}

/**
 * FearAddressingTask - Address market fears and financial anxiety
 *
 * Jack faced his own mortality. He knows about fear.
 */
export class FearAddressingTask extends IntelligentTask<FearResult> {
  constructor(fear: string) {
    super({
      instructions: {
        base: `
          Address this fear: "${fear}"
          
          Jack's approach to fear:
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
          description: 'Acknowledge and validate their fear.',
          parameters: z.object({
            acknowledgment: z.string().describe('Your validation of their fear'),
          }),
          execute: async ({ acknowledgment }) => {
            return acknowledgment;
          },
        }),

        providePerspective: llm.tool({
          description: 'Provide historical or experiential perspective.',
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
          description: 'Focus on what they can control.',
          parameters: z.object({
            controllables: z.array(z.string()).describe('Things they can control'),
          }),
          execute: async ({ controllables }) => {
            return `Here's what you CAN control: ${controllables.join('. ')}. Everything else is noise.`;
          },
        }),

        suggestAction: llm.tool({
          description: 'Suggest a small action to restore agency.',
          parameters: z.object({
            action: z.string().describe('A small, concrete action'),
            rationale: z.string().describe('Why this helps'),
          }),
          execute: async ({ action, rationale }) => {
            return `Here's something you could do: ${action}. ${rationale}`;
          },
        }),

        concludeFear: llm.tool({
          description: 'Conclude addressing the fear.',
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
// GOAL SETTING TASK
// ============================================================================

export interface GoalSettingResult {
  goals: Array<{
    name: string;
    type: 'short_term' | 'medium_term' | 'long_term';
    specific: boolean;
    measurable: boolean;
  }>;
  clarityAchieved: boolean;
  nextStepsDefined: boolean;
}

/**
 * GoalSettingTask - Help set clear financial goals
 *
 * Jack's first principle: Create clear, appropriate investment goals.
 */
export class GoalSettingTask extends IntelligentTask<GoalSettingResult> {
  private goals: GoalSettingResult['goals'] = [];

  constructor() {
    super({
      instructions: {
        base: `
          Help them set clear financial goals.
          
          Jack's goal-setting approach:
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
          description: 'Explore the life goal behind the financial goal.',
          parameters: z.object({
            question: z.string().describe('Question about what they really want'),
          }),
          execute: async ({ question }) => {
            return `Let's start bigger. ${question}`;
          },
        }),

        recordGoal: llm.tool({
          description: "Record a financial goal they've articulated.",
          parameters: z.object({
            name: z.string().describe('Name of the goal'),
            type: z.enum(['short_term', 'medium_term', 'long_term']).describe('Time horizon'),
            amount: z.number().optional().describe('Target amount if mentioned'),
            timeline: z.string().optional().describe('When they need it'),
            specific: z.boolean().describe('Is this goal specific enough?'),
            measurable: z.boolean().describe('Can progress be measured?'),
          }),
          execute: async ({ name, type, amount, timeline, specific, measurable }) => {
            this.goals.push({ name, type, specific, measurable });

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
          description: 'Help them prioritize multiple goals.',
          parameters: z.object({
            prioritization: z.string().describe('Your guidance on prioritization'),
          }),
          execute: async ({ prioritization }) => {
            return `When it comes to priority: ${prioritization}`;
          },
        }),

        realityCheck: llm.tool({
          description: 'Provide a reality check on their goals.',
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

        concludeGoalSetting: llm.tool({
          description: 'Conclude the goal setting session.',
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
// REBALANCING GUIDANCE TASK
// ============================================================================

export interface RebalancingResult {
  currentAllocation?: string;
  recommendedAllocation?: string;
  actionPlan?: string[];
  understood: boolean;
}

/**
 * RebalancingGuidanceTask - Help with portfolio rebalancing
 *
 * Jack: Balance is the second principle.
 */
export class RebalancingGuidanceTask extends IntelligentTask<RebalancingResult> {
  constructor() {
    super({
      instructions: {
        base: `
          Help them think about portfolio balance.
          
          Jack's balance principles:
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
          description: 'Assess their current portfolio mix.',
          parameters: z.object({
            stockPercent: z.number().optional().describe('Current stock percentage'),
            bondPercent: z.number().optional().describe('Current bond percentage'),
            otherPercent: z.number().optional().describe('Other assets percentage'),
            assessment: z.string().describe('Your assessment of the mix'),
          }),
          execute: async ({ stockPercent, bondPercent, otherPercent, assessment }) => {
            return assessment;
          },
        }),

        suggestAllocation: llm.tool({
          description: 'Suggest an allocation based on their situation.',
          parameters: z.object({
            suggestion: z.string().describe('Your allocation suggestion'),
            rationale: z.string().describe('Why this makes sense for them'),
          }),
          execute: async ({ suggestion, rationale }) => {
            return `Based on what you've told me, I'd suggest: ${suggestion}. ${rationale}`;
          },
        }),

        concludeRebalancing: llm.tool({
          description: 'Conclude rebalancing discussion.',
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

export default {
  WisdomSharingTask,
  DecisionSupportTask,
  FearAddressingTask,
  GoalSettingTask,
  RebalancingGuidanceTask,
};
