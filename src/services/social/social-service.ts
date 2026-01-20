/**
 * Social Media Posting Service
 *
 * Unified service for posting to multiple social platforms.
 * Handles Twitter, LinkedIn, Discord, and more.
 *
 * Usage:
 *   const result = await postToSocial({
 *     content: "Exciting news! 🌿",
 *     platforms: ['twitter', 'linkedin'],
 *     category: 'announcement'
 *   });
 *
 * @module services/social/social-service
 */

import { createLogger } from '../../utils/safe-logger.js';
import { postToLinkedIn } from './linkedin-adapter.js';
import { postToTwitter } from './twitter-adapter.js';
import { postToDiscord } from './discord-adapter.js';
import type {
  SocialPost,
  PostResult,
  MultiPlatformPostResult,
  SocialPlatform,
  PlatformCredentials,
  SocialConfig,
  AccountType,
} from './types.js';

const log = createLogger({ module: 'social-service' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Load social config from environment variables
 */
export function loadSocialConfig(): SocialConfig {
  const config: SocialConfig = {
    enabledPlatforms: [],
    defaultAccountType: (process.env.SOCIAL_ACCOUNT_TYPE as AccountType) || 'brand',
    credentials: {},
    defaultHashtags: ['ferni', 'AI', 'personalAI'],
    brandVoice: {
      tone: 'warm',
      emoji: true,
      maxLength: {
        twitter: 260, // Leave room for links
        linkedin: 2500,
        instagram: 2000,
        tiktok: 2000,
        medium: 50000,
        discord: 1800,
      },
    },
  };

  // Twitter credentials
  if (process.env.TWITTER_ACCESS_TOKEN || process.env.TWITTER_CLIENT_ID) {
    config.enabledPlatforms.push('twitter');
    config.credentials.twitter = {
      platform: 'twitter',
      accountType: config.defaultAccountType,
      accountName: process.env.TWITTER_ACCOUNT_NAME || 'ferni',
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      refreshToken: process.env.TWITTER_REFRESH_TOKEN,
      apiKey: process.env.TWITTER_CLIENT_ID,
      apiSecret: process.env.TWITTER_CLIENT_SECRET,
      userId: process.env.TWITTER_USER_ID,
    };
  }

  // LinkedIn credentials
  if (process.env.LINKEDIN_ACCESS_TOKEN) {
    config.enabledPlatforms.push('linkedin');
    config.credentials.linkedin = {
      platform: 'linkedin',
      accountType: config.defaultAccountType,
      accountName: process.env.LINKEDIN_ACCOUNT_NAME || 'ferni',
      accessToken: process.env.LINKEDIN_ACCESS_TOKEN,
      refreshToken: process.env.LINKEDIN_REFRESH_TOKEN,
      apiKey: process.env.LINKEDIN_CLIENT_ID,
      apiSecret: process.env.LINKEDIN_CLIENT_SECRET,
      personUrn: process.env.LINKEDIN_PERSON_URN,
      organizationUrn: process.env.LINKEDIN_ORGANIZATION_URN,
    };
  }

  // Discord credentials
  if (process.env.DISCORD_WEBHOOK_URL || process.env.DISCORD_BOT_TOKEN) {
    config.enabledPlatforms.push('discord');
    config.credentials.discord = {
      platform: 'discord',
      accountType: 'brand', // Discord is always "brand" (it's a bot/server)
      accountName: 'Ferni Community',
      webhookUrl: process.env.DISCORD_WEBHOOK_URL,
      botToken: process.env.DISCORD_BOT_TOKEN,
      serverId: process.env.DISCORD_SERVER_ID,
      channelId: process.env.DISCORD_CHANNEL_ID,
    };
  }

  log.info('Social config loaded', {
    enabledPlatforms: config.enabledPlatforms,
    accountType: config.defaultAccountType,
  });

  return config;
}

// Cached config
let socialConfig: SocialConfig | null = null;

export function getSocialConfig(): SocialConfig {
  if (!socialConfig) {
    socialConfig = loadSocialConfig();
  }
  return socialConfig;
}

// ============================================================================
// POSTING FUNCTIONS
// ============================================================================

/**
 * Post to a single platform
 */
export async function postToPlatform(
  post: SocialPost,
  platform: SocialPlatform,
  credentials: PlatformCredentials
): Promise<PostResult> {
  switch (platform) {
    case 'twitter':
      return postToTwitter(post, credentials);
    case 'linkedin':
      return postToLinkedIn(post, credentials);
    case 'discord':
      return postToDiscord(post, credentials);
    default:
      return {
        platform,
        success: false,
        error: `Platform ${platform} not implemented yet`,
        timestamp: new Date().toISOString(),
      };
  }
}

/**
 * Post to multiple platforms
 */
export async function postToSocial(
  post: SocialPost & { platforms?: SocialPlatform[] }
): Promise<MultiPlatformPostResult> {
  const config = getSocialConfig();
  const timestamp = new Date().toISOString();

  // Determine which platforms to post to
  const platforms = post.platforms || config.enabledPlatforms;

  if (platforms.length === 0) {
    log.warn('No platforms enabled for social posting');
    return {
      post,
      results: [],
      successCount: 0,
      failureCount: 0,
      timestamp,
    };
  }

  // Add default hashtags if not specified
  if (!post.hashtags && config.defaultHashtags) {
    post.hashtags = config.defaultHashtags;
  }

  log.info('Posting to social platforms', {
    platforms,
    category: post.category,
    contentLength: post.content.length,
  });

  // Post to all platforms in parallel
  const results = await Promise.all(
    platforms.map(async (platform) => {
      const credentials = config.credentials[platform];
      if (!credentials) {
        return {
          platform,
          success: false,
          error: `No credentials configured for ${platform}`,
          timestamp,
        };
      }
      return postToPlatform(post, platform, credentials);
    })
  );

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.filter((r) => !r.success).length;

  log.info('Social posting complete', {
    successCount,
    failureCount,
    platforms: results.map((r) => ({ platform: r.platform, success: r.success })),
  });

  return {
    post,
    results,
    successCount,
    failureCount,
    timestamp,
  };
}

// ============================================================================
// HELPER FUNCTIONS FOR SPECIFIC POST TYPES
// ============================================================================

/**
 * Post a milestone celebration
 */
export async function postMilestoneCelebration(milestone: {
  name: string;
  description?: string;
  date: string;
}): Promise<MultiPlatformPostResult> {
  const content = `🎉 Milestone reached: ${milestone.name}!\n\n${milestone.description || 'Another step forward on our journey together.'}`;

  return postToSocial({
    content,
    category: 'milestone',
    hashtags: ['milestone', 'growth', 'ferni'],
  });
}

/**
 * Post a user story
 */
export async function postUserStory(story: {
  userName: string;
  quote: string;
  link?: string;
}): Promise<MultiPlatformPostResult> {
  const content = `"${story.quote}"\n\n— ${story.userName}\n\nReal stories from real people. 🌿`;

  return postToSocial({
    content,
    category: 'story',
    link: story.link,
    hashtags: ['fernistories', 'testimonial', 'AI'],
  });
}

/**
 * Post weekly brand update
 */
export async function postWeeklyUpdate(stats: {
  highlights: string[];
  metric?: { name: string; value: string };
}): Promise<MultiPlatformPostResult> {
  let content = '📊 This week at Ferni:\n\n';
  content += stats.highlights.map((h) => `• ${h}`).join('\n');

  if (stats.metric) {
    content += `\n\n📈 ${stats.metric.name}: ${stats.metric.value}`;
  }

  return postToSocial({
    content,
    category: 'weekly_update',
    hashtags: ['weeklyupdate', 'ferni', 'AI'],
  });
}

/**
 * Post an announcement
 */
export async function postAnnouncement(announcement: {
  title: string;
  body: string;
  link?: string;
}): Promise<MultiPlatformPostResult> {
  const content = `📢 ${announcement.title}\n\n${announcement.body}`;

  return postToSocial({
    content,
    title: announcement.title,
    category: 'announcement',
    link: announcement.link,
    hashtags: ['announcement', 'ferni', 'AI'],
  });
}

// ============================================================================
// STATUS CHECK
// ============================================================================

/**
 * Check which platforms are configured and ready
 */
export function getSocialStatus(): {
  platforms: Array<{
    platform: SocialPlatform;
    configured: boolean;
    accountType: AccountType;
    accountName: string;
  }>;
} {
  const config = getSocialConfig();
  const allPlatforms: SocialPlatform[] = [
    'twitter',
    'linkedin',
    'discord',
    'instagram',
    'tiktok',
    'medium',
  ];

  return {
    platforms: allPlatforms.map((platform) => {
      const creds = config.credentials[platform];
      return {
        platform,
        configured: !!creds,
        accountType: creds?.accountType || 'personal',
        accountName: creds?.accountName || 'not configured',
      };
    }),
  };
}
