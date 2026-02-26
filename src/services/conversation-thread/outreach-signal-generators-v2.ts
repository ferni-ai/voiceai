/**
 * Superhuman Outreach Intelligence - Signal Generators (V2/Domain/Semantic)
 *
 * Better Than Human V2 generators, domain signal generators,
 * and semantic intelligence V3 generators.
 *
 * @module services/conversation-thread/outreach-signal-generators-v2
 */

import type { SuperhumanSignal } from './outreach-signal-types.js';

// ============================================================================
// BETTER THAN HUMAN V2 SIGNAL GENERATORS
// ============================================================================

/**
 * Generate signals from voice biomarkers.
 */
export function signalFromVoiceBiomarkers(biomarkers: {
  stressLevel: number;
  fatigueLevel: number;
  moodScore: number;
  trends: { improving: boolean; concerning: boolean };
}): SuperhumanSignal | null {
  if (!biomarkers.trends.concerning && biomarkers.stressLevel < 0.7) return null;

  return {
    type: 'voice_biomarker_alert',
    severity: biomarkers.stressLevel > 0.8 || biomarkers.fatigueLevel > 0.8 ? 'high' : 'medium',
    source: 'voice-biomarkers',
    data: biomarkers,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from mood calendar predictions.
 */
export function signalFromMoodPrediction(prediction: {
  predictedMood: string;
  predictedDate: Date;
  confidence: number;
  basedOn: string[];
}): SuperhumanSignal | null {
  const negativeMoods = ['low', 'sad', 'anxious', 'stressed', 'overwhelmed'];
  if (
    !negativeMoods.includes(prediction.predictedMood.toLowerCase()) ||
    prediction.confidence < 0.6
  ) {
    return null;
  }

  return {
    type: 'mood_prediction_low',
    severity: prediction.confidence > 0.8 ? 'high' : 'medium',
    source: 'mood-calendar',
    data: prediction,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from social battery.
 */
export function signalFromSocialBattery(battery: {
  level: number;
  recentEvents: number;
  needsRecharge: boolean;
  recharged: boolean;
}): SuperhumanSignal | null {
  if (battery.needsRecharge && battery.level < 0.2) {
    return {
      type: 'social_battery_depleted',
      severity: 'medium',
      source: 'social-battery',
      data: battery,
      timestamp: new Date(),
    };
  }
  if (battery.recharged && battery.level > 0.8) {
    return {
      type: 'social_battery_recharged',
      severity: 'low',
      source: 'social-battery',
      data: battery,
      timestamp: new Date(),
    };
  }
  return null;
}

/**
 * Generate signals from conflict resolution memory.
 */
export function signalFromConflict(conflict: {
  conflictId: string;
  personName: string;
  daysSinceConflict: number;
  resolved: boolean;
  recommendation?: string;
}): SuperhumanSignal | null {
  if (conflict.resolved || conflict.daysSinceConflict < 2) return null;

  return {
    type: 'conflict_unresolved',
    severity: conflict.daysSinceConflict > 7 ? 'high' : 'medium',
    source: 'conflict-resolution',
    data: conflict,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from calendar prep coaching.
 */
export function signalFromCalendarPrep(event: {
  eventId: string;
  title: string;
  difficulty: 'easy' | 'moderate' | 'challenging' | 'high_stakes';
  hoursUntil: number;
  prepNeeded: boolean;
}): SuperhumanSignal | null {
  if (!event.prepNeeded) return null;

  // Alert based on difficulty and time
  const thresholds = { easy: 2, moderate: 12, challenging: 24, high_stakes: 48 };
  if (event.hoursUntil > thresholds[event.difficulty]) return null;

  return {
    type: 'calendar_prep_needed',
    severity:
      event.difficulty === 'high_stakes'
        ? 'high'
        : event.difficulty === 'challenging'
          ? 'medium'
          : 'low',
    source: 'calendar-prep-coaching',
    data: event,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from energy wave mapping.
 */
export function signalFromEnergyWave(wave: {
  currentEnergy: number;
  optimalTime: boolean;
  avoidTime: boolean;
  recommendation?: string;
}): SuperhumanSignal | null {
  if (wave.optimalTime) {
    return {
      type: 'energy_wave_optimal',
      severity: 'low',
      source: 'energy-wave-mapping',
      data: wave,
      timestamp: new Date(),
    };
  }
  if (wave.avoidTime) {
    return {
      type: 'energy_wave_avoid',
      severity: 'low',
      source: 'energy-wave-mapping',
      data: wave,
      timestamp: new Date(),
    };
  }
  return null;
}

/**
 * Generate signals from emotional vocabulary.
 */
export function signalFromVagueEmotion(emotion: {
  vagueWord: string;
  possibleMeanings: string[];
  context?: string;
}): SuperhumanSignal {
  return {
    type: 'vague_emotion_detected',
    severity: 'low',
    source: 'emotional-vocabulary',
    data: emotion,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from recovery tracking.
 */
export function signalFromRecovery(recovery: {
  eventType: string;
  eventName: string;
  daysSinceEvent: number;
  recoveryStatus: 'not_started' | 'in_progress' | 'recovered';
  checkInDue: boolean;
}): SuperhumanSignal | null {
  if (recovery.recoveryStatus === 'recovered') return null;

  if (recovery.checkInDue) {
    return {
      type: 'recovery_check_in',
      severity: 'medium',
      source: 'recovery-tracking',
      data: recovery,
      timestamp: new Date(),
    };
  }

  if (recovery.recoveryStatus === 'not_started' && recovery.daysSinceEvent >= 1) {
    return {
      type: 'recovery_needed',
      severity: 'medium',
      source: 'recovery-tracking',
      data: recovery,
      timestamp: new Date(),
    };
  }

  return null;
}

/**
 * Generate signals from inside joke memory.
 */
export function signalFromInsideJoke(opportunity: {
  momentType: string;
  momentText: string;
  relevanceScore: number;
  canCallback: boolean;
}): SuperhumanSignal | null {
  if (!opportunity.canCallback || opportunity.relevanceScore < 0.6) return null;

  return {
    type: 'inside_joke_opportunity',
    severity: 'low',
    source: 'inside-joke-memory',
    data: opportunity,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from protective silence (boundaries).
 */
export function signalFromBoundary(boundary: {
  topic: string;
  severity: 'mild' | 'moderate' | 'severe';
  wasHit: boolean;
}): SuperhumanSignal | null {
  if (!boundary.wasHit) return null;

  return {
    type: 'protective_boundary_crossed',
    severity: boundary.severity === 'severe' ? 'high' : 'medium',
    source: 'protective-silence',
    data: boundary,
    timestamp: new Date(),
  };
}

// ============================================================================
// DOMAIN SIGNAL GENERATORS (Habits, Tasks, Financial, Health)
// ============================================================================

/**
 * Generate signals from habit tracking.
 */
export function signalFromHabit(habit: {
  habitName: string;
  action: 'completed' | 'skipped' | 'streak_broken';
  streakDays?: number;
  wasRecord?: boolean;
}): SuperhumanSignal | null {
  if (habit.action === 'streak_broken') {
    return {
      type: 'habit_streak_broken',
      severity: (habit.streakDays ?? 0) > 7 ? 'high' : 'medium',
      source: 'habit-tracking',
      data: habit,
      timestamp: new Date(),
    };
  }

  if (habit.action === 'completed' && habit.streakDays) {
    const milestones = [7, 30, 100, 365];
    if (milestones.includes(habit.streakDays) || habit.wasRecord) {
      return {
        type: 'habit_streak_milestone',
        severity: habit.streakDays >= 30 ? 'high' : 'medium',
        source: 'habit-tracking',
        data: habit,
        timestamp: new Date(),
      };
    }
  }

  return null;
}

/**
 * Generate signals from task tracking.
 */
export function signalFromTask(task: {
  taskTitle: string;
  priority: 'low' | 'medium' | 'high';
  isOverdue: boolean;
  daysOverdue?: number;
}): SuperhumanSignal | null {
  if (!task.isOverdue) return null;

  return {
    type: 'task_overdue',
    severity: task.priority === 'high' ? 'high' : 'medium',
    source: 'task-tracking',
    data: task,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from financial tracking.
 */
export function signalFromFinancial(event: {
  eventType: 'savings_progress' | 'bill_due' | 'budget_exceeded';
  title: string;
  progress?: number;
  daysUntilDue?: number;
  amount?: number;
}): SuperhumanSignal | null {
  if (event.eventType === 'savings_progress' && (event.progress ?? 0) >= 0.5) {
    const milestones = [0.5, 0.75, 1.0];
    if (milestones.some((m) => Math.abs((event.progress ?? 0) - m) < 0.05)) {
      return {
        type: 'financial_goal_progress',
        severity: (event.progress ?? 0) >= 1.0 ? 'high' : 'medium',
        source: 'financial-tracking',
        data: event,
        timestamp: new Date(),
      };
    }
  }

  if (event.eventType === 'bill_due' && (event.daysUntilDue ?? 999) <= 3) {
    return {
      type: 'financial_bill_due',
      severity: (event.daysUntilDue ?? 0) <= 1 ? 'high' : 'medium',
      source: 'financial-tracking',
      data: event,
      timestamp: new Date(),
    };
  }

  return null;
}

/**
 * Generate signals from sleep tracking.
 */
export function signalFromSleep(sleep: {
  quality: 'good' | 'fair' | 'poor';
  hoursSlept: number;
  consecutivePoorNights?: number;
}): SuperhumanSignal | null {
  if (sleep.quality !== 'poor' && sleep.hoursSlept >= 6) return null;

  return {
    type: 'sleep_quality_poor',
    severity: (sleep.consecutivePoorNights ?? 0) >= 3 ? 'high' : 'medium',
    source: 'sleep-tracking',
    data: sleep,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from calendar density.
 */
export function signalFromCalendarDensity(calendar: {
  date: Date;
  meetingCount: number;
  totalHours: number;
  isBusyDay: boolean;
}): SuperhumanSignal | null {
  if (!calendar.isBusyDay) return null;

  return {
    type: 'calendar_busy_day',
    severity: calendar.totalHours > 8 ? 'high' : 'medium',
    source: 'calendar-awareness',
    data: calendar,
    timestamp: new Date(),
  };
}

// ============================================================================
// SEMANTIC INTELLIGENCE SIGNAL GENERATORS (V3)
// ============================================================================

/**
 * Generate signals from correlation mining.
 */
export function signalFromCorrelation(correlation: {
  domains: [string, string];
  description: string;
  strength: number;
  actionable: boolean;
}): SuperhumanSignal | null {
  if (!correlation.actionable || correlation.strength < 0.6) return null;

  return {
    type: 'correlation_discovered',
    severity: correlation.strength > 0.8 ? 'high' : 'medium',
    source: 'correlation-mining',
    data: correlation,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from emotional trajectories.
 */
export function signalFromEmotionalTrajectory(trajectory: {
  direction: 'improving' | 'declining' | 'stable';
  currentEmotion: string;
  weeklyTrend: number;
}): SuperhumanSignal | null {
  if (trajectory.direction === 'stable') return null;

  return {
    type: 'emotional_trajectory_shift',
    severity:
      trajectory.direction === 'declining' && trajectory.weeklyTrend < -0.5 ? 'high' : 'medium',
    source: 'emotional-trajectories',
    data: trajectory,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from relational semantics.
 */
export function signalFromRelationalTension(tension: {
  personName: string;
  tensionType: string;
  severity: number;
  suggestedAction?: string;
}): SuperhumanSignal | null {
  if (tension.severity < 0.5) return null;

  return {
    type: 'relational_tension',
    severity: tension.severity > 0.8 ? 'high' : 'medium',
    source: 'relational-semantics',
    data: tension,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from counterfactual memory.
 */
export function signalFromCounterfactual(decision: {
  decisionPoint: string;
  hasRegret: boolean;
  regretIntensity?: number;
  alternativeMentioned: boolean;
}): SuperhumanSignal | null {
  if (!decision.hasRegret || !decision.alternativeMentioned) return null;

  return {
    type: 'counterfactual_regret',
    severity: (decision.regretIntensity ?? 0) > 0.7 ? 'high' : 'medium',
    source: 'counterfactual-memory',
    data: decision,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from growth fingerprint.
 */
export function signalFromGrowth(growth: {
  areaOfGrowth: string;
  changeType: 'improvement' | 'regression' | 'emergence';
  magnitude: number;
  celebrationWorthy: boolean;
}): SuperhumanSignal | null {
  if (growth.changeType === 'regression' && growth.magnitude > 0.5) {
    return {
      type: 'growth_pattern_detected',
      severity: 'medium',
      source: 'growth-fingerprint',
      data: { ...growth, isPositive: false },
      timestamp: new Date(),
    };
  }

  if (growth.celebrationWorthy && growth.changeType !== 'regression') {
    return {
      type: 'growth_pattern_detected',
      severity: growth.magnitude > 0.7 ? 'high' : 'medium',
      source: 'growth-fingerprint',
      data: { ...growth, isPositive: true },
      timestamp: new Date(),
    };
  }

  return null;
}

/**
 * Generate signals from cross-session threading.
 */
export function signalFromCrossSessionThread(thread: {
  threadId: string;
  topic: string;
  sessionCount: number;
  lastMentioned: Date;
  needsResolution: boolean;
}): SuperhumanSignal | null {
  if (!thread.needsResolution) return null;

  return {
    type: 'cross_session_thread_found',
    severity: thread.sessionCount > 3 ? 'high' : 'medium',
    source: 'cross-session-threading',
    data: thread,
    timestamp: new Date(),
  };
}
