/**
 * Unspoken Pattern Mirror
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Surfaces patterns users can't see in themselves.
 * "I noticed you light up every time you talk about teaching,
 * but you haven't mentioned it in weeks. What's going on there?"
 *
 * @module PatternMirror
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from './firestore-utils.js';

const log = createLogger({ module: 'PatternMirror' });

// ============================================================================
// TYPES
// ============================================================================

export type PatternCycle = 'weekly' | 'monthly' | 'seasonal' | 'annual';
export type TopicFrequency = 'daily' | 'weekly' | 'often' | 'rare' | 'never';

export interface TopicEnergy {
  topic: string;
  avgEnergyIncrease: number; // Positive = energizing, negative = draining
  mentionCount: number;
  lastMentioned: Date;
  voiceMarkersWhenDiscussing: {
    avgPitch: number;
    avgEnergy: number;
    avgSpeechRate: number;
  };
  sentiment: 'positive' | 'negative' | 'mixed' | 'neutral';
}

export interface CyclicalPattern {
  id: string;
  pattern: string; // Human-readable description
  cycle: PatternCycle;
  dataPoints: number;
  confidence: number;
  triggers?: string[]; // What seems to trigger this pattern
  nextExpected?: Date;
  surfacedToUser: boolean;
  surfacedAt?: Date;
  userReaction?: 'surprised' | 'recognized' | 'dismissed';
}

export interface FadingTopic {
  topic: string;
  peakFrequency: TopicFrequency;
  peakPeriod: { start: Date; end: Date };
  currentFrequency: 'rare' | 'never';
  lastMentioned: Date;
  daysSinceLastMention: number;
  wasEnergizing: boolean;
  possibleReasons?: string[];
  surfacedToUser: boolean;
}

export interface WordVoiceMismatch {
  timestamp: Date;
  whatTheySaid: string;
  howTheySaidIt: string;
  topic: string;
  mismatchType: 'enthusiasm_flat' | 'positive_sad' | 'fine_stressed' | 'other';
  surfacedToUser: boolean;
}

export interface PatternInsight {
  type: 'faded_energizer' | 'cyclical_pattern' | 'voice_mismatch' | 'energy_correlation';
  insight: string;
  gentleProbe: string;
  topic?: string;
  patternId?: string;
  priority: number;
}

export interface PatternMirrorProfile {
  userId: string;

  /** Topics that light them up */
  energizingTopics: TopicEnergy[];

  /** Topics that drain them */
  drainingTopics: TopicEnergy[];

  /** Cyclical patterns they don't notice */
  cyclicalPatterns: CyclicalPattern[];

  /** Topics that have faded from conversations */
  fadingTopics: FadingTopic[];

  /** Contradictions between words and voice */
  wordVoiceMismatches: WordVoiceMismatch[];

  /** All topic mentions for tracking */
  topicHistory: Array<{
    topic: string;
    timestamp: Date;
    energy: number;
  }>;

  updatedAt: Date;
}

// ============================================================================
// IN-MEMORY STATE
// ============================================================================

const profiles = new Map<string, PatternMirrorProfile>();

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Record topic + voice energy correlation.
 * Call after each topic is discussed.
 */
export function recordTopicEnergy(
  userId: string,
  data: {
    topic: string;
    voiceEnergy: number; // 0-1
    baselineEnergy: number; // User's typical energy
    voiceMarkers?: {
      pitch: number;
      speechRate: number;
    };
    sentiment?: 'positive' | 'negative' | 'mixed' | 'neutral';
  }
): void {
  let profile = profiles.get(userId);
  if (!profile) {
    profile = createEmptyProfile(userId);
    profiles.set(userId, profile);
  }

  const energyDelta = data.voiceEnergy - data.baselineEnergy;
  const topic = data.topic.toLowerCase();

  // Record in history
  profile.topicHistory.push({
    topic,
    timestamp: new Date(),
    energy: data.voiceEnergy,
  });

  // Keep last 500 entries
  if (profile.topicHistory.length > 500) {
    profile.topicHistory = profile.topicHistory.slice(-500);
  }

  // Update energizing or draining lists
  if (energyDelta > 0.1) {
    // Energizing topic
    updateTopicList(profile.energizingTopics, topic, energyDelta, data);

    // Remove from draining if it was there
    profile.drainingTopics = profile.drainingTopics.filter((t) => t.topic !== topic);
  } else if (energyDelta < -0.1) {
    // Draining topic
    updateTopicList(profile.drainingTopics, topic, energyDelta, data);

    // Remove from energizing if it was there
    profile.energizingTopics = profile.energizingTopics.filter((t) => t.topic !== topic);
  }

  // Update fading topics
  updateFadingTopics(profile, topic);

  profile.updatedAt = new Date();
}

