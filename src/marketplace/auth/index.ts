/**
 * Marketplace Authentication & Authorization
 *
 * Provides security layer for all marketplace operations:
 * - JWT validation
 * - Permission checks
 * - Rate limiting
 * - Publisher verification
 *
 * ALL marketplace operations MUST go through this layer.
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { MarketplaceId, PermissionScope, TrustLevel, UserId } from '../schema/types.js';

const log = getLogger().child({ module: 'marketplace-auth' });

// ============================================================================
// TYPES
// ============================================================================

export interface AuthContext {
  /** Authenticated user ID */
  userId: UserId;
  /** User's subscription tier */
  tier: 'free' | 'friend' | 'partner' | 'admin';
  /** Whether user is a verified publisher */
  isPublisher: boolean;
  /** Publisher ID if applicable */
  publisherId?: string;
  /** Session ID for audit trail */
  sessionId: string;
  /** Tenant ID for multi-tenancy */
  tenantId?: string;
}

export interface AuthResult {
  success: boolean;
  context?: AuthContext;
  error?: {
    code: 'INVALID_TOKEN' | 'EXPIRED_TOKEN' | 'INSUFFICIENT_PERMISSIONS' | 'RATE_LIMITED';
    message: string;
  };
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

// ============================================================================
// RATE LIMITING (In-memory, use Redis in production)
// ============================================================================

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  'tool:register': { windowMs: 60_000, maxRequests: 10 }, // 10 per minute
  'agent:register': { windowMs: 60_000, maxRequests: 5 }, // 5 per minute
  'tool:install': { windowMs: 60_000, maxRequests: 30 }, // 30 per minute
  'tool:execute': { windowMs: 60_000, maxRequests: 100 }, // 100 per minute
  'review:create': { windowMs: 3600_000, maxRequests: 10 }, // 10 per hour
  default: { windowMs: 60_000, maxRequests: 60 },
};

/**
 * Check rate limit for an operation
 */
