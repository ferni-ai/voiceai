/**
 * Demo Session Management
 *
 * "Better than human" - We remember our first conversation even before
 * you formally introduce yourself. When a demo user creates an account,
 * Ferni warmly acknowledges: "I remember you! You mentioned X..."
 */

import crypto from 'crypto';

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

// Session storage
const demoSessions = new Map<string, DemoSession>();
const DEMO_SESSION_TTL_HOURS = 48;

/**
 * Create a new demo session that can be claimed later.
 * Returns a claim token the user can use to migrate their conversation.
 */
export function createDemoSession(
  roomName: string,
  demoId: string,
  metadata: Record<string, unknown> = {}
): { claimToken: string; roomName: string; expiresAt: number } {
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

  demoSessions.set(roomName, session);
  console.log(`📝 Demo session created: ${roomName} (claim: ${claimToken.substring(0, 8)}...)`);

  return { claimToken, roomName, expiresAt: session.expiresAt };
}

/**
 * Get a demo session by room name.
 */
export function getDemoSession(roomName: string): DemoSession | null {
  const session = demoSessions.get(roomName);
  if (!session) return null;

  // Check if expired
  if (Date.now() > session.expiresAt) {
    demoSessions.delete(roomName);
    return null;
  }

  return session;
}

/**
 * Get a demo session by claim token.
 */
export function getDemoSessionByToken(claimToken: string): DemoSession | null {
  for (const [roomName, session] of demoSessions.entries()) {
    if (session.claimToken === claimToken) {
      // Check if expired
      if (Date.now() > session.expiresAt) {
        demoSessions.delete(roomName);
        return null;
      }
      return session;
    }
  }
  return null;
}

/**
 * Update demo session with conversation data.
 * Called by voice agent via webhook when conversation ends.
 */
export function updateDemoSessionConversation(
  roomName: string,
  conversationData: Partial<DemoSession['conversation']>
): boolean {
  const session = getDemoSession(roomName);
  if (!session) {
    console.log(`⚠️ Demo session not found for update: ${roomName}`);
    return false;
  }

  session.conversation = {
    ...session.conversation,
    ...conversationData,
  };

  console.log(
    `📝 Demo session updated: ${roomName} (${session.conversation.highlights?.length || 0} highlights)`
  );
  return true;
}

/**
 * Claim a demo session for a Firebase user.
 * Returns the session data for migration.
 */
export function claimDemoSession(claimToken: string, firebaseUid: string): ClaimResult {
  const session = getDemoSessionByToken(claimToken);

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

  console.log(`✅ Demo session claimed: ${session.roomName} by ${firebaseUid.substring(0, 8)}...`);

  return { success: true, session };
}

/**
 * Cleanup expired demo sessions
 */
export function cleanupExpiredSessions(): number {
  const now = Date.now();
  let cleaned = 0;
  for (const [roomName, session] of demoSessions.entries()) {
    if (now > session.expiresAt) {
      demoSessions.delete(roomName);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} expired demo sessions`);
  }
  return cleaned;
}

// Cleanup expired sessions every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);
