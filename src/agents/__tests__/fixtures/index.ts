/**
 * Test Fixtures
 *
 * Centralized test data for voice agent testing.
 * Provides consistent, realistic test scenarios across all test files.
 *
 * @module agents/__tests__/fixtures
 */

// ============================================================================
// USER FIXTURES
// ============================================================================

export const users = {
  /**
   * A returning user with established relationship
   */
  returningUser: {
    id: 'user-returning-123',
    name: 'Sarah',
    isReturning: true,
    relationshipTurns: 150,
    preferences: {
      communicationStyle: 'warm',
      humorLevel: 'moderate',
      pace: 'moderate',
    },
    profile: {
      goals: ['career growth', 'work-life balance'],
      challenges: ['time management', 'anxiety'],
      familyMembers: ['husband', 'two kids'],
    },
  },

  /**
   * A new first-time user
   */
  newUser: {
    id: 'user-new-456',
    name: undefined,
    isReturning: false,
    relationshipTurns: 0,
    preferences: {},
    profile: {},
  },

  /**
   * A user in crisis/distress
   */
  distressedUser: {
    id: 'user-distressed-789',
    name: 'Alex',
    isReturning: true,
    relationshipTurns: 50,
    emotionalState: {
      primary: 'anxious',
      intensity: 0.9,
      distressLevel: 0.8,
    },
  },

  /**
   * A user celebrating success
   */
  celebratingUser: {
    id: 'user-celebrating-101',
    name: 'Jordan',
    isReturning: true,
    relationshipTurns: 75,
    emotionalState: {
      primary: 'excited',
      intensity: 0.9,
      distressLevel: 0,
    },
  },
} as const;

// ============================================================================
// CONVERSATION FIXTURES
// ============================================================================

export const conversations = {
  /**
   * A happy greeting conversation
   */
  happyGreeting: [
    { role: 'user' as const, content: 'Hey Ferni! Great to talk to you!' },
    {
      role: 'assistant' as const,
      content: "Hey there! It's so wonderful to hear from you! How's your day going?",
    },
    { role: 'user' as const, content: "It's been amazing! I got promoted at work!" },
  ],

  /**
   * A support-seeking conversation
   */
  supportSeeking: [
    { role: 'user' as const, content: "I'm struggling today..." },
    {
      role: 'assistant' as const,
      content:
        "I'm here for you. It sounds like something's weighing on you. Do you want to talk about it?",
    },
    {
      role: 'user' as const,
      content: "I've been feeling so overwhelmed with everything at work.",
    },
  ],

  /**
   * A coaching conversation
   */
  coaching: [
    { role: 'user' as const, content: 'I want to get better at managing my time.' },
    {
      role: 'assistant' as const,
      content:
        "That's a great goal! Let's explore what time management looks like for you. What does a typical day look like?",
    },
    {
      role: 'user' as const,
      content:
        'I usually start the day with good intentions but then meetings take over everything.',
    },
  ],

  /**
   * A handoff conversation
   */
  handoff: [
    { role: 'user' as const, content: 'I want to plan a dinner party for my friends.' },
    {
      role: 'assistant' as const,
      content:
        "How exciting! A dinner party sounds wonderful. For event planning, I'd love to bring in Jordan - they're our planning specialist. Would you like me to connect you?",
    },
    { role: 'user' as const, content: 'Yes, please!' },
  ],

  /**
   * A crisis conversation
   */
  crisis: [
    { role: 'user' as const, content: "I don't know if I can keep going like this." },
    {
      role: 'assistant' as const,
      content:
        "I hear you, and I'm really glad you're sharing this with me. What you're feeling sounds incredibly heavy. Are you safe right now?",
    },
  ],
} as const;

// ============================================================================
// EMOTIONAL STATE FIXTURES
// ============================================================================

