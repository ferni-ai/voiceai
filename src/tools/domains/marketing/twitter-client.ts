/**
 * Twitter/X API Client
 *
 * Handles authentication and posting to Twitter via OAuth 2.0.
 * Uses Twitter API v2.
 */

import { getLogger } from '../../../utils/safe-logger.js';

const log = getLogger();

interface TwitterPostResult {
  success: boolean;
  tweetIds?: string[];
  url?: string;
  error?: string;
}

interface TwitterCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export class TwitterClient {
  private credentials: TwitterCredentials | null = null;
  private readonly baseUrl = 'https://api.twitter.com/2';

  constructor() {
    // Try to load credentials from environment or storage
    this.loadCredentials();
  }

  private loadCredentials(): void {
    // In production, load from secure storage (Firestore)
    // For now, check environment variables
    const accessToken = process.env.TWITTER_ACCESS_TOKEN;
    if (accessToken) {
      this.credentials = {
        accessToken,
        refreshToken: process.env.TWITTER_REFRESH_TOKEN || '',
        expiresAt: new Date(Date.now() + 7200000), // 2 hours from now
      };
    }
  }

  isConfigured(): boolean {
    return this.credentials !== null && this.credentials.accessToken !== '';
  }

  async postThread(tweets: string[]): Promise<TwitterPostResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'Twitter not configured. Connect your account first.',
      };
    }

    log.info({ tweetCount: tweets.length }, '🐦 Posting thread to Twitter');

    try {
      const tweetIds: string[] = [];
      let replyToId: string | undefined;

      for (const tweet of tweets) {
        const result = await this.postSingleTweet(tweet, replyToId);
        
        if (!result.success) {
          return result;
        }

        tweetIds.push(result.tweetIds![0]);
        replyToId = result.tweetIds![0];
      }

      const url = `https://twitter.com/ferniAI/status/${tweetIds[0]}`;
      
      log.info({ tweetIds, url }, '🐦 Thread posted successfully');

      return {
        success: true,
        tweetIds,
        url,
      };
    } catch (error) {
      log.error({ error: String(error) }, '🐦 Failed to post thread');
      return {
        success: false,
        error: String(error),
      };
    }
  }

  private async postSingleTweet(
    text: string,
    replyToId?: string
  ): Promise<TwitterPostResult> {
    if (!this.credentials) {
      return { success: false, error: 'Not authenticated' };
    }

    const body: Record<string, unknown> = { text };
    if (replyToId) {
      body.reply = { in_reply_to_tweet_id: replyToId };
    }

    try {
      const response = await fetch(`${this.baseUrl}/tweets`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.credentials.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.error({ status: response.status, error: errorText }, '🐦 Twitter API error');
        
        // Handle rate limiting
        if (response.status === 429) {
          return { success: false, error: 'Rate limited by Twitter. Try again in a few minutes.' };
        }
        
        // Handle auth errors
        if (response.status === 401 || response.status === 403) {
          return { success: false, error: 'Twitter authentication expired. Please reconnect your account.' };
        }

        return { success: false, error: `Twitter API error: ${errorText}` };
      }

      const data = (await response.json()) as { data: { id: string } };
      return {
        success: true,
        tweetIds: [data.data.id],
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async deleteTweet(tweetId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.credentials) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/tweets/${tweetId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${this.credentials.accessToken}`,
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
    const clientId = process.env.TWITTER_CLIENT_ID;
    const redirectUri = process.env.TWITTER_CALLBACK_URL || 'https://app.ferni.ai/api/marketing/twitter/callback';
    const scope = 'tweet.read tweet.write users.read offline.access';

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId || '',
      redirect_uri: redirectUri,
      scope,
      state,
      code_challenge: 'challenge', // PKCE - should be dynamic in production
      code_challenge_method: 'plain',
    });

    return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
  }

  static async exchangeCodeForTokens(
    code: string,
    codeVerifier: string
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number } | null> {
    const clientId = process.env.TWITTER_CLIENT_ID;
    const clientSecret = process.env.TWITTER_CLIENT_SECRET;
    const redirectUri = process.env.TWITTER_CALLBACK_URL || 'https://app.ferni.ai/api/marketing/twitter/callback';

    try {
      const response = await fetch('https://api.twitter.com/2/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }),
      });

      if (!response.ok) {
        log.error({ status: response.status }, '🐦 Token exchange failed');
        return null;
      }

      const data = (await response.json()) as { access_token: string; refresh_token: string; expires_in: number };
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
      };
    } catch (error) {
      log.error({ error: String(error) }, '🐦 Token exchange error');
      return null;
    }
  }
}

export default TwitterClient;

