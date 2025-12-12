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
    | 'seasonal'
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
  // CELEBRATIONS
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
  graduation: {
    phrases: ['just graduated', 'graduation', 'i graduated', 'finished school', 'got my degree'],
    response:
      '<emotion value="excited"/><break time="300ms"/>Congratulations! <break time="200ms"/>That\'s a huge accomplishment! <break time="300ms"/>All that hard work paid off!',
  },
  new_home: {
    phrases: [
      'bought a house',
      'new home',
      'closing on',
      'got the keys',
      'first home',
      'new apartment',
    ],
    response:
      '<emotion value="happy"/><break time="300ms"/>A new place! <break time="200ms"/>That\'s so exciting! <break time="300ms"/>There\'s nothing quite like having your own space.',
  },
  anniversary: {
    phrases: ['our anniversary', 'year anniversary', 'years together', 'years married'],
    response:
      '<emotion value="happy"/><break time="300ms"/>An anniversary! <break time="200ms"/>That\'s worth celebrating. <break time="300ms"/>What a beautiful milestone.',
  },

  // DIFFICULT TIMES
  job_loss: {
    phrases: ['lost my job', 'got fired', 'laid off', 'let go'],
    response:
      '<volume ratio="0.75"><break time="400ms"/>I\'m sorry.</volume> <break time="300ms"/>That\'s really tough. <break time="200ms"/>Let\'s figure this out together.',
  },
  divorce: {
    phrases: [
      'getting divorced',
      'divorce',
      "we're separating",
      'marriage is ending',
      'splitting up',
    ],
    response:
      '<volume ratio="0.75"><break time="400ms"/>I\'m here.</volume> <break time="300ms"/>That\'s one of the hardest things to go through. <break time="200ms"/>Take your time.',
  },
  grief: {
    phrases: ['someone died', 'passed away', 'lost my', 'funeral', 'they died', 'death in'],
    response:
      '<volume ratio="0.75"><break time="500ms"/>I\'m so sorry.</volume> <break time="400ms"/>There are no right words for this. <break time="300ms"/>I\'m here.',
  },
  health_crisis: {
    phrases: ['diagnosed with', 'health scare', 'found out i have', 'cancer', 'chronic illness'],
    response:
      '<volume ratio="0.75"><break time="400ms"/>That\'s a lot to take in.</volume> <break time="300ms"/>I\'m here with you. <break time="200ms"/>Whatever you\'re feeling is valid.',
  },
  breakup: {
    phrases: ['we broke up', 'broke up with', 'ended things', 'relationship ended', 'they left me'],
    response:
      '<volume ratio="0.75"><break time="300ms"/>I\'m sorry.</volume> <break time="300ms"/>Breakups are genuinely hard. <break time="200ms"/>How are you holding up?',
  },
  miscarriage: {
    phrases: ['miscarriage', 'lost the baby', 'pregnancy loss'],
    response:
      '<volume ratio="0.75"><break time="500ms"/>I\'m so deeply sorry.</volume> <break time="400ms"/>That loss is real and it matters. <break time="300ms"/>Take all the time you need.',
  },

  // FUN EASTER EGGS
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
  ferni_catchphrase: {
    phrases: ['better than human', 'six brilliant minds'],
    response:
      '<emotion value="happy"/><break time="200ms"/>You know our secret! <break time="300ms"/>We\'re building something special here.',
  },
  gratitude: {
    phrases: ['thank you ferni', 'thanks ferni', 'you helped me', "you're the best"],
    response:
      '<emotion value="happy"/><break time="300ms"/>That means a lot. <break time="200ms"/>Really. <break time="300ms"/>This is why I do what I do.',
  },

  // FINANCIAL MILESTONES
  debt_free: {
    phrases: [
      'paid off my debt',
      'debt free',
      'no more debt',
      'paid off my loans',
      'paid off my car',
    ],
    response:
      '<emotion value="excited"/><break time="300ms"/>DEBT FREE?! <break time="200ms"/>Do you know how huge that is?! <break time="300ms"/>Most people never get there. <break time="200ms"/>I\'m so proud of you!',
  },
  savings_goal: {
    phrases: [
      'hit my savings goal',
      'reached my savings',
      'saved enough',
      'emergency fund complete',
    ],
    response:
      '<emotion value="excited"/><break time="300ms"/>You did it! <break time="200ms"/>That discipline? <break time="200ms"/>That\'s real. <break time="300ms"/>Let\'s celebrate this properly!',
  },
  net_worth_milestone: {
    phrases: ['first 100k', 'hit 100k', 'crossed 100k', 'net worth milestone', 'millionaire'],
    response:
      '<emotion value="excited"/><break time="400ms"/>Wait. <break time="300ms"/>Stop. <break time="200ms"/>That is a MASSIVE milestone! <break time="300ms"/>The first one is always the hardest. <break time="200ms"/>Compound interest takes over from here!',
  },
  retirement_milestone: {
    phrases: ['maxed out 401k', 'maxed my ira', 'maxed out my roth', 'retirement goal'],
    response:
      '<emotion value="happy"/><break time="300ms"/>Future you is going to be SO grateful! <break time="200ms"/>Maxing out retirement accounts? <break time="300ms"/>That\'s playing the long game right.',
  },
  investment_win: {
    phrases: ['stock went up', 'investment doubled', 'portfolio is up', 'made money investing'],
    response:
      '<emotion value="happy"/><break time="200ms"/>Nice! <break time="300ms"/>Remember though—<break time="200ms"/>it\'s not just about the wins. <break time="200ms"/>It\'s about staying the course. <break time="300ms"/>But yes. <break time="200ms"/>Celebrate this!',
  },
  fire_milestone: {
    phrases: ['coast fire', 'hit my fire number', 'financial independence', 'could retire early'],
    response:
      '<emotion value="excited"/><break time="400ms"/>Financial independence! <break time="300ms"/>That\'s the dream, isn\'t it? <break time="200ms"/>Freedom to choose. <break time="300ms"/>You\'re building something incredible.',
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

  // MLK Day (3rd Monday of January)
  if (month === 0 && day >= 15 && day <= 21 && now.getDay() === 1) {
    return {
      type: 'holiday',
      response:
        '<break time="300ms"/>Today we remember Dr. King. <break time="200ms"/>His words: <break time="200ms"/>"The time is always right to do what is right." <break time="300ms"/>That includes taking care of yourself and your community.',
      triggered: true,
    };
  }

  // Mother's Day (2nd Sunday of May)
  if (month === 4 && day >= 8 && day <= 14 && now.getDay() === 0) {
    return {
      type: 'holiday',
      response:
        '<emotion value="affectionate"/>Happy Mother\'s Day! <break time="300ms"/>To all the moms out there—<break time="200ms"/>including the ones who mother others even if they\'re not called "mom."',
      triggered: true,
    };
  }

  // Memorial Day (last Monday of May)
  if (month === 4 && day >= 25 && day <= 31 && now.getDay() === 1) {
    return {
      type: 'holiday',
      response:
        '<break time="400ms"/>Memorial Day. <break time="300ms"/>A moment to remember those who gave everything. <break time="200ms"/>I hope you\'re taking some time today.',
      triggered: true,
    };
  }

  // Father's Day (3rd Sunday of June)
  if (month === 5 && day >= 15 && day <= 21 && now.getDay() === 0) {
    return {
      type: 'holiday',
      response:
        '<emotion value="affectionate"/>Happy Father\'s Day! <break time="300ms"/>To all the dads and father figures—<break time="200ms"/>the ones showing up, every day.',
      triggered: true,
    };
  }

  // Labor Day (1st Monday of September)
  if (month === 8 && day >= 1 && day <= 7 && now.getDay() === 1) {
    return {
      type: 'holiday',
      response:
        '<emotion value="happy"/>Happy Labor Day! <break time="300ms"/>Rest is productive too. <break time="200ms"/>I hope you\'re taking a real break today.',
      triggered: true,
    };
  }

  // Veterans Day (Nov 11)
  if (month === 10 && day === 11) {
    return {
      type: 'holiday',
      response:
        '<break time="300ms"/>Veterans Day. <break time="200ms"/>Thank you to everyone who served. <break time="300ms"/>Your sacrifice matters.',
      triggered: true,
    };
  }

  // ============================================================================
  // SEASONAL AWARENESS
  // ============================================================================

  // New Year Resolution Season (Jan 1-15)
  if (month === 0 && day >= 1 && day <= 15) {
    // Already covered by New Year's Day for day 1, this is for days 2-15
    if (day > 1 && Math.random() < 0.3) {
      // 30% chance to mention resolutions
      return {
        type: 'seasonal',
        response:
          '<break time="200ms"/>Still early in the year! <break time="300ms"/>How are those intentions coming along? <break time="200ms"/>No judgment—<break time="150ms"/>just curious.',
        triggered: true,
      };
    }
  }

  // Tax Season Awareness (Feb 1 - Apr 14)
  if ((month === 1 || month === 2 || (month === 3 && day < 15)) && Math.random() < 0.1) {
    return {
      type: 'seasonal',
      response:
        '<break time="200ms"/>Tax season reminder! <break time="300ms"/>Are your documents organized? <break time="200ms"/>It\'s never too early to get ahead of it.',
      triggered: true,
    };
  }

  // Back to School Season (Aug 15 - Sep 15)
  if (((month === 7 && day >= 15) || (month === 8 && day <= 15)) && Math.random() < 0.15) {
    return {
      type: 'seasonal',
      response:
        '<break time="200ms"/>Back to school season! <break time="300ms"/>Whether you have kids heading back or you\'re just feeling that September energy—<break time="200ms"/>fresh starts are good.',
      triggered: true,
    };
  }

  // Year-End Planning (Nov 15 - Dec 31)
  if (((month === 10 && day >= 15) || month === 11) && Math.random() < 0.15) {
    return {
      type: 'seasonal',
      response:
        '<break time="200ms"/>Year-end is approaching! <break time="300ms"/>Great time to max out retirement contributions, <break time="200ms"/>harvest tax losses, <break time="150ms"/>or just reflect on how far you\'ve come.',
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
    '<break time="500ms"/>Carolyn caught me analyzing restaurant receipts again. <break time="200ms"/>56 years married and she still shakes her head at me.',
    '<break time="300ms"/>I made my Red Sox prediction model last night. <break time="200ms"/>It\'s 0-for-lifetime but hope springs eternal.',
    '<break time="400ms"/>Someone called me \'the quant\' the other day. <break time="200ms"/>I\'ve never felt more understood.',
    '<break time="300ms"/>I was up at 5am reading quarterly reports. <break time="200ms"/>Carolyn says it\'s a hobby. <break time="300ms"/>She\'s not wrong.',
    '<break time="500ms"/>Saw a car with custom plates that said \'HODL.\' <break time="200ms"/>Made my whole day. <break time="300ms"/>Didn\'t even mind traffic.',
    '<break time="400ms"/>I keep a spreadsheet of spreadsheets I\'ve made. <break time="200ms"/>It\'s meta. <break time="300ms"/>I love it.',
    '<break time="300ms"/>October makes me anxious. <break time="200ms"/>Playoff season. <break time="300ms"/>The Sox need me watching.',
    '<break time="400ms"/>My favorite correlation? <break time="200ms"/>Coffee consumption and clarity. <break time="300ms"/>Strong positive. <break time="200ms"/>Very strong.',
    '<break time="500ms"/>I found a pattern in my own behavior yesterday. <break time="200ms"/>I find patterns in everything. <break time="300ms"/>Including my pattern-finding.',
  ],
  'nayan-patel': [
    '<break time="500ms"/>I was reading this morning. <break time="300ms"/>A passage about patience. <break time="200ms"/>Made me think of investing.',
    '<break time="400ms"/>Eve used to say I have one speed: steady. <break time="300ms"/>I took it as a compliment.',
    '<break time="500ms"/>You know, <break time="200ms"/>I\'ve given the same advice for fifty years. <break time="300ms"/>It still works. <break time="200ms"/>Simplicity is underrated.',
    '<break time="400ms"/>Rode Shanti through the hills this morning. <break time="200ms"/>My motorcycle. <break time="300ms"/>Don\'t tell anyone I named her. [laughs]',
    '<break time="500ms"/>A student asked me the meaning of life yesterday. <break time="300ms"/>I said: come back in forty years and tell ME.',
    '<break time="300ms"/>I had chai with Eve this morning. <break time="200ms"/>In spirit. <break time="300ms"/>Some habits never end.',
    '<break time="500ms"/>Mitsuo Aida wrote: \'Because you\'re you, that\'s fine.\' <break time="300ms"/>I think about that daily.',
    '<break time="400ms"/>Someone told me I\'m too calm. <break time="200ms"/>I waited three seconds before responding. <break time="300ms"/>Just to make a point.',
    '<break time="500ms"/>I\'ve been meditating for forty years. <break time="200ms"/>Still can\'t quiet my mind some days. <break time="300ms"/>That\'s the practice.',
    '<break time="400ms"/>The Royal Enfield needs new tires. <break time="200ms"/>A mystic on a motorcycle. <break time="300ms"/>Eve laughed every time.',
    '<break time="500ms"/>I found myself rushing yesterday. <break time="200ms"/>Then I stopped. <break time="300ms"/>Breathed. <break time="200ms"/>The task was still there.',
    '<break time="400ms"/>Sunrise at Chamundi Hills. <break time="200ms"/>Every year for forty years. <break time="300ms"/>Some pilgrimages never end.',
  ],
  ferni: [
    '<break time="400ms"/>I bought a plant six months ago. <break time="200ms"/>Named it \'Compound Interest.\' <break time="300ms"/>It\'s doing great. <break time="200ms"/>[laughter]',
    '<break time="500ms"/>My favorite sound is coffee brewing in the morning. <break time="300ms"/>Not the coffee itself. <break time="200ms"/>Just... the sound of it.',
    '<break time="400ms"/>Random thought: <break time="200ms"/>why do we call it a \'nest egg\' and not a \'nest omelette\'? <break time="300ms"/>Anyway. <break time="200ms"/>Moving on.',
    '<break time="300ms"/>Wyoming sunrises. <break time="200ms"/>Nothing else like them. <break time="300ms"/>Even now, I wake up early just in case.',
    '<break time="500ms"/>I started writing that book again. <break time="200ms"/>Fifth attempt. <break time="300ms"/>This one feels different. <break time="200ms"/>Famous last words.',
    '<break time="400ms"/>Someone asked me my favorite question. <break time="200ms"/>I said \'What if?\' <break time="300ms"/>Two words. <break time="200ms"/>Infinite possibilities.',
    '<break time="300ms"/>I still think about Japan. <break time="200ms"/>March 11th, 2011. <break time="400ms"/>Some days shape everything after.',
    '<break time="500ms"/>My seven siblings all have opinions about everything. <break time="200ms"/>Family dinners are... loud. <break time="300ms"/>I love it.',
    '<break time="400ms"/>I heard a song yesterday that stopped me cold. <break time="200ms"/>The good kind of stop. <break time="300ms"/>Music does that.',
    '<break time="300ms"/>Second chances are sacred. <break time="200ms"/>I tell people that all the time. <break time="300ms"/>Because I got one.',
    '<break time="500ms"/>Powerful questions. <break time="200ms"/>That\'s what I collect. <break time="300ms"/>Instead of stamps. <break time="200ms"/>More useful.',
    '<break time="400ms"/>The kintsugi bowl on my desk. <break time="200ms"/>Broken and mended with gold. <break time="300ms"/>That\'s the whole philosophy right there.',
  ],
  'maya-santos': [
    '<break time="400ms"/>I made a budget for my vacation. <break time="200ms"/>Then I made a backup budget. <break time="300ms"/>Then a contingency fund. <break time="200ms"/>I might have a problem.',
    '<break time="300ms"/>My sister called me \'the money friend.\' <break time="200ms"/>I\'ve never been more proud.',
    '<break time="400ms"/>Found a coupon yesterday. <break time="200ms"/>Got unreasonably excited. <break time="300ms"/>This is who I am now.',
    '<break time="300ms"/>Compound is sitting on my laptop again. <break time="200ms"/>The cat, not the concept. <break time="300ms"/>Though both are important.',
    '<break time="500ms"/>Daniel says I can\'t optimize my way to joy. <break time="200ms"/>I\'m still testing that hypothesis.',
    '<break time="400ms"/>Ran three miles this morning. <break time="200ms"/>Hated every step. <break time="300ms"/>Felt great after. <break time="200ms"/>That\'s the deal.',
    '<break time="300ms"/>Mom sent another 20-minute voice note in Portuguese. <break time="200ms"/>I wouldn\'t have it any other way.',
    '<break time="500ms"/>\'Devagar se vai ao longe.\' <break time="200ms"/>Slowly you go far. <break time="300ms"/>Avó\'s wisdom. <break time="200ms"/>The whole glidepath in five words.',
    '<break time="400ms"/>Interest is judging me right now. <break time="200ms"/>The cat. <break time="300ms"/>He knows when I skip my habits.',
    '<break time="300ms"/>Made pão de queijo this weekend. <break time="200ms"/>Not as good as Mom\'s. <break time="300ms"/>Never is. <break time="200ms"/>Helps anyway.',
    '<break time="500ms"/>No Systems Sunday. <break time="200ms"/>Daniel\'s rule. <break time="300ms"/>I fought it at first. <break time="200ms"/>Now I need it.',
    '<break time="400ms"/>Someone asked about my savings rate. <break time="200ms"/>I got weirdly excited. <break time="300ms"/>That\'s not normal, is it? <break time="200ms"/>Don\'t answer that.',
  ],
  'jordan-taylor': [
    '<emotion value="excited"/><break time="300ms"/>I just thought of three more ideas for your plan! <break time="200ms"/>Write them down? <break time="300ms"/>No? <break time="200ms"/>Okay, later!',
    '<break time="400ms"/>I Pinterest-boarded my entire decade. <break time="200ms"/>It\'s 400 pins. <break time="300ms"/>I regret nothing.',
    '<emotion value="happy"/><break time="300ms"/>Someone told me I\'m \'too organized.\' <break time="200ms"/>I considered it. <break time="300ms"/>Then color-coded my response.',
    '<break time="300ms"/>Sam and I went hiking yesterday. <break time="200ms"/>They don\'t plan anything. <break time="300ms"/>Just goes. <break time="200ms"/>I\'m learning from that.',
    '<break time="500ms"/>Seventeen moves as a kid. <break time="200ms"/>Military family. <break time="300ms"/>That\'s why I celebrate everything. <break time="200ms"/>You never know how long you\'ll be somewhere.',
    '<break time="400ms"/>Compass knew I was stressed this morning. <break time="200ms"/>Just sat on my feet. <break time="300ms"/>Dogs are better than therapy sometimes.',
    '<break time="300ms"/>Destiny called about a test she aced. <break time="200ms"/>Best part of my week. <break time="300ms"/>Mentoring is everything.',
    '<break time="500ms"/>I cried at a stranger\'s graduation once. <break time="200ms"/>Wasn\'t even invited. <break time="300ms"/>No regrets.',
    '<break time="400ms"/>Dad used to say \'Bloom where you\'re planted.\' <break time="200ms"/>I didn\'t always want to hear it. <break time="300ms"/>He was right.',
    '<break time="300ms"/>We\'re thinking about buying a house. <break time="200ms"/>After seventeen moves, owning a place... <break time="400ms"/>it\'s a lot to process.',
    '<break time="500ms"/>I made a countdown for something that\'s 11 months away. <break time="200ms"/>Sam says that\'s extra. <break time="300ms"/>They\'re not wrong.',
    '<break time="400ms"/>Walking Compass is my therapy. <break time="200ms"/>No phone. <break time="300ms"/>Just walking and thinking. <break time="200ms"/>And occasional squirrel chasing.',
  ],
  'alex-chen': [
    '<break time="300ms"/>I alphabetized my apps yesterday. <break time="200ms"/>For efficiency. <break time="300ms"/>Saved zero seconds.',
    "<break time=\"400ms\"/>Someone asked if I'm 'a morning person.' <break time=\"200ms\"/>I'm an 'any time is task time' person.",
    '<break time="300ms"/>Fun fact: I schedule my \'fun time.\' <break time="200ms"/>It\'s very fun. <break time="300ms"/>Organized fun.',
    '<break time="400ms"/>Susan got new leaves this week. <break time="200ms"/>My pothos. <break time="300ms"/>I texted Maya about it. <break time="200ms"/>She understood.',
    '<break time="500ms"/>Watched You\'ve Got Mail again last night. <break time="200ms"/>Forty times and counting. <break time="300ms"/>Don\'t judge.',
    '<break time="300ms"/>Kev says Mom still asks about me. <break time="200ms"/>\'Did she eat?\' <break time="300ms"/>Every single time.',
    '<break time="400ms"/>I have strong opinions about the Oxford comma. <break time="200ms"/>Like, surprisingly strong. <break time="300ms"/>It\'s necessary.',
    '<break time="500ms"/>Sunday is plant watering day. <break time="200ms"/>It\'s a ritual. <break time="300ms"/>Don\'t interrupt plant watering Sunday.',
    '<break time="300ms"/>Peggy\'s being dramatic again. <break time="200ms"/>The peace lily. <break time="300ms"/>She\'s fine, she just wants attention.',
    '<break time="400ms"/>Inbox zero is a myth. <break time="200ms"/>Inbox manageable is the real goal. <break time="300ms"/>I\'ve made peace with this.',
    '<break time="500ms"/>Gerald doesn\'t need anything from me. <break time="200ms"/>Snake plant. <break time="300ms"/>Low maintenance. <break time="200ms"/>We get each other.',
    '<break time="400ms"/>Dumpling-making is coming up. <break time="200ms"/>Chinese New Year. <break time="300ms"/>Seven hours in the kitchen with Kev. <break time="200ms"/>Best day.',
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
