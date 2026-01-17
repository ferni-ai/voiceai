/**
 * Platform API Clients
 *
 * Integrations with external platforms for automated posting:
 * - Reddit API (via OAuth)
 * - TikTok API (limited - requires Business Account)
 * - Email sending (via Resend)
 *
 * Each client handles authentication and rate limiting.
 */

import { getSettings, updateSettings } from './growth-storage.js';
import { getGrowthMetrics } from './growth-metrics.js';

// ============================================================================
// TYPES
// ============================================================================

export interface PostResult {
  success: boolean;
  platformId?: string;
  url?: string;
  error?: string;
}

export interface RedditCredentials {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  userAgent: string;
}

export interface TikTokCredentials {
  accessToken: string;
  openId: string;
}

export interface EmailCredentials {
  apiKey: string;
  fromEmail: string;
  fromName: string;
}

// ============================================================================
// REDDIT CLIENT
// ============================================================================

class RedditClient {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private credentials: RedditCredentials | null = null;

  async initialize(credentials: RedditCredentials): Promise<void> {
    this.credentials = credentials;
    await this.refreshToken();
  }

  private async refreshToken(): Promise<void> {
    if (!this.credentials) {
      throw new Error('Reddit credentials not set');
    }

    const auth = Buffer.from(
      `${this.credentials.clientId}:${this.credentials.clientSecret}`
    ).toString('base64');

    const response = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': this.credentials.userAgent,
      },
      body: new URLSearchParams({
        grant_type: 'password',
        username: this.credentials.username,
        password: this.credentials.password,
      }),
    });

    if (!response.ok) {
      throw new Error(`Reddit auth failed: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };

    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + data.expires_in * 1000;
  }

  private async ensureToken(): Promise<string> {
    if (!this.accessToken || Date.now() > this.tokenExpiry - 60000) {
      await this.refreshToken();
    }
    return this.accessToken!;
  }

  async submitPost(
    subreddit: string,
    title: string,
    body: string
  ): Promise<PostResult> {
    const metrics = getGrowthMetrics();
    try {
      const token = await this.ensureToken();

      const response = await fetch('https://oauth.reddit.com/api/submit', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': this.credentials?.userAgent || 'FerniGrowthBot/1.0',
        },
        body: new URLSearchParams({
          api_type: 'json',
          kind: 'self',
          sr: subreddit,
          title,
          text: body,
        }),
      });

      if (!response.ok) {
        metrics.recordApiCall('reddit', false);
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const data = (await response.json()) as {
        json: {
          errors: string[][];
          data?: { id: string; url: string };
        };
      };

      if (data.json.errors?.length > 0) {
        metrics.recordApiCall('reddit', false);
        return { success: false, error: data.json.errors.map((e) => e.join(': ')).join(', ') };
      }

      metrics.recordApiCall('reddit', true);
      return {
        success: true,
        platformId: data.json.data?.id,
        url: data.json.data?.url,
      };
    } catch (error) {
      metrics.recordApiCall('reddit', false);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async submitComment(postId: string, body: string): Promise<PostResult> {
    const metrics = getGrowthMetrics();
    try {
      const token = await this.ensureToken();

      const response = await fetch('https://oauth.reddit.com/api/comment', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': this.credentials?.userAgent || 'FerniGrowthBot/1.0',
        },
        body: new URLSearchParams({
          api_type: 'json',
          thing_id: `t3_${postId}`,
          text: body,
        }),
      });

      if (!response.ok) {
        metrics.recordApiCall('reddit', false);
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const data = (await response.json()) as {
        json: {
          errors: string[][];
          data?: { things: Array<{ data: { id: string } }> };
        };
      };

      if (data.json.errors?.length > 0) {
        metrics.recordApiCall('reddit', false);
        return { success: false, error: data.json.errors.map((e) => e.join(': ')).join(', ') };
      }

      metrics.recordApiCall('reddit', true);
      return {
        success: true,
        platformId: data.json.data?.things?.[0]?.data?.id,
      };
    } catch (error) {
      metrics.recordApiCall('reddit', false);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getKarma(): Promise<{ link: number; comment: number } | null> {
    try {
      const token = await this.ensureToken();

      const response = await fetch('https://oauth.reddit.com/api/v1/me', {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': this.credentials?.userAgent || 'FerniGrowthBot/1.0',
        },
      });

      if (!response.ok) return null;

      const data = (await response.json()) as {
        link_karma: number;
        comment_karma: number;
      };

      return {
        link: data.link_karma,
        comment: data.comment_karma,
      };
    } catch {
      return null;
    }
  }
}

// ============================================================================
// TIKTOK CLIENT (Limited API - mostly for content management)
// ============================================================================

class TikTokClient {
  private credentials: TikTokCredentials | null = null;

  async initialize(credentials: TikTokCredentials): Promise<void> {
    this.credentials = credentials;
  }

  /**
   * TikTok's API is very limited for posting.
   * Most posting requires:
   * 1. TikTok Business Account
   * 2. Approved developer application
   * 3. Manual content upload via their Content Posting API (beta)
   *
   * This method prepares content for posting but actual posting
   * often requires manual steps or their mobile app.
   */
  async prepareVideoPost(
    videoUrl: string,
    caption: string,
    _hashtags: string[]
  ): Promise<PostResult> {
    const metrics = getGrowthMetrics();
    if (!this.credentials) {
      return { success: false, error: 'TikTok credentials not configured' };
    }

    // TikTok Content Posting API (requires approval)
    // https://developers.tiktok.com/doc/content-posting-api-get-started
    try {
      const response = await fetch(
        'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.credentials.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            source_info: {
              source: 'PULL_FROM_URL',
              video_url: videoUrl,
            },
            post_info: {
              title: caption.slice(0, 150),
              privacy_level: 'PUBLIC_TO_EVERYONE',
              disable_duet: false,
              disable_stitch: false,
              disable_comment: false,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        metrics.recordApiCall('tiktok', false);
        return {
          success: false,
          error: `TikTok API error: ${response.status} - ${errorText}`,
        };
      }

      const data = (await response.json()) as {
        data?: { publish_id: string };
        error?: { code: string; message: string };
      };

      if (data.error) {
        metrics.recordApiCall('tiktok', false);
        return { success: false, error: `${data.error.code}: ${data.error.message}` };
      }

      metrics.recordApiCall('tiktok', true);
      return {
        success: true,
        platformId: data.data?.publish_id,
      };
    } catch (error) {
      metrics.recordApiCall('tiktok', false);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Alternative: Generate content ready for manual posting
   */
  generateManualPostInstructions(
    script: string,
    hashtags: string[],
    accountHandle: string
  ): string {
    const hashtagString = hashtags.map((h) => `#${h}`).join(' ');
    return `
📱 TIKTOK POST INSTRUCTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━

Account: @${accountHandle}

📝 SCRIPT:
${script}

#️⃣ HASHTAGS:
${hashtagString}

📋 STEPS:
1. Open TikTok app
2. Record/upload video following script
3. Add caption with hashtags
4. Post at optimal time (7am, 10am, 2pm, 5pm, or 9pm)
`;
  }
}

