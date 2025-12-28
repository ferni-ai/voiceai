/**
 * Semantic Message System
 *
 * A "Better Than Human" approach to message generation that combines:
 * - Semantic intent classification (understanding what they MEAN)
 * - Rich component library (human-feeling phrases)
 * - Relationship memory (how YOU talk to THIS person)
 * - Contextual awareness (time, season, recent events)
 * - User style learning (your unique voice)
 *
 * Philosophy: Every message should sound like it came from the actual person,
 * not from an AI. We learn how you communicate with each relationship and
 * mirror that warmth.
 *
 * @module services/outreach/semantic-message-system
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { RelationshipStage } from './persona-voice-generator.js';

const log = getLogger().child({ service: 'semantic-message-system' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Semantic intent - what the user actually wants to communicate
 */
export type MessageIntent =
  | 'morning_greeting' // "say good morning"
  | 'evening_greeting' // "say goodnight"
  | 'general_greeting' // "say hi", "say hello"
  | 'express_love' // "tell her I love her"
  | 'express_missing' // "tell her I miss her"
  | 'thinking_of_you' // "just thinking of you"
  | 'check_in' // "check in on her", "see how she's doing"
  | 'birthday_wish' // "wish happy birthday"
  | 'congratulations' // "congratulate her"
  | 'sympathy' // "send condolences", "I'm sorry about..."
  | 'encouragement' // "tell her she's got this"
  | 'gratitude' // "thank her for..."
  | 'apology' // "tell her I'm sorry"
  | 'good_news' // "tell her about my promotion"
  | 'just_because' // no specific reason, just reaching out
  | 'custom'; // LLM fallback for complex messages

/**
 * Time context for messages
 */
export interface TimeContext {
  timeOfDay: 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'night' | 'late_night';
  dayOfWeek: string;
  isWeekend: boolean;
  season: 'spring' | 'summer' | 'fall' | 'winter';
  isHolidaySeason: boolean; // Thanksgiving through New Year
  specialDay?: string; // "Mother's Day", "Christmas", etc.
}

/**
 * Relationship context - who is this person to the user?
 */
export interface RelationshipContext {
  contactName: string;
  relationship: string; // "mother", "best friend", "sister"
  stage: RelationshipStage;
  nickname?: string; // "Mom", "Mama", "Ma"

  // Learned preferences
  preferredGreeting?: string; // How user usually greets them
  preferredClosing?: string; // How user usually signs off
  typicalTone?: 'casual' | 'warm' | 'playful' | 'formal';
  usesTermsOfEndearment?: boolean;
  typicalMessageLength?: 'brief' | 'medium' | 'long';
}

/**
 * User's communication style with this person
 * (learned over time)
 */
export interface CommunicationStyle {
  userId: string;
  contactId?: string;

  // Patterns learned from past messages
  greetingPatterns: string[]; // "Hey Mom", "Hi Mama"
  closingPatterns: string[]; // "Love you", "Talk soon"
  fillerWords: string[]; // "anyway", "so yeah", "um"
  expressionStyle: 'direct' | 'storytelling' | 'emotional' | 'casual';

  // Emotional patterns
  usesEmoji: boolean;
  endearments: string[]; // "sweetie", "hon"
  petNames: string[]; // Custom names for this person

  // Timing patterns
  typicalCallTimes: string[]; // When they usually reach out
  preferredDuration: 'quick' | 'medium' | 'long';
}

/**
 * Memory context - what do we know about recent life?
 */
export interface MemoryContext {
  // Recent conversation topics
  recentTopics?: string[];

  // Life events
  recentWins?: string[];
  currentStruggles?: string[];
  upcomingEvents?: string[];

  // Relationship-specific
  lastContactDate?: Date;
  lastConversationSummary?: string;
  unfinishedThreads?: string[]; // Topics to follow up on

  // Commitments
  promisesMade?: string[]; // Things user promised this person
  promisesReceived?: string[]; // Things this person promised user
}

