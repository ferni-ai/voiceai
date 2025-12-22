/**
 * Tool Manifest Types
 *
 * Type definitions for marketplace tool manifests.
 */

import type {
  LicenseType,
  MarketplaceId,
  PermissionRequest,
  Pricing,
  PublisherId,
  SemVer,
  VerificationInfo,
} from './core-types.js';

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
    short: string; // Max 120 chars
    long: string; // Markdown supported
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
    spdxId?: string; // For OSS (e.g., "MIT", "Apache-2.0")
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

