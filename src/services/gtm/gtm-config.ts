/**
 * GTM Configuration
 *
 * Centralized configuration for the GTM service.
 * All configurable values should be defined here.
 *
 * @module services/gtm/gtm-config
 */

import type { GTMConfig, ContentCategory, ContentPillar } from './types.js';

// ============================================================================
// ENVIRONMENT CONFIG
// ============================================================================

/**
 * Get GTM configuration from environment
 */
export function getGTMConfig(): GTMConfig {
  return {
    enabled: process.env.GTM_ENABLED !== 'false',
    autoPublish: process.env.GTM_AUTO_PUBLISH === 'true',
    reviewRequired: process.env.GTM_REQUIRE_APPROVAL !== 'false', // Default true
    defaultTimezone: process.env.GTM_TIMEZONE || 'America/Los_Angeles',
    publishTimes: {
      morning: process.env.GTM_PUBLISH_MORNING || '09:00',
      afternoon: process.env.GTM_PUBLISH_AFTERNOON || '14:00',
      evening: process.env.GTM_PUBLISH_EVENING || '18:00',
    },
    platforms: {
      twitter: process.env.GTM_PLATFORM_TWITTER !== 'false',
      linkedin: process.env.GTM_PLATFORM_LINKEDIN !== 'false',
      discord: process.env.GTM_PLATFORM_DISCORD !== 'false',
      blog: process.env.GTM_PLATFORM_BLOG === 'true', // Blog disabled by default
    },
    contentRatio: {
      tutorial: 20,
      'deep-dive': 10,
      changelog: 15,
      'case-study': 10,
      'community-spotlight': 10,
      'quick-tip': 15,
      'industry-insight': 10,
      'week-preview': 5,
      milestone: 3,
      announcement: 2,
    },
  };
}

// ============================================================================
// URL CONFIGURATION
// ============================================================================

/**
 * Base URL for the developer blog
 */
export const BLOG_BASE_URL = process.env.GTM_BLOG_BASE_URL || 'https://developers.ferni.ai/blog';

/**
 * Generate a blog post URL for content
 */
export function getBlogUrl(contentId: string): string {
  return `${BLOG_BASE_URL}/${contentId}`;
}

// ============================================================================
// SOCIAL ACCOUNT CONFIGURATION
// ============================================================================

/**
 * Verify social accounts are configured for brand posting
 */
export function verifyBrandAccountConfig(): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check account type
  const accountType = process.env.SOCIAL_ACCOUNT_TYPE;
  if (accountType !== 'brand') {
    errors.push(
      `SOCIAL_ACCOUNT_TYPE is "${accountType || 'not set'}" - must be "brand" for Ferni posts`
    );
  }

  // Check LinkedIn Organization URN
  const linkedinOrg = process.env.LINKEDIN_ORGANIZATION_URN;
  if (!linkedinOrg) {
    warnings.push('LINKEDIN_ORGANIZATION_URN not set - LinkedIn posts will fail');
  } else if (!linkedinOrg.startsWith('urn:li:organization:')) {
    errors.push(`LINKEDIN_ORGANIZATION_URN invalid format: ${linkedinOrg}`);
  }

  // Check Twitter
  if (!process.env.TWITTER_ACCESS_TOKEN && !process.env.TWITTER_CLIENT_ID) {
    warnings.push('Twitter credentials not configured');
  }

  // Check Discord
  if (!process.env.DISCORD_WEBHOOK_URL && !process.env.DISCORD_BOT_TOKEN) {
    warnings.push('Discord credentials not configured');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// CONTENT RATIOS (TARGET DISTRIBUTION)
// ============================================================================

/**
 * Target content distribution by category
 * Values are percentages that should sum to 100
 */
export const CATEGORY_TARGET_RATIOS: Record<ContentCategory, number> = {
  tutorial: 25, // Weekly tutorials (main content driver)
  'deep-dive': 15, // Technical deep dives
  changelog: 10, // Product updates/releases
  'case-study': 10, // Customer stories
  'community-spotlight': 10, // Community highlights
  'quick-tip': 15, // Short tips (good engagement)
  'industry-insight': 5, // Industry trends
  'week-preview': 5, // Weekly previews
  milestone: 3, // Celebrations (opportunistic)
  announcement: 2, // Major announcements (rare)
};

/**
 * Target content distribution by pillar
 */
export const PILLAR_TARGET_RATIOS: Record<ContentPillar, number> = {
  tutorials: 30,
  'thought-leadership': 25,
  'product-updates': 20,
  community: 15,
  'behind-the-scenes': 10,
};

// ============================================================================
// SCHEDULING CONFIG
// ============================================================================

/**
 * Default publish times by platform (in local timezone)
 */
export const OPTIMAL_PUBLISH_TIMES = {
  twitter: ['09:00', '12:00', '17:00'], // Morning, lunch, evening
  linkedin: ['08:00', '12:00', '17:30'], // Business hours
  discord: ['10:00', '15:00', '20:00'], // Active community times
};

/**
 * Days to skip posting (e.g., weekends for B2B)
 */
export const SKIP_DAYS = process.env.GTM_SKIP_DAYS?.split(',').map(Number) || []; // e.g., [0, 6] for weekends
