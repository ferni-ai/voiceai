/**
 * Alex Communication Insights Context Builder
 *
 * Loads Alex with deep insights when starting a conversation or receiving a handoff:
 * - From Peter: Stress patterns, scheduling/productivity patterns
 * - From Maya: Habit momentum, energy levels, routine strength
 * - From Jordan: Upcoming deadlines, events needing coordination
 * - From Nayan: Communication wisdom, relationship context
 *
 * This gives Alex a comprehensive picture of:
 * 1. The user's current state (stressed? productive? overwhelmed?)
 * 2. Upcoming deadlines/events that need scheduling
 * 3. Communication patterns and relationship dynamics
 * 4. Coaching opportunities for difficult conversations
 *
 * @module intelligence/context-builders/alex-communication-insights
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  BuilderCategory,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';
import { getHandoffContext } from '../../tools/handoff/executor.js';
import { getFinancialStore } from '../../services/financial-store.js';
import { getProductivityStore } from '../../services/productivity-store.js';
import { getGamificationStore } from '../../services/gamification-store.js';

const log = createLogger({ module: 'context:alex-communication-insights' });

// ============================================================================
// TYPES
// ============================================================================

interface CommunicationBriefing {
  /** User's current state - stressed, productive, overwhelmed? */
  userState: UserStateSnapshot;
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
}

interface UserStateSnapshot {
  stressLevel: 'low' | 'moderate' | 'high' | 'unknown';
  stressSignals: string[];
  energyLevel: 'low' | 'moderate' | 'high' | 'unknown';
  productivityMomentum: 'building' | 'stable' | 'struggling' | 'unknown';
  timeOfDayContext: string;
}

interface UpcomingPriority {
  type: 'deadline' | 'event' | 'follow-up' | 'check-in';
  description: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  source: 'peter' | 'maya' | 'jordan' | 'system';
  actionNeeded?: string;
}

interface CommunicationContext {
  pendingFollowUps: string[];
  recentDifficultTopics: string[];
  communicationPatterns: string[];
  relationshipDynamics: string[];
}

interface TeamInsight {
  from: string;
  insight: string;
  relevance: 'direct' | 'context' | 'background';
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
}

interface ProductivityUserData {
  enhancedHabits?: EnhancedHabitData[];
}

interface HandoffContextType {
  topics?: string[];
  emotionalState?: string;
  summary?: string;
  fromPersona?: string;
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

    // Get mood signals (mood is a 1-10 scale)
    const gamificationStore = getGamificationStore();
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const moodLogs = await gamificationStore.getMoodLogs(userId, weekAgo, now);

    if (moodLogs.length > 0) {
      const recentMoods = moodLogs.slice(0, 3);
      // mood is 1-10, low scores (1-4) indicate stress/negative state
      const lowMoods = recentMoods.filter((m) => m.mood <= 4);

      if (lowMoods.length >= 2) {
        snapshot.stressLevel = 'high';
        snapshot.stressSignals.push('Recent mood logs indicate stress');
      }
    }
  } catch (err) {
    log.warn({ error: String(err) }, 'Failed to get user state snapshot');
  }

  return snapshot;
}

function getTimeOfDayContext(): string {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return 'Morning - peak productivity hours';
  if (hour >= 12 && hour < 17) return 'Afternoon - good for coaching conversations';
  if (hour >= 17 && hour < 21) return 'Evening - winding down mode';
  return 'Late night - more present, less efficient';
}

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
            actionNeeded: 'May need to schedule final push or adjust expectations',
          });
        } else if (daysUntil <= 30 && daysUntil > 0) {
          priorities.push({
            type: 'deadline',
            description: `${goal.name} coming up in ${Math.round(daysUntil / 7)} weeks`,
            urgency: 'medium',
            source: 'jordan',
          });
        }
      }
    }

    // Get habits that might need check-ins
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
        actionNeeded: 'Consider scheduling a reflection or support check-in',
      });
    }
  } catch (err) {
    log.warn({ error: String(err) }, 'Failed to get upcoming priorities');
  }

  return priorities;
}

// Patterns for topic classification (defined once, used many times)
const CONVERSATION_PATTERNS = ['conversation', 'talk to', 'tell', 'ask'];
const BOUNDARY_PATTERNS = ['boundary', 'say no', 'confront'];
const PROFESSIONAL_PATTERNS = ['boss', 'manager', 'coworker', 'colleague'];
const PERSONAL_PATTERNS = ['family', 'parent', 'partner', 'spouse'];

