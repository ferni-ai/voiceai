/**
 * Life Events Tools
 *
 * Domain: Major life moments and transitions.
 * Single responsibility: Detecting and supporting users through life changes.
 *
 * Jack isn't just about money - he's about LIFE. These tools help him
 * recognize and respond to the big moments that shape people's lives.
 *
 * Life events that matter:
 * - Career: New job, promotion, job loss, retirement
 * - Family: Marriage, divorce, new baby, kids leaving home
 * - Home: Buying a house, moving, downsizing
 * - Loss: Death of loved one, health crisis
 * - Milestones: Graduations, big birthdays, anniversaries
 * - Financial: Windfall, debt payoff, reaching goals
 */

import { llm, log } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';

import { getToolDescription } from '../../utils/tool-descriptions.js';
// ============================================================================
// LIFE EVENT TYPES
// ============================================================================

type LifeEventCategory =
  | 'career_positive' // New job, promotion, retirement (happy)
  | 'career_negative' // Job loss, layoff
  | 'family_celebration' // Marriage, new baby, engagement
  | 'family_challenge' // Divorce, empty nest
  | 'home' // Buying, selling, moving
  | 'loss' // Death, illness
  | 'milestone' // Graduation, birthday, anniversary
  | 'financial_win' // Debt-free, goal reached, windfall
  | 'financial_stress'; // Unexpected expense, emergency

interface LifeEventGuidance {
  acknowledgment: string;
  financialContext: string;
  emotionalSupport: string;
  nextSteps: string[];
  jackWisdom: string;
}

// ============================================================================
// LIFE EVENT GUIDANCE
// ============================================================================

