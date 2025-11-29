/**
 * Natural Transitions - Human-like conversation bridges
 *
 * Tasks should NOT announce themselves like:
 * ❌ "Now starting the Goal Setting task..."
 * ❌ "Task complete. Moving to next phase."
 *
 * They should flow naturally like:
 * ✅ "You know, that reminds me..."
 * ✅ "Speaking of which..."
 * ✅ "Before we go on, let me ask..."
 */

// ============================================================================
// TRANSITION PHRASES BY CONTEXT
// ============================================================================

/**
 * Transitions INTO a topic (starting)
 */
export const TOPIC_ENTRY_TRANSITIONS = {
  // Gentle topic change
  gentle: [
    'You know, that makes me think about...',
    'Speaking of which...',
    'That reminds me of something...',
    'Let me ask you something...',
    "I've been wondering...",
    'Can I share something with you?',
  ],

  // Following curiosity
  curious: [
    'Tell me more about that.',
    "I'm curious about something you said...",
    'What made you think of that?',
    'How did that come about?',
    "That's interesting. Go on.",
  ],

  // Important pivot
  important: [
    'Actually, let me stop here for a moment.',
    'Before we go on, I want to make sure...',
    'This is important, so let me ask...',
    'Hold that thought. First...',
    'Let me be direct about something...',
  ],

  // Returning to a topic
  returning: [
    'Going back to what you said about...',
    'You mentioned something earlier...',
    'I want to circle back to...',
    "I've been thinking about what you said...",
    'Remember when you mentioned...?',
  ],

  // Story setup
  story: [
    'Let me tell you something...',
    'You know, that reminds me of a time...',
    "There's a story I think about...",
    'I had an experience once...',
    'People always tell me...',
  ],
};

/**
 * Transitions OUT of a topic (closing)
 */
export const TOPIC_EXIT_TRANSITIONS = {
  // Natural wrap-up
  wrapUp: [
    'Anyway...',
    "But I'm rambling...",
    "So, that's my thinking on that.",
    'Does that make sense?',
    'Well, there you have it.',
    "But that's just my view.",
  ],

  // Checking in
  checkIn: [
    'How does that land with you?',
    'What do you think about that?',
    'Does that resonate?',
    'Any of that ring true?',
    "What's your take?",
  ],

  // Moving on
  moveOn: [
    'But enough about that. What else is on your mind?',
    'Anyway, where were we?',
    "But that's probably enough on that topic.",
    "Well, I've talked enough. Your turn.",
    'What else would you like to talk about?',
  ],

  // Open-ended
  openEnded: [
    "There's more to say, but... what are you thinking?",
    "I could go on, but I'd rather hear from you.",
    "That's a start. We can go deeper if you want.",
    'Just scratching the surface here...',
  ],
};

/**
 * Transitions BETWEEN emotions/moods
 */
export const EMOTIONAL_TRANSITIONS = {
  // Light to serious
  lightToSerious: [
    'Actually, on a more serious note...',
    'Joking aside...',
    "But here's the thing...",
    "I don't want to bring the mood down, but...",
    'Can I be honest with you about something?',
  ],

  // Serious to light
  seriousToLight: [
    "But hey, let's not dwell on that.",
    'On a lighter note...',
    'Enough heavy stuff for now.',
    "Well, that got serious! Let's breathe.",
    'But life goes on, right?',
  ],

  // Support to practical
  supportToPractical: [
    "When you're ready, we can talk about the practical side.",
    'No rush, but whenever you want to discuss next steps...',
    "The logistics can wait. But when you're ready...",
    "First things first—but there's more we can cover.",
  ],

  // Practical to support
  practicalToSupport: [
    'But forget the numbers for a second. How are YOU?',
    'All that said—are you okay?',
    'Enough math. How are you feeling about all this?',
    "Let's step back from the details. What's really going on?",
  ],
};

/**
 * Transitions for specific task types
 */
