/**
 * Persona Memory Context
 *
 * Builds memory context tailored to each persona's domain and interests.
 * Each persona gets a different "lens" on the same user memories.
 *
 * Architecture:
 * ```
 * User Request + Persona ID
 *          │
 *          ▼
 *  ┌───────────────────┐
 *  │ Memory Query      │
 *  │ (persona-filtered)│
 *  └───────────────────┘
 *          │
 *          ▼
 *  ┌───────────────────┐
 *  │ Cross-Persona     │
 *  │ Insights Check    │
 *  └───────────────────┘
 *          │
 *          ▼
 *  ┌───────────────────┐
 *  │ Context Building  │
 *  │ (persona-specific)│
 *  └───────────────────┘
 *          │
 *          ▼
 *  PersonaMemoryContext
 * ```
 *
 * @module memory/cross-persona/persona-memory-context
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getMemoriesForPersona,
  getInsightsForPersona,
  markInsightDelivered,
  recordMemorySurfaced,
  type PersonaId,
  type SharedMemory,
  type CrossPersonaInsight,
  type MemoryCategory,
  PERSONA_MEMORY_INTERESTS,
} from './shared-memory-api.js';

const log = createLogger({ module: 'PersonaMemoryContext' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Memory context built for a specific persona
 */
export interface PersonaMemoryContext {
  /** Persona this context is for */
  personaId: PersonaId;
  /** User ID */
  userId: string;
  /** Relevant memories for this persona */
  relevantMemories: FormattedMemory[];
  /** Cross-persona insights to potentially surface */
  crossPersonaInsights: FormattedInsight[];
  /** Context text for LLM injection */
  contextText: string;
  /** Priority (0-100) for context injection */
  priority: number;
  /** Time taken to build context (ms) */
  buildTimeMs: number;
  /** Whether there are high-priority items to surface */
  hasHighPriority: boolean;
}

/**
 * Formatted memory for context injection
 */
export interface FormattedMemory {
  /** Memory ID for attribution */
  id: string;
  /** Formatted text for LLM */
  text: string;
  /** Attribution phrase */
  attribution: string;
  /** Category for filtering */
  category: MemoryCategory;
  /** Emotional weight */
  emotionalWeight: number;
  /** Whether this should be surfaced */
  shouldSurface: boolean;
}

/**
 * Formatted insight for context injection
 */
export interface FormattedInsight {
  /** Insight ID */
  id: string;
  /** Formatted text for LLM */
  text: string;
  /** Source persona */
  fromPersona: PersonaId;
  /** Priority */
  priority: number;
  /** Whether this should be surfaced */
  shouldSurface: boolean;
}

/**
 * Options for building persona memory context
 */
export interface PersonaMemoryContextOptions {
  /** Maximum memories to include */
  maxMemories?: number;
  /** Maximum insights to include */
  maxInsights?: number;
  /** Minimum emotional weight to include */
  minEmotionalWeight?: number;
  /** Exclude recently surfaced (hours) */
  excludeRecentlySurfaced?: number;
  /** Current conversation context for relevance */
  conversationContext?: string;
  /** Current emotional state */
  emotionalState?: string;
  /** Mentioned entities for context matching */
  mentionedEntities?: string[];
}

// ============================================================================
// PERSONA-SPECIFIC CONTEXT TEMPLATES
// ============================================================================

/**
 * Context templates by persona
 */
const PERSONA_CONTEXT_TEMPLATES: Record<
  PersonaId,
  {
    prefix: string;
    memoryFormat: (m: SharedMemory) => string;
    insightFormat: (i: CrossPersonaInsight) => string;
  }
> = {
  ferni: {
    prefix: 'As their life coach, you know:',
    memoryFormat: (m) => `- ${m.content}`,
    insightFormat: (i) => `- [From ${formatPersonaName(i.fromPersona)}] ${i.content}`,
  },
  peter: {
    prefix: 'Relevant background for research:',
    memoryFormat: (m) => `- ${m.content}`,
    insightFormat: (i) => `- Insight from ${formatPersonaName(i.fromPersona)}: ${i.content}`,
  },
  maya: {
    prefix: 'For habit coaching, remember:',
    memoryFormat: (m) => `- ${m.content}`,
    insightFormat: (i) => `- ${formatPersonaName(i.fromPersona)} noted: ${i.content}`,
  },
  jordan: {
    prefix: 'For event planning, key details:',
    memoryFormat: (m) => `- ${m.content}`,
    insightFormat: (i) => `- From ${formatPersonaName(i.fromPersona)}: ${i.content}`,
  },
  alex: {
    prefix: 'Communication context:',
    memoryFormat: (m) => `- ${m.content}`,
    insightFormat: (i) => `- ${formatPersonaName(i.fromPersona)} shared: ${i.content}`,
  },
  nayan: {
    prefix: 'For wisdom and reflection:',
    memoryFormat: (m) => `- ${m.content}`,
    insightFormat: (i) => `- ${formatPersonaName(i.fromPersona)} observed: ${i.content}`,
  },
};

