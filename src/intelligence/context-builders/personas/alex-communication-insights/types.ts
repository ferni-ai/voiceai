/**
 * Type definitions for Alex's communication insights context builder.
 *
 * @module intelligence/context-builders/personas/alex-communication-insights/types
 */

import type {
  MilestoneConflict,
  TimeWindow,
} from '../../../../services/superhuman/milestone-calendar-coordinator.js';

export type { MilestoneConflict, TimeWindow };

// ============================================================================
// MAIN BRIEFING STRUCTURE
// ============================================================================

export interface CommunicationBriefing {
  /** User's current state - stressed, productive, overwhelmed? */
  userState: UserStateSnapshot;
  /** Computed communication metrics */
  communicationMetrics: CommunicationMetrics;
  /** Upcoming deadlines and events needing coordination */
  upcomingPriorities: UpcomingPriority[];
  /** Communication patterns and insights */
  communicationContext: CommunicationContext;
  /** Potential coaching opportunities */
  coachingOpportunities: string[];
  /** Cross-team insights from other personas */
  teamInsights: TeamInsight[];
  /** Action items Alex should consider */
  actionItems: string[];
  /** Proactive triggers for outreach */
  proactiveTriggers: ProactiveTrigger[];
  /** Memory context from past conversations */
  memoryContext: MemoryContext;
  /** Milestone-calendar conflicts from Jordan↔Alex coordination */
  milestoneConflicts: MilestoneConflict[];
  /** Protected time blocks for milestone focus */
  protectedTimeWindows: TimeWindow[];
}

// ============================================================================
// USER STATE
// ============================================================================

export interface UserStateSnapshot {
  stressLevel: 'low' | 'moderate' | 'high' | 'unknown';
  stressSignals: string[];
  energyLevel: 'low' | 'moderate' | 'high' | 'unknown';
  productivityMomentum: 'building' | 'stable' | 'struggling' | 'unknown';
  timeOfDayContext: string;
  optimalCommunicationWindow: string | null;
}

// ============================================================================
// COMMUNICATION METRICS
// ============================================================================

export interface CommunicationMetrics {
  /** Readiness for difficult conversations (0-100) */
  communicationReadiness: number;
  /** Schedule pressure (0-100, high = packed) */
  calendarDensity: number;
  /** Follow-up speed (0-100) */
  responseVelocity: number;
  /** Task handoff effectiveness (0-100) */
  delegationClarity: number;
  /** Focus fragmentation (0-100, high = scattered) */
  contextSwitchLoad: number;
  /** Key patterns detected */
  patterns: string[];
}

// ============================================================================
// PRIORITIES
// ============================================================================

export interface UpcomingPriority {
  type: 'deadline' | 'event' | 'follow-up' | 'check-in' | 'difficult-conversation';
  description: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  source: 'peter' | 'maya' | 'jordan' | 'nayan' | 'system';
  actionNeeded?: string;
  daysUntil?: number;
}

// ============================================================================
// COMMUNICATION CONTEXT
// ============================================================================

export interface CommunicationContext {
  pendingFollowUps: string[];
  recentDifficultTopics: string[];
  communicationPatterns: string[];
  relationshipDynamics: string[];
  scriptingNeeds: string[];
  boundaryConversations: string[];
}

// ============================================================================
// TEAM INSIGHTS
// ============================================================================

export interface TeamInsight {
  from: string;
  insight: string;
  relevance: 'direct' | 'context' | 'background';
  actionable: boolean;
}

// ============================================================================
// PROACTIVE TRIGGERS
// ============================================================================

export interface ProactiveTrigger {
  type: 'follow-up' | 'check-in' | 'reminder' | 'coordination' | 'celebration';
  message: string;
  priority: 'high' | 'medium' | 'low';
  timing: 'immediate' | 'when_relevant' | 'next_session';
}

// ============================================================================
// MEMORY CONTEXT
// ============================================================================

export interface MemoryContext {
  previousCommunicationTopics: string[];
  scriptsThatWorked: string[];
  pendingFollowUps: string[];
  relationshipNotes: string[];
}

// ============================================================================
// INTERNAL TYPES
// ============================================================================

export interface EnhancedHabitData {
  id: string;
  name: string;
  currentStreak: number;
  longestStreak: number;
  successRate: number;
  isActive: boolean;
  isPaused?: boolean;
  isKeystone?: boolean;
  category?: string;
}

export interface ProductivityUserData {
  enhancedHabits?: EnhancedHabitData[];
  weeklyReflections?: Array<{
    wins?: string[];
    challenges?: string[];
    insights?: string[];
  }>;
}

export interface HandoffContextType {
  topics?: string[];
  emotionalState?: string;
  summary?: string;
  fromPersona?: string;
  urgency?: 'low' | 'medium' | 'high';
}
