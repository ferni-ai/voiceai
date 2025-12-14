/**
 * Marketplace API Routes
 *
 * Unified handler for all marketplace-related API endpoints:
 * - Publisher portal (submit, update, list, analytics, delete)
 * - Browse catalog (list, search, details)
 * - Install/Uninstall management
 * - Usage tracking and billing
 *
 * Uses custom HTTP handler pattern (returns boolean) to match ui-server.js
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../utils/safe-logger.js';
import {
  registerTool,
  registerAgent,
  getTool,
  getAgent,
  listTools,
  listAgents,
  getExecutionHistory,
  installItem,
  uninstallItem,
  getInstallation,
  listInstallations,
  hasPermission,
} from '../marketplace/index.js';
import {
  recordUsage,
  getUsageSummary,
  checkQuota,
  getUsageHistory,
  getPendingPayouts,
} from '../marketplace/billing/index.js';
import {
  isStripeConfigured,
  verifyWebhookSignature,
  handleWebhookEvent,
  createMarketplaceCheckout,
} from '../marketplace/billing/stripe-webhooks.js';
import type {
  ToolManifest,
  AgentManifest,
  TrustLevel,
  PermissionScope,
  UserId,
  MarketplaceId,
} from '../marketplace/schema/types.js';

const log = getLogger().child({ module: 'marketplace-routes' });

// ============================================================================
// TYPES
// ============================================================================

interface PublisherSession {
  publisherId: string;
  publisherName: string;
  verified: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Parse JSON body from request
 */
async function parseBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Parse raw body from request (for Stripe webhooks)
 */
async function parseRawBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Extract path parameter from URL pattern
 * e.g., extractParam('/api/marketplace/tools/:id', '/api/marketplace/tools/my-tool', ':id') => 'my-tool'
 */
function extractParam(pattern: string, path: string, param: string): string | null {
  const patternParts = pattern.split('/');
  const pathParts = path.split('/');

  const paramIndex = patternParts.indexOf(param);
  if (paramIndex === -1 || paramIndex >= pathParts.length) {
    return null;
  }

  return pathParts[paramIndex];
}

/**
 * Get user ID from request headers (Firebase auth)
 */
function getUserId(req: IncomingMessage): string | null {
  return (req.headers['x-user-id'] as string) || null;
}

/**
 * Get publisher session from headers
 */
function getPublisher(req: IncomingMessage): PublisherSession | null {
  const publisherId = req.headers['x-publisher-id'] as string;
  if (!publisherId) return null;

  return {
    publisherId,
    publisherName: (req.headers['x-publisher-name'] as string) || 'Unknown Publisher',
    verified: true,
  };
}

/**
 * Get subscription tier from headers (default: free)
 */
function getSubscriptionTier(req: IncomingMessage): string {
  return (req.headers['x-subscription-tier'] as string) || 'free';
}

// ============================================================================
// VALIDATION
// ============================================================================

function validateToolManifest(manifest: ToolManifest): string[] {
  const errors: string[] = [];

  if (!manifest.id || typeof manifest.id !== 'string') {
    errors.push('Tool ID is required');
  } else if (!/^[a-z0-9-]+$/.test(manifest.id)) {
    errors.push('Tool ID must be lowercase alphanumeric with hyphens');
  }

  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push('Tool name is required');
  }

  if (!manifest.version || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    errors.push('Valid semantic version required (e.g., 1.0.0)');
  }

  if (!manifest.publisher?.id) {
    errors.push('Publisher ID is required');
  }

  if (!manifest.description?.short) {
    errors.push('Short description is required');
  }

  if (!manifest.execution?.runtime?.type) {
    errors.push('Execution runtime type is required');
  }

  if (!manifest.interface?.llmDescription) {
    errors.push('LLM description is required for tool discovery');
  }

  return errors;
}

function validateAgentManifest(manifest: AgentManifest): string[] {
  const errors: string[] = [];

  if (!manifest.id || typeof manifest.id !== 'string') {
    errors.push('Agent ID is required');
  }

  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push('Agent name is required');
  }

  if (!manifest.displayName) {
    errors.push('Display name is required');
  }

  if (!manifest.version || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    errors.push('Valid semantic version required');
  }

  if (!manifest.publisher?.id) {
    errors.push('Publisher ID is required');
  }

  return errors;
}

// ============================================================================
// PUBLISHER ROUTES
// ============================================================================

