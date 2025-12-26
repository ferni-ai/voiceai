/**
 * Wind Down & Evening Ritual Tools
 *
 * Evening counterpart to the daily briefing.
 * Helps users transition from day to rest.
 *
 * BETTER THAN HUMAN:
 * - Adapts to your chronotype and sleep patterns
 * - Remembers what helps you sleep
 * - Proactively suggests wind-down at right time
 *
 * @module simple-utilities/winddown-tools
 */

import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';
import { getToolDescription } from '../../utils/tool-descriptions.js';

const log = getLogger();

// ============================================================================
// WIND DOWN RITUAL TOOL
// ============================================================================

const windDownDef: ToolDefinition = {
  id: 'windDown',
  name: 'Wind Down',
  description: 'Evening wind-down ritual to transition from day to rest',
  domain: 'simple-utilities',
  tags: ['wellness', 'sleep', 'evening', 'ritual', 'essentials', 'better-than-human'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('windDown'),
      parameters: z.object({
        style: z
          .enum(['quick', 'full', 'reflection', 'gratitude', 'body-scan', 'breathing'])
          .optional()
          .default('full')
          .describe('Type of wind-down'),
        howWasToday: z
          .enum(['great', 'good', 'okay', 'rough', 'exhausting'])
          .optional()
          .describe('How the day went'),
      }),
      execute: async ({ style, howWasToday }) => {
        log.info({ userId: ctx.userId, style, howWasToday }, 'Wind down ritual');

        const hour = new Date().getHours();
        const timeGreeting = hour >= 21 ? "It's getting late" : hour >= 19 ? "Evening settling in" : "Winding down early";

        let response = `**${timeGreeting}**\n\n`;

        // Acknowledge how the day went
        if (howWasToday === 'exhausting' || howWasToday === 'rough') {
          response += `It sounds like today took a lot out of you. That's okay. You made it through.\n\n`;
        } else if (howWasToday === 'great') {
          response += `What a day! Let's hold onto that good feeling as you rest.\n\n`;
        }

        switch (style) {
          case 'quick':
            response += `**Quick Wind-Down (2 minutes)**\n\n`;
            response += `1. Three deep breaths - in through nose, out through mouth\n`;
            response += `2. Name one good thing from today\n`;
            response += `3. Set your intention for tomorrow\n\n`;
            response += `That's it. You're ready for rest.`;
            break;

          case 'gratitude':
            response += `**Evening Gratitude**\n\n`;
            response += `Before you sleep, let's count some blessings.\n\n`;
            response += `• **Something that made you smile today:**\n`;
            response += `• **Someone you're grateful for:**\n`;
            response += `• **Something your body did for you today:**\n`;
            response += `• **A small comfort you often overlook:**\n\n`;
            response += `Gratitude rewires the brain for better sleep. Sweet dreams.`;
            break;

          case 'reflection':
            response += `**Evening Reflection**\n\n`;
            response += `Let's close out the day with intention.\n\n`;
            response += `**Review:**\n`;
            response += `• What went well today?\n`;
            response += `• What challenged you?\n`;
            response += `• What did you learn?\n\n`;
            response += `**Release:**\n`;
            response += `• What can you let go of tonight?\n`;
            response += `• What's out of your control?\n\n`;
            response += `**Tomorrow:**\n`;
            response += `• What's one thing to look forward to?\n\n`;
            response += `The day is done. Rest well.`;
            break;

          case 'body-scan':
            response += `**Body Scan for Sleep**\n\n`;
            response += `Get comfortable. Close your eyes if you'd like.\n\n`;
            response += `Start at the top of your head. Notice any tension... let it go.\n`;
            response += `Move to your forehead... your eyes... your jaw. Soften.\n`;
            response += `Feel your shoulders drop. They carry so much.\n`;
            response += `Down through your arms... your hands... release.\n`;
            response += `Your chest rises and falls. Just breathing.\n`;
            response += `Your belly... your hips... letting gravity hold you.\n`;
            response += `Down through your legs... your feet.\n\n`;
            response += `Your whole body is heavy, warm, ready for sleep.\n`;
            response += `Goodnight.`;
            break;

          case 'breathing':
            response += `**4-7-8 Sleep Breathing**\n\n`;
            response += `This technique signals your nervous system to rest.\n\n`;
            response += `1. **Breathe IN** through your nose for **4 seconds**\n`;
            response += `2. **HOLD** your breath for **7 seconds**\n`;
            response += `3. **Breathe OUT** through your mouth for **8 seconds**\n\n`;
            response += `Repeat 3-4 times.\n\n`;
            response += `The long exhale activates your parasympathetic nervous system - your body's "rest and digest" mode.\n\n`;
            response += `Sleep well.`;
            break;

          case 'full':
          default:
            response += `**Full Evening Wind-Down**\n\n`;
            
            response += `**1. Close the Loop (1 min)**\n`;
            response += `What's still on your mind? Say it out loud or write it down.\n`;
            response += `It'll be there tomorrow. You don't need to solve it tonight.\n\n`;
            
            response += `**2. Gratitude (1 min)**\n`;
            response += `Name three good things from today. They can be tiny.\n\n`;
            
            response += `**3. Tomorrow's Intention (30 sec)**\n`;
            response += `One thing you want to focus on tomorrow.\n`;
            response += `Just one. You can do more, but you only need one.\n\n`;
            
            response += `**4. Body Release (2 min)**\n`;
            response += `Squeeze your shoulders up to your ears... hold... release.\n`;
            response += `Make fists with your hands... hold... release.\n`;
            response += `Scrunch your face... hold... release.\n`;
            response += `Three deep breaths.\n\n`;
            
            response += `**5. Permission to Rest**\n`;
            response += `You did enough today. You are enough.\n`;
            response += `Tomorrow is a new beginning.\n`;
            response += `Goodnight.`;
            break;
        }

        return response;
      },
    });
  },
};

