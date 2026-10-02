/**
 * Session Pre-warm
 *
 * Fire-and-forget work started when a token is requested, before the voice
 * session begins: LLM content cache warming, publisher lookup for marketplace
 * personas, and user data pre-fetching.
 */

import { prewarmContent, type ContentType } from '../../../services/llm-dynamic-content.js';
import { createLogger } from '../../../utils/safe-logger.js';
// Developer Platform: marketplace registry for persona→publisher lookup
import { getAgentAsync } from '../../../marketplace/registry.js';

const log = createLogger({ module: 'TokenRoutes' });

/**
 * Pre-warm LLM content cache for a persona (fire-and-forget)
 * Called when user requests a token, BEFORE session starts
 */
export function prewarmLLMContentForPersona(personaId: string, userId?: string): void {
  const contentTypes: ContentType[] = [
    'thinking_phrase',
    'greeting',
    'empathetic_reflection',
    'active_listening',
    'encouragement',
    'celebration',
  ];

  const contexts = contentTypes.map((contentType) => ({
    contentType,
    personaId,
    metadata: { userId, prewarmSource: 'token_request' },
  }));

  // Fire-and-forget - don't await, just log success/failure
  prewarmContent(contexts)
    .then(() => log.debug({ personaId, types: contentTypes.length }, '🔥 LLM cache pre-warmed'))
    .catch((err) => log.warn({ error: String(err) }, 'LLM pre-warm failed (non-fatal)'));
}

/**
 * 🔗 Developer Platform: Look up publisher ID for a persona
 *
 * For marketplace/custom personas, returns the publisher.id from AgentManifest.
 * For built-in personas (ferni, maya, etc.), returns undefined.
 *
 * This enables the Developer Platform to:
 * - Load publisher-registered MCP servers
 * - Dispatch webhooks to the correct publisher
 * - Track activities by publisher
 */
export async function getPublisherIdForPersona(personaId: string): Promise<string | undefined> {
  try {
    // Check if this is a marketplace/custom persona
    const agent = await getAgentAsync(personaId);
    if (agent?.publisher?.id) {
      log.debug({ personaId, publisherId: agent.publisher.id }, '🔗 Publisher ID resolved');
      return agent.publisher.id;
    }
    // Built-in personas don't have a publisher
    return undefined;
  } catch (err) {
    // Non-fatal - fall back to no publisher
    log.debug({ personaId, error: String(err) }, 'Publisher lookup failed (non-fatal)');
    return undefined;
  }
}

/**
 * ⚡ OPTIMIZATION: Pre-fetch user data during token generation
 *
 * This saves 200-500ms on session start by loading:
 * - User profile from Firestore
 * - Trust profiles
 * - Cross-persona insights
 * - Memory embeddings
 *
 * Data is cached in memory and ready when agent session starts.
 * Fire-and-forget - failures don't block token generation.
 */
export function prefetchUserData(userId: string, personaId: string): void {
  if (!userId || userId.length < 10) return; // Skip invalid/test IDs

  const startTime = Date.now();

  // Fire-and-forget all pre-fetches in parallel
  Promise.all([
    // 1. Pre-warm user profile (biggest latency saver)
    (async () => {
      try {
        const { getGlobalServices } = await import('../../../services/global-services.js');
        const global = await getGlobalServices();
        if (global?.store) {
          const profile = await global.store.getProfile(userId);
          if (profile) {
            log.debug(
              { userId: userId.slice(0, 8), totalConvs: profile.totalConversations },
              '⚡ User profile pre-fetched'
            );
          }
        }
      } catch (e) {
        log.debug({ error: String(e) }, 'Profile pre-fetch failed (non-fatal)');
      }
    })(),

    // 2. Pre-warm trust profiles
    (async () => {
      try {
        const { onSessionStart } = await import('../../../services/trust-systems/index.js');
        await onSessionStart(userId);
        log.debug({ userId: userId.slice(0, 8) }, '⚡ Trust profiles pre-fetched');
      } catch (e) {
        log.debug({ error: String(e) }, 'Trust pre-fetch failed (non-fatal)');
      }
    })(),

    // 3. Pre-warm cross-persona insights
    (async () => {
      try {
        const { loadInsights } = await import('../../../services/cross-persona-insights.js');
        await loadInsights(userId);
        log.debug({ userId: userId.slice(0, 8) }, '⚡ Cross-persona insights pre-fetched');
      } catch (e) {
        log.debug({ error: String(e) }, 'Insights pre-fetch failed (non-fatal)');
      }
    })(),

    // 4. Pre-compute memory embeddings for faster search
    // NOTE: Skipped - precomputeUserMemoryEmbeddings requires memory content arrays
    // which requires an additional DB fetch. The optimization isn't worth the
    // complexity here. Embeddings will be computed on-demand during conversation.

    // 5. Pre-warm persona bundle
    (async () => {
      try {
        // FIX: Use loadBundleById which searches standard paths, not loadBundle which expects full path
        const { loadBundleById } = await import('../../../personas/bundles/loader.js');
        await loadBundleById(personaId);
        log.debug({ personaId }, '⚡ Persona bundle pre-loaded');
      } catch (e) {
        log.debug({ error: String(e) }, 'Persona bundle pre-load failed (non-fatal)');
      }
    })(),
  ])
    .then(() => {
      const elapsed = Date.now() - startTime;
      log.info(
        { userId: userId.slice(0, 8), personaId, elapsedMs: elapsed },
        '⚡ User data pre-fetch complete'
      );
    })
    .catch((err) => {
      log.debug({ error: String(err) }, 'User data pre-fetch partially failed (non-fatal)');
    });
}