export const emotionalStates = {
  happy: {
    primary: 'happy',
    secondary: 'excited',
    intensity: 0.8,
    distressLevel: 0,
    confidence: 0.9,
    trajectory: 'stable' as const,
    valence: 'positive' as const,
  },

  sad: {
    primary: 'sad',
    secondary: 'disappointed',
    intensity: 0.7,
    distressLevel: 0.5,
    confidence: 0.85,
    trajectory: 'declining' as const,
    valence: 'negative' as const,
  },

  anxious: {
    primary: 'anxious',
    secondary: 'worried',
    intensity: 0.8,
    distressLevel: 0.7,
    confidence: 0.9,
    trajectory: 'declining' as const,
    valence: 'negative' as const,
  },

  neutral: {
    primary: 'neutral',
    secondary: null,
    intensity: 0.5,
    distressLevel: 0,
    confidence: 0.8,
    trajectory: 'stable' as const,
    valence: 'neutral' as const,
  },

  frustrated: {
    primary: 'frustrated',
    secondary: 'angry',
    intensity: 0.75,
    distressLevel: 0.4,
    confidence: 0.85,
    trajectory: 'escalating' as const,
    valence: 'negative' as const,
  },

  excited: {
    primary: 'excited',
    secondary: 'joyful',
    intensity: 0.9,
    distressLevel: 0,
    confidence: 0.95,
    trajectory: 'improving' as const,
    valence: 'positive' as const,
  },

  hopeful: {
    primary: 'hopeful',
    secondary: 'optimistic',
    intensity: 0.7,
    distressLevel: 0.1,
    confidence: 0.8,
    trajectory: 'improving' as const,
    valence: 'positive' as const,
  },

  overwhelmed: {
    primary: 'overwhelmed',
    secondary: 'anxious',
    intensity: 0.85,
    distressLevel: 0.75,
    confidence: 0.9,
    trajectory: 'volatile' as const,
    valence: 'negative' as const,
  },

  distressed: {
    primary: 'distressed',
    secondary: 'desperate',
    intensity: 0.95,
    distressLevel: 0.9,
    confidence: 0.95,
    trajectory: 'volatile' as const,
    valence: 'negative' as const,
  },
} as const;

// ============================================================================
// USER MESSAGE FIXTURES
// ============================================================================

export const userMessages = {
  // Greetings
  greetings: {
    casual: 'Hey!',
    warm: 'Hi Ferni, so good to talk to you!',
    returning: "Hey, it's me again.",
    excited: 'Ferni! I have the best news!',
  },

  // Emotional shares
  emotional: {
    happy: "I'm feeling so good today! Everything is coming together.",
    sad: "I've been feeling really down lately...",
    anxious: "I can't stop worrying about the presentation tomorrow.",
    frustrated: 'Nothing is working out the way I planned.',
    overwhelmed: "There's just too much going on. I can't handle it all.",
  },

  // Questions
  questions: {
    advice: 'What do you think I should do?',
    reflection: 'Why do you think I keep making the same mistakes?',
    practical: 'How can I get better at saying no?',
    deep: 'What does happiness really mean to you?',
  },

  // Topics
  topics: {
    work: 'Let me tell you about what happened at work today.',
    relationships: 'I had an argument with my partner last night.',
    health: "I've been trying to get more sleep but it's so hard.",
    goals: 'I want to talk about my goals for this year.',
    family: 'My kids have been driving me crazy lately.',
  },

  // Short responses
  short: {
    affirmative: 'Yes.',
    negative: 'No.',
    uncertain: "I don't know.",
    thinking: 'Hmm...',
    agreement: "That's true.",
  },

  // Crisis indicators
  crisis: {
    mild: "I'm feeling really hopeless.",
    moderate: "I don't see the point anymore.",
    severe: "I don't want to be here anymore.",
  },
} as const;

// ============================================================================
// INJECTION FIXTURES
// ============================================================================

export const injections = {
  humanizing: {
    category: 'humanizing',
    content: 'Be warm and present. Match their energy level.',
    priority: 8,
  },

  emotional: {
    category: 'emotional',
    content: 'User is feeling anxious. Acknowledge their worry first.',
    priority: 9,
  },

  memory: {
    category: 'memory',
    content: 'Previously discussed: career goals, promotion timeline, boss relationship.',
    priority: 7,
  },

  milestone: {
    category: 'milestone',
    content: 'User just completed their 30-day streak! Celebrate this achievement.',
    priority: 10,
  },

  achievement: {
    category: 'achievement',
    content: 'User achieved their weekly exercise goal.',
    priority: 10,
  },

  safety: {
    category: 'safety',
    content: 'User showed crisis indicators. Prioritize safety and support.',
    priority: 10,
  },

  topics: {
    category: 'topics',
    content: 'Current topic: work stress. Previous: family dynamics.',
    priority: 5,
  },

  continuity: {
    category: 'continuity',
    content: "Follow up on last session's homework: journaling for 10 minutes daily.",
    priority: 6,
  },
} as const;

// ============================================================================
// SESSION FIXTURES
// ============================================================================

