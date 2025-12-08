/**
 * "Thinking of You" Proactive Outreach
 *
 * Reaching out with no agenda - just because you crossed my mind.
 *
 * Philosophy: The most meaningful check-ins aren't scheduled or triggered
 * by due dates. They're the random "I was thinking about you" moments
 * that show someone genuinely cares.
 *
 * This system generates:
 * - No-agenda check-ins based on things they shared
 * - "I saw something that reminded me of you"
 * - "I've been thinking about what you said"
 * - Random warmth without ulterior motive
 *
 * @module ThinkingOfYou
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ThinkingOfYou' });

// ============================================================================
// TYPES
// ============================================================================

export interface ThinkingOfYouMoment {
  id: string;

  /** Type of outreach */
  type:
    | 'genuine_check_in' // Just wondering how they're doing
    | 'thought_of_you' // Something reminded me of them
    | 'following_thread' // Continuing something they shared
    | 'celebrating_quietly' // Something good might have happened
    | 'holding_space' // Something hard might be happening
    | 'random_warmth'; // Just because

  /** What triggered this thought */
  trigger: {
    type: 'time_based' | 'topic_based' | 'date_based' | 'random';
    context?: string;
    theirWords?: string;
  };

  /** The outreach message */
  message: string;

  /** SSML version for voice */
  ssml: string;

  /** When this should be sent */
  suggestedTiming: Date;

  /** Priority (affects when it actually sends) */
  priority: 'high' | 'medium' | 'low';

  /** Whether this has been sent */
  sent: boolean;

  /** Response received */
  responseReceived?: boolean;
}

export interface SignificantShare {
  id: string;

  /** What they shared */
  content: string;

  /** When they shared it */
  sharedAt: Date;

  /** Topic category */
  topic: string;

  /** Emotional weight of what they shared */
  emotionalWeight: 'light' | 'medium' | 'heavy';

  /** Key people mentioned */
  peopleMentioned: string[];

  /** If there's a date associated (event, deadline, etc.) */
  associatedDate?: Date;

  /** What kind of follow-up might be appropriate */
  followUpType: 'check_in' | 'celebrate' | 'support' | 'remember';
}

export interface ThinkingOfYouProfile {
  userId: string;

  /** Significant things they've shared */
  significantShares: SignificantShare[];

  /** Generated but not-yet-sent moments */
  pendingMoments: ThinkingOfYouMoment[];

  /** Sent moments (for avoiding repetition) */
  sentMoments: ThinkingOfYouMoment[];

  /** Preferences about unsolicited outreach */
  preferences: {
    enabled: boolean;
    maxPerWeek: number;
    preferredMethod: 'voice' | 'text' | 'either';
    quietDays: string[]; // e.g., ['saturday', 'sunday']
  };

  /** Last time we reached out with no agenda */
  lastNoAgendaOutreach?: Date;
}

// ============================================================================
// TOPIC PATTERNS
// ============================================================================

/** Heavy topics that warrant "holding space" outreach */
const HEAVY_TOPICS = [
  'health',
  'family conflict',
  'loss',
  'grief',
  'job loss',
  'relationship trouble',
  'anxiety',
  'depression',
  'stress',
  'burnout',
  'divorce',
  'illness',
  'financial stress',
];

/** Topics that might have positive resolution worth checking on */
const HOPEFUL_TOPICS = [
  'interview',
  'date',
  'presentation',
  'meeting',
  'conversation',
  'decision',
  'test',
  'results',
  'appointment',
  'trip',
  'event',
];

/** Phrases indicating something upcoming */
const UPCOMING_PATTERNS = [
  /(?:have|got) (?:a|an|the) (.+?) (?:tomorrow|next week|coming up|on \w+day)/i,
  /(?:nervous|excited|anxious) about (?:the|my|a) (.+)/i,
  /(?:my|the) (.+?) is (?:tomorrow|next week|coming up|on \w+day)/i,
];

// ============================================================================
// IN-MEMORY STORE
// ============================================================================

const profiles = new Map<string, ThinkingOfYouProfile>();

function getOrCreateProfile(userId: string): ThinkingOfYouProfile {
  let profile = profiles.get(userId);
  if (!profile) {
    profile = {
      userId,
      significantShares: [],
      pendingMoments: [],
      sentMoments: [],
      preferences: {
        enabled: true,
        maxPerWeek: 2,
        preferredMethod: 'either',
        quietDays: [],
      },
    };
    profiles.set(userId, profile);
  }
  return profile;
}

