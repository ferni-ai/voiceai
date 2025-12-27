/**
 * Firestore Data Fetcher for Visualizations
 *
 * Fetches real user data from Firestore collections and transforms
 * it into visualization-ready formats.
 *
 * Collections accessed:
 * - bogle_users/{userId}/mood_calendar
 * - bogle_users/{userId}/energy_readings
 * - bogle_users/{userId}/life_chapters
 * - bogle_users/{userId}/relationship_network
 * - bogle_users/{userId}/openLoops
 * - bogle_users/{userId}/commitments
 * - bogle_users/{userId}/emotionalArcs
 * - bogle_users/{userId}/patterns
 *
 * @module visualizations/api/firestore-fetcher
 */

import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import type {
  MoodCalendarData,
  MoodEntry,
  MoodType,
  BurnoutGaugeData,
  LifeTimelineData,
  TimelineChapter,
  GrowthRadarData,
  GrowthDimension,
  EmotionalArcsData,
  EmotionalArcPhase,
  PredictionsData,
  Prediction,
  RelationshipNetworkData,
  Relationship,
  OpenLoopsData,
  OpenLoop,
  EnergyRingsData,
  VisualizationApiResponse,
} from '../types.js';

// ============================================================================
// TYPES
// ============================================================================

interface FirestoreFetcherOptions {
  /** Number of days of mood data to fetch */
  moodDays?: number;
  /** Number of life chapters to fetch */
  chapterLimit?: number;
  /** Number of relationships to fetch */
  relationshipLimit?: number;
  /** Number of open loops to fetch */
  loopLimit?: number;
}

const DEFAULT_OPTIONS: Required<FirestoreFetcherOptions> = {
  moodDays: 30,
  chapterLimit: 10,
  relationshipLimit: 20,
  loopLimit: 50,
};

// ============================================================================
// MAIN FETCHER
// ============================================================================

/**
 * Fetch all visualization data for a user from Firestore.
 */
export async function fetchVisualizationData(
  userId: string,
  options: FirestoreFetcherOptions = {}
): Promise<VisualizationApiResponse> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const db = getFirestore();
  const userRef = `bogle_users/${userId}`;

  // Fetch all data in parallel
  const [
    moodCalendar,
    burnoutGauge,
    lifeTimeline,
    growthRadar,
    emotionalArcs,
    predictions,
    relationshipNetwork,
    openLoops,
    energyRings,
  ] = await Promise.all([
    fetchMoodCalendar(db, userRef, opts.moodDays),
    fetchBurnoutGauge(db, userRef),
    fetchLifeTimeline(db, userRef, opts.chapterLimit),
    fetchGrowthRadar(db, userRef),
    fetchEmotionalArcs(db, userRef),
    fetchPredictions(db, userRef),
    fetchRelationshipNetwork(db, userRef, opts.relationshipLimit),
    fetchOpenLoops(db, userRef, opts.loopLimit),
    fetchEnergyRings(db, userRef),
  ]);

  return {
    userId,
    timestamp: new Date().toISOString(),
    moodCalendar,
    burnoutGauge,
    lifeTimeline,
    growthRadar,
    emotionalArcs,
    predictions,
    relationshipNetwork,
    openLoops,
    energyRings,
  };
}

// ============================================================================
// INDIVIDUAL FETCHERS
// ============================================================================

/**
 * Fetch mood calendar data.
 */
async function fetchMoodCalendar(
  db: ReturnType<typeof getFirestore>,
  userRef: string,
  days: number
): Promise<MoodCalendarData | undefined> {
  try {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const moodRef = collection(db, `${userRef}/mood_calendar`);
    const q = query(
      moodRef,
      where('date', '>=', Timestamp.fromDate(since)),
      orderBy('date', 'desc'),
      limit(days)
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) return undefined;

    const entries: MoodEntry[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        date: toISODate(data.date),
        mood: normalizeMood(data.mood || data.dominantMood),
        intensity: data.intensity ?? data.emotionalIntensity ?? 0.5,
        note: data.note || data.summary,
      };
    });

    // Calculate summary
    const moodCounts = entries.reduce(
      (acc, e) => {
        acc[e.mood] = (acc[e.mood] || 0) + 1;
        return acc;
      },
      {} as Record<MoodType, number>
    );

    const dominantMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as MoodType || 'calm';
    const calmDays = moodCounts.calm || 0;

    // Determine trend from recent vs older entries
    const midpoint = Math.floor(entries.length / 2);
    const recentAvg = entries.slice(0, midpoint).reduce((sum, e) => sum + e.intensity, 0) / midpoint || 0;
    const olderAvg = entries.slice(midpoint).reduce((sum, e) => sum + e.intensity, 0) / (entries.length - midpoint) || 0;
    const trend: 'improving' | 'stable' | 'declining' =
      recentAvg > olderAvg + 0.1 ? 'improving' : recentAvg < olderAvg - 0.1 ? 'declining' : 'stable';

    return {
      entries,
      summary: { dominantMood, calmDays, trend },
      period: days <= 7 ? 'week' : days <= 31 ? 'month' : 'quarter',
    };
  } catch {
    return undefined;
  }
}

