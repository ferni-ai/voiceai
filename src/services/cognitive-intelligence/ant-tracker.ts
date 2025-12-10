/**
 * Automatic Negative Thought (ANT) Tracker
 *
 * Phase 19: Track patterns of negative automatic thoughts over time.
 * Identifies temporal patterns, topic triggers, and progress trends.
 *
 * PERSISTENCE: Uses Firestore for cross-session ANT tracking with in-memory caching.
 *
 * @module ANTTracker
 */

import * as admin from 'firebase-admin';
import { getLogger } from '../../utils/safe-logger.js';
import type { CognitiveDistortion, DistortionDetection } from './distortion-detector.js';

const log = getLogger().child({ module: 'ant-tracker' });

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

const PATTERNS_COLLECTION = 'ant_patterns';
const ENTRIES_COLLECTION = 'ant_entries';
const RETENTION_DAYS = 90; // Keep ANT entries for 90 days

let firestoreInstance: admin.firestore.Firestore | null = null;
let initAttempted = false;

/**
 * Get Firestore instance with lazy initialization
 */
function getFirestore(): admin.firestore.Firestore | null {
  if (firestoreInstance) return firestoreInstance;
  if (initAttempted) return null;

  initAttempted = true;

  try {
    if (admin.apps.length === 0) {
      const projectId =
        process.env.GCP_PROJECT_ID ||
        process.env.FIREBASE_PROJECT_ID ||
        process.env.GOOGLE_CLOUD_PROJECT;

      if (projectId) {
        admin.initializeApp({ projectId });
      } else {
        admin.initializeApp();
      }
    }

    firestoreInstance = admin.firestore();
    log.info('✅ Firestore initialized for ANT tracker');
    return firestoreInstance;
  } catch (error) {
    log.warn({ error }, 'Firebase not available for ANT tracker, using in-memory only');
    return null;
  }
}

/**
 * Serialize ANTPattern for Firestore (Maps -> Objects)
 */
function serializePattern(pattern: ANTPattern): Record<string, unknown> {
  return {
    userId: pattern.userId,
    distortionFrequency: Object.fromEntries(pattern.distortionFrequency),
    topDistortions: pattern.topDistortions,
    timeOfDayPatterns: Object.fromEntries(
      Array.from(pattern.timeOfDayPatterns.entries()).map(([k, v]) => [k, v])
    ),
    dayOfWeekPatterns: Object.fromEntries(
      Array.from(pattern.dayOfWeekPatterns.entries()).map(([k, v]) => [k, v])
    ),
    topicTriggers: Object.fromEntries(
      Array.from(pattern.topicTriggers.entries()).map(([k, v]) => [k, v])
    ),
    distortionTrend: pattern.distortionTrend,
    reframingSuccess: pattern.reframingSuccess,
    firstRecorded: pattern.firstRecorded,
    lastUpdated: pattern.lastUpdated,
    totalRecordings: pattern.totalRecordings,
  };
}

/**
 * Deserialize ANTPattern from Firestore (Objects -> Maps)
 */
function deserializePattern(data: Record<string, unknown>): ANTPattern {
  return {
    userId: data.userId as string,
    distortionFrequency: new Map(
      Object.entries(data.distortionFrequency as Record<string, number>)
    ) as Map<CognitiveDistortion, number>,
    topDistortions: data.topDistortions as CognitiveDistortion[],
    timeOfDayPatterns: new Map(
      Object.entries(data.timeOfDayPatterns as Record<string, CognitiveDistortion[]>)
    ) as Map<TimeOfDay, CognitiveDistortion[]>,
    dayOfWeekPatterns: new Map(
      Object.entries(data.dayOfWeekPatterns as Record<string, CognitiveDistortion[]>)
    ) as Map<DayOfWeek, CognitiveDistortion[]>,
    topicTriggers: new Map(
      Object.entries(data.topicTriggers as Record<string, CognitiveDistortion[]>)
    ),
    distortionTrend: data.distortionTrend as ANTPattern['distortionTrend'],
    reframingSuccess: data.reframingSuccess as number,
    firstRecorded:
      (data.firstRecorded as admin.firestore.Timestamp)?.toDate?.() ||
      new Date(data.firstRecorded as string),
    lastUpdated:
      (data.lastUpdated as admin.firestore.Timestamp)?.toDate?.() ||
      new Date(data.lastUpdated as string),
    totalRecordings: data.totalRecordings as number,
  };
}