/**
 * Full context for message generation
 */
export interface SemanticMessageContext {
  // What they want to say
  originalRequest: string;
  intent: MessageIntent;

  // Who's involved
  sender: {
    userId: string;
    userName: string;
    preferredName?: string;
  };
  recipient: RelationshipContext;

  // Context
  time: TimeContext;
  memory?: MemoryContext;
  communicationStyle?: CommunicationStyle;

  // Settings
  isVoicemail: boolean;
  targetLength?: 'brief' | 'medium' | 'long';
}

/**
 * Generated message with components
 */
export interface SemanticMessage {
  // The full assembled message
  message: string;

  // With SSML pauses
  ssmlMessage: string;

  // Component breakdown (for debugging/tuning)
  components: {
    opening: string;
    transition?: string;
    mainMessage: string;
    personalTouch?: string;
    close: string;
  };

  // Metadata
  metadata: {
    intent: MessageIntent;
    relationshipStage: RelationshipStage;
    generationType: 'semantic' | 'llm' | 'hybrid';
    componentsUsed: string[];
  };
}

// ============================================================================
// INTENT CLASSIFICATION
// ============================================================================

interface IntentPattern {
  intent: MessageIntent;
  patterns: RegExp[];
  keywords: string[];
  priority: number; // Higher = checked first
}

