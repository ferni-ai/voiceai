/**
 * Proactive Milestone Detector
 *
 * "Your best friend doesn't track that you're approaching 5 years at your job."
 *
 * This service proactively detects celebrations humans forget to plan:
 * - Relationship anniversaries (dating, wedding, friendships)
 * - Career milestones (years at job, promotions)
 * - Life stage transitions (empty nest, retirement approaching)
 * - Quiet wins (sobriety streaks, habit streaks, financial milestones)
 * - "Second chance" milestones (first day of new chapter after divorce, etc.)
 *
 * Better Than Human: We see milestones coming and suggest celebrations before they're forgotten.
 *
 * @module services/superhuman/proactive-milestone-detector
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from './firestore-utils.js';

const log = createLogger({ module: 'superhuman:proactive-milestone-detector' });

// ============================================================================
// TYPES
// ============================================================================

export type MilestoneType =
  | 'anniversary' // Relationship anniversaries
  | 'career' // Work-related milestones
  | 'friendship' // Friendship anniversaries
  | 'health' // Health/wellness milestones
  | 'financial' // Money milestones
  | 'habit' // Habit streak milestones
  | 'life_stage' // Life transitions
  | 'second_chance' // Fresh start milestones
  | 'quiet_win' // Small but meaningful victories
  | 'custom'; // User-defined

export type MilestoneSignificance = 'minor' | 'notable' | 'significant' | 'major' | 'life_changing';

export interface TrackedDate {
  /** Unique ID */
  id: string;
  /** What this date represents */
  label: string;
  /** The date itself */
  date: string; // ISO date
  /** Type of milestone */
  type: MilestoneType;
  /** Is this recurring annually? */
  recurring: boolean;
  /** Person or entity associated (optional) */
  associatedWith?: string;
  /** Additional context */
  context?: string;
  /** When was this added */
  createdAt: string;
}

export interface DetectedMilestone {
  /** What milestone is approaching/arrived */
  label: string;
  /** Type of milestone */
  type: MilestoneType;
  /** How significant is this */
  significance: MilestoneSignificance;
  /** The date of the milestone */
  date: string;
  /** Days until/since (negative = past) */
  daysAway: number;
  /** Anniversary number if applicable */
  anniversaryNumber?: number;
  /** Why this matters */
  context: string;
  /** Suggested way to celebrate/acknowledge */
  celebrationSuggestion: string;
  /** Whether user has been notified */
  notified: boolean;
}

export interface LifeStageSignal {
  /** What life stage transition is detected */
  transition: string;
  /** Confidence level 0-1 */
  confidence: number;
  /** Evidence/signals that suggest this */
  signals: string[];
  /** Suggested milestones to plan */
  suggestedMilestones: string[];
  /** When detected */
  detectedAt: string;
}

export interface MilestoneDetectorProfile {
  userId: string;
  /** Dates being tracked */
  trackedDates: TrackedDate[];
  /** Detected upcoming milestones */
  upcomingMilestones: DetectedMilestone[];
  /** Life stage signals detected */
  lifeStageSignals: LifeStageSignal[];
  /** Quiet wins being tracked (e.g., "days sober", "days exercising") */
  quietWins: Array<{
    label: string;
    startDate: string;
    currentStreak: number;
    longestStreak: number;
    lastUpdated: string;
  }>;
  /** Milestones already celebrated/acknowledged (to avoid repeats) */
  acknowledgedMilestones: Array<{
    label: string;
    date: string;
    acknowledgedAt: string;
  }>;
  lastUpdated: string;
}

// ============================================================================
// MILESTONE THRESHOLDS
// ============================================================================

const ANNIVERSARY_MILESTONES = [1, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100];
const CAREER_MILESTONES = [1, 2, 3, 5, 10, 15, 20, 25, 30];
const HABIT_STREAK_MILESTONES = [7, 14, 21, 30, 60, 90, 100, 180, 365, 500, 1000];

const SIGNIFICANCE_MAP: Record<number, MilestoneSignificance> = {
  1: 'notable',
  5: 'significant',
  10: 'major',
  20: 'major',
  25: 'major',
  50: 'life_changing',
};

// ============================================================================
// STORAGE
// ============================================================================

