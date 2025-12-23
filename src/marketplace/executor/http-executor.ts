/**
 * HTTP Tool Executor
 *
 * Executes HTTP-based marketplace tools by calling external endpoints.
 */

/* global AbortController */

import { getLogger } from '../../utils/safe-logger.js';
import type { ToolManifest } from '../schema/types.js';
import type { ExecutionContext, ExecutionOptions } from './sandbox.js';

const log = getLogger().child({ module: 'http-executor' });

// ============================================================================
// HTTP EXECUTOR
// ============================================================================

/**
 * Execute an HTTP-based tool
 */
export async function executeHttpTool(
  manifest: ToolManifest,
  parameters: Record<string, unknown>,
  context: ExecutionContext,
  options: ExecutionOptions,
  effectiveTimeout: number
): Promise<{ data: unknown; summary: string }> {
  const endpoint = manifest.execution.runtime.endpoint;
  if (!endpoint) {
    throw new Error('HTTP tool missing endpoint configuration');
  }

  log.debug({ toolId: manifest.id, endpoint, timeoutMs: effectiveTimeout }, 'Executing HTTP tool');

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

    const result = (await response.json()) as { summary?: string; data?: unknown };

    // Extract summary for voice response
    const summary =
      result.summary ||
      (typeof result.data === 'string'
        ? result.data
        : JSON.stringify(result.data ?? result).slice(0, 500));

    return { data: result.data || result, summary };
  } finally {
    clearTimeout(timeoutId);
  }
}
