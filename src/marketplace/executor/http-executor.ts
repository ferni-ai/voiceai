/**
 * HTTP Tool Executor
 *
 * Executes HTTP-based marketplace tools by calling external endpoints.
 * 
 * SECURITY NOTES:
 * - User IDs are anonymized before being sent to external endpoints
 * - Internal/private URLs are blocked
 * - Endpoint URLs are validated on each call
 */

/* global AbortController */

import { getLogger } from '../../utils/safe-logger.js';
import type { ToolManifest } from '../schema/types.js';
import type { ExecutionContext, ExecutionOptions } from './sandbox.js';
import { anonymizeUserId, isValidExternalUrl, generateSecureId } from '../auth/index.js';

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

  // SECURITY: Validate endpoint URL to prevent SSRF attacks
  if (!isValidExternalUrl(endpoint)) {
    log.warn({ toolId: manifest.id, endpoint }, 'Blocked invalid/internal endpoint URL');
    throw new Error('Tool endpoint URL is invalid or points to internal resources');
  }

  // SECURITY: Anonymize user ID before sending to external endpoint
  // Each tool sees a different anonymized ID, preventing cross-tool tracking
  const anonymizedUserId = anonymizeUserId(context.userId, manifest.id);
  const requestId = generateSecureId('req');

  log.debug({ toolId: manifest.id, endpoint, timeoutMs: effectiveTimeout, requestId }, 'Executing HTTP tool');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Ferni-Tool-Id': manifest.id,
        'X-Ferni-Tool-Version': manifest.version,
        // SECURITY: Send anonymized user ID instead of real user ID
        'X-Ferni-User-Token': anonymizedUserId,
        'X-Ferni-Request-Id': requestId,
        // Note: Session ID and Tenant ID are intentionally NOT sent to external tools
      },
      body: JSON.stringify({
        parameters,
        // SECURITY: Only send anonymized context to external tools
        context: {
          userToken: anonymizedUserId,
          requestId,
          // agentId is safe to send (it's the agent type, not user-specific)
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
