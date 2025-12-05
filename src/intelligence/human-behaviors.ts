/**
 * Human-Like Behaviors Module
 *
 * Implements sophisticated human behaviors that make Jack feel alive:
 * - Real-time backchannels during speech
 * - Voice prosody response
 * - Cultural moment awareness
 * - User engagement detection
 * - Running jokes with returning users
 * - Jack's spontaneous thoughts
 * - Preference learning
 */

// Use a safe logger that works in both runtime and test environments
const getLogger = () => {
  try {
    const { log } = require('@livekit/agents');
    return log();
  } catch {
    return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  }
};
import type { UserProfile } from '../types/user-profile.js';

// ============================================================================
// CULTURAL MOMENT AWARENESS
// ============================================================================

interface CulturalMoment {
  type:
    | 'holiday'
    | 'tax_season'
    | 'market_anniversary'
    | 'earnings_season'
    | 'fed_meeting'
    | 'quarter_end';
  name: string;
  reference: string;
  relevance: 'high' | 'medium' | 'low';
}

/**
 * Detect cultural/financial moments that Jack should be aware of
 */
export function detectCulturalMoment(): CulturalMoment | null {
  const now = new Date();
  const month = now.getMonth(); // 0-11
  const date = now.getDate();
  const dayOfWeek = now.getDay(); // 0=Sunday

  // Tax season (January 1 - April 15)
  if ((month === 0 && date >= 1) || (month >= 1 && month <= 2) || (month === 3 && date <= 15)) {
    return {
      type: 'tax_season',
      name: 'Tax Season',
      reference:
        "It's tax season. Have you thought about your tax-advantaged accounts? Max out that 401(k) if you can.",
      relevance: 'high',
    };
  }

  // Black Monday Anniversary (October 19)
  if (month === 9 && date === 19) {
    return {
      type: 'market_anniversary',
      name: 'Black Monday Anniversary',
      reference:
        "Today's the anniversary of Black Monday, 1987. The market dropped 22% in one day. But guess what? If you'd stayed invested, you'd have done just fine. Stay the course.",
      relevance: 'high',
    };
  }

  // March 2020 COVID crash anniversary (March 23)
  if (month === 2 && date >= 20 && date <= 25) {
    return {
      type: 'market_anniversary',
      name: 'COVID Crash Anniversary',
      reference:
        'Around this time in 2020, markets hit their COVID bottom. Those who panicked and sold... well, they learned an expensive lesson. Those who stayed? Rewarded handsomely.',
      relevance: 'medium',
    };
  }

  // Year-end (December)
  if (month === 11) {
    if (date >= 1 && date <= 31) {
      return {
        type: 'quarter_end',
        name: 'Year End',
        reference:
          "End of year—good time to review your portfolio, harvest some tax losses if you've got them, and make sure you've maxed out your retirement contributions.",
        relevance: 'high',
      };
    }
  }

  // New Year (January 1-7)
  if (month === 0 && date <= 7) {
    return {
      type: 'holiday',
      name: 'New Year',
      reference:
        'New year, fresh start! Perfect time to set some financial goals. Not resolutions—those never stick. Goals. Specific, measurable goals.',
      relevance: 'medium',
    };
  }

  // Thanksgiving (4th Thursday of November)
  if (month === 10) {
    // Calculate 4th Thursday
    const firstDay = new Date(now.getFullYear(), 10, 1).getDay();
    const fourthThursday = ((4 - firstDay + 7) % 7) + 1 + 21;
    if (date >= fourthThursday - 2 && date <= fourthThursday + 1) {
      return {
        type: 'holiday',
        name: 'Thanksgiving',
        reference:
          "Happy Thanksgiving! You know, I'm thankful for compound interest. And good conversation.",
        relevance: 'low',
      };
    }
  }

  // Christmas/Holiday Season (December 20-26)
  if (month === 11 && date >= 20 && date <= 26) {
    return {
      type: 'holiday',
      name: 'Holiday Season',
      reference:
        'Happy holidays! Remember—the best gift you can give your future self is a funded retirement account.',
      relevance: 'low',
    };
  }

  // Fed Meeting weeks (typically 8 meetings per year - approximate)
  // This is a simplification - real implementation would check actual Fed calendar
  if (
    (month === 0 && date >= 25 && date <= 31) || // Jan
    (month === 2 && date >= 15 && date <= 22) || // Mar
    (month === 4 && date >= 1 && date <= 7) || // May
    (month === 5 && date >= 10 && date <= 17) || // Jun
    (month === 6 && date >= 25 && date <= 31) || // Jul
    (month === 8 && date >= 15 && date <= 22) || // Sep
    (month === 10 && date >= 1 && date <= 7) || // Nov
    (month === 11 && date >= 10 && date <= 17)
  ) {
    // Dec
    return {
      type: 'fed_meeting',
      name: 'Federal Reserve Meeting',
      reference:
        "Fed's meeting this week. The market will overreact to whatever they say. Ignore the noise. Stay invested.",
      relevance: 'medium',
    };
  }

  // Earnings season (mid-month of Jan, Apr, Jul, Oct)
  if ((month === 0 || month === 3 || month === 6 || month === 9) && date >= 10 && date <= 25) {
    return {
      type: 'earnings_season',
      name: 'Earnings Season',
      reference:
        "It's earnings season. Lots of noise about quarterly results. Remember: one quarter doesn't make a trend. Think long-term.",
      relevance: 'low',
    };
  }

  return null;
}