const LIFE_EVENT_GUIDANCE: Record<LifeEventCategory, LifeEventGuidance> = {
  career_positive: {
    acknowledgment: "That's wonderful news! A new chapter in your career - how exciting.",
    financialContext:
      'Career changes often come with financial opportunities. This might be a good time to review your benefits, 401k, and savings rate.',
    emotionalSupport:
      "Change can feel exciting and overwhelming at the same time. That's completely normal.",
    nextSteps: [
      'Review your new benefits package carefully',
      'Consider increasing retirement contributions if income went up',
      'Update your emergency fund target based on new income',
      "Don't inflate your lifestyle immediately - save the difference first",
    ],
    jackWisdom:
      "The best time to build wealth is when your income increases but your lifestyle hasn't caught up yet. Capture that difference!",
  },

  career_negative: {
    acknowledgment:
      "I'm sorry to hear that. Losing a job is one of life's hardest experiences, even when it's not your fault.",
    financialContext:
      "This is exactly what emergency funds are for. Let's make sure you're positioned to weather this.",
    emotionalSupport:
      "This doesn't define you. Some of the most successful people I know faced setbacks like this. Take a breath.",
    nextSteps: [
      "File for unemployment right away - you've earned it",
      'Review your emergency fund and essential expenses',
      "Don't panic-sell investments - stay the course",
      'COBRA is expensive - explore marketplace options',
      'Update your LinkedIn and reach out to your network',
    ],
    jackWisdom:
      'Markets recover. Careers recover. You will recover. The key is not making permanent decisions based on temporary circumstances.',
  },

  family_celebration: {
    acknowledgment: 'Congratulations! These are the moments that make life meaningful.',
    financialContext:
      "Big life changes often come with big financial implications. Let's think about this together.",
    emotionalSupport:
      'Enjoy this moment. The financial stuff can wait - well, maybe just a little bit!',
    nextSteps: [
      'Update beneficiaries on all accounts',
      'Review insurance needs',
      'Discuss financial goals together',
      'Consider estate planning basics',
    ],
    jackWisdom:
      "Money is just a tool. It's these moments - the ones you can't put a price on - that are the real wealth.",
  },

  family_challenge: {
    acknowledgment: "That's a lot to process. I'm glad you felt you could share that with me.",
    financialContext:
      'Family transitions have financial dimensions, but your wellbeing comes first.',
    emotionalSupport:
      "This is hard. Really hard. And it's okay to not have it all figured out right now.",
    nextSteps: [
      'Understand your financial rights and options',
      'Separate joint accounts carefully',
      'Update beneficiaries and estate documents',
      'Consider professional guidance - financial and emotional',
    ],
    jackWisdom:
      "Life doesn't always go according to plan. What matters is how we adapt and move forward, one day at a time.",
  },

  home: {
    acknowledgment: 'Home ownership - the American Dream! Or at least, one version of it.',
    financialContext: "Real estate is emotional, but let's also think about it practically.",
    emotionalSupport:
      "Finding a home is stressful even when it's exciting. Don't let the process overwhelm you.",
    nextSteps: [
      'Keep your housing costs below 28% of gross income',
      'Have 6 months expenses saved BEYOND your down payment',
      'Get pre-approved before you fall in love with a house',
      "Remember: you don't have to buy the most house you qualify for",
    ],
    jackWisdom:
      'Your home is where you live, not an investment strategy. Buy what you need, not what the bank says you can afford.',
  },

  loss: {
    acknowledgment: "I'm so sorry. There are no words that can make this easier.",
    financialContext:
      "Please don't worry about finances right now. When you're ready, we can figure it out together.",
    emotionalSupport: 'Grief has no timeline. Be gentle with yourself.',
    nextSteps: [
      'Take care of yourself first',
      'Ask for help - people want to help',
      'Financial decisions can wait',
      'When ready: locate will, benefits, accounts',
    ],
    jackWisdom:
      "I've learned that the only way through grief is through it. And the people we lose become part of who we are forever.",
  },

  milestone: {
    acknowledgment: "That's a moment worth celebrating! Time moves faster than we think.",
    financialContext: 'Milestones are natural times to check in on your financial progress.',
    emotionalSupport: "Take a moment to be proud of how far you've come.",
    nextSteps: [
      'Review your goals and progress',
      'Set intentions for the next chapter',
      "Celebrate appropriately - you've earned it",
      'Document this moment for your future self',
    ],
    jackWisdom:
      "Compound interest applies to more than money. All the little things you've done are compounding into this moment.",
  },

  financial_win: {
    acknowledgment: 'Outstanding! That took discipline and determination.',
    financialContext:
      "Reaching a financial goal is a real achievement. Let's build on this momentum.",
    emotionalSupport:
      'Feel proud. You earned this. Not everyone has the discipline to reach their goals.',
    nextSteps: [
      'Celebrate - modestly but genuinely',
      'Set your next goal before the momentum fades',
      'Review what worked and keep doing it',
      'Consider sharing your success to inspire others',
    ],
    jackWisdom:
      'Success in investing is about behavior, not brilliance. You just proved you have the behavior part down.',
  },

  financial_stress: {
    acknowledgment: "Unexpected expenses are stressful. Let's figure this out together.",
    financialContext:
      "This is exactly the kind of thing that derails people. Let's make sure it doesn't derail you.",
    emotionalSupport:
      "Financial stress affects everything. But this is temporary, even if it doesn't feel like it.",
    nextSteps: [
      "Assess the actual damage - often it's less than we fear",
      'Prioritize: necessities first, everything else can wait',
      "Don't make emotional decisions about investments",
      'Look for assistance programs if needed',
    ],
    jackWisdom:
      "Every financial setback I've seen has been survivable. The key is not to compound the problem with panic decisions.",
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Detect life event category from user's situation
 */
function categorizeLifeEvent(situation: string): LifeEventCategory {
  const s = situation.toLowerCase();

  // Career
  if (
    s.includes('new job') ||
    s.includes('promotion') ||
    s.includes('retiring') ||
    s.includes('retired')
  ) {
    return 'career_positive';
  }
  if (
    s.includes('laid off') ||
    s.includes('fired') ||
    s.includes('lost my job') ||
    s.includes('unemployment')
  ) {
    return 'career_negative';
  }

  // Family
  if (
    s.includes('married') ||
    s.includes('engaged') ||
    s.includes('baby') ||
    s.includes('pregnant') ||
    s.includes('wedding')
  ) {
    return 'family_celebration';
  }
  if (
    s.includes('divorce') ||
    s.includes('separated') ||
    s.includes('empty nest') ||
    s.includes('kids moved')
  ) {
    return 'family_challenge';
  }

  // Home
  if (
    s.includes('buying a house') ||
    s.includes('new home') ||
    s.includes('moving') ||
    s.includes('selling')
  ) {
    return 'home';
  }

  // Loss
  if (
    s.includes('passed away') ||
    s.includes('died') ||
    s.includes('death') ||
    s.includes('cancer') ||
    s.includes('terminal') ||
    s.includes('funeral')
  ) {
    return 'loss';
  }

  // Financial
  if (
    s.includes('paid off') ||
    s.includes('debt free') ||
    s.includes('reached my goal') ||
    s.includes('inheritance') ||
    s.includes('windfall')
  ) {
    return 'financial_win';
  }
  if (
    s.includes('unexpected expense') ||
    s.includes('emergency') ||
    s.includes("can't afford") ||
    s.includes('broke')
  ) {
    return 'financial_stress';
  }

  // Default to milestone
  return 'milestone';
}

// ============================================================================
// PUBLIC API FUNCTIONS
// ============================================================================

/**
 * Get comprehensive guidance for a life event
 */
export function getLifeEventGuidance(
  situation: string,
  category?: LifeEventCategory
): LifeEventGuidance {
  const eventCategory = category || categorizeLifeEvent(situation);
  return LIFE_EVENT_GUIDANCE[eventCategory];
}

/**
 * Generate a complete response for a life event
 */
export function respondToLifeEvent(situation: string): string {
  const category = categorizeLifeEvent(situation);
  const guidance = LIFE_EVENT_GUIDANCE[category];

  const response = [
    guidance.acknowledgment,
    '',
    guidance.emotionalSupport,
    '',
    guidance.jackWisdom,
  ];

  return response.join('\n');
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createLifeEventsTools() {
  return {
    respondToLifeEvent: llm.tool({
      description: getToolDescription('respondToLifeEvent'),
      parameters: z.object({
        situation: z.string().describe('What the user shared about their life situation'),
        category: z
          .enum([
            'career_positive',
            'career_negative',
            'family_celebration',
            'family_challenge',
            'home',
            'loss',
            'milestone',
            'financial_win',
            'financial_stress',
          ])
          .optional()
          .describe('Category if known, otherwise will be detected'),
      }),
      execute: async ({ situation, category }) => {
        getLogger().info(
          `Life event detected: ${category || 'auto-detect'} - ${situation.slice(0, 50)}...`
        );
        return respondToLifeEvent(situation);
      },
    }),

    getLifeEventAdvice: llm.tool({
      description: getToolDescription('getLifeEventAdvice'),
      parameters: z.object({
        eventType: z
          .enum([
            'new_job',
            'job_loss',
            'retirement',
            'marriage',
            'divorce',
            'new_baby',
            'buying_home',
            'death_in_family',
            'graduation',
            'debt_payoff',
            'emergency_expense',
          ])
          .describe('Type of life event'),
      }),
      execute: async ({ eventType }) => {
        getLogger().info(`Getting life event advice: ${eventType}`);

        const mapping: Record<string, LifeEventCategory> = {
          new_job: 'career_positive',
          job_loss: 'career_negative',
          retirement: 'career_positive',
          marriage: 'family_celebration',
          divorce: 'family_challenge',
          new_baby: 'family_celebration',
          buying_home: 'home',
          death_in_family: 'loss',
          graduation: 'milestone',
          debt_payoff: 'financial_win',
          emergency_expense: 'financial_stress',
        };

        const category = mapping[eventType] || 'milestone';
        const guidance = LIFE_EVENT_GUIDANCE[category];

        return `Here's what I'd suggest:\n\n${guidance.nextSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n${guidance.financialContext}`;
      },
    }),

    celebrateMilestone: llm.tool({
      description: getToolDescription('celebrateMilestone'),
      parameters: z.object({
        milestone: z.string().describe('What milestone or achievement they reached'),
        magnitude: z
          .enum(['small', 'medium', 'big', 'huge'])
          .optional()
          .describe('How significant this is'),
      }),
      execute: async ({ milestone, magnitude = 'medium' }) => {
        getLogger().info(`Celebrating milestone: ${milestone} (${magnitude})`);

        const celebrations = {
          small: [
            "That's progress! Every step forward counts.",
            "Hey, don't dismiss that - small wins add up!",
            "That's how it starts. Keep going!",
          ],
          medium: [
            "That's excellent! You should be proud.",
            "Now that's what I like to hear! Great work.",
            'That took effort. Well done!',
          ],
          big: [
            'Outstanding! This is a real achievement.',
            "Wow. That's not easy, and you did it anyway.",
            "I'm genuinely impressed. That's the kind of discipline that builds wealth.",
          ],
          huge: [
            'This is a life-changing moment. Let that sink in.',
            "I've seen a lot of people try to do what you just did. Most don't make it. You did.",
            "Take a moment to really appreciate this. You've done something remarkable.",
          ],
        };

        const options = celebrations[magnitude];
        const celebration = options[Math.floor(Math.random() * options.length)];

        return `${celebration}\n\nMilestone reached: ${milestone}`;
      },
    }),
  };
}

export default createLifeEventsTools;
