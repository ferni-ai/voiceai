/**
 * Cross-Persona Insights Service
 *
 * Enables personas to share insights with each other that get injected
 * during handoffs or proactively surfaced during conversations.
 *
 * > "What Peter sees in the numbers, Maya needs to know about habits.
 *    What Maya sees in the patterns, Jordan needs to know about goals."
 *
 * INSIGHT TYPES:
 *
 * 1. HANDOFF INSIGHTS - Passed when transferring to another persona
 *    - Peter → Maya: "Stress spending detected - habit support needed"
 *    - Maya → Jordan: "Keystone habit driving momentum - great time for new goal"
 *    - Jordan → Nayan: "Major life transition in progress"
 *
 * 2. PROACTIVE INSIGHTS - Surfaced during conversations
 *    - "Peter noticed something about your spending patterns..."
 *    - "Maya wants to celebrate a habit milestone!"
 *    - "Jordan has a timeline update for your goal..."
 *
 * 3. CROSS-TEAM BRIEFINGS - Background context for any persona
 *    - Current streaks, goals in progress, recent patterns
 *
 * @module services/cross-persona-insights
 */

import { createLogger } from '../utils/safe-logger.js';
import { getFinancialStore } from './stores/financial-store.js';
import { getProductivityStore } from './stores/productivity-store.js';
import { insightsBroadcast } from './insights-broadcast.js';

const log = createLogger({ module: 'cross-persona-insights' });

// ============================================================================
// TYPES
// ============================================================================

export type InsightPriority = 'critical' | 'high' | 'normal' | 'low';
export type InsightSource = 'peter' | 'maya' | 'jordan' | 'nayan' | 'ferni' | 'system';
export type InsightTarget = InsightSource | 'all';

export interface CrossPersonaInsight {
  id: string;
  source: InsightSource;
  target: InsightTarget;
  priority: InsightPriority;
  content: string;
  category: string;
  createdAt: number;
  expiresAt: number;
  /** If true, surface proactively. If false, only on handoff. */
  proactive: boolean;
  /** If true, remove after surfacing once */
  oneTime: boolean;
  /** Additional context data */
  metadata?: Record<string, unknown>;
}

export interface InsightBriefing {
  /** Insights from other personas for the current persona */
  incomingInsights: CrossPersonaInsight[];
  /** Quick summary of cross-team status */
  teamStatus: TeamStatusSummary;
  /** Proactive discoveries to potentially surface */
  proactiveDiscoveries: string[];
}

export interface TeamStatusSummary {
  /** Current habit health (from Maya) */
  habitHealth: {
    activeHabits: number;
    totalStreakDays: number;
    keystoneActive: boolean;
    atRiskCount: number;
  };
  /** Current goal status (from Jordan) */
  goalStatus: {
    activeGoals: number;
    nearingCompletion: number;
    totalSaved: number;
  };
  /** Financial health (from Peter) */
  financialHealth: {
    budgetUsedPercent: number;
    recentStressTriggers: number;
    savingsOnTrack: boolean;
  };
}

// ============================================================================
// INSIGHT STORE
// ============================================================================

// Per-user insight storage
const userInsights = new Map<string, CrossPersonaInsight[]>();

function getInsightsForUser(userId: string): CrossPersonaInsight[] {
  if (!userInsights.has(userId)) {
    userInsights.set(userId, []);
  }
  return userInsights.get(userId)!;
}

// ============================================================================
// INSIGHT MANAGEMENT
// ============================================================================

/**
 * Add an insight to be shared with another persona
 */
