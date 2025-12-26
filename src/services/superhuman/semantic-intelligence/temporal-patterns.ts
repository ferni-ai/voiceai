/**
 * Temporal Patterns - V3.4 Temporal Intelligence
 *
 * Tracks time-based patterns in the user's life:
 * - Circadian patterns (morning anxiety, evening calm)
 * - Day-of-week patterns (Monday stress, weekend joy)
 * - Seasonal patterns (winter blues, summer energy)
 * - Life stage awareness
 *
 * @module services/superhuman/semantic-intelligence/temporal-patterns
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getFirestoreDb } from '../firestore-utils.js';

const log = createLogger({ module: 'temporal-patterns' });

// ============================================================================
// TYPES
// ============================================================================

export interface HourlyPattern {
  hour: number;              // 0-23
  dominantEmotions: Map<string, number>;  // emotion -> frequency
  energyLevel: number;       // 0-1
  receptivity: number;       // 0-1 (how open to deeper conversation)
  commonTopics: string[];
  sampleSize: number;
}

export interface DayOfWeekPattern {
  day: number;               // 0-6 (Sunday = 0)
  dominantEmotions: Map<string, number>;
  energyLevel: number;
  stressLevel: number;
  commonTopics: string[];
  sampleSize: number;
}

export interface SeasonalPattern {
  season: 'spring' | 'summer' | 'fall' | 'winter';
  moodBaseline: number;      // -1 to 1
  energyBaseline: number;    // 0-1
  commonThemes: string[];
  warnings: string[];        // e.g., "Watch for winter blues"
}

export interface LifeStageIndicator {
  stage: string;             // "early_career", "new_parent", etc.
  confidence: number;
  indicators: string[];
  since?: Date;
}

export interface TemporalSnapshot {
  timestamp: Date;
  hourOfDay: number;
  dayOfWeek: number;
  month: number;
  emotion?: string;
  emotionIntensity?: number;
  topic?: string;
  energyLevel?: number;
}

export interface TemporalContext {
  currentHourPattern?: HourlyPattern;
  currentDayPattern?: DayOfWeekPattern;
  seasonalContext?: string;
  anomaly?: string;          // "This is unusually late for you" 
  recommendation?: string;   // "Evening seems to be your reflective time"
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  MIN_SAMPLES_FOR_PATTERN: 5,
  MAX_SNAPSHOTS: 1000,
  LATE_NIGHT_START: 22,
  LATE_NIGHT_END: 5,
  MORNING_START: 6,
  MORNING_END: 10,
  
  SEASONS: {
    spring: [2, 3, 4],     // Mar, Apr, May
    summer: [5, 6, 7],     // Jun, Jul, Aug
    fall: [8, 9, 10],      // Sep, Oct, Nov
    winter: [11, 0, 1],    // Dec, Jan, Feb
  },
};

// ============================================================================
// CACHE
// ============================================================================

const snapshotCache = new Map<string, TemporalSnapshot[]>();
const patternCache = new Map<string, {
  hourly: Map<number, HourlyPattern>;
  daily: Map<number, DayOfWeekPattern>;
  seasonal: Map<string, SeasonalPattern>;
  computed: Date;
}>();

// ============================================================================
// RECORDING
// ============================================================================

/**
 * Record a temporal snapshot.
 */
export async function recordSnapshot(
  userId: string,
  data: {
    emotion?: string;
    emotionIntensity?: number;
    topic?: string;
    energyLevel?: number;
  }
): Promise<void> {
  const now = new Date();
  
  const snapshot: TemporalSnapshot = {
    timestamp: now,
    hourOfDay: now.getHours(),
    dayOfWeek: now.getDay(),
    month: now.getMonth(),
    emotion: data.emotion,
    emotionIntensity: data.emotionIntensity,
    topic: data.topic,
    energyLevel: data.energyLevel,
  };
  
  // Save
  await saveSnapshot(userId, snapshot);
  
  // Invalidate pattern cache (will recompute on next access)
  patternCache.delete(userId);
  
  log.debug({ userId, hour: snapshot.hourOfDay, day: snapshot.dayOfWeek }, '⏰ Temporal snapshot recorded');
}

