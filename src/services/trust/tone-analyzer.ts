/**
 * Tone Analyzer
 *
 * Analyzes HOW things are said - nervous laughter, forced positivity,
 * spiritual deflection, sudden topic changes, and minimizing pain.
 * Also manages deflection profiles and context building for LLM injection.
 *
 * @module trust/ToneAnalyzer
 */

import type { UnsaidSignal, UserUnsaidProfile } from './reading-between-lines.js';
import { HEAVY_TOPIC_INDICATORS, MINIMIZING_PATTERNS } from './intent-detector.js';

// ============================================================================
// TONE-SPECIFIC DETECTION PATTERNS
// ============================================================================

/** Nervous laughter patterns - masking with humor */
export const NERVOUS_LAUGHTER_PATTERNS = [
  /\b(lol|lmao|haha|hehe|rofl)\s*(yeah|i'm|it's|that's|i guess|whatever)\s*(fine|okay|good|alright)/i,
  /\b(yeah|it's|i'm)\s*(fine|okay|good)\s*(lol|lmao|haha|hehe)/i,
  /\bhaha\s+(anyway|but|so)\b/i,
  /\b(lol|haha)\s+(it's nothing|no worries|i'm fine|all good)/i,
  /\b(fine|okay)\s+(haha|lol)\s*$/i,
  /\b😅|😂|🙃\s*(fine|okay|good|whatever)/i,
];

/** Excessive exclamation masking - forced positivity */
export const EXCLAMATION_MASKING_PATTERNS = [
  /\b(i'm|it's|we're|that's)\s+(fine|okay|good|great|totally good)!/i,
  /\bno worries!/i, /\ball good!/i, /\btotally (fine|okay|good)!/i,
  /!{2,}/,
];

/** Spiritual/fatalistic deflection - avoiding agency */
export const SPIRITUAL_DEFLECTION_PATTERNS = [
  /\bgod has a plan\b/i, /\beverything happens for a reason\b/i,
  /\bit('s| is) (meant|supposed) to be\b/i, /\bwhat('s| is) meant to be will be\b/i,
  /\bin god('s|s) hands\b/i, /\bthe universe (has|knows)\b/i,
  /\bit('s| is) not (up to|for) me\b/i, /\blet go and let god\b/i,
  /\bthis too shall pass\b/i, /\bgod('s| is) will\b/i,
];

/** Sudden topic change indicators */
export const TOPIC_CHANGE_INDICATORS = [
  /^(so|anyway|but)\.*\s*(how|what|did|have|are)/i,
  /^that reminds me\b/i, /^speaking of\b/i,
  /^oh,? (by the way|btw)\b/i, /^random but\b/i,
];

// ============================================================================
// TONE DETECTION FUNCTIONS
// ============================================================================

/**
 * Detect nervous laughter masking real feelings
 */
export function detectNervousLaughter(lower: string): UnsaidSignal | null {
  const hasNervousLaughter = NERVOUS_LAUGHTER_PATTERNS.some((pattern) => pattern.test(lower));
  if (!hasNervousLaughter) return null;

  const phrases = [
    "I noticed a 'haha' in there. Sometimes we use humor when things are harder than they seem.",
    'The laughter tells me something. How are you really doing?',
    "It's okay to not be okay, even when we joke about it.",
  ];

  return {
    type: 'emotional_mismatch',
    observation: 'Using humor/laughter to soften difficult feelings',
    underlying: 'real feelings masked with nervous laughter',
    confidence: 0.7,
    approach: 'name_gently',
    phrase: phrases[Math.floor(Math.random() * phrases.length)],
    context: { userMessage: lower },
  };
}

/**
 * Detect excessive exclamation masking - forced positivity
 */
export function detectExclamationMasking(lower: string, original: string): UnsaidSignal | null {
  const hasExclamationPattern = EXCLAMATION_MASKING_PATTERNS.some((pattern) =>
    pattern.test(original)
  );
  if (!hasExclamationPattern) return null;

  const phrases = [
    'That enthusiasm... are you sure everything is okay?',
    'I appreciate you trying to reassure me, but how are you really?',
    "You don't have to be positive for my sake.",
  ];

  return {
    type: 'emotional_mismatch',
    observation: 'Excessive positivity/exclamation may mask real feelings',
    underlying: 'forced enthusiasm covering stress',
    confidence: 0.6,
    approach: 'name_gently',
    phrase: phrases[Math.floor(Math.random() * phrases.length)],
    context: { userMessage: original },
  };
}

/**
 * Detect spiritual/fatalistic deflection
 */
export function detectSpiritualDeflection(lower: string): UnsaidSignal | null {
  const hasSpiritual = SPIRITUAL_DEFLECTION_PATTERNS.some((pattern) => pattern.test(lower));
  if (!hasSpiritual) return null;

  const phrases = [
    'Faith can be a comfort. And... how are you feeling about all of this?',
    "I hear you trusting in something bigger. What's on your heart right now?",
    "Beyond what's meant to be... what do you want?",
  ];

  return {
    type: 'deflection',
    observation: 'Using spiritual framing to avoid addressing feelings directly',
    underlying: 'feelings about the situation',
    confidence: 0.55,
    approach: 'create_space',
    phrase: phrases[Math.floor(Math.random() * phrases.length)],
    context: { userMessage: lower },
  };
}

/**
 * Detect sudden topic change
 */
export function detectTopicChange(
  lower: string,
  context: { topicBeforeThis?: string; recentTopics?: string[] }
): UnsaidSignal | null {
  const previousTopic = context.topicBeforeThis || (context.recentTopics?.[0] ?? null);

  const hasHeavyRecentTopic = context.recentTopics?.some((topic) =>
    HEAVY_TOPIC_INDICATORS.some((indicator) => topic.toLowerCase().includes(indicator))
  );

  if (!previousTopic && !hasHeavyRecentTopic) return null;

  const isTopicChange = TOPIC_CHANGE_INDICATORS.some((pattern) => pattern.test(lower));
  if (!isTopicChange) return null;

  const phrases = [
    'We can move on - and that previous topic is safe to return to whenever.',
    "I noticed we shifted gears. I'm here if you want to go back to that.",
    "New topic works for me. That earlier thing? Still here when you're ready.",
  ];

  return {
    type: 'deflection',
    observation: 'Changed subject from previous topic',
    underlying: previousTopic || 'previous heavy topic',
    confidence: 0.65,
    approach: 'create_space',
    phrase: phrases[Math.floor(Math.random() * phrases.length)],
    context: {
      userMessage: lower,
      previousTopic: previousTopic || undefined,
      recentTopics: context.recentTopics,
    },
  };
}

/**
 * Detect minimizing language
 */
export function detectMinimizing(
  lower: string,
  context: {
    detectedEmotion?: string;
    emotionIntensity?: number;
    recentTopics?: string[];
  }
): UnsaidSignal | null {
  const isMinimizing = MINIMIZING_PATTERNS.some((pattern) => pattern.test(lower));
  if (!isMinimizing) return null;

  const hasHeavyTopic = HEAVY_TOPIC_INDICATORS.some(
    (topic) =>
      lower.includes(topic) || context.recentTopics?.some((t) => t.toLowerCase().includes(topic))
  );

  const hasNegativeEmotion =
    context.detectedEmotion &&
    ['sad', 'anxious', 'angry', 'hurt', 'scared', 'frustrated', 'distressed', 'overwhelmed']
      .includes(context.detectedEmotion);

  const strongMinimizing = [
    /i shouldn't complain/i, /other people have it worse/i,
    /it's not that bad/i, /i'm probably (just|being) (dramatic|sensitive|silly)/i,
    /i know (i'm being|it's) silly/i, /it's (really )?nothing/i,
  ].some((pattern) => pattern.test(lower));

  const significantMinimizing =
    (context.emotionIntensity && context.emotionIntensity > 0.4) ||
    hasHeavyTopic || strongMinimizing || hasNegativeEmotion;

  if (!significantMinimizing) return null;

  const phrases = [
    "You don't have to minimize it. If it matters to you, it matters.",
    "It sounds like it's affecting you more than you're letting on.",
    "You're allowed to feel that fully. You don't have to make it smaller.",
    "Other people's struggles don't make yours less real.",
  ];

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
    context: { userMessage: lower, detectedEmotion: context.detectedEmotion },
  };
}

// ============================================================================
// PROFILE ACCESS & DEFLECTION TRACKING
// ============================================================================

/**
 * Get a user's unsaid profile for context building
 */
export function getUnsaidProfile(
  profiles: Map<string, UserUnsaidProfile>,
  userId: string
): UserUnsaidProfile | null {
  return profiles.get(userId) || null;
}

/**
 * Get topics this user consistently avoids
 */
export function getAvoidedTopics(
  profiles: Map<string, UserUnsaidProfile>,
  userId: string
): string[] {
  const profile = profiles.get(userId);
  if (!profile) return [];
  return profile.avoidedTopics.filter((t) => t.avoidanceCount >= 2).map((t) => t.topic);
}

/**
 * Check if a topic should be avoided for this user
 */
export function shouldAvoidTopic(
  profiles: Map<string, UserUnsaidProfile>,
  userId: string,
  topic: string
): boolean {
  const profile = profiles.get(userId);
  if (!profile) return false;
  return profile.avoidedTopics.some(
    (t) => t.topic.toLowerCase() === topic.toLowerCase() && t.avoidanceCount >= 2
  );
}

/**
 * Record that user actually did share after permission-seeking
 */
export function recordDidShare(
  profiles: Map<string, UserUnsaidProfile>,
  userId: string
): void {
  const profile = profiles.get(userId);
  if (!profile || profile.permissionMoments.length === 0) return;
  const recent = profile.permissionMoments[profile.permissionMoments.length - 1];
  if (recent) {
    recent.didShare = true;
  }
}

/**
 * Record a deflection pattern for cross-session tracking
 */
export function recordDeflectionPattern(
  profiles: Map<string, UserUnsaidProfile>,
  userId: string,
  signal: UnsaidSignal,
  getOrCreateProfile: (userId: string) => UserUnsaidProfile
): void {
  if (signal.type !== 'deflection' && signal.type !== 'topic_avoidance') return;

  const profile = getOrCreateProfile(userId);
  const topic = signal.underlying || 'unknown';

  const existingPattern = profile.avoidedTopics.find(
    (t) => t.topic.toLowerCase() === topic.toLowerCase()
  );

  if (existingPattern) {
    existingPattern.avoidanceCount++;
    existingPattern.lastAvoided = new Date();
    if (signal.context.userMessage) {
      existingPattern.deflectionPhrases.push(signal.context.userMessage.slice(0, 50));
      if (existingPattern.deflectionPhrases.length > 10) {
        existingPattern.deflectionPhrases = existingPattern.deflectionPhrases.slice(-10);
      }
    }
  } else {
    profile.avoidedTopics.push({
      topic,
      avoidanceCount: 1,
      lastAvoided: new Date(),
      deflectionPhrases: signal.context.userMessage
        ? [signal.context.userMessage.slice(0, 50)]
        : [],
    });
  }
}

/**
 * Get deflection statistics for a user (for LLM context)
 */
export function getDeflectionStats(
  profiles: Map<string, UserUnsaidProfile>,
  userId: string
): {
  topics: Array<{ topic: string; count: number; lastSeen: Date }>;
  totalDeflections: number;
  mostAvoided: string | null;
} {
  const profile = profiles.get(userId);
  if (!profile || profile.avoidedTopics.length === 0) {
    return { topics: [], totalDeflections: 0, mostAvoided: null };
  }

  const topics = profile.avoidedTopics
    .filter((t) => t.avoidanceCount >= 1)
    .map((t) => ({ topic: t.topic, count: t.avoidanceCount, lastSeen: t.lastAvoided }))
    .sort((a, b) => b.count - a.count);

  const totalDeflections = topics.reduce((sum, t) => sum + t.count, 0);
  const mostAvoided = topics.length > 0 ? topics[0].topic : null;

  return { topics, totalDeflections, mostAvoided };
}

/**
 * Build deflection awareness context for LLM injection
 */
export function buildDeflectionContext(
  profiles: Map<string, UserUnsaidProfile>,
  userId: string
): string {
  const stats = getDeflectionStats(profiles, userId);
  if (stats.totalDeflections === 0) return '';

  const lines: string[] = ['[DEFLECTION AWARENESS - Better Than Human Pattern Detection]'];
  lines.push('You notice patterns humans miss. These are topics they consistently avoid:');
  lines.push('');

  for (const topic of stats.topics.slice(0, 5)) {
    const daysSince = Math.floor((Date.now() - topic.lastSeen.getTime()) / (24 * 60 * 60 * 1000));
    const recency =
      daysSince === 0 ? 'today' : daysSince === 1 ? 'yesterday' : `${daysSince} days ago`;
    lines.push(`• "${topic.topic}" - deflected ${topic.count}x (last: ${recency})`);
  }

  lines.push('');
  lines.push("Create space for these topics. Never push. They'll share when ready.");

  return lines.join('\n');
}
