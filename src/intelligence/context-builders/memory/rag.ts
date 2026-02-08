// Types restored - context builder properly typed
/**
 * RAG (Retrieval Augmented Generation) Context Builder
 *
 * Handles semantic search and knowledge retrieval:
 * - Persona knowledge lookup (principles, philosophy)
 * - User profile semantic search
 * - Historical conversation retrieval
 *
 * This gives the LLM access to relevant knowledge at the right time.
 *
 * Extracted from jack-bogle.ts lines 1494-1508
 */
import { semanticSearch } from '../../../memory/semantic-rag.js';
import { getLogger } from '../../../utils/safe-logger.js';
import {
  createHintInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

// ============================================================================
// RAG CONTEXT BUILDER
// ============================================================================
/**
 * Build RAG-related context injections
 */
async function buildRagContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userText, analysis, userData } = input;
  const injections: ContextInjection[] = [];
  const turnCount = userData.turnCount || 0;

  // Skip only the first turn (greeting — no meaningful content to search)
  // Run on ALL subsequent turns for consistent "Better than Human" memory recall.
  // Use a lighter topK on even turns to manage latency.
  if (turnCount === 0) {
    return injections;
  }

  const isLightTurn = turnCount % 2 !== 0;
  const topK = isLightTurn ? 2 : 3;

  try {
    // Build query from user message and detected topics
    const topics = analysis.topics.detected;
    const query = topics.length > 0 ? `${userText} topics: ${topics.join(', ')}` : userText;
    // -----------------------------------------------
    // PERSONA KNOWLEDGE LOOKUP
    // -----------------------------------------------
    const knowledgeResults = await semanticSearch(query, {
      topK,
      minScore: 0.7,
    });
    if (knowledgeResults.length > 0) {
      const bestResult = knowledgeResults[0];
      getLogger().debug(
        {
          query: query.slice(0, 50),
          resultCount: knowledgeResults.length,
          topScore: bestResult.score.toFixed(2),
        },
        'RAG lookup complete'
      );
      // Format knowledge for injection
      const knowledgeSummary = knowledgeResults
        .slice(0, 2) // Top 2 results
        .map((r) => `• ${r.content.slice(0, 200)}...`)
        .join('\n');
      if (bestResult.score > 0.8) {
        // High relevance - definitely use this
        injections.push(
          createStandardInjection(
            'rag_knowledge',
            `[RELEVANT KNOWLEDGE - High Match (${Math.round(bestResult.score * 100)}%)]
Draw from this knowledge naturally in your response:
${knowledgeSummary}
DO NOT: Quote this directly. DO: Let it inform your response.`
          )
        );
      } else if (bestResult.score > 0.7) {
        // Medium relevance - optional use
        injections.push(
          createHintInjection(
            'rag_knowledge',
            `[BACKGROUND KNOWLEDGE - Partial Match]
This might be relevant:
${knowledgeSummary}
Use only if it fits naturally.`
          )
        );
      }
    }
    // -----------------------------------------------
    // USER HISTORY SEMANTIC SEARCH
    // (If asking about something they mentioned before)
    // -----------------------------------------------
    const isAskingAboutPast = /\b(remember|last time|before|earlier|you said|mentioned)\b/i.test(
      userText
    );
    if (isAskingAboutPast && input.userProfile) {
      // Search with user-specific filter
      const historyResults = await semanticSearch(query, {
        topK: 2,
        minScore: 0.6,
        userId: input.userProfile.id,
      });
      if (historyResults && historyResults.length > 0) {
        const historySummary = historyResults.map((r) => `• ${r.content.slice(0, 150)}`).join('\n');
        injections.push(
          createStandardInjection(
            'rag_history',
            `[MEMORY RECALL - From Previous Conversations]
${historySummary}
Reference this naturally to show you remember.`
          )
        );
        getLogger().info({ resultCount: historyResults.length }, 'User history RAG lookup');
      }
    }
  } catch (error) {
    // RAG errors are non-blocking
    getLogger().warn(`RAG lookup failed (non-blocking): ${error}`);
  }
  return injections;
}
// ============================================================================
// REGISTER BUILDER
// ============================================================================
registerContextBuilder('rag', buildRagContext);
export { buildRagContext };