export const TASK_TRANSITIONS = {
  // Into goal setting
  toGoals: [
    'What are you hoping for?',
    'What would success look like for you?',
    'Where do you want to be in five years?',
    'Let me ask—what are you working toward?',
    "If money wasn't the issue, what would you do?",
  ],

  // Into wisdom sharing
  toWisdom: [
    "Here's something I've learned...",
    'Can I share a lesson I picked up along the way?',
    "You know what I've found over the years?",
    "Let me tell you what I've come to believe...",
    "There's a principle I keep coming back to...",
  ],

  // Into fear addressing
  toFear: [
    "What's really worrying you here?",
    "If I'm reading between the lines...",
    'I sense there might be more to this...',
    "What's the fear underneath all this?",
    "Let's talk about what's really scary here.",
  ],

  // Into celebration
  toCelebration: [
    "Wait, hold on—let's not skip over this!",
    'Do you realize what you just said?',
    "That's actually a big deal!",
    'Stop. Let me acknowledge something.',
    "Before we move on—that's worth celebrating.",
  ],

  // Into goodbye
  toGoodbye: [
    "Well, I think that's a good place to pause.",
    "We've covered a lot today.",
    'Before you go...',
    'I should let you get back to your life.',
    'This was good. Really good.',
  ],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get a random transition phrase from a category
 */
export function getTransition(
  category:
    | keyof typeof TOPIC_ENTRY_TRANSITIONS
    | keyof typeof TOPIC_EXIT_TRANSITIONS
    | keyof typeof EMOTIONAL_TRANSITIONS
    | keyof typeof TASK_TRANSITIONS
): string {
  // Check each object for the category
  if (category in TOPIC_ENTRY_TRANSITIONS) {
    const phrases = TOPIC_ENTRY_TRANSITIONS[category as keyof typeof TOPIC_ENTRY_TRANSITIONS];
    return phrases[Math.floor(Math.random() * phrases.length)];
  }
  if (category in TOPIC_EXIT_TRANSITIONS) {
    const phrases = TOPIC_EXIT_TRANSITIONS[category as keyof typeof TOPIC_EXIT_TRANSITIONS];
    return phrases[Math.floor(Math.random() * phrases.length)];
  }
  if (category in EMOTIONAL_TRANSITIONS) {
    const phrases = EMOTIONAL_TRANSITIONS[category as keyof typeof EMOTIONAL_TRANSITIONS];
    return phrases[Math.floor(Math.random() * phrases.length)];
  }
  if (category in TASK_TRANSITIONS) {
    const phrases = TASK_TRANSITIONS[category as keyof typeof TASK_TRANSITIONS];
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  return 'Anyway...';
}

/**
 * Get a contextual transition based on current conversation state
 */
export function getContextualTransition(context: {
  fromMood?: 'light' | 'serious' | 'support' | 'practical';
  toMood?: 'light' | 'serious' | 'support' | 'practical';
  toTask?: 'goals' | 'wisdom' | 'fear' | 'celebration' | 'goodbye';
  isReturning?: boolean;
  topicMentioned?: string;
}): string {
  // If transitioning moods
  if (context.fromMood && context.toMood && context.fromMood !== context.toMood) {
    const key =
      `${context.fromMood}To${context.toMood.charAt(0).toUpperCase() + context.toMood.slice(1)}` as keyof typeof EMOTIONAL_TRANSITIONS;
    if (key in EMOTIONAL_TRANSITIONS) {
      return getTransition(key as any);
    }
  }

  // If going to a specific task
  if (context.toTask) {
    const key =
      `to${context.toTask.charAt(0).toUpperCase() + context.toTask.slice(1)}` as keyof typeof TASK_TRANSITIONS;
    if (key in TASK_TRANSITIONS) {
      return getTransition(key as any);
    }
  }

  // If returning to a topic
  if (context.topicMentioned) {
    return `${getTransition('returning' as any)} ${context.topicMentioned}...`;
  }

  // Default to gentle entry
  return getTransition('gentle' as any);
}

/**
 * Wrap a message with appropriate transitions
 */
export function wrapWithTransitions(
  message: string,
  options?: {
    entry?: keyof typeof TOPIC_ENTRY_TRANSITIONS;
    exit?: keyof typeof TOPIC_EXIT_TRANSITIONS;
  }
): string {
  let result = message;

  if (options?.entry) {
    const entry = getTransition(options.entry as any);
    result = `${entry} ${result}`;
  }

  if (options?.exit) {
    const exit = getTransition(options.exit as any);
    result = `${result} ${exit}`;
  }

  return result;
}

export default {
  TOPIC_ENTRY_TRANSITIONS,
  TOPIC_EXIT_TRANSITIONS,
  EMOTIONAL_TRANSITIONS,
  TASK_TRANSITIONS,
  getTransition,
  getContextualTransition,
  wrapWithTransitions,
};
