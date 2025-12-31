/**
 * Superhuman Outreach Intelligence
 *
 * This is the BRAIN that makes Ferni "better than human."
 *
 * No human friend can:
 * - Track 19 different signals about your life
 * - Detect when Sunday evening anxiety is hitting someone with low energy
 * - Notice you haven't mentioned your dream in 6 months
 * - Coordinate 6 specialists to reach out together
 *
 * This module connects the superhuman services to the group outreach system,
 * creating genuinely intelligent proactive care.
 *
 * @module services/conversation-thread/superhuman-outreach-intelligence
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { PersonaId } from '../../personas/types.js';
import {
  teamCelebrationOutreach,
  fullTeamSupportOutreach,
  mayaJordanPlanningOutreach,
  peterFerniInsightOutreach,
  initiateTeamRoundtableCall,
  type GroupOutreachResult,
} from './group-outreach.js';
import { ferniCheckInOutreach, mayaHabitOutreach } from './outbound-initiator.js';

const log = createLogger({ module: 'SuperhumanOutreachIntelligence' });

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
  // =========================================================================
  // CRISIS & DISTRESS SIGNALS
  // =========================================================================
  | 'crisis_detected'
  | 'emotional_peak'
  | 'voice_distress'
  | 'voice_biomarker_alert' // NEW: Wellness detected from voice patterns

  // =========================================================================
  // PATTERN & PREDICTION SIGNALS
  // =========================================================================
  | 'predictive_pattern_match'
  | 'temporal_anomaly'
  | 'values_conflict'
  | 'capacity_depleted'
  | 'capacity_low' // NEW: Getting low, not depleted yet
  | 'blind_spot_pattern' // NEW: Pattern user can't see themselves
  | 'mood_prediction_low' // NEW: Predicted low mood day
  | 'energy_wave_optimal' // NEW: Best time for outreach
  | 'energy_wave_avoid' // NEW: Bad time for outreach

  // =========================================================================
  // LIFE EVENT SIGNALS
  // =========================================================================
  | 'life_event_detected'
  | 'life_chapter_change' // NEW: Major life chapter transition
  | 'open_loop_high_priority'
  | 'commitment_milestone'
  | 'dream_reignited'
  | 'relationship_reconnect'
  | 'seasonal_date_upcoming' // NEW: Anniversary, birthday, etc.
  | 'seasonal_pattern_match' // NEW: Yearly pattern detected

  // =========================================================================
  // BETTER THAN HUMAN V1 SIGNALS
  // =========================================================================
  | 'silence_processing' // NEW: User needs processing time
  | 'silence_invitation' // NEW: User wants us to speak
  | 'contradiction_detected' // NEW: Holding opposing emotions
  | 'receptivity_high' // NEW: Good time to surface topics
  | 'receptivity_low' // NEW: Not receptive now
  | 'future_trajectory_concern' // NEW: Future self letter warning

  // =========================================================================
  // BETTER THAN HUMAN V2 SIGNALS
  // =========================================================================
  | 'social_battery_depleted' // NEW: Peopled out
  | 'social_battery_recharged' // NEW: Ready for interaction
  | 'conflict_unresolved' // NEW: Lingering conflict
  | 'calendar_prep_needed' // NEW: Stressful event coming
  | 'vague_emotion_detected' // NEW: Help name feelings
  | 'recovery_needed' // NEW: Post-event recovery
  | 'recovery_check_in' // NEW: Time for recovery check
  | 'inside_joke_opportunity' // NEW: Callback moment
  | 'protective_boundary_crossed' // NEW: Sensitive topic hit

  // =========================================================================
  // DOMAIN SIGNALS (Habits, Tasks, Financial, Health)
  // =========================================================================
  | 'habit_streak_broken' // NEW: Lost momentum
  | 'habit_streak_milestone' // NEW: 7, 30, 100 days
  | 'task_overdue' // NEW: Something important slipped
  | 'financial_goal_progress' // NEW: Savings milestone
  | 'financial_bill_due' // NEW: Bill reminder
  | 'sleep_quality_poor' // NEW: Bad sleep pattern
  | 'calendar_busy_day' // NEW: Overwhelming schedule

  // =========================================================================
  // SEMANTIC INTELLIGENCE SIGNALS (V3)
  // =========================================================================
  | 'correlation_discovered' // NEW: Cross-domain insight
  | 'emotional_trajectory_shift' // NEW: Emotional arc change
  | 'relational_tension' // NEW: Relationship semantic tension
  | 'counterfactual_regret' // NEW: Decision point regret
  | 'growth_pattern_detected' // NEW: Personal growth marker
  | 'cross_session_thread_found' // NEW: Multi-session topic

  // =========================================================================
  // POSITIVE SIGNALS
  // =========================================================================
  | 'breakthrough_moment'
  | 'streak_milestone'
  | 'goal_achieved';

// ============================================================================
// INTELLIGENT ROUTING RULES
// ============================================================================

interface OutreachRule {
  name: string;
  description: string;
  /**
   * Which signals trigger this rule.
   * Can combine with AND/OR logic.
   */
  triggers: {
    signalTypes: SignalType[];
    operator: 'AND' | 'OR';
    minSeverity?: 'low' | 'medium' | 'high' | 'urgent';
  };
  /**
   * Additional conditions that must be true.
   */
  conditions?: {
    relationshipStage?: ('established' | 'deep')[];
    timeOfDay?: 'any' | 'quiet_hours_ok' | 'business_hours';
    recentOutreach?: 'none_in_24h' | 'none_in_week' | 'any';
  };
  /**
   * What action to take.
   */
  action: OutreachAction;
  /**
   * Priority when multiple rules match.
   */
  priority: number;
}

type OutreachAction =
  | { type: 'full_team_support'; situation: string }
  | { type: 'team_celebration'; achievement: string }
  | { type: 'peter_ferni_insight'; topic: string; insight: string }
  | { type: 'maya_jordan_planning'; eventName: string }
  | { type: 'team_roundtable'; personas: PersonaId[]; topic: string; reason: string }
  | { type: 'ferni_check_in'; reason: string }
  | { type: 'maya_habit_support'; habitName: string; isEncouragement: boolean };

