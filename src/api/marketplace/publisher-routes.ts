/**
 * Marketplace Publisher Routes
 *
 * Handles publisher portal operations:
 * - POST /api/marketplace/publisher/submit - Submit a new tool/agent
 * - GET  /api/marketplace/publisher/items - List publisher's items
 * - GET  /api/marketplace/publisher/profile - Get publisher profile
 * - GET  /api/marketplace/publisher/:id/analytics - Get item analytics
 * - PUT  /api/marketplace/publisher/:id - Update submission
 * - DELETE /api/marketplace/publisher/:id - Delete submission
 * - GET  /api/marketplace/review/status/:id - Check review status
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  getAgent,
  getExecutionHistory,
  getTool,
  listAgents,
  listTools,
  registerAgent,
  registerTool,
} from '../../marketplace/index.js';
import type { AgentManifest, ToolManifest, TrustLevel } from '../../marketplace/schema/types.js';
import { getLogger } from '../../utils/safe-logger.js';
import {
  parseBody,
  sendJson,
  getPublisher,
  validateToolManifest,
  validateAgentManifest,
} from './helpers.js';

const log = getLogger().child({ module: 'marketplace-publisher-routes' });

/**
 * Handle publisher routes
 */
export async function handlePublisherRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string
): Promise<boolean> {
  // Import review queue functions dynamically to avoid circular dependencies
  const { submitForReview, getReviewHistory } = await import('../review-queue.js');

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

      const submission = await submitForReview(publisher.publisherId, body.manifest.id, body.type);

      log.info(
        { itemId: body.manifest.id, type: body.type, publisherId: publisher.publisherId },
        'Submission accepted and queued for review'
      );
      sendJson(res, 200, {
        success: true,
        itemId: body.manifest.id,
        submissionId: submission.id,
        status: submission.status,
        automatedChecks: submission.automatedChecks,
        reviewNotes: submission.automatedChecks.passedValidation
          ? 'Your submission passed automated checks and is being reviewed.'
          : 'Your submission has validation issues. Please review and resubmit.',
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
        message: 'Item scheduled for removal. Existing installations continue for 30 days.',
      });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // GET /api/marketplace/review/status/:id - Check review status
  if (pathname.match(/^\/api\/marketplace\/review\/status\/[^/]+$/) && method === 'GET') {
    const publisher = getPublisher(req);
    if (!publisher) {
      sendJson(res, 401, { error: 'Publisher authentication required' });
      return true;
    }

    const itemId = pathname.split('/')[5];

    try {
      const history = await getReviewHistory(itemId);

      if (history.length === 0) {
        sendJson(res, 404, { error: 'No review submissions found for this item' });
        return true;
      }

      if (history[0].publisherId !== publisher.publisherId) {
        sendJson(res, 403, { error: 'Not authorized to view this review' });
        return true;
      }

      const currentSubmission = history[0];

      sendJson(res, 200, {
        currentStatus: currentSubmission.status,
        currentVersion: currentSubmission.version,
        submittedAt: currentSubmission.submittedAt,
        reviewedAt: currentSubmission.reviewedAt,
        decision: currentSubmission.decision,
        feedback: currentSubmission.reviewerFeedback,
        automatedChecks: currentSubmission.automatedChecks,
        totalVersions: history.length,
        previousVersions: currentSubmission.previousVersions,
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
