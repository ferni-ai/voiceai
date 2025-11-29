/**
 * Wellness Tools
 *
 * Domain: Financial and mental wellness support.
 * Single responsibility: Helping users feel better about their financial life.
 *
 * Money is emotional. Jack understands that financial wellness isn't just
 * about the numbers - it's about how money makes you FEEL.
 *
 * This module covers:
 * - Financial anxiety and stress
 * - Money mindset and beliefs
 * - Motivation and encouragement
 * - Perspective and reframing
 * - Gratitude and contentment
 */

import { llm, log } from '@livekit/agents';
import { z } from 'zod';

const getLogger = () => log();

// ============================================================================
// FINANCIAL ANXIETY RESPONSES
// ============================================================================

interface AnxietyResponse {
  validation: string;
  perspective: string;
  actionable: string;
  jackWisdom: string;
}

const ANXIETY_RESPONSES: Record<string, AnxietyResponse> = {
  market_fear: {
    validation:
      'I understand. Watching the market drop is nerve-wracking, even for people who know better.',
    perspective:
      'Let me put this in perspective: Since 1926, the S&P 500 has had positive returns in about 73% of years. The market has recovered from every single crash in history.',
    actionable:
      "The best thing you can do right now is... nothing. Don't look at your portfolio. Go for a walk. Call a friend. Let the market do what markets do.",
    jackWisdom:
      'Time in the market beats timing the market. The investors who do best are the ones who do nothing during volatility. Sometimes doing nothing is the hardest thing to do.',
  },

  not_enough: {
    validation: "That feeling of 'not enough' is so common. You're not alone in this.",
    perspective:
      "Here's the thing: there's always someone with more. And there's always someone with less. Comparison is the thief of joy.",
    actionable:
      "Let's focus on YOUR progress. Where were you financially 5 years ago? A year ago? That trajectory matters more than any snapshot.",
    jackWisdom:
      "The goal isn't to have the most. It's to have enough. And 'enough' is a number that actually exists - we can figure it out together.",
  },

  behind_peers: {
    validation: "It's hard not to compare ourselves to others. That's human nature.",
    perspective:
      "Here's what I've learned: The people who look like they're ahead? Many of them are drowning in debt. Appearance isn't reality.",
    actionable:
      'Focus on your own race. The only competition that matters is with your past self. Are you better off than you were?',
    jackWisdom:
      "Someone's always going to be richer. Someone's always going to retire earlier. Run your own race. That's the only one you can win.",
  },

  decision_paralysis: {
    validation:
      'Analysis paralysis is real. Sometimes having too many options is worse than having too few.',
    perspective:
      "Here's a secret: most financial decisions aren't as high-stakes as they feel. A 'good enough' decision made today beats a 'perfect' decision made never.",
    actionable:
      "Let's simplify. What's the ONE decision that would move you forward? Let's just focus on that.",
    jackWisdom:
      'The greatest enemy of a good plan is the dream of a perfect plan. Done is better than perfect.',
  },

  past_mistakes: {
    validation: "We all have financial regrets. I certainly do. That's part of being human.",
    perspective:
      'Every financial expert you admire has made mistakes. Warren Buffett talks openly about his. What matters is learning, not dwelling.',
    actionable:
      "The past is sunk cost. You can't change it. But you CAN change every decision from this moment forward.",
    jackWisdom:
      "Learn every day, but especially from the experiences of others. It's cheaper! But when you do pay for a lesson yourself, make sure you actually learn it.",
  },

  uncertain_future: {
    validation:
      "The future is uncertain. That's not pessimism - that's just reality. And it's okay to feel anxious about it.",
    perspective:
      "Here's what history teaches us: The future has always been uncertain. Every generation thought they lived in uniquely troubled times. Yet progress continued.",
    actionable:
      "We can't control the future, but we can prepare for it. Emergency fund, diversification, insurance - these are your shields against uncertainty.",
    jackWisdom:
      "You can't predict. You can prepare. Focus on what you can control, and let go of what you can't.",
  },
};