function classifyTopic(topic: string): { difficult: boolean; dynamic: string | null } {
  const lower = topic.toLowerCase();
  const isDifficult =
    CONVERSATION_PATTERNS.some((p) => lower.includes(p)) ||
    BOUNDARY_PATTERNS.some((p) => lower.includes(p));

  let dynamic: string | null = null;
  if (PROFESSIONAL_PATTERNS.some((p) => lower.includes(p))) {
    dynamic = `Professional relationship: ${topic}`;
  } else if (PERSONAL_PATTERNS.some((p) => lower.includes(p))) {
    dynamic = `Personal relationship: ${topic}`;
  }

  return { difficult: isDifficult, dynamic };
}

function analyzeEmotionalStateForCommunication(emotionalState: string): string[] {
  const patterns: string[] = [];
  const emo = emotionalState.toLowerCase();

  if (emo.includes('anxious') || emo.includes('nervous')) {
    patterns.push('User is anxious - slow down, practice scenarios');
  }
  if (emo.includes('frustrated') || emo.includes('angry')) {
    patterns.push('User is frustrated - help process before composing');
  }
  if (emo.includes('avoidant') || emo.includes('hesitant')) {
    patterns.push('User seems avoidant - explore the fear behind it');
  }

  return patterns;
}

function buildCommunicationContext(handoffContext?: HandoffContextType): CommunicationContext {
  const context: CommunicationContext = {
    pendingFollowUps: [],
    recentDifficultTopics: [],
    communicationPatterns: [],
    relationshipDynamics: [],
  };

  if (!handoffContext) return context;

  // Classify each topic
  for (const topic of handoffContext.topics || []) {
    const { difficult, dynamic } = classifyTopic(topic);
    if (difficult) context.recentDifficultTopics.push(topic);
    if (dynamic) context.relationshipDynamics.push(dynamic);
  }

  // Analyze emotional state
  if (handoffContext.emotionalState) {
    context.communicationPatterns = analyzeEmotionalStateForCommunication(
      handoffContext.emotionalState
    );
  }

  return context;
}

function identifyCoachingOpportunities(
  userState: UserStateSnapshot,
  communicationContext: CommunicationContext,
  handoffContext?: HandoffContextType
): string[] {
  const opportunities: string[] = [];

  // Stress-based coaching
  if (userState.stressLevel === 'high') {
    opportunities.push('High stress detected - start with grounding before any tasks');
    opportunities.push('Consider offering to draft difficult messages together');
  }

  // Difficult conversation coaching
  if (communicationContext.recentDifficultTopics.length > 0) {
    opportunities.push(
      `Potential difficult conversation ahead: ${communicationContext.recentDifficultTopics[0]}`
    );
    opportunities.push('Offer to role-play the conversation first');
  }

  // Relationship dynamics coaching
  if (communicationContext.relationshipDynamics.length > 0) {
    opportunities.push('Relationship context mentioned - ask about the dynamic');
  }

  // Handoff-based coaching
  if (handoffContext?.fromPersona) {
    switch (handoffContext.fromPersona) {
      case 'peter':
      case 'peter-john':
        opportunities.push(
          'Coming from Peter - check if stress patterns need communication support'
        );
        break;
      case 'maya':
      case 'maya-santos':
        opportunities.push('Coming from Maya - check if habits need accountability scheduling');
        break;
      case 'jordan':
      case 'jordan-taylor':
        opportunities.push('Coming from Jordan - check if goals need coordination/scheduling');
        break;
      case 'nayan':
      case 'nayan-patel':
        opportunities.push('Coming from Nayan - wisdom context, approach communication mindfully');
        break;
    }
  }

  return opportunities;
}

// ============================================================================
// CROSS-TEAM INSIGHTS
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
    });
  }

  // Maya's insights (habits → scheduling needs)
  const mayaPriorities = upcomingPriorities.filter((p) => p.source === 'maya');
  for (const priority of mayaPriorities) {
    insights.push({
      from: 'Maya',
      insight: priority.description,
      relevance: priority.urgency === 'high' ? 'direct' : 'context',
    });
  }

  // Jordan's insights (goals/deadlines → coordination needs)
  const jordanPriorities = upcomingPriorities.filter((p) => p.source === 'jordan');
  for (const priority of jordanPriorities) {
    insights.push({
      from: 'Jordan',
      insight: priority.description,
      relevance: priority.urgency === 'critical' ? 'direct' : 'context',
    });
  }

  // Handoff context insights
  if (handoffContext?.summary) {
    insights.push({
      from: handoffContext.fromPersona || 'team',
      insight: `Context: ${handoffContext.summary}`,
      relevance: 'direct',
    });
  }

  return insights;
}

// ============================================================================
// BRIEFING BUILDER
// ============================================================================

