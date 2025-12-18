/**
 * Integrations Handler (Native HTTP)
 *
 * Unified handler for ALL integration routes. This is what ui-server.js uses.
 * Includes: Biometrics, Banking, Calendar, Social Graph
 *
 * NOTE: The Express Router files (banking.ts, calendar.ts, etc.) exist but are
 * NOT mounted in production. All routes must be implemented here.
 *
 * @module api/v1/integrations/handler
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import { z } from 'zod';
import { createLogger } from '../../../utils/safe-logger.js';
import { parseBody, sendJSON } from '../../helpers.js';

// SECURITY: Schema for validating OAuth state parameter
const OAuthStateSchema = z.object({
  userId: z.string().min(1),
});

// Biometrics
import {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  syncBiometrics,
  getCurrentBiometrics,
  hasBiometricsConnectedAsync,
  getConnectedPlatformAsync,
  disconnectBiometrics,
  type BiometricPlatform,
} from '../../../services/biometrics/index.js';

// Banking - lazy imports to avoid circular deps
const getBankingServices = async () => {
  const plaid = await import('../../../tools/plaid.js');
  const prediction = await import('../../../services/finance/prediction.js');
  return { ...plaid, ...prediction };
};

// Calendar - lazy imports
const getCalendarServices = async () => {
  return import('../../../services/context-awareness/location-calendar.js');
};

// Calendar OAuth - direct import for token exchange
const getCalendarOAuthServices = async () => {
  return import('../../../services/google-calendar-oauth.js');
};

// Social Graph - lazy imports
const getSocialGraphServices = async () => {
  return import('../../../services/social-graph/index.js');
};

const log = createLogger({ module: 'IntegrationsHandler' });

const BASE_PATH = '/api/v1/integrations';

// ============================================================================
// HELPERS
// ============================================================================

// parseBody and sendJSON imported from '../../helpers.js'

/**
 * Legacy wrapper for sendJSON with (res, status, data) signature.
 */
function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  sendJSON(res, data, statusCode);
}