// ============================================================================
// TYPES
// ============================================================================

export interface ANTPattern {
  userId: string;

  // Frequency tracking
  distortionFrequency: Map<CognitiveDistortion, number>;
  topDistortions: CognitiveDistortion[];

  // Temporal patterns
  timeOfDayPatterns: Map<TimeOfDay, CognitiveDistortion[]>;
  dayOfWeekPatterns: Map<DayOfWeek, CognitiveDistortion[]>;

  // Topic correlations
  topicTriggers: Map<string, CognitiveDistortion[]>;

  // Progress tracking
  distortionTrend: 'increasing' | 'stable' | 'decreasing';
  reframingSuccess: number; // 0-1, how often reframes land

  // Metadata
  firstRecorded: Date;
  lastUpdated: Date;
  totalRecordings: number;
}

export interface ANTEntry {
  id: string;
  userId: string;
  timestamp: Date;
  distortion: CognitiveDistortion;
  triggerPhrase: string;
  topic?: string;
  emotionalContext?: string;
  intensity: number; // 0-1
  wasReframed: boolean;
  reframeAccepted?: boolean;
}

export interface ANTInsight {
  type: 'temporal' | 'topic' | 'progress' | 'pattern';
  title: string;
  description: string;
  confidence: number;
  actionable?: string;
}

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';
export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export interface WeeklyReport {
  userId: string;
  weekStart: Date;
  weekEnd: Date;

  // Summary stats
  totalDistortions: number;
  uniqueDistortionTypes: number;
  mostCommonDistortion: CognitiveDistortion;
  peakDay: DayOfWeek;
  peakTime: TimeOfDay;

  // Trends
  comparedToLastWeek: 'better' | 'same' | 'worse';
  percentageChange: number;

  // Insights
  insights: ANTInsight[];

  // Encouragement
  celebration?: string;
  focus?: string;
}

// ============================================================================
// IN-MEMORY CACHE (with Firestore persistence)
// ============================================================================

const userPatterns = new Map<string, ANTPattern>();
const antEntries = new Map<string, ANTEntry[]>(); // userId -> entries

// ============================================================================
// PERSISTENCE FUNCTIONS
// ============================================================================

/**
 * Load user's ANT pattern from Firestore
 */
async function loadPatternFromFirestore(userId: string): Promise<ANTPattern | null> {
  const db = getFirestore();
  if (!db) return null;

  try {
    const doc = await db.collection(PATTERNS_COLLECTION).doc(userId).get();
    if (!doc.exists) return null;

    const pattern = deserializePattern(doc.data() as Record<string, unknown>);
    userPatterns.set(userId, pattern);
    return pattern;
  } catch (error) {
    log.error({ error, userId }, 'Failed to load ANT pattern from Firestore');
    return null;
  }
}

/**
 * Save user's ANT pattern to Firestore
 */
async function savePatternToFirestore(pattern: ANTPattern): Promise<void> {
  const db = getFirestore();
  if (!db) return;

  try {
    await db.collection(PATTERNS_COLLECTION).doc(pattern.userId).set(serializePattern(pattern));
    log.debug({ userId: pattern.userId }, 'ANT pattern saved to Firestore');
  } catch (error) {
    log.error({ error, userId: pattern.userId }, 'Failed to save ANT pattern to Firestore');
  }
}

/**
 * Save ANT entry to Firestore
 */