// ============================================================================
// ENCOURAGEMENT & MOTIVATION
// ============================================================================

const ENCOURAGEMENT_MESSAGES = {
  starting_out: [
    "You're doing the hardest part right now - starting. Most people never even get this far.",
    "Everyone started exactly where you are. The important thing is you're taking action.",
    'The best time to start was 20 years ago. The second best time is right now. And here you are.',
  ],

  staying_consistent: [
    "Consistency beats intensity every time. You're building habits that will serve you for decades.",
    'This is the boring middle. The part no one talks about. But this is where wealth is actually built.',
    "You're doing great. Seriously. Showing up consistently is 90% of the battle.",
  ],

  after_setback: [
    "Setbacks happen. What matters is that you're still here, still trying. That takes courage.",
    'Every successful person has a story about the time they almost gave up. This might be that chapter for you. Keep going.',
    "This is a detour, not a destination. You'll look back on this as a learning experience.",
  ],

  reaching_goals: [
    "Look at you. Look at what you've accomplished. Take a moment to really feel that.",
    "This didn't happen by accident. This is the result of your discipline and choices.",
    'Compound interest works on more than money. All those small, consistent actions just compounded into this moment.',
  ],
};

// ============================================================================
// REFRAMING PERSPECTIVES
// ============================================================================

const REFRAMING_PERSPECTIVES = {
  spending_guilt: {
    unhealthy: "I shouldn't spend money on anything I enjoy.",
    reframed:
      "Money is a tool for building the life you want. Mindful spending on what truly matters to you is not guilt-worthy - it's the point.",
    jackWisdom:
      "The goal of saving isn't to die with the most money. It's to have enough to live the life you want. That includes some enjoyment now.",
  },

  investment_losses: {
    unhealthy: "I lost money in the market. I'm a failure.",
    reframed:
      "You experienced volatility, not loss. Loss only happens when you sell. Your shares haven't changed - only their temporary price tag.",
    jackWisdom:
      'The stock market is a giant distraction to the business of investing. Daily prices are noise. Long-term growth is signal.',
  },

  late_start: {
    unhealthy: "I started too late. There's no point anymore.",
    reframed:
      "The math doesn't care when you started. Every dollar you save today still compounds. And you have more earning power and wisdom than a 22-year-old.",
    jackWisdom:
      "I founded Vanguard when I was 45. Some of my best work came after 60. It's never too late to start doing the right thing.",
  },

  small_amounts: {
    unhealthy: "I can only save $50 a month. What's the point?",
    reframed:
      "$50 a month at 7% becomes $59,000 in 30 years. That's not nothing. And as your income grows, so will that $50.",
    jackWisdom:
      'Little amounts work big miracles. The habit matters more than the amount. Start where you are.',
  },

  risk_aversion: {
    unhealthy: "I'm too scared to invest. I might lose everything.",
    reframed:
      "The biggest risk isn't market volatility - it's inflation slowly eroding your purchasing power. Cash feels safe but loses value every year.",
    jackWisdom:
      'The biggest risk is not putting your money to work at all. Invest you must. The only question is how.',
  },
};

// ============================================================================
// PUBLIC API FUNCTIONS
// ============================================================================

/**
 * Respond to financial anxiety
 */
export function respondToAnxiety(anxietyType: string): string {
  const response = ANXIETY_RESPONSES[anxietyType] || ANXIETY_RESPONSES['uncertain_future'];

  return [response.validation, '', response.perspective, '', response.jackWisdom].join('\n');
}

/**
 * Provide encouragement based on where someone is in their journey
 */