// ============================================================================
// THE RULES - Intelligent routing logic
// ============================================================================

const OUTREACH_RULES: OutreachRule[] = [
  // =========================================================================
  // CRISIS RESPONSES - Highest priority
  // =========================================================================
  {
    name: 'Crisis Full Team Support',
    description: 'When crisis detected, rally the whole team',
    triggers: {
      signalTypes: ['crisis_detected'],
      operator: 'OR',
      minSeverity: 'high',
    },
    conditions: {
      timeOfDay: 'quiet_hours_ok', // Crisis doesn't care about time
    },
    action: {
      type: 'full_team_support',
      situation: 'a difficult moment',
    },
    priority: 100,
  },

  {
    name: 'Voice Distress Immediate Response',
    description: 'Voice strain/tremor detected - Ferni checks in immediately',
    triggers: {
      signalTypes: ['voice_distress'],
      operator: 'OR',
      minSeverity: 'medium',
    },
    action: {
      type: 'ferni_check_in',
      reason: 'I sensed something in your voice earlier. Just wanted to check in.',
    },
    priority: 95,
  },

  // =========================================================================
  // PREDICTIVE RESPONSES - The magic of "better than human"
  // =========================================================================
  {
    name: 'Sunday Evening + Low Capacity',
    description: 'Predictive pattern (Sunday anxiety) + depleted = preemptive support',
    triggers: {
      signalTypes: ['predictive_pattern_match', 'capacity_depleted'],
      operator: 'AND',
    },
    conditions: {
      relationshipStage: ['established', 'deep'],
      recentOutreach: 'none_in_24h',
    },
    action: {
      type: 'maya_habit_support',
      habitName: 'self-care before the week starts',
      isEncouragement: true,
    },
    priority: 80,
  },

  {
    name: 'Values Conflict + Emotional Peak',
    description: 'Caught between values AND feeling it deeply = need Peter + Ferni',
    triggers: {
      signalTypes: ['values_conflict', 'emotional_peak'],
      operator: 'AND',
    },
    conditions: {
      relationshipStage: ['deep'],
    },
    action: {
      type: 'peter_ferni_insight',
      topic: 'what matters most',
      insight: 'Sometimes our values pull us in different directions. That tension is actually information.',
    },
    priority: 75,
  },

  {
    name: 'Temporal Anomaly Alert',
    description: 'User is talking at unusual time (3am?) with high emotion',
    triggers: {
      signalTypes: ['temporal_anomaly', 'emotional_peak'],
      operator: 'AND',
    },
    action: {
      type: 'ferni_check_in',
      reason: "It's late and I noticed you're still up. Everything okay?",
    },
    priority: 85,
  },

  // =========================================================================
  // LIFE EVENT RESPONSES
  // =========================================================================
  {
    name: 'Major Life Event Team Roundtable',
    description: 'Big life event = get the specialists together',
    triggers: {
      signalTypes: ['life_event_detected'],
      operator: 'OR',
      minSeverity: 'high',
    },
    conditions: {
      relationshipStage: ['established', 'deep'],
      recentOutreach: 'none_in_week',
    },
    action: {
      type: 'team_roundtable',
      personas: ['ferni', 'peter-john', 'jordan-milestones'],
      topic: 'a big life transition',
      reason: "We've been thinking about what you're going through",
    },
    priority: 70,
  },

  {
    name: 'Dream Reignition',
    description: 'Dormant dream mentioned again = bring in Jordan + Ferni',
    triggers: {
      signalTypes: ['dream_reignited'],
      operator: 'OR',
    },
    conditions: {
      relationshipStage: ['established', 'deep'],
    },
    action: {
      type: 'maya_jordan_planning',
      eventName: 'revisiting that dream you mentioned',
    },
    priority: 60,
  },

  {
    name: 'Reconnection Opportunity',
    description: 'Person not mentioned in 30+ days who matters',
    triggers: {
      signalTypes: ['relationship_reconnect'],
      operator: 'OR',
    },
    action: {
      type: 'maya_jordan_planning',
      eventName: 'reconnecting with someone important',
    },
    priority: 50,
  },

  // =========================================================================
  // CELEBRATION RESPONSES
  // =========================================================================
  {
    name: 'Breakthrough Celebration',
    description: 'User had a breakthrough - celebrate with team!',
    triggers: {
      signalTypes: ['breakthrough_moment'],
      operator: 'OR',
    },
    action: {
      type: 'team_celebration',
      achievement: 'a real breakthrough',
    },
    priority: 65,
  },

  {
    name: 'Streak Milestone',
    description: '7, 30, 100 day streaks get team celebration',
    triggers: {
      signalTypes: ['streak_milestone'],
      operator: 'OR',
    },
    action: {
      type: 'team_celebration',
      achievement: 'an incredible streak',
    },
    priority: 55,
  },

  {
    name: 'Goal Achievement',
    description: 'Goal completed = Peter + Ferni for what comes next',
    triggers: {
      signalTypes: ['goal_achieved'],
      operator: 'OR',
    },
    action: {
      type: 'peter_ferni_insight',
      topic: 'what you just accomplished',
      insight: "You did it. Let's talk about what this means for what's next.",
    },
    priority: 60,
  },

  // =========================================================================
  // COMMITMENT RESPONSES
  // =========================================================================
  {
    name: 'High Priority Open Loop',
    description: 'Something important they mentioned needs follow-up',
    triggers: {
      signalTypes: ['open_loop_high_priority'],
      operator: 'OR',
    },
    conditions: {
      recentOutreach: 'none_in_24h',
    },
    action: {
      type: 'ferni_check_in',
      reason: 'I remembered something you mentioned. How did it go?',
    },
    priority: 45,
  },

  {
    name: 'Commitment Milestone',
    description: 'Significant progress on commitment',
    triggers: {
      signalTypes: ['commitment_milestone'],
      operator: 'OR',
    },
    action: {
      type: 'team_celebration',
      achievement: 'keeping your commitment',
    },
    priority: 50,
  },

  // =========================================================================
  // BETTER THAN HUMAN V1 - NEW RULES
  // =========================================================================
  {
    name: 'Life Chapter Transition Support',
    description: 'Major life chapter change - rally the team',
    triggers: {
      signalTypes: ['life_chapter_change'],
      operator: 'OR',
      minSeverity: 'high',
    },
    conditions: {
      relationshipStage: ['established', 'deep'],
    },
    action: {
      type: 'team_roundtable',
      personas: ['ferni', 'nayan-wisdom', 'jordan-milestones'],
      topic: 'this new chapter in your life',
      reason: 'Big transitions deserve big support',
    },
    priority: 72,
  },

  {
    name: 'Seasonal Date Reminder',
    description: 'Important date coming up - Jordan + Ferni help prepare',
    triggers: {
      signalTypes: ['seasonal_date_upcoming'],
      operator: 'OR',
    },
    conditions: {
      relationshipStage: ['established', 'deep'],
      recentOutreach: 'none_in_24h',
    },
    action: {
      type: 'maya_jordan_planning',
      eventName: 'an important date coming up',
    },
    priority: 55,
  },

  {
    name: 'Seasonal Pattern Preemptive Care',
    description: 'Yearly pattern detected - preemptive support',
    triggers: {
      signalTypes: ['seasonal_pattern_match', 'capacity_low'],
      operator: 'AND',
    },
    conditions: {
      relationshipStage: ['established', 'deep'],
    },
    action: {
      type: 'ferni_check_in',
      reason: 'I noticed this time of year tends to be hard. Wanted to check in early.',
    },
    priority: 65,
  },

  {
    name: 'Emotional Contradiction Support',
    description: 'Holding opposing emotions - validate with Peter + Ferni',
    triggers: {
      signalTypes: ['contradiction_detected'],
      operator: 'OR',
      minSeverity: 'high',
    },
    action: {
      type: 'peter_ferni_insight',
      topic: 'holding two truths at once',
      insight: 'It\'s okay to feel both things. That\'s not confusion - that\'s complexity.',
    },
    priority: 62,
  },

  {
    name: 'Blind Spot Pattern Surface',
    description: 'Surface a pattern they can\'t see themselves',
    triggers: {
      signalTypes: ['blind_spot_pattern'],
      operator: 'OR',
    },
    conditions: {
      relationshipStage: ['deep'],
      recentOutreach: 'none_in_week',
    },
    action: {
      type: 'peter_ferni_insight',
      topic: 'something I\'ve been noticing',
      insight: 'I\'ve been watching a pattern and wanted to share what I see.',
    },
    priority: 40,
  },

  {
    name: 'Future Trajectory Warning',
    description: 'Concerning future trajectory - gentle intervention',
    triggers: {
      signalTypes: ['future_trajectory_concern'],
      operator: 'OR',
      minSeverity: 'high',
    },
    conditions: {
      relationshipStage: ['deep'],
    },
    action: {
      type: 'peter_ferni_insight',
      topic: 'where things might be heading',
      insight: 'I care about your future. Can we talk about some patterns I\'m seeing?',
    },
    priority: 68,
  },

  // =========================================================================
  // BETTER THAN HUMAN V2 - NEW RULES
  // =========================================================================
  {
    name: 'Voice Biomarker Alert',
    description: 'Wellness concern from voice patterns - Ferni checks in',
    triggers: {
      signalTypes: ['voice_biomarker_alert'],
      operator: 'OR',
      minSeverity: 'high',
    },
    action: {
      type: 'ferni_check_in',
      reason: 'Your voice sounded different last time. Just wanted to make sure you\'re okay.',
    },
    priority: 78,
  },

  {
    name: 'Predicted Low Mood Day',
    description: 'Mood calendar predicts a hard day - preemptive support',
    triggers: {
      signalTypes: ['mood_prediction_low'],
      operator: 'OR',
      minSeverity: 'medium',
    },
    conditions: {
      relationshipStage: ['established', 'deep'],
    },
    action: {
      type: 'maya_habit_support',
      habitName: 'self-care today',
      isEncouragement: true,
    },
    priority: 58,
  },

  {
    name: 'Social Battery Depleted',
    description: 'User is peopled out - low-key supportive message only',
    triggers: {
      signalTypes: ['social_battery_depleted'],
      operator: 'OR',
    },
    action: {
      type: 'ferni_check_in',
      reason: 'I know you\'ve had a lot of people time lately. No need to respond - just thinking of you.',
    },
    priority: 35,
  },

  {
    name: 'Unresolved Conflict Follow-up',
    description: 'Lingering conflict needs attention - Maya + Alex help',
    triggers: {
      signalTypes: ['conflict_unresolved'],
      operator: 'OR',
      minSeverity: 'high',
    },
    conditions: {
      relationshipStage: ['established', 'deep'],
      recentOutreach: 'none_in_24h',
    },
    action: {
      type: 'maya_jordan_planning',
      eventName: 'working through that situation',
    },
    priority: 52,
  },

  {
    name: 'Stressful Event Prep',
    description: 'High-stakes event coming - Maya helps prepare',
    triggers: {
      signalTypes: ['calendar_prep_needed'],
      operator: 'OR',
      minSeverity: 'high',
    },
    action: {
      type: 'maya_habit_support',
      habitName: 'prep for what\'s coming',
      isEncouragement: true,
    },
    priority: 63,
  },

  {
    name: 'Recovery Check-In',
    description: 'Time to check on recovery from hard event',
    triggers: {
      signalTypes: ['recovery_check_in'],
      operator: 'OR',
    },
    conditions: {
      recentOutreach: 'none_in_24h',
    },
    action: {
      type: 'ferni_check_in',
      reason: 'I know that was a lot. How are you feeling now?',
    },
    priority: 48,
  },

  {
    name: 'Inside Joke Callback',
    description: 'Opportunity for warm connection via shared memory',
    triggers: {
      signalTypes: ['inside_joke_opportunity'],
      operator: 'OR',
    },
    conditions: {
      relationshipStage: ['established', 'deep'],
    },
    action: {
      type: 'ferni_check_in',
      reason: 'Something reminded me of that thing we talked about... 😊',
    },
    priority: 25,
  },

  // =========================================================================
  // DOMAIN SIGNALS - NEW RULES
  // =========================================================================
  {
    name: 'Habit Streak Broken Support',
    description: 'Lost momentum on habit - Maya offers gentle support',
    triggers: {
      signalTypes: ['habit_streak_broken'],
      operator: 'OR',
      minSeverity: 'high',
    },
    conditions: {
      recentOutreach: 'none_in_24h',
    },
    action: {
      type: 'maya_habit_support',
      habitName: 'getting back on track',
      isEncouragement: true,
    },
    priority: 45,
  },

  {
    name: 'Habit Streak Celebration',
    description: 'Major streak milestone - team celebrates!',
    triggers: {
      signalTypes: ['habit_streak_milestone'],
      operator: 'OR',
      minSeverity: 'high',
    },
    action: {
      type: 'team_celebration',
      achievement: 'an amazing streak',
    },
    priority: 58,
  },

  {
    name: 'Task Overdue Nudge',
    description: 'Important task slipped - gentle reminder',
    triggers: {
      signalTypes: ['task_overdue'],
      operator: 'OR',
      minSeverity: 'high',
    },
    conditions: {
      recentOutreach: 'none_in_24h',
    },
    action: {
      type: 'maya_habit_support',
      habitName: 'tackling that important thing',
      isEncouragement: false,
    },
    priority: 42,
  },

  {
    name: 'Savings Goal Celebration',
    description: 'Financial milestone reached - celebrate!',
    triggers: {
      signalTypes: ['financial_goal_progress'],
      operator: 'OR',
      minSeverity: 'high',
    },
    action: {
      type: 'team_celebration',
      achievement: 'a financial milestone',
    },
    priority: 53,
  },

  {
    name: 'Bill Due Reminder',
    description: 'Bill coming up - Maya sends reminder',
    triggers: {
      signalTypes: ['financial_bill_due'],
      operator: 'OR',
      minSeverity: 'high',
    },
    action: {
      type: 'maya_habit_support',
      habitName: 'that bill that\'s due',
      isEncouragement: false,
    },
    priority: 38,
  },

  {
    name: 'Sleep Pattern Alert',
    description: 'Poor sleep pattern detected - check in',
    triggers: {
      signalTypes: ['sleep_quality_poor'],
      operator: 'OR',
      minSeverity: 'high',
    },
    conditions: {
      recentOutreach: 'none_in_24h',
    },
    action: {
      type: 'ferni_check_in',
      reason: 'I\'ve noticed some rough nights. How can I support you?',
    },
    priority: 47,
  },

  {
    name: 'Busy Day Support',
    description: 'Overwhelming schedule ahead - preemptive support',
    triggers: {
      signalTypes: ['calendar_busy_day'],
      operator: 'OR',
      minSeverity: 'high',
    },
    action: {
      type: 'ferni_check_in',
      reason: 'Big day ahead. You\'ve got this. I\'m here if you need anything.',
    },
    priority: 40,
  },

  // =========================================================================
  // SEMANTIC INTELLIGENCE V3 - NEW RULES
  // =========================================================================
  {
    name: 'Cross-Domain Insight',
    description: 'Discovered correlation between domains - Peter shares insight',
    triggers: {
      signalTypes: ['correlation_discovered'],
      operator: 'OR',
      minSeverity: 'high',
    },
    conditions: {
      relationshipStage: ['deep'],
    },
    action: {
      type: 'peter_ferni_insight',
      topic: 'a connection I noticed',
      insight: 'I found something interesting connecting different parts of your life.',
    },
    priority: 55,
  },

  {
    name: 'Emotional Decline Intervention',
    description: 'Emotional trajectory declining - team support',
    triggers: {
      signalTypes: ['emotional_trajectory_shift'],
      operator: 'OR',
      minSeverity: 'high',
    },
    conditions: {
      relationshipStage: ['established', 'deep'],
    },
    action: {
      type: 'full_team_support',
      situation: 'a difficult stretch',
    },
    priority: 73,
  },

  {
    name: 'Relational Tension Support',
    description: 'Relationship tension detected - Maya + Alex help',
    triggers: {
      signalTypes: ['relational_tension'],
      operator: 'OR',
      minSeverity: 'high',
    },
    action: {
      type: 'maya_jordan_planning',
      eventName: 'navigating that relationship',
    },
    priority: 54,
  },

  {
    name: 'Decision Regret Processing',
    description: 'User processing regret - Peter + Nayan wisdom',
    triggers: {
      signalTypes: ['counterfactual_regret'],
      operator: 'OR',
      minSeverity: 'high',
    },
    conditions: {
      relationshipStage: ['deep'],
    },
    action: {
      type: 'peter_ferni_insight',
      topic: 'the path not taken',
      insight: 'Sometimes looking at what we didn\'t choose helps clarify what we actually want.',
    },
    priority: 50,
  },

  {
    name: 'Growth Pattern Celebration',
    description: 'Positive growth detected - celebrate!',
    triggers: {
      signalTypes: ['growth_pattern_detected'],
      operator: 'OR',
      minSeverity: 'high',
    },
    action: {
      type: 'team_celebration',
      achievement: 'real growth',
    },
    priority: 57,
  },

  {
    name: 'Multi-Session Thread Resolution',
    description: 'Recurring topic needs resolution - team helps',
    triggers: {
      signalTypes: ['cross_session_thread_found'],
      operator: 'OR',
      minSeverity: 'high',
    },
    conditions: {
      relationshipStage: ['established', 'deep'],
    },
    action: {
      type: 'team_roundtable',
      personas: ['ferni', 'peter-john', 'maya-habits'],
      topic: 'something that keeps coming up',
      reason: 'Let\'s finally work through this together',
    },
    priority: 48,
  },

  // =========================================================================
  // TIMING GATING RULES (These PREVENT outreach, not trigger it)
  // =========================================================================
  {
    name: 'Low Receptivity Block',
    description: 'User not receptive - delay any outreach',
    triggers: {
      signalTypes: ['receptivity_low', 'energy_wave_avoid', 'silence_processing'],
      operator: 'OR',
    },
    action: {
      type: 'ferni_check_in',
      reason: '__GATE_DO_NOT_REACH_OUT__', // Special marker for gating
    },
    priority: 200, // Highest priority - blocks other rules
  },
];

