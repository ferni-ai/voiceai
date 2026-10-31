/**
 * HTTP Tool Executor
 *
 * Executes HTTP-based marketplace tools by calling external endpoints.
 *
 * SECURITY NOTES:
 * - User IDs are anonymized before being sent to external endpoints
 * - Endpoints go through safeOutboundFetch: https only, every DNS answer and redirect target
 *   must be public, checked again at connect time, and response bodies are size-capped
 */

import { getLogger } from '../../utils/safe-logger.js';
import { redactUrl } from '../../utils/url-redaction.js';
import {
  OutboundUrlBlockedError,
  readCappedJson,
  readCappedText,
  safeOutboundFetch,
} from '../../utils/outbound-url-guard.js';
import type { ToolManifest } from '../schema/types.js';
import type { ExecutionContext, ExecutionOptions } from './sandbox.js';
import { anonymizeUserId, generateSecureId } from '../auth/index.js';

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

  // SECURITY: Anonymize user ID before sending to external endpoint
  // Each tool sees a different anonymized ID, preventing cross-tool tracking
  const anonymizedUserId = anonymizeUserId(context.userId, manifest.id);
  const requestId = generateSecureId('req');

  log.debug(
    { toolId: manifest.id, endpoint: redactUrl(endpoint), timeoutMs: effectiveTimeout, requestId },
    'Executing HTTP tool'
  );

  let response: Response;
  try {
    response = await safeOutboundFetch(
      endpoint,
      {
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
      },
      { timeoutMs: effectiveTimeout }
    );
  } catch (error) {
    if (error instanceof OutboundUrlBlockedError) {
      log.warn(
        { toolId: manifest.id, endpoint: redactUrl(endpoint) },
        'Blocked invalid/internal endpoint URL'
      );
      throw new Error('Tool endpoint URL is invalid or points to internal resources');
    }
    throw error;
  }

  if (!response.ok) {
    const errorText = await readCappedText(response, 2048);
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const result = await readCappedJson<{ summary?: string; data?: unknown }>(response);

  // Extract summary for voice response
  const summary =
    result.summary ||
    (typeof result.data === 'string'
      ? result.data
      : JSON.stringify(result.data ?? result).slice(0, 500));

  return { data: result.data || result, summary };
}
