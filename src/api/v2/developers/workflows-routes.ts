/**
 * Developer Platform API v2 - Workflows Routes
 *
 * Manages developer workflow definitions and executions.
 * Workflows are DAGs (Directed Acyclic Graphs) that define multi-step
 * automations with conditions, parallel execution, and error handling.
 *
 * Endpoints:
 *   POST   /api/v2/developers/workflows              - Create workflow
 *   GET    /api/v2/developers/workflows              - List workflows
 *   GET    /api/v2/developers/workflows/:id          - Get workflow
 *   PUT    /api/v2/developers/workflows/:id          - Update workflow
 *   DELETE /api/v2/developers/workflows/:id          - Delete workflow
 *   POST   /api/v2/developers/workflows/:id/execute  - Execute workflow
 *   GET    /api/v2/developers/workflows/:id/runs     - Get execution history
 *
 * @module api/v2/developers/workflows-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../../../utils/safe-logger.js';
import { sendError } from '../../helpers.js';
import {
  requireApiKeyAuth,
  extractIdFromPath,
  parseJsonBody,
  generateId,
  sendItemResponse,
  sendPaginatedResponse,
} from './shared/middleware.js';
import { CreateWorkflowSchema, UpdateWorkflowSchema, PaginationSchema } from './shared/validation.js';
import type {
  DeveloperWorkflow,
  WorkflowExecution,
  WorkflowTestResult,
} from './shared/types.js';
import { COLLECTIONS, ID_PREFIXES } from './shared/types.js';
import type { WorkflowNode, WorkflowEdge } from '../../../services/workflow-engine.js';

const log = getLogger().child({ module: 'workflows-routes' });

/** Base path for workflows API */
const BASE_PATH = '/api/v2/developers/workflows';

// ============================================================================
// HELPERS
// ============================================================================

/** Convert Firestore timestamp to Date */
function convertTimestamp(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  return undefined;
}

/** Parse query string parameters */
function parseQueryParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return params;

  const queryString = url.slice(queryStart + 1);
  for (const pair of queryString.split('&')) {
    const [key, value] = pair.split('=');
    if (key && value) {
      params[decodeURIComponent(key)] = decodeURIComponent(value);
    }
  }
  return params;
}

