/**
 * LinkedIn Social Media Adapter
 *
 * Handles posting to LinkedIn - both personal profiles and Company Pages.
 * For brand posting, use organizationUrn (Company Page).
 * For personal posting, use personUrn (your profile).
 *
 * @module services/social/linkedin-adapter
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { SocialPost, PostResult, PlatformCredentials } from './types.js';

const log = createLogger({ module: 'linkedin-adapter' });

// ============================================================================
// LINKEDIN API
// ============================================================================

const LINKEDIN_API_BASE = 'https://api.linkedin.com/v2';

interface LinkedInShareContent {
  shareCommentary: {
    text: string;
  };
  shareMediaCategory: 'NONE' | 'ARTICLE' | 'IMAGE';
  media?: Array<{
    status: 'READY';
    originalUrl?: string;
    title?: { text: string };
    description?: { text: string };
  }>;
}

interface LinkedInPostPayload {
  author: string; // urn:li:person:xxx or urn:li:organization:xxx
  lifecycleState: 'PUBLISHED';
  specificContent: {
    'com.linkedin.ugc.ShareContent': LinkedInShareContent;
  };
  visibility: {
    'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' | 'CONNECTIONS';
  };
}

// ============================================================================
// POST TO LINKEDIN
// ============================================================================

export async function postToLinkedIn(
  post: SocialPost,
  credentials: PlatformCredentials
): Promise<PostResult> {
  const timestamp = new Date().toISOString();

  try {
    // Determine author URN (brand vs personal)
    const authorUrn =
      credentials.accountType === 'brand' && credentials.organizationUrn
        ? credentials.organizationUrn
        : credentials.personUrn;

    if (!authorUrn) {
      return {
        platform: 'linkedin',
        success: false,
        error: `No ${credentials.accountType === 'brand' ? 'organizationUrn' : 'personUrn'} configured`,
        timestamp,
      };
    }

    if (!credentials.accessToken) {
      return {
        platform: 'linkedin',
        success: false,
        error: 'No access token configured',
        timestamp,
      };
    }

    // Build post content
    let content = post.content;
    if (post.hashtags?.length) {
      content += '\n\n' + post.hashtags.map((h) => `#${h.replace('#', '')}`).join(' ');
    }
    if (post.link) {
      content += `\n\n${post.link}`;
    }

    // Build share content
    const shareContent: LinkedInShareContent = {
      shareCommentary: { text: content },
      shareMediaCategory: post.link ? 'ARTICLE' : 'NONE',
    };

    // Add article/link if present
    if (post.link) {
      shareContent.media = [
        {
          status: 'READY',
          originalUrl: post.link,
          title: post.title ? { text: post.title } : undefined,
        },
      ];
    }

    // Build payload
    const payload: LinkedInPostPayload = {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': shareContent,
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    };

    log.info('Posting to LinkedIn', {
      accountType: credentials.accountType,
      authorUrn: authorUrn.substring(0, 30) + '...',
      contentLength: content.length,
    });

    // Make API request
    const response = await fetch(`${LINKEDIN_API_BASE}/ugcPosts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error('LinkedIn API error', { status: response.status, error: errorText });
      return {
        platform: 'linkedin',
        success: false,
        error: `LinkedIn API error: ${response.status} - ${errorText}`,
        timestamp,
      };
    }

    const result = await response.json();
    const postId = result.id;
    const postUrl = `https://www.linkedin.com/feed/update/${postId}`;

    log.info('LinkedIn post successful', { postId, postUrl });

    return {
      platform: 'linkedin',
      success: true,
      postId,
      postUrl,
      timestamp,
    };
  } catch (error) {
    log.error('LinkedIn post failed', { error: String(error) });
    return {
      platform: 'linkedin',
      success: false,
      error: String(error),
      timestamp,
    };
  }
}

// ============================================================================
// REFRESH TOKEN
// ============================================================================

export async function refreshLinkedInToken(
  credentials: PlatformCredentials
): Promise<{ accessToken: string; expiresIn: number } | null> {
  if (!credentials.refreshToken || !credentials.apiKey || !credentials.apiSecret) {
    log.warn('Cannot refresh LinkedIn token - missing credentials');
    return null;
  }

  try {
    const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: credentials.refreshToken,
        client_id: credentials.apiKey,
        client_secret: credentials.apiSecret,
      }),
    });

    if (!response.ok) {
      log.error('LinkedIn token refresh failed', { status: response.status });
      return null;
    }

    const result = await response.json();
    return {
      accessToken: result.access_token,
      expiresIn: result.expires_in,
    };
  } catch (error) {
    log.error('LinkedIn token refresh error', { error: String(error) });
    return null;
  }
}