async function saveEntryToFirestore(entry: ANTEntry): Promise<void> {
  const db = getFirestore();
  if (!db) return;

  try {
    await db
      .collection(ENTRIES_COLLECTION)
      .doc(entry.userId)
      .collection('entries')
      .doc(entry.id)
      .set({
        ...entry,
        timestamp: entry.timestamp,
      });
    log.debug({ userId: entry.userId, entryId: entry.id }, 'ANT entry saved to Firestore');
  } catch (error) {
    log.error({ error, userId: entry.userId }, 'Failed to save ANT entry to Firestore');
  }
}

/**
 * Load user's ANT entries from Firestore
 */
async function loadEntriesFromFirestore(userId: string, limit = 500): Promise<ANTEntry[]> {
  const db = getFirestore();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection(ENTRIES_COLLECTION)
      .doc(userId)
      .collection('entries')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    const entries: ANTEntry[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        timestamp: data.timestamp?.toDate?.() || new Date(data.timestamp),
      } as ANTEntry;
    });

    antEntries.set(userId, entries.reverse()); // Oldest first for processing
    return entries;
  } catch (error) {
    log.error({ error, userId }, 'Failed to load ANT entries from Firestore');
    return [];
  }
}

/**
 * Load user data from Firestore (pattern + entries)
 */