/** Validate workflow DAG structure */
function validateWorkflowDAG(
  nodes: DeveloperWorkflow['nodes'],
  edges: DeveloperWorkflow['edges'],
  entryNodeId: string,
  exitNodeIds?: string[]
): { valid: boolean; error?: string } {
  // Check entry node exists
  const entryNode = nodes.find((n) => n.id === entryNodeId);
  if (!entryNode) {
    return { valid: false, error: `Entry node ${entryNodeId} not found` };
  }

  // Check entry node is of type 'start'
  if (entryNode.type !== 'start') {
    return { valid: false, error: 'Entry node must be of type "start"' };
  }

  // Check all exit nodes exist and are of type 'end'
  const effectiveExitIds = exitNodeIds || nodes.filter((n) => n.type === 'end').map((n) => n.id);
  for (const exitId of effectiveExitIds) {
    const exitNode = nodes.find((n) => n.id === exitId);
    if (!exitNode) {
      return { valid: false, error: `Exit node ${exitId} not found` };
    }
    if (exitNode.type !== 'end') {
      return { valid: false, error: 'Exit nodes must be of type "end"' };
    }
  }

  // Check all edge references are valid
  const nodeIds = new Set(nodes.map((n) => n.id));
  for (const edge of edges) {
    if (!nodeIds.has(edge.sourceId)) {
      return { valid: false, error: `Edge source ${edge.sourceId} not found` };
    }
    if (!nodeIds.has(edge.targetId)) {
      return { valid: false, error: `Edge target ${edge.targetId} not found` };
    }
  }

  // Check for cycles using DFS
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function hasCycle(nodeId: string): boolean {
    if (recursionStack.has(nodeId)) {
      return true; // Back edge found = cycle
    }
    if (visited.has(nodeId)) {
      return false; // Already processed
    }

    visited.add(nodeId);
    recursionStack.add(nodeId);

    // Get all outgoing edges
    const outgoingEdges = edges.filter((e) => e.sourceId === nodeId);
    for (const edge of outgoingEdges) {
      if (hasCycle(edge.targetId)) {
        return true;
      }
    }

    recursionStack.delete(nodeId);
    return false;
  }

  if (hasCycle(entryNodeId)) {
    return { valid: false, error: 'Workflow contains a cycle - DAGs must be acyclic' };
  }

  return { valid: true };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Handle all /api/v2/developers/workflows/* routes
 */
export async function handleWorkflowsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (!pathname.startsWith(BASE_PATH)) {
    return false;
  }

  const method = req.method || 'GET';
  const subPath = pathname.slice(BASE_PATH.length);

  // POST /workflows - Create workflow
  if (method === 'POST' && (subPath === '' || subPath === '/')) {
    return handleCreateWorkflow(req, res);
  }

  // GET /workflows - List workflows
  if (method === 'GET' && (subPath === '' || subPath === '/')) {
    return handleListWorkflows(req, res);
  }

  // Extract workflow ID for other routes
  const workflowId = extractIdFromPath(subPath, '/');
  if (!workflowId) {
    return false;
  }

  // Check for action suffix
  const actionMatch = subPath.match(/^\/[^/]+\/(.+)$/);
  const action = actionMatch ? actionMatch[1] : null;

  // POST /workflows/:id/execute - Execute workflow
  if (method === 'POST' && action === 'execute') {
    return handleExecuteWorkflow(req, res, workflowId);
  }

  // GET /workflows/:id/runs - Get execution history
  if (method === 'GET' && action === 'runs') {
    return handleGetRuns(req, res, workflowId);
  }

  // GET /workflows/:id - Get single workflow
  if (method === 'GET' && !action) {
    return handleGetWorkflow(req, res, workflowId);
  }

  // PUT /workflows/:id - Update workflow
  if (method === 'PUT' && !action) {
    return handleUpdateWorkflow(req, res, workflowId);
  }

  // DELETE /workflows/:id - Delete workflow
  if (method === 'DELETE' && !action) {
    return handleDeleteWorkflow(req, res, workflowId);
  }

  return false;
}

// ============================================================================
// CREATE WORKFLOW
// ============================================================================

/**
 * POST /workflows - Create a new workflow definition
 */
async function handleCreateWorkflow(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  // Parse body
  const body = await parseJsonBody(req);
  if (!body) {
    sendError(res, 'Invalid JSON body', 400);
    return true;
  }

  // Validate
  const parseResult = CreateWorkflowSchema.safeParse(body);
  if (!parseResult.success) {
    sendError(res, `Validation error: ${parseResult.error.message}`, 400);
    return true;
  }

  const input = parseResult.data;

  // Validate DAG structure
  const dagValidation = validateWorkflowDAG(
    input.nodes,
    input.edges,
    input.entryNodeId,
    input.exitNodeIds
  );
  if (!dagValidation.valid) {
    sendError(res, `Invalid workflow structure: ${dagValidation.error}`, 400);
    return true;
  }

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Create workflow document
    const workflowId = generateId(ID_PREFIXES.WORKFLOW);
    const now = new Date();

    // Determine exit nodes if not provided
    const exitNodeIds =
      input.exitNodeIds || input.nodes.filter((n) => n.type === 'end').map((n) => n.id);

    const workflow: Omit<DeveloperWorkflow, 'id'> = {
      publisherId: auth.publisherId,
      personaId: input.personaId,
      name: input.name,
      description: input.description,
      version: input.version || '1.0.0',
      trigger: input.trigger,
      nodes: input.nodes,
      edges: input.edges,
      entryNodeId: input.entryNodeId,
      exitNodeIds,
      enabled: input.enabled ?? true,
      timeout: input.timeout,
      retryPolicy: input.retryPolicy,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection(COLLECTIONS.WORKFLOWS).doc(workflowId).set(workflow);

    log.info(
      { workflowId, publisherId: auth.publisherId, name: input.name },
      'Workflow created'
    );

    sendItemResponse(res, { ...workflow, id: workflowId });
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message }, 'Failed to create workflow');
    sendError(res, 'Failed to create workflow', 500);
    return true;
  }
}

