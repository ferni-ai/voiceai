/**
 * Graph Context Builder
 *
 * Provides "Better than Human" entity context using Spanner graph queries.
 * Detects entity mentions in user input and retrieves comprehensive context
 * including facts, relationships, and domain-specific information.
 *
 * Use cases:
 * - "What do I know about Sarah?" → Entity context with all facts
 * - "What's Sarah's work situation?" → Domain-filtered facts
 * - "How are Sarah and Mike connected?" → Relationship context
 *
 * @module intelligence/context-builders/memory/graph-context
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { BuilderCategory } from '../core/categories.js';
import { createStandardInjection, registerContextBuilder } from '../index.js';
import type { ContextBuilder, ContextBuilderInput, ContextInjection } from '../core/types.js';
import {
  isSpannerReady,
  getEntityContext,
  getRelationshipContext,
  searchFactsAboutEntity,
  type FactDomain,
} from '../../../memory/spanner-graph/index.js';
import { detectEntities, extractEntityNames, type DetectedEntity } from '../../entity-detector.js';
import {
  getSessionPronounContext,
  updateSessionPronounContext,
} from '../../pronoun-context-store.js';

const log = createLogger({ module: 'context:graph' });

// ============================================================================
// ENTITY DETECTION
// ============================================================================

/** Patterns to detect entity mentions in user input */
const ENTITY_MENTION_PATTERNS = [
  // "What do I know about X?"
  /what (?:do (?:I|you|we) know|'s known) about (\w+(?:\s+\w+)?)/i,
  // "Tell me about X"
  /tell me (?:more )?about (\w+(?:\s+\w+)?)/i,
  // "Who is X?"
  /who (?:is|was) (\w+(?:\s+\w+)?)/i,
  // "X's situation/work/health/etc."
  /(\w+(?:\s+\w+)?)'s\s+(work|health|family|relationship|finance|education)/i,
  // "How is X doing?"
  /how (?:is|are) (\w+(?:\s+\w+)?)(?:\s+doing)?/i,
  // "What's happening with X?"
  /what'?s (?:happening|going on) with (\w+(?:\s+\w+)?)/i,
];

/** Patterns to detect relationship queries */
const RELATIONSHIP_PATTERNS = [
  // "How are X and Y connected?"
  /how (?:are|is) (\w+) (?:and|&) (\w+) (?:connected|related)/i,
  // "What's the connection between X and Y?"
  /what'?s the (?:connection|relationship) between (\w+) (?:and|&) (\w+)/i,
  // "Do X and Y know each other?"
  /do (\w+) (?:and|&) (\w+) (?:know each other|have a relationship)/i,
];

/** Domain keywords to detect domain-specific queries */
const DOMAIN_INDICATORS: Record<FactDomain, string[]> = {
  work: ['work', 'job', 'career', 'office', 'boss', 'colleague', 'professional'],
  health: ['health', 'medical', 'doctor', 'therapy', 'wellness', 'stress'],
  family: ['family', 'relative', 'parent', 'sibling', 'child'],
  finance: ['money', 'financial', 'budget', 'debt', 'savings'],
  education: ['school', 'education', 'study', 'class', 'degree'],
  hobby: ['hobby', 'interest', 'fun', 'leisure'],
  travel: ['travel', 'trip', 'vacation', 'visit'],
  relationship: ['relationship', 'dating', 'partner', 'friend'],
  general: [],
};

interface EntityMention {
  name: string;
  domain?: FactDomain;
}

interface RelationshipMention {
  entity1: string;
  entity2: string;
}

/**
 * Detect entity mentions in user input
 *
 * Uses both pattern-based detection for query patterns and the
 * lightweight NER for general entity extraction.
 */
function detectEntityMentions(text: string, knownEntities?: string[]): EntityMention[] {
  const mentions: EntityMention[] = [];
  const seen = new Set<string>();

  // 1. First, check for explicit query patterns (highest priority)
  for (const pattern of ENTITY_MENTION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const name = match[1].trim();
      if (!seen.has(name.toLowerCase())) {
        // Check for domain indicator
        const domain = match[2] ? (match[2].toLowerCase() as FactDomain) : detectDomain(text);
        mentions.push({ name, domain });
        seen.add(name.toLowerCase());
      }
    }
  }

  // 2. If no pattern matches, try lightweight NER
  if (mentions.length === 0) {
    const detected = detectEntities(text, { knownEntities });
    for (const entity of detected) {
      if (
        entity.type === 'person' &&
        entity.confidence >= 0.6 &&
        !seen.has(entity.name.toLowerCase())
      ) {
        mentions.push({
          name: entity.name,
          domain: detectDomain(text),
        });
        seen.add(entity.name.toLowerCase());
      }
    }
  }

  return mentions;
}