// ============================================================================
// EMAIL CLIENT (using Resend)
// ============================================================================

class EmailClient {
  private credentials: EmailCredentials | null = null;

  async initialize(credentials: EmailCredentials): Promise<void> {
    this.credentials = credentials;
  }

  async sendEmail(
    to: string,
    subject: string,
    body: string,
    options: { replyTo?: string; bcc?: string } = {}
  ): Promise<PostResult> {
    const metrics = getGrowthMetrics();
    if (!this.credentials) {
      return { success: false, error: 'Email credentials not configured' };
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.credentials.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${this.credentials.fromName} <${this.credentials.fromEmail}>`,
          to: [to],
          subject,
          text: body,
          reply_to: options.replyTo,
          bcc: options.bcc ? [options.bcc] : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { message?: string };
        metrics.recordApiCall('email', false);
        return {
          success: false,
          error: `Resend error: ${response.status} - ${errorData.message || response.statusText}`,
        };
      }

      const data = (await response.json()) as { id: string };

      metrics.recordApiCall('email', true);
      return {
        success: true,
        platformId: data.id,
      };
    } catch (error) {
      metrics.recordApiCall('email', false);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async sendBulkEmails(
    emails: Array<{ to: string; subject: string; body: string }>,
    delayMs = 1000
  ): Promise<{ sent: number; failed: number; results: PostResult[] }> {
    const results: PostResult[] = [];
    let sent = 0;
    let failed = 0;

    for (const email of emails) {
      const result = await this.sendEmail(email.to, email.subject, email.body);
      results.push(result);

      if (result.success) {
        sent++;
      } else {
        failed++;
      }

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    return { sent, failed, results };
  }
}

// ============================================================================
// PLATFORM MANAGER (Singleton)
// ============================================================================

class PlatformManager {
  private reddit: RedditClient | null = null;
  private tiktok: TikTokClient | null = null;
  private email: EmailClient | null = null;

  async initializeReddit(): Promise<RedditClient> {
    const settings = await getSettings();

    if (!settings.redditClientId || !settings.redditClientSecret) {
      throw new Error(
        'Reddit credentials not configured. Run:\n' +
          '  ferni growth platform reddit --client-id <id> --client-secret <secret> --username <user> --password <pass>'
      );
    }

    this.reddit = new RedditClient();
    await this.reddit.initialize({
      clientId: settings.redditClientId,
      clientSecret: settings.redditClientSecret,
      username: settings.redditUsername || '',
      password: settings.redditPassword || '',
      userAgent: 'FerniGrowthBot/1.0 (by /u/ferni_ai)',
    });

    return this.reddit;
  }

  async initializeTikTok(): Promise<TikTokClient> {
    const settings = await getSettings();

    if (!settings.tiktokAccessToken) {
      throw new Error(
        'TikTok credentials not configured. Run:\n' +
          '  ferni growth platform tiktok --access-token <token> --open-id <id>'
      );
    }

    this.tiktok = new TikTokClient();
    await this.tiktok.initialize({
      accessToken: settings.tiktokAccessToken,
      openId: settings.tiktokOpenId || '',
    });

    return this.tiktok;
  }

  async initializeEmail(): Promise<EmailClient> {
    const settings = await getSettings();

    if (!settings.resendApiKey) {
      throw new Error(
        'Email credentials not configured. Run:\n' +
          '  ferni growth platform email --api-key <resend-key> --from-email <email> --from-name "Ferni"'
      );
    }

    this.email = new EmailClient();
    await this.email.initialize({
      apiKey: settings.resendApiKey,
      fromEmail: settings.emailFromAddress || 'hello@ferni.ai',
      fromName: settings.emailFromName || 'Ferni',
    });

    return this.email;
  }

  getReddit(): RedditClient | null {
    return this.reddit;
  }

  getTikTok(): TikTokClient | null {
    return this.tiktok;
  }

  getEmail(): EmailClient | null {
    return this.email;
  }
}

// Singleton instance
let platformManager: PlatformManager | null = null;

export function getPlatformManager(): PlatformManager {
  if (!platformManager) {
    platformManager = new PlatformManager();
  }
  return platformManager;
}

// ============================================================================
// CONFIGURATION COMMANDS
// ============================================================================

export async function configureReddit(options: {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
}): Promise<void> {
  await updateSettings({
    redditClientId: options.clientId,
    redditClientSecret: options.clientSecret,
    redditUsername: options.username,
    redditPassword: options.password,
  });
}

export async function configureTikTok(options: {
  accessToken: string;
  openId: string;
}): Promise<void> {
  await updateSettings({
    tiktokAccessToken: options.accessToken,
    tiktokOpenId: options.openId,
  });
}

export async function configureEmail(options: {
  apiKey: string;
  fromEmail: string;
  fromName: string;
}): Promise<void> {
  await updateSettings({
    resendApiKey: options.apiKey,
    emailFromAddress: options.fromEmail,
    emailFromName: options.fromName,
  });
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

export async function postToReddit(
  subreddit: string,
  title: string,
  body: string
): Promise<PostResult> {
  const manager = getPlatformManager();
  const reddit = manager.getReddit() || (await manager.initializeReddit());
  return reddit.submitPost(subreddit, title, body);
}

export async function commentOnReddit(
  postId: string,
  body: string
): Promise<PostResult> {
  const manager = getPlatformManager();
  const reddit = manager.getReddit() || (await manager.initializeReddit());
  return reddit.submitComment(postId, body);
}

export async function sendOutreachEmail(
  to: string,
  subject: string,
  body: string
): Promise<PostResult> {
  const manager = getPlatformManager();
  const email = manager.getEmail() || (await manager.initializeEmail());
  return email.sendEmail(to, subject, body);
}

export function generateTikTokInstructions(
  script: string,
  hashtags: string[],
  accountHandle: string
): string {
  const client = new TikTokClient();
  return client.generateManualPostInstructions(script, hashtags, accountHandle);
}

// ============================================================================
// EXPORTS
// ============================================================================

export { RedditClient, TikTokClient, EmailClient, PlatformManager };
