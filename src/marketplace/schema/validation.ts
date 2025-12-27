/**
 * Marketplace Manifest Validation
 *
 * Zod schemas for validating tool and agent manifests.
 * All manifests MUST be validated before being registered.
 *
 * Security considerations:
 * - URLs are validated to prevent SSRF
 * - String lengths are limited to prevent DoS
 * - Enum values are strictly enforced
 */

import { z } from 'zod';
import { isValidExternalUrl } from '../auth/index.js';

// ============================================================================
// COMMON SCHEMAS
// ============================================================================

/** Marketplace ID: alphanumeric with hyphens, 3-64 chars */
export const MarketplaceIdSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Must be lowercase alphanumeric with hyphens');

/** Publisher ID */
export const PublisherIdSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9_]+$/, 'Must be lowercase alphanumeric with underscores');

/** User ID */
export const UserIdSchema = z.string().min(1).max(128);

/** Tenant ID */
export const TenantIdSchema = z.string().min(1).max(128).optional();

/** Semantic version */
export const SemVerSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/, 'Must be valid semver');

/** Safe URL (external only, https) */
export const SafeUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((url) => isValidExternalUrl(url), {
    message: 'URL must be external HTTPS (no internal IPs)',
  });

/** Optional safe URL */
export const OptionalSafeUrlSchema = SafeUrlSchema.optional();

/** Safe string (limited length, no control chars) */
export function SafeStringSchema(maxLength: number) {
  return z
    .string()
    .max(maxLength)
    .refine((s) => !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(s), {
      message: 'Contains invalid control characters',
    });
}

/** Short description (max 200 chars) */
export const ShortDescriptionSchema = SafeStringSchema(200);

/** Long description (max 10000 chars, markdown allowed) */
export const LongDescriptionSchema = SafeStringSchema(10000);

// ============================================================================
// ENUMS
// ============================================================================

export const LicenseTypeSchema = z.enum([
  'free',
  'freemium',
  'premium',
  'enterprise',
  'open-source',
]);

export const TrustLevelSchema = z.enum(['platform', 'verified', 'community', 'unverified']);

export const PricingModelSchema = z.enum([
  'free',
  'one-time',
  'subscription',
  'usage-based',
  'custom',
]);

export const RuntimeTypeSchema = z.enum(['node', 'deno', 'wasm', 'docker', 'http']);

export const ExecutionModeSchema = z.enum(['platform', 'isolated', 'sandbox']);

export const PermissionScopeSchema = z.enum([
  'user:profile:read',
  'user:profile:write',
  'user:memory:read',
  'user:memory:write',
  'user:memory:delete',
  'user:calendar:read',
  'user:calendar:write',
  'user:contacts:read',
  'user:contacts:write',
  'user:habits:read',
  'user:habits:write',
  'user:finance:read',
  'user:finance:write',
  'user:health:read',
  'user:health:write',
  'communication:email:send',
  'communication:sms:send',
  'communication:notify',
  'external:http:read',
  'external:http:write',
  'external:webhook:receive',
  'platform:tools:invoke',
  'platform:agents:handoff',
  'platform:billing:read',
  'storage:files:read',
  'storage:files:write',
  'storage:blob:read',
  'storage:blob:write',
]);

// ============================================================================
// COMPONENT SCHEMAS
// ============================================================================

export const PublisherSchema = z.object({
  id: PublisherIdSchema,
  name: SafeStringSchema(100),
  email: z.string().email().max(255).optional(),
  website: OptionalSafeUrlSchema,
  verified: z.boolean(),
});

export const DescriptionSchema = z.object({
  short: ShortDescriptionSchema,
  long: LongDescriptionSchema,
  changelog: SafeStringSchema(50000).optional(),
});

export const MetadataSchema = z.object({
  category: SafeStringSchema(50),
  tags: z.array(SafeStringSchema(30)).max(20),
  icon: SafeStringSchema(10).optional(), // emoji or short icon code
  screenshots: z.array(SafeUrlSchema).max(10).optional(),
  demoUrl: OptionalSafeUrlSchema,
  docsUrl: OptionalSafeUrlSchema,
  supportUrl: OptionalSafeUrlSchema,
});

export const AgentMetadataSchema = MetadataSchema.extend({
  colors: z
    .object({
      primary: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be hex color'),
      secondary: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be hex color'),
      gradient: z.string().max(200).optional(),
      glow: z.string().max(200).optional(),
    })
    .optional(),
});

export const PricingSchema = z.object({
  model: PricingModelSchema,
  priceInCents: z.number().int().min(0).max(1_000_000).optional(),
  interval: z.enum(['monthly', 'yearly']).optional(),
  freeTierLimits: z
    .object({
      monthlyExecutions: z.number().int().min(0).max(100_000).optional(),
      maxUsers: z.number().int().min(0).max(1000).optional(),
      restrictedFeatures: z.array(SafeStringSchema(50)).max(50).optional(),
    })
    .optional(),
});