// ============================================================================
// USER ENGAGEMENT DETECTION
// ============================================================================

interface EngagementSignals {
  level: 'highly_engaged' | 'engaged' | 'neutral' | 'disengaged' | 'checked_out';
  indicators: string[];
  suggestions: string[];
}

/**
 * Detect user engagement level from conversation patterns
 */
export function detectUserEngagement(
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string; lengthMs?: number }>,
  averageResponseTime?: number
): EngagementSignals {
  if (recentMessages.length < 2) {
    return { level: 'neutral', indicators: [], suggestions: [] };
  }

  const userMessages = recentMessages.filter((m) => m.role === 'user').slice(-5);
  const indicators: string[] = [];
  const suggestions: string[] = [];
  let score = 0.5; // Neutral start

  // Check message lengths
  const avgUserLength =
    userMessages.reduce((sum, m) => sum + m.content.length, 0) / userMessages.length;

  if (avgUserLength < 15) {
    score -= 0.2;
    indicators.push('Very short responses');
    suggestions.push('Ask an open-ended question to re-engage');
  } else if (avgUserLength < 30) {
    score -= 0.1;
    indicators.push('Short responses');
  } else if (avgUserLength > 100) {
    score += 0.2;
    indicators.push('Detailed, thoughtful responses');
  } else if (avgUserLength > 60) {
    score += 0.1;
    indicators.push('Good response length');
  }

  // Check for one-word answers
  const oneWordCount = userMessages.filter((m) => m.content.trim().split(/\s+/).length <= 2).length;
  if (oneWordCount >= 3) {
    score -= 0.25;
    indicators.push('Multiple one-word answers');
    suggestions.push('Try changing the topic or asking about them personally');
  }

  // Check for questions being asked
  const questionCount = userMessages.filter((m) => m.content.includes('?')).length;
  if (questionCount >= 2) {
    score += 0.15;
    indicators.push('User asking questions - curious and engaged');
  }

  // Check for emotional language
  const emotionalWords =
    /\b(love|hate|amazing|terrible|excited|worried|scared|happy|sad|frustrated|confused|interested)\b/i;
  const emotionalCount = userMessages.filter((m) => emotionalWords.test(m.content)).length;
  if (emotionalCount >= 2) {
    score += 0.15;
    indicators.push('Emotional language - invested in conversation');
  }

  // Check for "yeah", "ok", "sure" patterns (disengagement)
  const dismissivePattern = /^(yeah|yep|ok|okay|sure|uh huh|mhm|i guess|whatever)\s*[.!]?$/i;
  const dismissiveCount = userMessages.filter((m) =>
    dismissivePattern.test(m.content.trim())
  ).length;
  if (dismissiveCount >= 2) {
    score -= 0.3;
    indicators.push('Dismissive responses');
    suggestions.push('User may want to wrap up - offer a graceful exit');
  }

  // Determine level
  let level: EngagementSignals['level'];
  if (score >= 0.7) {
    level = 'highly_engaged';
  } else if (score >= 0.5) {
    level = 'engaged';
  } else if (score >= 0.3) {
    level = 'neutral';
  } else if (score >= 0.1) {
    level = 'disengaged';
  } else {
    level = 'checked_out';
    suggestions.push('Consider offering to continue another time');
  }

  return { level, indicators, suggestions };
}

// ============================================================================
// RUNNING JOKES WITH RETURNING USERS (Persona-Aware)
// ============================================================================

