/**
 * Life Automation Routes
 *
 * RESTful API endpoints for the Life Automation system:
 * - Workflow CRUD and execution
 * - Template browsing and instantiation
 * - OAuth integration management
 * - Job queue status
 *
 * @module api/life-automation-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import {
  getWorkflowData,
  saveWorkflowData,
  type Workflow,
  type WorkflowAction,
} from '../services/stores/workflow-store.js';
import { getTemplateLibrary } from '../services/workflows/templates/template-library.js';
import { getSchedulerService } from '../services/workflows/scheduler/scheduler-service.js';
import { getJobQueue, type Job } from '../services/workflows/jobs/job-queue.js';
import { getOAuthManager } from '../services/integrations/oauth-manager.js';
import { getConnectedIntegrations } from '../services/integrations/oauth-token-store.js';
import { randomUUID } from 'crypto';

const log = createLogger({ module: 'life-automation-routes' });

// ============================================================================
// HELPERS
// ============================================================================

async function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString();
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function getQueryParam(url: URL, name: string): string | null {
  return url.searchParams.get(name);
}

// ============================================================================
// WORKFLOW ROUTES
// ============================================================================

export async function handleLifeAutomationRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  const method = req.method || 'GET';

  // -------------------------------------------------------------------------
  // WORKFLOWS
  // -------------------------------------------------------------------------

  // GET /api/life-automation/workflows - List workflows
  if (pathname === '/api/life-automation/workflows' && method === 'GET') {
    const userId = getQueryParam(parsedUrl, 'userId');
    if (!userId) {
      sendJson(res, 400, { error: 'Missing userId' });
      return true;
    }

    try {
      const data = await getWorkflowData(userId);
      sendJson(res, 200, { workflows: data.workflows, settings: data.settings });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to list workflows');
      sendJson(res, 500, { error: 'Failed to list workflows' });
    }
    return true;
  }

  // POST /api/life-automation/workflows - Create workflow
  if (pathname === '/api/life-automation/workflows' && method === 'POST') {
    try {
      const body = (await parseBody(req)) as Record<string, unknown>;
      const { userId, name, description, trigger, conditions, actions, tags, icon, color } = body;

      if (!userId || !name || !trigger) {
        sendJson(res, 400, { error: 'Missing required fields: userId, name, trigger' });
        return true;
      }

      const now = new Date().toISOString();
      const workflow: Workflow = {
        id: `wf_${randomUUID()}`,
        userId: userId as string,
        name: name as string,
        description: description as string | undefined,
        status: 'paused',
        trigger: trigger as Workflow['trigger'],
        conditions: (conditions as Workflow['conditions']) || [],
        actions: (actions as WorkflowAction[]) || [],
        variables: {},
        category: undefined,
        tags: (tags as string[]) || [],
        icon: icon as string | undefined,
        color: color as string | undefined,
        runCount: 0,
        isTemplate: false,
        createdAt: now,
        updatedAt: now,
      };

      const data = await getWorkflowData(userId as string);
      data.workflows.push(workflow);
      await saveWorkflowData(userId as string, data);

      log.info({ workflowId: workflow.id, userId }, 'Workflow created');
      sendJson(res, 201, { workflow });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to create workflow');
      sendJson(res, 500, { error: 'Failed to create workflow' });
    }
    return true;
  }

  // GET /api/life-automation/workflows/:id
  const workflowMatch = pathname.match(/^\/api\/life-automation\/workflows\/([^/]+)$/);
  if (workflowMatch && method === 'GET') {
    const workflowId = workflowMatch[1];
    const userId = getQueryParam(parsedUrl, 'userId');

    if (!userId) {
      sendJson(res, 400, { error: 'Missing userId' });
      return true;
    }

    try {
      const data = await getWorkflowData(userId);
      const workflow = data.workflows.find((w) => w.id === workflowId);

      if (!workflow) {
        sendJson(res, 404, { error: 'Workflow not found' });
        return true;
      }

      sendJson(res, 200, { workflow });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to get workflow');
      sendJson(res, 500, { error: 'Failed to get workflow' });
    }
    return true;
  }

  // PUT /api/life-automation/workflows/:id
  if (workflowMatch && method === 'PUT') {
    const workflowId = workflowMatch[1];

    try {
      const body = (await parseBody(req)) as Record<string, unknown>;
      const userId = body.userId as string;

      if (!userId) {
        sendJson(res, 400, { error: 'Missing userId' });
        return true;
      }

      const data = await getWorkflowData(userId);
      const workflow = data.workflows.find((w) => w.id === workflowId);

      if (!workflow) {
        sendJson(res, 404, { error: 'Workflow not found' });
        return true;
      }

      // Update allowed fields
      if (body.name) workflow.name = body.name as string;
      if (body.description !== undefined) workflow.description = body.description as string;
      if (body.trigger) workflow.trigger = body.trigger as Workflow['trigger'];
      if (body.conditions) workflow.conditions = body.conditions as Workflow['conditions'];
      if (body.actions) workflow.actions = body.actions as WorkflowAction[];
      if (body.tags) workflow.tags = body.tags as string[];
      if (body.icon !== undefined) workflow.icon = body.icon as string;
      if (body.color !== undefined) workflow.color = body.color as string;
      if (body.variables) workflow.variables = body.variables as Record<string, unknown>;
      workflow.updatedAt = new Date().toISOString();

      await saveWorkflowData(userId, data);

      log.info({ workflowId, userId }, 'Workflow updated');
      sendJson(res, 200, { workflow });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to update workflow');
      sendJson(res, 500, { error: 'Failed to update workflow' });
    }
    return true;
  }

  // DELETE /api/life-automation/workflows/:id
  if (workflowMatch && method === 'DELETE') {
    const workflowId = workflowMatch[1];
    const userId = getQueryParam(parsedUrl, 'userId');

    if (!userId) {
      sendJson(res, 400, { error: 'Missing userId' });
      return true;
    }

    try {
      const data = await getWorkflowData(userId);
      const index = data.workflows.findIndex((w) => w.id === workflowId);

      if (index === -1) {
        sendJson(res, 404, { error: 'Workflow not found' });
        return true;
      }

      await getSchedulerService().cancelSchedule(userId, workflowId);
      data.workflows.splice(index, 1);
      await saveWorkflowData(userId, data);

      log.info({ workflowId, userId }, 'Workflow deleted');
      sendJson(res, 200, { success: true });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to delete workflow');
      sendJson(res, 500, { error: 'Failed to delete workflow' });
    }
    return true;
  }

  // POST /api/life-automation/workflows/:id/activate
  const activateMatch = pathname.match(/^\/api\/life-automation\/workflows\/([^/]+)\/activate$/);
  if (activateMatch && method === 'POST') {
    const workflowId = activateMatch[1];

    try {
      const body = (await parseBody(req)) as Record<string, unknown>;
      const userId = body.userId as string;

      if (!userId) {
        sendJson(res, 400, { error: 'Missing userId' });
        return true;
      }

      const data = await getWorkflowData(userId);
      const workflow = data.workflows.find((w) => w.id === workflowId);

      if (!workflow) {
        sendJson(res, 404, { error: 'Workflow not found' });
        return true;
      }

      workflow.status = 'active';
      workflow.updatedAt = new Date().toISOString();

      // Schedule if time-based trigger
      if (workflow.trigger.type === 'time') {
        await getSchedulerService().scheduleWorkflow({
          workflowId,
          userId,
          schedule: workflow.trigger.schedule,
          timezone: workflow.trigger.timezone || 'UTC',
          enabled: true,
        });
      }

      await saveWorkflowData(userId, data);

      log.info({ workflowId, userId }, 'Workflow activated');
      sendJson(res, 200, { workflow });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to activate workflow');
      sendJson(res, 500, { error: 'Failed to activate workflow' });
    }
    return true;
  }

  // POST /api/life-automation/workflows/:id/pause
  const pauseMatch = pathname.match(/^\/api\/life-automation\/workflows\/([^/]+)\/pause$/);
  if (pauseMatch && method === 'POST') {
    const workflowId = pauseMatch[1];

    try {
      const body = (await parseBody(req)) as Record<string, unknown>;
      const userId = body.userId as string;

      if (!userId) {
        sendJson(res, 400, { error: 'Missing userId' });
        return true;
      }

      const data = await getWorkflowData(userId);
      const workflow = data.workflows.find((w) => w.id === workflowId);

      if (!workflow) {
        sendJson(res, 404, { error: 'Workflow not found' });
        return true;
      }

      workflow.status = 'paused';
      workflow.updatedAt = new Date().toISOString();

      await getSchedulerService().pauseSchedule(userId, workflowId);
      await saveWorkflowData(userId, data);

      log.info({ workflowId, userId }, 'Workflow paused');
      sendJson(res, 200, { workflow });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to pause workflow');
      sendJson(res, 500, { error: 'Failed to pause workflow' });
    }
    return true;
  }

  // POST /api/life-automation/workflows/:id/run - Manually run
  const runMatch = pathname.match(/^\/api\/life-automation\/workflows\/([^/]+)\/run$/);
  if (runMatch && method === 'POST') {
    const workflowId = runMatch[1];

    try {
      const body = (await parseBody(req)) as Record<string, unknown>;
      const userId = body.userId as string;
      const variables = body.variables as Record<string, unknown> | undefined;

      if (!userId) {
        sendJson(res, 400, { error: 'Missing userId' });
        return true;
      }

      const data = await getWorkflowData(userId);
      const workflow = data.workflows.find((w) => w.id === workflowId);

      if (!workflow) {
        sendJson(res, 404, { error: 'Workflow not found' });
        return true;
      }

      // Enqueue job for execution
      const job = await getJobQueue().enqueue({
        type: 'workflow_execution',
        payload: {
          workflowId,
          userId,
          variables: { ...workflow.variables, ...variables },
          triggeredBy: 'manual',
        },
        userId,
        priority: 'high',
      });

      log.info({ workflowId, userId, jobId: job.id }, 'Workflow run triggered');
      sendJson(res, 200, { jobId: job.id, status: 'queued' });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to run workflow');
      sendJson(res, 500, { error: 'Failed to run workflow' });
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // TEMPLATES
  // -------------------------------------------------------------------------

  // GET /api/life-automation/templates
  if (pathname === '/api/life-automation/templates' && method === 'GET') {
    try {
      const library = getTemplateLibrary();
      const templates = library.getAll();
      const categories = library.getCategories();
      const featured = library.getFeatured();

      sendJson(res, 200, { templates, categories, featured });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to list templates');
      sendJson(res, 500, { error: 'Failed to list templates' });
    }
    return true;
  }

  // GET /api/life-automation/templates/:id
  const templateMatch = pathname.match(/^\/api\/life-automation\/templates\/([^/]+)$/);
  if (templateMatch && method === 'GET') {
    const templateId = templateMatch[1];

    try {
      const template = getTemplateLibrary().getById(templateId);

      if (!template) {
        sendJson(res, 404, { error: 'Template not found' });
        return true;
      }

      sendJson(res, 200, { template });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to get template');
      sendJson(res, 500, { error: 'Failed to get template' });
    }
    return true;
  }

  // POST /api/life-automation/templates/:id/create - Create workflow from template
  const createFromTemplateMatch = pathname.match(
    /^\/api\/life-automation\/templates\/([^/]+)\/create$/
  );
  if (createFromTemplateMatch && method === 'POST') {
    const templateId = createFromTemplateMatch[1];

    try {
      const body = (await parseBody(req)) as Record<string, unknown>;
      const userId = body.userId as string;
      const variables = body.variables as Record<string, unknown> | undefined;

      if (!userId) {
        sendJson(res, 400, { error: 'Missing userId' });
        return true;
      }

      const workflowData = getTemplateLibrary().createFromTemplate(
        templateId,
        userId,
        variables || {}
      );

      if (!workflowData) {
        sendJson(res, 404, { error: 'Template not found' });
        return true;
      }

      const now = new Date().toISOString();
      const workflow: Workflow = {
        ...workflowData,
        id: `wf_${randomUUID()}`,
        createdAt: now,
        updatedAt: now,
      };

      const data = await getWorkflowData(userId);
      data.workflows.push(workflow);
      await saveWorkflowData(userId, data);

      log.info({ workflowId: workflow.id, templateId, userId }, 'Workflow created from template');
      sendJson(res, 201, { workflow });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to create from template');
      sendJson(res, 500, { error: 'Failed to create from template' });
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // INTEGRATIONS
  // -------------------------------------------------------------------------

  // GET /api/life-automation/integrations - List available integrations
  if (pathname === '/api/life-automation/integrations' && method === 'GET') {
    try {
      const oauthManager = getOAuthManager();
      const available = oauthManager.getAvailableIntegrations();

      sendJson(res, 200, { integrations: available });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to list integrations');
      sendJson(res, 500, { error: 'Failed to list integrations' });
    }
    return true;
  }

  // GET /api/life-automation/integrations/connected - List user's connected integrations
  if (pathname === '/api/life-automation/integrations/connected' && method === 'GET') {
    const userId = getQueryParam(parsedUrl, 'userId');

    if (!userId) {
      sendJson(res, 400, { error: 'Missing userId' });
      return true;
    }

    try {
      const connections = await getConnectedIntegrations(userId);
      sendJson(res, 200, { connections });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to get connections');
      sendJson(res, 500, { error: 'Failed to get connections' });
    }
    return true;
  }

  // GET /api/life-automation/integrations/:provider/status
  const integrationStatusMatch = pathname.match(
    /^\/api\/life-automation\/integrations\/([^/]+)\/status$/
  );
  if (integrationStatusMatch && method === 'GET') {
    const provider = integrationStatusMatch[1];
    const userId = getQueryParam(parsedUrl, 'userId');

    if (!userId) {
      sendJson(res, 400, { error: 'Missing userId' });
      return true;
    }

    try {
      const status = await getOAuthManager().getStatus(userId, provider);
      sendJson(res, 200, status);
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to get integration status');
      sendJson(res, 500, { error: 'Failed to get integration status' });
    }
    return true;
  }

  // POST /api/life-automation/integrations/:provider/disconnect
  const disconnectMatch = pathname.match(
    /^\/api\/life-automation\/integrations\/([^/]+)\/disconnect$/
  );
  if (disconnectMatch && method === 'POST') {
    const provider = disconnectMatch[1];

    try {
      const body = (await parseBody(req)) as Record<string, unknown>;
      const userId = body.userId as string;

      if (!userId) {
        sendJson(res, 400, { error: 'Missing userId' });
        return true;
      }

      const success = await getOAuthManager().disconnect(userId, provider);

      if (success) {
        log.info({ provider, userId }, 'Integration disconnected');
        sendJson(res, 200, { success: true });
      } else {
        sendJson(res, 500, { success: false, error: 'Failed to disconnect' });
      }
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to disconnect integration');
      sendJson(res, 500, { error: 'Failed to disconnect integration' });
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // JOB QUEUE STATUS
  // -------------------------------------------------------------------------

  // GET /api/life-automation/jobs/stats
  if (pathname === '/api/life-automation/jobs/stats' && method === 'GET') {
    try {
      const stats = getJobQueue().getStats();
      sendJson(res, 200, { stats });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to get job stats');
      sendJson(res, 500, { error: 'Failed to get job stats' });
    }
    return true;
  }

  // GET /api/life-automation/jobs/:id
  const jobMatch = pathname.match(/^\/api\/life-automation\/jobs\/([^/]+)$/);
  if (jobMatch && method === 'GET') {
    const jobId = jobMatch[1];

    try {
      const job = getJobQueue().getJob(jobId);

      if (!job) {
        sendJson(res, 404, { error: 'Job not found' });
        return true;
      }

      sendJson(res, 200, { job });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to get job');
      sendJson(res, 500, { error: 'Failed to get job' });
    }
    return true;
  }

  // Not handled
  return false;
}

// ============================================================================
// WORKFLOW EXECUTION HANDLER
// ============================================================================

/**
 * Initialize the workflow execution handler
 * This registers the job handler and starts processing
 */
