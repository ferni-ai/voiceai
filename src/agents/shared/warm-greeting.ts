/**
 * Warm Greeting Generator
 *
 * Generates instant greetings during prewarm so first response is immediate.
 * This provides a fallback greeting that can be spoken while the personalized
 * greeting loads in the background.
 *
 * NOW WITH DYNAMIC SSML - Greetings feel alive, not scripted
 *
 * ZERO DEPENDENCIES - This module is loaded during prewarm hot path.
 * Do NOT import heavy modules like safe-logger here.
 *
 * Performance impact: -100-200ms on first response
 */

// Lightweight logging (zero dependencies - don't import safe-logger!)
const _log = (level: string, msg: string, data?: Record<string, unknown>) => {
  if (process.env.NODE_ENV !== 'production' || level === 'error') {
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';
    process.stderr.write(`[warm-greeting] [${level}] ${msg}${dataStr}\n`);
  }
};

// ============================================================================
// WARM GREETING CACHE
// ============================================================================

interface WarmGreetingCache {
  greeting: string;
  personaId: string;
  generatedAt: number;
  isGeneric: boolean;
}

let warmGreetingCache: WarmGreetingCache | null = null;

// ============================================================================
// CONTEXT-AWARE GREETING SYSTEM
// "Better than Human" - greetings that feel emotionally attuned
// ============================================================================

export interface GreetingContext {
  /** Hour of day (0-23) */
  hour?: number;
  /** User's last emotional state */
  lastEmotion?: string;
  /** Last emotion intensity (0-1) */
  lastEmotionIntensity?: number;
  /** Days since last conversation */
  daysSinceLastChat?: number;
  /** Whether this is a returning user */
  isReturningUser?: boolean;
  /** User's name if known */
  userName?: string;
  /** Relationship stage */
  relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
}

// Time-of-day appropriate greetings
// HUMAN patterns - not just warm, genuinely human speech:
// - Incomplete thoughts ("...hey")
// - Caught mid-moment ("Hmm? Oh, hey")
// - Natural hesitations
// - Varying energy levels
const TIME_BASED_OPENERS = {
  earlyMorning: [
    // 5am-8am - still waking up, soft
    { text: '...hey.', emotion: null, energy: 'calm' },
    { text: 'Hmm? Oh, hey.', emotion: null, energy: 'calm' },
    { text: 'Morning.', emotion: null, energy: 'calm' },
    { text: 'Hey.', emotion: 'affectionate', energy: 'calm' },
  ],
  morning: [
    // 8am-12pm - settling in
    { text: 'Hey.', emotion: null, energy: 'warm' },
    { text: 'Oh. Hey.', emotion: null, energy: 'warm' },
    { text: '...hey there.', emotion: 'affectionate', energy: 'warm' },
    { text: 'Hey.', emotion: 'affectionate', energy: 'warm' },
  ],
  afternoon: [
    // 12pm-6pm - present, engaged
    { text: 'Hey.', emotion: null, energy: 'warm' },
    { text: 'Oh, hey.', emotion: null, energy: 'warm' },
    { text: 'Hey.', emotion: 'curious', energy: 'warm' },
    { text: '...hey.', emotion: 'affectionate', energy: 'warm' },
  ],
  evening: [
    // 6pm-10pm - winding down
    { text: 'Hey.', emotion: null, energy: 'calm' },
    { text: '...hey.', emotion: 'affectionate', energy: 'calm' },
    { text: 'Oh. Hey.', emotion: null, energy: 'calm' },
    { text: 'Hey.', emotion: 'affectionate', energy: 'calm' },
  ],
  lateNight: [
    // 10pm-5am - quiet, present
    { text: '...hey.', emotion: null, energy: 'calm' },
    { text: 'Hey.', emotion: null, energy: 'calm' },
    { text: 'Oh. Hey.', emotion: 'affectionate', energy: 'calm' },
    { text: '...still up?', emotion: null, energy: 'calm' },
  ],
};

