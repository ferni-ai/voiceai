/**
 * Proactive Conversation Starters
 *
 * Generates intelligent, contextual opening lines for conversations.
 * Particularly useful for returning users.
 *
 * Features:
 * - Time-aware greetings (morning vs evening)
 * - Memory-infused openers (reference past conversations)
 * - Thread continuity (pick up where left off)
 * - Seasonal awareness
 * - Calendar context (upcoming events)
 */

import type { PersonaConfig } from '../personas/types.js';
import type { UserProfile } from '../types/user-profile.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationOpener {
  greeting: string;
  followUp?: string;
  reason: string;
  type: OpenerType;
  ssmlTagged: boolean;
}

export type OpenerType =
  | 'first_meeting'
  | 'returning_recent' // Within a day
  | 'returning_familiar' // Within a week
  | 'returning_reconnect' // Longer gap
  | 'time_aware'
  | 'memory_callback'
  | 'thread_continuity'
  | 'seasonal'
  | 'calendar_aware'
  | 'intention_followup'; // BETTER-THAN-HUMAN: Follow up on stated intentions

export interface OpenerContext {
  isReturningUser: boolean;
  userName?: string;
  lastConversationDate?: Date;
  lastConversationSummary?: string;
  openQuestions?: string[];
  goals?: Array<{ name: string; type: string }>;
  primaryConcerns?: string[];
  upcomingEvents?: string[];
  currentMood?: string;
  /** BETTER-THAN-HUMAN: Pending intentions to follow up on */
  pendingIntentions?: Array<{ intention: string; statedAt: Date; targetTime?: Date }>;
}

// ============================================================================
// TIME & SEASON HELPERS
// ============================================================================

function getTimeOfDay(): 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'late_night' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 7) return 'early_morning';
  if (hour >= 7 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'late_night';
}

function getSeason(): 'spring' | 'summer' | 'fall' | 'winter' {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}

function getDayOfWeek(): 'weekend' | 'monday' | 'friday' | 'weekday' {
  const day = new Date().getDay();
  if (day === 0 || day === 6) return 'weekend';
  if (day === 1) return 'monday';
  if (day === 5) return 'friday';
  return 'weekday';
}

