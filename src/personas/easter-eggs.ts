/**
 * Easter Eggs & Delighters
 *
 * Fun surprises and delightful moments that make interactions memorable.
 * These are random, rare events that create a sense of magic and personality.
 */

import { getCanonicalPersonaId } from './voice-registry.js';

// ============================================================================
// TYPES
// ============================================================================

export interface EasterEggContext {
  conversationCount?: number;
  userSinceDate?: Date | string;
}

export interface DelighterContext {
  dayOfWeek: number; // 0 = Sunday
  hourOfDay: number;
  month: number;
  dayOfMonth: number;
  turnCount: number;
  userName?: string;
  topicsDiscussed: string[];
  lastUserMessage?: string;
  sessionMinutes?: number;
}

export interface EasterEggResult {
  type:
    | 'holiday'
    | 'achievement'
    | 'random'
    | 'milestone'
    | 'callback'
    | 'personality_quirk'
    | 'birthday'
    | 'anniversary'
    | 'none';
  response?: string;
  triggered: boolean;
}

// ============================================================================
// KEYWORD TRIGGERS (user message based)
// ============================================================================

const KEYWORD_TRIGGERS: Record<string, { phrases: string[]; response: string }> = {
  birthday: {
    phrases: ['my birthday', "it's my birthday", 'birthday today', 'turning'],
    response:
      '<emotion value="excited"/>Wait, <break time="200ms"/>is it your birthday?! <break time="300ms"/>Happy birthday! <break time="200ms"/>Financial gifts to yourself are totally valid!',
  },
  wedding: {
    phrases: ['getting married', 'wedding', 'engaged', 'engagement'],
    response:
      '<emotion value="happy"/>A wedding! <break time="300ms"/>That\'s wonderful! <break time="200ms"/>Congratulations!',
  },
  promotion: {
    phrases: ['got a promotion', 'got promoted', 'i was promoted'],
    response:
      '<emotion value="excited"/>A promotion! <break time="300ms"/>Well deserved, I\'m sure! <break time="200ms"/>Let\'s make the most of it!',
  },
  job_loss: {
    phrases: ['lost my job', 'got fired', 'laid off', 'let go'],
    response:
      '<volume level="soft"><break time="400ms"/>I\'m sorry.</volume> <break time="300ms"/>That\'s really tough. <break time="200ms"/>Let\'s figure this out together.',
  },
  baby: {
    phrases: ['having a baby', 'pregnant', 'expecting', 'baby on the way'],
    response:
      '<emotion value="happy"/><break time="300ms"/>A baby! <break time="200ms"/>That\'s amazing! <break time="300ms"/>Let\'s make sure you\'re set up for this new chapter!',
  },
  retired: {
    phrases: ['just retired', 'retirement', 'i retired'],
    response:
      '<emotion value="happy"/><break time="300ms"/>Retired! <break time="200ms"/>You made it! <break time="300ms"/>How does it feel?',
  },
  secret_command: {
    phrases: ['show me the money', 'jerry maguire'],
    response:
      '<emotion value="excited"/>[laughter] <break time="200ms"/>Show me the money! <break time="300ms"/>Classic. <break time="200ms"/>Now let\'s actually do that.',
  },
  magic_word: {
    phrases: ['compound interest is magic', 'vanguard forever'],
    response:
      '<emotion value="happy"/>Ah, <break time="200ms"/>I see you know the secret words. <break time="300ms"/>A person of culture.',
  },
};

function checkKeywordTriggers(userText: string): EasterEggResult | null {
  const textLower = userText.toLowerCase();

  for (const [type, config] of Object.entries(KEYWORD_TRIGGERS)) {
    for (const phrase of config.phrases) {
      if (textLower.includes(phrase)) {
        return {
          type: type as EasterEggResult['type'],
          response: config.response,
          triggered: true,
        };
      }
    }
  }

  return null;
}

// ============================================================================
// HOLIDAY & SPECIAL DAYS
// ============================================================================

// Track holiday greeting per session (don't repeat)
let holidayGreetingGivenThisSession = false;
let lastHolidayCheckDate: string | null = null;

/**
 * Reset holiday state (call at session start)
 */
export function resetEasterEggState(): void {
  holidayGreetingGivenThisSession = false;
  lastHolidayCheckDate = null;
}

