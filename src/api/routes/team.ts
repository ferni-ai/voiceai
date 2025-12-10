/**
 * Team Routes
 *
 * GET /api/huddles - Get team huddles
 * POST /api/huddles/start - Start a new team huddle
 * GET /api/huddles/:id - Get specific huddle
 * GET /api/huddles/:id/participants - Get huddle participants
 * POST /api/huddles/:id/complete - Complete a huddle
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { requireUserId, sendJSON, sendJSONCached } from '../helpers.js';
import type { AnyRecord } from './types.js';

const log = createLogger({ module: 'TeamAPI' });

// In-memory huddle storage (would be Firestore in production)
interface TeamHuddle {
  id: string;
  userId: string;
  topic: string;
  participants: string[];
  status: 'active' | 'completed' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  recommendations: string[];
  transcript?: string;
}

const activeHuddles = new Map<string, TeamHuddle>();

// Available personas for huddles
const PERSONAS = [
  { id: 'ferni', name: 'Ferni', specialty: 'Life coaching, overall guidance' },
  { id: 'maya', name: 'Maya Santos', specialty: 'Habits, routines, consistency' },
  { id: 'peter', name: 'Peter Chen', specialty: 'Research, analysis, data' },
  { id: 'alex', name: 'Alex Rivera', specialty: 'Communication, relationships' },
  { id: 'jordan', name: 'Jordan Blake', specialty: 'Planning, events, organization' },
  { id: 'nayan', name: 'Nayan Patel', specialty: 'Mindfulness, meditation, calm' },
];

/**
 * Select relevant personas for a topic
 */
function selectParticipants(topic: string): string[] {
  const topicLower = topic.toLowerCase();

  // Always include Ferni as the facilitator
  const participants = ['ferni'];

  // Add relevant specialists based on topic keywords
  if (
    topicLower.includes('habit') ||
    topicLower.includes('routine') ||
    topicLower.includes('consistency')
  ) {
    participants.push('maya');
  }
  if (
    topicLower.includes('research') ||
    topicLower.includes('data') ||
    topicLower.includes('analyze')
  ) {
    participants.push('peter');
  }
  if (
    topicLower.includes('relationship') ||
    topicLower.includes('communicate') ||
    topicLower.includes('talk')
  ) {
    participants.push('alex');
  }
  if (
    topicLower.includes('plan') ||
    topicLower.includes('event') ||
    topicLower.includes('organize')
  ) {
    participants.push('jordan');
  }
  if (
    topicLower.includes('stress') ||
    topicLower.includes('calm') ||
    topicLower.includes('meditat') ||
    topicLower.includes('anxious')
  ) {
    participants.push('nayan');
  }

  // If only Ferni selected, add 2 more based on general utility
  if (participants.length === 1) {
    participants.push('maya', 'peter');
  }

  // Limit to 3 participants for manageable discussions
  return participants.slice(0, 3);
}

/**
 * Generate recommendations based on topic and participants
 */
function generateRecommendations(topic: string, participants: string[]): string[] {
  const recommendations: string[] = [];

  if (participants.includes('ferni')) {
    recommendations.push(`Consider breaking this down into smaller, actionable steps.`);
  }
  if (participants.includes('maya')) {
    recommendations.push(`Build this into your daily routine for consistency.`);
  }
  if (participants.includes('peter')) {
    recommendations.push(`Track your progress with measurable metrics.`);
  }
  if (participants.includes('alex')) {
    recommendations.push(`Communicate your goals with people who can support you.`);
  }
  if (participants.includes('jordan')) {
    recommendations.push(`Create a timeline with specific milestones.`);
  }
  if (participants.includes('nayan')) {
    recommendations.push(`Remember to check in with how you're feeling along the way.`);
  }

  return recommendations;
}

/**
 * GET /api/huddles - Get team huddles
 */
export async function handleGetHuddles(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const { getEngagementStore } = await import('../../services/engagement-store.js');
    const store = await getEngagementStore();
    const profile = (await store.getProfile(userId)) as unknown as AnyRecord;

    // Get user's recent huddles from memory
    const userHuddles = Array.from(activeHuddles.values())
      .filter((h) => h.userId === userId)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, 10)
      .map((h) => ({
        id: h.id,
        topic: h.topic,
        participants: h.participants,
        status: h.status,
        startedAt: h.startedAt.toISOString(),
        completedAt: h.completedAt?.toISOString(),
        recommendationCount: h.recommendations.length,
      }));

    sendJSONCached(
      res,
      {
        totalHuddles:
          ((profile.stats as AnyRecord)?.teamHuddlesAttended as number) || userHuddles.length,
        lastHuddleAt: profile.lastEngagementAt,
        recentHuddles: userHuddles,
        availablePersonas: PERSONAS,
      },
      60
    );
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get huddles');
    sendJSON(res, { error: 'Failed to get huddles', totalHuddles: 0, recentHuddles: [] }, 500);
  }
}

/**
 * POST /api/huddles/start - Start a new team huddle
 */