// ============================================================================
// PATTERN COMPUTATION
// ============================================================================

/**
 * Compute all temporal patterns for a user.
 */
async function computePatterns(userId: string): Promise<void> {
  const snapshots = await loadSnapshots(userId);
  
  if (snapshots.length < CONFIG.MIN_SAMPLES_FOR_PATTERN) {
    return;
  }
  
  // Initialize pattern maps
  const hourly = new Map<number, HourlyPattern>();
  const daily = new Map<number, DayOfWeekPattern>();
  const seasonal = new Map<string, SeasonalPattern>();
  
  // Initialize hourly patterns
  for (let h = 0; h < 24; h++) {
    hourly.set(h, {
      hour: h,
      dominantEmotions: new Map(),
      energyLevel: 0.5,
      receptivity: 0.5,
      commonTopics: [],
      sampleSize: 0,
    });
  }
  
  // Initialize daily patterns
  for (let d = 0; d < 7; d++) {
    daily.set(d, {
      day: d,
      dominantEmotions: new Map(),
      energyLevel: 0.5,
      stressLevel: 0.5,
      commonTopics: [],
      sampleSize: 0,
    });
  }
  
  // Initialize seasonal patterns
  for (const season of ['spring', 'summer', 'fall', 'winter'] as const) {
    seasonal.set(season, {
      season,
      moodBaseline: 0,
      energyBaseline: 0.5,
      commonThemes: [],
      warnings: [],
    });
  }
  
  // Topic counters
  const hourlyTopics = new Map<number, Map<string, number>>();
  const dailyTopics = new Map<number, Map<string, number>>();
  const seasonalThemes = new Map<string, Map<string, number>>();
  
  // Process snapshots
  for (const snap of snapshots) {
    const hour = snap.hourOfDay;
    const day = snap.dayOfWeek;
    const season = getSeasonFromMonth(snap.month);
    
    // Hourly
    const hp = hourly.get(hour)!;
    hp.sampleSize++;
    if (snap.emotion) {
      hp.dominantEmotions.set(snap.emotion, (hp.dominantEmotions.get(snap.emotion) || 0) + 1);
    }
    if (snap.energyLevel !== undefined) {
      hp.energyLevel = hp.energyLevel * 0.9 + snap.energyLevel * 0.1;
    }
    if (snap.topic) {
      if (!hourlyTopics.has(hour)) hourlyTopics.set(hour, new Map());
      const topics = hourlyTopics.get(hour)!;
      topics.set(snap.topic, (topics.get(snap.topic) || 0) + 1);
    }
    
    // Daily
    const dp = daily.get(day)!;
    dp.sampleSize++;
    if (snap.emotion) {
      dp.dominantEmotions.set(snap.emotion, (dp.dominantEmotions.get(snap.emotion) || 0) + 1);
    }
    if (snap.energyLevel !== undefined) {
      dp.energyLevel = dp.energyLevel * 0.9 + snap.energyLevel * 0.1;
    }
    if (snap.topic) {
      if (!dailyTopics.has(day)) dailyTopics.set(day, new Map());
      const topics = dailyTopics.get(day)!;
      topics.set(snap.topic, (topics.get(snap.topic) || 0) + 1);
    }
    
    // Seasonal
    const sp = seasonal.get(season)!;
    if (snap.emotionIntensity !== undefined && snap.emotion) {
      const valence = getEmotionValence(snap.emotion);
      sp.moodBaseline = sp.moodBaseline * 0.95 + valence * snap.emotionIntensity * 0.05;
    }
    if (snap.energyLevel !== undefined) {
      sp.energyBaseline = sp.energyBaseline * 0.95 + snap.energyLevel * 0.05;
    }
    if (snap.topic) {
      if (!seasonalThemes.has(season)) seasonalThemes.set(season, new Map());
      const themes = seasonalThemes.get(season)!;
      themes.set(snap.topic, (themes.get(snap.topic) || 0) + 1);
    }
  }
  
  // Finalize hourly topics
  for (const [hour, topics] of hourlyTopics) {
    const hp = hourly.get(hour)!;
    hp.commonTopics = getTopN(topics, 5);
    hp.receptivity = computeReceptivity(hour, hp);
  }
  
  // Finalize daily topics
  for (const [day, topics] of dailyTopics) {
    const dp = daily.get(day)!;
    dp.commonTopics = getTopN(topics, 5);
    dp.stressLevel = computeStressLevel(dp);
  }
  
  // Finalize seasonal themes
  for (const [season, themes] of seasonalThemes) {
    const sp = seasonal.get(season)!;
    sp.commonThemes = getTopN(themes, 5);
    sp.warnings = generateSeasonalWarnings(sp);
  }
  
  // Store in cache
  patternCache.set(userId, {
    hourly,
    daily,
    seasonal,
    computed: new Date(),
  });
}

