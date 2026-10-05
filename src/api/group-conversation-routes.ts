/**
 * Group Conversation API Routes
 *
 * REST API endpoints for managing group conversations:
 * - Team Roundtables (multiple agents)
 * - Conference Calls (external participants)
 *
 * @module api/group-conversation-routes
 */

import { Router, json, urlencoded, type Request, type Response } from 'express';
import { isCoach } from '../personas/persona-ids.js';
import { getLogger } from '../utils/safe-logger.js';
import { cleanForFirestore } from '../utils/firestore-utils.js';
import { getFirestoreDb } from '../services/superhuman/firestore-utils.js';
import { paramString } from './param-string.js';
import type {
  RoundtableConfig,
  GroupConversationSummary,
} from '../agents/group-conversation/types.js';
import { generateAnswerTwiml } from '../agents/group-conversation/conference-call-manager.js';
import { requireTwilioSignature } from './twilio-callback-signature.js';

const log = getLogger();
const router = Router();

// Bodies are parsed only under the paths this router answers: a /api/group
// request it doesn't answer goes on to later raw handlers, which read the
// stream themselves and must find it unread.
const OWN_BODY_PATHS = ['/roundtable', '/call'];
router.use(OWN_BODY_PATHS, json({ limit: '100kb' }), urlencoded({ extended: false }));

// A body may name the caller (or nobody); naming anyone else is refused, not swapped.
router.use(OWN_BODY_PATHS, (req: Request, res: Response, next: () => void) => {
  const claimed: unknown = (req.body as { userId?: unknown } | undefined)?.userId;
  const caller = getUserId(req);
  if (caller && claimed !== undefined && claimed !== caller) {
    res.status(403).json({ success: false, error: 'Not authorized' });
    return;
  }
  next();
});

// ============================================================================
// TYPES
// ============================================================================

interface GroupSessionRecord {
  sessionId: string;
  userId: string;
  mode: 'team_roundtable' | 'conference_call' | 'hybrid';
  topic?: string;
  status: 'active' | 'ended';
  participants: Array<{
    id: string;
    name: string;
    type: 'human' | 'agent' | 'external';
    role: string;
    joinedAt: string;
    leftAt?: string;
  }>;
  startedAt: string;
  endedAt?: string;
  summary?: GroupConversationSummary;
  metrics?: {
    totalUtterances: number;
    durationMs: number;
    externalCallTimeMs: number;
  };
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * The verified caller. bindVerifiedIdentity (servers/api/request-identity.ts)
 * sets x-firebase-uid from a verified token and rewrites ?userId= to it (an
 * admin keeps the user they name there). A body userId is only a claim.
 */
function getUserId(req: Request): string | null {
  const uid = req.headers['x-firebase-uid'];
  if (typeof uid === 'string' && uid) return uid;
  const fromQuery = req.query.userId;
  return typeof fromQuery === 'string' && fromQuery ? fromQuery : null;
}

// ============================================================================
// TEAM ROUNDTABLE ROUTES
// ============================================================================

/**
 * Start a team roundtable session
 * POST /api/group/roundtable/start
 */
router.post('/roundtable/start', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const {
      personas,
      topic,
      collaborationMode = 'discussion',
    } = req.body as Partial<RoundtableConfig>;

    if (!personas || !Array.isArray(personas) || personas.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one persona required' });
    }

    // Validate personas
    const validPersonas = [
      'ferni',
      'peter-john',
      'maya-habits',
      'alex-chen',
      'jordan-taylor',
      'nayan-sharma',
    ];
    const invalidPersonas = personas.filter((p) => !validPersonas.includes(p));
    if (invalidPersonas.length > 0) {
      return res
        .status(400)
        .json({ success: false, error: `Invalid personas: ${invalidPersonas.join(', ')}` });
    }

    // Generate session ID
    const sessionId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Create session record
    const session: GroupSessionRecord = {
      sessionId,
      userId,
      mode: 'team_roundtable',
      topic,
      status: 'active',
      participants: personas.map((personaId) => ({
        id: `agent_${personaId}`,
        name: getPersonaName(personaId),
        type: 'agent' as const,
        role: isCoach(personaId) ? 'moderator' : 'expert',
        joinedAt: new Date().toISOString(),
      })),
      startedAt: new Date().toISOString(),
    };

    const db = getFirestoreDb();
    if (!db) return res.status(503).json({ success: false, error: STORAGE_UNAVAILABLE });
    await sessionsOf(db, userId).doc(sessionId).set(cleanForFirestore(session));

    log.info({ userId, sessionId, personas, topic }, '🎭 Team roundtable started');

    return res.json({
      success: true,
      sessionId,
      config: { personas, topic, collaborationMode, moderator: 'ferni' },
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to start team roundtable');
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * End a team roundtable session
 * POST /api/group/roundtable/end
 */
router.post('/roundtable/end', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'Session ID required' });
    }

    const db = getFirestoreDb();
    if (!db) return res.status(503).json({ success: false, error: STORAGE_UNAVAILABLE });
    const doc = sessionsOf(db, userId).doc(String(sessionId));
    if (!(await doc.get()).exists) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    await doc.update(cleanForFirestore({ status: 'ended', endedAt: new Date().toISOString() }));

    log.info({ userId, sessionId }, '🎭 Team roundtable ended');

    return res.json({ success: true, sessionId });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to end team roundtable');
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ============================================================================
// CONFERENCE CALL ROUTES
// ============================================================================

/**
 * Conference-call dial-out is not available from the API server.
 *
 * These routes used to answer `success: true, status: 'dialing'` (and
 * "removed") without placing or ending any call: dialing lives in the voice
 * agent's ConferenceCallManager (src/agents/group-conversation), which needs
 * the live LiveKit room and Twilio credentials this process doesn't have. The
 * router is also mounted without a body parser, so every request with a body
 * ended in a 500. Until a real bridge exists they say so: 501, never a fake
 * success.
 */
const CALL_CONTROL_UNAVAILABLE = "Adding people to a call isn't available yet";

function callControlUnavailable(req: Request, res: Response): Response {
  if (!getUserId(req)) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  return res.status(501).json({ success: false, error: CALL_CONTROL_UNAVAILABLE });
}

/** POST /api/group/call/add */
router.post('/call/add', callControlUnavailable);

/** POST /api/group/call/remove */
router.post('/call/remove', callControlUnavailable);

/**
 * TwiML webhook for when external participant answers. Twilio requests the
 * call's `url` with POST unless told otherwise (initiateCall sets no method),
 * so both are served. Admitted on X-Twilio-Signature, not a user.
 * GET|POST /api/group/call/answer
 */
function answerCall(req: Request, res: Response): void {
  const { roomName, name, intro } = req.query;

  const sipDomain = process.env.SIP_DOMAIN ?? 'sip.livekit.cloud';

  const twiml = generateAnswerTwiml({
    roomName: String(roomName ?? 'default'),
    sipDomain,
    name: String(name ?? 'Guest'),
    introduction: intro ? String(intro) : undefined,
  });

  res.type('text/xml');
  res.send(twiml);
}
router.get('/call/answer', requireTwilioSignature, answerCall);
router.post('/call/answer', requireTwilioSignature, answerCall);

/**
 * Twilio status callback webhook (admitted on X-Twilio-Signature, not a user)
 * POST /api/group/call/status
 */
router.post('/call/status', requireTwilioSignature, (req: Request, res: Response) => {
  const { CallSid, CallStatus } = req.body;

  log.info({ callSid: CallSid, status: CallStatus }, '📞 Call status update');

  // In a real implementation, this would update the call status
  // and notify the ConferenceCallManager

  res.sendStatus(200);
});

// ============================================================================
// SESSION MANAGEMENT ROUTES
// ============================================================================

/**
 * Get group session history
 * GET /api/group/sessions
 */
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { limit = 20 } = req.query;

    const db = getFirestoreDb();
    if (!db) {
      return res.json({ success: true, sessions: [] });
    }

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('group_sessions')
      .orderBy('startedAt', 'desc')
      .limit(Number(limit))
      .get();

    const sessions = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) =>
      doc.data()
    );

    return res.json({ success: true, sessions });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get group sessions');
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * Get a specific group session
 * GET /api/group/sessions/:sessionId
 */