export function initWorkflowExecutionHandler(): void {
  const jobQueue = getJobQueue();

  // Register the workflow execution handler
  jobQueue.registerHandler<
    { workflowId: string; userId: string; variables: Record<string, unknown>; triggeredBy: string },
    { success: boolean; results: unknown[] }
  >({
    type: 'workflow_execution',
    handler: async (job) => {
      const { workflowId, userId, variables, triggeredBy } = job.payload;

      log.info({ workflowId, userId, triggeredBy }, 'Executing workflow');

      // Get workflow
      const data = await getWorkflowData(userId);
      const workflow = data.workflows.find((w) => w.id === workflowId);

      if (!workflow) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      // Execute actions
      const results: unknown[] = [];
      for (const action of workflow.actions) {
        try {
          const result = await executeAction(action, userId, variables);
          results.push({ actionId: action.id, success: true, result });
        } catch (error) {
          results.push({ actionId: action.id, success: false, error: String(error) });
          log.error({ actionId: action.id, error: String(error) }, 'Action execution failed');
        }
      }

      // Update workflow run count
      workflow.runCount++;
      workflow.lastRunAt = new Date().toISOString();
      await saveWorkflowData(userId, data);

      log.info({ workflowId, resultCount: results.length }, 'Workflow execution complete');

      return { success: true, results };
    },
    options: {
      timeout: 60000,
      maxAttempts: 3,
    },
  });

  // Start processing
  jobQueue.start();

  log.info('Workflow execution handler initialized');
}