function updateTopicList(
  list: TopicEnergy[],
  topic: string,
  energyDelta: number,
  data: {
    voiceEnergy: number;
    voiceMarkers?: { pitch: number; speechRate: number };
    sentiment?: 'positive' | 'negative' | 'mixed' | 'neutral';
  }
): void {
  const existing = list.find((t) => t.topic === topic);

  if (existing) {
    // Update running average
    const oldAvg = existing.avgEnergyIncrease;
    const newAvg = (oldAvg * existing.mentionCount + energyDelta) / (existing.mentionCount + 1);
    existing.avgEnergyIncrease = newAvg;
    existing.mentionCount++;
    existing.lastMentioned = new Date();

    // Update voice markers if provided
    if (data.voiceMarkers) {
      const oldPitch = existing.voiceMarkersWhenDiscussing.avgPitch;
      const oldRate = existing.voiceMarkersWhenDiscussing.avgSpeechRate;
      existing.voiceMarkersWhenDiscussing.avgPitch =
        (oldPitch * (existing.mentionCount - 1) + data.voiceMarkers.pitch) / existing.mentionCount;
      existing.voiceMarkersWhenDiscussing.avgSpeechRate =
        (oldRate * (existing.mentionCount - 1) + data.voiceMarkers.speechRate) /
        existing.mentionCount;
    }
    existing.voiceMarkersWhenDiscussing.avgEnergy =
      (existing.voiceMarkersWhenDiscussing.avgEnergy * (existing.mentionCount - 1) +
        data.voiceEnergy) /
      existing.mentionCount;

    if (data.sentiment) {
      existing.sentiment = data.sentiment;
    }
  } else {
    // New topic
    list.push({
      topic,
      avgEnergyIncrease: energyDelta,
      mentionCount: 1,
      lastMentioned: new Date(),
      voiceMarkersWhenDiscussing: {
        avgPitch: data.voiceMarkers?.pitch || 0,
        avgEnergy: data.voiceEnergy,
        avgSpeechRate: data.voiceMarkers?.speechRate || 0,
      },
      sentiment: data.sentiment || 'neutral',
    });
  }

  // Keep top 20 topics
  list.sort((a, b) => Math.abs(b.avgEnergyIncrease) - Math.abs(a.avgEnergyIncrease));
  if (list.length > 20) {
    list.length = 20;
  }
}

function updateFadingTopics(profile: PatternMirrorProfile, currentTopic: string): void {
  // Check if any previously frequent topics are fading
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Group topic history by topic
  const topicCounts: Record<string, { recent: number; older: number }> = {};

  for (const entry of profile.topicHistory) {
    const topic = entry.topic;
    if (!topicCounts[topic]) {
      topicCounts[topic] = { recent: 0, older: 0 };
    }

    if (new Date(entry.timestamp) > thirtyDaysAgo) {
      topicCounts[topic].recent++;
    } else {
      topicCounts[topic].older++;
    }
  }

  // Detect fading (was frequent, now rare)
  for (const [topic, counts] of Object.entries(topicCounts)) {
    if (counts.older >= 5 && counts.recent <= 1) {
      const existingFading = profile.fadingTopics.find((f) => f.topic === topic);

      if (!existingFading) {
        // New fading topic
        const lastEntry = profile.topicHistory.filter((h) => h.topic === topic).pop();
        const wasEnergizing = profile.energizingTopics.some((e) => e.topic === topic);

        profile.fadingTopics.push({
          topic,
          peakFrequency: counts.older >= 10 ? 'often' : 'weekly',
          peakPeriod: {
            start: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000),
            end: thirtyDaysAgo,
          },
          currentFrequency: counts.recent === 0 ? 'never' : 'rare',
          lastMentioned: lastEntry ? new Date(lastEntry.timestamp) : thirtyDaysAgo,
          daysSinceLastMention: lastEntry
            ? Math.floor(
                (now.getTime() - new Date(lastEntry.timestamp).getTime()) / (24 * 60 * 60 * 1000)
              )
            : 30,
          wasEnergizing,
          surfacedToUser: false,
        });

        log.debug({ userId: profile.userId, topic, wasEnergizing }, '📉 Detected fading topic');
      }
    }
  }

  // Update existing fading topics (remove if they came back)
  profile.fadingTopics = profile.fadingTopics.filter((f) => {
    const recentMentions = profile.topicHistory.filter(
      (h) => h.topic === f.topic && new Date(h.timestamp) > thirtyDaysAgo
    ).length;
    return recentMentions <= 2; // Still fading if 2 or fewer recent mentions
  });
}

