/**
 * Semantic Growth Fingerprint - Better Than Human Service
 *
 * "Show them how they've evolved"
 *
 * Computes semantic diff of how user's language, topics, and emotional
 * range have shifted over time:
 *   - "6 months ago, 40% of your words were about stress. Now it's 15%."
 *   - "You used to catastrophize. Now you problem-solve."
 *
 * @module services/superhuman/semantic-intelligence/growth-fingerprint
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { embed, cosineSimilarity } from '../../../memory/embeddings.js';
import { getFirestoreDb } from '../firestore-utils.js';
import type {
  GrowthFingerprint,
  SemanticSnapshot,
  GrowthMetrics,
  GrowthShift,
} from './types.js';

const log = createLogger({ module: 'growth-fingerprint' });

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  SNAPSHOT_INTERVAL_DAYS: 7, // Weekly snapshots
  MIN_SNAPSHOTS_FOR_GROWTH: 4, // Need at least 4 weeks of data
  MAX_SNAPSHOTS: 52, // Keep up to a year
  MIN_MESSAGES_FOR_SNAPSHOT: 20, // Need enough data per snapshot
  SIGNIFICANT_SHIFT_THRESHOLD: 0.15, // 15% change is significant
};

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================

const fingerprintCache = new Map<string, GrowthFingerprint>();
const pendingData = new Map<string, SnapshotData>();

interface SnapshotData {
  topics: Map<string, number>;
  emotions: Map<string, number>;
  languageMetrics: {
    sentenceLengths: number[];
    questionCount: number;
    statementCount: number;
    futureReferences: number;
    selfReferences: number;
    totalMessages: number;
  };
  cognitiveSignals: {
    problemSolvingSignals: number;
    catastrophizingSignals: number;
    growthMindsetSignals: number;
    selfCompassionSignals: number;
  };
  timestamp: number;
}

// ============================================================================
// DATA COLLECTION
// ============================================================================

/**
 * Record data for the current snapshot period.
 *
 * Call this after each conversation:
 * - Topics discussed
 * - Emotions detected
 * - Language patterns observed
 */
export async function recordConversationData(
  userId: string,
  data: {
    topics?: string[];
    emotion?: string;
    messageText?: string;
    cognitivePattern?: 'problem_solving' | 'catastrophizing' | 'growth' | 'self_compassion';
  }
): Promise<void> {
  const { topics, emotion, messageText, cognitivePattern } = data;

  // Get or create pending data
  let pending = pendingData.get(userId);
  if (!pending) {
    pending = {
      topics: new Map(),
      emotions: new Map(),
      languageMetrics: {
        sentenceLengths: [],
        questionCount: 0,
        statementCount: 0,
        futureReferences: 0,
        selfReferences: 0,
        totalMessages: 0,
      },
      cognitiveSignals: {
        problemSolvingSignals: 0,
        catastrophizingSignals: 0,
        growthMindsetSignals: 0,
        selfCompassionSignals: 0,
      },
      timestamp: Date.now(),
    };
    pendingData.set(userId, pending);
  }

  // Record topics
  if (topics) {
    for (const topic of topics) {
      pending.topics.set(topic, (pending.topics.get(topic) || 0) + 1);
    }
  }

  // Record emotion
  if (emotion) {
    pending.emotions.set(emotion, (pending.emotions.get(emotion) || 0) + 1);
  }

  // Analyze message text
  if (messageText) {
    analyzeLanguage(pending.languageMetrics, messageText);
  }

  // Record cognitive pattern
  if (cognitivePattern) {
    switch (cognitivePattern) {
      case 'problem_solving':
        pending.cognitiveSignals.problemSolvingSignals++;
        break;
      case 'catastrophizing':
        pending.cognitiveSignals.catastrophizingSignals++;
        break;
      case 'growth':
        pending.cognitiveSignals.growthMindsetSignals++;
        break;
      case 'self_compassion':
        pending.cognitiveSignals.selfCompassionSignals++;
        break;
    }
  }

  // Check if it's time to create a snapshot
  await checkAndCreateSnapshot(userId);
}

/**
 * Analyze language metrics from message text.
 */
