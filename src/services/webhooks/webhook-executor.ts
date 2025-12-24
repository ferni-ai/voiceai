/**
 * Webhook Executor
 *
 * Executes webhook HTTP requests with circuit breaker protection,
 * rate limiting, and cooldown enforcement.
 */

import { getCircuitBreaker } from '../../utils/circuit-breaker.js';
import { createLogger } from '../../utils/safe-logger.js';
import type {
  RateLimitConfig,
  RateLimitStatus,
  WebhookConfig,
  WebhookExecutionLog,
  WebhookExecutionResult,
  WebhookPayloadContext,
} from './types.js';
import { recordExecution } from './webhook-config-store.js';

const log = createLogger({ module: 'webhook-executor' });

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  webhooksPerHour: 60,
  incomingPerHour: 100,
  defaultCooldownSeconds: 5,
};

const WEBHOOK_TIMEOUT_MS = 10_000; // 10 seconds
const MAX_RETRIES = 2; // Retry twice for transient failures
const RETRY_DELAY_MS = 1000; // 1 second between retries

/**
 * Sleep helper for retry delay
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Check if an error/status is retryable
 */
function isRetryable(statusCode?: number, error?: string): boolean {
  // Retry 5xx server errors
  if (statusCode && statusCode >= 500 && statusCode < 600) return true;
  // Retry network errors
  if (
    error &&
    (error.includes('ECONNRESET') || error.includes('ETIMEDOUT') || error.includes('network'))
  )
    return true;
  return false;
}

// Circuit breaker for webhook execution
const webhookCircuitBreaker = getCircuitBreaker('webhook-executor', {
  failureThreshold: 10, // More lenient - webhooks can fail without affecting us
  resetTimeout: 60_000, // 1 minute
  successThreshold: 3,
});

// ============================================================================
// RATE LIMITING
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// Rate limit per user (webhooks per hour)
const userRateLimits = new Map<string, RateLimitEntry>();

// Cooldown per webhook (last triggered time)
const webhookCooldowns = new Map<string, number>();

/**
 * Check if user has exceeded rate limit
 */
export function checkRateLimit(userId: string): RateLimitStatus {
  const now = Date.now();
  const entry = userRateLimits.get(userId);

  if (!entry || now > entry.resetAt) {
    // Reset or initialize
    userRateLimits.set(userId, {
      count: 0,
      resetAt: now + 60 * 60 * 1000, // 1 hour
    });
    return {
      allowed: true,
      remaining: DEFAULT_RATE_LIMIT.webhooksPerHour,
      resetAt: new Date(now + 60 * 60 * 1000).toISOString(),
    };
  }

  if (entry.count >= DEFAULT_RATE_LIMIT.webhooksPerHour) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(entry.resetAt).toISOString(),
      reason: 'Rate limit exceeded. Try again later.',
    };
  }

  return {
    allowed: true,
    remaining: DEFAULT_RATE_LIMIT.webhooksPerHour - entry.count,
    resetAt: new Date(entry.resetAt).toISOString(),
  };
}

/**
 * Increment rate limit counter
 */
function incrementRateLimit(userId: string): void {
  const entry = userRateLimits.get(userId);
  if (entry) {
    entry.count++;
  }
}

/**
 * Check if webhook is in cooldown period
 */
export function checkCooldown(
  webhookId: string,
  cooldownSeconds?: number
): { allowed: boolean; waitSeconds?: number } {
  const cooldown = cooldownSeconds ?? DEFAULT_RATE_LIMIT.defaultCooldownSeconds;
  const lastTriggered = webhookCooldowns.get(webhookId);

  if (!lastTriggered) {
    return { allowed: true };
  }

  const now = Date.now();
  const cooldownMs = cooldown * 1000;
  const elapsedMs = now - lastTriggered;

  if (elapsedMs < cooldownMs) {
    return {
      allowed: false,
      waitSeconds: Math.ceil((cooldownMs - elapsedMs) / 1000),
    };
  }

  return { allowed: true };
}

/**
 * Record webhook trigger for cooldown tracking
 */
function recordCooldown(webhookId: string): void {
  webhookCooldowns.set(webhookId, Date.now());
}

// ============================================================================
// PAYLOAD TEMPLATING
// ============================================================================

/**
 * Process payload template with variable substitution
 *
 * Template format: {{variable}} where variable is a key from context
 * Supports nested access: {{voiceContext.transcript}}
 */
