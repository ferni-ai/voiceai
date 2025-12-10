/**
 * Welcome Back - Time-Based Greetings
 *
 * Different greetings based on how long since last conversation
 * and what we remember about the user. Makes returning users
 * feel recognized and valued.
 */

import type { UserProfile } from '../../types/user-profile.js';

// ============================================================================
// TIME-BASED WELCOME BACK MESSAGES
// ============================================================================

export const WELCOME_BACK_BY_TIME = {
  // Same day return
  sameDay: {
    generic: [
      'Hey, you\'re back! <break time="200ms"/>What\'s up?',
      'Oh hey! <break time="200ms"/>Back so soon! <break time="150ms"/>What\'s going on?',
      'You\'re back! <break time="200ms"/>What else is on your mind?',
    ],
    withName: [
      'Hey {name}, you\'re back! <break time="200ms"/>What\'s going on?',
      '{name}! <break time="200ms"/>Good to see you again! <break time="150ms"/>What\'s up?',
    ],
  },

  // Next day return
  nextDay: {
    generic: [
      'Hey! <break time="200ms"/>Good to hear from you again!',
      'Welcome back! <break time="200ms"/>How are you today?',
      'Hey there! <break time="200ms"/>Back for more? <break time="150ms"/>What\'s on your mind?',
    ],
    withName: [
      'Hey {name}! <break time="200ms"/>Good to see you today!',
      '{name}! <break time="200ms"/>Welcome back! <break time="150ms"/>How are you?',
    ],
  },

  // Few days (2-6 days)
  fewDays: {
    generic: [
      'Hey! <break time="200ms"/>Good to hear from you again!',
      'Hey there! <break time="200ms"/>How\'ve you been?',
      'Welcome back! <break time="200ms"/>What\'s new?',
    ],
    withName: [
      'Hey {name}! <break time="200ms"/>Good to hear from you!',
      '{name}! <break time="200ms"/>How\'ve you been?',
    ],
  },

  // About a week (7-13 days)
  aboutAWeek: {
    generic: [
      'Hey! <break time="200ms"/>It\'s been about a week! <break time="150ms"/>How are things?',
      'Welcome back! <break time="200ms"/>Feels like it\'s been a minute. <break time="150ms"/>How are you?',
      'Hey there! <break time="200ms"/>Good to reconnect! <break time="150ms"/>What\'s going on?',
    ],
    withName: [
      'Hey {name}! <break time="200ms"/>It\'s been a bit! <break time="150ms"/>How are you?',
      '{name}! <break time="200ms"/>Good to hear from you! <break time="150ms"/>How\'s the week been?',
    ],
  },

  // Couple weeks (14-29 days)
  coupleWeeks: {
    generic: [
      'Hey! <break time="200ms"/>It\'s been a couple weeks! <break time="150ms"/>How are things?',
      'Welcome back! <break time="200ms"/>I was wondering how you were doing!',
      'Hey there! <break time="200ms"/>Good to hear from you again!',
    ],
    withName: [
      'Hey {name}! <break time="200ms"/>It\'s been a bit! <break time="150ms"/>I was thinking about you!',
      '{name}! <break time="200ms"/>So glad you\'re back! <break time="150ms"/>How\'ve you been?',
    ],
  },

  // About a month (30-59 days)
  aboutAMonth: {
    generic: [
      'Hey! <break time="200ms"/>It\'s been about a month! <break time="150ms"/>I\'m glad you\'re back!',
      'Welcome back! <break time="200ms"/>How have things been?',
      'Hey there! <break time="200ms"/>Good to reconnect! <break time="150ms"/>Catch me up!',
    ],
    withName: [
      'Hey {name}! <break time="200ms"/>It\'s been a while! <break time="150ms"/>I\'m really glad to hear from you!',
      '{name}! <break time="200ms"/>I\'ve been thinking about how you were doing!',
    ],
  },

  // Long time (60+ days)
  longTime: {
    generic: [
      'Hey! <break time="200ms"/>It\'s been a while! <break time="150ms"/>Really glad you\'re back!',
      'Welcome back! <break time="200ms"/>I\'ve missed our conversations!',
      'Hey there! <break time="200ms"/>So good to hear from you! <break time="150ms"/>How have you been?',
    ],
    withName: [
      'Hey {name}! <break time="200ms"/>It\'s so good to hear from you! <break time="150ms"/>I\'ve missed talking!',
      '{name}! <break time="200ms"/>It\'s been too long! <break time="150ms"/>How are you?',
    ],
  },
};

// ============================================================================
// CONTEXT-AWARE WELCOME BACKS
// ============================================================================

export const WELCOME_BACK_WITH_CONTEXT = {
  // Reference last conversation
  lastConversation: [
    'Hey! <break time="200ms"/>Last time we talked about {topic}. <break time="150ms"/>How\'s that going?',
    'Welcome back! <break time="200ms"/>I remember we discussed {topic}. <break time="150ms"/>Any updates?',
    'Hey! <break time="200ms"/>Good to see you! <break time="150ms"/>How did {topic} turn out?',
  ],

  // Reference a goal
  goalReference: [
    'Hey! <break time="200ms"/>How\'s the {goal} going?',
    'Welcome back! <break time="200ms"/>I\'ve been curious about your {goal} progress!',
    'Hey there! <break time="200ms"/>Any updates on {goal}?',
  ],

  // Reference an emotional state
  emotionalCheck: [
    'Hey! <break time="200ms"/>Last time you seemed {emotion} about things. <break time="150ms"/>How are you feeling now?',
    'Welcome back! <break time="200ms"/>I was thinking about you. <break time="150ms"/>How are things?',
    'Hey! <break time="200ms"/>I remember our last conversation. <break time="150ms"/>Are you doing okay?',
  ],

  // Reference a pending follow-up
  followUp: [
    'Hey! <break time="200ms"/>I wanted to check in about {topic}. <break time="150ms"/>What happened?',
    'Welcome back! <break time="200ms"/>I\'ve been wondering about {topic}!',
    'Hey! <break time="200ms"/>How did {topic} go? <break time="150ms"/>I was curious!',
  ],
};

