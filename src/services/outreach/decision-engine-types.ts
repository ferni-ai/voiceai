/**
 * Decision Engine Types
 *
 * Type definitions for the outreach decision engine.
 *
 * @module services/outreach/decision-engine-types
 */

import type { AgentId } from '../agent-bus.js';
import type { OutreachChannel, RelationshipStage } from './persona-voice-generator.js';

// ============================================================================
// TRIGGER TYPES
// ============================================================================

export type OutreachTriggerType =
  // Task-driven triggers
  | 'commitment_check' // User said they'd do something
  | 'goal_milestone' // Progress toward a goal
  | 'streak_at_risk' // About to break a streak
  | 'streak_celebration' // Hit a streak milestone (7, 30, 100 days)
  | 'goal_progress' // Making progress toward goal (80% there)
  | 'habit_check' // Routine/habit check-in
  | 'appointment_reminder' // Upcoming appointment
  | 'event_countdown' // Event approaching
  | 'milestone_approaching' // Life milestone coming up

  // Emotional triggers
  | 'emotional_support' // Detected stress/struggle
  | 'celebration' // Achievement unlocked
  | 'concern_check' // Follow up on something concerning

  // Connection triggers
  | 'reengagement' // Haven't heard from user
  | 'thinking_of_you' // Random kindness
  | 'follow_up' // Explicit follow-up request
  | 'accountability' // Agreed accountability check
  | 'personal_share' // User wants to share Ferni with someone
  | 'check_in' // General check-in

  // Onboarding triggers (first 14 days)
  | 'onboarding_welcome' // Day 1: Welcome and invitation to explore
  | 'onboarding_nextday' // Day 2: "How was it?" check
  | 'onboarding_topic_deepdive' // Days 3-5: Go deeper on a topic from first convo
  | 'onboarding_first_week' // Day 7: First week reflection
  | 'onboarding_momentum' // Days 8-10: Momentum/habit building nudge
  | 'onboarding_two_week' // Day 14: Two-week celebration/commitment

  // Content triggers
  | 'content_share' // Relevant content found
  | 'insight_discovery' // AI noticed something helpful

  // Trust system triggers ("Better than Human")
  | 'growth_reflection' // Notice and reflect user evolution
  | 'shared_memory' // Callback to shared experiences (songs, jokes)

  // Pattern-based triggers ("Better than Human")
  | 'pattern_acknowledgment' // "Mondays seem hard for you"
  | 'life_rhythm_prediction' // Deep understanding: predicted low mood/energy

  // Time-based triggers
  | 'scheduled' // User requested specific time
  | 'seasonal' // Holiday/season check-in
  | 'anniversary'; // Relationship milestone (30 days, 100 conversations)

export type OutreachPriority = 'low' | 'medium' | 'high' | 'urgent';

// ============================================================================
// TRIGGER AND DECISION INTERFACES
// ============================================================================

export interface OutreachTrigger {
  id: string;
  type: OutreachTriggerType;
  userId: string;
  priority: OutreachPriority;

  // What triggered this
  reason: string;
  context?: Record<string, unknown>;

  // Optional specifics
  commitment?: string;
  milestone?: string;
  goal?: string;
  event?: string;

  // Timing preferences
  suggestedTime?: Date;
  expiresAt?: Date;

  // Who should handle this
  suggestedPersona?: AgentId;
  lastPersona?: AgentId;
  wasRecentConversation?: boolean;

  // Created
  createdAt: Date;
}

export interface OutreachDecision {
  trigger: OutreachTrigger;
  decision: 'send' | 'skip' | 'defer';
  skipReason?: string;
  deferUntil?: Date;
  decidedAt: Date; // When this decision was made

  // If sending
  persona?: AgentId;
  channel?: OutreachChannel;
  scheduledFor?: Date;
  generatedMessage?: import('./persona-voice-generator.js').GeneratedOutreach;
}

// ============================================================================
// STATE INTERFACES
// ============================================================================

export interface UserOutreachState {
  userId: string;

  // Permissions
  outreachEnabled: boolean;
  allowedChannels: OutreachChannel[];

  // Preferences
  preferences: {
    quietHoursStart: string; // "22:00"
    quietHoursEnd: string; // "08:00"
    timezone: string;
    maxPerDay: number;
    maxPerWeek: number;
    preferredChannel?: OutreachChannel;
    neverDuring?: string[]; // ["morning meditation", "family dinner"]
  };

  // Learned patterns
  patterns: {
    preferredHours: number[];
    preferredDays: number[];
    responseRateByChannel: Record<OutreachChannel, number>;
    avgResponseTimeMs: number;
  };

  // Current state
  counters: {
    outreachToday: number;
    outreachThisWeek: number;
    lastOutreachDate?: Date;
  };

  // Relationship
  relationshipStage: RelationshipStage;
  lastPersona?: AgentId;
  lastConversationDate?: Date;

  // Life context (aggregated)
  context: {
    emotionalState?: string;
    recentTopics?: string[];
    recentWins?: string[];
    currentStruggles?: string[];
    upcomingEvents?: Array<{ date: Date; description: string }>;
    interests?: string[];
  };
}

// ============================================================================
// CONFIGURATION INTERFACES
// ============================================================================

export interface DecisionEngineConfig {
  // Timing
  checkIntervalMs: number;
  defaultQuietHoursStart: string;
  defaultQuietHoursEnd: string;

  // Rate limits
  defaultMaxPerDay: number;
  defaultMaxPerWeek: number;

  // Relationship-based permissions
  relationshipPermissions: {
    new: { allowedChannels: OutreachChannel[]; maxPerWeek: number };
    building: { allowedChannels: OutreachChannel[]; maxPerWeek: number };
    established: { allowedChannels: OutreachChannel[]; maxPerWeek: number };
    deep: { allowedChannels: OutreachChannel[]; maxPerWeek: number };
  };

  // Priority windows (how quickly to send based on priority)
  priorityWindows: {
    urgent: number; // ms to send within
    high: number;
    medium: number;
    low: number;
  };
}