// ============================================================================
// TIMING INTELLIGENCE
// ============================================================================

/** Default quiet hours: 10pm - 8am */
const DEFAULT_QUIET_HOURS_START = 22;
const DEFAULT_QUIET_HOURS_END = 8;

/** Minimum hours between non-urgent outreach */
const MIN_HOURS_BETWEEN_OUTREACH = 4;

/**
 * Check if it's an appropriate time for outreach.
 *
 * This implements "Better Than Human" timing - we respect quiet hours
 * and don't spam users, but we override for genuine emergencies.
 */
function checkTimingIntelligence(context: {
  lastOutreachAt?: Date;
  quietHoursStart?: number;
  quietHoursEnd?: number;
}): { canOutreach: boolean; reason?: string } {
  const now = new Date();
  const currentHour = now.getHours();

  // 1. Check quiet hours
  const quietStart = context.quietHoursStart ?? DEFAULT_QUIET_HOURS_START;
  const quietEnd = context.quietHoursEnd ?? DEFAULT_QUIET_HOURS_END;

  const isQuietHours = quietStart > quietEnd
    ? currentHour >= quietStart || currentHour < quietEnd // e.g., 22-8 crosses midnight
    : currentHour >= quietStart && currentHour < quietEnd;

  if (isQuietHours) {
    return {
      canOutreach: false,
      reason: `Quiet hours (${quietStart}:00 - ${quietEnd}:00)`,
    };
  }

  // 2. Check cooldown period
  if (context.lastOutreachAt) {
    const hoursSinceLastOutreach =
      (now.getTime() - context.lastOutreachAt.getTime()) / (1000 * 60 * 60);

    if (hoursSinceLastOutreach < MIN_HOURS_BETWEEN_OUTREACH) {
      return {
        canOutreach: false,
        reason: `Recent outreach (${hoursSinceLastOutreach.toFixed(1)}h ago, min ${MIN_HOURS_BETWEEN_OUTREACH}h)`,
      };
    }
  }

  // 3. Check day of week - be more conservative on weekends
  const dayOfWeek = now.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  if (isWeekend && (currentHour < 10 || currentHour > 20)) {
    return {
      canOutreach: false,
      reason: 'Weekend quiet time',
    };
  }

  return { canOutreach: true };
}

