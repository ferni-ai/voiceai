/**
 * Growth Module Validation Schemas
 *
 * Zod schemas for all growth data types with strict validation.
 * Use these to validate user input and data persistence.
 */

import { z } from 'zod';

// ============================================================================
// COMMON VALIDATORS
// ============================================================================

/** ISO 8601 date string */
const isoDateString = z.string().refine(
  (val) => !isNaN(Date.parse(val)),
  { message: 'Invalid ISO date string' }
);

/** Future date (for scheduling) */
const futureDateString = z.string().refine(
  (val) => {
    const date = Date.parse(val);
    return !isNaN(date) && date > Date.now();
  },
  { message: 'Date must be in the future' }
);

/** Social media handle (starts with @) */
const socialHandle = z.string()
  .min(2, 'Handle too short')
  .max(30, 'Handle too long')
  .regex(/^@?[\w.]+$/, 'Invalid handle format');

/** URL validation */
const urlString = z.string().url('Invalid URL');

/** Positive number */
const positiveNumber = z.number().positive('Must be a positive number');

/** Non-negative number */
const nonNegativeNumber = z.number().min(0, 'Cannot be negative');

// ============================================================================
// TIKTOK ACCOUNT
// ============================================================================

export const tikTokAngleSchema = z.enum([
  'main',
  'motivation',
  'productivity',
  'emotional',
  'comparison',
]);

export const tikTokAccountSchema = z.object({
  id: z.string().min(1, 'ID required'),
  handle: socialHandle,
  angle: tikTokAngleSchema,
  description: z.string().min(1, 'Description required').max(500),
  followers: positiveNumber.optional(),
  createdAt: isoDateString,
});

export const tikTokAccountInputSchema = tikTokAccountSchema.omit({
  id: true,
  createdAt: true,
  followers: true,
});

export type TikTokAccountInput = z.infer<typeof tikTokAccountInputSchema>;

// ============================================================================
// CONTENT PIECE
// ============================================================================

export const contentPlatformSchema = z.enum(['tiktok', 'reddit', 'blog', 'twitter']);

export const contentTypeSchema = z.enum([
  'video_script',
  'post',
  'article',
  'comment',
  'email',
]);

export const contentStatusSchema = z.enum(['draft', 'scheduled', 'posted', 'failed']);

export const contentMetricsSchema = z.object({
  views: nonNegativeNumber.optional(),
  likes: nonNegativeNumber.optional(),
  comments: nonNegativeNumber.optional(),
  shares: nonNegativeNumber.optional(),
  signups: nonNegativeNumber.optional(),
});

export const contentPieceSchema = z.object({
  id: z.string().min(1),
  platform: contentPlatformSchema,
  type: contentTypeSchema,
  title: z.string().max(200).optional(),
  content: z.string().min(1, 'Content required').max(50000),
  hook: z.string().max(500).optional(),
  cta: z.string().max(500).optional(),
  hashtags: z.array(z.string().regex(/^#?[\w]+$/, 'Invalid hashtag')).optional(),
  status: contentStatusSchema,
  scheduledFor: isoDateString.optional(),
  postedAt: isoDateString.optional(),
  accountId: z.string().optional(),
  metrics: contentMetricsSchema.optional(),
  createdAt: isoDateString,
});

export const contentPieceInputSchema = contentPieceSchema.omit({
  id: true,
  createdAt: true,
  status: true,
  postedAt: true,
  metrics: true,
});

export type ContentPieceInput = z.infer<typeof contentPieceInputSchema>;

// ============================================================================
// INFLUENCER LEAD
// ============================================================================

export const influencerPlatformSchema = z.enum([
  'tiktok',
  'instagram',
  'youtube',
  'twitter',
]);

export const influencerTierSchema = z.enum(['nano', 'micro', 'mid', 'macro']);

export const influencerStatusSchema = z.enum([
  'researched',
  'contacted',
  'responded',
  'negotiating',
  'confirmed',
  'live',
  'declined',
]);

export const influencerLeadSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, 'Name required').max(100),
  handle: socialHandle,
  platform: influencerPlatformSchema,
  followers: positiveNumber,
  tier: influencerTierSchema,
  category: z.string().min(1, 'Category required').max(50),
  email: z.string().email('Invalid email').optional(),
  status: influencerStatusSchema,
  notes: z.string().max(2000).optional(),
  lastContactDate: isoDateString.optional(),
  contentLiveDate: isoDateString.optional(),
  trackingCode: z.string().max(50).optional(),
  signups: nonNegativeNumber.optional(),
  cost: nonNegativeNumber.optional(),
  createdAt: isoDateString,
});

export const influencerLeadInputSchema = influencerLeadSchema.omit({
  id: true,
  createdAt: true,
  status: true,
  lastContactDate: true,
  signups: true,
});

export type InfluencerLeadInput = z.infer<typeof influencerLeadInputSchema>;

// ============================================================================
// SEO ARTICLE
// ============================================================================

export const seoStatusSchema = z.enum(['planned', 'outlined', 'drafted', 'published']);

export const seoRankingsSchema = z.record(z.string(), nonNegativeNumber);