async function handleStartHuddle(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    // Parse request body
    const body = await new Promise<string>((resolve) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
      });
      req.on('end', () => resolve(data));
    });

    const parsed = JSON.parse(body || '{}');
    const topic = parsed.topic || 'General discussion';

    // Select participants based on topic
    const participants = selectParticipants(topic);

    // Create huddle
    const huddle: TeamHuddle = {
      id: `huddle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      topic,
      participants,
      status: 'active',
      startedAt: new Date(),
      recommendations: [],
    };

    activeHuddles.set(huddle.id, huddle);

    log.info({ userId, huddleId: huddle.id, topic, participants }, 'Team huddle started');

    sendJSON(res, {
      success: true,
      huddle: {
        id: huddle.id,
        topic: huddle.topic,
        participants: participants.map((p) => {
          const persona = PERSONAS.find((pr) => pr.id === p);
          return {
            id: p,
            name: persona?.name || p,
            specialty: persona?.specialty || '',
          };
        }),
        status: huddle.status,
        startedAt: huddle.startedAt.toISOString(),
      },
      message: `Starting a team huddle with ${participants.length} personas to discuss: "${topic}"`,
    });
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to start huddle');
    sendJSON(res, { error: 'Failed to start huddle' }, 500);
  }
}

/**
 * GET /api/huddles/:id - Get specific huddle
 */
async function handleGetHuddle(res: ServerResponse, huddleId: string): Promise<void> {
  const huddle = activeHuddles.get(huddleId);

  if (!huddle) {
    sendJSON(res, { error: 'Huddle not found' }, 404);
    return;
  }

  sendJSON(res, {
    huddle: {
      id: huddle.id,
      topic: huddle.topic,
      participants: huddle.participants.map((p) => {
        const persona = PERSONAS.find((pr) => pr.id === p);
        return {
          id: p,
          name: persona?.name || p,
          specialty: persona?.specialty || '',
        };
      }),
      status: huddle.status,
      startedAt: huddle.startedAt.toISOString(),
      completedAt: huddle.completedAt?.toISOString(),
      recommendations: huddle.recommendations,
    },
  });
}

/**
 * GET /api/huddles/:id/participants - Get huddle participants
 */
async function handleGetParticipants(res: ServerResponse, huddleId: string): Promise<void> {
  const huddle = activeHuddles.get(huddleId);

  if (!huddle) {
    sendJSON(res, { error: 'Huddle not found' }, 404);
    return;
  }

  sendJSON(res, {
    participants: huddle.participants.map((p) => {
      const persona = PERSONAS.find((pr) => pr.id === p);
      return {
        id: p,
        name: persona?.name || p,
        specialty: persona?.specialty || '',
        isActive: true,
      };
    }),
  });
}

/**
 * POST /api/huddles/:id/complete - Complete a huddle
 */
async function handleCompleteHuddle(
  req: IncomingMessage,
  res: ServerResponse,
  huddleId: string
): Promise<void> {
  const huddle = activeHuddles.get(huddleId);

  if (!huddle) {
    sendJSON(res, { error: 'Huddle not found' }, 404);
    return;
  }

  // Generate recommendations based on the topic and participants
  huddle.recommendations = generateRecommendations(huddle.topic, huddle.participants);
  huddle.status = 'completed';
  huddle.completedAt = new Date();

  activeHuddles.set(huddleId, huddle);

  log.info({ huddleId, userId: huddle.userId }, 'Team huddle completed');

  sendJSON(res, {
    success: true,
    huddle: {
      id: huddle.id,
      topic: huddle.topic,
      status: huddle.status,
      completedAt: huddle.completedAt.toISOString(),
      recommendations: huddle.recommendations,
    },
    message: "Huddle completed! Here are your team's recommendations.",
  });
}

/**
 * Route handler for team endpoints
 */
export async function handleTeamRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // GET /api/huddles
  if (pathname === '/api/huddles' && req.method === 'GET') {
    await handleGetHuddles(req, res, parsedUrl);
    return true;
  }

  // POST /api/huddles/start
  if (pathname === '/api/huddles/start' && req.method === 'POST') {
    await handleStartHuddle(req, res, parsedUrl);
    return true;
  }

  // GET /api/huddles/:id
  const huddleMatch = pathname.match(/^\/api\/huddles\/([^/]+)$/);
  if (huddleMatch && req.method === 'GET') {
    await handleGetHuddle(res, huddleMatch[1]);
    return true;
  }

  // GET /api/huddles/:id/participants
  const participantsMatch = pathname.match(/^\/api\/huddles\/([^/]+)\/participants$/);
  if (participantsMatch && req.method === 'GET') {
    await handleGetParticipants(res, participantsMatch[1]);
    return true;
  }

  // POST /api/huddles/:id/complete
  const completeMatch = pathname.match(/^\/api\/huddles\/([^/]+)\/complete$/);
  if (completeMatch && req.method === 'POST') {
    await handleCompleteHuddle(req, res, completeMatch[1]);
    return true;
  }

  return false;
}
