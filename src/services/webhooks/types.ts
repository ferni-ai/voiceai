/**
 * Webhook Types
 *
 * Type definitions for the webhook automation system.
 * Supports IFTTT, Zapier, Home Assistant, Siri Shortcuts, and custom webhooks.
 */

// ============================================================================
// Webhook Configuration
// ============================================================================

/** Supported webhook platforms */
export type WebhookPlatform = 'ifttt' | 'zapier' | 'home_assistant' | 'shortcut' | 'custom';

/** HTTP methods for webhooks */
export type WebhookMethod = 'GET' | 'POST' | 'PUT';

/** Webhook configuration stored in Firestore */
export interface WebhookConfig {
  /** Unique identifier */
  id: string;

  /** User-friendly name (e.g., "Bedtime routine") */
  name: string;

  /** Webhook URL (encrypted in storage) */
  url: string;

  /** HTTP method */
  method: WebhookMethod;

  /** Voice trigger phrases (e.g., ["goodnight", "bedtime"]) */
  voiceTriggers: string[];

  /** Platform type for special handling */
  platform?: WebhookPlatform;

  /** Minimum seconds between triggers (rate limiting) */
  cooldownSeconds?: number;

  /** Custom headers to send (encrypted in storage) */
  headers?: Record<string, string>;

  /** Custom payload template (JSON string with {{variable}} placeholders) */
  payloadTemplate?: string;

  /** Whether webhook is active */
  enabled: boolean;

  /** Creation timestamp */
  createdAt: string;

  /** Last modified timestamp */
  updatedAt: string;

  /** Last successful execution */
  lastTriggeredAt?: string;

  /** Number of successful executions */
  successCount: number;

  /** Number of failed executions */
  failureCount: number;
}

/** Input for creating a new webhook */
export interface CreateWebhookInput {
  name: string;
  url: string;
  method?: WebhookMethod;
  voiceTriggers: string[];
  platform?: WebhookPlatform;
  cooldownSeconds?: number;
  headers?: Record<string, string>;
  payloadTemplate?: string;
}

/** Input for updating an existing webhook */
export interface UpdateWebhookInput {
  id: string;
  name?: string;
  url?: string;
  method?: WebhookMethod;
  voiceTriggers?: string[];
  platform?: WebhookPlatform;
  cooldownSeconds?: number;
  headers?: Record<string, string>;
  payloadTemplate?: string;
  enabled?: boolean;
}

// ============================================================================
// Webhook Execution
// ============================================================================

/** Result of webhook execution */
export interface WebhookExecutionResult {
  success: boolean;
  webhookId: string;
  webhookName: string;
  statusCode?: number;
  responseBody?: string;
  error?: string;
  durationMs: number;
  timestamp: string;
}

/** Execution log entry (stored in Firestore for debugging) */
export interface WebhookExecutionLog {
  id: string;
  webhookId: string;
  webhookName: string;
  userId: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  durationMs: number;
  triggeredBy: 'voice' | 'api' | 'test' | 'siri';
  timestamp: string;
}

/** Context passed to webhook payload templates */
export interface WebhookPayloadContext {
  userId: string;
  webhookName: string;
  triggeredBy: 'voice' | 'api' | 'test' | 'siri';
  timestamp: string;
  /** Additional context from voice command */
  voiceContext?: {
    transcript?: string;
    personaId?: string;
  };
}

// ============================================================================
// Siri Token System
// ============================================================================

/** Scopes available for Siri tokens */
export type SiriTokenScope = 'trigger_webhook' | 'send_message';

/** Siri token stored in Firestore (token is hashed) */
export interface SiriToken {
  /** Unique identifier */
  id: string;

  /** User-friendly name (e.g., "iPhone Shortcuts") */
  name: string;

  /** Hashed token value (bcrypt) */
  tokenHash: string;

  /** Partial token for display (e.g., "ferni_****abc123") */
  tokenPreview: string;

  /** Allowed operations */
  scopes: SiriTokenScope[];

  /** Whether token is active */
  enabled: boolean;

  /** Creation timestamp */
  createdAt: string;

  /** Last used timestamp */
  lastUsedAt?: string;

  /** Usage count */
  usageCount: number;
}

/** Input for creating a new Siri token */
export interface CreateSiriTokenInput {
  name: string;
  scopes: SiriTokenScope[];
}

/** Result of creating a Siri token (includes plaintext token ONCE) */
export interface CreateSiriTokenResult {
  id: string;
  name: string;
  /** Plaintext token - only shown once! */
  token: string;
  scopes: SiriTokenScope[];
}

// ============================================================================
// Validation
// ============================================================================

/** URL validation result */
export interface UrlValidationResult {
  valid: boolean;
  error?: string;
  normalizedUrl?: string;
  platform?: WebhookPlatform;
}

/** Validation rules for different platforms */
export interface PlatformValidation {
  platform: WebhookPlatform;
  urlPattern: RegExp;
  requiredMethod?: WebhookMethod;
  description: string;
}

// ============================================================================
// Rate Limiting
// ============================================================================

/** Rate limit configuration */
export interface RateLimitConfig {
  /** Max webhooks per hour per user */
  webhooksPerHour: number;
  /** Max incoming requests per hour per token */
  incomingPerHour: number;
  /** Default cooldown between same webhook triggers */
  defaultCooldownSeconds: number;
}

/** Rate limit status */
export interface RateLimitStatus {
  allowed: boolean;
  remaining: number;
  resetAt: string;
  reason?: string;
}

// ============================================================================
// Service Results
// ============================================================================

/** Generic service result */
export interface WebhookServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/** List webhooks result */
export interface ListWebhooksResult {
  webhooks: WebhookConfig[];
  total: number;
}

/** Webhook stats for a user */
export interface WebhookStats {
  totalWebhooks: number;
  enabledWebhooks: number;
  totalExecutions: number;
  successRate: number;
  lastExecutionAt?: string;
}