function processPayloadTemplate(template: string, context: WebhookPayloadContext): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const keys = path.trim().split('.');
    let value: unknown = context;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = (value as Record<string, unknown>)[key];
      } else {
        return match; // Keep original if path not found
      }
    }

    return value !== undefined ? String(value) : match;
  });
}

/**
 * Build default payload for webhook
 */
function buildDefaultPayload(context: WebhookPayloadContext): Record<string, unknown> {
  return {
    source: 'ferni',
    triggeredBy: context.triggeredBy,
    webhookName: context.webhookName,
    timestamp: context.timestamp,
    userId: context.userId,
    ...(context.voiceContext && {
      voiceContext: {
        transcript: context.voiceContext.transcript,
        personaId: context.voiceContext.personaId,
      },
    }),
  };
}

// ============================================================================
// WEBHOOK EXECUTION
// ============================================================================

/**
 * Execute a webhook
 */
export async function executeWebhook(
  userId: string,
  webhook: WebhookConfig,
  triggeredBy: 'voice' | 'api' | 'test' | 'siri',
  voiceContext?: { transcript?: string; personaId?: string }
): Promise<WebhookExecutionResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  // Check rate limit
  const rateLimitStatus = checkRateLimit(userId);
  if (!rateLimitStatus.allowed) {
    log.warn({ userId, webhookId: webhook.id }, 'Webhook rate limited');
    return {
      success: false,
      webhookId: webhook.id,
      webhookName: webhook.name,
      error: rateLimitStatus.reason || 'Rate limit exceeded',
      durationMs: Date.now() - startTime,
      timestamp,
    };
  }

  // Check cooldown
  const cooldownStatus = checkCooldown(webhook.id, webhook.cooldownSeconds);
  if (!cooldownStatus.allowed) {
    log.debug(
      { userId, webhookId: webhook.id, waitSeconds: cooldownStatus.waitSeconds },
      'Webhook in cooldown'
    );
    return {
      success: false,
      webhookId: webhook.id,
      webhookName: webhook.name,
      error: `Please wait ${cooldownStatus.waitSeconds}s before triggering again`,
      durationMs: Date.now() - startTime,
      timestamp,
    };
  }

  // Build payload context
  const payloadContext: WebhookPayloadContext = {
    userId,
    webhookName: webhook.name,
    triggeredBy,
    timestamp,
    voiceContext,
  };

  // Build payload
  let payload: string | undefined;
  if (webhook.method !== 'GET') {
    if (webhook.payloadTemplate) {
      payload = processPayloadTemplate(webhook.payloadTemplate, payloadContext);
    } else {
      payload = JSON.stringify(buildDefaultPayload(payloadContext));
    }
  }

  // Build headers
  const headers: Record<string, string> = {
    'User-Agent': 'Ferni/1.0',
    'X-Ferni-Webhook': 'true',
    ...(webhook.method !== 'GET' && { 'Content-Type': 'application/json' }),
    ...webhook.headers,
  };

  // Execute with circuit breaker and retry logic
  let lastResult: {
    statusCode?: number;
    responseBody?: string;
    success: boolean;
    error?: string;
  } | null = null;
  let attempts = 0;

  while (attempts <= MAX_RETRIES) {
    try {
      const result = await webhookCircuitBreaker.execute(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

        try {
          const response = await fetch(webhook.url, {
            method: webhook.method,
            headers,
            body: payload,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          const responseBody = await response.text();

          return {
            statusCode: response.status,
            responseBody: responseBody.slice(0, 1000), // Limit stored response
            success: response.ok,
          };
        } finally {
          clearTimeout(timeoutId);
        }
      });

      lastResult = result;

      // If successful or not retryable, break out
      if (result.success || !isRetryable(result.statusCode)) {
        break;
      }

      // Retryable failure - try again if we have retries left
      attempts++;
      if (attempts <= MAX_RETRIES) {
        log.debug(
          { userId, webhookId: webhook.id, attempt: attempts, statusCode: result.statusCode },
          'Retrying webhook after transient failure'
        );
        await sleep(RETRY_DELAY_MS);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isTimeout = errorMessage.includes('abort');
      lastResult = { success: false, error: isTimeout ? 'Request timed out' : errorMessage };

      // Retry on network errors (not timeouts - those are likely slow endpoints)
      if (!isTimeout && isRetryable(undefined, errorMessage) && attempts < MAX_RETRIES) {
        attempts++;
        log.debug(
          { userId, webhookId: webhook.id, attempt: attempts, error: errorMessage },
          'Retrying webhook after network error'
        );
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      incrementRateLimit(userId);
      await recordExecution(userId, webhook.id, false);

      log.error(
        { userId, webhookId: webhook.id, error: errorMessage, attempts },
        isTimeout ? 'Webhook timed out' : 'Webhook execution failed'
      );

      return {
        success: false,
        webhookId: webhook.id,
        webhookName: webhook.name,
        error: lastResult.error,
        durationMs: Date.now() - startTime,
        timestamp,
      };
    }
  }

  // Process final result
  if (!lastResult) {
    return {
      success: false,
      webhookId: webhook.id,
      webhookName: webhook.name,
      error: 'Unknown error',
      durationMs: Date.now() - startTime,
      timestamp,
    };
  }

  // Record execution
  incrementRateLimit(userId);
  recordCooldown(webhook.id);
  await recordExecution(userId, webhook.id, lastResult.success);

  if (lastResult.success) {
    log.info(
      { userId, webhookId: webhook.id, statusCode: lastResult.statusCode },
      'Webhook executed successfully'
    );
  } else {
    log.warn(
      { userId, webhookId: webhook.id, statusCode: lastResult.statusCode, attempts },
      'Webhook returned error status after retries'
    );
  }

  return {
    success: lastResult.success,
    webhookId: webhook.id,
    webhookName: webhook.name,
    statusCode: lastResult.statusCode,
    responseBody: lastResult.responseBody,
    error: lastResult.success ? undefined : `HTTP ${lastResult.statusCode}`,
    durationMs: Date.now() - startTime,
    timestamp,
  };
}

/**
 * Test a webhook without rate limiting or cooldown checks
 */
export async function testWebhook(
  userId: string,
  webhook: WebhookConfig
): Promise<WebhookExecutionResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  const payloadContext: WebhookPayloadContext = {
    userId,
    webhookName: webhook.name,
    triggeredBy: 'test',
    timestamp,
  };

  let payload: string | undefined;
  if (webhook.method !== 'GET') {
    if (webhook.payloadTemplate) {
      payload = processPayloadTemplate(webhook.payloadTemplate, payloadContext);
    } else {
      payload = JSON.stringify({
        ...buildDefaultPayload(payloadContext),
        test: true,
      });
    }
  }

  const headers: Record<string, string> = {
    'User-Agent': 'Ferni/1.0 (Test)',
    'X-Ferni-Webhook': 'true',
    'X-Ferni-Test': 'true',
    ...(webhook.method !== 'GET' && { 'Content-Type': 'application/json' }),
    ...webhook.headers,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

    const response = await fetch(webhook.url, {
      method: webhook.method,
      headers,
      body: payload,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const responseBody = await response.text();

    log.info(
      { userId, webhookId: webhook.id, statusCode: response.status },
      'Webhook test completed'
    );

    return {
      success: response.ok,
      webhookId: webhook.id,
      webhookName: webhook.name,
      statusCode: response.status,
      responseBody: responseBody.slice(0, 1000),
      error: response.ok ? undefined : `HTTP ${response.status}`,
      durationMs: Date.now() - startTime,
      timestamp,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMessage.includes('abort');

    log.error({ userId, webhookId: webhook.id, error: errorMessage }, 'Webhook test failed');

    return {
      success: false,
      webhookId: webhook.id,
      webhookName: webhook.name,
      error: isTimeout ? 'Request timed out' : errorMessage,
      durationMs: Date.now() - startTime,
      timestamp,
    };
  }
}

// ============================================================================
// EXECUTION LOGGING
// ============================================================================

/**
 * Create an execution log entry (for debug storage)
 */
export function createExecutionLog(
  result: WebhookExecutionResult,
  userId: string,
  triggeredBy: 'voice' | 'api' | 'test' | 'siri'
): WebhookExecutionLog {
  return {
    id: crypto.randomUUID(),
    webhookId: result.webhookId,
    webhookName: result.webhookName,
    userId,
    success: result.success,
    statusCode: result.statusCode,
    error: result.error,
    durationMs: result.durationMs,
    triggeredBy,
    timestamp: result.timestamp,
  };
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clear rate limit cache for a user (for testing)
 */
export function clearRateLimitCache(userId: string): void {
  userRateLimits.delete(userId);
}

/**
 * Clear cooldown cache for a webhook (for testing)
 */
export function clearCooldownCache(webhookId: string): void {
  webhookCooldowns.delete(webhookId);
}

/**
 * Clear all caches (for testing)
 */
export function clearAllExecutorCaches(): void {
  userRateLimits.clear();
  webhookCooldowns.clear();
}
