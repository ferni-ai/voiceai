/**
 * User Knowledge Context Builder - LLM-Ready Formatting
 *
 * Formats aggregated user knowledge into concise, injectable context
 * strings for the LLM to provide personalized responses.
 *
 * > "Your best friend forgets. We don't."
 *
 * @module intelligence/user-knowledge/context-builder
 */

import type { UserKnowledge, ContextFormatOptions } from './types.js';

// ============================================================================
// TOKEN ESTIMATION
// ============================================================================

/**
 * Rough token estimation (4 chars ≈ 1 token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ============================================================================
// MAIN FORMATTER
// ============================================================================

/**
 * Format user knowledge for LLM context injection
 */
export function formatKnowledgeForContext(
  knowledge: UserKnowledge,
  options?: ContextFormatOptions
): string {
  const maxTokens = options?.maxTokens ?? 600;
  const style = options?.style ?? 'concise';
  const includeHeaders = options?.includeHeaders ?? true;
  const prioritySections = options?.prioritySections ?? [
    'boundaries',
    'emotional',
    'relationships',
    'aspirations',
  ];

  const sections: string[] = [];

  // Always start with user identification if known
  if (knowledge.identity.name) {
    sections.push(`[USER] ${knowledge.identity.name}`);
  }

  // Build sections in priority order
  for (const section of prioritySections) {
    const sectionContent = buildSection(section, knowledge, style, includeHeaders);
    if (sectionContent) {
      sections.push(sectionContent);
    }
  }

  // Add remaining sections if we have token budget
  const allSections: Array<keyof UserKnowledge> = [
    'lifestyle',
    'patterns',
    'sharedHistory',
    'work',
    'communication',
    'wellness',
  ];

  for (const section of allSections) {
    if (!prioritySections.includes(section)) {
      const sectionContent = buildSection(section, knowledge, style, includeHeaders);
      if (sectionContent) {
        sections.push(sectionContent);
      }
    }
  }

  // Build full context
  let context = sections.join('\n\n');

  // Truncate if over token limit
  while (estimateTokens(context) > maxTokens && sections.length > 1) {
    sections.pop();
    context = sections.join('\n\n');
  }

  return context;
}

/**
 * Get abbreviated context (under 200 tokens)
 */
export function getKnowledgeContextForLLM(knowledge: UserKnowledge): string {
  return formatKnowledgeForContext(knowledge, {
    maxTokens: 200,
    style: 'bullet',
    includeHeaders: false,
    prioritySections: ['boundaries', 'aspirations'],
  });
}

// ============================================================================
// SECTION BUILDERS
// ============================================================================

function buildSection(
  section: string,
  knowledge: UserKnowledge,
  style: 'detailed' | 'concise' | 'bullet',
  includeHeaders: boolean
): string | null {
  switch (section) {
    case 'boundaries':
      return buildBoundariesSection(knowledge, style, includeHeaders);
    case 'emotional':
      return buildEmotionalSection(knowledge, style, includeHeaders);
    case 'relationships':
      return buildRelationshipsSection(knowledge, style, includeHeaders);
    case 'aspirations':
      return buildAspirationsSection(knowledge, style, includeHeaders);
    case 'lifestyle':
      return buildLifestyleSection(knowledge, style, includeHeaders);
    case 'patterns':
      return buildPatternsSection(knowledge, style, includeHeaders);
    case 'sharedHistory':
      return buildSharedHistorySection(knowledge, style, includeHeaders);
    case 'work':
      return buildWorkSection(knowledge, style, includeHeaders);
    case 'communication':
      return buildCommunicationSection(knowledge, style, includeHeaders);
    case 'wellness':
      return buildWellnessSection(knowledge, style, includeHeaders);
    default:
      return null;
  }
}

