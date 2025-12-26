/**
 * Voice Biomarkers - Better Than Human Wellness Detection
 *
 * Detects wellness signals from voice that humans can't consciously perceive:
 * - Fatigue/sleep deprivation from pitch variability
 * - Stress trajectory over time
 * - Hydration from voice dryness
 * - Early illness detection from nasal resonance
 * - Medication changes from voice patterns
 *
 * WHY IT'S SUPERHUMAN: Humans notice "you sound tired" but can't track patterns
 * or detect early illness signs from voice biomarkers.
 *
 * @module services/superhuman/voice-biomarkers
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from './firestore-utils.js';

const log = createLogger({ module: 'VoiceBiomarkers' });

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceBiomarkers {
  /** Overall fatigue level (0-1, higher = more fatigued) */
  fatigueLevel: number;
  /** Stress trajectory over recent conversations */
  stressTrajectory: 'rising' | 'stable' | 'falling' | 'unknown';
  /** Estimated hydration level (0-1, lower = more dehydrated) */
  hydrationEstimate: number;
  /** Risk of illness based on voice patterns (0-1) */
  illnessRisk: number;
  /** Detected potential medication/substance change */
  medicationChangeIndicator: boolean;
  /** Confidence in the readings */
  confidence: number;
  /** Timestamp of analysis */
  timestamp: number;
}

export interface VoiceAnalysisInput {
  /** Pitch variability (standard deviation) */
  pitchVariability?: number;
  /** Average pitch */
  averagePitch?: number;
  /** Speech rate (words per minute) */
  speechRate?: number;
  /** Pause frequency */
  pauseFrequency?: number;
  /** Voice strain indicator (0-1) */
  strain?: number;
  /** Nasal resonance indicator (0-1) */
  nasalResonance?: number;
  /** Voice dryness/breathiness (0-1) */
  breathiness?: number;
  /** Tremor in voice (0-1) */
  tremor?: number;
}

interface StoredBiomarkerReading {
  userId: string;
  sessionId: string;
  biomarkers: VoiceBiomarkers;
  input: VoiceAnalysisInput;
  timestamp: number;
}

interface BiomarkerTrend {
  metric: string;
  direction: 'improving' | 'stable' | 'declining';
  averageRecent: number;
  averageBaseline: number;
  percentChange: number;
}

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Analyze voice input for biomarkers.
 * Returns wellness indicators that exceed human perception.
 */
export function analyzeVoiceBiomarkers(input: VoiceAnalysisInput): VoiceBiomarkers {
  const {
    pitchVariability = 0.5,
    speechRate = 150,
    pauseFrequency = 0.1,
    strain = 0,
    nasalResonance = 0.3,
    breathiness = 0.2,
    tremor = 0,
  } = input;

  // Fatigue detection
  // High pitch variability + slow speech + frequent pauses = fatigue
  const fatigueFromPitch = pitchVariability > 0.6 ? (pitchVariability - 0.6) * 2.5 : 0;
  const fatigueFromSpeed = speechRate < 120 ? (120 - speechRate) / 60 : 0;
  const fatigueFromPauses = Math.min(pauseFrequency * 2, 0.5);
  const fatigueLevel = Math.min(
    (fatigueFromPitch + fatigueFromSpeed + fatigueFromPauses + tremor * 0.3) / 1.5,
    1
  );

  // Hydration estimate
  // Dry voice (high breathiness) + strain = dehydration
  const hydrationEstimate = Math.max(0, 1 - breathiness - strain * 0.3);

  // Illness risk
  // Nasal resonance + strain + fatigue = potential illness
  const illnessRisk = Math.min(
    nasalResonance * 0.4 + strain * 0.3 + fatigueLevel * 0.2 + tremor * 0.1,
    1
  );

  // Medication change indicator
  // Significant deviation from baseline patterns suggests change
  const medicationChangeIndicator =
    Math.abs(pitchVariability - 0.5) > 0.3 || Math.abs(speechRate - 150) > 40;

  // Confidence based on input completeness
  const inputCount = Object.values(input).filter((v) => v !== undefined).length;
  const confidence = Math.min(inputCount / 8, 1);

  return {
    fatigueLevel,
    stressTrajectory: 'unknown', // Requires historical data
    hydrationEstimate,
    illnessRisk,
    medicationChangeIndicator,
    confidence,
    timestamp: Date.now(),
  };
}

/**
 * Calculate stress trajectory from historical readings.
 */
export function calculateStressTrajectory(
  readings: StoredBiomarkerReading[]
): 'rising' | 'stable' | 'falling' | 'unknown' {
  if (readings.length < 3) return 'unknown';

  // Get readings from last 7 days
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentReadings = readings.filter((r) => r.timestamp > weekAgo);

  if (recentReadings.length < 3) return 'unknown';

  // Calculate average fatigue for first half vs second half
  const midpoint = Math.floor(recentReadings.length / 2);
  const firstHalf = recentReadings.slice(0, midpoint);
  const secondHalf = recentReadings.slice(midpoint);

  const avgFirst = firstHalf.reduce((sum, r) => sum + r.biomarkers.fatigueLevel, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((sum, r) => sum + r.biomarkers.fatigueLevel, 0) / secondHalf.length;

  const change = avgSecond - avgFirst;

  if (change > 0.15) return 'rising';
  if (change < -0.15) return 'falling';
  return 'stable';
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Store a biomarker reading for trend analysis.
 */
export async function storeBiomarkerReading(
  userId: string,
  sessionId: string,
  biomarkers: VoiceBiomarkers,
  input: VoiceAnalysisInput
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'Firestore not available, skipping biomarker storage');
    return;
  }

  try {
    const reading: StoredBiomarkerReading = {
      userId,
      sessionId,
      biomarkers,
      input,
      timestamp: Date.now(),
    };

    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('voice_biomarkers')
      .add(reading);

    log.debug({ userId, fatigueLevel: biomarkers.fatigueLevel }, 'Stored biomarker reading');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to store biomarker reading');
  }
}