// ============================================================================
// PATTERN ACCESS
// ============================================================================

/**
 * Get hourly pattern for a specific hour.
 */
export async function getHourlyPattern(
  userId: string,
  hour?: number
): Promise<HourlyPattern | null> {
  await ensurePatterns(userId);
  const patterns = patternCache.get(userId);
  if (!patterns) return null;
  
  const targetHour = hour ?? new Date().getHours();
  return patterns.hourly.get(targetHour) ?? null;
}

/**
 * Get day-of-week pattern.
 */
export async function getDayPattern(
  userId: string,
  day?: number
): Promise<DayOfWeekPattern | null> {
  await ensurePatterns(userId);
  const patterns = patternCache.get(userId);
  if (!patterns) return null;
  
  const targetDay = day ?? new Date().getDay();
  return patterns.daily.get(targetDay) ?? null;
}

/**
 * Get seasonal pattern.
 */
export async function getSeasonalPattern(
  userId: string,
  season?: 'spring' | 'summer' | 'fall' | 'winter'
): Promise<SeasonalPattern | null> {
  await ensurePatterns(userId);
  const patterns = patternCache.get(userId);
  if (!patterns) return null;
  
  const targetSeason = season ?? getSeasonFromMonth(new Date().getMonth());
  return patterns.seasonal.get(targetSeason) ?? null;
}

/**
 * Get full temporal context for current moment.
 */
export async function getTemporalContext(userId: string): Promise<TemporalContext> {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  
  const [hourPattern, dayPattern, seasonPattern] = await Promise.all([
    getHourlyPattern(userId, hour),
    getDayPattern(userId, day),
    getSeasonalPattern(userId),
  ]);
  
  const context: TemporalContext = {
    currentHourPattern: hourPattern ?? undefined,
    currentDayPattern: dayPattern ?? undefined,
  };
  
  // Generate seasonal context
  if (seasonPattern) {
    if (seasonPattern.moodBaseline < -0.3) {
      context.seasonalContext = `This ${seasonPattern.season} tends to be emotionally challenging for them.`;
    } else if (seasonPattern.moodBaseline > 0.3) {
      context.seasonalContext = `${capitalize(seasonPattern.season)} is typically a positive time for them.`;
    }
  }
  
  // Detect anomalies
  if (hour >= CONFIG.LATE_NIGHT_START || hour < CONFIG.LATE_NIGHT_END) {
    if (hourPattern && hourPattern.sampleSize < 5) {
      context.anomaly = "This is unusually late for them to be talking.";
    }
  }
  
  // Generate recommendations
  if (hourPattern && hourPattern.receptivity > 0.7) {
    context.recommendation = "This tends to be a good time for deeper conversations.";
  } else if (hourPattern && hourPattern.receptivity < 0.3) {
    context.recommendation = "They're usually not in a reflective mood at this time.";
  }
  
  // Day-specific insights
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  if (dayPattern && dayPattern.stressLevel > 0.7) {
    context.recommendation = `${dayNames[day]} tends to be stressful for them.`;
  }
  
  return context;
}

// ============================================================================
// ANOMALY DETECTION
// ============================================================================

/**
 * Detect if current behavior is unusual.
 */
