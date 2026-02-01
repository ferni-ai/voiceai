/**
 * Zod Validation Schemas
 *
 * Runtime validation schemas for key types. Use these at system boundaries
 * (API inputs, database reads, external integrations) where TypeScript's
 * compile-time checks aren't enough.
 *
 * Philosophy: Trust internal code, validate external data.
 *
 * @example
 * // API endpoint
 * const body = UserIdentitySchema.parse(req.body);
 *
 * @example
 * // Database read
 * const profile = UserProfileSchema.safeParse(doc.data());
 * if (!profile.success) {
 *   logger.error('Invalid profile data', profile.error);
 * }
 *
 * @module types/schemas
 */

import { z } from 'zod';

// ============================================================================
// PRIMITIVE SCHEMAS
// ============================================================================

/**
 * Non-empty string schema
 */
export const NonEmptyStringSchema = z.string().min(1, 'String cannot be empty');

/**
 * Email schema
 */
export const EmailSchema = z.string().email('Invalid email address');

/**
 * Phone number schema (E.164 format)
 */
export const PhoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, 'Phone must be in E.164 format (e.g., +15551234567)');

/**
 * URL schema
 */
export const UrlSchema = z.string().url('Invalid URL');

/**
 * Positive number schema
 */
export const PositiveNumberSchema = z.number().positive('Must be a positive number');

/**
 * Percentage schema (0-100)
 */
export const PercentageSchema = z.number().min(0).max(100);

/**
 * Normalized score schema (0-1)
 */
export const NormalizedScoreSchema = z.number().min(0).max(1);

// ============================================================================
// ID SCHEMAS
// ============================================================================

/**
 * User ID schema
 */
export const UserIdSchema = z
  .string()
  .min(1)
  .refine(
    (val) =>
      val.startsWith('user_') ||
      val.startsWith('phone_') ||
      val.startsWith('anon_') ||
      val.length > 0, // Allow legacy IDs
    'Invalid user ID format'
  );

/**
 * Session ID schema
 */
export const SessionIdSchema = z.string().min(1);

/**
 * Persona ID schema
 */
export const PersonaIdSchema = z.enum([
  'ferni',
  'maya',
  'peter',
  'alex',
  'jordan',
  'nayan',
  'jackie',
  'bogle',
]);

/**
 * Room ID schema
 */
export const RoomIdSchema = z.string().min(1);

// ============================================================================
// RELATIONSHIP SCHEMAS
// ============================================================================

/**
 * Canonical relationship stage schema
 */
export const RelationshipStageSchema = z.enum([
  'stranger',
  'acquaintance',
  'friend',
  'trusted_confidant',
]);

/**
 * Legacy relationship stage schema (for migration)
 */
export const LegacyRelationshipStageSchema = z.enum([
  'new_acquaintance',
  'getting_to_know',
  'trusted_advisor',
  'old_friend',
]);

// ============================================================================
// VOICE SKETCH SCHEMA
// ============================================================================

