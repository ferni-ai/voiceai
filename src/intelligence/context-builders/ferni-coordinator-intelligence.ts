/**
 * Ferni Coordinator Intelligence Context Builder
 *
 * > "Six brilliant minds. One conversation. One coordinator."
 *
 * Ferni is the coordinator who sees the whole picture. This builder gives
 * Ferni intelligent handoff suggestions based on cross-team insights:
 *
 * - When Peter notices stress patterns → suggest Maya for habits
 * - When Maya sees habit decay → suggest Jordan for milestone reset
 * - When Jordan has deadlines → suggest Alex for scheduling
 * - When deep existential questions → suggest Nayan for wisdom
 *
 * This makes Ferni's handoffs feel intelligent and proactive, not reactive.
 *
 * @module intelligence/context-builders/ferni-coordinator-intelligence
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  BuilderCategory,
  createHighInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';
import {
  getInsightsForPersona,
  generateTeamStatus,
  type PersonaId,
  type CrossPersonaInsight,
  type TeamStatusSummary,
} from '../../services/cross-persona-insights.js';

const log = createLogger({ module: 'context:ferni-coordinator' });

// ============================================================================
// TYPES
// ============================================================================

interface HandoffSuggestion {
  targetPersona: PersonaId;
  reason: string;
  trigger: string;
  urgency: 'low' | 'normal' | 'high' | 'urgent';
  suggestedPhrase?: string;
}

interface CoordinatorBriefing {
  /** Current team status overview */
  teamStatus: TeamStatusSummary | null;
  /** Suggested handoffs based on insights */
  handoffSuggestions: HandoffSuggestion[];
  /** Key patterns to mention naturally */
  patternsToSurface: string[];
  /** Team members with urgent insights */
  urgentFromTeam: string[];
}

// ============================================================================
// HANDOFF SUGGESTION LOGIC
// ============================================================================

// Helper: Group insights by source
function groupInsightsBySource(
  insights: CrossPersonaInsight[]
): Map<string, CrossPersonaInsight[]> {
  const bySource = new Map<string, CrossPersonaInsight[]>();
  for (const insight of insights) {
    const arr = bySource.get(insight.source) || [];
    arr.push(insight);
    bySource.set(insight.source, arr);
  }
  return bySource;
}

// Helper: Analyze Peter's insights for handoff opportunities
function analyzePeterInsights(insights: CrossPersonaInsight[]): HandoffSuggestion[] {
  return insights
    .filter((i) => i.content.toLowerCase().includes('stress') || i.content.includes('spending'))
    .map((insight) => ({
      targetPersona: 'maya' as const,
      reason: 'Peter noticed stress patterns in spending',
      trigger: insight.content,
      urgency: insight.priority === 'high' ? ('high' as const) : ('normal' as const),
      suggestedPhrase:
        'I noticed Peter flagged some stress patterns. Maya might help build some habits around that - want me to get her?',
    }));
}

// Helper: Analyze Maya's insights for handoff opportunities
function analyzeMayaInsights(insights: CrossPersonaInsight[]): HandoffSuggestion[] {
  return insights
    .filter((i) => {
      const lower = i.content.toLowerCase();
      const isHabitRelated = lower.includes('streak') || lower.includes('habit');
      const isStruggling = lower.includes('broken') || lower.includes('struggling');
      return isHabitRelated && isStruggling;
    })
    .map((insight) => ({
      targetPersona: 'jordan' as const,
      reason: 'Maya noticed habit struggles that might need goal adjustment',
      trigger: insight.content,
      urgency: 'normal' as const,
      suggestedPhrase:
        'Maya mentioned some habit patterns that might connect to your goals. Want Jordan to take a look?',
    }));
}

// Helper: Analyze Jordan's insights for handoff opportunities
function analyzeJordanInsights(insights: CrossPersonaInsight[]): HandoffSuggestion[] {
  return insights
    .filter((i) => i.content.toLowerCase().includes('deadline') || i.content.includes('upcoming'))
    .map((insight) => ({
      targetPersona: 'alex' as const,
      reason: 'Jordan has upcoming deadlines that need scheduling',
      trigger: insight.content,
      urgency: insight.priority === 'critical' ? ('urgent' as const) : ('normal' as const),
      suggestedPhrase:
        'Jordan flagged some deadlines coming up. Alex could help get things scheduled - want me to bring them in?',
    }));
}

