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
  metadata: Record<string, unknown>;
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
 */
export async function createDemoSession(
  roomName: string,
  demoId: string,
  metadata: Record<string, unknown> = {}
): Promise<{ claimToken: string; roomName: string; expiresAt: number }> {
  const claimToken = crypto.randomBytes(16).toString('hex');

  const session: DemoSession = {
    roomName,
    demoId,
    claimToken,
    createdAt: Date.now(),
    expiresAt: Date.now() + DEMO_SESSION_TTL_HOURS * 60 * 60 * 1000,
    metadata,
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
 * Get a demo session by room name.
 */
export async function getDemoSession(roomName: string): Promise<DemoSession | null> {
  // Check in-memory cache first
  let session = demoSessions.get(roomName);

  // If not in cache, try to load from Firestore
  if (!session) {
    try {
      session = (await sessionStore.get(roomName)) ?? undefined;
      if (session) {
        demoSessions.set(roomName, session);
        claimTokenIndex.set(session.claimToken, roomName);
      }
    } catch (err) {
      log.warn({ error: (err as Error).message, roomName }, 'Failed to load demo session');
    }
  }

  if (!session) return null;

  // Check if expired
  if (Date.now() > session.expiresAt) {
    await deleteDemoSession(roomName);
    return null;
  }

  return session;
}

/**
 * Get a demo session by claim token.
 */
export async function getDemoSessionByToken(claimToken: string): Promise<DemoSession | null> {
  // Check index first
  const roomName = claimTokenIndex.get(claimToken);
  if (roomName) {
    return getDemoSession(roomName);
  }

  // If not in index, we need to search (expensive, but rare)
  // This happens after server restart when cache is empty
  // The session will be found when getDemoSession loads from Firestore
  return null;
}

/**
 * Delete a demo session
 */
async function deleteDemoSession(roomName: string): Promise<void> {
  const session = demoSessions.get(roomName);
  if (session) {
    claimTokenIndex.delete(session.claimToken);
  }
  demoSessions.delete(roomName);

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

/**
 * Update demo session with conversation data.
 * Called by voice agent via webhook when conversation ends.
 */
export async function updateDemoSessionConversation(
  roomName: string,
  conversationData: Partial<DemoSession['conversation']>
): Promise<boolean> {
  const session = await getDemoSession(roomName);
  if (!session) {
    log.warn({ roomName }, 'Demo session not found for update');
    return false;
  }

  session.conversation = {
    ...session.conversation,
    ...conversationData,
  };

  // Update cache
  demoSessions.set(roomName, session);

  // Persist to Firestore
  try {
    await sessionStore.setImmediate(roomName, session);
    log.info(
      { roomName, highlightCount: session.conversation.highlights?.length || 0 },
      'Demo session updated'
    );
  } catch (err) {
    log.error({ error: (err as Error).message, roomName }, 'Failed to persist demo session update');
  }

  return true;
}

/**
 * Claim a demo session for a Firebase user.
 * Returns the session data for migration.
 */
export async function claimDemoSession(
  claimToken: string,
  firebaseUid: string
): Promise<ClaimResult> {
  // First try to get from index
  let roomName = claimTokenIndex.get(claimToken);
  let session: DemoSession | null = null;

  if (roomName) {
    session = await getDemoSession(roomName);
  } else {
    // Search Firestore for session with this claim token
    // This is a fallback for when the server has restarted and cache is empty
    session = await getDemoSessionByToken(claimToken);
  }

  if (!session) {
    return { success: false, error: 'Session not found or expired' };
  }

  if (session.claimed) {
    // If already claimed by same user, return success
    if (session.claimedBy === firebaseUid) {
      return { success: true, session, alreadyClaimed: true };
    }
    return { success: false, error: 'Session already claimed by another user' };
  }

  // Mark as claimed
  session.claimed = true;
  session.claimedBy = firebaseUid;
  session.claimedAt = Date.now();

  // Update cache
  demoSessions.set(session.roomName, session);

  // Persist to Firestore
  try {
    await sessionStore.setImmediate(session.roomName, session);
    log.info(
      { roomName: session.roomName, firebaseUidPrefix: firebaseUid.substring(0, 8) },
      'Demo session claimed'
    );
  } catch (err) {
    log.error(
      { error: (err as Error).message, roomName: session.roomName },
      'Failed to persist claimed session'
    );
  }

  return { success: true, session };
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
  cleanupInterval = setInterval(
    () => {
      cleanupExpiredSessions().catch((err) => {
        log.error({ error: (err as Error).message }, 'Failed to cleanup expired sessions');
      });
    },
    60 * 60 * 1000
  );

  log.info('Demo session cleanup interval started');
}

/**
 * Stop periodic cleanup
 */
export function stopCleanupInterval(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
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
