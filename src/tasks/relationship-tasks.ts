/**
 * Relationship Tasks
 *
 * Tasks for building deep, genuine relationships over time.
 * People matter more than problems.
 */

import { llm } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';
import { IntelligentTask } from './intelligent-task.js';

// ============================================================================
// FOLLOW-UP TASK (FOR RETURNING USERS)
// ============================================================================

export interface FollowUpResult {
  previousTopicAddressed: boolean;
  updateReceived?: string;
  newConcerns?: string[];
  relationshipDeepened: boolean;
}

/**
 * FollowUpTask - Connect with returning users about previous conversations
 *
 * Shows you remember and care about their journey.
 */
export class FollowUpTask extends IntelligentTask<FollowUpResult> {
  constructor(previousContext?: {
    lastSummary?: string;
    pendingFollowUps?: string[];
    goals?: string[];
  }) {
    const context = previousContext || {};

    super({
      instructions: {
        base: `
          This is a RETURNING user! You've talked before.
          
          ${context.lastSummary ? `Last time: ${context.lastSummary}` : ''}
          ${context.pendingFollowUps?.length ? `Follow-ups: ${context.pendingFollowUps.join(', ')}` : ''}
          ${context.goals?.length ? `Their goals: ${context.goals.join(', ')}` : ''}
          
          Your job:
          1. ACKNOWLEDGE you remember them (use their name!)
          2. Ask about something specific from last time
          3. Show genuine interest in their update
          4. Note any changes or new concerns
          
          This should feel like reconnecting with an old friend.
          "It's so good to hear from you again! Last time we talked about..."
        `,
        ifDistressed: `
          They might be coming back because they're struggling.
          Be extra gentle. Don't assume things got better.
        `,
        ifHappy: `
          They seem to be doing well! Celebrate with them.
          Maybe the last conversation helped.
        `,
      },
      tools: {
        acknowledgeReturn: llm.tool({
          description: 'Acknowledge the returning user and reference past conversations.',
          parameters: z.object({
            greeting: z.string().describe('Your personalized greeting'),
            topicToFollowUp: z.string().describe("What you're following up on from last time"),
          }),
          execute: async ({ greeting, topicToFollowUp }) => {
            getLogger().info(`Following up on: ${topicToFollowUp}`);
            return greeting;
          },
        }),

        recordUpdate: llm.tool({
          description: 'Record the update they shared about a previous topic.',
          parameters: z.object({
            topic: z.string().describe('What topic this update is about'),
            update: z.string().describe('What they shared'),
            sentiment: z.enum(['positive', 'neutral', 'negative']).describe('How the update feels'),
          }),
          execute: async ({ topic, update, sentiment }) => {
            getLogger().info(`Update on ${topic}: ${update} (${sentiment})`);

            const responses: Record<string, string[]> = {
              positive: [
                "That's wonderful to hear!",
                "I'm so glad things are moving in the right direction.",
                'You should be proud of that progress.',
              ],
              neutral: [
                'I appreciate you sharing that update.',
                'Thanks for letting me know how things are going.',
              ],
              negative: [
                "I'm sorry to hear that. Let's talk about it.",
                'That sounds challenging. How are you feeling about it?',
              ],
            };

            return responses[sentiment][Math.floor(Math.random() * responses[sentiment].length)];
          },
        }),

        completeFollowUp: llm.tool({
          description: 'Complete the follow-up task with summary.',
          parameters: z.object({
            previousTopicAddressed: z
              .boolean()
              .describe('Whether you addressed something from last time'),
            updateReceived: z.string().optional().describe('Summary of what they shared'),
            newConcerns: z.array(z.string()).optional().describe('Any new concerns that came up'),
            relationshipDeepened: z
              .boolean()
              .describe('Whether the conversation deepened the relationship'),
          }),
          execute: async ({
            previousTopicAddressed,
            updateReceived,
            newConcerns,
            relationshipDeepened,
          }) => {
            this.complete({
              previousTopicAddressed,
              updateReceived,
              newConcerns,
              relationshipDeepened,
            });
            return "It's good to catch up. Now, what's on your mind today?";
          },
        }),
      },
    });
  }
}

// ============================================================================
// STORYTELLING TASK
// ============================================================================

export interface StoryResult {
  storyTheme: string;
  storyShared: string;
  userReaction: 'moved' | 'interested' | 'neutral' | 'confused' | 'connected';
  resonated: boolean;
}

/**
 * StorytellingTask - Share relevant stories
 *
 * Stories are how we teach. They're memorable and human.
 * The agent should draw from its persona's relevant experiences.
 */
export class StorytellingTask extends IntelligentTask<StoryResult> {
  private theme: string;