/**
 * Get optimal outreach time for a user.
 *
 * Returns a future time when outreach would be appropriate,
 * useful for scheduling deferred messages.
 */
export function getOptimalOutreachTime(context: {
  quietHoursStart?: number;
  quietHoursEnd?: number;
  timezone?: string;
}): Date {
  const now = new Date();
  const currentHour = now.getHours();
  const quietEnd = context.quietHoursEnd ?? DEFAULT_QUIET_HOURS_END;

  // If in quiet hours, schedule for end of quiet hours
  const quietStart = context.quietHoursStart ?? DEFAULT_QUIET_HOURS_START;
  const isQuietHours = quietStart > quietEnd
    ? currentHour >= quietStart || currentHour < quietEnd
    : currentHour >= quietStart && currentHour < quietEnd;

  if (isQuietHours) {
    const optimalTime = new Date(now);
    if (currentHour >= quietStart) {
      // It's late night, schedule for tomorrow morning
      optimalTime.setDate(optimalTime.getDate() + 1);
    }
    optimalTime.setHours(quietEnd + 1, 0, 0, 0); // 1 hour after quiet hours end
    return optimalTime;
  }

  // Not in quiet hours, can outreach now
  return now;
}

// ============================================================================
// SIGNAL PROCESSING
// ============================================================================

