/**
 * Reading Between the Lines
 *
 * Understanding what's NOT being said - the gaps, the deflections,
 * the "I'm fine" that isn't fine.
 *
 * Philosophy: A great friend notices when you're holding back.
 * Not to push, but to create space. "You don't have to talk about it,
 * but I'm here if you want to."
 *
 * This system detects:
 * - Emotional/verbal mismatches ("I'm fine" + heavy topic)
 * - Topic avoidance patterns (consistently steering away)
 * - Deflection behaviors (changing subject, minimizing)
 * - Permission-seeking ("Can I tell you something?")
 * - Unfinished thoughts ("Never mind", trailing off)
 *
 * @module ReadingBetweenLines
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ReadingBetweenLines' });

// ============================================================================
// TYPES
// ============================================================================

export interface UnsaidSignal {
  type:
    | 'emotional_mismatch' // Said fine, but context says otherwise
    | 'topic_avoidance' // Consistently steering away from something
    | 'deflection' // Changing subject, minimizing
    | 'permission_seeking' // Wants to share but needs encouragement
    | 'unfinished_thought' // Started something, didn't finish
    | 'minimizing_pain' // Downplaying something significant
    | 'false_closure' // "It's fine now" when it clearly isn't;

  /** What we detected */
  observation: string;

  /** The topic or emotion being avoided/suppressed */
  underlying: string;

  /** How confident we are (0-1) */
  confidence: number;

  /** Suggested response approach */
  approach: 'create_space' | 'gentle_probe' | 'acknowledge_silently' | 'wait';

  /** Optional phrase to use */
  phrase?: string;

  /** Context that led to this detection */
  context: {
    userMessage: string;
    recentTopics?: string[];
    statedEmotion?: string;
    detectedEmotion?: string;
  };
}

export interface ConversationPattern {
  topic: string;
  avoidanceCount: number;
  lastAvoided: Date;
  deflectionPhrases: string[];
}

export interface UserUnsaidProfile {
  userId: string;

  /** Topics they consistently avoid */
  avoidedTopics: ConversationPattern[];

  /** Times they said "I'm fine" when they weren't */
  falseFines: Array<{
    timestamp: Date;
    context: string;
    actualEmotion?: string;
  }>;

  /** Unfinished stories that were never completed */
  hangingThreads: Array<{
    topic: string;
    lastMentioned: Date;
    timesStarted: number;
    neverFinished: boolean;
  }>;

  /** Things they seem to want to say but haven't */
  permissionMoments: Array<{
    timestamp: Date;
    leadUp: string;
    didShare: boolean;
  }>;
}

// ============================================================================
// DETECTION PATTERNS
// ============================================================================

/** Phrases that often mask real feelings */
const FINE_MASKS = [
  "i'm fine",
  "i'm okay",
  "it's fine",
  "it's okay",
  "i'm good",
  "it's whatever",
  "it doesn't matter",
  "it's not a big deal",
  "i'm over it",
  "i don't care anymore",
  "it is what it is",
  "i've moved on",
];

/** Phrases that indicate wanting permission to share */
const PERMISSION_SEEKERS = [
  'can i tell you something',
  'is it okay if',
  'i don\'t know if i should say this',
  'this might sound',
  'you\'ll probably think',
  'i\'ve never told anyone',
  'promise you won\'t',
  "i don't want to burden you",
  'i know this is silly but',
  'this is going to sound stupid',
];