export async function loadUserANTData(
  userId: string
): Promise<{ pattern: ANTPattern | null; entries: ANTEntry[] }> {
  // Check cache first
  const cachedPattern = userPatterns.get(userId);
  const cachedEntries = antEntries.get(userId);

  if (cachedPattern && cachedEntries) {
    return { pattern: cachedPattern, entries: cachedEntries };
  }

  // Load from Firestore
  const [pattern, entries] = await Promise.all([
    cachedPattern ? Promise.resolve(cachedPattern) : loadPatternFromFirestore(userId),
    cachedEntries ? Promise.resolve(cachedEntries) : loadEntriesFromFirestore(userId),
  ]);

  return { pattern, entries };
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Record a new ANT entry.
 */
export function recordANT(
  userId: string,
  detection: DistortionDetection,
  options?: {
    topic?: string;
    emotionalContext?: string;
    intensity?: number;
  }
): ANTEntry {
  const entry: ANTEntry = {
    id: `ant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId,
    timestamp: new Date(),
    distortion: detection.type,
    triggerPhrase: detection.triggerPhrase,
    topic: options?.topic,
    emotionalContext: options?.emotionalContext,
    intensity: options?.intensity ?? estimateIntensity(detection),
    wasReframed: false,
    reframeAccepted: undefined,
  };

  // Store entry in cache
  if (!antEntries.has(userId)) {
    antEntries.set(userId, []);
  }
  antEntries.get(userId)!.push(entry);

  // Update patterns in cache
  updatePatterns(userId, entry);

  // Persist to Firestore (fire-and-forget)
  const pattern = userPatterns.get(userId);
  void saveEntryToFirestore(entry);
  if (pattern) void savePatternToFirestore(pattern);

  log.debug({ userId, distortion: detection.type }, 'ANT recorded');

  return entry;
}

/**
 * Record whether a reframe was accepted.
 */
export function recordReframeResponse(userId: string, entryId: string, accepted: boolean): void {
  const entries = antEntries.get(userId);
  if (!entries) return;

  const entry = entries.find((e) => e.id === entryId);
  if (entry) {
    entry.wasReframed = true;
    entry.reframeAccepted = accepted;

    // Update reframing success rate
    const pattern = getOrCreatePattern(userId);
    const reframedEntries = entries.filter((e) => e.wasReframed);
    const acceptedCount = reframedEntries.filter((e) => e.reframeAccepted).length;
    pattern.reframingSuccess =
      reframedEntries.length > 0 ? acceptedCount / reframedEntries.length : 0;
  }
}

/**
 * Get ANT patterns for a user.
 */
export function getANTPatterns(userId: string): ANTPattern {
  return getOrCreatePattern(userId);
}

/**
 * Get insights for a user.
 */
export function getInsights(userId: string): ANTInsight[] {
  const pattern = getOrCreatePattern(userId);
  const entries = antEntries.get(userId) || [];
  const insights: ANTInsight[] = [];

  // Temporal insights
  const temporalInsight = analyzeTemporalPatterns(pattern, entries);
  if (temporalInsight) insights.push(temporalInsight);

  // Topic insights
  const topicInsight = analyzeTopicPatterns(pattern);
  if (topicInsight) insights.push(topicInsight);

  // Progress insights
  const progressInsight = analyzeProgress(entries);
  if (progressInsight) insights.push(progressInsight);

  // Pattern insights
  const patternInsight = analyzeDistortionPatterns(pattern);
  if (patternInsight) insights.push(patternInsight);

  return insights;
}

/**
 * Generate a weekly report.
 */
export function generateWeeklyReport(userId: string): WeeklyReport {
  const entries = antEntries.get(userId) || [];
  const pattern = getOrCreatePattern(userId);

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const thisWeekEntries = entries.filter((e) => e.timestamp >= weekAgo);
  const lastWeekEntries = entries.filter(
    (e) => e.timestamp >= twoWeeksAgo && e.timestamp < weekAgo
  );

  // Calculate stats
  const distortionCounts = new Map<CognitiveDistortion, number>();
  const dayCounts = new Map<DayOfWeek, number>();
  const timeCounts = new Map<TimeOfDay, number>();

  for (const entry of thisWeekEntries) {
    distortionCounts.set(entry.distortion, (distortionCounts.get(entry.distortion) || 0) + 1);
    const day = getDayOfWeek(entry.timestamp);
    const time = getTimeOfDay(entry.timestamp);
    dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
    timeCounts.set(time, (timeCounts.get(time) || 0) + 1);
  }

  const mostCommon = Array.from(distortionCounts.entries()).sort((a, b) => b[1] - a[1])[0];
  const peakDay = Array.from(dayCounts.entries()).sort((a, b) => b[1] - a[1])[0];
  const peakTime = Array.from(timeCounts.entries()).sort((a, b) => b[1] - a[1])[0];

  // Calculate comparison
  const thisWeekTotal = thisWeekEntries.length;
  const lastWeekTotal = lastWeekEntries.length;
  let comparedToLastWeek: 'better' | 'same' | 'worse' = 'same';
  let percentageChange = 0;

  if (lastWeekTotal > 0) {
    percentageChange = ((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100;
    if (percentageChange < -10) comparedToLastWeek = 'better';
    else if (percentageChange > 10) comparedToLastWeek = 'worse';
  }

  // Generate insights
  const insights = getInsights(userId);

  // Generate celebration or focus area
  let celebration: string | undefined;
  let focus: string | undefined;

  if (comparedToLastWeek === 'better') {
    celebration = generateCelebration(percentageChange, pattern.reframingSuccess);
  } else if (comparedToLastWeek === 'worse') {
    focus = generateFocusArea(mostCommon?.[0], pattern);
  }

  return {
    userId,
    weekStart: weekAgo,
    weekEnd: now,
    totalDistortions: thisWeekTotal,
    uniqueDistortionTypes: distortionCounts.size,
    mostCommonDistortion: mostCommon?.[0] || 'catastrophizing',
    peakDay: peakDay?.[0] || 'monday',
    peakTime: peakTime?.[0] || 'morning',
    comparedToLastWeek,
    percentageChange: Math.round(percentageChange),
    insights,
    celebration,
    focus,
  };
}

/**
 * Get LLM context injection for ANT patterns.
 */
export function getANTContextInjection(userId: string): string {
  const pattern = getOrCreatePattern(userId);
  const insights = getInsights(userId);

  if (pattern.totalRecordings < 5) {
    return ''; // Not enough data yet
  }

  const topDistortions = pattern.topDistortions.slice(0, 3);
  const insightText = insights
    .slice(0, 2)
    .map((i) => `- ${i.title}: ${i.description}`)
    .join('\n');

  return `[🐜 ANT PATTERN AWARENESS]
This user commonly experiences:
- ${topDistortions.map(formatDistortion).join(', ')}

Patterns noticed:
${insightText || '- Still learning patterns'}

Reframing success rate: ${Math.round(pattern.reframingSuccess * 100)}%

Approach: Be patient with repeated patterns. Celebrate when they catch themselves.`;
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function getOrCreatePattern(userId: string): ANTPattern {
  if (!userPatterns.has(userId)) {
    userPatterns.set(userId, {
      userId,
      distortionFrequency: new Map(),
      topDistortions: [],
      timeOfDayPatterns: new Map(),
      dayOfWeekPatterns: new Map(),
      topicTriggers: new Map(),
      distortionTrend: 'stable',
      reframingSuccess: 0,
      firstRecorded: new Date(),
      lastUpdated: new Date(),
      totalRecordings: 0,
    });
  }
  return userPatterns.get(userId)!;
}

function updatePatterns(userId: string, entry: ANTEntry): void {
  const pattern = getOrCreatePattern(userId);

  // Update frequency
  const currentFreq = pattern.distortionFrequency.get(entry.distortion) || 0;
  pattern.distortionFrequency.set(entry.distortion, currentFreq + 1);

  // Update top distortions
  pattern.topDistortions = Array.from(pattern.distortionFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([type]) => type)
    .slice(0, 5);

  // Update temporal patterns
  const timeOfDay = getTimeOfDay(entry.timestamp);
  const dayOfWeek = getDayOfWeek(entry.timestamp);

  const todPattern = pattern.timeOfDayPatterns.get(timeOfDay) || [];
  todPattern.push(entry.distortion);
  pattern.timeOfDayPatterns.set(timeOfDay, todPattern);

  const dowPattern = pattern.dayOfWeekPatterns.get(dayOfWeek) || [];
  dowPattern.push(entry.distortion);
  pattern.dayOfWeekPatterns.set(dayOfWeek, dowPattern);

  // Update topic triggers
  if (entry.topic) {
    const topicDistortions = pattern.topicTriggers.get(entry.topic) || [];
    topicDistortions.push(entry.distortion);
    pattern.topicTriggers.set(entry.topic, topicDistortions);
  }

  // Update trend
  pattern.distortionTrend = calculateTrend(userId);

  // Update metadata
  pattern.totalRecordings++;
  pattern.lastUpdated = new Date();
}

function getTimeOfDay(date: Date): TimeOfDay {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

function getDayOfWeek(date: Date): DayOfWeek {
  const days: DayOfWeek[] = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];
  return days[date.getDay()];
}

function calculateTrend(userId: string): 'increasing' | 'stable' | 'decreasing' {
  const entries = antEntries.get(userId) || [];
  if (entries.length < 10) return 'stable';

  const now = Date.now();
  const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;
  const fourWeeksAgo = now - 28 * 24 * 60 * 60 * 1000;

  const recentCount = entries.filter((e) => e.timestamp.getTime() >= twoWeeksAgo).length;
  const previousCount = entries.filter(
    (e) => e.timestamp.getTime() >= fourWeeksAgo && e.timestamp.getTime() < twoWeeksAgo
  ).length;

  if (previousCount === 0) return 'stable';

  const ratio = recentCount / previousCount;
  if (ratio < 0.7) return 'decreasing';
  if (ratio > 1.3) return 'increasing';
  return 'stable';
}

function estimateIntensity(detection: DistortionDetection): number {
  // Higher confidence + more pattern history = higher intensity
  let intensity = detection.confidence;

  // Boost for repeated patterns
  if (detection.patternCount > 5) intensity += 0.1;
  if (detection.patternCount > 10) intensity += 0.1;

  return Math.min(intensity, 1);
}

function analyzeTemporalPatterns(pattern: ANTPattern, entries: ANTEntry[]): ANTInsight | null {
  if (entries.length < 10) return null;

  // Find peak time
  let maxTimeCount = 0;
  let peakTime: TimeOfDay = 'morning';
  for (const [time, distortions] of Array.from(pattern.timeOfDayPatterns.entries())) {
    if (distortions.length > maxTimeCount) {
      maxTimeCount = distortions.length;
      peakTime = time;
    }
  }

  // Find peak day
  let maxDayCount = 0;
  let peakDay: DayOfWeek = 'monday';
  for (const [day, distortions] of Array.from(pattern.dayOfWeekPatterns.entries())) {
    if (distortions.length > maxDayCount) {
      maxDayCount = distortions.length;
      peakDay = day;
    }
  }

  const totalEntries = entries.length;
  const peakTimePercentage = Math.round((maxTimeCount / totalEntries) * 100);

  if (peakTimePercentage < 30) return null; // Not a strong pattern

  return {
    type: 'temporal',
    title: `${capitalize(peakTime)} tends to be harder`,
    description: `About ${peakTimePercentage}% of your negative thought patterns happen in the ${peakTime}, especially on ${capitalize(peakDay)}s.`,
    confidence: peakTimePercentage / 100,
    actionable: `Consider building in extra self-care during ${peakTime} ${peakDay}s.`,
  };
}

function analyzeTopicPatterns(pattern: ANTPattern): ANTInsight | null {
  if (pattern.topicTriggers.size < 3) return null;

  // Find most triggering topic
  let maxCount = 0;
  let triggerTopic = '';
  let triggerDistortions: CognitiveDistortion[] = [];

  for (const [topic, distortions] of Array.from(pattern.topicTriggers.entries())) {
    if (distortions.length > maxCount) {
      maxCount = distortions.length;
      triggerTopic = topic;
      triggerDistortions = distortions;
    }
  }

  if (maxCount < 5) return null;

  // Find most common distortion for this topic
  const distortionCounts = new Map<CognitiveDistortion, number>();
  for (const d of triggerDistortions) {
    distortionCounts.set(d, (distortionCounts.get(d) || 0) + 1);
  }
  const topDistortion = Array.from(distortionCounts.entries()).sort((a, b) => b[1] - a[1])[0];

  return {
    type: 'topic',
    title: `"${capitalize(triggerTopic)}" triggers ${formatDistortion(topDistortion[0])}`,
    description: `When you talk about ${triggerTopic}, you often fall into ${formatDistortion(topDistortion[0])} thinking.`,
    confidence: 0.7,
    actionable: `Notice when ${triggerTopic} comes up and check for ${formatDistortion(topDistortion[0])} thoughts.`,
  };
}

function analyzeProgress(entries: ANTEntry[]): ANTInsight | null {
  if (entries.length < 20) return null;

  const reframedEntries = entries.filter((e) => e.wasReframed);
  if (reframedEntries.length < 5) return null;

  const acceptedCount = reframedEntries.filter((e) => e.reframeAccepted).length;
  const successRate = acceptedCount / reframedEntries.length;

  if (successRate > 0.6) {
    return {
      type: 'progress',
      title: 'Reframes are landing!',
      description: `You're accepting alternative perspectives ${Math.round(successRate * 100)}% of the time. That's real cognitive flexibility.`,
      confidence: successRate,
    };
  } else if (successRate < 0.3) {
    return {
      type: 'progress',
      title: 'Reframes feel hard right now',
      description: `It's tough to shift perspective when we're in it. That's okay - awareness is the first step.`,
      confidence: 0.7,
      actionable:
        "Try noticing the thought without trying to change it first. Just 'there it is again.'",
    };
  }

  return null;
}

