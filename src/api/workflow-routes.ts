/**
 * Workflow API Routes
 *
 * RESTful API endpoints for workflow management:
 * - CRUD operations for workflows
 * - Template operations
 * - Execution management
 * - Trigger management
 *
 * @module api/workflow-routes
 */

import type { Request, Response, Router } from 'express';
import { createLogger } from '../utils/safe-logger.js';
import {
  getWorkflowData,
  saveWorkflowData,
  type Workflow,
  type WorkflowTrigger,
  type WorkflowAction,
} from '../services/stores/workflow-store.js';
import { getTemplateLibrary } from '../services/workflows/templates/template-library.js';
import { getSchedulerService } from '../services/workflows/scheduler/scheduler-service.js';
import { getJobQueue } from '../services/workflows/jobs/job-queue.js';
import { randomUUID } from 'crypto';

const log = createLogger({ module: 'workflow-routes' });

/**
 * Register workflow routes on an Express router
 */
export function registerWorkflowRoutes(router: Router): void {

  // ==========================================================================
  // WORKFLOW CRUD
  // ==========================================================================

  /**
   * GET /api/workflows - List user's workflows
   */
  router.get('/api/workflows', async (req: Request, res: Response) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        res.status(400).json({ error: 'Missing userId' });
        return;
      }

      const data = await getWorkflowData(userId);
      res.json({
        workflows: data.workflows,
        settings: data.settings,
      });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to list workflows');
      res.status(500).json({ error: 'Failed to list workflows' });
    }
  });

  /**
   * GET /api/workflows/:id - Get a specific workflow
   */
  router.get('/api/workflows/:id', async (req: Request, res: Response) => {
    try {
      const userId = req.query.userId as string;
      const workflowId = req.params.id;

      if (!userId) {
        res.status(400).json({ error: 'Missing userId' });
        return;
      }

      const data = await getWorkflowData(userId);
      const workflow = data.workflows.find((w) => w.id === workflowId);

      if (!workflow) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
      }

      res.json({ workflow });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to get workflow');
      res.status(500).json({ error: 'Failed to get workflow' });
    }
  });

  /**
   * POST /api/workflows - Create a new workflow
   */
  router.post('/api/workflows', async (req: Request, res: Response) => {
    try {
      const { userId, name, description, trigger, conditions, actions, tags, icon, color } = req.body;

      if (!userId || !name || !trigger) {
        res.status(400).json({ error: 'Missing required fields: userId, name, trigger' });
        return;
      }

      const now = new Date().toISOString();
      const workflow: Workflow = {
        id: `wf_${randomUUID()}`,
        userId,
        name,
        description,
        status: 'paused',
        trigger: trigger as WorkflowTrigger,
        conditions: conditions || [],
        actions: actions || [],
        variables: {},
        category: undefined,
        tags: tags || [],
        icon,
        color,
        runCount: 0,
        isTemplate: false,
        createdAt: now,
        updatedAt: now,
      };

      const data = await getWorkflowData(userId);
      data.workflows.push(workflow);
      await saveWorkflowData(userId, data);

      log.info({ workflowId: workflow.id, userId }, 'Workflow created');
      res.status(201).json({ workflow });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to create workflow');
      res.status(500).json({ error: 'Failed to create workflow' });
    }
  });

  /**
   * PUT /api/workflows/:id - Update a workflow
   */
  router.put('/api/workflows/:id', async (req: Request, res: Response) => {
    try {
      const userId = req.body.userId as string;
      const workflowId = req.params.id;
      const updates = req.body;

      if (!userId) {
        res.status(400).json({ error: 'Missing userId' });
        return;
      }

      const data = await getWorkflowData(userId);
      const index = data.workflows.findIndex((w) => w.id === workflowId);

      if (index === -1) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
      }

      // Update allowed fields
      const workflow = data.workflows[index];
      if (updates.name) workflow.name = updates.name;
      if (updates.description !== undefined) workflow.description = updates.description;
      if (updates.trigger) workflow.trigger = updates.trigger;
      if (updates.conditions) workflow.conditions = updates.conditions;
      if (updates.actions) workflow.actions = updates.actions;
      if (updates.tags) workflow.tags = updates.tags;
      if (updates.icon !== undefined) workflow.icon = updates.icon;
      if (updates.color !== undefined) workflow.color = updates.color;
      if (updates.variables) workflow.variables = updates.variables;
      workflow.updatedAt = new Date().toISOString();

      await saveWorkflowData(userId, data);

      log.info({ workflowId, userId }, 'Workflow updated');
      res.json({ workflow });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to update workflow');
      res.status(500).json({ error: 'Failed to update workflow' });
    }
  });

  /**
   * DELETE /api/workflows/:id - Delete a workflow
   */
  router.delete('/api/workflows/:id', async (req: Request, res: Response) => {
    try {
      const userId = req.query.userId as string;
      const workflowId = req.params.id;

      if (!userId) {
        res.status(400).json({ error: 'Missing userId' });
        return;
      }

      const data = await getWorkflowData(userId);
      const index = data.workflows.findIndex((w) => w.id === workflowId);

      if (index === -1) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
      }

      // Cancel any schedules
      await getSchedulerService().cancelSchedule(userId, workflowId);

      data.workflows.splice(index, 1);
      await saveWorkflowData(userId, data);

      log.info({ workflowId, userId }, 'Workflow deleted');
      res.json({ success: true });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to delete workflow');
      res.status(500).json({ error: 'Failed to delete workflow' });
    }
  });

  // ==========================================================================
  // WORKFLOW STATUS
  // ==========================================================================

  /**
   * POST /api/workflows/:id/activate - Activate a workflow
   */
  router.post('/api/workflows/:id/activate', async (req: Request, res: Response) => {
    try {
      const { userId } = req.body;
      const workflowId = req.params.id;

      if (!userId) {
        res.status(400).json({ error: 'Missing userId' });
        return;
      }

      const data = await getWorkflowData(userId);
      const workflow = data.workflows.find((w) => w.id === workflowId);

      if (!workflow) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
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
      res.json({ workflow });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to activate workflow');
      res.status(500).json({ error: 'Failed to activate workflow' });
    }
  });

  /**
   * POST /api/workflows/:id/pause - Pause a workflow
   */
  router.post('/api/workflows/:id/pause', async (req: Request, res: Response) => {
    try {
      const { userId } = req.body;
      const workflowId = req.params.id;

      if (!userId) {
        res.status(400).json({ error: 'Missing userId' });
        return;
      }

      const data = await getWorkflowData(userId);
      const workflow = data.workflows.find((w) => w.id === workflowId);

      if (!workflow) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
      }

      workflow.status = 'paused';
      workflow.updatedAt = new Date().toISOString();

      // Cancel schedule
      await getSchedulerService().pauseSchedule(userId, workflowId);

      await saveWorkflowData(userId, data);

      log.info({ workflowId, userId }, 'Workflow paused');
      res.json({ workflow });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to pause workflow');
      res.status(500).json({ error: 'Failed to pause workflow' });
    }
  });

  // ==========================================================================
  // WORKFLOW EXECUTION
  // ==========================================================================

  /**
   * POST /api/workflows/:id/run - Manually run a workflow
   */
  router.post('/api/workflows/:id/run', async (req: Request, res: Response) => {
    try {
      const { userId, variables } = req.body;
      const workflowId = req.params.id;

      if (!userId) {
        res.status(400).json({ error: 'Missing userId' });
        return;
      }

      const data = await getWorkflowData(userId);
      const workflow = data.workflows.find((w) => w.id === workflowId);

      if (!workflow) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
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
      res.json({ jobId: job.id, status: 'queued' });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to run workflow');
      res.status(500).json({ error: 'Failed to run workflow' });
    }
  });

  /**
   * GET /api/workflows/:id/executions - Get workflow execution history
   */
  router.get('/api/workflows/:id/executions', async (req: Request, res: Response) => {
    try {
      const userId = req.query.userId as string;
      const workflowId = req.params.id;
      const limit = parseInt(req.query.limit as string) || 20;

      if (!userId) {
        res.status(400).json({ error: 'Missing userId' });
        return;
      }

      const data = await getWorkflowData(userId);
      const executions = data.executions
        .filter((e) => e.workflowId === workflowId)
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
        .slice(0, limit);

      res.json({ executions });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to get executions');
      res.status(500).json({ error: 'Failed to get executions' });
    }
  });

  // ==========================================================================
  // TEMPLATES
  // ==========================================================================

  /**
   * GET /api/workflow-templates - List all templates
   */
  router.get('/api/workflow-templates', async (_req: Request, res: Response) => {
    try {
      const library = getTemplateLibrary();
      const templates = library.getAll();
      const categories = library.getCategories();
      const featured = library.getFeatured();

      res.json({ templates, categories, featured });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to list templates');
      res.status(500).json({ error: 'Failed to list templates' });
    }
  });

  /**
   * GET /api/workflow-templates/:id - Get a template
   */
  router.get('/api/workflow-templates/:id', async (req: Request, res: Response) => {
    try {
      const templateId = req.params.id;
      const template = getTemplateLibrary().getById(templateId);

      if (!template) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }

      res.json({ template });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to get template');
      res.status(500).json({ error: 'Failed to get template' });
    }
  });

  /**
   * POST /api/workflow-templates/:id/create - Create workflow from template
   */
  router.post('/api/workflow-templates/:id/create', async (req: Request, res: Response) => {
    try {
      const templateId = req.params.id;
      const { userId, variables } = req.body;

      if (!userId) {
        res.status(400).json({ error: 'Missing userId' });
        return;
      }

      const workflowData = getTemplateLibrary().createFromTemplate(
        templateId,
        userId,
        variables || {}
      );

      if (!workflowData) {
        res.status(404).json({ error: 'Template not found' });
        return;
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

      log.info(
        { workflowId: workflow.id, templateId, userId },
        'Workflow created from template'
      );
      res.status(201).json({ workflow });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to create from template');
      res.status(500).json({ error: 'Failed to create from template' });
    }
  });

  // ==========================================================================
  // ACTIONS
  // ==========================================================================

  /**
   * POST /api/workflows/:id/actions - Add an action to a workflow
   */
  router.post('/api/workflows/:id/actions', async (req: Request, res: Response) => {
    try {
      const { userId, action, afterActionId } = req.body;
      const workflowId = req.params.id;

      if (!userId || !action) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }

      const data = await getWorkflowData(userId);
      const workflow = data.workflows.find((w) => w.id === workflowId);

      if (!workflow) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
      }

      const newAction: WorkflowAction = {
        id: `action_${randomUUID()}`,
        type: action.type,
        name: action.name,
        params: action.params || {},
      };

      // Insert after specific action if specified
      if (afterActionId) {
        const index = workflow.actions.findIndex((a) => a.id === afterActionId);
        if (index !== -1) {
          workflow.actions.splice(index + 1, 0, newAction);
        } else {
          workflow.actions.push(newAction);
        }
      } else {
        workflow.actions.push(newAction);
      }

      workflow.updatedAt = new Date().toISOString();
      await saveWorkflowData(userId, data);

      res.status(201).json({ action: newAction, workflow });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to add action');
      res.status(500).json({ error: 'Failed to add action' });
    }
  });

  /**
   * PUT /api/workflows/:id/actions/:actionId - Update an action
   */
  router.put('/api/workflows/:id/actions/:actionId', async (req: Request, res: Response) => {
    try {
      const { userId, name, params } = req.body;
      const workflowId = req.params.id;
      const actionId = req.params.actionId;

      if (!userId) {
        res.status(400).json({ error: 'Missing userId' });
        return;
      }

      const data = await getWorkflowData(userId);
      const workflow = data.workflows.find((w) => w.id === workflowId);

      if (!workflow) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
      }

      const action = workflow.actions.find((a) => a.id === actionId);
      if (!action) {
        res.status(404).json({ error: 'Action not found' });
        return;
      }

      if (name) action.name = name;
      if (params) action.params = params;
      workflow.updatedAt = new Date().toISOString();

      await saveWorkflowData(userId, data);

      res.json({ action, workflow });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to update action');
      res.status(500).json({ error: 'Failed to update action' });
    }
  });

  /**
   * DELETE /api/workflows/:id/actions/:actionId - Remove an action
   */
  router.delete('/api/workflows/:id/actions/:actionId', async (req: Request, res: Response) => {
    try {
      const userId = req.query.userId as string;
      const workflowId = req.params.id;
      const actionId = req.params.actionId;

      if (!userId) {
        res.status(400).json({ error: 'Missing userId' });
        return;
      }

      const data = await getWorkflowData(userId);
      const workflow = data.workflows.find((w) => w.id === workflowId);

      if (!workflow) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
      }

      const index = workflow.actions.findIndex((a) => a.id === actionId);
      if (index === -1) {
        res.status(404).json({ error: 'Action not found' });
        return;
      }

      workflow.actions.splice(index, 1);
      workflow.updatedAt = new Date().toISOString();

      await saveWorkflowData(userId, data);

      res.json({ success: true, workflow });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to remove action');
      res.status(500).json({ error: 'Failed to remove action' });
    }
  });

  /**
   * POST /api/workflows/:id/actions/reorder - Reorder actions
   */
  router.post('/api/workflows/:id/actions/reorder', async (req: Request, res: Response) => {
    try {
      const { userId, actionIds } = req.body;
      const workflowId = req.params.id;

      if (!userId || !actionIds || !Array.isArray(actionIds)) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }

      const data = await getWorkflowData(userId);
      const workflow = data.workflows.find((w) => w.id === workflowId);

      if (!workflow) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
      }

      // Reorder actions
      const reorderedActions: WorkflowAction[] = [];
      for (const id of actionIds) {
        const action = workflow.actions.find((a) => a.id === id);
        if (action) {
          reorderedActions.push(action);
        }
      }

      workflow.actions = reorderedActions;
      workflow.updatedAt = new Date().toISOString();

      await saveWorkflowData(userId, data);

      res.json({ workflow });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to reorder actions');
      res.status(500).json({ error: 'Failed to reorder actions' });
    }
  });

  log.info('Workflow routes registered');
}