/**
 * Process incoming superhuman signals and determine if outreach is warranted.
 *
 * This is the core "intelligence" - it receives signals from all 19 superhuman
 * services and decides whether/how to reach out.
 */
export async function processSuperhumanSignals(
  userId: string,
  signals: SuperhumanSignal[],
  userContext: {
    relationshipStage: 'new' | 'building' | 'established' | 'deep';
    lastOutreachAt?: Date;
    preferredName?: string;
    quietHoursStart?: number;
    quietHoursEnd?: number;
  }
): Promise<GroupOutreachResult | null> {
  if (signals.length === 0) return null;

  log.debug(
    { userId, signalCount: signals.length, signalTypes: signals.map((s) => s.type) },
    '🧠 Processing superhuman signals'
  );

  // =========================================================================
  // TIMING INTELLIGENCE: Check quiet hours (unless urgent/crisis)
  // =========================================================================
  const hasUrgentSignal = signals.some((s) => s.severity === 'urgent');
  const hasCrisis = signals.some((s) => s.type === 'crisis_detected');

  if (!hasUrgentSignal && !hasCrisis) {
    const timing = checkTimingIntelligence(userContext);
    if (!timing.canOutreach) {
      log.debug(
        { userId, reason: timing.reason },
        '⏰ Outreach deferred due to timing'
      );
      return null;
    }
  }

  // =========================================================================
  // GATING INTELLIGENCE: Check for "don't reach out now" signals
  // =========================================================================
  const hasGatingSignal = signals.some((s) =>
    ['receptivity_low', 'energy_wave_avoid', 'silence_processing', 'social_battery_depleted'].includes(s.type)
  );

  // High receptivity = prefer to reach out now
  const hasHighReceptivity = signals.some((s) => s.type === 'receptivity_high');
  const hasOptimalEnergy = signals.some((s) => s.type === 'energy_wave_optimal');

  // If user has gating signals and no urgent signals, defer outreach
  if (hasGatingSignal && !hasUrgentSignal && !hasCrisis) {
    // Unless we have positive gating override
    if (!hasHighReceptivity && !hasOptimalEnergy) {
      log.debug(
        { userId, gatingSignals: signals.filter(s => ['receptivity_low', 'energy_wave_avoid', 'silence_processing'].includes(s.type)).map(s => s.type) },
        '🚫 Outreach blocked by gating signals'
      );
      return null;
    }
  }

  // Find matching rules
  const matchingRules = OUTREACH_RULES.filter((rule) => {
    // Check signal triggers
    const signalTypesPresent = signals.map((s) => s.type);
    const triggersMet =
      rule.triggers.operator === 'AND'
        ? rule.triggers.signalTypes.every((t) => signalTypesPresent.includes(t))
        : rule.triggers.signalTypes.some((t) => signalTypesPresent.includes(t));

    if (!triggersMet) return false;

    // Check severity
    if (rule.triggers.minSeverity) {
      const severityOrder = { low: 1, medium: 2, high: 3, urgent: 4 };
      const minLevel = severityOrder[rule.triggers.minSeverity];
      const hasMinSeverity = signals.some((s) => severityOrder[s.severity] >= minLevel);
      if (!hasMinSeverity) return false;
    }

    // Check conditions
    if (rule.conditions) {
      // Relationship stage
      if (
        rule.conditions.relationshipStage &&
        !rule.conditions.relationshipStage.includes(
          userContext.relationshipStage as 'established' | 'deep'
        )
      ) {
        return false;
      }

      // Recent outreach
      if (rule.conditions.recentOutreach && userContext.lastOutreachAt) {
        const hoursSinceOutreach =
          (Date.now() - userContext.lastOutreachAt.getTime()) / (1000 * 60 * 60);
        if (rule.conditions.recentOutreach === 'none_in_24h' && hoursSinceOutreach < 24) {
          return false;
        }
        if (rule.conditions.recentOutreach === 'none_in_week' && hoursSinceOutreach < 168) {
          return false;
        }
      }

      // Time of day
      if (rule.conditions.timeOfDay === 'business_hours') {
        const hour = new Date().getHours();
        if (hour < 9 || hour > 18) return false;
      }
    }

    return true;
  });

  if (matchingRules.length === 0) {
    log.debug({ userId }, 'No matching outreach rules');
    return null;
  }

  // Sort by priority and take the highest
  matchingRules.sort((a, b) => b.priority - a.priority);
  const selectedRule = matchingRules[0];

  log.info(
    {
      userId,
      ruleName: selectedRule.name,
      priority: selectedRule.priority,
      triggerSignals: signals.map((s) => s.type),
    },
    '🎯 Selected outreach rule'
  );

  // Execute the action
  return await executeOutreachAction(userId, selectedRule.action, userContext);
}

