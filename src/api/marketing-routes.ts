/**
 * Marketing Routes
 *
 * API endpoints for social media marketing management.
 * Used by Alex (via tools) and the marketing dashboard UI.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { TwitterClient } from '../tools/domains/marketing/twitter-client.js';
import { LinkedInClient } from '../tools/domains/marketing/linkedin-client.js';
import { MarketingStorage } from '../tools/domains/marketing/storage.js';
import { getLogger } from '../utils/safe-logger.js';

const log = getLogger();

// In-memory state for OAuth flows (use Redis in production)
const oauthStates = new Map<string, { userId: string; platform: string; timestamp: number }>();

/**
 * Handle marketing-related API routes
 */
export async function handleMarketingRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Only handle /api/marketing/* routes
  if (!pathname.startsWith('/api/marketing')) {
    return false;
  }

  const query = parsedUrl.searchParams;
  const method = req.method || 'GET';

  // ============================================================================
  // OAuth - Twitter
  // ============================================================================

  if (pathname === '/api/marketing/twitter/connect' && method === 'GET') {
    const userId = query.get('userId');

    if (!userId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'userId required' }));
      return true;
    }

    // Generate state for CSRF protection
    const state = `tw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    oauthStates.set(state, { userId, platform: 'twitter', timestamp: Date.now() });

    // Clean up old states (older than 10 minutes)
    const tenMinutesAgo = Date.now() - 600000;
    for (const [key, value] of oauthStates.entries()) {
      if (value.timestamp < tenMinutesAgo) {
        oauthStates.delete(key);
      }
    }

    const authUrl = TwitterClient.getAuthorizationUrl(state);
    res.writeHead(302, { Location: authUrl });
    res.end();
    return true;
  }

  if (pathname === '/api/marketing/twitter/callback' && method === 'GET') {
    const code = query.get('code');
    const state = query.get('state');

    if (!code || !state) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing code or state' }));
      return true;
    }

    const savedState = oauthStates.get(state);
    if (!savedState || savedState.platform !== 'twitter') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid state' }));
      return true;
    }

    oauthStates.delete(state);

    try {
      const tokens = await TwitterClient.exchangeCodeForTokens(code, 'challenge');

      if (!tokens) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to exchange tokens' }));
        return true;
      }

      // TODO: Store tokens securely for the user
      log.info({ userId: savedState.userId }, '🐦 Twitter connected successfully');

      // Redirect to success page
      res.writeHead(302, { Location: '/settings/social-accounts?connected=twitter' });
      res.end();
    } catch (error) {
      log.error({ error: String(error) }, '🐦 Twitter OAuth callback failed');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'OAuth failed' }));
    }
    return true;
  }

  // ============================================================================
  // OAuth - LinkedIn
  // ============================================================================

  if (pathname === '/api/marketing/linkedin/connect' && method === 'GET') {
    const userId = query.get('userId');

    if (!userId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'userId required' }));
      return true;
    }

    const state = `li_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    oauthStates.set(state, { userId, platform: 'linkedin', timestamp: Date.now() });

    const authUrl = LinkedInClient.getAuthorizationUrl(state);
    res.writeHead(302, { Location: authUrl });
    res.end();
    return true;
  }

  if (pathname === '/api/marketing/linkedin/callback' && method === 'GET') {
    const code = query.get('code');
    const state = query.get('state');

    if (!code || !state) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing code or state' }));
      return true;
    }

    const savedState = oauthStates.get(state);
    if (!savedState || savedState.platform !== 'linkedin') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid state' }));
      return true;
    }

    oauthStates.delete(state);

    try {
      const tokens = await LinkedInClient.exchangeCodeForTokens(code);

      if (!tokens) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to exchange tokens' }));
        return true;
      }

      // TODO: Store tokens securely for the user
      log.info({ userId: savedState.userId }, '💼 LinkedIn connected successfully');

      res.writeHead(302, { Location: '/settings/social-accounts?connected=linkedin' });
      res.end();
    } catch (error) {
      log.error({ error: String(error) }, '💼 LinkedIn OAuth callback failed');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'OAuth failed' }));
    }
    return true;
  }

  // ============================================================================
  // Account Status
  // ============================================================================

  if (pathname === '/api/marketing/accounts' && method === 'GET') {
    const twitterClient = new TwitterClient();
    const linkedInClient = new LinkedInClient();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        accounts: [
          {
            platform: 'twitter',
            connected: twitterClient.isConfigured(),
            username: process.env.TWITTER_USERNAME || null,
          },
          {
            platform: 'linkedin',
            connected: linkedInClient.isConfigured(),
            organizationName: process.env.LINKEDIN_ORGANIZATION_NAME || null,
          },
        ],
      })
    );
    return true;
  }

  // ============================================================================
  // Content Management
  // ============================================================================

  if (pathname === '/api/marketing/posts' && method === 'GET') {
    const userId = query.get('userId') || 'default';
    const platform = query.get('platform');
    const status = query.get('status');
    const limit = parseInt(query.get('limit') || '20');

    try {
      const storage = new MarketingStorage(userId);
      const posts = await storage.getScheduledPosts({
        platform: platform && platform !== 'all' ? platform : undefined,
        status: status && status !== 'all' ? status : undefined,
        limit,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ posts }));
    } catch (error) {
      log.error({ error: String(error) }, '📣 Failed to list posts');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to list posts' }));
    }
    return true;
  }

  if (pathname === '/api/marketing/posts' && method === 'POST') {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }

    try {
      const { userId, platform, content, scheduledAt } = JSON.parse(body);

      if (!userId || !platform || !content) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'userId, platform, and content required' }));
        return true;
      }

      const storage = new MarketingStorage(userId);
      const postId = await storage.schedulePost({
        platform,
        content,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
        status: scheduledAt ? 'scheduled' : 'draft',
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, postId }));
    } catch (error) {
      log.error({ error: String(error) }, '📣 Failed to create post');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to create post' }));
    }
    return true;
  }

  // ============================================================================
  // Analytics
  // ============================================================================

  if (pathname === '/api/marketing/analytics' && method === 'GET') {
    const userId = query.get('userId') || 'default';
    const platform = query.get('platform') || 'all';
    const period = query.get('period') || 'week';

    try {
      const storage = new MarketingStorage(userId);
      const analytics = await storage.getAnalytics({
        platform: platform && platform !== 'all' ? (platform as 'twitter' | 'linkedin') : undefined,
        period: period as 'today' | 'week' | 'month' | 'quarter',
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(analytics));
    } catch (error) {
      log.error({ error: String(error) }, '📣 Failed to get analytics');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to get analytics' }));
    }
    return true;
  }

  // Not a marketing route we handle
  return false;
}

export default handleMarketingRoutes;

