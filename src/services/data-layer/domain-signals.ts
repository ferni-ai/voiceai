/**
 * Domain Signals
 *
 * Records domain-specific signals for cross-domain correlation.
 * These signals are collected and analyzed by the unified intelligence system.
 *
 * TODO: Integrate with intelligence/unified-intelligence-api.ts
 *
 * @module services/data-layer/domain-signals
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  recordDomainSignal,
  type DomainSignal,
} from '../../intelligence/unified-intelligence-api.js';

const log = createLogger({ module: 'domain-signals' });

// ============================================================================
// CALENDAR SIGNALS
// ============================================================================

export type CalendarSignalType =
  | 'meeting_scheduled'
  | 'meeting_updated'
  | 'meeting_cancelled'
  | 'meeting_attended'
  | 'meeting_missed'
  | 'created'
  | 'updated'
  | 'deleted'
  | 'attended'
  | 'missed';

export interface CalendarSignalMetadata {
  title?: string;
  eventId?: string;
  eventTitle?: string;
  duration?: number;
  hasConflict?: boolean;
  isRecurring?: boolean;
  [key: string]: unknown;
}

/**
 * Record a calendar-related signal
 *
 * @param userId - User ID
 * @param signalType - Type of calendar signal (e.g., 'meeting_scheduled')
 * @param metadata - Additional signal metadata
 */
export function recordCalendarSignal(
  userId: string,
  signalType: CalendarSignalType,
  metadata: CalendarSignalMetadata = {}
): void {
  log.debug({ userId, signalType }, 'Recording calendar signal');

  const signal: DomainSignal = {
    domain: 'calendar',
    store: 'calendar',
    metric: signalType,
    direction: signalType.includes('cancelled') || signalType === 'deleted' ? 'decreased' : 'changed',
    magnitude: metadata.hasConflict ? 'significant' : 'minor',
    timestamp: new Date(),
    metadata: {
      ...metadata,
    },
  };

  recordDomainSignal(userId, signal);
}

// ============================================================================
// FINANCIAL SIGNALS
// ============================================================================

export type FinancialSignalType =
  | 'budget_set'
  | 'budget_updated'
  | 'spending_logged'
  | 'savings_progress'
  | 'savings_goal_progress'
  | 'goal_achieved'
  | 'subscription_added'
  | 'subscription_cancelled';

export interface FinancialSignalMetadata {
  category?: string;
  amount?: number;
  percentageChange?: number;
  budgetRemaining?: number;
  savingsProgress?: number;
  [key: string]: unknown;
}

/**
 * Record a financial-related signal
 *
 * @param userId - User ID
 * @param signalType - Type of financial signal (e.g., 'budget_set', 'savings_goal_progress')
 * @param metadata - Additional signal metadata
 */
export function recordFinancialSignal(
  userId: string,
  signalType: FinancialSignalType,
  metadata: FinancialSignalMetadata = {}
): void {
  log.debug({ userId, signalType }, 'Recording financial signal');

  let direction: DomainSignal['direction'] = 'changed';
  let magnitude: DomainSignal['magnitude'] = 'minor';

  // Determine direction based on signal type
  if (signalType === 'spending_logged') {
    direction = 'decreased'; // Money spent
    magnitude = (metadata.amount ?? 0) > 100 ? 'moderate' : 'minor';
  } else if (signalType === 'savings_progress' || signalType === 'savings_goal_progress') {
    direction = 'increased';
    magnitude = (metadata.savingsProgress ?? metadata.percentageChange ?? 0) > 10 ? 'significant' : 'moderate';
  } else if (signalType === 'goal_achieved') {
    magnitude = 'significant';
  }

  const signal: DomainSignal = {
    domain: 'financial',
    store: 'financial',
    metric: signalType,
    direction,
    magnitude,
    timestamp: new Date(),
    metadata: {
      ...metadata,
    },
  };

  recordDomainSignal(userId, signal);
}

// ============================================================================
// HABIT SIGNALS
// ============================================================================