// ============================================================================
// SIGNIFICANT SHARE DETECTION
// ============================================================================

/**
 * Analyze a message for significant shares worth following up on
 */
export function detectSignificantShare(
  userId: string,
  userMessage: string,
  context: {
    topic?: string;
    emotion?: string;
    emotionIntensity?: number;
  }
): SignificantShare | null {
  const profile = getOrCreateProfile(userId);
  const lower = userMessage.toLowerCase();

  // Check for heavy topics
  const isHeavy = HEAVY_TOPICS.some((t) => lower.includes(t));

  // Check for upcoming events
  let upcomingEvent: string | null = null;
  for (const pattern of UPCOMING_PATTERNS) {
    const match = lower.match(pattern);
    if (match && match[1]) {
      upcomingEvent = match[1];
      break;
    }
  }

  // Check for significant emotional intensity
  const isEmotionallySignificant =
    context.emotionIntensity && context.emotionIntensity > 0.7;

  // Extract people mentioned
  const peopleMentioned = extractPeopleMentioned(userMessage);

  // Determine if this is worth tracking
  const shouldTrack =
    isHeavy ||
    upcomingEvent ||
    isEmotionallySignificant ||
    peopleMentioned.length > 0;

  if (!shouldTrack) return null;

  // Determine follow-up type
  let followUpType: SignificantShare['followUpType'] = 'check_in';
  if (isHeavy) followUpType = 'support';
  else if (upcomingEvent && HOPEFUL_TOPICS.some((t) => upcomingEvent!.includes(t))) {
    followUpType = 'celebrate';
  }

  const share: SignificantShare = {
    id: `share_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    content: userMessage.slice(0, 300),
    sharedAt: new Date(),
    topic: context.topic || extractTopic(lower),
    emotionalWeight: isHeavy ? 'heavy' : isEmotionallySignificant ? 'medium' : 'light',
    peopleMentioned,
    followUpType,
  };

  // If there's an upcoming event, try to parse the date
  if (upcomingEvent) {
    share.associatedDate = parseUpcomingDate(lower);
  }

  profile.significantShares.push(share);

  // Keep only last 30 shares
  if (profile.significantShares.length > 30) {
    profile.significantShares = profile.significantShares.slice(-30);
  }

  log.debug(
    { userId, topic: share.topic, followUpType, weight: share.emotionalWeight },
    '💭 Significant share detected'
  );

  return share;
}

/**
 * Extract topic from message
 */
function extractTopic(message: string): string {
  // Simple extraction - could be enhanced
  const topics = [
    'work',
    'family',
    'health',
    'relationship',
    'money',
    'friends',
    'career',
    'home',
  ];

  for (const topic of topics) {
    if (message.includes(topic)) return topic;
  }

  return 'life';
}

/**
 * Extract names of people mentioned
 */
function extractPeopleMentioned(message: string): string[] {
  const people: string[] = [];

  // Pattern: "my [relationship] [name]" or "[name]'s"
  const patterns = [
    /my (?:mom|dad|sister|brother|wife|husband|partner|friend|boss) (\w+)/gi,
    /(\w+)'s /g,
    /(?:called|texted|talked to|met with) (\w+)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(message)) !== null) {
      const name = match[1];
      if (name && name.length > 2 && name.length < 20) {
        people.push(name);
      }
    }
  }

  return [...new Set(people)];
}

/**
 * Parse a relative date from text
 */
function parseUpcomingDate(text: string): Date | undefined {
  const now = new Date();

  if (text.includes('tomorrow')) {
    return new Date(now.setDate(now.getDate() + 1));
  } else if (text.includes('next week')) {
    return new Date(now.setDate(now.getDate() + 7));
  }

  // Try to find day of week
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < days.length; i++) {
    if (text.includes(days[i])) {
      const today = now.getDay();
      const diff = (i - today + 7) % 7 || 7;
      return new Date(now.setDate(now.getDate() + diff));
    }
  }

  return undefined;
}

// ============================================================================
// MOMENT GENERATION
// ============================================================================

/**
 * Generate "thinking of you" moments based on stored shares
 */
export function generateThinkingOfYouMoments(userId: string): ThinkingOfYouMoment[] {
  const profile = profiles.get(userId);
  if (!profile || profile.significantShares.length === 0) return [];

  const moments: ThinkingOfYouMoment[] = [];
  const now = new Date();

  for (const share of profile.significantShares) {
    // Skip if we've recently reached out
    if (
      profile.lastNoAgendaOutreach &&
      now.getTime() - profile.lastNoAgendaOutreach.getTime() < 24 * 60 * 60 * 1000
    ) {
      continue;
    }

    // Skip if we've already generated a moment for this share
    const existingMoment = profile.pendingMoments.find(
      (m) => m.trigger.context?.includes(share.id)
    );
    if (existingMoment) continue;

    const moment = createMomentFromShare(share, userId);
    if (moment) {
      moments.push(moment);
      profile.pendingMoments.push(moment);
    }
  }

  return moments;
}

/**
 * Create a "thinking of you" moment from a significant share
 */
function createMomentFromShare(
  share: SignificantShare,
  userId: string
): ThinkingOfYouMoment | null {
  const now = new Date();

  // Determine timing based on share type
  let suggestedTiming: Date;
  let type: ThinkingOfYouMoment['type'];
  let message: string;

  switch (share.followUpType) {
    case 'support':
      // Heavy topics - check in after a day or two
      suggestedTiming = new Date(share.sharedAt.getTime() + 2 * 24 * 60 * 60 * 1000);
      type = 'holding_space';
      message = createSupportMessage(share);
      break;

    case 'celebrate':
      // Upcoming event - check in day after
      if (share.associatedDate) {
        suggestedTiming = new Date(share.associatedDate.getTime() + 24 * 60 * 60 * 1000);
      } else {
        suggestedTiming = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      }
      type = 'celebrating_quietly';
      message = createCelebrateMessage(share);
      break;

    case 'remember':
      // Associated date - reach out on that day
      if (share.associatedDate) {
        suggestedTiming = share.associatedDate;
      } else {
        return null;
      }
      type = 'following_thread';
      message = createRememberMessage(share);
      break;

    default:
      // Generic check-in
      suggestedTiming = new Date(share.sharedAt.getTime() + 3 * 24 * 60 * 60 * 1000);
      type = 'genuine_check_in';
      message = createCheckInMessage(share);
  }

  // Don't create moments for the past
  if (suggestedTiming < now) {
    return null;
  }

  // Create SSML
  const ssml = message
    .replace(/\. /g, '. <break time="300ms"/>')
    .replace(/\?/g, '? <break time="400ms"/>');

  return {
    id: `moment_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    trigger: {
      type: share.associatedDate ? 'date_based' : 'topic_based',
      context: share.id,
      theirWords: share.content.slice(0, 100),
    },
    message,
    ssml,
    suggestedTiming,
    priority: share.emotionalWeight === 'heavy' ? 'high' : 'medium',
    sent: false,
  };
}

