/**
 * Superhuman Outreach Intelligence - Routing Rules
 *
 * Static rule definitions that map signal combinations
 * to outreach actions. Pure data, no runtime logic.
 *
 * @module services/conversation-thread/outreach-rules
 */

import type { OutreachRule } from './outreach-signal-types.js';

// ============================================================================
// THE RULES - Intelligent routing logic
// ============================================================================

export const OUTREACH_RULES: OutreachRule[] = [
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
      timeOfDay: 'quiet_hours_ok',
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
      insight:
        'Sometimes our values pull us in different directions. That tension is actually information.',
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
      insight: "It's okay to feel both things. That's not confusion - that's complexity.",
    },
    priority: 62,
  },

  {
    name: 'Blind Spot Pattern Surface',
    description: "Surface a pattern they can't see themselves",
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
      topic: "something I've been noticing",
      insight: "I've been watching a pattern and wanted to share what I see.",
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
      insight: "I care about your future. Can we talk about some patterns I'm seeing?",
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
      reason: "Your voice sounded different last time. Just wanted to make sure you're okay.",
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
      reason:
        "I know you've had a lot of people time lately. No need to respond - just thinking of you.",
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
      habitName: "prep for what's coming",
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
      habitName: "that bill that's due",
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
      reason: "I've noticed some rough nights. How can I support you?",
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
      reason: "Big day ahead. You've got this. I'm here if you need anything.",
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
      insight: "Sometimes looking at what we didn't choose helps clarify what we actually want.",
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
      reason: "Let's finally work through this together",
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
      reason: '__GATE_DO_NOT_REACH_OUT__',
    },
    priority: 200,
  },
];
