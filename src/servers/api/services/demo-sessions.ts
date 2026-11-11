/**
 * Demo Session Management
 *
 * "Better than human" - We remember our first conversation even before
 * you formally introduce yourself. When a demo user creates an account,
 * Ferni warmly acknowledges: "I remember you! You mentioned X..."
 *
 * STORAGE: Uses Firestore for persistence (Cloud Run compatible).
 * This ensures demo sessions persist across container restarts and scaling.
 */

import crypto from 'crypto';
import { createPersistenceStore } from '../../../services/persistence/index.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { registerInterval, clearNamedInterval } from '../../../utils/interval-manager.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = createLogger({ module: 'DemoSessions' });

/**
 * Demo session data
 */
export interface DemoSession {
  roomName: string;
  demoId: string;
  claimToken: string;
  createdAt: number;
  expiresAt: number;
  conversation: {
    messages: unknown[];
    highlights: string[];
    topics: string[];
    userMood: string | null;
    ferniNotes: string;
  };
  claimed: boolean;
  claimedBy: string | null;
  claimedAt: number | null;
}

/**
 * Demo session claim result
 */
export interface ClaimResult {
  success: boolean;
  session?: DemoSession;
  alreadyClaimed?: boolean;
  error?: string;
}

// Configuration
const DEMO_SESSION_TTL_HOURS = 48;

// Firestore-backed persistence store for demo sessions
// Uses root collection since sessions are identified by roomName, not userId
const sessionStore = createPersistenceStore<DemoSession>({
  collection: 'demo_sessions',
  useRootCollection: true,
  syncIntervalMs: 2000, // Quick sync for session updates
});

// In-memory cache for fast lookups
const demoSessions = new Map<string, DemoSession>();
const claimTokenIndex = new Map<string, string>(); // claimToken -> roomName

// Cleanup interval reference
let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Create a new demo session that can be claimed later.
 * Returns a claim token the user can use to migrate their conversation.
 *
 * PRIVACY: nothing about the visitor's device or network (no IP, no User-Agent) is stored; nothing
 * read it, and the visitor was told nothing is kept.
 */
export async function createDemoSession(
  roomName: string,
  demoId: string
): Promise<{ claimToken: string; roomName: string; expiresAt: number }> {
  const claimToken = crypto.randomBytes(16).toString('hex');

  const session: DemoSession = {
    roomName,
    demoId,
    claimToken,
    createdAt: Date.now(),
    expiresAt: Date.now() + DEMO_SESSION_TTL_HOURS * 60 * 60 * 1000,
    conversation: {
      messages: [],
      highlights: [],
      topics: [],
      userMood: null,
      ferniNotes: '',
    },
    claimed: false,
    claimedBy: null,
    claimedAt: null,
  };

  // Cache in memory
  demoSessions.set(roomName, session);
  claimTokenIndex.set(claimToken, roomName);

  // Persist to Firestore
  try {
    await sessionStore.setImmediate(roomName, session);
    log.info({ roomName, claimTokenPrefix: claimToken.substring(0, 8) }, 'Demo session created');
  } catch (err) {
    log.error({ error: (err as Error).message, roomName }, 'Failed to persist demo session');
  }

  return { claimToken, roomName, expiresAt: session.expiresAt };
}

/**
 * Get a demo session by room name. `fresh` reads Firestore even when this
 * instance has it cached: another instance may have written it since.
 */
export async function getDemoSession(
  roomName: string,
  options?: { fresh?: boolean }
): Promise<DemoSession | null> {
  // Check in-memory cache first
  let session = options?.fresh ? undefined : demoSessions.get(roomName);

  // If not in cache, try to load from Firestore
  if (!session) {
    try {
      session =
        (await (options?.fresh
          ? sessionStore.load(roomName, { fresh: true })
          : sessionStore.get(roomName))) ?? undefined;
      if (session) {
        demoSessions.set(roomName, session);
        claimTokenIndex.set(session.claimToken, roomName);
      }
    } catch (err) {
      log.warn({ error: (err as Error).message, roomName }, 'Failed to load demo session');
    }
  }

  if (!session) {
    if (options?.fresh) forget(roomName); // gone from Firestore: stop serving the cached copy
    return null;
  }

  // Check if expired
  if (Date.now() > session.expiresAt) {
    await deleteDemoSession(roomName);
    return null;
  }

  return session;
}

/** Drop a demo from this instance's cache only. */
function forget(roomName: string): void {
  const session = demoSessions.get(roomName);
  if (session) claimTokenIndex.delete(session.claimToken);
  demoSessions.delete(roomName);
}

/**
 * Delete a demo session
 */
async function deleteDemoSession(roomName: string): Promise<void> {
  forget(roomName);

  try {
    await sessionStore.delete(roomName);
    log.debug({ roomName }, 'Demo session deleted');
  } catch (err) {
    log.warn(
      { error: (err as Error).message, roomName },
      'Failed to delete demo session from Firestore'
    );
  }
}

/** What a conversation write did; the route answers 200, 404, 409 or 503. */
export type DemoUpdateResult = 'updated' | 'missing' | 'claimed' | 'failed';

/** The conversation as JSON, to tell whether Firestore still holds what a write merged onto. */
const sameConversation = (a: DemoSession, b: DemoSession): boolean =>
  JSON.stringify(a.conversation) === JSON.stringify(b.conversation);

/**
 * Update demo session with conversation data.
 *
 * Merges onto the session as Firestore has it, not as this instance cached it,
 * and writes only `conversation`: a full-document write from a stale cache used
 * to put `claimed: false` back over a claim made on another instance (#1759).
 * The write is refused if the demo was claimed, deleted or rewritten since it
 * was read.
 */
