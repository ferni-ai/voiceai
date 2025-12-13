/**
 * Marketplace Schema Types
 *
 * Comprehensive type definitions for the Ferni Agent Marketplace.
 * Covers agents, tools, permissions, installations, and multi-tenant support.
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
  | 'free'           // Free forever
  | 'freemium'       // Free tier + paid features
  | 'premium'        // Paid only
  | 'enterprise'     // Custom enterprise pricing
  | 'open-source';   // OSS license (MIT, Apache, etc.)

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
  | 'platform'       // Built by Ferni team, full trust
  | 'verified'       // Third-party, code-reviewed & signed
  | 'community'      // Community submitted, basic checks
  | 'unverified';    // No verification, sandbox-only

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
  | 'user:profile:read'        // Read user profile (name, preferences)
  | 'user:profile:write'       // Update user profile
  | 'user:memory:read'         // Read user memories
  | 'user:memory:write'        // Create/update memories
  | 'user:memory:delete'       // Delete memories
  | 'user:calendar:read'       // Read calendar events
  | 'user:calendar:write'      // Create/update calendar events
  | 'user:contacts:read'       // Read contacts
  | 'user:contacts:write'      // Create/update contacts
  | 'user:habits:read'         // Read habit data
  | 'user:habits:write'        // Create/update habits
  | 'user:finance:read'        // Read financial data (linked accounts)
  | 'user:finance:write'       // Transactions, budgets
  | 'user:health:read'         // Read health metrics
  | 'user:health:write'        // Write health data

  // Communication
  | 'communication:email:send' // Send emails on behalf of user
  | 'communication:sms:send'   // Send SMS messages
  | 'communication:notify'     // Push notifications

  // External services
  | 'external:http:read'       // Make HTTP GET requests
  | 'external:http:write'      // Make HTTP POST/PUT/DELETE
  | 'external:webhook:receive' // Receive webhooks

  // Platform features
  | 'platform:tools:invoke'    // Invoke other tools
  | 'platform:agents:handoff'  // Hand off to other agents
  | 'platform:billing:read'    // Read billing/subscription info

  // Storage
  | 'storage:files:read'       // Read user files
  | 'storage:files:write'      // Write user files
  | 'storage:blob:read'        // Read blob storage
  | 'storage:blob:write';      // Write blob storage

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

// ============================================================================
// TOOL MANIFEST
// ============================================================================

export interface ToolManifest {
  /** Manifest schema version */
  manifestVersion: '1.0.0';

  /** Unique tool identifier (e.g., "weather-api", "stock-lookup") */
  id: MarketplaceId;

  /** Human-readable name */
  name: string;

  /** Tool version (semver) */
  version: SemVer;

  /** Publisher info */
  publisher: {
    id: PublisherId;
    name: string;
    email?: string;
    website?: string;
    verified: boolean;
  };

  /** Tool description for marketplace */
  description: {
    short: string;  // Max 120 chars
    long: string;   // Markdown supported
    changelog?: string;
  };

  /** Tool categorization */
  metadata: {
    category: string;
    tags: string[];
    icon?: string;
    screenshots?: string[];
    demoUrl?: string;
    docsUrl?: string;
    supportUrl?: string;
  };

  /** License and pricing */
  licensing: {
    type: LicenseType;
    spdxId?: string;  // For OSS (e.g., "MIT", "Apache-2.0")
    pricing?: Pricing;
  };

  /** Trust and verification */
  verification: VerificationInfo;

  /** Required permissions */
  permissions: {
    required: PermissionRequest[];
    optional: PermissionRequest[];
  };

  /** Execution configuration */
  execution: {
    /** How should this tool be executed? */
    mode: 'platform' | 'isolated' | 'sandbox';

    /** Execution runtime */
    runtime: {
      /** Runtime environment */
      type: 'node' | 'deno' | 'wasm' | 'docker' | 'http';

      /** Runtime version constraints */
      version?: string;

      /** For HTTP/gRPC tools: endpoint URL */
      endpoint?: string;

      /** Entry point for code-based tools */
      entrypoint?: string;

      /** Environment variables the tool needs */
      env?: Array<{
        name: string;
        description: string;
        required: boolean;
        secret: boolean;
      }>;
    };

    /** Resource limits */
    limits: {
      /** Max execution time in ms */
      timeoutMs: number;
      /** Max memory in MB */
      memoryMb?: number;
      /** Max CPU (0-1 scale, 1 = 1 core) */
      cpuLimit?: number;
      /** Network access allowed */
      networkAccess: boolean;
      /** Filesystem access allowed */
      filesystemAccess: boolean;
    };

    /** Retry configuration */
    retry?: {
      maxAttempts: number;
      backoffMs: number;
      retryableErrors?: string[];
    };
  };

  /** Tool interface definition */
  interface: {
    /** LLM description for tool selection */
    llmDescription: string;

    /** JSON Schema for parameters */
    parametersSchema: Record<string, unknown>;

    /** JSON Schema for response */
    responseSchema?: Record<string, unknown>;

    /** Example invocations */
    examples?: Array<{
      name: string;
      description: string;
      parameters: Record<string, unknown>;
      expectedResponse?: string;
    }>;
  };

  /** Compatibility */
  compatibility: {
    /** Minimum platform version */
    minPlatformVersion: SemVer;

    /** Maximum platform version (if applicable) */
    maxPlatformVersion?: SemVer;

    /** Compatible agents (empty = all) */
    compatibleAgents?: MarketplaceId[];

    /** Required platform features */
    requiredFeatures?: string[];
  };

  /** Dependencies on other marketplace items */
  dependencies?: {
    tools?: Array<{ id: MarketplaceId; version: string }>;
    agents?: Array<{ id: MarketplaceId; version: string }>;
  };
}

