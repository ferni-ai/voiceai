/**
 * Core Marketplace Types
 *
 * Foundational type definitions including identifiers, licensing,
 * trust levels, and permissions.
 */

// ============================================================================
// CORE IDENTIFIERS
// ============================================================================

/** Unique identifier for marketplace entities */
export type MarketplaceId = string;

/** Publisher/developer identifier */
export type PublisherId = string;

/** Tenant (organization) identifier */
export type TenantId = string;

/** User identifier */
export type UserId = string;

/** Semantic version string (e.g., "1.2.3") */
export type SemVer = string;

// ============================================================================
// LICENSE & PRICING
// ============================================================================

export type LicenseType =
  | 'free' // Free forever
  | 'freemium' // Free tier + paid features
  | 'premium' // Paid only
  | 'enterprise' // Custom enterprise pricing
  | 'open-source'; // OSS license (MIT, Apache, etc.)

export interface Pricing {
  /** Pricing model */
  model: 'free' | 'one-time' | 'subscription' | 'usage-based' | 'custom';

  /** Price in cents (if applicable) */
  priceInCents?: number;

  /** Billing interval for subscriptions */
  interval?: 'monthly' | 'yearly';

  /** Free tier limits */
  freeTierLimits?: {
    /** Max executions per month */
    monthlyExecutions?: number;
    /** Max users (for multi-seat) */
    maxUsers?: number;
    /** Feature restrictions */
    restrictedFeatures?: string[];
  };
}

// ============================================================================
// TRUST & VERIFICATION
// ============================================================================

export type TrustLevel =
  | 'platform' // Built by Ferni team, full trust
  | 'verified' // Third-party, code-reviewed & signed
  | 'community' // Community submitted, basic checks
  | 'unverified'; // No verification, sandbox-only

export interface VerificationInfo {
  /** Trust level determines execution environment */
  trustLevel: TrustLevel;

  /** Verified by Ferni team */
  verified: boolean;
  verifiedAt?: string; // ISO timestamp
  verifiedBy?: string; // Reviewer ID

  /** Code signing info */
  signature?: {
    algorithm: 'ed25519' | 'rsa-sha256';
    publicKey: string;
    signature: string;
    signedAt: string;
  };

  /** Security audit info */
  securityAudit?: {
    auditor: string;
    auditedAt: string;
    reportUrl?: string;
    findings: 'none' | 'low' | 'medium' | 'high';
  };
}

// ============================================================================
// PERMISSIONS MODEL
// ============================================================================

/**
 * Permission scopes that tools/agents can request.
 * Inspired by OAuth scopes and mobile app permissions.
 */
export type PermissionScope =
  // User data access
  | 'user:profile:read' // Read user profile (name, preferences)
  | 'user:profile:write' // Update user profile
  | 'user:memory:read' // Read user memories
  | 'user:memory:write' // Create/update memories
  | 'user:memory:delete' // Delete memories
  | 'user:calendar:read' // Read calendar events
  | 'user:calendar:write' // Create/update calendar events
  | 'user:contacts:read' // Read contacts
  | 'user:contacts:write' // Create/update contacts
  | 'user:habits:read' // Read habit data
  | 'user:habits:write' // Create/update habits
  | 'user:finance:read' // Read financial data (linked accounts)
  | 'user:finance:write' // Transactions, budgets
  | 'user:health:read' // Read health metrics
  | 'user:health:write' // Write health data

  // Communication
  | 'communication:email:send' // Send emails on behalf of user
  | 'communication:sms:send' // Send SMS messages
  | 'communication:notify' // Push notifications

  // External services
  | 'external:http:read' // Make HTTP GET requests
  | 'external:http:write' // Make HTTP POST/PUT/DELETE
  | 'external:webhook:receive' // Receive webhooks

  // Platform features
  | 'platform:tools:invoke' // Invoke other tools
  | 'platform:agents:handoff' // Hand off to other agents
  | 'platform:billing:read' // Read billing/subscription info

  // Storage
  | 'storage:files:read' // Read user files
  | 'storage:files:write' // Write user files
  | 'storage:blob:read' // Read blob storage
  | 'storage:blob:write'; // Write blob storage

export interface PermissionRequest {
  /** The scope being requested */
  scope: PermissionScope;

  /** Human-readable reason for the permission */
  reason: string;

  /** Is this permission required for basic functionality? */
  required: boolean;

  /** When does this permission get used? */
  usageContext?: string;
}

export interface PermissionGrant {
  scope: PermissionScope;
  grantedAt: string;
  grantedBy: UserId;
  expiresAt?: string;
  constraints?: {
    /** Rate limit per hour */
    rateLimit?: number;
    /** Specific resource IDs allowed */
    resourceIds?: string[];
    /** Only during specific hours */
    timeWindow?: { start: string; end: string };
  };
}