/**
 * Execute a specific outreach action.
 */
async function executeOutreachAction(
  userId: string,
  action: OutreachAction,
  context: { preferredName?: string }
): Promise<GroupOutreachResult | null> {
  try {
    switch (action.type) {
      case 'full_team_support':
        return await fullTeamSupportOutreach(userId, {
          situation: action.situation,
          preferredName: context.preferredName,
        });

      case 'team_celebration':
        return await teamCelebrationOutreach(userId, {
          achievement: action.achievement,
          preferredName: context.preferredName,
        });

      case 'peter_ferni_insight':
        return await peterFerniInsightOutreach(userId, {
          topic: action.topic,
          insight: action.insight,
          preferredName: context.preferredName,
        });

      case 'maya_jordan_planning':
        return await mayaJordanPlanningOutreach(userId, {
          eventName: action.eventName,
          preferredName: context.preferredName,
        });

      case 'team_roundtable':
        return await initiateTeamRoundtableCall(userId, {
          personas: action.personas,
          topic: action.topic,
          reason: action.reason,
          preferredName: context.preferredName,
        });

      case 'ferni_check_in':
        const ferniResult = await ferniCheckInOutreach(userId, {
          reason: action.reason,
        });
        // Convert OutreachResult to GroupOutreachResult format
        return {
          success: ferniResult.success,
          outreachId: ferniResult.outreachId,
          threadId: ferniResult.threadId,
          channel: ferniResult.channel,
          message: ferniResult.message,
          personas: ['ferni'],
          error: ferniResult.error,
        };

      case 'maya_habit_support':
        const mayaResult = await mayaHabitOutreach(userId, {
          habitName: action.habitName,
          isEncouragement: action.isEncouragement,
        });
        return {
          success: mayaResult.success,
          outreachId: mayaResult.outreachId,
          threadId: mayaResult.threadId,
          channel: mayaResult.channel,
          message: mayaResult.message,
          personas: ['maya-habits'],
          error: mayaResult.error,
        };

      default:
        log.warn({ action }, 'Unknown outreach action type');
        return null;
    }
  } catch (error) {
    log.error({ error: String(error), userId, action }, 'Failed to execute outreach action');
    return null;
  }
}

// ============================================================================
// SIGNAL GENERATORS - Convert superhuman service outputs to signals
// ============================================================================

/**
 * Generate signals from crisis detection.
 */