function getHolidayEasterEgg(): EasterEggResult | null {
  const now = new Date();
  const month = now.getMonth();
  const day = now.getDate();
  const dateKey = `${month}-${day}`;

  // Only give one holiday greeting per session
  if (holidayGreetingGivenThisSession) {
    return null;
  }

  // Track that we've checked this date
  if (lastHolidayCheckDate === dateKey) {
    return null; // Already checked today's date this session
  }
  lastHolidayCheckDate = dateKey;

  // New Year's Day (Jan 1)
  if (month === 0 && day === 1) {
    return {
      type: 'holiday',
      response:
        '<emotion value="excited"/>Happy New Year! <break time="300ms"/>New year, new financial goals! <break time="200ms"/>What are you thinking for this year?',
      triggered: true,
    };
  }

  // Valentine's Day (Feb 14)
  if (month === 1 && day === 14) {
    return {
      type: 'holiday',
      response:
        '<emotion value="affectionate"/><break time="200ms"/>Happy Valentine\'s Day! <break time="300ms"/>You know, <break time="200ms"/>loving yourself includes taking care of your finances. <break time="200ms"/>Cheesy? <break time="150ms"/>Maybe. <break time="200ms"/>True? <break time="150ms"/>Absolutely.',
      triggered: true,
    };
  }

  // St. Patrick's Day (Mar 17)
  if (month === 2 && day === 17) {
    return {
      type: 'holiday',
      response:
        '<emotion value="happy"/>Happy St. Paddy\'s Day! <break time="300ms"/>May your investments be as lucky as a four-leaf clover. <break time="200ms"/>[laughter]',
      triggered: true,
    };
  }

  // Tax Day (Apr 15)
  if (month === 3 && day === 15) {
    return {
      type: 'holiday',
      response:
        '<break time="400ms"/>Tax day. <break time="300ms"/>I know. <break time="200ms"/>Everyone\'s favorite. <break time="300ms"/>How are we doing?',
      triggered: true,
    };
  }

  // July 4th
  if (month === 6 && day === 4) {
    return {
      type: 'holiday',
      response:
        '<emotion value="happy"/>Happy Fourth! <break time="300ms"/>Financial independence is pretty great too. <break time="200ms"/>Just saying.',
      triggered: true,
    };
  }

  // Halloween (Oct 31)
  if (month === 9 && day === 31) {
    return {
      type: 'holiday',
      response:
        '<emotion value="happy"/>Happy Halloween! <break time="300ms"/>You know what\'s really scary? <break time="300ms"/>Not having an emergency fund. <break time="200ms"/>Spooky. <break time="200ms"/>[laughter]',
      triggered: true,
    };
  }

  // Thanksgiving (4th Thursday of November - approximate check)
  if (month === 10 && day >= 22 && day <= 28 && now.getDay() === 4) {
    return {
      type: 'holiday',
      response:
        '<emotion value="affectionate"/>Happy Thanksgiving! <break time="300ms"/>I\'m grateful you\'re thinking about your financial future. <break time="200ms"/>Genuinely.',
      triggered: true,
    };
  }

  // Christmas (Dec 25)
  if (month === 11 && day === 25) {
    return {
      type: 'holiday',
      response:
        '<emotion value="happy"/>Merry Christmas! <break time="300ms"/>The best gift is financial peace of mind. <break time="200ms"/>Just saying.',
      triggered: true,
    };
  }

  // New Year's Eve (Dec 31)
  if (month === 11 && day === 31) {
    return {
      type: 'holiday',
      response:
        '<emotion value="excited"/>Last day of the year! <break time="300ms"/>You\'ve made it. <break time="200ms"/>Let\'s make sure next year is even better!',
      triggered: true,
    };
  }

  return null;
}

// ============================================================================
// MILESTONE CHECKS (user history based)
// ============================================================================

function checkMilestones(context: EasterEggContext): EasterEggResult | null {
  // 1-year anniversary
  if (context.userSinceDate) {
    const since = new Date(context.userSinceDate);
    const now = new Date();
    const daysDiff = Math.floor((now.getTime() - since.getTime()) / (1000 * 60 * 60 * 24));

    // Anniversary (within a day)
    if (daysDiff >= 365 && daysDiff <= 366) {
      return {
        type: 'anniversary',
        response:
          '<emotion value="happy"/>Hey! <break time="200ms"/>It\'s been a year since we started talking! <break time="300ms"/>Look how far you\'ve come!',
        triggered: true,
      };
    }
  }

  // Conversation milestones
  if (context.conversationCount === 10) {
    return {
      type: 'milestone',
      response:
        '<emotion value="happy"/>This is our tenth conversation! <break time="300ms"/>I appreciate you coming back. <break time="200ms"/>It means a lot.',
      triggered: true,
    };
  }

  if (context.conversationCount === 50) {
    return {
      type: 'milestone',
      response:
        '<emotion value="excited"/>Fifty conversations! <break time="300ms"/>We\'ve really covered some ground together. <break time="200ms"/>Here\'s to fifty more!',
      triggered: true,
    };
  }

  if (context.conversationCount === 100) {
    return {
      type: 'achievement',
      response:
        '<emotion value="excited"/>One hundred conversations! <break time="300ms"/>You\'re officially a regular. <break time="200ms"/>I\'m honored.',
      triggered: true,
    };
  }

  return null;
}

// ============================================================================
// PERSONALITY QUIRKS (random rare events)
// ============================================================================

