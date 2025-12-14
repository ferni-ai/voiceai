/**
 * Marketplace Publisher Portal API
 *
 * API routes for tool/agent publishers to submit, manage, and
 * monitor their marketplace items.
 *
 * Routes:
 * - POST /api/marketplace/publisher/submit - Submit a new tool/agent
 * - PUT /api/marketplace/publisher/:id - Update a submission
 * - GET /api/marketplace/publisher/items - List publisher's items
 * - GET /api/marketplace/publisher/:id/analytics - Get item analytics
 * - DELETE /api/marketplace/publisher/:id - Remove a submission
 *
 * Authentication: Requires publisher account
 */

import type { Express, Request, Response, NextFunction } from 'express';
import { getLogger } from '../utils/safe-logger.js';
import {
  registerTool,
  registerAgent,
  getTool,
  getAgent,
  listTools,
  listAgents,
  getExecutionHistory,
} from '../marketplace/index.js';
import type { ToolManifest, AgentManifest, TrustLevel } from '../marketplace/schema/types.js';

const log = getLogger().child({ module: 'publisher-api' });

// ============================================================================
// TYPES
// ============================================================================

interface PublisherSession {
  publisherId: string;
  publisherName: string;
  verified: boolean;
  email: string;
}

interface SubmissionRequest {
  type: 'tool' | 'agent';
  manifest: ToolManifest | AgentManifest;
}

interface SubmissionResponse {
  success: boolean;
  itemId?: string;
  status?: 'pending_review' | 'approved' | 'rejected';
  error?: string;
  reviewNotes?: string;
}

