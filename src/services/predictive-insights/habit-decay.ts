/**
 * Habit Decay Early Warning
 *
 * > "Your morning meditation has gone from daily to 3x/week.
 * > That's often how habits unravel. Want to troubleshoot?"
 *
 * Detects habit frequency decline BEFORE complete abandonment,
 * catching the inflection point where intervention is still easy.
 *
 * @module PredictiveInsights/HabitDecay
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { HabitIntervention } from './types.js';

const log = createLogger({ module: 'HabitDecay' });

// ============================================================================
// TYPES
// ============================================================================

export interface HabitDecayWarning {
  userId: string;
  habitId: string;
  habitName: string;

  /** Current frequency (times per week) */
  currentFrequency: number;

  /** Previous frequency (times per week) */
  previousFrequency: number;

  /** Rate of decay (0-1, higher = faster decay) */
  decayRate: number;

  /** Estimated days until complete abandonment */
  daysUntilAbandonment: number;

  /** Human-friendly message */
  message: string;

  /** Suggestion */
  suggestion: string;

  /** Specific interventions that might help */
  interventions: HabitIntervention[];

  /** Confidence (0-1) */
  confidence: number;

  /** Should surface */
  shouldSurface: boolean;
}

interface HabitCompletion {
  date: Date;
  completed: boolean;
  duration?: number; // minutes
  notes?: string;
}

interface TrackedHabit {
  id: string;
  name: string;
  category: 'health' | 'productivity' | 'mindfulness' | 'social' | 'learning' | 'other';
  targetFrequency: number; // times per week
  completions: HabitCompletion[];
  createdAt: Date;
  currentStreak: number;
  longestStreak: number;
}

// ============================================================================
// STORAGE
// ============================================================================

const userHabits = new Map<string, Map<string, TrackedHabit>>();
const MAX_COMPLETIONS = 180; // 6 months

// ============================================================================
// DECAY DETECTION PARAMETERS
// ============================================================================

const ANALYSIS_WINDOWS = {
  recent: 14, // Last 14 days
  baseline: 28, // Previous 28 days (before recent)
};

const DECAY_THRESHOLDS = {
  minor: 0.2, // 20% frequency drop
  moderate: 0.35, // 35% frequency drop
  significant: 0.5, // 50% frequency drop
};

// ============================================================================
// MAIN DETECTION FUNCTION
// ============================================================================

/**
 * Detect decaying habits for a user
 */
export async function detectHabitDecay(userId: string): Promise<HabitDecayWarning[]> {
  const habits = userHabits.get(userId);
  if (!habits || habits.size === 0) {
    // Try to load from external sources
    await loadHabitsFromSources(userId);
  }

  const loadedHabits = userHabits.get(userId);
  if (!loadedHabits || loadedHabits.size === 0) {
    return [];
  }

  const warnings: HabitDecayWarning[] = [];

  for (const [habitId, habit] of loadedHabits) {
    const warning = analyzeHabitDecay(userId, habit);
    if (warning) {
      warnings.push(warning);
    }
  }

  // Sort by decay rate (most urgent first)
  warnings.sort((a, b) => b.decayRate - a.decayRate);

  return warnings;
}