export function addCrossPersonaInsight(
  userId: string,
  insight: Omit<CrossPersonaInsight, 'id' | 'createdAt' | 'expiresAt'>
): CrossPersonaInsight {
  const insights = getInsightsForUser(userId);

  const fullInsight: CrossPersonaInsight = {
    ...insight,
    id: `insight_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    createdAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours default
  };

  insights.push(fullInsight);

  log.info(
    {
      userId,
      insightId: fullInsight.id,
      source: insight.source,
      target: insight.target,
      priority: insight.priority,
    },
    '📨 Cross-persona insight added'
  );

  // 🔔 Broadcast to connected WebSocket clients for real-time notifications
  // Only broadcast high-priority or proactive insights to avoid noise
  if (insight.priority === 'high' || insight.priority === 'critical' || insight.proactive) {
    insightsBroadcast.publishInsight(userId, fullInsight);
  }

  return fullInsight;
}

/**
 * Options for getInsightsForPersona (legacy API support)
 */
interface GetInsightsOptions {
  includeAcknowledged?: boolean;
  maxAge?: number;
  minConfidence?: number;
}

/**
 * Get insights targeted at a specific persona
 * Supports both new API (2 args) and legacy API (3 args with options)
 */
export function getInsightsForPersona(
  userId: string,
  personaId: string,
  options?: GetInsightsOptions
): SurfaceInsightItem[] {
  const insights = getInsightsForUser(userId);
  const now = Date.now();
  const normalizedPersona = normalizePersonaId(personaId);

  // Apply age filter if specified
  const maxAgeMs = options?.maxAge ? options.maxAge * 24 * 60 * 60 * 1000 : Infinity;

  const filtered = insights.filter(
    (insight) =>
      insight.expiresAt > now &&
      (insight.target === normalizedPersona || insight.target === 'all') &&
      now - insight.createdAt <= maxAgeMs
  );

  // Return in legacy format
  return filtered.map((insight) => ({
    insight: {
      id: insight.id,
      category: insight.category,
      summary: insight.content,
      sourcePersona: insight.source,
    },
    relevanceScore:
      insight.priority === 'critical'
        ? 1.0
        : insight.priority === 'high'
          ? 0.8
          : insight.priority === 'normal'
            ? 0.6
            : 0.4,
  }));
}

/**
 * Internal function to get raw insights for persona (used by other functions)
 */
function getInsightsForPersonaRaw(userId: string, personaId: string): CrossPersonaInsight[] {
  const insights = getInsightsForUser(userId);
  const now = Date.now();
  const normalizedPersona = normalizePersonaId(personaId);

  return insights.filter(
    (insight) =>
      insight.expiresAt > now && (insight.target === normalizedPersona || insight.target === 'all')
  );
}

/**
 * Get proactive insights that should be surfaced
 */
export function getProactiveInsights(userId: string): CrossPersonaInsight[] {
  const insights = getInsightsForUser(userId);
  const now = Date.now();

  return insights.filter((insight) => insight.expiresAt > now && insight.proactive);
}

/**
 * Mark an insight as consumed (for one-time insights)
 */
export function consumeInsight(userId: string, insightId: string): void {
  const insights = getInsightsForUser(userId);
  const index = insights.findIndex((i) => i.id === insightId);

  if (index >= 0) {
    const insight = insights[index];
    if (insight.oneTime) {
      insights.splice(index, 1);
      log.debug({ userId, insightId }, '🗑️ One-time insight consumed');
    }
  }
}

/**
 * Clear expired insights
 */
export function clearExpiredInsights(userId: string): number {
  const insights = getInsightsForUser(userId);
  const now = Date.now();
  const initialLength = insights.length;

  const activeInsights = insights.filter((i) => i.expiresAt > now);
  userInsights.set(userId, activeInsights);

  const removed = initialLength - activeInsights.length;
  if (removed > 0) {
    log.debug({ userId, removed }, '🧹 Expired insights cleared');
  }

  return removed;
}

// ============================================================================
// TEAM STATUS GENERATION
// ============================================================================

/**
 * Generate a cross-team status summary for any persona
 */
export async function generateTeamStatus(userId: string): Promise<TeamStatusSummary> {
  const status: TeamStatusSummary = {
    habitHealth: {
      activeHabits: 0,
      totalStreakDays: 0,
      keystoneActive: false,
      atRiskCount: 0,
    },
    goalStatus: {
      activeGoals: 0,
      nearingCompletion: 0,
      totalSaved: 0,
    },
    financialHealth: {
      budgetUsedPercent: 0,
      recentStressTriggers: 0,
      savingsOnTrack: false,
    },
  };

  try {
    // Habit health (Maya's domain)
    const productivityStore = getProductivityStore();
    const userData = productivityStore.getFullUserData(userId);
    const habits = userData.enhancedHabits || [];
    const activeHabits = habits.filter((h) => h.isActive && !h.isPaused);

    status.habitHealth.activeHabits = activeHabits.length;
    status.habitHealth.totalStreakDays = activeHabits.reduce((sum, h) => sum + h.currentStreak, 0);
    status.habitHealth.keystoneActive = activeHabits.some(
      (h) => h.isKeystone && h.currentStreak >= 7
    );
    status.habitHealth.atRiskCount = activeHabits.filter(
      (h) => h.longestStreak >= 7 && h.currentStreak <= 1
    ).length;

    // Goal status (Jordan's domain)
    const financialStore = getFinancialStore();
    await financialStore.loadUserData(userId);
    const goals = financialStore.getActiveSavingsGoals(userId);

    status.goalStatus.activeGoals = goals.length;
    status.goalStatus.nearingCompletion = goals.filter(
      (g) => g.currentAmount / g.targetAmount >= 0.8
    ).length;
    status.goalStatus.totalSaved = goals.reduce((sum, g) => sum + g.currentAmount, 0);

    // Financial health (Peter's domain)
    const budget = financialStore.getMainBudget(userId);
    if (budget) {
      status.financialHealth.budgetUsedPercent = Math.round(
        (budget.spent / budget.monthlyLimit) * 100
      );
    }

    const triggers = financialStore.getRecentSpendingTriggers(userId, 14);
    const stressEmotions = ['stressed', 'anxious', 'bored', 'lonely', 'tired'];
    status.financialHealth.recentStressTriggers = triggers.filter((t) =>
      stressEmotions.includes(t.emotion)
    ).length;

    // Determine if savings are on track
    const goalsOnTrack = goals.filter((g) => {
      if (!g.deadline) return true;
      const progress = g.currentAmount / g.targetAmount;
      const now = new Date();
      const deadline = new Date(g.deadline);
      const daysTotal = Math.ceil(
        (deadline.getTime() - new Date(g.createdAt || now).getTime()) / (1000 * 60 * 60 * 24)
      );
      const daysElapsed = Math.ceil(
        (now.getTime() - new Date(g.createdAt || now).getTime()) / (1000 * 60 * 60 * 24)
      );
      const expectedProgress = daysElapsed / daysTotal;
      return progress >= expectedProgress * 0.8;
    });
    status.financialHealth.savingsOnTrack = goalsOnTrack.length >= goals.length * 0.7;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Could not generate full team status');
  }

  return status;
}

// ============================================================================
// PROACTIVE INSIGHT GENERATION
// ============================================================================

/**
 * Scan for cross-persona insights that should be generated
 * This runs periodically to detect patterns and create shareable insights
 */
export async function scanForCrossPersonaInsights(userId: string): Promise<void> {
  try {
    const status = await generateTeamStatus(userId);

    // Peter → Maya: Stress spending detected
    if (status.financialHealth.recentStressTriggers >= 3) {
      addCrossPersonaInsight(userId, {
        source: 'peter',
        target: 'maya',
        priority: 'high',
        content: `I noticed ${status.financialHealth.recentStressTriggers} stress-driven purchases in the last 2 weeks. This might be a coping pattern - could a healthy habit help address the underlying stress?`,
        category: 'stress-spending-pattern',
        proactive: true,
        oneTime: true,
      });
    }

    // Maya → Jordan: Keystone driving momentum
    if (status.habitHealth.keystoneActive && status.habitHealth.totalStreakDays >= 30) {
      addCrossPersonaInsight(userId, {
        source: 'maya',
        target: 'jordan',
        priority: 'normal',
        content: `Great momentum happening! ${status.habitHealth.totalStreakDays} total streak days and keystone habit is solid. Perfect time to tackle a bigger goal if they're considering one.`,
        category: 'momentum-opportunity',
        proactive: false,
        oneTime: true,
      });
    }

    // Jordan → Nayan: Life transition detected
    if (status.goalStatus.nearingCompletion >= 2) {
      addCrossPersonaInsight(userId, {
        source: 'jordan',
        target: 'nayan',
        priority: 'low',
        content: `Multiple goals nearing completion (${status.goalStatus.nearingCompletion}). They might be approaching a life chapter transition - good time for reflection.`,
        category: 'transition-approaching',
        proactive: false,
        oneTime: true,
      });
    }

    // Maya → All: Celebration needed
    if (status.habitHealth.totalStreakDays >= 50) {
      addCrossPersonaInsight(userId, {
        source: 'maya',
        target: 'all',
        priority: 'high',
        content: `🎉 CELEBRATION: ${status.habitHealth.totalStreakDays} total streak days across habits! This is massive progress worth acknowledging.`,
        category: 'streak-milestone',
        proactive: true,
        oneTime: true,
      });
    }

    // Peter → Jordan: Budget constraint for planning
    if (status.financialHealth.budgetUsedPercent > 90) {
      addCrossPersonaInsight(userId, {
        source: 'peter',
        target: 'jordan',
        priority: 'normal',
        content: `Budget is ${status.financialHealth.budgetUsedPercent}% used this month. If they're planning anything new, timeline might need adjustment.`,
        category: 'budget-constraint',
        proactive: false,
        oneTime: true,
      });
    }

    // System → All: At-risk habits
    if (status.habitHealth.atRiskCount >= 2) {
      addCrossPersonaInsight(userId, {
        source: 'system',
        target: 'all',
        priority: 'high',
        content: `${status.habitHealth.atRiskCount} habits at risk (had streaks, now broken). Self-compassion needed - setbacks are data, not failure.`,
        category: 'habit-support-needed',
        proactive: true,
        oneTime: true,
      });
    }

    log.debug({ userId }, '🔍 Cross-persona insight scan complete');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Error scanning for cross-persona insights');
  }
}

