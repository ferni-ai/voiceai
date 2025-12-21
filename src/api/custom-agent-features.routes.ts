/**
 * Custom Agent Features Routes
 *
 * Backend APIs for custom agent features:
 * - Legacy sharing (email invites, shareable links)
 * - Session history (coaching, task, roleplay sessions)
 * - Voice cloning status
 *
 * @module custom-agent-features.routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import * as admin from 'firebase-admin';
import { handleCorsPreflightIfNeeded, parseBody, sendJSON, sendError, getUserId } from './helpers.js';
import { getLogger } from '../utils/safe-logger.js';

const log = getLogger().child({ module: 'CustomAgentFeaturesRoutes' });

// =============================================================================
// FIRESTORE
// =============================================================================

let firestoreInstance: admin.firestore.Firestore | null = null;
let initAttempted = false;

function getFirestore(): admin.firestore.Firestore | null {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  if (initAttempted) {
    return null;
  }
  initAttempted = true;

  try {
    const { apps } = admin;
    if (!apps || apps.length === 0) {
      const projectId =
        process.env.GCP_PROJECT_ID ||
        process.env.FIREBASE_PROJECT_ID ||
        process.env.GOOGLE_CLOUD_PROJECT;

      if (projectId) {
        admin.initializeApp({ projectId });
        log.info({ projectId }, 'Firebase initialized for custom agent features routes');
      } else {
        admin.initializeApp();
        log.info('Firebase initialized with default credentials');
      }
    }

    firestoreInstance = admin.firestore();
    return firestoreInstance;
  } catch (err) {
    log.error({ error: String(err) }, 'Failed to initialize Firestore');
    return null;
  }
}

// ============================================================================
// TYPES
// ============================================================================

interface ShareInvite {
  id: string;
  agentId: string;
  ownerId: string;
  email: string;
  role: 'viewer' | 'contributor';
  status: 'pending' | 'accepted' | 'expired';
  createdAt: string;
  expiresAt: string;
  accessToken?: string;
}

interface ShareLink {
  id: string;
  agentId: string;
  ownerId: string;
  token: string;
  role: 'viewer' | 'contributor';
  expiresAt: string | null;
  viewCount: number;
  createdAt: string;
}

interface CoachingSession {
  id: string;
  agentId: string;
  userId: string;
  topic: string;
  context: string;
  messages: Array<{
    role: 'user' | 'agent';
    content: string;
    timestamp: string;
  }>;
  insights: string[];
  status: 'active' | 'completed';
  startedAt: string;
  completedAt?: string;
}

interface TaskSession {
  id: string;
  agentId: string;
  userId: string;
  taskType: string;
  inputs: Record<string, string>;
  output?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
}

interface RoleplaySession {
  id: string;
  agentId: string;
  userId: string;
  scenario: string;
  mood: string;
  messages: Array<{
    role: 'user' | 'character';
    content: string;
    timestamp: string;
  }>;
  status: 'active' | 'completed';
  startedAt: string;
  completedAt?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function generateToken(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleCustomAgentFeaturesRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Only handle our routes
  if (!pathname.startsWith('/api/custom-agent-features')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'Unauthorized', 401);
    return true;
  }

  const db = getFirestore();
  if (!db) {
    sendError(res, 'Database not available', 503);
    return true;
  }

  const segments = pathname.split('/').filter(Boolean);
  // Expected: /api/custom-agent-features/{feature}/{action}
  const feature = segments[2];
  const action = segments[3];

  // ========================================================================
  // LEGACY SHARING ROUTES
  // ========================================================================

  // POST /api/custom-agent-features/share/invite
  if (feature === 'share' && action === 'invite' && req.method === 'POST') {
    try {
      const body = await parseBody<{
        agentId: string;
        email: string;
        role?: 'viewer' | 'contributor';
        message?: string;
      }>(req);

      if (!body.agentId || !body.email) {
        sendError(res, 'Missing agentId or email', 400);
        return true;
      }

      const invite: ShareInvite = {
        id: `invite-${Date.now()}`,
        agentId: body.agentId,
        ownerId: userId,
        email: body.email,
        role: body.role || 'viewer',
        status: 'pending',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        accessToken: generateToken(),
      };

      // Save to Firestore
      await db.collection('share_invites').doc(invite.id).set(invite);

      // In production, send email via SendGrid/Mailgun
      // For now, just return the invite data
      log.info({ inviteId: invite.id, email: body.email }, 'Share invite created');

      // TODO: Integrate with email service
      // await sendShareInviteEmail(invite, body.message);

      sendJSON(res, {
        success: true,
        invite: {
          id: invite.id,
          email: invite.email,
          role: invite.role,
          expiresAt: invite.expiresAt,
          // Return access link for now (in production, sent via email)
          accessLink: `https://app.ferni.ai/shared/${invite.accessToken}`,
        },
      });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to create share invite');
      sendError(res, 'Failed to create invite', 500);
    }
    return true;
  }

  // POST /api/custom-agent-features/share/link
  if (feature === 'share' && action === 'link' && req.method === 'POST') {
    try {
      const body = await parseBody<{
        agentId: string;
        role?: 'viewer' | 'contributor';
        expiresInDays?: number;
      }>(req);

      if (!body.agentId) {
        sendError(res, 'Missing agentId', 400);
        return true;
      }

      const shareLink: ShareLink = {
        id: `link-${Date.now()}`,
        agentId: body.agentId,
        ownerId: userId,
        token: generateToken(16),
        role: body.role || 'viewer',
        expiresAt: body.expiresInDays
          ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
          : null,
        viewCount: 0,
        createdAt: new Date().toISOString(),
      };

      await db.collection('share_links').doc(shareLink.id).set(shareLink);

      log.info({ linkId: shareLink.id }, 'Share link created');

      sendJSON(res, {
        success: true,
        link: {
          id: shareLink.id,
          url: `https://app.ferni.ai/shared/${shareLink.token}`,
          role: shareLink.role,
          expiresAt: shareLink.expiresAt,
        },
      });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to create share link');
      sendError(res, 'Failed to create share link', 500);
    }
    return true;
  }

  // GET /api/custom-agent-features/share/list?agentId=xxx
  if (feature === 'share' && action === 'list' && req.method === 'GET') {
    try {
      const agentId = parsedUrl.searchParams.get('agentId');
      if (!agentId) {
        sendError(res, 'Missing agentId', 400);
        return true;
      }

      // Get invites
      const invitesSnap = await db
        .collection('share_invites')
        .where('agentId', '==', agentId)
        .where('ownerId', '==', userId)
        .get();

      const invites = invitesSnap.docs.map((doc) => {
        const data = doc.data() as ShareInvite;
        return {
          id: data.id,
          email: data.email,
          role: data.role,
          status: data.status,
          expiresAt: data.expiresAt,
        };
      });

      // Get links
      const linksSnap = await db
        .collection('share_links')
        .where('agentId', '==', agentId)
        .where('ownerId', '==', userId)
        .get();

      const links = linksSnap.docs.map((doc) => {
        const data = doc.data() as ShareLink;
        return {
          id: data.id,
          url: `https://app.ferni.ai/shared/${data.token}`,
          role: data.role,
          viewCount: data.viewCount,
          expiresAt: data.expiresAt,
        };
      });

      sendJSON(res, { invites, links });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to list shares');
      sendError(res, 'Failed to list shares', 500);
    }
    return true;
  }

  // DELETE /api/custom-agent-features/share/revoke
  if (feature === 'share' && action === 'revoke' && req.method === 'DELETE') {
    try {
      const body = await parseBody<{ id: string; type: 'invite' | 'link' }>(req);

      if (!body.id || !body.type) {
        sendError(res, 'Missing id or type', 400);
        return true;
      }

      const collection = body.type === 'invite' ? 'share_invites' : 'share_links';
      const docRef = db.collection(collection).doc(body.id);
      const doc = await docRef.get();

      if (!doc.exists) {
        sendError(res, 'Not found', 404);
        return true;
      }

      const data = doc.data() as ShareInvite | ShareLink;
      if (data.ownerId !== userId) {
        sendError(res, 'Not authorized', 403);
        return true;
      }

      await docRef.delete();

      log.info({ id: body.id, type: body.type }, 'Share revoked');
      sendJSON(res, { success: true });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to revoke share');
      sendError(res, 'Failed to revoke share', 500);
    }
    return true;
  }

  // ========================================================================
  // COACHING SESSION ROUTES
  // ========================================================================

  // POST /api/custom-agent-features/coaching/start
  if (feature === 'coaching' && action === 'start' && req.method === 'POST') {
    try {
      const body = await parseBody<{
        agentId: string;
        topic: string;
        context: string;
      }>(req);

      if (!body.agentId || !body.topic) {
        sendError(res, 'Missing agentId or topic', 400);
        return true;
      }

      const session: CoachingSession = {
        id: `coaching-${Date.now()}`,
        agentId: body.agentId,
        userId,
        topic: body.topic,
        context: body.context || '',
        messages: [],
        insights: [],
        status: 'active',
        startedAt: new Date().toISOString(),
      };

      await db.collection('coaching_sessions').doc(session.id).set(session);

      log.info({ sessionId: session.id }, 'Coaching session started');

      sendJSON(res, { success: true, session });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to start coaching session');
      sendError(res, 'Failed to start session', 500);
    }
    return true;
  }

  // POST /api/custom-agent-features/coaching/message
  if (feature === 'coaching' && action === 'message' && req.method === 'POST') {
    try {
      const body = await parseBody<{
        sessionId: string;
        role: 'user' | 'agent';
        content: string;
      }>(req);

      if (!body.sessionId || !body.content) {
        sendError(res, 'Missing sessionId or content', 400);
        return true;
      }

      const docRef = db.collection('coaching_sessions').doc(body.sessionId);
      const doc = await docRef.get();

      if (!doc.exists) {
        sendError(res, 'Session not found', 404);
        return true;
      }

      const session = doc.data() as CoachingSession;
      if (session.userId !== userId) {
        sendError(res, 'Not authorized', 403);
        return true;
      }

      // Add message
      const message = {
        role: body.role,
        content: body.content,
        timestamp: new Date().toISOString(),
      };

      await docRef.update({
        messages: admin.firestore.FieldValue.arrayUnion(message),
      });

      sendJSON(res, { success: true, message });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to add coaching message');
      sendError(res, 'Failed to add message', 500);
    }
    return true;
  }

  // POST /api/custom-agent-features/coaching/complete
  if (feature === 'coaching' && action === 'complete' && req.method === 'POST') {
    try {
      const body = await parseBody<{
        sessionId: string;
        insights?: string[];
      }>(req);

      if (!body.sessionId) {
        sendError(res, 'Missing sessionId', 400);
        return true;
      }

      const docRef = db.collection('coaching_sessions').doc(body.sessionId);
      const doc = await docRef.get();

      if (!doc.exists) {
        sendError(res, 'Session not found', 404);
        return true;
      }

      const session = doc.data() as CoachingSession;
      if (session.userId !== userId) {
        sendError(res, 'Not authorized', 403);
        return true;
      }

      await docRef.update({
        status: 'completed',
        completedAt: new Date().toISOString(),
        insights: body.insights || [],
      });

      log.info({ sessionId: body.sessionId }, 'Coaching session completed');

      sendJSON(res, { success: true });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to complete coaching session');
      sendError(res, 'Failed to complete session', 500);
    }
    return true;
  }

  // GET /api/custom-agent-features/coaching/history?agentId=xxx
  if (feature === 'coaching' && action === 'history' && req.method === 'GET') {
    try {
      const agentId = parsedUrl.searchParams.get('agentId');
      if (!agentId) {
        sendError(res, 'Missing agentId', 400);
        return true;
      }

      const snap = await db
        .collection('coaching_sessions')
        .where('agentId', '==', agentId)
        .where('userId', '==', userId)
        .orderBy('startedAt', 'desc')
        .limit(50)
        .get();

      const sessions = snap.docs.map((doc) => {
        const data = doc.data() as CoachingSession;
        return {
          id: data.id,
          topic: data.topic,
          status: data.status,
          messageCount: data.messages.length,
          startedAt: data.startedAt,
          completedAt: data.completedAt,
        };
      });

      sendJSON(res, { sessions });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to get coaching history');
      sendError(res, 'Failed to get history', 500);
    }
    return true;
  }

  // ========================================================================
  // TASK SESSION ROUTES
  // ========================================================================

  // POST /api/custom-agent-features/task/execute
  if (feature === 'task' && action === 'execute' && req.method === 'POST') {
    try {
      const body = await parseBody<{
        agentId: string;
        taskType: string;
        inputs: Record<string, string>;
      }>(req);

      if (!body.agentId || !body.taskType) {
        sendError(res, 'Missing agentId or taskType', 400);
        return true;
      }

      const session: TaskSession = {
        id: `task-${Date.now()}`,
        agentId: body.agentId,
        userId,
        taskType: body.taskType,
        inputs: body.inputs || {},
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      await db.collection('task_sessions').doc(session.id).set(session);

      // TODO: Process task asynchronously and update status

      log.info({ sessionId: session.id, taskType: body.taskType }, 'Task session created');

      sendJSON(res, { success: true, session });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to execute task');
      sendError(res, 'Failed to execute task', 500);
    }
    return true;
  }

  // GET /api/custom-agent-features/task/history?agentId=xxx
  if (feature === 'task' && action === 'history' && req.method === 'GET') {
    try {
      const agentId = parsedUrl.searchParams.get('agentId');
      if (!agentId) {
        sendError(res, 'Missing agentId', 400);
        return true;
      }

      const snap = await db
        .collection('task_sessions')
        .where('agentId', '==', agentId)
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();

      const tasks = snap.docs.map((doc) => {
        const data = doc.data() as TaskSession;
        return {
          id: data.id,
          taskType: data.taskType,
          status: data.status,
          createdAt: data.createdAt,
          completedAt: data.completedAt,
        };
      });

      sendJSON(res, { tasks });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to get task history');
      sendError(res, 'Failed to get history', 500);
    }
    return true;
  }

  // ========================================================================
  // ROLEPLAY SESSION ROUTES
  // ========================================================================

  // POST /api/custom-agent-features/roleplay/start
  if (feature === 'roleplay' && action === 'start' && req.method === 'POST') {
    try {
      const body = await parseBody<{
        agentId: string;
        scenario: string;
        mood: string;
      }>(req);

      if (!body.agentId || !body.scenario) {
        sendError(res, 'Missing agentId or scenario', 400);
        return true;
      }

      const session: RoleplaySession = {
        id: `roleplay-${Date.now()}`,
        agentId: body.agentId,
        userId,
        scenario: body.scenario,
        mood: body.mood || 'neutral',
        messages: [],
        status: 'active',
        startedAt: new Date().toISOString(),
      };

      await db.collection('roleplay_sessions').doc(session.id).set(session);

      log.info({ sessionId: session.id }, 'Roleplay session started');

      sendJSON(res, { success: true, session });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to start roleplay session');
      sendError(res, 'Failed to start session', 500);
    }
    return true;
  }

  // GET /api/custom-agent-features/roleplay/history?agentId=xxx
  if (feature === 'roleplay' && action === 'history' && req.method === 'GET') {
    try {
      const agentId = parsedUrl.searchParams.get('agentId');
      if (!agentId) {
        sendError(res, 'Missing agentId', 400);
        return true;
      }

      const snap = await db
        .collection('roleplay_sessions')
        .where('agentId', '==', agentId)
        .where('userId', '==', userId)
        .orderBy('startedAt', 'desc')
        .limit(50)
        .get();

      const sessions = snap.docs.map((doc) => {
        const data = doc.data() as RoleplaySession;
        return {
          id: data.id,
          scenario: data.scenario,
          mood: data.mood,
          status: data.status,
          messageCount: data.messages.length,
          startedAt: data.startedAt,
          completedAt: data.completedAt,
        };
      });

      sendJSON(res, { sessions });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to get roleplay history');
      sendError(res, 'Failed to get history', 500);
    }
    return true;
  }

  return false;
}