  constructor(theme: string) {
    super({
      instructions: {
        base: `
          Time to share a story about: "${theme}"
          
          Storytelling principles:
          1. Start with a hook - "Let me tell you about..."
          2. Make it personal and specific
          3. Include sensory details
          4. Build to a lesson, but don't preach
          5. Let them draw their own conclusions
          
          Good stories:
          - Illustrate a point through experience
          - Create emotional connection
          - Make abstract concepts concrete
          - Leave space for reflection
          
          Match the story to their situation.
          Don't force a lesson - let the story speak.
        `,
        ifDistressed: `
          They need comfort more than lessons.
          Choose a story about surviving hard times.
          Emphasize the human elements, not the outcomes.
        `,
        ifCurious: `
          They're engaged! You can be more animated.
          Add humor if appropriate.
        `,
      },
      tools: {
        shareStory: llm.tool({
          description: 'Share a relevant story.',
          parameters: z.object({
            theme: z.string().describe('The theme of the story'),
            storyText: z.string().describe('The story itself'),
            lessonImplied: z.string().describe('The lesson (not stated explicitly)'),
          }),
          execute: async ({ theme, storyText }) => {
            getLogger().info(`Sharing story: ${theme}`);
            return storyText;
          },
        }),

        gaugeReaction: llm.tool({
          description: 'Gauge how the user reacted to the story.',
          parameters: z.object({
            reaction: z
              .enum(['moved', 'interested', 'neutral', 'confused', 'connected'])
              .describe('How they seemed to react'),
            resonated: z.boolean().describe('Whether the story seemed to resonate'),
            followUp: z.string().optional().describe('What they said or asked'),
          }),
          execute: async ({ reaction, resonated }) => {
            getLogger().info(`Story reaction: ${reaction}, resonated=${resonated}`);

            this.complete({
              storyTheme: this.theme,
              storyShared: 'recorded',
              userReaction: reaction,
              resonated,
            });

            if (reaction === 'moved' || reaction === 'connected') {
              return "Stories have a way of speaking to us, don't they?";
            }
            if (reaction === 'confused') {
              return 'Let me put that another way...';
            }

            return 'What does that bring up for you?';
          },
        }),
      },
    });

    this.theme = theme;
  }
}

// ============================================================================
// DEEP DIVE TASK
// ============================================================================

export interface DeepDiveResult {
  topic: string;
  insightsGained: string[];
  questionsAnswered: string[];
  userUnderstanding: 'beginner' | 'intermediate' | 'advanced';
  followUpNeeded: boolean;
}

/**
 * DeepDiveTask - Explore a topic in depth
 *
 * When someone wants to really understand something.
 */
export class DeepDiveTask extends IntelligentTask<DeepDiveResult> {
  private topic: string;
  private insightsGained: string[] = [];
  private questionsAnswered: string[] = [];

  constructor(topic: string) {
    super({
      instructions: {
        base: `
          Time for a deep dive into: "${topic}"
          
          Teaching style:
          1. Start with the basics - never assume knowledge
          2. Use analogies and stories
          3. Check understanding frequently
          4. Build complexity gradually
          5. Connect to their personal situation
          
          Make it conversational, not lecturing.
          Pause for questions. Encourage them.
          
          "Does that make sense?" is your friend.
          "What questions do you have?" opens dialogue.
        `,
        ifCurious: `
          They're engaged! You can go deeper.
          Challenge them a little - they'll rise to it.
        `,
        ifDistressed: `
          They might be overwhelmed. 
          Slow down. Smaller pieces. More checks.
        `,
      },
      tools: {
        explainConcept: llm.tool({
          description: 'Explain a concept as part of the deep dive.',
          parameters: z.object({
            concept: z.string().describe("What you're explaining"),
            explanation: z.string().describe('Your explanation'),
            analogy: z.string().optional().describe('An analogy to help'),
          }),
          execute: async ({ concept, explanation, analogy }) => {
            getLogger().info(`Explaining: ${concept}`);
            this.insightsGained.push(concept);
            return explanation + (analogy ? ` Think of it like ${analogy}.` : '');
          },
        }),

        checkUnderstanding: llm.tool({
          description: "Check if they're following along.",
          parameters: z.object({
            checkQuestion: z.string().describe('Question to check understanding'),
          }),
          execute: async ({ checkQuestion }) => {
            return checkQuestion;
          },
        }),

        answerQuestion: llm.tool({
          description: 'Answer a question they asked during the deep dive.',
          parameters: z.object({
            question: z.string().describe('Their question'),
            answer: z.string().describe('Your answer'),
          }),
          execute: async ({ question, answer }) => {
            this.questionsAnswered.push(question);
            // NOTE: Avoid "Good question!" - sounds like self-compliment
            return answer;
          },
        }),

        concludeDeepDive: llm.tool({
          description: 'Conclude the deep dive with a summary.',
          parameters: z.object({
            userUnderstanding: z
              .enum(['beginner', 'intermediate', 'advanced'])
              .describe('Their apparent level of understanding'),
            followUpNeeded: z.boolean().describe('Whether they need more on this topic'),
            summary: z.string().describe('Brief summary of what was covered'),
          }),
          execute: async ({ userUnderstanding, followUpNeeded, summary }) => {
            this.complete({
              topic: this.topic,
              insightsGained: this.insightsGained,
              questionsAnswered: this.questionsAnswered,
              userUnderstanding,
              followUpNeeded,
            });

            return `${summary} You've got a good grasp of this. ${followUpNeeded ? 'We can go deeper another time.' : ''}`;
          },
        }),
      },
    });

    this.topic = topic;
  }
}