/**
 * Create support check-in message
 */
function createSupportMessage(share: SignificantShare): string {
  const options = [
    `Hey, I've been thinking about what you shared about ${share.topic}. How are you doing with all that?`,
    `I wanted to check in. That ${share.topic} stuff sounded heavy. How are you holding up?`,
    `No agenda, just wanted to see how you're doing. That thing about ${share.topic} has been on my mind.`,
    `I know you've got a lot going on. Just wanted you to know I'm thinking about you.`,
  ];

  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Create celebratory check-in message
 */
function createCelebrateMessage(share: SignificantShare): string {
  const options = [
    `Hey! How did that ${share.topic} thing go? I've been curious!`,
    `I remembered you had that ${share.topic} thing. How'd it turn out?`,
    `Been thinking about you - how did everything go?`,
    `Just checking in - how are you feeling after everything?`,
  ];

  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Create remember/anniversary message
 */
function createRememberMessage(share: SignificantShare): string {
  const options = [
    `Today's the day, right? Thinking of you.`,
    `I remembered what today is. How are you feeling?`,
    `Just wanted you to know I'm thinking about you today.`,
  ];

  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Create generic check-in message
 */
function createCheckInMessage(share: SignificantShare): string {
  const options = [
    `Hey, just thinking about you. How are things?`,
    `No particular reason - just wanted to check in. How are you?`,
    `You crossed my mind. Everything okay?`,
    `Hope you're doing well. How's life treating you?`,
  ];

  return options[Math.floor(Math.random() * options.length)];
}

// ============================================================================
// RANDOM WARMTH
// ============================================================================

/**
 * Generate a random warmth message (pure "thinking of you" with no trigger)
 */
export function generateRandomWarmth(userId: string): ThinkingOfYouMoment | null {
  const profile = profiles.get(userId);
  if (!profile) return null;

  // Check if it's been long enough since last outreach
  const now = new Date();
  if (
    profile.lastNoAgendaOutreach &&
    now.getTime() - profile.lastNoAgendaOutreach.getTime() < 7 * 24 * 60 * 60 * 1000
  ) {
    return null;
  }

  const messages = [
    "Hey, you crossed my mind. Just wanted to say hi. How are you?",
    "No reason, just thinking about you. Hope you're doing well.",
    "Haven't chatted in a bit. How's everything going?",
    "Just wanted to check in. How are things?",
    "Thinking about you. What's new in your world?",
  ];

  const message = messages[Math.floor(Math.random() * messages.length)];
  const ssml = message.replace(/\. /g, '. <break time="300ms"/>');

  const moment: ThinkingOfYouMoment = {
    id: `random_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: 'random_warmth',
    trigger: {
      type: 'random',
    },
    message,
    ssml,
    suggestedTiming: new Date(now.getTime() + Math.random() * 24 * 60 * 60 * 1000),
    priority: 'low',
    sent: false,
  };

  profile.pendingMoments.push(moment);
  return moment;
}

// ============================================================================
// MOMENT MANAGEMENT
// ============================================================================

/**
 * Get pending moments that are due
 */
export function getDueMoments(userId: string): ThinkingOfYouMoment[] {
  const profile = profiles.get(userId);
  if (!profile) return [];

  const now = new Date();
  return profile.pendingMoments.filter(
    (m) => !m.sent && m.suggestedTiming <= now
  );
}

/**
 * Mark a moment as sent
 */
export function markMomentSent(userId: string, momentId: string): void {
  const profile = profiles.get(userId);
  if (!profile) return;

  const moment = profile.pendingMoments.find((m) => m.id === momentId);
  if (moment) {
    moment.sent = true;
    profile.lastNoAgendaOutreach = new Date();
    profile.sentMoments.push(moment);

    // Remove from pending
    profile.pendingMoments = profile.pendingMoments.filter(
      (m) => m.id !== momentId
    );

    log.info({ userId, momentId, type: moment.type }, '💌 Thinking of you moment sent');
  }
}

/**
 * Record response to outreach
 */
export function recordOutreachResponse(
  userId: string,
  momentId: string,
  responded: boolean
): void {
  const profile = profiles.get(userId);
  if (!profile) return;

  const moment = profile.sentMoments.find((m) => m.id === momentId);
  if (moment) {
    moment.responseReceived = responded;

    // If they didn't respond, maybe reduce frequency
    if (!responded) {
      profile.preferences.maxPerWeek = Math.max(
        1,
        profile.preferences.maxPerWeek - 1
      );
    }
  }
}

/**
 * Update outreach preferences
 */
export function updatePreferences(
  userId: string,
  preferences: Partial<ThinkingOfYouProfile['preferences']>
): void {
  const profile = getOrCreateProfile(userId);
  profile.preferences = { ...profile.preferences, ...preferences };
}

// ============================================================================
// PROFILE ACCESS
// ============================================================================

/**
 * Export profile for persistence
 */
export function exportThinkingOfYouProfile(
  userId: string
): ThinkingOfYouProfile | null {
  return profiles.get(userId) || null;
}

/**
 * Import profile from persistence
 */
export function importThinkingOfYouProfile(profile: ThinkingOfYouProfile): void {
  profiles.set(profile.userId, profile);
  log.debug(
    { userId: profile.userId, shareCount: profile.significantShares.length },
    'Imported thinking of you profile'
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  detectSignificantShare,
  generateThinkingOfYouMoments,
  generateRandomWarmth,
  getDueMoments,
  markMomentSent,
  recordOutreachResponse,
  updatePreferences,
  exportThinkingOfYouProfile,
  importThinkingOfYouProfile,
};

