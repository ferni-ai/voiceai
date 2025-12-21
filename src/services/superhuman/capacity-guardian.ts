/**
 * Capacity Guardian - Better Than Human Service
 *
 * What no human friend can do: Track your energy across weeks with precision.
 *
 * Monitors user's energy levels and commitments to protect against
 * burnout before it happens. The guardian that says "slow down" when needed.
 *
 * @module services/superhuman/capacity-guardian
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from './firestore-utils.js';
import {
  getCalendarLoadFactors,
  getCalendarBurnoutRiskFactors,
  getCalendarLoadSummary,
  type CalendarLoadFactors,
  type CalendarBurnoutFactor,
} from '../calendar/calendar-load-service.js';

const log = createLogger({ module: 'capacity-guardian' });

// ============================================================================
// TYPES
// ============================================================================

export type EnergyLevel = 'high' | 'good' | 'moderate' | 'low' | 'depleted';
export type LoadLevel = 'light' | 'normal' | 'heavy' | 'overloaded';
export type BurnoutRisk = 'low' | 'moderate' | 'elevated' | 'high' | 'critical';

export interface EnergyReading {
  id: string;
  userId: string;
  timestamp: number;

  // Energy indicators
  energyLevel: EnergyLevel;
  energyScore: number; // 0-100

  // Sources of reading
  detectedFrom: Array<'voice' | 'text' | 'pattern' | 'explicit'>;
  indicators: string[]; // What indicated this energy level

  // Context
  dayOfWeek: number;
  hourOfDay: number;
  conversationMomentum?: string;
}

export interface CommitmentLoad {
  userId: string;

  // Current load
  activeCommitments: number;
  recentAdditions: number; // New commitments in last 7 days
  overdueCount: number;

  // Capacity assessment
  loadLevel: LoadLevel;
  capacityUsed: number; // 0-1

  // Trend
  loadTrend: 'increasing' | 'stable' | 'decreasing';
  lastAssessed: number;
}

export interface BurnoutAssessment {
  userId: string;
  risk: BurnoutRisk;
  riskScore: number; // 0-100

  // Contributing factors
  factors: Array<{
    factor: string;
    weight: number;
    description: string;
  }>;

  // Recommendations
  recommendations: string[];

  // Tracking
  assessedAt: number;
  previousRisk?: BurnoutRisk;
  trendDirection: 'improving' | 'stable' | 'worsening';
}

// ============================================================================
// ENERGY DETECTION
// ============================================================================

const ENERGY_PATTERNS: Record<EnergyLevel, RegExp[]> = {
  high: [
    /\bi('m| am) (feeling|so) (great|amazing|energized|pumped|motivated)/i,
    /\bi have (so much|tons of) energy/i,
    /\bi('m| am) (ready|excited) to/i,
  ],
  good: [
    /\bi('m| am) (doing|feeling) (good|well|fine|okay)/i,
    /\bthings are (going well|good)/i,
    /\bi('m| am) (pretty|fairly) (good|energized)/i,
  ],
  moderate: [
    /\bi('m| am) (okay|alright|hanging in)/i,
    /\bcould be (better|worse)/i,
    /\bi('m| am) (managing|getting by)/i,
  ],
  low: [
    /\bi('m| am) (tired|exhausted|drained|worn out)/i,
    /\bi (need|want) (a break|to rest|sleep)/i,
    /\bi('m| am) (running on|out of) (fumes|empty)/i,
    /\bi don('t| do not) have (the|any) energy/i,
  ],
  depleted: [
    /\bi (can't|cannot) (do this|keep going|anymore)/i,
    /\bi('m| am) (completely|totally|utterly) (exhausted|burned out|done)/i,
    /\bi have nothing left/i,
    /\bi('m| am) at (my|the) (limit|breaking point)/i,
  ],
};

const OVERCOMMITMENT_PATTERNS = [
  /\bi (took|said yes to|agreed to) (another|more|too much)/i,
  /\bi have (so much|too much) (to do|on my plate)/i,
  /\bi don('t| do not) know how i('ll| will) (get it all done|manage)/i,
  /\bi('m| am) (juggling|balancing) (so many|too many)/i,
  /\bi (can't|cannot) say no/i,
];

export function detectEnergyLevel(
  transcript: string,
  voiceSignals?: { emotion?: string; arousal?: number; speechRate?: number }
): { level: EnergyLevel; score: number; indicators: string[] } {
  const indicators: string[] = [];
  let score = 50; // Default moderate

  // Check text patterns
  for (const [level, patterns] of Object.entries(ENERGY_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(transcript)) {
        indicators.push(`Text: ${pattern.source}`);
        const levelScores: Record<EnergyLevel, number> = {
          high: 90,
          good: 70,
          moderate: 50,
          low: 30,
          depleted: 10,
        };
        score = levelScores[level as EnergyLevel];
        break;
      }
    }
    if (indicators.length > 0) break;
  }

  // Adjust based on voice signals
  if (voiceSignals) {
    if (voiceSignals.arousal !== undefined) {
      if (voiceSignals.arousal < 0.3) {
        score = Math.max(10, score - 20);
        indicators.push('Voice: Low arousal');
      } else if (voiceSignals.arousal > 0.7) {
        score = Math.min(100, score + 10);
        indicators.push('Voice: High arousal');
      }
    }

    if (voiceSignals.speechRate !== undefined) {
      if (voiceSignals.speechRate < 100) {
        score = Math.max(10, score - 15);
        indicators.push('Voice: Slow speech');
      }
    }

    if (voiceSignals.emotion === 'tired' || voiceSignals.emotion === 'exhausted') {
      score = Math.max(10, score - 25);
      indicators.push(`Voice: ${voiceSignals.emotion}`);
    }
  }

  // Determine level from score
  let level: EnergyLevel;
  if (score >= 80) level = 'high';
  else if (score >= 60) level = 'good';
  else if (score >= 40) level = 'moderate';
  else if (score >= 20) level = 'low';
  else level = 'depleted';

  return { level, score, indicators };
}

export function detectOvercommitment(transcript: string): boolean {
  for (const pattern of OVERCOMMITMENT_PATTERNS) {
    if (pattern.test(transcript)) return true;
  }
  return false;
}

// ============================================================================
// STORAGE
// ============================================================================

const energyCache = new Map<string, EnergyReading[]>();
const loadCache = new Map<string, CommitmentLoad>();

export async function recordEnergyReading(
  userId: string,
  reading: Omit<EnergyReading, 'id' | 'userId' | 'timestamp' | 'dayOfWeek' | 'hourOfDay'>
): Promise<void> {
  const now = new Date();
  const fullReading: EnergyReading = {
    ...reading,
    id: `energy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    timestamp: Date.now(),
    dayOfWeek: now.getDay(),
    hourOfDay: now.getHours(),
  };

  try {
    const db = getFirestoreDb();
    if (db) {
      await db
        .collection('bogle_users')
        .doc(userId)
        .collection('energy_readings')
        .doc(fullReading.id)
        .set(fullReading);
    }

    // Update cache
    const readings = energyCache.get(userId) || [];
    readings.unshift(fullReading);
    if (readings.length > 100) readings.pop();
    energyCache.set(userId, readings);

    log.debug(
      { userId, level: reading.energyLevel, score: reading.energyScore },
      '⚡ Energy recorded'
    );
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to record energy');
  }
}

export async function loadEnergyHistory(userId: string, days = 14): Promise<EnergyReading[]> {
  if (energyCache.has(userId)) {
    const cached = energyCache.get(userId) || [];
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return cached.filter((r) => r.timestamp > cutoff);
  }

  try {
    const db = getFirestoreDb();
    if (!db) return [];

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('energy_readings')
      .where('timestamp', '>', cutoff)
      .orderBy('timestamp', 'desc')
      .limit(100)
      .get();

    const readings = snapshot.docs.map((doc) => doc.data() as EnergyReading);
    energyCache.set(userId, readings);
    return readings;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load energy history');
    return [];
  }
}

// ============================================================================
// BURNOUT ASSESSMENT
// ============================================================================

export async function assessBurnoutRisk(userId: string): Promise<BurnoutAssessment> {
  const readings = await loadEnergyHistory(userId, 14);
  const factors: BurnoutAssessment['factors'] = [];
  let riskScore = 0;

  // Factor 1: Recent energy trend
  if (readings.length >= 5) {
    const recentAvg = readings.slice(0, 5).reduce((sum, r) => sum + r.energyScore, 0) / 5;
    const olderAvg =
      readings.length > 5
        ? readings.slice(5, 10).reduce((sum, r) => sum + r.energyScore, 0) /
          Math.min(5, readings.length - 5)
        : recentAvg;

    if (recentAvg < olderAvg - 15) {
      riskScore += 25;
      factors.push({
        factor: 'Declining Energy',
        weight: 0.25,
        description: `Energy has dropped from ${Math.round(olderAvg)} to ${Math.round(recentAvg)}`,
      });
    } else if (recentAvg < 40) {
      riskScore += 20;
      factors.push({
        factor: 'Consistently Low Energy',
        weight: 0.2,
        description: `Average energy is ${Math.round(recentAvg)}/100`,
      });
    }
  }

  // Factor 2: Depleted episodes
  const depletedCount = readings.filter((r) => r.energyLevel === 'depleted').length;
  if (depletedCount >= 3) {
    riskScore += 30;
    factors.push({
      factor: 'Multiple Depleted Episodes',
      weight: 0.3,
      description: `${depletedCount} times completely depleted in 2 weeks`,
    });
  } else if (depletedCount >= 1) {
    riskScore += 15;
    factors.push({
      factor: 'Depleted Episodes',
      weight: 0.15,
      description: `${depletedCount} time(s) completely depleted recently`,
    });
  }

  // Factor 3: No high energy days
  const highEnergyCount = readings.filter(
    (r) => r.energyLevel === 'high' || r.energyLevel === 'good'
  ).length;
  if (readings.length > 5 && highEnergyCount === 0) {
    riskScore += 20;
    factors.push({
      factor: 'No Recovery',
      weight: 0.2,
      description: 'No high-energy days in recent history',
    });
  }

  // ============================================================================
  // CALENDAR-BASED BURNOUT FACTORS (Better Than Human Integration)
  // ============================================================================
  try {
    const calendarFactors = await getCalendarBurnoutRiskFactors(userId);

    for (const calFactor of calendarFactors) {
      riskScore += calFactor.riskContribution;
      factors.push({
        factor: calFactor.name,
        weight: calFactor.weight,
        description: calFactor.description,
      });
    }

    // Add calendar load summary to factors if significant
    const loadFactors = await getCalendarLoadFactors(userId);

    // Check for combined signals (low energy + heavy calendar)
    if (readings.length > 0) {
      const recentAvg = readings.slice(0, 3).reduce((sum, r) => sum + r.energyScore, 0) / 3;
      if (recentAvg < 50 && loadFactors.weeklyMeetingHours >= 25) {
        riskScore += 20;
        factors.push({
          factor: 'Energy-Calendar Mismatch',
          weight: 0.2,
          description: `Low energy (${Math.round(recentAvg)}/100) + heavy calendar (${loadFactors.weeklyMeetingHours}h meetings)`,
        });
      }
    }
  } catch (error) {
    // Calendar integration is optional - don't fail burnout assessment
    log.warn({ error: String(error), userId }, 'Calendar factors unavailable for burnout assessment');
  }

  // Determine risk level
  let risk: BurnoutRisk;
  if (riskScore >= 70) risk = 'critical';
  else if (riskScore >= 50) risk = 'high';
  else if (riskScore >= 30) risk = 'elevated';
  else if (riskScore >= 15) risk = 'moderate';
  else risk = 'low';

  // Generate recommendations (now calendar-aware)
  const recommendations: string[] = [];
  if (risk === 'critical' || risk === 'high') {
    recommendations.push('Consider clearing your calendar for the next few days.');
    recommendations.push('What can you delegate or postpone?');
    recommendations.push('Sleep should be non-negotiable right now.');

    // Add calendar-specific recommendations
    const hasCalendarFactors = factors.some((f) =>
      ['Heavy Meeting Load', 'Extreme Meeting Load', 'No Focus Time', 'Back-to-Back Overload'].includes(f.factor)
    );
    if (hasCalendarFactors) {
      recommendations.push('Block "Do Not Schedule" time for the next few days.');
    }
  } else if (risk === 'elevated') {
    recommendations.push('Build in more recovery time this week.');
    recommendations.push('Say no to at least one thing today.');
    recommendations.push('When did you last do something just for you?');
  } else if (risk === 'moderate') {
    recommendations.push('Watch your boundaries this week.');
    recommendations.push('Schedule some white space.');
  }

  return {
    userId,
    risk,
    riskScore,
    factors,
    recommendations,
    assessedAt: Date.now(),
    trendDirection: factors.some((f) => f.factor === 'Declining Energy') ? 'worsening' : 'stable',
  };
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

export async function buildCapacityContext(userId: string): Promise<string> {
  const assessment = await assessBurnoutRisk(userId);
  const readings = await loadEnergyHistory(userId, 7);

  // Even without readings, we may have calendar data
  const hasData = readings.length > 0 || assessment.factors.length > 0;
  if (!hasData) {
    return '';
  }

  const sections: string[] = ['[CAPACITY GUARDIAN - Better Than Human Energy Tracking]'];
  sections.push('You track their energy AND calendar like no human can. Protect them from themselves.');

  // Current assessment
  const riskEmoji: Record<BurnoutRisk, string> = {
    low: '🟢',
    moderate: '🟡',
    elevated: '🟠',
    high: '🔴',
    critical: '🚨',
  };
  sections.push(
    `\n**Burnout Risk:** ${riskEmoji[assessment.risk]} ${assessment.risk.toUpperCase()}`
  );

  // Factors
  if (assessment.factors.length > 0) {
    sections.push('\n**Contributing Factors:**');
    for (const factor of assessment.factors) {
      sections.push(`• ${factor.factor}: ${factor.description}`);
    }
  }

  // Recent trend (if we have readings)
  if (readings.length >= 3) {
    const avgScore = Math.round(
      readings.slice(0, 3).reduce((sum, r) => sum + r.energyScore, 0) / 3
    );
    sections.push(`\n**Recent Energy Average:** ${avgScore}/100`);
  }

  // Calendar load summary (Better Than Human integration)
  try {
    const calendarSummary = await getCalendarLoadSummary(userId);
    if (calendarSummary) {
      sections.push(`\n**Calendar Load:**\n${calendarSummary}`);
    }
  } catch {
    // Calendar summary is optional
  }

  // Recommendations
  if (assessment.recommendations.length > 0 && assessment.risk !== 'low') {
    sections.push('\n**Protective Questions:**');
    for (const rec of assessment.recommendations.slice(0, 2)) {
      sections.push(`• "${rec}"`);
    }
  }

  sections.push(
    '\nIf they\'re pushing too hard, gently intervene. You\'re allowed to say "slow down."'
  );

  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const capacityGuardian = {
  detectEnergy: detectEnergyLevel,
  detectOvercommitment,
  recordReading: recordEnergyReading,
  loadHistory: loadEnergyHistory,
  assessRisk: assessBurnoutRisk,
  buildContext: buildCapacityContext,
};