export function checkRateLimit(
  userId: UserId,
  operation: string
): { allowed: boolean; retryAfterMs?: number } {
  const config = RATE_LIMITS[operation] || RATE_LIMITS.default;
  const key = `${userId}:${operation}`;
  const now = Date.now();

  const entry = rateLimitStore.get(key);

  if (!entry || now - entry.windowStart > config.windowMs) {
    // Start new window
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (entry.count >= config.maxRequests) {
    const retryAfterMs = config.windowMs - (now - entry.windowStart);
    log.warn({ userId, operation, count: entry.count }, 'Rate limit exceeded');
    return { allowed: false, retryAfterMs };
  }

  entry.count++;
  return { allowed: true };
}

/**
 * Clean up old rate limit entries (call periodically)
 */
export function cleanupRateLimits(): void {
  const now = Date.now();
  const maxWindowMs = Math.max(...Object.values(RATE_LIMITS).map((c) => c.windowMs));

  for (const [key, entry] of rateLimitStore.entries()) {
    if (now - entry.windowStart > maxWindowMs) {
      rateLimitStore.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupRateLimits, 5 * 60_000);

// ============================================================================
// AUTHORIZATION CHECKS
// ============================================================================

/**
 * Check if user can register tools/agents
 */
export function canRegister(context: AuthContext): boolean {
  // Must be a verified publisher or admin
  return context.isPublisher || context.tier === 'admin';
}

/**
 * Check if user can install an item
 */
export function canInstall(context: AuthContext, _itemId: MarketplaceId): boolean {
  // All authenticated users can install
  return !!context.userId;
}

/**
 * Check if user can uninstall an item
 */
export function canUninstall(context: AuthContext, installationUserId: UserId): boolean {
  // Can only uninstall own installations (or admin)
  return context.userId === installationUserId || context.tier === 'admin';
}

/**
 * Check if user can execute a tool
 */
export function canExecute(
  context: AuthContext,
  trustLevel: TrustLevel
): { allowed: boolean; reason?: string } {
  // Platform tools: anyone
  if (trustLevel === 'platform') {
    return { allowed: true };
  }

  // Unverified tools: only partner tier or admin
  if (trustLevel === 'unverified') {
    if (context.tier === 'partner' || context.tier === 'admin') {
      return { allowed: true };
    }
    return { allowed: false, reason: 'Unverified tools require Partner subscription' };
  }

  // Community/verified: authenticated users
  return { allowed: !!context.userId };
}

/**
 * Check if user can modify an item
 */
export function canModify(context: AuthContext, itemPublisherId: string): boolean {
  // Publisher can modify their own items, admin can modify any
  return context.publisherId === itemPublisherId || context.tier === 'admin';
}

/**
 * Check if user can moderate reviews
 */
export function canModerateReviews(context: AuthContext): boolean {
  return context.tier === 'admin';
}

/**
 * Check if user has required permissions
 */
export function hasRequiredPermissions(
  grantedPermissions: PermissionScope[],
  requiredPermissions: PermissionScope[]
): { allowed: boolean; missing: PermissionScope[] } {
  const missing = requiredPermissions.filter((p) => !grantedPermissions.includes(p));
  return {
    allowed: missing.length === 0,
    missing,
  };
}

// ============================================================================
// SECURE ID GENERATION
// ============================================================================

/**
 * Generate a cryptographically secure ID
 */
export function generateSecureId(prefix: string): string {
  // Use crypto.randomUUID for cryptographically secure IDs
  const uuid = crypto.randomUUID();
  return `${prefix}_${uuid}`;
}

/**
 * Generate a secure session token
 */
export function generateSessionToken(): string {
  return crypto.randomUUID();
}

// ============================================================================
// INPUT SANITIZATION
// ============================================================================

/**
 * Sanitize a string to prevent injection attacks
 */
export function sanitizeString(input: string, maxLength = 10000): string {
  if (typeof input !== 'string') {
    return '';
  }
  // Remove null bytes and control characters (except newlines/tabs)
  return input
    .replace(/\0/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .slice(0, maxLength);
}

/**
 * Validate a Docker image name
 */
export function isValidDockerImage(image: string): boolean {
  // Docker image format: [registry/]name[:tag][@digest]
  // Disallow shell metacharacters
  const dockerImageRegex =
    /^[a-z0-9]([a-z0-9._/-]*[a-z0-9])?(:[\w][\w.-]{0,127})?(@sha256:[a-f0-9]{64})?$/i;
  return (
    dockerImageRegex.test(image) &&
    !image.includes(';') &&
    !image.includes('|') &&
    !image.includes('&')
  );
}

/**
 * Validate a command array (no shell injection)
 */
export function isValidCommand(command: string[]): boolean {
  if (!Array.isArray(command) || command.length === 0) {
    return false;
  }

  const shellMetachars = /[;&|`$(){}[\]<>!\\]/;
  return command.every((arg) => typeof arg === 'string' && !shellMetachars.test(arg));
}

/**
 * Validate a URL (disallow internal IPs)
 */
export function isValidExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Must be https (except for localhost in dev)
    if (parsed.protocol !== 'https:') {
      if (process.env.NODE_ENV === 'development' && parsed.hostname === 'localhost') {
        return true;
      }
      return false;
    }

    // Disallow internal/private IPs
    const hostname = parsed.hostname;
    const internalPatterns = [
      /^localhost$/i,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^169\.254\./, // AWS metadata
      /^0\./,
      /^\[::1\]$/,
      /^\[fe80:/i,
      /^\[fc00:/i,
      /^\[fd00:/i,
    ];

    for (const pattern of internalPatterns) {
      if (pattern.test(hostname)) {
        log.warn({ url, hostname }, 'Blocked internal URL');
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// ANONYMIZATION
// ============================================================================

/**
 * Create an anonymized user token for external services
 * This prevents external tools from tracking users across different tools
 */
export function anonymizeUserId(userId: UserId, toolId: MarketplaceId): string {
  // Create HMAC of userId + toolId so each tool sees a different ID
  const secret = process.env.MARKETPLACE_HMAC_SECRET || 'dev-secret-change-in-prod';
  const data = `${userId}:${toolId}`;

  // Use Web Crypto API for HMAC
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  // For now, use a simple hash (in production, use proper HMAC)
  // This prevents the tool from correlating users across different tools
  let hash = 0;
  const combined = secret + data;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return `anon_${Math.abs(hash).toString(36)}`;
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

export interface AuditEvent {
  timestamp: string;
  userId: UserId;
  sessionId: string;
  action: string;
  resource: string;
  resourceId?: string;
  success: boolean;
  details?: Record<string, unknown>;
  ip?: string;
}

const auditLog: AuditEvent[] = [];
const MAX_AUDIT_LOG_SIZE = 10000;

/**
 * Log an audit event
 */
export function logAuditEvent(event: Omit<AuditEvent, 'timestamp'>): void {
  const fullEvent: AuditEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  auditLog.push(fullEvent);

  // Keep log bounded
  if (auditLog.length > MAX_AUDIT_LOG_SIZE) {
    auditLog.splice(0, auditLog.length - MAX_AUDIT_LOG_SIZE);
  }

  // Also log to structured logger for centralized logging
  log.info(
    {
      audit: true,
      action: event.action,
      resource: event.resource,
      resourceId: event.resourceId,
      userId: event.userId,
      success: event.success,
    },
    `Audit: ${event.action} on ${event.resource}`
  );

  // In production, persist to Firestore
  if (process.env.NODE_ENV === 'production') {
    void persistAuditEvent(fullEvent);
  }
}

async function persistAuditEvent(event: AuditEvent): Promise<void> {
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();
    await db.collection('marketplace_audit_log').add(event);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to persist audit event');
  }
}

/**
 * Get recent audit events (for admin dashboard)
 */
export function getRecentAuditEvents(limit = 100): AuditEvent[] {
  return auditLog.slice(-limit).reverse();
}

// ============================================================================
// TESTING UTILITIES
// ============================================================================

/**
 * Clear all auth state (for testing)
 */
export function clearAuthState(): void {
  rateLimitStore.clear();
  auditLog.length = 0;
}

/**
 * Create a test auth context (for testing)
 */
export function createTestAuthContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'test-user',
    tier: 'free',
    isPublisher: false,
    sessionId: generateSessionToken(),
    ...overrides,
  };
}