// ============================================================================
// AGENT MANIFEST (EXTENDS PERSONA)
// ============================================================================

export interface AgentManifest {
  /** Manifest schema version */
  manifestVersion: '1.0.0';

  /** Unique agent identifier */
  id: MarketplaceId;

  /** Human-readable name */
  name: string;

  /** Display name (can include emoji, tagline) */
  displayName: string;

  /** Agent version */
  version: SemVer;

  /** Publisher info */
  publisher: {
    id: PublisherId;
    name: string;
    email?: string;
    website?: string;
    verified: boolean;
  };

  /** Description */
  description: {
    short: string;
    long: string;
    changelog?: string;
  };

  /** Marketplace metadata */
  metadata: {
    category: string;
    tags: string[];
    icon?: string;
    colors?: {
      primary: string;
      secondary: string;
      gradient?: string;
      glow?: string;
    };
    screenshots?: string[];
    demoUrl?: string;
    docsUrl?: string;
  };

  /** Licensing */
  licensing: {
    type: LicenseType;
    pricing?: Pricing;
  };

  /** Trust and verification */
  verification: VerificationInfo;

  /** Agent-specific permissions */
  permissions: {
    required: PermissionRequest[];
    optional: PermissionRequest[];
  };

  /** Persona configuration */
  persona: {
    /** Voice configuration */
    voice: {
      provider: 'cartesia' | 'elevenlabs' | 'custom';
      voiceId: string;
      voiceSettings?: {
        speed?: number;
        pitch?: number;
        emotion?: string;
      };
    };

    /** Personality traits */
    personality: {
      warmth: number;       // 0-1
      humorLevel: number;   // 0-1
      formality: number;    // 0-1
      traits: string[];
    };

    /** Cognitive profile */
    cognitive: {
      profile: 'narrative' | 'analytical' | 'systematic' | 'empathetic' | 'pragmatic' | 'intuitive';
      customProfile?: Record<string, unknown>;
    };

    /** Knowledge domains */
    knowledge: {
      domains: string[];
      expertise: string[];
      outOfScopeTopics: string[];
    };
  };

  /** Tools this agent uses */
  tools: {
    /** Platform tools (built-in) */
    platform: string[];

    /** Marketplace tools (by ID) */
    marketplace: Array<{
      id: MarketplaceId;
      version?: string;  // Semver range
      required: boolean;
    }>;

    /** Custom tools bundled with agent */
    custom?: Array<{
      id: string;
      manifest: ToolManifest;
    }>;
  };

  /** MCP server configuration */
  mcpServers?: Array<{
    name: string;
    transport: 'stdio' | 'http' | 'websocket';
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
  }>;

  /** Agent behavior configuration */
  behavior: {
    /** Greeting style */
    greetings?: {
      returning: string[];
      new: string[];
      timeOfDay?: Record<string, string[]>;
    };

    /** Backchannel phrases */
    backchannels?: string[];

    /** Transition style for handoffs */
    handoffStyle?: 'warm' | 'standard' | 'dramatic' | 'subtle';

    /** When to hand off to other agents */
    handoffTriggers?: Array<{
      condition: string;
      targetAgent: string;
      reason: string;
    }>;
  };