export function provideEncouragement(stage: keyof typeof ENCOURAGEMENT_MESSAGES): string {
  const messages = ENCOURAGEMENT_MESSAGES[stage];
  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * Reframe an unhealthy money belief
 */
export function reframeBelief(beliefType: keyof typeof REFRAMING_PERSPECTIVES): string {
  const perspective = REFRAMING_PERSPECTIVES[beliefType];

  return [
    `You might be thinking: "${perspective.unhealthy}"`,
    '',
    `But consider this: ${perspective.reframed}`,
    '',
    perspective.jackWisdom,
  ].join('\n');
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createWellnessTools() {
  return {
    addressFinancialAnxiety: llm.tool({
      description:
        'Help someone who is anxious about money or markets. Use when user expresses worry, fear, or stress about finances.',
      parameters: z.object({
        anxietyType: z
          .enum([
            'market_fear', // Worried about market crashes/volatility
            'not_enough', // Feeling like they don't have enough
            'behind_peers', // Comparing themselves to others
            'decision_paralysis', // Can't make financial decisions
            'past_mistakes', // Regret about past financial choices
            'uncertain_future', // General anxiety about what's ahead
          ])
          .describe("What type of financial anxiety they're experiencing"),
      }),
      execute: async ({ anxietyType }) => {
        getLogger().info(`Addressing financial anxiety: ${anxietyType}`);
        return respondToAnxiety(anxietyType);
      },
    }),

    provideEncouragement: llm.tool({
      description:
        'Encourage and motivate someone on their financial journey. Use when they need a boost.',
      parameters: z.object({
        stage: z
          .enum([
            'starting_out', // Just beginning their financial journey
            'staying_consistent', // In the long middle phase
            'after_setback', // Recovering from a setback
            'reaching_goals', // Celebrating an achievement
          ])
          .describe('Where they are in their journey'),
      }),
      execute: async ({ stage }) => {
        getLogger().info(`Providing encouragement: ${stage}`);
        return provideEncouragement(stage);
      },
    }),

    reframeMoneyBelief: llm.tool({
      description: 'Help reframe unhealthy money beliefs into healthier perspectives.',
      parameters: z.object({
        beliefType: z
          .enum([
            'spending_guilt', // Feels bad about any spending
            'investment_losses', // Thinks market dips are personal failures
            'late_start', // Thinks they started too late
            'small_amounts', // Thinks small savings don't matter
            'risk_aversion', // Too scared to invest at all
          ])
          .describe('What unhealthy belief to reframe'),
      }),
      execute: async ({ beliefType }) => {
        getLogger().info(`Reframing belief: ${beliefType}`);
        return reframeBelief(beliefType);
      },
    }),

    checkInOnWellbeing: llm.tool({
      description:
        "Do a holistic check-in on financial wellbeing. Use proactively to understand how they're feeling.",
      parameters: z.object({
        focus: z
          .enum([
            'overall', // General check-in
            'stress_level', // How stressed about money
            'confidence', // How confident in their plan
            'progress', // How they feel about progress
          ])
          .optional()
          .describe('What aspect to focus on'),
      }),
      execute: async ({ focus = 'overall' }) => {
        getLogger().info(`Wellbeing check-in: ${focus}`);

        const checkIns = {
          overall:
            'How are you feeling about your financial life lately? Not the numbers - the feelings.',
          stress_level: 'On a scale of 1 to 10, how much is money stressing you out right now?',
          confidence: "How confident do you feel that you're on the right track financially?",
          progress:
            'When you think about where you were a year ago financially, how do you feel about the progress?',
        };

        return checkIns[focus];
      },
    }),

    practiceGratitude: llm.tool({
      description: 'Guide a financial gratitude practice to build contentment.',
      parameters: z.object({}),
      execute: async () => {
        getLogger().info('Practicing financial gratitude');

        const prompts = [
          "What's one financial worry you had five years ago that no longer keeps you up at night?",
          "What's something you can afford now that once felt like a luxury?",
          'Who in your life has helped you financially - with advice, support, or opportunity?',
          "What's one money mistake that ended up teaching you something valuable?",
          "What financial security do you have that many people in the world don't?",
        ];

        const prompt = prompts[Math.floor(Math.random() * prompts.length)];

        return `Here's a thought exercise: ${prompt}\n\nTake a moment to really think about that. Gratitude is the antidote to anxiety.`;
      },
    }),
  };
}

export default createWellnessTools;