// ============================================================================
// LIST WORKFLOWS
// ============================================================================

/**
 * GET /workflows - List workflows with pagination
 */
async function handleListWorkflows(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  // Parse query params
  const queryParams = parseQueryParams(req.url || '');
  const parseResult = PaginationSchema.safeParse(queryParams);
  if (!parseResult.success) {
    sendError(res, `Invalid query parameters: ${parseResult.error.message}`, 400);
    return true;
  }

  const { limit = 50, cursor } = parseResult.data;

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    let query = db
      .collection(COLLECTIONS.WORKFLOWS)
      .where('publisherId', '==', auth.publisherId)
      .orderBy('createdAt', 'desc');

    if (cursor) {
      const cursorDoc = await db.collection(COLLECTIONS.WORKFLOWS).doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.limit(limit + 1).get();

    const workflows: DeveloperWorkflow[] = [];
    let hasMore = false;

    for (let i = 0; i < snapshot.docs.length; i++) {
      if (i === limit) {
        hasMore = true;
        break;
      }

      const doc = snapshot.docs[i];
      const data = doc.data() as Record<string, unknown>;

      workflows.push({
        id: doc.id,
        publisherId: data.publisherId as string,
        personaId: data.personaId as string | undefined,
        name: data.name as string,
        description: data.description as string,
        version: data.version as string,
        trigger: data.trigger as DeveloperWorkflow['trigger'],
        nodes: data.nodes as DeveloperWorkflow['nodes'],
        edges: data.edges as DeveloperWorkflow['edges'],
        entryNodeId: data.entryNodeId as string,
        exitNodeIds: data.exitNodeIds as string[],
        enabled: data.enabled as boolean,
        timeout: data.timeout as number | undefined,
        retryPolicy: data.retryPolicy as DeveloperWorkflow['retryPolicy'],
        createdAt: convertTimestamp(data.createdAt) || new Date(),
        updatedAt: convertTimestamp(data.updatedAt) || new Date(),
      });
    }

    sendPaginatedResponse(res, workflows, {
      limit,
      cursor: hasMore ? workflows[workflows.length - 1]?.id : undefined,
    });

    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message }, 'Failed to list workflows');
    sendError(res, 'Failed to list workflows', 500);
    return true;
  }
}

// ============================================================================
// GET WORKFLOW
// ============================================================================

/**
 * GET /workflows/:id - Get a single workflow
 */
async function handleGetWorkflow(
  req: IncomingMessage,
  res: ServerResponse,
  workflowId: string
): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    const doc = await db.collection(COLLECTIONS.WORKFLOWS).doc(workflowId).get();

    if (!doc.exists) {
      sendError(res, 'Workflow not found', 404);
      return true;
    }

    const data = doc.data() as Record<string, unknown> | undefined;
    if (data?.publisherId !== auth.publisherId) {
      sendError(res, 'Workflow not found', 404);
      return true;
    }

    const workflow: DeveloperWorkflow = {
      id: doc.id,
      publisherId: data.publisherId as string,
      personaId: data.personaId as string | undefined,
      name: data.name as string,
      description: data.description as string,
      version: data.version as string,
      trigger: data.trigger as DeveloperWorkflow['trigger'],
      nodes: data.nodes as DeveloperWorkflow['nodes'],
      edges: data.edges as DeveloperWorkflow['edges'],
      entryNodeId: data.entryNodeId as string,
      exitNodeIds: data.exitNodeIds as string[],
      enabled: data.enabled as boolean,
      timeout: data.timeout as number | undefined,
      retryPolicy: data.retryPolicy as DeveloperWorkflow['retryPolicy'],
      createdAt: convertTimestamp(data.createdAt) || new Date(),
      updatedAt: convertTimestamp(data.updatedAt) || new Date(),
    };

    sendItemResponse(res, workflow);
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, workflowId }, 'Failed to get workflow');
    sendError(res, 'Failed to get workflow', 500);
    return true;
  }
}

