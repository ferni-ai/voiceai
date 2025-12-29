/**
 * Synthetic Test Routes
 *
 * Enables E2E testing of the voice agent pipeline WITHOUT actual voice calls.
 * Bypasses STT/TTS but uses the real:
 * - Semantic router
 * - Tool execution
 * - LLM response generation
 *
 * This allows automated testing in production to validate:
 * - Weather tool returns correct data
 * - Music tool executes properly
 * - Handoffs work correctly
 * - Any tool functionality
 *
 * @module servers/api/routes/synthetic-test
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../../utils/safe-logger.js';
import { routeTranscript } from '../../../tools/semantic-router/integration/transcript-integration.js';
import { initializeSemanticRouter } from '../../../tools/semantic-router/integration/init.js';
import {
  executeDomainTool,
  hasDomainMapping,
} from '../../../tools/semantic-router/domain-bridge.js';
import type { ServiceRegistry } from '../../../tools/registry/types.js';

const log = createLogger({ module: 'SyntheticTestRoutes' });

// Simple auth token for synthetic tests (set via env var)
const SYNTHETIC_TEST_TOKEN = process.env.SYNTHETIC_TEST_TOKEN || 'dev-test-token';

// Rate limiting: max 10 requests per minute per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT) {
    return false;
  }

  entry.count++;
  return true;
}

/**
 * Parse JSON body from request
 */
async function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10000) {
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Validate authorization header
 */
function isAuthorized(req: IncomingMessage): boolean {
  const authHeader = req.headers.authorization;
  if (!authHeader) return false;

  const [type, token] = authHeader.split(' ');
  return type === 'Bearer' && token === SYNTHETIC_TEST_TOKEN;
}

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

// ============================================================================
// TEST RESULT TYPES
// ============================================================================

interface SyntheticTestRequest {
  /** The text input (simulating what user would say) */
  text: string;

  /** User ID for context */
  userId?: string;

  /** Session ID for context */
  sessionId?: string;

  /** Persona to use (default: ferni) */
  personaId?: string;

  /** Whether to execute tools or just route */
  executeTools?: boolean;

  /** Direct tool execution (bypass routing) */
  directTool?: {
    toolId: string;
    args: Record<string, unknown>;
  };
}

interface SyntheticTestResult {
  success: boolean;
  timestamp: string;
  durationMs: number;

  // Routing info
  routing?: {
    attempted: boolean;
    handled: boolean;
    toolId?: string;
    confidence?: number;
    error?: string;
  };

  // Tool execution info
  toolExecution?: {
    toolId: string;
    executed: boolean;
    result?: unknown;
    error?: string;
    durationMs?: number;
  };

  // Response
  response?: string;

  // Diagnostics
  diagnostics?: {
    semanticRouterInitialized: boolean;
    toolMappingExists?: boolean;
    rawResult?: unknown;
  };
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

/**
 * POST /api/synthetic-test/route
 *
 * Test semantic routing for a given text input.
 * Returns routing decision and tool match info.
 */
async function handleRouteTest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    const body = (await parseBody(req)) as unknown as SyntheticTestRequest;

    if (!body.text) {
      sendJson(res, 400, { error: 'Missing required field: text' });
      return;
    }

    const userId = body.userId || 'synthetic-test-user';
    const sessionId = body.sessionId || `synthetic-${Date.now()}`;
    const personaId = body.personaId || 'ferni';

    // Ensure router is initialized
    await initializeSemanticRouter();

    // Create mock session for routing (no actual generateReply)
    const mockSession = {
      generateReply: () => {
        log.info('🧪 [SYNTHETIC] generateReply called (no-op in test mode)');
      },
    };

    // Route the transcript
    const routingResult = await routeTranscript(body.text, {
      userId,
      sessionId,
      personaId,
      session: mockSession,
      conversationHistory: [],
      recentTools: [],
    });

    const result: SyntheticTestResult = {
      success: true,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      routing: {
        attempted: routingResult.attempted,
        handled: routingResult.handled,
        toolId: routingResult.toolId,
        confidence: routingResult.confidence,
        error: routingResult.error,
      },
      response: routingResult.response,
      diagnostics: {
        semanticRouterInitialized: true,
        toolMappingExists: routingResult.toolId
          ? hasDomainMapping(routingResult.toolId)
          : undefined,
      },
    };

    log.info(
      {
        text: body.text.slice(0, 100),
        toolId: routingResult.toolId,
        confidence: routingResult.confidence,
        handled: routingResult.handled,
        durationMs: result.durationMs,
      },
      '🧪 [SYNTHETIC] Route test completed'
    );

    sendJson(res, 200, result);
  } catch (error) {
    log.error({ error: String(error) }, '🧪 [SYNTHETIC] Route test failed');
    sendJson(res, 500, {
      success: false,
      error: String(error),
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    });
  }
}

/**
 * POST /api/synthetic-test/execute
 *
 * Execute a tool directly (bypassing routing).
 * Useful for testing specific tools.
 */
