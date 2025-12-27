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

/* global AbortController */

import { getLogger } from '../../utils/safe-logger.js';
import { checkAndIncrementQuota, recordUsage } from '../billing/index.js';
import { getInstallation, getTool, hasPermission, recordExecution } from '../registry.js';
import type {
  MarketplaceId,
  PermissionScope,
  ToolManifest,
  TrustLevel,
  UserId,
} from '../schema/types.js';
import { getDockerRuntime } from './docker-runtime.js';
import { executeHttpTool } from './http-executor.js';
import { getWasmRuntime } from './wasm-runtime.js';

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
function getEffectiveLimits(manifest: ToolManifest): { timeoutMs: number; maxRetries: number } {
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

// HTTP executor is imported from ./http-executor.ts

// ============================================================================
// WASM EXECUTOR
// ============================================================================

/**
 * Execute a WASM-based tool
 */
async function executeWasmTool(
  manifest: ToolManifest,
  parameters: Record<string, unknown>,
  context: ExecutionContext,
  options: ExecutionOptions
): Promise<{ data: unknown; summary: string }> {
  const wasmBytes = manifest.execution.runtime.entrypoint;
  if (!wasmBytes) {
    throw new Error('WASM tool missing entrypoint');
  }

  const runtime = await getWasmRuntime();
  const { timeoutMs } = getEffectiveLimits(manifest);

  // Compile the module if not already cached
  const module = await runtime.compileModule(
    manifest.id,
    new Uint8Array(Buffer.from(wasmBytes, 'base64'))
  );

  // Execute the function
  const wasmResult = await runtime.execute(manifest.id, {
    function: 'run',
    args: parameters,
    limits: {
      timeoutMs: options.timeoutMs ?? timeoutMs,
    },
    trustLevel: manifest.verification.trustLevel,
  });

  if (!wasmResult.success) {
    throw new Error(wasmResult.error?.message || 'WASM execution failed');
  }

  log.debug({ toolId: manifest.id, metrics: wasmResult.metrics }, 'WASM tool executed');

  const summary =
    typeof wasmResult.data === 'string'
      ? wasmResult.data
      : JSON.stringify(wasmResult.data).slice(0, 500);

  return { data: wasmResult.data, summary };
}

// ============================================================================
// DOCKER EXECUTOR
// ============================================================================

/**
 * Execute a Docker-based tool
 */
async function executeDockerTool(
  manifest: ToolManifest,
  parameters: Record<string, unknown>,
  context: ExecutionContext,
  options: ExecutionOptions & { dockerImage?: string }
): Promise<{ data: unknown; summary: string }> {
  const runtime = await getDockerRuntime();

  if (!runtime.isAvailable()) {
    throw new Error('Docker runtime is not available');
  }

  // Get image from manifest or options
  const image = options.dockerImage || manifest.execution.runtime.endpoint;
  if (!image) {
    throw new Error('Docker tool missing image configuration');
  }

  // Get entrypoint command
  const entrypoint = manifest.execution.runtime.entrypoint;
  const command = entrypoint ? entrypoint.split(' ') : ['node', 'index.js'];

  const { timeoutMs } = getEffectiveLimits(manifest);
  const timeoutSeconds = Math.ceil((options.timeoutMs ?? timeoutMs) / 1000);

  // Build environment variables from manifest config
  const env: Record<string, string> = {};
  for (const envConfig of manifest.execution.runtime.env || []) {
    if (!envConfig.secret && envConfig.name) {
      // Only pass non-secret env vars; secrets would come from secret manager
      env[envConfig.name] = '';
    }
  }

  // Execute in container
  const dockerResult = await runtime.execute(image, {
    command,
    input: parameters,
    env,
    limits: {
      timeoutSeconds,
      memoryMB: manifest.execution.limits.memoryMb || 256,
    },
    trustLevel: manifest.verification.trustLevel,
    networkAccess: manifest.execution.limits.networkAccess,
  });

  if (!dockerResult.success) {
    throw new Error(
      dockerResult.error?.message || dockerResult.stderr || 'Docker execution failed'
    );
  }

  log.debug(
    { toolId: manifest.id, exitCode: dockerResult.exitCode, metrics: dockerResult.metrics },
    'Docker tool executed'
  );

  const data = dockerResult.data || dockerResult.stdout;
  const summary =
    typeof data === 'string' ? data.slice(0, 500) : JSON.stringify(data).slice(0, 500);

  return { data, summary };
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

  // Check and atomically increment quota before execution (skip for platform tools)
  // Using atomic operation prevents race conditions where concurrent requests could exceed quota
  if (manifest.verification.trustLevel !== 'platform' && !options.skipPermissionCheck) {
    const quotaCheck = await checkAndIncrementQuota(context.userId, toolId, context.subscriptionTier || 'free');

    if (!quotaCheck.allowed) {
      log.warn({ toolId, userId: context.userId, reason: quotaCheck.reason }, 'Quota exceeded');
      return {
        success: false,
        error: {
          code: 'QUOTA_EXCEEDED',
          message: quotaCheck.reason || 'Monthly quota exceeded',
          userMessage: quotaCheck.upgradeRequired
            ? "You've reached your monthly limit. Upgrade for more."
            : "You've reached your limit for this tool.",
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
      case 'http': {
        const { timeoutMs } = getEffectiveLimits(manifest);
        const effectiveTimeout = options.timeoutMs ?? timeoutMs;
        result = await executeHttpTool(manifest, parameters, context, options, effectiveTimeout);
        break;
      }

      case 'wasm':
        result = await executeWasmTool(manifest, parameters, context, options);
        break;

      case 'docker':
        result = await executeDockerTool(manifest, parameters, context, options);
        break;

      case 'node':
        // Node.js tools run via Docker for isolation
        result = await executeDockerTool(manifest, parameters, context, {
          ...options,
          dockerImage: 'node:20-alpine',
        });
        break;

      case 'deno':
        // Deno tools run via Docker for isolation
        result = await executeDockerTool(manifest, parameters, context, {
          ...options,
          dockerImage: 'denoland/deno:alpine',
        });
        break;

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

    log.error({ toolId, error: err.message, isTimeout }, 'Marketplace tool execution failed');

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
        retryable:
          manifest.execution.retry?.retryableErrors?.includes(
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
      batch.map((exec) => executeMarketplaceTool(exec.toolId, exec.parameters, context, options))
    );
    results.push(...batchResults);
  }

  return results;
}