// ============================================================================
// UPDATE WORKFLOW
// ============================================================================

/**
 * PUT /workflows/:id - Update an existing workflow
 */
async function handleUpdateWorkflow(
  req: IncomingMessage,
  res: ServerResponse,
  workflowId: string
): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  // Parse body
  const body = await parseJsonBody(req);
  if (!body) {
    sendError(res, 'Invalid JSON body', 400);
    return true;
  }

  // Validate
  const parseResult = UpdateWorkflowSchema.safeParse(body);
  if (!parseResult.success) {
    sendError(res, `Validation error: ${parseResult.error.message}`, 400);
    return true;
  }

  const input = parseResult.data;

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Verify ownership
    const doc = await db.collection(COLLECTIONS.WORKFLOWS).doc(workflowId).get();

    if (!doc.exists) {
      sendError(res, 'Workflow not found', 404);
      return true;
    }

    const existingData = doc.data() as Record<string, unknown> | undefined;
    if (existingData?.publisherId !== auth.publisherId) {
      sendError(res, 'Workflow not found', 404);
      return true;
    }

    // If nodes/edges/entryNodeId are being updated, validate DAG
    if (input.nodes || input.edges || input.entryNodeId) {
      const nodes = input.nodes || (existingData.nodes as DeveloperWorkflow['nodes']);
      const edges = input.edges || (existingData.edges as DeveloperWorkflow['edges']);
      const entryNodeId = input.entryNodeId || (existingData.entryNodeId as string);
      const exitNodeIds = input.exitNodeIds || (existingData.exitNodeIds as string[]);

      const dagValidation = validateWorkflowDAG(nodes, edges, entryNodeId, exitNodeIds);
      if (!dagValidation.valid) {
        sendError(res, `Invalid workflow structure: ${dagValidation.error}`, 400);
        return true;
      }
    }

    // Update
    const updates: Record<string, unknown> = {
      ...input,
      updatedAt: new Date(),
    };

    await db.collection(COLLECTIONS.WORKFLOWS).doc(workflowId).update(updates);

    log.info({ workflowId, publisherId: auth.publisherId }, 'Workflow updated');

    // Return updated workflow
    const updatedDoc = await db.collection(COLLECTIONS.WORKFLOWS).doc(workflowId).get();
    const data = updatedDoc.data() as Record<string, unknown>;

    const workflow: DeveloperWorkflow = {
      id: updatedDoc.id,
      publisherId: data.publisherId as string,
      personaId: data.personaId as string | undefined,
      name: data.name as string,
      description: data.description as string,
      version: data.version as string,
      trigger: data.trigger as DeveloperWorkflow['trigger'],
      nodes: data.nodes as DeveloperWorkflow['nodes'],
      edges: data.edges as DeveloperWorkflow['edges'],
      entryNodeId: data.entryNodeId as string,
      exitNodeIds: data.exitNodeIds as string[],
      enabled: data.enabled as boolean,
      timeout: data.timeout as number | undefined,
      retryPolicy: data.retryPolicy as DeveloperWorkflow['retryPolicy'],
      createdAt: convertTimestamp(data.createdAt) || new Date(),
      updatedAt: convertTimestamp(data.updatedAt) || new Date(),
    };

    sendItemResponse(res, workflow);
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, workflowId }, 'Failed to update workflow');
    sendError(res, 'Failed to update workflow', 500);
    return true;
  }
}

// ============================================================================
// DELETE WORKFLOW
// ============================================================================

/**
 * DELETE /workflows/:id - Delete a workflow and its executions
 */
