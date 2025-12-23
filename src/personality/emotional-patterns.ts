/**
 * Emotional Pattern Recognition
 *
 * Superhuman feature: Notice things about users that they don't notice themselves.
 *
 * "I've noticed you seem more stressed when work comes up lately"
 * "Every Sunday evening you seem to get anxious"
 * "When you talk about your boss, your whole energy shifts"
 *
 * Humans miss these patterns because they're self-absorbed or too close.
 * We can see the bigger picture and reflect it back gently.
 *
 * @module personality/emotional-patterns
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'EmotionalPatterns' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configuration constants for pattern detection
 */
const CONFIG = {
  /** Maximum emotional data points to keep per user */
  MAX_DATA_POINTS_PER_USER: 100,
  /** Minimum history needed for pattern analysis */
  MIN_HISTORY_FOR_PATTERNS: 5,
  /** Minimum relevant data points to consider a correlation */
  MIN_RELEVANT_POINTS: 3,
  /** Correlation threshold to detect a pattern (60%) */
  CORRELATION_THRESHOLD: 0.6,
  /** High correlation threshold for immediate surfacing (80%) */
  HIGH_CORRELATION_THRESHOLD: 0.8,
  /** Minimum recent points to detect declining trend */
  MIN_RECENT_POINTS_FOR_TREND: 5,
  /** Minimum negative emotions in recent history to flag declining */
  MIN_NEGATIVE_FOR_DECLINE: 3,
  /** Minimum temporal pattern matches to surface */
  MIN_TEMPORAL_MATCHES: 2,
} as const;

// ============================================================================
// TYPES
// ============================================================================

export type EmotionalTrend = 'improving' | 'declining' | 'cyclical' | 'triggered' | 'stable';
export type DeliveryTiming = 'now' | 'when_relevant' | 'gently_over_time';

export interface EmotionalDataPoint {
  timestamp: Date;
  emotion: string;
  intensity: number; // 0-1
  topics: string[];
  context?: string;
}

export interface EmotionalPattern {
  id: string;
  userId: string;
  pattern: string; // Human-readable description
  evidence: string[]; // Specific examples from conversations
  trend: EmotionalTrend;
  triggers?: string[];
  insight: string; // What to tell them
  deliveryTiming: DeliveryTiming;
  confidence: number; // 0-1
  detectedAt: Date;
  lastUpdated: Date;
  surfacedToUser: boolean;
}

export interface GrowthMoment {
  id: string;
  userId: string;
  area: string;
  pastEvidence: string;
  pastDate: Date;
  currentEvidence: string;
  currentDate: Date;
  celebration: string; // How to acknowledge it
  significance: 'notable' | 'significant' | 'breakthrough';
  surfaced: boolean;
}

// ============================================================================
// PATTERN DETECTION
// ============================================================================

/**
 * Topic-emotion correlation patterns to look for
 */
const CORRELATION_PATTERNS = [
  {
    topicKeywords: ['work', 'job', 'boss', 'office', 'meeting', 'deadline'],
    emotionWatch: ['stress', 'anxiety', 'dread', 'overwhelm'],
    insightTemplate: "I've noticed you seem more stressed when work comes up lately",
  },
  {
    topicKeywords: ['mom', 'mother', 'dad', 'father', 'parent', 'family'],
    emotionWatch: ['guilt', 'obligation', 'sadness', 'frustration'],
    insightTemplate:
      "You've mentioned your {topic} a few times recently - is something on your mind?",
  },
  {
    topicKeywords: ['relationship', 'partner', 'dating', 'girlfriend', 'boyfriend'],
    emotionWatch: ['uncertainty', 'anxiety', 'loneliness', 'hurt'],
    insightTemplate: 'When relationships come up, I notice a shift in your energy',
  },
  {
    topicKeywords: ['money', 'bills', 'rent', 'financial', 'afford'],
    emotionWatch: ['stress', 'anxiety', 'shame', 'worry'],
    insightTemplate: 'Financial stuff seems to carry a lot of weight for you right now',
  },
  {
    topicKeywords: ['health', 'doctor', 'sick', 'body', 'sleep'],
    emotionWatch: ['worry', 'fear', 'frustration', 'exhaustion'],
    insightTemplate: 'Health has been on your mind - how are you really doing with that?',
  },
];

