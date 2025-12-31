/**
 * Utilities API Routes
 *
 * REST API for managing common utilities: reminders, lists, alarms, voice memos.
 * These complement the voice agent tools by allowing UI access.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'UtilitiesRoutes' });

// Helper to parse JSON body
async function parseBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('error', reject);
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}') as T);
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

// Helper to get user ID from request
function getUserId(req: IncomingMessage): string | null {
  const url = new URL(req.url || '/', `http://localhost`);
  return url.searchParams.get('userId');
}

// Helper to send JSON response
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Handle utilities routes
 */
export async function handleUtilitiesRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  const method = req.method?.toUpperCase();

  // ============================================================================
  // REMINDERS
  // ============================================================================

  // GET /api/utilities/reminders - List pending reminders
  if (pathname === '/api/utilities/reminders' && method === 'GET') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 400, { error: 'userId required' });
      return true;
    }

    try {
      const { getPendingReminders, loadRemindersFromFirestore } =
        await import('../../../services/scheduling/reminder-scheduler.js');

      // Load from Firestore first
      await loadRemindersFromFirestore(userId);
      const reminders = getPendingReminders(userId);

      sendJson(res, 200, {
        reminders: reminders.map((r) => ({
          id: r.id,
          message: r.message,
          scheduledFor: r.scheduledFor.toISOString(),
          deliveryMethod: r.deliveryMethod,
          status: r.status,
          createdBy: r.createdBy,
        })),
        count: reminders.length,
      });
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to get reminders');
      sendJson(res, 500, { error: 'Failed to get reminders' });
    }
    return true;
  }

  // POST /api/utilities/reminders - Create a reminder
  if (pathname === '/api/utilities/reminders' && method === 'POST') {
    try {
      const body = await parseBody<{
        userId: string;
        message: string;
        when: string;
        deliveryMethod?: 'sms' | 'email' | 'voice_message';
        deliveryAddress?: string;
      }>(req);

      if (!body.userId || !body.message || !body.when) {
        sendJson(res, 400, { error: 'userId, message, and when are required' });
        return true;
      }

      const { createReminder, parseNaturalTime } =
        await import('../../../services/scheduling/reminder-scheduler.js');

      const scheduledFor = parseNaturalTime(body.when);
      if (!scheduledFor) {
        sendJson(res, 400, { error: `Could not parse time: "${body.when}"` });
        return true;
      }

      const deliveryMethod = body.deliveryMethod || 'voice_message';
      const deliveryAddress =
        body.deliveryAddress || (deliveryMethod === 'voice_message' ? `voice:${body.userId}` : '');

      const reminder = await createReminder({
        userId: body.userId,
        message: body.message,
        scheduledFor,
        deliveryMethod,
        deliveryAddress,
        createdBy: 'api',
      });

      log.info({ reminderId: reminder.id, userId: body.userId }, 'Reminder created via API');
      sendJson(res, 201, {
        reminder: { id: reminder.id, scheduledFor: scheduledFor.toISOString() },
      });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to create reminder');
      sendJson(res, 500, { error: 'Failed to create reminder' });
    }
    return true;
  }

  // DELETE /api/utilities/reminders/:id - Cancel a reminder
  if (pathname.startsWith('/api/utilities/reminders/') && method === 'DELETE') {
    const reminderId = pathname.split('/').pop();
    if (!reminderId) {
      sendJson(res, 400, { error: 'reminderId required' });
      return true;
    }

    try {
      const { cancelReminder } = await import('../../../services/scheduling/reminder-scheduler.js');
      const success = await cancelReminder(reminderId);

      if (success) {
        sendJson(res, 200, { success: true });
      } else {
        sendJson(res, 404, { error: 'Reminder not found or already processed' });
      }
    } catch (error) {
      log.error({ error: String(error), reminderId }, 'Failed to cancel reminder');
      sendJson(res, 500, { error: 'Failed to cancel reminder' });
    }
    return true;
  }

  // ============================================================================
  // LISTS
  // ============================================================================

  // GET /api/utilities/lists - List all user lists
  if (pathname === '/api/utilities/lists' && method === 'GET') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 400, { error: 'userId required' });
      return true;
    }

    try {
      const { getFirestoreDb } = await import('../../../services/superhuman/firestore-utils.js');
      const db = getFirestoreDb();

      if (!db) {
        sendJson(res, 200, { lists: [], count: 0 });
        return true;
      }

      const snapshot = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('lists')
        .where('archived', '==', false)
        .get();

      const lists = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      sendJson(res, 200, { lists, count: lists.length });
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to get lists');
      sendJson(res, 500, { error: 'Failed to get lists' });
    }
    return true;
  }

  // GET /api/utilities/lists/:id - Get a specific list
  if (pathname.match(/^\/api\/utilities\/lists\/[^/]+$/) && method === 'GET') {
    const listId = pathname.split('/').pop();
    const userId = getUserId(req);

    if (!userId || !listId) {
      sendJson(res, 400, { error: 'userId and listId required' });
      return true;
    }

    try {
      const { getFirestoreDb } = await import('../../../services/superhuman/firestore-utils.js');
      const db = getFirestoreDb();

      if (!db) {
        sendJson(res, 404, { error: 'List not found' });
        return true;
      }

      const doc = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('lists')
        .doc(listId)
        .get();

      if (!doc.exists) {
        sendJson(res, 404, { error: 'List not found' });
        return true;
      }

      sendJson(res, 200, { list: { id: doc.id, ...doc.data() } });
    } catch (error) {
      log.error({ error: String(error), userId, listId }, 'Failed to get list');
      sendJson(res, 500, { error: 'Failed to get list' });
    }
    return true;
  }

  // ============================================================================
  // ALARMS
  // ============================================================================

  // GET /api/utilities/alarms - List all alarms
  if (pathname === '/api/utilities/alarms' && method === 'GET') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 400, { error: 'userId required' });
      return true;
    }

    try {
      const { getFirestoreDb } = await import('../../../services/superhuman/firestore-utils.js');
      const db = getFirestoreDb();

      if (!db) {
        sendJson(res, 200, { alarms: [], count: 0 });
        return true;
      }

      const snapshot = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('alarms')
        .where('enabled', '==', true)
        .get();

      const alarms = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      sendJson(res, 200, { alarms, count: alarms.length });
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to get alarms');
      sendJson(res, 500, { error: 'Failed to get alarms' });
    }
    return true;
  }

  // ============================================================================
  // VOICE MEMOS
  // ============================================================================

  // GET /api/utilities/voice-memos - List voice memos
  if (pathname === '/api/utilities/voice-memos' && method === 'GET') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 400, { error: 'userId required' });
      return true;
    }

    try {
      const { getFirestoreDb } = await import('../../../services/superhuman/firestore-utils.js');
      const db = getFirestoreDb();

      if (!db) {
        sendJson(res, 200, { memos: [], count: 0 });
        return true;
      }

      const snapshot = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('voice_memos')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();

      const memos = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      sendJson(res, 200, { memos, count: memos.length });
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to get voice memos');
      sendJson(res, 500, { error: 'Failed to get voice memos' });
    }
    return true;
  }

  // ============================================================================
  // HEALTH CHECK
  // ============================================================================

  // GET /api/utilities/health - Check utilities service health
  if (pathname === '/api/utilities/health' && method === 'GET') {
    try {
      const { getFirestoreDb } = await import('../../../services/superhuman/firestore-utils.js');
      const db = getFirestoreDb();

      sendJson(res, 200, {
        status: 'healthy',
        firestore: db ? 'connected' : 'not configured',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      sendJson(res, 200, {
        status: 'degraded',
        firestore: 'error',
        error: String(error),
        timestamp: new Date().toISOString(),
      });
    }
    return true;
  }

  return false;
}