const COLLECTION = 'milestone_detector';

async function loadMilestoneProfile(userId: string): Promise<MilestoneDetectorProfile | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection(COLLECTION)
      .doc('profile')
      .get();
    if (doc.exists) {
      return doc.data() as MilestoneDetectorProfile;
    }
    return null;
  } catch (error) {
    log.debug({ error, userId }, 'Failed to load milestone detector profile');
    return null;
  }
}

async function saveMilestoneProfile(
  userId: string,
  profile: MilestoneDetectorProfile
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection(COLLECTION)
      .doc('profile')
      .set({
        ...profile,
        lastUpdated: new Date().toISOString(),
      });
    log.debug({ userId }, 'Saved milestone detector profile');
  } catch (error) {
    log.debug({ error, userId }, 'Failed to save milestone detector profile');
  }
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Track a significant date for milestone detection
 */
export async function trackDate(
  userId: string,
  label: string,
  date: Date | string,
  type: MilestoneType,
  options?: {
    recurring?: boolean;
    associatedWith?: string;
    context?: string;
  }
): Promise<TrackedDate> {
  const profile = (await loadMilestoneProfile(userId)) || createDefaultProfile(userId);

  const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
  const id = `${type}_${dateStr}_${Date.now()}`;

  const trackedDate: TrackedDate = {
    id,
    label,
    date: dateStr,
    type,
    recurring: options?.recurring ?? true,
    associatedWith: options?.associatedWith,
    context: options?.context,
    createdAt: new Date().toISOString(),
  };

  // Avoid duplicates
  const existingIdx = profile.trackedDates.findIndex(
    (d) => d.label.toLowerCase() === label.toLowerCase() && d.type === type
  );

  if (existingIdx >= 0) {
    profile.trackedDates[existingIdx] = trackedDate;
  } else {
    profile.trackedDates.push(trackedDate);
  }

  await saveMilestoneProfile(userId, profile);
  log.info({ userId, label, type, date: dateStr }, 'Tracking new date for milestones');

  return trackedDate;
}

/**
 * Track a "quiet win" streak (sobriety, exercise, meditation, etc.)
 */
export async function trackQuietWin(
  userId: string,
  label: string,
  startDate: Date | string
): Promise<void> {
  const profile = (await loadMilestoneProfile(userId)) || createDefaultProfile(userId);

  const dateStr = typeof startDate === 'string' ? startDate : startDate.toISOString().split('T')[0];
  const daysSinceStart = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
  );

  const existingIdx = profile.quietWins.findIndex(
    (w) => w.label.toLowerCase() === label.toLowerCase()
  );

  if (existingIdx >= 0) {
    const existing = profile.quietWins[existingIdx];
    existing.currentStreak = daysSinceStart;
    existing.longestStreak = Math.max(existing.longestStreak, daysSinceStart);
    existing.lastUpdated = new Date().toISOString();
  } else {
    profile.quietWins.push({
      label,
      startDate: dateStr,
      currentStreak: daysSinceStart,
      longestStreak: daysSinceStart,
      lastUpdated: new Date().toISOString(),
    });
  }

  await saveMilestoneProfile(userId, profile);
  log.info({ userId, label, daysSinceStart }, 'Tracking quiet win');
}

/**
 * Reset a quiet win streak (e.g., streak broken)
 */
export async function resetQuietWin(userId: string, label: string): Promise<void> {
  const profile = await loadMilestoneProfile(userId);
  if (!profile) return;

  const existingIdx = profile.quietWins.findIndex(
    (w) => w.label.toLowerCase() === label.toLowerCase()
  );

  if (existingIdx >= 0) {
    profile.quietWins[existingIdx].startDate = new Date().toISOString().split('T')[0];
    profile.quietWins[existingIdx].currentStreak = 0;
    profile.quietWins[existingIdx].lastUpdated = new Date().toISOString();
    await saveMilestoneProfile(userId, profile);
    log.info({ userId, label }, 'Reset quiet win streak');
  }
}

/**
 * Record a life stage signal (from conversation analysis)
 */