function analyzeDistortionPatterns(pattern: ANTPattern): ANTInsight | null {
  if (pattern.topDistortions.length < 2) return null;

  const top = pattern.topDistortions[0];
  const freq = pattern.distortionFrequency.get(top) || 0;
  const total = pattern.totalRecordings;

  const percentage = Math.round((freq / total) * 100);

  if (percentage < 25) return null;

  const relatedMap: Record<CognitiveDistortion, string> = {
    catastrophizing: 'often comes with trying to prepare for the worst',
    mind_reading: "shows how much you care about others' opinions",
    all_or_nothing: 'reflects high standards you hold for yourself',
    fortune_telling: 'comes from wanting to feel in control',
    personalization: 'shows you take responsibility seriously',
    overgeneralization: 'is your brain trying to find patterns',
    mental_filtering: 'happens when problems feel urgent',
    disqualifying_positive: 'might be protecting you from disappointment',
    should_statements: 'reflects values you care about',
    emotional_reasoning: 'shows how in-touch you are with your feelings',
    labeling: 'is a shortcut your brain uses under stress',
    magnification: 'happens when something really matters to you',
    minimization: 'might be protecting you from vulnerability',
    jumping_to_conclusions: 'is your brain trying to predict outcomes',
    blame: "shows you're trying to understand why things happen",
  };

  return {
    type: 'pattern',
    title: `${formatDistortion(top)} is your go-to`,
    description: `About ${percentage}% of your thought patterns are ${formatDistortion(top)}. That ${relatedMap[top] || 'is worth noticing'}.`,
    confidence: percentage / 100,
  };
}

