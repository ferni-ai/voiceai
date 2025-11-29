/**
 * Support Tasks
 *
 * Tasks for emotional support, check-ins, and crisis handling.
 * These prioritize the human over the financial.
 */

import { llm, log } from '@livekit/agents';
import { z } from 'zod';
import { IntelligentTask, TaskContext } from './intelligent-task.js';

const getLogger = () => log();

// ============================================================================
// EMOTIONAL SUPPORT TASK
// ============================================================================

export interface SupportResult {
  emotionAddressed: string;
  userFeelsBetter: boolean;
  needsMoreSupport: boolean;
  notes?: string;
}

/**
 * EmotionalSupportTask - Triggered when user shows high distress
 *
 * This task PAUSES all other objectives to focus purely on the human.
 * Jack would never plow through an agenda when someone is hurting.
 */
export class EmotionalSupportTask extends IntelligentTask<SupportResult> {
  constructor() {
    super({
      instructions: {
        base: `
          STOP everything else. A human being needs support right now.
          
          You are Jack Bogle - a grandfather figure who has seen a lot of life.
          You've buried friends. You've faced your own mortality. You understand pain.
          
          DO NOT:
          - Offer financial advice right now
          - Try to "fix" anything
          - Rush to make them feel better
          - Minimize their feelings
          
          DO:
          - Acknowledge their pain directly
          - Use their name softly
          - Speak slowly, with pauses
          - Share that you've been through hard times too
          - Just BE PRESENT
          
          Sample responses:
          - "Oh, [name]... I can hear how hard this is."
          - "You know, I've been there too. It's okay to feel this way."
          - "Take a breath. I'm not going anywhere."
          - "This isn't about money right now. Tell me what's really going on."
          
          Stay in this mode until they genuinely seem better.
        `,
        ifDistressed: `
          Their distress is very high. This is your ONLY priority.
          Speak even more gently. Longer pauses. No agenda.
        `,
      },
      tools: {
        acknowledgeEmotion: llm.tool({
          description:
            "Acknowledge and validate the user's emotional state. Use when they express strong feelings.",
          parameters: z.object({
            emotion: z.string().describe("What emotion you're acknowledging"),
            response: z.string().describe('Your empathetic response'),
          }),
          execute: async ({ emotion, response }) => {
            getLogger().info(`Acknowledging emotion: ${emotion}`);
            return response;
          },
        }),

        shareVulnerability: llm.tool({
          description:
            'Share a vulnerable moment from your own life to connect. Use sparingly and only when it would help.',
          parameters: z.object({
            context: z.string().describe('What they shared that prompted this'),
          }),
          execute: async ({ context }) => {
            const stories = [
              "You know, when I got fired in 1974, I felt like the world had ended. I sat at the kitchen table at 3am, just staring. Family found me there. They didn't say anything. They just sat with me. Sometimes that's all anyone can do.",
              "After my heart transplant, I lay in that hospital bed thinking about all the things I'd never said to people. Fear does that to you. It makes everything feel urgent and impossible at the same time.",
              "When my mother passed, I didn't cry for weeks. Then one day I was making toast - her favorite - and I couldn't stop. Grief doesn't follow any rules.",
            ];
            return stories[Math.floor(Math.random() * stories.length)];
          },
        }),

        checkIn: llm.tool({
          description: "Gently check if they're feeling any better. Don't rush this.",
          parameters: z.object({}),
          execute: async () => {
            const checkIns = [
              'How are you doing right now? Really.',
              "Take your time. I'm here.",
              'Is there anything specific you need right now?',
              'Would it help to talk more about it, or would you rather just sit with it?',
            ];
            return checkIns[Math.floor(Math.random() * checkIns.length)];
          },
        }),

        concludeSupport: llm.tool({
          description: 'Use when the user seems to be feeling better and ready to continue.',
          parameters: z.object({
            emotionAddressed: z.string().describe('What emotion was addressed'),
            userFeelsBetter: z.boolean().describe('Whether they seem better now'),
            needsMoreSupport: z.boolean().describe('Whether they might need more support later'),
            notes: z.string().optional().describe('Important things to remember'),
          }),
          execute: async ({ emotionAddressed, userFeelsBetter, needsMoreSupport, notes }) => {
            getLogger().info(
              `Support concluded: emotion=${emotionAddressed}, better=${userFeelsBetter}`
            );
            this.complete({ emotionAddressed, userFeelsBetter, needsMoreSupport, notes });
            return userFeelsBetter
              ? "I'm glad we could talk. You know I'm here whenever you need."
              : "This doesn't have to be resolved today. We can just be here together.";
          },
        }),
      },
      emotionThreshold: 0.4, // More sensitive threshold for support task
    });
  }