export interface HabitSignalData {
  type: 'completed' | 'missed' | 'streak_broken' | 'streak_milestone' | 'created' | 'paused';
  habitId?: string;
  habitName?: string;
  streakLength?: number;
  completionRate?: number;
}

/**
 * Record a habit-related signal
 */
export function recordHabitSignal(
  userId: string,
  data: HabitSignalData
): void {
  log.debug({ userId, type: data.type }, 'Recording habit signal');

  let direction: DomainSignal['direction'] = 'changed';
  let magnitude: DomainSignal['magnitude'] = 'minor';

  if (data.type === 'completed') {
    direction = 'increased';
  } else if (data.type === 'missed' || data.type === 'streak_broken') {
    direction = 'decreased';
    magnitude = 'moderate';
  } else if (data.type === 'streak_milestone') {
    direction = 'increased';
    magnitude = 'significant';
  }

  const signal: DomainSignal = {
    domain: 'habit',
    store: 'productivity',
    metric: data.type,
    direction,
    magnitude,
    timestamp: new Date(),
    metadata: {
      habitId: data.habitId,
      habitName: data.habitName,
      streakLength: data.streakLength,
      completionRate: data.completionRate,
    },
  };

  recordDomainSignal(userId, signal);
}

// ============================================================================
// WELLNESS SIGNALS
// ============================================================================

export interface WellnessSignalData {
  type: 'mood_logged' | 'sleep_logged' | 'exercise_logged' | 'stress_detected' | 'energy_low';
  value?: string | number;
  trend?: 'improving' | 'declining' | 'stable';
}

/**
 * Record a wellness-related signal
 */
export function recordWellnessSignal(
  userId: string,
  data: WellnessSignalData
): void {
  log.debug({ userId, type: data.type }, 'Recording wellness signal');

  let direction: DomainSignal['direction'] = 'changed';
  let magnitude: DomainSignal['magnitude'] = 'minor';

  if (data.trend === 'improving') {
    direction = 'increased';
  } else if (data.trend === 'declining') {
    direction = 'decreased';
    magnitude = 'moderate';
  }

  if (data.type === 'stress_detected' || data.type === 'energy_low') {
    magnitude = 'significant';
  }

  const signal: DomainSignal = {
    domain: 'wellness',
    store: 'health',
    metric: data.type,
    direction,
    magnitude,
    timestamp: new Date(),
    metadata: {
      value: data.value,
      trend: data.trend,
    },
  };

  recordDomainSignal(userId, signal);
}

// ============================================================================
// RELATIONSHIP SIGNALS
// ============================================================================

export interface RelationshipSignalData {
  type: 'contact_added' | 'interaction_logged' | 'relationship_deepened' | 'conflict_detected';
  personName?: string;
  relationshipType?: string;
  interactionQuality?: 'positive' | 'neutral' | 'negative';
}

/**
 * Record a relationship-related signal
 */
export function recordRelationshipSignal(
  userId: string,
  data: RelationshipSignalData
): void {
  log.debug({ userId, type: data.type }, 'Recording relationship signal');

  let direction: DomainSignal['direction'] = 'changed';
  let magnitude: DomainSignal['magnitude'] = 'minor';

  if (data.type === 'relationship_deepened') {
    direction = 'increased';
    magnitude = 'moderate';
  } else if (data.type === 'conflict_detected') {
    direction = 'decreased';
    magnitude = 'significant';
  }

  const signal: DomainSignal = {
    domain: 'relationships',
    store: 'contacts',
    metric: data.type,
    direction,
    magnitude,
    timestamp: new Date(),
    metadata: {
      personName: data.personName,
      relationshipType: data.relationshipType,
      interactionQuality: data.interactionQuality,
    },
  };

  recordDomainSignal(userId, signal);
}

export default {
  recordCalendarSignal,
  recordFinancialSignal,
  recordHabitSignal,
  recordWellnessSignal,
  recordRelationshipSignal,
};