async function handleDirectExecute(
  req: IncomingMessage,
  res: ServerResponse,
  services?: ServiceRegistry
): Promise<void> {
  const startTime = Date.now();

  try {
    const body = (await parseBody(req)) as unknown as SyntheticTestRequest;

    if (!body.directTool?.toolId) {
      sendJson(res, 400, { error: 'Missing required field: directTool.toolId' });
      return;
    }

    const { toolId, args } = body.directTool;
    const userId = body.userId || 'synthetic-test-user';
    const sessionId = body.sessionId || `synthetic-${Date.now()}`;
    const personaId = body.personaId || 'ferni';

    log.info({ toolId, args, userId }, '🧪 [SYNTHETIC] Direct tool execution starting');

    // Check if tool mapping exists
    if (!hasDomainMapping(toolId)) {
      sendJson(res, 404, {
        success: false,
        error: `Tool not found: ${toolId}`,
        diagnostics: {
          semanticRouterInitialized: true,
          toolMappingExists: false,
        },
      });
      return;
    }

    // Execute the tool
    const toolStartTime = Date.now();
    const toolResult = await executeDomainTool(toolId, args, {
      userId,
      sessionId,
      personaId,
      services,
      conversationHistory: [],
    });

    const result: SyntheticTestResult = {
      success: true,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      toolExecution: {
        toolId,
        executed: true,
        result: toolResult,
        durationMs: Date.now() - toolStartTime,
      },
      diagnostics: {
        semanticRouterInitialized: true,
        toolMappingExists: true,
        rawResult: toolResult,
      },
    };

    log.info(
      {
        toolId,
        durationMs: result.toolExecution?.durationMs,
        resultType: typeof toolResult,
      },
      '🧪 [SYNTHETIC] Direct tool execution completed'
    );

    sendJson(res, 200, result);
  } catch (error) {
    log.error({ error: String(error) }, '🧪 [SYNTHETIC] Direct execute failed');
    sendJson(res, 500, {
      success: false,
      error: String(error),
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    });
  }
}

/**
 * GET /api/synthetic-test/tools
 *
 * List available tools that can be tested.
 */
async function handleListTools(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    // Import domain bridge to get tool mappings
    const { getAllMappings } = await import('../../../tools/semantic-router/domain-bridge.js');

    const mappings = getAllMappings();
    const tools = Object.entries(mappings).map(([id, mapping]) => ({
      id,
      domainToolId: mapping.domainToolId,
    }));

    sendJson(res, 200, {
      success: true,
      timestamp: new Date().toISOString(),
      toolCount: tools.length,
      tools,
    });
  } catch (error) {
    sendJson(res, 500, {
      success: false,
      error: String(error),
    });
  }
}

/**
 * POST /api/synthetic-test/batch
 *
 * Run a batch of synthetic tests.
 * Useful for regression testing.
 */
async function handleBatchTest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const startTime = Date.now();

  try {
    const body = (await parseBody(req)) as {
      tests: Array<{
        name: string;
        text: string;
        expectedToolId?: string;
        expectHandled?: boolean;
      }>;
    };

    if (!body.tests || !Array.isArray(body.tests)) {
      sendJson(res, 400, { error: 'Missing required field: tests (array)' });
      return;
    }

    await initializeSemanticRouter();

    const mockSession = {
      generateReply: () => {},
    };

    const results = await Promise.all(
      body.tests.map(async (test) => {
        const testStart = Date.now();

        try {
          const routingResult = await routeTranscript(test.text, {
            userId: 'batch-test-user',
            sessionId: `batch-${Date.now()}`,
            personaId: 'ferni',
            session: mockSession,
            conversationHistory: [],
            recentTools: [],
          });

          const passed =
            (test.expectedToolId === undefined || routingResult.toolId === test.expectedToolId) &&
            (test.expectHandled === undefined || routingResult.handled === test.expectHandled);

          return {
            name: test.name,
            text: test.text,
            passed,
            durationMs: Date.now() - testStart,
            actual: {
              toolId: routingResult.toolId,
              handled: routingResult.handled,
              confidence: routingResult.confidence,
            },
            expected: {
              toolId: test.expectedToolId,
              handled: test.expectHandled,
            },
          };
        } catch (error) {
          return {
            name: test.name,
            text: test.text,
            passed: false,
            error: String(error),
            durationMs: Date.now() - testStart,
          };
        }
      })
    );

    const passedCount = results.filter((r) => r.passed).length;

    sendJson(res, 200, {
      success: true,
      timestamp: new Date().toISOString(),
      totalDurationMs: Date.now() - startTime,
      summary: {
        total: results.length,
        passed: passedCount,
        failed: results.length - passedCount,
        passRate: `${((passedCount / results.length) * 100).toFixed(1)}%`,
      },
      results,
    });
  } catch (error) {
    sendJson(res, 500, {
      success: false,
      error: String(error),
      timestamp: new Date().toISOString(),
    });
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Handle synthetic test routes
 */
export async function handleSyntheticTestRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  services?: ServiceRegistry
): Promise<boolean> {
  // Only handle /api/synthetic-test/* routes
  if (!pathname.startsWith('/api/synthetic-test')) {
    return false;
  }

  // Check authorization (skip for health check)
  if (pathname !== '/api/synthetic-test/health' && !isAuthorized(req)) {
    sendJson(res, 401, { error: 'Unauthorized. Provide Bearer token.' });
    return true;
  }

  // Rate limiting
  const clientIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
    req.socket.remoteAddress ||
    'unknown';

  if (!checkRateLimit(clientIp)) {
    sendJson(res, 429, { error: 'Rate limit exceeded. Try again later.' });
    return true;
  }

  // Route to handlers
  switch (pathname) {
    case '/api/synthetic-test/health':
      sendJson(res, 200, {
        status: 'ok',
        service: 'synthetic-test',
        timestamp: new Date().toISOString(),
      });
      return true;

    case '/api/synthetic-test/route':
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method not allowed' });
        return true;
      }
      await handleRouteTest(req, res);
      return true;

    case '/api/synthetic-test/execute':
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method not allowed' });
        return true;
      }
      await handleDirectExecute(req, res, services);
      return true;

    case '/api/synthetic-test/tools':
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'Method not allowed' });
        return true;
      }
      await handleListTools(req, res);
      return true;

    case '/api/synthetic-test/batch':
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method not allowed' });
        return true;
      }
      await handleBatchTest(req, res);
      return true;

    default:
      sendJson(res, 404, { error: 'Not found' });
      return true;
  }
}