// Follow-ups - HUMAN, not interview questions
// Some are questions, some are just statements, some are incomplete
const EMOTION_MIDDLES = {
  neutral: [
    { text: "What's going on?", pause: 200 },
    { text: "What's up?", pause: 180 },
    { text: 'Talk to me.', pause: 220 },
    { text: "So... what's happening?", pause: 200 },
    { text: "What's on your mind?", pause: 220 },
    { text: '', pause: 0 }, // Sometimes just the opener is enough
  ],
  hadHardTime: [
    // After heavy conversation - gentle, not probing
    { text: 'How are you?', pause: 250 },
    { text: "How's it going?", pause: 220 },
    { text: '', pause: 0 }, // Just presence, no question
  ],
  lateNight: [
    // Late night - quiet presence
    { text: "What's on your mind?", pause: 250 },
    { text: '', pause: 0 }, // Just there
    { text: "What's keeping you up?", pause: 250 },
  ],
  returningAfterLongTime: [
    // Been a while - warm acknowledgment
    { text: "It's been a minute.", pause: 220 },
    { text: 'Good to see you.', pause: 200 },
    { text: '', pause: 0 }, // Just recognition
  ],
};

// Relationship-appropriate flavors
const RELATIONSHIP_FLAVORS = {
  stranger: [], // No flavor for new users - keep it simple
  acquaintance: [{ text: 'Perfect timing.', chance: 0.1 }],
  friend: [
    { text: 'Come in, come in.', chance: 0.15 },
    { text: 'I was just thinking about something.', chance: 0.1 },
    { text: 'Perfect timing.', chance: 0.12 },
    { text: '[laughter] Sorry— I was in my head.', chance: 0.08 },
  ],
  trusted_advisor: [
    { text: "I was hoping you'd call.", chance: 0.12 },
    { text: 'I was just thinking about you.', chance: 0.1 },
    { text: 'Perfect timing.', chance: 0.15 },
    { text: '[laughter] Sorry— I was lost in thought.', chance: 0.08 },
  ],
};

/**
 * Get time period from hour
 */