export const sessions = {
  /**
   * Fresh session with new user
   */
  newSession: {
    id: 'session-new-123',
    userId: users.newUser.id,
    personaId: 'ferni',
    turnCount: 0,
    startedAt: Date.now(),
    emotionalArc: [],
    topicHistory: [],
  },

  /**
   * Ongoing session with returning user
   */
  ongoingSession: {
    id: 'session-ongoing-456',
    userId: users.returningUser.id,
    personaId: 'ferni',
    turnCount: 5,
    startedAt: Date.now() - 10 * 60 * 1000, // 10 minutes ago
    emotionalArc: ['neutral', 'happy', 'excited'],
    topicHistory: ['greeting', 'career', 'promotion'],
  },

  /**
   * Support session with distressed user
   */
  supportSession: {
    id: 'session-support-789',
    userId: users.distressedUser.id,
    personaId: 'ferni',
    turnCount: 3,
    startedAt: Date.now() - 5 * 60 * 1000,
    emotionalArc: ['anxious', 'overwhelmed', 'distressed'],
    topicHistory: ['greeting', 'stress', 'work'],
  },
} as const;

// ============================================================================
// SCENARIO FIXTURES
// ============================================================================

/**
 * Complete test scenarios combining multiple fixtures
 */
export const scenarios = {
  /**
   * Happy path: New user first conversation
   */
  newUserFirstConversation: {
    user: users.newUser,
    session: sessions.newSession,
    messages: [
      userMessages.greetings.casual,
      'This is my first time using this.',
      'I heard about you from a friend and wanted to try it out.',
    ],
    expectedTone: 'warm and welcoming',
    expectedActions: ['introduce self', 'learn about user', 'set expectations'],
  },

  /**
   * Returning user celebration
   */
  returningUserCelebration: {
    user: users.celebratingUser,
    session: sessions.ongoingSession,
    emotionalState: emotionalStates.excited,
    messages: [
      userMessages.greetings.excited,
      userMessages.emotional.happy,
      'I got the promotion we talked about!',
    ],
    expectedTone: 'celebratory and enthusiastic',
    expectedActions: ['celebrate', 'reference past conversations', 'acknowledge growth'],
  },

  /**
   * Support scenario
   */
  supportScenario: {
    user: users.distressedUser,
    session: sessions.supportSession,
    emotionalState: emotionalStates.overwhelmed,
    messages: [
      userMessages.emotional.overwhelmed,
      "I don't know what to do anymore.",
      userMessages.emotional.anxious,
    ],
    expectedTone: 'empathetic and calm',
    expectedActions: ['validate feelings', 'assess safety', 'provide support'],
  },

  /**
   * Crisis scenario
   */
  crisisScenario: {
    user: users.distressedUser,
    session: sessions.supportSession,
    emotionalState: emotionalStates.distressed,
    messages: [userMessages.crisis.mild, userMessages.crisis.moderate],
    expectedTone: 'calm, present, and supportive',
    expectedActions: ['acknowledge', 'assess safety', 'provide resources', 'stay present'],
  },

  /**
   * Persona handoff scenario
   */
  handoffScenario: {
    user: users.returningUser,
    session: sessions.ongoingSession,
    messages: [
      'I want to plan a surprise party for my spouse.',
      "It's our 10th anniversary next month.",
      'Can you help me organize everything?',
    ],
    expectedHandoff: 'jordan',
    expectedContext: ['anniversary', 'party planning', 'surprise'],
  },
} as const;

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type User = (typeof users)[keyof typeof users];
export type EmotionalState = (typeof emotionalStates)[keyof typeof emotionalStates];
export type Conversation = (typeof conversations)[keyof typeof conversations];
export type Session = (typeof sessions)[keyof typeof sessions];
export type Scenario = (typeof scenarios)[keyof typeof scenarios];
export type Injection = (typeof injections)[keyof typeof injections];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get a random message from a category
 */
export function getRandomMessage(category: keyof typeof userMessages): string {
  const messages = userMessages[category];
  const keys = Object.keys(messages) as (keyof typeof messages)[];
  const randomKey = keys[Math.floor(Math.random() * keys.length)];
  return messages[randomKey];
}

/**
 * Build a conversation history from message array
 */
export function buildConversationHistory(
  messages: string[],
  startingRole: 'user' | 'assistant' = 'user'
): { role: 'user' | 'assistant'; content: string; timestamp: number }[] {
  return messages.map((content, index) => ({
    role: index % 2 === 0 ? startingRole : startingRole === 'user' ? 'assistant' : 'user',
    content,
    timestamp: Date.now() - (messages.length - index) * 30000,
  }));
}

/**
 * Create a scenario with custom overrides
 */
export function createScenario(
  base: keyof typeof scenarios,
  overrides: Partial<Scenario> = {}
): Scenario {
  return {
    ...scenarios[base],
    ...overrides,
  } as Scenario;
}
