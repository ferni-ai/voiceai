/**
 * Agent Manifest Types
 *
 * Type definitions for marketplace agent manifests.
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
import type { ToolManifest } from './tool-types.js';

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
      warmth: number; // 0-1
      humorLevel: number; // 0-1
      formality: number; // 0-1
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
      version?: string; // Semver range
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