export const LicensingSchema = z.object({
  type: LicenseTypeSchema,
  spdxId: SafeStringSchema(50).optional(),
  pricing: PricingSchema.optional(),
});

export const VerificationSchema = z.object({
  trustLevel: TrustLevelSchema,
  verified: z.boolean(),
  verifiedAt: z.string().datetime().optional(),
  verifiedBy: SafeStringSchema(100).optional(),
  signature: z
    .object({
      algorithm: z.enum(['ed25519', 'rsa-sha256']),
      publicKey: SafeStringSchema(1000),
      signature: SafeStringSchema(1000),
      signedAt: z.string().datetime(),
    })
    .optional(),
  securityAudit: z
    .object({
      auditor: SafeStringSchema(100),
      auditedAt: z.string().datetime(),
      reportUrl: OptionalSafeUrlSchema,
      findings: z.enum(['none', 'low', 'medium', 'high']),
    })
    .optional(),
});

export const PermissionRequestSchema = z.object({
  scope: PermissionScopeSchema,
  reason: SafeStringSchema(500),
  required: z.boolean(),
  usageContext: SafeStringSchema(500).optional(),
});

export const PermissionsSchema = z.object({
  required: z.array(PermissionRequestSchema).max(20),
  optional: z.array(PermissionRequestSchema).max(20),
});

export const EnvConfigSchema = z.object({
  name: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]*$/, 'Must be uppercase with underscores'),
  description: SafeStringSchema(500),
  required: z.boolean(),
  secret: z.boolean(),
});

export const RuntimeSchema = z.object({
  type: RuntimeTypeSchema,
  version: SafeStringSchema(20).optional(),
  endpoint: SafeUrlSchema.optional(),
  entrypoint: SafeStringSchema(500).optional(),
  env: z.array(EnvConfigSchema).max(20).optional(),
});

export const LimitsSchema = z.object({
  timeoutMs: z.number().int().min(100).max(300_000), // 100ms to 5min
  memoryMb: z.number().int().min(16).max(4096).optional(),
  cpuLimit: z.number().min(0).max(4).optional(),
  networkAccess: z.boolean(),
  filesystemAccess: z.boolean(),
});

export const RetrySchema = z.object({
  maxAttempts: z.number().int().min(1).max(5),
  backoffMs: z.number().int().min(100).max(60_000),
  retryableErrors: z.array(SafeStringSchema(50)).max(20).optional(),
});

export const ExecutionSchema = z.object({
  mode: ExecutionModeSchema,
  runtime: RuntimeSchema,
  limits: LimitsSchema,
  retry: RetrySchema.optional(),
});

export const ParameterSchemaSchema = z.record(z.string(), z.unknown()); // JSON Schema

export const ExampleSchema = z.object({
  name: SafeStringSchema(100),
  description: SafeStringSchema(500),
  parameters: z.record(z.string(), z.unknown()),
  expectedResponse: SafeStringSchema(1000).optional(),
});

export const InterfaceSchema = z.object({
  llmDescription: SafeStringSchema(2000),
  parametersSchema: ParameterSchemaSchema,
  responseSchema: ParameterSchemaSchema.optional(),
  examples: z.array(ExampleSchema).max(10).optional(),
});

export const CompatibilitySchema = z.object({
  minPlatformVersion: SemVerSchema,
  maxPlatformVersion: SemVerSchema.optional(),
  compatibleAgents: z.array(MarketplaceIdSchema).max(100).optional(),
  requiredFeatures: z.array(SafeStringSchema(50)).max(20).optional(),
});

export const DependencySchema = z.object({
  id: MarketplaceIdSchema,
  version: SafeStringSchema(50),
});

export const DependenciesSchema = z.object({
  tools: z.array(DependencySchema).max(20).optional(),
  agents: z.array(DependencySchema).max(20).optional(),
});

// ============================================================================
// TOOL MANIFEST SCHEMA
// ============================================================================

export const ToolManifestSchema = z.object({
  manifestVersion: z.literal('1.0.0'),
  id: MarketplaceIdSchema,
  name: SafeStringSchema(100),
  version: SemVerSchema,
  publisher: PublisherSchema,
  description: DescriptionSchema,
  metadata: MetadataSchema,
  licensing: LicensingSchema,
  verification: VerificationSchema,
  permissions: PermissionsSchema,
  execution: ExecutionSchema,
  interface: InterfaceSchema,
  compatibility: CompatibilitySchema,
  dependencies: DependenciesSchema.optional(),
});