function buildBoundariesSection(
  knowledge: UserKnowledge,
  style: string,
  includeHeaders: boolean
): string | null {
  const { boundaries } = knowledge;
  const parts: string[] = [];

  if (boundaries.avoidTopics.length > 0) {
    parts.push(`⚠️ AVOID: ${boundaries.avoidTopics.slice(0, 5).join(', ')}`);
  }

  if (boundaries.sensitivities.length > 0) {
    const sensitive = boundaries.sensitivities.filter((s) => s.severity !== 'low');
    if (sensitive.length > 0) {
      parts.push(`⚠️ SENSITIVE: ${sensitive.map((s) => s.topic).join(', ')}`);
    }
  }

  // Ferni's commitments (promises we made)
  const pendingCommitments = boundaries.ferniCommitments.filter((c) => c.status === 'pending');
  if (pendingCommitments.length > 0) {
    parts.push(
      `📝 FERNI PROMISED: ${pendingCommitments
        .slice(0, 3)
        .map((c) => c.description)
        .join('; ')}`
    );
  }

  if (parts.length === 0) return null;

  const header = includeHeaders ? '[BOUNDARIES & COMMITMENTS]\n' : '';
  return header + parts.join('\n');
}

function buildEmotionalSection(
  knowledge: UserKnowledge,
  style: string,
  includeHeaders: boolean
): string | null {
  const { emotional } = knowledge;
  const parts: string[] = [];

  // Emotional trajectory
  if (emotional.trajectory) {
    const trendEmoji =
      emotional.trajectory.trend === 'improving'
        ? '📈'
        : emotional.trajectory.trend === 'declining'
          ? '📉'
          : '➡️';
    parts.push(
      `${trendEmoji} Emotional trend: ${emotional.trajectory.trend} (${emotional.trajectory.period})`
    );
  }

  // Values
  if (emotional.values.length > 0) {
    const topValues = emotional.values
      .slice(0, 3)
      .map((v) => v.value)
      .join(', ');
    parts.push(`💎 Core values: ${topValues}`);
  }

  // Current state
  if (emotional.currentState) {
    parts.push(
      `Current mood: ${emotional.currentState.primary} (intensity: ${Math.round(emotional.currentState.intensity * 10)}/10)`
    );
  }

  if (parts.length === 0) return null;

  const header = includeHeaders ? '[EMOTIONAL STATE]\n' : '';
  return header + parts.join('\n');
}

function buildRelationshipsSection(
  knowledge: UserKnowledge,
  style: string,
  includeHeaders: boolean
): string | null {
  const { relationships } = knowledge;
  const parts: string[] = [];

  // Key people
  if (relationships.keyPeople.length > 0) {
    const critical = relationships.keyPeople.filter((p) => p.importance === 'critical');
    const high = relationships.keyPeople.filter((p) => p.importance === 'high');

    if (critical.length > 0) {
      parts.push(`👨‍👩‍👧‍👦 Key: ${critical.map((p) => `${p.name} (${p.relationship})`).join(', ')}`);
    }
    if (high.length > 0 && style === 'detailed') {
      parts.push(`Family: ${high.map((p) => `${p.name} (${p.relationship})`).join(', ')}`);
    }
  }

  // Relationship patterns
  if (relationships.patterns.length > 0 && style === 'detailed') {
    parts.push(`Patterns: ${relationships.patterns[0].pattern}`);
  }

  if (parts.length === 0) return null;

  const header = includeHeaders ? '[RELATIONSHIPS]\n' : '';
  return header + parts.join('\n');
}

function buildAspirationsSection(
  knowledge: UserKnowledge,
  style: string,
  includeHeaders: boolean
): string | null {
  const { aspirations } = knowledge;
  const parts: string[] = [];

  // Dreams
  const activeDreams = aspirations.dreams.filter((d) => d.status === 'active');
  if (activeDreams.length > 0) {
    parts.push(`🌟 Dreams: ${activeDreams.slice(0, 3).map((d) => d.description).join('; ')}`);
  }

  // Pending commitments
  const pendingCommitments = aspirations.commitments.filter((c) => c.status === 'pending');
  if (pendingCommitments.length > 0) {
    parts.push(
      `📋 Commitments: ${pendingCommitments.slice(0, 3).map((c) => c.description).join('; ')}`
    );
  }

  // Overdue commitments (important!)
  const overdueCommitments = aspirations.commitments.filter((c) => c.status === 'overdue');
  if (overdueCommitments.length > 0) {
    parts.push(
      `⚠️ OVERDUE: ${overdueCommitments.slice(0, 2).map((c) => c.description).join('; ')}`
    );
  }

  if (parts.length === 0) return null;

  const header = includeHeaders ? '[ASPIRATIONS]\n' : '';
  return header + parts.join('\n');
}

