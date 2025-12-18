/**
 * Team Routes
 *
 * GET /api/huddles - Get team huddles
 * POST /api/huddles/start - Start a new team huddle
 * GET /api/huddles/:id - Get specific huddle
 * GET /api/huddles/:id/participants - Get huddle participants
 * POST /api/huddles/:id/complete - Complete a huddle
 *
 * Wired to TeamEngagementService for persistence and rich persona responses.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { requireUserId, sendJSON, sendJSONCached } from '../helpers.js';
import type { AnyRecord } from './types.js';
import { getTeamEngagementService, TEAM_HUDDLE_SCRIPTS } from '../../services/team-engagement.js';

const log = createLogger({ module: 'TeamAPI' });

// ============================================================================
// PERSONA CONFIG - Using canonical IDs matching the rest of the system
// ============================================================================

const PERSONAS = [
  { id: 'ferni', name: 'Ferni', specialty: 'Life coaching, overall guidance', initials: 'F' },
  {
    id: 'maya-santos',
    name: 'Maya Santos',
    specialty: 'Habits, routines, consistency',
    initials: 'MS',
  },
  { id: 'peter-john', name: 'Peter John', specialty: 'Research, patterns, data', initials: 'PJ' },
  { id: 'alex-chen', name: 'Alex Chen', specialty: 'Communication, productivity', initials: 'AC' },
  {
    id: 'jordan-taylor',
    name: 'Jordan Taylor',
    specialty: 'Planning, events, milestones',
    initials: 'JT',
  },
  {
    id: 'nayan-patel',
    name: 'Nayan Patel',
    specialty: 'Mindfulness, meditation, wisdom',
    initials: 'NP',
  },
];

// Persona colors from design system
const PERSONA_COLORS: Record<string, string> = {
  ferni: 'var(--persona-ferni-primary, #4a6741)',
  'maya-santos': 'var(--persona-maya-primary, #a67a6a)',
  'peter-john': 'var(--persona-peter-primary, #3a6b73)',
  'alex-chen': 'var(--persona-alex-primary, #5a6b8a)',
  'jordan-taylor': 'var(--persona-jordan-primary, #c4856a)',
  'nayan-patel': 'var(--persona-nayan-primary, #b8956a)',
};

// ============================================================================
// HUDDLE STORAGE - Using Firestore via TeamEngagementService
// Also keep local cache for active session
// ============================================================================

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
  // UI-compatible fields
  title: string;
  intro: string;
  outro: string;
  participantDetails: Array<{
    personaId: string;
    name: string;
    initials: string;
    comment: string;
    avatarColor: string;
  }>;
}

// Local cache for active huddles (also persisted via TeamEngagementService)
const activeHuddles = new Map<string, TeamHuddle>();

// ============================================================================
// TOPIC-BASED PARTICIPANT SELECTION
// ============================================================================

function selectParticipants(topic: string): string[] {
  const topicLower = topic.toLowerCase();

  // Always include Ferni as the facilitator
  const participants = ['ferni'];

  // Add relevant specialists based on topic keywords
  if (
    topicLower.includes('habit') ||
    topicLower.includes('routine') ||
    topicLower.includes('consistency') ||
    topicLower.includes('tiny') ||
    topicLower.includes('compound')
  ) {
    participants.push('maya-santos');
  }
  if (
    topicLower.includes('research') ||
    topicLower.includes('data') ||
    topicLower.includes('analyze') ||
    topicLower.includes('pattern') ||
    topicLower.includes('invest')
  ) {
    participants.push('peter-john');
  }
  if (
    topicLower.includes('relationship') ||
    topicLower.includes('communicate') ||
    topicLower.includes('talk') ||
    topicLower.includes('email') ||
    topicLower.includes('productivity')
  ) {
    participants.push('alex-chen');
  }
  if (
    topicLower.includes('plan') ||
    topicLower.includes('event') ||
    topicLower.includes('organize') ||
    topicLower.includes('milestone') ||
    topicLower.includes('goal')
  ) {
    participants.push('jordan-taylor');
  }
  if (
    topicLower.includes('stress') ||
    topicLower.includes('calm') ||
    topicLower.includes('meditat') ||
    topicLower.includes('anxious') ||
    topicLower.includes('mindful') ||
    topicLower.includes('peace')
  ) {
    participants.push('nayan-patel');
  }

  // If only Ferni selected, add 2 more based on general utility
  if (participants.length === 1) {
    participants.push('maya-santos', 'peter-john');
  }

  // Limit to 3-4 participants for manageable discussions
  return participants.slice(0, 4);
}

// ============================================================================
// PERSONA-SPECIFIC COMMENTS FROM TEAM ENGAGEMENT SERVICE
// ============================================================================

function getPersonaComment(personaId: string, topic: string): string {
  const scripts = TEAM_HUDDLE_SCRIPTS.personaComments;
  const personaScripts = scripts[personaId as keyof typeof scripts] as
    | Record<string, string[]>
    | undefined;

  if (!personaScripts) {
    return "I'm glad to be part of this discussion.";
  }

  // Try to find topic-relevant category
  const topicLower = topic.toLowerCase();
  let commentPool: string[] = [];

  // Use type-safe property access with Record
  if (personaId === 'ferni') {
    commentPool = personaScripts['progress'] || [];
  } else if (personaId === 'maya-santos') {
    if (topicLower.includes('habit') || topicLower.includes('routine')) {
      commentPool = personaScripts['habits'] || [];
    } else {
      commentPool = personaScripts['encouragement'] || personaScripts['habits'] || [];
    }
  } else if (personaId === 'alex-chen') {
    if (topicLower.includes('product') || topicLower.includes('work')) {
      commentPool = personaScripts['productivity'] || [];
    } else {
      commentPool = personaScripts['suggestion'] || personaScripts['productivity'] || [];
    }
  } else if (personaId === 'jordan-taylor') {
    if (topicLower.includes('milestone') || topicLower.includes('goal')) {
      commentPool = personaScripts['milestones'] || [];
    } else {
      commentPool = personaScripts['future'] || personaScripts['milestones'] || [];
    }
  } else if (personaId === 'nayan-patel') {
    if (topicLower.includes('stress') || topicLower.includes('anxious')) {
      commentPool = personaScripts['challenge'] || [];
    } else {
      commentPool = personaScripts['wisdom'] || personaScripts['challenge'] || [];
    }
  } else if (personaId === 'peter-john') {
    if (topicLower.includes('pattern') || topicLower.includes('data')) {
      commentPool = personaScripts['patterns'] || [];
    } else {
      commentPool = personaScripts['insight'] || personaScripts['patterns'] || [];
    }
  }

  if (commentPool.length === 0) {
    // Fallback to any available comments
    const allComments = Object.values(personaScripts)
      .flat()
      .filter((c): c is string => typeof c === 'string');
    commentPool = allComments;
  }

  if (commentPool.length === 0) {
    return "I'm glad to be part of this discussion.";
  }

  return commentPool[Math.floor(Math.random() * commentPool.length)];
}

// ============================================================================
// RECOMMENDATION GENERATION
// ============================================================================

function generateRecommendations(topic: string, participants: string[]): string[] {
  const recommendations: string[] = [];
  const topicLower = topic.toLowerCase();

  // Topic-aware recommendations
  if (participants.includes('ferni')) {
    if (topicLower.includes('stuck') || topicLower.includes('overwhelm')) {
      recommendations.push(
        "Start with the smallest possible step. What's one thing you could do in the next 5 minutes?"
      );
    } else {
      recommendations.push('Consider breaking this down into smaller, actionable steps.');
    }
  }

  if (participants.includes('maya-santos')) {
    if (topicLower.includes('habit')) {
      recommendations.push('Attach this to an existing habit—habit stacking makes it stick.');
    } else {
      recommendations.push('Build this into your daily routine for consistency. Start tiny.');
    }
  }

  if (participants.includes('peter-john')) {
    if (topicLower.includes('pattern')) {
      recommendations.push('Track this for a week. The patterns will reveal themselves.');
    } else {
      recommendations.push("Track your progress with measurable metrics. Data doesn't lie.");
    }
  }

  if (participants.includes('alex-chen')) {
    if (topicLower.includes('communicate') || topicLower.includes('relationship')) {
      recommendations.push(
        'Have the conversation sooner rather than later. Clarity prevents misunderstanding.'
      );
    } else {
      recommendations.push('Communicate your goals with people who can support you.');
    }
  }

  if (participants.includes('jordan-taylor')) {
    if (topicLower.includes('goal') || topicLower.includes('milestone')) {
      recommendations.push('Set a specific date for your milestone. Put it on the calendar now.');
    } else {
      recommendations.push('Create a timeline with specific milestones to celebrate.');
    }
  }

  if (participants.includes('nayan-patel')) {
    if (topicLower.includes('stress') || topicLower.includes('anxious')) {
      recommendations.push(
        'Before acting, pause. Three breaths. The answer often comes in stillness.'
      );
    } else {
      recommendations.push("Remember to check in with how you're feeling along the way.");
    }
  }

  return recommendations;
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

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

    // Get user's recent huddles from local cache
    const userHuddles = Array.from(activeHuddles.values())
      .filter((h) => h.userId === userId)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, 10)
      .map((h) => ({
        id: h.id,
        title: h.title,
        topic: h.topic,
        intro: h.intro,
        outro: h.outro,
        participants: h.participantDetails,
        status: h.status,
        startedAt: h.startedAt.toISOString(),
        completedAt: h.completedAt?.toISOString(),
        recommendations: h.recommendations,
        type: 'weekly' as const,
        scheduledAt: h.startedAt.toISOString(),
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
    const type = parsed.type || 'weekly';

    // Select participants based on topic
    const participantIds = selectParticipants(topic);

    // Build participant details with persona-specific comments
    const participantDetails = participantIds.map((personaId) => {
      const persona = PERSONAS.find((p) => p.id === personaId);
      return {
        personaId,
        name: persona?.name || personaId,
        initials: persona?.initials || personaId.charAt(0).toUpperCase(),
        comment: getPersonaComment(personaId, topic),
        avatarColor: PERSONA_COLORS[personaId] || 'var(--persona-ferni-primary)',
      };
    });

    // Get intro/outro from TeamEngagementService scripts
    const scripts = TEAM_HUDDLE_SCRIPTS.weekly;
    const intro = scripts.intro[Math.floor(Math.random() * scripts.intro.length)];
    const outro = scripts.outro[Math.floor(Math.random() * scripts.outro.length)];

    // Create huddle with UI-compatible format
    const huddle: TeamHuddle = {
      id: `huddle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      topic,
      participants: participantIds,
      status: 'active',
      startedAt: new Date(),
      recommendations: [],
      title: type === 'milestone' ? 'Milestone Celebration' : 'Team Check-in',
      intro,
      outro,
      participantDetails,
    };

    // Store in local cache
    activeHuddles.set(huddle.id, huddle);

    // Also record in TeamEngagementService for persistence
    try {
      const teamService = getTeamEngagementService();
      await teamService.generateTeamHuddle(
        userId,
        null,
        type as 'weekly' | 'milestone' | 'special'
      );
    } catch (persistErr) {
      log.warn({ error: persistErr }, 'Failed to persist huddle to TeamEngagementService');
    }

    log.info(
      { userId, huddleId: huddle.id, topic, participants: participantIds },
      'Team huddle started'
    );

    // Return in format compatible with frontend TeamHuddleData
    sendJSON(res, {
      success: true,
      huddle: {
        id: huddle.id,
        title: huddle.title,
        topic: huddle.topic,
        intro: huddle.intro,
        outro: huddle.outro,
        participants: huddle.participantDetails,
        status: huddle.status,
        startedAt: huddle.startedAt.toISOString(),
        type,
        scheduledAt: huddle.startedAt.toISOString(),
      },
      message: `Starting a team huddle with ${participantIds.length} team members to discuss: "${topic}"`,
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
      title: huddle.title,
      topic: huddle.topic,
      intro: huddle.intro,
      outro: huddle.outro,
      participants: huddle.participantDetails,
      status: huddle.status,
      startedAt: huddle.startedAt.toISOString(),
      completedAt: huddle.completedAt?.toISOString(),
      recommendations: huddle.recommendations,
      type: 'weekly',
      scheduledAt: huddle.startedAt.toISOString(),
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
    participants: huddle.participantDetails.map((p) => ({
      ...p,
      isActive: true,
    })),
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
      title: huddle.title,
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