async function handlePublisherRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string
): Promise<boolean> {
  // POST /api/marketplace/publisher/submit - Submit a new tool/agent
  if (pathname === '/api/marketplace/publisher/submit' && method === 'POST') {
    const publisher = getPublisher(req);
    if (!publisher) {
      sendJson(res, 401, { error: 'Publisher authentication required' });
      return true;
    }

    try {
      const body = await parseBody<{
        type: 'tool' | 'agent';
        manifest: ToolManifest | AgentManifest;
      }>(req);

      const errors =
        body.type === 'tool'
          ? validateToolManifest(body.manifest as ToolManifest)
          : validateAgentManifest(body.manifest as AgentManifest);

      if (errors.length > 0) {
        sendJson(res, 400, {
          success: false,
          error: 'Validation failed',
          validationErrors: errors,
        });
        return true;
      }

      if (body.manifest.publisher.id !== publisher.publisherId) {
        sendJson(res, 403, { success: false, error: 'Publisher ID mismatch' });
        return true;
      }

      const trustLevel: TrustLevel = publisher.verified ? 'community' : 'unverified';
      body.manifest.verification = {
        ...body.manifest.verification,
        trustLevel,
        verified: false,
      };

      if (body.type === 'tool') {
        registerTool(body.manifest as ToolManifest);
      } else {
        registerAgent(body.manifest as AgentManifest);
      }

      log.info(
        { itemId: body.manifest.id, type: body.type, publisherId: publisher.publisherId },
        'Submission accepted'
      );
      sendJson(res, 200, {
        success: true,
        itemId: body.manifest.id,
        status: 'pending_review',
        reviewNotes: 'Your submission is being reviewed. This typically takes 2-5 business days.',
      });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error({ error: err.message }, 'Submission failed');
      sendJson(res, 500, { success: false, error: err.message });
      return true;
    }
  }

  // GET /api/marketplace/publisher/items - List publisher's items
  if (pathname === '/api/marketplace/publisher/items' && method === 'GET') {
    const publisher = getPublisher(req);
    if (!publisher) {
      sendJson(res, 401, { error: 'Publisher authentication required' });
      return true;
    }

    try {
      const tools = listTools().filter((t) => t.publisher.id === publisher.publisherId);
      const agents = listAgents().filter((a) => a.publisher.id === publisher.publisherId);

      const items = [...tools, ...agents].map((item) => ({
        id: item.id,
        name: item.name,
        type: 'displayName' in item ? 'agent' : 'tool',
        version: item.version,
        status: item.verification.verified ? 'approved' : 'pending_review',
        trustLevel: item.verification.trustLevel,
        publishedAt: item.verification.verifiedAt,
      }));

      sendJson(res, 200, { items, totalCount: items.length });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // GET /api/marketplace/publisher/profile - Get publisher profile
  if (pathname === '/api/marketplace/publisher/profile' && method === 'GET') {
    const publisher = getPublisher(req);
    if (!publisher) {
      sendJson(res, 401, { error: 'Publisher authentication required' });
      return true;
    }

    try {
      const tools = listTools().filter((t) => t.publisher.id === publisher.publisherId);
      const agents = listAgents().filter((a) => a.publisher.id === publisher.publisherId);
      const allItems = [...tools, ...agents];

      sendJson(res, 200, {
        publisherId: publisher.publisherId,
        publisherName: publisher.publisherName,
        verified: publisher.verified,
        stats: {
          totalTools: tools.length,
          totalAgents: agents.length,
          approvedItems: allItems.filter((i) => i.verification.verified).length,
          pendingItems: allItems.filter((i) => !i.verification.verified).length,
        },
      });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // GET /api/marketplace/publisher/:id/analytics - Get item analytics
  if (pathname.match(/^\/api\/marketplace\/publisher\/[^/]+\/analytics$/) && method === 'GET') {
    const publisher = getPublisher(req);
    if (!publisher) {
      sendJson(res, 401, { error: 'Publisher authentication required' });
      return true;
    }

    const itemId = pathname.split('/')[4]; // Extract ID from path

    try {
      const tool = getTool(itemId);
      const agent = getAgent(itemId);
      const item = tool || agent;

      if (!item) {
        sendJson(res, 404, { error: 'Item not found' });
        return true;
      }

      if (item.publisher.id !== publisher.publisherId) {
        sendJson(res, 403, { error: 'Not authorized to view analytics' });
        return true;
      }

      const executions = getExecutionHistory(publisher.publisherId, { toolId: itemId });
      const totalExecutions = executions.length;
      const successfulExecutions = executions.filter((e) => e.status === 'success').length;
      const totalTime = executions.reduce((sum, e) => sum + e.durationMs, 0);
      const uniqueUsers = new Set(executions.map((e) => e.userId)).size;

      const errorCounts = new Map<string, { count: number; lastOccurred: string }>();
      for (const exec of executions) {
        if (exec.status !== 'success' && exec.errorCode) {
          const existing = errorCounts.get(exec.errorCode);
          if (existing) {
            existing.count++;
            if (exec.executedAt > existing.lastOccurred) {
              existing.lastOccurred = exec.executedAt;
            }
          } else {
            errorCounts.set(exec.errorCode, { count: 1, lastOccurred: exec.executedAt });
          }
        }
      }

      sendJson(res, 200, {
        itemId,
        period: '30d',
        metrics: {
          totalInstalls: 0,
          activeInstalls: 0,
          totalExecutions,
          successRate: totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 100,
          avgExecutionTimeMs: totalExecutions > 0 ? totalTime / totalExecutions : 0,
          errorCount: totalExecutions - successfulExecutions,
          uniqueUsers,
        },
        revenue: {
          totalCents: 0,
          periodCents: 0,
          currency: 'USD',
        },
        topErrors: Array.from(errorCounts.entries())
          .map(([code, data]) => ({ code, ...data }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5),
      });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // PUT /api/marketplace/publisher/:id - Update submission
  if (pathname.match(/^\/api\/marketplace\/publisher\/[^/]+$/) && method === 'PUT') {
    const publisher = getPublisher(req);
    if (!publisher) {
      sendJson(res, 401, { error: 'Publisher authentication required' });
      return true;
    }

    const itemId = pathname.split('/')[4];

    try {
      const body = await parseBody<{
        type: 'tool' | 'agent';
        manifest: ToolManifest | AgentManifest;
      }>(req);

      const existing = body.type === 'tool' ? getTool(itemId) : getAgent(itemId);
      if (!existing) {
        sendJson(res, 404, { success: false, error: 'Item not found' });
        return true;
      }

      if (existing.publisher.id !== publisher.publisherId) {
        sendJson(res, 403, { success: false, error: 'Not authorized to update this item' });
        return true;
      }

      const errors =
        body.type === 'tool'
          ? validateToolManifest(body.manifest as ToolManifest)
          : validateAgentManifest(body.manifest as AgentManifest);

      if (errors.length > 0) {
        sendJson(res, 400, {
          success: false,
          error: 'Validation failed',
          validationErrors: errors,
        });
        return true;
      }

      if (body.type === 'tool') {
        registerTool(body.manifest as ToolManifest);
      } else {
        registerAgent(body.manifest as AgentManifest);
      }

      sendJson(res, 200, {
        success: true,
        itemId,
        status: existing.verification.verified ? 'approved' : 'pending_review',
      });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { success: false, error: err.message });
      return true;
    }
  }

  // DELETE /api/marketplace/publisher/:id - Delete submission
  if (pathname.match(/^\/api\/marketplace\/publisher\/[^/]+$/) && method === 'DELETE') {
    const publisher = getPublisher(req);
    if (!publisher) {
      sendJson(res, 401, { error: 'Publisher authentication required' });
      return true;
    }

    const itemId = pathname.split('/')[4];

    try {
      const tool = getTool(itemId);
      const agent = getAgent(itemId);
      const item = tool || agent;

      if (!item) {
        sendJson(res, 404, { error: 'Item not found' });
        return true;
      }

      if (item.publisher.id !== publisher.publisherId) {
        sendJson(res, 403, { error: 'Not authorized to delete this item' });
        return true;
      }

      log.info({ itemId, publisherId: publisher.publisherId }, 'Item deletion requested');
      sendJson(res, 200, {
        success: true,
        message:
          'Item scheduled for removal. Existing installations will continue to work for 30 days.',
      });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  return false;
}

// ============================================================================
// BROWSE ROUTES
// ============================================================================

async function handleBrowseRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string
): Promise<boolean> {
  // GET /api/marketplace/browse/tools - List all tools
  if (pathname === '/api/marketplace/browse/tools' && method === 'GET') {
    try {
      const tools = listTools().map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description?.short || '',
        version: t.version,
        publisher: t.publisher,
        trustLevel: t.verification.trustLevel,
        verified: t.verification.verified,
      }));

      sendJson(res, 200, { tools, totalCount: tools.length });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // GET /api/marketplace/browse/agents - List all agents
  if (pathname === '/api/marketplace/browse/agents' && method === 'GET') {
    try {
      const agents = listAgents().map((a) => ({
        id: a.id,
        name: a.name,
        displayName: a.displayName,
        description: a.description || '',
        version: a.version,
        publisher: a.publisher,
        trustLevel: a.verification.trustLevel,
        verified: a.verification.verified,
      }));

      sendJson(res, 200, { agents, totalCount: agents.length });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // GET /api/marketplace/browse/tools/:id - Get tool details
  if (pathname.match(/^\/api\/marketplace\/browse\/tools\/[^/]+$/) && method === 'GET') {
    const toolId = pathname.split('/')[5];

    try {
      const tool = getTool(toolId);
      if (!tool) {
        sendJson(res, 404, { error: 'Tool not found' });
        return true;
      }

      sendJson(res, 200, { tool });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // GET /api/marketplace/browse/agents/:id - Get agent details
  if (pathname.match(/^\/api\/marketplace\/browse\/agents\/[^/]+$/) && method === 'GET') {
    const agentId = pathname.split('/')[5];

    try {
      const agent = getAgent(agentId);
      if (!agent) {
        sendJson(res, 404, { error: 'Agent not found' });
        return true;
      }

      sendJson(res, 200, { agent });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  return false;
}

// ============================================================================
// INSTALL ROUTES
// ============================================================================

async function handleInstallRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string
): Promise<boolean> {
  // POST /api/marketplace/install/tool - Install a tool
  if (pathname === '/api/marketplace/install/tool' && method === 'POST') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    try {
      const body = await parseBody<{ toolId: string; grantedPermissions?: PermissionScope[] }>(req);

      const tool = getTool(body.toolId);
      if (!tool) {
        sendJson(res, 404, { error: 'Tool not found' });
        return true;
      }

      // Use installItem with correct signature
      const installation = await installItem({
        itemType: 'tool',
        itemId: body.toolId,
        userId,
        permissions: body.grantedPermissions || [],
      });

      log.info({ userId, toolId: body.toolId, installationId: installation.id }, 'Tool installed');
      sendJson(res, 200, {
        success: true,
        installation: {
          id: installation.id,
          toolId: installation.itemId,
          installedAt: installation.installedAt,
        },
      });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { success: false, error: err.message });
      return true;
    }
  }

  // POST /api/marketplace/install/agent - Install an agent
  if (pathname === '/api/marketplace/install/agent' && method === 'POST') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    try {
      const body = await parseBody<{ agentId: string; grantedPermissions?: PermissionScope[] }>(
        req
      );

      const agent = getAgent(body.agentId);
      if (!agent) {
        sendJson(res, 404, { error: 'Agent not found' });
        return true;
      }

      // Use installItem with correct signature
      const installation = await installItem({
        itemType: 'agent',
        itemId: body.agentId,
        userId,
        permissions: body.grantedPermissions || [],
      });

      log.info(
        { userId, agentId: body.agentId, installationId: installation.id },
        'Agent installed'
      );
      sendJson(res, 200, {
        success: true,
        installation: {
          id: installation.id,
          agentId: installation.itemId,
          installedAt: installation.installedAt,
        },
      });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { success: false, error: err.message });
      return true;
    }
  }

  // DELETE /api/marketplace/install/tool/:id - Uninstall a tool
  if (pathname.match(/^\/api\/marketplace\/install\/tool\/[^/]+$/) && method === 'DELETE') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    const toolId = pathname.split('/')[5];

    try {
      // Find installation by user + item
      const installation = getInstallation(userId, toolId);
      if (!installation) {
        sendJson(res, 404, { error: 'Installation not found' });
        return true;
      }

      await uninstallItem(installation.id);
      log.info({ userId, toolId }, 'Tool uninstalled');
      sendJson(res, 200, { success: true });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { success: false, error: err.message });
      return true;
    }
  }

  // DELETE /api/marketplace/install/agent/:id - Uninstall an agent
  if (pathname.match(/^\/api\/marketplace\/install\/agent\/[^/]+$/) && method === 'DELETE') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    const agentId = pathname.split('/')[5];

    try {
      // Find installation by user + item
      const installation = getInstallation(userId, agentId);
      if (!installation) {
        sendJson(res, 404, { error: 'Installation not found' });
        return true;
      }

      await uninstallItem(installation.id);
      log.info({ userId, agentId }, 'Agent uninstalled');
      sendJson(res, 200, { success: true });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { success: false, error: err.message });
      return true;
    }
  }

  // GET /api/marketplace/install/list - List user's installations
  if (pathname === '/api/marketplace/install/list' && method === 'GET') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    try {
      const installations = listInstallations(userId);

      const result = installations.map((inst) => ({
        id: inst.id,
        itemId: inst.itemId,
        itemType: inst.itemType,
        installedAt: inst.installedAt,
        status: inst.status,
      }));

      sendJson(res, 200, { installations: result, totalCount: result.length });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  return false;
}

// ============================================================================
// USAGE/BILLING ROUTES
// ============================================================================

async function handleUsageRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string
): Promise<boolean> {
  // GET /api/marketplace/usage/:itemId - Get usage for specific item
  if (pathname.match(/^\/api\/marketplace\/usage\/[^/]+$/) && method === 'GET') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    const itemId = pathname.split('/')[4];
    const tier = getSubscriptionTier(req);

    try {
      const summary = getUsageSummary(userId, itemId, tier);
      sendJson(res, 200, summary);
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // GET /api/marketplace/usage/summary - Get overall usage summary
  if (pathname === '/api/marketplace/usage/summary' && method === 'GET') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    const tier = getSubscriptionTier(req);

    try {
      const installations = listInstallations(userId);
      const summaries = installations.map((inst) => getUsageSummary(userId, inst.itemId, tier));

      // Aggregate totals
      const totalExecutions = summaries.reduce((sum, s) => sum + s.totals.executions, 0);
      const totalTimeMs = summaries.reduce((sum, s) => sum + s.totals.executionTimeMs, 0);

      sendJson(res, 200, {
        period: summaries[0]?.period || new Date().toISOString().slice(0, 7),
        userId,
        tier,
        aggregate: {
          totalExecutions,
          totalTimeMs,
          itemCount: installations.length,
        },
        items: summaries,
      });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // GET /api/marketplace/usage/history - Get usage history
  if (pathname === '/api/marketplace/usage/history' && method === 'GET') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    try {
      const records = getUsageHistory(userId, { limit: 100 });
      sendJson(res, 200, { records, totalCount: records.length });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // GET /api/marketplace/quota/check/:itemId - Check if user can execute
  if (pathname.match(/^\/api\/marketplace\/quota\/check\/[^/]+$/) && method === 'GET') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    const itemId = pathname.split('/')[5];
    const tier = getSubscriptionTier(req);

    try {
      const result = checkQuota(userId, itemId, tier);
      sendJson(res, 200, result);
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // GET /api/marketplace/billing/payouts - Get pending payouts (for publishers)
  if (pathname === '/api/marketplace/billing/payouts' && method === 'GET') {
    const publisher = getPublisher(req);
    if (!publisher) {
      sendJson(res, 401, { error: 'Publisher authentication required' });
      return true;
    }

    try {
      const payouts = getPendingPayouts(publisher.publisherId);
      sendJson(res, 200, { payouts, totalCount: payouts.length });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  return false;
}

// ============================================================================
// PAYMENT/WEBHOOK ROUTES
// ============================================================================

async function handlePaymentRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string
): Promise<boolean> {
  // POST /api/marketplace/webhook - Stripe webhook endpoint
  if (pathname === '/api/marketplace/webhook' && method === 'POST') {
    if (!isStripeConfigured()) {
      sendJson(res, 503, { error: 'Stripe not configured' });
      return true;
    }

    const signature = req.headers['stripe-signature'] as string;
    if (!signature) {
      sendJson(res, 400, { error: 'Missing stripe-signature header' });
      return true;
    }

    try {
      // Must use raw body for signature verification
      const rawBody = await parseRawBody(req);
      const event = verifyWebhookSignature(rawBody, signature);
      await handleWebhookEvent(event);

      log.info({ eventType: event.type, eventId: event.id }, 'Marketplace webhook processed');
      sendJson(res, 200, { received: true });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error({ error: err.message }, 'Webhook processing failed');
      sendJson(res, 400, { error: 'Webhook verification failed' });
      return true;
    }
  }

  // POST /api/marketplace/checkout - Create checkout session
  if (pathname === '/api/marketplace/checkout' && method === 'POST') {
    if (!isStripeConfigured()) {
      sendJson(res, 503, { error: 'Stripe not configured' });
      return true;
    }

    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    try {
      const body = await parseBody<{
        itemId: string;
        itemType: 'tool' | 'agent';
        purchaseType?: 'one-time' | 'subscription';
        successUrl?: string;
        cancelUrl?: string;
        email?: string;
      }>(req);

      if (!body.itemId || !body.itemType) {
        sendJson(res, 400, { error: 'itemId and itemType are required' });
        return true;
      }

      // Get item details
      const item = body.itemType === 'tool' ? getTool(body.itemId) : getAgent(body.itemId);
      if (!item) {
        sendJson(res, 404, { error: `${body.itemType} not found` });
        return true;
      }

      // Get pricing (default to free)
      type ItemPricing =
        | { model: 'free' }
        | { model: 'one-time' | 'subscription'; priceInCents: number };
      const pricing: ItemPricing =
        'pricing' in item && item.pricing ? (item.pricing as ItemPricing) : { model: 'free' };
      if (pricing.model === 'free') {
        sendJson(res, 400, { error: 'This item is free, no checkout required' });
        return true;
      }

      const session = await createMarketplaceCheckout({
        userId: userId as UserId,
        itemId: body.itemId as MarketplaceId,
        itemType: body.itemType,
        itemName: item.name,
        publisherId: item.publisher.id,
        priceInCents: pricing.priceInCents,
        purchaseType:
          body.purchaseType || (pricing.model === 'subscription' ? 'subscription' : 'one-time'),
        successUrl: body.successUrl || 'https://ferni.ai/marketplace/success',
        cancelUrl: body.cancelUrl || 'https://ferni.ai/marketplace',
        email: body.email,
      });

      log.info(
        { userId, itemId: body.itemId, sessionId: session.sessionId },
        'Checkout session created'
      );
      sendJson(res, 200, session);
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error({ error: err.message }, 'Checkout creation failed');
      sendJson(res, 500, { error: 'Failed to create checkout session' });
      return true;
    }
  }

  // GET /api/marketplace/payment/config - Get payment configuration
  if (pathname === '/api/marketplace/payment/config' && method === 'GET') {
    sendJson(res, 200, {
      enabled: isStripeConfigured(),
      currency: 'usd',
      platformFeePercent: 20,
      minPayoutCents: 1000, // $10 minimum payout
      payoutSchedule: 'monthly', // 15th of each month
    });
    return true;
  }

  return false;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Handle all marketplace API routes
 * Returns true if the request was handled, false otherwise
 */
export async function handleMarketplaceRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  _parsedUrl: URL
): Promise<boolean> {
  // Only handle /api/marketplace/* routes
  if (!pathname.startsWith('/api/marketplace/')) {
    return false;
  }

  const method = req.method || 'GET';

  // Publisher routes
  if (pathname.startsWith('/api/marketplace/publisher')) {
    return handlePublisherRoutes(req, res, pathname, method);
  }

  // Browse routes
  if (pathname.startsWith('/api/marketplace/browse')) {
    return handleBrowseRoutes(req, res, pathname, method);
  }

  // Install routes
  if (pathname.startsWith('/api/marketplace/install')) {
    return handleInstallRoutes(req, res, pathname, method);
  }

  // Usage/billing routes
  if (
    pathname.startsWith('/api/marketplace/usage') ||
    pathname.startsWith('/api/marketplace/quota') ||
    pathname.startsWith('/api/marketplace/billing')
  ) {
    return handleUsageRoutes(req, res, pathname, method);
  }

  // Payment/webhook routes
  if (
    pathname === '/api/marketplace/webhook' ||
    pathname === '/api/marketplace/checkout' ||
    pathname.startsWith('/api/marketplace/payment')
  ) {
    return handlePaymentRoutes(req, res, pathname, method);
  }

  return false;
}

/**
 * Check if a path is a marketplace route (for preflight checks)
 */
export function isMarketplaceRoute(pathname: string): boolean {
  return (
    pathname.startsWith('/api/marketplace/') &&
    (pathname.startsWith('/api/marketplace/publisher') ||
      pathname.startsWith('/api/marketplace/browse') ||
      pathname.startsWith('/api/marketplace/install') ||
      pathname.startsWith('/api/marketplace/usage') ||
      pathname.startsWith('/api/marketplace/quota') ||
      pathname.startsWith('/api/marketplace/billing') ||
      pathname.startsWith('/api/marketplace/payment') ||
      pathname === '/api/marketplace/webhook' ||
      pathname === '/api/marketplace/checkout')
  );
}
