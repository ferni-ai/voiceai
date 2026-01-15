/**
 * Cross-Persona Context Sharing
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Shares context between team members so they know what's happening
 * with the user across their whole Ferni experience.
 *
 * Philosophy:
 * - The team should feel like a team
 * - No one should have to repeat themselves
 * - Continuity builds trust
 *
 * @module CrossPersonaContext
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { PersonaId } from './handoff-intelligence.js';

const log = createLogger({ module: 'CrossPersonaContext' });

// ============================================================================
// TYPES
// ============================================================================

export interface SharedContext {
  topic: string;
  summary: string;
  importance: 'low' | 'medium' | 'high';
  sharedBy: PersonaId;
  sharedAt: Date;
  relevantFor: PersonaId[];
  expiresAt?: Date;
}

export interface PersonaInteraction {
  personaId: PersonaId;
  date: Date;
  topics: string[];
  emotionalState?: string;
  openItems?: string[];
  nextSteps?: string[];
}

export interface UserTeamContext {
  userId: string;

  // Recent interactions with each persona
  personaInteractions: Map<PersonaId, PersonaInteraction[]>;

  // Shared context across personas
  sharedContexts: SharedContext[];

  // Active items that span personas
  crossPersonaItems: Array<{
    item: string;
    originPersona: PersonaId;
    relevantPersonas: PersonaId[];
    status: 'active' | 'resolved';
    createdAt: Date;
  }>;

  // User's current focus/situation (shared)
  currentSituation?: {
    summary: string;
    keyTopics: string[];
    emotionalState: string;
    updatedAt: Date;
    updatedBy: PersonaId;
  };
}

// ============================================================================
// IN-MEMORY STORE
// ============================================================================

const userContexts = new Map<string, UserTeamContext>();

function getOrCreateContext(userId: string): UserTeamContext {
  let context = userContexts.get(userId);
  if (!context) {
    context = {
      userId,
      personaInteractions: new Map(),
      sharedContexts: [],
      crossPersonaItems: [],
    };
    userContexts.set(userId, context);
  }
  return context;
}

// ============================================================================
// SESSION DATA MANAGER INTEGRATION
// ============================================================================

/**
 * Clear ALL cached data for a specific user.
 * Called by SessionDataManager when a session ends.
 * This is CRITICAL for preventing memory leaks.
 */
export function clearUserContext(userId: string): void {
  const hadData = userContexts.has(userId);
  userContexts.delete(userId);

  if (hadData) {
    log.debug({ userId }, '🧹 CrossPersonaContext user cache cleared');
  }
}

/**
 * Clear ALL cached data (for shutdown).
 */
export function clearAllContexts(): void {
  userContexts.clear();
  log.info('🧹 CrossPersonaContext all caches cleared');
}

/**
 * Get cache statistics for monitoring.
 */
export function getContextStats(): { users: number; entries: number } {
  let totalEntries = 0;
  for (const ctx of userContexts.values()) {
    totalEntries += ctx.sharedContexts.length;
    totalEntries += ctx.crossPersonaItems.length;
    totalEntries += ctx.personaInteractions.size;
  }
  return { users: userContexts.size, entries: totalEntries };
}

/**
 * Register with SessionDataManager (call during initialization).
 */
export async function registerWithSessionDataManager(): Promise<void> {
  try {
    const { getSessionDataManager } = await import('../session-data-manager.js');
    getSessionDataManager().registerService({
      name: 'CrossPersonaContext',
      clearUserData: clearUserContext,
      clearAllData: clearAllContexts,
      getStats: getContextStats,
    });
  } catch {
    // SessionDataManager may not be initialized yet
    log.debug('SessionDataManager not available for CrossPersonaContext registration');
  }
}

// ============================================================================
// CONTEXT SHARING
// ============================================================================

/**
 * Share context from one persona for others to see
 */
export function shareContext(userId: string, context: Omit<SharedContext, 'sharedAt'>): void {
  const userContext = getOrCreateContext(userId);

  userContext.sharedContexts.push({
    ...context,
    sharedAt: new Date(),
  });

  // Keep only recent shared contexts (last 20)
  if (userContext.sharedContexts.length > 20) {
    userContext.sharedContexts = userContext.sharedContexts.slice(-20);
  }

  log.info(
    { userId, topic: context.topic, from: context.sharedBy },
    '🔗 Context shared across personas'
  );
}