export async function detectAnomaly(
  userId: string,
  current: {
    emotion?: string;
    topic?: string;
    energyLevel?: number;
  }
): Promise<string | null> {
  const hour = new Date().getHours();
  const pattern = await getHourlyPattern(userId, hour);
  
  if (!pattern || pattern.sampleSize < CONFIG.MIN_SAMPLES_FOR_PATTERN) {
    return null;
  }
  
  // Check emotion anomaly
  if (current.emotion) {
    const usualEmotions = [...pattern.dominantEmotions.keys()];
    if (usualEmotions.length > 0 && !usualEmotions.includes(current.emotion)) {
      return `They don't usually feel ${current.emotion} at this hour.`;
    }
  }
  
  // Check energy anomaly
  if (current.energyLevel !== undefined) {
    const diff = Math.abs(current.energyLevel - pattern.energyLevel);
    if (diff > 0.4) {
      if (current.energyLevel > pattern.energyLevel) {
        return "They're more energetic than usual at this time.";
      } else {
        return "They seem lower energy than usual at this time.";
      }
    }
  }
  
  return null;
}

// ============================================================================
// FORMAT FOR CONTEXT
// ============================================================================

/**
 * Format temporal patterns for LLM context.
 */
export async function formatTemporalContext(userId: string): Promise<string> {
  const context = await getTemporalContext(userId);
  const now = new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const hour = now.getHours();
  const day = now.getDay();
  
  const lines = [
    '═══════════════════════════════════════════════════════════',
    'TEMPORAL AWARENESS - Time-based patterns',
    '═══════════════════════════════════════════════════════════',
    '',
    `Current: ${dayNames[day]}, ${formatHour(hour)}`,
    '',
  ];
  
  // Hour pattern
  if (context.currentHourPattern && context.currentHourPattern.sampleSize >= CONFIG.MIN_SAMPLES_FOR_PATTERN) {
    const hp = context.currentHourPattern;
    const topEmotion = getTopEmotion(hp.dominantEmotions);
    lines.push(`At this hour, they usually feel: ${topEmotion || 'varied'}`);
    lines.push(`Energy level: ${hp.energyLevel > 0.6 ? 'High' : hp.energyLevel < 0.4 ? 'Low' : 'Medium'}`);
    lines.push(`Receptivity: ${hp.receptivity > 0.6 ? 'Open to depth' : hp.receptivity < 0.4 ? 'Surface level' : 'Normal'}`);
    if (hp.commonTopics.length > 0) {
      lines.push(`Common topics: ${hp.commonTopics.slice(0, 3).join(', ')}`);
    }
    lines.push('');
  }
  
  // Day pattern
  if (context.currentDayPattern && context.currentDayPattern.sampleSize >= CONFIG.MIN_SAMPLES_FOR_PATTERN) {
    const dp = context.currentDayPattern;
    if (dp.stressLevel > 0.6) {
      lines.push(`⚠️ ${dayNames[day]} is typically stressful for them.`);
    } else if (dp.stressLevel < 0.3) {
      lines.push(`${dayNames[day]} is usually a relaxed day for them.`);
    }
    lines.push('');
  }
  
  // Seasonal context
  if (context.seasonalContext) {
    lines.push(context.seasonalContext);
    lines.push('');
  }
  
  // Anomaly
  if (context.anomaly) {
    lines.push(`📍 ${context.anomaly}`);
    lines.push('');
  }
  
  // Recommendation
  if (context.recommendation) {
    lines.push(`💡 ${context.recommendation}`);
    lines.push('');
  }
  
  lines.push('═══════════════════════════════════════════════════════════');
  
  return lines.join('\n');
}

// ============================================================================
// HELPERS
// ============================================================================

function getSeasonFromMonth(month: number): 'spring' | 'summer' | 'fall' | 'winter' {
  for (const [season, months] of Object.entries(CONFIG.SEASONS)) {
    if (months.includes(month)) {
      return season as 'spring' | 'summer' | 'fall' | 'winter';
    }
  }
  return 'winter';
}

function getEmotionValence(emotion: string): number {
  const positive = ['happy', 'excited', 'grateful', 'calm', 'content', 'hopeful', 'proud'];
  const negative = ['sad', 'anxious', 'angry', 'stressed', 'frustrated', 'worried', 'fearful'];
  
  const lower = emotion.toLowerCase();
  if (positive.some(e => lower.includes(e))) return 1;
  if (negative.some(e => lower.includes(e))) return -1;
  return 0;
}

