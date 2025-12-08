/**
 * Intelligent Conversation Starters
 *
 * Generates context-aware, personalized conversation openers
 * based on trust history, recent events, and relationship stage.
 *
 * Philosophy: A great friend doesn't just say "how are you?" -
 * they remember what matters and ask the right questions.
 *
 * Starter Types:
 * - Follow-up: "How did that thing go?"
 * - Callback: "Remember when you mentioned X?"
 * - Celebration: "I bet you crushed that presentation!"
 * - Gentle check-in: "Been thinking about you"
 * - Growth acknowledgment: "I've noticed something..."
 * - Random warmth: "Just wanted to say..."
 *
 * @module ConversationStarters
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ConversationStarters' });

// ============================================================================
// TYPES
// ============================================================================

export type StarterType =
  | 'follow_up'
  | 'callback'
  | 'celebration'
  | 'gentle_check_in'
  | 'growth'
  | 'random_warmth'
  | 'time_sensitive'
  | 'milestone';

export interface ConversationStarter {
  id: string;
  type: StarterType;
  text: string;
  ssml: string;
  context: string;
  confidence: number;
  priority: number;
  relevantUntil?: Date;
  metadata: {
    triggerTopic?: string;
    triggerEvent?: string;
    callbackMomentId?: string;
    growthPatternId?: string;
  };
}

export interface UserContext {
  userId: string;
  lastSession?: Date;
  recentTopics?: string[];
  pendingFollowUps?: PendingFollowUp[];
  upcomingEvents?: UpcomingEvent[];
  recentWins?: string[];
  currentStruggles?: string[];
  growthPatterns?: GrowthPattern[];
  callbackMoments?: CallbackMoment[];
  relationshipStage?: 'new' | 'building' | 'established' | 'deep' | 'flourishing';
  lastEmotionalState?: string;
  userName?: string;
}

export interface PendingFollowUp {
  id: string;
  topic: string;
  question: string;
  mentionedAt: Date;
  importance: 'high' | 'medium' | 'low';
  category: string;
}

export interface UpcomingEvent {
  id: string;
  description: string;
  date: Date;
  type: 'deadline' | 'appointment' | 'milestone' | 'event';
  userAnticipation?: 'excited' | 'nervous' | 'dreading' | 'neutral';
}

export interface GrowthPattern {
  id: string;
  type: string;
  description: string;
  reflectedYet: boolean;
}

export interface CallbackMoment {
  id: string;
  type: string;
  content: string;
  strength: number;
  lastUsed?: Date;
}

// ============================================================================
// TEMPLATES
// ============================================================================

const TEMPLATES: Record<StarterType, string[]> = {
  follow_up: [
    "Hey! I've been wondering - how did {topic} go?",
    "So... {topic}. How'd that turn out?",
    'I remembered you had {topic} coming up. How was it?',
    "Tell me about {topic}! I've been curious.",
    'Last time you mentioned {topic}. What happened?',
  ],

  callback: [
    'You know what I was just thinking about? That time you said {callback}.',
    'Remember when you told me about {callback}? That stuck with me.',
    "Something reminded me of {callback}. How's that going?",
    'I keep thinking about what you said - {callback}.',
  ],

  celebration: [
    'I have a feeling {event} went really well! Tell me everything.',
    'I bet you absolutely crushed {event}!',
    "So... {event}. I'm guessing good news?",
    "I've been excited to hear about {event}!",
  ],

  gentle_check_in: [
    'Hey. Just wanted to check in. How are you really doing?',
    'Been thinking about you. Everything okay?',
    'No agenda today - just wanted to hear your voice.',
    'How are you? And I mean really.',
    "Just checking in. What's on your mind lately?",
  ],

  growth: [
    "I've noticed something. You've been {growth} lately.",
    "Can I share an observation? I've seen you {growth}.",
    "Something I've been meaning to say - you've really {growth}.",
  ],

  random_warmth: [
    "Hey! Just glad you're here.",
    'You know what? I appreciate you.',
    'No specific reason for reaching out - just wanted to connect.',
    "It's good to hear from you.",
    "I've been looking forward to talking.",
  ],

  time_sensitive: [
    '{event} is coming up soon! How are you feeling about it?',
    "With {event} around the corner, what's on your mind?",
    'I know {event} is approaching. Anything you want to talk through?',
    'Big day coming up - {event}. Ready for it?',
  ],

  milestone: [
    "Wow - we've been talking for {milestone}. That means a lot to me.",
    "You know, it's been {milestone} since we started. Thank you for trusting me.",
    "I just realized - {milestone}! Here's to many more conversations.",
  ],
};

// ============================================================================
// STARTER GENERATION
// ============================================================================

/**
 * Generate conversation starters based on user context
 */