export async function updateDemoSessionConversation(
  roomName: string,
  conversationData: Partial<DemoSession['conversation']>
): Promise<DemoUpdateResult> {
  const session = await getDemoSession(roomName, { fresh: true });
  if (!session) {
    log.warn({ roomName }, 'Demo session not found for update');
    return 'missing';
  }
  if (session.claimed) return 'claimed';

  const conversation = { ...session.conversation, ...conversationData };
  let result: Awaited<ReturnType<typeof sessionStore.updateIfUnchanged>>;
  try {
    result = await sessionStore.updateIfUnchanged(
      roomName,
      (current) => !current.claimed && sameConversation(current, session),
      { conversation }
    );
  } catch (err) {
    log.error({ error: (err as Error).message, roomName }, 'Failed to persist demo session update');
    return 'failed';
  }

  if (result === 'missing') {
    forget(roomName);
    return 'missing';
  }
  if (result === 'changed') {
    // Claimed or rewritten elsewhere since the read; the next read is fresh anyway
    const now = await getDemoSession(roomName, { fresh: true });
    log.warn({ roomName, claimed: now?.claimed ?? null }, 'Demo session changed during update');
    return now?.claimed ? 'claimed' : 'failed';
  }

  demoSessions.set(roomName, { ...session, conversation });
  log.info(
    { roomName, highlightCount: conversation.highlights?.length || 0 },
    'Demo session updated'
  );
  return 'updated';
}

/**
 * Claim a demo session for a Firebase user.
 * Returns the session data for migration.
 *
 * Reads the session from Firestore and writes only the claim fields, on the
 * condition that nobody claimed it since: a claim from a stale cache used to
 * put an empty conversation back over one written on another instance, hand
 * that empty conversation to the user, and let two instances both claim (#1759).
 */
export async function claimDemoSession(
  claimToken: string,
  firebaseUid: string
): Promise<ClaimResult> {
  // Only the token's index knows the room. A miss happens after a restart or on
  // an instance that never saw this demo, and is answered as not found.
  const roomName = claimTokenIndex.get(claimToken);
  const session = roomName ? await getDemoSession(roomName, { fresh: true }) : null;

  if (!session) {
    return { success: false, error: 'Session not found or expired' };
  }

  if (session.claimed) return alreadyClaimedResult(session, firebaseUid);

  const claim = { claimed: true, claimedBy: firebaseUid, claimedAt: Date.now() };
  let result: Awaited<ReturnType<typeof sessionStore.updateIfUnchanged>>;
  try {
    result = await sessionStore.updateIfUnchanged(
      session.roomName,
      (current) => !current.claimed,
      claim
    );
  } catch (err) {
    log.error(
      { error: (err as Error).message, roomName: session.roomName },
      'Failed to persist claimed session'
    );
    return { success: false, error: 'Could not claim the demo session, try again' };
  }

  if (result === 'missing') {
    forget(session.roomName);
    return { success: false, error: 'Session not found or expired' };
  }
  if (result === 'changed') {
    const now = await getDemoSession(session.roomName, { fresh: true });
    if (now?.claimed) return alreadyClaimedResult(now, firebaseUid);
    return { success: false, error: 'Could not claim the demo session, try again' };
  }

  const claimed: DemoSession = { ...session, ...claim };
  demoSessions.set(session.roomName, claimed);
  log.info(
    { roomName: session.roomName, firebaseUidPrefix: firebaseUid.substring(0, 8) },
    'Demo session claimed'
  );
  return { success: true, session: claimed };
}

/** A claimed demo: the same user gets it back, anyone else is refused. */
function alreadyClaimedResult(session: DemoSession, firebaseUid: string): ClaimResult {
  if (session.claimedBy === firebaseUid) {
    return { success: true, session, alreadyClaimed: true };
  }
  return { success: false, error: 'Session already claimed by another user' };
}

/**
 * Cleanup expired demo sessions
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const now = Date.now();
  let cleaned = 0;

  // Clean from in-memory cache
  for (const [roomName, session] of demoSessions.entries()) {
    if (now > session.expiresAt) {
      await deleteDemoSession(roomName);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    log.info({ count: cleaned }, 'Cleaned expired demo sessions');
  }

  return cleaned;
}

/**
 * Start periodic cleanup of expired sessions
 */
export function startCleanupInterval(): void {
  if (cleanupInterval) return;

  // Cleanup every hour
  registerInterval(
    'demo-sessions-cleanup',
    () => {
      cleanupExpiredSessions().catch((err) => {
        log.error({ error: (err as Error).message }, 'Failed to cleanup expired sessions');
      });
    },
    60 * 60 * 1000
  );
  cleanupInterval = 1 as unknown as ReturnType<typeof setInterval>; // Marker

  log.info('Demo session cleanup interval started');
}

/**
 * Stop periodic cleanup
 */
export function stopCleanupInterval(): void {
  if (cleanupInterval) {
    clearNamedInterval('demo-sessions-cleanup');
    cleanupInterval = null;
    log.info('Demo session cleanup interval stopped');
  }
}

/**
 * Shutdown demo sessions service
 */
export async function shutdown(): Promise<void> {
  stopCleanupInterval();
  await sessionStore.shutdown();
  demoSessions.clear();
  claimTokenIndex.clear();
  log.info('Demo sessions service shutdown complete');
}

// Start cleanup interval on module load
startCleanupInterval();
