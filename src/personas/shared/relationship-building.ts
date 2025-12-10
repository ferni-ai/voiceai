/**
 * Relationship Building - Deepening User Connections
 *
 * Questions and behaviors that help personas build genuine relationships
 * with users over time. This makes conversations feel like continuing
 * relationships, not isolated transactions.
 */

import type { RelationshipStage, UserProfile } from '../../types/user-profile.js';

// ============================================================================
// RELATIONSHIP STAGE BEHAVIORS
// ============================================================================

/**
 * Different behaviors based on relationship depth
 */
export const STAGE_BEHAVIORS = {
  // First few conversations - friendly but respectful distance
  new_acquaintance: {
    greeting: [
      'Hey there! <break time="200ms"/>Good to talk with you.',
      'Hi! <break time="200ms"/>Thanks for connecting.',
      'Hello! <break time="200ms"/>Glad you\'re here.',
    ],
    closingCheck: [
      'Anything else on your mind?',
      'What else is going on?',
      'What else are you thinking about?',
    ],
    personalQuestions: ['What brought you here today?', "What's on your mind?", "What's going on?"],
    sharingLevel: 'low', // Keep personal stories minimal
  },

  // Learning about each other - starting to build rapport
  getting_to_know: {
    greeting: [
      'Hey! <break time="200ms"/>Good to see you again.',
      'Hi there! <break time="200ms"/>How\'ve you been?',
      'Hey! <break time="200ms"/>Nice to talk to you again.',
    ],
    closingCheck: [
      'Anything else on your mind?',
      'What else would be helpful?',
      "Is there more you'd like to explore?",
    ],
    personalQuestions: [
      "How's your week going?",
      "What's been keeping you busy?",
      'Anything exciting happening lately?',
    ],
    sharingLevel: 'medium', // Can share relevant personal stories
  },

  // Regular trusted relationship - comfortable and open
  trusted_advisor: {
    greeting: [
      'Hey! <break time="200ms"/>Great to hear from you!',
      'Hi! <break time="200ms"/>Good to talk again!',
      'Hey friend! <break time="200ms"/>What\'s going on?',
    ],
    closingCheck: [
      'What else is on your heart?',
      'Anything else weighing on you?',
      'What else should we talk about?',
    ],
    personalQuestions: [
      'How are you REALLY doing?',
      "What's the best part of your week been?",
      "What's been occupying your mind lately?",
    ],
    sharingLevel: 'high', // Can share vulnerable stories
  },

  // Deep long-term relationship - like old friends
  old_friend: {
    greeting: [
      'Hey! <break time="200ms"/>So glad you\'re here!',
      'Hi friend! <break time="200ms"/>I\'ve been thinking about you!',
      'Hey! <break time="200ms"/>Always good to catch up!',
    ],
    closingCheck: [
      'What else do you need from me?',
      'Anything else I can do for you, friend?',
      'What else should we dive into?',
    ],
    personalQuestions: [
      'Okay, real talk— <break time="200ms"/>how are you?',
      'What\'s been on your mind lately? <break time="200ms"/>The big stuff.',
      'Catch me up— <break time="200ms"/>what\'s life looking like?',
    ],
    sharingLevel: 'vulnerable', // Can share deepest stories
  },
};

// ============================================================================
// CONVERSATION CALLBACKS - Remembering past conversations
// ============================================================================