/**
 * Fetch burnout gauge data from energy readings.
 */
async function fetchBurnoutGauge(
  db: ReturnType<typeof getFirestore>,
  userRef: string
): Promise<BurnoutGaugeData | undefined> {
  try {
    const energyRef = collection(db, `${userRef}/energy_readings`);
    const q = query(energyRef, orderBy('timestamp', 'desc'), limit(10));

    const snapshot = await getDocs(q);
    if (snapshot.empty) return undefined;

    const readings = snapshot.docs.map((doc) => doc.data());
    const latest = readings[0];

    // Calculate capacity from various factors
    const emotional = latest.emotional ?? latest.emotionalCapacity ?? 60;
    const mental = latest.mental ?? latest.mentalCapacity ?? 60;
    const physical = latest.physical ?? latest.physicalCapacity ?? 60;
    const capacity = Math.round((emotional + mental + physical) / 3);

    // Determine trend from reading history
    const avgRecent = readings.slice(0, 3).reduce((sum, r) => sum + (r.overall ?? r.capacity ?? 60), 0) / 3;
    const avgOlder = readings.slice(3).reduce((sum, r) => sum + (r.overall ?? r.capacity ?? 60), 0) / Math.max(readings.length - 3, 1);
    const trend: 'recovering' | 'stable' | 'declining' =
      avgRecent > avgOlder + 5 ? 'recovering' : avgRecent < avgOlder - 5 ? 'declining' : 'stable';

    // Determine status
    const status: BurnoutGaugeData['status'] =
      capacity >= 80 ? 'thriving' :
      capacity >= 60 ? 'balanced' :
      capacity >= 40 ? 'stretched' :
      capacity >= 20 ? 'depleted' :
      'critical';

    return {
      capacity,
      trend,
      status,
      factors: {
        emotional: Math.round(emotional),
        mental: Math.round(mental),
        physical: Math.round(physical),
      },
      updatedAt: toISODateTime(latest.timestamp),
    };
  } catch {
    return undefined;
  }
}

/**
 * Fetch life timeline chapters.
 */
async function fetchLifeTimeline(
  db: ReturnType<typeof getFirestore>,
  userRef: string,
  chapterLimit: number
): Promise<LifeTimelineData | undefined> {
  try {
    const chaptersRef = collection(db, `${userRef}/life_chapters`);
    const q = query(chaptersRef, orderBy('startDate', 'desc'), limit(chapterLimit));

    const snapshot = await getDocs(q);
    if (snapshot.empty) return undefined;

    const chapters: TimelineChapter[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title || data.theme || 'Untitled Chapter',
        type: normalizeChapterType(data.type || data.chapterType),
        startDate: toISODateTime(data.startDate),
        endDate: data.endDate ? toISODateTime(data.endDate) : undefined,
        isActive: data.isActive ?? data.current ?? !data.endDate,
        progress: data.progress ?? 0.5,
        summary: data.summary || data.arcSummary,
      };
    });

    // Sort by start date ascending for timeline display
    chapters.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    const currentChapter = chapters.find((c) => c.isActive) || chapters[chapters.length - 1];

    return {
      chapters,
      currentChapter,
      totalChapters: chapters.length,
      narrativeSummary: currentChapter?.summary,
    };
  } catch {
    return undefined;
  }
}

/**
 * Fetch growth radar dimensions from patterns.
 */
