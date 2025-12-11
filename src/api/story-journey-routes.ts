/**
 * Story Journey API Routes
 *
 * Backend persistence for narrative story tracking.
 * Completes the frontend story-tracker.ts integration.
 *
 * @module StoryJourneyRoutes
 */

import { getFirestore } from 'firebase-admin/firestore';
import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAuth } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded } from './helpers.js';

const log = createLogger({ module: 'StoryJourneyAPI' });

// ============================================================================
// TYPES
// ============================================================================

interface StoryMilestone {
  id: string;
  title: string;
  description: string;
  achievedAt: string;
  category: string;
}

interface NarrativeThread {
  id: string;
  topic: string;
  status: 'active' | 'resolved' | 'paused';
  startedAt: string;
  lastUpdatedAt: string;
  notes: string[];
}

interface StoryJourney {
  userId: string;
  milestones: StoryMilestone[];
  threads: NarrativeThread[];
  totalSessions: number;
  totalMinutes: number;
  firstSessionAt: string;
  lastSessionAt: string;
  updatedAt: Date;
}

// ============================================================================
// HELPERS
// ============================================================================

function parseJson(body: string): Record<string, unknown> | null {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function getBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => resolve(body));
  });
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleStoryJourneyRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Apply rate limiting
  if (rateLimit(req, res, { maxRequests: 100, windowMs: 60000 })) {
    return true;
  }

  // Require authentication
  const auth = await requireAuth(req, res, { allowDevMode: true });
  if (!auth) {
    return true; // 401 already sent
  }

  const method = req.method || 'GET';

  // GET /api/story-journey/:userId - Get story journey
  const getMatch = pathname.match(/^\/api\/story-journey\/([^/]+)$/);
  if (getMatch && method === 'GET') {
    // SECURITY: Use authenticated userId
    const { userId } = auth;
    try {
      const db = getFirestore();
      const doc = await db.collection('story_journeys').doc(userId).get();

      if (!doc.exists) {
        // Return default journey
        sendJson(res, 200, {
          userId,
          milestones: [],
          threads: [],
          totalSessions: 0,
          totalMinutes: 0,
          firstSessionAt: null,
          lastSessionAt: null,
          updatedAt: new Date().toISOString(),
        });
        return true;
      }

      sendJson(res, 200, doc.data());
      return true;
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to get story journey');
      sendJson(res, 500, { error: 'Failed to get story journey' });
      return true;
    }
  }

  // PUT /api/story-journey/:userId - Update full journey
  const putMatch = pathname.match(/^\/api\/story-journey\/([^/]+)$/);
  if (putMatch && method === 'PUT') {
    // SECURITY: Use authenticated userId
    const { userId } = auth;
    try {
      const body = await getBody(req);
      const data = parseJson(body);

      if (!data) {
        sendJson(res, 400, { error: 'Invalid JSON' });
        return true;
      }

      const db = getFirestore();
      const journey: Partial<StoryJourney> = {
        userId,
        updatedAt: new Date(),
        ...data,
      };

      await db.collection('story_journeys').doc(userId).set(journey, { merge: true });

      log.info({ userId }, 'Story journey updated');
      sendJson(res, 200, { success: true, journey });
      return true;
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to update story journey');
      sendJson(res, 500, { error: 'Failed to update story journey' });
      return true;
    }
  }

  // POST /api/story-journey/:userId/milestones - Add milestone
  const addMilestoneMatch = pathname.match(/^\/api\/story-journey\/([^/]+)\/milestones$/);
  if (addMilestoneMatch && method === 'POST') {
    // SECURITY: Use authenticated userId
    const { userId } = auth;
    try {
      const body = await getBody(req);
      const milestone = parseJson(body) as Partial<StoryMilestone> | null;

      if (!milestone || !milestone.title) {
        sendJson(res, 400, { error: 'Invalid milestone data' });
        return true;
      }

      const db = getFirestore();
      const docRef = db.collection('story_journeys').doc(userId);
      const doc = await docRef.get();

      const currentMilestones = doc.exists ? doc.data()?.milestones || [] : [];
      const newMilestone: StoryMilestone = {
        id: milestone.id || `milestone_${Date.now()}`,
        title: milestone.title,
        description: milestone.description || '',
        achievedAt: milestone.achievedAt || new Date().toISOString(),
        category: milestone.category || 'general',
      };

      await docRef.set(
        {
          userId,
          milestones: [...currentMilestones, newMilestone],
          updatedAt: new Date(),
        },
        { merge: true }
      );

      log.info({ userId, milestoneId: newMilestone.id }, 'Story milestone added');
      sendJson(res, 201, { success: true, milestone: newMilestone });
      return true;
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to add milestone');
      sendJson(res, 500, { error: 'Failed to add milestone' });
      return true;
    }
  }

  // POST /api/story-journey/:userId/threads - Add or update thread
  const threadMatch = pathname.match(/^\/api\/story-journey\/([^/]+)\/threads$/);
  if (threadMatch && method === 'POST') {
    // SECURITY: Use authenticated userId
    const { userId } = auth;
    try {
      const body = await getBody(req);
      const thread = parseJson(body) as Partial<NarrativeThread> | null;

      if (!thread || !thread.topic) {
        sendJson(res, 400, { error: 'Invalid thread data' });
        return true;
      }

      const db = getFirestore();
      const docRef = db.collection('story_journeys').doc(userId);
      const doc = await docRef.get();

      const currentThreads: NarrativeThread[] = doc.exists ? doc.data()?.threads || [] : [];

      // Check if thread exists
      const existingIndex = currentThreads.findIndex((t) => t.id === thread.id);

      if (existingIndex >= 0) {
        // Update existing thread
        currentThreads[existingIndex] = {
          ...currentThreads[existingIndex],
          ...thread,
          lastUpdatedAt: new Date().toISOString(),
        };
      } else {
        // Add new thread
        const newThread: NarrativeThread = {
          id: thread.id || `thread_${Date.now()}`,
          topic: thread.topic,
          status: thread.status || 'active',
          startedAt: thread.startedAt || new Date().toISOString(),
          lastUpdatedAt: new Date().toISOString(),
          notes: thread.notes || [],
        };
        currentThreads.push(newThread);
      }

      await docRef.set(
        {
          userId,
          threads: currentThreads,
          updatedAt: new Date(),
        },
        { merge: true }
      );

      log.info({ userId, threadId: thread.id }, 'Story thread updated');
      sendJson(res, 200, { success: true, threads: currentThreads });
      return true;
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to update thread');
      sendJson(res, 500, { error: 'Failed to update thread' });
      return true;
    }
  }

  // PATCH /api/story-journey/:userId/session - Record session
  const sessionMatch = pathname.match(/^\/api\/story-journey\/([^/]+)\/session$/);
  if (sessionMatch && method === 'PATCH') {
    // SECURITY: Use authenticated userId
    const { userId } = auth;
    try {
      const body = await getBody(req);
      const data = parseJson(body);

      if (!data) {
        sendJson(res, 400, { error: 'Invalid JSON' });
        return true;
      }

      const db = getFirestore();
      const docRef = db.collection('story_journeys').doc(userId);
      const doc = await docRef.get();

      const currentData = doc.exists ? doc.data() : {};
      const now = new Date().toISOString();

      await docRef.set(
        {
          userId,
          totalSessions: (currentData?.totalSessions || 0) + 1,
          totalMinutes: (currentData?.totalMinutes || 0) + (data.durationMinutes || 0),
          firstSessionAt: currentData?.firstSessionAt || now,
          lastSessionAt: now,
          updatedAt: new Date(),
        },
        { merge: true }
      );

      log.info({ userId }, 'Session recorded');
      sendJson(res, 200, { success: true });
      return true;
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to record session');
      sendJson(res, 500, { error: 'Failed to record session' });
      return true;
    }
  }

  return false;
}

export default handleStoryJourneyRoutes;