interface AnalyticsResponse {
  itemId: string;
  period: string;
  metrics: {
    totalInstalls: number;
    activeInstalls: number;
    totalExecutions: number;
    successRate: number;
    avgExecutionTimeMs: number;
    errorCount: number;
    uniqueUsers: number;
  };
  revenue?: {
    totalCents: number;
    periodCents: number;
    currency: string;
  };
  topErrors: Array<{
    code: string;
    count: number;
    lastOccurred: string;
  }>;
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Verify publisher authentication
 */
function requirePublisher(req: Request, res: Response, next: NextFunction): void {
  // In production, this would verify a JWT or session
  const publisherId = req.headers['x-publisher-id'] as string;
  const publisherName = req.headers['x-publisher-name'] as string;

  if (!publisherId) {
    res.status(401).json({ error: 'Publisher authentication required' });
    return;
  }

  // Attach publisher session to request
  (req as Request & { publisher: PublisherSession }).publisher = {
    publisherId,
    publisherName: publisherName || 'Unknown Publisher',
    verified: true, // Would check against database
    email: '', // Would come from auth
  };

  next();
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate a tool manifest
 */
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

/**
 * Validate an agent manifest
 */
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

  if (!manifest.persona?.personality?.traits?.length) {
    errors.push('Personality traits are required');
  }

  return errors;
}

// ============================================================================
// ROUTES
// ============================================================================

export function registerPublisherRoutes(app: Express): void {
  /**
   * Submit a new tool or agent for review
   */
  app.post(
    '/api/marketplace/publisher/submit',
    requirePublisher,
    async (req: Request, res: Response) => {
      const { publisher } = req as Request & { publisher: PublisherSession };
      const body = req.body as SubmissionRequest;

      log.info({ publisherId: publisher.publisherId, type: body.type }, 'Submission received');

      try {
        // Validate manifest
        const errors =
          body.type === 'tool'
            ? validateToolManifest(body.manifest as ToolManifest)
            : validateAgentManifest(body.manifest as AgentManifest);

        if (errors.length > 0) {
          res.status(400).json({
            success: false,
            error: 'Validation failed',
            validationErrors: errors,
          });
          return;
        }

        // Verify publisher owns this submission
        if (body.manifest.publisher.id !== publisher.publisherId) {
          res.status(403).json({
            success: false,
            error: 'Publisher ID mismatch',
          });
          return;
        }

        // Set initial trust level based on publisher verification
        const trustLevel: TrustLevel = publisher.verified ? 'community' : 'unverified';
        body.manifest.verification = {
          ...body.manifest.verification,
          trustLevel,
          verified: false, // Pending review
        };

        // Register the item (in production, this would go to a review queue)
        if (body.type === 'tool') {
          registerTool(body.manifest as ToolManifest);
        } else {
          registerAgent(body.manifest as AgentManifest);
        }

        const response: SubmissionResponse = {
          success: true,
          itemId: body.manifest.id,
          status: 'pending_review',
          reviewNotes: 'Your submission is being reviewed. This typically takes 2-5 business days.',
        };

        log.info({ itemId: body.manifest.id, type: body.type }, 'Submission accepted');
        res.json(response);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        log.error({ error: err.message }, 'Submission failed');
        res.status(500).json({ success: false, error: err.message });
      }
    }
  );

  /**
   * Update an existing submission
   */
  app.put(
    '/api/marketplace/publisher/:id',
    requirePublisher,
    async (req: Request, res: Response) => {
      const { publisher } = req as Request & { publisher: PublisherSession };
      const { id } = req.params;
      const body = req.body as { type: 'tool' | 'agent'; manifest: ToolManifest | AgentManifest };

      try {
        // Verify ownership
        const existing = body.type === 'tool' ? getTool(id) : getAgent(id);
        if (!existing) {
          res.status(404).json({ success: false, error: 'Item not found' });
          return;
        }

        if (existing.publisher.id !== publisher.publisherId) {
          res.status(403).json({ success: false, error: 'Not authorized to update this item' });
          return;
        }

        // Validate updated manifest
        const errors =
          body.type === 'tool'
            ? validateToolManifest(body.manifest as ToolManifest)
            : validateAgentManifest(body.manifest as AgentManifest);

        if (errors.length > 0) {
          res.status(400).json({
            success: false,
            error: 'Validation failed',
            validationErrors: errors,
          });
          return;
        }

        // Register updated version
        if (body.type === 'tool') {
          registerTool(body.manifest as ToolManifest);
        } else {
          registerAgent(body.manifest as AgentManifest);
        }

        res.json({
          success: true,
          itemId: id,
          status: existing.verification.verified ? 'approved' : 'pending_review',
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        res.status(500).json({ success: false, error: err.message });
      }
    }
  );

  /**
   * List publisher's items
   */
  app.get(
    '/api/marketplace/publisher/items',
    requirePublisher,
    async (req: Request, res: Response) => {
      const { publisher } = req as Request & { publisher: PublisherSession };
      const { type } = req.query;

      try {
        const items: Array<ToolManifest | AgentManifest> = [];

        if (!type || type === 'tool') {
          const tools = listTools().filter((t) => t.publisher.id === publisher.publisherId);
          items.push(...tools);
        }

        if (!type || type === 'agent') {
          const agents = listAgents().filter((a) => a.publisher.id === publisher.publisherId);
          items.push(...agents);
        }

        res.json({
          items: items.map((item) => ({
            id: item.id,
            name: item.name,
            type: 'displayName' in item ? 'agent' : 'tool',
            version: item.version,
            status: item.verification.verified ? 'approved' : 'pending_review',
            trustLevel: item.verification.trustLevel,
            publishedAt: item.verification.verifiedAt,
          })),
          totalCount: items.length,
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        res.status(500).json({ error: err.message });
      }
    }
  );

  /**
   * Get analytics for an item
   */
  app.get(
    '/api/marketplace/publisher/:id/analytics',
    requirePublisher,
    async (req: Request, res: Response) => {
      const { publisher } = req as Request & { publisher: PublisherSession };
      const { id } = req.params;
      const { period = '30d' } = req.query;

      try {
        // Verify ownership
        const tool = getTool(id);
        const agent = getAgent(id);
        const item = tool || agent;

        if (!item) {
          res.status(404).json({ error: 'Item not found' });
          return;
        }

        if (item.publisher.id !== publisher.publisherId) {
          res.status(403).json({ error: 'Not authorized to view analytics' });
          return;
        }

        // Calculate period start
        const periodDays = parseInt(String(period).replace('d', ''), 10) || 30;
        const sinceDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

        // Get execution history (in production, this would aggregate from analytics DB)
        const executions = getExecutionHistory(publisher.publisherId, {
          toolId: id,
          since: sinceDate.toISOString(),
        });

        // Calculate metrics
        const totalExecutions = executions.length;
        const successfulExecutions = executions.filter((e) => e.status === 'success').length;
        const totalTime = executions.reduce((sum, e) => sum + e.durationMs, 0);
        const uniqueUsers = new Set(executions.map((e) => e.userId)).size;

        // Aggregate errors
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

        const response: AnalyticsResponse = {
          itemId: id,
          period: String(period),
          metrics: {
            totalInstalls: 0, // Would come from installations
            activeInstalls: 0,
            totalExecutions,
            successRate: totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 100,
            avgExecutionTimeMs: totalExecutions > 0 ? totalTime / totalExecutions : 0,
            errorCount: totalExecutions - successfulExecutions,
            uniqueUsers,
          },
          revenue: {
            totalCents: 0, // Would come from billing
            periodCents: 0,
            currency: 'USD',
          },
          topErrors: Array.from(errorCounts.entries())
            .map(([code, data]) => ({ code, ...data }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5),
        };

        res.json(response);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        res.status(500).json({ error: err.message });
      }
    }
  );

  /**
   * Delete/unpublish an item
   */
  app.delete(
    '/api/marketplace/publisher/:id',
    requirePublisher,
    async (req: Request, res: Response) => {
      const { publisher } = req as Request & { publisher: PublisherSession };
      const { id } = req.params;

      try {
        // Verify ownership
        const tool = getTool(id);
        const agent = getAgent(id);
        const item = tool || agent;

        if (!item) {
          res.status(404).json({ error: 'Item not found' });
          return;
        }

        if (item.publisher.id !== publisher.publisherId) {
          res.status(403).json({ error: 'Not authorized to delete this item' });
          return;
        }

        // In production, this would soft-delete or deprecate
        // For now, we'll just log
        log.info({ itemId: id, publisherId: publisher.publisherId }, 'Item deletion requested');

        res.json({
          success: true,
          message:
            'Item scheduled for removal. Existing installations will continue to work for 30 days.',
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        res.status(500).json({ error: err.message });
      }
    }
  );

  /**
   * Get publisher profile and stats
   */
  app.get(
    '/api/marketplace/publisher/profile',
    requirePublisher,
    async (req: Request, res: Response) => {
      const { publisher } = req as Request & { publisher: PublisherSession };

      try {
        const tools = listTools().filter((t) => t.publisher.id === publisher.publisherId);
        const agents = listAgents().filter((a) => a.publisher.id === publisher.publisherId);

        res.json({
          publisherId: publisher.publisherId,
          publisherName: publisher.publisherName,
          verified: publisher.verified,
          stats: {
            totalTools: tools.length,
            totalAgents: agents.length,
            approvedItems: [...tools, ...agents].filter((i) => i.verification.verified).length,
            pendingItems: [...tools, ...agents].filter((i) => !i.verification.verified).length,
          },
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        res.status(500).json({ error: err.message });
      }
    }
  );

  log.info('Publisher portal routes registered');
}