export async function recordLifeStageSignal(
  userId: string,
  transition: string,
  signals: string[],
  confidence: number
): Promise<void> {
  const profile = (await loadMilestoneProfile(userId)) || createDefaultProfile(userId);

  // Check if we already have this transition
  const existingIdx = profile.lifeStageSignals.findIndex(
    (s) => s.transition.toLowerCase() === transition.toLowerCase()
  );

  const suggestedMilestones = getSuggestedMilestonesForTransition(transition);

  if (existingIdx >= 0) {
    // Update existing - add signals, update confidence
    const existing = profile.lifeStageSignals[existingIdx];
    existing.signals = [...new Set([...existing.signals, ...signals])];
    existing.confidence = Math.min(1, Math.max(existing.confidence, confidence));
    existing.suggestedMilestones = suggestedMilestones;
    existing.detectedAt = new Date().toISOString();
  } else {
    profile.lifeStageSignals.push({
      transition,
      confidence,
      signals,
      suggestedMilestones,
      detectedAt: new Date().toISOString(),
    });
  }

  await saveMilestoneProfile(userId, profile);
  log.info(
    { userId, transition, confidence, signalCount: signals.length },
    'Recorded life stage signal'
  );
}

/**
 * Detect all upcoming milestones for a user
 */
export async function detectUpcomingMilestones(
  userId: string,
  lookaheadDays: number = 60
): Promise<DetectedMilestone[]> {
  const profile = await loadMilestoneProfile(userId);
  if (!profile) return [];

  const milestones: DetectedMilestone[] = [];
  const now = new Date();
  const cutoff = new Date(now.getTime() + lookaheadDays * 24 * 60 * 60 * 1000);

  // Check tracked dates
  for (const tracked of profile.trackedDates) {
    const anniversaryMilestones = detectDateMilestones(tracked, now, cutoff);
    milestones.push(...anniversaryMilestones);
  }

  // Check quiet win streaks
  for (const win of profile.quietWins) {
    const streakMilestones = detectStreakMilestones(win, now, lookaheadDays);
    milestones.push(...streakMilestones);
  }

  // Filter out already acknowledged milestones
  const filtered = milestones.filter((m) => {
    const alreadyAcknowledged = profile.acknowledgedMilestones.some(
      (a) =>
        a.label === m.label &&
        a.date === m.date &&
        new Date(a.acknowledgedAt).getTime() > Date.now() - 30 * 24 * 60 * 60 * 1000
    );
    return !alreadyAcknowledged;
  });

  // Sort by days away
  filtered.sort((a, b) => Math.abs(a.daysAway) - Math.abs(b.daysAway));

  return filtered;
}

/**
 * Get milestones worth celebrating now
 */
export async function getMilestonesToCelebrate(userId: string): Promise<DetectedMilestone[]> {
  const upcoming = await detectUpcomingMilestones(userId, 14);

  // Return milestones within 7 days, or significant ones within 14 days
  return upcoming.filter((m) => {
    if (Math.abs(m.daysAway) <= 7) return true;
    if (['major', 'life_changing'].includes(m.significance) && Math.abs(m.daysAway) <= 14)
      return true;
    return false;
  });
}

/**
 * Acknowledge a milestone (so we don't keep suggesting it)
 */
export async function acknowledgeMilestone(
  userId: string,
  label: string,
  date: string
): Promise<void> {
  const profile = (await loadMilestoneProfile(userId)) || createDefaultProfile(userId);

  profile.acknowledgedMilestones.push({
    label,
    date,
    acknowledgedAt: new Date().toISOString(),
  });

  // Clean up old acknowledgments (older than 1 year)
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  profile.acknowledgedMilestones = profile.acknowledgedMilestones.filter(
    (a) => a.acknowledgedAt > oneYearAgo
  );

  await saveMilestoneProfile(userId, profile);
  log.info({ userId, label, date }, 'Acknowledged milestone');
}

/**
 * Get life stage transitions worth discussing
 */
export async function getLifeStageInsights(
  userId: string,
  minConfidence: number = 0.5
): Promise<LifeStageSignal[]> {
  const profile = await loadMilestoneProfile(userId);
  if (!profile) return [];

  return profile.lifeStageSignals.filter((s) => s.confidence >= minConfidence);
}

/**
 * Build context string for LLM injection
 */
