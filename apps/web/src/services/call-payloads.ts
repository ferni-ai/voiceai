/**
 * Call Payloads
 *
 * Request bodies the web app sends to the UI server when a call ends. They live
 * in one dependency-free module so backend tests can feed the real client output
 * into the real server handlers (POST /usage/conversation, POST /api/conversations).
 */

/** Body for POST /usage/conversation (server: subscription-routes recordConversationUsage). */
export interface ConversationUsageBody {
  userId: string;
  durationMinutes: number;
}

/**
 * Build the usage body for a finished call.
 * Returns null when the call never started (no start time), so nothing is billed.
 * A call that did start counts as at least one minute.
 */
export function buildConversationUsageBody(
  userId: string,
  startTime: number | null,
  now: number = Date.now()
): ConversationUsageBody | null {
  if (!userId || !startTime) return null;
  const durationMinutes = Math.max(1, Math.round((now - startTime) / 60000));
  return { userId, durationMinutes };
}

/** The tracker's session shape that the history payload is built from. */
export interface TrackedSession {
  id: string;
  startTime: string;
  endTime?: string;
  personaId: string;
  personaName: string;
  messages: readonly unknown[];
  insights: readonly string[];
  topicsDiscussed: readonly string[];
}

/** Body for POST /api/conversations (server: routes/conversations handleRecordConversation). */
export interface ConversationHistoryBody {
  session: {
    id: string;
    startTime: string;
    endTime?: string;
    personaId: string;
    personaName: string;
    duration: number;
    messageCount: number;
    insights: string[];
    topicsDiscussed: string[];
  };
}

/** Build the history summary for a finished session. Transcripts stay on the device. */
export function buildConversationHistoryBody(
  session: TrackedSession,
  durationMinutes: number
): ConversationHistoryBody {
  return {
    session: {
      id: session.id,
      startTime: session.startTime,
      endTime: session.endTime,
      personaId: session.personaId,
      personaName: session.personaName,
      duration: durationMinutes,
      messageCount: session.messages.length,
      insights: [...session.insights],
      topicsDiscussed: [...session.topicsDiscussed],
    },
  };
}