/**
 * Record an interaction with a persona
 */
export function recordPersonaInteraction(userId: string, interaction: PersonaInteraction): void {
  const userContext = getOrCreateContext(userId);

  const interactions = userContext.personaInteractions.get(interaction.personaId) || [];
  interactions.push(interaction);

  // Keep last 10 interactions per persona
  if (interactions.length > 10) {
    interactions.shift();
  }

  userContext.personaInteractions.set(interaction.personaId, interactions);

  log.debug({ userId, personaId: interaction.personaId }, 'Persona interaction recorded');
}

/**
 * Update the user's current situation (visible to all personas)
 */
export function updateCurrentSituation(
  userId: string,
  situation: {
    summary: string;
    keyTopics: string[];
    emotionalState: string;
  },
  updatedBy: PersonaId
): void {
  const userContext = getOrCreateContext(userId);

  userContext.currentSituation = {
    ...situation,
    updatedAt: new Date(),
    updatedBy,
  };

  log.debug({ userId, updatedBy }, 'Current situation updated');
}

/**
 * Add a cross-persona item (something one persona started that others should know about)
 */
export function addCrossPersonaItem(
  userId: string,
  item: string,
  originPersona: PersonaId,
  relevantPersonas: PersonaId[]
): void {
  const userContext = getOrCreateContext(userId);

  userContext.crossPersonaItems.push({
    item,
    originPersona,
    relevantPersonas,
    status: 'active',
    createdAt: new Date(),
  });

  log.info(
    { userId, item: item.slice(0, 50), origin: originPersona },
    '📌 Cross-persona item added'
  );
}

// ============================================================================
// CONTEXT RETRIEVAL
// ============================================================================

/**
 * Get relevant context for a specific persona
 */
export function getContextForPersona(
  userId: string,
  personaId: PersonaId
): {
  recentSharedContexts: SharedContext[];
  recentTeamInteractions: Array<{ persona: PersonaId; topics: string[]; date: Date }>;
  relevantItems: string[];
  currentSituation?: UserTeamContext['currentSituation'];
} {
  const userContext = userContexts.get(userId);
  if (!userContext) {
    return {
      recentSharedContexts: [],
      recentTeamInteractions: [],
      relevantItems: [],
    };
  }

  // Get shared contexts relevant to this persona
  const relevantContexts = userContext.sharedContexts.filter(
    (sc) => sc.relevantFor.includes(personaId) || sc.relevantFor.length === 0 // Empty means all personas
  );

  // Get recent interactions with other personas
  const recentTeamInteractions: Array<{ persona: PersonaId; topics: string[]; date: Date }> = [];
  userContext.personaInteractions.forEach((interactions, persona) => {
    if (persona !== personaId && interactions.length > 0) {
      const latest = interactions[interactions.length - 1];
      recentTeamInteractions.push({
        persona,
        topics: latest.topics,
        date: latest.date,
      });
    }
  });

  // Sort by date, most recent first
  recentTeamInteractions.sort((a, b) => b.date.getTime() - a.date.getTime());

  // Get relevant cross-persona items
  const relevantItems = userContext.crossPersonaItems
    .filter(
      (item) =>
        item.status === 'active' &&
        (item.relevantPersonas.includes(personaId) || item.originPersona === personaId)
    )
    .map((item) => item.item);

  return {
    recentSharedContexts: relevantContexts.slice(-5),
    recentTeamInteractions: recentTeamInteractions.slice(0, 3),
    relevantItems,
    currentSituation: userContext.currentSituation,
  };
}

/**
 * Get a handoff summary when switching personas
 */