function analyzeLanguage(
  metrics: SnapshotData['languageMetrics'],
  text: string
): void {
  metrics.totalMessages++;

  // Sentence length
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  for (const sentence of sentences) {
    metrics.sentenceLengths.push(sentence.split(/\s+/).length);
  }

  // Questions vs statements
  if (text.includes('?')) {
    metrics.questionCount++;
  } else {
    metrics.statementCount++;
  }

  // Future references
  const futureWords = ['will', 'going to', 'plan to', 'want to', 'hope to', 'tomorrow', 'next week', 'someday'];
  const textLower = text.toLowerCase();
  for (const word of futureWords) {
    if (textLower.includes(word)) {
      metrics.futureReferences++;
      break;
    }
  }

  // Self references
  const selfWords = ['i ', 'i\'m', 'my ', 'me ', 'myself'];
  for (const word of selfWords) {
    if (textLower.includes(word)) {
      metrics.selfReferences++;
      break;
    }
  }
}

/**
 * Check if it's time to create a new snapshot.
 */
async function checkAndCreateSnapshot(userId: string): Promise<void> {
  const fingerprint = fingerprintCache.get(userId) || await loadFingerprint(userId);
  const pending = pendingData.get(userId);

  if (!pending) return;

  // Check if enough time has passed
  const lastSnapshot = fingerprint?.snapshots[fingerprint.snapshots.length - 1];
  const daysSinceLastSnapshot = lastSnapshot
    ? (Date.now() - lastSnapshot.timestamp) / (24 * 60 * 60 * 1000)
    : CONFIG.SNAPSHOT_INTERVAL_DAYS;

  // Check if we have enough data
  const hasEnoughData =
    pending.languageMetrics.totalMessages >= CONFIG.MIN_MESSAGES_FOR_SNAPSHOT;

  if (daysSinceLastSnapshot >= CONFIG.SNAPSHOT_INTERVAL_DAYS && hasEnoughData) {
    await createSnapshot(userId, fingerprint, pending);
    pendingData.delete(userId);
  }
}

/**
 * Create a snapshot from pending data.
 */
async function createSnapshot(
  userId: string,
  fingerprint: GrowthFingerprint | null,
  pending: SnapshotData
): Promise<void> {
  const snapshot = buildSnapshot(pending);

  // Create or update fingerprint
  if (!fingerprint) {
    fingerprint = {
      id: `growth_${userId}`,
      userId,
      snapshots: [snapshot],
      snapshotInterval: 'weekly',
      growth: calculateInitialGrowth(snapshot),
      growthNarrative: 'Just starting to track your growth journey.',
      significantShifts: [],
      firstSnapshot: Date.now(),
      lastSnapshot: Date.now(),
    };
  } else {
    // Add new snapshot
    fingerprint.snapshots.push(snapshot);

    // Trim if too many
    if (fingerprint.snapshots.length > CONFIG.MAX_SNAPSHOTS) {
      fingerprint.snapshots = fingerprint.snapshots.slice(-CONFIG.MAX_SNAPSHOTS);
    }

    fingerprint.lastSnapshot = Date.now();

    // Recalculate growth if we have enough data
    if (fingerprint.snapshots.length >= CONFIG.MIN_SNAPSHOTS_FOR_GROWTH) {
      fingerprint.growth = calculateGrowthMetrics(fingerprint.snapshots);
      detectSignificantShifts(fingerprint);
      fingerprint.growthNarrative = generateGrowthNarrative(fingerprint);
    }
  }

  fingerprintCache.set(userId, fingerprint);
  await saveFingerprint(userId, fingerprint);

  log.debug(
    { userId, snapshotCount: fingerprint.snapshots.length },
    '📸 Growth snapshot created'
  );
}

/**
 * Build a snapshot from pending data.
 */