export const VoiceSketchSchema = z.object({
  // Pitch characteristics
  pitchMean: z.number(),
  pitchMin: z.number(),
  pitchMax: z.number(),
  pitchStdDev: z.number().nonnegative(),

  // Timing characteristics
  speakingRateMean: z.number().nonnegative(),
  pauseFrequency: z.number().nonnegative(),
  avgPauseDuration: z.number().nonnegative(),

  // Spectral characteristics
  spectralCentroidMean: z.number(),
  spectralCentroidStdDev: z.number().nonnegative(),
  spectralRolloffMean: z.number(),

  // Energy characteristics
  energyMean: z.number(),
  energyStdDev: z.number().nonnegative(),

  // Metadata
  samplesAnalyzed: z.number().int().nonnegative(),
  totalDurationMs: z.number().nonnegative(),
  confidence: NormalizedScoreSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ============================================================================
// CONTACT INFO SCHEMA
// ============================================================================

export const ContactInfoSchema = z.object({
  phone: PhoneSchema.optional(),
  email: EmailSchema.optional(),
  preferredContactMethod: z.enum(['sms', 'email', 'call', 'voice_message']).optional(),
  timezone: z.string().optional(),
  quietHoursStart: z.number().min(0).max(23).optional(),
  quietHoursEnd: z.number().min(0).max(23).optional(),
});

// ============================================================================
// USER IDENTITY SCHEMA
// ============================================================================

export const UserIdentitySchema = z.object({
  id: UserIdSchema,
  name: z.string().optional(),
  preferredName: z.string().optional(),
  linkedIdentifiers: z.array(z.string()).optional(),
  voiceSketch: VoiceSketchSchema.optional(),
  contactInfo: ContactInfoSchema.optional(),
  firstContact: z.coerce.date(),
  lastContact: z.coerce.date(),
  totalConversations: z.number().int().nonnegative(),
  totalMinutesTalked: z.number().nonnegative(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  version: z.number().int().positive(),
});

// ============================================================================
// COMMUNICATION PROFILE SCHEMA
// ============================================================================

export const CommunicationStyleSchema = z.enum(['formal', 'casual', 'playful', 'mixed']);

export const SpeakingPaceSchema = z.enum(['slow', 'moderate', 'fast']);

export const VerbosityPreferenceSchema = z.enum(['concise', 'balanced', 'storytelling']);

export const CommunicationProfileSchema = z.object({
  style: CommunicationStyleSchema,
  speakingPace: SpeakingPaceSchema,
  averageWPM: z.number().positive().optional(),
  humorAppreciation: z.enum(['high', 'medium', 'low']),
  preferredTopics: z.array(z.string()),
  avoidTopics: z.array(z.string()),
  verbosity: VerbosityPreferenceSchema,
  wantsProactiveAdvice: z.boolean(),
  financialPrivacyLevel: z.enum(['open', 'moderate', 'private']),
  preferredGreeting: z.string().optional(),
});

// ============================================================================
// FINANCIAL SCHEMAS
// ============================================================================

export const RiskToleranceSchema = z.enum(['conservative', 'moderate', 'aggressive', 'unknown']);

export const RiskProfileSchema = z.object({
  tolerance: RiskToleranceSchema,
  confidence: NormalizedScoreSchema,
  assessedAt: z.coerce.date(),
  factors: z.array(z.string()),
});

export const FinancialGoalTypeSchema = z.enum([
  'retirement',
  'education',
  'home',
  'emergency',
  'travel',
  'other',
]);

export const GoalStatusSchema = z.enum([
  'planning',
  'active',
  'on_track',
  'behind',
  'achieved',
  'abandoned',
]);

export const FinancialGoalSchema = z.object({
  id: z.string(),
  name: NonEmptyStringSchema,
  type: FinancialGoalTypeSchema,
  targetAmount: z.number().nonnegative().optional(),
  targetDate: z.coerce.date().optional(),
  timeHorizon: z.enum(['short', 'medium', 'long', 'unknown']),
  currentProgress: z.number().nonnegative().optional(),
  progressPercent: PercentageSchema.optional(),
  status: GoalStatusSchema,
  priority: z.enum(['high', 'medium', 'low']),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  milestones: z
    .array(
      z.object({
        date: z.coerce.date(),
        note: z.string(),
      })
    )
    .optional(),
  jackNotes: z.string().optional(),
});

export const PrimaryConcernSchema = z.enum([
  'retirement',
  'savings',
  'debt',
  'education',
  'market_volatility',
  'inflation',
  'job_security',
  'healthcare',
  'legacy',
  'general',
  'none',
]);

// ============================================================================
// KEY MOMENT SCHEMA
// ============================================================================

export const KeyMomentTypeSchema = z.enum([
  'shared_vulnerability',
  'breakthrough',
  'milestone',
  'concern',
  'celebration',
  'decision',
]);

export const EmotionalWeightSchema = z.enum(['light', 'medium', 'heavy']);

export const KeyMomentSchema = z.object({
  id: z.string(),
  timestamp: z.coerce.date(),
  type: KeyMomentTypeSchema,
  summary: NonEmptyStringSchema,
  emotionalWeight: EmotionalWeightSchema,
  topics: z.array(z.string()),
  followUpNeeded: z.boolean().optional(),
  followUpDate: z.coerce.date().optional(),
});

// ============================================================================
// SUBSCRIPTION SCHEMAS
// ============================================================================

export const SubscriptionTierSchema = z.enum(['free', 'friend', 'partner']);

export const BillingFrequencySchema = z.enum(['monthly', 'annual']);

export const SubscriptionStatusSchema = z.enum([
  'active',
  'trialing',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'paused',
]);

export const MonthlyUsageSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  conversationCount: z.number().int().nonnegative(),
  minutesTalked: z.number().nonnegative(),
  lastUpdated: z.coerce.date(),
});

export const SubscriptionDataSchema = z.object({
  tier: SubscriptionTierSchema,
  status: SubscriptionStatusSchema,
  billingFrequency: BillingFrequencySchema,
  stripeCustomerId: z.string().optional(),
  stripeSubscriptionId: z.string().optional(),
  subscribedAt: z.coerce.date().optional(),
  currentPeriodEnd: z.coerce.date().optional(),
  inTrial: z.boolean(),
  trialEndDate: z.coerce.date().optional(),
  monthlyUsage: MonthlyUsageSchema,
  usageHistory: z.array(MonthlyUsageSchema).optional(),
  lastSyncedAt: z.coerce.date(),
});

// ============================================================================
// CONVERSATION MEMORY SCHEMAS
// ============================================================================

export const ConversationSummarySchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  timestamp: z.coerce.date(),
  duration: z.number().nonnegative(),
  turnCount: z.number().int().nonnegative(),
  mainTopics: z.array(z.string()),
  keyPoints: z.array(z.string()),
  emotionalArc: z.string(),
  decisionsReached: z.array(z.string()).optional(),
  questionsRemaining: z.array(z.string()).optional(),
  followUpItems: z.array(z.string()).optional(),
  embedding: z.array(z.number()).optional(),
});