/** Deflection patterns */
const DEFLECTION_PATTERNS = [
  /anyway,? (what about|how about|let's talk about)/i,
  /but enough about (me|that)/i,
  /it's not important/i,
  /forget i said/i,
  /never ?mind/i,
  /let's move on/i,
  /i don't (want to|wanna) talk about/i,
  /can we (change|talk about something)/i,
  /sorry,? (i|that)/i,
];

/** Minimizing language */
const MINIMIZING_PATTERNS = [
  /it's (just|only) a/i,
  /i (just|only) (feel|think|am)/i,
  /it's (not that|no) big (deal|thing)/i,
  /i shouldn't complain/i,
  /other people have it worse/i,
  /i know i'm being/i,
  /i'm probably (just|being)/i,
];

/** Heavy topics that "I'm fine" often masks */
const HEAVY_TOPIC_INDICATORS = [
  'divorce',
  'death',
  'cancer',
  'diagnosis',
  'fired',
  'laid off',
  'breakup',
  'cheated',
  'affair',
  'abuse',
  'addiction',
  'relapse',
  'suicide',
  'miscarriage',
  'infertility',
  'bankruptcy',
  'foreclosure',
  'accident',
  'hospital',
  'funeral',
  'died',
  'passed away',
  'lost my',
];

// ============================================================================
// IN-MEMORY STORE
// ============================================================================

const userProfiles = new Map<string, UserUnsaidProfile>();

function getOrCreateProfile(userId: string): UserUnsaidProfile {
  let profile = userProfiles.get(userId);
  if (!profile) {
    profile = {
      userId,
      avoidedTopics: [],
      falseFines: [],
      hangingThreads: [],
      permissionMoments: [],
    };
    userProfiles.set(userId, profile);
  }
  return profile;
}

// ============================================================================
// CORE DETECTION
// ============================================================================

/**
 * Detect signals of what's NOT being said
 */
export function detectUnsaidSignals(
  userId: string,
  userMessage: string,
  context: {
    recentTopics?: string[];
    statedEmotion?: string;
    detectedEmotion?: string;
    emotionIntensity?: number;
    previousMessages?: string[];
    topicBeforeThis?: string;
  }
): UnsaidSignal[] {
  const signals: UnsaidSignal[] = [];
  const lower = userMessage.toLowerCase();
  const profile = getOrCreateProfile(userId);

  // 1. Check for emotional mismatch ("I'm fine" + heavy context)
  const emotionalMismatch = detectEmotionalMismatch(lower, context, profile);
  if (emotionalMismatch) {
    signals.push(emotionalMismatch);
  }

  // 2. Check for topic avoidance
  const avoidance = detectTopicAvoidance(lower, context, profile);
  if (avoidance) {
    signals.push(avoidance);
  }

  // 3. Check for deflection
  const deflection = detectDeflection(lower, context);
  if (deflection) {
    signals.push(deflection);
  }

  // 4. Check for permission-seeking
  const permissionSeek = detectPermissionSeeking(lower, userMessage);
  if (permissionSeek) {
    signals.push(permissionSeek);
    // Record this moment
    profile.permissionMoments.push({
      timestamp: new Date(),
      leadUp: userMessage.slice(0, 100),
      didShare: false, // Will update if they do share
    });
  }

  // 5. Check for unfinished thoughts
  const unfinished = detectUnfinishedThought(userMessage, context);
  if (unfinished) {
    signals.push(unfinished);
  }

  // 6. Check for minimizing pain
  const minimizing = detectMinimizing(lower, context);
  if (minimizing) {
    signals.push(minimizing);
  }

  // Log for debugging
  if (signals.length > 0) {
    log.debug(
      {
        userId,
        signalCount: signals.length,
        types: signals.map((s) => s.type),
      },
      '🔍 Detected unsaid signals'
    );
  }

  return signals;
}

/**
 * Detect when stated emotion doesn't match context
 */
function detectEmotionalMismatch(
  lower: string,
  context: {
    detectedEmotion?: string;
    emotionIntensity?: number;
    recentTopics?: string[];
  },
  profile: UserUnsaidProfile
): UnsaidSignal | null {
  // Check for "fine" masks
  const usesFine = FINE_MASKS.some((mask) => lower.includes(mask));
  if (!usesFine) return null;

  // Check if context suggests otherwise
  const hasHeavyTopic = HEAVY_TOPIC_INDICATORS.some(
    (topic) =>
      lower.includes(topic) ||
      context.recentTopics?.some((t) => t.toLowerCase().includes(topic))
  );

  const emotionMismatch =
    context.detectedEmotion &&
    ['sad', 'anxious', 'angry', 'hurt', 'scared', 'frustrated'].includes(
      context.detectedEmotion
    ) &&
    (context.emotionIntensity || 0) > 0.5;

  if (hasHeavyTopic || emotionMismatch) {
    // Record this false fine
    profile.falseFines.push({
      timestamp: new Date(),
      context: lower.slice(0, 100),
      actualEmotion: context.detectedEmotion,
    });

    const phrases = [
      "You said you're fine, but... I'm not sure that's the whole story. You don't have to talk about it, but I'm here.",
      "I hear you saying it's okay, but something tells me there might be more to it. No pressure.",
      "That's a lot to be 'fine' about. I'm here if you want to say more.",
      "You don't have to be fine with me. What's really going on?",
    ];

    return {
      type: 'emotional_mismatch',
      observation: 'Said they\'re fine but context suggests otherwise',
      underlying: context.detectedEmotion || 'suppressed emotion',
      confidence: hasHeavyTopic && emotionMismatch ? 0.9 : 0.7,
      approach: 'create_space',
      phrase: phrases[Math.floor(Math.random() * phrases.length)],
      context: {
        userMessage: lower,
        statedEmotion: 'fine',
        detectedEmotion: context.detectedEmotion,
        recentTopics: context.recentTopics,
      },
    };
  }

  return null;
}

/**
 * Detect consistent avoidance of a topic
 */
function detectTopicAvoidance(
  lower: string,
  context: {
    topicBeforeThis?: string;
    recentTopics?: string[];
  },
  profile: UserUnsaidProfile
): UnsaidSignal | null {
  // Check if they're actively avoiding a topic that was just raised
  if (!context.topicBeforeThis) return null;

  const avoidancePhrases = [
    "i don't want to talk about",
    "let's not",
    "can we change",
    "i'd rather not",
    "not right now",
    "maybe later",
    "some other time",
  ];

  const isAvoiding = avoidancePhrases.some((phrase) => lower.includes(phrase));
  if (!isAvoiding) return null;

  // Track this avoidance
  const existingPattern = profile.avoidedTopics.find(
    (t) => t.topic.toLowerCase() === context.topicBeforeThis?.toLowerCase()
  );

  if (existingPattern) {
    existingPattern.avoidanceCount++;
    existingPattern.lastAvoided = new Date();
    existingPattern.deflectionPhrases.push(lower.slice(0, 50));
  } else {
    profile.avoidedTopics.push({
      topic: context.topicBeforeThis,
      avoidanceCount: 1,
      lastAvoided: new Date(),
      deflectionPhrases: [lower.slice(0, 50)],
    });
  }

  // Only flag if they've avoided this topic multiple times
  const avoidanceCount = existingPattern?.avoidanceCount || 1;
  if (avoidanceCount >= 2) {
    return {
      type: 'topic_avoidance',
      observation: `Has avoided "${context.topicBeforeThis}" ${avoidanceCount} times`,
      underlying: context.topicBeforeThis,
      confidence: Math.min(0.5 + avoidanceCount * 0.1, 0.9),
      approach: 'acknowledge_silently',
      context: {
        userMessage: lower,
        recentTopics: context.recentTopics,
      },
    };
  }

  return null;
}

/**
 * Detect deflection behaviors
 */
function detectDeflection(
  lower: string,
  context: {
    topicBeforeThis?: string;
  }
): UnsaidSignal | null {
  const matchedPattern = DEFLECTION_PATTERNS.find((pattern) =>
    pattern.test(lower)
  );

  if (!matchedPattern) return null;

  const phrases = [
    "I noticed you changed the subject. We can talk about that if you want, or not. Either way.",
    "We can move on, but if you want to come back to that later, I'm here.",
    "I'll follow your lead. Just know that topic is safe with me if you ever want to revisit it.",
  ];

  return {
    type: 'deflection',
    observation: 'Actively changed subject from previous topic',
    underlying: context.topicBeforeThis || 'previous topic',
    confidence: 0.75,
    approach: 'create_space',
    phrase: phrases[Math.floor(Math.random() * phrases.length)],
    context: {
      userMessage: lower,
    },
  };
}

/**
 * Detect when someone is seeking permission to share
 */
function detectPermissionSeeking(
  lower: string,
  original: string
): UnsaidSignal | null {
  const isSeekingPermission = PERMISSION_SEEKERS.some((phrase) =>
    lower.includes(phrase)
  );

  if (!isSeekingPermission) return null;

  const phrases = [
    "Of course you can tell me. I'm listening.",
    "You can tell me anything. No judgment here.",
    "I'm here. Take your time.",
    "Whatever it is, I want to hear it.",
    "You don't need permission with me. Go ahead.",
  ];

  return {
    type: 'permission_seeking',
    observation: 'Seeking permission to share something vulnerable',
    underlying: 'something they want to share but feel uncertain about',
    confidence: 0.85,
    approach: 'gentle_probe',
    phrase: phrases[Math.floor(Math.random() * phrases.length)],
    context: {
      userMessage: original,
    },
  };
}

/**
 * Detect unfinished thoughts
 */
function detectUnfinishedThought(
  message: string,
  context: {
    previousMessages?: string[];
  }
): UnsaidSignal | null {
  const unfinishedIndicators = [
    /never ?mind/i,
    /forget (it|i said)/i,
    /\.{3,}$/,
    /—$/,
    /i (was going to|wanted to) say/i,
    /actually,? (no|nothing)/i,
    /it's (nothing|stupid)/i,
  ];

  const isUnfinished = unfinishedIndicators.some((pattern) =>
    pattern.test(message)
  );

  if (!isUnfinished) return null;

  const phrases = [
    "You started to say something. I'd like to hear it, if you want to share.",
    "I caught that. What were you going to say?",
    "It's not nothing. What's on your mind?",
    "I'm curious what you were about to say. No pressure though.",
  ];

  return {
    type: 'unfinished_thought',
    observation: 'Started to say something but stopped',
    underlying: 'a thought they pulled back from sharing',
    confidence: 0.7,
    approach: 'gentle_probe',
    phrase: phrases[Math.floor(Math.random() * phrases.length)],
    context: {
      userMessage: message,
    },
  };
}

/**
 * Detect minimizing language
 */
function detectMinimizing(
  lower: string,
  context: {
    detectedEmotion?: string;
    emotionIntensity?: number;
  }
): UnsaidSignal | null {
  const isMinimizing = MINIMIZING_PATTERNS.some((pattern) =>
    pattern.test(lower)
  );

  if (!isMinimizing) return null;

  // More significant if emotion intensity is high but they're minimizing
  const significantMinimizing =
    context.emotionIntensity && context.emotionIntensity > 0.6;

  if (!significantMinimizing) return null;

  const phrases = [
    "You don't have to minimize it. If it matters to you, it matters.",
    "It sounds like it's affecting you more than you're letting on.",
    "You're allowed to feel that fully. You don't have to make it smaller.",
    "Other people's struggles don't make yours less real.",
  ];

  return {
    type: 'minimizing_pain',
    observation: 'Downplaying something that seems significant',
    underlying: 'real pain being minimized',
    confidence: 0.65,
    approach: 'create_space',
    phrase: phrases[Math.floor(Math.random() * phrases.length)],
    context: {
      userMessage: lower,
      detectedEmotion: context.detectedEmotion,
    },
  };
}

// ============================================================================
// PROFILE ACCESS
// ============================================================================

/**
 * Get a user's unsaid profile for context building
 */
export function getUnsaidProfile(userId: string): UserUnsaidProfile | null {
  return userProfiles.get(userId) || null;
}

/**
 * Get topics this user consistently avoids
 */
export function getAvoidedTopics(userId: string): string[] {
  const profile = userProfiles.get(userId);
  if (!profile) return [];

  return profile.avoidedTopics
    .filter((t) => t.avoidanceCount >= 2)
    .map((t) => t.topic);
}

/**
 * Check if a topic should be avoided for this user
 */
export function shouldAvoidTopic(userId: string, topic: string): boolean {
  const profile = userProfiles.get(userId);
  if (!profile) return false;

  return profile.avoidedTopics.some(
    (t) =>
      t.topic.toLowerCase() === topic.toLowerCase() && t.avoidanceCount >= 2
  );
}

/**
 * Record that user actually did share after permission-seeking
 */
export function recordDidShare(userId: string): void {
  const profile = userProfiles.get(userId);
  if (!profile || profile.permissionMoments.length === 0) return;

  // Mark most recent permission moment as shared
  const recent = profile.permissionMoments[profile.permissionMoments.length - 1];
  if (recent) {
    recent.didShare = true;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  detectUnsaidSignals,
  getUnsaidProfile,
  getAvoidedTopics,
  shouldAvoidTopic,
  recordDidShare,
};