function formatPersonaName(personaId: PersonaId): string {
  const names: Record<PersonaId, string> = {
    ferni: 'Ferni',
    peter: 'Peter',
    maya: 'Maya',
    jordan: 'Jordan',
    alex: 'Alex',
    nayan: 'Nayan',
  };
  return names[personaId] || personaId;
}

// ============================================================================
// MAIN BUILD FUNCTION
// ============================================================================

/**
 * Build memory context for a specific persona.
 *
 * This is the main entry point for getting persona-specific memory context.
 */
export async function buildPersonaMemoryContext(
  userId: string,
  personaId: PersonaId,
  options: PersonaMemoryContextOptions = {}
): Promise<PersonaMemoryContext> {
  const startTime = Date.now();

  const {
    maxMemories = 10,
    maxInsights = 3,
    minEmotionalWeight = 0.3,
    excludeRecentlySurfaced = 2, // hours
    conversationContext,
    emotionalState,
    mentionedEntities,
  } = options;

  try {
    // 1. Get relevant memories for this persona
    const memoryResult = await getMemoriesForPersona(userId, personaId, {
      minEmotionalWeight,
      excludeRecentlySurfaced,
      limit: maxMemories * 2, // Get extra for filtering
      relatedEntities: mentionedEntities,
    });

    // 2. Get cross-persona insights
    const insights = await getInsightsForPersona(userId, personaId, maxInsights);

    // 3. Score and sort memories by relevance
    const scoredMemories = scoreMemories(
      memoryResult.memories,
      personaId,
      conversationContext,
      emotionalState,
      mentionedEntities
    );

    // 4. Take top memories
    const topMemories = scoredMemories.slice(0, maxMemories);

    // 5. Format memories for context
    const template = PERSONA_CONTEXT_TEMPLATES[personaId];
    const formattedMemories: FormattedMemory[] = topMemories.map((m) => ({
      id: m.memory.id,
      text: template.memoryFormat(m.memory),
      attribution: buildAttribution(m.memory),
      category: m.memory.category,
      emotionalWeight: m.memory.emotionalWeight,
      shouldSurface: m.score > 0.7,
    }));

    // 6. Format insights for context
    const formattedInsights: FormattedInsight[] = insights.map((i) => ({
      id: i.id,
      text: template.insightFormat(i),
      fromPersona: i.fromPersona,
      priority: i.priority,
      shouldSurface: i.priority > 50,
    }));

    // 7. Build context text
    const contextText = buildContextText(personaId, formattedMemories, formattedInsights, template);

    // 8. Calculate priority
    const hasHighPriority =
      formattedMemories.some((m) => m.shouldSurface) ||
      formattedInsights.some((i) => i.shouldSurface);

    const priority = calculateContextPriority(
      formattedMemories,
      formattedInsights,
      hasHighPriority
    );

    const buildTimeMs = Date.now() - startTime;

    log.debug(
      {
        userId,
        personaId,
        memoriesFound: memoryResult.memories.length,
        memoriesIncluded: formattedMemories.length,
        insightsIncluded: formattedInsights.length,
        priority,
        hasHighPriority,
        buildTimeMs,
      },
      '🧠 Persona memory context built'
    );

    return {
      personaId,
      userId,
      relevantMemories: formattedMemories,
      crossPersonaInsights: formattedInsights,
      contextText,
      priority,
      buildTimeMs,
      hasHighPriority,
    };
  } catch (error) {
    log.warn({ userId, personaId, error: String(error) }, 'Failed to build persona memory context');

    return {
      personaId,
      userId,
      relevantMemories: [],
      crossPersonaInsights: [],
      contextText: '',
      priority: 0,
      buildTimeMs: Date.now() - startTime,
      hasHighPriority: false,
    };
  }
}

// ============================================================================
// MEMORY SCORING
// ============================================================================

interface ScoredMemory {
  memory: SharedMemory;
  score: number;
}

/**
 * Score memories by relevance to current context
 */
function scoreMemories(
  memories: SharedMemory[],
  personaId: PersonaId,
  conversationContext?: string,
  emotionalState?: string,
  mentionedEntities?: string[]
): ScoredMemory[] {
  const personaInterests = PERSONA_MEMORY_INTERESTS[personaId];

  return memories
    .map((memory) => {
      let score = 0.5; // Base score

      // Boost for matching persona interests
      if (personaInterests.includes(memory.category)) {
        score += 0.15;
      }

      // Boost for emotional weight
      score += memory.emotionalWeight * 0.2;

      // Boost for confidence
      score += memory.confidence * 0.1;

      // Boost for recency (exponential decay)
      const daysSince = (Date.now() - memory.capturedAt.getTime()) / (1000 * 60 * 60 * 24);
      const recencyBoost = Math.exp(-daysSince / 30) * 0.1;
      score += recencyBoost;

      // Boost for matching mentioned entities
      if (mentionedEntities && mentionedEntities.length > 0 && memory.relatedEntities) {
        const matches = memory.relatedEntities.filter((e) =>
          mentionedEntities.some((me) => e.toLowerCase().includes(me.toLowerCase()))
        );
        if (matches.length > 0) {
          score += 0.2;
        }
      }

      // Boost for emotional state alignment (joy amplification)
      if (emotionalState) {
        const memoryContent = memory.content.toLowerCase();
        const userState = emotionalState.toLowerCase();

        // If user is struggling and memory is positive, boost for joy amplification
        if (
          ['sad', 'anxious', 'stressed', 'down'].some((s) => userState.includes(s)) &&
          memory.emotionalWeight > 0.6 &&
          ['happy', 'proud', 'achieved', 'grateful'].some((p) => memoryContent.includes(p))
        ) {
          score += 0.15;
        }
      }

      // Penalty for too frequently surfaced
      if (memory.surfaceCount > 3) {
        score -= 0.1;
      }

      // Cap score at 1.0
      score = Math.min(1.0, Math.max(0, score));

      return { memory, score };
    })
    .sort((a, b) => b.score - a.score);
}