// ============================================================================
// AGENT MANIFEST SCHEMA
// ============================================================================

export const VoiceSchema = z.object({
  provider: z.enum(['cartesia', 'elevenlabs', 'custom']),
  voiceId: SafeStringSchema(100),
  voiceSettings: z
    .object({
      speed: z.number().min(0.5).max(2).optional(),
      pitch: z.number().min(-1).max(1).optional(),
      emotion: SafeStringSchema(50).optional(),
    })
    .optional(),
});

export const PersonalitySchema = z.object({
  warmth: z.number().min(0).max(1),
  humorLevel: z.number().min(0).max(1),
  formality: z.number().min(0).max(1),
  traits: z.array(SafeStringSchema(50)).max(20),
});

export const CognitiveSchema = z.object({
  profile: z.enum([
    'narrative',
    'analytical',
    'systematic',
    'empathetic',
    'pragmatic',
    'intuitive',
  ]),
  customProfile: z.record(z.string(), z.unknown()).optional(),
});

export const KnowledgeSchema = z.object({
  domains: z.array(SafeStringSchema(100)).max(20),
  expertise: z.array(SafeStringSchema(100)).max(50),
  outOfScopeTopics: z.array(SafeStringSchema(100)).max(50),
});

export const PersonaSchema = z.object({
  voice: VoiceSchema,
  personality: PersonalitySchema,
  cognitive: CognitiveSchema,
  knowledge: KnowledgeSchema,
});

export const MarketplaceToolRefSchema = z.object({
  id: MarketplaceIdSchema,
  version: SafeStringSchema(50).optional(),
  required: z.boolean(),
});

export const CustomToolSchema = z.object({
  id: SafeStringSchema(64),
  manifest: ToolManifestSchema,
});

export const ToolsSchema = z.object({
  platform: z.array(SafeStringSchema(50)).max(50),
  marketplace: z.array(MarketplaceToolRefSchema).max(50),
  custom: z.array(CustomToolSchema).max(10).optional(),
});

export const McpServerSchema = z.object({
  name: SafeStringSchema(100),
  transport: z.enum(['stdio', 'http', 'websocket']),
  command: SafeStringSchema(500).optional(),
  args: z.array(SafeStringSchema(500)).max(20).optional(),
  url: SafeUrlSchema.optional(),
  env: z.record(z.string(), SafeStringSchema(1000)).optional(),
});

export const GreetingsSchema = z.object({
  returning: z.array(SafeStringSchema(500)).max(20),
  new: z.array(SafeStringSchema(500)).max(20),
  timeOfDay: z.record(z.string(), z.array(SafeStringSchema(500)).max(10)).optional(),
});

export const HandoffTriggerSchema = z.object({
  condition: SafeStringSchema(500),
  targetAgent: SafeStringSchema(64),
  reason: SafeStringSchema(500),
});

export const BehaviorSchema = z.object({
  greetings: GreetingsSchema.optional(),
  backchannels: z.array(SafeStringSchema(100)).max(50).optional(),
  handoffStyle: z.enum(['warm', 'standard', 'dramatic', 'subtle']).optional(),
  handoffTriggers: z.array(HandoffTriggerSchema).max(20).optional(),
});

export const AgentManifestSchema = z.object({
  manifestVersion: z.literal('1.0.0'),
  id: MarketplaceIdSchema,
  name: SafeStringSchema(100),
  displayName: SafeStringSchema(200),
  version: SemVerSchema,
  publisher: PublisherSchema,
  description: DescriptionSchema,
  metadata: AgentMetadataSchema,
  licensing: LicensingSchema,
  verification: VerificationSchema,
  permissions: PermissionsSchema,
  persona: PersonaSchema,
  tools: ToolsSchema,
  mcpServers: z.array(McpServerSchema).max(10).optional(),
  behavior: BehaviorSchema,
  compatibility: CompatibilitySchema,
});

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

export type ToolManifest = z.infer<typeof ToolManifestSchema>;
export type AgentManifest = z.infer<typeof AgentManifestSchema>;

/**
 * Validate a tool manifest
 */
export function validateToolManifest(
  manifest: unknown
): { success: true; data: ToolManifest } | { success: false; errors: z.ZodError } {
  const result = ToolManifestSchema.safeParse(manifest);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

/**
 * Validate an agent manifest
 */
export function validateAgentManifest(
  manifest: unknown
): { success: true; data: AgentManifest } | { success: false; errors: z.ZodError } {
  const result = AgentManifestSchema.safeParse(manifest);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(errors: z.ZodError<unknown>): string[] {
  return errors.issues.map((issue) => {
    const path = issue.path.join('.');
    return `${path}: ${issue.message}`;
  });
}