export const PendingFollowUpSchema = z.object({
  topic: NonEmptyStringSchema,
  targetDate: z.coerce.date(),
  reason: z.string(),
});

// ============================================================================
// API RESPONSE SCHEMAS
// ============================================================================

/**
 * Standard API success response
 */
export const ApiSuccessSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: z
      .object({
        requestId: z.string().optional(),
        timestamp: z.coerce.date().optional(),
      })
      .optional(),
  });

/**
 * Standard API error response
 */
export const ApiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
  meta: z
    .object({
      requestId: z.string().optional(),
      timestamp: z.coerce.date().optional(),
    })
    .optional(),
});

/**
 * Paginated list response
 */
export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    pagination: z.object({
      page: z.number().int().positive(),
      pageSize: z.number().int().positive(),
      totalItems: z.number().int().nonnegative(),
      totalPages: z.number().int().nonnegative(),
      hasNext: z.boolean(),
      hasPrev: z.boolean(),
    }),
  });

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Parse with better error messages
 */
export function parseWithContext<T>(schema: z.ZodSchema<T>, data: unknown, context: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new Error(`Validation failed for ${context}: ${errors}`);
  }
  return result.data;
}

/**
 * Safe parse that returns Result type
 */
export function safeParseToResult<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

// ============================================================================
// HUMAN MEMORY SCHEMAS (Better-than-human relationship texture)
// ============================================================================

/**
 * Core values schema
 */
export const CoreValueSchema = z.object({
  value: NonEmptyStringSchema,
  importance: NormalizedScoreSchema,
  demonstratedIn: z.array(z.string()).optional(),
  discoveredAt: z.coerce.date().optional(),
});

/**
 * Fear schema
 */
export const FearSchema = z.object({
  fear: NonEmptyStringSchema,
  severity: z.enum(['mild', 'moderate', 'significant', 'severe']),
  rootCause: z.string().optional(),
  copingStrategies: z.array(z.string()).optional(),
  discussedAt: z.coerce.date().optional(),
});

/**
 * Dream schema
 */
export const DreamSchema = z.object({
  dream: NonEmptyStringSchema,
  category: z.enum([
    'career',
    'personal',
    'relationship',
    'creative',
    'adventure',
    'legacy',
    'other',
  ]),
  timeframe: z.enum(['immediate', 'short_term', 'long_term', 'someday']).optional(),
  blockers: z.array(z.string()).optional(),
  sharedAt: z.coerce.date().optional(),
});

/**
 * Important date schema
 */
