/**
 * API Input Validators
 *
 * Zod schemas for validating API request bodies.
 * Provides type-safe validation with helpful error messages.
 *
 * USAGE:
 *   import { validateBody, RitualCompleteSchema } from './validators.js';
 *
 *   const body = await validateBody(req, res, RitualCompleteSchema);
 *   if (!body) return true; // Validation failed, 400 sent
 */

import { z } from 'zod';
import type { IncomingMessage, ServerResponse } from 'http';
import { parseBody, sendError } from './helpers.js';
import { createLogger } from '../utils/safe-logger.js';
import { API_ERRORS } from './error-messages.js';

const log = createLogger({ module: 'Validators' });

// ============================================================================
// COMMON SCHEMAS
// ============================================================================

/** User ID - non-empty string */
export const UserIdSchema = z.string().min(1, 'userId is required');

/** Pagination limit */
export const LimitSchema = z.coerce.number().int().min(1).max(500).default(50);

/** ISO date string */
export const ISODateSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

/** Positive number */
export const PositiveNumberSchema = z.number().positive();

// ============================================================================
// RITUAL SCHEMAS
// ============================================================================

/** Weather/mood for sky check */
export const WeatherSchema = z.object({
  primary: z.enum(['sunny', 'partly-cloudy', 'cloudy', 'rainy', 'stormy', 'foggy', 'rainbow']),
  energy: z.enum(['high', 'medium', 'low']).optional(),
  note: z.string().max(500).optional(),
});

/** Create ritual request */
export const CreateRitualSchema = z.object({
  userId: UserIdSchema.optional(),
  ritual: z
    .object({
      personaId: z.string().optional(),
      name: z.string().max(100).optional(),
      frequency: z.enum(['daily', 'weekday', 'weekend', 'weekly']).optional(),
    })
    .optional(),
});

/** Complete ritual request */
export const CompleteRitualSchema = z.object({
  userId: UserIdSchema.optional(),
  weather: WeatherSchema.optional(),
});

// ============================================================================
// PREDICTION SCHEMAS
// ============================================================================

/** Update prediction actuals */
export const UpdatePredictionActualsSchema = z.object({
  userId: UserIdSchema.optional(),
  actuals: z.record(z.string(), z.number()),
});

// ============================================================================
// EXPORT SCHEMAS
// ============================================================================

/** Export data request */
export const ExportDataSchema = z.object({
  userId: UserIdSchema.optional(),
  format: z.enum(['json', 'csv']).default('json'),
  categories: z.array(z.string()).optional(),
});

/** Delete all data (GDPR) request */
export const DeleteAllDataSchema = z.object({
  userId: UserIdSchema.optional(),
  confirmDelete: z.literal(true).refine((val) => val === true, {
    message: 'Must confirm deletion with confirmDelete: true',
  }),
});

// ============================================================================
// MEMORY SCHEMAS
// ============================================================================

/** Delete memory - no body needed, just params */
export const DeleteMemoryParamsSchema = z.object({
  memoryId: z.string().min(1, 'memoryId is required'),
});

// ============================================================================
// SUBSCRIPTION SCHEMAS
// ============================================================================

/** Create checkout session */
export const CreateCheckoutSchema = z.object({
  userId: UserIdSchema,
  tier: z.enum(['friend', 'partner']),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
  email: z.string().email().optional(),
  name: z.string().max(100).optional(),
});

/** Create portal session */
export const CreatePortalSchema = z.object({
  userId: UserIdSchema,
  returnUrl: z.string().url().optional(),
});

/** Record conversation */
export const RecordConversationSchema = z.object({
  userId: UserIdSchema,
  durationMinutes: z.number().min(0).optional(),
});

// ============================================================================
// DORA METRICS SCHEMAS
// ============================================================================

/** Record deployment */
export const RecordDeploymentSchema = z.object({
  timestamp: ISODateSchema,
  commitSha: z.string().min(1),
  commitMessage: z.string().optional(),
  branch: z.string().min(1),
  environment: z.enum(['production', 'staging', 'development']),
  duration: z.number().min(0).optional(),
  success: z.boolean().default(true),
  triggeredBy: z.string().optional(),
  buildId: z.string().optional(),
  rollback: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** Record incident */
export const RecordIncidentSchema = z.object({
  title: z.string().min(1).max(200),
  severity: z.enum(['critical', 'major', 'minor']),
  startedAt: ISODateSchema,
  deploymentId: z.string().optional(),
  affectedServices: z.array(z.string()).optional(),
});

/** Resolve incident */
export const ResolveIncidentSchema = z.object({
  resolvedAt: ISODateSchema.optional(),
  resolution: z.string().max(1000).optional(),
  rootCause: z.string().max(1000).optional(),
});

// ============================================================================
// FEATURE FLAG SCHEMAS
// ============================================================================

/** Create feature flag */
export const CreateFeatureFlagSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-_]+$/, 'id must be lowercase alphanumeric with dashes/underscores'),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  type: z.enum(['boolean', 'percentage', 'user_list', 'value']),
  enabled: z.boolean().default(false),
  percentage: z.number().min(0).max(100).optional(),
  userIds: z.array(z.string()).optional(),
  value: z.unknown().optional(),
  category: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** Update feature flag */
export const UpdateFeatureFlagSchema = CreateFeatureFlagSchema.partial();

// ============================================================================
// VOICE PRESENCE SCHEMAS
// ============================================================================

/** Update voice presence config */
export const UpdateVoicePresenceConfigSchema = z.object({
  fillerWordsEnabled: z.boolean().optional(),
  fillerWordsFrequency: z.number().min(0).max(1).optional(),
  breathingEnabled: z.boolean().optional(),
  breathingFrequency: z.number().min(0).max(1).optional(),
  emotionalMirroringEnabled: z.boolean().optional(),
  emotionalMirroringIntensity: z.number().min(0).max(1).optional(),
  paceMatchingEnabled: z.boolean().optional(),
  paceMatchingIntensity: z.number().min(0).max(1).optional(),
});

// ============================================================================
// VALIDATION HELPER
// ============================================================================

/**
 * Validate request body against a Zod schema.
 * Returns parsed data or sends 400 error and returns null.
 */
export async function validateBody<T extends z.ZodType>(
  req: IncomingMessage,
  res: ServerResponse,
  schema: T
): Promise<z.infer<T> | null> {
  try {
    const rawBody = await parseBody(req);
    const result = schema.safeParse(rawBody);

    if (!result.success) {
      const { issues } = result.error;
      const errorMessages = issues.map((issue: z.ZodIssue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));

      log.warn({ errors: errorMessages, url: req.url }, 'Validation failed');
      sendError(
        res,
        `Validation error: ${errorMessages.map((e: { message: string }) => e.message).join(', ')}`,
        400
      );
      return null;
    }

    return result.data;
  } catch (err) {
    log.error({ error: err, url: req.url }, 'Failed to parse request body');
    sendError(res, API_ERRORS.INVALID_REQUEST, 400);
    return null;
  }
}

/**
 * Validate query parameters against a Zod schema.
 */
export function validateQuery<T extends z.ZodType>(parsedUrl: URL, schema: T): z.infer<T> | null {
  const params: Record<string, string> = {};
  parsedUrl.searchParams.forEach((value, key) => {
    params[key] = value;
  });

  const result = schema.safeParse(params);
  if (!result.success) {
    return null;
  }
  return result.data;
}