function buildSnapshot(pending: SnapshotData): SemanticSnapshot {
  const { topics, emotions, languageMetrics, cognitiveSignals } = pending;

  // Calculate topic distribution
  const totalTopicMentions = [...topics.values()].reduce((a, b) => a + b, 0);
  const topicDistribution = [...topics.entries()]
    .map(([topic, count]) => ({
      topic,
      weight: totalTopicMentions > 0 ? count / totalTopicMentions : 0,
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 20);

  // Calculate emotional vocabulary
  const emotionalVocabulary = [...emotions.entries()]
    .map(([word, frequency]) => ({ word, frequency }))
    .sort((a, b) => b.frequency - a.frequency);

  // Calculate emotional range (diversity)
  const uniqueEmotions = emotions.size;
  const totalEmotionMentions = [...emotions.values()].reduce((a, b) => a + b, 0);
  const emotionalRange = totalEmotionMentions > 0
    ? Math.min(1, uniqueEmotions / 10) // Normalize to 0-1
    : 0;

  // Language patterns
  const { sentenceLengths, questionCount, statementCount, futureReferences, selfReferences, totalMessages } = languageMetrics;
  const avgSentenceLength = sentenceLengths.length > 0
    ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length
    : 0;
  const totalQS = questionCount + statementCount;
  const questionRatio = totalQS > 0 ? questionCount / totalQS : 0;
  const futureOrientation = totalMessages > 0 ? futureReferences / totalMessages : 0;
  const selfReferenceRatio = totalMessages > 0 ? selfReferences / totalMessages : 0;

  // Cognitive patterns
  const { problemSolvingSignals, catastrophizingSignals, growthMindsetSignals, selfCompassionSignals } = cognitiveSignals;
  const totalCognitive = problemSolvingSignals + catastrophizingSignals + growthMindsetSignals + selfCompassionSignals + 1; // +1 to avoid division by zero
  const problemSolvingRatio = problemSolvingSignals / (problemSolvingSignals + catastrophizingSignals + 1);

  return {
    timestamp: Date.now(),
    topicDistribution,
    emotionalVocabulary,
    emotionalRange,
    languagePatterns: {
      avgSentenceLength,
      questionRatio,
      certaintyLevel: 1 - questionRatio, // Inverse of question ratio
      futureOrientation,
      selfReferenceRatio,
    },
    cognitivePatterns: {
      problemSolvingRatio,
      growthMindsetSignals: growthMindsetSignals / totalCognitive,
      selfCompassionLevel: selfCompassionSignals / totalCognitive,
    },
  };
}

/**
 * Calculate growth metrics from snapshots.
 */
function calculateGrowthMetrics(snapshots: SemanticSnapshot[]): GrowthMetrics {
  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];

  // Emotional range growth
  const emotionalRangeGrowth = last.emotionalRange - first.emotionalRange;

  // Topic evolution
  const topicEvolution: Array<{ topic: string; trend: 'growing' | 'shrinking' | 'stable' }> = [];
  const firstTopics = new Map(first.topicDistribution.map((t) => [t.topic, t.weight]));
  const lastTopics = new Map(last.topicDistribution.map((t) => [t.topic, t.weight]));

  // Check all topics from both snapshots
  const allTopics = new Set([...firstTopics.keys(), ...lastTopics.keys()]);
  for (const topic of allTopics) {
    const firstWeight = firstTopics.get(topic) || 0;
    const lastWeight = lastTopics.get(topic) || 0;
    const change = lastWeight - firstWeight;

    if (change > CONFIG.SIGNIFICANT_SHIFT_THRESHOLD) {
      topicEvolution.push({ topic, trend: 'growing' });
    } else if (change < -CONFIG.SIGNIFICANT_SHIFT_THRESHOLD) {
      topicEvolution.push({ topic, trend: 'shrinking' });
    }
  }

  // Language maturation
  const languageMaturation = {
    questionToStatementShift:
      first.languagePatterns.questionRatio - last.languagePatterns.questionRatio,
    certaintyGrowth:
      last.languagePatterns.certaintyLevel - first.languagePatterns.certaintyLevel,
    futureOrientationGrowth:
      last.languagePatterns.futureOrientation - first.languagePatterns.futureOrientation,
  };

  // Cognitive growth
  const cognitiveGrowth = {
    problemSolvingImprovement:
      last.cognitivePatterns.problemSolvingRatio - first.cognitivePatterns.problemSolvingRatio,
    growthMindsetProgress:
      last.cognitivePatterns.growthMindsetSignals - first.cognitivePatterns.growthMindsetSignals,
    selfCompassionGrowth:
      last.cognitivePatterns.selfCompassionLevel - first.cognitivePatterns.selfCompassionLevel,
  };

  return {
    emotionalRangeGrowth,
    topicEvolution,
    languageMaturation,
    cognitiveGrowth,
  };
}

/**
 * Calculate initial growth metrics (no growth yet).
 */
function calculateInitialGrowth(snapshot: SemanticSnapshot): GrowthMetrics {
  return {
    emotionalRangeGrowth: 0,
    topicEvolution: [],
    languageMaturation: {
      questionToStatementShift: 0,
      certaintyGrowth: 0,
      futureOrientationGrowth: 0,
    },
    cognitiveGrowth: {
      problemSolvingImprovement: 0,
      growthMindsetProgress: 0,
      selfCompassionGrowth: 0,
    },
  };
}

/**
 * Detect significant shifts between snapshots.
 */
function detectSignificantShifts(fingerprint: GrowthFingerprint): void {
  const snapshots = fingerprint.snapshots;
  if (snapshots.length < 2) return;

  const shifts: GrowthShift[] = [];

  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];

    // Check emotional range shift
    const emotionalShift = Math.abs(curr.emotionalRange - prev.emotionalRange);
    if (emotionalShift >= CONFIG.SIGNIFICANT_SHIFT_THRESHOLD) {
      shifts.push({
        timestamp: curr.timestamp,
        description:
          curr.emotionalRange > prev.emotionalRange
            ? 'Your emotional vocabulary expanded significantly'
            : 'You used fewer different emotional words',
        magnitude: emotionalShift,
        domain: 'emotional',
      });
    }

    // Check cognitive shift
    const cognitiveShift =
      curr.cognitivePatterns.problemSolvingRatio -
      prev.cognitivePatterns.problemSolvingRatio;
    if (Math.abs(cognitiveShift) >= CONFIG.SIGNIFICANT_SHIFT_THRESHOLD) {
      shifts.push({
        timestamp: curr.timestamp,
        description:
          cognitiveShift > 0
            ? 'You shifted toward more problem-solving thinking'
            : 'You had more anxious or ruminative thoughts',
        magnitude: Math.abs(cognitiveShift),
        domain: 'cognitive',
      });
    }

    // Check future orientation shift
    const futureShift =
      curr.languagePatterns.futureOrientation -
      prev.languagePatterns.futureOrientation;
    if (Math.abs(futureShift) >= CONFIG.SIGNIFICANT_SHIFT_THRESHOLD) {
      shifts.push({
        timestamp: curr.timestamp,
        description:
          futureShift > 0
            ? 'You started talking more about the future'
            : 'Your focus shifted more to the present',
        magnitude: Math.abs(futureShift),
        domain: 'behavioral',
      });
    }
  }

  // Keep most recent significant shifts
  fingerprint.significantShifts = shifts.slice(-10);
}

