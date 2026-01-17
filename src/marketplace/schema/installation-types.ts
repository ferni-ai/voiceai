/**
 * Installation & Execution Types
 *
 * Type definitions for marketplace installations and tool executions.
 */

import type {
  MarketplaceId,
  PermissionGrant,
  PermissionScope,
  SemVer,
  TenantId,
  UserId,
} from './core-types.js';

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
    parametersHash: string; // Hash, not actual values
    responseHash: string;
    traceId?: string;
  };
}