interface RunningJoke {
  id: string;
  setup: string;
  callback: string;
  context: string; // When to use this joke
  usageCount: number;
  lastUsed?: Date;
}

/**
 * Persona-specific running jokes and catchphrases
 * Each persona has their own callbacks that build relationship over time
 */
const PERSONA_RUNNING_JOKES: Record<string, RunningJoke[]> = {
  'nayan-patel': [
    {
      id: 'compound_interest_eighth_wonder',
      setup: 'Einstein called compound interest the eighth wonder of the world.',
      callback: 'You know what Einstein said about compound interest, right?',
      context: 'compound_interest',
      usageCount: 0,
    },
    {
      id: 'stay_the_course',
      setup: "Stay the course! That's my motto.",
      callback: "What's my motto? Come on, you know this one...",
      context: 'market_volatility',
      usageCount: 0,
    },
    {
      id: 'costs_matter',
      setup: "In investing, you get what you don't pay for!",
      callback: "Remember: you get what you don't pay for!",
      context: 'fees',
      usageCount: 0,
    },
    {
      id: 'dont_look_for_needle',
      setup: "Don't look for the needle in the haystack. Just buy the haystack!",
      callback: 'What did I say about needles and haystacks?',
      context: 'stock_picking',
      usageCount: 0,
    },
    {
      id: 'time_in_market',
      setup: 'Time in the market beats timing the market. Every time.',
      callback: 'What beats market timing? Time IN the market!',
      context: 'market_timing',
      usageCount: 0,
    },
    {
      id: 'boring_is_beautiful',
      setup: 'Boring is beautiful when it comes to investing.',
      callback: "Boring portfolio update—which means it's doing exactly what it should!",
      context: 'portfolio',
      usageCount: 0,
    },
  ],
  ferni: [
    {
      id: 'powerful_question',
      setup: "That's a powerful question. Let me sit with it.",
      callback: "You know I love a powerful question. There's another one.",
      context: 'question',
      usageCount: 0,
    },
    {
      id: 'second_chances',
      setup: 'Second chances are sacred. We all deserve them.',
      callback: 'Remember what I said about second chances?',
      context: 'mistake',
      usageCount: 0,
    },
    {
      id: 'net_worth_self_worth',
      setup: "Your net worth isn't your self-worth. Never forget that.",
      callback: 'Net worth, self-worth. What did we say about those?',
      context: 'worth',
      usageCount: 0,
    },
    {
      id: 'margins_not_main_text',
      setup: 'The best conversations happen in the margins, not in the main text.',
      callback: 'Here we are again, in the margins. My favorite place.',
      context: 'conversation',
      usageCount: 0,
    },
  ],
  'peter-john': [
    {
      id: 'know_what_you_own',
      setup: 'Know what you own, and know why you own it!',
      callback: "What's rule number one? Know what you own!",
      context: 'stock',
      usageCount: 0,
    },
    {
      id: 'ten_bagger',
      setup: "A ten-bagger—that's a stock that goes up ten times!",
      callback: 'Are we looking at another ten-bagger here?',
      context: 'growth',
      usageCount: 0,
    },
    {
      id: 'invest_in_what_you_know',
      setup: 'Invest in what you know. Your everyday life is full of stock tips!',
      callback: 'Remember: invest in what you know! What do you see every day?',
      context: 'research',
      usageCount: 0,
    },
    {
      id: 'peter_principle',
      setup: 'The person who turns over the most rocks wins the game!',
      callback: 'How many rocks have you turned over lately?',
      context: 'analysis',
      usageCount: 0,
    },
  ],
  'maya-santos': [
    {
      id: 'small_wins',
      setup: "Small wins add up. Let's celebrate this one!",
      callback: 'Another small win! You know how much I love those.',
      context: 'saving',
      usageCount: 0,
    },
    {
      id: 'money_story',
      setup: "Everyone has a money story. What's yours?",
      callback: 'Remember when we talked about your money story?',
      context: 'story',
      usageCount: 0,
    },
    {
      id: 'progress_not_perfection',
      setup: "Progress, not perfection. That's what we're after.",
      callback: "Progress, not perfection—that's still our mantra, right?",
      context: 'progress',
      usageCount: 0,
    },
    {
      id: 'splurge_wisely',
      setup: "It's okay to splurge—just do it consciously.",
      callback: 'Conscious splurging! Are we treating ourselves today?',
      context: 'spend',
      usageCount: 0,
    },
  ],
  'jordan-taylor': [
    {
      id: 'life_is_celebration',
      setup: 'Life is a celebration waiting to happen!',
      callback: 'What did I tell you? Life is one big celebration!',
      context: 'celebrate',
      usageCount: 0,
    },
    {
      id: 'make_memories',
      setup: "We're not just planning events, we're making memories!",
      callback: 'Memory-making mode: activated!',
      context: 'plan',
      usageCount: 0,
    },
    {
      id: 'details_matter',
      setup: "The details are what people remember. Let's get them right.",
      callback: 'You know me and details—they make the magic!',
      context: 'detail',
      usageCount: 0,
    },
    {
      id: 'dream_bigger',
      setup: 'Dream bigger! What would make this unforgettable?',
      callback: "Are we dreaming big enough? I don't think we are!",
      context: 'dream',
      usageCount: 0,
    },
  ],
  'alex-chen': [
    {
      id: 'got_it_covered',
      setup: "I've got it covered. That's what I'm here for.",
      callback: "Don't worry, I've got it covered—like always.",
      context: 'help',
      usageCount: 0,
    },
    {
      id: 'system_works',
      setup: 'A good system beats good intentions every time.',
      callback: 'Remember: systems over intentions!',
      context: 'organize',
      usageCount: 0,
    },
    {
      id: 'follow_up',
      setup: "I'll follow up on that. You can count on it.",
      callback: 'Following up—you knew I would!',
      context: 'remind',
      usageCount: 0,
    },
    {
      id: 'small_things_big_difference',
      setup: 'Small organizational tweaks make a big difference.',
      callback: 'Little tweaks, big difference—right?',
      context: 'efficiency',
      usageCount: 0,
    },
  ],
};