/**
 * Time-based patterns to look for
 */
const TEMPORAL_PATTERNS = [
  {
    dayOfWeek: 0, // Sunday
    timeOfDay: 'evening' as const,
    emotionWatch: ['anxiety', 'dread', 'low'],
    insightTemplate: "Sunday evenings seem harder for you. Is that a pattern you've noticed?",
  },
  {
    dayOfWeek: 1, // Monday
    timeOfDay: 'morning' as const,
    emotionWatch: ['stress', 'overwhelm', 'dread'],
    insightTemplate: "Monday mornings hit different for you, don't they?",
  },
  {
    dayOfWeek: 5, // Friday
    timeOfDay: 'afternoon' as const,
    emotionWatch: ['relief', 'excited', 'tired'],
    insightTemplate: "Fridays seem to bring a shift for you. The week's weight lifting?",
  },
];

type TimeOfDay = 'morning' | 'afternoon' | 'evening';

/**
 * Get time of day from hour
 */
function getTimeOfDay(hour: number): TimeOfDay {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/**
 * Day names for human-readable pattern descriptions
 */
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ============================================================================
// IN-MEMORY TRACKING (would be Firestore in production)
// ============================================================================

// userId -> emotional data points
const emotionalHistory = new Map<string, EmotionalDataPoint[]>();

// userId -> detected patterns
const detectedPatterns = new Map<string, EmotionalPattern[]>();

// userId -> growth moments
const growthMoments = new Map<string, GrowthMoment[]>();

// ============================================================================
// TEMPORAL PATTERN DETECTION
// ============================================================================

/**
 * Analyze for time-based emotional patterns
 *
 * Detects cyclical patterns like:
 * - "Sunday evening anxiety" (the Sunday Scaries)
 * - "Monday morning dread"
 * - "Friday afternoon relief"
 */
function analyzeTemporalPatterns(
  userId: string,
  history: EmotionalDataPoint[],
  patterns: EmotionalPattern[]
): void {
  // Group history by day+timeOfDay
  const temporalGroups = new Map<string, EmotionalDataPoint[]>();

  for (const dp of history) {
    const date = dp.timestamp;
    const dayOfWeek = date.getDay();
    const timeOfDay = getTimeOfDay(date.getHours());
    const key = `${dayOfWeek}_${timeOfDay}`;

    const group = temporalGroups.get(key) || [];
    group.push(dp);
    temporalGroups.set(key, group);
  }

  // Check each temporal pattern
  for (const temporalPattern of TEMPORAL_PATTERNS) {
    const key = `${temporalPattern.dayOfWeek}_${temporalPattern.timeOfDay}`;
    const group = temporalGroups.get(key);

    if (!group || group.length < CONFIG.MIN_RELEVANT_POINTS) {
      continue; // Not enough data for this time slot
    }

    // Check how many match the watched emotions
    const emotionMatches = group.filter((dp) =>
      temporalPattern.emotionWatch.some(
        (watched) =>
          dp.emotion.toLowerCase().includes(watched) || watched.includes(dp.emotion.toLowerCase())
      )
    );

    // If we have enough matches, it's a pattern
    if (emotionMatches.length >= CONFIG.MIN_TEMPORAL_MATCHES) {
      const correlation = emotionMatches.length / group.length;

      if (correlation >= CONFIG.CORRELATION_THRESHOLD) {
        const dayName = DAY_NAMES[temporalPattern.dayOfWeek];
        const matchedEmotions = [
          ...new Set(emotionMatches.map((dp) => dp.emotion.toLowerCase())),
        ].slice(0, 3);

        patterns.push({
          id: `pattern_${userId}_temporal_${key}`,
          userId,
          pattern: `${dayName} ${temporalPattern.timeOfDay} → ${matchedEmotions.join('/')}`,
          evidence: emotionMatches.slice(-3).map((dp) => dp.context || dp.emotion),
          trend: 'cyclical',
          insight: temporalPattern.insightTemplate,
          deliveryTiming: 'when_relevant',
          confidence: correlation,
          detectedAt: new Date(),
          lastUpdated: new Date(),
          surfacedToUser: false,
        });

        log.debug(
          {
            userId,
            dayName,
            timeOfDay: temporalPattern.timeOfDay,
            correlation,
            matches: emotionMatches.length,
          },
          '⏰ Temporal pattern detected'
        );
      }
    }
  }
}

/**
 * Record an emotional data point from a conversation
 */
export function recordEmotionalDataPoint(
  userId: string,
  emotion: string,
  intensity: number,
  topics: string[],
  context?: string
): void {
  const dataPoint: EmotionalDataPoint = {
    timestamp: new Date(),
    emotion,
    intensity,
    topics,
    context,
  };

  const history = emotionalHistory.get(userId) || [];
  history.push(dataPoint);

  // Keep last N data points per user
  if (history.length > CONFIG.MAX_DATA_POINTS_PER_USER) {
    history.shift();
  }

  emotionalHistory.set(userId, history);

  log.debug({ userId, emotion, topics }, 'Recorded emotional data point');

  // Check for patterns after recording
  analyzeForPatterns(userId);
}

/**
 * Analyze user's emotional history for patterns
 */
function analyzeForPatterns(userId: string): void {
  const history = emotionalHistory.get(userId);
  if (!history || history.length < CONFIG.MIN_HISTORY_FOR_PATTERNS) return;

  const patterns: EmotionalPattern[] = [];

  // Check topic-emotion correlations
  for (const pattern of CORRELATION_PATTERNS) {
    const relevantPoints = history.filter((dp) =>
      dp.topics.some((t) => pattern.topicKeywords.some((k) => t.toLowerCase().includes(k)))
    );

    if (relevantPoints.length >= CONFIG.MIN_RELEVANT_POINTS) {
      const emotionalMatches = relevantPoints.filter((dp) =>
        pattern.emotionWatch.includes(dp.emotion.toLowerCase())
      );

      const correlation = emotionalMatches.length / relevantPoints.length;

      if (correlation >= CONFIG.CORRELATION_THRESHOLD) {
        const mostCommonTopic = findMostCommonTopic(relevantPoints, pattern.topicKeywords);

        patterns.push({
          id: `pattern_${userId}_${pattern.topicKeywords[0]}`,
          userId,
          pattern: `${mostCommonTopic} → ${pattern.emotionWatch.join('/')}`,
          evidence: emotionalMatches.slice(-3).map((dp) => dp.context || dp.emotion),
          trend: 'triggered',
          triggers: [mostCommonTopic],
          insight: pattern.insightTemplate.replace('{topic}', mostCommonTopic),
          deliveryTiming:
            correlation >= CONFIG.HIGH_CORRELATION_THRESHOLD ? 'now' : 'when_relevant',
          confidence: correlation,
          detectedAt: new Date(),
          lastUpdated: new Date(),
          surfacedToUser: false,
        });
      }
    }
  }

  // Check for temporal patterns (Sunday evening anxiety, Monday morning dread, etc.)
  analyzeTemporalPatterns(userId, history, patterns);

  // Check for declining trend
  const minPointsForTrend = CONFIG.MIN_RECENT_POINTS_FOR_TREND * 2; // Need 2x for comparison
  if (history.length >= minPointsForTrend) {
    const recentSlice = CONFIG.MIN_RECENT_POINTS_FOR_TREND;
    const recentAvgIntensity = average(history.slice(-recentSlice).map((dp) => dp.intensity));
    const olderAvgIntensity = average(
      history.slice(-minPointsForTrend, -recentSlice).map((dp) => dp.intensity)
    );

    const negativeEmotions = ['stress', 'anxiety', 'sadness', 'overwhelm', 'frustration'];
    const recentNegative = history
      .slice(-recentSlice)
      .filter((dp) => negativeEmotions.includes(dp.emotion.toLowerCase()));

    if (
      recentNegative.length >= CONFIG.MIN_NEGATIVE_FOR_DECLINE &&
      recentAvgIntensity > olderAvgIntensity
    ) {
      patterns.push({
        id: `pattern_${userId}_declining`,
        userId,
        pattern: 'Increasing negative emotions',
        evidence: recentNegative.map((dp) => dp.context || dp.emotion),
        trend: 'declining',
        insight: "Things seem heavier lately. I'm here if you want to talk about it.",
        deliveryTiming: 'now',
        confidence: 0.7,
        detectedAt: new Date(),
        lastUpdated: new Date(),
        surfacedToUser: false,
      });
    }
  }

  // Store patterns
  if (patterns.length > 0) {
    const existingPatterns = detectedPatterns.get(userId) || [];

    // Merge with existing, don't duplicate
    for (const newPattern of patterns) {
      const existingIndex = existingPatterns.findIndex((p) => p.id === newPattern.id);
      if (existingIndex >= 0) {
        // Update existing
        existingPatterns[existingIndex] = {
          ...existingPatterns[existingIndex],
          ...newPattern,
          surfacedToUser: existingPatterns[existingIndex].surfacedToUser,
        };
      } else {
        existingPatterns.push(newPattern);
      }
    }

    detectedPatterns.set(userId, existingPatterns);

    log.info({ userId, patternCount: patterns.length }, '🔮 Emotional patterns detected');
  }
}

// ============================================================================
// GROWTH TRACKING
// ============================================================================

/**
 * Record a potential growth moment
 */
export function recordGrowthEvidence(
  userId: string,
  area: string,
  evidence: string,
  isProgress: boolean
): void {
  const existing = growthMoments.get(userId) || [];

  // Look for existing growth tracking in this area
  const areaGrowth = existing.find((g) => g.area === area && !g.surfaced);

  if (areaGrowth) {
    if (isProgress) {
      // Update with new evidence
      areaGrowth.currentEvidence = evidence;
      areaGrowth.currentDate = new Date();

      // Check if this is a significant enough change to celebrate
      const daysSincePast = Math.floor(
        (Date.now() - new Date(areaGrowth.pastDate).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSincePast >= 7) {
        areaGrowth.significance = daysSincePast >= 30 ? 'breakthrough' : 'significant';
        areaGrowth.celebration = generateGrowthCelebration(areaGrowth);
      }
    }
  } else if (!isProgress) {
    // Start tracking from a low point
    existing.push({
      id: `growth_${userId}_${area}_${Date.now()}`,
      userId,
      area,
      pastEvidence: evidence,
      pastDate: new Date(),
      currentEvidence: '',
      currentDate: new Date(),
      celebration: '',
      significance: 'notable',
      surfaced: false,
    });
    growthMoments.set(userId, existing);
  }
}

/**
 * Generate a celebration message for growth
 */
function generateGrowthCelebration(growth: GrowthMoment): string {
  const daysSince = Math.floor(
    (growth.currentDate.getTime() - growth.pastDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  const timePhrase =
    daysSince > 60
      ? 'a few months ago'
      : daysSince > 30
        ? 'last month'
        : daysSince > 14
          ? 'a couple weeks ago'
          : 'recently';

  const templates = [
    `Remember ${timePhrase} when ${growth.pastEvidence}? Look at you now - ${growth.currentEvidence}. That's real growth.`,
    `Can I just say something? ${timePhrase}, you told me about ${growth.pastEvidence}. And today, ${growth.currentEvidence}. That's not nothing.`,
    `I've been watching you grow in this area. ${timePhrase}: "${growth.pastEvidence}". Now: "${growth.currentEvidence}". I'm proud of you.`,
  ];

  return templates[Math.floor(Math.random() * templates.length)];
}

// ============================================================================
// RETRIEVAL FOR PROMPT INJECTION
// ============================================================================

/**
 * Get patterns ready to surface to the user
 */
export function getPatternInsights(
  userId: string,
  options: { maxCount?: number; onlyUnsurfaced?: boolean } = {}
): EmotionalPattern[] {
  const patterns = detectedPatterns.get(userId) || [];
  const maxCount = options.maxCount ?? 1;
  const onlyUnsurfaced = options.onlyUnsurfaced ?? true;

  let filtered = patterns.filter((p) => p.confidence >= 0.6);

  if (onlyUnsurfaced) {
    filtered = filtered.filter((p) => !p.surfacedToUser);
  }

  // Sort by confidence and delivery timing
  filtered.sort((a, b) => {
    if (a.deliveryTiming === 'now' && b.deliveryTiming !== 'now') return -1;
    if (b.deliveryTiming === 'now' && a.deliveryTiming !== 'now') return 1;
    return b.confidence - a.confidence;
  });

  return filtered.slice(0, maxCount);
}

/**
 * Get growth moments ready to celebrate
 */
export function getGrowthCelebrations(
  userId: string,
  options: { onlyUnsurfaced?: boolean } = {}
): GrowthMoment[] {
  const moments = growthMoments.get(userId) || [];
  const onlyUnsurfaced = options.onlyUnsurfaced ?? true;

  let filtered = moments.filter((g) => g.celebration && g.significance !== 'notable');

  if (onlyUnsurfaced) {
    filtered = filtered.filter((g) => !g.surfaced);
  }

  return filtered;
}

/**
 * Mark a pattern as surfaced
 */
export function markPatternSurfaced(patternId: string, userId: string): void {
  const patterns = detectedPatterns.get(userId);
  if (!patterns) return;

  const pattern = patterns.find((p) => p.id === patternId);
  if (pattern) {
    pattern.surfacedToUser = true;
    log.info({ userId, patternId }, '✅ Pattern marked as surfaced');
  }
}

/**
 * Mark a growth moment as surfaced
 */
export function markGrowthSurfaced(growthId: string, userId: string): void {
  const moments = growthMoments.get(userId);
  if (!moments) return;

  const moment = moments.find((g) => g.id === growthId);
  if (moment) {
    moment.surfaced = true;
    log.info({ userId, growthId }, '✅ Growth celebration marked as surfaced');
  }
}

/**
 * Format pattern insight for prompt injection
 */
export function formatPatternForPrompt(pattern: EmotionalPattern): string {
  return [
    '[🔮 PATTERN INSIGHT - SUPERHUMAN OBSERVATION]',
    '',
    "You've noticed something about this person:",
    '',
    `Pattern: ${pattern.pattern}`,
    `Evidence: ${pattern.evidence.join('; ')}`,
    `Insight to share: "${pattern.insight}"`,
    `Confidence: ${Math.round(pattern.confidence * 100)}%`,
    '',
    'This is SUPERHUMAN - noticing what they might not notice themselves.',
    'Deliver gently, as an observation, not a diagnosis.',
    'Frame it as curiosity: "I\'ve noticed..." not "You always..."',
  ].join('\n');
}

/**
 * Format growth celebration for prompt injection
 */
export function formatGrowthForPrompt(growth: GrowthMoment): string {
  return [
    '[🌱 GROWTH CELEBRATION - SUPERHUMAN MEMORY]',
    '',
    "You remember where they started, and you see how far they've come:",
    '',
    `Area: ${growth.area}`,
    `Then: "${growth.pastEvidence}"`,
    `Now: "${growth.currentEvidence}"`,
    '',
    `Celebrate with: "${growth.celebration}"`,
    '',
    "This is SUPERHUMAN - humans take growth for granted. You don't.",
    'Share this as a gift, with genuine pride in them.',
  ].join('\n');
}

// ============================================================================
// UTILITIES
// ============================================================================

function findMostCommonTopic(dataPoints: EmotionalDataPoint[], keywords: string[]): string {
  const counts = new Map<string, number>();

  for (const dp of dataPoints) {
    for (const topic of dp.topics) {
      const match = keywords.find((k) => topic.toLowerCase().includes(k));
      if (match) {
        counts.set(match, (counts.get(match) || 0) + 1);
      }
    }
  }

  let maxCount = 0;
  let mostCommon = keywords[0];

  for (const [topic, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = topic;
    }
  }

  return mostCommon;
}

function average(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { analyzeForPatterns, detectedPatterns, emotionalHistory, growthMoments };