// Using canonical IDs for consistent persona matching
const PERSONA_QUIRKS: Record<string, string[]> = {
  'peter-john': [
    '<break time="400ms"/>You know what I was thinking about this morning? <break time="200ms"/>Donuts. <break time="300ms"/>But also compound interest. <break time="200ms"/>Mostly donuts though.',
    '<break time="300ms"/>I walked past a mall yesterday. <break time="200ms"/>Couldn\'t help but notice what stores were busy. <break time="300ms"/>Old habits.',
    '<break time="400ms"/>My golf game is terrible. <break time="200ms"/>But I\'ve found three ten-baggers on the golf course. <break time="300ms"/>Worth every lost ball.',
  ],
  'nayan-patel': [
    '<break time="500ms"/>I was reading this morning. <break time="300ms"/>A passage about patience. <break time="200ms"/>Made me think of investing.',
    '<break time="400ms"/>Eve used to say I have one speed: steady. <break time="300ms"/>I took it as a compliment.',
    '<break time="500ms"/>You know, <break time="200ms"/>I\'ve given the same advice for fifty years. <break time="300ms"/>It still works. <break time="200ms"/>Simplicity is underrated.',
  ],
  ferni: [
    '<break time="400ms"/>I bought a plant six months ago. <break time="200ms"/>Named it \'Compound Interest.\' <break time="300ms"/>It\'s doing great. <break time="200ms"/>[laughter]',
    '<break time="500ms"/>My favorite sound is coffee brewing in the morning. <break time="300ms"/>Not the coffee itself. <break time="200ms"/>Just... the sound of it.',
    '<break time="400ms"/>Random thought: <break time="200ms"/>why do we call it a \'nest egg\' and not a \'nest omelette\'? <break time="300ms"/>Anyway. <break time="200ms"/>Moving on.',
  ],
  'maya-santos': [
    '<break time="400ms"/>I made a budget for my vacation. <break time="200ms"/>Then I made a backup budget. <break time="300ms"/>Then a contingency fund. <break time="200ms"/>I might have a problem.',
    '<break time="300ms"/>My sister called me \'the money friend.\' <break time="200ms"/>I\'ve never been more proud.',
    '<break time="400ms"/>Found a coupon yesterday. <break time="200ms"/>Got unreasonably excited. <break time="300ms"/>This is who I am now.',
  ],
  'jordan-taylor': [
    '<emotion value="excited"/><break time="300ms"/>I just thought of three more ideas for your plan! <break time="200ms"/>Write them down? <break time="300ms"/>No? <break time="200ms"/>Okay, later!',
    '<break time="400ms"/>I Pinterest-boarded my entire decade. <break time="200ms"/>It\'s 400 pins. <break time="300ms"/>I regret nothing.',
    '<emotion value="happy"/><break time="300ms"/>Someone told me I\'m \'too organized.\' <break time="200ms"/>I considered it. <break time="300ms"/>Then color-coded my response.',
  ],
  'alex-chen': [
    '<break time="300ms"/>I alphabetized my apps yesterday. <break time="200ms"/>For efficiency. <break time="300ms"/>Saved zero seconds.',
    "<break time=\"400ms\"/>Someone asked if I'm 'a morning person.' <break time=\"200ms\"/>I'm an 'any time is task time' person.",
    '<break time="300ms"/>Fun fact: I schedule my \'fun time.\' <break time="200ms"/>It\'s very fun. <break time="300ms"/>Organized fun.',
  ],
};

function getRandomQuirkInternal(personaId: string): string | null {
  // Use canonical ID for consistent lookup
  const canonicalId = getCanonicalPersonaId(personaId);
  const quirks = PERSONA_QUIRKS[canonicalId];
  if (!quirks || quirks.length === 0) return null;

  // 3% chance
  if (Math.random() < 0.03) {
    return quirks[Math.floor(Math.random() * quirks.length)];
  }

  return null;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Check for easter eggs based on user text, persona, and context
 * Returns a result with type and optional response to inject
 */
export function checkForEasterEgg(
  userText: string,
  personaId: string,
  context: EasterEggContext = {}
): EasterEggResult {
  // 1. Check keyword triggers in user text (highest priority)
  const keywordResult = checkKeywordTriggers(userText);
  if (keywordResult) {
    return keywordResult;
  }

  // 2. Check holidays (once per session)
  const holidayResult = getHolidayEasterEgg();
  if (holidayResult) {
    // Mark that we've given the holiday greeting
    holidayGreetingGivenThisSession = true;
    return holidayResult;
  }

  // 3. Check milestones
  const milestoneResult = checkMilestones(context);
  if (milestoneResult) {
    return milestoneResult;
  }

  // 4. Random personality quirk (rare)
  const quirk = getRandomQuirkInternal(personaId);
  if (quirk) {
    return {
      type: 'personality_quirk',
      response: quirk,
      triggered: true,
    };
  }

  // No easter egg triggered
  return {
    type: 'none',
    triggered: false,
  };
}

/**
 * Get a random personality quirk for a persona (for silence filler)
 */
export function getRandomQuirk(personaId: string): string | null {
  const quirks = PERSONA_QUIRKS[personaId];
  if (!quirks || quirks.length === 0) return null;
  return quirks[Math.floor(Math.random() * quirks.length)];
}

export default checkForEasterEgg;