async function buildCommunicationBriefing(
  userId: string,
  handoffContext?: HandoffContextType
): Promise<CommunicationBriefing> {
  // Fetch user state (includes async operations)
  const userState = await getUserStateSnapshot(userId);
  const upcomingPriorities = getUpcomingPriorities(userId);

  const communicationContext = buildCommunicationContext(handoffContext);
  const coachingOpportunities = identifyCoachingOpportunities(
    userState,
    communicationContext,
    handoffContext
  );
  const teamInsights = gatherTeamInsights(userState, upcomingPriorities, handoffContext);

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

  return {
    userState,
    upcomingPriorities,
    communicationContext,
    coachingOpportunities,
    teamInsights,
    actionItems,
  };
}

// ============================================================================
// FORMATTING
// ============================================================================

function formatUserStateSection(userState: CommunicationBriefing['userState']): string[] {
  const lines = [
    '\n--- USER STATE ---',
    `• Stress level: ${userState.stressLevel}`,
    `• Energy: ${userState.energyLevel}`,
    `• Productivity: ${userState.productivityMomentum}`,
    `• Time context: ${userState.timeOfDayContext}`,
  ];
  if (userState.stressSignals.length > 0) {
    lines.push(`• Stress signals: ${userState.stressSignals.join(', ')}`);
  }
  return lines;
}

function formatPrioritiesSection(
  priorities: CommunicationBriefing['upcomingPriorities']
): string[] {
  if (priorities.length === 0) return [];
  const urgencyEmoji: Record<string, string> = { critical: '🚨', high: '⚠️' };
  return [
    '\n--- PRIORITIES ---',
    ...priorities.slice(0, 5).flatMap((p) => {
      const emoji = urgencyEmoji[p.urgency] || '📋';
      const lines = [`${emoji} [${p.source}] ${p.description}`];
      if (p.actionNeeded) lines.push(`   → ${p.actionNeeded}`);
      return lines;
    }),
  ];
}

function formatCommunicationContextSection(ctx: CommunicationContext): string[] {
  const hasContent = ctx.recentDifficultTopics.length > 0 || ctx.relationshipDynamics.length > 0;
  if (!hasContent) return [];
  return [
    '\n--- COMMUNICATION CONTEXT ---',
    ...ctx.recentDifficultTopics.map((t) => `• Difficult topic: ${t}`),
    ...ctx.relationshipDynamics.map((d) => `• ${d}`),
    ...ctx.communicationPatterns.map((p) => `• ${p}`),
  ];
}

function formatBriefingForInjection(briefing: CommunicationBriefing): string[] {
  return [
    '[ALEX COMMUNICATION BRIEFING]',
    ...formatUserStateSection(briefing.userState),
    ...formatPrioritiesSection(briefing.upcomingPriorities),
    ...formatCommunicationContextSection(briefing.communicationContext),
    ...(briefing.coachingOpportunities.length > 0
      ? [
          '\n--- COACHING OPPORTUNITIES ---',
          ...briefing.coachingOpportunities.slice(0, 4).map((o) => `• ${o}`),
        ]
      : []),
    ...(briefing.teamInsights.length > 0
      ? [
          '\n--- TEAM INSIGHTS ---',
          ...briefing.teamInsights
            .filter((i) => i.relevance === 'direct')
            .map((i) => `• [${i.from}] ${i.insight}`),
        ]
      : []),
    ...(briefing.actionItems.length > 0
      ? ['\n--- SUGGESTED ACTIONS ---', ...briefing.actionItems.map((a) => `→ ${a}`)]
      : []),
    '\n[Remember: Clear is kind. Slow down for stress. Shows love through clarity.]',
  ];
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

  try {
    // Get handoff context if available
    const handoffContext = getHandoffContext() as HandoffContextType | undefined;

    // Build the comprehensive briefing
    const briefing = await buildCommunicationBriefing(userId, handoffContext);

    // Only inject if there's meaningful content
    const hasContent =
      briefing.userState.stressLevel !== 'unknown' ||
      briefing.upcomingPriorities.length > 0 ||
      briefing.communicationContext.recentDifficultTopics.length > 0 ||
      briefing.coachingOpportunities.length > 0 ||
      briefing.teamInsights.length > 0;

    if (hasContent) {
      const formattedSections = formatBriefingForInjection(briefing);
      injections.push(createStandardInjection(formattedSections.join('\n'), 'alex_briefing'));
      log.info(
        { userId, stressLevel: briefing.userState.stressLevel },
        '📬 Alex loaded with communication briefing'
      );
    } else {
      injections.push(
        createStandardInjection(
          '[Alex Communication Ready: No specific signals detected. Ready for scheduling, email, or communication coaching.]',
          'alex_briefing'
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
  description: 'Loads Alex with communication insights - user state, priorities, coaching',
  priority: 44,
  category: BuilderCategory.PERSONA,
  build: buildAlexCommunicationInsightsContext,
});

export { buildAlexCommunicationInsightsContext };