/**
 * Record a mismatch between words and voice.
 */
export function recordWordVoiceMismatch(
  userId: string,
  data: {
    whatTheySaid: string;
    howTheySaidIt: string;
    topic: string;
    mismatchType: 'enthusiasm_flat' | 'positive_sad' | 'fine_stressed' | 'other';
  }
): void {
  let profile = profiles.get(userId);
  if (!profile) {
    profile = createEmptyProfile(userId);
    profiles.set(userId, profile);
  }

  profile.wordVoiceMismatches.push({
    timestamp: new Date(),
    ...data,
    surfacedToUser: false,
  });

  // Keep last 30
  if (profile.wordVoiceMismatches.length > 30) {
    profile.wordVoiceMismatches = profile.wordVoiceMismatches.slice(-30);
  }

  log.debug({ userId, mismatchType: data.mismatchType }, '🎭 Word-voice mismatch recorded');
}

/**
 * Record a cyclical pattern.
 */
export function recordCyclicalPattern(
  userId: string,
  data: {
    pattern: string;
    cycle: PatternCycle;
    triggers?: string[];
  }
): void {
  let profile = profiles.get(userId);
  if (!profile) {
    profile = createEmptyProfile(userId);
    profiles.set(userId, profile);
  }

  // Check if pattern already exists
  const existing = profile.cyclicalPatterns.find((p) => p.pattern === data.pattern);

  if (existing) {
    existing.dataPoints++;
    existing.confidence = Math.min(0.95, existing.confidence + 0.1);
    if (data.triggers) {
      existing.triggers = [...new Set([...(existing.triggers || []), ...data.triggers])];
    }
  } else {
    profile.cyclicalPatterns.push({
      id: `pattern_${Date.now()}`,
      pattern: data.pattern,
      cycle: data.cycle,
      dataPoints: 1,
      confidence: 0.4,
      triggers: data.triggers,
      surfacedToUser: false,
    });
  }
}

function createEmptyProfile(userId: string): PatternMirrorProfile {
  return {
    userId,
    energizingTopics: [],
    drainingTopics: [],
    cyclicalPatterns: [],
    fadingTopics: [],
    wordVoiceMismatches: [],
    topicHistory: [],
    updatedAt: new Date(),
  };
}

// ============================================================================
// INSIGHT GENERATION
// ============================================================================

/**
 * Get the most impactful pattern insight to share with user.
 */
export function getPatternToSurface(userId: string): PatternInsight | null {
  const profile = profiles.get(userId);
  if (!profile) return null;

  const insights: PatternInsight[] = [];

  // Priority 1: Fading topics that were energizing
  for (const ft of profile.fadingTopics) {
    if (!ft.surfacedToUser && ft.wasEnergizing && ft.daysSinceLastMention > 14) {
      insights.push({
        type: 'faded_energizer',
        insight: `You used to light up when talking about ${ft.topic}, but you haven't mentioned it in ${ft.daysSinceLastMention} days.`,
        gentleProbe: `What's been going on with ${ft.topic}?`,
        topic: ft.topic,
        priority: 10,
      });
    }
  }

  // Priority 2: Unsurfaced cyclical patterns with high confidence
  for (const cp of profile.cyclicalPatterns) {
    if (!cp.surfacedToUser && cp.confidence > 0.6 && cp.dataPoints >= 3) {
      insights.push({
        type: 'cyclical_pattern',
        insight: cp.pattern,
        gentleProbe: 'Have you noticed that pattern?',
        patternId: cp.id,
        priority: 8,
      });
    }
  }

  // Priority 3: Recent word-voice mismatches
  const recentMismatches = profile.wordVoiceMismatches.filter(
    (m) =>
      !m.surfacedToUser && Date.now() - new Date(m.timestamp).getTime() < 7 * 24 * 60 * 60 * 1000
  );
  if (recentMismatches.length >= 2) {
    const topics = [...new Set(recentMismatches.map((m) => m.topic))];
    insights.push({
      type: 'voice_mismatch',
      insight: `I've noticed your voice tells a different story than your words sometimes, especially about ${topics[0]}.`,
      gentleProbe: 'How are you really feeling about that?',
      topic: topics[0],
      priority: 7,
    });
  }

  // Priority 4: Strong energy correlations
  for (const et of profile.energizingTopics.slice(0, 3)) {
    if (et.avgEnergyIncrease > 0.25 && et.mentionCount >= 3) {
      // Check if they haven't talked about it recently
      const lastMention = new Date(et.lastMentioned);
      const daysSince = Math.floor((Date.now() - lastMention.getTime()) / (24 * 60 * 60 * 1000));

      if (daysSince > 7) {
        insights.push({
          type: 'energy_correlation',
          insight: `You really light up when talking about ${et.topic}. Your energy jumps ${(et.avgEnergyIncrease * 100).toFixed(0)}% when it comes up.`,
          gentleProbe: `What's happening with ${et.topic} lately?`,
          topic: et.topic,
          priority: 5,
        });
      }
    }
  }

  // Return highest priority insight
  insights.sort((a, b) => b.priority - a.priority);
  return insights[0] || null;
}