function buildLifestyleSection(
  knowledge: UserKnowledge,
  style: string,
  includeHeaders: boolean
): string | null {
  const { lifestyle } = knowledge;
  const parts: string[] = [];

  // Entertainment
  if (lifestyle.entertainment.musicLikes.length > 0) {
    parts.push(`🎵 Music: ${lifestyle.entertainment.musicLikes.slice(0, 3).join(', ')}`);
  }
  if (lifestyle.entertainment.sportsTeams.length > 0) {
    parts.push(`🏈 Teams: ${lifestyle.entertainment.sportsTeams.slice(0, 2).join(', ')}`);
  }

  // Food
  if (lifestyle.food.cuisineLikes.length > 0) {
    parts.push(`🍽️ Food: ${lifestyle.food.cuisineLikes.slice(0, 3).join(', ')}`);
  }
  if (lifestyle.food.dietaryRestrictions.length > 0) {
    parts.push(`⚠️ Dietary: ${lifestyle.food.dietaryRestrictions.join(', ')}`);
  }

  // Travel
  if (lifestyle.travel.bucketList.length > 0 && style === 'detailed') {
    parts.push(`✈️ Wants to visit: ${lifestyle.travel.bucketList.slice(0, 2).join(', ')}`);
  }

  if (parts.length === 0) return null;

  const header = includeHeaders ? '[LIFESTYLE]\n' : '';
  return header + parts.join('\n');
}

function buildPatternsSection(
  knowledge: UserKnowledge,
  style: string,
  includeHeaders: boolean
): string | null {
  const { patterns } = knowledge;
  const parts: string[] = [];

  // Behavioral patterns not yet surfaced
  const unsurfaced = patterns.behaviors.filter((b) => !b.surfacedToUser && b.confidence > 0.6);
  if (unsurfaced.length > 0 && style !== 'bullet') {
    parts.push(`🔍 Pattern observed: "${unsurfaced[0].pattern}"`);
  }

  // Cross-domain correlations
  if (patterns.correlations.length > 0) {
    parts.push(`💡 Insight: ${patterns.correlations[0].insight}`);
  }

  // Temporal patterns
  if (patterns.temporal.length > 0) {
    parts.push(`⏰ ${patterns.temporal[0].description}`);
  }

  if (parts.length === 0) return null;

  const header = includeHeaders ? '[PATTERNS]\n' : '';
  return header + parts.join('\n');
}

function buildSharedHistorySection(
  knowledge: UserKnowledge,
  style: string,
  includeHeaders: boolean
): string | null {
  const { sharedHistory } = knowledge;
  const parts: string[] = [];

  // Conversation count
  if (sharedHistory.totalConversations > 0) {
    parts.push(`📊 ${sharedHistory.totalConversations} conversations together`);
  }

  // Inside jokes (callbacks)
  if (sharedHistory.insideJokes.length > 0 && style === 'detailed') {
    parts.push(`😄 Callback: "${sharedHistory.insideJokes[0].reference}"`);
  }

  // Open loops
  const unresolvedLoops = sharedHistory.openLoops.filter((l) => !l.resolved);
  if (unresolvedLoops.length > 0) {
    parts.push(
      `🔄 Follow up on: ${unresolvedLoops.slice(0, 2).map((l) => l.topic).join(', ')}`
    );
  }

  if (parts.length === 0) return null;

  const header = includeHeaders ? '[OUR HISTORY]\n' : '';
  return header + parts.join('\n');
}

function buildWorkSection(
  knowledge: UserKnowledge,
  style: string,
  includeHeaders: boolean
): string | null {
  const { work } = knowledge;
  const parts: string[] = [];

  if (work.role || work.company) {
    const role = [work.role, work.company].filter(Boolean).join(' at ');
    parts.push(`💼 ${role}`);
  }

  if (work.stressors.length > 0) {
    parts.push(`⚠️ Work stress: ${work.stressors.slice(0, 2).join(', ')}`);
  }

  if (parts.length === 0) return null;

  const header = includeHeaders ? '[WORK]\n' : '';
  return header + parts.join('\n');
}