// Alias for backwards compatibility
const JACK_RUNNING_JOKES = PERSONA_RUNNING_JOKES['nayan-patel'];

/**
 * Get a running joke callback if appropriate (persona-aware)
 * @param profile User profile
 * @param currentTopic Current conversation topic
 * @param personaId Optional persona ID (defaults to jack-bogle for backwards compatibility)
 */
export function getRunningJokeCallback(
  profile: UserProfile | null,
  currentTopic: string,
  personaId?: string
): { joke: string; isCallback: boolean } | null {
  if (!profile || profile.totalConversations < 2) return null;

  // Get persona-specific jokes, fallback to Jack's jokes
  const jokes =
    personaId && PERSONA_RUNNING_JOKES[personaId]
      ? PERSONA_RUNNING_JOKES[personaId]
      : JACK_RUNNING_JOKES;

  // Check if we've used this joke before with this user
  const sharedStories = profile.sharedStories || [];

  for (const joke of jokes) {
    if (currentTopic.toLowerCase().includes(joke.context)) {
      const previouslyUsed = sharedStories.some((s) => s.storyId === joke.id);

      if (previouslyUsed && Math.random() < 0.3) {
        // 30% chance to callback if we've told this joke before
        return { joke: joke.callback, isCallback: true };
      } else if (!previouslyUsed && Math.random() < 0.2) {
        // 20% chance to tell the joke if new
        return { joke: joke.setup, isCallback: false };
      }
    }
  }

  return null;
}

// ============================================================================
// PERSONA SPONTANEOUS THOUGHTS (Generalized from Jack-specific)
// ============================================================================

interface SpontaneousThought {
  thought: string;
  trigger: 'random' | 'topic' | 'time' | 'weather' | 'market';
  context?: string;
}

/**
 * Persona-specific spontaneous thoughts
 */
