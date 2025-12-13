/**
 * Landing Intelligence Handler
 *
 * Handler function for landing intelligence API routes.
 * Follows the pattern used by other route handlers in ui-server.js.
 *
 * @module api/landing-intelligence-handler
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { UrlWithParsedQuery } from 'url';
import { createLogger } from '../utils/safe-logger.js';
import {
  generateChatGreeting,
  generateDemoConversation,
  getOptimalSectionOrder,
  getReturningVisitorContext,
  getReturningVisitorExperience,
  getTimeAwareContent,
  optimizeLandingPage,
  recordVisitorSession,
  type BehaviorSignals,
  type LandingOptimizationRequest,
} from '../services/landing-intelligence/index.js';
import {
  getLandingIntelligenceFlags,
  getLandingIntelligenceHealth,
  setLandingIntelligenceFlags,
} from '../services/landing-intelligence/lifecycle.js';
import { getQuickOptimization } from '../services/landing-intelligence/orchestrator.js';
import { generateVisitorId } from '../services/landing-intelligence/returning-visitor.js';

const log = createLogger({ module: 'LandingIntelligenceHandler' });

// ============================================================================
// HELPERS
// ============================================================================

function sendJSON(res: ServerResponse, data: unknown, statusCode = 200): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, message: string, statusCode = 500): void {
  sendJSON(res, { error: message }, statusCode);
}

async function parseBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : ({} as T));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function handleLandingIntelligenceRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  _parsedUrl?: UrlWithParsedQuery
): Promise<boolean> {
  // Only handle /api/landing/* routes
  if (!pathname.startsWith('/api/landing')) {
    return false;
  }

  const method = req.method || 'GET';

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return true;
  }

  try {
    // ============================================================================
    // POST /api/landing/optimize - Main optimization endpoint
    // ============================================================================
    if (pathname === '/api/landing/optimize' && method === 'POST') {
      const body = await parseBody<LandingOptimizationRequest>(req);
      const response = await optimizeLandingPage({
        visitorId: body.visitorId,
        behaviorSignals: body.behaviorSignals,
        device: body.device,
        currentSection: body.currentSection,
        hour: body.hour ?? new Date().getHours(),
        include: body.include,
      });
      sendJSON(res, response);
      return true;
    }

    // ============================================================================
    // GET /api/landing/time-content - Time-aware content
    // ============================================================================
    if (pathname === '/api/landing/time-content' && method === 'GET') {
      const url = new URL(req.url || '', 'http://localhost');
      const hour = url.searchParams.get('hour');
      const content = getTimeAwareContent(hour ? parseInt(hour, 10) : undefined);
      sendJSON(res, content);
      return true;
    }

    // ============================================================================
    // GET /api/landing/demo - Demo conversation
    // ============================================================================
    if (pathname === '/api/landing/demo' && method === 'GET') {
      const url = new URL(req.url || '', 'http://localhost');
      const concern = url.searchParams.get('concern') || undefined;
      const superpower = url.searchParams.get('superpower') || undefined;

      const demo = await generateDemoConversation(
        concern as Parameters<typeof generateDemoConversation>[0],
        superpower as Parameters<typeof generateDemoConversation>[1]
      );
      sendJSON(res, demo);
      return true;
    }

    // ============================================================================
    // POST /api/landing/chat-greeting - Chat widget greeting
    // ============================================================================
    if (pathname === '/api/landing/chat-greeting' && method === 'POST') {
      const { section, timeOnPage, scrollDepth } = await parseBody<{
        section?: string;
        timeOnPage?: number;
        scrollDepth?: number;
      }>(req);

      const result = await getQuickOptimization(
        section || 'hero',
        timeOnPage || 0,
        scrollDepth || 0
      );
      sendJSON(res, result);
      return true;
    }

    // ============================================================================
    // POST /api/landing/layout - Layout optimization
    // ============================================================================
    if (pathname === '/api/landing/layout' && method === 'POST') {
      const { intent, timeMode, device, isReturning, visitCount } = await parseBody<{
        intent?: unknown;
        timeMode?: unknown;
        device?: 'mobile' | 'tablet' | 'desktop';
        isReturning?: boolean;
        visitCount?: number;
      }>(req);

      const layout = await getOptimalSectionOrder({
        intent: intent as Parameters<typeof getOptimalSectionOrder>[0]['intent'],
        timeMode: timeMode as Parameters<typeof getOptimalSectionOrder>[0]['timeMode'],
        device,
        isReturning,
        visitCount,
      });
      sendJSON(res, layout);
      return true;
    }

    // ============================================================================
    // GET /api/landing/visitor/:visitorId - Returning visitor experience
    // ============================================================================
    if (pathname.startsWith('/api/landing/visitor/') && method === 'GET') {
      const visitorId = pathname.split('/').pop();
      if (!visitorId || visitorId === 'new') {
        sendError(res, 'Visitor ID required', 400);
        return true;
      }

      const context = await getReturningVisitorContext(visitorId);

      if (!context) {
        sendJSON(res, {
          isReturning: false,
          visitCount: 1,
        });
        return true;
      }

      const experience = await getReturningVisitorExperience(context);

      sendJSON(res, {
        isReturning: true,
        visitCount: context.visitCount,
        experience,
        context: {
          firstVisit: context.firstVisit,
          lastVisit: context.lastVisit,
          topSections: context.topSections,
        },
      });
      return true;
    }

    // ============================================================================
    // POST /api/landing/visitor/new - Generate new visitor ID
    // ============================================================================
    if (pathname === '/api/landing/visitor/new' && method === 'POST') {
      const visitorId = generateVisitorId();
      sendJSON(res, { visitorId });
      return true;
    }

    // ============================================================================
    // POST /api/landing/track - Track behavior
    // ============================================================================
    if (pathname === '/api/landing/track' && method === 'POST') {
      const { visitorId, sessionId, signals } = await parseBody<{
        visitorId?: string;
        sessionId?: string;
        signals?: {
          startTime?: number;
          sectionsViewed?: string[];
          timePerSection?: Record<string, number>;
          scrollDepth?: number;
          ctaClicks?: number;
          variantsSeen?: string[];
          converted?: boolean;
        };
      }>(req);

      if (!visitorId || !sessionId) {
        sendError(res, 'visitorId and sessionId required', 400);
        return true;
      }

      recordVisitorSession({
        visitorId,
        sessionId,
        startTime: new Date(signals?.startTime || Date.now()),
        sectionsViewed: signals?.sectionsViewed || [],
        timePerSection: signals?.timePerSection || {},
        scrollDepth: signals?.scrollDepth || 0,
        ctaClicks: signals?.ctaClicks || 0,
        variantsSeen: signals?.variantsSeen || [],
        converted: signals?.converted || false,
      });

      sendJSON(res, { success: true });
      return true;
    }

    // ============================================================================
    // POST /api/landing/track/end - End session
    // ============================================================================
    if (pathname === '/api/landing/track/end' && method === 'POST') {
      const { visitorId, sessionId, signals } = await parseBody<{
        visitorId?: string;
        sessionId?: string;
        signals?: {
          startTime?: number;
          sectionsViewed?: string[];
          timePerSection?: Record<string, number>;
          scrollDepth?: number;
          ctaClicks?: number;
          variantsSeen?: string[];
          converted?: boolean;
        };
      }>(req);

      if (!visitorId || !sessionId) {
        sendError(res, 'visitorId and sessionId required', 400);
        return true;
      }

      recordVisitorSession({
        visitorId,
        sessionId,
        startTime: new Date(signals?.startTime || Date.now()),
        endTime: new Date(),
        sectionsViewed: signals?.sectionsViewed || [],
        timePerSection: signals?.timePerSection || {},
        scrollDepth: signals?.scrollDepth || 0,
        ctaClicks: signals?.ctaClicks || 0,
        variantsSeen: signals?.variantsSeen || [],
        converted: signals?.converted || false,
      });

      sendJSON(res, { success: true });
      return true;
    }

    // ============================================================================
    // GET /api/landing/health - Health check
    // ============================================================================
    if (pathname === '/api/landing/health' && method === 'GET') {
      const health = getLandingIntelligenceHealth();
      const statusCode =
        health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
      sendJSON(res, health, statusCode);
      return true;
    }

    // ============================================================================
    // GET /api/landing/flags - Get feature flags
    // ============================================================================
    if (pathname === '/api/landing/flags' && method === 'GET') {
      sendJSON(res, getLandingIntelligenceFlags());
      return true;
    }

    // ============================================================================
    // PUT /api/landing/flags - Update feature flags (admin)
    // ============================================================================
    if (pathname === '/api/landing/flags' && method === 'PUT') {
      const flags = await parseBody<Record<string, boolean>>(req);
      setLandingIntelligenceFlags(flags);
      sendJSON(res, getLandingIntelligenceFlags());
      return true;
    }

    // Not handled
    return false;
  } catch (error) {
    log.error({ error, pathname }, 'Landing intelligence route error');
    sendError(res, error instanceof Error ? error.message : 'Internal server error');
    return true;
  }
}

export default handleLandingIntelligenceRoutes;