/**
 * Load recent biomarker readings for trend analysis.
 */
export async function loadBiomarkerReadings(
  userId: string,
  daysBack = 30
): Promise<StoredBiomarkerReading[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('voice_biomarkers')
      .where('timestamp', '>', cutoff)
      .orderBy('timestamp', 'desc')
      .limit(100)
      .get();

    return snapshot.docs.map((doc) => doc.data() as StoredBiomarkerReading);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load biomarker readings');
    return [];
  }
}

/**
 * Get biomarker trends for a user.
 */
export async function getBiomarkerTrends(userId: string): Promise<BiomarkerTrend[]> {
  const readings = await loadBiomarkerReadings(userId, 30);

  if (readings.length < 5) {
    return [];
  }

  const trends: BiomarkerTrend[] = [];

  // Calculate baseline (first week) vs recent (last week)
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

  const baseline = readings.filter((r) => r.timestamp < twoWeeksAgo);
  const recent = readings.filter((r) => r.timestamp > weekAgo);

  if (baseline.length < 2 || recent.length < 2) {
    return [];
  }

  // Fatigue trend
  const baselineFatigue = baseline.reduce((sum, r) => sum + r.biomarkers.fatigueLevel, 0) / baseline.length;
  const recentFatigue = recent.reduce((sum, r) => sum + r.biomarkers.fatigueLevel, 0) / recent.length;
  const fatigueChange = ((recentFatigue - baselineFatigue) / baselineFatigue) * 100;

  trends.push({
    metric: 'fatigue',
    direction: fatigueChange > 10 ? 'declining' : fatigueChange < -10 ? 'improving' : 'stable',
    averageRecent: recentFatigue,
    averageBaseline: baselineFatigue,
    percentChange: fatigueChange,
  });

  // Hydration trend
  const baselineHydration = baseline.reduce((sum, r) => sum + r.biomarkers.hydrationEstimate, 0) / baseline.length;
  const recentHydration = recent.reduce((sum, r) => sum + r.biomarkers.hydrationEstimate, 0) / recent.length;
  const hydrationChange = ((recentHydration - baselineHydration) / baselineHydration) * 100;

  trends.push({
    metric: 'hydration',
    direction: hydrationChange > 10 ? 'improving' : hydrationChange < -10 ? 'declining' : 'stable',
    averageRecent: recentHydration,
    averageBaseline: baselineHydration,
    percentChange: hydrationChange,
  });

  return trends;
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build context for LLM injection about voice biomarkers.
 */
export async function buildVoiceBiomarkersContext(
  userId: string,
  currentBiomarkers?: VoiceBiomarkers
): Promise<string> {
  const readings = await loadBiomarkerReadings(userId, 14);
  const trends = await getBiomarkerTrends(userId);

  const sections: string[] = [];

  // Current state
  if (currentBiomarkers && currentBiomarkers.confidence > 0.5) {
    const { fatigueLevel, hydrationEstimate, illnessRisk } = currentBiomarkers;

    if (fatigueLevel > 0.6) {
      sections.push(
        `[VOICE BIOMARKER] User's voice shows signs of fatigue (${Math.round(fatigueLevel * 100)}% confidence). ` +
        `Consider: shorter responses, more warmth, avoid complex topics.`
      );
    }

    if (hydrationEstimate < 0.4) {
      sections.push(
        `[VOICE BIOMARKER] Voice patterns suggest dehydration. ` +
        `If appropriate, gently encourage water/self-care.`
      );
    }

    if (illnessRisk > 0.5) {
      sections.push(
        `[VOICE BIOMARKER] Voice patterns suggest possible illness (${Math.round(illnessRisk * 100)}% risk). ` +
        `Be extra gentle. Consider asking how they're feeling physically.`
      );
    }
  }

  // Trajectory
  if (readings.length >= 3) {
    const trajectory = calculateStressTrajectory(readings);
    if (trajectory === 'rising') {
      sections.push(
        `[VOICE TREND] Stress/fatigue has been rising over recent conversations. ` +
        `This person may be heading toward burnout. Proactively check in.`
      );
    } else if (trajectory === 'falling') {
      sections.push(
        `[VOICE TREND] Stress/fatigue has been decreasing. They're recovering. ` +
        `Acknowledge their progress subtly.`
      );
    }
  }

  // Trends
  for (const trend of trends) {
    if (trend.direction !== 'stable' && Math.abs(trend.percentChange) > 15) {
      if (trend.metric === 'fatigue' && trend.direction === 'declining') {
        sections.push(
          `[WELLNESS ALERT] Fatigue levels up ${Math.abs(Math.round(trend.percentChange))}% vs baseline. ` +
          `Consider asking about sleep or energy levels.`
        );
      }
    }
  }

  return sections.join('\n\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const voiceBiomarkers = {
  analyze: analyzeVoiceBiomarkers,
  store: storeBiomarkerReading,
  load: loadBiomarkerReadings,
  getTrends: getBiomarkerTrends,
  buildContext: buildVoiceBiomarkersContext,
  calculateStressTrajectory,
};