export function signalFromCrisis(crisisData: {
  type: string;
  severity: 'low' | 'moderate' | 'high' | 'severe';
  context?: string;
}): SuperhumanSignal {
  return {
    type: 'crisis_detected',
    severity: crisisData.severity === 'severe' ? 'urgent' : crisisData.severity === 'high' ? 'high' : 'medium',
    source: 'emotional-first-aid',
    data: crisisData,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from predictive coaching.
 */
export function signalFromPrediction(prediction: {
  patternId: string;
  confidence: number;
  timing: string;
  context?: string;
}): SuperhumanSignal {
  return {
    type: 'predictive_pattern_match',
    severity: prediction.confidence > 0.8 ? 'high' : prediction.confidence > 0.5 ? 'medium' : 'low',
    source: 'predictive-coaching',
    data: prediction,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from capacity guardian.
 */
export function signalFromCapacity(capacity: {
  level: 'depleted' | 'low' | 'moderate' | 'good' | 'high';
  burnoutRisk: boolean;
  indicators: string[];
}): SuperhumanSignal | null {
  if (capacity.level !== 'depleted' && capacity.level !== 'low') return null;

  return {
    type: 'capacity_depleted',
    severity: capacity.burnoutRisk ? 'high' : 'medium',
    source: 'capacity-guardian',
    data: capacity,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from values alignment.
 */
export function signalFromValuesConflict(conflict: {
  statedValue: string;
  demonstratedValue: string;
  tension: string;
}): SuperhumanSignal {
  return {
    type: 'values_conflict',
    severity: 'medium',
    source: 'values-alignment',
    data: conflict,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from open loops.
 */
export function signalFromOpenLoop(loop: {
  type: string;
  content: string;
  priority: number;
}): SuperhumanSignal | null {
  if (loop.priority < 3) return null; // Only high priority loops

  return {
    type: loop.type === 'life_event' ? 'life_event_detected' : 'open_loop_high_priority',
    severity: loop.priority >= 4 ? 'high' : 'medium',
    source: 'open-loops',
    data: loop,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from temporal patterns.
 */
export function signalFromTemporalAnomaly(anomaly: {
  description: string;
  unusualBehavior: string;
}): SuperhumanSignal {
  return {
    type: 'temporal_anomaly',
    severity: 'medium',
    source: 'temporal-patterns',
    data: anomaly,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from voice prosody analysis.
 */
export function signalFromVoiceDistress(voice: {
  hasStrain: boolean;
  hasTremor: boolean;
  arousal: number;
  valence: number;
}): SuperhumanSignal | null {
  if (!voice.hasStrain && !voice.hasTremor && voice.arousal < 0.7) return null;

  return {
    type: 'voice_distress',
    severity: voice.hasStrain && voice.hasTremor ? 'high' : 'medium',
    source: 'voice-prosody',
    data: voice,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from dream keeper.
 */
export function signalFromDreamReignition(dream: {
  dreamText: string;
  dormantDays: number;
  mentionedAgain: boolean;
}): SuperhumanSignal | null {
  if (!dream.mentionedAgain || dream.dormantDays < 30) return null;

  return {
    type: 'dream_reignited',
    severity: dream.dormantDays > 180 ? 'high' : 'medium',
    source: 'dream-keeper',
    data: dream,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from relationship milestones.
 */
export function signalFromMilestone(milestone: {
  type: 'duration' | 'conversations' | 'trust' | 'breakthrough' | 'growth';
  title: string;
  isSignificant: boolean;
}): SuperhumanSignal | null {
  if (!milestone.isSignificant) return null;

  const isMajor = ['100 Conversations', 'One Year', 'Six Months'].includes(milestone.title);

  return {
    type: milestone.type === 'breakthrough' ? 'breakthrough_moment' : 'commitment_milestone',
    severity: isMajor ? 'high' : 'medium',
    source: 'relationship-milestones',
    data: milestone,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from habit streaks.
 */
export function signalFromStreak(streak: {
  habitName: string;
  streakDays: number;
  isRecord: boolean;
}): SuperhumanSignal | null {
  // Celebrate 7, 30, 100 day streaks or personal records
  const isMilestone = [7, 30, 100].includes(streak.streakDays) || streak.isRecord;
  if (!isMilestone) return null;

  return {
    type: 'streak_milestone',
    severity: streak.streakDays >= 30 || streak.isRecord ? 'high' : 'medium',
    source: 'habit-tracking',
    data: streak,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from goal completion.
 */
export function signalFromGoalAchieved(goal: {
  goalId: string;
  goalTitle: string;
  completionDate: Date;
  importance: 'low' | 'medium' | 'high';
}): SuperhumanSignal {
  return {
    type: 'goal_achieved',
    severity: goal.importance,
    source: 'goal-tracking',
    data: goal,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from relationship network.
 */
export function signalFromReconnection(reconnect: {
  personName: string;
  daysSinceLastMention: number;
  importance: number;
}): SuperhumanSignal | null {
  if (reconnect.daysSinceLastMention < 30 || reconnect.importance < 0.5) return null;

  return {
    type: 'relationship_reconnect',
    severity: reconnect.daysSinceLastMention > 90 ? 'high' : 'medium',
    source: 'relationship-network',
    data: reconnect,
    timestamp: new Date(),
  };
}

// ============================================================================
// BETTER THAN HUMAN V1 SIGNAL GENERATORS
// ============================================================================

/**
 * Generate signals from life narrative chapter changes.
 */
export function signalFromLifeChapter(chapter: {
  chapterType: string;
  title: string;
  isNewChapter: boolean;
  significance: 'minor' | 'moderate' | 'major';
}): SuperhumanSignal | null {
  if (!chapter.isNewChapter || chapter.significance === 'minor') return null;

  return {
    type: 'life_chapter_change',
    severity: chapter.significance === 'major' ? 'high' : 'medium',
    source: 'life-narrative',
    data: chapter,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from seasonal awareness.
 */
export function signalFromSeasonalDate(date: {
  name: string;
  daysUntil: number;
  dateType: 'anniversary' | 'birthday' | 'memorial' | 'custom';
  importance: number;
}): SuperhumanSignal | null {
  // Alert 7 days before, or 1 day for less important
  const threshold = date.importance > 0.7 ? 7 : 1;
  if (date.daysUntil > threshold || date.daysUntil < 0) return null;

  return {
    type: 'seasonal_date_upcoming',
    severity: date.daysUntil <= 1 ? 'high' : 'medium',
    source: 'seasonal-awareness',
    data: date,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from seasonal pattern detection.
 */
export function signalFromSeasonalPattern(pattern: {
  patternType: string;
  currentSeason: string;
  userTendency: string;
  confidence: number;
}): SuperhumanSignal | null {
  if (pattern.confidence < 0.6) return null;

  return {
    type: 'seasonal_pattern_match',
    severity: pattern.confidence > 0.8 ? 'high' : 'medium',
    source: 'seasonal-awareness',
    data: pattern,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from silence interpreter.
 */
export function signalFromSilence(silence: {
  silenceType: 'processing' | 'invitation' | 'thinking' | 'resistance' | 'emotional';
  duration: number;
  context?: string;
}): SuperhumanSignal | null {
  if (silence.silenceType !== 'processing' && silence.silenceType !== 'invitation') return null;

  return {
    type: silence.silenceType === 'processing' ? 'silence_processing' : 'silence_invitation',
    severity: 'low',
    source: 'silence-interpreter',
    data: silence,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from contradiction comfort.
 */
export function signalFromContradiction(contradiction: {
  emotions: [string, string];
  intensity: number;
  validated: boolean;
}): SuperhumanSignal | null {
  if (contradiction.intensity < 0.5) return null;

  return {
    type: 'contradiction_detected',
    severity: contradiction.intensity > 0.8 ? 'high' : 'medium',
    source: 'contradiction-comfort',
    data: contradiction,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from perfect timing / receptivity.
 */
export function signalFromReceptivity(receptivity: {
  score: number;
  factors: string[];
  bestTopics?: string[];
  avoidTopics?: string[];
}): SuperhumanSignal | null {
  if (receptivity.score >= 0.7) {
    return {
      type: 'receptivity_high',
      severity: 'low',
      source: 'perfect-timing',
      data: receptivity,
      timestamp: new Date(),
    };
  }
  if (receptivity.score <= 0.3) {
    return {
      type: 'receptivity_low',
      severity: 'low',
      source: 'perfect-timing',
      data: receptivity,
      timestamp: new Date(),
    };
  }
  return null;
}

/**
 * Generate signals from pattern mirror (blind spots).
 */
export function signalFromBlindSpot(pattern: {
  patternType: 'topic_energy' | 'cyclical' | 'fading' | 'mismatch';
  description: string;
  confidence: number;
  surfaceable: boolean;
}): SuperhumanSignal | null {
  if (!pattern.surfaceable || pattern.confidence < 0.7) return null;

  return {
    type: 'blind_spot_pattern',
    severity: 'medium',
    source: 'pattern-mirror',
    data: pattern,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from future self projection.
 */
export function signalFromFutureTrajectory(trajectory: {
  timeframe: '3_months' | '1_year' | '5_years';
  concern: string;
  positivePatterns: string[];
  concerningPatterns: string[];
}): SuperhumanSignal | null {
  if (trajectory.concerningPatterns.length === 0) return null;

  return {
    type: 'future_trajectory_concern',
    severity: trajectory.concerningPatterns.length > 2 ? 'high' : 'medium',
    source: 'future-self',
    data: trajectory,
    timestamp: new Date(),
  };
}

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
  if (!negativeMoods.includes(prediction.predictedMood.toLowerCase()) || prediction.confidence < 0.6) {
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
    severity: event.difficulty === 'high_stakes' ? 'high' : event.difficulty === 'challenging' ? 'medium' : 'low',
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
    if (milestones.some(m => Math.abs((event.progress ?? 0) - m) < 0.05)) {
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
    severity: trajectory.direction === 'declining' && trajectory.weeklyTrend < -0.5 ? 'high' : 'medium',
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

// ============================================================================
// SIGNAL ACCUMULATOR - Collect signals over time
// ============================================================================

/** In-memory signal accumulator per user session */
const sessionSignals = new Map<string, SuperhumanSignal[]>();

/**
 * Accumulate a signal for later processing.
 * Signals are collected during a session and processed periodically.
 */
export function accumulateSignal(userId: string, signal: SuperhumanSignal): void {
  const existing = sessionSignals.get(userId) || [];

  // Dedupe by type within 5 minutes
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  const filtered = existing.filter(
    (s) => s.timestamp.getTime() > fiveMinutesAgo || s.type !== signal.type
  );

  filtered.push(signal);

  // Keep only last 20 signals per user
  if (filtered.length > 20) {
    filtered.shift();
  }

  sessionSignals.set(userId, filtered);

  log.debug(
    { userId, signalType: signal.type, totalSignals: filtered.length },
    '🧠 Signal accumulated'
  );
}

/**
 * Get accumulated signals for a user (and optionally clear them).
 */
export function getAccumulatedSignals(userId: string, clear = false): SuperhumanSignal[] {
  const signals = sessionSignals.get(userId) || [];
  if (clear) {
    sessionSignals.delete(userId);
  }
  return signals;
}

/**
 * Process accumulated signals at end of session or periodically.
 * This is the main entry point for intelligent outreach decisions.
 */
export async function processAccumulatedSignals(
  userId: string,
  userContext: {
    relationshipStage: 'new' | 'building' | 'established' | 'deep';
    lastOutreachAt?: Date;
    preferredName?: string;
  }
): Promise<GroupOutreachResult | null> {
  const signals = getAccumulatedSignals(userId, true);

  if (signals.length === 0) {
    return null;
  }

  log.info(
    { userId, signalCount: signals.length },
    '🧠 Processing accumulated signals at session end'
  );

  return processSuperhumanSignals(userId, signals, userContext);
}

// ============================================================================
// INTEGRATION HELPERS - Wire into existing services
// ============================================================================

/**
 * Call this from semantic intelligence integration to accumulate signals.
 * Should be called with the results of each superhuman service.
 */
export async function integrateWithSemanticIntelligence(
  userId: string,
  turnData: {
    crisisDetected?: { type: string; severity: 'low' | 'moderate' | 'high' | 'severe' };
    capacityLevel?: { level: 'depleted' | 'low' | 'moderate' | 'good' | 'high'; burnoutRisk: boolean; indicators: string[] };
    valuesConflict?: { statedValue: string; demonstratedValue: string; tension: string };
    openLoops?: Array<{ type: string; content: string; priority: number }>;
    temporalAnomaly?: { description: string; unusualBehavior: string };
    voiceDistress?: { hasStrain: boolean; hasTremor: boolean; arousal: number; valence: number };
    emotionalPeak?: { emotion: string; intensity: number };
  }
): Promise<void> {
  // Convert each detection to a signal and accumulate
  if (turnData.crisisDetected) {
    accumulateSignal(userId, signalFromCrisis(turnData.crisisDetected));
  }

  if (turnData.capacityLevel) {
    const signal = signalFromCapacity(turnData.capacityLevel);
    if (signal) accumulateSignal(userId, signal);
  }

  if (turnData.valuesConflict) {
    accumulateSignal(userId, signalFromValuesConflict(turnData.valuesConflict));
  }

  if (turnData.openLoops) {
    for (const loop of turnData.openLoops) {
      const signal = signalFromOpenLoop(loop);
      if (signal) accumulateSignal(userId, signal);
    }
  }

  if (turnData.temporalAnomaly) {
    accumulateSignal(userId, signalFromTemporalAnomaly(turnData.temporalAnomaly));
  }

  if (turnData.voiceDistress) {
    const signal = signalFromVoiceDistress(turnData.voiceDistress);
    if (signal) accumulateSignal(userId, signal);
  }

  if (turnData.emotionalPeak && turnData.emotionalPeak.intensity > 0.8) {
    accumulateSignal(userId, {
      type: 'emotional_peak',
      severity: turnData.emotionalPeak.intensity > 0.9 ? 'high' : 'medium',
      source: 'emotion-detection',
      data: turnData.emotionalPeak,
      timestamp: new Date(),
    });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { OUTREACH_RULES };
