/**
 * Unified Knowledge Context Builder
 *
 * Injects complete, unified knowledge about a user into the LLM context.
 *
 * "Better Than Human" capability: Human friends have fragmented memories.
 * Ferni has PERFECT, UNIFIED recall across:
 * - User profile (name, preferences, communication style)
 * - Key people in their life
 * - Active topics and threads
 * - Important life moments
 * - Values and dreams
 * - Active commitments
 *
 * @module intelligence/context-builders/superhuman/unified-knowledge-context
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { BuilderCategory } from '../core/categories.js';
import type { ContextBuilder, ContextBuilderInput, ContextInjection } from '../core/types.js';
import { createStandardInjection, registerContextBuilder } from '../index.js';

const log = createLogger({ module: 'context:unified-knowledge' });

// ============================================================================
// CONFIGURATION
// ============================================================================

// Cache TTL for unified knowledge (stable data, can cache longer)
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Cache to avoid repeated Firestore reads
const knowledgeCache = new Map<string, { data: unknown; timestamp: number }>();

// ============================================================================
// BUILDER
// ============================================================================

export const unifiedKnowledgeBuilder: ContextBuilder = {
  name: 'unified-knowledge',
  description: 'Injects complete unified knowledge about the user',
  priority: 30, // Early - foundation for other builders
  category: BuilderCategory.MEMORY,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { services } = input;
    const userId = services?.userId;

    if (!userId) {
      return [];
    }

    try {
      // Check cache first
      const cached = knowledgeCache.get(userId);
      const now = Date.now();

      if (cached && now - cached.timestamp < CACHE_TTL_MS) {
        const formatted = formatKnowledgeForPrompt(cached.data);
        if (formatted) {
          return [
            createStandardInjection('unified_knowledge', formatted, {
              category: 'superhuman',
              confidence: 0.9,
            }),
          ];
        }
        return [];
      }

      // Dynamic import to avoid circular dependencies
      const { buildUnifiedUserKnowledge } = await import(
        '../../../services/superhuman/unified-user-knowledge.js'
      );

      // Get unified knowledge
      const knowledge = await buildUnifiedUserKnowledge(userId);

      if (!knowledge) {
        return [];
      }

      // Cache the result
      knowledgeCache.set(userId, { data: knowledge, timestamp: now });

      // Format for LLM - use the formattedContext from the knowledge if available
      const formatted =
        (knowledge as { formattedContext?: string }).formattedContext ||
        formatKnowledgeForPrompt(knowledge);

      if (!formatted || formatted.length < 50) {
        return [];
      }

      log.debug(
        {
          userId,
          peopleCount: knowledge.people?.length || 0,
          topicsCount: knowledge.activeTopics?.length || 0,
          hasCommitments: (knowledge.commitments?.length || 0) > 0,
        },
        '🧠 Injecting unified user knowledge'
      );

      return [
        createStandardInjection('unified_knowledge', formatted, {
          category: 'superhuman',
          confidence: 0.9,
        }),
      ];
    } catch (error) {
      log.debug({ error: String(error), userId }, 'Unified knowledge fetch failed (non-fatal)');
      return [];
    }
  },
};

// ============================================================================
// HELPERS
// ============================================================================

interface UnifiedKnowledge {
  identity?: {
    name?: string;
    preferredName?: string;
    relationshipDays?: number;
    totalConversations?: number;
  };
  people?: Array<{
    name: string;
    relationship: string;
    importance: string;
  }>;
  activeTopics?: Array<{
    topic: string;
    needsFollowUp: boolean;
    daysSince: number;
  }>;
  keyMoments?: Array<{
    type: string;
    summary: string;
  }>;
  values?: Array<{
    value: string;
    evidence: string;
  }>;
  dreams?: Array<{
    dream: string;
    status: string;
  }>;
  commitments?: Array<{
    description: string;
    status: string;
    importance: string;
  }>;
}

function formatKnowledgeForPrompt(knowledge: unknown): string {
  const k = knowledge as UnifiedKnowledge;
  if (!k) return '';

  const sections: string[] = [];

  // Identity
  if (k.identity?.name) {
    const days = k.identity.relationshipDays || 0;
    const convos = k.identity.totalConversations || 0;
    sections.push(
      `## About ${k.identity.preferredName || k.identity.name}
Known them for ${days} days across ${convos} conversations.`
    );
  }

  // Key people
  if (k.people && k.people.length > 0) {
    const highImportance = k.people.filter((p) => p.importance === 'high');
    if (highImportance.length > 0) {
      sections.push(
        `## Important People
${highImportance.map((p) => `- **${p.name}** (${p.relationship})`).join('\n')}`
      );
    }
  }

  // Active topics needing follow-up
  if (k.activeTopics && k.activeTopics.length > 0) {
    const needsFollowUp = k.activeTopics.filter((t) => t.needsFollowUp);
    if (needsFollowUp.length > 0) {
      sections.push(
        `## Topics to Follow Up
${needsFollowUp.map((t) => `- ${t.topic} (${t.daysSince} days ago)`).join('\n')}`
      );
    }
  }

  // Active commitments
  if (k.commitments && k.commitments.length > 0) {
    const active = k.commitments.filter((c) => c.status === 'active');
    if (active.length > 0) {
      sections.push(
        `## Active Commitments
${active.map((c) => `- ${c.description} [${c.importance}]`).join('\n')}`
      );
    }
  }

  // Dreams
  if (k.dreams && k.dreams.length > 0) {
    const activeDreams = k.dreams.filter((d) => d.status === 'active');
    if (activeDreams.length > 0) {
      sections.push(
        `## Dreams They're Working Toward
${activeDreams.map((d) => `- ${d.dream}`).join('\n')}`
      );
    }
  }

  // Values
  if (k.values && k.values.length > 0) {
    const topValues = k.values.slice(0, 3);
    sections.push(
      `## Core Values
${topValues.map((v) => `- **${v.value}**: ${v.evidence}`).join('\n')}`
    );
  }

  return sections.join('\n\n');
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clear the knowledge cache for a user
 */
export function clearKnowledgeCache(userId?: string): void {
  if (userId) {
    knowledgeCache.delete(userId);
  } else {
    knowledgeCache.clear();
  }
}

// ============================================================================
// REGISTRATION
// ============================================================================

registerContextBuilder(unifiedKnowledgeBuilder);

export default unifiedKnowledgeBuilder;