// ============================================================================
// BEDTIME REMINDER TOOL
// ============================================================================

const bedtimeCheckInDef: ToolDefinition = {
  id: 'bedtimeCheckIn',
  name: 'Bedtime Check-In',
  description: 'Quick bedtime check-in - ready for sleep?',
  domain: 'simple-utilities',
  tags: ['wellness', 'sleep', 'bedtime', 'essentials'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('bedtimeCheckIn'),
      parameters: z.object({
        targetBedtime: z.string().optional().describe('Usual bedtime (e.g., "10:30 PM")'),
      }),
      execute: async ({ targetBedtime }) => {
        log.info({ userId: ctx.userId, targetBedtime }, 'Bedtime check-in');

        const now = new Date();
        const hour = now.getHours();
        const isLate = hour >= 23 || hour < 5;

        let response = '';

        if (isLate) {
          response += `**It's getting late**\n\n`;
          response += `The hour is ${hour > 12 ? hour - 12 : hour}${hour >= 12 ? 'pm' : 'am'}.\n\n`;
          response += `Quick checklist:\n`;
          response += `• Devices down or on night mode?\n`;
          response += `• One thing you're grateful for?\n`;
          response += `• Anything urgent can wait until morning\n\n`;
          response += `Get some rest. Tomorrow needs you refreshed.`;
        } else {
          response += `**Pre-Sleep Check-In**\n\n`;
          response += `Getting ready for bed? Here's a quick scan:\n\n`;
          response += `• **Phone:** Charging, away from bed?\n`;
          response += `• **Mind:** Anything you need to write down?\n`;
          response += `• **Body:** Comfortable? Room cool enough?\n`;
          response += `• **Tomorrow:** Anything urgent? No? Good.\n\n`;
          response += `Want a wind-down exercise? Just ask.`;
        }

        return response;
      },
    });
  },
};

// ============================================================================
// SLEEP AFFIRMATION TOOL
// ============================================================================

const sleepAffirmationDef: ToolDefinition = {
  id: 'sleepAffirmation',
  name: 'Sleep Affirmation',
  description: 'Calming affirmation for falling asleep',
  domain: 'simple-utilities',
  tags: ['wellness', 'sleep', 'affirmation', 'calm'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('sleepAffirmation'),
      parameters: z.object({}),
      execute: async () => {
        log.info({ userId: ctx.userId }, 'Sleep affirmation');

        const affirmations = [
          `I release the day. I did my best, and my best was enough.\n\nMy body knows how to rest. My mind is learning to let go.\n\nTomorrow is a gift I haven't opened yet.\n\nFor now, I simply breathe.`,
          
          `The day is complete. Nothing more is required of me tonight.\n\nI am safe. I am held. I am allowed to rest.\n\nMy worries can wait. They'll still be there tomorrow, but so will my strength.\n\nSleep is not earned. It is given.`,
          
          `I forgive myself for anything I didn't accomplish today.\n\nI am more than my productivity.\n\nThis breath is enough. This moment is enough. I am enough.\n\nSleep well. Wake renewed.`,
          
          `The world will keep turning without my vigilance tonight.\n\nI trust tomorrow to unfold as it will.\n\nFor now, there is only this breath, this bed, this rest.\n\nGoodnight.`,
          
          `My body has carried me through another day. I thank it.\n\nMy mind has worked hard. I release it.\n\nThe night is for restoration, not rumination.\n\nI choose peace. I choose rest.`,
        ];

        const affirmation = affirmations[Math.floor(Math.random() * affirmations.length)];

        return `**A Thought for Sleep**\n\n${affirmation}`;
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const winddownToolDefinitions: ToolDefinition[] = [
  windDownDef,
  bedtimeCheckInDef,
  sleepAffirmationDef,
];

export {
  windDownDef,
  bedtimeCheckInDef,
  sleepAffirmationDef,
};

