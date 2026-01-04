/**
 * Developer Console Analytics Routes
 *
 * Provides usage analytics for developers:
 * - GET  /api/v1/developers/analytics/overview - Dashboard summary
 * - GET  /api/v1/developers/analytics/usage - API call volume over time
 * - GET  /api/v1/developers/analytics/personas - Per-persona usage breakdown
 * - GET  /api/v1/developers/analytics/errors - Error rates and types
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../../../utils/safe-logger.js';
import { handleCorsPreflightIfNeeded, sendJSON, sendError } from '../../helpers.js';

const log = getLogger().child({ module: 'developers-analytics' });

// ============================================================================
// TYPES
// ============================================================================

interface UsageDataPoint {
  date: string;
  apiCalls: number;
  uniqueUsers: number;
  errors: number;
}

interface PersonaUsage {
  personaId: string;
  personaName: string;
  totalCalls: number;
  avgSessionDuration: number;
  uniqueUsers: number;
}

interface ErrorBreakdown {
  code: string;
  message: string;
  count: number;
  lastOccurred: string;
}

interface AnalyticsOverview {
  totalApiCalls: number;
  totalApiCallsChange: number; // Percentage change from previous period
  activePersonas: number;
  activePersonasChange: number;
  uniqueUsers: number;
  uniqueUsersChange: number;
  errorRate: number;
  errorRateChange: number;
  avgResponseTime: number;
  avgResponseTimeChange: number;
}

interface FirebaseDecodedToken {
  uid: string;
  email?: string;
}

// ============================================================================
// FIREBASE AUTH HELPER
// ============================================================================

let firebaseAdmin: typeof import('firebase-admin') | null = null;

async function getFirebaseAdmin() {
  if (firebaseAdmin) return firebaseAdmin;

  const admin = await import('firebase-admin');
  if (admin.apps.length === 0) {
    admin.initializeApp({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
    });
  }
  firebaseAdmin = admin;
  return firebaseAdmin;
}

// ============================================================================
// FIRESTORE HELPERS
// ============================================================================

interface Firestore {
  collection: (path: string) => CollectionReference;
}

interface CollectionReference {
  where: (field: string, op: string, value: unknown) => Query;
  doc: (id: string) => DocumentReference;
  orderBy: (field: string, direction?: 'asc' | 'desc') => Query;
}

interface Query {
  limit: (n: number) => Query;
  get: () => Promise<QuerySnapshot>;
  where: (field: string, op: string, value: unknown) => Query;
  orderBy: (field: string, direction?: 'asc' | 'desc') => Query;
}

interface QuerySnapshot {
  empty: boolean;
  docs: Array<{ id: string; data: () => Record<string, unknown> | undefined }>;
  size: number;
}

interface DocumentReference {
  get: () => Promise<DocumentSnapshot>;
  collection: (path: string) => CollectionReference;
}

interface DocumentSnapshot {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
}

let db: Firestore | null = null;

async function getFirestore(): Promise<Firestore> {
  if (db) return db;

  const { Firestore } = await import('@google-cloud/firestore');
  db = new Firestore({
    projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
    databaseId: process.env.FIRESTORE_DATABASE || '(default)',
  }) as unknown as Firestore;

  return db;
}

/**
 * Get publisher ID from Firebase token
 */
async function getPublisherFromToken(req: IncomingMessage): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const idToken = authHeader.substring(7);

  try {
    const admin = await getFirebaseAdmin();
    const decodedToken = (await admin.auth().verifyIdToken(idToken)) as FirebaseDecodedToken;

    const db = await getFirestore();
    const query = db.collection('publishers').where('firebaseUid', '==', decodedToken.uid).limit(1);
    const snapshot = await query.get();

    if (snapshot.empty) return null;
    return snapshot.docs[0].id;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.warn({ error: err.message }, 'Failed to get publisher from token');
    return null;
  }
}

// ============================================================================
// ANALYTICS DATA FUNCTIONS
// ============================================================================

/**
 * Get date range based on period
 */
function getDateRange(period: string): { startDate: Date; endDate: Date; previousStartDate: Date } {
  const now = new Date();
  const endDate = new Date(now);
  endDate.setHours(23, 59, 59, 999);

  let startDate: Date;
  let previousStartDate: Date;

  switch (period) {
    case 'week':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      previousStartDate = new Date(startDate);
      previousStartDate.setDate(previousStartDate.getDate() - 7);
      break;
    case 'month':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 30);
      previousStartDate = new Date(startDate);
      previousStartDate.setDate(previousStartDate.getDate() - 30);
      break;
    case 'year':
      startDate = new Date(now);
      startDate.setFullYear(now.getFullYear() - 1);
      previousStartDate = new Date(startDate);
      previousStartDate.setFullYear(previousStartDate.getFullYear() - 1);
      break;
    default: // day
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 1);
      previousStartDate = new Date(startDate);
      previousStartDate.setDate(previousStartDate.getDate() - 1);
      break;
  }

  startDate.setHours(0, 0, 0, 0);
  previousStartDate.setHours(0, 0, 0, 0);

  return { startDate, endDate, previousStartDate };
}