// ============================================================================
// CONTEXT BUILDING HELPERS
// ============================================================================

/**
 * Build attribution phrase for a memory
 */
function buildAttribution(memory: SharedMemory): string {
  if (memory.attribution) {
    return memory.attribution;
  }

  const daysSince = Math.floor((Date.now() - memory.capturedAt.getTime()) / (1000 * 60 * 60 * 24));

  if (daysSince === 0) {
    return 'Earlier today';
  } else if (daysSince === 1) {
    return 'Yesterday';
  } else if (daysSince < 7) {
    return `${daysSince} days ago`;
  } else if (daysSince < 30) {
    return `${Math.floor(daysSince / 7)} week(s) ago`;
  } else {
    return `${Math.floor(daysSince / 30)} month(s) ago`;
  }
}

/**
 * Build complete context text for LLM injection
 */
function buildContextText(
  personaId: PersonaId,
  memories: FormattedMemory[],
  insights: FormattedInsight[],
  template: {
    prefix: string;
    memoryFormat: (m: SharedMemory) => string;
    insightFormat: (i: CrossPersonaInsight) => string;
  }
): string {
  if (memories.length === 0 && insights.length === 0) {
    return '';
  }

  const lines: string[] = [];

  // Add prefix
  lines.push(template.prefix);
  lines.push('');

  // Add memories
  if (memories.length > 0) {
    for (const m of memories) {
      lines.push(m.text);
    }
    lines.push('');
  }

  // Add cross-persona insights if any
  if (insights.length > 0) {
    lines.push('Insights from team:');
    for (const i of insights) {
      lines.push(i.text);
    }
  }

  return lines.join('\n');
}

/**
 * Calculate context priority based on content
 */
function calculateContextPriority(
  memories: FormattedMemory[],
  insights: FormattedInsight[],
  hasHighPriority: boolean
): number {
  let priority = 50; // Base priority

  if (hasHighPriority) {
    priority += 20;
  }

  // Boost for high-weight memories
  const avgEmotionalWeight =
    memories.length > 0
      ? memories.reduce((sum, m) => sum + m.emotionalWeight, 0) / memories.length
      : 0;
  priority += avgEmotionalWeight * 10;

  // Boost for high-priority insights
  const maxInsightPriority = Math.max(...insights.map((i) => i.priority), 0);
  priority += (maxInsightPriority / 100) * 15;

  return Math.min(100, Math.round(priority));
}

// ============================================================================
// POST-SURFACING TRACKING
// ============================================================================

/**
 * Record that memories and insights were surfaced.
 *
 * Call this after using the context in a response.
 */
export async function recordContextSurfaced(context: PersonaMemoryContext): Promise<void> {
  // Record surfaced memories
  for (const memory of context.relevantMemories) {
    if (memory.shouldSurface) {
      await recordMemorySurfaced(context.userId, memory.id);
    }
  }

  // Mark insights as delivered
  for (const insight of context.crossPersonaInsights) {
    if (insight.shouldSurface) {
      await markInsightDelivered(context.userId, insight.id);
    }
  }
}

// ============================================================================
// HANDOFF CONTEXT
// ============================================================================

/**
 * Build handoff context when transitioning between personas.
 *
 * Ensures the receiving persona has relevant context from the outgoing one.
 */
export async function buildHandoffContext(
  userId: string,
  fromPersonaId: PersonaId,
  toPersonaId: PersonaId,
  conversationSummary?: string
): Promise<string> {
  // Get recent memories captured by the outgoing persona
  const recentMemories = await getMemoriesForPersona(userId, fromPersonaId, {
    limit: 5,
    capturedBy: [fromPersonaId],
  });

  if (recentMemories.memories.length === 0 && !conversationSummary) {
    return '';
  }

  const lines: string[] = [];
  lines.push(`[Handoff from ${formatPersonaName(fromPersonaId)}]`);

  if (conversationSummary) {
    lines.push(`Recent discussion: ${conversationSummary}`);
  }

  if (recentMemories.memories.length > 0) {
    lines.push('Key points:');
    for (const m of recentMemories.memories.slice(0, 3)) {
      lines.push(`- ${m.content}`);
    }
  }

  return lines.join('\n');
}