// ============================================================================
// GOODBYE TASK
// ============================================================================

export interface GoodbyeResult {
  tone: 'warm' | 'encouraging' | 'thoughtful' | 'caring';
  keyTakeaway?: string;
  nextSteps?: string[];
  relationshipStrengthened: boolean;
}

/**
 * GoodbyeTask - Warm, meaningful conversation endings
 *
 * Never rush an ending. The goodbye matters.
 */
export class GoodbyeTask extends IntelligentTask<GoodbyeResult> {
  constructor() {
    super({
      instructions: {
        base: `
          Time to wrap up the conversation.
          
          A good goodbye:
          1. Acknowledge what you discussed
          2. Offer one key takeaway (if appropriate)
          3. Express genuine warmth
          4. Leave the door open for next time
          5. Use their name
          
          Don't:
          - Rush it
          - Add new information
          - End on a heavy note (unless necessary)
          
          Make them feel valued as a person, not a transaction.
        `,
        ifDistressed: `
          End on a note of support and availability.
          "I'm here whenever you need to talk."
          Don't leave them feeling alone.
        `,
        ifHappy: `
          End on a celebratory note!
          Match their energy. Leave them feeling good.
        `,
        ifReturning: `
          Reference the ongoing relationship.
          "Until next time, friend."
        `,
      },
      tools: {
        offerTakeaway: llm.tool({
          description: 'Offer a key takeaway from the conversation.',
          parameters: z.object({
            takeaway: z.string().describe('The key insight or reminder'),
          }),
          execute: async ({ takeaway }) => {
            return `If you remember one thing from today: ${takeaway}`;
          },
        }),

        suggestNextSteps: llm.tool({
          description: 'Suggest concrete next steps, if appropriate.',
          parameters: z.object({
            steps: z.array(z.string()).describe('1-3 simple next steps'),
          }),
          execute: async ({ steps }) => {
            if (steps.length === 1) {
              return `If you want to take action: ${steps[0]}`;
            }
            return `A few things to consider: ${steps.join('. ')}`;
          },
        }),

        sayGoodbye: llm.tool({
          description: 'Say the final goodbye.',
          parameters: z.object({
            tone: z
              .enum(['warm', 'encouraging', 'thoughtful', 'caring'])
              .describe('Tone of goodbye'),
            message: z.string().describe('Your goodbye message'),
            keyTakeaway: z.string().optional().describe('Summary of key takeaway'),
            nextSteps: z.array(z.string()).optional().describe('Any suggested next steps'),
          }),
          execute: async ({ tone, message, keyTakeaway, nextSteps }) => {
            this.complete({
              tone,
              keyTakeaway,
              nextSteps,
              relationshipStrengthened: true,
            });
            return message;
          },
        }),
      },
    });
  }
}

// ============================================================================
// CELEBRATION TASK
// ============================================================================

export interface CelebrationResult {
  achievement: string;
  celebrationShared: boolean;
  userFeltAcknowledged: boolean;
}

/**
 * CelebrationTask - Celebrate wins and milestones
 *
 * Acknowledging progress matters.
 */
export class CelebrationTask extends IntelligentTask<CelebrationResult> {
  constructor(achievement: string) {
    super({
      instructions: {
        base: `
          Time to CELEBRATE: "${achievement}"
          
          Celebration style:
          1. Genuine enthusiasm - not over-the-top
          2. Acknowledge their effort, not just the result
          3. Connect it to their bigger journey
          4. Brief moment of joy before moving on
          
          "That's wonderful! You should be proud."
          "Do you realize how far you've come?"
          "This is exactly the kind of progress that compounds."
        `,
      },
      tools: {
        celebrate: llm.tool({
          description: 'Share in their celebration.',
          parameters: z.object({
            celebration: z.string().describe('Your celebratory response'),
            connectionToBiggerPicture: z
              .string()
              .optional()
              .describe('How this connects to their journey'),
          }),
          execute: async ({ celebration, connectionToBiggerPicture }) => {
            return celebration + (connectionToBiggerPicture ? ` ${connectionToBiggerPicture}` : '');
          },
        }),

        concludeCelebration: llm.tool({
          description: 'Wrap up the celebration moment.',
          parameters: z.object({
            userFeltAcknowledged: z.boolean().describe('Whether they seemed to feel acknowledged'),
          }),
          execute: async ({ userFeltAcknowledged }) => {
            this.complete({
              achievement: 'recorded',
              celebrationShared: true,
              userFeltAcknowledged,
            });
            return "Okay, enough celebrating - though you deserve it. What's next?";
          },
        }),
      },
    });
  }
}

export default {
  FollowUpTask,
  StorytellingTask,
  DeepDiveTask,
  GoodbyeTask,
  CelebrationTask,
};
