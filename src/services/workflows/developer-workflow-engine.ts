/**
 * Workflow Engine
 *
 * Executes developer-defined workflows as DAGs (Directed Acyclic Graphs).
 * Supports branching, parallel execution, and various node types.
 *
 * @module services/workflow-engine
 */

import { getLogger } from '../../utils/safe-logger.js';
import { COLLECTIONS, ID_PREFIXES, type WebhookEventType } from '../../types/developer-platform.js';
import { dispatchWebhookEvent } from '../integrations/developer-webhook-dispatcher.js';
import {
  callMCPTool,
  getMCPConnection,
  connectToMCPServer,
  findServer,
  getMCPConfig,
} from '../../personas/bundles/mcp-loader.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';

const log = getLogger().child({ module: 'workflow-engine' });

// ============================================================================
// TYPES
// ============================================================================

/** Node types supported by the workflow engine */
export type WorkflowNodeType =
  | 'start'
  | 'end'
  | 'mcp_call'
  | 'webhook'
  | 'llm_prompt'
  | 'condition'
  | 'parallel'
  | 'wait'
  | 'set_variable'
  | 'speak'
  | 'activity';

/** Workflow trigger configuration */
export interface WorkflowTrigger {
  type: 'voice_command' | 'schedule' | 'event' | 'api';
  config: {
    command?: string;
    schedule?: string;
    eventType?: string;
  };
}

/** Workflow node configuration */
export interface WorkflowNodeConfig {
  // For mcp_call
  serverId?: string;
  toolName?: string;
  arguments?: Record<string, string>;

  // For webhook
  url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string | Record<string, unknown>;

  // For llm_prompt
  prompt?: string;
  model?: string;
  outputVariable?: string;

  // For condition
  expression?: string;

  // For parallel
  branches?: Array<{ entryNodeId: string }>;

  // For wait
  duration?: number;
  event?: string;

  // For set_variable
  variable?: string;
  value?: string;

  // For speak
  text?: string;

  // For activity
  type?: string;
  name?: string;
  data?: Record<string, unknown>;
}

/** Workflow node definition */
export interface WorkflowNode {
  id: string;
  name?: string;
  type: WorkflowNodeType;
  config?: WorkflowNodeConfig;
  onError?: {
    type: 'goto' | 'fail';
    targetNodeId?: string;
  };
  retry?: {
    maxAttempts: number;
    backoffMs: number;
    backoffMultiplier: number;
  };
}

/** Workflow edge definition */
export interface WorkflowEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
  condition?: string; // 'true', 'false', or expression
}