function buildCommunicationSection(
  knowledge: UserKnowledge,
  style: string,
  includeHeaders: boolean
): string | null {
  const { communication } = knowledge;
  const parts: string[] = [];

  if (communication.preferredStyle) {
    parts.push(`Prefers ${communication.preferredStyle} communication`);
  }

  if (communication.socialStyle) {
    parts.push(`${communication.socialStyle} personality`);
  }

  if (parts.length === 0) return null;

  const header = includeHeaders ? '[COMMUNICATION]\n' : '';
  return header + parts.join('\n');
}

function buildWellnessSection(
  knowledge: UserKnowledge,
  style: string,
  includeHeaders: boolean
): string | null {
  const { wellness } = knowledge;
  const parts: string[] = [];

  // Allergies are critical
  if (wellness.health.allergies.length > 0) {
    parts.push(`⚠️ ALLERGIES: ${wellness.health.allergies.join(', ')}`);
  }

  // Fitness
  if (wellness.fitness.exercises.length > 0 && style === 'detailed') {
    parts.push(`🏋️ Exercise: ${wellness.fitness.exercises.slice(0, 2).join(', ')}`);
  }

  // Mental health practices
  if (wellness.mental.practices.length > 0 && style === 'detailed') {
    parts.push(`🧘 Practices: ${wellness.mental.practices.slice(0, 2).join(', ')}`);
  }

  if (parts.length === 0) return null;

  const header = includeHeaders ? '[WELLNESS]\n' : '';
  return header + parts.join('\n');
}

// ============================================================================
// SPECIALIZED CONTEXT BUILDERS
// ============================================================================

/**
 * Build context focused on boundaries and sensitivities
 * Use this for safety-critical situations
 */
export function buildBoundaryContext(knowledge: UserKnowledge): string {
  const parts: string[] = ['[CRITICAL - BOUNDARIES & SENSITIVITIES]'];

  // Avoid topics
  if (knowledge.boundaries.avoidTopics.length > 0) {
    parts.push(`DO NOT BRING UP: ${knowledge.boundaries.avoidTopics.join(', ')}`);
  }

  // Sensitivities
  if (knowledge.boundaries.sensitivities.length > 0) {
    parts.push(
      `BE CAREFUL WITH: ${knowledge.boundaries.sensitivities.map((s) => s.topic).join(', ')}`
    );
  }

  // Ferni's promises
  const pending = knowledge.boundaries.ferniCommitments.filter((c) => c.status === 'pending');
  if (pending.length > 0) {
    parts.push(`YOU PROMISED: ${pending.map((c) => c.description).join('; ')}`);
  }

  // Allergies
  if (knowledge.wellness.health.allergies.length > 0) {
    parts.push(`ALLERGIES: ${knowledge.wellness.health.allergies.join(', ')}`);
  }

  return parts.join('\n');
}

/**
 * Build context for proactive engagement
 * Use this for conversation openers and check-ins
 */
export function buildEngagementContext(knowledge: UserKnowledge): string {
  const parts: string[] = ['[ENGAGEMENT CONTEXT]'];

  // Open loops to follow up on
  const unresolvedLoops = knowledge.sharedHistory.openLoops.filter((l) => !l.resolved);
  if (unresolvedLoops.length > 0) {
    parts.push(`FOLLOW UP: ${unresolvedLoops[0].topic}`);
  }

  // Callbacks for connection
  if (knowledge.sharedHistory.insideJokes.length > 0) {
    parts.push(`CALLBACK OPPORTUNITY: "${knowledge.sharedHistory.insideJokes[0].reference}"`);
  }

  // Overdue commitments
  const overdue = knowledge.aspirations.commitments.filter((c) => c.status === 'overdue');
  if (overdue.length > 0) {
    parts.push(`CHECK IN ABOUT: ${overdue[0].description}`);
  }

  // Dreams to encourage
  const dreams = knowledge.aspirations.dreams.filter((d) => d.status === 'active');
  if (dreams.length > 0 && parts.length < 4) {
    parts.push(`ENCOURAGE: ${dreams[0].description}`);
  }

  return parts.join('\n');
}
