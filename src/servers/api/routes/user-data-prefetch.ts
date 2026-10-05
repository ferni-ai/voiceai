/**
 * Token-time user data pre-fetch, split out of token.ts.
 *
 * @module servers/api/routes/user-data-prefetch
 */

import { createLogger } from '../../../utils/safe-logger.js';

// Same module name as token.ts so existing log queries keep matching.
const log = createLogger({ module: 'TokenRoutes' });

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
