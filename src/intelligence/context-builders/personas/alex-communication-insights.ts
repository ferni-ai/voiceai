/**
 * Alex Communication Insights Context Builder
 *
 * > "Clear is kind. I'll help you say what needs to be said."
 *
 * This builder loads Alex with DEEP communication intelligence when:
 * 1. A user transfers TO Alex from another persona
 * 2. A user starts talking directly with Alex
 *
 * DATA SOURCES (Cross-Team Integration):
 *
 * FROM PETER (Pattern Analysis):
 * - Stress patterns affecting communication
 * - Decision-making patterns
 * - Financial stress indicators
 *
 * FROM MAYA (Habits/Productivity):
 * - Habit momentum affecting follow-through
 * - Energy levels for important conversations
 * - Routine strength for consistent communication
 *
 * FROM JORDAN (Goals/Milestones):
 * - Upcoming deadlines needing coordination
 * - Life events requiring communication
 * - Milestone celebrations to announce
 *
 * FROM NAYAN (Wisdom):
 * - Relationship context for important conversations
 * - Values alignment in communication
 * - Long-term relationship perspective
 *
 * COMPUTED METRICS (Alex's Dashboard):
 * - Communication Readiness (0-100): Prepared for difficult conversations
 * - Calendar Density (0-100): Schedule pressure
 * - Response Velocity (0-100): Follow-up speed
 * - Delegation Clarity (0-100): Task handoff effectiveness
 * - Context Switch Load (0-100): Focus fragmentation
 *
 * @module intelligence/context-builders/alex-communication-insights
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  BuilderCategory,
  createHighInjection,
  createHintInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { getHandoffContext } from '../../../tools/handoff/executor.js';
import { getFinancialStore } from '../../../services/stores/financial-store.js';
import { getProductivityStore } from '../../../services/stores/productivity-store.js';
import { getGamificationStore } from '../../../services/engagement/gamification-store.js';
import { getSuperhuman } from '../superhuman/superhuman-integration.js';
import {
  detectMilestoneConflicts,
  findOptimalMilestoneWindows,
  getCapacityForNewMilestone,
  type MilestoneConflict,
  type TimeWindow,
  type SimpleMilestone,
} from '../../../services/superhuman/jordan-alex-coordinator.js';

const log = createLogger({ module: 'context:alex-communication-insights' });

// ============================================================================
// TYPES
// ============================================================================

interface CommunicationBriefing {
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

interface UserStateSnapshot {
  stressLevel: 'low' | 'moderate' | 'high' | 'unknown';
  stressSignals: string[];
  energyLevel: 'low' | 'moderate' | 'high' | 'unknown';
  productivityMomentum: 'building' | 'stable' | 'struggling' | 'unknown';
  timeOfDayContext: string;
  optimalCommunicationWindow: string | null;
}

interface CommunicationMetrics {
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

interface UpcomingPriority {
  type: 'deadline' | 'event' | 'follow-up' | 'check-in' | 'difficult-conversation';
  description: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  source: 'peter' | 'maya' | 'jordan' | 'nayan' | 'system';
  actionNeeded?: string;
  daysUntil?: number;
}

interface CommunicationContext {
  pendingFollowUps: string[];
  recentDifficultTopics: string[];
  communicationPatterns: string[];
  relationshipDynamics: string[];
  scriptingNeeds: string[];
  boundaryConversations: string[];
}

interface TeamInsight {
  from: string;
  insight: string;
  relevance: 'direct' | 'context' | 'background';
  actionable: boolean;
}

interface ProactiveTrigger {
  type: 'follow-up' | 'check-in' | 'reminder' | 'coordination' | 'celebration';
  message: string;
  priority: 'high' | 'medium' | 'low';
  timing: 'immediate' | 'when_relevant' | 'next_session';
}

interface MemoryContext {
  previousCommunicationTopics: string[];
  scriptsThatWorked: string[];
  pendingFollowUps: string[];
  relationshipNotes: string[];
}

interface EnhancedHabitData {
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

interface ProductivityUserData {
  enhancedHabits?: EnhancedHabitData[];
  weeklyReflections?: Array<{
    wins?: string[];
    challenges?: string[];
    insights?: string[];
  }>;
}

interface HandoffContextType {
  topics?: string[];
  emotionalState?: string;
  summary?: string;
  fromPersona?: string;
  urgency?: 'low' | 'medium' | 'high';
}

// ============================================================================
// SESSION STATE
// ============================================================================

interface AlexSession {
  briefingTurn: number;
  followUpsRaised: Set<string>;
}

const sessions = new Map<string, AlexSession>();

function getSession(sessionId: string): AlexSession {
  let session = sessions.get(sessionId);
  if (!session) {
    session = { briefingTurn: -1, followUpsRaised: new Set() };
    sessions.set(sessionId, session);
  }
  return session;
}

export function clearAlexCommunicationSession(sessionId: string): void {
  sessions.delete(sessionId);
}

// ============================================================================
// DATA FETCHERS
// ============================================================================

async function getUserStateSnapshot(userId: string): Promise<UserStateSnapshot> {
  const snapshot: UserStateSnapshot = {
    stressLevel: 'unknown',
    stressSignals: [],
    energyLevel: 'unknown',
    productivityMomentum: 'unknown',
    timeOfDayContext: getTimeOfDayContext(),
    optimalCommunicationWindow: null,
  };

  try {
    // Get stress signals from financial patterns (Peter's domain)
    const financialStore = getFinancialStore();
    const triggers = financialStore.getUserSpendingTriggers(userId);

    if (triggers.length > 0) {
      const stressTriggers = triggers.filter((t) =>
        ['stressed', 'anxious', 'overwhelmed', 'tired'].includes(t.emotion?.toLowerCase() || '')
      );

      if (stressTriggers.length >= 3) {
        snapshot.stressLevel = 'high';
        snapshot.stressSignals.push('Multiple stress-related spending triggers detected');
      } else if (stressTriggers.length >= 1) {
        snapshot.stressLevel = 'moderate';
        snapshot.stressSignals.push('Some stress indicators in spending patterns');
      } else {
        snapshot.stressLevel = 'low';
      }
    }

    // Get energy/productivity signals from habits (Maya's domain)
    const productivityStore = getProductivityStore();
    const userData = (
      productivityStore as unknown as { getFullUserData: (id: string) => ProductivityUserData }
    ).getFullUserData?.(userId);
    const enhancedHabits = userData?.enhancedHabits || [];
    const activeHabits = enhancedHabits.filter((h) => h.isActive && !h.isPaused);

    if (activeHabits.length > 0) {
      const totalStreaks = activeHabits.reduce((sum, h) => sum + (h.currentStreak || 0), 0);
      const avgSuccessRate =
        activeHabits.reduce((sum, h) => sum + (h.successRate || 0), 0) / activeHabits.length;

      if (avgSuccessRate >= 0.7 && totalStreaks >= 5) {
        snapshot.productivityMomentum = 'building';
        snapshot.energyLevel = 'high';
      } else if (avgSuccessRate >= 0.5) {
        snapshot.productivityMomentum = 'stable';
        snapshot.energyLevel = 'moderate';
      } else {
        snapshot.productivityMomentum = 'struggling';
        snapshot.energyLevel = 'low';
        snapshot.stressSignals.push('Habit completion rate is low');
      }
    }

    // Get mood signals from gamification store
    const gamificationStore = getGamificationStore();
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const moodLogs = await gamificationStore.getMoodLogs(userId, weekAgo, now);

    if (moodLogs.length > 0) {
      const recentMoods = moodLogs.slice(0, 3);
      const lowMoods = recentMoods.filter((m) => m.mood <= 4);

      if (lowMoods.length >= 2) {
        snapshot.stressLevel = 'high';
        snapshot.stressSignals.push('Recent mood logs indicate stress');
      }

      // Find optimal communication window
      const hourlyMoods: Record<number, number[]> = {};
      for (const log of moodLogs) {
        const hour = new Date(log.date).getHours();
        if (!hourlyMoods[hour]) hourlyMoods[hour] = [];
        hourlyMoods[hour].push(log.mood);
      }

      let bestHour = -1;
      let bestMood = 0;
      for (const [hour, moods] of Object.entries(hourlyMoods)) {
        const avg = moods.reduce((a, b) => a + b, 0) / moods.length;
        if (avg > bestMood) {
          bestMood = avg;
          bestHour = parseInt(hour);
        }
      }

      if (bestHour >= 0) {
        const period = bestHour < 12 ? 'morning' : bestHour < 17 ? 'afternoon' : 'evening';
        snapshot.optimalCommunicationWindow = period;
      }
    }
  } catch (err) {
    log.warn({ error: String(err) }, 'Failed to get user state snapshot');
  }

  return snapshot;
}

function getTimeOfDayContext(): string {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return 'Morning - peak energy for difficult conversations';
  if (hour >= 12 && hour < 17) return 'Afternoon - good for routine coordination';
  if (hour >= 17 && hour < 21) return 'Evening - best for reflective conversations';
  return 'Late night - emotional conversations common, handle with care';
}

// ============================================================================
// COMPUTED COMMUNICATION METRICS
// ============================================================================

function computeCommunicationMetrics(
  userState: UserStateSnapshot,
  upcomingPriorities: UpcomingPriority[],
  communicationContext: CommunicationContext
): CommunicationMetrics {
  const metrics: CommunicationMetrics = {
    communicationReadiness: 50,
    calendarDensity: 0,
    responseVelocity: 50,
    delegationClarity: 50,
    contextSwitchLoad: 0,
    patterns: [],
  };

  // Communication Readiness: Based on energy, stress, and pending difficult topics
  let readinessScore = 50;
  if (userState.energyLevel === 'high') readinessScore += 25;
  else if (userState.energyLevel === 'low') readinessScore -= 20;

  if (userState.stressLevel === 'low') readinessScore += 15;
  else if (userState.stressLevel === 'high') readinessScore -= 25;

  if (communicationContext.scriptingNeeds.length > 0) readinessScore -= 10;
  metrics.communicationReadiness = Math.max(0, Math.min(100, readinessScore));

  // Calendar Density: Based on upcoming priorities
  const criticalPriorities = upcomingPriorities.filter((p) => p.urgency === 'critical').length;
  const highPriorities = upcomingPriorities.filter((p) => p.urgency === 'high').length;
  metrics.calendarDensity = Math.min(
    100,
    criticalPriorities * 30 + highPriorities * 15 + upcomingPriorities.length * 5
  );

  // Response Velocity: Based on pending follow-ups
  const pendingCount = communicationContext.pendingFollowUps.length;
  metrics.responseVelocity = Math.max(0, 100 - pendingCount * 15);

  // Delegation Clarity: Based on whether they have clear handoffs
  if (upcomingPriorities.some((p) => p.actionNeeded)) {
    metrics.delegationClarity = 70; // Has clear action items
  }
  if (communicationContext.boundaryConversations.length > 0) {
    metrics.delegationClarity -= 15; // Boundary issues affect delegation
  }

  // Context Switch Load: Based on variety of priority types
  const uniqueTypes = new Set(upcomingPriorities.map((p) => p.type)).size;
  const uniqueSources = new Set(upcomingPriorities.map((p) => p.source)).size;
  metrics.contextSwitchLoad = Math.min(100, uniqueTypes * 15 + uniqueSources * 10);

  // Detect patterns
  if (metrics.communicationReadiness > 70) {
    metrics.patterns.push('High readiness - good time for difficult conversations');
  } else if (metrics.communicationReadiness < 40) {
    metrics.patterns.push('Low readiness - prep work needed before big conversations');
  }

  if (metrics.calendarDensity > 70) {
    metrics.patterns.push('Heavy schedule - prioritization needed');
  }

  if (metrics.responseVelocity < 50) {
    metrics.patterns.push('Follow-ups piling up - batch processing recommended');
  }

  if (metrics.contextSwitchLoad > 60) {
    metrics.patterns.push('High context switching - block time for focus');
  }

  return metrics;
}

// ============================================================================
// UPCOMING PRIORITIES
// ============================================================================

function getUpcomingPriorities(userId: string): UpcomingPriority[] {
  const priorities: UpcomingPriority[] = [];

  try {
    // Get upcoming goals/deadlines from financial store (Jordan's data)
    const financialStore = getFinancialStore();
    const goals = financialStore.getUserSavingsGoals(userId);

    for (const goal of goals) {
      if (goal.deadline) {
        const now = new Date();
        const deadline = new Date(goal.deadline);
        const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntil <= 7 && daysUntil > 0) {
          priorities.push({
            type: 'deadline',
            description: `${goal.name} deadline in ${daysUntil} days`,
            urgency: daysUntil <= 2 ? 'critical' : 'high',
            source: 'jordan',
            actionNeeded: 'Schedule final push or communication about adjustments',
            daysUntil,
          });
        } else if (daysUntil <= 30 && daysUntil > 0) {
          priorities.push({
            type: 'deadline',
            description: `${goal.name} coming up in ${Math.round(daysUntil / 7)} weeks`,
            urgency: 'medium',
            source: 'jordan',
            daysUntil,
          });
        }

        // Celebration opportunity
        const progress = goal.currentAmount / goal.targetAmount;
        if (progress >= 1) {
          priorities.push({
            type: 'event',
            description: `🎉 "${goal.name}" COMPLETE - announce/celebrate!`,
            urgency: 'medium',
            source: 'jordan',
            actionNeeded: 'Draft celebration message or announcement',
          });
        }
      }
    }

    // Get habits that might need check-ins (Maya's data)
    const productivityStore = getProductivityStore();
    const userData = (
      productivityStore as unknown as { getFullUserData: (id: string) => ProductivityUserData }
    ).getFullUserData?.(userId);
    const enhancedHabits = userData?.enhancedHabits || [];
    const activeHabits = enhancedHabits.filter((h) => h.isActive && !h.isPaused);

    const strugglingHabits = activeHabits.filter(
      (h) => (h.longestStreak || 0) >= 7 && (h.currentStreak || 0) <= 1
    );

    for (const habit of strugglingHabits) {
      priorities.push({
        type: 'check-in',
        description: `"${habit.name}" streak broken - was ${habit.longestStreak} days`,
        urgency: 'medium',
        source: 'maya',
        actionNeeded: 'Schedule reflection or accountability check-in',
      });
    }

    // Milestone celebrations
    const milestonePriorities = activeHabits.filter(
      (h) => h.currentStreak === 7 || h.currentStreak === 30 || h.currentStreak === 100
    );
    for (const habit of milestonePriorities) {
      priorities.push({
        type: 'event',
        description: `🎉 "${habit.name}" hit ${habit.currentStreak} days!`,
        urgency: 'low',
        source: 'maya',
        actionNeeded: 'Celebrate! Maybe share with someone?',
      });
    }
  } catch (err) {
    log.warn({ error: String(err) }, 'Failed to get upcoming priorities');
  }

  return priorities;
}

// ============================================================================
// COMMUNICATION CONTEXT
// ============================================================================

const DIFFICULT_CONVERSATION_PATTERNS = ['conversation', 'talk to', 'tell', 'ask', 'need to say'];
const BOUNDARY_PATTERNS = ['boundary', 'say no', 'confront', 'push back', 'stand up'];
const PROFESSIONAL_PATTERNS = ['boss', 'manager', 'coworker', 'colleague', 'client', 'work'];
const PERSONAL_PATTERNS = ['family', 'parent', 'partner', 'spouse', 'friend', 'sibling'];
const SCRIPTING_PATTERNS = ['how to say', 'what to say', 'script', 'word it', 'phrase it'];

function classifyTopic(topic: string): {
  isDifficult: boolean;
  isBoundary: boolean;
  needsScripting: boolean;
  dynamic: string | null;
} {
  const lower = topic.toLowerCase();

  return {
    isDifficult: DIFFICULT_CONVERSATION_PATTERNS.some((p) => lower.includes(p)),
    isBoundary: BOUNDARY_PATTERNS.some((p) => lower.includes(p)),
    needsScripting: SCRIPTING_PATTERNS.some((p) => lower.includes(p)),
    dynamic: PROFESSIONAL_PATTERNS.some((p) => lower.includes(p))
      ? `Professional: ${topic}`
      : PERSONAL_PATTERNS.some((p) => lower.includes(p))
        ? `Personal: ${topic}`
        : null,
  };
}

function analyzeEmotionalStateForCommunication(emotionalState: string): string[] {
  const patterns: string[] = [];
  const emo = emotionalState.toLowerCase();

  if (emo.includes('anxious') || emo.includes('nervous')) {
    patterns.push('Anxiety detected - practice scenarios, break into small steps');
  }
  if (emo.includes('frustrated') || emo.includes('angry')) {
    patterns.push('Frustration present - help process before composing');
  }
  if (emo.includes('avoidant') || emo.includes('hesitant')) {
    patterns.push('Avoidance noted - explore the fear behind it');
  }
  if (emo.includes('overwhelmed')) {
    patterns.push('Overwhelmed - triage and prioritize communications');
  }
  if (emo.includes('sad') || emo.includes('down')) {
    patterns.push('Low mood - gentle approach, no pressure');
  }

  return patterns;
}

function buildCommunicationContext(handoffContext?: HandoffContextType): CommunicationContext {
  const context: CommunicationContext = {
    pendingFollowUps: [],
    recentDifficultTopics: [],
    communicationPatterns: [],
    relationshipDynamics: [],
    scriptingNeeds: [],
    boundaryConversations: [],
  };

  if (!handoffContext) return context;

  // Classify each topic
  for (const topic of handoffContext.topics || []) {
    const classification = classifyTopic(topic);

    if (classification.isDifficult) {
      context.recentDifficultTopics.push(topic);
    }
    if (classification.isBoundary) {
      context.boundaryConversations.push(topic);
    }
    if (classification.needsScripting) {
      context.scriptingNeeds.push(topic);
    }
    if (classification.dynamic) {
      context.relationshipDynamics.push(classification.dynamic);
    }
  }

  // Analyze emotional state
  if (handoffContext.emotionalState) {
    context.communicationPatterns = analyzeEmotionalStateForCommunication(
      handoffContext.emotionalState
    );
  }

  return context;
}

// ============================================================================
// PROACTIVE TRIGGERS
// ============================================================================

function detectProactiveTriggers(
  userState: UserStateSnapshot,
  metrics: CommunicationMetrics,
  upcomingPriorities: UpcomingPriority[],
  communicationContext: CommunicationContext
): ProactiveTrigger[] {
  const triggers: ProactiveTrigger[] = [];

  // Follow-up triggers
  if (communicationContext.pendingFollowUps.length > 0) {
    triggers.push({
      type: 'follow-up',
      message: `${communicationContext.pendingFollowUps.length} pending follow-ups need attention`,
      priority: communicationContext.pendingFollowUps.length >= 3 ? 'high' : 'medium',
      timing: 'immediate',
    });
  }

  // Check-in triggers
  if (userState.stressLevel === 'high') {
    triggers.push({
      type: 'check-in',
      message: 'High stress detected - offer to help clear communication backlog',
      priority: 'high',
      timing: 'immediate',
    });
  }

  // Deadline coordination
  const criticalDeadlines = upcomingPriorities.filter((p) => p.urgency === 'critical');
  for (const deadline of criticalDeadlines) {
    triggers.push({
      type: 'coordination',
      message: `CRITICAL: ${deadline.description}`,
      priority: 'high',
      timing: 'immediate',
    });
  }

  // Celebration opportunities
  const celebrations = upcomingPriorities.filter(
    (p) => p.type === 'event' && p.description.includes('🎉')
  );
  for (const celebration of celebrations) {
    triggers.push({
      type: 'celebration',
      message: celebration.description,
      priority: 'low',
      timing: 'when_relevant',
    });
  }

  // Difficult conversation prep
  if (
    communicationContext.recentDifficultTopics.length > 0 &&
    metrics.communicationReadiness > 60
  ) {
    triggers.push({
      type: 'coordination',
      message: 'Good readiness for difficult conversations - consider tackling now',
      priority: 'medium',
      timing: 'when_relevant',
    });
  } else if (
    communicationContext.recentDifficultTopics.length > 0 &&
    metrics.communicationReadiness < 40
  ) {
    triggers.push({
      type: 'reminder',
      message: 'Difficult conversation pending but readiness is low - prep work first',
      priority: 'medium',
      timing: 'when_relevant',
    });
  }

  // Optimal timing suggestions
  if (userState.optimalCommunicationWindow) {
    triggers.push({
      type: 'reminder',
      message: `Best communication window: ${userState.optimalCommunicationWindow}`,
      priority: 'low',
      timing: 'when_relevant',
    });
  }

  return triggers;
}

// ============================================================================
// COACHING OPPORTUNITIES
// ============================================================================

function identifyCoachingOpportunities(
  userState: UserStateSnapshot,
  communicationContext: CommunicationContext,
  handoffContext?: HandoffContextType
): string[] {
  const opportunities: string[] = [];

  // Stress-based coaching
  if (userState.stressLevel === 'high') {
    opportunities.push('High stress detected - start with grounding before any tasks');
    opportunities.push('Offer to draft difficult messages together');
  }

  // Difficult conversation coaching
  if (communicationContext.recentDifficultTopics.length > 0) {
    opportunities.push(
      `Difficult conversation ahead: ${communicationContext.recentDifficultTopics[0]}`
    );
    opportunities.push('Offer to role-play the conversation first');
    opportunities.push('Help identify the core message they need to convey');
  }

  // Boundary coaching
  if (communicationContext.boundaryConversations.length > 0) {
    opportunities.push('Boundary conversation needed - practice "clear is kind" approach');
    opportunities.push('Script specific phrases for saying no');
  }

  // Scripting support
  if (communicationContext.scriptingNeeds.length > 0) {
    opportunities.push('Scripting requested - help craft specific language');
    opportunities.push('Identify their authentic voice vs. what they think they "should" say');
  }

  // Relationship dynamics coaching
  if (communicationContext.relationshipDynamics.length > 0) {
    opportunities.push('Relationship context mentioned - explore the dynamic');
    opportunities.push("Consider the other person's perspective");
  }

  // Handoff-based coaching
  if (handoffContext?.fromPersona) {
    const persona = handoffContext.fromPersona.toLowerCase();
    if (persona.includes('peter')) {
      opportunities.push('From Peter - check if stress patterns need communication support');
    } else if (persona.includes('maya')) {
      opportunities.push('From Maya - check if habits need accountability scheduling');
    } else if (persona.includes('jordan')) {
      opportunities.push('From Jordan - check if goals need coordination/scheduling');
    } else if (persona.includes('nayan')) {
      opportunities.push('From Nayan - wisdom context, approach communication mindfully');
    }
  }

  return opportunities;
}

// ============================================================================
// TEAM INSIGHTS
// ============================================================================

function gatherTeamInsights(
  userState: UserStateSnapshot,
  upcomingPriorities: UpcomingPriority[],
  handoffContext?: HandoffContextType
): TeamInsight[] {
  const insights: TeamInsight[] = [];

  // Peter's insights (financial patterns → communication implications)
  if (userState.stressSignals.length > 0) {
    insights.push({
      from: 'Peter',
      insight: 'Stress patterns detected in spending - communication may be affected',
      relevance: 'context',
      actionable: false,
    });
  }

  // Maya's insights (habits → scheduling needs)
  const mayaPriorities = upcomingPriorities.filter((p) => p.source === 'maya');
  for (const priority of mayaPriorities) {
    insights.push({
      from: 'Maya',
      insight: priority.description,
      relevance: priority.urgency === 'high' ? 'direct' : 'context',
      actionable: !!priority.actionNeeded,
    });
  }

  // Jordan's insights (goals/deadlines → coordination needs)
  const jordanPriorities = upcomingPriorities.filter((p) => p.source === 'jordan');
  for (const priority of jordanPriorities) {
    insights.push({
      from: 'Jordan',
      insight: priority.description,
      relevance: priority.urgency === 'critical' ? 'direct' : 'context',
      actionable: !!priority.actionNeeded,
    });
  }

  // Handoff context insights
  if (handoffContext?.summary) {
    insights.push({
      from: handoffContext.fromPersona || 'team',
      insight: `Context: ${handoffContext.summary}`,
      relevance: 'direct',
      actionable: true,
    });
  }

  return insights;
}

// ============================================================================
// MEMORY CONTEXT
// ============================================================================

function getMemoryContext(userId: string): MemoryContext {
  const context: MemoryContext = {
    previousCommunicationTopics: [],
    scriptsThatWorked: [],
    pendingFollowUps: [],
    relationshipNotes: [],
  };

  try {
    const productivityStore = getProductivityStore();
    const userData = (
      productivityStore as unknown as { getFullUserData: (id: string) => ProductivityUserData }
    ).getFullUserData?.(userId);

    // Extract from weekly reflections
    const reflections = userData?.weeklyReflections || [];
    for (const reflection of reflections.slice(-5)) {
      if (reflection.challenges) {
        // Communication challenges often appear here
        const commChallenges = reflection.challenges.filter(
          (c) =>
            c.toLowerCase().includes('conversation') ||
            c.toLowerCase().includes('tell') ||
            c.toLowerCase().includes('ask')
        );
        context.previousCommunicationTopics.push(...commChallenges);
      }
      if (reflection.wins) {
        // Successful communications
        const commWins = reflection.wins.filter(
          (w) =>
            w.toLowerCase().includes('conversation') ||
            w.toLowerCase().includes('told') ||
            w.toLowerCase().includes('asked')
        );
        context.scriptsThatWorked.push(...commWins);
      }
    }

    // Deduplicate
    context.previousCommunicationTopics = [...new Set(context.previousCommunicationTopics)].slice(
      0,
      5
    );
    context.scriptsThatWorked = [...new Set(context.scriptsThatWorked)].slice(0, 3);
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not get memory context');
  }

  return context;
}

// ============================================================================
// BRIEFING BUILDER
// ============================================================================

async function buildCommunicationBriefing(
  userId: string,
  handoffContext?: HandoffContextType
): Promise<CommunicationBriefing> {
  // Default fallback values for graceful degradation
  const defaultUserState: UserStateSnapshot = {
    stressLevel: 'unknown',
    stressSignals: [],
    energyLevel: 'unknown',
    productivityMomentum: 'unknown',
    timeOfDayContext: 'unknown',
    optimalCommunicationWindow: null,
  };
  const defaultMemoryContext: MemoryContext = {
    previousCommunicationTopics: [],
    scriptsThatWorked: [],
    pendingFollowUps: [],
    relationshipNotes: [],
  };

  // 🐛 FIX: Each promise has its own catch to prevent one failure from crashing all
  const [userState, memoryContext] = await Promise.all([
    getUserStateSnapshot(userId).catch((e) => {
      log.warn({ error: String(e) }, 'Failed to get user state snapshot');
      return defaultUserState;
    }),
    Promise.resolve(getMemoryContext(userId)).catch((e) => {
      log.warn({ error: String(e) }, 'Failed to get memory context');
      return defaultMemoryContext;
    }),
  ]);

  const upcomingPriorities = getUpcomingPriorities(userId);
  const communicationContext = buildCommunicationContext(handoffContext);
  const communicationMetrics = computeCommunicationMetrics(
    userState,
    upcomingPriorities,
    communicationContext
  );
  const proactiveTriggers = detectProactiveTriggers(
    userState,
    communicationMetrics,
    upcomingPriorities,
    communicationContext
  );
  const coachingOpportunities = identifyCoachingOpportunities(
    userState,
    communicationContext,
    handoffContext
  );
  const teamInsights = gatherTeamInsights(userState, upcomingPriorities, handoffContext);

  // Jordan↔Alex coordination: Get milestone conflicts and protected time windows
  let milestoneConflicts: MilestoneConflict[] = [];
  let protectedTimeWindows: TimeWindow[] = [];

  try {
    // Get active milestones from Jordan's domain
    const activeMilestones = await getActiveMilestonesForAlex(userId);

    if (activeMilestones.length > 0) {
      // Detect conflicts between milestones and calendar
      milestoneConflicts = await detectMilestoneConflicts(userId, activeMilestones);

      // Find optimal focus windows for milestone work
      protectedTimeWindows = await findOptimalMilestoneWindows(userId, {
        daysAhead: 7,
        minDurationHours: 2,
        preferMornings: true,
      });

      log.debug(
        {
          userId,
          conflictCount: milestoneConflicts.length,
          windowCount: protectedTimeWindows.length,
        },
        'Jordan↔Alex coordination loaded'
      );
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to get Jordan↔Alex coordination');
  }

  // Build action items
  const actionItems: string[] = [];

  if (userState.stressLevel === 'high') {
    actionItems.push('Start with grounding - "Take a breath. What\'s most urgent?"');
  }

  if (upcomingPriorities.some((p) => p.urgency === 'critical')) {
    actionItems.push('Critical deadlines need attention - prioritize these first');
  }

  if (communicationContext.recentDifficultTopics.length > 0) {
    actionItems.push('Difficult conversation flagged - offer role-play support');
  }

  if (communicationContext.boundaryConversations.length > 0) {
    actionItems.push('Boundary conversation needed - script it out');
  }

  // Add milestone-based action items
  const highSeverityConflicts = milestoneConflicts.filter((c) => c.severity === 'high');
  if (highSeverityConflicts.length > 0) {
    actionItems.push(
      `⚠️ MILESTONE ALERT: ${highSeverityConflicts[0].description} - ${highSeverityConflicts[0].suggestion}`
    );
  }

  if (protectedTimeWindows.length > 0 && protectedTimeWindows[0].quality === 'ideal') {
    const window = protectedTimeWindows[0];
    const dateStr = window.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    actionItems.push(`🛡️ Suggest protecting ${dateStr} ${window.startHour}:00-${window.endHour}:00 for milestone focus`);
  }

  return {
    userState,
    communicationMetrics,
    upcomingPriorities,
    communicationContext,
    coachingOpportunities,
    teamInsights,
    actionItems,
    proactiveTriggers,
    memoryContext,
    milestoneConflicts,
    protectedTimeWindows,
  };
}

/**
 * Get active milestones from Jordan's domain for Alex's calendar coordination.
 */
