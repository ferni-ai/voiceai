/**
 * Social Media Service Types
 *
 * Type definitions for multi-platform social media automation.
 *
 * @module services/social/types
 */

// ============================================================================
// PLATFORM TYPES
// ============================================================================

export type SocialPlatform =
  | 'twitter'
  | 'linkedin'
  | 'instagram'
  | 'tiktok'
  | 'medium'
  | 'discord';

export type AccountType = 'personal' | 'brand';

// ============================================================================
// POST TYPES
// ============================================================================

export interface SocialPost {
  /** Unique identifier */
  id?: string;

  /** Post content/text */
  content: string;

  /** Optional title (for Medium, LinkedIn articles) */
  title?: string;

  /** Media attachments */
  media?: SocialMedia[];

  /** Hashtags to include */
  hashtags?: string[];

  /** Link to include */
  link?: string;

  /** Platform-specific options */
  platformOptions?: Record<SocialPlatform, Record<string, unknown>>;

  /** Schedule for later (ISO timestamp) */
  scheduledFor?: string;

  /** Post category for analytics */
  category?: 'milestone' | 'story' | 'weekly_update' | 'announcement' | 'engagement';
}

export interface SocialMedia {
  type: 'image' | 'video' | 'gif';
  url: string;
  altText?: string;
}

// ============================================================================
// RESULT TYPES
// ============================================================================

export interface PostResult {
  platform: SocialPlatform;
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
  timestamp: string;
}

export interface MultiPlatformPostResult {
  post: SocialPost;
  results: PostResult[];
  successCount: number;
  failureCount: number;
  timestamp: string;
}

// ============================================================================
// CREDENTIAL TYPES
// ============================================================================

export interface PlatformCredentials {
  platform: SocialPlatform;
  accountType: AccountType;
  accountName: string;

  // OAuth tokens
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: string;

  // Platform-specific IDs
  userId?: string; // Twitter user ID
  personUrn?: string; // LinkedIn personal URN
  organizationUrn?: string; // LinkedIn company URN
  pageId?: string; // Facebook/Instagram page ID
  publicationId?: string; // Medium publication ID
  botToken?: string; // Discord bot token
  serverId?: string; // Discord server ID
  channelId?: string; // Discord channel ID

  // API keys (some platforms)
  apiKey?: string;
  apiSecret?: string;

  // Webhook URLs
  webhookUrl?: string;
}

export interface SocialConfig {
  /** Which platforms are enabled */
  enabledPlatforms: SocialPlatform[];

  /** Default account type (personal or brand) */
  defaultAccountType: AccountType;

  /** Platform credentials */
  credentials: Partial<Record<SocialPlatform, PlatformCredentials>>;

  /** Default hashtags to include */
  defaultHashtags?: string[];

  /** Brand voice settings */
  brandVoice?: {
    tone: 'warm' | 'professional' | 'playful' | 'inspiring';
    emoji: boolean;
    maxLength?: Record<SocialPlatform, number>;
  };
}

// ============================================================================
// PLATFORM LIMITS
// ============================================================================

export const PLATFORM_LIMITS: Record<SocialPlatform, { maxLength: number; maxMedia: number }> = {
  twitter: { maxLength: 280, maxMedia: 4 },
  linkedin: { maxLength: 3000, maxMedia: 9 },
  instagram: { maxLength: 2200, maxMedia: 10 },
  tiktok: { maxLength: 2200, maxMedia: 1 },
  medium: { maxLength: 100000, maxMedia: 50 },
  discord: { maxLength: 2000, maxMedia: 10 },
};