const INTENT_PATTERNS: IntentPattern[] = [
  // High priority - specific intents
  {
    intent: 'birthday_wish',
    patterns: [/happy\s*birthday/i, /birthday\s*(wish|greeting)/i],
    keywords: ['birthday', 'bday'],
    priority: 100,
  },
  {
    intent: 'sympathy',
    patterns: [/sorry\s*(for|about)\s*(your|the|their)\s*(loss|passing)/i, /condolences/i],
    keywords: ['condolences', 'sorry for your loss', 'sympathy'],
    priority: 100,
  },
  {
    intent: 'congratulations',
    patterns: [/congratulat/i, /congrats/i, /proud\s*of\s*(you|them|her|him)/i],
    keywords: ['congratulations', 'congrats', 'proud of'],
    priority: 90,
  },

  // Morning/Evening greetings
  {
    intent: 'morning_greeting',
    patterns: [/good\s*morning/i, /^(say|wish)\s*(her|him|them)?\s*(a\s*)?(good\s*)?morning/i],
    keywords: ['morning', 'wake up'],
    priority: 80,
  },
  {
    intent: 'evening_greeting',
    patterns: [
      /good\s*night/i,
      /^(say|wish)\s*(her|him|them)?\s*(a\s*)?(good\s*)?night/i,
      /sleep\s*well/i,
    ],
    keywords: ['goodnight', 'night', 'sleep'],
    priority: 80,
  },

  // Emotional expressions
  {
    intent: 'express_love',
    patterns: [
      /^(say|tell)\s*(that\s*)?(i\s*)?love\s*(you|her|him|them)/i,
      /i\s*love\s*(you|her|him|them)/i,
    ],
    keywords: ['love you', 'love her', 'love him'],
    priority: 75,
  },
  {
    intent: 'express_missing',
    patterns: [
      /^(say|tell)\s*(that\s*)?(i\s*)?miss\s*(you|her|him|them)/i,
      /miss\s*(you|her|him|them)/i,
    ],
    keywords: ['miss you', 'miss her', 'missing'],
    priority: 75,
  },
  {
    intent: 'thinking_of_you',
    patterns: [
      /thinking\s*(of|about)\s*(you|her|him|them)/i,
      /on\s*my\s*mind/i,
      /thought\s*of\s*(you|her|him)/i,
    ],
    keywords: ['thinking of', 'on my mind'],
    priority: 70,
  },

  // Check-ins
  {
    intent: 'check_in',
    patterns: [
      /check\s*(in|on)/i,
      /see\s*how\s*(you|she|he|they)'?(re|s)?\s*(doing)?/i,
      /how\s*(are|is)\s*(you|she|he)/i,
    ],
    keywords: ['check in', 'how are you', 'see how'],
    priority: 65,
  },

  // Support messages
  {
    intent: 'encouragement',
    patterns: [
      /(you|she|he)\s*(got|can\s*do)\s*this/i,
      /believe\s*in\s*(you|her|him)/i,
      /rooting\s*for/i,
    ],
    keywords: ['got this', 'believe in', 'you can do it', 'rooting for'],
    priority: 60,
  },
  {
    intent: 'gratitude',
    patterns: [/thank\s*(you|her|him|them)/i, /grateful/i, /appreciate/i],
    keywords: ['thank', 'grateful', 'appreciate'],
    priority: 60,
  },
  {
    intent: 'apology',
    patterns: [/^(say\s*)?(i'?m\s*)?sorry/i, /apologize/i],
    keywords: ['sorry', 'apologize', 'apology'],
    priority: 60,
  },

  // News/updates
  {
    intent: 'good_news',
    patterns: [
      /tell\s*(her|him|them)\s*about/i,
      /share\s*(the\s*)?(news|good\s*news)/i,
      /got\s*(the|a)\s*(job|promotion|offer)/i,
    ],
    keywords: ['good news', 'exciting news', 'tell about'],
    priority: 55,
  },

  // General greetings (lower priority)
  {
    intent: 'general_greeting',
    patterns: [/^(say|tell)\s*(her|him|them)?\s*(hi|hello|hey)/i, /^(hi|hello|hey)$/i],
    keywords: ['hi', 'hello', 'hey'],
    priority: 40,
  },

  // Catch-all
  {
    intent: 'just_because',
    patterns: [/just\s*(wanted\s*to\s*)?(call|reach\s*out|say)/i, /no\s*reason/i],
    keywords: ['just because', 'no reason', 'just wanted'],
    priority: 20,
  },
];

/**
 * Classify the intent of a message request
 */
export function classifyIntent(request: string): MessageIntent {
  const normalized = request.toLowerCase().trim();

  // Sort patterns by priority (highest first)
  const sortedPatterns = [...INTENT_PATTERNS].sort((a, b) => b.priority - a.priority);

  for (const { intent, patterns, keywords } of sortedPatterns) {
    // Check regex patterns
    for (const pattern of patterns) {
      if (pattern.test(normalized)) {
        log.debug({ request, intent, matchType: 'pattern' }, 'Intent classified');
        return intent;
      }
    }

    // Check keywords
    for (const keyword of keywords) {
      if (normalized.includes(keyword.toLowerCase())) {
        log.debug({ request, intent, matchType: 'keyword' }, 'Intent classified');
        return intent;
      }
    }
  }

  // Default to custom (will use LLM)
  log.debug({ request, intent: 'custom' }, 'No pattern match, using custom intent');
  return 'custom';
}

// ============================================================================
// TIME CONTEXT
// ============================================================================

/**
 * Get current time context for message personalization
 */
export function getTimeContext(): TimeContext {
  const now = new Date();
  const hour = now.getHours();
  const month = now.getMonth();
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;

  // Time of day
  let timeOfDay: TimeContext['timeOfDay'];
  if (hour >= 5 && hour < 9) timeOfDay = 'early_morning';
  else if (hour >= 9 && hour < 12) timeOfDay = 'morning';
  else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
  else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
  else if (hour >= 21 && hour < 24) timeOfDay = 'night';
  else timeOfDay = 'late_night';

  // Season (Northern Hemisphere)
  let season: TimeContext['season'];
  if (month >= 2 && month <= 4) season = 'spring';
  else if (month >= 5 && month <= 7) season = 'summer';
  else if (month >= 8 && month <= 10) season = 'fall';
  else season = 'winter';

  // Holiday season (Thanksgiving through New Year)
  const isHolidaySeason = month === 10 || month === 11 || (month === 0 && now.getDate() <= 7);

  // Special days (simplified - could be expanded)
  let specialDay: string | undefined;
  const dayMonth = `${now.getMonth() + 1}-${now.getDate()}`;
  const specialDays: Record<string, string> = {
    '12-25': 'Christmas',
    '12-24': 'Christmas Eve',
    '1-1': "New Year's Day",
    '2-14': "Valentine's Day",
    '7-4': 'Independence Day',
  };
  specialDay = specialDays[dayMonth];

  return {
    timeOfDay,
    dayOfWeek,
    isWeekend,
    season,
    isHolidaySeason,
    specialDay,
  };
}

// ============================================================================
// COMPONENT LIBRARY
// ============================================================================

/**
 * Opening phrases by relationship depth
 */
const OPENINGS: Record<RelationshipStage, Record<string, string[]>> = {
  deep: {
    default: ['Hey {name}.', "Hey {name}, it's me.", '{name}!', 'Hi {name}.'],
    morning: ['Morning, {name}.', 'Hey {name}... morning.', 'Good morning, {name}.'],
    evening: ['Hey {name}.', 'Hi {name}... just calling before bed.'],
    casual: ['Hey.', "Hey, it's me.", '{name}.'],
  },
  established: {
    default: ['Hey {name}!', 'Hi {name}!', "{name}! It's {sender}."],
    morning: ['Good morning, {name}!', 'Morning, {name}!'],
    evening: ['Hey {name}!', 'Good evening, {name}.'],
  },
  building: {
    default: ["Hey {name}, it's {sender}.", "Hi {name}! It's {sender}."],
    morning: ["Good morning, {name}! It's {sender}."],
    evening: ["Hi {name}, it's {sender}."],
  },
  new: {
    default: ['Hi {name}, this is {sender}.', "Hello {name}, it's {sender}."],
    morning: ['Good morning, {name}. This is {sender}.'],
    evening: ['Good evening, {name}. This is {sender}.'],
  },
};

/**
 * Transition phrases - connecting opening to main message
 */
const TRANSITIONS: Record<string, string[]> = {
  thinking_of_you: [
    'Just thinking about you.',
    "You've been on my mind.",
    'Was just thinking of you.',
    'You crossed my mind.',
  ],
  check_in: [
    'Just wanted to check in.',
    "Wanted to see how you're doing.",
    'Just calling to check on you.',
  ],
  reaching_out: [
    'Just wanted to reach out.',
    'Wanted to give you a call.',
    "Just had a minute and thought I'd call.",
  ],
  no_reason: ['No real reason for calling.', 'Nothing specific, just...', 'No agenda or anything.'],
};

/**
 * Main message content by intent
 */
const MAIN_MESSAGES: Record<MessageIntent, Record<RelationshipStage, string[]>> = {
  morning_greeting: {
    deep: [
      'Hope you slept well. Just wanted to start your day with some love.',
      "Wanted to catch you before the day gets crazy. Hope it's a good one.",
      "Just wanted to say good morning and let you know I'm thinking of you.",
      'Starting my day thinking about you. Hope yours is wonderful.',
    ],
    established: [
      'Hope you have a great day today.',
      'Just wanted to wish you a good morning.',
      'Hope your day is off to a good start.',
    ],
    building: ['Hope you have a wonderful day.', 'Wishing you a great morning.'],
    new: ['I hope you have a pleasant day.', 'Wishing you a good morning.'],
  },

  evening_greeting: {
    deep: [
      'Just wanted to say goodnight. Sweet dreams.',
      'Hope you had a good day. Sleep well, I love you.',
      'Winding down and thinking of you. Goodnight.',
    ],
    established: [
      'Hope you had a good day. Goodnight!',
      'Just wanted to say goodnight. Sleep well!',
    ],
    building: ['Hope you had a nice day. Goodnight.'],
    new: ['I hope you have a restful night.'],
  },

  general_greeting: {
    deep: [
      'Just wanted to say hi. Miss your voice.',
      'Hey... just felt like calling. How are you?',
      'No reason really... just wanted to hear from you.',
    ],
    established: [
      'Just wanted to say hi! How are things?',
      "Hey! Just checking in. How's everything?",
    ],
    building: ["Just wanted to say hello and see how you're doing."],
    new: ['Just wanted to reach out and say hello.'],
  },

  express_love: {
    deep: [
      'I love you. Just needed you to know that.',
      "I love you so much. That's it. That's the whole message.",
      'Just calling to say I love you. Always.',
    ],
    established: [
      'Just wanted you to know how much I care about you.',
      'You mean so much to me. Just wanted to say that.',
    ],
    building: ['I really appreciate you. Just wanted you to know.'],
    new: ['I wanted to let you know how much I value our connection.'],
  },

  express_missing: {
    deep: [
      'I miss you. A lot. Just needed you to know.',
      'Missing you today. Wish I could see you.',
      "I miss you. Can't wait until we can talk or see each other.",
    ],
    established: [
      "I've been missing you! We need to catch up soon.",
      "Missing you! It's been too long.",
    ],
    building: ["I've been thinking about you. We should connect soon."],
    new: ['It would be nice to catch up sometime.'],
  },

  thinking_of_you: {
    deep: [
      "You've been on my mind all day. Just had to call.",
      "Couldn't stop thinking about you. Wanted you to know.",
      'Something made me think of you, and I just had to reach out.',
    ],
    established: [
      'You popped into my head and I wanted to say hi.',
      'Been thinking about you. Hope all is well!',
    ],
    building: ['You came to mind and I wanted to reach out.'],
    new: ['I was thinking of you and wanted to check in.'],
  },

  check_in: {
    deep: [
      'How are you doing? Really. I want to know.',
      'Just checking on you. How are you holding up?',
      "Wanted to make sure you're okay. How are things?",
    ],
    established: [
      "How's everything going? Fill me in!",
      "What's new with you? I want to hear everything.",
    ],
    building: ['How have you been? Would love to catch up.'],
    new: ["I wanted to check in and see how you're doing."],
  },

  birthday_wish: {
    deep: [
      "Happy birthday! I can't believe another year has gone by. I love you so much.",
      'Happy birthday! You deserve the best day ever. I love you.',
    ],
    established: [
      'Happy birthday! Hope you have an amazing day!',
      'Happy birthday! Wishing you the best year yet!',
    ],
    building: ["Happy birthday! Hope it's a great one!"],
    new: ['Happy birthday! Wishing you a wonderful day.'],
  },

  congratulations: {
    deep: [
      'I am so incredibly proud of you. You did it!',
      "This is amazing! I knew you could do it. I'm so proud.",
    ],
    established: [
      'Congratulations! You should be so proud of yourself!',
      'This is so exciting! Congratulations!',
    ],
    building: ["Congratulations! That's wonderful news!"],
    new: ['Congratulations on your achievement.'],
  },

  sympathy: {
    deep: [
      "I'm so sorry. I'm here for you, whatever you need.",
      'My heart is with you. I love you.',
    ],
    established: ["I'm so sorry for what you're going through. I'm here if you need anything."],
    building: ["I'm so sorry to hear about this. Please let me know if there's anything I can do."],
    new: ["I'm very sorry for your loss. My thoughts are with you."],
  },

  encouragement: {
    deep: [
      "You've got this. I believe in you with everything I have.",
      "I know you can do this. I'm in your corner, always.",
    ],
    established: ["You've got this! I'm rooting for you!", 'I believe in you! You can do this!'],
    building: ['I believe in you. You can do this.'],
    new: ["Wishing you the best. I know you'll do great."],
  },

  gratitude: {
    deep: [
      "Thank you. For everything. I don't say it enough.",
      "I'm so grateful for you. Thank you for being you.",
    ],
    established: [
      'Thank you so much! I really appreciate it!',
      'I wanted to say thank you. It means so much.',
    ],
    building: ['Thank you. I really appreciate it.'],
    new: ['Thank you very much. I appreciate your help.'],
  },

  apology: {
    deep: [
      "I'm sorry. I really am. I didn't mean to hurt you.",
      "I messed up and I'm sorry. You deserve better.",
    ],
    established: [
      "I'm sorry about what happened. I feel terrible.",
      "I wanted to apologize. I'm really sorry.",
    ],
    building: ["I owe you an apology. I'm sorry."],
    new: ['I wanted to apologize for the misunderstanding.'],
  },

  good_news: {
    deep: [
      "I have news and you're the first person I wanted to tell!",
      'Something happened and I had to tell you right away!',
    ],
    established: [
      'I have some exciting news to share!',
      "Guess what happened! I couldn't wait to tell you!",
    ],
    building: ['I wanted to share some good news with you.'],
    new: ['I have some news I wanted to share.'],
  },

  just_because: {
    deep: [
      'No real reason for calling. Just wanted to hear your voice.',
      "I don't have anything specific to say. Just... thinking about you.",
    ],
    established: ['Just calling to say hi! No agenda, just wanted to chat.'],
    building: ["Just thought I'd reach out and see how things are going."],
    new: ['I wanted to reach out and connect.'],
  },

  custom: {
    deep: [''],
    established: [''],
    building: [''],
    new: [''],
  },
};

/**
 * Closing phrases by relationship depth
 */
const CLOSINGS: Record<RelationshipStage, Record<string, string[]>> = {
  deep: {
    default: [
      'Love you.',
      'Love you. Bye.',
      'I love you. Talk soon.',
      'Love you. Call me back when you can.',
    ],
    voicemail: [
      'Love you. No need to call back.',
      'Anyway, love you. Talk whenever.',
      "That's it. Love you.",
    ],
    casual: ["Okay, that's it. Love you.", 'Anyway. Love you.', 'Bye. Love you.'],
  },
  established: {
    default: ['Talk soon!', "Can't wait to catch up!", "Let me know when you're free!"],
    voicemail: ['No need to call back. Just wanted you to know.', 'Talk whenever! No rush.'],
  },
  building: {
    default: ['Talk soon.', 'Hope to hear from you.', 'Take care!'],
    voicemail: ['Feel free to call me back when you have time.'],
  },
  new: {
    default: ['Take care.', 'Talk soon.', 'Have a great day.'],
    voicemail: ['Feel free to return my call at your convenience.'],
  },
};

/**
 * Personal touch phrases - add warmth based on context
 */
const PERSONAL_TOUCHES: Record<string, string[]> = {
  weekend: ["Hope you're having a relaxing weekend.", 'Enjoy your weekend!'],
  holiday_season: [
    "Hope you're enjoying the holiday season.",
    'This time of year always makes me think of you.',
  ],
  long_time: ["I know it's been a while...", "It's been too long."],
  recent_struggle: [
    'I know things have been hard lately.',
    "I've been thinking about what you're going through.",
  ],
  recent_win: ['Still thinking about your good news!', 'Still so happy for you about...'],
};

// ============================================================================
// MESSAGE ASSEMBLY
// ============================================================================

/**
 * Select a random item from an array
 */
function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Fill in template placeholders
 */
function fillTemplate(template: string, context: SemanticMessageContext): string {
  return template
    .replace(/\{name\}/g, context.recipient.nickname || context.recipient.contactName)
    .replace(/\{sender\}/g, context.sender.preferredName || context.sender.userName)
    .replace(/\{timeOfDay\}/g, context.time.timeOfDay.replace('_', ' '));
}

/**
 * Get opening phrase based on context
 */
function getOpening(context: SemanticMessageContext): string {
  const { recipient, time, communicationStyle } = context;
  const stage = recipient.stage;

  // If we have learned their preferred greeting, use it sometimes
  if (communicationStyle?.greetingPatterns?.length && Math.random() > 0.3) {
    return randomChoice(communicationStyle.greetingPatterns);
  }

  // Select opening category based on time
  let category = 'default';
  if (time.timeOfDay === 'early_morning' || time.timeOfDay === 'morning') {
    category = 'morning';
  } else if (time.timeOfDay === 'evening' || time.timeOfDay === 'night') {
    category = 'evening';
  }

  // For deep relationships, sometimes use casual
  if (stage === 'deep' && Math.random() > 0.7) {
    category = 'casual';
  }

  const openings = OPENINGS[stage][category] || OPENINGS[stage]['default'];
  return fillTemplate(randomChoice(openings), context);
}

/**
 * Get transition phrase if appropriate
 */
function getTransition(context: SemanticMessageContext): string | undefined {
  const { intent } = context;

  // Not all messages need transitions
  if (Math.random() < 0.3) return undefined;

  // Map intents to transition categories
  const transitionMap: Partial<Record<MessageIntent, string>> = {
    thinking_of_you: 'thinking_of_you',
    check_in: 'check_in',
    just_because: 'no_reason',
    general_greeting: 'reaching_out',
  };

  const category = transitionMap[intent];
  if (!category) return undefined;

  return randomChoice(TRANSITIONS[category]);
}

/**
 * Get main message content
 */
function getMainMessage(context: SemanticMessageContext): string {
  const { intent, recipient } = context;
  const stage = recipient.stage;

  const messages = MAIN_MESSAGES[intent]?.[stage];
  if (!messages?.length || messages[0] === '') {
    // Fallback for custom intent - will need LLM
    return context.originalRequest;
  }

  return fillTemplate(randomChoice(messages), context);
}

/**
 * Get personal touch based on context
 */
function getPersonalTouch(context: SemanticMessageContext): string | undefined {
  const { time, memory, recipient } = context;

  // Only add personal touches sometimes
  if (Math.random() < 0.5) return undefined;

  // Check for contextual touches
  if (time.isWeekend && Math.random() > 0.5) {
    return randomChoice(PERSONAL_TOUCHES.weekend);
  }

  if (time.isHolidaySeason && Math.random() > 0.5) {
    return randomChoice(PERSONAL_TOUCHES.holiday_season);
  }

  if (memory?.lastContactDate) {
    const daysSince = Math.floor(
      (Date.now() - memory.lastContactDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSince > 14 && Math.random() > 0.5) {
      return randomChoice(PERSONAL_TOUCHES.long_time);
    }
  }

  if (memory?.currentStruggles?.length && Math.random() > 0.6) {
    return randomChoice(PERSONAL_TOUCHES.recent_struggle);
  }

  if (memory?.recentWins?.length && Math.random() > 0.6) {
    return randomChoice(PERSONAL_TOUCHES.recent_win);
  }

  return undefined;
}

/**
 * Get closing phrase
 */
function getClosing(context: SemanticMessageContext): string {
  const { recipient, isVoicemail, communicationStyle } = context;
  const stage = recipient.stage;

  // If we have learned their preferred closing, use it sometimes
  if (communicationStyle?.closingPatterns?.length && Math.random() > 0.3) {
    return randomChoice(communicationStyle.closingPatterns);
  }

  const category = isVoicemail ? 'voicemail' : 'default';
  const closings = CLOSINGS[stage][category] || CLOSINGS[stage]['default'];

  return fillTemplate(randomChoice(closings), context);
}

/**
 * Add natural pauses to message
 */
function addPauses(message: string): string {
  // Add pause after opening
  message = message.replace(/^([^.!?]+[.!?])\s+/, '$1... ');

  // Add occasional pauses mid-message (30% chance at sentence boundaries)
  message = message.replace(/([.!?])\s+(?=[A-Z])/g, (match) => {
    return Math.random() > 0.7 ? match.replace(/\s+/, '... ') : match;
  });

  return message;
}

/**
 * Convert pauses to SSML
 */
function toSSML(message: string): string {
  return message.replace(/\.\.\./g, '<break time="0.5s"/>');
}

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

/**
 * Generate a semantically-aware message
 *
 * This is the main entry point that assembles all components
 * into a natural, human-feeling message.
 */
export function generateSemanticMessage(context: SemanticMessageContext): SemanticMessage {
  const startTime = Date.now();

  log.info(
    {
      intent: context.intent,
      relationship: context.recipient.relationship,
      stage: context.recipient.stage,
    },
    'Generating semantic message'
  );

  // Get components
  const opening = getOpening(context);
  const transition = getTransition(context);
  const mainMessage = getMainMessage(context);
  const personalTouch = getPersonalTouch(context);
  const close = getClosing(context);

  // Assemble message
  const parts = [opening];
  if (transition) parts.push(transition);
  parts.push(mainMessage);
  if (personalTouch) parts.push(personalTouch);
  parts.push(close);

  let message = parts.join(' ');
  message = addPauses(message);
  const ssmlMessage = toSSML(message);

  const componentsUsed = [
    'opening',
    transition ? 'transition' : null,
    'mainMessage',
    personalTouch ? 'personalTouch' : null,
    'close',
  ].filter(Boolean) as string[];

  log.info(
    {
      intent: context.intent,
      componentsUsed,
      messageLength: message.length,
      durationMs: Date.now() - startTime,
    },
    'Semantic message generated'
  );

  return {
    message,
    ssmlMessage,
    components: {
      opening,
      transition,
      mainMessage,
      personalTouch,
      close,
    },
    metadata: {
      intent: context.intent,
      relationshipStage: context.recipient.stage,
      generationType: 'semantic',
      componentsUsed,
    },
  };
}

// ============================================================================
// HIGH-LEVEL API
// ============================================================================

/**
 * Infer relationship stage from relationship type
 */
export function inferRelationshipStage(relationship: string): RelationshipStage {
  const lower = relationship.toLowerCase();

  const deepRelationships = [
    'mother',
    'mom',
    'mama',
    'father',
    'dad',
    'papa',
    'spouse',
    'wife',
    'husband',
    'partner',
    'child',
    'son',
    'daughter',
  ];

  const establishedRelationships = [
    'brother',
    'sister',
    'sibling',
    'grandma',
    'grandpa',
    'grandmother',
    'grandfather',
    'grandparent',
    'best friend',
    'bestie',
  ];

  const buildingRelationships = [
    'friend',
    'cousin',
    'aunt',
    'uncle',
    'niece',
    'nephew',
    'colleague',
    'coworker',
  ];

  if (deepRelationships.some((r) => lower.includes(r))) return 'deep';
  if (establishedRelationships.some((r) => lower.includes(r))) return 'established';
  if (buildingRelationships.some((r) => lower.includes(r))) return 'building';

  return 'new';
}

/**
 * Quick message generation from minimal input
 *
 * This is a convenience function for common use cases.
 */
export function quickGenerate(
  request: string,
  contactName: string,
  relationship: string,
  senderName: string,
  isVoicemail = false
): SemanticMessage {
  const intent = classifyIntent(request);
  const stage = inferRelationshipStage(relationship);

  const context: SemanticMessageContext = {
    originalRequest: request,
    intent,
    sender: {
      userId: 'quick',
      userName: senderName,
    },
    recipient: {
      contactName,
      relationship,
      stage,
    },
    time: getTimeContext(),
    isVoicemail,
  };

  return generateSemanticMessage(context);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  classifyIntent,
  generateSemanticMessage,
  quickGenerate,
  getTimeContext,
  inferRelationshipStage,
};
