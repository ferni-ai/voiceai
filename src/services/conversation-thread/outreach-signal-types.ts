/**
 * Superhuman Outreach Intelligence - Signal Types
 *
 * Type definitions for the outreach intelligence system:
 * signal types, routing rules, and action types.
 *
 * @module services/conversation-thread/outreach-signal-types
 */

import type { PersonaId } from '../../personas/types.js';

// ============================================================================
// SIGNAL TYPES - What we're listening for
// ============================================================================

export interface SuperhumanSignal {
  type: SignalType;
  severity: 'low' | 'medium' | 'high' | 'urgent';
  source: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

export type SignalType =
  // CRISIS & DISTRESS SIGNALS
  | 'crisis_detected'
  | 'emotional_peak'
  | 'voice_distress'
  | 'voice_biomarker_alert'

  // PATTERN & PREDICTION SIGNALS
  | 'predictive_pattern_match'
  | 'temporal_anomaly'
  | 'values_conflict'
  | 'capacity_depleted'
  | 'capacity_low'
  | 'blind_spot_pattern'
  | 'mood_prediction_low'
  | 'energy_wave_optimal'
  | 'energy_wave_avoid'

  // LIFE EVENT SIGNALS
  | 'life_event_detected'
  | 'life_chapter_change'
  | 'open_loop_high_priority'
  | 'commitment_milestone'
  | 'dream_reignited'
  | 'relationship_reconnect'
  | 'seasonal_date_upcoming'
  | 'seasonal_pattern_match'

  // BETTER THAN HUMAN V1 SIGNALS
  | 'silence_processing'
  | 'silence_invitation'
  | 'contradiction_detected'
  | 'receptivity_high'
  | 'receptivity_low'
  | 'future_trajectory_concern'

  // BETTER THAN HUMAN V2 SIGNALS
  | 'social_battery_depleted'
  | 'social_battery_recharged'
  | 'conflict_unresolved'
  | 'calendar_prep_needed'
  | 'vague_emotion_detected'
  | 'recovery_needed'
  | 'recovery_check_in'
  | 'inside_joke_opportunity'
  | 'protective_boundary_crossed'

  // DOMAIN SIGNALS (Habits, Tasks, Financial, Health)
  | 'habit_streak_broken'
  | 'habit_streak_milestone'
  | 'task_overdue'
  | 'financial_goal_progress'
  | 'financial_bill_due'
  | 'sleep_quality_poor'
  | 'calendar_busy_day'

  // SEMANTIC INTELLIGENCE SIGNALS (V3)
  | 'correlation_discovered'
  | 'emotional_trajectory_shift'
  | 'relational_tension'
  | 'counterfactual_regret'
  | 'growth_pattern_detected'
  | 'cross_session_thread_found'

  // POSITIVE SIGNALS
  | 'breakthrough_moment'
  | 'streak_milestone'
  | 'goal_achieved';

// ============================================================================
// INTELLIGENT ROUTING RULES
// ============================================================================

export interface OutreachRule {
  name: string;
  description: string;
  triggers: {
    signalTypes: SignalType[];
    operator: 'AND' | 'OR';
    minSeverity?: 'low' | 'medium' | 'high' | 'urgent';
  };
  conditions?: {
    relationshipStage?: ('established' | 'deep')[];
    timeOfDay?: 'any' | 'quiet_hours_ok' | 'business_hours';
    recentOutreach?: 'none_in_24h' | 'none_in_week' | 'any';
  };
  action: OutreachAction;
  priority: number;
}

export type OutreachAction =
  | { type: 'full_team_support'; situation: string }
  | { type: 'team_celebration'; achievement: string }
  | { type: 'peter_ferni_insight'; topic: string; insight: string }
  | { type: 'maya_jordan_planning'; eventName: string }
  | { type: 'team_roundtable'; personas: PersonaId[]; topic: string; reason: string }
  | { type: 'ferni_check_in'; reason: string }
  | { type: 'maya_habit_support'; habitName: string; isEncouragement: boolean };
