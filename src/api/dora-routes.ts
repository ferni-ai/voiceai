/**
 * DORA Metrics API Routes
 * 
 * REST API for tracking and retrieving DORA metrics.
 * 
 * Endpoints:
 *   GET  /api/dora/metrics        - Get current DORA snapshot
 *   GET  /api/dora/deployments    - List recent deployments
 *   POST /api/dora/deployments    - Record a new deployment
 *   POST /api/dora/deployments/:id/fail - Mark deployment as failed
 *   GET  /api/dora/incidents      - List recent incidents
 *   POST /api/dora/incidents      - Record a new incident
 *   POST /api/dora/incidents/:id/resolve - Resolve an incident
 *   POST /api/dora/seed           - Seed sample data (dev only)
 *   POST /api/dora/reset          - Reset all data (dev only)
 * 
 * Webhook endpoints (for CI/CD):
 *   POST /api/dora/webhook/github - GitHub Actions webhook
 *   POST /api/dora/webhook/cloudbuild - Cloud Build webhook
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getDORAMetricsService } from '../services/dora-metrics.js';
import type { Deployment, Incident } from '../services/dora-metrics.js';

// Helper to parse JSON body
async function parseBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Helper to send JSON response
function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// Helper to send error
function sendError(res: ServerResponse, message: string, status = 400): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message }));
}

export async function handleDORARoutes(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const url = req.url || '';
  const method = req.method || 'GET';

  // Only handle /api/dora/* routes
  if (!url.startsWith('/api/dora')) {
    return false;
  }

  const doraService = getDORAMetricsService();

  try {
    // GET /api/dora/metrics
    if (url === '/api/dora/metrics' && method === 'GET') {
      const metrics = doraService.getMetrics();
      sendJson(res, metrics);
      return true;
    }

    // GET /api/dora/deployments
    if (url.match(/^\/api\/dora\/deployments(\?.*)?$/) && method === 'GET') {
      const deployments = doraService.getDeployments();
      sendJson(res, { deployments });
      return true;
    }

    // POST /api/dora/deployments
    if (url === '/api/dora/deployments' && method === 'POST') {
      const body = await parseBody<Partial<Deployment>>(req);
      
      // Validate required fields
      if (!body.timestamp || !body.commitSha || !body.branch || !body.environment) {
        sendError(res, 'Missing required fields: timestamp, commitSha, branch, environment');
        return true;
      }

      const deployment = doraService.recordDeployment({
        timestamp: body.timestamp,
        commitSha: body.commitSha,
        commitMessage: body.commitMessage,
        branch: body.branch,
        environment: body.environment as Deployment['environment'],
        duration: body.duration || 0,
        success: body.success !== false,
        triggeredBy: body.triggeredBy || 'api',
        buildId: body.buildId,
        rollback: body.rollback,
        metadata: body.metadata,
      });

      sendJson(res, { success: true, deployment }, 201);
      return true;
    }

    // POST /api/dora/deployments/:id/fail
    const failMatch = url.match(/^\/api\/dora\/deployments\/([^/]+)\/fail$/);
    if (failMatch && method === 'POST') {
      const deploymentId = failMatch[1];
      if (!deploymentId) {
        sendError(res, 'Missing deployment ID');
        return true;
      }
      const body = await parseBody<{ rollback?: boolean }>(req);
      const deployment = doraService.markDeploymentFailed(deploymentId, body.rollback);
      
      if (!deployment) {
        sendError(res, 'Deployment not found', 404);
        return true;
      }

      sendJson(res, { success: true, deployment });
      return true;
    }

    // GET /api/dora/incidents
    if (url.match(/^\/api\/dora\/incidents(\?.*)?$/) && method === 'GET') {
      const urlObj = new URL(url, 'http://localhost');
      const activeOnly = urlObj.searchParams.get('active') === 'true';
      
      const incidents = activeOnly 
        ? doraService.getActiveIncidents()
        : doraService.getIncidents();
      
      sendJson(res, { incidents });
      return true;
    }

    // POST /api/dora/incidents
    if (url === '/api/dora/incidents' && method === 'POST') {
      const body = await parseBody<Partial<Incident>>(req);
      
      // Validate required fields
      if (!body.title || !body.severity || !body.startedAt) {
        sendError(res, 'Missing required fields: title, severity, startedAt');
        return true;
      }

      const incident = doraService.recordIncident({
        title: body.title,
        severity: body.severity as Incident['severity'],
        startedAt: body.startedAt,
        deploymentId: body.deploymentId,
        affectedServices: body.affectedServices || [],
      });

      sendJson(res, { success: true, incident }, 201);
      return true;
    }

    // POST /api/dora/incidents/:id/resolve
    const resolveMatch = url.match(/^\/api\/dora\/incidents\/([^/]+)\/resolve$/);
    if (resolveMatch && method === 'POST') {
      const incidentId = resolveMatch[1];
      if (!incidentId) {
        sendError(res, 'Missing incident ID');
        return true;
      }
      const body = await parseBody<{ resolvedAt?: string; resolution?: string; rootCause?: string }>(req);
      
      const incident = doraService.resolveIncident(incidentId, {
        resolvedAt: body.resolvedAt || new Date().toISOString(),
        resolution: body.resolution,
        rootCause: body.rootCause,
      });
      
      if (!incident) {
        sendError(res, 'Incident not found', 404);
        return true;
      }

      sendJson(res, { success: true, incident });
      return true;
    }

    // POST /api/dora/seed (dev only)
    if (url === '/api/dora/seed' && method === 'POST') {
      if (process.env.NODE_ENV === 'production') {
        sendError(res, 'Not available in production', 403);
        return true;
      }
      doraService.seedSampleData();
      sendJson(res, { success: true, message: 'Sample data seeded' });
      return true;
    }

    // POST /api/dora/reset (dev only)
    if (url === '/api/dora/reset' && method === 'POST') {
      if (process.env.NODE_ENV === 'production') {
        sendError(res, 'Not available in production', 403);
        return true;
      }
      doraService.reset();
      sendJson(res, { success: true, message: 'Data reset' });
      return true;
    }

    // POST /api/dora/webhook/github
    if (url === '/api/dora/webhook/github' && method === 'POST') {
      const body = await parseBody<GitHubWebhookPayload>(req);
      const event = req.headers['x-github-event'];

      // Handle workflow_run events (GitHub Actions)
      if (event === 'workflow_run' && body.action === 'completed') {
        const workflow = body.workflow_run;
        if (!workflow) {
          sendError(res, 'Missing workflow_run data');
          return true;
        }

        // Only track deployments from specific workflows
        const workflowName = workflow.name?.toLowerCase() || '';
        const isDeployWorkflow = workflowName.includes('deploy') || workflowName.includes('release');
        
        if (isDeployWorkflow) {
          const deployment = doraService.recordDeployment({
            timestamp: workflow.updated_at || new Date().toISOString(),
            commitSha: workflow.head_sha || 'unknown',
            commitMessage: workflow.head_commit?.message,
            branch: workflow.head_branch || 'main',
            environment: workflowName.includes('prod') ? 'production' : 'staging',
            duration: calculateDuration(workflow.created_at, workflow.updated_at),
            success: workflow.conclusion === 'success',
            triggeredBy: workflow.actor?.login || 'github',
            buildId: String(workflow.id),
            metadata: {
              workflowName: workflow.name,
              runNumber: workflow.run_number,
              url: workflow.html_url,
            },
          });

          sendJson(res, { success: true, deployment });
          return true;
        }
      }

      sendJson(res, { success: true, message: 'Event ignored' });
      return true;
    }

    // POST /api/dora/webhook/cloudbuild
    if (url === '/api/dora/webhook/cloudbuild' && method === 'POST') {
      const body = await parseBody<CloudBuildWebhookPayload>(req);

      if (body.status === 'SUCCESS' || body.status === 'FAILURE') {
        const isProduction = body.substitutions?._ENVIRONMENT === 'production' ||
                            body.tags?.includes('production');

        const deployment = doraService.recordDeployment({
          timestamp: body.finishTime || new Date().toISOString(),
          commitSha: body.substitutions?.COMMIT_SHA || body.source?.repoSource?.commitSha || 'unknown',
          branch: body.substitutions?.BRANCH_NAME || 'main',
          environment: isProduction ? 'production' : 'staging',
          duration: calculateDuration(body.startTime, body.finishTime),
          success: body.status === 'SUCCESS',
          triggeredBy: 'cloudbuild',
          buildId: body.id,
          metadata: {
            projectId: body.projectId,
            logUrl: body.logUrl,
          },
        });

        sendJson(res, { success: true, deployment });
        return true;
      }

      sendJson(res, { success: true, message: 'Build status ignored' });
      return true;
    }

    // Unknown DORA endpoint
    sendError(res, 'Unknown DORA endpoint', 404);
    return true;

  } catch (error) {
    console.error('[DORA API Error]', error);
    sendError(res, error instanceof Error ? error.message : 'Internal error', 500);
    return true;
  }
}

// Webhook Types
interface GitHubWebhookPayload {
  action?: string;
  ref?: string;
  workflow_run?: {
    id: number;
    name?: string;
    head_sha?: string;
    head_branch?: string;
    head_commit?: { message?: string };
    created_at?: string;
    updated_at?: string;
    conclusion?: string;
    actor?: { login?: string };
    html_url?: string;
    run_number?: number;
  };
}

interface CloudBuildWebhookPayload {
  id?: string;
  status?: string;
  projectId?: string;
  startTime?: string;
  finishTime?: string;
  logUrl?: string;
  tags?: string[];
  substitutions?: {
    COMMIT_SHA?: string;
    BRANCH_NAME?: string;
    _ENVIRONMENT?: string;
  };
  source?: {
    repoSource?: {
      commitSha?: string;
    };
  };
}

function calculateDuration(start?: string, end?: string): number {
  if (!start || !end) return 0;
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  return Math.max(0, Math.floor((endTime - startTime) / 1000));
}