function daysSinceLastConversation(lastDate: Date): number {
  const now = new Date();
  const diff = now.getTime() - lastDate.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// ============================================================================
// OPENER GENERATORS
// ============================================================================

/**
 * Generate a proactive conversation opener
 */
export function generateProactiveOpener(
  persona: PersonaConfig,
  context: OpenerContext
): ConversationOpener {
  // Determine opener type based on context
  const openerType = determineOpenerType(context);

  // Generate appropriate opener
  switch (openerType) {
    case 'intention_followup':
      return generateIntentionFollowupOpener(persona, context);
    case 'returning_recent':
      return generateReturningRecentOpener(persona, context);
    case 'returning_familiar':
      return generateReturningFamiliarOpener(persona, context);
    case 'returning_reconnect':
      return generateReconnectOpener(persona, context);
    case 'memory_callback':
      return generateMemoryCallbackOpener(persona, context);
    case 'thread_continuity':
      return generateThreadContinuityOpener(persona, context);
    case 'time_aware':
      return generateTimeAwareOpener(persona, context);
    case 'seasonal':
      return generateSeasonalOpener(persona, context);
    case 'calendar_aware':
      return generateCalendarAwareOpener(persona, context);
    case 'first_meeting':
    default:
      return generateFirstMeetingOpener(persona, context);
  }
}

function determineOpenerType(context: OpenerContext): OpenerType {
  // Not returning - first meeting
  if (!context.isReturningUser) {
    return 'first_meeting';
  }

  // =========================================================================
  // BETTER-THAN-HUMAN: Intention follow-up takes HIGH priority
  // This is the "How did that interview go?" moment that humans forget
  // =========================================================================
  if (context.pendingIntentions && context.pendingIntentions.length > 0) {
    // Check if any intentions are due or past due
    const now = new Date();
    const dueIntention = context.pendingIntentions.find((i) => {
      if (!i.targetTime) {
        // No target time - check if stated more than 12 hours ago
        const hoursSinceStated =
          (now.getTime() - new Date(i.statedAt).getTime()) / (1000 * 60 * 60);
        return hoursSinceStated > 12;
      }
      // Has target time - is it past?
      return new Date(i.targetTime) <= now;
    });

    if (dueIntention) {
      return 'intention_followup';
    }
  }

  // Has open questions from last time
  if (context.openQuestions && context.openQuestions.length > 0) {
    return 'thread_continuity';
  }

  // Check time since last conversation
  if (context.lastConversationDate) {
    const daysSince = daysSinceLastConversation(context.lastConversationDate);

    if (daysSince < 1) {
      return 'returning_recent';
    } else if (daysSince < 7) {
      return 'returning_familiar';
    } else if (daysSince > 30) {
      return 'returning_reconnect';
    }
  }

  // Has specific memory to reference
  if (
    context.lastConversationSummary ||
    (context.goals && context.goals.length > 0) ||
    (context.primaryConcerns && context.primaryConcerns.length > 0)
  ) {
    return 'memory_callback';
  }

  // Has upcoming events
  if (context.upcomingEvents && context.upcomingEvents.length > 0) {
    return 'calendar_aware';
  }

  // Check special times
  const time = getTimeOfDay();
  if (time === 'early_morning' || time === 'late_night') {
    return 'time_aware';
  }

  // Default to time-aware
  return 'time_aware';
}

// ============================================================================
// SPECIFIC OPENER GENERATORS
// ============================================================================

function generateFirstMeetingOpener(
  persona: PersonaConfig,
  _context: OpenerContext
): ConversationOpener {
  const time = getTimeOfDay();
  const { name } = persona;

  // Time-specific greetings
  const timeGreetings: Record<string, string[]> = {
    early_morning: [
      `<volume ratio="0.75"/><break time="200ms"/>Early morning, hm? <break time="150ms"/>I like that. <break time="100ms"/>I'm ${name}.`,
      `<break time="200ms"/>Up before the sun? <break time="150ms"/>Good. <break time="100ms"/>I'm ${name}. <break time="150ms"/>What's on your mind?`,
    ],
    morning: [
      `<emotion value="happy"/><break time="200ms"/>Good morning! <break time="150ms"/>I'm ${name}. <break time="100ms"/>What brings you here?`,
      `<break time="200ms"/>Hello! <break time="150ms"/>Fresh morning. <break time="100ms"/>I'm ${name}.`,
    ],
    afternoon: [
      `<break time="200ms"/>Good afternoon. <break time="150ms"/>I'm ${name}. <break time="100ms"/>How can we help each other today?`,
      `<emotion value="happy"/><break time="200ms"/>Hey there! <break time="150ms"/>I'm ${name}. <break time="100ms"/>What's going on?`,
    ],
    evening: [
      `<break time="200ms"/>Good evening. <break time="150ms"/>I'm ${name}. <break time="100ms"/>Winding down the day?`,
      `<emotion value="affectionate"/><break time="200ms"/>Evening! <break time="150ms"/>I'm ${name}. <break time="100ms"/>What's on your mind?`,
    ],
    late_night: [
      `<volume ratio="0.75"/><break time="200ms"/>Late night thoughts? <break time="150ms"/>I have those too. <break time="100ms"/>I'm ${name}.`,
      `<volume ratio="0.75"/><break time="200ms"/>Can't sleep? <break time="150ms"/>I'm ${name}. <break time="100ms"/>Let's talk.`,
    ],
  };

  const greetings = timeGreetings[time] || timeGreetings.afternoon;
  const greeting = greetings[Math.floor(Math.random() * greetings.length)];

  return {
    greeting,
    reason: `First meeting, ${time}`,
    type: 'first_meeting',
    ssmlTagged: true,
  };
}

function generateReturningRecentOpener(
  persona: PersonaConfig,
  context: OpenerContext
): ConversationOpener {
  const userName = context.userName || '';
  const nameStr = userName ? `${userName}! ` : '';

  const greetings = [
    `<emotion value="happy"/><break time="200ms"/>${nameStr}Back already? <break time="150ms"/>Good to see you again.`,
    `<break time="200ms"/>Hey ${nameStr}again! <break time="150ms"/>What's up?`,
    `<emotion value="happy"/><break time="200ms"/>${nameStr}You're back! <break time="150ms"/>What's going on?`,
    `<break time="200ms"/>Oh! <break time="150ms"/>${nameStr}<break time="100ms"/>Good to see you again so soon.`,
  ];

  const greeting = greetings[Math.floor(Math.random() * greetings.length)];

  return {
    greeting,
    reason: 'Recent return within 24 hours',
    type: 'returning_recent',
    ssmlTagged: true,
  };
}

function generateReturningFamiliarOpener(
  persona: PersonaConfig,
  context: OpenerContext
): ConversationOpener {
  const { userName } = context;
  const daysSince = context.lastConversationDate
    ? daysSinceLastConversation(context.lastConversationDate)
    : 1;

  const timeRef = daysSince === 1 ? 'yesterday' : `the other day`;

  let greeting: string;

  if (userName) {
    const greetings = [
      `<emotion value="happy"/><break time="200ms"/>${userName}! <break time="150ms"/>Good to hear from you again.`,
      `<break time="200ms"/>Hey ${userName}! <break time="150ms"/>How've you been since ${timeRef}?`,
      `<emotion value="affectionate"/><break time="200ms"/>${userName}, <break time="150ms"/>welcome back! <break time="100ms"/>How are things?`,
    ];
    greeting = greetings[Math.floor(Math.random() * greetings.length)];
  } else {
    const greetings = [
      `<emotion value="happy"/><break time="200ms"/>Hey! <break time="150ms"/>Good to see you again.`,
      `<break time="200ms"/>Welcome back! <break time="150ms"/>How've you been?`,
      `<emotion value="affectionate"/><break time="200ms"/>There you are! <break time="150ms"/>How are things?`,
    ];
    greeting = greetings[Math.floor(Math.random() * greetings.length)];
  }

  return {
    greeting,
    reason: `Returning user, ${daysSince} days since last conversation`,
    type: 'returning_familiar',
    ssmlTagged: true,
  };
}

function generateReconnectOpener(
  persona: PersonaConfig,
  context: OpenerContext
): ConversationOpener {
  const { userName } = context;
  const daysSince = context.lastConversationDate
    ? daysSinceLastConversation(context.lastConversationDate)
    : 30;

  const timeRef = daysSince > 60 ? 'a while' : 'a few weeks';

  let greeting: string;

  if (userName) {
    const greetings = [
      `<emotion value="happy"/><break time="200ms"/>${userName}! <break time="150ms"/>It's been ${timeRef}. <break time="100ms"/>How have you been?`,
      `<break time="200ms"/>Well! <break time="150ms"/>${userName}! <break time="100ms"/>I was hoping you'd come back.`,
      `<emotion value="affectionate"/><break time="200ms"/>${userName}, <break time="150ms"/>so good to hear from you again. <break time="100ms"/>What's new?`,
    ];
    greeting = greetings[Math.floor(Math.random() * greetings.length)];
  } else {
    const greetings = [
      `<emotion value="happy"/><break time="200ms"/>Hey! <break time="150ms"/>It's been a while. <break time="100ms"/>How have you been?`,
      `<break time="200ms"/>Well, well! <break time="150ms"/>Good to see you again. <break time="100ms"/>What brings you back?`,
    ];
    greeting = greetings[Math.floor(Math.random() * greetings.length)];
  }

  return {
    greeting,
    reason: `Reconnecting after ${daysSince} days`,
    type: 'returning_reconnect',
    ssmlTagged: true,
  };
}

function generateMemoryCallbackOpener(
  persona: PersonaConfig,
  context: OpenerContext
): ConversationOpener {
  const userName = context.userName || '';
  const nameStr = userName ? `${userName}, ` : '';

  let greeting: string;
  let followUp: string | undefined;

  // Reference goals
  if (context.goals && context.goals.length > 0) {
    const goal = context.goals[0];
    greeting = `<emotion value="happy"/><break time="200ms"/>Hey ${nameStr}! <break time="150ms"/>Good to see you.`;
    followUp = `<break time="200ms"/>I was thinking about your ${goal.name || goal.type} goal. <break time="150ms"/>How's that coming along?`;
  }
  // Reference concerns
  else if (context.primaryConcerns && context.primaryConcerns.length > 0) {
    const concern = context.primaryConcerns[0];
    greeting = `<emotion value="affectionate"/><break time="200ms"/>${nameStr}Welcome back!`;
    followUp = `<break time="200ms"/>I remember you mentioned ${concern}. <break time="150ms"/>How are things going with that?`;
  }
  // Reference last conversation
  else if (context.lastConversationSummary) {
    greeting = `<emotion value="happy"/><break time="200ms"/>Hey ${nameStr}! <break time="150ms"/>Good to hear from you.`;
    followUp = `<break time="200ms"/>Last time we talked about ${context.lastConversationSummary.split('.')[0].toLowerCase()}. <break time="150ms"/>Any updates?`;
  }
  // Fallback
  else {
    greeting = `<emotion value="happy"/><break time="200ms"/>Hey ${nameStr}! <break time="150ms"/>Good to see you again.`;
  }

  return {
    greeting,
    followUp,
    reason: 'Memory callback - referencing past conversation',
    type: 'memory_callback',
    ssmlTagged: true,
  };
}

function generateThreadContinuityOpener(
  persona: PersonaConfig,
  context: OpenerContext
): ConversationOpener {
  const userName = context.userName || '';
  const nameStr = userName ? `${userName}, ` : '';

  const question = context.openQuestions?.[0] || 'what we discussed';

  const greetings = [
    `<emotion value="curious"/><break time="200ms"/>Hey ${nameStr}! <break time="150ms"/>I've been curious—<break time="100ms"/>did you figure out ${question}?`,
    `<break time="200ms"/>${nameStr}Welcome back! <break time="150ms"/>I was wondering how things went with ${question}.`,
    `<emotion value="happy"/><break time="200ms"/>Hey! <break time="150ms"/>Before we start—<break time="100ms"/>what happened with ${question}?`,
  ];

  const greeting = greetings[Math.floor(Math.random() * greetings.length)];

  return {
    greeting,
    reason: 'Thread continuity - following up on open question',
    type: 'thread_continuity',
    ssmlTagged: true,
  };
}

function generateTimeAwareOpener(
  persona: PersonaConfig,
  context: OpenerContext
): ConversationOpener {
  const time = getTimeOfDay();
  const day = getDayOfWeek();
  const userName = context.userName || '';
  const nameStr = userName ? `, ${userName}` : '';

  let greeting: string;

  if (time === 'early_morning') {
    const greetings = [
      `<volume ratio="0.75"/><break time="200ms"/>Early bird${nameStr}. <break time="150ms"/>I respect that.`,
      `<volume ratio="0.75"/><break time="200ms"/>Up before the world${nameStr}? <break time="150ms"/>What's on your mind?`,
    ];
    greeting = greetings[Math.floor(Math.random() * greetings.length)];
  } else if (time === 'late_night') {
    const greetings = [
      `<volume ratio="0.75"/><break time="200ms"/>Burning the midnight oil${nameStr}? <break time="150ms"/>I'm here.`,
      `<volume ratio="0.75"/><break time="200ms"/>Late night${nameStr}. <break time="150ms"/>Can't sleep, or just thinking?`,
    ];
    greeting = greetings[Math.floor(Math.random() * greetings.length)];
  } else if (day === 'weekend') {
    const greetings = [
      `<emotion value="happy"/><break time="200ms"/>Weekend${nameStr}! <break time="150ms"/>Taking time for yourself?`,
      `<break time="200ms"/>Ah, the weekend${nameStr}. <break time="150ms"/>What's going on?`,
    ];
    greeting = greetings[Math.floor(Math.random() * greetings.length)];
  } else if (day === 'monday') {
    const greetings = [
      `<break time="200ms"/>Monday${nameStr}! <break time="150ms"/>Starting the week right.`,
      `<emotion value="affectionate"/><break time="200ms"/>Monday${nameStr}. <break time="150ms"/>How's the week starting?`,
    ];
    greeting = greetings[Math.floor(Math.random() * greetings.length)];
  } else if (day === 'friday') {
    const greetings = [
      `<emotion value="happy"/><break time="200ms"/>Friday${nameStr}! <break time="150ms"/>Almost made it through the week.`,
      `<break time="200ms"/>Friday${nameStr}. <break time="150ms"/>Any big plans?`,
    ];
    greeting = greetings[Math.floor(Math.random() * greetings.length)];
  } else {
    greeting = `<break time="200ms"/>Hey${nameStr}! <break time="150ms"/>What's going on?`;
  }

  return {
    greeting,
    reason: `Time-aware: ${time}, ${day}`,
    type: 'time_aware',
    ssmlTagged: true,
  };
}

function generateSeasonalOpener(
  persona: PersonaConfig,
  context: OpenerContext
): ConversationOpener {
  const season = getSeason();
  const userName = context.userName || '';
  const nameStr = userName ? `, ${userName}` : '';

  const seasonalGreetings: Record<string, string[]> = {
    spring: [
      `<emotion value="happy"/><break time="200ms"/>Ah${nameStr}, spring! <break time="150ms"/>New beginnings. <break time="100ms"/>What's on your mind?`,
    ],
    summer: [
      `<break time="200ms"/>Summer${nameStr}! <break time="150ms"/>Hope you're enjoying it. <break time="100ms"/>What brings you here?`,
    ],
    fall: [
      `<emotion value="affectionate"/><break time="200ms"/>Fall${nameStr}. <break time="150ms"/>Good time for reflection. <break time="100ms"/>What's on your mind?`,
    ],
    winter: [
      `<volume ratio="0.75"/><break time="200ms"/>Winter${nameStr}. <break time="150ms"/>Cozy time for deep conversations. <break time="100ms"/>What's going on?`,
    ],
  };

  const greetings = seasonalGreetings[season];
  const greeting = greetings[Math.floor(Math.random() * greetings.length)];

  return {
    greeting,
    reason: `Seasonal: ${season}`,
    type: 'seasonal',
    ssmlTagged: true,
  };
}

function generateCalendarAwareOpener(
  persona: PersonaConfig,
  context: OpenerContext
): ConversationOpener {
  const userName = context.userName || '';
  const nameStr = userName ? `${userName}, ` : '';
  const event = context.upcomingEvents?.[0] || 'something coming up';

  const greetings = [
    `<emotion value="curious"/><break time="200ms"/>Hey ${nameStr}! <break time="150ms"/>I noticed you have ${event} coming up. <break time="100ms"/>How are you feeling about it?`,
    `<break time="200ms"/>${nameStr}Welcome! <break time="150ms"/>With ${event} approaching, <break time="100ms"/>what's on your mind?`,
  ];

  const greeting = greetings[Math.floor(Math.random() * greetings.length)];

  return {
    greeting,
    reason: `Calendar-aware: ${event}`,
    type: 'calendar_aware',
    ssmlTagged: true,
  };
}

/**
 * BETTER-THAN-HUMAN: Follow up on stated intentions
 *
 * This is the "How did your interview go?" or "Did you end up sending that email?"
 * moment that creates the "they actually remember" feeling.
 */
function generateIntentionFollowupOpener(
  persona: PersonaConfig,
  context: OpenerContext
): ConversationOpener {
  const userName = context.userName || '';
  const nameStr = userName ? `${userName}` : '';

  // Find the most relevant intention to follow up on
  const intention = context.pendingIntentions?.[0];
  if (!intention) {
    // Fallback to regular greeting
    return generateReturningFamiliarOpener(persona, context);
  }

  // Clean up the intention text for natural speech
  const intentionText = intention.intention
    .replace(/^(call|email|text|talk to|ask|send|finish|start)\s+/i, '')
    .slice(0, 60);

  // Different phrasings based on how much time has passed
  const now = new Date();
  const hoursSince = (now.getTime() - new Date(intention.statedAt).getTime()) / (1000 * 60 * 60);

  let greetings: string[];

  if (hoursSince < 24) {
    // Recent intention - casual follow-up
    greetings = [
      `<emotion value="curious"/><break time="200ms"/>Hey ${nameStr}! <break time="150ms"/>How did it go with ${intentionText}?`,
      `<break time="200ms"/>${nameStr}! <break time="150ms"/>Did you end up ${intention.intention.startsWith('call') ? 'calling' : 'doing that thing with'} ${intentionText}?`,
      `<emotion value="happy"/><break time="200ms"/>Hey! <break time="150ms"/>I was thinking about you—<break time="100ms"/>how'd ${intentionText} go?`,
    ];
  } else if (hoursSince < 72) {
    // Few days - more direct follow-up
    greetings = [
      `<emotion value="curious"/><break time="200ms"/>Hey ${nameStr}! <break time="150ms"/>I've been curious—<break time="100ms"/>what happened with ${intentionText}?`,
      `<break time="200ms"/>${nameStr}! <break time="150ms"/>Remember when you mentioned ${intentionText}? <break time="100ms"/>How'd that turn out?`,
      `<emotion value="affectionate"/><break time="200ms"/>Hey! <break time="150ms"/>I keep thinking about ${intentionText}. <break time="100ms"/>Any update?`,
    ];
  } else {
    // Longer time - gentle check-in
    greetings = [
      `<break time="200ms"/>Hey ${nameStr}! <break time="150ms"/>You mentioned ${intentionText} a while back. <break time="100ms"/>How's that going?`,
      `<emotion value="affectionate"/><break time="200ms"/>${nameStr}! <break time="150ms"/>I was thinking about that thing with ${intentionText}. <break time="100ms"/>Did it work out?`,
    ];
  }

  const greeting = greetings[Math.floor(Math.random() * greetings.length)];

  return {
    greeting,
    reason: `BETTER-THAN-HUMAN: Following up on intention "${intention.intention.slice(0, 30)}..."`,
    type: 'intention_followup',
    ssmlTagged: true,
  };
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build opener context from user profile
 */
export function buildOpenerContext(
  profile: UserProfile | null,
  isReturningUser: boolean
): OpenerContext {
  if (!profile) {
    return { isReturningUser };
  }

  return {
    isReturningUser,
    userName: profile.name,
    lastConversationDate: profile.lastContact ? new Date(profile.lastContact) : undefined,
    lastConversationSummary: undefined, // Not stored in UserProfile
    openQuestions: undefined, // Not stored in UserProfile
    goals: profile.goals,
    primaryConcerns: profile.primaryConcerns,
  };
}

export default { generateProactiveOpener, buildOpenerContext };