function analyzeHabitDecay(userId: string, habit: TrackedHabit): HabitDecayWarning | null {
  const now = Date.now();

  // Need enough history
  if (habit.completions.length < 14) {
    return null;
  }

  // Calculate recent vs baseline frequency
  const recentCutoff = new Date(now - ANALYSIS_WINDOWS.recent * 24 * 60 * 60 * 1000);
  const baselineCutoff = new Date(
    now - (ANALYSIS_WINDOWS.recent + ANALYSIS_WINDOWS.baseline) * 24 * 60 * 60 * 1000
  );

  const recentCompletions = habit.completions.filter((c) => c.date >= recentCutoff && c.completed);
  const baselineCompletions = habit.completions.filter(
    (c) => c.date >= baselineCutoff && c.date < recentCutoff && c.completed
  );

  // Calculate weekly frequencies
  const recentFrequency = (recentCompletions.length / ANALYSIS_WINDOWS.recent) * 7;
  const baselineFrequency = (baselineCompletions.length / ANALYSIS_WINDOWS.baseline) * 7;

  // If baseline is too low, not enough data
  if (baselineFrequency < 1) {
    return null;
  }

  // Calculate decay rate
  const decayRate =
    baselineFrequency > 0
      ? Math.max(0, (baselineFrequency - recentFrequency) / baselineFrequency)
      : 0;

  // Check if decay is significant
  if (decayRate < DECAY_THRESHOLDS.minor) {
    return null; // Not decaying significantly
  }

  // Project days until abandonment
  const daysUntilAbandonment = projectAbandonment(recentFrequency, baselineFrequency, decayRate);

  // Generate message and interventions
  const { message, suggestion, interventions } = generateDecayInsight(
    habit,
    recentFrequency,
    baselineFrequency,
    decayRate
  );

  // Calculate confidence
  const confidence = calculateConfidence(habit.completions.length, decayRate, baselineFrequency);

  // Should surface if decay is moderate+ and confidence is decent
  const shouldSurface = decayRate >= DECAY_THRESHOLDS.moderate && confidence >= 0.5;

  return {
    userId,
    habitId: habit.id,
    habitName: habit.name,
    currentFrequency: Math.round(recentFrequency * 10) / 10,
    previousFrequency: Math.round(baselineFrequency * 10) / 10,
    decayRate,
    daysUntilAbandonment,
    message,
    suggestion,
    interventions,
    confidence,
    shouldSurface,
  };
}

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

function projectAbandonment(
  currentFrequency: number,
  baselineFrequency: number,
  decayRate: number
): number {
  if (decayRate <= 0 || currentFrequency <= 0) {
    return 365; // Not decaying or already abandoned
  }

  // Simple linear projection
  // How many more decay cycles until frequency hits ~0?
  const decayPerWeek = (baselineFrequency * decayRate) / 2; // Assume decay rate measured over 2 weeks
  const weeksUntilZero = currentFrequency / decayPerWeek;

  return Math.max(1, Math.round(weeksUntilZero * 7));
}

function generateDecayInsight(
  habit: TrackedHabit,
  currentFreq: number,
  baselineFreq: number,
  decayRate: number
): {
  message: string;
  suggestion: string;
  interventions: HabitIntervention[];
} {
  const freqDescription = (freq: number): string => {
    if (freq >= 6.5) return 'daily';
    if (freq >= 4.5) return 'about 5x/week';
    if (freq >= 3.5) return 'about 4x/week';
    if (freq >= 2.5) return '3x/week';
    if (freq >= 1.5) return 'twice a week';
    if (freq >= 0.5) return 'about once a week';
    return 'rarely';
  };

  let message = '';
  let suggestion = '';

  if (decayRate >= DECAY_THRESHOLDS.significant) {
    message = `Your ${habit.name} has dropped from ${freqDescription(baselineFreq)} to ${freqDescription(currentFreq)}. That's a significant shift.`;
    suggestion =
      'This is often the inflection point before a habit fades completely. Want to troubleshoot?';
  } else if (decayRate >= DECAY_THRESHOLDS.moderate) {
    message = `I've noticed your ${habit.name} slipping from ${freqDescription(baselineFreq)} to ${freqDescription(currentFreq)}.`;
    suggestion = 'Small adjustments now are easier than rebuilding later.';
  } else {
    message = `Your ${habit.name} has dipped slightly. Currently ${freqDescription(currentFreq)} instead of ${freqDescription(baselineFreq)}.`;
    suggestion = 'Just flagging it. Might be a blip or might be worth watching.';
  }

  // Generate interventions based on habit type
  const interventions = generateInterventions(habit, decayRate);

  return { message, suggestion, interventions };
}