  /** Compatibility */
  compatibility: {
    minPlatformVersion: SemVer;
    maxPlatformVersion?: SemVer;
    requiredFeatures?: string[];
  };
}

// ============================================================================
// INSTALLATION & USER DATA
// ============================================================================

export interface Installation {
  /** Installation ID */
  id: string;

  /** What was installed */
  itemType: 'agent' | 'tool';
  itemId: MarketplaceId;
  itemVersion: SemVer;

  /** Who installed it */
  userId: UserId;
  tenantId?: TenantId;

  /** Installation metadata */
  installedAt: string;
  installedBy: UserId;
  installSource: 'marketplace' | 'cli' | 'api' | 'bundle';

  /** Current status */
  status: 'active' | 'disabled' | 'suspended' | 'uninstalled';
  statusReason?: string;
  statusChangedAt?: string;

  /** Permission grants */
  permissions: PermissionGrant[];

  /** Configuration overrides */
  config?: Record<string, unknown>;

  /** Usage tracking */
  usage: {
    lastUsedAt?: string;
    totalExecutions: number;
    totalExecutionTimeMs: number;
    errorCount: number;
    lastError?: {
      code: string;
      message: string;
      occurredAt: string;
    };
  };

  /** Billing info */
  billing?: {
    subscriptionId?: string;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
    usageThisPeriod?: number;
  };
}

// ============================================================================
// EXECUTION AUDIT
// ============================================================================

export interface ToolExecution {
  /** Execution ID */
  id: string;

  /** What was executed */
  toolId: MarketplaceId;
  toolVersion: SemVer;
  installationId: string;

  /** Who executed */
  userId: UserId;
  sessionId: string;
  agentId?: string;

  /** Tenant context */
  tenantId?: TenantId;

  /** Execution details */
  executedAt: string;
  durationMs: number;

  /** Status */
  status: 'success' | 'failure' | 'timeout' | 'permission_denied' | 'rate_limited';
  errorCode?: string;
  errorMessage?: string;

  /** Resource usage */
  resources: {
    memoryUsedMb?: number;
    cpuTimeMs?: number;
    networkBytesSent?: number;
    networkBytesReceived?: number;
  };

  /** Permissions used */
  permissionsUsed: PermissionScope[];

  /** For debugging (redacted in production) */
  debug?: {
    parametersHash: string;  // Hash, not actual values
    responseHash: string;
    traceId?: string;
  };
}

// ============================================================================
// MARKETPLACE LISTING
// ============================================================================

export interface MarketplaceListing {
  /** Item info */
  id: MarketplaceId;
  type: 'agent' | 'tool';
  name: string;
  displayName: string;
  version: SemVer;

  /** Publisher */
  publisher: {
    id: PublisherId;
    name: string;
    verified: boolean;
  };

  /** Description */
  description: {
    short: string;
    long: string;
  };

  /** Metadata */
  metadata: {
    category: string;
    tags: string[];
    icon?: string;
    colors?: {
      primary: string;
      secondary?: string;
    };
  };

  /** Trust level */
  trustLevel: TrustLevel;
  verified: boolean;

  /** Licensing */
  license: LicenseType;
  pricing?: Pricing;

  /** Stats */
  stats: {
    downloads: number;
    activeInstalls: number;
    rating: number;
    reviewCount: number;
    weeklyGrowth?: number;
  };

  /** Timestamps */
  publishedAt: string;
  updatedAt: string;

  /** Featured/promoted */
  featured?: boolean;
  featuredUntil?: string;
}

// ============================================================================
// FIRESTORE COLLECTION STRUCTURE
// ============================================================================

/**
 * Firestore Collections:
 *
 * /marketplace_listings/{listingId}           - Public listing data
 * /marketplace_manifests/{manifestId}         - Full manifest (agent or tool)
 * /marketplace_publishers/{publisherId}       - Publisher profiles
 * /marketplace_reviews/{reviewId}             - User reviews
 *
 * /user_installations/{installationId}        - User installations
 *   - Index: userId + itemId (for lookup)
 *   - Index: tenantId + itemId (for org installs)
 *
 * /tool_executions/{executionId}              - Audit log (TTL: 90 days)
 *   - Index: userId + toolId + executedAt
 *   - Index: tenantId + toolId + executedAt
 *
 * /tenant_configs/{tenantId}                  - Tenant-specific config
 *   - Allowed tools/agents
 *   - Custom permissions
 *   - Billing settings
 */