/**
 * Execute a single workflow action
 *
 * Connects to real services: push notifications, Spotify, habits, smart home, etc.
 */
async function executeAction(
  action: WorkflowAction,
  userId: string,
  variables: Record<string, unknown>
): Promise<unknown> {
  log.debug({ actionId: action.id, type: action.type }, 'Executing action');

  // Interpolate variables in params
  const params = interpolateParams(action.params, variables);

  switch (action.type) {
    // ========================================================================
    // NOTIFICATIONS
    // ========================================================================
    case 'speak_message': {
      // Send as a push notification with Ferni's caring voice
      const { sendPushNotification } =
        await import('../services/outreach/delivery/push-notifications.js');
      const result = await sendPushNotification({
        userId,
        personaId: 'ferni',
        outreachId: `routine_${action.id}_${Date.now()}`,
        title: 'Ferni',
        body: String(params.message),
        priority: 'normal',
      });
      const sent = result.some((r) => r.success);
      log.info({ userId, sent, message: params.message }, '💬 Speak message sent');
      return { spoken: sent, message: params.message };
    }

    case 'send_notification': {
      const { sendPushNotification } =
        await import('../services/outreach/delivery/push-notifications.js');
      const result = await sendPushNotification({
        userId,
        personaId: 'ferni',
        outreachId: `routine_notif_${action.id}_${Date.now()}`,
        title: String(params.title || 'Ferni'),
        body: String(params.body || params.message || ''),
        priority: String(params.priority || 'normal') as 'normal' | 'high',
      });
      const sent = result.some((r) => r.success);
      log.info({ userId, sent, title: params.title }, '🔔 Push notification sent');
      return { sent, title: params.title };
    }

    // ========================================================================
    // HABITS
    // ========================================================================
    case 'log_habit': {
      const { logHabit } = await import('../tools/domains/habits/habits.js');
      const habitId = String(params.habitId || params.habitName);
      const result = logHabit({
        userId,
        habitId,
        count: params.count ? Number(params.count) : undefined,
        notes: params.notes ? String(params.notes) : undefined,
      });
      log.info({ userId, habitId, result }, '✅ Habit logged');
      return { logged: true, habitId, result };
    }

    // ========================================================================
    // REMINDERS
    // ========================================================================
    case 'add_reminder': {
      // Use the persistent scheduled actions store (survives restarts)
      const reminderTime = parseReminderTime(String(params.time || ''));
      if (reminderTime) {
        const delayMs = reminderTime.getTime() - Date.now();
        if (delayMs > 0) {
          // Schedule for future using persistent store
          const { scheduleAction } = await import('../services/workflows/scheduled-actions.js');
          const scheduled = await scheduleAction({
            userId,
            scheduledFor: reminderTime,
            title: '⏰ Reminder',
            body: String(params.message),
            workflowId: action.id,
            personaId: 'ferni',
          });
          log.info(
            { userId, actionId: scheduled.id, time: reminderTime },
            '⏰ Reminder scheduled (persistent)'
          );
          return { created: true, time: reminderTime, actionId: scheduled.id };
        } else {
          // Send immediately
          const { sendPushNotification } =
            await import('../services/outreach/delivery/push-notifications.js');
          await sendPushNotification({
            userId,
            personaId: 'ferni',
            outreachId: `reminder_${action.id}_${Date.now()}`,
            title: '⏰ Reminder',
            body: String(params.message),
            priority: 'high',
          });
          log.info({ userId, message: params.message }, '⏰ Reminder sent immediately');
          return { created: true, sentImmediately: true };
        }
      }
      log.warn({ userId, time: params.time }, 'Could not parse reminder time');
      return { created: false, error: 'Invalid time format' };
    }

    // ========================================================================
    // MUSIC
    // ========================================================================
    case 'play_music': {
      try {
        const { playInRoom } = await import('../services/identity/spotify-room-service.js');
        const query = String(params.query || params.genre || params.playlist || 'relaxing music');
        const room = String(params.room || params.device || 'default');
        const result = await playInRoom(userId, room, { query });
        log.info({ userId, query, room, success: result.success }, '🎵 Music played');
        return { playing: result.success, query, room, error: result.error };
      } catch (error) {
        log.warn({ userId, error: String(error) }, 'Music playback failed, continuing');
        return { playing: false, error: String(error) };
      }
    }

    // ========================================================================
    // SMART HOME
    // ========================================================================
    case 'control_lights': {
      try {
        const { controlLights } = await import('../services/smart-home/unified-smart-home.js');
        const result = await controlLights(userId, {
          zone: String(params.zone || 'all'),
          state: String(params.state || 'on') as 'on' | 'off' | 'dim',
          brightness: params.brightness ? Number(params.brightness) : undefined,
          color: params.color ? String(params.color) : undefined,
        });
        log.info(
          { userId, zone: params.zone, state: params.state, result },
          '💡 Lights controlled'
        );
        return { controlled: result.success, zone: params.zone, error: result.error };
      } catch (error) {
        log.warn({ userId, error: String(error) }, 'Light control failed, continuing');
        return { controlled: false, error: String(error) };
      }
    }

    case 'set_thermostat': {
      try {
        const { setThermostat } = await import('../services/smart-home/unified-smart-home.js');
        const result = await setThermostat(userId, {
          temperature: Number(params.temperature || 72),
          mode: params.mode ? (String(params.mode) as 'heat' | 'cool' | 'auto') : undefined,
        });
        log.info({ userId, temperature: params.temperature, result }, '🌡️ Thermostat set');
        return { set: result.success, temperature: params.temperature, error: result.error };
      } catch (error) {
        log.warn({ userId, error: String(error) }, 'Thermostat control failed, continuing');
        return { set: false, error: String(error) };
      }
    }

    // ========================================================================
    // CUSTOM / INTEGRATION
    // ========================================================================
    case 'custom': {
      // Handle custom actions including calendar checks
      if (params.integration === 'calendar' || params.action === 'check_calendar') {
        try {
          const { getEvents } = await import('../services/calendar/unified-calendar-store.js');
          const hours = Number(params.hours || 24);
          const startTime = new Date();
          const endTime = new Date(startTime.getTime() + hours * 60 * 60 * 1000);
          const events = await getEvents(userId, startTime, endTime);
          log.info({ userId, eventCount: events.length }, '📅 Calendar checked');
          return { events, count: events.length };
        } catch (error) {
          log.warn({ userId, error: String(error) }, 'Calendar check failed, continuing');
          return { events: [], error: String(error) };
        }
      }
      // Custom actions - delegate to integration or tool
      log.info({ userId, integration: params.integration, query: params.query }, 'Custom action');
      return { executed: true, params };
    }

    default:
      log.warn({ actionType: action.type }, 'Unknown action type');
      return { skipped: true, reason: 'Unknown action type' };
  }
}