function generateCelebration(percentageChange: number, reframingSuccess: number): string {
  const celebrations = [
    `${Math.abs(Math.round(percentageChange))}% fewer negative thought patterns this week. You're building new mental pathways.`,
    'Your brain is learning new patterns. That takes real work.',
    `Your reframing success is at ${Math.round(reframingSuccess * 100)}%. You're getting better at catching and shifting.`,
    'Fewer ANTs this week. Every time you notice one, you weaken its power.',
  ];
  return celebrations[Math.floor(Math.random() * celebrations.length)];
}

function generateFocusArea(
  topDistortion: CognitiveDistortion | undefined,
  pattern: ANTPattern
): string {
  if (!topDistortion) {
    return 'This week, try to notice when a negative thought pops up, without judging it.';
  }

  const focusAreas: Record<CognitiveDistortion, string> = {
    catastrophizing:
      "This week, when you notice catastrophizing, ask 'What's most likely to happen?'",
    mind_reading: "This week, when you assume what others think, ask 'Do I actually know this?'",
    all_or_nothing: "This week, look for the gray area between 'perfect' and 'failure.'",
    fortune_telling: "This week, notice predictions and remind yourself the future isn't written.",
    personalization: "This week, ask 'Is this really all about me, or are there other factors?'",
    overgeneralization: "This week, challenge 'always' and 'never' with 'sometimes' and 'often.'",
    mental_filtering: 'This week, try to name one positive alongside the negative.',
    disqualifying_positive: "This week, let a compliment land without a 'but.'",
    should_statements: "This week, try replacing 'should' with 'could' or 'want to.'",
    emotional_reasoning: "This week, separate 'I feel this' from 'this is true.'",
    labeling: 'This week, describe actions instead of labeling yourself.',
    magnification: "This week, ask 'Will this matter in a week? A month?'",
    minimization: 'This week, let yourself acknowledge when something is actually hard.',
    jumping_to_conclusions: "This week, ask 'What evidence do I have?'",
    blame: 'This week, look for shared responsibility instead of full blame.',
  };

  return focusAreas[topDistortion] || 'This week, just notice your thoughts with curiosity.';
}

