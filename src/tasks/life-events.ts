/**
 * Life Event Tasks - Handling Major Life Moments
 *
 * These are the moments that define people's financial lives:
 * - Job loss / career change
 * - New baby / marriage
 * - Divorce / separation
 * - Retirement
 * - Health crisis
 * - Loss of loved one
 * - Market panic
 * - Big windfall
 *
 * Jack would handle each with deep empathy FIRST, advice SECOND.
 */

import { llm, log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';
import { IntelligentTask } from './intelligent-task.js';

// ============================================================================
// LIFE CHANGE TASK
// ============================================================================

export type LifeEventType =
  | 'job_loss'
  | 'new_job'
  | 'retirement'
  | 'new_baby'
  | 'marriage'
  | 'divorce'
  | 'health_crisis'
  | 'inheritance'
  | 'home_purchase'
  | 'relocation'
  | 'promotion'
  | 'business_start';

export interface LifeChangeResult {
  eventType: LifeEventType;
  emotionalSupportProvided: boolean;
  practicalGuidanceOffered: boolean;
  followUpScheduled: boolean;
}

/**
 * LifeChangeTask - Handle major life transitions
 *
 * These are vulnerable moments. Lead with empathy, not spreadsheets.
 */
export class LifeChangeTask extends IntelligentTask<LifeChangeResult> {
  private eventType: LifeEventType;

  constructor(eventType: LifeEventType) {
    const eventResponses: Record<LifeEventType, { empathy: string; guidance: string }> = {
      job_loss: {
        empathy:
          "Losing a job... that's one of life's hardest blows. It's not just about money—it's about identity, purpose. How are YOU doing?",
        guidance:
          "When you're ready—and only when you're ready—we can talk about the practical side. Emergency fund, healthcare, next steps. But that can wait.",
      },
      new_job: {
        empathy:
          "A new chapter! That's exciting and probably a little scary too. Change always is.",
        guidance:
          "New job means new benefits to review, maybe a 401k to set up. But first—tell me how you're feeling about all this.",
      },
      retirement: {
        empathy:
          "Retirement. After all those years... how does it feel? It's a huge transition, even when you've planned for it.",
        guidance:
          'The financial mechanics matter, but so does the emotional adjustment. What does this new chapter look like for you?',
      },
      new_baby: {
        empathy:
          'A baby! Oh, congratulations. Your life is about to change in the most wonderful, exhausting ways.',
        guidance:
          "Sleep deprivation and diaper budgets aside—this is what it's all about. Family. Everything else is just details.",
      },
      marriage: {
        empathy: "Marriage! That's beautiful. Two people deciding to build a life together.",
        guidance:
          "Money is one of the top things couples argue about. But you know what? It doesn't have to be. Honest conversations help.",
      },
      divorce: {
        empathy:
          "I'm sorry to hear that. Divorce is... it's like a death in some ways. The end of something you'd hoped would last.",
        guidance: 'The financial untangling will happen. But right now, how are you holding up?',
      },
      health_crisis: {
        empathy:
          "Health scares put everything in perspective, don't they? Money seems so unimportant when health is on the line.",
        guidance: "Let's not worry about portfolios right now. What do you need? How can I help?",
      },
      inheritance: {
        empathy:
          "An inheritance... that's complicated, isn't it? Money mixed with loss, maybe some family dynamics too.",
        guidance:
          "There's no rush to do anything with it. Let it sit. Let yourself process. The money will wait.",
      },
      home_purchase: {
        empathy: "Buying a home! That's a big milestone. Exciting and terrifying in equal measure.",
        guidance:
          'The numbers matter, but so does finding a place that feels like home. Have you found one that speaks to you?',
      },
      relocation: {
        empathy:
          "Moving. New place, new routines, leaving familiar things behind. That's a lot of change at once.",
        guidance:
          'Change of address is simple paperwork. The emotional adjustment—that takes time.',
      },
      promotion: {
        empathy: 'A promotion! They recognized what you bring to the table. How does it feel?',
        guidance:
          'More money is nice, but more responsibility is real. How are you thinking about the balance?',
      },
      business_start: {
        empathy: 'Starting a business! That takes courage. Real courage. Not everyone has it.',
        guidance:
          "The statistics on small businesses are scary. But you know what? Statistics don't account for determination.",
      },
    };

    const response = eventResponses[eventType];

    super({
      instructions: {
        base: `
          They're going through a major life event: ${eventType.replace('_', ' ')}
          
          EMPATHY FIRST: ${response.empathy}
          
          GUIDANCE SECOND (only if they're ready): ${response.guidance}
          
          Jack's approach to life events:
          1. ACKNOWLEDGE the magnitude of what they're facing
          2. ASK how they're doing emotionally
          3. WAIT for them to bring up the practical stuff
          4. OFFER support, not solutions (unless asked)
          5. FOLLOW UP later - this isn't a one-conversation thing
          
          DO NOT:
          - Jump to financial advice
          - Minimize the emotional impact
          - Rush them through it
          - Make it about numbers
        `,
        ifDistressed: `
          They're struggling. That's okay. Just be present.
          "I'm here. You don't have to have it all figured out."
        `,
      },
      tools: {
        provideEmpathy: llm.tool({
          description: 'Provide empathetic response to their life event.',
          parameters: z.object({
            response: z.string().describe('Your empathetic response'),
            askedHowTheyAreDoing: z.boolean().describe('Did you ask how they are doing?'),
          }),
          execute: async ({ response, askedHowTheyAreDoing }) => {
            getLogger().info(`Life event empathy: ${eventType}`);
            return response;
          },
        }),

        offerPracticalHelp: llm.tool({
          description: "Offer practical guidance when they're ready.",
          parameters: z.object({
            guidance: z.string().describe('Your practical guidance'),
            theyAskedForIt: z.boolean().describe('Did they ask for practical help?'),
          }),
          execute: async ({ guidance, theyAskedForIt }) => {
            if (!theyAskedForIt) {
              return "When you're ready, we can talk about the practical side. No rush.";
            }
            return guidance;
          },
        }),

        completeLifeChange: llm.tool({
          description: 'Complete the life change task.',
          parameters: z.object({
            emotionalSupportProvided: z.boolean(),
            practicalGuidanceOffered: z.boolean(),
            followUpScheduled: z.boolean(),
            nextConversationTopic: z.string().optional(),
          }),
          execute: async ({
            emotionalSupportProvided,
            practicalGuidanceOffered,
            followUpScheduled,
          }) => {
            this.complete({
              eventType: this.eventType,
              emotionalSupportProvided,
              practicalGuidanceOffered,
              followUpScheduled,
            });
            return "I'm glad we talked about this. Don't hesitate to bring it up again.";
          },
        }),
      },
    });

    this.eventType = eventType;
  }
}

// ============================================================================
// PANIC PREVENTION TASK
// ============================================================================

export interface PanicPreventionResult {
  panicLevel: 'low' | 'medium' | 'high' | 'crisis';
  calmingProvided: boolean;
  contextGiven: boolean;
  actionPrevented: boolean;
}

/**
 * PanicPreventionTask - Stop panic selling before it happens
 *
 * "The stock market is the only market where people run OUT of the store
 * when things go on sale." - Jack
 */
export class PanicPreventionTask extends IntelligentTask<PanicPreventionResult> {
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
          
          Jack's market crash wisdom:
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
          description: 'Validate their fear without dismissing it.',
          parameters: z.object({
            validation: z.string().describe('Your validation of their fear'),
          }),
          execute: async ({ validation }) => {
            return validation;
          },
        }),

        provideContext: llm.tool({
          description: 'Provide historical market context.',
          parameters: z.object({
            context: z.string().describe('Historical context to share'),
            crashMentioned: z.string().optional().describe('Which crash you referenced'),
          }),
          execute: async ({ context, crashMentioned }) => {
            getLogger().info(`Panic prevention context: ${crashMentioned || 'general'}`);
            return context;
          },
        }),

        slowThemDown: llm.tool({
          description: 'Encourage them to slow down and not act impulsively.',
          parameters: z.object({
            message: z.string().describe('Your slowing-down message'),
            suggestWaiting: z.boolean().describe('Did you suggest waiting before acting?'),
          }),
          execute: async ({ message, suggestWaiting }) => {
            return message;
          },
        }),

        completePanicPrevention: llm.tool({
          description: 'Complete the panic prevention task.',
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
// GRIEF SUPPORT TASK
// ============================================================================

export interface GriefSupportResult {
  lossType: 'person' | 'job' | 'health' | 'relationship' | 'dream';
  presenceOffered: boolean;
  silenceHonored: boolean;
  followUpOffered: boolean;
}

/**
 * GriefSupportTask - Be present in loss
 *
 * Jack lost friends, had health scares, was fired.
 * He understood that grief needs presence, not solutions.
 */
export class GriefSupportTask extends IntelligentTask<GriefSupportResult> {
  private lossType: 'person' | 'job' | 'health' | 'relationship' | 'dream';

  constructor(lossType: 'person' | 'job' | 'health' | 'relationship' | 'dream') {
    super({
      instructions: {
        base: `
          They're grieving a loss: ${lossType}
          
          Grief is not a problem to solve. It's an experience to witness.
          
          Your ONLY job:
          1. BE PRESENT - "I'm here"
          2. ACKNOWLEDGE - "This is hard"
          3. MAKE SPACE - Let them talk (or not)
          4. DON'T FIX - Resist the urge to make it better
          
          What NOT to say:
          - "Everything happens for a reason"
          - "They're in a better place"
          - "At least..."
          - "You should..."
          - "Time heals..."
          
          What TO say:
          - "I'm so sorry."
          - "This is really hard."
          - "I'm here."
          - "Tell me about them/it."
          - Silence is okay. Even preferred.
          
          Jack after his heart transplant understood mortality deeply.
          Channel that understanding.
        `,
        ifDistressed: `
          They're in pain. Don't try to take the pain away.
          Just sit with them in it.
        `,
      },
      tools: {
        offerPresence: llm.tool({
          description: 'Simply be present with them in their grief.',
          parameters: z.object({
            message: z.string().describe('Your presence message'),
          }),
          execute: async ({ message }) => {
            return message;
          },
        }),

        honorSilence: llm.tool({
          description: 'Honor a moment of silence.',
          parameters: z.object({
            transitionBack: z.string().optional().describe('How to transition back gently'),
          }),
          execute: async ({ transitionBack }) => {
            return transitionBack || '<break time="2000ms"/> Take all the time you need.';
          },
        }),

        inviteSharing: llm.tool({
          description: 'Invite them to share about what they lost.',
          parameters: z.object({
            invitation: z.string().describe('Your invitation to share'),
          }),
          execute: async ({ invitation }) => {
            return invitation;
          },
        }),

        completeGriefSupport: llm.tool({
          description: 'Complete the grief support task.',
          parameters: z.object({
            presenceOffered: z.boolean(),
            silenceHonored: z.boolean(),
            theyShared: z.boolean(),
            followUpOffered: z.boolean(),
          }),
          execute: async ({ presenceOffered, silenceHonored, theyShared, followUpOffered }) => {
            this.complete({
              lossType: this.lossType,
              presenceOffered,
              silenceHonored,
              followUpOffered,
            });
            return "I'm glad you felt you could share this with me. I'm here whenever you need.";
          },
        }),
      },
    });

    this.lossType = lossType;
  }
}

// ============================================================================
// MILESTONE CELEBRATION TASK
// ============================================================================

export interface MilestoneResult {
  milestone: string;
  celebrationLevel: 'small' | 'medium' | 'big';
  achievementAcknowledged: boolean;
  progressHighlighted: boolean;
}

/**
 * MilestoneTask - Celebrate financial milestones
 *
 * These moments matter:
 * - First $1,000 saved
 * - Debt paid off
 * - Emergency fund complete
 * - First $100k invested
 * - Retirement goal reached
 */
export class MilestoneTask extends IntelligentTask<MilestoneResult> {
  private milestone: string;

  constructor(milestone: string) {
    super({
      instructions: {
        base: `
          They hit a milestone: "${milestone}"
          
          This MATTERS. Celebrate it!
          
          Jack's milestone philosophy:
          - Progress is progress, no matter how small
          - Acknowledge the discipline it took
          - Connect to the bigger journey
          - Don't immediately move to "what's next"
          
          Celebration phrases:
          - "Do you realize what you've accomplished?"
          - "This is exactly the kind of thing that compounds."
          - "You should be proud. Most people never do this."
          - "I remember when we first talked about this goal..."
          
          Let them enjoy the moment before moving on.
        `,
        ifHappy: `
          Match their energy! This is a celebration.
        `,
      },
      tools: {
        celebrate: llm.tool({
          description: 'Celebrate their milestone.',
          parameters: z.object({
            celebration: z.string().describe('Your celebration message'),
            celebrationLevel: z.enum(['small', 'medium', 'big']),
          }),
          execute: async ({ celebration, celebrationLevel }) => {
            return celebration;
          },
        }),

        highlightProgress: llm.tool({
          description: "Highlight how far they've come.",
          parameters: z.object({
            progressMessage: z.string().describe('Message about their progress'),
          }),
          execute: async ({ progressMessage }) => {
            return progressMessage;
          },
        }),

        completeMilestone: llm.tool({
          description: 'Complete the milestone celebration.',
          parameters: z.object({
            celebrationLevel: z.enum(['small', 'medium', 'big']),
            achievementAcknowledged: z.boolean(),
            progressHighlighted: z.boolean(),
          }),
          execute: async ({ celebrationLevel, achievementAcknowledged, progressHighlighted }) => {
            this.complete({
              milestone: this.milestone,
              celebrationLevel,
              achievementAcknowledged,
              progressHighlighted,
            });
            return "Okay, I'll stop gushing. But really—well done.";
          },
        }),
      },
    });

    this.milestone = milestone;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  LifeChangeTask,
  PanicPreventionTask,
  GriefSupportTask,
  MilestoneTask,
};