export const seoArticleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1, 'Title required').max(200),
  slug: z.string()
    .min(1, 'Slug required')
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase with hyphens only'),
  targetKeyword: z.string().min(1, 'Target keyword required').max(100),
  secondaryKeywords: z.array(z.string().max(100)).max(10).optional(),
  outline: z.array(z.string().max(500)).optional(),
  content: z.string().max(100000).optional(),
  wordCount: nonNegativeNumber.optional(),
  status: seoStatusSchema,
  publishedAt: isoDateString.optional(),
  url: urlString.optional(),
  metrics: z.object({
    organicTraffic: nonNegativeNumber.optional(),
    rankings: seoRankingsSchema.optional(),
    signups: nonNegativeNumber.optional(),
  }).optional(),
  createdAt: isoDateString,
});

export const seoArticleInputSchema = seoArticleSchema.omit({
  id: true,
  createdAt: true,
  status: true,
  publishedAt: true,
  content: true,
  wordCount: true,
  metrics: true,
});

export type SEOArticleInput = z.infer<typeof seoArticleInputSchema>;

// ============================================================================
// REDDIT ACCOUNT
// ============================================================================

export const redditAccountSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(3, 'Username too short').max(20),
  karma: nonNegativeNumber,
  subreddits: z.array(z.string().regex(/^r\/[\w]+$/, 'Invalid subreddit format')),
  lastActivity: isoDateString.optional(),
  createdAt: isoDateString,
});

// ============================================================================
// GROWTH CAMPAIGN
// ============================================================================

export const campaignChannelSchema = z.enum([
  'tiktok',
  'seo',
  'reddit',
  'influencer',
  'producthunt',
]);

export const campaignStatusSchema = z.enum([
  'planning',
  'active',
  'paused',
  'completed',
]);

export const campaignGoalSchema = z.object({
  metric: z.string().min(1, 'Metric name required'),
  target: positiveNumber,
  current: nonNegativeNumber,
});

export const growthCampaignSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, 'Campaign name required').max(100),
  channel: campaignChannelSchema,
  status: campaignStatusSchema,
  startDate: isoDateString,
  endDate: isoDateString.optional(),
  goals: z.array(campaignGoalSchema).min(1, 'At least one goal required'),
  createdAt: isoDateString,
});

export const growthCampaignInputSchema = z.object({
  name: z.string().min(1).max(100),
  channel: campaignChannelSchema,
  goals: z.array(campaignGoalSchema).min(1),
});

export type GrowthCampaignInput = z.infer<typeof growthCampaignInputSchema>;

// ============================================================================
// GROWTH METRICS
// ============================================================================

export const channelMetricsSchema = z.object({
  totalFollowers: nonNegativeNumber.optional(),
  totalViews: nonNegativeNumber.optional(),
  signups: nonNegativeNumber,
});

export const growthMetricsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  tiktok: z.object({
    totalFollowers: nonNegativeNumber,
    totalViews: nonNegativeNumber,
    signups: nonNegativeNumber,
  }).optional(),
  seo: z.object({
    organicSessions: nonNegativeNumber,
    keywordsRanking: nonNegativeNumber,
    signups: nonNegativeNumber,
  }).optional(),
  reddit: z.object({
    karma: nonNegativeNumber,
    signups: nonNegativeNumber,
  }).optional(),
  influencer: z.object({
    activePartnerships: nonNegativeNumber,
    contentLive: nonNegativeNumber,
    signups: nonNegativeNumber,
  }).optional(),
  total: z.object({
    signups: nonNegativeNumber,
    spend: nonNegativeNumber,
    cac: nonNegativeNumber,
  }),
});

// ============================================================================
// SCHEDULED TASK
// ============================================================================

export const taskTypeSchema = z.enum([
  'post_content',
  'send_outreach',
  'check_metrics',
  'generate_content',
  'engage_reddit',
]);

export const taskStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
]);

export const scheduledTaskSchema = z.object({
  id: z.string().min(1),
  type: taskTypeSchema,
  data: z.record(z.unknown()),
  scheduledFor: isoDateString,
  status: taskStatusSchema,
  result: z.string().optional(),
  error: z.string().optional(),
  createdAt: isoDateString,
});

export const scheduledTaskInputSchema = z.object({
  type: taskTypeSchema,
  data: z.record(z.unknown()),
  scheduledFor: futureDateString,
});

export type ScheduledTaskInput = z.infer<typeof scheduledTaskInputSchema>;

// ============================================================================
// SETTINGS
// ============================================================================

export const growthSettingsSchema = z.object({
  autoPost: z.boolean(),
  autoEngage: z.boolean(),
  autoGenerate: z.boolean(),
  contentPerDay: z.number().min(1).max(100),
  engagementPerDay: z.number().min(1).max(500),
  openaiApiKey: z.string().min(20).optional(),
  anthropicApiKey: z.string().min(20).optional(),
  // Reddit OAuth
  redditClientId: z.string().optional(),
  redditClientSecret: z.string().optional(),
  redditUsername: z.string().optional(),
  redditPassword: z.string().optional(),
  // TikTok
  tiktokAccessToken: z.string().optional(),
  tiktokOpenId: z.string().optional(),
  // Email
  resendApiKey: z.string().optional(),
  emailFromAddress: z.string().email().optional(),
  emailFromName: z.string().max(100).optional(),
});