/**
 * Generate natural language growth narrative.
 */
function generateGrowthNarrative(fingerprint: GrowthFingerprint): string {
  const { growth, snapshots, significantShifts } = fingerprint;
  const parts: string[] = [];

  // Duration
  const durationWeeks = snapshots.length;
  parts.push(`Over the past ${durationWeeks} weeks:`);

  // Emotional growth
  if (growth.emotionalRangeGrowth > 0.1) {
    parts.push(
      `Your emotional vocabulary has grown. You're expressing yourself with more nuance.`
    );
  } else if (growth.emotionalRangeGrowth < -0.1) {
    parts.push(`You've been using simpler emotional language lately.`);
  }

  // Topic shifts
  const growingTopics = growth.topicEvolution.filter((t) => t.trend === 'growing');
  const shrinkingTopics = growth.topicEvolution.filter((t) => t.trend === 'shrinking');

  if (growingTopics.length > 0) {
    parts.push(`You've been talking more about ${growingTopics.map((t) => t.topic).join(', ')}.`);
  }
  if (shrinkingTopics.length > 0) {
    parts.push(
      `${shrinkingTopics.map((t) => t.topic).join(', ')} comes up less often now.`
    );
  }

  // Cognitive growth
  if (growth.cognitiveGrowth.problemSolvingImprovement > 0.1) {
    parts.push(`You're approaching challenges with more of a problem-solving mindset.`);
  }
  if (growth.cognitiveGrowth.selfCompassionGrowth > 0.1) {
    parts.push(`You're being kinder to yourself.`);
  }

  // Recent significant shift
  if (significantShifts.length > 0) {
    const recent = significantShifts[significantShifts.length - 1];
    parts.push(`Recently: ${recent.description}`);
  }

  return parts.join(' ');
}

// ============================================================================
// RETRIEVAL FUNCTIONS
// ============================================================================

/**
 * Get the growth fingerprint for a user.
 */
export async function getGrowthFingerprint(
  userId: string
): Promise<GrowthFingerprint | null> {
  return fingerprintCache.get(userId) || await loadFingerprint(userId);
}

/**
 * Get growth comparison between two time periods.
 */