export function generateStarters(context: UserContext): ConversationStarter[] {
  const starters: ConversationStarter[] = [];
  const now = new Date();

  // 1. Time-sensitive events (highest priority)
  if (context.upcomingEvents) {
    for (const event of context.upcomingEvents) {
      const daysUntil = (event.date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

      // Only if within 3 days
      if (daysUntil > 0 && daysUntil <= 3) {
        const starter = generateTimeSensitiveStarter(event, context);
        if (starter) starters.push(starter);
      }
    }
  }

  // 2. Follow-ups from last session
  if (context.pendingFollowUps) {
    for (const followUp of context.pendingFollowUps.slice(0, 2)) {
      const starter = generateFollowUpStarter(followUp, context);
      if (starter) starters.push(starter);
    }
  }

  // 3. Recent wins to celebrate
  if (context.recentWins?.length) {
    const winStarter = generateCelebrationStarter(context.recentWins[0], context);
    if (winStarter) starters.push(winStarter);
  }

  // 4. Growth patterns to acknowledge
  if (context.growthPatterns) {
    const unReflected = context.growthPatterns.find((p) => !p.reflectedYet);
    if (unReflected) {
      const growthStarter = generateGrowthStarter(unReflected, context);
      if (growthStarter) starters.push(growthStarter);
    }
  }

  // 5. Callbacks based on relationship depth
  if (context.callbackMoments && context.relationshipStage !== 'new') {
    const callback = selectBestCallback(context.callbackMoments, context);
    if (callback) {
      const callbackStarter = generateCallbackStarter(callback, context);
      if (callbackStarter) starters.push(callbackStarter);
    }
  }

  // 6. Gentle check-in if last session had emotional content
  if (
    context.lastEmotionalState &&
    ['sad', 'anxious', 'stressed', 'overwhelmed'].includes(context.lastEmotionalState)
  ) {
    const checkInStarter = generateGentleCheckIn(context);
    if (checkInStarter) starters.push(checkInStarter);
  }

  // 7. Random warmth (lower priority, always available)
  const warmthStarter = generateRandomWarmth(context);
  if (warmthStarter) starters.push(warmthStarter);

  // Sort by priority and confidence
  starters.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return b.confidence - a.confidence;
  });

  log.debug(
    { userId: context.userId, starterCount: starters.length },
    '💬 Generated conversation starters'
  );

  return starters;
}

/**
 * Generate time-sensitive starter
 */
function generateTimeSensitiveStarter(
  event: UpcomingEvent,
  context: UserContext
): ConversationStarter | null {
  const template = selectTemplate('time_sensitive');
  const text = template.replace('{event}', event.description);

  return {
    id: `time-${event.id}-${Date.now()}`,
    type: 'time_sensitive',
    text,
    ssml: textToSSML(text, 'warm'),
    context: `Upcoming: ${event.description}`,
    confidence: 0.9,
    priority: 10, // Highest priority
    relevantUntil: event.date,
    metadata: { triggerEvent: event.id },
  };
}

/**
 * Generate follow-up starter
 */
function generateFollowUpStarter(
  followUp: PendingFollowUp,
  context: UserContext
): ConversationStarter | null {
  const template = selectTemplate('follow_up');
  const text = template.replace('{topic}', followUp.topic);

  const priorityMap = { high: 8, medium: 6, low: 4 };

  return {
    id: `followup-${followUp.id}-${Date.now()}`,
    type: 'follow_up',
    text,
    ssml: textToSSML(text, 'curious'),
    context: `Following up on: ${followUp.topic}`,
    confidence: 0.85,
    priority: priorityMap[followUp.importance],
    metadata: { triggerTopic: followUp.topic },
  };
}

/**
 * Generate celebration starter
 */
function generateCelebrationStarter(win: string, context: UserContext): ConversationStarter | null {
  const template = selectTemplate('celebration');
  const text = template.replace('{event}', win);

  return {
    id: `celebrate-${Date.now()}`,
    type: 'celebration',
    text,
    ssml: textToSSML(text, 'excited'),
    context: `Celebrating: ${win}`,
    confidence: 0.8,
    priority: 7,
    metadata: { triggerTopic: win },
  };
}

/**
 * Generate growth acknowledgment starter
 */
function generateGrowthStarter(
  pattern: GrowthPattern,
  context: UserContext
): ConversationStarter | null {
  // Only share growth observations in established+ relationships
  if (context.relationshipStage === 'new' || context.relationshipStage === 'building') {
    return null;
  }

  const template = selectTemplate('growth');
  const text = template.replace('{growth}', pattern.description);

  return {
    id: `growth-${pattern.id}-${Date.now()}`,
    type: 'growth',
    text,
    ssml: textToSSML(text, 'thoughtful'),
    context: `Noticing growth: ${pattern.type}`,
    confidence: 0.75,
    priority: 5,
    metadata: { growthPatternId: pattern.id },
  };
}

/**
 * Generate callback starter
 */
