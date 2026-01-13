/**
 * Webhooks Service
 *
 * Universal automation triggers for IFTTT, Zapier, Home Assistant,
 * Siri Shortcuts, and custom webhooks.
 */
export type { CreateSiriTokenInput, CreateSiriTokenResult, CreateWebhookInput, ListWebhooksResult, PlatformValidation, RateLimitConfig, RateLimitStatus, SiriToken, SiriTokenScope, UpdateWebhookInput, UrlValidationResult, WebhookConfig, WebhookExecutionLog, WebhookExecutionResult, WebhookMethod, WebhookPayloadContext, WebhookPlatform, WebhookServiceResult, WebhookStats, } from './types.js';
export { clearAllCaches, clearUserCache, createSiriToken, createWebhook, deleteSiriToken, deleteWebhook, findWebhookByTrigger, getWebhook, getWebhookStats, listSiriTokens, listWebhooks, recordExecution, updateWebhook, validateSiriToken, } from './webhook-config-store.js';
export { checkCooldown, checkRateLimit, clearAllExecutorCaches, clearCooldownCache, clearRateLimitCache, createExecutionLog, executeWebhook, testWebhook, } from './webhook-executor.js';
export { getPlatformInstructions, validatePayloadTemplate, validateVoiceTriggers, validateWebhookInput, validateWebhookName, validateWebhookUrl, validateWebhookUrls, } from './webhook-validator.js';
export type { WebhookValidationInput, WebhookValidationResult } from './webhook-validator.js';
//# sourceMappingURL=index.d.ts.map