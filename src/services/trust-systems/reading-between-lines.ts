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
 * PERSISTENCE: User emotional profiles are persisted to Firestore.
 *
 * @module ReadingBetweenLines
 */

import { createLogger } from '../../utils/safe-logger.js';
import { createPersistenceStore, type PersistenceStore } from '../persistence/index.js';

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
    | 'false_closure'; // "It's fine now" when it clearly isn't;

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
  'it is what it is',
  "i've moved on",
];

/** Phrases that indicate wanting permission to share */
const PERMISSION_SEEKERS = [
  'can i tell you something',
  'is it okay if',
  "i don't know if i should say this",
  'this might sound',
  "you'll probably think",
  "i've never told anyone",
  "promise you won't",
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
// PERSISTENCE TYPES
// ============================================================================

interface PersistedConversationPattern {
  topic: string;
  avoidanceCount: number;
  lastAvoided: string;
  deflectionPhrases: string[];
}

interface PersistedUserUnsaidProfile {
  userId: string;
  avoidedTopics: PersistedConversationPattern[];
  falseFines: Array<{
    timestamp: string;
    context: string;
    actualEmotion?: string;
  }>;
  hangingThreads: Array<{
    topic: string;
    lastMentioned: string;
    timesStarted: number;
    neverFinished: boolean;
  }>;
  permissionMoments: Array<{
    timestamp: string;
    leadUp: string;
    didShare: boolean;
  }>;
}

function serializeProfile(profile: UserUnsaidProfile): PersistedUserUnsaidProfile {
  return {
    userId: profile.userId,
    avoidedTopics: profile.avoidedTopics.map((t) => ({
      ...t,
      lastAvoided: t.lastAvoided.toISOString(),
    })),
    falseFines: profile.falseFines.map((f) => ({
      ...f,
      timestamp: f.timestamp.toISOString(),
    })),
    hangingThreads: profile.hangingThreads.map((h) => ({
      ...h,
      lastMentioned: h.lastMentioned.toISOString(),
    })),
    permissionMoments: profile.permissionMoments.map((p) => ({
      ...p,
      timestamp: p.timestamp.toISOString(),
    })),
  };
}

function deserializeProfile(data: PersistedUserUnsaidProfile): UserUnsaidProfile {
  return {
    userId: data.userId,
    avoidedTopics: data.avoidedTopics.map((t) => ({
      ...t,
      lastAvoided: new Date(t.lastAvoided),
    })),
    falseFines: data.falseFines.map((f) => ({
      ...f,
      timestamp: new Date(f.timestamp),
    })),
    hangingThreads: data.hangingThreads.map((h) => ({
      ...h,
      lastMentioned: new Date(h.lastMentioned),
    })),
    permissionMoments: data.permissionMoments.map((p) => ({
      ...p,
      timestamp: new Date(p.timestamp),
    })),
  };
}

// ============================================================================
// STORAGE (in-memory cache backed by Firestore)
// ============================================================================

const userProfiles = new Map<string, UserUnsaidProfile>();
const loadedUsers = new Set<string>();

let persistence: PersistenceStore<PersistedUserUnsaidProfile> | null = null;

function getPersistence(): PersistenceStore<PersistedUserUnsaidProfile> {
  if (!persistence) {
    persistence = createPersistenceStore<PersistedUserUnsaidProfile>({
      collection: 'reading_between_lines',
      documentId: 'profile',
      syncIntervalMs: 5000,
    });
  }
  return persistence;
}

async function ensureUserLoaded(userId: string): Promise<void> {
  if (loadedUsers.has(userId)) return;

  try {
    const data = await getPersistence().load(userId);
    if (data) {
      userProfiles.set(userId, deserializeProfile(data));
    }
    loadedUsers.add(userId);
    log.debug({ userId }, 'Loaded unsaid profile from persistence');
  } catch (error) {
    log.warn({ error, userId }, 'Failed to load unsaid profile');
    loadedUsers.add(userId);
  }
}

function persistProfile(userId: string): void {
  const profile = userProfiles.get(userId);
  if (profile) {
    getPersistence().set(userId, serializeProfile(profile));
  }
}

/**
 * Flush persistence
 */
export async function flushReadingBetweenLinesPersistence(): Promise<void> {
  await getPersistence().flush();
  log.info('Reading between lines persistence flushed');
}

/**
 * Shutdown reading between lines service
 */
export async function shutdownReadingBetweenLines(): Promise<void> {
  await flushReadingBetweenLinesPersistence();
  // Clear state for clean restart
  loadedUsers.clear();
  userProfiles.clear();
  log.info('Reading between lines service shutdown complete');
}

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

/**
 * Get or create profile with persistence loading
 */
async function getOrCreateProfileAsync(userId: string): Promise<UserUnsaidProfile> {
  await ensureUserLoaded(userId);
  return getOrCreateProfile(userId);
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
  let profileModified = false;

  // 1. Check for emotional mismatch ("I'm fine" + heavy context)
  const emotionalMismatch = detectEmotionalMismatch(lower, context, profile);
  if (emotionalMismatch) {
    signals.push(emotionalMismatch);
    profileModified = true; // detectEmotionalMismatch modifies profile
  }

  // 2. Check for topic avoidance
  const avoidance = detectTopicAvoidance(lower, context, profile);
  if (avoidance) {
    signals.push(avoidance);
    profileModified = true; // detectTopicAvoidance modifies profile
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
    profileModified = true;
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

  // Persist if profile was modified
  if (profileModified) {
    persistProfile(userId);
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
      lower.includes(topic) || context.recentTopics?.some((t) => t.toLowerCase().includes(topic))
  );

  // Check if there's a negative emotion detected (without requiring high intensity)
  const emotionMismatch =
    context.detectedEmotion &&
    ['sad', 'anxious', 'angry', 'hurt', 'scared', 'frustrated', 'distressed', 'overwhelmed'].includes(context.detectedEmotion);

  // Also check for "but" patterns which often indicate masking
  // e.g., "I'm fine, but..." or "It's okay but the divorce..."
  const hasBut = /\b(but|though|although|however)\b/i.test(lower);
  const hasContradiction = usesFine && hasBut;

  // Check for minimizing language in same sentence as "fine"
  const hasMinimizing = MINIMIZING_PATTERNS.some((pattern) => pattern.test(lower));
  const minimizingWithFine = usesFine && hasMinimizing;

  if (hasHeavyTopic || emotionMismatch || hasContradiction || minimizingWithFine) {
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

    // Calculate confidence based on what triggered the detection
    let confidence = 0.65;
    if (hasHeavyTopic) confidence += 0.15;
    if (emotionMismatch) confidence += 0.1;
    if (hasContradiction) confidence += 0.05;
    if (minimizingWithFine) confidence += 0.05;
    confidence = Math.min(confidence, 0.95);

    return {
      type: 'emotional_mismatch',
      observation: "Said they're fine but context suggests otherwise",
      underlying: context.detectedEmotion || 'suppressed emotion',
      confidence,
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
    'can we change',
    "i'd rather not",
    'not right now',
    'maybe later',
    'some other time',
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
  const matchedPattern = DEFLECTION_PATTERNS.find((pattern) => pattern.test(lower));

  if (!matchedPattern) return null;

  const phrases = [
    'I noticed you changed the subject. We can talk about that if you want, or not. Either way.',
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
function detectPermissionSeeking(lower: string, original: string): UnsaidSignal | null {
  const isSeekingPermission = PERMISSION_SEEKERS.some((phrase) => lower.includes(phrase));

  if (!isSeekingPermission) return null;

  const phrases = [
    "Of course you can tell me. I'm listening.",
    'You can tell me anything. No judgment here.',
    "I'm here. Take your time.",
    'Whatever it is, I want to hear it.',
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

  const isUnfinished = unfinishedIndicators.some((pattern) => pattern.test(message));

  if (!isUnfinished) return null;

  const phrases = [
    "You started to say something. I'd like to hear it, if you want to share.",
    'I caught that. What were you going to say?',
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
    recentTopics?: string[];
  }
): UnsaidSignal | null {
  const isMinimizing = MINIMIZING_PATTERNS.some((pattern) => pattern.test(lower));

  if (!isMinimizing) return null;

  // Check for heavy topics that make minimizing more significant
  const hasHeavyTopic = HEAVY_TOPIC_INDICATORS.some(
    (topic) =>
      lower.includes(topic) || context.recentTopics?.some((t) => t.toLowerCase().includes(topic))
  );

  // Check for negative emotions that suggest they're downplaying
  const hasNegativeEmotion =
    context.detectedEmotion &&
    ['sad', 'anxious', 'angry', 'hurt', 'scared', 'frustrated', 'distressed', 'overwhelmed'].includes(context.detectedEmotion);

  // Strong minimizing patterns that are significant on their own
  const strongMinimizing = [
    /i shouldn't complain/i,
    /other people have it worse/i,
    /it's not that bad/i,
    /i'm probably (just|being) (dramatic|sensitive|silly)/i,
    /i know (i'm being|it's) silly/i,
    /it's (really )?nothing/i,
  ].some((pattern) => pattern.test(lower));

  // Trigger if: high emotion intensity OR heavy topic OR strong minimizing OR negative emotion
  const significantMinimizing =
    (context.emotionIntensity && context.emotionIntensity > 0.4) ||
    hasHeavyTopic ||
    strongMinimizing ||
    hasNegativeEmotion;

  if (!significantMinimizing) return null;

  const phrases = [
    "You don't have to minimize it. If it matters to you, it matters.",
    "It sounds like it's affecting you more than you're letting on.",
    "You're allowed to feel that fully. You don't have to make it smaller.",
    "Other people's struggles don't make yours less real.",
  ];

  // Calculate confidence
  let confidence = 0.55;
  if (hasHeavyTopic) confidence += 0.15;
  if (strongMinimizing) confidence += 0.15;
  if (hasNegativeEmotion) confidence += 0.1;
  if (context.emotionIntensity && context.emotionIntensity > 0.6) confidence += 0.1;
  confidence = Math.min(confidence, 0.9);

  return {
    type: 'minimizing_pain',
    observation: 'Downplaying something that seems significant',
    underlying: 'real pain being minimized',
    confidence,
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

  return profile.avoidedTopics.filter((t) => t.avoidanceCount >= 2).map((t) => t.topic);
}

/**
 * Check if a topic should be avoided for this user
 */
export function shouldAvoidTopic(userId: string, topic: string): boolean {
  const profile = userProfiles.get(userId);
  if (!profile) return false;

  return profile.avoidedTopics.some(
    (t) => t.topic.toLowerCase() === topic.toLowerCase() && t.avoidanceCount >= 2
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
