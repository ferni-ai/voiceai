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
        ['stressed', 'anxious', 'overwhelmed', 'tired'].includes(
          t.emotion?.toLowerCase() || ''
        )
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
    const userData = (productivityStore as unknown as { getFullUserData: (id: string) => ProductivityUserData }).getFullUserData?.(userId);
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
        const daysUntil = Math.ceil(
          (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

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
    const userData = (productivityStore as unknown as { getFullUserData: (id: string) => ProductivityUserData }).getFullUserData?.(userId);
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

function buildCommunicationContext(
  handoffContext?: HandoffContextType
): CommunicationContext {
  const context: CommunicationContext = {
    pendingFollowUps: [],
    recentDifficultTopics: [],
    communicationPatterns: [],
    relationshipDynamics: [],
  };

  if (handoffContext) {
    // Analyze topics for communication-related content
    for (const topic of handoffContext.topics || []) {
      const lower = topic.toLowerCase();

      if (
        lower.includes('conversation') ||
        lower.includes('talk to') ||
        lower.includes('tell') ||
        lower.includes('ask')
      ) {
        context.recentDifficultTopics.push(topic);
      }

      if (
        lower.includes('boundary') ||
        lower.includes('say no') ||
        lower.includes('confront')
      ) {
        context.recentDifficultTopics.push(topic);
      }

      if (
        lower.includes('boss') ||
        lower.includes('manager') ||
        lower.includes('coworker') ||
        lower.includes('colleague')
      ) {
        context.relationshipDynamics.push(`Professional relationship: ${topic}`);
      }

      if (
        lower.includes('family') ||
        lower.includes('parent') ||
        lower.includes('partner') ||
        lower.includes('spouse')
      ) {
        context.relationshipDynamics.push(`Personal relationship: ${topic}`);
      }
    }

    // Analyze emotional state for communication style guidance
    if (handoffContext.emotionalState) {
      const emo = handoffContext.emotionalState.toLowerCase();
      if (emo.includes('anxious') || emo.includes('nervous')) {
        context.communicationPatterns.push(
          'User is anxious - slow down, practice scenarios'
        );
      }
      if (emo.includes('frustrated') || emo.includes('angry')) {
        context.communicationPatterns.push(
          'User is frustrated - help process before composing'
        );
      }
      if (emo.includes('avoidant') || emo.includes('hesitant')) {
        context.communicationPatterns.push(
          'User seems avoidant - explore the fear behind it'
        );
      }
    }
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
        opportunities.push(
          'Coming from Maya - check if habits need accountability scheduling'
        );
        break;
      case 'jordan':
      case 'jordan-taylor':
        opportunities.push(
          'Coming from Jordan - check if goals need coordination/scheduling'
        );
        break;
      case 'nayan':
      case 'nayan-patel':
        opportunities.push(
          'Coming from Nayan - wisdom context, approach communication mindfully'
        );
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

function formatBriefingForInjection(briefing: CommunicationBriefing): string[] {
  const sections: string[] = ['[ALEX COMMUNICATION BRIEFING]'];

  // User state
  sections.push('\n--- USER STATE ---');
  sections.push(`• Stress level: ${briefing.userState.stressLevel}`);
  sections.push(`• Energy: ${briefing.userState.energyLevel}`);
  sections.push(`• Productivity: ${briefing.userState.productivityMomentum}`);
  sections.push(`• Time context: ${briefing.userState.timeOfDayContext}`);

  if (briefing.userState.stressSignals.length > 0) {
    sections.push(`• Stress signals: ${briefing.userState.stressSignals.join(', ')}`);
  }

  // Upcoming priorities
  if (briefing.upcomingPriorities.length > 0) {
    sections.push('\n--- PRIORITIES ---');
    for (const priority of briefing.upcomingPriorities.slice(0, 5)) {
      const urgencyEmoji =
        priority.urgency === 'critical'
          ? '🚨'
          : priority.urgency === 'high'
            ? '⚠️'
            : '📋';
      sections.push(`${urgencyEmoji} [${priority.source}] ${priority.description}`);
      if (priority.actionNeeded) {
        sections.push(`   → ${priority.actionNeeded}`);
      }
    }
  }

  // Communication context
  if (
    briefing.communicationContext.recentDifficultTopics.length > 0 ||
    briefing.communicationContext.relationshipDynamics.length > 0
  ) {
    sections.push('\n--- COMMUNICATION CONTEXT ---');
    for (const topic of briefing.communicationContext.recentDifficultTopics) {
      sections.push(`• Difficult topic: ${topic}`);
    }
    for (const dynamic of briefing.communicationContext.relationshipDynamics) {
      sections.push(`• ${dynamic}`);
    }
    for (const pattern of briefing.communicationContext.communicationPatterns) {
      sections.push(`• ${pattern}`);
    }
  }

  // Coaching opportunities
  if (briefing.coachingOpportunities.length > 0) {
    sections.push('\n--- COACHING OPPORTUNITIES ---');
    for (const opp of briefing.coachingOpportunities.slice(0, 4)) {
      sections.push(`• ${opp}`);
    }
  }

  // Team insights
  if (briefing.teamInsights.length > 0) {
    sections.push('\n--- TEAM INSIGHTS ---');
    for (const insight of briefing.teamInsights.filter((i) => i.relevance === 'direct')) {
      sections.push(`• [${insight.from}] ${insight.insight}`);
    }
  }

  // Action items
  if (briefing.actionItems.length > 0) {
    sections.push('\n--- SUGGESTED ACTIONS ---');
    for (const action of briefing.actionItems) {
      sections.push(`→ ${action}`);
    }
  }

  sections.push(
    '\n[Remember: Clear is kind. Slow down for stress. Shows love through clarity.]'
  );

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
      injections.push(
        createStandardInjection(formattedSections.join('\n'), 'alex_briefing')
      );
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
