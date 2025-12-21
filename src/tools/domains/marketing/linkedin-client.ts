/**
 * LinkedIn API Client
 *
 * Handles authentication and posting to LinkedIn via OAuth 2.0.
 * Uses LinkedIn Marketing API v2.
 */

import { getLogger } from '../../../utils/safe-logger.js';

const log = getLogger();

interface LinkedInPostResult {
  success: boolean;
  postId?: string;
  url?: string;
  error?: string;
}

interface LinkedInCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  organizationId?: string; // For company pages
  personUrn?: string; // For personal profiles
}

interface LinkedInPostParams {
  content: string;
  visibility: 'public' | 'connections';
  mediaUrls?: string[];
}

export class LinkedInClient {
  private credentials: LinkedInCredentials | null = null;
  private readonly baseUrl = 'https://api.linkedin.com/v2';

  constructor() {
    this.loadCredentials();
  }

  private loadCredentials(): void {
    const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
    if (accessToken) {
      this.credentials = {
        accessToken,
        refreshToken: process.env.LINKEDIN_REFRESH_TOKEN || '',
        expiresAt: new Date(Date.now() + 3600000), // 1 hour
        organizationId: process.env.LINKEDIN_ORGANIZATION_ID,
        personUrn: process.env.LINKEDIN_PERSON_URN,
      };
    }
  }

  isConfigured(): boolean {
    return this.credentials !== null && this.credentials.accessToken !== '';
  }

  async post(params: LinkedInPostParams): Promise<LinkedInPostResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'LinkedIn not configured. Connect your account first.',
      };
    }

    log.info({ contentLength: params.content.length }, '💼 Posting to LinkedIn');

    try {
      // Determine author (organization page or personal profile)
      const author = this.credentials!.organizationId
        ? `urn:li:organization:${this.credentials!.organizationId}`
        : this.credentials!.personUrn || 'urn:li:person:unknown';

      // Build the post payload (UGC Post format)
      const payload = {
        author,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: params.content,
            },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility':
            params.visibility === 'public' ? 'PUBLIC' : 'CONNECTIONS',
        },
      };

      const response = await fetch(`${this.baseUrl}/ugcPosts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.credentials!.accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.error({ status: response.status, error: errorText }, '💼 LinkedIn API error');

        if (response.status === 401 || response.status === 403) {
          return {
            success: false,
            error: 'LinkedIn authentication expired. Please reconnect your account.',
          };
        }

        if (response.status === 429) {
          return {
            success: false,
            error: 'Rate limited by LinkedIn. Try again later.',
          };
        }

        return { success: false, error: `LinkedIn API error: ${errorText}` };
      }

      // Get the post ID from the response header
      const postId = response.headers.get('x-restli-id') || 'unknown';

      // Construct the post URL
      const activityUrn = postId.replace('urn:li:share:', '');
      const url = `https://www.linkedin.com/feed/update/${activityUrn}`;

      log.info({ postId, url }, '💼 LinkedIn post successful');

      return {
        success: true,
        postId,
        url,
      };
    } catch (error) {
      log.error({ error: String(error) }, '💼 LinkedIn post failed');
      return {
        success: false,
        error: String(error),
      };
    }
  }

  async deletePost(postId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.credentials) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/ugcPosts/${encodeURIComponent(postId)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${this.credentials.accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: errorText };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  // OAuth flow helpers
  static getAuthorizationUrl(state: string): string {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const redirectUri =
      process.env.LINKEDIN_CALLBACK_URL || 'https://app.ferni.ai/api/marketing/linkedin/callback';
    const scope = 'r_liteprofile r_emailaddress w_member_social';

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId || '',
      redirect_uri: redirectUri,
      scope,
      state,
    });

    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  }

  static async exchangeCodeForTokens(
    code: string
  ): Promise<{ accessToken: string; expiresIn: number } | null> {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    const redirectUri =
      process.env.LINKEDIN_CALLBACK_URL || 'https://app.ferni.ai/api/marketing/linkedin/callback';

    try {
      const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: clientId || '',
          client_secret: clientSecret || '',
        }),
      });

      if (!response.ok) {
        log.error({ status: response.status }, '💼 LinkedIn token exchange failed');
        return null;
      }

      const data = (await response.json()) as { access_token: string; expires_in: number };
      return {
        accessToken: data.access_token,
        expiresIn: data.expires_in,
      };
    } catch (error) {
      log.error({ error: String(error) }, '💼 LinkedIn token exchange error');
      return null;
    }
  }

  // Get the current user's profile (to get the personUrn)
  async getProfile(): Promise<{ personUrn: string; name: string } | null> {
    if (!this.credentials) return null;

    try {
      const response = await fetch(`${this.baseUrl}/me`, {
        headers: {
          Authorization: `Bearer ${this.credentials.accessToken}`,
        },
      });

      if (!response.ok) return null;

      const data = (await response.json()) as {
        id: string;
        localizedFirstName: string;
        localizedLastName: string;
      };
      return {
        personUrn: data.id,
        name: `${data.localizedFirstName} ${data.localizedLastName}`,
      };
    } catch {
      return null;
    }
  }
}

export default LinkedInClient;