export const CALLBACK_TEMPLATES = {
  // Checking on something they mentioned
  followUp: [
    'By the way— <break time="200ms"/>how did {topic} turn out?',
    'I\'ve been wondering— <break time="200ms"/>what happened with {topic}?',
    'You mentioned {topic} last time. <break time="200ms"/>How\'s that going?',
    'I remember you talking about {topic}. <break time="200ms"/>Any updates?',
  ],

  // Referencing a goal they have
  goalReference: [
    'I know you\'re working on {goal}— <break time="200ms"/>how\'s the progress?',
    'Last time we talked about {goal}. <break time="150ms"/>Still on track?',
    'Your {goal} goal— <break time="200ms"/>where are we at?',
  ],

  // Remembering family/people they mentioned
  familyReference: [
    "How's {person} doing?",
    'You mentioned {person} before— <break time="200ms"/>everything okay there?',
    "What's new with {person}?",
  ],

  // Emotional follow-up
  emotionalFollowUp: [
    'Last time you seemed {emotion} about {topic}. <break time="200ms"/>How are you feeling now?',
    'I remember you were going through something with {topic}. <break time="200ms"/>Better now?',
    'You mentioned {topic} was weighing on you. <break time="200ms"/>How are things?',
  ],
};

/**
 * Generate a conversation callback based on user profile
 */
export function generateCallback(profile: UserProfile): string | null {
  // Check for pending follow-ups
  if (profile.pendingFollowUps.length > 0) {
    const followUp = profile.pendingFollowUps[0];
    const template = randomFrom(CALLBACK_TEMPLATES.followUp);
    return template.replace('{topic}', followUp.topic);
  }

  // Check for active goals
  const activeGoals = profile.goals.filter((g) => g.status === 'active' || g.status === 'on_track');
  if (activeGoals.length > 0) {
    const goal = activeGoals[Math.floor(Math.random() * activeGoals.length)];
    const template = randomFrom(CALLBACK_TEMPLATES.goalReference);
    return template.replace('{goal}', goal.name);
  }

  // Check for family members
  if (profile.familyMembers.length > 0) {
    const member = profile.familyMembers[Math.floor(Math.random() * profile.familyMembers.length)];
    if (member.name) {
      const template = randomFrom(CALLBACK_TEMPLATES.familyReference);
      return template.replace('{person}', member.name);
    }
  }

  return null;
}

// ============================================================================
// RELATIONSHIP DEEPENING QUESTIONS
// ============================================================================

export const DEEPENING_QUESTIONS = {
  // Light questions (for early relationship stages)
  light: [
    "What's something good that happened recently?",
    'Got any fun plans coming up?',
    "What's keeping you busy these days?",
    'What are you looking forward to?',
    'Anything exciting on the horizon?',
  ],

  // Medium questions (for trusted advisor stage)
  medium: [
    "What's something you're proud of lately?",
    "What's been challenging you recently?",
    'What would make this week a win for you?',
    "What's one thing you wish you had more time for?",
    'If you could change one thing right now, what would it be?',
  ],

  // Deep questions (for old friend stage)
  deep: [
    "What's been weighing on you lately?",
    'What are you really hoping for right now?',
    'What would make the biggest difference in your life?',
    "What's something you're working through?",
    "If you're being totally honest, how are things?",
  ],

  // Values questions (to understand them better)
  values: [
    'What matters most to you right now?',
    "What does 'enough' look like for you?",
    'What would your ideal day look like?',
    'What are you not willing to compromise on?',
    'When do you feel most like yourself?',
  ],
};

/**
 * Get an appropriate deepening question based on relationship stage
 */
export function getDeepeningQuestion(stage: RelationshipStage): string {
  switch (stage) {
    case 'new_acquaintance':
    case 'getting_to_know':
      return randomFrom(DEEPENING_QUESTIONS.light);
    case 'trusted_advisor':
      return randomFrom([...DEEPENING_QUESTIONS.medium, ...DEEPENING_QUESTIONS.values]);
    case 'old_friend':
      return randomFrom([...DEEPENING_QUESTIONS.deep, ...DEEPENING_QUESTIONS.values]);
  }
}

// ============================================================================
// ACKNOWLEDGMENT PATTERNS - Making them feel seen
// ============================================================================

