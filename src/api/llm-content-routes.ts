/**
 * LLM Dynamic Content API Routes
 *
 * Exposes metrics and stats for the LLM dynamic content generation system.
 * Useful for monitoring hit rates, cache performance, and debugging.
 *
 * @module api/llm-content-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  getContentMetrics,
  getContentCacheStats,
  getMetricsSummary,
  resetContentMetrics,
} from '../services/llm-dynamic-content.js';
import { getLogger } from '../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Handle LLM content metrics routes
 */
export async function handleLLMContentRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle our routes
  if (!pathname.startsWith('/api/llm-content')) {
    return false;
  }

  // Set JSON content type
  res.setHeader('Content-Type', 'application/json');

  try {
    // GET /api/llm-content/metrics - Detailed metrics
    if (pathname === '/api/llm-content/metrics' && req.method === 'GET') {
      const metrics = getContentMetrics();
      const cacheStats = getContentCacheStats();

      const response = {
        success: true,
        metrics: {
          ...metrics,
          hitRate:
            metrics.totalRequests > 0
              ? (((metrics.llmHits + metrics.cacheHits) / metrics.totalRequests) * 100).toFixed(1) +
                '%'
              : '0%',
          cacheHitRate:
            metrics.totalRequests > 0
              ? ((metrics.cacheHits / metrics.totalRequests) * 100).toFixed(1) + '%'
              : '0%',
          llmHitRate:
            metrics.totalRequests > 0
              ? ((metrics.llmHits / metrics.totalRequests) * 100).toFixed(1) + '%'
              : '0%',
          templateFallbackRate:
            metrics.totalRequests > 0
              ? ((metrics.templateFallbacks / metrics.totalRequests) * 100).toFixed(1) + '%'
              : '0%',
        },
        cache: cacheStats,
        timestamp: Date.now(),
      };

      res.statusCode = 200;
      res.end(JSON.stringify(response, null, 2));
      return true;
    }

    // GET /api/llm-content/summary - Quick summary string
    if (pathname === '/api/llm-content/summary' && req.method === 'GET') {
      const summary = getMetricsSummary();

      res.statusCode = 200;
      res.end(JSON.stringify({ success: true, summary }));
      return true;
    }

    // GET /api/llm-content/stats - Cache stats only
    if (pathname === '/api/llm-content/stats' && req.method === 'GET') {
      const cacheStats = getContentCacheStats();

      res.statusCode = 200;
      res.end(
        JSON.stringify({
          success: true,
          cache: cacheStats,
          timestamp: Date.now(),
        })
      );
      return true;
    }

    // POST /api/llm-content/reset - Reset metrics (admin only)
    if (pathname === '/api/llm-content/reset' && req.method === 'POST') {
      // In production, you'd want auth here
      resetContentMetrics();
      log.info('LLM content metrics reset via API');

      res.statusCode = 200;
      res.end(JSON.stringify({ success: true, message: 'Metrics reset' }));
      return true;
    }

    // POST /api/llm-content/prewarm - Background cache warming (Cloud Scheduler)
    if (pathname === '/api/llm-content/prewarm' && req.method === 'POST') {
      try {
        const { prewarmContent } = await import('../services/llm-dynamic-content.js');
        type ContentType =
          | 'thinking_phrase'
          | 'greeting'
          | 'empathetic_reflection'
          | 'active_listening'
          | 'encouragement';

        // All personas to pre-warm
        const personas = ['ferni', 'peter', 'maya', 'alex', 'jordan', 'nayan'];
        const contentTypes: ContentType[] = [
          'thinking_phrase',
          'greeting',
          'empathetic_reflection',
          'active_listening',
          'encouragement',
        ];

        const contexts = personas.flatMap((personaId) =>
          contentTypes.map((contentType) => ({
            contentType,
            personaId,
            metadata: { prewarmSource: 'scheduled' },
          }))
        );

        await prewarmContent(contexts);

        log.info(
          { personas: personas.length, types: contentTypes.length, total: contexts.length },
          '🔥 Scheduled cache pre-warm complete'
        );

        res.statusCode = 200;
        res.end(
          JSON.stringify({
            success: true,
            message: 'Cache pre-warmed',
            prewarmed: contexts.length,
          })
        );
        return true;
      } catch (error) {
        log.error({ error: String(error) }, 'Scheduled prewarm failed');
        res.statusCode = 500;
        res.end(JSON.stringify({ success: false, error: 'Prewarm failed' }));
        return true;
      }
    }

    // 404 for unknown sub-routes
    res.statusCode = 404;
    res.end(JSON.stringify({ success: false, error: 'Not found' }));
    return true;
  } catch (error) {
    log.error({ error: String(error) }, 'LLM content routes error');
    res.statusCode = 500;
    res.end(JSON.stringify({ success: false, error: 'Internal server error' }));
    return true;
  }
}

export default handleLLMContentRoutes;