/** Complete workflow definition */
export interface WorkflowDefinition {
  id: string;
  publisherId: string;
  personaId?: string;
  name: string;
  description?: string;
  version?: string;
  trigger: WorkflowTrigger;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  entryNodeId: string;
  enabled: boolean;
  timeout?: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Workflow execution status */
export type WorkflowExecutionStatus = 'running' | 'completed' | 'failed' | 'cancelled';

/** Workflow execution state */
export interface WorkflowExecution {
  id: string;
  workflowId: string;
  publisherId: string;
  userId?: string;
  sessionId?: string;
  triggeredBy: 'voice' | 'api' | 'schedule' | 'event';
  status: WorkflowExecutionStatus;
  currentNodeIds: string[];
  completedNodeIds: string[];
  variables: Record<string, unknown>;
  nodeResults: Record<string, NodeResult>;
  result?: unknown;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

/** Result from executing a single node */
export interface NodeResult {
  nodeId: string;
  status: 'completed' | 'failed' | 'skipped';
  result?: unknown;
  error?: string;
  duration: number;
  startedAt: Date;
  completedAt: Date;
}

/** Execution context passed through the engine */
export interface ExecutionContext {
  workflow: WorkflowDefinition;
  execution: WorkflowExecution;
  userId?: string;
  sessionId?: string;
  input?: Record<string, unknown>;
}

// ============================================================================
// VARIABLE INTERPOLATION
// ============================================================================

/**
 * Interpolate variables in a string template
 * Supports {{expression}} syntax
 */
export function interpolate(template: string, variables: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, expr) => {
    const trimmed = expr.trim();

    // Handle pipe filters (basic support)
    if (trimmed.includes('|')) {
      const [path, ...filters] = trimmed.split('|').map((s: string) => s.trim());
      let value = getNestedValue(variables, path);

      for (const filter of filters) {
        value = applyFilter(value, filter);
      }

      return String(value ?? '');
    }

    const value = getNestedValue(variables, trimmed);
    return String(value ?? '');
  });
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Apply a filter transformation
 */
function applyFilter(value: unknown, filter: string): unknown {
  switch (filter.toLowerCase()) {
    case 'json':
      return JSON.stringify(value);
    case 'uppercase':
      return String(value).toUpperCase();
    case 'lowercase':
      return String(value).toLowerCase();
    case 'first':
      return Array.isArray(value) ? value[0] : value;
    case 'last':
      return Array.isArray(value) ? value[value.length - 1] : value;
    case 'length':
      return Array.isArray(value) ? value.length : String(value).length;
    case 'round':
      return Math.round(Number(value));
    default:
      return value;
  }
}

// ============================================================================
// CONDITION EVALUATION
// ============================================================================

/**
 * Safely evaluate a condition expression
 * Uses pattern matching instead of eval for security
 */
export function evaluateCondition(expression: string, variables: Record<string, unknown>): boolean {
  const trimmed = expression.trim();

  // Handle literal booleans
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  // Handle comparison operators
  const comparisonPatterns = [
    { pattern: /^(.+?)\s*===\s*(.+)$/, op: '===' },
    { pattern: /^(.+?)\s*!==\s*(.+)$/, op: '!==' },
    { pattern: /^(.+?)\s*==\s*(.+)$/, op: '==' },
    { pattern: /^(.+?)\s*!=\s*(.+)$/, op: '!=' },
    { pattern: /^(.+?)\s*>=\s*(.+)$/, op: '>=' },
    { pattern: /^(.+?)\s*<=\s*(.+)$/, op: '<=' },
    { pattern: /^(.+?)\s*>\s*(.+)$/, op: '>' },
    { pattern: /^(.+?)\s*<\s*(.+)$/, op: '<' },
  ];

  for (const { pattern, op } of comparisonPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      const leftExpr = match[1].trim();
      const rightExpr = match[2].trim();

      const leftValue = resolveValue(leftExpr, variables);
      const rightValue = resolveValue(rightExpr, variables);

      return compareValues(leftValue, rightValue, op);
    }
  }

  // Handle simple truthy check
  const value = resolveValue(trimmed, variables);
  return Boolean(value);
}

/**
 * Resolve a value from expression
 */
function resolveValue(expr: string, variables: Record<string, unknown>): unknown {
  // String literal
  if (
    (expr.startsWith("'") && expr.endsWith("'")) ||
    (expr.startsWith('"') && expr.endsWith('"'))
  ) {
    return expr.slice(1, -1);
  }

  // Number literal
  if (/^-?\d+(\.\d+)?$/.test(expr)) {
    return parseFloat(expr);
  }

  // Boolean literal
  if (expr === 'true') return true;
  if (expr === 'false') return false;
  if (expr === 'null') return null;
  if (expr === 'undefined') return undefined;

  // Variable reference
  return getNestedValue(variables, expr);
}

/**
 * Compare two values with an operator
 */
function compareValues(left: unknown, right: unknown, op: string): boolean {
  switch (op) {
    case '===':
      return left === right;
    case '!==':
      return left !== right;
    case '==':
      // eslint-disable-next-line eqeqeq -- Intentional loose equality for workflow conditions
      return left == right;
    case '!=':
      // eslint-disable-next-line eqeqeq -- Intentional loose equality for workflow conditions
      return left != right;
    case '>':
      return Number(left) > Number(right);
    case '<':
      return Number(left) < Number(right);
    case '>=':
      return Number(left) >= Number(right);
    case '<=':
      return Number(left) <= Number(right);
    default:
      return false;
  }
}

// ============================================================================
// NODE EXECUTORS
// ============================================================================

/**
 * Execute a single workflow node
 */