/**
 * Mark an insight as surfaced.
 */
export function markInsightSurfaced(
  userId: string,
  insightType: PatternInsight['type'],
  identifier: string, // topic or patternId
  userReaction?: 'surprised' | 'recognized' | 'dismissed'
): void {
  const profile = profiles.get(userId);
  if (!profile) return;

  if (insightType === 'faded_energizer') {
    const ft = profile.fadingTopics.find((f) => f.topic === identifier);
    if (ft) ft.surfacedToUser = true;
  } else if (insightType === 'cyclical_pattern') {
    const cp = profile.cyclicalPatterns.find((p) => p.id === identifier);
    if (cp) {
      cp.surfacedToUser = true;
      cp.surfacedAt = new Date();
      cp.userReaction = userReaction;
    }
  } else if (insightType === 'voice_mismatch') {
    for (const m of profile.wordVoiceMismatches) {
      if (m.topic === identifier) m.surfacedToUser = true;
    }
  }
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build context for LLM injection.
 */
export function buildPatternMirrorContext(userId: string): string {
  const profile = profiles.get(userId);
  if (!profile) return '';

  const sections: string[] = ['[PATTERN MIRROR - Unspoken Insights]'];

  // Topics that energize them
  if (profile.energizingTopics.length > 0) {
    sections.push('Topics that light them up:');
    for (const topic of profile.energizingTopics.slice(0, 3)) {
      sections.push(`- ${topic.topic} (+${(topic.avgEnergyIncrease * 100).toFixed(0)}% energy)`);
    }
    sections.push('');
  }

  // Topics that drain them
  if (profile.drainingTopics.length > 0) {
    sections.push('Topics that drain them:');
    for (const topic of profile.drainingTopics.slice(0, 3)) {
      sections.push(`- ${topic.topic} (${(topic.avgEnergyIncrease * 100).toFixed(0)}% energy)`);
    }
    sections.push('');
  }

  // Insight to share
  const insight = getPatternToSurface(userId);
  if (insight) {
    sections.push('🪞 Pattern insight (consider surfacing):');
    sections.push(`"${insight.insight}"`);
    sections.push(`Gentle probe: "${insight.gentleProbe}"`);
    sections.push('');
  }

  // Fading energizing topics
  const fadedEnergizers = profile.fadingTopics.filter((f) => f.wasEnergizing && !f.surfacedToUser);
  if (fadedEnergizers.length > 0) {
    sections.push('Topics that used to light them up but faded:');
    for (const ft of fadedEnergizers.slice(0, 2)) {
      sections.push(`- ${ft.topic} (last mentioned ${ft.daysSinceLastMention} days ago)`);
    }
    sections.push('');
  }

  sections.push('Use these insights wisely. Surface at the right moment.');

  return sections.join('\n');
}

// ============================================================================
// PERSISTENCE
// ============================================================================

export async function savePatternProfile(userId: string): Promise<void> {
  const profile = profiles.get(userId);
  if (!profile) return;

  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('pattern_mirror')
      .doc('profile')
      .set(cleanForFirestore(profile));
    log.debug({ userId }, 'Saved pattern mirror profile');
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to save pattern profile');
  }
}

export async function loadPatternProfile(userId: string): Promise<PatternMirrorProfile | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('pattern_mirror')
      .doc('profile')
      .get();

    if (doc.exists) {
      const profile = doc.data() as PatternMirrorProfile;
      profiles.set(userId, profile);
      return profile;
    }
    return null;
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to load pattern profile');
    return null;
  }
}

export function getPatternProfile(userId: string): PatternMirrorProfile | null {
  return profiles.get(userId) || null;
}

// ============================================================================
// EXPORT
// ============================================================================

export const patternMirror = {
  recordTopicEnergy,
  recordWordVoiceMismatch,
  recordCyclicalPattern,
  getPatternToSurface,
  markInsightSurfaced,
  buildPatternMirrorContext,
  savePatternProfile,
  loadPatternProfile,
  getPatternProfile,
};

export default patternMirror;