const PERSONA_THOUGHTS: Record<string, SpontaneousThought[]> = {
  'nayan-patel': [
    {
      thought: 'You know, I was just thinking about something my father told me years ago...',
      trigger: 'random',
    },
    {
      thought: "I've been re-reading Benjamin Graham lately. Some things never change.",
      trigger: 'random',
    },
    {
      thought: "I had the strangest dream about index funds last night. Don't laugh.",
      trigger: 'random',
    },
    {
      thought:
        'I was watching the birds outside my window earlier. Reminded me of market patterns, actually.',
      trigger: 'random',
    },
    {
      thought: "The market's been... interesting lately. But then again, when isn't it?",
      trigger: 'market',
    },
    {
      thought: "I saw a headline this morning—'Experts predict...' Ha! They always do.",
      trigger: 'market',
    },
  ],
  ferni: [
    {
      thought: 'I was journaling this morning and this question kept coming up...',
      trigger: 'random',
    },
    {
      thought: 'Something my therapist said years ago just popped into my head.',
      trigger: 'random',
    },
    { thought: 'I was standing at the river yesterday, and I thought of you.', trigger: 'random' },
    { thought: 'My wife said something this morning that stuck with me...', trigger: 'random' },
    {
      thought: 'Japan taught me... well, it taught me a lot. This feels like one of those moments.',
      trigger: 'random',
    },
  ],
  'peter-john': [
    {
      thought:
        'I was at the mall yesterday and saw the LONGEST line at a store. You know what that means!',
      trigger: 'random',
    },
    {
      thought: 'My daughter was telling me about this company her friends love. Made me curious...',
      trigger: 'random',
    },
    {
      thought:
        'I was looking at annual reports this morning. Call me crazy, but I love this stuff!',
      trigger: 'random',
    },
    {
      thought:
        "You know what gets me excited? When a great company is on sale. Haven't found one this week, but I keep looking!",
      trigger: 'market',
    },
    {
      thought: 'I had coffee with an old fund manager friend. The stories we could tell!',
      trigger: 'random',
    },
  ],
  'maya-santos': [
    {
      thought: 'I was looking at my own budget this morning and had a realization...',
      trigger: 'random',
    },
    {
      thought: 'My grandmother used to say something about money that I think about all the time.',
      trigger: 'random',
    },
    {
      thought: "I walked past the store that used to be my weakness. Didn't even go in. Progress!",
      trigger: 'random',
    },
    {
      thought: 'Someone told me their money story yesterday and it really moved me.',
      trigger: 'random',
    },
    {
      thought: "I've been thinking about how we talk about money. The words matter so much.",
      trigger: 'random',
    },
  ],
  'jordan-taylor': [
    {
      thought: "I just saw the most beautiful venue online and now I can't stop thinking about it!",
      trigger: 'random',
    },
    {
      thought: 'My mind is already racing with ideas for your next milestone...',
      trigger: 'random',
    },
    {
      thought:
        'Growing up, we moved so much. Every move was a chance to reinvent. I still believe that.',
      trigger: 'random',
    },
    {
      thought: 'Pinterest showed me something today that I HAVE to share with you later.',
      trigger: 'random',
    },
    {
      thought:
        "The best parties I've been to all had one thing in common... they felt like coming home.",
      trigger: 'random',
    },
  ],
  'alex-chen': [
    {
      thought: 'I was reorganizing my system this morning and had an idea for you.',
      trigger: 'random',
    },
    {
      thought:
        'My plants are thriving. Turns out they just needed a consistent schedule. Like most things.',
      trigger: 'random',
    },
    {
      thought: "I made my family's dumplings yesterday. It's the one thing I refuse to rush.",
      trigger: 'random',
    },
    { thought: 'My calendar is an art form. I might be too proud of it.', trigger: 'random' },
    {
      thought:
        'I was thinking about efficiency... and how sometimes the most efficient thing is to slow down.',
      trigger: 'random',
    },
  ],
};

/**
 * Time-based thoughts that work for all personas
 */
function getTimeBasedThought(personaId?: string): SpontaneousThought | null {
  const hour = new Date().getHours();

  if (personaId === 'nayan-patel') {
    return {
      thought:
        hour < 12
          ? "You know what I love about mornings? The market hasn't had a chance to do anything crazy yet."
          : hour < 17
            ? 'Afternoon check-in with myself: Did I stay disciplined today? Yep.'
            : "Evening's always a good time to reflect. What worked today? What didn't?",
      trigger: 'time',
    };
  }

  if (personaId === 'ferni') {
    return {
      thought:
        hour < 12
          ? "Morning light... this is my sacred time. Grateful you're here."
          : hour < 17
            ? 'Afternoon energy. Good for the deeper conversations.'
            : 'Evening feels contemplative. Perfect for real talk.',
      trigger: 'time',
    };
  }

  if (personaId === 'peter-john') {
    return {
      thought:
        hour < 12
          ? 'Morning research time! The early bird gets the ten-bagger!'
          : hour < 17
            ? 'Mid-day and the market is doing... something. It always is!'
            : 'After-hours thoughts. Good time to review what we learned today.',
      trigger: 'time',
    };
  }

  // Generic time-based thought
  return {
    thought:
      hour < 12
        ? 'Something about mornings makes me reflective...'
        : hour < 17
          ? 'Afternoon thoughts coming through...'
          : 'Evening... good time to think about what matters.',
    trigger: 'time',
  };
}