async function executeNode(node: WorkflowNode, context: ExecutionContext): Promise<NodeResult> {
  const startTime = Date.now();
  const startedAt = new Date();

  try {
    let result: unknown;

    switch (node.type) {
      case 'start':
        result = { started: true };
        break;

      case 'end':
        result = { ended: true };
        break;

      case 'mcp_call':
        result = await executeMCPCall(node, context);
        break;

      case 'webhook':
        result = await executeWebhook(node, context);
        break;

      case 'llm_prompt':
        result = await executeLLMPrompt(node, context);
        break;

      case 'condition':
        result = executeConditionNode(node, context);
        break;

      case 'parallel':
        result = await executeParallel(node, context);
        break;

      case 'wait':
        result = await executeWait(node, context);
        break;

      case 'set_variable':
        result = executeSetVariable(node, context);
        break;

      case 'speak':
        result = executeSpeak(node, context);
        break;

      case 'activity':
        result = await executeActivity(node, context);
        break;

      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }

    return {
      nodeId: node.id,
      status: 'completed',
      result,
      duration: Date.now() - startTime,
      startedAt,
      completedAt: new Date(),
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    log.error(
      { nodeId: node.id, nodeType: node.type, error: err.message },
      'Node execution failed'
    );

    return {
      nodeId: node.id,
      status: 'failed',
      error: err.message,
      duration: Date.now() - startTime,
      startedAt,
      completedAt: new Date(),
    };
  }
}

/**
 * Execute MCP tool call using the real MCP SDK
 */
async function executeMCPCall(node: WorkflowNode, context: ExecutionContext): Promise<unknown> {
  const { config } = node;
  if (!config?.serverId || !config?.toolName) {
    throw new Error('MCP call requires serverId and toolName');
  }

  // Interpolate arguments
  const args: Record<string, unknown> = {};
  if (config.arguments) {
    for (const [key, value] of Object.entries(config.arguments)) {
      args[key] = interpolate(String(value), context.execution.variables);
    }
  }

  log.info({ serverId: config.serverId, toolName: config.toolName, args }, 'Executing MCP call');

  // Check if MCP server is already connected
  let connection = getMCPConnection(config.serverId);

  if (!connection || connection.status !== 'connected') {
    // Try to connect to the MCP server
    // First, load the server configuration
    const mcpConfig = await getMCPConfig(
      '', // Empty bundle path - will use API-registered servers
      { publisherId: context.execution.publisherId }
    );

    const serverConfig = findServer(mcpConfig, config.serverId);
    if (!serverConfig) {
      throw new Error(`MCP server not found: ${config.serverId}`);
    }

    connection = await connectToMCPServer(serverConfig);
    if (connection.status !== 'connected') {
      throw new Error(`Failed to connect to MCP server: ${connection.error || 'Unknown error'}`);
    }
  }

  // Call the MCP tool
  const result = await callMCPTool(config.serverId, config.toolName, args);

  log.info({ serverId: config.serverId, toolName: config.toolName }, 'MCP call completed');

  return result;
}

/**
 * Execute webhook call
 */
async function executeWebhook(node: WorkflowNode, context: ExecutionContext): Promise<unknown> {
  const { config } = node;
  if (!config?.url) {
    throw new Error('Webhook requires url');
  }

  const url = interpolate(config.url, context.execution.variables);
  const method = config.method || 'POST';

  // Interpolate headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.headers) {
    for (const [key, value] of Object.entries(config.headers)) {
      headers[key] = interpolate(value, context.execution.variables);
    }
  }

  // Interpolate body
  let body: string | undefined;
  if (config.body) {
    if (typeof config.body === 'string') {
      body = interpolate(config.body, context.execution.variables);
    } else {
      const interpolatedBody: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(config.body)) {
        if (typeof value === 'string') {
          interpolatedBody[key] = interpolate(value, context.execution.variables);
        } else {
          interpolatedBody[key] = value;
        }
      }
      body = JSON.stringify(interpolatedBody);
    }
  }

  log.info({ url, method }, 'Executing webhook');

  const response = await fetch(url, {
    method,
    headers,
    body: method !== 'GET' ? body : undefined,
  });

  const responseText = await response.text();
  let responseData: unknown;

  try {
    responseData = JSON.parse(responseText);
  } catch {
    responseData = responseText;
  }

  if (!response.ok) {
    throw new Error(`Webhook failed: ${response.status} ${responseText.slice(0, 200)}`);
  }

  return responseData;
}

