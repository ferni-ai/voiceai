/**
 * Discord Social Media Adapter
 *
 * Handles posting to Discord channels via bot or webhook.
 * Use webhooks for simple posting, bot for interactive features.
 *
 * @module services/social/discord-adapter
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { SocialPost, PostResult, PlatformCredentials } from './types.js';

const log = createLogger({ module: 'discord-adapter' });

// ============================================================================
// DISCORD API
// ============================================================================

const DISCORD_API_BASE = 'https://discord.com/api/v10';

interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  footer?: { text: string };
  image?: { url: string };
  thumbnail?: { url: string };
  author?: { name: string; icon_url?: string };
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  timestamp?: string;
}

interface DiscordWebhookPayload {
  content?: string;
  username?: string;
  avatar_url?: string;
  embeds?: DiscordEmbed[];
}

interface DiscordBotPayload {
  content?: string;
  embeds?: DiscordEmbed[];
}

// ============================================================================
// BRAND COLORS
// ============================================================================

const FERNI_GREEN = 0x4a6741; // Brand green as decimal

// ============================================================================
// POST VIA WEBHOOK (Simple - No Bot Required)
// ============================================================================

export async function postToDiscordWebhook(
  post: SocialPost,
  credentials: PlatformCredentials
): Promise<PostResult> {
  const timestamp = new Date().toISOString();

  try {
    if (!credentials.webhookUrl) {
      return {
        platform: 'discord',
        success: false,
        error: 'No webhook URL configured',
        timestamp,
      };
    }

    // Build embed for rich content
    const embed: DiscordEmbed = {
      description: post.content,
      color: FERNI_GREEN,
      timestamp,
    };

    if (post.title) {
      embed.title = post.title;
    }

    if (post.link) {
      embed.url = post.link;
    }

    if (post.media?.[0]) {
      embed.image = { url: post.media[0].url };
    }

    // Add category as footer
    if (post.category) {
      const categoryEmoji: Record<string, string> = {
        milestone: '🎉',
        story: '📖',
        weekly_update: '📊',
        announcement: '📢',
        engagement: '💬',
      };
      embed.footer = {
        text: `${categoryEmoji[post.category] || '🌿'} ${post.category.replace('_', ' ')}`,
      };
    }

    const payload: DiscordWebhookPayload = {
      username: 'Ferni',
      avatar_url: 'https://ferni.ai/logo.png', // Update with actual logo URL
      embeds: [embed],
    };

    // Add hashtags as plain content above embed
    if (post.hashtags?.length) {
      payload.content = post.hashtags.map((h) => `#${h.replace('#', '')}`).join(' ');
    }

    log.info('Posting to Discord via webhook', {
      contentLength: post.content.length,
      hasEmbed: true,
    });

    const response = await fetch(credentials.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error('Discord webhook error', { status: response.status, error: errorText });
      return {
        platform: 'discord',
        success: false,
        error: `Discord webhook error: ${response.status} - ${errorText}`,
        timestamp,
      };
    }

    log.info('Discord webhook post successful');

    return {
      platform: 'discord',
      success: true,
      timestamp,
    };
  } catch (error) {
    log.error('Discord webhook post failed', { error: String(error) });
    return {
      platform: 'discord',
      success: false,
      error: String(error),
      timestamp,
    };
  }
}

// ============================================================================
// POST VIA BOT (Advanced - Requires Bot Token)
// ============================================================================

export async function postToDiscordBot(
  post: SocialPost,
  credentials: PlatformCredentials
): Promise<PostResult> {
  const timestamp = new Date().toISOString();

  try {
    if (!credentials.botToken) {
      return {
        platform: 'discord',
        success: false,
        error: 'No bot token configured',
        timestamp,
      };
    }

    if (!credentials.channelId) {
      return {
        platform: 'discord',
        success: false,
        error: 'No channel ID configured',
        timestamp,
      };
    }

    // Build embed for rich content
    const embed: DiscordEmbed = {
      description: post.content,
      color: FERNI_GREEN,
      timestamp,
    };

    if (post.title) {
      embed.title = post.title;
    }

    if (post.link) {
      embed.url = post.link;
    }

    if (post.media?.[0]) {
      embed.image = { url: post.media[0].url };
    }

    const payload: DiscordBotPayload = {
      embeds: [embed],
    };

    if (post.hashtags?.length) {
      payload.content = post.hashtags.map((h) => `#${h.replace('#', '')}`).join(' ');
    }

    log.info('Posting to Discord via bot', {
      channelId: credentials.channelId,
      contentLength: post.content.length,
    });

    const response = await fetch(
      `${DISCORD_API_BASE}/channels/${credentials.channelId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bot ${credentials.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      log.error('Discord bot error', { status: response.status, error: errorText });
      return {
        platform: 'discord',
        success: false,
        error: `Discord bot error: ${response.status} - ${errorText}`,
        timestamp,
      };
    }

    const result = await response.json();
    const messageId = result.id;
    const postUrl = `https://discord.com/channels/${credentials.serverId}/${credentials.channelId}/${messageId}`;

    log.info('Discord bot post successful', { messageId });

    return {
      platform: 'discord',
      success: true,
      postId: messageId,
      postUrl,
      timestamp,
    };
  } catch (error) {
    log.error('Discord bot post failed', { error: String(error) });
    return {
      platform: 'discord',
      success: false,
      error: String(error),
      timestamp,
    };
  }
}

// ============================================================================
// MAIN POST FUNCTION (Auto-selects webhook vs bot)
// ============================================================================

export async function postToDiscord(
  post: SocialPost,
  credentials: PlatformCredentials
): Promise<PostResult> {
  // Prefer webhook for simplicity, fall back to bot
  if (credentials.webhookUrl) {
    return postToDiscordWebhook(post, credentials);
  } else if (credentials.botToken && credentials.channelId) {
    return postToDiscordBot(post, credentials);
  } else {
    return {
      platform: 'discord',
      success: false,
      error: 'No Discord credentials configured (need webhookUrl or botToken+channelId)',
      timestamp: new Date().toISOString(),
    };
  }
}