/**
 * Get analytics overview with comparison to previous period
 */
async function getAnalyticsOverview(publisherId: string, period: string): Promise<AnalyticsOverview> {
  const db = await getFirestore();
  const { startDate, endDate, previousStartDate } = getDateRange(period);

  // Get current period data
  const currentQuery = db
    .collection('publisher_usage')
    .where('publisherId', '==', publisherId)
    .where('date', '>=', startDate.toISOString().split('T')[0])
    .where('date', '<=', endDate.toISOString().split('T')[0]);

  // Get previous period data
  const previousQuery = db
    .collection('publisher_usage')
    .where('publisherId', '==', publisherId)
    .where('date', '>=', previousStartDate.toISOString().split('T')[0])
    .where('date', '<', startDate.toISOString().split('T')[0]);

  const [currentSnapshot, previousSnapshot] = await Promise.all([
    currentQuery.get(),
    previousQuery.get(),
  ]);

  // Aggregate current period
  let currentApiCalls = 0;
  let currentErrors = 0;
  let currentResponseTime = 0;
  const currentUsers = new Set<string>();
  const currentPersonas = new Set<string>();

  currentSnapshot.docs.forEach((doc) => {
    const data = doc.data();
    if (data) {
      currentApiCalls += (data.apiCalls as number) || 0;
      currentErrors += (data.errors as number) || 0;
      currentResponseTime += (data.avgResponseTime as number) || 0;

      const users = data.uniqueUsers as string[] | undefined;
      if (users) users.forEach((u) => currentUsers.add(u));

      const personas = data.personaUsage as Record<string, number> | undefined;
      if (personas) Object.keys(personas).forEach((p) => currentPersonas.add(p));
    }
  });

  // Aggregate previous period
  let previousApiCalls = 0;
  let previousErrors = 0;
  let previousResponseTime = 0;
  const previousUsers = new Set<string>();
  const previousPersonas = new Set<string>();

  previousSnapshot.docs.forEach((doc) => {
    const data = doc.data();
    if (data) {
      previousApiCalls += (data.apiCalls as number) || 0;
      previousErrors += (data.errors as number) || 0;
      previousResponseTime += (data.avgResponseTime as number) || 0;

      const users = data.uniqueUsers as string[] | undefined;
      if (users) users.forEach((u) => previousUsers.add(u));

      const personas = data.personaUsage as Record<string, number> | undefined;
      if (personas) Object.keys(personas).forEach((p) => previousPersonas.add(p));
    }
  });

  // Calculate averages
  const currentAvgResponseTime =
    currentSnapshot.size > 0 ? currentResponseTime / currentSnapshot.size : 0;
  const previousAvgResponseTime =
    previousSnapshot.size > 0 ? previousResponseTime / previousSnapshot.size : 0;

  // Calculate error rates
  const currentErrorRate = currentApiCalls > 0 ? (currentErrors / currentApiCalls) * 100 : 0;
  const previousErrorRate = previousApiCalls > 0 ? (previousErrors / previousApiCalls) * 100 : 0;

  // Calculate percentage changes
  const calcChange = (current: number, previous: number): number => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  return {
    totalApiCalls: currentApiCalls,
    totalApiCallsChange: calcChange(currentApiCalls, previousApiCalls),
    activePersonas: currentPersonas.size,
    activePersonasChange: calcChange(currentPersonas.size, previousPersonas.size),
    uniqueUsers: currentUsers.size,
    uniqueUsersChange: calcChange(currentUsers.size, previousUsers.size),
    errorRate: Math.round(currentErrorRate * 100) / 100,
    errorRateChange: calcChange(currentErrorRate, previousErrorRate),
    avgResponseTime: Math.round(currentAvgResponseTime),
    avgResponseTimeChange: calcChange(currentAvgResponseTime, previousAvgResponseTime),
  };
}

/**
 * Get usage data over time
 */
async function getUsageOverTime(
  publisherId: string,
  period: string
): Promise<UsageDataPoint[]> {
  const db = await getFirestore();
  const { startDate, endDate } = getDateRange(period);

  const query = db
    .collection('publisher_usage')
    .where('publisherId', '==', publisherId)
    .where('date', '>=', startDate.toISOString().split('T')[0])
    .where('date', '<=', endDate.toISOString().split('T')[0])
    .orderBy('date', 'asc');

  const snapshot = await query.get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    const users = data?.uniqueUsers as string[] | undefined;
    return {
      date: (data?.date as string) || doc.id,
      apiCalls: (data?.apiCalls as number) || 0,
      uniqueUsers: users?.length || 0,
      errors: (data?.errors as number) || 0,
    };
  });
}

/**
 * Get per-persona usage breakdown
 */