export const ImportantDateSchema = z.object({
  date: z.string(), // ISO date or "MM-DD" for recurring
  description: NonEmptyStringSchema,
  type: z.enum(['birthday', 'anniversary', 'memorial', 'achievement', 'custom']),
  recurring: z.boolean(),
  person: z.string().optional(),
  emotionalWeight: EmotionalWeightSchema.optional(),
});

/**
 * Inside joke schema
 */
export const InsideJokeSchema = z.object({
  setup: NonEmptyStringSchema,
  context: z.string().optional(),
  createdAt: z.coerce.date(),
  lastReferencedAt: z.coerce.date().optional(),
  timesReferenced: z.number().int().nonnegative().optional(),
});

/**
 * Emotional signature schema
 */
export const EmotionalSignatureSchema = z.object({
  baselineValence: NormalizedScoreSchema,
  volatility: z.enum(['stable', 'moderate', 'volatile']),
  primaryEmotions: z.array(z.string()),
  triggers: z.array(z.string()).optional(),
  comfortSources: z.array(z.string()).optional(),
});

/**
 * Temporal patterns schema
 */
export const TemporalPatternsSchema = z.object({
  timeOfDayPatterns: z
    .array(
      z.object({
        hour: z.number().int().min(0).max(23),
        energy: z.enum(['high', 'medium', 'low']),
        mood: z.string().optional(),
      })
    )
    .optional(),
  seasonalPatterns: z
    .array(
      z.object({
        season: z.enum(['spring', 'summer', 'fall', 'winter']),
        tendency: z.string(),
        notes: z.string().optional(),
      })
    )
    .optional(),
});

/**
 * Growth arc schema
 */
export const GrowthArcSchema = z.object({
  area: NonEmptyStringSchema,
  startedAt: z.coerce.date(),
  milestones: z.array(
    z.object({
      date: z.coerce.date(),
      description: z.string(),
      significance: z.enum(['minor', 'moderate', 'major']),
    })
  ),
  currentStatus: z.enum(['struggling', 'progressing', 'thriving', 'plateaued']),
  journeyNotes: z.string().optional(),
});

/**
 * Full human memory schema
 */
export const HumanMemorySchema = z.object({
  coreValues: z.array(CoreValueSchema).optional(),
  fears: z.array(FearSchema).optional(),
  dreams: z.array(DreamSchema).optional(),
  importantDates: z.array(ImportantDateSchema).optional(),
  insideJokes: z.array(InsideJokeSchema).optional(),
  emotionalSignature: EmotionalSignatureSchema.optional(),
  temporalPatterns: TemporalPatternsSchema.optional(),
  growthArcs: z.array(GrowthArcSchema).optional(),
  updatedAt: z.coerce.date().optional(),
});

// ============================================================================
// PERSONAL JOURNEY SCHEMAS
// ============================================================================

/**
 * Journey moment type schema
 */
export const JourneyMomentTypeSchema = z.enum([
  'breakthrough',
  'setback',
  'insight',
  'decision',
  'celebration',
  'challenge',
  'connection',
  'reflection',
]);

/**
 * Journey moment schema
 */
export const JourneyMomentSchema = z.object({
  id: z.string(),
  type: JourneyMomentTypeSchema,
  timestamp: z.coerce.date(),
  summary: NonEmptyStringSchema,
  emotionalImpact: NormalizedScoreSchema.optional(),
  relatedTopics: z.array(z.string()).optional(),
  personaId: PersonaIdSchema.optional(),
});

/**
 * Life chapter schema
 */
export const LifeChapterSchema = z.object({
  id: z.string(),
  name: NonEmptyStringSchema,
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  theme: z.string().optional(),
  keyMoments: z.array(z.string()).optional(), // References to moment IDs
  status: z.enum(['current', 'past', 'upcoming']),
});

/**
 * Season schema
 */
export const SeasonSchema = z.enum(['spring', 'summer', 'fall', 'winter']);

/**
 * Personal journey data schema
 */
export const PersonalJourneyDataSchema = z.object({
  moments: z.array(JourneyMomentSchema).optional(),
  chapters: z.array(LifeChapterSchema).optional(),
  currentSeason: SeasonSchema.optional(),
  rhythmNotes: z.string().optional(),
  lastUpdated: z.coerce.date().optional(),
});