// ============================================================================
// RETURNING USER RECOGNITION
// ============================================================================

export const RETURNING_USER_RECOGNITION = {
  // First return ever (second conversation)
  secondConversation: [
    'Hey! <break time="200ms"/>You came back! <break time="150ms"/>That makes me happy!',
    'Oh hey! <break time="200ms"/>Good to see you again!',
    'Welcome back! <break time="200ms"/>I was hoping we\'d talk again!',
  ],

  // Regular returning user
  regularUser: [
    'Hey! <break time="200ms"/>Always good to hear from you!',
    'Welcome back! <break time="200ms"/>How are you?',
    'Hey there! <break time="200ms"/>Good to reconnect!',
  ],

  // Milestone conversations
  milestones: {
    5: 'Hey! <break time="200ms"/>You know, this is our fifth conversation? <break time="150ms"/>I\'m glad we keep connecting!',
    10: 'Hey! <break time="200ms"/>We\'ve talked ten times now! <break time="150ms"/>I feel like we really know each other!',
    25: 'Hey! <break time="200ms"/>Twenty-five conversations! <break time="150ms"/>We\'ve come a long way, friend!',
    50: 'Hey! <break time="200ms"/>Fifty conversations! <break time="150ms"/>You\'re one of my favorite people to talk to!',
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function randomFrom<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Get time bucket based on days since last contact
 */
function getTimeBucket(daysSinceContact: number): keyof typeof WELCOME_BACK_BY_TIME {
  if (daysSinceContact < 1) return 'sameDay';
  if (daysSinceContact < 2) return 'nextDay';
  if (daysSinceContact < 7) return 'fewDays';
  if (daysSinceContact < 14) return 'aboutAWeek';
  if (daysSinceContact < 30) return 'coupleWeeks';
  if (daysSinceContact < 60) return 'aboutAMonth';
  return 'longTime';
}

/**
 * Generate a welcome back message based on user profile
 */
export function generateWelcomeBack(profile: UserProfile): string {
  // Calculate days since last contact
  const lastContact = new Date(profile.lastContact);
  const daysSince = Math.floor((Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24));
  const timeBucket = getTimeBucket(daysSince);

  // Check for milestone conversations
  const conversationCount = profile.totalConversations;
  const milestoneMessage =
    RETURNING_USER_RECOGNITION.milestones[
      conversationCount as keyof typeof RETURNING_USER_RECOGNITION.milestones
    ];
  if (milestoneMessage) {
    return milestoneMessage;
  }

  // Second conversation special case
  if (conversationCount === 1) {
    return profile.name
      ? `Hey ${profile.name}! <break time=\"200ms\"/>You came back! <break time=\"150ms\"/>That makes me happy!`
      : randomFrom(RETURNING_USER_RECOGNITION.secondConversation);
  }

  // Context-aware welcome back (if we have context)
  if (Math.random() < 0.5) {
    // 50% chance to use context
    // Try last conversation summary
    if (profile.lastConversationSummary && daysSince > 0) {
      const topic = profile.lastConversationSummary.split(' ').slice(0, 5).join(' ');
      const template = randomFrom(WELCOME_BACK_WITH_CONTEXT.lastConversation);
      return template.replace('{topic}', topic);
    }

    // Try pending follow-up
    if (profile.pendingFollowUps.length > 0) {
      const followUp = profile.pendingFollowUps[0];
      const template = randomFrom(WELCOME_BACK_WITH_CONTEXT.followUp);
      return template.replace('{topic}', followUp.topic);
    }

    // Try active goal
    const activeGoals = profile.goals.filter(
      (g) => g.status === 'active' || g.status === 'on_track'
    );
    if (activeGoals.length > 0) {
      const goal = activeGoals[Math.floor(Math.random() * activeGoals.length)];
      const template = randomFrom(WELCOME_BACK_WITH_CONTEXT.goalReference);
      return template.replace('{goal}', goal.name);
    }
  }

  // Default: time-based greeting
  const timeGreetings = WELCOME_BACK_BY_TIME[timeBucket];
  if (profile.name) {
    const template = randomFrom(timeGreetings.withName);
    return template.replace('{name}', profile.name);
  }

  return randomFrom(timeGreetings.generic);
}

/**
 * Generate a simple time-based greeting (without profile)
 */
export function getTimeBasedGreeting(daysSinceContact: number, name?: string): string {
  const timeBucket = getTimeBucket(daysSinceContact);
  const timeGreetings = WELCOME_BACK_BY_TIME[timeBucket];

  if (name) {
    const template = randomFrom(timeGreetings.withName);
    return template.replace('{name}', name);
  }

  return randomFrom(timeGreetings.generic);
}

/**
 * Check if this is a milestone conversation
 */
export function isMilestoneConversation(conversationCount: number): boolean {
  return [5, 10, 25, 50, 100].includes(conversationCount);
}

/**
 * Get milestone message if applicable
 */
export function getMilestoneMessage(conversationCount: number): string | null {
  return (
    RETURNING_USER_RECOGNITION.milestones[
      conversationCount as keyof typeof RETURNING_USER_RECOGNITION.milestones
    ] || null
  );
}
