/**
 * GDPR Compliance API Routes
 *
 * Implements GDPR rights for Ferni AI users:
 * - Right to access (data export)
 * - Right to erasure (delete account)
 * - Right to rectification (update data)
 * - Right to portability (machine-readable export)
 *
 * Philosophy: Users own their data. Period.
 * Ferni remembers you to serve you better, not to trap you.
 *
 * @module GDPRRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { maskEmail, maskPhoneNumber, stripPII } from '../services/privacy-crypto.js';
import { recordDataAccess, recordSecurityEvent } from '../services/security-events.js';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAuth } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, parseBody, sendError, sendJSON } from './helpers.js';

const log = createLogger({ module: 'GDPR-API' });

// ============================================================================
// TYPES
// ============================================================================

interface DataExportResult {
  exportId: string;
  requestedAt: string;
  userId: string;
  format: 'json' | 'csv';
  status: 'pending' | 'processing' | 'ready' | 'expired';
  downloadUrl?: string;
  expiresAt?: string;
  categories: string[];
  summary: {
    profilePresent: boolean;
    conversationCount: number;
    keyMomentsCount: number;
    goalsCount: number;
    totalDataPoints: number;
  };
}

interface UserDataExport {
  exportMetadata: {
    exportId: string;
    exportedAt: string;
    userId: string;
    format: 'json';
    version: string;
    categories: string[];
  };
  profile?: {
    id: string;
    name?: string;
    preferredName?: string;
    firstContact: string;
    lastContact: string;
    totalConversations: number;
    totalMinutesTalked: number;
    communicationStyle: string;
    relationshipStage: string;
    preferences: Record<string, unknown>;
    // Masked contact info
    contactInfo?: {
      phone?: string; // Masked
      email?: string; // Masked
      timezone?: string;
    };
  };
  conversations?: Array<{
    id: string;
    sessionId: string;
    timestamp: string;
    duration: number;
    mainTopics: string[];
    keyPoints: string[];
    emotionalArc: string;
  }>;
  keyMoments?: Array<{
    id: string;
    timestamp: string;
    type: string;
    summary: string;
    emotionalWeight: string;
    topics: string[];
  }>;
  goals?: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    createdAt: string;
  }>;
  familyMembers?: Array<{
    relationship: string;
    name?: string;
    mentionedTopics?: string[];
  }>;
  lifeEvents?: Array<{
    id: string;
    type: string;
    title: string;
    status: string;
    date?: string;
  }>;
  preferences?: {
    verbosity: string;
    topicsToAvoid: string[];
    wantsProactiveAdvice: boolean;
    financialPrivacyLevel: string;
  };
  intelligenceData?: {
    detectedCognitiveStyle?: string;
    expertiseAreas?: string[];
    preferredApproaches?: string[];
  };
  wellbeing?: {
    profile?: {
      totalSnapshots: number;
      firstSnapshot?: string;
      lastSnapshot?: string;
      weeklyTrends: Array<{
        dimension: string;
        direction: string;
        magnitude: number;
      }>;
    };
    snapshots: Array<{
      id: string;
      timestamp: string;
      source: string;
      dimensions: Record<string, number>;
      topic?: string;
    }>;
  };
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleGDPRRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle /api/gdpr/* routes
  if (!pathname.startsWith('/api/gdpr')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Strict rate limiting for GDPR operations (expensive)
  if (rateLimit(req, res, { maxRequests: 10, windowMs: 60000 })) {
    return true;
  }

  // All GDPR routes require authentication
  const auth = await requireAuth(req, res);
  if (!auth) return true;

  const { userId } = auth;
  const method = req.method || 'GET';
  const url = new URL(pathname, 'http://localhost');

  try {
    // ============================================================================
    // GET /api/gdpr/export - Request data export
    // ============================================================================
    if (pathname === '/api/gdpr/export' && method === 'GET') {
      return await handleExportRequest(req, res, userId);
    }

    // ============================================================================
    // GET /api/gdpr/export/:exportId - Download export
    // ============================================================================
    const exportMatch = pathname.match(/^\/api\/gdpr\/export\/([a-z0-9_]+)$/);
    if (exportMatch && method === 'GET') {
      const exportId = exportMatch[1];
      return await handleExportDownload(req, res, userId, exportId);
    }

    // ============================================================================
    // GET /api/gdpr/data-summary - Get summary of stored data
    // ============================================================================
    if (pathname === '/api/gdpr/data-summary' && method === 'GET') {
      return await handleDataSummary(req, res, userId);
    }

    // ============================================================================
    // DELETE /api/gdpr/account - Request account deletion
    // ============================================================================
    if (pathname === '/api/gdpr/account' && method === 'DELETE') {
      return await handleAccountDeletion(req, res, userId);
    }

    // ============================================================================
    // POST /api/gdpr/rectify - Update/correct data
    // ============================================================================
    if (pathname === '/api/gdpr/rectify' && method === 'POST') {
      return await handleDataRectification(req, res, userId);
    }

    // ============================================================================
    // GET /api/gdpr/consent - Get consent preferences
    // ============================================================================
    if (pathname === '/api/gdpr/consent' && method === 'GET') {
      return await handleGetConsent(req, res, userId);
    }

    // ============================================================================
    // PUT /api/gdpr/consent - Update consent preferences
    // ============================================================================
    if (pathname === '/api/gdpr/consent' && method === 'PUT') {
      return await handleUpdateConsent(req, res, userId);
    }

    // Route not found
    sendError(res, 'GDPR endpoint not found', 404);
    return true;
  } catch (error) {
    log.error({ error, pathname, userId }, 'GDPR route error');
    sendError(res, 'Internal error processing GDPR request', 500);
    return true;
  }
}

// ============================================================================
// EXPORT HANDLERS
// ============================================================================

async function handleExportRequest(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<boolean> {
  log.info({ userId }, 'Data export requested');

  // Record this sensitive access
  await recordDataAccess({
    userId,
    targetUserId: userId,
    dataType: 'full_export',
    action: 'export',
    ip: req.socket.remoteAddress,
  });

  try {
    // Get the memory store
    const { getDefaultStore } = await import('../memory/index.js');
    const store = getDefaultStore();
    await store.initialize();

    // Export all user data
    const exportData = await store.exportUserData(userId);

    // Build the export
    const exportId = `exp_${userId}_${Date.now()}`;
    const now = new Date();

    const result: UserDataExport = {
      exportMetadata: {
        exportId,
        exportedAt: now.toISOString(),
        userId,
        format: 'json',
        version: '1.1',
        categories: [
          'profile',
          'conversations',
          'moments',
          'goals',
          'family',
          'events',
          'preferences',
          'wellbeing',
        ],
      },
    };

    // Add profile data (with masked PII)
    if (exportData.profile) {
      const { profile } = exportData;
      result.profile = {
        id: profile.id,
        name: profile.name,
        preferredName: profile.preferredName,
        firstContact: profile.firstContact.toISOString(),
        lastContact: profile.lastContact.toISOString(),
        totalConversations: profile.totalConversations,
        totalMinutesTalked: profile.totalMinutesTalked,
        communicationStyle: profile.communicationStyle,
        relationshipStage: profile.relationshipStage,
        preferences: { ...profile.preferences } as Record<string, unknown>,
        contactInfo: profile.contactInfo
          ? {
              phone: profile.contactInfo.phone
                ? maskPhoneNumber(profile.contactInfo.phone)
                : undefined,
              email: profile.contactInfo.email ? maskEmail(profile.contactInfo.email) : undefined,
              timezone: profile.contactInfo.timezone,
            }
          : undefined,
      };

      // Add family members
      result.familyMembers = profile.familyMembers?.map((m) => ({
        relationship: m.relationship,
        name: m.name,
        mentionedTopics: m.mentionedTopics,
      }));

      // Add life events
      result.lifeEvents = profile.lifeEvents?.map((e) => ({
        id: e.id,
        type: e.type,
        title: e.title,
        status: e.status,
        date: e.date?.toISOString(),
      }));

      // Add preferences
      result.preferences = {
        verbosity: profile.preferences.verbosity,
        topicsToAvoid: profile.preferences.topicsToAvoid,
        wantsProactiveAdvice: profile.preferences.wantsProactiveAdvice,
        financialPrivacyLevel: profile.preferences.financialPrivacyLevel,
      };

      // Add cognitive intelligence summary (no raw data)
      if (profile.cognitiveIntelligence) {
        result.intelligenceData = {
          detectedCognitiveStyle: profile.cognitiveIntelligence.detectedStyle,
          expertiseAreas: profile.cognitiveIntelligence.expertiseAreas,
          preferredApproaches: [],
        };
      }
    }

    // Add conversation summaries
    result.conversations = exportData.summaries.map((s) => ({
      id: s.id,
      sessionId: s.sessionId,
      timestamp: s.timestamp.toISOString(),
      duration: s.duration,
      mainTopics: s.mainTopics,
      keyPoints: s.keyPoints,
      emotionalArc: s.emotionalArc,
    }));

    // Add key moments
    result.keyMoments = exportData.moments.map((m) => ({
      id: m.id,
      timestamp: m.timestamp.toISOString(),
      type: m.type,
      summary: m.summary,
      emotionalWeight: m.emotionalWeight,
      topics: m.topics,
    }));

    // Add goals
    result.goals = exportData.goals.map((g) => ({
      id: g.id,
      name: g.name,
      type: g.type,
      status: g.status,
      createdAt: g.createdAt.toISOString(),
    }));

    // Add wellbeing data
    try {
      const { exportWellbeingData } = await import('../services/wellbeing-tracking/persistence.js');
      const wellbeingData = await exportWellbeingData(userId);
      if (wellbeingData) {
        result.wellbeing = {
          profile: wellbeingData.profile
            ? {
                totalSnapshots: wellbeingData.profile.totalSnapshots,
                firstSnapshot: wellbeingData.profile.firstSnapshot?.toISOString(),
                lastSnapshot: wellbeingData.profile.lastSnapshot?.toISOString(),
                weeklyTrends: wellbeingData.profile.weeklyTrends.map((t) => ({
                  dimension: t.dimension,
                  direction: t.direction,
                  magnitude: t.magnitude,
                })),
              }
            : undefined,
          snapshots: wellbeingData.snapshots.map((s) => ({
            id: s.id,
            timestamp: s.timestamp.toISOString(),
            source: s.source,
            dimensions: s.dimensions as Record<string, number>,
            topic: s.topic,
          })),
        };
      }
    } catch (wellbeingError) {
      log.warn({ error: String(wellbeingError), userId }, 'Failed to export wellbeing data');
      // Continue without wellbeing data - non-fatal
    }

    // Return the export
    const response: DataExportResult = {
      exportId,
      requestedAt: now.toISOString(),
      userId,
      format: 'json',
      status: 'ready',
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), // 24h
      categories: result.exportMetadata.categories,
      summary: {
        profilePresent: !!result.profile,
        conversationCount: result.conversations?.length || 0,
        keyMomentsCount: result.keyMoments?.length || 0,
        goalsCount: result.goals?.length || 0,
        totalDataPoints:
          (result.conversations?.length || 0) +
          (result.keyMoments?.length || 0) +
          (result.goals?.length || 0) +
          (result.familyMembers?.length || 0) +
          (result.lifeEvents?.length || 0) +
          (result.wellbeing?.snapshots?.length || 0),
      },
    };

    // Store export for later download (in production, use a proper storage)
    exportStorage.set(exportId, {
      data: result,
      userId,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    });

    sendJSON(res, response);
    return true;
  } catch (error) {
    log.error({ error, userId }, 'Export failed');
    sendError(res, 'Failed to export data', 500);
    return true;
  }
}

async function handleExportDownload(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  exportId: string
): Promise<boolean> {
  const stored = exportStorage.get(exportId);

  if (!stored) {
    sendError(res, 'Export not found or expired', 404);
    return true;
  }

  if (stored.userId !== userId) {
    await recordSecurityEvent({
      type: 'suspicious_activity',
      actorId: userId,
      targetId: stored.userId,
      action: "Attempted to download another user's export",
      outcome: 'blocked',
    });
    sendError(res, 'Access denied', 403);
    return true;
  }

  if (stored.expiresAt < new Date()) {
    exportStorage.delete(exportId);
    sendError(res, 'Export expired', 410);
    return true;
  }

  // Record the download
  await recordDataAccess({
    userId,
    targetUserId: userId,
    dataType: 'full_export',
    action: 'export',
    ip: req.socket.remoteAddress,
  });

  // Set download headers
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="ferni-data-export-${exportId}.json"`);

  sendJSON(res, stored.data);
  return true;
}

// ============================================================================
// DATA SUMMARY HANDLER
// ============================================================================

async function handleDataSummary(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<boolean> {
  try {
    const { getDefaultStore } = await import('../memory/index.js');
    const store = getDefaultStore();
    await store.initialize();

    const profile = await store.getProfile(userId);
    const summaries = await store.getSummaries(userId);
    const moments = await store.getKeyMoments(userId);
    const goals = await store.getGoals(userId);

    // Get wellbeing data count
    let wellbeingSnapshotCount = 0;
    try {
      const { getRecentSnapshots } = await import('../services/wellbeing-tracking/index.js');
      wellbeingSnapshotCount = getRecentSnapshots(userId, 365).length;
    } catch {
      // Wellbeing data not available
    }

    const summary = {
      userId,
      hasProfile: !!profile,
      dataCategories: {
        profile: {
          present: !!profile,
          fields: profile
            ? Object.keys(stripPII({ ...profile } as unknown as Record<string, unknown>)).length
            : 0,
        },
        conversations: {
          count: summaries.length,
          oldestDate: summaries.length
            ? summaries
                .map((s) => s.timestamp)
                .sort((a, b) => a.getTime() - b.getTime())[0]
                ?.toISOString()
            : null,
          newestDate: summaries.length
            ? summaries
                .map((s) => s.timestamp)
                .sort((a, b) => b.getTime() - a.getTime())[0]
                ?.toISOString()
            : null,
        },
        keyMoments: {
          count: moments.length,
          types: [...new Set(moments.map((m) => m.type))],
        },
        goals: {
          count: goals.length,
          activeCount: goals.filter((g) => g.status === 'active').length,
        },
        familyMembers: {
          count: profile?.familyMembers?.length || 0,
        },
        lifeEvents: {
          count: profile?.lifeEvents?.length || 0,
        },
        wellbeing: {
          snapshotCount: wellbeingSnapshotCount,
          description: 'Mood, energy, and wellness tracking data',
        },
      },
      retentionPolicy: {
        conversationSummaries: '1 year (or until deletion)',
        keyMoments: 'Indefinite (emotionally significant)',
        voiceSketch: 'Until deletion request',
        analyticsData: '90 days',
        wellbeingData: 'Until deletion request',
      },
      rights: {
        export: '/api/gdpr/export',
        delete: '/api/gdpr/account (DELETE)',
        rectify: '/api/gdpr/rectify (POST)',
        consent: '/api/gdpr/consent',
      },
    };

    sendJSON(res, summary);
    return true;
  } catch (error) {
    log.error({ error, userId }, 'Data summary failed');
    sendError(res, 'Failed to get data summary', 500);
    return true;
  }
}

// ============================================================================
// DELETION HANDLER
// ============================================================================

async function handleAccountDeletion(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<boolean> {
  // Parse confirmation from body
  const body = await parseBody<{ confirmation?: string }>(req);

  if (!body || body.confirmation !== 'DELETE_MY_DATA') {
    sendError(
      res,
      'Account deletion requires confirmation. Send { "confirmation": "DELETE_MY_DATA" }',
      400
    );
    return true;
  }

  log.warn({ userId }, 'Account deletion requested');

  // Record this critical event
  await recordSecurityEvent({
    type: 'profile_delete',
    actorId: userId,
    targetId: userId,
    action: 'User requested account deletion',
    outcome: 'success',
    ip: req.socket.remoteAddress,
  });

  try {
    const { getDefaultStore } = await import('../memory/index.js');
    const store = getDefaultStore();
    await store.initialize();

    // Delete profile and all associated data
    const deleted = await store.deleteProfile(userId);

    // Delete wellbeing data
    let wellbeingDeleted = false;
    try {
      const { deleteWellbeingData } = await import('../services/wellbeing-tracking/persistence.js');
      wellbeingDeleted = await deleteWellbeingData(userId);
      if (wellbeingDeleted) {
        log.info({ userId: `${userId.substring(0, 8)}...` }, 'Wellbeing data deleted');
      }
    } catch (wellbeingErr) {
      log.warn(
        { error: String(wellbeingErr), userId: `${userId.substring(0, 8)}...` },
        'Wellbeing data deletion failed (non-fatal)'
      );
    }

    // Also delete Firebase user if this is a Firebase UID
    // Firebase UIDs are 28 characters and don't start with 'device:'
    let firebaseDeleted = false;
    if (!userId.startsWith('device:') && userId.length >= 20) {
      try {
        const { deleteFirebaseUser } = await import('../services/identity/firebase-auth.js');
        firebaseDeleted = await deleteFirebaseUser(userId);
        if (firebaseDeleted) {
          log.info({ userId: `${userId.substring(0, 8)}...` }, 'Firebase user deleted');
        }
      } catch (firebaseErr) {
        // Firebase deletion is best-effort - don't fail the whole request
        log.warn(
          { error: String(firebaseErr), userId: `${userId.substring(0, 8)}...` },
          'Firebase user deletion failed (non-fatal)'
        );
      }
    }

    if (deleted || firebaseDeleted || wellbeingDeleted) {
      sendJSON(res, {
        success: true,
        message: 'Your account and all associated data have been deleted.',
        deletedAt: new Date().toISOString(),
        note: 'This action is irreversible. Thank you for using Ferni.',
        details: {
          profileDeleted: deleted,
          firebaseDeleted,
          wellbeingDeleted,
        },
      });
    } else {
      sendJSON(res, {
        success: false,
        message: 'No profile found to delete. You may not have an account.',
      });
    }

    return true;
  } catch (error) {
    log.error({ error, userId }, 'Account deletion failed');
    sendError(res, 'Failed to delete account. Please contact support.', 500);
    return true;
  }
}

// ============================================================================
// RECTIFICATION HANDLER
// ============================================================================

async function handleDataRectification(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<boolean> {
  const body = await parseBody<{
    corrections: Array<{
      field: string;
      newValue: unknown;
      reason?: string;
    }>;
  }>(req);

  if (!body || !body.corrections || !Array.isArray(body.corrections)) {
    sendError(
      res,
      'Invalid request. Send { "corrections": [{ "field": "...", "newValue": "..." }] }',
      400
    );
    return true;
  }

  // Allowed fields for self-correction
  const allowedFields = new Set([
    'name',
    'preferredName',
    'preferences.verbosity',
    'preferences.topicsToAvoid',
    'preferences.wantsProactiveAdvice',
    'contactInfo.timezone',
  ]);

  const invalidFields = body.corrections.filter((c) => !allowedFields.has(c.field));
  if (invalidFields.length > 0) {
    sendError(
      res,
      `Cannot modify these fields directly: ${invalidFields.map((f) => f.field).join(', ')}. Contact support for other corrections.`,
      400
    );
    return true;
  }

  try {
    const { getDefaultStore } = await import('../memory/index.js');
    const store = getDefaultStore();
    await store.initialize();

    const profile = await store.getProfile(userId);
    if (!profile) {
      sendError(res, 'Profile not found', 404);
      return true;
    }

    // Apply corrections
    const applied: string[] = [];
    for (const correction of body.corrections) {
      const parts = correction.field.split('.');
      let target: Record<string, unknown> = profile as unknown as Record<string, unknown>;

      for (let i = 0; i < parts.length - 1; i++) {
        if (!target[parts[i]]) {
          target[parts[i]] = {};
        }
        target = target[parts[i]] as Record<string, unknown>;
      }

      const finalKey = parts[parts.length - 1];
      target[finalKey] = correction.newValue;
      applied.push(correction.field);
    }

    profile.updatedAt = new Date();
    await store.saveProfile(profile);

    // Record the rectification
    await recordDataAccess({
      userId,
      targetUserId: userId,
      dataType: 'profile',
      action: 'update',
      ip: req.socket.remoteAddress,
    });

    sendJSON(res, {
      success: true,
      correctedFields: applied,
      message: 'Your data has been updated.',
    });

    return true;
  } catch (error) {
    log.error({ error, userId }, 'Data rectification failed');
    sendError(res, 'Failed to update data', 500);
    return true;
  }
}

// ============================================================================
// CONSENT HANDLERS
// ============================================================================

async function handleGetConsent(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<boolean> {
  try {
    const { getDefaultStore } = await import('../memory/index.js');
    const store = getDefaultStore();
    await store.initialize();

    const profile = await store.getProfile(userId);

    // Default consent settings
    const consent = {
      userId,
      dataProcessing: true, // Required for service
      voiceAnalysis: true, // For voice recognition
      personalizedResponses: true, // For AI personalization
      analyticsCollection: true, // For improvement
      proactiveInsights: profile?.preferences?.wantsProactiveAdvice ?? true,
      emailCommunications: false, // Default off
      marketingCommunications: false, // Default off
      lastUpdated: profile?.updatedAt?.toISOString() || new Date().toISOString(),
    };

    sendJSON(res, consent);
    return true;
  } catch (error) {
    log.error({ error, userId }, 'Get consent failed');
    sendError(res, 'Failed to get consent preferences', 500);
    return true;
  }
}

async function handleUpdateConsent(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<boolean> {
  const body = await parseBody<{
    proactiveInsights?: boolean;
    emailCommunications?: boolean;
    marketingCommunications?: boolean;
    analyticsCollection?: boolean;
  }>(req);

  if (!body) {
    sendError(res, 'Invalid request body', 400);
    return true;
  }

  try {
    const { getDefaultStore } = await import('../memory/index.js');
    const store = getDefaultStore();
    await store.initialize();

    const profile = await store.getProfile(userId);
    if (!profile) {
      sendError(res, 'Profile not found', 404);
      return true;
    }

    // Update consent-related preferences
    if (body.proactiveInsights !== undefined) {
      profile.preferences.wantsProactiveAdvice = body.proactiveInsights;
    }

    profile.updatedAt = new Date();
    await store.saveProfile(profile);

    sendJSON(res, {
      success: true,
      message: 'Consent preferences updated.',
      updatedAt: profile.updatedAt.toISOString(),
    });

    return true;
  } catch (error) {
    log.error({ error, userId }, 'Update consent failed');
    sendError(res, 'Failed to update consent', 500);
    return true;
  }
}

// ============================================================================
// EXPORT STORAGE (In-memory for now, use Redis/Firestore in production)
// ============================================================================

const exportStorage = new Map<
  string,
  {
    data: UserDataExport;
    userId: string;
    expiresAt: Date;
  }
>();

// Cleanup expired exports periodically
setInterval(
  () => {
    const now = new Date();
    for (const [exportId, stored] of exportStorage) {
      if (stored.expiresAt < now) {
        exportStorage.delete(exportId);
      }
    }
  },
  60 * 60 * 1000
); // Every hour

// ============================================================================
// EXPORTS
// ============================================================================

export default handleGDPRRoutes;