/**
 * Execute LLM prompt
 */
async function executeLLMPrompt(node: WorkflowNode, context: ExecutionContext): Promise<unknown> {
  const { config } = node;
  if (!config?.prompt) {
    throw new Error('LLM prompt requires prompt');
  }

  const prompt = interpolate(config.prompt, context.execution.variables);

  log.info({ promptLength: prompt.length }, 'Executing LLM prompt');

  // In production, this would call the LLM
  // For now, return a placeholder
  const result = `LLM response placeholder for prompt: ${prompt.slice(0, 100)}...`;

  // Store in output variable if specified
  if (config.outputVariable) {
    context.execution.variables[config.outputVariable] = result;
  }

  return result;
}

/**
 * Execute condition node
 */
function executeConditionNode(node: WorkflowNode, context: ExecutionContext): boolean {
  const { config } = node;
  if (!config?.expression) {
    throw new Error('Condition requires expression');
  }

  const result = evaluateCondition(config.expression, context.execution.variables);

  log.debug({ expression: config.expression, result }, 'Evaluated condition');

  return result;
}

/**
 * Execute parallel branches
 */
async function executeParallel(node: WorkflowNode, context: ExecutionContext): Promise<unknown[]> {
  const { config } = node;
  if (!config?.branches || config.branches.length === 0) {
    throw new Error('Parallel requires branches');
  }

  log.info({ branchCount: config.branches.length }, 'Executing parallel branches');

  // Execute all branches in parallel
  const results = await Promise.all(
    config.branches.map(async (branch) => {
      // Find the entry node for this branch
      const entryNode = context.workflow.nodes.find((n) => n.id === branch.entryNodeId);
      if (!entryNode) {
        throw new Error(`Branch entry node not found: ${branch.entryNodeId}`);
      }

      // Execute the branch (simplified - in production would traverse full sub-DAG)
      return executeNode(entryNode, context);
    })
  );

  return results;
}

/**
 * Execute wait node
 */
async function executeWait(
  node: WorkflowNode,
  context: ExecutionContext
): Promise<{ waited: number }> {
  const { config } = node;
  const duration = config?.duration || 0;

  if (duration > 0) {
    log.info({ duration }, 'Waiting');
    await new Promise<void>((resolve) => {
      setTimeout(resolve, duration);
    });
  }

  return { waited: duration };
}

/**
 * Execute set_variable node
 */
function executeSetVariable(
  node: WorkflowNode,
  context: ExecutionContext
): { variable: string; value: unknown } {
  const { config } = node;
  if (!config?.variable) {
    throw new Error('set_variable requires variable name');
  }

  const value = config.value ? interpolate(config.value, context.execution.variables) : null;

  context.execution.variables[config.variable] = value;

  return { variable: config.variable, value };
}

/**
 * Execute speak node (for voice output)
 */
function executeSpeak(node: WorkflowNode, context: ExecutionContext): { text: string } {
  const { config } = node;
  if (!config?.text) {
    throw new Error('Speak requires text');
  }

  const text = interpolate(config.text, context.execution.variables);

  log.info({ textLength: text.length }, 'Speak node executed');

  // In production, this would queue the text for TTS
  return { text };
}

/**
 * Execute activity logging - writes to Firestore
 */