async function fetchGrowthRadar(
  db: ReturnType<typeof getFirestore>,
  userRef: string
): Promise<GrowthRadarData | undefined> {
  try {
    const patternsRef = collection(db, `${userRef}/patterns`);
    const q = query(patternsRef, orderBy('lastUpdated', 'desc'), limit(20));

    const snapshot = await getDocs(q);
    if (snapshot.empty) return undefined;

    // Aggregate patterns into growth dimensions
    const dimensionMap: Record<string, { values: number[]; trends: string[] }> = {
      relational: { values: [], trends: [] },
      emotional: { values: [], trends: [] },
      creative: { values: [], trends: [] },
      career: { values: [], trends: [] },
      physical: { values: [], trends: [] },
      spiritual: { values: [], trends: [] },
    };

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const category = data.category?.toLowerCase() || 'emotional';
      const dimension = dimensionMap[category] || dimensionMap.emotional;

      dimension.values.push(data.strength ?? data.score ?? 0.5);
      dimension.trends.push(data.trend || 'stable');
    });

    const dimensions: GrowthDimension[] = Object.entries(dimensionMap)
      .filter(([, d]) => d.values.length > 0)
      .map(([name, d]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value: d.values.reduce((a, b) => a + b, 0) / d.values.length,
        trend: getMajorityTrend(d.trends),
      }));

    if (dimensions.length === 0) return undefined;

    const overallGrowth = dimensions.reduce((sum, d) => sum + d.value, 0) / dimensions.length;
    const lowestDimension = dimensions.sort((a, b) => a.value - b.value)[0];

    return {
      dimensions,
      overallGrowth,
      focusArea: lowestDimension?.name,
    };
  } catch {
    return undefined;
  }
}

/**
 * Fetch emotional arcs data.
 */
async function fetchEmotionalArcs(
  db: ReturnType<typeof getFirestore>,
  userRef: string
): Promise<EmotionalArcsData | undefined> {
  try {
    const arcsRef = collection(db, `${userRef}/emotionalArcs`);
    const q = query(arcsRef, orderBy('createdAt', 'desc'), limit(1));

    const snapshot = await getDocs(q);
    if (snapshot.empty) return undefined;

    const data = snapshot.docs[0].data();

    const phases: EmotionalArcPhase[] = (data.phases || []).map((p: Record<string, unknown>, i: number, arr: unknown[]) => ({
      name: (p.name as string) || `Phase ${i + 1}`,
      position: (p.position as number) ?? i / arr.length,
      intensity: (p.intensity as number) ?? 0.5,
      description: p.description as string | undefined,
    }));

    const currentPhase = phases.find((p) => p.position === data.currentPosition) ||
      phases[Math.floor(data.currentPosition * phases.length)] ||
      phases[0] ||
      { name: 'Beginning', position: 0, intensity: 0.5 };

    return {
      currentPhase,
      phases: phases.length > 0 ? phases : [currentPhase],
      arcType: normalizeArcType(data.arcType || data.type),
    };
  } catch {
    return undefined;
  }
}

/**
 * Fetch predictions from predictive coaching.
 */
async function fetchPredictions(
  db: ReturnType<typeof getFirestore>,
  userRef: string
): Promise<PredictionsData | undefined> {
  try {
    // Predictions might be stored in a predictions subcollection or patterns
    const predsRef = collection(db, `${userRef}/predictions`);
    const q = query(predsRef, orderBy('createdAt', 'desc'), limit(5));

    const snapshot = await getDocs(q);

    // If no predictions collection, try to derive from patterns
    if (snapshot.empty) {
      return undefined;
    }

    const predictions: Prediction[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        metric: data.metric || data.title || 'Unknown',
        currentValue: data.currentValue ?? data.current ?? 50,
        predictedValue: data.predictedValue ?? data.predicted ?? 60,
        confidence: data.confidence ?? 0.7,
        timeframe: data.timeframe || 'Next week',
        scenarios: {
          conservative: data.scenarios?.conservative ?? data.predictedValue * 0.8,
          expected: data.scenarios?.expected ?? data.predictedValue,
          optimistic: data.scenarios?.optimistic ?? data.predictedValue * 1.2,
        },
      };
    });

    if (predictions.length === 0) return undefined;

    return {
      predictions,
      primaryPrediction: predictions[0],
      accuracy: 0.75, // Historical accuracy - would need actual tracking
    };
  } catch {
    return undefined;
  }
}

/**
 * Fetch relationship network data.
 */