async function handleDeleteWorkflow(
  req: IncomingMessage,
  res: ServerResponse,
  workflowId: string
): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Verify ownership
    const doc = await db.collection(COLLECTIONS.WORKFLOWS).doc(workflowId).get();

    if (!doc.exists) {
      sendError(res, 'Workflow not found', 404);
      return true;
    }

    const data = doc.data();
    if (data?.publisherId !== auth.publisherId) {
      sendError(res, 'Workflow not found', 404);
      return true;
    }

    // Delete workflow and executions in batch
    const batch = db.batch();

    // Delete workflow
    batch.delete(db.collection(COLLECTIONS.WORKFLOWS).doc(workflowId));

    // Delete executions (limited batch)
    const execsSnapshot = await db
      .collection(COLLECTIONS.WORKFLOW_EXECUTIONS)
      .where('workflowId', '==', workflowId)
      .limit(500)
      .get();

    for (const execDoc of execsSnapshot.docs) {
      batch.delete(execDoc.ref);
    }

    await batch.commit();

    log.info({ workflowId, publisherId: auth.publisherId }, 'Workflow deleted');

    sendItemResponse(res, { deleted: true });
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, workflowId }, 'Failed to delete workflow');
    sendError(res, 'Failed to delete workflow', 500);
    return true;
  }
}

// ============================================================================
// EXECUTE WORKFLOW
// ============================================================================

/**
 * POST /workflows/:id/execute - Execute a workflow
 *
 * This is a simplified synchronous execution for testing.
 * Production execution would be handled by the workflow engine service.
 */
async function handleExecuteWorkflow(
  req: IncomingMessage,
  res: ServerResponse,
  workflowId: string
): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  // Parse optional body for execution context
  const body = await parseJsonBody(req);
  const variables = (body?.variables as Record<string, unknown>) || {};
  const userId = body?.userId as string | undefined;
  const sessionId = body?.sessionId as string | undefined;

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Get workflow
    const doc = await db.collection(COLLECTIONS.WORKFLOWS).doc(workflowId).get();

    if (!doc.exists) {
      sendError(res, 'Workflow not found', 404);
      return true;
    }

    const data = doc.data() as Record<string, unknown> | undefined;
    if (data?.publisherId !== auth.publisherId) {
      sendError(res, 'Workflow not found', 404);
      return true;
    }

    if (!data?.enabled) {
      sendError(res, 'Workflow is disabled', 400);
      return true;
    }

    // Create execution record
    const executionId = generateId(ID_PREFIXES.EXECUTION);
    const now = new Date();

    const execution: Omit<WorkflowExecution, 'id'> = {
      workflowId,
      publisherId: auth.publisherId,
      userId,
      sessionId,
      triggeredBy: 'api',
      status: 'running',
      currentNodeIds: [data.entryNodeId as string],
      completedNodeIds: [],
      variables,
      startedAt: now,
    };

    await db.collection(COLLECTIONS.WORKFLOW_EXECUTIONS).doc(executionId).set(execution);

    // Import and execute with the real workflow engine
    const { executeWorkflow } = await import('../../../services/workflow-engine.js');

    // Convert Firestore data to WorkflowDefinition
    const workflowDefinition = {
      id: workflowId,
      publisherId: auth.publisherId,
      personaId: data.personaId as string | undefined,
      name: data.name as string,
      description: data.description as string | undefined,
      version: data.version as string | undefined,
      trigger: data.trigger as { type: 'voice_command' | 'schedule' | 'event' | 'api'; config: Record<string, unknown> },
      nodes: data.nodes as WorkflowNode[],
      edges: data.edges as WorkflowEdge[],
      entryNodeId: data.entryNodeId as string,
      enabled: data.enabled as boolean,
      timeout: data.timeout as number | undefined,
      createdAt: (data.createdAt as { toDate: () => Date })?.toDate?.() || new Date(),
      updatedAt: (data.updatedAt as { toDate: () => Date })?.toDate?.() || new Date(),
    };

    // Execute the workflow with the real engine
    const completedExecution = await executeWorkflow(workflowDefinition, {
      executionId,
      publisherId: auth.publisherId,
      userId,
      sessionId,
      triggeredBy: 'api',
      input: variables,
    });

    // Persist final execution state
    await db.collection(COLLECTIONS.WORKFLOW_EXECUTIONS).doc(executionId).update({
      status: completedExecution.status,
      currentNodeIds: completedExecution.currentNodeIds,
      completedNodeIds: completedExecution.completedNodeIds,
      variables: completedExecution.variables,
      nodeResults: completedExecution.nodeResults,
      result: completedExecution.result,
      error: completedExecution.error,
      completedAt: completedExecution.completedAt,
    });

    log.info(
      { workflowId, executionId, publisherId: auth.publisherId },
      'Workflow executed'
    );

    const result: WorkflowTestResult = {
      success: true,
      execution: completedExecution,
    };

    sendItemResponse(res, result);
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, workflowId }, 'Failed to execute workflow');
    sendError(res, 'Failed to execute workflow', 500);
    return true;
  }
}