router.get('/sessions/:sessionId', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const sessionId = paramString(req.params.sessionId);
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'Invalid session ID' });
    }

    const db = getFirestoreDb();
    if (!db) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('group_sessions')
      .doc(sessionId)
      .get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    return res.json({ success: true, session: doc.data() });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get group session');
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * Get session transcript
 * GET /api/group/sessions/:sessionId/transcript
 */
router.get('/sessions/:sessionId/transcript', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const sessionId = paramString(req.params.sessionId);
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'Invalid session ID' });
    }
    const { format = 'json' } = req.query;

    const db = getFirestoreDb();
    if (!db) {
      return res.status(404).json({ success: false, error: 'Transcript not found' });
    }

    const transcriptDoc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('group_sessions')
      .doc(sessionId)
      .collection('transcript')
      .doc('full')
      .get();

    if (!transcriptDoc.exists) {
      return res.status(404).json({ success: false, error: 'Transcript not found' });
    }

    const transcript = transcriptDoc.data();

    if (format === 'text') {
      const textTranscript = (transcript?.utterances ?? [])
        .map((u: any) => `[${u.speakerName}]: ${u.text}`)
        .join('\n');

      res.type('text/plain');
      return res.send(textTranscript);
    }

    return res.json({ success: true, transcript });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get transcript');
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const STORAGE_UNAVAILABLE = "Couldn't save that right now. Try again?";

/** The caller's own roundtable records. */
function sessionsOf(
  db: FirebaseFirestore.Firestore,
  userId: string
): FirebaseFirestore.CollectionReference {
  return db.collection('bogle_users').doc(userId).collection('group_sessions');
}

function getPersonaName(personaId: string): string {
  const names: Record<string, string> = {
    ferni: 'Ferni',
    'peter-john': 'Peter',
    'maya-habits': 'Maya',
    'alex-chen': 'Alex',
    'jordan-taylor': 'Jordan',
    'nayan-sharma': 'Nayan',
  };
  return names[personaId] ?? personaId;
}

// ============================================================================
// EXPORT
// ============================================================================

export default router;

export { router as groupConversationRoutes };