function getTopN(map: Map<string, number>, n: number): string[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

function getTopEmotion(emotions: Map<string, number>): string | null {
  if (emotions.size === 0) return null;
  const top = getTopN(emotions, 1);
  return top[0] ?? null;
}

function computeReceptivity(hour: number, pattern: HourlyPattern): number {
  // Late night = higher receptivity (reflective)
  if (hour >= CONFIG.LATE_NIGHT_START || hour < CONFIG.LATE_NIGHT_END) {
    return 0.8;
  }
  // Morning = lower receptivity (busy)
  if (hour >= CONFIG.MORNING_START && hour < CONFIG.MORNING_END) {
    return 0.4;
  }
  // Evening = moderate-high
  if (hour >= 18 && hour < 22) {
    return 0.7;
  }
  return 0.5;
}

function computeStressLevel(pattern: DayOfWeekPattern): number {
  const stressEmotions = ['stressed', 'anxious', 'overwhelmed', 'frustrated'];
  let stressCount = 0;
  let total = 0;
  
  for (const [emotion, count] of pattern.dominantEmotions) {
    total += count;
    if (stressEmotions.some(s => emotion.toLowerCase().includes(s))) {
      stressCount += count;
    }
  }
  
  return total > 0 ? stressCount / total : 0.5;
}

function generateSeasonalWarnings(pattern: SeasonalPattern): string[] {
  const warnings: string[] = [];
  
  if (pattern.season === 'winter' && pattern.moodBaseline < -0.3) {
    warnings.push('Watch for winter blues');
  }
  if (pattern.energyBaseline < 0.3) {
    warnings.push(`Energy tends to dip in ${pattern.season}`);
  }
  
  return warnings;
}

function formatHour(hour: number): string {
  if (hour === 0) return '12:00 AM';
  if (hour < 12) return `${hour}:00 AM`;
  if (hour === 12) return '12:00 PM';
  return `${hour - 12}:00 PM`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function ensurePatterns(userId: string): Promise<void> {
  const cached = patternCache.get(userId);
  const now = Date.now();
  
  // Recompute if cache is old (>30 min) or doesn't exist
  if (!cached || now - cached.computed.getTime() > 30 * 60 * 1000) {
    await computePatterns(userId);
  }
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function loadSnapshots(userId: string): Promise<TemporalSnapshot[]> {
  const cached = snapshotCache.get(userId);
  if (cached) return cached;
  
  const db = getFirestoreDb();
  if (!db) return [];
  
  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('temporal_snapshots')
      .orderBy('timestamp', 'desc')
      .limit(CONFIG.MAX_SNAPSHOTS)
      .get();
    
    const snapshots = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        timestamp: data.timestamp?.toDate?.() ?? new Date(data.timestamp),
      } as TemporalSnapshot;
    });
    
    snapshotCache.set(userId, snapshots);
    return snapshots;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load temporal snapshots');
    return [];
  }
}

async function saveSnapshot(userId: string, snapshot: TemporalSnapshot): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;
  
  try {
    const id = `snap_${snapshot.timestamp.getTime()}`;
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('temporal_snapshots')
      .doc(id)
      .set(snapshot);
    
    // Update cache
    const cached = snapshotCache.get(userId) ?? [];
    cached.unshift(snapshot);
    if (cached.length > CONFIG.MAX_SNAPSHOTS) {
      cached.pop();
    }
    snapshotCache.set(userId, cached);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to save temporal snapshot');
  }
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

export function clearTemporalCache(userId?: string): void {
  if (userId) {
    snapshotCache.delete(userId);
    patternCache.delete(userId);
  } else {
    snapshotCache.clear();
    patternCache.clear();
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const temporalPatterns = {
  record: recordSnapshot,
  getHourlyPattern,
  getDayPattern,
  getSeasonalPattern,
  getContext: getTemporalContext,
  detectAnomaly,
  format: formatTemporalContext,
  clearCache: clearTemporalCache,
};

export default temporalPatterns;