function sendRedirect(res: ServerResponse, url: string): void {
  res.writeHead(302, { Location: url });
  res.end();
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function handleIntegrationsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  if (!pathname.startsWith(BASE_PATH)) {
    return false;
  }

  const method = req.method || 'GET';
  const subPath = pathname.slice(BASE_PATH.length);

  log.debug({ pathname, method, subPath }, 'Integrations request');

  try {
    // =========================================================================
    // STATUS - All integrations
    // =========================================================================
    if (subPath === '/status' && method === 'GET') {
      const userId = parsedUrl.searchParams.get('userId');
      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      const calendar = await getCalendarServices();
      const banking = await getBankingServices();
      const social = await getSocialGraphServices();

      const biometricsConnected = await hasBiometricsConnectedAsync(userId);
      const calendarConnected = calendar.hasCalendarConnected(userId);
      const bankConnected = banking.hasLinkedAccounts(userId);
      const socialPeople = social.getImportantPeople(userId);

      sendJson(res, 200, {
        userId,
        integrations: {
          biometrics: {
            connected: biometricsConnected,
            platform: biometricsConnected ? await getConnectedPlatformAsync(userId) : null,
          },
          calendar: { connected: calendarConnected },
          banking: { connected: bankConnected },
          socialGraph: { enabled: true, peopleTracked: socialPeople.length },
        },
        capabilities: {
          stressAwareness: biometricsConnected,
          sleepAwareness: biometricsConnected,
          eventAnticipation: calendarConnected,
          locationAwareness: calendarConnected,
          financialPrediction: bankConnected,
          relationshipInsights: socialPeople.length > 0,
        },
      });
      return true;
    }

    // =========================================================================
    // BIOMETRICS
    // =========================================================================

    if (subPath === '/biometrics/status' && method === 'GET') {
      const userId = parsedUrl.searchParams.get('userId');
      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      const connected = await hasBiometricsConnectedAsync(userId);
      const platform = await getConnectedPlatformAsync(userId);
      const snapshot = connected ? getCurrentBiometrics(userId) : null;

      sendJson(res, 200, {
        connected,
        platform,
        lastSync: snapshot?.timestamp || null,
        stressLevel: snapshot?.stressLevel || null,
      });
      return true;
    }

    if (subPath.startsWith('/biometrics/connect/') && method === 'GET') {
      const platform = subPath.replace('/biometrics/connect/', '') as BiometricPlatform;
      const userId = parsedUrl.searchParams.get('userId');
      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      const validPlatforms: BiometricPlatform[] = [
        'healthkit',
        'googlefit',
        'oura',
        'whoop',
        'fitbit',
        'terra',
      ];
      if (!validPlatforms.includes(platform)) {
        sendJson(res, 400, {
          error: `Invalid platform. Must be one of: ${validPlatforms.join(', ')}`,
        });
        return true;
      }

      const authUrl = getAuthorizationUrl(platform, userId);
      log.info({ userId, platform }, 'Generated biometrics auth URL');
      sendJson(res, 200, { authUrl, platform });
      return true;
    }

    if (subPath.startsWith('/biometrics/callback/') && method === 'GET') {
      const platform = subPath.replace('/biometrics/callback/', '') as BiometricPlatform;
      const code = parsedUrl.searchParams.get('code');
      const state = parsedUrl.searchParams.get('state');
      const error = parsedUrl.searchParams.get('error');

      if (error) {
        log.warn({ platform, error }, 'OAuth error from provider');
        sendRedirect(res, `/settings/integrations?error=${encodeURIComponent(error)}`);
        return true;
      }

      if (!code || !state) {
        sendJson(res, 400, { error: 'Missing code or state parameter' });
        return true;
      }

      // SECURITY: Decode and validate state parameter with Zod schema
      let userId: string;
      try {
        const rawDecoded = JSON.parse(Buffer.from(state, 'base64').toString());
        const parsed = OAuthStateSchema.safeParse(rawDecoded);
        if (!parsed.success) {
          log.warn({ issues: parsed.error.issues }, 'Invalid OAuth state structure');
          sendJson(res, 400, { error: 'Invalid state parameter' });
          return true;
        }
        userId = parsed.data.userId;
      } catch {
        sendJson(res, 400, { error: 'Invalid state parameter' });
        return true;
      }

      const success = await exchangeCodeForTokens(platform, code, userId);
      if (success) {
        void syncBiometrics(userId);
        log.info({ userId, platform }, 'Biometrics connected successfully');
        sendRedirect(res, `/settings/integrations?success=biometrics&platform=${platform}`);
      } else {
        sendRedirect(res, '/settings/integrations?error=token_exchange_failed');
      }
      return true;
    }

    if (subPath === '/biometrics/sync' && method === 'POST') {
      const body = await parseBody<Record<string, unknown>>(req);
      const userId = body.userId as string;
      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      if (!(await hasBiometricsConnectedAsync(userId))) {
        sendJson(res, 400, { error: 'No biometrics connected' });
        return true;
      }

      const snapshot = await syncBiometrics(userId);
      if (snapshot) {
        sendJson(res, 200, {
          success: true,
          timestamp: snapshot.timestamp,
          data: {
            stressLevel: snapshot.stressLevel,
            sleep: snapshot.sleep,
            hrv: snapshot.hrv,
            recovery: snapshot.recovery,
            activity: snapshot.activity,
          },
        });
      } else {
        sendJson(res, 500, { error: 'Sync failed' });
      }
      return true;
    }

    if (subPath === '/biometrics/data' && method === 'GET') {
      const userId = parsedUrl.searchParams.get('userId');
      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      const snapshot = getCurrentBiometrics(userId);
      if (snapshot) {
        sendJson(res, 200, snapshot);
      } else {
        sendJson(res, 404, { error: 'No biometrics data available' });
      }
      return true;
    }

    if (subPath === '/biometrics/disconnect' && method === 'DELETE') {
      const body = await parseBody<Record<string, unknown>>(req);
      const userId = body.userId as string;
      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      disconnectBiometrics(userId);
      log.info({ userId }, 'Biometrics disconnected');
      sendJson(res, 200, { success: true });
      return true;
    }

    // =========================================================================
    // BANKING
    // =========================================================================

    if (subPath === '/banking/status' && method === 'GET') {
      const userId = parsedUrl.searchParams.get('userId');
      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      const banking = await getBankingServices();
      const connected = banking.hasLinkedAccounts(userId);
      const tokenData = connected ? banking.getTokenData(userId) : null;

      sendJson(res, 200, {
        connected,
        institution: tokenData?.institution?.name || null,
        linkedAt: tokenData?.linked_at || null,
      });
      return true;
    }

    if (subPath === '/banking/link-token' && method === 'POST') {
      const body = await parseBody<Record<string, unknown>>(req);
      const userId = body.userId as string;
      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      const banking = await getBankingServices();
      const linkToken = await banking.createLinkToken(userId);

      if (linkToken.startsWith("I'd love to")) {
        sendJson(res, 503, { error: 'Plaid service not configured', message: linkToken });
        return true;
      }

      log.info({ userId }, 'Plaid link token created');
      sendJson(res, 200, { linkToken });
      return true;
    }

    if (subPath === '/banking/exchange-token' && method === 'POST') {
      const body = await parseBody<Record<string, unknown>>(req);
      const { userId, publicToken, institution } = body as {
        userId: string;
        publicToken: string;
        institution?: { institution_id?: string; name?: string };
      };

      if (!userId || !publicToken) {
        sendJson(res, 400, { error: 'userId and publicToken are required' });
        return true;
      }

      const banking = await getBankingServices();
      const accessToken = await banking.exchangePublicToken(publicToken);

      if (!accessToken) {
        sendJson(res, 400, { error: 'Failed to exchange token' });
        return true;
      }

      banking.storeAccessToken(userId, accessToken, undefined, institution);

      // Background analysis
      void (async () => {
        try {
          await Promise.all([
            banking.detectBills(userId),
            banking.detectIncome(userId),
            banking.detectAnomalies(userId),
          ]);
        } catch (e) {
          log.warn({ error: String(e), userId }, 'Initial financial analysis failed');
        }
      })();

      log.info({ userId, institution: institution?.name }, 'Bank account linked');
      sendJson(res, 200, { success: true, institution: institution?.name || 'Unknown' });
      return true;
    }

    if (subPath === '/banking/disconnect' && method === 'DELETE') {
      const userId = parsedUrl.searchParams.get('userId');
      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      const banking = await getBankingServices();
      const removed = banking.removeAccessToken(userId);

      if (removed) {
        log.info({ userId }, 'Bank account disconnected');
        sendJson(res, 200, { success: true });
      } else {
        sendJson(res, 404, { error: 'No linked account found' });
      }
      return true;
    }

    if (subPath === '/banking/balances' && method === 'GET') {
      const userId = parsedUrl.searchParams.get('userId');
      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      const banking = await getBankingServices();
      const tokenData = banking.getTokenData(userId);
      if (!tokenData) {
        sendJson(res, 400, { error: 'No linked bank account' });
        return true;
      }

      const accounts = await banking.getAccountBalances(tokenData.access_token);
      sendJson(res, 200, {
        accounts: accounts.map((a) => ({
          accountId: a.account_id,
          name: a.name,
          type: a.type,
          subtype: a.subtype,
          mask: a.mask,
          balances: a.balances,
        })),
      });
      return true;
    }

    if (subPath === '/banking/transactions' && method === 'GET') {
      const userId = parsedUrl.searchParams.get('userId');
      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      const days = parseInt(parsedUrl.searchParams.get('days') || '30');
      const limit = parseInt(parsedUrl.searchParams.get('limit') || '100');

      const banking = await getBankingServices();
      const tokenData = banking.getTokenData(userId);
      if (!tokenData) {
        sendJson(res, 400, { error: 'No linked bank account' });
        return true;
      }

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const transactions = await banking.getTransactions(
        tokenData.access_token,
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0],
        limit
      );

      sendJson(res, 200, {
        transactions: transactions.map((t) => ({
          id: t.transaction_id,
          date: t.date,
          name: t.name,
          merchantName: t.merchant_name,
          amount: t.amount,
          category: t.category,
          pending: t.pending,
          paymentChannel: t.payment_channel,
        })),
      });
      return true;
    }

    if (subPath === '/banking/spending-analysis' && method === 'GET') {
      const userId = parsedUrl.searchParams.get('userId');
      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      const period = parsedUrl.searchParams.get('period') || 'month';

      const banking = await getBankingServices();
      const tokenData = banking.getTokenData(userId);
      if (!tokenData) {
        sendJson(res, 400, { error: 'No linked bank account' });
        return true;
      }

      const endDate = new Date();
      const startDate = new Date();
      if (period === 'week') startDate.setDate(startDate.getDate() - 7);
      else if (period === 'quarter') startDate.setMonth(startDate.getMonth() - 3);
      else startDate.setMonth(startDate.getMonth() - 1);

      const transactions = await banking.getTransactions(
        tokenData.access_token,
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0],
        250
      );

      const analysis = banking.analyzeSpending(transactions);
      sendJson(res, 200, { period, ...analysis });
      return true;
    }

    if (subPath === '/banking/cash-flow' && method === 'GET') {
      const userId = parsedUrl.searchParams.get('userId');
      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      const daysOut = parseInt(parsedUrl.searchParams.get('daysOut') || '14');

      const banking = await getBankingServices();
      if (!banking.hasLinkedAccounts(userId)) {
        sendJson(res, 400, { error: 'No linked bank account' });
        return true;
      }

      const forecast = await banking.predictCashFlow(userId, daysOut);
      if (!forecast) {
        sendJson(res, 500, { error: 'Failed to generate forecast' });
        return true;
      }

      sendJson(res, 200, forecast);
      return true;
    }

    if (subPath === '/banking/bills' && method === 'GET') {
      const userId = parsedUrl.searchParams.get('userId');
      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      const banking = await getBankingServices();
      if (!banking.hasLinkedAccounts(userId)) {
        sendJson(res, 400, { error: 'No linked bank account' });
        return true;
      }

      const bills = await banking.detectBills(userId);
      sendJson(res, 200, { bills });
      return true;
    }

    if (subPath === '/banking/income' && method === 'GET') {
      const userId = parsedUrl.searchParams.get('userId');
      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      const banking = await getBankingServices();
      if (!banking.hasLinkedAccounts(userId)) {
        sendJson(res, 400, { error: 'No linked bank account' });
        return true;
      }

      const income = await banking.detectIncome(userId);
      sendJson(res, 200, { income });
      return true;
    }

    if (subPath === '/banking/anomalies' && method === 'GET') {
      const userId = parsedUrl.searchParams.get('userId');
      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      const banking = await getBankingServices();
      if (!banking.hasLinkedAccounts(userId)) {
        sendJson(res, 400, { error: 'No linked bank account' });
        return true;
      }

      const anomalies = await banking.detectAnomalies(userId);
      sendJson(res, 200, { anomalies });
      return true;
    }

    if (subPath === '/banking/subscriptions' && method === 'GET') {
      const userId = parsedUrl.searchParams.get('userId');
      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      const banking = await getBankingServices();
      if (!banking.hasLinkedAccounts(userId)) {
        sendJson(res, 400, { error: 'No linked bank account' });
        return true;
      }

      const subscriptions = await banking.detectSubscriptionCreep(userId);
      if (!subscriptions) {
        sendJson(res, 500, { error: 'Failed to analyze subscriptions' });
        return true;
      }

      sendJson(res, 200, subscriptions);
      return true;
    }

    if (subPath === '/banking/goals' && method === 'POST') {
      const body = await parseBody<Record<string, unknown>>(req);
      const { userId, name, targetAmount, targetDate, currentAmount } = body as {
        userId: string;
        name: string;
        targetAmount: number;
        targetDate: string;
        currentAmount?: number;
      };

      if (!userId || !name || !targetAmount || !targetDate) {
        sendJson(res, 400, { error: 'userId, name, targetAmount, and targetDate are required' });
        return true;
      }

      const banking = await getBankingServices();
      const goal = banking.createSavingsGoal(
        userId,
        name,
        targetAmount,
        new Date(targetDate),
        currentAmount || 0
      );

      log.info({ userId, goalId: goal.id, name }, 'Savings goal created');
      sendJson(res, 200, { goal });
      return true;
    }

    const goalMatch = subPath.match(/^\/banking\/goals\/([^/]+)$/);
    if (goalMatch && method === 'PATCH') {
      const goalId = goalMatch[1];
      const body = await parseBody<Record<string, unknown>>(req);
      const { userId, currentAmount } = body as { userId: string; currentAmount: number };

      if (!userId || currentAmount === undefined) {
        sendJson(res, 400, { error: 'userId and currentAmount are required' });
        return true;
      }

      const banking = await getBankingServices();
      const progress = banking.updateGoalProgress(userId, goalId, currentAmount);

      if (!progress) {
        sendJson(res, 404, { error: 'Goal not found' });
        return true;
      }

      log.info({ userId, goalId, currentAmount }, 'Goal progress updated');
      sendJson(res, 200, { progress });
      return true;
    }

    if (subPath === '/banking/insights' && method === 'GET') {
      const userId = parsedUrl.searchParams.get('userId');
      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      const banking = await getBankingServices();
      if (!banking.hasLinkedAccounts(userId)) {
        sendJson(res, 400, { error: 'No linked bank account' });
        return true;
      }

      const insight = await banking.generateFinancialInsight(userId);
      sendJson(res, 200, { hasInsight: !!insight, insight });
      return true;
    }

    // =========================================================================
    // CALENDAR
    // =========================================================================

    if (subPath === '/calendar/status' && method === 'GET') {
      const userId = parsedUrl.searchParams.get('userId');
      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      const cal = await getCalendarServices();
      const connected = await cal.hasCalendarConnected(userId);
      const events = connected ? cal.getUpcomingEvents(userId) : [];
      const location = connected ? cal.getCurrentLocation(userId) : null;

      sendJson(res, 200, {
        connected,
        upcomingEventsCount: events.length,
        currentLocation: location?.type || null,
      });
      return true;
    }

    if (subPath === '/calendar/connect' && method === 'GET') {
      const userId = parsedUrl.searchParams.get('userId');
      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      const cal = await getCalendarServices();
      const authUrl = cal.getCalendarAuthUrl(userId);

      log.info({ userId }, 'Generated calendar auth URL');
      sendJson(res, 200, { authUrl });
      return true;
    }

    if (subPath === '/calendar/callback' && method === 'GET') {
      const code = parsedUrl.searchParams.get('code');
      const state = parsedUrl.searchParams.get('state');
      const error = parsedUrl.searchParams.get('error');

      if (error) {
        log.warn({ error }, 'OAuth error from Google');
        sendRedirect(res, `/settings/integrations?error=${encodeURIComponent(error)}`);
        return true;
      }

      if (!code || !state) {
        sendJson(res, 400, { error: 'Missing code or state parameter' });
        return true;
      }

      // SECURITY: Decode and validate state parameter with Zod schema
      let userId: string;
      try {
        const rawDecoded = JSON.parse(Buffer.from(state, 'base64').toString());
        const parsed = OAuthStateSchema.safeParse(rawDecoded);
        if (!parsed.success) {
          log.warn({ issues: parsed.error.issues }, 'Invalid OAuth state structure');
          sendJson(res, 400, { error: 'Invalid state parameter' });
          return true;
        }
        userId = parsed.data.userId;
      } catch {
        sendJson(res, 400, { error: 'Invalid state parameter' });
        return true;
      }

      const cal = await getCalendarServices();
      const calOAuth = await getCalendarOAuthServices();

      try {
        const tokens = await calOAuth.exchangeCodeForTokens(code);
        await calOAuth.storeUserTokens(userId, tokens);

        void cal.fetchUpcomingEvents(userId, 48);
        log.info({ userId }, 'Calendar connected successfully');
        sendRedirect(res, '/settings/integrations?success=calendar');
      } catch (tokenError) {
        log.error({ error: String(tokenError), userId }, 'Calendar token exchange failed');
        sendRedirect(res, '/settings/integrations?error=token_exchange_failed');
      }
      return true;
    }

    if (subPath === '/calendar/events' && method === 'GET') {
      const userId = parsedUrl.searchParams.get('userId');
      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      const hours = parseInt(parsedUrl.searchParams.get('hours') || '24');

      const cal = await getCalendarServices();
      if (!cal.hasCalendarConnected(userId)) {
        sendJson(res, 400, { error: 'Calendar not connected' });
        return true;
      }

      const events = await cal.fetchUpcomingEvents(userId, hours);
      sendJson(res, 200, {
        events: events.map((e) => ({
          id: e.id,
          title: e.title,
          startTime: e.startTime,
          endTime: e.endTime,
          location: e.location,
          eventType: e.eventType,
          attendeeCount: e.attendees?.length || 0,
        })),
      });
      return true;
    }

    if (subPath === '/calendar/location' && method === 'POST') {
      const body = await parseBody<Record<string, unknown>>(req);
      const { userId, latitude, longitude, accuracy } = body as {
        userId: string;
        latitude: number;
        longitude: number;
        accuracy?: number;
      };

      if (!userId || latitude === undefined || longitude === undefined) {
        sendJson(res, 400, { error: 'userId, latitude, and longitude are required' });
        return true;
      }

      const cal = await getCalendarServices();
      cal.updateLocation(userId, latitude, longitude, accuracy || 0);

      const currentLocation = cal.getCurrentLocation(userId);
      sendJson(res, 200, { success: true, locationType: currentLocation?.type || 'unknown' });
      return true;
    }

    if (subPath === '/calendar/location/save' && method === 'POST') {
      const body = await parseBody<Record<string, unknown>>(req);
      const { userId, name, type, latitude, longitude } = body as {
        userId: string;
        name: string;
        type: 'home' | 'work' | 'gym' | 'social' | 'travel' | 'unknown';
        latitude: number;
        longitude: number;
      };

      if (!userId || !name || !type || latitude === undefined || longitude === undefined) {
        sendJson(res, 400, { error: 'userId, name, type, latitude, and longitude are required' });
        return true;
      }

      const cal = await getCalendarServices();
      cal.saveLocation(userId, name, type, latitude, longitude);

      log.info({ userId, name, type }, 'Location saved');
      sendJson(res, 200, { success: true });
      return true;
    }

    if (subPath === '/calendar/disconnect' && method === 'DELETE') {
      const userId = parsedUrl.searchParams.get('userId');
      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      const cal = await getCalendarServices();
      cal.disconnectCalendar(userId);

      log.info({ userId }, 'Calendar disconnected');
      sendJson(res, 200, { success: true });
      return true;
    }

    // =========================================================================
    // SOCIAL GRAPH
    // =========================================================================

    if (subPath === '/social-graph/people' && method === 'GET') {
      const userId = parsedUrl.searchParams.get('userId');
      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      const social = await getSocialGraphServices();
      const people = social.getImportantPeople(userId);

      sendJson(res, 200, {
        people: people.map((p) => ({
          id: p.id,
          name: p.name,
          relationship: p.relationship,
          importance: p.importance,
          isConfirmedImportant: p.isConfirmedImportant,
          lastMentioned: p.lastMentioned,
          mentionCount: p.mentionCount,
          averageSentiment: p.averageSentiment,
          importantDates: p.importantDates,
        })),
      });
      return true;
    }

    const personMatch = subPath.match(/^\/social-graph\/person\/([^/]+)$/);
    if (personMatch && method === 'GET') {
      const personId = personMatch[1];
      const userId = parsedUrl.searchParams.get('userId');
      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      const social = await getSocialGraphServices();
      const person = social.getPerson(userId, personId);

      if (!person) {
        sendJson(res, 404, { error: 'Person not found' });
        return true;
      }

      sendJson(res, 200, { person });
      return true;
    }

    const confirmMatch = subPath.match(/^\/social-graph\/person\/([^/]+)\/confirm$/);
    if (confirmMatch && method === 'POST') {
      const personId = confirmMatch[1];
      const body = await parseBody<Record<string, unknown>>(req);
      const userId = body.userId as string;

      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      const social = await getSocialGraphServices();
      const success = social.confirmImportantPerson(userId, personId);

      if (success) {
        log.info({ userId, personId }, 'Person confirmed as important');
        sendJson(res, 200, { success: true });
      } else {
        sendJson(res, 404, { error: 'Person not found' });
      }
      return true;
    }

    const dateMatch = subPath.match(/^\/social-graph\/person\/([^/]+)\/date$/);
    if (dateMatch && method === 'POST') {
      const body = await parseBody<Record<string, unknown>>(req);
      const { userId, personName, date, type, label } = body as {
        userId: string;
        personName: string;
        date: string;
        type: 'birthday' | 'anniversary' | 'memorial' | 'other';
        label?: string;
      };

      if (!userId || !personName || !date || !type) {
        sendJson(res, 400, { error: 'userId, personName, date (MM-DD), and type are required' });
        return true;
      }

      if (!/^\d{2}-\d{2}$/.test(date)) {
        sendJson(res, 400, { error: 'Date must be in MM-DD format' });
        return true;
      }

      const social = await getSocialGraphServices();
      const success = social.addImportantDate(userId, personName, date, type, label);

      if (success) {
        log.info({ userId, personName, date, type }, 'Important date added');
        sendJson(res, 200, { success: true });
      } else {
        sendJson(res, 400, { error: 'Failed to add date (person not found or duplicate)' });
      }
      return true;
    }

    if (subPath === '/social-graph/dates' && method === 'GET') {
      const userId = parsedUrl.searchParams.get('userId');
      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      const daysAhead = parseInt(parsedUrl.searchParams.get('daysAhead') || '7');

      const social = await getSocialGraphServices();
      const dates = social.getUpcomingDates(userId, daysAhead);

      sendJson(res, 200, { dates });
      return true;
    }

    if (subPath === '/social-graph/insights' && method === 'GET') {
      const userId = parsedUrl.searchParams.get('userId');
      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      const social = await getSocialGraphServices();
      const withdrawals = social.detectWithdrawal(userId);
      const patterns = social.detectSentimentPatterns(userId);

      sendJson(res, 200, { withdrawalAlerts: withdrawals, relationshipPatterns: patterns });
      return true;
    }

    if (subPath === '/social-graph/frequency' && method === 'GET') {
      const userId = parsedUrl.searchParams.get('userId');
      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      const personName = parsedUrl.searchParams.get('personName');
      const days = parseInt(parsedUrl.searchParams.get('days') || '30');

      if (!personName) {
        sendJson(res, 400, { error: 'personName is required' });
        return true;
      }

      const social = await getSocialGraphServices();
      const frequency = social.getMentionFrequency(userId, personName, days);

      sendJson(res, 200, { personName, days, mentionCount: frequency });
      return true;
    }

    if (subPath === '/social-graph/clear' && method === 'DELETE') {
      const userId = parsedUrl.searchParams.get('userId');
      if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      const confirm = parsedUrl.searchParams.get('confirm') === 'true';
      if (!confirm) {
        sendJson(res, 400, {
          error: 'Add confirm=true to confirm deletion of all relationship data',
        });
        return true;
      }

      const social = await getSocialGraphServices();
      social.clearSocialGraph(userId);

      log.info({ userId }, 'Social graph cleared');
      sendJson(res, 200, { success: true });
      return true;
    }

    // Route not matched
    return false;
  } catch (error) {
    log.error({ error: String(error), pathname }, 'Integrations handler error');
    sendJson(res, 500, { error: 'Internal server error' });
    return true;
  }
}

export default { handleIntegrationsRoutes };