// ============================================================================
// GET EXECUTION HISTORY
// ============================================================================

/**
 * GET /workflows/:id/runs - Get execution history for a workflow
 */
async function handleGetRuns(
  req: IncomingMessage,
  res: ServerResponse,
  workflowId: string
): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  // Parse query params
  const queryParams = parseQueryParams(req.url || '');
  const parseResult = PaginationSchema.safeParse(queryParams);
  if (!parseResult.success) {
    sendError(res, `Invalid query parameters: ${parseResult.error.message}`, 400);
    return true;
  }

  const { limit = 50, cursor } = parseResult.data;

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Verify workflow ownership first
    const workflowDoc = await db.collection(COLLECTIONS.WORKFLOWS).doc(workflowId).get();
    if (!workflowDoc.exists) {
      sendError(res, 'Workflow not found', 404);
      return true;
    }

    const workflowData = workflowDoc.data();
    if (workflowData?.publisherId !== auth.publisherId) {
      sendError(res, 'Workflow not found', 404);
      return true;
    }

    // Query executions
    let query = db
      .collection(COLLECTIONS.WORKFLOW_EXECUTIONS)
      .where('workflowId', '==', workflowId)
      .orderBy('startedAt', 'desc');

    if (cursor) {
      const cursorDoc = await db
        .collection(COLLECTIONS.WORKFLOW_EXECUTIONS)
        .doc(cursor)
        .get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.limit(limit + 1).get();

    const executions: WorkflowExecution[] = [];
    let hasMore = false;

    for (let i = 0; i < snapshot.docs.length; i++) {
      if (i === limit) {
        hasMore = true;
        break;
      }

      const doc = snapshot.docs[i];
      const data = doc.data() as Record<string, unknown>;

      executions.push({
        id: doc.id,
        workflowId: data.workflowId as string,
        publisherId: data.publisherId as string,
        userId: data.userId as string | undefined,
        sessionId: data.sessionId as string | undefined,
        triggeredBy: data.triggeredBy as WorkflowExecution['triggeredBy'],
        status: data.status as WorkflowExecution['status'],
        currentNodeIds: data.currentNodeIds as string[],
        completedNodeIds: data.completedNodeIds as string[],
        variables: (data.variables as Record<string, unknown>) || {},
        result: data.result,
        error: data.error as string | undefined,
        startedAt: convertTimestamp(data.startedAt) || new Date(),
        completedAt: convertTimestamp(data.completedAt),
      });
    }

    sendPaginatedResponse(res, executions, {
      limit,
      cursor: hasMore ? executions[executions.length - 1]?.id : undefined,
    });

    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, workflowId }, 'Failed to get workflow runs');
    sendError(res, 'Failed to get workflow runs', 500);
    return true;
  }
}

export default { handleWorkflowsRoutes };