// Helper: Analyze team status for handoff opportunities
function analyzeTeamStatusForHandoffs(teamStatus: TeamStatusSummary): HandoffSuggestion[] {
  const suggestions: HandoffSuggestion[] = [];

  if (teamStatus.habitHealth.atRiskCount > 2) {
    suggestions.push({
      targetPersona: 'maya',
      reason: `${teamStatus.habitHealth.atRiskCount} habits at risk`,
      trigger: 'Multiple habits showing streak breaks',
      urgency: 'high',
      suggestedPhrase:
        "I'm seeing a few habits that could use some attention. Maya's great at getting things back on track - interested?",
    });
  }

  if (
    teamStatus.financialHealth.budgetUsedPercent > 90 ||
    !teamStatus.financialHealth.savingsOnTrack
  ) {
    suggestions.push({
      targetPersona: 'peter',
      reason: 'Budget showing signs of stress',
      trigger: 'Financial health indicators showing concern',
      urgency: 'normal',
      suggestedPhrase:
        'Your budget is showing some patterns Peter might want to look at. Want to dig into that?',
    });
  }

  if (teamStatus.goalStatus.nearingCompletion > 0) {
    suggestions.push({
      targetPersona: 'jordan',
      reason: `${teamStatus.goalStatus.nearingCompletion} goals almost complete`,
      trigger: 'Goals approaching finish line',
      urgency: 'low',
      suggestedPhrase:
        "By the way, you've got goals that are almost done! Jordan would love to help plan a celebration.",
    });
  }

  return suggestions;
}

function analyzeInsightsForHandoffs(
  insights: CrossPersonaInsight[],
  teamStatus: TeamStatusSummary | null
): HandoffSuggestion[] {
  const bySource = groupInsightsBySource(insights);

  const suggestions: HandoffSuggestion[] = [
    ...analyzePeterInsights(bySource.get('peter') || []),
    ...analyzeMayaInsights(bySource.get('maya') || []),
    ...analyzeJordanInsights(bySource.get('jordan') || []),
    ...(teamStatus ? analyzeTeamStatusForHandoffs(teamStatus) : []),
  ];

  // Sort by urgency
  const urgencyOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  suggestions.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

  return suggestions;
}

function identifyPatternsToSurface(
  insights: CrossPersonaInsight[],
  teamStatus: TeamStatusSummary | null
): string[] {
  const patterns: string[] = [];

  // Extract key patterns from insights
  const highPriorityInsights = insights.filter(
    (i) => i.priority === 'high' || i.priority === 'critical'
  );

  for (const insight of highPriorityInsights.slice(0, 3)) {
    patterns.push(`[${insight.source}] ${insight.content}`);
  }

  // Add team status patterns
  if (teamStatus) {
    if (teamStatus.habitHealth.keystoneActive) {
      patterns.push('Keystone habit is active - great foundation!');
    }
    if (teamStatus.goalStatus.totalSaved > 1000) {
      patterns.push(
        `Over $${teamStatus.goalStatus.totalSaved.toLocaleString()} saved toward goals`
      );
    }
  }

  return patterns;
}

function identifyUrgentTeamMembers(insights: CrossPersonaInsight[]): string[] {
  const urgent: string[] = [];

  const urgentInsights = insights.filter((i) => i.priority === 'critical');
  const urgentSources = new Set(urgentInsights.map((i) => i.source));

  for (const source of urgentSources) {
    const personaName = getPersonaDisplayName(source as PersonaId);
    urgent.push(personaName);
  }

  return urgent;
}

function getPersonaDisplayName(personaId: string): string {
  const names: Record<string, string> = {
    ferni: 'Ferni',
    maya: 'Maya',
    'maya-santos': 'Maya',
    peter: 'Peter',
    'peter-john': 'Peter',
    alex: 'Alex',
    'alex-chen': 'Alex',
    jordan: 'Jordan',
    'jordan-taylor': 'Jordan',
    nayan: 'Nayan',
    'nayan-patel': 'Nayan',
    jack: 'Jack',
    system: 'System',
  };
  return names[personaId] || personaId;
}

// ============================================================================
// BRIEFING BUILDER
// ============================================================================

async function buildCoordinatorBriefing(userId: string): Promise<CoordinatorBriefing> {
  let teamStatus: TeamStatusSummary | null = null;
  let insights: CrossPersonaInsight[] = [];

  try {
    teamStatus = await generateTeamStatus(userId);
  } catch (err) {
    log.debug({ error: String(err) }, 'Could not get team status');
  }

  try {
    // Get insights targeted at Ferni (coordinator)
    const rawInsights = getInsightsForPersona(userId, 'ferni');
    // Extract the insight objects from the wrapped format
    insights = rawInsights.map((item) => {
      if ('insight' in item && typeof item.insight === 'object') {
        return item.insight as unknown as CrossPersonaInsight;
      }
      return item as unknown as CrossPersonaInsight;
    });
  } catch (err) {
    log.debug({ error: String(err) }, 'Could not get insights');
  }

  const handoffSuggestions = analyzeInsightsForHandoffs(insights, teamStatus);
  const patternsToSurface = identifyPatternsToSurface(insights, teamStatus);
  const urgentFromTeam = identifyUrgentTeamMembers(insights);

  return {
    teamStatus,
    handoffSuggestions,
    patternsToSurface,
    urgentFromTeam,
  };
}