function getTimePeriod(hour: number): keyof typeof TIME_BASED_OPENERS {
  if (hour >= 5 && hour < 8) return 'earlyMorning';
  if (hour >= 8 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'lateNight';
}

/**
 * Select appropriate middle based on context
 */
function selectMiddle(ctx: GreetingContext): { text: string; pause: number } {
  const hour = ctx.hour ?? new Date().getHours();
  const timePeriod = getTimePeriod(hour);

  // Late night - use supportive language
  if (timePeriod === 'lateNight') {
    const middles = EMOTION_MIDDLES.lateNight;
    return middles[Math.floor(Math.random() * middles.length)];
  }

  // If last conversation was emotionally intense (>0.7), be gentle
  if (ctx.lastEmotionIntensity && ctx.lastEmotionIntensity > 0.7) {
    const middles = EMOTION_MIDDLES.hadHardTime;
    return middles[Math.floor(Math.random() * middles.length)];
  }

  // If it's been more than 7 days, acknowledge the gap
  if (ctx.daysSinceLastChat && ctx.daysSinceLastChat > 7) {
    const middles = EMOTION_MIDDLES.returningAfterLongTime;
    return middles[Math.floor(Math.random() * middles.length)];
  }

  // Default - neutral middles
  const middles = EMOTION_MIDDLES.neutral;
  return middles[Math.floor(Math.random() * middles.length)];
}

// Legacy static components for fallback
const FERNI_OPENERS = TIME_BASED_OPENERS.afternoon; // Default to afternoon energy

const FERNI_MIDDLES = EMOTION_MIDDLES.neutral;

const FERNI_FLAVOR = RELATIONSHIP_FLAVORS.friend;

/**
 * Build a CONTEXT-AWARE SSML greeting for Ferni
 *
 * "Better than Human" - We don't just greet randomly.
 *
 * SIMPLICITY PRINCIPLE: Less SSML = more natural.
 * The backchannels work because they're simple. Follow that pattern.
 *
 * KEY INSIGHT: "affectionate" sounds warm and genuine.
 * "happy" sounds forced and performative. We use affectionate as default.
 *
 * Pattern: [settle pause] + [emotion] + opener + [breathing pause] + question + [settling pause]
 *
 * HUMAN-LIKE OPENING: The greeting ends with a natural settling pause -
 * like a friend who asks "how are you?" and then patiently waits,
 * rather than staring expectantly.
 */
function buildDynamicFerniGreeting(ctx?: GreetingContext): string {
  const context = ctx || {};
  const hour = context.hour ?? new Date().getHours();
  const timePeriod = getTimePeriod(hour);
  const relationshipStage = context.relationshipStage || 'friend';

  // Select opener based on time of day
  const openers = TIME_BASED_OPENERS[timePeriod];
  const opener = openers[Math.floor(Math.random() * openers.length)];

  // Select middle based on emotional context
  const middle = selectMiddle(context);

  // Maybe add flavor based on relationship depth
  const flavors = RELATIONSHIP_FLAVORS[relationshipStage] || [];
  const flavor = flavors.find((f) => Math.random() < f.chance);

  // Build with SIMPLE SSML - don't over-engineer!
  let greeting = '';

  // 1. Opening settle pause - SHORTER to match conversational flow
  // FIX: Reduced from 100-300ms to 50-150ms for more natural pacing
  const settleMs = opener.energy === 'calm' ? 150 : opener.energy === 'warm' ? 80 : 50;
  greeting += `<break time="${settleMs}ms"/>`;

  // 2. Emotion tag (simple, at the start)
  // Default to affectionate if no emotion specified (sounds warmer than happy)
  const emotion = opener.emotion || 'affectionate';
  greeting += `<emotion value="${emotion}"/>`;

  // 3. The opener word
  greeting += opener.text;

  // 4. Breathing pause - SHORTER to match conversational flow
  // FIX: Reduced from 300-450ms to 150-250ms for more natural pacing
  const pauseMs = opener.energy === 'calm' ? 250 : opener.energy === 'warm' ? 180 : 150;
  greeting += `<break time="${pauseMs}ms"/>`;

  // Maybe add flavor before the question (only for friends+)
  if (flavor) {
    greeting += `${flavor.text}<break time="180ms"/>`;
  }

  // If we know their name
  if (context.userName && relationshipStage !== 'stranger' && Math.random() < 0.3) {
    greeting += `${context.userName}.<break time="120ms"/>`;
  }

  // Main question/statement
  greeting += middle.text;

  // 5. HUMAN SETTLING PAUSE - gives user breathing room to respond
  // This is the "opening the door and stepping back" moment
  // Like a friend who invites you in and then settles, not hovering
  // Varies slightly to feel natural (not robotic fixed duration)
  const settlingMs = 400 + Math.floor(Math.random() * 200); // 400-600ms
  greeting += `<break time="${settlingMs}ms"/>`;

  return greeting;
}

// ============================================================================
// PERSONA-SPECIFIC DYNAMIC GREETING BUILDERS
// Each persona has their own energy and greeting style
// ============================================================================

/**
 * Alex Chen - Communications Director
 * Energy: Direct, efficient, supportive
 * Style: Gets to the point quickly but warmly
 */
function buildDynamicAlexGreeting(ctx?: GreetingContext): string {
  const context = ctx || {};
  const hour = context.hour ?? new Date().getHours();
  const timePeriod = getTimePeriod(hour);
  const relationshipStage = context.relationshipStage || 'friend';

  const openers = {
    earlyMorning: [
      { text: 'Hey.', emotion: 'affectionate', energy: 'calm' },
      { text: 'Morning.', emotion: null, energy: 'calm' },
    ],
    morning: [
      { text: 'Hey!', emotion: 'happy', energy: 'warm' },
      { text: 'Alex here.', emotion: 'happy', energy: 'warm' },
    ],
    afternoon: [
      { text: 'Hey!', emotion: 'happy', energy: 'warm' },
      { text: 'Oh, hey!', emotion: null, energy: 'warm' },
    ],
    evening: [
      { text: 'Hey.', emotion: 'affectionate', energy: 'calm' },
      { text: "What's up?", emotion: null, energy: 'calm' },
    ],
    lateNight: [
      { text: 'Hey.', emotion: 'affectionate', energy: 'calm' },
      { text: 'Still up?', emotion: null, energy: 'calm' },
    ],
  };

  const middles = {
    neutral: ['Need help with something?', 'What are we working on?', "What's the situation?"],
    hadHardTime: ['How can I help?', "What's going on?"],
    lateNight: ['Working late?', "What's on your mind?"],
    returningAfterLongTime: ['Good to hear from you.', "It's been a while."],
  };

  const opener = openers[timePeriod][Math.floor(Math.random() * openers[timePeriod].length)];
  const middleKey =
    ctx?.lastEmotionIntensity && ctx.lastEmotionIntensity > 0.7
      ? 'hadHardTime'
      : timePeriod === 'lateNight'
        ? 'lateNight'
        : ctx?.daysSinceLastChat && ctx.daysSinceLastChat > 7
          ? 'returningAfterLongTime'
          : 'neutral';
  const middle = middles[middleKey][Math.floor(Math.random() * middles[middleKey].length)];

  // FIX: Reduced pause times to match conversational flow
  const settleMs = opener.energy === 'calm' ? 100 : 50;
  const emotion = opener.emotion || 'affectionate';
  const pauseMs = opener.energy === 'calm' ? 150 : 80;

  let greeting = `<break time="${settleMs}ms"/>`;
  greeting += `<emotion value="${emotion}"/>`;
  greeting += opener.text;
  greeting += `<break time="${pauseMs}ms"/>`;
  if (context.userName && relationshipStage !== 'stranger' && Math.random() < 0.25) {
    greeting += `${context.userName}.<break time="80ms"/>`;
  }
  greeting += middle;

  // Human settling pause - gives user breathing room
  const settlingMs = 350 + Math.floor(Math.random() * 150); // 350-500ms (Alex is direct)
  greeting += `<break time="${settlingMs}ms"/>`;

  return greeting;
}

/**
 * Maya Santos - Habits & Routines Coach
 * Energy: Encouraging, supportive, friendly (NOT breathy/intimate!)
 * Style: Celebrates small wins, upbeat friend energy
 */
function buildDynamicMayaGreeting(ctx?: GreetingContext): string {
  const context = ctx || {};
  const hour = context.hour ?? new Date().getHours();
  const timePeriod = getTimePeriod(hour);
  const relationshipStage = context.relationshipStage || 'friend';

  // NOTE: Maya should sound like an encouraging friend, NOT intimate
  // Use 'friendly', 'happy', 'enthusiastic' - NEVER 'affectionate' or 'warm'
  const openers = {
    earlyMorning: [
      { text: 'Hey, early bird.', emotion: 'friendly', energy: 'calm' },
      { text: 'Good morning!', emotion: 'happy', energy: 'warm' },
    ],
    morning: [
      { text: 'Hey!', emotion: 'happy', energy: 'warm' },
      { text: 'Maya here!', emotion: 'friendly', energy: 'warm' },
    ],
    afternoon: [
      { text: 'Hey!', emotion: 'happy', energy: 'warm' },
      { text: 'Hi!', emotion: 'friendly', energy: 'warm' },
    ],
    evening: [
      { text: 'Hey!', emotion: 'friendly', energy: 'calm' },
      { text: 'Winding down?', emotion: 'friendly', energy: 'calm' },
    ],
    lateNight: [
      { text: 'Hey.', emotion: 'friendly', energy: 'calm' },
      { text: 'Night owl, huh?', emotion: 'friendly', energy: 'calm' },
    ],
  };

  const middles = {
    neutral: ["What's on your mind?", 'How can I help?', 'What are we working on today?'],
    hadHardTime: ['How are you doing?', "Checking in—how's it going?"],
    lateNight: ["Can't sleep?", "What's keeping you up?"],
    returningAfterLongTime: ['Glad you came back!', "I've missed our chats."],
  };

  const opener = openers[timePeriod][Math.floor(Math.random() * openers[timePeriod].length)];
  const middleKey =
    ctx?.lastEmotionIntensity && ctx.lastEmotionIntensity > 0.7
      ? 'hadHardTime'
      : timePeriod === 'lateNight'
        ? 'lateNight'
        : ctx?.daysSinceLastChat && ctx.daysSinceLastChat > 7
          ? 'returningAfterLongTime'
          : 'neutral';
  const middle = middles[middleKey][Math.floor(Math.random() * middles[middleKey].length)];

  // FIX: Reduced pause times to match conversational flow
  const settleMs = opener.energy === 'calm' ? 100 : 50;
  const emotion = opener.emotion || 'friendly';
  const pauseMs = opener.energy === 'calm' ? 150 : 80;

  let greeting = `<break time="${settleMs}ms"/>`;
  greeting += `<emotion value="${emotion}"/>`;
  greeting += opener.text;
  greeting += `<break time="${pauseMs}ms"/>`;
  if (context.userName && relationshipStage !== 'stranger' && Math.random() < 0.3) {
    greeting += `${context.userName}!<break time="50ms"/>`;
  }
  greeting += middle;

  // Human settling pause - Maya is warm but gives space
  const settlingMs = 400 + Math.floor(Math.random() * 150); // 400-550ms
  greeting += `<break time="${settlingMs}ms"/>`;

  return greeting;
}

/**
 * Jordan Taylor - Event Planner
 * Energy: Enthusiastic, energetic, excited
 * Style: Ready to make things happen
 */
function buildDynamicJordanGreeting(ctx?: GreetingContext): string {
  const context = ctx || {};
  const hour = context.hour ?? new Date().getHours();
  const timePeriod = getTimePeriod(hour);
  const relationshipStage = context.relationshipStage || 'friend';

  const openers = {
    earlyMorning: [
      { text: 'Hey!', emotion: 'happy', energy: 'warm' },
      { text: 'Oh!', emotion: 'surprised', energy: 'warm' },
    ],
    morning: [
      { text: 'Hey!', emotion: 'happy', energy: 'energetic' },
      { text: 'Jordan here!', emotion: 'happy', energy: 'energetic' },
    ],
    afternoon: [
      { text: 'Hey!', emotion: 'happy', energy: 'energetic' },
      { text: 'Oh, hey!', emotion: 'surprised', energy: 'energetic' },
    ],
    evening: [
      { text: 'Hey!', emotion: 'happy', energy: 'warm' },
      { text: 'Perfect timing!', emotion: 'happy', energy: 'warm' },
    ],
    lateNight: [
      { text: 'Hey!', emotion: 'affectionate', energy: 'calm' },
      { text: 'Late night planning?', emotion: 'curious', energy: 'calm' },
    ],
  };

  const middles = {
    neutral: ['What are we planning?', "What's happening?", 'Tell me everything!'],
    hadHardTime: ["What's going on?", 'How can I help?'],
    lateNight: ['Big event coming up?', "What's on your mind?"],
    returningAfterLongTime: ['We have so much to catch up on!', 'What have I missed?'],
  };

  const opener = openers[timePeriod][Math.floor(Math.random() * openers[timePeriod].length)];
  const middleKey =
    ctx?.lastEmotionIntensity && ctx.lastEmotionIntensity > 0.7
      ? 'hadHardTime'
      : timePeriod === 'lateNight'
        ? 'lateNight'
        : ctx?.daysSinceLastChat && ctx.daysSinceLastChat > 7
          ? 'returningAfterLongTime'
          : 'neutral';
  const middle = middles[middleKey][Math.floor(Math.random() * middles[middleKey].length)];

  // FIX: Reduced pause times to match conversational flow
  const settleMs = opener.energy === 'calm' ? 100 : 50;
  const emotion = opener.emotion || 'happy';
  const pauseMs = opener.energy === 'calm' ? 150 : 60;

  let greeting = `<break time="${settleMs}ms"/>`;
  greeting += `<emotion value="${emotion}"/>`;
  greeting += opener.text;
  greeting += `<break time="${pauseMs}ms"/>`;
  if (context.userName && relationshipStage !== 'stranger' && Math.random() < 0.35) {
    greeting += `${context.userName}!<break time="50ms"/>`;
  }
  greeting += middle;

  // Human settling pause - Jordan is energetic but still gives space
  const settlingMs = 350 + Math.floor(Math.random() * 150); // 350-500ms (Jordan is quicker)
  greeting += `<break time="${settlingMs}ms"/>`;

  return greeting;
}

/**
 * Peter John - Research Analyst
 * Energy: Thoughtful, curious, intellectual
 * Style: Interested in ideas and exploration
 */
function buildDynamicPeterGreeting(ctx?: GreetingContext): string {
  const context = ctx || {};
  const hour = context.hour ?? new Date().getHours();
  const timePeriod = getTimePeriod(hour);
  const relationshipStage = context.relationshipStage || 'friend';

  const openers = {
    earlyMorning: [
      { text: 'Hey.', emotion: 'curious', energy: 'calm' },
      { text: 'Morning.', emotion: null, energy: 'calm' },
    ],
    morning: [
      { text: 'Hey!', emotion: 'curious', energy: 'warm' },
      { text: 'Peter here.', emotion: 'happy', energy: 'warm' },
    ],
    afternoon: [
      { text: 'Hey!', emotion: 'curious', energy: 'warm' },
      { text: 'Oh, interesting.', emotion: 'curious', energy: 'warm' },
    ],
    evening: [
      { text: 'Hey.', emotion: 'affectionate', energy: 'calm' },
      { text: 'Evening.', emotion: null, energy: 'calm' },
    ],
    lateNight: [
      { text: 'Hey.', emotion: 'curious', energy: 'calm' },
      { text: 'Burning the midnight oil?', emotion: 'curious', energy: 'calm' },
    ],
  };

  const middles = {
    neutral: ['What are you thinking about?', "What's interesting?", "What's on your mind?"],
    hadHardTime: ['How are you doing?', "What's going on?"],
    lateNight: ['Late night research?', 'Something on your mind?'],
    returningAfterLongTime: ['What have you been exploring?', "What's new in your world?"],
  };

  const opener = openers[timePeriod][Math.floor(Math.random() * openers[timePeriod].length)];
  const middleKey =
    ctx?.lastEmotionIntensity && ctx.lastEmotionIntensity > 0.7
      ? 'hadHardTime'
      : timePeriod === 'lateNight'
        ? 'lateNight'
        : ctx?.daysSinceLastChat && ctx.daysSinceLastChat > 7
          ? 'returningAfterLongTime'
          : 'neutral';
  const middle = middles[middleKey][Math.floor(Math.random() * middles[middleKey].length)];

  // FIX: Reduced pause times to match conversational flow
  const settleMs = opener.energy === 'calm' ? 120 : 70;
  const emotion = opener.emotion || 'curious';
  const pauseMs = opener.energy === 'calm' ? 180 : 100;

  let greeting = `<break time="${settleMs}ms"/>`;
  greeting += `<emotion value="${emotion}"/>`;
  greeting += opener.text;
  greeting += `<break time="${pauseMs}ms"/>`;
  if (context.userName && relationshipStage !== 'stranger' && Math.random() < 0.2) {
    greeting += `${context.userName}.<break time="100ms"/>`;
  }
  greeting += middle;

  // Human settling pause - Peter is thoughtful, gives space for reflection
  const settlingMs = 450 + Math.floor(Math.random() * 150); // 450-600ms
  greeting += `<break time="${settlingMs}ms"/>`;

  return greeting;
}

/**
 * Nayan Patel - Wisdom Guide (Premium)
 * Energy: Calm, present, grounded
 * Style: Deep, reflective, philosophical
 */
function buildDynamicNayanGreeting(ctx?: GreetingContext): string {
  const context = ctx || {};
  const hour = context.hour ?? new Date().getHours();
  const timePeriod = getTimePeriod(hour);
  const relationshipStage = context.relationshipStage || 'friend';

  const openers = {
    earlyMorning: [
      { text: '...hey.', emotion: 'affectionate', energy: 'calm' },
      { text: 'Ah. Hello.', emotion: null, energy: 'calm' },
    ],
    morning: [
      { text: 'Hey.', emotion: 'affectionate', energy: 'calm' },
      { text: 'Good morning.', emotion: 'affectionate', energy: 'calm' },
    ],
    afternoon: [
      { text: 'Hey.', emotion: 'affectionate', energy: 'calm' },
      { text: 'Hello, friend.', emotion: 'affectionate', energy: 'calm' },
    ],
    evening: [
      { text: 'Hey.', emotion: 'affectionate', energy: 'calm' },
      { text: '...good evening.', emotion: 'affectionate', energy: 'calm' },
    ],
    lateNight: [
      { text: '...hey.', emotion: 'affectionate', energy: 'calm' },
      { text: 'The quiet hours.', emotion: null, energy: 'calm' },
    ],
  };

  const middles = {
    neutral: ["I'm listening.", 'What brings you?', "What's on your mind?"],
    hadHardTime: ['Sit with me.', "I'm here."],
    lateNight: ["Can't rest?", 'Something weighing on you?'],
    returningAfterLongTime: ['Time passes.', 'Welcome back.'],
  };

  const opener = openers[timePeriod][Math.floor(Math.random() * openers[timePeriod].length)];
  const middleKey =
    ctx?.lastEmotionIntensity && ctx.lastEmotionIntensity > 0.7
      ? 'hadHardTime'
      : timePeriod === 'lateNight'
        ? 'lateNight'
        : ctx?.daysSinceLastChat && ctx.daysSinceLastChat > 7
          ? 'returningAfterLongTime'
          : 'neutral';
  const middle = middles[middleKey][Math.floor(Math.random() * middles[middleKey].length)];

  // FIX: Reduced pause times to match conversational flow
  // Nayan is still contemplative but not excessively slow
  const settleMs = 180; // Still a contemplative pause, but shorter
  const emotion = opener.emotion || 'affectionate';
  const pauseMs = 250; // Still longer than others for Nayan's calm presence

  let greeting = `<break time="${settleMs}ms"/>`;
  greeting += `<emotion value="${emotion}"/>`;
  greeting += opener.text;
  greeting += `<break time="${pauseMs}ms"/>`;
  if (context.userName && relationshipStage === 'trusted_advisor' && Math.random() < 0.2) {
    greeting += `${context.userName}.<break time="150ms"/>`;
  }
  greeting += middle;

  // Human settling pause - Nayan creates the most spacious opening
  // Like a wise friend who welcomes you and then settles into presence
  const settlingMs = 600 + Math.floor(Math.random() * 200); // 600-800ms (most patient)
  greeting += `<break time="${settlingMs}ms"/>`;

  return greeting;
}

/**
 * Generate a context-aware greeting.
 * This is the "Better than Human" approach - greetings that feel emotionally attuned.
 *
 * @param personaId - The persona generating the greeting
 * @param ctx - Context about the user and timing
 */
export function generateContextAwareGreeting(personaId: string, ctx: GreetingContext): string {
  switch (personaId) {
    case 'ferni':
      return buildDynamicFerniGreeting(ctx);
    case 'alex-chen':
      return buildDynamicAlexGreeting(ctx);
    case 'maya-santos':
      return buildDynamicMayaGreeting(ctx);
    case 'jordan-taylor':
      return buildDynamicJordanGreeting(ctx);
    case 'peter-john':
      return buildDynamicPeterGreeting(ctx);
    case 'nayan-patel':
      return buildDynamicNayanGreeting(ctx);
    default:
      // For unknown personas, fall back to static list
      const greetings = INSTANT_GREETINGS[personaId] || DEFAULT_GREETINGS;
      return greetings[Math.floor(Math.random() * greetings.length)];
  }
}

// ============================================================================
// PERSONA-SPECIFIC INSTANT GREETINGS (Fallback static list)
// ============================================================================

// IMPORTANT: These should feel like FERNI - warm, present, NOT peppy
// SIMPLICITY: The backchannels work because they're SIMPLE. Follow that pattern.
// KEY: Use "affectionate" (warm) instead of "happy" (forced). No exclamation points with warm emotions.
// Pattern: [settle pause] + emotion + opener + [breathing pause] + question
// FIX: Reduced break times across all greetings to match conversational flow
const INSTANT_GREETINGS: Record<string, string[]> = {
  ferni: [
    // Simple, clean SSML - affectionate = warm, curious = interested
    '<break time="80ms"/><emotion value="affectionate"/>Hey.<break time="180ms"/>What\'s going on?',
    '<emotion value="surprised"/>Oh, hey.<break time="150ms"/>What\'s up?',
    '<break time="80ms"/><emotion value="affectionate"/>Hey.<break time="200ms"/>Talk to me.',
    '<break time="100ms"/><emotion value="affectionate"/>Hey.<break time="220ms"/>What\'s happening?',
    '<break time="80ms"/><emotion value="curious"/>Hey.<break time="180ms"/>What\'s on your mind?',
  ],
  'alex-chen': [
    '<emotion value="happy"/>Hey!<break time="60ms"/>Alex here.<break time="80ms"/>What\'s up?',
    'Oh hey!<break time="60ms"/>It\'s Alex.<break time="80ms"/>What\'s going on?',
    '<emotion value="happy"/>Alex here!<break time="80ms"/>Talk to me.',
  ],
  'maya-santos': [
    '<emotion value="happy"/>Hey!<break time="60ms"/>Maya here.<break time="80ms"/>What\'s going on?',
    '<emotion value="friendly"/>Hi!<break time="60ms"/>It\'s Maya.<break time="80ms"/>How are you?',
    '<emotion value="friendly"/>Maya here.<break time="80ms"/>What\'s on your mind?',
  ],
  'jordan-taylor': [
    '<emotion value="surprised"/>Oh!<break time="50ms"/>Hey!<break time="60ms"/>What are we planning?',
    '<emotion value="happy"/>Hey!<break time="60ms"/>It\'s Jordan!<break time="80ms"/>What\'s happening?',
    '<emotion value="happy"/>Jordan here!<break time="60ms"/>Tell me everything!',
  ],
  'peter-john': [
    '<emotion value="curious"/>Hey!<break time="60ms"/>Peter here.<break time="100ms"/>What are you thinking about?',
    '<emotion value="happy"/>Hey!<break time="60ms"/>Peter here.<break time="100ms"/>What\'s interesting?',
    '<emotion value="curious"/>Hey!<break time="100ms"/>What\'s on your mind?',
  ],
  'nayan-patel': [
    '<emotion value="affectionate"/>Hey.<break time="120ms"/>Nayan here.<break time="100ms"/>I\'m listening.',
    '<emotion value="affectionate"/>Hello, friend.<break time="120ms"/>What brings you?',
    '<emotion value="affectionate"/>Hey.<break time="120ms"/>What\'s on your mind?',
  ],
};

// Simple defaults - let Cartesia do the work
// Use "affectionate" for warmth, not "happy" (sounds forced)
// FIX: Reduced break times to match conversational flow
const DEFAULT_GREETINGS = [
  '<break time="80ms"/><emotion value="affectionate"/>Hey.<break time="180ms"/>What\'s going on?',
  '<break time="80ms"/><emotion value="affectionate"/>Hey there.<break time="180ms"/>What\'s up?',
  '<break time="100ms"/><emotion value="affectionate"/>Hey.<break time="200ms"/>Talk to me.',
];

// ============================================================================
// GREETING GENERATION
// ============================================================================

/**
 * Generate an instant greeting for a persona.
 * This is called during prewarm to have a greeting ready immediately.
 *
 * For Ferni: Uses CONTEXT-AWARE dynamic SSML builder
 * For others: Uses persona-specific static greetings with SSML
 *
 * @param personaId - The persona generating the greeting
 * @param ctx - Optional context for "Better than Human" greetings
 */
export function generateWarmGreeting(personaId: string, ctx?: GreetingContext): string {
  // For Ferni, ALWAYS use context-aware builder (Better than Human)
  if (personaId === 'ferni') {
    return buildDynamicFerniGreeting(ctx);
  }

  // Fall back to static list for other personas (with SSML)
  const greetings = INSTANT_GREETINGS[personaId] || DEFAULT_GREETINGS;
  const index = Math.floor(Math.random() * greetings.length);
  return greetings[index];
}

/**
 * Pre-warm a greeting during agent initialization.
 * Call this during prewarm to have instant first response.
 */
export function prewarmGreeting(personaId: string): void {
  const greeting = generateWarmGreeting(personaId);

  warmGreetingCache = {
    greeting,
    personaId,
    generatedAt: Date.now(),
    isGeneric: true,
  };

  _log('debug', 'Prewarmed greeting', { personaId, greeting: greeting.slice(0, 30) });
}

/**
 * Get the prewarmed greeting if available.
 * Returns null if no greeting is prewarmed or it's stale (>5 min old).
 */
export function getWarmGreeting(personaId?: string): string | null {
  if (!warmGreetingCache) return null;

  // Check if greeting is stale (older than 5 minutes)
  const age = Date.now() - warmGreetingCache.generatedAt;
  if (age > 5 * 60 * 1000) {
    _log('debug', 'Warm greeting expired');
    warmGreetingCache = null;
    return null;
  }

  // If personaId provided, check it matches
  if (personaId && warmGreetingCache.personaId !== personaId) {
    _log('debug', 'Warm greeting persona mismatch', {
      cached: warmGreetingCache.personaId,
      requested: personaId,
    });
    return null;
  }

  return warmGreetingCache.greeting;
}

/**
 * Clear the warm greeting cache.
 * Call this after the personalized greeting has been generated.
 */
export function clearWarmGreeting(): void {
  warmGreetingCache = null;
}

/**
 * Check if we have a valid warm greeting.
 */
export function hasWarmGreeting(personaId?: string): boolean {
  return getWarmGreeting(personaId) !== null;
}

// ============================================================================
// BATCH PREWARM (for all personas at once)
// ============================================================================

/** Cache for all persona greetings */
const allPersonaGreetingsCache = new Map<string, string>();

/**
 * Pre-warm greetings for all personas during worker startup.
 * This ensures instant greetings are ready for ANY persona the user might talk to.
 *
 * Called from warmup.ts during GCE worker initialization.
 */
export function prewarmGreetingsForAllPersonas(): void {
  const personas = [
    'ferni',
    'maya-santos',
    'peter-john',
    'alex-chen',
    'jordan-taylor',
    'nayan-patel',
  ];

  for (const personaId of personas) {
    const greeting = generateWarmGreeting(personaId);
    allPersonaGreetingsCache.set(personaId, greeting);
    _log('debug', 'Pre-cached greeting for persona', {
      personaId,
      greeting: greeting.slice(0, 30),
    });
  }

  // Also set the single cache for the most common persona (Ferni)
  prewarmGreeting('ferni');

  _log('info', 'All persona greetings pre-cached', { count: personas.length });
}

/**
 * Get pre-cached greeting for any persona (from batch prewarm).
 * Falls back to generating if not cached.
 */
export function getPrewarmedGreetingForPersona(personaId: string): string {
  const cached = allPersonaGreetingsCache.get(personaId);
  if (cached) {
    return cached;
  }
  // Fallback: generate on demand
  return generateWarmGreeting(personaId);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateWarmGreeting,
  generateContextAwareGreeting,
  prewarmGreeting,
  prewarmGreetingsForAllPersonas,
  getWarmGreeting,
  getPrewarmedGreetingForPersona,
  clearWarmGreeting,
  hasWarmGreeting,
};

// Note: GreetingContext is already exported as an interface above