function generateInterventions(habit: TrackedHabit, decayRate: number): HabitIntervention[] {
  const interventions: HabitIntervention[] = [];

  // Universal interventions
  interventions.push({
    intervention: 'Reduce the barrier: make it 2-minute version',
    effectiveness: 0.7,
    effort: 'low',
  });

  interventions.push({
    intervention: 'Stack it: attach to existing habit',
    effectiveness: 0.65,
    effort: 'low',
  });

  // Category-specific
  switch (habit.category) {
    case 'health':
      interventions.push({
        intervention: 'Set out equipment the night before',
        effectiveness: 0.6,
        effort: 'low',
      });
      interventions.push({
        intervention: 'Find an accountability partner',
        effectiveness: 0.75,
        effort: 'medium',
      });
      break;

    case 'mindfulness':
      interventions.push({
        intervention: 'Link to morning coffee/tea',
        effectiveness: 0.7,
        effort: 'low',
      });
      interventions.push({
        intervention: 'Use guided session instead of solo',
        effectiveness: 0.55,
        effort: 'low',
      });
      break;

    case 'productivity':
      interventions.push({
        intervention: 'Calendar block it',
        effectiveness: 0.65,
        effort: 'low',
      });
      interventions.push({
        intervention: 'Reward completion with something small',
        effectiveness: 0.5,
        effort: 'low',
      });
      break;

    case 'learning':
      interventions.push({
        intervention: 'Switch to spaced repetition approach',
        effectiveness: 0.7,
        effort: 'medium',
      });
      interventions.push({
        intervention: 'Find a study buddy',
        effectiveness: 0.6,
        effort: 'medium',
      });
      break;

    case 'social':
      interventions.push({
        intervention: 'Put recurring events in calendar',
        effectiveness: 0.65,
        effort: 'low',
      });
      break;

    default:
      interventions.push({
        intervention: 'Identify what changed when frequency dropped',
        effectiveness: 0.6,
        effort: 'low',
      });
  }

  // If severe decay, suggest more significant intervention
  if (decayRate >= DECAY_THRESHOLDS.significant) {
    interventions.push({
      intervention: 'Take a week off and restart fresh',
      effectiveness: 0.5,
      effort: 'medium',
    });
  }

  // Sort by effectiveness
  interventions.sort((a, b) => b.effectiveness - a.effectiveness);

  return interventions.slice(0, 4);
}

