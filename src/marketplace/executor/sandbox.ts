/**
 * Sandbox Executor
 *
 * Executes marketplace tools in isolation with enforced limits and permissions.
 *
 * Security layers:
 * 1. Permission checks - Only allowed scopes can be used
 * 2. Resource limits - Timeout, memory, CPU limits
 * 3. Network isolation - HTTP tools are already isolated (external APIs)
 * 4. Audit logging - All executions are recorded
 *
 * Execution modes:
 * - http: Call external HTTP endpoint (most tools)
 * - wasm: WebAssembly sandbox (future)
 * - docker: Container isolation (future)
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  getTool,
  getInstallation,
  hasPermission,
  recordExecution,
} from '../registry.js';
import { recordUsage, checkQuota } from '../billing/index.js';
import type {
  MarketplaceId,
  PermissionScope,
  ToolExecution,
  ToolManifest,
  TrustLevel,
  UserId,
} from '../schema/types.js';

const log = getLogger().child({ module: 'sandbox-executor' });

// ============================================================================
// TYPES
// ============================================================================

export interface ExecutionContext {
  userId: UserId;
  sessionId: string;
  agentId?: string;
  tenantId?: string;
  /** Subscription tier for quota enforcement */
  subscriptionTier?: string;
}

export interface ExecutionOptions {
  /** Override manifest timeout */
  timeoutMs?: number;

  /** Skip permission checks (for platform tools) */
  skipPermissionCheck?: boolean;

  /** Environment variables to inject */
  env?: Record<string, string>;

  /** Execution metadata for audit */
  metadata?: Record<string, unknown>;
}

export interface ExecutionResult {
  success: boolean;
  data?: unknown;
  summary?: string;
  error?: {
    code: string;
    message: string;
    userMessage: string;
    retryable: boolean;
  };
  executionId: string;
  durationMs: number;
  permissionsUsed: PermissionScope[];
}

// ============================================================================
// PERMISSION ENFORCEMENT
// ============================================================================

/**
 * Check if all required permissions are granted for this execution
 */
function checkPermissions(
  manifest: ToolManifest,
  context: ExecutionContext,
  options: ExecutionOptions
): { allowed: boolean; missing: PermissionScope[] } {
  if (options.skipPermissionCheck) {
    return { allowed: true, missing: [] };
  }

  // Platform tools always allowed
  if (manifest.verification.trustLevel === 'platform') {
    return { allowed: true, missing: [] };
  }

  const requiredScopes = manifest.permissions.required.map((p) => p.scope);
  const missing = requiredScopes.filter(
    (scope) => !hasPermission(context.userId, manifest.id, scope)
  );

  return {
    allowed: missing.length === 0,
    missing,
  };
}

// ============================================================================
// TRUST-BASED EXECUTION
// ============================================================================

/**
 * Determine if tool can be executed based on trust level
 */
function canExecute(manifest: ToolManifest): { allowed: boolean; reason?: string } {
  const { trustLevel, verified } = manifest.verification;

  switch (trustLevel) {
    case 'platform':
      // Platform tools can always execute
      return { allowed: true };

    case 'verified':
      // Verified tools can execute if signature is valid
      if (!verified) {
        return { allowed: false, reason: 'Tool verification has expired or been revoked' };
      }
      return { allowed: true };

    case 'community':
      // Community tools can execute but with stricter limits
      return { allowed: true };

    case 'unverified':
      // Unverified tools require explicit user consent (handled at install time)
      return { allowed: true };

    default:
      return { allowed: false, reason: `Unknown trust level: ${trustLevel}` };
  }
}

/**
 * Get resource limits based on trust level
 */
function getEffectiveLimits(
  manifest: ToolManifest
): { timeoutMs: number; maxRetries: number } {
  const baseLimits = manifest.execution.limits;
  const trustLevel = manifest.verification.trustLevel;

  // More trusted tools get higher limits
  const multipliers: Record<TrustLevel, number> = {
    platform: 2.0,
    verified: 1.0,
    community: 0.5,
    unverified: 0.25,
  };

  const multiplier = multipliers[trustLevel] || 0.5;

  return {
    timeoutMs: Math.min(baseLimits.timeoutMs * multiplier, 30000), // Max 30s
    maxRetries: trustLevel === 'platform' ? 3 : trustLevel === 'verified' ? 2 : 1,
  };
}