export const settingsUpdateSchema = growthSettingsSchema.partial();

export type GrowthSettingsUpdate = z.infer<typeof settingsUpdateSchema>;

// ============================================================================
// FULL STATE
// ============================================================================

export const growthStateSchema = z.object({
  tiktokAccounts: z.array(tikTokAccountSchema),
  contentQueue: z.array(contentPieceSchema),
  influencerLeads: z.array(influencerLeadSchema),
  seoArticles: z.array(seoArticleSchema),
  redditAccounts: z.array(redditAccountSchema),
  campaigns: z.array(growthCampaignSchema),
  metrics: z.array(growthMetricsSchema),
  scheduledTasks: z.array(scheduledTaskSchema),
  settings: growthSettingsSchema,
  lastSync: isoDateString,
});

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
}

/**
 * Validate data against a schema with friendly error messages
 */
export function validate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  // Zod v4 uses 'issues' instead of 'errors'
  const issues = result.error.issues || result.error.errors || [];
  const errors = issues.map((err: { path?: (string | number)[]; message: string }) => {
    const path = err.path?.join('.') || '';
    return path ? `${path}: ${err.message}` : err.message;
  });

  return { success: false, errors };
}

/**
 * Validate and throw if invalid
 */
export function validateOrThrow<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context?: string
): T {
  const result = validate(schema, data);

  if (!result.success) {
    const prefix = context ? `${context}: ` : '';
    throw new Error(`${prefix}Validation failed:\n${result.errors!.join('\n')}`);
  }

  return result.data!;
}

/**
 * Validate TikTok account input
 */
export function validateTikTokAccount(data: unknown): ValidationResult<TikTokAccountInput> {
  return validate(tikTokAccountInputSchema, data);
}

/**
 * Validate content piece input
 */
export function validateContent(data: unknown): ValidationResult<ContentPieceInput> {
  return validate(contentPieceInputSchema, data);
}

/**
 * Validate influencer lead input
 */
export function validateInfluencer(data: unknown): ValidationResult<InfluencerLeadInput> {
  return validate(influencerLeadInputSchema, data);
}

/**
 * Validate SEO article input
 */
export function validateSEOArticle(data: unknown): ValidationResult<SEOArticleInput> {
  return validate(seoArticleInputSchema, data);
}

/**
 * Validate campaign input
 */
export function validateCampaign(data: unknown): ValidationResult<GrowthCampaignInput> {
  return validate(growthCampaignInputSchema, data);
}

/**
 * Validate settings update
 */
export function validateSettings(data: unknown): ValidationResult<GrowthSettingsUpdate> {
  return validate(settingsUpdateSchema, data);
}

/**
 * Validate scheduled task input
 */
export function validateScheduledTask(data: unknown): ValidationResult<ScheduledTaskInput> {
  return validate(scheduledTaskInputSchema, data);
}

// ============================================================================
// CLI INPUT VALIDATORS
// ============================================================================

/**
 * Parse and validate CLI date input
 * Accepts: "2026-01-20", "2026-01-20 10:00", "tomorrow", "+2d", "+1w"
 */
export function parseCliDate(input: string): Date {
  const trimmed = input.trim().toLowerCase();
  const now = new Date();

  // Relative dates
  if (trimmed === 'tomorrow') {
    now.setDate(now.getDate() + 1);
    now.setHours(9, 0, 0, 0);
    return now;
  }

  if (trimmed === 'today') {
    return now;
  }

  // +Nd, +Nw patterns
  const relativeMatch = trimmed.match(/^\+(\d+)([dwmh])$/);
  if (relativeMatch) {
    const [, num, unit] = relativeMatch;
    const amount = parseInt(num, 10);
    switch (unit) {
      case 'h':
        now.setHours(now.getHours() + amount);
        break;
      case 'd':
        now.setDate(now.getDate() + amount);
        break;
      case 'w':
        now.setDate(now.getDate() + amount * 7);
        break;
      case 'm':
        now.setMonth(now.getMonth() + amount);
        break;
    }
    return now;
  }

  // ISO date or datetime
  const parsed = new Date(input);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Invalid date format: "${input}". Use YYYY-MM-DD, "tomorrow", "+2d", "+1w"`);
  }

  return parsed;
}

/**
 * Validate influencer tier from follower count
 */
export function tierFromFollowers(followers: number): 'nano' | 'micro' | 'mid' | 'macro' {
  if (followers < 10000) return 'nano';
  if (followers < 100000) return 'micro';
  if (followers < 1000000) return 'mid';
  return 'macro';
}

/**
 * Validate and normalize social handle
 */
export function normalizeHandle(handle: string): string {
  const trimmed = handle.trim();
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

/**
 * Validate and normalize hashtags
 */
export function normalizeHashtags(tags: string[]): string[] {
  return tags.map((tag) => {
    const trimmed = tag.trim();
    return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  });
}

/**
 * Generate slug from title
 */
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100);
}