function generateCallbackStarter(
  moment: CallbackMoment,
  context: UserContext
): ConversationStarter | null {
  // Don't use callbacks too frequently
  if (moment.lastUsed) {
    const daysSinceLastUse = (Date.now() - moment.lastUsed.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastUse < 14) return null; // Wait 2 weeks between uses
  }

  const template = selectTemplate('callback');
  const text = template.replace('{callback}', moment.content.slice(0, 50));

  return {
    id: `callback-${moment.id}-${Date.now()}`,
    type: 'callback',
    text,
    ssml: textToSSML(text, 'reminiscent'),
    context: `Callback: ${moment.type}`,
    confidence: moment.strength,
    priority: 4,
    metadata: { callbackMomentId: moment.id },
  };
}

/**
 * Generate gentle check-in
 */
function generateGentleCheckIn(context: UserContext): ConversationStarter | null {
  const template = selectTemplate('gentle_check_in');

  return {
    id: `checkin-${Date.now()}`,
    type: 'gentle_check_in',
    text: template,
    ssml: textToSSML(template, 'caring'),
    context: `Checking in after: ${context.lastEmotionalState}`,
    confidence: 0.85,
    priority: 6,
    metadata: {},
  };
}

/**
 * Generate random warmth
 */
function generateRandomWarmth(context: UserContext): ConversationStarter {
  const template = selectTemplate('random_warmth');

  return {
    id: `warmth-${Date.now()}`,
    type: 'random_warmth',
    text: template,
    ssml: textToSSML(template, 'warm'),
    context: 'General warmth',
    confidence: 1.0,
    priority: 1, // Lowest priority (fallback)
    metadata: {},
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Select a random template
 */
function selectTemplate(type: StarterType): string {
  const templates = TEMPLATES[type];
  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * Select best callback based on strength and recency
 */
function selectBestCallback(
  moments: CallbackMoment[],
  context: UserContext
): CallbackMoment | null {
  // Filter out recently used
  const usable = moments.filter((m) => {
    if (!m.lastUsed) return true;
    const daysSinceUse = (Date.now() - m.lastUsed.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceUse >= 14;
  });

  if (usable.length === 0) return null;

  // Sort by strength
  usable.sort((a, b) => b.strength - a.strength);

  return usable[0];
}

/**
 * Convert text to SSML with emotion
 */
function textToSSML(
  text: string,
  emotion: 'warm' | 'curious' | 'excited' | 'caring' | 'thoughtful' | 'reminiscent'
): string {
  const prosodyMap: Record<string, { rate: string; pitch: string }> = {
    warm: { rate: '95%', pitch: '-2%' },
    curious: { rate: '100%', pitch: '+2%' },
    excited: { rate: '105%', pitch: '+5%' },
    caring: { rate: '90%', pitch: '-3%' },
    thoughtful: { rate: '90%', pitch: '0%' },
    reminiscent: { rate: '95%', pitch: '-1%' },
  };

  const prosody = prosodyMap[emotion] || prosodyMap.warm;

  return `<speak>
    <prosody rate="${prosody.rate}" pitch="${prosody.pitch}">
      ${text}
    </prosody>
  </speak>`;
}

/**
 * Get the best starter for a greeting
 */
export function getBestStarter(context: UserContext): ConversationStarter {
  const starters = generateStarters(context);
  return starters[0]; // Already sorted by priority
}

/**
 * Mark a starter as used
 */
export function markStarterUsed(
  userId: string,
  starterId: string,
  reception: 'positive' | 'neutral' | 'negative'
): void {
  log.debug({ userId, starterId, reception }, '📝 Starter usage recorded');
  // In production, this would update the callback moment's lastUsed
  // and potentially adjust future selection based on reception
}

/**
 * Generate a personalized greeting based on context
 */
export function generateGreeting(context: UserContext): {
  greeting: string;
  ssml: string;
  starter?: ConversationStarter;
} {
  const name = context.userName;
  const timeSinceLastSession = context.lastSession
    ? (Date.now() - context.lastSession.getTime()) / (1000 * 60 * 60 * 24)
    : null;

  let greeting: string;

  // Time-based greeting adjustments
  if (timeSinceLastSession === null || timeSinceLastSession > 30) {
    // New or returning after long break
    greeting = name ? `Hey ${name}! Great to hear from you.` : "Hey! It's good to connect.";
  } else if (timeSinceLastSession > 7) {
    greeting = name
      ? `Hey ${name}! Been a bit - I've been thinking about you.`
      : 'Hey! Been a little while - good to reconnect.';
  } else if (timeSinceLastSession > 1) {
    greeting = name ? `Hey ${name}! Good to have you back.` : 'Hey! Welcome back.';
  } else {
    greeting = name ? `Hey ${name}!` : 'Hey there!';
  }

  // Get a contextual starter to follow the greeting
  const starter = getBestStarter(context);

  // Combine greeting with starter if it's high-priority
  const fullGreeting = starter.priority >= 6 ? `${greeting} ${starter.text}` : greeting;

  return {
    greeting: fullGreeting,
    ssml: textToSSML(fullGreeting, 'warm'),
    starter: starter.priority >= 6 ? starter : undefined,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateStarters,
  getBestStarter,
  markStarterUsed,
  generateGreeting,
};