async function fetchRelationshipNetwork(
  db: ReturnType<typeof getFirestore>,
  userRef: string,
  relationshipLimit: number
): Promise<RelationshipNetworkData | undefined> {
  try {
    const relsRef = collection(db, `${userRef}/relationship_network`);
    const q = query(relsRef, orderBy('lastContact', 'desc'), limit(relationshipLimit));

    const snapshot = await getDocs(q);
    if (snapshot.empty) return undefined;

    const relationships: Relationship[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        name: data.name || data.personName || 'Unknown',
        strength: data.strength ?? data.connectionStrength ?? 0.5,
        lastContact: toISODateTime(data.lastContact || data.lastInteraction),
        category: normalizeCategory(data.category || data.type),
        trend: normalizeTrend(data.trend || data.connectionTrend),
      };
    });

    const activeConnections = relationships.filter((r) => r.trend !== 'fading').length;
    const needsAttention = relationships
      .filter((r) => r.trend === 'fading' || r.strength < 0.3)
      .map((r) => r.name);

    return {
      relationships,
      totalConnections: relationships.length,
      activeConnections,
      needsAttention,
    };
  } catch {
    return undefined;
  }
}

/**
 * Fetch open loops data.
 */
async function fetchOpenLoops(
  db: ReturnType<typeof getFirestore>,
  userRef: string,
  loopLimit: number
): Promise<OpenLoopsData | undefined> {
  try {
    // Try openLoops first, fall back to commitments
    let snapshot = await getDocs(
      query(collection(db, `${userRef}/openLoops`), orderBy('createdAt', 'desc'), limit(loopLimit))
    );

    if (snapshot.empty) {
      snapshot = await getDocs(
        query(
          collection(db, `${userRef}/commitments`),
          where('status', '==', 'active'),
          orderBy('createdAt', 'desc'),
          limit(loopLimit)
        )
      );
    }

    if (snapshot.empty) return undefined;

    const loops: OpenLoop[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        description: data.description || data.statement || data.text || 'Untitled',
        createdAt: toISODateTime(data.createdAt),
        priority: normalizePriority(data.priority || data.emotionalWeight),
        category: normalizeLoopCategory(data.category || data.type),
        relatedPerson: data.relatedPerson || data.personInvolved,
      };
    });

    // Sort by createdAt to find oldest
    const sortedByAge = [...loops].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    return {
      loops,
      totalOpen: loops.length,
      oldestLoop: sortedByAge[0],
      recentlyClosed: 0, // Would need to query closed loops
    };
  } catch {
    return undefined;
  }
}

/**
 * Fetch energy rings data.
 */