// ============================================================================
// FORMATTING
// ============================================================================

function formatBriefingForInjection(briefing: CoordinatorBriefing): string[] {
  const sections: string[] = ['[COORDINATOR INTELLIGENCE]'];

  // Urgent team members
  if (briefing.urgentFromTeam.length > 0) {
    sections.push(`\n🚨 URGENT: ${briefing.urgentFromTeam.join(', ')} flagged something important`);
  }

  // Handoff suggestions
  if (briefing.handoffSuggestions.length > 0) {
    sections.push('\n--- SMART HANDOFF OPPORTUNITIES ---');
    sections.push("These aren't commands - they're conversation tools:");

    for (const suggestion of briefing.handoffSuggestions.slice(0, 3)) {
      const urgencyEmoji =
        suggestion.urgency === 'urgent' ? '🚨' : suggestion.urgency === 'high' ? '⚡' : '💡';
      sections.push(`\n${urgencyEmoji} → ${getPersonaDisplayName(suggestion.targetPersona)}`);
      sections.push(`   Reason: ${suggestion.reason}`);
      if (suggestion.suggestedPhrase) {
        sections.push(`   Try saying: "${suggestion.suggestedPhrase}"`);
      }
    }
  }

  // Patterns to naturally mention
  if (briefing.patternsToSurface.length > 0) {
    sections.push('\n--- PATTERNS TO SURFACE NATURALLY ---');
    sections.push('Weave these into conversation when relevant:');
    for (const pattern of briefing.patternsToSurface) {
      sections.push(`• ${pattern}`);
    }
  }

  // Team health snapshot
  if (briefing.teamStatus) {
    sections.push('\n--- TEAM HEALTH SNAPSHOT ---');
    const ts = briefing.teamStatus;
    sections.push(
      `• Habits: ${ts.habitHealth.activeHabits} active, ${ts.habitHealth.totalStreakDays} streak days`
    );
    sections.push(
      `• Goals: ${ts.goalStatus.activeGoals} active, ${ts.goalStatus.nearingCompletion} almost done`
    );
    sections.push(
      `• Budget: ${ts.financialHealth.budgetUsedPercent < 90 && ts.financialHealth.savingsOnTrack ? '✅ On track' : '⚠️ Needs attention'}`
    );
  }

  sections.push(
    "\n[Remember: You're the coordinator. These insights help you guide the conversation to the right team member at the right time. Be natural, not pushy.]"
  );

  return sections;
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

async function buildFerniCoordinatorIntelligenceContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];

  // Only for Ferni
  const currentPersona = input.services?.personaId || '';
  const isFerni = ['ferni', 'coordinator', 'life-coach'].includes(currentPersona.toLowerCase());

  if (!isFerni) return injections;

  const userId = input.services?.userId || 'anonymous';

  try {
    const briefing = await buildCoordinatorBriefing(userId);

    // Only inject if there's meaningful content
    const hasContent =
      briefing.handoffSuggestions.length > 0 ||
      briefing.patternsToSurface.length > 0 ||
      briefing.urgentFromTeam.length > 0;

    if (hasContent) {
      const formattedSections = formatBriefingForInjection(briefing);

      // Use high priority for urgent items, standard otherwise
      const hasUrgent = briefing.urgentFromTeam.length > 0;

      if (hasUrgent) {
        injections.push(createHighInjection(formattedSections.join('\n'), 'coordinator_intel'));
      } else {
        injections.push(createStandardInjection(formattedSections.join('\n'), 'coordinator_intel'));
      }

      log.info(
        {
          userId,
          suggestions: briefing.handoffSuggestions.length,
          patterns: briefing.patternsToSurface.length,
        },
        '🧠 Ferni loaded with coordinator intelligence'
      );
    } else {
      injections.push(
        createStandardInjection(
          '[Coordinator Ready: Team is running smoothly. No urgent handoff opportunities detected.]',
          'coordinator_intel'
        )
      );
    }
  } catch (err) {
    log.warn({ error: String(err) }, 'Failed to build coordinator intelligence');
  }

  return injections;
}

// ============================================================================
// REGISTRATION
// ============================================================================

registerContextBuilder({
  name: 'ferni-coordinator-intelligence',
  description: 'Gives Ferni smart handoff suggestions based on cross-team insights',
  priority: 40, // High priority so Ferni sees this early
  category: BuilderCategory.PERSONA,
  build: buildFerniCoordinatorIntelligenceContext,
});

export { buildFerniCoordinatorIntelligenceContext };