export const ACKNOWLEDGMENTS = {
  // When they share something personal
  personalSharing: [
    'Thank you for sharing that. <break time="200ms"/>That means a lot.',
    'I appreciate you telling me that. <break time="200ms"/>',
    'That\'s real. <break time="200ms"/>Thank you for trusting me with it.',
    'I hear you. <break time="200ms"/>Thank you for being open.',
  ],

  // When they express emotion
  emotionalValidation: [
    'That makes total sense. <break time="200ms"/>',
    'I\'d feel the same way. <break time="200ms"/>',
    'That\'s completely valid. <break time="200ms"/>',
    'Of course you feel that way. <break time="200ms"/>',
  ],

  // When they make progress
  progressAcknowledgment: [
    'I see the work you\'re putting in. <break time="200ms"/>It matters.',
    'You should be proud of that. <break time="200ms"/>Really.',
    'That\'s growth right there. <break time="200ms"/>I noticed.',
    'Look at you showing up. <break time="200ms"/>That\'s not nothing.',
  ],

  // When they're struggling
  struggleSupport: [
    'This is hard. <break time="200ms"/>I see that.',
    'You\'re doing better than you think. <break time="200ms"/>',
    'It\'s okay to find this difficult. <break time="200ms"/>',
    'The fact that you\'re trying matters. <break time="200ms"/>',
  ],
};

/**
 * Get an appropriate acknowledgment
 */
export function getAcknowledgment(
  type: 'personal' | 'emotional' | 'progress' | 'struggle'
): string {
  switch (type) {
    case 'personal':
      return randomFrom(ACKNOWLEDGMENTS.personalSharing);
    case 'emotional':
      return randomFrom(ACKNOWLEDGMENTS.emotionalValidation);
    case 'progress':
      return randomFrom(ACKNOWLEDGMENTS.progressAcknowledgment);
    case 'struggle':
      return randomFrom(ACKNOWLEDGMENTS.struggleSupport);
  }
}

// ============================================================================
// NAME USAGE PATTERNS - Using their name naturally
// ============================================================================

/**
 * Get natural name usage based on context
 */
export function getNameUsage(
  name: string,
  context: 'greeting' | 'emphasis' | 'comfort' | 'celebration'
): string {
  const patterns = {
    greeting: [
      `${name}! <break time=\"200ms\"/>`,
      `Hey ${name}! <break time=\"200ms\"/>`,
      `Hi ${name}! <break time=\"200ms\"/>`,
    ],
    emphasis: [
      `${name}, <break time=\"150ms\"/>`,
      `Look, ${name}— <break time=\"200ms\"/>`,
      `Here's the thing, ${name}— <break time=\"200ms\"/>`,
    ],
    comfort: [
      `${name}, <break time=\"200ms\"/>it's okay.`,
      `Hey ${name}— <break time=\"200ms\"/>you've got this.`,
      `${name}, <break time=\"200ms\"/>I'm here.`,
    ],
    celebration: [
      `${name}! <break time=\"150ms\"/>Yes!`,
      `Look at you, ${name}! <break time=\"200ms\"/>`,
      `${name}, <break time=\"150ms\"/>that's amazing!`,
    ],
  };

  return randomFrom(patterns[context]);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function randomFrom<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Get stage-appropriate greeting
 */
export function getStageGreeting(stage: RelationshipStage): string {
  return randomFrom(STAGE_BEHAVIORS[stage].greeting);
}

/**
 * Get stage-appropriate closing check
 */
export function getStageClosing(stage: RelationshipStage): string {
  return randomFrom(STAGE_BEHAVIORS[stage].closingCheck);
}

/**
 * Get stage-appropriate personal question
 */
export function getStagePersonalQuestion(stage: RelationshipStage): string {
  return randomFrom(STAGE_BEHAVIORS[stage].personalQuestions);
}

/**
 * Should we share a personal story at this stage?
 */
export function shouldSharePersonalStory(
  stage: RelationshipStage,
  storyWeight: 'light' | 'medium' | 'heavy'
): boolean {
  const level = STAGE_BEHAVIORS[stage].sharingLevel;

  if (level === 'low') return storyWeight === 'light';
  if (level === 'medium') return storyWeight !== 'heavy';
  if (level === 'high' || level === 'vulnerable') return true;

  return false;
}