// ============================================================================
// DOMAIN EVENT SCHEMAS
// ============================================================================

/**
 * Base event schema
 */
export const BaseEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  timestamp: z.coerce.date(),
  version: z.number().int().positive().default(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Session event schema
 */
export const SessionEventSchema = BaseEventSchema.extend({
  sessionId: SessionIdSchema,
  userId: UserIdSchema,
});

/**
 * Tool invoked event schema
 */
export const ToolInvokedEventSchema = SessionEventSchema.extend({
  type: z.literal('tool_invoked'),
  toolId: z.string(),
  domain: z.string(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  executionTimeMs: z.number().nonnegative().optional(),
  success: z.boolean(),
  errorMessage: z.string().optional(),
});

/**
 * Goal created event schema
 */
export const GoalCreatedEventSchema = BaseEventSchema.extend({
  type: z.literal('goal_created'),
  userId: UserIdSchema,
  goalId: z.string(),
  goalType: z.string(),
  targetDate: z.coerce.date().optional(),
});

/**
 * Habit logged event schema
 */
export const HabitLoggedEventSchema = BaseEventSchema.extend({
  type: z.literal('habit_logged'),
  userId: UserIdSchema,
  habitId: z.string(),
  habitName: z.string(),
  completed: z.boolean(),
  streakCount: z.number().int().nonnegative().optional(),
});

// ============================================================================
// TOOL SCHEMAS
// ============================================================================

/**
 * Tool domain schema
 */
export const ToolDomainSchema = z.enum([
  'memory',
  'calendar',
  'communication',
  'habits',
  'finance',
  'research',
  'productivity',
  'life-planning',
  'wellness',
  'entertainment',
  'information',
  'wisdom',
  'handoff',
  'telephony',
  'grief',
  'meaning',
  'relationships',
  'stories',
  'curiosity',
  'vulnerability',
  'dreams',
  'play',
  'self-compassion',
  'presence',
  'proactive',
  'awareness',
  'engagement',
  'simple-utilities',
  'crisis',
  'health',
  'career',
  'decisions',
  'family',
  'home',
  'learning',
  'creativity',
  'community',
  'legal-admin',
  'games',
  'cameo',
  'second-chances',
  'connection',
  'difficult-conversations',
  'life-transitions',
  'reflection-games',
  'quiet-growth',
  'pattern-mastery',
  'timeless-perspective',
  'workflow-mastery',
  'milestone-mastery',
]);

/**
 * Tool category schema
 */
export const ToolCategorySchema = z.enum([
  'core',
  'productivity',
  'financial',
  'communication',
  'lifestyle',
  'information',
  'entertainment',
]);

/**
 * Tool context schema
 */
export const ToolContextSchema = z.object({
  userId: UserIdSchema,
  sessionId: SessionIdSchema.optional(),
  agentId: z.string(),
  agentDisplayName: z.string(),
  domainConfig: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Tool definition metadata schema (without create function)
 */
export const ToolMetadataSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  name: NonEmptyStringSchema,
  description: NonEmptyStringSchema,
  domain: ToolDomainSchema,
  additionalDomains: z.array(ToolDomainSchema).optional(),
  category: ToolCategorySchema.optional(),
  requiredServices: z.array(z.string()).optional(),
  experimental: z.boolean().optional(),
  deprecated: z.boolean().optional(),
  deprecationMessage: z.string().optional(),
  tags: z.array(z.string()).optional(),
  since: z.string().optional(),
});

// ============================================================================
// TASK SCHEMAS
// ============================================================================

/**
 * Task category schema
 */
export const TaskCategorySchema = z.enum([
  'micro',
  'support',
  'advice',
  'relationship',
  'life_event',
]);

/**
 * Task priority schema
 */
export const TaskPrioritySchema = z.number().int().min(1).max(10);

/**
 * Task trigger schema
 */
export const TaskTriggerSchema = z.object({
  emotions: z.array(z.string()).optional(),
  distressThreshold: NormalizedScoreSchema.optional(),
  intents: z.array(z.string()).optional(),
  keywords: z.string().optional(), // Regex pattern as string
  phases: z.array(z.string()).optional(),
});

/**
 * Task wisdom schema (for JSON serialization)
 */
export const TaskWisdomSchema = z.object({
  id: z.string(),
  name: NonEmptyStringSchema,
  category: TaskCategorySchema,
  priority: TaskPrioritySchema,
  triggers: TaskTriggerSchema,
  instructions: z.object({
    base: NonEmptyStringSchema,
    ifDistressed: z.string().optional(),
    ifPositive: z.string().optional(),
    ifReturning: z.string().optional(),
  }),
  completion: z
    .object({
      afterTurns: z.number().int().positive().optional(),
      onEmotionChange: z.boolean().optional(),
      onKeywords: z.string().optional(), // Regex pattern as string
    })
    .optional(),
  transitions: z
    .object({
      entry: z.array(z.string()).optional(),
      exit: z.array(z.string()).optional(),
      toTask: z.string().optional(),
    })
    .optional(),
});

// ============================================================================
// RESULT TYPE SCHEMAS
// ============================================================================

/**
 * Success result schema
 */
export const SuccessResultSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
  });