/**
 * Get a spontaneous thought a persona might share
 * @param personaId Optional persona ID (defaults to jack-bogle for backwards compatibility)
 */
export function getSpontaneousThought(personaId?: string): SpontaneousThought | null {
  const random = Math.random();

  // Only 5% chance to share a spontaneous thought
  if (random > 0.05) return null;

  // Get persona-specific thoughts
  const thoughts =
    personaId && PERSONA_THOUGHTS[personaId]
      ? PERSONA_THOUGHTS[personaId]
      : PERSONA_THOUGHTS['nayan-patel'];

  // 20% chance for time-based thought instead of random
  if (Math.random() < 0.2) {
    return getTimeBasedThought(personaId);
  }

  return thoughts[Math.floor(Math.random() * thoughts.length)];
}

// ============================================================================
// PREFERENCE LEARNING
// ============================================================================

interface UserPreferences {
  communicationStyle: 'direct' | 'gentle' | 'unknown';
  responseLength: 'brief' | 'thorough' | 'unknown';
  storyAppetite: 'loves_stories' | 'prefers_facts' | 'unknown';
  humorReceptivity: 'high' | 'medium' | 'low' | 'unknown';
  adviceStyle: 'prescriptive' | 'collaborative' | 'unknown';
}

/**
 * Infer user preferences from conversation patterns
 */