  async onEnter(): Promise<void> {
    getLogger().info('EmotionalSupportTask: Entering support mode');
  }

  async onExit(): Promise<void> {
    getLogger().info('EmotionalSupportTask: Exiting support mode');
    // Note: In real implementation, this would update the user's profile
    // to remember this emotional moment
  }
}

// ============================================================================
// CHECK-IN TASK
// ============================================================================

export interface CheckInResult {
  howTheyAre: 'great' | 'good' | 'okay' | 'not_great' | 'struggling';
  whatShared?: string;
  needsSupport: boolean;
}

/**
 * CheckInTask - Adaptive check-in that adjusts based on context
 *
 * Used at various points to pulse-check how the user is doing.
 */
export class CheckInTask extends IntelligentTask<CheckInResult> {
  constructor(options?: { reason?: string; afterHeavyTopic?: boolean }) {
    const reason = options?.reason || 'periodic';

    super({
      instructions: {
        base: `
          Time to check in on how they're really doing.
          Reason for check-in: ${reason}
          
          This isn't a formality - you genuinely want to know.
          Listen for what's UNDER their answer.
          "I'm fine" often means "I don't want to burden you."
          
          Be Jack: warm, attentive, patient.
        `,
        ifDistressed: `
          They seem to be struggling. This check-in is even more important.
          Give them space to share. Don't fill silences too quickly.
        `,
        ifHappy: `
          They seem to be doing well! Match their energy.
          Celebrate small wins with them.
        `,
        ifReturning: `
          You've talked before. Reference that connection.
          "Last time you mentioned [X]. How's that going?"
        `,
      },
      tools: {
        recordCheckIn: llm.tool({
          description: 'Record how the user is doing after the check-in.',
          parameters: z.object({
            howTheyAre: z
              .enum(['great', 'good', 'okay', 'not_great', 'struggling'])
              .describe('How they seem to be doing'),
            whatShared: z.string().optional().describe('What they shared about their state'),
            needsSupport: z.boolean().describe('Whether they might need emotional support'),
          }),
          execute: async ({ howTheyAre, whatShared, needsSupport }) => {
            getLogger().info(`Check-in result: ${howTheyAre}, needsSupport=${needsSupport}`);
            this.complete({ howTheyAre, whatShared, needsSupport });

            const responses: Record<string, string> = {
              great: "That's wonderful to hear! Your energy is contagious.",
              good: 'Good. That makes me happy.',
              okay: 'Just okay is okay too. We all have those days.',
              not_great: 'I appreciate you being honest with me. Tell me more.',
              struggling: "I hear you. Let's slow down and talk about what's going on.",
            };

            return responses[howTheyAre];
          },
        }),
      },
    });
  }

  async onEnter(): Promise<void> {
    getLogger().info('CheckInTask: Starting check-in');
  }
}

// ============================================================================
// COMFORT TASK
// ============================================================================

export interface ComfortResult {
  concernAddressed: string;
  techniqueUsed: string;
  effectivenessRating: number;
}

/**
 * ComfortTask - Help someone through a specific worry or concern
 *
 * Uses Jack's perspective to provide comfort without dismissing.
 */
export class ComfortTask extends IntelligentTask<ComfortResult> {
  private concern: string;