export async function getGrowthComparison(
  userId: string,
  weeksAgo: number
): Promise<{
  then: SemanticSnapshot | null;
  now: SemanticSnapshot | null;
  changes: string[];
} | null> {
  const fingerprint = await getGrowthFingerprint(userId);
  if (!fingerprint || fingerprint.snapshots.length < weeksAgo) {
    return null;
  }

  const now = fingerprint.snapshots[fingerprint.snapshots.length - 1];
  const then = fingerprint.snapshots[fingerprint.snapshots.length - weeksAgo];
  const changes: string[] = [];

  // Compare emotional range
  const emotionalChange = now.emotionalRange - then.emotionalRange;
  if (Math.abs(emotionalChange) > 0.05) {
    changes.push(
      emotionalChange > 0
        ? `Your emotional vocabulary has ${Math.round(emotionalChange * 100)}% more variety`
        : `You're using ${Math.round(Math.abs(emotionalChange) * 100)}% less emotional variety`
    );
  }

  // Compare top topics
  const thenTopTopics = then.topicDistribution.slice(0, 3).map((t) => t.topic);
  const nowTopTopics = now.topicDistribution.slice(0, 3).map((t) => t.topic);
  const newTopics = nowTopTopics.filter((t) => !thenTopTopics.includes(t));
  const droppedTopics = thenTopTopics.filter((t) => !nowTopTopics.includes(t));

  if (newTopics.length > 0) {
    changes.push(`${newTopics.join(', ')} is now a bigger part of your conversations`);
  }
  if (droppedTopics.length > 0) {
    changes.push(`${droppedTopics.join(', ')} has faded from focus`);
  }

  // Compare cognitive patterns
  const cognitiveChange =
    now.cognitivePatterns.problemSolvingRatio - then.cognitivePatterns.problemSolvingRatio;
  if (Math.abs(cognitiveChange) > 0.1) {
    changes.push(
      cognitiveChange > 0
        ? `You're doing more problem-solving and less catastrophizing`
        : `You've had more anxious thoughts lately`
    );
  }

  return { then, now, changes };
}

/**
 * Build context string for LLM injection.
 */
export async function buildGrowthContext(userId: string): Promise<string> {
  const fingerprint = await getGrowthFingerprint(userId);

  if (!fingerprint || fingerprint.snapshots.length < CONFIG.MIN_SNAPSHOTS_FOR_GROWTH) {
    return '';
  }

  const sections: string[] = [
    '[GROWTH FINGERPRINT - Seeing Their Evolution]',
    "You see how they've changed over time. Reflect this back gently.",
    '',
  ];

  // Add narrative
  sections.push(`**Your Growth Story:**`);
  sections.push(fingerprint.growthNarrative);
  sections.push('');

  // Add specific metrics if notable
  const { growth } = fingerprint;

  if (growth.emotionalRangeGrowth > 0.1) {
    sections.push(`✨ Emotional expression has expanded ${Math.round(growth.emotionalRangeGrowth * 100)}%`);
  }

  if (growth.cognitiveGrowth.problemSolvingImprovement > 0.1) {
    sections.push(`🧠 Problem-solving mindset improved ${Math.round(growth.cognitiveGrowth.problemSolvingImprovement * 100)}%`);
  }

  if (growth.cognitiveGrowth.selfCompassionGrowth > 0.1) {
    sections.push(`💚 Self-compassion up ${Math.round(growth.cognitiveGrowth.selfCompassionGrowth * 100)}%`);
  }

  // Recent shifts
  if (fingerprint.significantShifts.length > 0) {
    sections.push('');
    sections.push('**Recent Shifts:**');
    for (const shift of fingerprint.significantShifts.slice(-3)) {
      sections.push(`  • ${shift.description}`);
    }
  }

  sections.push('');
  sections.push('Reference growth naturally: "I\'ve noticed over time..." or "You used to..."');

  return sections.join('\n');
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function loadFingerprint(userId: string): Promise<GrowthFingerprint | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('semantic_intelligence')
      .doc('growth_fingerprint')
      .get();

    if (doc.exists) {
      const fingerprint = doc.data() as GrowthFingerprint;
      fingerprintCache.set(userId, fingerprint);
      return fingerprint;
    }
    return null;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load growth fingerprint');
    return null;
  }
}

async function saveFingerprint(
  userId: string,
  fingerprint: GrowthFingerprint
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('semantic_intelligence')
      .doc('growth_fingerprint')
      .set(fingerprint);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to save growth fingerprint');
  }
}

/**
 * Clear growth cache for a user.
 */
export function clearGrowthCache(userId?: string): void {
  if (userId) {
    fingerprintCache.delete(userId);
    pendingData.delete(userId);
  } else {
    fingerprintCache.clear();
    pendingData.clear();
  }
}

/**
 * Force create a snapshot (for testing or manual triggers).
 */
export async function forceCreateSnapshot(userId: string): Promise<void> {
  const fingerprint = fingerprintCache.get(userId) || await loadFingerprint(userId);
  const pending = pendingData.get(userId);

  if (pending) {
    await createSnapshot(userId, fingerprint, pending);
    pendingData.delete(userId);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const growthFingerprint = {
  recordData: recordConversationData,
  getFingerprint: getGrowthFingerprint,
  getComparison: getGrowthComparison,
  buildContext: buildGrowthContext,
  forceSnapshot: forceCreateSnapshot,
  clearCache: clearGrowthCache,
};