function formatDistortion(type: CognitiveDistortion): string {
  const names: Record<CognitiveDistortion, string> = {
    catastrophizing: 'catastrophizing',
    mind_reading: 'mind-reading',
    all_or_nothing: 'all-or-nothing thinking',
    fortune_telling: 'fortune-telling',
    personalization: 'personalization',
    overgeneralization: 'overgeneralization',
    mental_filtering: 'mental filtering',
    disqualifying_positive: 'disqualifying the positive',
    should_statements: 'should statements',
    emotional_reasoning: 'emotional reasoning',
    labeling: 'labeling',
    magnification: 'magnification',
    minimization: 'minimization',
    jumping_to_conclusions: 'jumping to conclusions',
    blame: 'blame',
  };
  return names[type] || type;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================================================
// CLEANUP AND MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Clear old ANT data beyond retention period
 */
export async function clearOldANTData(daysToKeep: number = RETENTION_DAYS): Promise<number> {
  const db = getFirestore();
  if (!db) {
    log.debug('Firestore unavailable - skipping ANT data cleanup');
    return 0;
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  let totalDeleted = 0;

  try {
    // Get all users with ANT entries
    const usersSnapshot = await db.collection(ENTRIES_COLLECTION).listDocuments();

    for (const userDoc of usersSnapshot) {
      const entriesSnapshot = await userDoc
        .collection('entries')
        .where('timestamp', '<', cutoffDate)
        .limit(500)
        .get();

      if (entriesSnapshot.empty) continue;

      const batch = db.batch();
      entriesSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      totalDeleted += entriesSnapshot.size;
    }

    log.info({ deleted: totalDeleted, daysToKeep }, 'Cleaned up old ANT entries');
    return totalDeleted;
  } catch (error) {
    log.error({ error }, 'Failed to clean up old ANT data');
    return 0;
  }
}

/**
 * Get all users with ANT data (for analytics/scheduled jobs)
 */
export async function getAllUsersWithANTData(): Promise<string[]> {
  const db = getFirestore();

  // Include in-memory users
  const users = new Set<string>(userPatterns.keys());

  if (db) {
    try {
      const snapshot = await db.collection(PATTERNS_COLLECTION).select().limit(1000).get();
      snapshot.docs.forEach((doc) => users.add(doc.id));
    } catch (error) {
      log.error({ error }, 'Failed to get users with ANT data from Firestore');
    }
  }

  return Array.from(users);
}

/**
 * Delete user's ANT data (for GDPR compliance)
 */
export async function deleteUserANTData(userId: string): Promise<void> {
  // Clear from cache
  userPatterns.delete(userId);
  antEntries.delete(userId);

  const db = getFirestore();
  if (!db) return;

  try {
    // Delete pattern
    await db.collection(PATTERNS_COLLECTION).doc(userId).delete();

    // Delete entries
    const entriesSnapshot = await db
      .collection(ENTRIES_COLLECTION)
      .doc(userId)
      .collection('entries')
      .get();

    const batch = db.batch();
    entriesSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    // Delete parent doc
    await db.collection(ENTRIES_COLLECTION).doc(userId).delete();

    log.info({ userId }, 'Deleted user ANT data');
  } catch (error) {
    log.error({ error, userId }, 'Failed to delete user ANT data');
  }
}

/**
 * Clear in-memory cache (useful for testing)
 */
export function clearCache(): void {
  userPatterns.clear();
  antEntries.clear();
  log.debug('Cleared ANT tracker cache');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const antTracker = {
  record: recordANT,
  recordReframe: recordReframeResponse,
  getPatterns: getANTPatterns,
  getInsights,
  getWeeklyReport: generateWeeklyReport,
  getContextInjection: getANTContextInjection,
  loadUserData: loadUserANTData,
  clearOldData: clearOldANTData,
  getAllUsers: getAllUsersWithANTData,
  deleteUserData: deleteUserANTData,
  clearCache,
};

export default antTracker;