// ============================================================================
// INSIGHT BRIEFING FOR HANDOFFS
// ============================================================================

/**
 * Build a complete insight briefing for a persona during handoff
 */
export async function buildInsightBriefingForHandoff(
  userId: string,
  targetPersonaId: string
): Promise<InsightBriefing> {
  // Clear expired insights first
  clearExpiredInsights(userId);

  // Scan for new insights
  await scanForCrossPersonaInsights(userId);

  const incomingInsights = getInsightsForPersonaRaw(userId, targetPersonaId);
  const teamStatus = await generateTeamStatus(userId);

  // Generate proactive discoveries
  const proactiveDiscoveries: string[] = [];

  // Add high-priority proactive insights
  const proactiveInsights = getProactiveInsights(userId);
  for (const insight of proactiveInsights.filter(
    (i) => i.priority === 'high' || i.priority === 'critical'
  )) {
    proactiveDiscoveries.push(`From ${insight.source}: ${insight.content}`);
  }

  // Add status-based discoveries
  if (teamStatus.habitHealth.keystoneActive) {
    proactiveDiscoveries.push('Keystone habit driving momentum - foundation is solid');
  }
  if (teamStatus.goalStatus.nearingCompletion > 0) {
    proactiveDiscoveries.push(
      `${teamStatus.goalStatus.nearingCompletion} goal(s) close to completion - celebration opportunity`
    );
  }
  if (!teamStatus.financialHealth.savingsOnTrack) {
    proactiveDiscoveries.push('Savings may need attention - some goals falling behind timeline');
  }

  return {
    incomingInsights,
    teamStatus,
    proactiveDiscoveries,
  };
}