async function fetchEnergyRings(
  db: ReturnType<typeof getFirestore>,
  userRef: string
): Promise<EnergyRingsData | undefined> {
  try {
    const energyRef = collection(db, `${userRef}/energy_readings`);
    const q = query(energyRef, orderBy('timestamp', 'desc'), limit(1));

    const snapshot = await getDocs(q);
    if (snapshot.empty) return undefined;

    const data = snapshot.docs[0].data();

    const emotional = Math.round(data.emotional ?? data.emotionalCapacity ?? 60);
    const mental = Math.round(data.mental ?? data.mentalCapacity ?? 60);
    const physical = Math.round(data.physical ?? data.physicalCapacity ?? 60);
    const overall = Math.round((emotional + mental + physical) / 3);

    return {
      emotional,
      mental,
      physical,
      overall,
    };
  } catch {
    return undefined;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Convert Firestore Timestamp or date to ISO date string (YYYY-MM-DD).
 */
function toISODate(value: unknown): string {
  if (!value) return new Date().toISOString().split('T')[0];

  if (value instanceof Timestamp) {
    return value.toDate().toISOString().split('T')[0];
  }

  if (typeof value === 'object' && 'seconds' in (value as object)) {
    return new Date((value as { seconds: number }).seconds * 1000).toISOString().split('T')[0];
  }

  if (typeof value === 'string') {
    return new Date(value).toISOString().split('T')[0];
  }

  if (typeof value === 'number') {
    return new Date(value).toISOString().split('T')[0];
  }

  return new Date().toISOString().split('T')[0];
}

/**
 * Convert Firestore Timestamp or date to ISO datetime string.
 */
function toISODateTime(value: unknown): string {
  if (!value) return new Date().toISOString();

  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (typeof value === 'object' && 'seconds' in (value as object)) {
    return new Date((value as { seconds: number }).seconds * 1000).toISOString();
  }

  if (typeof value === 'string') {
    return new Date(value).toISOString();
  }

  if (typeof value === 'number') {
    return new Date(value).toISOString();
  }

  return new Date().toISOString();
}

/**
 * Normalize mood string to MoodType.
 */
function normalizeMood(mood: string): MoodType {
  const normalized = mood?.toLowerCase() || 'calm';
  const validMoods: MoodType[] = [
    'calm', 'joyful', 'anxious', 'tired', 'focused',
    'reflective', 'stressed', 'energized', 'peaceful', 'uncertain',
  ];

  if (validMoods.includes(normalized as MoodType)) {
    return normalized as MoodType;
  }

  // Map common alternatives
  const moodMap: Record<string, MoodType> = {
    happy: 'joyful',
    sad: 'reflective',
    angry: 'stressed',
    relaxed: 'calm',
    nervous: 'anxious',
    exhausted: 'tired',
    alert: 'focused',
  };

  return moodMap[normalized] || 'calm';
}

/**
 * Normalize chapter type.
 */
function normalizeChapterType(type: string): TimelineChapter['type'] {
  const normalized = type?.toLowerCase() || 'growth';
  const validTypes: TimelineChapter['type'][] = [
    'growth', 'challenge', 'transition', 'celebration', 'reflection',
  ];

  if (validTypes.includes(normalized as TimelineChapter['type'])) {
    return normalized as TimelineChapter['type'];
  }

  const typeMap: Record<string, TimelineChapter['type']> = {
    struggle: 'challenge',
    triumph: 'celebration',
    discovery: 'reflection',
  };

  return typeMap[normalized] || 'growth';
}

/**
 * Normalize arc type.
 */
function normalizeArcType(type: string): EmotionalArcsData['arcType'] {
  const normalized = type?.toLowerCase().replace(/[_-]/g, '-') || 'growth';
  const validTypes: EmotionalArcsData['arcType'][] = [
    'hero-journey', 'growth', 'recovery', 'discovery',
  ];

  if (validTypes.includes(normalized as EmotionalArcsData['arcType'])) {
    return normalized as EmotionalArcsData['arcType'];
  }

  return 'growth';
}

/**
 * Normalize relationship category.
 */
function normalizeCategory(category: string): Relationship['category'] {
  const normalized = category?.toLowerCase() || 'other';
  const validCategories: Relationship['category'][] = [
    'family', 'friend', 'colleague', 'mentor', 'other',
  ];

  if (validCategories.includes(normalized as Relationship['category'])) {
    return normalized as Relationship['category'];
  }

  return 'other';
}

/**
 * Normalize relationship trend.
 */
function normalizeTrend(trend: string): Relationship['trend'] {
  const normalized = trend?.toLowerCase() || 'stable';

  if (normalized.includes('deep') || normalized.includes('grow')) return 'deepening';
  if (normalized.includes('fad') || normalized.includes('weak')) return 'fading';
  return 'stable';
}

/**
 * Normalize priority.
 */
function normalizePriority(priority: string | number): OpenLoop['priority'] {
  if (typeof priority === 'number') {
    if (priority >= 0.7) return 'high';
    if (priority >= 0.4) return 'medium';
    return 'low';
  }

  const normalized = priority?.toLowerCase() || 'medium';
  if (normalized.includes('high') || normalized.includes('urgent')) return 'high';
  if (normalized.includes('low')) return 'low';
  return 'medium';
}

/**
 * Normalize loop category.
 */
function normalizeLoopCategory(category: string): OpenLoop['category'] {
  const normalized = category?.toLowerCase() || 'intention';
  const validCategories: OpenLoop['category'][] = [
    'commitment', 'question', 'intention', 'follow-up',
  ];

  if (validCategories.includes(normalized as OpenLoop['category'])) {
    return normalized as OpenLoop['category'];
  }

  const categoryMap: Record<string, OpenLoop['category']> = {
    promise: 'commitment',
    goal: 'intention',
    conversation: 'follow-up',
  };

  return categoryMap[normalized] || 'intention';
}

/**
 * Get majority trend from array.
 */
function getMajorityTrend(trends: string[]): GrowthDimension['trend'] {
  const counts = trends.reduce(
    (acc, t) => {
      const normalized = t.toLowerCase();
      if (normalized.includes('grow')) acc.growing++;
      else if (normalized.includes('need') || normalized.includes('attention')) acc.needsAttention++;
      else acc.stable++;
      return acc;
    },
    { growing: 0, stable: 0, needsAttention: 0 }
  );

  if (counts.growing >= counts.stable && counts.growing >= counts.needsAttention) return 'growing';
  if (counts.needsAttention > counts.stable) return 'needs-attention';
  return 'stable';
}

// ============================================================================
// EXPORTS
// ============================================================================

// Main function is exported at declaration (line 80)
// Re-export type for external use
export type { FirestoreFetcherOptions };