async function executeActivity(
  node: WorkflowNode,
  context: ExecutionContext
): Promise<{ activityId: string }> {
  const { config } = node;
  const now = new Date();

  // Generate activity ID with standard prefix
  const activityId = `${ID_PREFIXES.ACTIVITY}${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const activityData = {
    publisherId: context.execution.publisherId,
    personaId: context.workflow.personaId,
    userId: context.userId,
    sessionId: context.sessionId,
    type: config?.type || 'workflow_step',
    name: config?.name || node.name || node.id,
    data: {
      ...(config?.data || {}),
      workflowId: context.workflow.id,
      executionId: context.execution.id,
      nodeId: node.id,
    },
    status: 'completed',
    startedAt: now,
    completedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  log.info({ activityId, activityType: activityData.type }, 'Logging activity to Firestore');

  // Write to Firestore
  const db = getFirestoreDb();
  if (db) {
    try {
      await db.collection(COLLECTIONS.ACTIVITIES).doc(activityId).set(activityData);
      log.debug({ activityId }, 'Activity saved to Firestore');
    } catch (error) {
      log.error({ error: String(error), activityId }, 'Failed to save activity to Firestore');
      // Don't throw - activity logging is non-critical
    }
  } else {
    log.warn('Firestore not available for activity logging');
  }

  return { activityId };
}

// ============================================================================
// DAG TRAVERSAL
// ============================================================================

/**
 * Get the next nodes to execute based on edges
 */
function getNextNodes(
  currentNodeId: string,
  workflow: WorkflowDefinition,
  conditionResult?: boolean
): string[] {
  const edges = workflow.edges.filter((e) => e.sourceId === currentNodeId);

  if (edges.length === 0) {
    return [];
  }

  // For condition nodes, filter by condition value
  if (conditionResult !== undefined) {
    const matchingEdge = edges.find(
      (e) =>
        e.condition === String(conditionResult) ||
        (conditionResult && e.condition === 'true') ||
        (!conditionResult && e.condition === 'false')
    );
    return matchingEdge ? [matchingEdge.targetId] : [];
  }

  // For non-condition nodes, return all targets
  return edges.map((e) => e.targetId);
}

// ============================================================================
// MAIN ENGINE
// ============================================================================

/**
 * Execute a workflow
 */
export async function executeWorkflow(
  workflow: WorkflowDefinition,
  options: {
    executionId: string;
    publisherId: string;
    userId?: string;
    sessionId?: string;
    triggeredBy: 'voice' | 'api' | 'schedule' | 'event';
    input?: Record<string, unknown>;
  }
): Promise<WorkflowExecution> {
  const { executionId, publisherId, userId, sessionId, triggeredBy, input } = options;

  log.info({ workflowId: workflow.id, executionId, triggeredBy }, 'Starting workflow execution');

  // Initialize execution state
  const execution: WorkflowExecution = {
    id: executionId,
    workflowId: workflow.id,
    publisherId,
    userId,
    sessionId,
    triggeredBy,
    status: 'running',
    currentNodeIds: [workflow.entryNodeId],
    completedNodeIds: [],
    variables: {
      input: input || {},
      workflowId: workflow.id,
      workflowName: workflow.name,
      today: new Date().toISOString().split('T')[0],
      now: new Date().toISOString(),
      userId: userId || '',
    },
    nodeResults: {},
    startedAt: new Date(),
  };

  const context: ExecutionContext = {
    workflow,
    execution,
    userId,
    sessionId,
    input,
  };

  try {
    // BFS traversal of the DAG
    while (execution.currentNodeIds.length > 0) {
      const currentNodeId = execution.currentNodeIds.shift()!;

      // Skip if already completed
      if (execution.completedNodeIds.includes(currentNodeId)) {
        continue;
      }

      // Find the node
      const node = workflow.nodes.find((n) => n.id === currentNodeId);
      if (!node) {
        throw new Error(`Node not found: ${currentNodeId}`);
      }

      // Execute the node
      const result = await executeNode(node, context);
      execution.nodeResults[currentNodeId] = result;

      // Store result in variables for later nodes
      execution.variables[currentNodeId] = {
        result: result.result,
        status: result.status,
      };

      if (result.status === 'failed') {
        // Handle error
        if (node.onError?.type === 'goto' && node.onError.targetNodeId) {
          execution.currentNodeIds.push(node.onError.targetNodeId);
        } else {
          throw new Error(`Node ${currentNodeId} failed: ${result.error}`);
        }
      } else {
        execution.completedNodeIds.push(currentNodeId);

        // Dispatch step completed webhook (fire-and-forget)
        dispatchWebhookEvent({
          type: 'workflow.step.completed' as WebhookEventType,
          publisherId,
          userId,
          sessionId,
          data: {
            workflowId: workflow.id,
            executionId,
            nodeId: currentNodeId,
            nodeType: node.type,
            nodeName: node.name || currentNodeId,
            result: result.result,
            duration: result.duration,
          },
        }).catch((err) => {
          log.debug({ error: String(err) }, 'Failed to dispatch workflow.step.completed webhook');
        });

        // Get next nodes
        const conditionResult = node.type === 'condition' ? (result.result as boolean) : undefined;
        const nextNodeIds = getNextNodes(currentNodeId, workflow, conditionResult);
        execution.currentNodeIds.push(...nextNodeIds);
      }

      // Check for end node
      if (node.type === 'end') {
        break;
      }

      // Timeout check
      if (workflow.timeout) {
        const elapsed = Date.now() - execution.startedAt.getTime();
        if (elapsed > workflow.timeout) {
          throw new Error(`Workflow timeout exceeded: ${workflow.timeout}ms`);
        }
      }
    }

    // Mark as completed
    execution.status = 'completed';
    execution.completedAt = new Date();
    execution.result = {
      variables: execution.variables,
      nodeResults: execution.nodeResults,
    };

    log.info(
      {
        workflowId: workflow.id,
        executionId,
        duration: execution.completedAt.getTime() - execution.startedAt.getTime(),
        nodesExecuted: execution.completedNodeIds.length,
      },
      'Workflow completed'
    );

    // Dispatch webhook event
    await dispatchWebhookEvent({
      type: 'workflow.completed' as WebhookEventType,
      publisherId,
      userId,
      sessionId,
      data: {
        workflowId: workflow.id,
        executionId,
        status: 'completed',
        duration: execution.completedAt.getTime() - execution.startedAt.getTime(),
      },
    }).catch((err) => {
      log.warn({ error: String(err) }, 'Failed to dispatch workflow.completed webhook');
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    execution.status = 'failed';
    execution.completedAt = new Date();
    execution.error = err.message;

    log.error({ workflowId: workflow.id, executionId, error: err.message }, 'Workflow failed');

    // Dispatch failure webhook
    await dispatchWebhookEvent({
      type: 'workflow.failed' as WebhookEventType,
      publisherId,
      userId,
      sessionId,
      data: {
        workflowId: workflow.id,
        executionId,
        error: err.message,
      },
    }).catch((webhookErr) => {
      log.warn({ error: String(webhookErr) }, 'Failed to dispatch workflow failure webhook');
    });
  }

  return execution;
}

/**
 * Cancel a running workflow execution
 * Updates status in Firestore to 'cancelled'
 */
export async function cancelWorkflow(executionId: string): Promise<void> {
  log.info({ executionId }, 'Cancelling workflow execution');

  const db = getFirestoreDb();
  if (!db) {
    log.warn('Firestore not available for workflow cancellation');
    return;
  }

  try {
    const executionRef = db.collection(COLLECTIONS.WORKFLOW_EXECUTIONS).doc(executionId);
    const executionDoc = await executionRef.get();

    if (!executionDoc.exists) {
      log.warn({ executionId }, 'Execution not found for cancellation');
      return;
    }

    const executionData = executionDoc.data() as WorkflowExecution;

    // Only cancel if still running
    if (executionData.status !== 'running') {
      log.info(
        { executionId, currentStatus: executionData.status },
        'Execution not running, skipping cancellation'
      );
      return;
    }

    // Update status to cancelled
    await executionRef.update({
      status: 'cancelled',
      completedAt: new Date(),
      error: 'Workflow execution cancelled by user',
    });

    log.info({ executionId }, 'Workflow execution cancelled');

    // Dispatch cancellation event if we have publisherId
    if (executionData.publisherId) {
      dispatchWebhookEvent({
        type: 'workflow.completed' as WebhookEventType,
        publisherId: executionData.publisherId,
        userId: executionData.userId,
        sessionId: executionData.sessionId,
        data: {
          workflowId: executionData.workflowId,
          executionId,
          status: 'cancelled',
        },
      }).catch((err) => {
        log.debug({ error: String(err) }, 'Failed to dispatch cancellation webhook');
      });
    }
  } catch (error) {
    log.error({ error: String(error), executionId }, 'Failed to cancel workflow execution');
    throw error;
  }
}

export default {
  executeWorkflow,
  cancelWorkflow,
  interpolate,
  evaluateCondition,
};
