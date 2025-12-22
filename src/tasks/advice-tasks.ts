/**
 * Advice Tasks
 *
 * Tasks for giving guidance and support in a wise, human way.
 * These are general-purpose tasks that work with any coaching domain.
 *
 * For finance-specific tasks, see finance-tasks.ts
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { IntelligentTask } from './intelligent-task.js';

import { getToolDescription } from '../tools/utils/tool-descriptions.js';
// ============================================================================
// WISDOM SHARING TASK
// ============================================================================

export interface WisdomResult {
  topic: string;
  wisdomShared: string;
  userReceptive: boolean;
  applicationDiscussed: boolean;
}

/**
 * WisdomSharingTask - Share wisdom on any topic
 *
 * Not just information - wisdom that changes behavior.
 * Works for any domain: life, habits, relationships, career, etc.
 */
export class WisdomSharingTask extends IntelligentTask<WisdomResult> {
  constructor(topic: string) {
    super({
      instructions: {
        base: `
          Share wisdom about: "${topic}"
          
          Approach to sharing wisdom:
          1. Start with WHY it matters to THEM
          2. Use concrete examples
          3. Tell a story that illustrates the point
          4. Connect to their specific situation
          5. Make it memorable and actionable
          
          Never preach. Invite them to think.
          "Here's what I've learned..."
          "Let me share something that might help..."
          
          Let the wisdom speak for itself.
        `,
        ifCurious: `
          They're eager to learn! Go deeper.
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
            topic: z.string().describe('The topic discussed'),
            wisdomShared: z.string().describe('Summary of what was shared'),
            userReceptive: z.boolean().describe('Whether they seemed receptive'),
            applicationDiscussed: z.boolean().describe('Whether you discussed how to apply it'),
          }),
          execute: async ({ topic, wisdomShared, userReceptive, applicationDiscussed }) => {
            this.complete({ topic, wisdomShared, userReceptive, applicationDiscussed });
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
 * DecisionSupportTask - Help with any decision
 *
 * Helps them think through decisions without telling them what to do.
 * Works for any domain: career, relationships, life choices, etc.
 */
export class DecisionSupportTask extends IntelligentTask<DecisionResult> {
  private decision: string;
  private optionsConsidered: string[] = [];

  constructor(decision: string) {
    super({
      instructions: {
        base: `
          Help them think through: "${decision}"
          
          Decision-making framework:
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
          description: getToolDescription('clarifyDecision'),
          parameters: z.object({
            clarification: z.string().describe('Clarifying question or reframe'),
          }),
          execute: async ({ clarification }) => {
            return `Let's make sure I understand. ${clarification}`;
          },
        }),

        exploreOption: llm.tool({
          description: getToolDescription('clarifyDecision'),
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
          description: getToolDescription('exploreOption'),
          parameters: z.object({
            valueQuestion: z.string().describe('Question to surface their values'),
          }),
          execute: async ({ valueQuestion }) => {
            return `Here's an important question: ${valueQuestion}`;
          },
        }),

        offerPerspective: llm.tool({
          description: getToolDescription('checkValues'),
          parameters: z.object({
            perspective: z.string().describe('Your perspective'),
            caveat: z.string().optional().describe('Important caveat'),
          }),
          execute: async ({ perspective, caveat }) => {
            let response = `Here's how I see it: ${perspective}`;
            if (caveat) response += ` But remember: ${caveat}`;
            return response;
          },
        }),

        concludeDecision: llm.tool({
          description: getToolDescription('offerPerspective'),
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
 * FearAddressingTask - Address fears and anxiety
 *
 * Works for any type of fear: life changes, uncertainty, failure, etc.
 */
export class FearAddressingTask extends IntelligentTask<FearResult> {
  constructor(fear: string) {
    super({
      instructions: {
        base: `
          Address this fear: "${fear}"
          
          Approach to fear:
          1. ACKNOWLEDGE: "That fear is real. I understand."
          2. PERSPECTIVE: Context, probability, lived experience
          3. CONTROL: What CAN they control?
          4. ACTION: Small steps that restore agency
          
          Never dismiss fear. Never promise outcomes.
          
          Key reframes:
          - "You've survived 100% of your worst days so far."
          - "What you're feeling is normal. What you do about it is the choice."
          - "Fear often points to what matters most to us."
          - "Courage isn't the absence of fear - it's action despite fear."
        `,
        ifDistressed: `
          This is significant anxiety. Stay in support mode longer.
          The fear is valid. Don't rush to fix it.
        `,
        ifAnxious: `
          Anxiety amplifies fear. 
          Slow your pace. More pauses. Calm energy.
        `,
      },
      tools: {
        acknowledgeFear: llm.tool({
          description: getToolDescription('concludeDecision'),
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
              .enum(['experience', 'wisdom', 'reframe', 'question'])
              .describe('Type of perspective'),
          }),
          execute: async ({ perspective, source }) => {
            const intros: Record<string, string> = {
              experience: "Here's what I've seen: ",
              wisdom: "Here's what I've come to believe: ",
              reframe: 'Another way to look at this: ',
              question: 'I wonder: ',
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

        concludeFear: llm.tool({
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
 * GoalSettingTask - Help set clear goals
 *
 * Works for any domain: life, career, health, relationships, etc.
 */
export class GoalSettingTask extends IntelligentTask<GoalSettingResult> {
  private goals: GoalSettingResult['goals'] = [];

  constructor() {
    super({
      instructions: {
        base: `
          Help them set clear goals.
          
          Goal-setting approach:
          1. START WITH WHY: What do you really want? Why?
          2. GET SPECIFIC: Vague goals lead to vague results
          3. TIMELINE: When do you want to achieve this?
          4. PRIORITIZE: What matters most?
          5. REALITY CHECK: Is this achievable?
          
          Good goals are:
          - Specific (not vague)
          - Measurable (you'll know when you achieve it)
          - Meaningful (connected to what matters)
          - Achievable (challenging but possible)
          
          Don't let them set goals that will make them miserable.
        `,
        ifDistressed: `
          They might be setting goals from a place of fear.
          Help them separate genuine desire from anxiety.
        `,
        ifAnxious: `
          Anxiety can lead to unrealistic goals or paralysis.
          Break it down smaller. One goal at a time.
        `,
      },
      tools: {
        exploreWhy: llm.tool({
          description: getToolDescription('concludeFear'),
          parameters: z.object({
            question: z.string().describe('Question about what they really want'),
          }),
          execute: async ({ question }) => {
            return `Let's go deeper. ${question}`;
          },
        }),

        recordGoal: llm.tool({
          description: getToolDescription('recordGoal'),
          parameters: z.object({
            name: z.string().describe('Name of the goal'),
            type: z.enum(['short_term', 'medium_term', 'long_term']).describe('Time horizon'),
            timeline: z.string().optional().describe('When they want to achieve it'),
            specific: z.boolean().describe('Is this goal specific enough?'),
            measurable: z.boolean().describe('Can progress be measured?'),
          }),
          execute: async ({ name, type, timeline, specific, measurable }) => {
            this.goals.push({ name, type, specific, measurable });

            let response = `Got it: ${name}`;
            if (timeline) response += ` by ${timeline}`;

            if (!specific) {
              response += `. Can we make that more specific?`;
            }
            if (!measurable) {
              response += ` How will you know when you've achieved it?`;
            }

            return response;
          },
        }),

        prioritizeGoals: llm.tool({
          description: getToolDescription('exploreWhy'),
          parameters: z.object({
            prioritization: z.string().describe('Your guidance on prioritization'),
          }),
          execute: async ({ prioritization }) => {
            return `When it comes to priority: ${prioritization}`;
          },
        }),

        realityCheck: llm.tool({
          description: getToolDescription('recordGoal'),
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
          description: getToolDescription('prioritizeGoals'),
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

            return `${summary} Remember: the goal isn't the achievement itself - it's who you become in the process.`;
          },
        }),
      },
    });
  }
}

// ============================================================================
// LEGACY EXPORTS (for backwards compatibility)
// ============================================================================

// Re-export finance tasks for backwards compatibility
export {
  RebalancingTask as RebalancingGuidanceTask,
  type RebalancingResult,
} from './finance-tasks.js';

export default {
  WisdomSharingTask,
  DecisionSupportTask,
  FearAddressingTask,
  GoalSettingTask,
};