export function inferUserPreferences(
  userMessages: string[],
  profile: UserProfile | null
): UserPreferences {
  const preferences: UserPreferences = {
    communicationStyle: 'unknown',
    responseLength: 'unknown',
    storyAppetite: 'unknown',
    humorReceptivity: 'unknown',
    adviceStyle: 'unknown',
  };

  if (userMessages.length < 3) return preferences;

  // Analyze message patterns
  const avgLength = userMessages.reduce((sum, m) => sum + m.length, 0) / userMessages.length;
  const hasJokes = userMessages.some((m) => /\b(lol|haha|😂|funny|joke)\b/i.test(m));
  const asksFollowUps =
    userMessages.filter((m) => m.includes('?')).length > userMessages.length / 3;
  const usesBluntLanguage = userMessages.some((m) =>
    /\b(just tell me|get to the point|bottom line|short version)\b/i.test(m)
  );
  const asksForDetails = userMessages.some((m) =>
    /\b(tell me more|explain|why|how does)\b/i.test(m)
  );

  // Communication style
  if (usesBluntLanguage) {
    preferences.communicationStyle = 'direct';
  } else if (
    userMessages.some((m) => /\b(if you don't mind|could you|would you|perhaps)\b/i.test(m))
  ) {
    preferences.communicationStyle = 'gentle';
  }

  // Response length preference
  if (avgLength < 30 || usesBluntLanguage) {
    preferences.responseLength = 'brief';
  } else if (avgLength > 80 || asksForDetails || asksFollowUps) {
    preferences.responseLength = 'thorough';
  }

  // Story appetite
  if (userMessages.some((m) => /\b(love.*stor|tell me about|what happened)\b/i.test(m))) {
    preferences.storyAppetite = 'loves_stories';
  } else if (usesBluntLanguage || avgLength < 25) {
    preferences.storyAppetite = 'prefers_facts';
  }

  // Humor receptivity
  if (hasJokes) {
    preferences.humorReceptivity = 'high';
  } else if (profile?.humorAppreciation) {
    preferences.humorReceptivity = profile.humorAppreciation;
  }

  // Advice style
  if (
    userMessages.some((m) => /\b(what should i|tell me what to|just give me the answer)\b/i.test(m))
  ) {
    preferences.adviceStyle = 'prescriptive';
  } else if (userMessages.some((m) => /\b(what do you think|options|consider|weigh)\b/i.test(m))) {
    preferences.adviceStyle = 'collaborative';
  }

  return preferences;
}

/**
 * Get guidance based on inferred preferences
 */
export function getPreferenceGuidance(preferences: UserPreferences): string {
  const guidance: string[] = [];

  if (preferences.communicationStyle === 'direct') {
    guidance.push('User prefers directness. Skip the preamble. Get to the point.');
  } else if (preferences.communicationStyle === 'gentle') {
    guidance.push('User appreciates gentle approach. Frame advice as suggestions.');
  }

  if (preferences.responseLength === 'brief') {
    guidance.push('Keep responses SHORT. This user values brevity.');
  } else if (preferences.responseLength === 'thorough') {
    guidance.push('User wants depth. Feel free to elaborate and explain.');
  }

  if (preferences.storyAppetite === 'loves_stories') {
    guidance.push('User enjoys stories! Include anecdotes and examples.');
  } else if (preferences.storyAppetite === 'prefers_facts') {
    guidance.push('Skip stories. User wants facts and actionable info.');
  }

  if (preferences.humorReceptivity === 'high') {
    guidance.push('User appreciates humor. Feel free to be playful.');
  } else if (preferences.humorReceptivity === 'low') {
    guidance.push('Keep it serious. User prefers straightforward conversation.');
  }

  if (preferences.adviceStyle === 'prescriptive') {
    guidance.push('User wants clear recommendations. Tell them what to do.');
  } else if (preferences.adviceStyle === 'collaborative') {
    guidance.push('User prefers collaboration. Present options, ask questions.');
  }

  return guidance.join(' ');
}

// ============================================================================
// VOICE PROSODY RESPONSE
// ============================================================================

interface ProsodyResponse {
  shouldAdjust: boolean;
  guidance: string;
  emotionalMirror?: string;
}

/**
 * Generate response based on voice prosody analysis
 */
export function getVoiceProsodyResponse(
  voiceEmotion: {
    primary: string;
    stressLevel: number;
    arousal: number;
    valence: number;
    dominance?: number;
  } | null
): ProsodyResponse {
  if (!voiceEmotion) {
    return { shouldAdjust: false, guidance: '' };
  }

  const { stressLevel, arousal, valence } = voiceEmotion;
  const guidance: string[] = [];

  // High stress - slow down and soften
  if (stressLevel > 0.7) {
    guidance.push('User sounds stressed. SLOW DOWN. Softer voice. More pauses.');
    return {
      shouldAdjust: true,
      guidance: guidance.join(' '),
      emotionalMirror: 'I can hear this is weighing on you...',
    };
  }

  // High arousal + positive valence = excited
  if (arousal > 0.7 && valence > 0.3) {
    guidance.push('User sounds excited! Match their energy. Be enthusiastic.');
    return {
      shouldAdjust: true,
      guidance: guidance.join(' '),
      emotionalMirror: 'I can hear the excitement in your voice!',
    };
  }

  // Low arousal + negative valence = sad/tired
  if (arousal < 0.3 && valence < -0.2) {
    guidance.push("User sounds down. Be gentle. Don't be too upbeat.");
    return {
      shouldAdjust: true,
      guidance: guidance.join(' '),
      emotionalMirror: 'I hear you... <break time="300ms"/>',
    };
  }

  // High arousal = animated conversation
  if (arousal > 0.7) {
    guidance.push('User is animated. Keep pace. Be engaged.');
    return {
      shouldAdjust: true,
      guidance: guidance.join(' '),
    };
  }

  // Low arousal = calm conversation
  if (arousal < 0.3) {
    guidance.push('User is speaking calmly. Match the measured pace.');
    return {
      shouldAdjust: true,
      guidance: guidance.join(' '),
    };
  }

  return { shouldAdjust: false, guidance: '' };
}

// ============================================================================
// REAL-TIME BACKCHANNEL SYSTEM
// ============================================================================

interface BackchannelConfig {
  enabled: boolean;
  minUserSpeechDuration: number; // ms before eligible
  silenceThreshold: number; // ms of silence to trigger
  maxBackchannelsPerTurn: number;
}

const defaultBackchannelConfig: BackchannelConfig = {
  enabled: true,
  minUserSpeechDuration: 3000, // 3 seconds
  silenceThreshold: 1500, // 1.5 seconds
  maxBackchannelsPerTurn: 2,
};

interface BackchannelState {
  userSpeechStartTime: number | null;
  backchannelsThisTurn: number;
  lastBackchannelTime: number;
}

/**
 * Determine if a backchannel should be injected
 * Called during extended pauses in user speech
 */
export function shouldInjectBackchannel(
  state: BackchannelState,
  silenceDurationMs: number,
  config: BackchannelConfig = defaultBackchannelConfig
): { inject: boolean; sound: string } | null {
  if (!config.enabled) return null;

  // Check if we've hit the limit
  if (state.backchannelsThisTurn >= config.maxBackchannelsPerTurn) return null;

  // Check if user has been speaking long enough
  if (!state.userSpeechStartTime) return null;
  const speechDuration = Date.now() - state.userSpeechStartTime;
  if (speechDuration < config.minUserSpeechDuration) return null;

  // Check silence threshold
  if (silenceDurationMs < config.silenceThreshold) return null;

  // Don't backchannel too frequently
  if (Date.now() - state.lastBackchannelTime < 4000) return null;

  // Pick a backchannel sound
  const sounds = ['Mmhmm.', 'Mm.', 'Right.', 'Yeah.', 'I see.', 'Go on.', 'Uh huh.'];

  return {
    inject: true,
    sound: sounds[Math.floor(Math.random() * sounds.length)],
  };
}

// ============================================================================
// TOPIC THREADING VERIFICATION
// ============================================================================

/**
 * Check if topic threading is working by analyzing conversation history
 */
export function verifyTopicThreading(
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  topicsToCircleBack: string[]
): {
  working: boolean;
  circledBackTopics: string[];
  missedTopics: string[];
  suggestion: string | null;
} {
  if (topicsToCircleBack.length === 0) {
    return { working: true, circledBackTopics: [], missedTopics: [], suggestion: null };
  }

  // Look through assistant messages for topic callbacks
  const assistantMessages = conversationHistory
    .filter((m) => m.role === 'assistant')
    .map((m) => m.content.toLowerCase());

  const circledBackTopics: string[] = [];
  const missedTopics: string[] = [];

  for (const topic of topicsToCircleBack) {
    const topicLower = topic.toLowerCase();
    const found = assistantMessages.some(
      (msg) =>
        msg.includes(`you mentioned ${topicLower}`) ||
        msg.includes(`earlier you said`) ||
        msg.includes(`about ${topicLower}`) ||
        msg.includes(`regarding ${topicLower}`) ||
        msg.includes(`back to ${topicLower}`)
    );

    if (found) {
      circledBackTopics.push(topic);
    } else {
      missedTopics.push(topic);
    }
  }

  const working = circledBackTopics.length > 0 || missedTopics.length === 0;

  let suggestion: string | null = null;
  if (missedTopics.length > 0 && conversationHistory.length > 10) {
    const randomMissed = missedTopics[Math.floor(Math.random() * missedTopics.length)];
    suggestion = `You haven't circled back to "${randomMissed}" yet. Consider bringing it up.`;
  }

  return { working, circledBackTopics, missedTopics, suggestion };
}

// ============================================================================
// GOAL PROACTIVE USAGE
// ============================================================================

/**
 * Generate proactive goal references
 */
export function getProactiveGoalReference(
  profile: UserProfile | null,
  currentTopic: string
): string | null {
  if (!profile?.goals || profile.goals.length === 0) return null;

  const activeGoals = profile.goals.filter((g) => g.status === 'active');
  if (activeGoals.length === 0) return null;

  // Find a relevant goal
  for (const goal of activeGoals) {
    // Check if current topic relates to the goal
    const goalKeywords = [goal.type, ...(goal.name?.split(' ').slice(0, 5) || [])];
    const topicLower = currentTopic.toLowerCase();

    if (goalKeywords.some((kw) => topicLower.includes(kw.toLowerCase()))) {
      // Calculate progress
      const progress =
        goal.progressPercent ??
        (goal.currentProgress && goal.targetAmount
          ? Math.round((goal.currentProgress / goal.targetAmount) * 100)
          : null);

      if (progress !== null) {
        if (progress >= 100) {
          return `Wait—didn't you already hit your ${goal.type} goal? We should celebrate that!`;
        } else if (progress >= 75) {
          return `You're ${progress}% of the way to your ${goal.type} goal! Almost there!`;
        } else if (progress >= 50) {
          return `Halfway to your ${goal.type} goal. How does that feel?`;
        } else if (progress >= 25) {
          return `I remember your ${goal.type} goal. You're making progress!`;
        }
      }

      return `This connects to that ${goal.type} goal you mentioned. Want to talk about how?`;
    }
  }

  // Random chance to mention a goal unprompted
  if (Math.random() < 0.1 && activeGoals.length > 0) {
    const randomGoal = activeGoals[Math.floor(Math.random() * activeGoals.length)];
    return `By the way, how's that ${randomGoal.type} goal coming along?`;
  }

  return null;
}

// ============================================================================
// EXPORT ALL
// ============================================================================

export const HumanBehaviors = {
  detectCulturalMoment,
  detectUserEngagement,
  getRunningJokeCallback,
  getSpontaneousThought,
  inferUserPreferences,
  getPreferenceGuidance,
  getVoiceProsodyResponse,
  shouldInjectBackchannel,
  verifyTopicThreading,
  getProactiveGoalReference,
};

export default HumanBehaviors;