/**
 * Format insight briefing as prompt injection
 */
export function formatInsightBriefingForPrompt(briefing: InsightBriefing): string {
  const lines: string[] = [];

  lines.push('[CROSS-TEAM BRIEFING]');

  // Team status summary
  lines.push('\n=== TEAM STATUS ===');
  const { teamStatus } = briefing;
  lines.push(
    `• Habits: ${teamStatus.habitHealth.activeHabits} active, ${teamStatus.habitHealth.totalStreakDays} streak days, ` +
      `keystone ${teamStatus.habitHealth.keystoneActive ? '✅' : '❌'}`
  );
  lines.push(
    `• Goals: ${teamStatus.goalStatus.activeGoals} active, ${teamStatus.goalStatus.nearingCompletion} near completion, ` +
      `$${teamStatus.goalStatus.totalSaved.toLocaleString()} saved`
  );
  lines.push(
    `• Budget: ${teamStatus.financialHealth.budgetUsedPercent}% used, ` +
      `${teamStatus.financialHealth.recentStressTriggers} stress triggers recently`
  );

  // Incoming insights from other personas
  if (briefing.incomingInsights.length > 0) {
    lines.push('\n=== INSIGHTS FROM TEAM ===');
    for (const insight of briefing.incomingInsights) {
      const priorityEmoji =
        insight.priority === 'critical'
          ? '🚨'
          : insight.priority === 'high'
            ? '⚡'
            : insight.priority === 'normal'
              ? '💡'
              : '📝';
      lines.push(`${priorityEmoji} [${insight.source}]: ${insight.content}`);
    }
  }

  // Proactive discoveries
  if (briefing.proactiveDiscoveries.length > 0) {
    lines.push('\n=== PROACTIVE DISCOVERIES ===');
    for (const discovery of briefing.proactiveDiscoveries.slice(0, 3)) {
      lines.push(`• ${discovery}`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizePersonaId(personaId: string): InsightSource {
  const normalized = personaId.toLowerCase();

  if (normalized.includes('peter')) return 'peter';
  if (normalized.includes('maya')) return 'maya';
  if (normalized.includes('jordan')) return 'jordan';
  if (normalized.includes('nayan')) return 'nayan';
  if (normalized.includes('ferni')) return 'ferni';

  return 'ferni'; // Default to coordinator
}

// ============================================================================
// EXPORTS
// ============================================================================

// ============================================================================
// BACKWARDS COMPATIBILITY EXPORTS
// These exports support existing code that was expecting different function names
// ============================================================================

export type PersonaId = InsightSource | 'alex' | 'jack';

/**
 * Record an insight (legacy API - flexible arguments)
 */
export function recordInsight(
  userId: string,
  source: string,
  contentOrOptions:
    | string
    | {
        category?: string;
        content: string;
        summary?: string;
        confidence?: number;
        priority?: string;
        evidence?: string;
        expiresInDays?: number;
        surfaceInNextConversation?: boolean;
      }
): CrossPersonaInsight {
  if (typeof contentOrOptions === 'string') {
    // Simple 3-arg call: (userId, source, content)
    return addCrossPersonaInsight(userId, {
      source: normalizePersonaId(source),
      target: 'all',
      content: contentOrOptions,
      priority: 'normal',
      category: 'general',
      proactive: false,
      oneTime: false,
    });
  }

  // Object call: (userId, source, { content, category, priority, ... })
  const opts = contentOrOptions;
  return addCrossPersonaInsight(userId, {
    source: normalizePersonaId(source),
    target: 'all',
    content: opts.content,
    priority: (opts.priority as InsightPriority) || 'normal',
    category: opts.category || 'general',
    proactive: opts.surfaceInNextConversation || false,
    oneTime: false,
    metadata: {
      summary: opts.summary,
      confidence: opts.confidence,
      evidence: opts.evidence,
      expiresInDays: opts.expiresInDays,
    },
  });
}

/**
 * Load insights for a user (alias for clearing and scanning)
 */
export async function loadInsights(userId: string): Promise<void> {
  clearExpiredInsights(userId);
  await scanForCrossPersonaInsights(userId);
}

/**
 * Surface insight item - wrapper type for backwards compatibility
 */
interface SurfaceInsightItem {
  insight: {
    id: string;
    category: string;
    summary: string;
    sourcePersona: string;
  };
  relevanceScore: number;
}

/**
 * Get insights to surface (legacy API - returns wrapped items with old shape)
 */
export function getInsightsToSurface(
  userId: string,
  personaId?: string,
  _limit?: number
): SurfaceInsightItem[] {
  let insights: CrossPersonaInsight[];
  if (personaId) {
    insights = getInsightsForPersonaRaw(userId, personaId);
  } else {
    insights = getProactiveInsights(userId);
  }

  // Wrap in expected legacy format
  return insights.map((insight) => ({
    insight: {
      id: insight.id,
      category: insight.category,
      summary: insight.content,
      sourcePersona: insight.source,
    },
    relevanceScore:
      insight.priority === 'critical'
        ? 1.0
        : insight.priority === 'high'
          ? 0.8
          : insight.priority === 'normal'
            ? 0.6
            : 0.4,
  }));
}

/**
 * Acknowledge an insight (legacy API - returns Promise)
 */
export async function acknowledgeInsight(
  userId: string,
  insightId: string,
  _personaId?: string
): Promise<void> {
  consumeInsight(userId, insightId);
  return Promise.resolve();
}

/**
 * Build insight context for injection (legacy API - takes options)
 */
export function buildInsightContext(
  userId: string,
  personaId: string,
  _options?: { maxInsights?: number }
): string {
  // Synchronous version - won't have fresh insights but avoids async issues
  clearExpiredInsights(userId);
  const insights = getInsightsForPersonaRaw(userId, personaId);

  if (insights.length === 0) {
    return '';
  }

  const lines: string[] = ['[CROSS-TEAM INSIGHTS]'];
  for (const insight of insights.slice(0, _options?.maxInsights || 5)) {
    const priorityEmoji =
      insight.priority === 'critical'
        ? '🚨'
        : insight.priority === 'high'
          ? '⚡'
          : insight.priority === 'normal'
            ? '💡'
            : '📝';
    lines.push(`${priorityEmoji} [${insight.source}]: ${insight.content}`);
  }

  return lines.join('\n');
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  // New API
  addCrossPersonaInsight,
  getInsightsForPersona,
  getProactiveInsights,
  consumeInsight,
  clearExpiredInsights,
  generateTeamStatus,
  scanForCrossPersonaInsights,
  buildInsightBriefingForHandoff,
  formatInsightBriefingForPrompt,
  // Backwards compatibility
  recordInsight,
  loadInsights,
  getInsightsToSurface,
  acknowledgeInsight,
  buildInsightContext,
};