async function getPersonaUsage(publisherId: string, period: string): Promise<PersonaUsage[]> {
  const db = await getFirestore();
  const { startDate, endDate } = getDateRange(period);

  // Get usage data
  const usageQuery = db
    .collection('publisher_usage')
    .where('publisherId', '==', publisherId)
    .where('date', '>=', startDate.toISOString().split('T')[0])
    .where('date', '<=', endDate.toISOString().split('T')[0]);

  const usageSnapshot = await usageQuery.get();

  // Aggregate by persona
  const personaStats: Record<
    string,
    { calls: number; duration: number; users: Set<string> }
  > = {};

  usageSnapshot.docs.forEach((doc) => {
    const data = doc.data();
    const personaUsage = data?.personaUsage as Record<string, number> | undefined;
    const personaDurations = data?.personaDurations as Record<string, number> | undefined;
    const personaUsers = data?.personaUsers as Record<string, string[]> | undefined;

    if (personaUsage) {
      Object.entries(personaUsage).forEach(([personaId, calls]) => {
        if (!personaStats[personaId]) {
          personaStats[personaId] = { calls: 0, duration: 0, users: new Set() };
        }
        personaStats[personaId].calls += calls;

        if (personaDurations?.[personaId]) {
          personaStats[personaId].duration += personaDurations[personaId];
        }

        if (personaUsers?.[personaId]) {
          personaUsers[personaId].forEach((u) => personaStats[personaId].users.add(u));
        }
      });
    }
  });

  // Get persona names
  const personaQuery = db
    .collection('publisher_personas')
    .where('publisherId', '==', publisherId);
  const personaSnapshot = await personaQuery.get();

  const personaNames: Record<string, string> = {};
  personaSnapshot.docs.forEach((doc) => {
    const data = doc.data();
    const manifest = data?.manifest as { identity?: { name?: string } } | undefined;
    personaNames[doc.id] = manifest?.identity?.name || doc.id;
  });

  // Build response
  return Object.entries(personaStats).map(([personaId, stats]) => ({
    personaId,
    personaName: personaNames[personaId] || personaId,
    totalCalls: stats.calls,
    avgSessionDuration: stats.calls > 0 ? Math.round(stats.duration / stats.calls) : 0,
    uniqueUsers: stats.users.size,
  }));
}

/**
 * Get error breakdown
 */
async function getErrorBreakdown(publisherId: string, period: string): Promise<ErrorBreakdown[]> {
  const db = await getFirestore();
  const { startDate, endDate } = getDateRange(period);

  const query = db
    .collection('publisher_errors')
    .where('publisherId', '==', publisherId)
    .where('timestamp', '>=', startDate.toISOString())
    .where('timestamp', '<=', endDate.toISOString())
    .orderBy('timestamp', 'desc')
    .limit(1000);

  const snapshot = await query.get();

  // Aggregate by error code
  const errorStats: Record<string, { count: number; message: string; lastOccurred: string }> = {};

  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    const code = (data?.code as string) || 'UNKNOWN';
    const message = (data?.message as string) || 'Unknown error';
    const timestamp = (data?.timestamp as string) || new Date().toISOString();

    if (!errorStats[code]) {
      errorStats[code] = { count: 0, message, lastOccurred: timestamp };
    }
    errorStats[code].count += 1;

    // Keep the most recent occurrence
    if (timestamp > errorStats[code].lastOccurred) {
      errorStats[code].lastOccurred = timestamp;
    }
  });

  // Sort by count descending
  return Object.entries(errorStats)
    .map(([code, stats]) => ({
      code,
      message: stats.message,
      count: stats.count,
      lastOccurred: stats.lastOccurred,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // Top 10 errors
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleDeveloperAnalyticsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle our routes
  if (!pathname.startsWith('/api/v1/developers/analytics')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  const method = req.method?.toUpperCase();

  // Authenticate
  const publisherId = await getPublisherFromToken(req);
  if (!publisherId) {
    sendError(res, 'Authentication required', 401);
    return true;
  }

  // Parse period from query string
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const period = url.searchParams.get('period') || 'week';

  if (!['day', 'week', 'month', 'year'].includes(period)) {
    sendError(res, 'Invalid period. Use: day, week, month, or year', 400);
    return true;
  }

  try {
    // GET /api/v1/developers/analytics/overview
    if (pathname === '/api/v1/developers/analytics/overview' && method === 'GET') {
      const overview = await getAnalyticsOverview(publisherId, period);
      sendJSON(res, { success: true, period, overview });
      return true;
    }

    // GET /api/v1/developers/analytics/usage
    if (pathname === '/api/v1/developers/analytics/usage' && method === 'GET') {
      const usage = await getUsageOverTime(publisherId, period);
      sendJSON(res, { success: true, period, usage });
      return true;
    }

    // GET /api/v1/developers/analytics/personas
    if (pathname === '/api/v1/developers/analytics/personas' && method === 'GET') {
      const personas = await getPersonaUsage(publisherId, period);
      sendJSON(res, { success: true, period, personas });
      return true;
    }

    // GET /api/v1/developers/analytics/errors
    if (pathname === '/api/v1/developers/analytics/errors' && method === 'GET') {
      const errors = await getErrorBreakdown(publisherId, period);
      sendJSON(res, { success: true, period, errors });
      return true;
    }

    // Unknown analytics route
    sendError(res, 'Not found', 404);
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, pathname, publisherId }, 'Developer analytics error');
    sendError(res, 'Internal server error', 500);
    return true;
  }
}