/**
 * Detect relationship queries in user input
 */
function detectRelationshipMentions(text: string): RelationshipMention[] {
  const mentions: RelationshipMention[] = [];

  for (const pattern of RELATIONSHIP_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      mentions.push({
        entity1: match[1].trim(),
        entity2: match[2].trim(),
      });
    }
  }

  return mentions;
}

/**
 * Detect domain from text based on keywords
 */
function detectDomain(text: string): FactDomain | undefined {
  const lowerText = text.toLowerCase();

  for (const [domain, keywords] of Object.entries(DOMAIN_INDICATORS)) {
    if (domain === 'general') continue;
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        return domain as FactDomain;
      }
    }
  }

  return undefined;
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build graph context from entity mentions in user input
 */
async function buildGraphContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userText, services } = input;
  const injections: ContextInjection[] = [];

  const userId = services?.userId;
  const sessionId = services?.sessionId;
  if (!userId || !userText) {
    return [];
  }

  // Check if Spanner is available
  if (!isSpannerReady()) {
    log.debug('Spanner not ready, skipping graph context');
    return [];
  }

  // Get pronoun context from previous turns
  const pronounContext = sessionId ? getSessionPronounContext(sessionId) : undefined;

  try {
    // 1. Check for relationship queries first
    const relationshipMentions = detectRelationshipMentions(userText);
    for (const mention of relationshipMentions.slice(0, 1)) {
      const context = await getRelationshipContext(userId, mention.entity1, mention.entity2);
      if (context && context.summary) {
        injections.push(
          createStandardInjection('relationship_context', context.summary, {
            category: 'memory',
            confidence: 0.85,
          })
        );
        log.debug(
          { entity1: mention.entity1, entity2: mention.entity2 },
          '🔗 Injected relationship context'
        );
      }
    }

    // 2. Detect entities (with pronoun resolution from previous turns)
    const detectedEntities = detectEntities(userText, { pronounContext });

    // 3. Update pronoun context for future turns
    if (sessionId && detectedEntities.length > 0) {
      updateSessionPronounContext(sessionId, detectedEntities);
    }

    // 4. Check for entity mentions
    const entityMentions = detectEntityMentions(userText, undefined);
    for (const mention of entityMentions.slice(0, 2)) {
      // Domain-specific query
      if (mention.domain) {
        const result = await searchFactsAboutEntity(userId, mention.name, mention.domain);
        if (result.facts.length > 0) {
          injections.push(
            createStandardInjection('entity_domain_context', result.summary, {
              category: 'memory',
              confidence: 0.8,
            })
          );
          log.debug(
            { entity: mention.name, domain: mention.domain, facts: result.facts.length },
            '🎯 Injected domain-filtered entity context'
          );
        }
      } else {
        // General entity query
        const context = await getEntityContext(userId, mention.name);
        if (context) {
          injections.push(
            createStandardInjection('entity_context', context.summary, {
              category: 'memory',
              confidence: 0.8,
            })
          );
          log.debug(
            {
              entity: mention.name,
              facts: context.entity.facts.length,
              related: context.relatedEntities.length,
            },
            '👤 Injected entity context'
          );
        }
      }
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to build graph context');
  }

  return injections;
}

// ============================================================================
// REGISTRATION
// ============================================================================

/**
 * Graph Context Builder
 *
 * Provides entity and relationship context from Spanner graph.
 * Medium-high priority to ensure entity context is available for relevant queries.
 */
export const graphContextBuilder: ContextBuilder = {
  name: 'graph-context',
  description: 'Entity and relationship context from Spanner knowledge graph',
  priority: 70, // Slightly below continuity but still high
  category: BuilderCategory.MEMORY,
  build: buildGraphContext,
};

// Register the builder
registerContextBuilder(graphContextBuilder);

export { buildGraphContext, detectEntityMentions, detectRelationshipMentions };