/**
 * Parse a reminder time string into a Date
 */
function parseReminderTime(timeStr: string): Date | null {
  if (!timeStr) return null;

  try {
    // Handle relative times: "in 30 minutes", "in 2 hours"
    const relativeMatch = timeStr.match(/in\s+(\d+)\s*(minute|min|hour|hr)s?/i);
    if (relativeMatch) {
      const amount = parseInt(relativeMatch[1] ?? '0', 10);
      const unit = relativeMatch[2]?.toLowerCase();
      const now = new Date();
      if (unit?.startsWith('hour') || unit?.startsWith('hr')) {
        now.setHours(now.getHours() + amount);
      } else {
        now.setMinutes(now.getMinutes() + amount);
      }
      return now;
    }

    // Handle absolute times: "3:00 PM", "15:00"
    const absMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (absMatch) {
      let hours = parseInt(absMatch[1] ?? '0', 10);
      const minutes = parseInt(absMatch[2] ?? '0', 10);
      const period = absMatch[3]?.toLowerCase();
      if (period === 'pm' && hours !== 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;
      const date = new Date();
      date.setHours(hours, minutes, 0, 0);
      // If the time has passed today, schedule for tomorrow
      if (date.getTime() < Date.now()) {
        date.setDate(date.getDate() + 1);
      }
      return date;
    }

    // Try parsing as ISO date
    const parsed = new Date(timeStr);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  } catch {
    // Fall through
  }

  return null;
}

/**
 * Interpolate variables in params object
 */
function interpolateParams(
  params: Record<string, unknown>,
  variables: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      result[key] = value.replace(/\{\{(\w+)\}\}/g, (_, name) => {
        const val = variables[name];
        return val !== undefined ? String(val) : `{{${name}}}`;
      });
    } else if (typeof value === 'object' && value !== null) {
      result[key] = interpolateParams(value as Record<string, unknown>, variables);
    } else {
      result[key] = value;
    }
  }

  return result;
}