// ============================================================================
// HTTP EXECUTOR
// ============================================================================

/**
 * Execute an HTTP-based tool
 */
async function executeHttpTool(
  manifest: ToolManifest,
  parameters: Record<string, unknown>,
  context: ExecutionContext,
  options: ExecutionOptions
): Promise<{ data: unknown; summary: string }> {
  const endpoint = manifest.execution.runtime.endpoint;
  if (!endpoint) {
    throw new Error('HTTP tool missing endpoint configuration');
  }

  const { timeoutMs } = getEffectiveLimits(manifest);
  const effectiveTimeout = options.timeoutMs ?? timeoutMs;

  log.debug(
    { toolId: manifest.id, endpoint, timeoutMs: effectiveTimeout },
    'Executing HTTP tool'
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Ferni-Tool-Id': manifest.id,
        'X-Ferni-Tool-Version': manifest.version,
        'X-Ferni-User-Id': context.userId,
        'X-Ferni-Session-Id': context.sessionId,
        ...(context.tenantId && { 'X-Ferni-Tenant-Id': context.tenantId }),
      },
      body: JSON.stringify({
        parameters,
        context: {
          userId: context.userId,
          sessionId: context.sessionId,
          agentId: context.agentId,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json() as { summary?: string; data?: unknown };

    // Extract summary for voice response
    const summary =
      result.summary ||
      (typeof result.data === 'string' ? result.data : JSON.stringify(result.data ?? result).slice(0, 500));

    return { data: result.data || result, summary };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================================
// MAIN EXECUTOR
// ============================================================================

/**
 * Execute a marketplace tool with sandboxing and permission enforcement
 */
export async function executeMarketplaceTool(
  toolId: MarketplaceId,
  parameters: Record<string, unknown>,
  context: ExecutionContext,
  options: ExecutionOptions = {}
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const permissionsUsed: PermissionScope[] = [];

  // Get tool manifest
  const manifest = getTool(toolId);
  if (!manifest) {
    return {
      success: false,
      error: {
        code: 'TOOL_NOT_FOUND',
        message: `Tool not found: ${toolId}`,
        userMessage: "I don't have that capability available.",
        retryable: false,
      },
      executionId: '',
      durationMs: Date.now() - startTime,
      permissionsUsed,
    };
  }

  // Check if tool can be executed
  const canExec = canExecute(manifest);
  if (!canExec.allowed) {
    log.warn({ toolId, reason: canExec.reason }, 'Tool execution blocked');
    return {
      success: false,
      error: {
        code: 'EXECUTION_BLOCKED',
        message: canExec.reason || 'Tool execution not allowed',
        userMessage: 'This tool is currently unavailable.',
        retryable: false,
      },
      executionId: '',
      durationMs: Date.now() - startTime,
      permissionsUsed,
    };
  }

  // Check permissions
  const permCheck = checkPermissions(manifest, context, options);
  if (!permCheck.allowed) {
    log.warn({ toolId, missing: permCheck.missing }, 'Missing permissions for tool');
    return {
      success: false,
      error: {
        code: 'PERMISSION_DENIED',
        message: `Missing permissions: ${permCheck.missing.join(', ')}`,
        userMessage: 'I need additional permissions to use that feature.',
        retryable: false,
      },
      executionId: '',
      durationMs: Date.now() - startTime,
      permissionsUsed,
    };
  }

  // Track which permissions we're using
  permissionsUsed.push(...manifest.permissions.required.map((p) => p.scope));

  // Check quota before execution (skip for platform tools)
  if (manifest.verification.trustLevel !== 'platform' && !options.skipPermissionCheck) {
    const quotaCheck = checkQuota(
      context.userId,
      toolId,
      context.subscriptionTier || 'free'
    );

    if (!quotaCheck.allowed) {
      log.warn({ toolId, userId: context.userId, reason: quotaCheck.reason }, 'Quota exceeded');
      return {
        success: false,
        error: {
          code: 'QUOTA_EXCEEDED',
          message: quotaCheck.reason || 'Monthly quota exceeded',
          userMessage: quotaCheck.upgradeRequired
            ? 'You\'ve reached your monthly limit. Upgrade for more.'
            : 'You\'ve reached your limit for this tool.',
          retryable: false,
        },
        executionId: '',
        durationMs: Date.now() - startTime,
        permissionsUsed,
      };
    }
  }

  log.info(
    {
      toolId,
      userId: context.userId,
      trustLevel: manifest.verification.trustLevel,
      mode: manifest.execution.mode,
    },
    'Executing marketplace tool'
  );

  try {
    let result: { data: unknown; summary: string };

    // Route to appropriate executor based on runtime type
    switch (manifest.execution.runtime.type) {
      case 'http':
        result = await executeHttpTool(manifest, parameters, context, options);
        break;

      case 'wasm':
        // Future: WASM sandbox execution
        throw new Error('WASM execution not yet implemented');

      case 'docker':
        // Future: Docker container execution
        throw new Error('Docker execution not yet implemented');

      case 'node':
        // Future: Isolated Node.js VM execution
        throw new Error('Node.js sandbox execution not yet implemented');

      case 'deno':
        // Future: Deno sandbox execution
        throw new Error('Deno execution not yet implemented');

      default:
        throw new Error(`Unsupported runtime type: ${manifest.execution.runtime.type}`);
    }

    const durationMs = Date.now() - startTime;

    // Record successful execution
    const execution = recordExecution({
      toolId,
      toolVersion: manifest.version,
      installationId: getInstallation(context.userId, toolId)?.id || 'direct',
      userId: context.userId,
      sessionId: context.sessionId,
      agentId: context.agentId,
      tenantId: context.tenantId,
      executedAt: new Date().toISOString(),
      durationMs,
      status: 'success',
      resources: {},
      permissionsUsed,
    });

    // Record usage for billing (skip for platform tools)
    if (manifest.verification.trustLevel !== 'platform') {
      recordUsage({
        userId: context.userId,
        tenantId: context.tenantId,
        itemId: toolId,
        itemType: 'tool',
        timestamp: new Date().toISOString(),
        metrics: {
          executions: 1,
          executionTimeMs: durationMs,
          dataTransferBytes: 0, // Could be computed from response size
        },
      });
    }

    log.info(
      { toolId, executionId: execution.id, durationMs },
      'Marketplace tool executed successfully'
    );

    return {
      success: true,
      data: result.data,
      summary: result.summary,
      executionId: execution.id,
      durationMs,
      permissionsUsed,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const durationMs = Date.now() - startTime;
    const isTimeout = err.name === 'AbortError';

    log.error(
      { toolId, error: err.message, isTimeout },
      'Marketplace tool execution failed'
    );

    // Record failed execution
    const execution = recordExecution({
      toolId,
      toolVersion: manifest.version,
      installationId: getInstallation(context.userId, toolId)?.id || 'direct',
      userId: context.userId,
      sessionId: context.sessionId,
      agentId: context.agentId,
      tenantId: context.tenantId,
      executedAt: new Date().toISOString(),
      durationMs,
      status: isTimeout ? 'timeout' : 'failure',
      errorCode: isTimeout ? 'TIMEOUT' : 'EXECUTION_ERROR',
      errorMessage: err.message,
      resources: {},
      permissionsUsed,
    });

    return {
      success: false,
      error: {
        code: isTimeout ? 'TIMEOUT' : 'EXECUTION_ERROR',
        message: err.message,
        userMessage: isTimeout
          ? 'That took too long. Let me try something else.'
          : 'Something went wrong. Let me try a different approach.',
        retryable: manifest.execution.retry?.retryableErrors?.includes(
          isTimeout ? 'TIMEOUT' : 'EXECUTION_ERROR'
        ) || false,
      },
      executionId: execution.id,
      durationMs,
      permissionsUsed,
    };
  }
}

// ============================================================================
// BATCH EXECUTION
// ============================================================================

/**
 * Execute multiple tools in parallel with aggregate limits
 */
export async function executeBatch(
  executions: Array<{
    toolId: MarketplaceId;
    parameters: Record<string, unknown>;
  }>,
  context: ExecutionContext,
  options: ExecutionOptions = {}
): Promise<ExecutionResult[]> {
  const MAX_PARALLEL = 5;

  // Execute in batches to avoid overwhelming the system
  const results: ExecutionResult[] = [];

  for (let i = 0; i < executions.length; i += MAX_PARALLEL) {
    const batch = executions.slice(i, i + MAX_PARALLEL);
    const batchResults = await Promise.all(
      batch.map((exec) =>
        executeMarketplaceTool(exec.toolId, exec.parameters, context, options)
      )
    );
    results.push(...batchResults);
  }

  return results;
}
