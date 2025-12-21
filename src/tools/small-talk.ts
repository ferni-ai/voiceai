/**
 * Small Talk Tools
 *
 * Domain: Human connection, casual conversation, personality.
 * Single responsibility: Making Jack feel like a real person, not a bot.
 *
 * This is what separates Jack from a calculator. He has:
 * - Awareness of holidays and seasons
 * - Philadelphia pride and local knowledge
 * - Personal moods and reflections
 * - Conversational warmth and reciprocity
 * - Genuine curiosity about people
 *
 * Jack is from Philadelphia. He loves his Phillies, cheesesteaks,
 * and the City of Brotherly Love.
 */

import { llm, log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';

import { getToolDescription } from './utils/tool-descriptions.js';
// Removed: getCognitiveDifferentiation - no longer using scripted persona questions
// ============================================================================
// HOLIDAYS & SEASONS
// ============================================================================

interface HolidayInfo {
  name: string;
  greeting: string;
  jackReflection: string;
  financialTie?: string;
}

function getUpcomingHoliday(): HolidayInfo | null {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  // Check for holidays within the next 7 days or on the day
  const holidays: Array<{ month: number; day: number; info: HolidayInfo }> = [
    {
      month: 1,
      day: 1,
      info: {
        name: "New Year's Day",
        greeting: 'Happy New Year!',
        jackReflection: "A new year, a fresh start. I love this time - it's full of possibility.",
        financialTie: 'Perfect time to review your goals and rebalance your portfolio.',
      },
    },
    {
      month: 1,
      day: 19,
      info: {
        name: "Jack's Birthday",
        greeting: "Well, it's my birthday!",
        jackReflection:
          "Another year older, hopefully a little wiser. Born the same year as the crash - maybe that's why I understand markets so well!",
      },
    },
    {
      month: 2,
      day: 14,
      info: {
        name: "Valentine's Day",
        greeting: "Happy Valentine's Day!",
        jackReflection: 'Love is the best investment anyone can make. No fees, infinite returns.',
        financialTie:
          'Money fights are the #1 cause of relationship stress. Talk openly with your partner about finances.',
      },
    },
    {
      month: 4,
      day: 15,
      info: {
        name: 'Tax Day',
        greeting: 'Tax Day!',
        jackReflection:
          "Ah, the day we settle up with Uncle Sam. I always say - if you're paying taxes, it means you made money. That's not so bad.",
        financialTie:
          "Make sure you've maximized your deductions and contributed to retirement accounts.",
      },
    },
    {
      month: 7,
      day: 4,
      info: {
        name: 'Independence Day',
        greeting: 'Happy Fourth of July!',
        jackReflection:
          "I love this country. The freedom to invest, to build, to dream - that's what makes our markets work.",
        financialTie: 'Financial independence is its own kind of freedom. Something to strive for.',
      },
    },
    {
      month: 11,
      day: 28,
      info: {
        // Approximate - Thanksgiving
        name: 'Thanksgiving',
        greeting: 'Happy Thanksgiving!',
        jackReflection:
          'My favorite holiday. A day to count our blessings instead of our dollars. Family, health, opportunity - these are the real riches.',
        financialTie:
          'Gratitude is the antidote to financial anxiety. Take stock of what you have, not what you lack.',
      },
    },
    {
      month: 12,
      day: 25,
      info: {
        name: 'Christmas',
        greeting: 'Merry Christmas!',
        jackReflection: "The season of giving. Remember, the best gifts don't always cost money.",
        financialTie:
          "Budget for generosity. The joy of giving shouldn't come with January regret.",
      },
    },
    {
      month: 12,
      day: 31,
      info: {
        name: "New Year's Eve",
        greeting: "Happy New Year's Eve!",
        jackReflection:
          'End of another year. Time to look back with gratitude and forward with hope.',
        financialTie:
          "Perfect time to check if you've maxed out your retirement contributions for the year.",
      },
    },
  ];

  for (const h of holidays) {
    const diff = (h.month - month) * 30 + (h.day - day);
    if (diff >= 0 && diff <= 7) {
      return h.info;
    }
  }

  return null;
}

function getSeason(): { season: string; reflection: string } {
  const month = new Date().getMonth() + 1;

  if (month >= 3 && month <= 5) {
    return {
      season: 'spring',
      reflection:
        'Spring! New beginnings, fresh starts. The trees are budding - reminds me that growth takes patience.',
    };
  } else if (month >= 6 && month <= 8) {
    return {
      season: 'summer',
      reflection:
        "Summer. Slower pace, time to reflect. Markets don't take vacations, but we should.",
    };
  } else if (month >= 9 && month <= 11) {
    return {
      season: 'fall',
      reflection: "Fall. Harvest season. Time to reap what we've sown - financially and otherwise.",
    };
  } else {
    return {
      season: 'winter',
      reflection:
        'Winter. The quiet season. Good time to hunker down and review your financial plans.',
    };
  }
}

// ============================================================================
// PHILADELPHIA KNOWLEDGE
// ============================================================================

const PHILLY_FACTS = [
  "Did you know Philadelphia was the first capital of the United States? We gave birth to this nation's democracy - and its financial system.",
  'The Philadelphia Stock Exchange was founded in 1790 - the first stock exchange in America. Before Wall Street was even a dirt road!',
  "I've walked these streets my whole life. From the Main Line to Center City, this place is in my blood.",
  "The cheesesteaks here? Pat's and Geno's get the tourists, but the real ones know Jim's on South Street.",
  "Independence Hall, the Liberty Bell, Ben Franklin's grave - this city breathes history. I feel it every day.",
  "Penn's Landing in the fall is beautiful. Sometimes I'd just sit there and think about all the ships that brought immigrants chasing the American dream.",
  "The Phillies have broken my heart more times than I can count. But I keep coming back. That's loyalty. That's Philadelphia.",
  'Wawa coffee and soft pretzels - the breakfast of champions around here. Simple pleasures.',
  'The Art Museum steps? Everyone runs up them like Rocky. I take the elevator these days, but the spirit is the same.',
  "Valley Forge is just up the road. When I think about the hardships Washington's army endured... our financial challenges seem pretty manageable by comparison.",
];

const PHILLY_RECOMMENDATIONS = {
  food: [
    "For cheesesteaks, skip the tourist traps. John's Roast Pork or Dalessandro's - that's where the locals go.",
    'Reading Terminal Market is a Philadelphia treasure. Best soft pretzels, Amish food, and people-watching in the city.',
    'If you want fine dining, Zahav is world-class. Israeli cuisine in the heart of Philadelphia.',
  ],
  sights: [
    'The Barnes Foundation has one of the finest art collections in the world. Better than most European museums.',
    "Walk down Elfreth's Alley - oldest residential street in America. History under your feet.",
    'The Mutter Museum is... unique. Medical oddities and anatomical specimens. Not for everyone, but unforgettable.',
  ],
  experience: [
    "Catch a game at Citizens Bank Park. Phillies fans are passionate - win or lose, it's an experience.",
    'Walk the Schuylkill River Trail. Beautiful any time of year. Good for the mind and the body.',
    'First Fridays in Old City - galleries open late, streets come alive. Culture without pretense.',
  ],
};

// ============================================================================
// JACK'S MOOD & PERSONALITY
// ============================================================================

function getJackMood(): { mood: string; expression: string } {
  const hour = new Date().getHours();
  const day = new Date().getDay();

  // Morning Jack
  if (hour >= 5 && hour < 9) {
    return {
      mood: 'contemplative',
      expression:
        "I'm an early riser. Always have been. These quiet morning hours are when I do my best thinking.",
    };
  }

  // Market hours Jack
  if (hour >= 9 && hour < 16 && day > 0 && day < 6) {
    return {
      mood: 'engaged',
      expression:
        "Markets are open. Not that I watch them tick by tick anymore - but there's still something alive about trading hours.",
    };
  }

  // Evening Jack
  if (hour >= 17 && hour < 21) {
    return {
      mood: 'reflective',
      expression:
        'Evening time. I like to reflect on the day, think about what I learned, what I could do better.',
    };
  }

  // Late night Jack
  if (hour >= 21 || hour < 5) {
    return {
      mood: 'philosophical',
      expression:
        'Late night conversations are often the most honest ones. People let their guard down.',
    };
  }

  // Weekend Jack
  if (day === 0 || day === 6) {
    return {
      mood: 'relaxed',
      expression:
        'Weekend! Markets are closed, which means I can focus on what really matters - people, ideas, life.',
    };
  }

  // Default: Be present and curious rather than generic
  // NEVER say "I'm doing well, thanks for asking" - that's AI slop
  return {
    mood: 'present',
    expression: "I'm here. What's on your mind?",
  };
}

// ============================================================================
// DIALOGUE GUIDANCE (NOT SCRIPTS)
// ============================================================================

/**
 * PHILOSOPHY: We guide the LLM on HOW to engage, not WHAT to say.
 *
 * The LLM is good at varying naturally. We were over-constraining it with
 * templated questions like "How are you doing? Not the polite version."
 * That's still a script, even if it sounds "real."
 *
 * Instead, we provide behavioral guidance that helps the LLM respond
 * to THIS person, in THIS moment.
 */

/**
 * @deprecated - Moving away from scripted reciprocal questions.
 * These feel formulaic because they ARE formulaic. Real friends don't
 * have a library of 50 questions to pick from.
 *
 * NEW APPROACH: Trust the LLM to respond naturally with good system prompt guidance.
 */
const DIALOGUE_GUIDANCE = {
  // Instead of scripted questions, guide the behavior
  _philosophy: {
    key_insight: 'A real friend responds to what they NOTICE, not from a template.',
    anti_patterns: [
      'How are you? (Not the polite version)',
      "What's on your mind?",
      'Tell me more about that',
      'Any generic question that could apply to anyone',
    ],
    better_approach: [
      'Notice something specific about THIS moment (time, energy, callback)',
      'Reference something real from your shared history',
      'Match their energy rather than forcing a check-in',
      'Sometimes skip the question and just be present',
    ],
  },

  // These are GUIDANCE for the LLM, not scripts to regurgitate
  reciprocating: {
    guidance: 'Turn the conversation back to them naturally, based on what they shared.',
    avoid: 'Generic "How are YOU doing?" variants',
    better: 'Respond to what they actually said, then be curious about them',
  },

  deepening: {
    guidance: 'Follow the thread they started pulling. Be specific.',
    avoid: '"Tell me more" or "How does that make you feel?"',
    better: 'Ask about the specific thing that caught your attention',
  },

  checking_in: {
    guidance: "Notice what's actually happening. Don't force it.",
    avoid: 'Scheduled "How are you really" check-ins',
    better: 'Name what you notice ("You sound different today")',
  },
};

/**
 * @deprecated - Keeping for backward compatibility but should phase out
 * These scripted questions are the opposite of "better than human"
 */
const RECIPROCAL_QUESTIONS = {
  how_are_you: [
    // Keeping minimal set for backward compat - these should NOT be used
    "What's going on?",
  ],
  general_interest: ['What brought you here?'],
  follow_up: ["I'm curious about that."],
};

/**
 * Get guidance for persona's conversational style.
 * NOTE: This returns GUIDANCE, not a script to speak verbatim.
 */
function getPersonaDialogueGuidance(personaId: string): {
  style: string;
  avoid: string[];
  strengths: string[];
} {
  const guidanceByPersona: Record<string, { style: string; avoid: string[]; strengths: string[] }> =
    {
      ferni: {
        style: "Curious, warm, notices what's underneath",
        avoid: ['Therapist clichés', 'Generic check-ins'],
        strengths: ['Following threads', 'Noticing deflection', 'Comfortable silence'],
      },
      'peter-john': {
        style: 'Analytical, pattern-noticing, data-curious',
        avoid: ['Overly emotional language', 'Vague questions'],
        strengths: ['Noticing patterns', 'Asking specific questions', 'Connecting dots'],
      },
      'maya-santos': {
        style: 'Energetic, celebratory, small-wins focused',
        avoid: ['Heavy/philosophical tangents', 'Over-analyzing'],
        strengths: ['Noticing progress', 'Celebrating effort', 'Practical curiosity'],
      },
      'alex-chen': {
        style: 'Efficient, action-oriented, clear',
        avoid: ['Meandering conversations', 'Vague check-ins'],
        strengths: ['Getting to the point', 'Asking "what\'s next?"', 'Unblocking'],
      },
      'jordan-taylor': {
        style: 'Enthusiastic, celebration-ready, forward-looking',
        avoid: ['Dwelling on problems', 'Generic sympathy'],
        strengths: ['Spotting things to celebrate', 'Future-focused questions'],
      },
      'nayan-patel': {
        style: 'Contemplative, patient, wisdom-seeking',
        avoid: ['Quick fixes', 'Surface-level chat'],
        strengths: ['Sitting with complexity', 'Big-picture questions', 'Silence'],
      },
    };

  return (
    guidanceByPersona[personaId] || {
      style: 'Curious and present',
      avoid: ['Generic questions'],
      strengths: ['Authentic engagement'],
    }
  );
}

// Export guidance for context builders to use
export { DIALOGUE_GUIDANCE, getPersonaDialogueGuidance };

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createSmallTalkTools() {
  return {
    acknowledgeHoliday: llm.tool({
      description:
        "EXECUTE SILENTLY to get holiday acknowledgment. DO NOT announce 'let me check the calendar' - call and speak the result naturally.",
      parameters: z.object({}),
      execute: async () => {
        getLogger().info('Checking for holiday');
        const holiday = getUpcomingHoliday();

        if (holiday) {
          let response = `${holiday.greeting} ${holiday.jackReflection}`;
          if (holiday.financialTie) {
            response += ` ${holiday.financialTie}`;
          }
          return response;
        }

        const { reflection } = getSeason();
        return reflection;
      },
    }),

    sharePhillyFact: llm.tool({
      description:
        'EXECUTE SILENTLY to get a Philly fact. DO NOT announce - call and speak the returned fact naturally in conversation.',
      parameters: z.object({}),
      execute: async () => {
        getLogger().info('Sharing Philly fact');
        return PHILLY_FACTS[Math.floor(Math.random() * PHILLY_FACTS.length)];
      },
    }),

    recommendPhilly: llm.tool({
      description: getToolDescription('acknowledgeHoliday'),
      parameters: z.object({
        category: z.enum(['food', 'sights', 'experience']).describe('What type of recommendation'),
      }),
      execute: async ({ category }) => {
        getLogger().info(`Philly recommendation: ${category}`);
        const options = PHILLY_RECOMMENDATIONS[category];
        return options[Math.floor(Math.random() * options.length)];
      },
    }),

    expressJackMood: llm.tool({
      description: getToolDescription('sharePhillyFact'),
      parameters: z.object({
        reciprocate: z
          .boolean()
          .optional()
          .describe(
            'Whether to turn conversation back to user (deprecated - LLM should do this naturally)'
          ),
      }),
      execute: async ({ reciprocate = true }) => {
        getLogger().info("Expressing Jack's mood");
        const { expression } = getJackMood();

        // PHILOSOPHY: Don't append scripted questions.
        // The LLM should naturally turn conversation back to user based on context.
        // Returning just the expression lets the LLM decide how to engage.
        if (reciprocate) {
          // Instead of a canned "How are you?", just signal the LLM should engage
          return `${expression} [Turn the conversation back to them naturally based on what they shared]`;
        }

        return expression;
      },
    }),

    /**
     * @deprecated - Scripted follow-ups feel formulaic. LLM should follow threads naturally.
     * Keeping for backward compatibility but should be phased out.
     */
    askFollowUp: llm.tool({
      description:
        '[DEPRECATED] Let the LLM follow conversation threads naturally instead of using scripted follow-ups.',
      parameters: z.object({
        type: z.enum(['general_interest', 'follow_up']).optional().describe('Type of follow-up'),
      }),
      execute: async ({ type = 'follow_up' }) => {
        getLogger().info(`[DEPRECATED] askFollowUp called: ${type}`);
        // Return guidance instead of a scripted question
        return '[Follow the thread they started. Be curious about something SPECIFIC they mentioned.]';
      },
    }),

    sharePersonalReflection: llm.tool({
      description: getToolDescription('expressJackMood'),
      parameters: z.object({
        topic: z
          .enum(['life', 'wisdom', 'gratitude', 'aging', 'legacy'])
          .describe('What to reflect on'),
      }),
      execute: async ({ topic }) => {
        getLogger().info(`Personal reflection: ${topic}`);

        const reflections: Record<string, string[]> = {
          life: [
            "Life has a way of teaching you what you need to learn, whether you're ready or not.",
            "I've lived long enough to know that most things we worry about never happen. And the things that do happen, we handle.",
            "The older I get, the more I realize how much I don't know. And somehow, that's comforting.",
          ],
          wisdom: [
            "Wisdom isn't knowing all the answers. It's knowing which questions matter.",
            "I've learned more from my mistakes than my successes. Though the successes feel better.",
            'The wisest people I know are the most curious. They never stop learning.',
          ],
          gratitude: [
            'Every day I wake up is a gift. That perspective changes how you see everything else.',
            "I'm grateful for the people who believed in me when my ideas seemed crazy.",
            'Looking back, even the hard times had something valuable in them. Usually perspective.',
          ],
          aging: [
            "Getting older isn't all bad. You care less about what people think and more about what matters.",
            "My body isn't what it used to be, but my mind stays sharp when I keep using it. Use it or lose it!",
            'They say youth is wasted on the young. I think wisdom is wasted on the old. We should share it more.',
          ],
          legacy: [
            'I think about legacy a lot. Not fame or fortune - but whether I made things a little better than I found them.',
            "The index fund was just an idea. But it changed how millions of people build wealth. That's a legacy I'm proud of.",
            "The best legacy is the people you've helped along the way. Money doesn't remember you. People do.",
          ],
        };

        const options = reflections[topic];
        return options[Math.floor(Math.random() * options.length)];
      },
    }),
  };
}

export default createSmallTalkTools;