export async function buildMilestoneDetectorContext(userId: string): Promise<string> {
  const [milestones, lifeStages] = await Promise.all([
    getMilestonesToCelebrate(userId),
    getLifeStageInsights(userId),
  ]);

  if (milestones.length === 0 && lifeStages.length === 0) {
    return '';
  }

  const lines = ['[PROACTIVE MILESTONE DETECTION - Better Than Human]'];
  lines.push('You notice milestones humans forget to celebrate:\n');

  if (milestones.length > 0) {
    lines.push('🎉 MILESTONES WORTH CELEBRATING:');
    for (const m of milestones.slice(0, 5)) {
      const timing =
        m.daysAway === 0
          ? 'TODAY!'
          : m.daysAway > 0
            ? `in ${m.daysAway} days`
            : `${Math.abs(m.daysAway)} days ago`;
      const anniversary = m.anniversaryNumber ? ` (${m.anniversaryNumber} years!)` : '';
      lines.push(`  • ${m.label}${anniversary} - ${timing}`);
      lines.push(`    💡 ${m.celebrationSuggestion}`);
    }
  }

  if (lifeStages.length > 0) {
    lines.push('\n🔮 LIFE TRANSITIONS DETECTED:');
    for (const stage of lifeStages.slice(0, 3)) {
      lines.push(`  • ${stage.transition} (${Math.round(stage.confidence * 100)}% confidence)`);
      lines.push(`    Signals: ${stage.signals.slice(0, 2).join(', ')}`);
      if (stage.suggestedMilestones.length > 0) {
        lines.push(`    Worth planning: ${stage.suggestedMilestones[0]}`);
      }
    }
  }

  return lines.join('\n');
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createDefaultProfile(userId: string): MilestoneDetectorProfile {
  return {
    userId,
    trackedDates: [],
    upcomingMilestones: [],
    lifeStageSignals: [],
    quietWins: [],
    acknowledgedMilestones: [],
    lastUpdated: new Date().toISOString(),
  };
}

function detectDateMilestones(tracked: TrackedDate, now: Date, cutoff: Date): DetectedMilestone[] {
  const milestones: DetectedMilestone[] = [];
  const originalDate = new Date(tracked.date);
  const yearsSince = now.getFullYear() - originalDate.getFullYear();

  // Check current year and next year anniversaries
  for (let yearOffset = 0; yearOffset <= 1; yearOffset++) {
    const targetYear = now.getFullYear() + yearOffset;
    const anniversaryYear = targetYear - originalDate.getFullYear();

    if (anniversaryYear <= 0) continue;

    // Check if this is a milestone anniversary
    const isMilestone =
      ANNIVERSARY_MILESTONES.includes(anniversaryYear) ||
      (tracked.type === 'career' && CAREER_MILESTONES.includes(anniversaryYear));

    if (!isMilestone && anniversaryYear > 1) continue;

    // Calculate this year's anniversary date
    const anniversaryDate = new Date(targetYear, originalDate.getMonth(), originalDate.getDate());

    // Check if within window
    if (anniversaryDate >= now && anniversaryDate <= cutoff) {
      const daysAway = Math.ceil(
        (anniversaryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      const significance = SIGNIFICANCE_MAP[anniversaryYear] || 'minor';

      milestones.push({
        label: tracked.label,
        type: tracked.type,
        significance,
        date: anniversaryDate.toISOString().split('T')[0],
        daysAway,
        anniversaryNumber: anniversaryYear,
        context: tracked.context || `${anniversaryYear} year anniversary`,
        celebrationSuggestion: getCelebrationSuggestion(tracked.type, anniversaryYear),
        notified: false,
      });
    }
  }

  return milestones;
}

function detectStreakMilestones(
  win: MilestoneDetectorProfile['quietWins'][0],
  now: Date,
  lookaheadDays: number
): DetectedMilestone[] {
  const milestones: DetectedMilestone[] = [];
  const currentStreak = win.currentStreak;

  // Find next milestone
  const nextMilestone = HABIT_STREAK_MILESTONES.find((m) => m > currentStreak);
  if (!nextMilestone) return milestones;

  const daysUntilMilestone = nextMilestone - currentStreak;

  if (daysUntilMilestone <= lookaheadDays) {
    const significance: MilestoneSignificance =
      nextMilestone >= 365 ? 'major' : nextMilestone >= 90 ? 'significant' : 'notable';

    milestones.push({
      label: `${win.label} streak`,
      type: 'habit',
      significance,
      date: new Date(now.getTime() + daysUntilMilestone * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0],
      daysAway: daysUntilMilestone,
      anniversaryNumber: nextMilestone,
      context: `${nextMilestone} day streak!`,
      celebrationSuggestion: getStreakCelebrationSuggestion(nextMilestone, win.label),
      notified: false,
    });
  }

  // Check if we just hit a milestone
  if (HABIT_STREAK_MILESTONES.includes(currentStreak)) {
    const significance: MilestoneSignificance =
      currentStreak >= 365 ? 'major' : currentStreak >= 90 ? 'significant' : 'notable';

    milestones.push({
      label: `${win.label} streak`,
      type: 'quiet_win',
      significance,
      date: now.toISOString().split('T')[0],
      daysAway: 0,
      anniversaryNumber: currentStreak,
      context: `Just hit ${currentStreak} days!`,
      celebrationSuggestion: getStreakCelebrationSuggestion(currentStreak, win.label),
      notified: false,
    });
  }

  return milestones;
}

function getCelebrationSuggestion(type: MilestoneType, years: number): string {
  const suggestions: Record<MilestoneType, Record<number, string>> = {
    anniversary: {
      1: 'Paper anniversary - write each other a letter',
      5: 'Wood anniversary - plant something together',
      10: 'Tin anniversary - revisit your wedding venue or first date spot',
      25: 'Silver anniversary - this is huge! Renew vows or throw a party',
      50: 'Gold anniversary - celebrate with loved ones, this is legendary',
    },
    career: {
      1: 'Reflect on your first year wins',
      5: "Consider how much you've grown - treat yourself",
      10: 'A decade! Document your journey and celebrate',
    },
    friendship: {
      5: 'Plan a special outing together',
      10: 'Reflect on your friendship journey',
    },
    health: {},
    financial: {},
    habit: {},
    life_stage: {},
    second_chance: {
      1: 'Celebrate your fresh start - you made it a year!',
    },
    quiet_win: {},
    custom: {},
  };

  return (
    suggestions[type]?.[years] ||
    (years >= 10 ? 'This milestone deserves recognition!' : 'A moment worth acknowledging')
  );
}

function getStreakCelebrationSuggestion(days: number, label: string): string {
  if (days >= 365) return `A full year of ${label}! This is transformational.`;
  if (days >= 100) return `100+ days - you've built a real habit!`;
  if (days >= 30) return `A month! The hardest part is behind you.`;
  if (days >= 7) return `A week - momentum is building!`;
  return 'Every day counts. Keep going.';
}

function getSuggestedMilestonesForTransition(transition: string): string[] {
  const suggestions: Record<string, string[]> = {
    'empty nest': [
      'Last child leaving home celebration',
      'New chapter date night',
      'Redecorate their old room (when ready)',
    ],
    retirement: [
      'Retirement party',
      'First week of freedom celebration',
      'Bucket list planning session',
    ],
    'new parent': ['Baby shower', 'Nursery reveal', '100 days celebration'],
    'career change': ['Last day celebration', 'First day at new job', '90 day milestone'],
    'divorce finalized': [
      'Closure ritual',
      'New chapter celebration',
      'One year anniversary of fresh start',
    ],
    'recovery beginning': ['First week', '30 days', '90 days', 'One year'],
  };

  const key = Object.keys(suggestions).find((k) =>
    transition.toLowerCase().includes(k.toLowerCase())
  );

  return suggestions[key || ''] || ['Mark this transition with intention'];
}

// ============================================================================
// SERVICE EXPORT
// ============================================================================

export const proactiveMilestoneDetector = {
  trackDate,
  trackQuietWin,
  resetQuietWin,
  recordLifeStageSignal,
  detectUpcomingMilestones,
  getMilestonesToCelebrate,
  acknowledgeMilestone,
  getLifeStageInsights,
  buildMilestoneDetectorContext,
  loadMilestoneProfile,
};

export default proactiveMilestoneDetector;