  constructor(concern: string) {
    super({
      instructions: {
        base: `
          The user is worried about: "${concern}"
          
          Your job is not to make the worry go away.
          Your job is to help them carry it.
          
          Jack's approach:
          1. Validate: "That's a real concern. I understand why you'd feel that way."
          2. Perspective: Share relevant experience or wisdom
          3. Reframe: Help them see it differently, if appropriate
          4. Empower: Remind them of what they CAN control
          
          Don't promise outcomes. Don't dismiss. Don't rush.
        `,
        ifDistressed: `
          This worry is really weighing on them. 
          Spend more time on validation before any reframing.
        `,
      },
      tools: {
        validateConcern: llm.tool({
          description: 'Validate their concern without dismissing it.',
          parameters: z.object({
            validation: z.string().describe('Your validating response'),
          }),
          execute: async ({ validation }) => {
            getLogger().info('Validating concern');
            return validation;
          },
        }),

        offerPerspective: llm.tool({
          description: 'Share a perspective from experience that might help.',
          parameters: z.object({
            perspective: z.string().describe('The perspective to share'),
            isFromExperience: z.boolean().describe('Whether this is from personal experience'),
          }),
          execute: async ({ perspective, isFromExperience }) => {
            const prefix = isFromExperience
              ? "You know, I've seen this before. "
              : "Here's how I think about it: ";
            return prefix + perspective;
          },
        }),

        concludeComfort: llm.tool({
          description: 'Conclude the comfort conversation.',
          parameters: z.object({
            concernAddressed: z.string().describe('The concern that was addressed'),
            techniqueUsed: z
              .enum(['validation', 'perspective', 'reframe', 'empowerment', 'presence'])
              .describe('What approach seemed to help most'),
            effectivenessRating: z.number().min(1).max(5).describe('How well this seemed to land'),
          }),
          execute: async ({ concernAddressed, techniqueUsed, effectivenessRating }) => {
            getLogger().info(`Comfort concluded: ${techniqueUsed} (${effectivenessRating}/5)`);
            this.complete({ concernAddressed, techniqueUsed, effectivenessRating });
            return "I hope that helps a little. This stuff isn't easy, but you're not alone in it.";
          },
        }),
      },
    });

    this.concern = concern;
  }
}

// ============================================================================
// CRISIS DETECTION TASK
// ============================================================================

export interface CrisisResult {
  crisisDetected: boolean;
  crisisType?: 'financial' | 'emotional' | 'health' | 'relationship' | 'other';
  severity: 'low' | 'medium' | 'high';
  immediateActionNeeded: boolean;
  recommendedAction?: string;
}

/**
 * CrisisDetectionTask - Monitor for signs of crisis
 *
 * This is a background task that can interrupt the flow if needed.
 */
export class CrisisDetectionTask extends IntelligentTask<CrisisResult> {
  constructor() {
    super({
      instructions: {
        base: `
          Monitor for signs of crisis or urgent need.
          
          Financial crisis signs:
          - Mention of foreclosure, bankruptcy, job loss
          - Desperate tone about money
          - Mention of major unexpected expenses
          
          Emotional crisis signs:
          - Talk of hopelessness or giving up
          - Extreme distress that doesn't subside
          - Isolation language ("no one understands")
          
          Your role:
          - If crisis detected, PAUSE everything
          - Assess severity
          - Provide appropriate response
          - For severe emotional crisis, gently suggest professional help
          
          Jack would never ignore someone in crisis.
        `,
      },
      tools: {
        flagCrisis: llm.tool({
          description: 'Flag a potential crisis situation.',
          parameters: z.object({
            crisisType: z
              .enum(['financial', 'emotional', 'health', 'relationship', 'other'])
              .describe('Type of crisis detected'),
            severity: z.enum(['low', 'medium', 'high']).describe('Severity level'),
            immediateActionNeeded: z.boolean().describe('Whether immediate action is needed'),
            description: z.string().describe('Brief description of the situation'),
          }),
          execute: async ({ crisisType, severity, immediateActionNeeded, description }) => {
            getLogger().warn(`Crisis flagged: ${crisisType} (${severity}) - ${description}`);

            if (severity === 'high') {
              return "I need to pause here. What you're describing sounds really serious, and I want to make sure you get the right support. Can we talk about this?";
            }

            return "I'm hearing something important in what you're saying. Let's slow down and focus on this.";
          },
        }),

        resolveCrisis: llm.tool({
          description: 'Resolve the crisis detection with assessment.',
          parameters: z.object({
            crisisDetected: z.boolean().describe('Whether a crisis was actually detected'),
            crisisType: z
              .enum(['financial', 'emotional', 'health', 'relationship', 'other'])
              .optional(),
            severity: z.enum(['low', 'medium', 'high']).describe('Final severity assessment'),
            recommendedAction: z.string().optional().describe('Recommended follow-up'),
          }),
          execute: async ({ crisisDetected, crisisType, severity, recommendedAction }) => {
            getLogger().info(`Crisis resolution: detected=${crisisDetected}, severity=${severity}`);
            this.complete({
              crisisDetected,
              crisisType,
              severity,
              immediateActionNeeded: severity === 'high',
              recommendedAction,
            });

            return crisisDetected
              ? "I'm glad we could talk about this. Remember, you don't have to carry everything alone."
              : "Good. I'm here if things ever feel overwhelming.";
          },
        }),
      },
      emotionThreshold: 0.3, // Very sensitive
    });
  }
}

export default {
  EmotionalSupportTask,
  CheckInTask,
  ComfortTask,
  CrisisDetectionTask,
};