function calculateConfidence(
  completionCount: number,
  decayRate: number,
  baselineFrequency: number
): number {
  let confidence = 0.3;

  // More data = more confidence
  if (completionCount >= 90) confidence += 0.25;
  else if (completionCount >= 45) confidence += 0.15;
  else if (completionCount >= 21) confidence += 0.1;

  // Higher baseline = more reliable pattern
  if (baselineFrequency >= 5) confidence += 0.15;
  else if (baselineFrequency >= 3) confidence += 0.1;

  // Clear decay signal = more confidence
  if (decayRate >= 0.4) confidence += 0.15;

  return Math.min(confidence, 0.9);
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadHabitsFromSources(userId: string): Promise<void> {
  try {
    // Try to load from daily rituals service
    const { getDailyRitualsService, PERSONA_RITUALS } = await import('../daily-rituals.js');
    const service = getDailyRitualsService();
    const profile = await service.getOrCreateProfileAsync(userId);

    if (profile?.activeRituals && profile.activeRituals.length > 0) {
      const habitsMap = new Map<string, TrackedHabit>();

      for (const ritualId of profile.activeRituals) {
        const ritualDef = PERSONA_RITUALS[ritualId];
        const streak = profile.streaks[ritualId];

        habitsMap.set(ritualId, {
          id: ritualId,
          name: ritualDef?.name || ritualId.replace(/-/g, ' '),
          category: mapRitualCategory(ritualDef?.personaId),
          targetFrequency: 7, // Default daily
          completions: [], // Will be populated from engagement store
          createdAt: new Date(profile.lastRitualDate || Date.now()),
          currentStreak: streak?.currentStreak || 0,
          longestStreak: streak?.longestStreak || 0,
        });
      }

      userHabits.set(userId, habitsMap);
    }
  } catch (error) {
    log.debug({ error, userId }, 'Could not load rituals for habit tracking');
  }

  try {
    // Try to load from engagement store
    const { getEngagementStore } = await import('../engagement-store.js');
    const store = await getEngagementStore();
    const streaks = await store.getAllStreaks(userId);

    if (streaks && streaks.length > 0) {
      const habitsMap = userHabits.get(userId) || new Map<string, TrackedHabit>();

      for (const streak of streaks) {
        if (!habitsMap.has(streak.ritualId)) {
          // Get start date from streak history if available
          const firstHistory = streak.streakHistory?.[0];
          const createdAt = firstHistory?.startDate ? new Date(firstHistory.startDate) : new Date();

          habitsMap.set(streak.ritualId, {
            id: streak.ritualId,
            name: streak.ritualId.replace(/_/g, ' '),
            category: 'other',
            targetFrequency: 7,
            completions: [], // Streaks don't store full history, just current count
            createdAt,
            currentStreak: streak.currentStreak || 0,
            longestStreak: streak.longestStreak || 0,
          });
        }
      }

      userHabits.set(userId, habitsMap);
    }
  } catch (error) {
    log.debug({ error, userId }, 'Could not load streaks for habit tracking');
  }
}

function mapRitualCategory(category?: string): TrackedHabit['category'] {
  if (!category) return 'other';

  const lower = category.toLowerCase();
  if (lower.includes('health') || lower.includes('exercise') || lower.includes('fitness')) {
    return 'health';
  }
  if (lower.includes('mindful') || lower.includes('meditat') || lower.includes('breath')) {
    return 'mindfulness';
  }
  if (lower.includes('product') || lower.includes('work') || lower.includes('focus')) {
    return 'productivity';
  }
  if (lower.includes('learn') || lower.includes('read') || lower.includes('study')) {
    return 'learning';
  }
  if (lower.includes('social') || lower.includes('friend') || lower.includes('family')) {
    return 'social';
  }
  return 'other';
}

// ============================================================================
// DATA COLLECTION
// ============================================================================

/**
 * Record a habit completion
 */
export function recordHabitCompletion(
  userId: string,
  habitId: string,
  completed: boolean,
  duration?: number,
  notes?: string
): void {
  let habits = userHabits.get(userId);
  if (!habits) {
    habits = new Map();
    userHabits.set(userId, habits);
  }

  let habit = habits.get(habitId);
  if (!habit) {
    // Auto-create habit
    habit = {
      id: habitId,
      name: habitId.replace(/_/g, ' '),
      category: 'other',
      targetFrequency: 7,
      completions: [],
      createdAt: new Date(),
      currentStreak: 0,
      longestStreak: 0,
    };
    habits.set(habitId, habit);
  }

  habit.completions.push({
    date: new Date(),
    completed,
    duration,
    notes,
  });

  // Update streak
  if (completed) {
    habit.currentStreak++;
    habit.longestStreak = Math.max(habit.longestStreak, habit.currentStreak);
  } else {
    habit.currentStreak = 0;
  }

  // Keep bounded
  if (habit.completions.length > MAX_COMPLETIONS) {
    habit.completions = habit.completions.slice(-MAX_COMPLETIONS);
  }

  log.debug({ userId, habitId, completed }, 'Recorded habit completion');
}

/**
 * Add a habit to track
 */
export function addHabitToTrack(
  userId: string,
  habitId: string,
  name: string,
  category: TrackedHabit['category'],
  targetFrequency = 7
): void {
  let habits = userHabits.get(userId);
  if (!habits) {
    habits = new Map();
    userHabits.set(userId, habits);
  }

  habits.set(habitId, {
    id: habitId,
    name,
    category,
    targetFrequency,
    completions: [],
    createdAt: new Date(),
    currentStreak: 0,
    longestStreak: 0,
  });

  log.debug({ userId, habitId, name }, 'Added habit to tracking');
}

/**
 * Get tracked habits for a user
 */
export function getTrackedHabits(userId: string): Array<{
  id: string;
  name: string;
  currentStreak: number;
  completionRate: number;
}> {
  const habits = userHabits.get(userId);
  if (!habits) return [];

  return Array.from(habits.values()).map((h) => {
    const recentCompletions = h.completions.slice(-30);
    const completionRate =
      recentCompletions.length > 0
        ? recentCompletions.filter((c) => c.completed).length / recentCompletions.length
        : 0;

    return {
      id: h.id,
      name: h.name,
      currentStreak: h.currentStreak,
      completionRate,
    };
  });
}

/**
 * Clear habit data for a user
 */
export function clearHabitData(userId: string): void {
  userHabits.delete(userId);
}

export default {
  detectHabitDecay,
  recordHabitCompletion,
  addHabitToTrack,
  getTrackedHabits,
  clearHabitData,
};
