/**
 * Webhook Executor
 *
 * Executes webhook HTTP requests with circuit breaker protection,
 * rate limiting, and cooldown enforcement.
 */
import type { RateLimitStatus, WebhookConfig, WebhookExecutionLog, WebhookExecutionResult } from './types.js';
/**
 * Check if user has exceeded rate limit
 */
export declare function checkRateLimit(userId: string): RateLimitStatus;
/**
 * Check if webhook is in cooldown period
 */
export declare function checkCooldown(webhookId: string, cooldownSeconds?: number): {
    allowed: boolean;
    waitSeconds?: number;
};
/**
 * Execute a webhook
 */
export declare function executeWebhook(userId: string, webhook: WebhookConfig, triggeredBy: 'voice' | 'api' | 'test' | 'siri', voiceContext?: {
    transcript?: string;
    personaId?: string;
}): Promise<WebhookExecutionResult>;
/**
 * Test a webhook without rate limiting or cooldown checks
 */
export declare function testWebhook(userId: string, webhook: WebhookConfig): Promise<WebhookExecutionResult>;
/**
 * Create an execution log entry (for debug storage)
 */
export declare function createExecutionLog(result: WebhookExecutionResult, userId: string, triggeredBy: 'voice' | 'api' | 'test' | 'siri'): WebhookExecutionLog;
/**
 * Clear rate limit cache for a user (for testing)
 */
export declare function clearRateLimitCache(userId: string): void;
/**
 * Clear cooldown cache for a webhook (for testing)
 */
export declare function clearCooldownCache(webhookId: string): void;
/**
 * Clear all caches (for testing)
 */
export declare function clearAllExecutorCaches(): void;
//# sourceMappingURL=webhook-executor.d.ts.map