/**
 * Failure result schema
 */
export const FailureResultSchema = z.object({
  success: z.literal(false),
  error: z.union([
    z.string(),
    z.object({
      message: z.string(),
      code: z.string().optional(),
      details: z.record(z.string(), z.unknown()).optional(),
    }),
  ]),
});

/**
 * Result schema (union of success and failure)
 */
export const ResultSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.union([SuccessResultSchema(dataSchema), FailureResultSchema]);

// ============================================================================
// TYPE EXPORTS (inferred from schemas)
// ============================================================================

export type VoiceSketch = z.infer<typeof VoiceSketchSchema>;
export type ContactInfo = z.infer<typeof ContactInfoSchema>;
export type UserIdentity = z.infer<typeof UserIdentitySchema>;
export type CommunicationProfile = z.infer<typeof CommunicationProfileSchema>;
export type RiskProfile = z.infer<typeof RiskProfileSchema>;
export type FinancialGoal = z.infer<typeof FinancialGoalSchema>;
export type KeyMoment = z.infer<typeof KeyMomentSchema>;
export type SubscriptionData = z.infer<typeof SubscriptionDataSchema>;
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;
export type PendingFollowUp = z.infer<typeof PendingFollowUpSchema>;

// Human Memory types
export type CoreValue = z.infer<typeof CoreValueSchema>;
export type Fear = z.infer<typeof FearSchema>;
export type Dream = z.infer<typeof DreamSchema>;
export type ImportantDate = z.infer<typeof ImportantDateSchema>;
export type InsideJoke = z.infer<typeof InsideJokeSchema>;
export type EmotionalSignature = z.infer<typeof EmotionalSignatureSchema>;
export type TemporalPatterns = z.infer<typeof TemporalPatternsSchema>;
export type GrowthArc = z.infer<typeof GrowthArcSchema>;
export type HumanMemory = z.infer<typeof HumanMemorySchema>;

// Personal Journey types
export type JourneyMomentType = z.infer<typeof JourneyMomentTypeSchema>;
export type JourneyMoment = z.infer<typeof JourneyMomentSchema>;
export type LifeChapter = z.infer<typeof LifeChapterSchema>;
export type Season = z.infer<typeof SeasonSchema>;
export type PersonalJourneyData = z.infer<typeof PersonalJourneyDataSchema>;

// Event types
export type BaseEvent = z.infer<typeof BaseEventSchema>;
export type SessionEvent = z.infer<typeof SessionEventSchema>;
export type ToolInvokedEvent = z.infer<typeof ToolInvokedEventSchema>;
export type GoalCreatedEvent = z.infer<typeof GoalCreatedEventSchema>;
export type HabitLoggedEvent = z.infer<typeof HabitLoggedEventSchema>;

// Tool types
export type ToolDomain = z.infer<typeof ToolDomainSchema>;
export type ToolCategory = z.infer<typeof ToolCategorySchema>;
export type ToolContext = z.infer<typeof ToolContextSchema>;
export type ToolMetadata = z.infer<typeof ToolMetadataSchema>;

// Task types
export type TaskCategory = z.infer<typeof TaskCategorySchema>;
export type TaskWisdom = z.infer<typeof TaskWisdomSchema>;