async function getActiveMilestonesForAlex(userId: string): Promise<SimpleMilestone[]> {
  try {
    const financialStore = getFinancialStore();
    const goals = financialStore.getUserSavingsGoals(userId);

    const milestones: SimpleMilestone[] = [];
    const now = new Date();

    for (const goal of goals) {
      if (goal.deadline) {
        const deadline = new Date(goal.deadline);
        const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        // Only include upcoming milestones (next 30 days)
        if (daysUntil > 0 && daysUntil <= 30) {
          milestones.push({
            id: goal.id || `goal-${goal.name}`,
            name: goal.name,
            targetDate: deadline,
            importance: daysUntil <= 7 ? 'high' : daysUntil <= 14 ? 'medium' : 'low',
            estimatedHours: 10, // Default estimate
          });
        }
      }
    }

    return milestones;
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Could not get active milestones');
    return [];
  }
}

// ============================================================================
// FORMATTING
// ============================================================================

function formatBriefingForInjection(
  briefing: CommunicationBriefing,
  handoffContext: HandoffContextType | undefined,
  turnCount: number
): string[] {
  const sections: string[] = [];

  sections.push(`[ALEX'S COMMUNICATION BRIEFING - Turn ${turnCount}]`);

  // Handoff context (high priority)
  if (handoffContext) {
    sections.push('\n=== HANDOFF CONTEXT ===');
    if (handoffContext.fromPersona) {
      sections.push(`From: ${handoffContext.fromPersona.toUpperCase()}`);
    }
    if (handoffContext.summary) {
      sections.push(`Context: ${handoffContext.summary}`);
    }
    if (handoffContext.urgency === 'high') {
      sections.push('⚠️ URGENCY: HIGH');
    }
  }

  // Communication Metrics Dashboard
  const { communicationMetrics } = briefing;
  sections.push('\n=== 📊 COMMUNICATION METRICS ===');
  sections.push(`• Readiness: ${communicationMetrics.communicationReadiness}/100`);
  sections.push(`• Calendar Density: ${communicationMetrics.calendarDensity}/100`);
  sections.push(`• Response Velocity: ${communicationMetrics.responseVelocity}/100`);
  sections.push(`• Delegation Clarity: ${communicationMetrics.delegationClarity}/100`);
  sections.push(`• Context Switch Load: ${communicationMetrics.contextSwitchLoad}/100`);
  if (communicationMetrics.patterns.length > 0) {
    sections.push(`PATTERNS: ${communicationMetrics.patterns.join('; ')}`);
  }

  // User State
  const { userState } = briefing;
  sections.push('\n=== 🎯 USER STATE ===');
  sections.push(`• Stress level: ${userState.stressLevel}`);
  sections.push(`• Energy: ${userState.energyLevel}`);
  sections.push(`• Productivity: ${userState.productivityMomentum}`);
  sections.push(`• Time context: ${userState.timeOfDayContext}`);
  if (userState.optimalCommunicationWindow) {
    sections.push(`• Best window: ${userState.optimalCommunicationWindow}`);
  }
  if (userState.stressSignals.length > 0) {
    sections.push(`• Stress signals: ${userState.stressSignals.join(', ')}`);
  }

  // High-priority proactive triggers
  const highTriggers = briefing.proactiveTriggers.filter((t) => t.priority === 'high');
  if (highTriggers.length > 0) {
    sections.push('\n=== ⚡ IMMEDIATE ACTIONS ===');
    highTriggers.forEach((t) => sections.push(`• [${t.type.toUpperCase()}] ${t.message}`));
  }

  // Upcoming Priorities
  if (briefing.upcomingPriorities.length > 0) {
    sections.push('\n=== 📋 PRIORITIES ===');
    const urgencyEmoji: Record<string, string> = {
      critical: '🚨',
      high: '⚠️',
      medium: '📌',
      low: '📝',
    };
    for (const p of briefing.upcomingPriorities.slice(0, 5)) {
      const emoji = urgencyEmoji[p.urgency] || '📋';
      sections.push(`${emoji} [${p.source}] ${p.description}`);
      if (p.actionNeeded) {
        sections.push(`   → ${p.actionNeeded}`);
      }
    }
  }

  // Communication Context
  const { communicationContext } = briefing;
  const hasCommunicationContext =
    communicationContext.recentDifficultTopics.length > 0 ||
    communicationContext.boundaryConversations.length > 0 ||
    communicationContext.scriptingNeeds.length > 0;

  if (hasCommunicationContext) {
    sections.push('\n=== 💬 COMMUNICATION CONTEXT ===');
    communicationContext.recentDifficultTopics.forEach((t) =>
      sections.push(`• Difficult topic: ${t}`)
    );
    communicationContext.boundaryConversations.forEach((t) =>
      sections.push(`• Boundary needed: ${t}`)
    );
    communicationContext.scriptingNeeds.forEach((t) => sections.push(`• Scripting needed: ${t}`));
    communicationContext.communicationPatterns.forEach((p) => sections.push(`• ${p}`));
    communicationContext.relationshipDynamics.forEach((d) => sections.push(`• ${d}`));
  }

  // Coaching Opportunities
  if (briefing.coachingOpportunities.length > 0) {
    sections.push('\n=== 💡 COACHING OPPORTUNITIES ===');
    briefing.coachingOpportunities.slice(0, 4).forEach((o) => sections.push(`• ${o}`));
  }

  // Team Insights
  const directInsights = briefing.teamInsights.filter((i) => i.relevance === 'direct');
  if (directInsights.length > 0) {
    sections.push('\n=== 🤝 TEAM INSIGHTS ===');
    directInsights.forEach((i) => sections.push(`• [${i.from}] ${i.insight}`));
  }

  // Jordan↔Alex Milestone Coordination
  if (briefing.milestoneConflicts.length > 0 || briefing.protectedTimeWindows.length > 0) {
    sections.push('\n=== 🎯 JORDAN↔ALEX: MILESTONE-CALENDAR COORDINATION ===');

    // High-severity conflicts first
    const highConflicts = briefing.milestoneConflicts.filter((c) => c.severity === 'high');
    const mediumConflicts = briefing.milestoneConflicts.filter((c) => c.severity === 'medium');

    if (highConflicts.length > 0) {
      sections.push('⚠️ ALERTS (action needed):');
      for (const conflict of highConflicts.slice(0, 3)) {
        sections.push(`  • ${conflict.milestoneName}: ${conflict.description}`);
        sections.push(`    → ${conflict.suggestion}`);
      }
    }

    if (mediumConflicts.length > 0) {
      sections.push('📌 HEADS UP:');
      for (const conflict of mediumConflicts.slice(0, 2)) {
        sections.push(`  • ${conflict.milestoneName}: ${conflict.description}`);
      }
    }

    // Protected time windows
    if (briefing.protectedTimeWindows.length > 0) {
      sections.push('🛡️ PROTECTED FOCUS WINDOWS (suggest blocking):');
      for (const window of briefing.protectedTimeWindows.slice(0, 3)) {
        const dateStr = window.date.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
        const quality =
          window.quality === 'ideal' ? '⭐' : window.quality === 'good' ? '✓' : '';
        sections.push(
          `  ${quality} ${dateStr} ${window.startHour}:00-${window.endHour}:00 (${window.reason})`
        );
      }
    }
  }

  // Memory Context
  if (
    briefing.memoryContext.scriptsThatWorked.length > 0 ||
    briefing.memoryContext.previousCommunicationTopics.length > 0
  ) {
    sections.push('\n=== 🧠 RELATIONSHIP HISTORY ===');
    if (briefing.memoryContext.scriptsThatWorked.length > 0) {
      sections.push(`• What worked: ${briefing.memoryContext.scriptsThatWorked.join(', ')}`);
    }
    if (briefing.memoryContext.previousCommunicationTopics.length > 0) {
      sections.push(
        `• Previous topics: ${briefing.memoryContext.previousCommunicationTopics.join(', ')}`
      );
    }
  }

  // Action Items
  if (briefing.actionItems.length > 0) {
    sections.push('\n=== 🎯 SUGGESTED ACTIONS ===');
    briefing.actionItems.forEach((a) => sections.push(`→ ${a}`));
  }

  // Alex's principles (first turns only)
  if (turnCount === 0 || turnCount === 1) {
    sections.push('\n=== YOUR PRINCIPLES ===');
    sections.push('• Clear is kind - say what needs to be said');
    sections.push('• Script difficult conversations - practice makes perfect');
    sections.push('• Boundaries are self-care, not selfishness');
    sections.push('• Help them find THEIR voice, not yours');
    sections.push('• Slow down for stress - speed up for momentum');
  }

  sections.push("\n[Remember: You're their Chief of Staff. Handle with clarity and care.]");

  return sections;
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

async function buildAlexCommunicationInsightsContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];

  // Only for Alex
  const currentPersona = input.services?.personaId || '';
  const isAlex = [
    'alex',
    'alex-chen',
    'admin-assistant',
    'scheduler',
    'communication-coach',
    'chief-of-staff',
  ].includes(currentPersona.toLowerCase());

  if (!isAlex) return injections;

  const userId = input.services?.userId || 'anonymous';
  if (userId === 'anonymous') return injections;

  const turnCount = input.userData?.turnCount ?? 0;
  const sessionId = input.services?.sessionId || userId;
  const session = getSession(sessionId);

  const handoffContext = getHandoffContext() as HandoffContextType | undefined;
  const isHandoff = handoffContext !== undefined;

  // Inject on first turn, handoff, or every 10 turns
  const shouldInject =
    turnCount === 0 ||
    isHandoff ||
    (turnCount > 0 && turnCount % 10 === 0 && turnCount !== session.briefingTurn);

  if (!shouldInject) return injections;

  try {
    const briefing = await buildCommunicationBriefing(userId, handoffContext);
    const formattedSections = formatBriefingForInjection(briefing, handoffContext, turnCount);

    // Get superhuman context (network, commitments, capacity)
    const superhumanContext = await getSuperhuman(userId, 'alex');
    if (superhumanContext) {
      formattedSections.push('\n' + superhumanContext);
    }

    const content = formattedSections.join('\n');

    if (isHandoff) {
      injections.push(
        createHighInjection('alex_handoff_briefing', content, {
          category: 'persona-communication',
          confidence: 0.9,
        })
      );
      log.info(
        { userId, urgency: handoffContext?.urgency },
        '📬 Alex loaded with handoff briefing'
      );
    } else if (turnCount === 0) {
      injections.push(
        createStandardInjection('alex_initial_briefing', content, {
          category: 'persona-communication',
          confidence: 0.8,
        })
      );
      log.info(
        { userId, readiness: briefing.communicationMetrics.communicationReadiness },
        '📬 Alex loaded with communication briefing'
      );
    } else {
      injections.push(
        createHintInjection('alex_refresh_briefing', content, {
          category: 'persona-communication',
        })
      );
    }

    session.briefingTurn = turnCount;

    // Alex's mindset reminder
    if (turnCount === 0 || isHandoff) {
      injections.push(
        createHintInjection(
          'alex_mindset',
          "[ALEX'S HEART: You show love through clarity. Clear is kind. " +
            'Help them say what needs to be said, find the words they need, ' +
            "and navigate the conversations they're avoiding. " +
            "You're their Chief of Staff - handle their communication with care.]",
          { category: 'persona-identity' }
        )
      );
    }
  } catch (err) {
    log.warn({ error: String(err) }, 'Failed to build Alex communication briefing');
    injections.push(
      createStandardInjection(
        '[Alex: Communication briefing unavailable. Proceeding with standard context.]',
        'alex_briefing'
      )
    );
  }

  return injections;
}

// ============================================================================
// REGISTRATION
// ============================================================================

registerContextBuilder({
  name: 'alex-communication-insights',
  description: 'Loads Alex with deep communication insights - metrics, coaching, coordination',
  priority: 44,
  category: BuilderCategory.PERSONA,
  build: buildAlexCommunicationInsightsContext,
});

export { buildAlexCommunicationInsightsContext };
