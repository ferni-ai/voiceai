/**
 * Twitter/X Social Media Adapter
 *
 * Handles posting to Twitter/X using OAuth 2.0.
 * Works with both personal and brand accounts.
 *
 * @module services/social/twitter-adapter
 */

import * as crypto from 'crypto';
import { createLogger } from '../../utils/safe-logger.js';
import type { SocialPost, PostResult, PlatformCredentials } from './types.js';

const log = createLogger({ module: 'twitter-adapter' });

// ============================================================================
// TWITTER API
// ============================================================================

const TWITTER_API_BASE = 'https://api.twitter.com/2';

interface TwitterTweetPayload {
  text: string;
  media?: {
    media_ids: string[];
  };
}

// ============================================================================
// POST TO TWITTER
// ============================================================================

export async function postToTwitter(
  post: SocialPost,
  credentials: PlatformCredentials
): Promise<PostResult> {
  const timestamp = new Date().toISOString();

  try {
    if (!credentials.accessToken) {
      return {
        platform: 'twitter',
        success: false,
        error: 'No access token configured',
        timestamp,
      };
    }

    // Build tweet content (max 280 chars)
    let content = post.content;

    // Add hashtags
    if (post.hashtags?.length) {
      const hashtagStr = post.hashtags.map((h) => `#${h.replace('#', '')}`).join(' ');
      if (content.length + hashtagStr.length + 2 <= 280) {
        content += '\n\n' + hashtagStr;
      }
    }

    // Add link (Twitter auto-shortens, counts as 23 chars)
    if (post.link) {
      if (content.length + 24 <= 280) {
        content += '\n' + post.link;
      }
    }

    // Truncate if needed
    if (content.length > 280) {
      content = content.substring(0, 277) + '...';
    }

    const payload: TwitterTweetPayload = {
      text: content,
    };

    log.info('Posting to Twitter', {
      accountType: credentials.accountType,
      contentLength: content.length,
    });

    // Make API request
    const response = await fetch(`${TWITTER_API_BASE}/tweets`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error('Twitter API error', { status: response.status, error: errorText });
      return {
        platform: 'twitter',
        success: false,
        error: `Twitter API error: ${response.status} - ${errorText}`,
        timestamp,
      };
    }

    const result = await response.json();
    const tweetId = result.data?.id;
    const postUrl = tweetId ? `https://twitter.com/i/web/status/${tweetId}` : undefined;

    log.info('Twitter post successful', { tweetId, postUrl });

    return {
      platform: 'twitter',
      success: true,
      postId: tweetId,
      postUrl,
      timestamp,
    };
  } catch (error) {
    log.error('Twitter post failed', { error: String(error) });
    return {
      platform: 'twitter',
      success: false,
      error: String(error),
      timestamp,
    };
  }
}

// ============================================================================
// OAUTH 2.0 TOKEN REFRESH
// ============================================================================

export async function refreshTwitterToken(
  credentials: PlatformCredentials
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number } | null> {
  if (!credentials.refreshToken || !credentials.apiKey || !credentials.apiSecret) {
    log.warn('Cannot refresh Twitter token - missing credentials');
    return null;
  }

  try {
    const basicAuth = Buffer.from(`${credentials.apiKey}:${credentials.apiSecret}`).toString(
      'base64'
    );

    const response = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: credentials.refreshToken,
      }),
    });

    if (!response.ok) {
      log.error('Twitter token refresh failed', { status: response.status });
      return null;
    }

    const result = await response.json();
    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      expiresIn: result.expires_in,
    };
  } catch (error) {
    log.error('Twitter token refresh error', { error: String(error) });
    return null;
  }
}

// ============================================================================
// OAUTH 1.0a SIGNING (for some endpoints)
// ============================================================================

export function signOAuth1Request(
  method: string,
  url: string,
  params: Record<string, string>,
  credentials: {
    consumerKey: string;
    consumerSecret: string;
    accessToken: string;
    accessSecret: string;
  }
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: credentials.consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: credentials.accessToken,
    oauth_version: '1.0',
  };

  // Combine all params for signature
  const allParams = { ...params, ...oauthParams };
  const sortedParams = Object.keys(allParams)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
    .join('&');

  // Create signature base string
  const signatureBase = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(sortedParams),
  ].join('&');

  // Create signing key
  const signingKey = `${encodeURIComponent(credentials.consumerSecret)}&${encodeURIComponent(credentials.accessSecret)}`;

  // Generate signature
  const signature = crypto.createHmac('sha1', signingKey).update(signatureBase).digest('base64');

  oauthParams['oauth_signature'] = signature;

  // Build Authorization header
  return (
    'OAuth ' +
    Object.keys(oauthParams)
      .sort()
      .map((k) => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
      .join(', ')
  );
}