export function getHandoffSummary(
  userId: string,
  fromPersona: PersonaId,
  toPersona: PersonaId
): {
  summary: string;
  keyPoints: string[];
  openItems: string[];
  emotionalContext?: string;
} {
  const userContext = userContexts.get(userId);
  if (!userContext) {
    return {
      summary: 'No previous context available.',
      keyPoints: [],
      openItems: [],
    };
  }

  const fromInteractions = userContext.personaInteractions.get(fromPersona) || [];
  const latestFromInteraction = fromInteractions[fromInteractions.length - 1];

  const keyPoints: string[] = [];
  const openItems: string[] = [];

  if (latestFromInteraction) {
    keyPoints.push(
      `Last talked with ${fromPersona} about: ${latestFromInteraction.topics.join(', ')}`
    );

    if (latestFromInteraction.openItems) {
      openItems.push(...latestFromInteraction.openItems);
    }
  }

  // Add relevant cross-persona items
  const crossItems = userContext.crossPersonaItems.filter(
    (item) => item.status === 'active' && item.relevantPersonas.includes(toPersona)
  );
  for (const item of crossItems) {
    keyPoints.push(`From ${item.originPersona}: ${item.item}`);
  }

  const summary =
    keyPoints.length > 0
      ? `Coming from ${fromPersona}: ${keyPoints[0]}`
      : `This is a new conversation with ${toPersona}.`;

  return {
    summary,
    keyPoints,
    openItems,
    emotionalContext: latestFromInteraction?.emotionalState,
  };
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build LLM context for cross-persona awareness
 */
export function buildCrossPersonaContext(userId: string, currentPersona: PersonaId): string | null {
  const context = getContextForPersona(userId, currentPersona);

  if (
    context.recentTeamInteractions.length === 0 &&
    context.relevantItems.length === 0 &&
    !context.currentSituation
  ) {
    return null;
  }

  const lines: string[] = ['[🤝 TEAM AWARENESS]'];

  // Current situation
  if (context.currentSituation) {
    lines.push(`Current situation: ${context.currentSituation.summary}`);
    lines.push(`Key topics: ${context.currentSituation.keyTopics.join(', ')}`);
    lines.push(`Emotional state: ${context.currentSituation.emotionalState}`);
    lines.push('');
  }

  // Recent team interactions
  if (context.recentTeamInteractions.length > 0) {
    lines.push('Recent conversations with other team members:');
    for (const interaction of context.recentTeamInteractions) {
      const daysAgo = Math.floor((Date.now() - interaction.date.getTime()) / (1000 * 60 * 60 * 24));
      const timeAgo = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;
      lines.push(`• ${interaction.persona}: ${interaction.topics.join(', ')} (${timeAgo})`);
    }
    lines.push('');
  }

  // Relevant items from other personas
  if (context.relevantItems.length > 0) {
    lines.push('Items from team members:');
    for (const item of context.relevantItems) {
      lines.push(`• ${item}`);
    }
    lines.push('');
  }

  // Shared context
  if (context.recentSharedContexts.length > 0) {
    lines.push('Shared notes:');
    for (const sc of context.recentSharedContexts) {
      lines.push(`• [${sc.sharedBy}] ${sc.topic}: ${sc.summary}`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// PERSISTENCE
// ============================================================================

export function exportTeamContext(userId: string): UserTeamContext | null {
  return userContexts.get(userId) || null;
}

export function importTeamContext(context: UserTeamContext): void {
  // Convert Map from serialized format
  if (!(context.personaInteractions instanceof Map)) {
    const entries = Object.entries(
      context.personaInteractions as unknown as Record<string, PersonaInteraction[]>
    );
    context.personaInteractions = new Map(entries as Array<[PersonaId, PersonaInteraction[]]>);
  }

  // Convert dates
  context.sharedContexts.forEach((sc) => {
    sc.sharedAt = new Date(sc.sharedAt);
    if (sc.expiresAt) sc.expiresAt = new Date(sc.expiresAt);
  });
  context.crossPersonaItems.forEach((item) => {
    item.createdAt = new Date(item.createdAt);
  });
  if (context.currentSituation) {
    context.currentSituation.updatedAt = new Date(context.currentSituation.updatedAt);
  }

  userContexts.set(context.userId, context);
  log.debug({ userId: context.userId }, 'Imported team context');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  shareContext,
  recordPersonaInteraction,
  updateCurrentSituation,
  addCrossPersonaItem,
  getContextForPersona,
  getHandoffSummary,
  buildCrossPersonaContext,
  exportTeamContext,
  importTeamContext,
};
