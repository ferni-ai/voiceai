/**
 * Marketing Routes
 *
 * API endpoints for social media marketing management.
 * Used by Alex (via tools) and the marketing dashboard UI.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import { TwitterClient } from '../tools/domains/marketing/twitter-client.js';
import { LinkedInClient } from '../tools/domains/marketing/linkedin-client.js';
import { MarketingStorage } from '../tools/domains/marketing/storage.js';
import { getLogger } from '../utils/safe-logger.js';
import { createOAuthStateManager } from '../utils/ddos-protection.js';

const log = getLogger();

// Centralized OAuth state management with automatic cleanup and memory limits
const oauthStates = createOAuthStateManager<{ userId: string; platform: string }>(10 * 60 * 1000); // 10 minute expiry

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

    // Generate state for CSRF protection (uses centralized manager with automatic cleanup)
    const state = oauthStates.create({ userId, platform: 'twitter' });
    if (!state) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too many pending OAuth requests' }));
      return true;
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

    // Consume state (one-time use) and validate platform
    const savedState = oauthStates.consume(state);
    if (!savedState || savedState.platform !== 'twitter') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid or expired state' }));
      return true;
    }

    try {
      const tokens = await TwitterClient.exchangeCodeForTokens(code, 'challenge');

      if (!tokens) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to exchange tokens' }));
        return true;
      }

      // Store tokens securely (encrypted with AES-256-GCM)
      const storage = new MarketingStorage(savedState.userId);
      await storage.saveTokens('twitter', {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresIn ? Date.now() + tokens.expiresIn * 1000 : undefined,
        updatedAt: Date.now(),
      });

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

    const state = oauthStates.create({ userId, platform: 'linkedin' });
    if (!state) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too many pending OAuth requests' }));
      return true;
    }

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

    // Consume state (one-time use) and validate platform
    const savedState = oauthStates.consume(state);
    if (!savedState || savedState.platform !== 'linkedin') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid or expired state' }));
      return true;
    }

    try {
      const tokens = await LinkedInClient.exchangeCodeForTokens(code);

      if (!tokens) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to exchange tokens' }));
        return true;
      }

      // Store tokens securely (encrypted with AES-256-GCM)
      const storage = new MarketingStorage(savedState.userId);
      await storage.saveTokens('linkedin', {
        accessToken: tokens.accessToken,
        expiresAt: tokens.expiresIn ? Date.now() + tokens.expiresIn * 1000 : undefined,
        updatedAt: Date.now(),
      });

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
