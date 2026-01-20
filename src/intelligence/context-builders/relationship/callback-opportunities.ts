/**
 * Callback Opportunities Context Builder
 *
 * > "Remember past conversations and reference them naturally"
 *
 * Surfaces natural moments to reference past conversations:
 * - Shared moments ("Remember when you told me about...")
 * - Inside jokes (when appropriate)
 * - Topic-related callbacks
 *
 * The key insight: Callbacks should feel NATURAL, not forced.
 * We use probability and relevance to determine when to surface them.
 *
 * Implements Core Principle #2: Relationship Over Transaction
 *
 * @module intelligence/context-builders/relationship/callback-opportunities
 */

import {
  type ContextBuilderInput,
  type ContextInjection,
  createHintInjection,
  registerContextBuilder,
} from '../index.js';
import { createLogger } from '../../../utils/safe-logger.js';
import {
  getRelationshipEngine,
  type CallbackOpportunity,
  type RelationshipContext,
} from '../../relationship/index.js';

const log = createLogger({ module: 'CallbackOpportunitiesBuilder' });

// ============================================================================
// CALLBACK PROBABILITY CONFIG
// ============================================================================

/**
 * How often to suggest callbacks based on relationship stage
 */
const CALLBACK_PROBABILITY_BY_STAGE: Record<string, number> = {
  stranger: 0.05, // Rarely - still building foundation
  acquaintance: 0.15, // Occasionally - starting to build history
  friend: 0.25, // Regularly - natural part of conversation
  trusted: 0.35, // Frequently - deep shared history
  confidant: 0.40, // Often - rich tapestry of memories
};

/**
 * Minimum sessions before callbacks feel natural
 */
const MIN_SESSIONS_FOR_CALLBACKS = 3;

/**
 * Maximum callbacks per session to avoid feeling mechanical
 */
const MAX_CALLBACKS_PER_SESSION = 3;

// Track callbacks this session
const sessionCallbackCounts = new Map<string, number>();

// ============================================================================
// CALLBACK FORMATTING
// ============================================================================

/**
 * Format a callback opportunity as a prompt hint
 */
function formatCallbackHint(callback: CallbackOpportunity, ctx: RelationshipContext): string {
  const lines: string[] = [];

  lines.push(`[CALLBACK OPPORTUNITY - OPTIONAL]`);
  lines.push(`Type: ${callback.type}`);

  if (callback.suggestedPhrase) {
    lines.push(`\nNatural way to reference: "${callback.suggestedPhrase}"`);
  } else {
    lines.push(`\nReference: ${callback.summary}`);
  }

  // Add guidance on how to use
  lines.push(`\nGuidance:`);
  lines.push(`- Only use if it fits naturally into the conversation`);
  lines.push(`- Don't force it - skip if the moment doesn't feel right`);
  lines.push(`- Confidence: ${Math.round(callback.confidence * 100)}%`);

  // Stage-specific guidance
  if (ctx.stage === 'friend' || ctx.stage === 'trusted' || ctx.stage === 'confidant') {
    lines.push(`- At ${ctx.stage} stage, callbacks strengthen the bond`);
  }

  return lines.join('\n');
}

/**
 * Format an inside joke opportunity
 */
function formatInsideJokeHint(ctx: RelationshipContext): string | null {
  if (!ctx.unlockedContent.insideJokesEnabled) return null;
  if (ctx.activeInsideJokes.length === 0) return null;

  // Random selection with low probability
  if (Math.random() > 0.15) return null;

  const joke = ctx.activeInsideJokes[Math.floor(Math.random() * ctx.activeInsideJokes.length)];

  return `[INSIDE JOKE AVAILABLE - USE SPARINGLY]
Reference: "${joke.reference}"
Context: ${joke.origin}
Resonance score: ${Math.round(joke.resonanceScore * 100)}%

Only use if the conversation naturally leads to it. Inside jokes work best when unexpected.`;
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build callback opportunity context for the current turn
 */
async function buildCallbackOpportunitiesContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const userId = input.services?.userId;
  const personaId = input.persona?.id || 'ferni';
  const sessionId = input.services?.sessionId || 'default';

  if (!userId) {
    return [];
  }

  // Get relationship engine
  const engine = getRelationshipEngine(userId, personaId);
  if (!engine) {
    return [];
  }

  // Check session callback limit
  const sessionKey = `${userId}_${sessionId}`;
  const sessionCallbacks = sessionCallbackCounts.get(sessionKey) || 0;
  if (sessionCallbacks >= MAX_CALLBACKS_PER_SESSION) {
    log.debug({ sessionCallbacks }, 'Max callbacks reached for session');
    return [];
  }

  const injections: ContextInjection[] = [];

  try {
    const ctx = engine.buildRelationshipContext();

    // Skip if too early in relationship
    if (ctx.totalSessions < MIN_SESSIONS_FOR_CALLBACKS) {
      return [];
    }

    // Probability check based on stage
    const probability = CALLBACK_PROBABILITY_BY_STAGE[ctx.stage] || 0.1;
    if (Math.random() > probability) {
      log.debug({ stage: ctx.stage, probability }, 'Skipped callback (probability)');
      return [];
    }

    // Get current topic for relevance matching
    const currentTopic = input.analysis?.topics?.primary || input.analysis?.topics?.detected?.[0];

    // Get callback opportunity
    const callback = engine.getCallbackOpportunity(currentTopic);

    if (callback && callback.shouldSurface) {
      const callbackContent = formatCallbackHint(callback, ctx);
      injections.push(
        createHintInjection('callback-opportunity', callbackContent, {
          category: 'personality',
          confidence: callback.confidence,
        })
      );

      // Increment session counter
      sessionCallbackCounts.set(sessionKey, sessionCallbacks + 1);

      log.debug(
        {
          type: callback.type,
          reference: callback.reference,
          confidence: callback.confidence,
        },
        'Surfaced callback opportunity'
      );
    }

    // Check for inside joke opportunity (separate from moment callbacks)
    const jokeContent = formatInsideJokeHint(ctx);
    if (jokeContent && injections.length === 0) {
      // Only if we didn't already add a callback
      injections.push(
        createHintInjection('inside-joke-opportunity', jokeContent, {
          category: 'personality',
          confidence: 0.6,
        })
      );

      sessionCallbackCounts.set(sessionKey, sessionCallbacks + 1);
    }
  } catch (error) {
    log.error({ error, userId }, 'Error building callback opportunities context');
  }

  return injections;
}

/**
 * Clear session callback counts (call at session end)
 */
export function clearSessionCallbackCount(userId: string, sessionId: string): void {
  const sessionKey = `${userId}_${sessionId}`;
  sessionCallbackCounts.delete(sessionKey);
}

/**
 * Clear all session callback counts (for testing)
 */
export function clearAllSessionCallbackCounts(): void {
  sessionCallbackCounts.clear();
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'callback-opportunities',
  description: 'Natural callbacks to past shared moments and inside jokes',
  priority: 65, // After topic analysis (55), before personality (70)
  build: buildCallbackOpportunitiesContext,
});

export { buildCallbackOpportunitiesContext };
