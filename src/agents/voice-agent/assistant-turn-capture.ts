/**
 * Assistant Turn Capture
 *
 * Records what the agent actually said. The LiveKit AgentSession emits
 * `conversation_item_added` with an assistant ChatMessage once a reply has
 * played out; its text is what was forwarded to TTS (cut at the interruption
 * point when the user barged in). That one event covers every speech path —
 * LLM replies, `session.say()` greetings, cached responses, tool follow-ups —
 * so it is the single place assistant turns are recorded, in both
 * multi-agent and single-agent mode.
 *
 * Each captured reply goes to:
 * - `services.addTurn('assistant', …)` → session history (session-end
 *   summary + learning engine) and the Firestore `turns` collection
 * - the conversation thread (`conversation_threads/{tid}/messages`)
 * - a per-session ring of recent turns that deep extraction can read as
 *   context (`getRecentSessionTurns`)
 *
 * @module voice-agent/assistant-turn-capture
 */

import { createLogger } from '../../utils/safe-logger.js';
import { stripSSML } from '../../utils/text-utils.js';
import type { SessionServices } from '../../services/index.js';
import type { PersonaId } from '../../personas/types.js';
import { markSessionActivity, nextTurnNumber } from '../../services/memory/turn-sequencer.js';
import {
  recordAssistantTurnCaptured,
  recordAssistantTurnDeduped,
} from '../../services/memory/memory-capture-metrics.js';
import { rememberSessionTurn } from '../../memory/capture/session-turn-ring.js';

const log = createLogger({ module: 'assistant-turn-capture' });

export const CONVERSATION_ITEM_ADDED_EVENT = 'conversation_item_added';

/** Minimal event-emitter view of an AgentSession. */
export interface CapturableSession {
  on?: (event: string, handler: (...args: unknown[]) => void) => unknown;
  off?: (event: string, handler: (...args: unknown[]) => void) => unknown;
}

export interface AssistantTurnCaptureConfig {
  session: CapturableSession;
  sessionId: string;
  userId?: string | null;
  services: SessionServices | null | undefined;
  /** Current persona (may change on handoff in single-agent mode) */
  getPersonaId: () => string;
  /** Existing thread id, if the session already resolved one */
  getThreadId?: () => string | undefined;
}

export interface RecordAssistantTurnInput {
  sessionId: string;
  userId?: string | null;
  services: SessionServices | null | undefined;
  text: string;
  personaId: string;
  threadId?: string;
}

/**
 * Remove anything that was never meant to be heard: SSML, leaked JSON
 * function calls (`{"fn": …}`), bracketed stage directions, extra spaces.
 */
export function cleanSpokenText(raw: string): string {
  if (!raw) return '';
  let text = stripSSML(raw);
  text = stripJsonFunctionCalls(text);
  text = text.replace(/\[(?:pause|laughs?|sighs?|breath)[^\]]*\]/gi, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

function stripJsonFunctionCalls(text: string): string {
  let out = text;
  let start = out.search(/\{\s*"fn"\s*:/);
  while (start !== -1) {
    let depth = 0;
    let end = -1;
    for (let i = start; i < out.length; i++) {
      if (out[i] === '{') depth++;
      else if (out[i] === '}') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    out = end === -1 ? out.slice(0, start) : out.slice(0, start) + out.slice(end + 1);
    start = out.search(/\{\s*"fn"\s*:/);
  }
  return out;
}

/** Session history + Firestore turns (+ memory attribution, on-behalf capture). */
async function recordInSessionHistory(
  input: RecordAssistantTurnInput,
  text: string,
  meta: { turnNumber: number; personaId: string }
): Promise<void> {
  let recorder: typeof import('./agent-turn-recorder.js');
  try {
    recorder = await import('./agent-turn-recorder.js');
  } catch (error) {
    log.warn({ error: String(error), sessionId: input.sessionId }, 'Turn recorder unavailable');
    input.services?.addTurn?.('assistant', text, undefined, meta);
    return;
  }
  try {
    await recorder.recordAgentTurn(input.sessionId, input.services, text, meta);
  } catch (error) {
    log.warn({ error: String(error), sessionId: input.sessionId }, 'Assistant turn record failed');
  }
}

/** Conversation thread message (cross-channel continuity). */
async function recordInThread(
  input: RecordAssistantTurnInput,
  userId: string,
  text: string
): Promise<void> {
  try {
    const { recordAgentMessage } =
      await import('../../services/conversation-thread/thread-recorder.js');
    await recordAgentMessage({
      userId,
      sessionId: input.sessionId,
      personaId: input.personaId as PersonaId,
      threadId: input.threadId,
      content: text,
    });
  } catch (error) {
    log.debug({ error: String(error) }, 'Assistant thread message failed (non-critical)');
  }
}

/**
 * Record one assistant reply on every memory path. Returns the turn number
 * used, or null when there was nothing to record.
 */
export async function recordAssistantTurn(input: RecordAssistantTurnInput): Promise<number | null> {
  const text = cleanSpokenText(input.text);
  if (!text) return null;

  const turnNumber = nextTurnNumber(input.sessionId);
  rememberSessionTurn(input.sessionId, {
    role: 'assistant',
    text,
    turnNumber,
    personaId: input.personaId,
    timestamp: Date.now(),
  });
  recordAssistantTurnCaptured();

  const meta = { turnNumber, personaId: input.personaId };
  await Promise.all([
    recordInSessionHistory(input, text, meta),
    input.userId ? recordInThread(input, input.userId, text) : Promise.resolve(),
  ]);
  return turnNumber;
}

interface ChatItemLike {
  id?: string;
  type?: string;
  role?: string;
  textContent?: string;
  content?: unknown;
}

function extractAssistantText(event: unknown): { id?: string; text: string } | null {
  const item = (event as { item?: ChatItemLike } | undefined)?.item;
  if (!item || item.role !== 'assistant') return null;
  if (item.type !== undefined && item.type !== 'message') return null;
  let text = typeof item.textContent === 'string' ? item.textContent : '';
  if (!text && Array.isArray(item.content)) {
    text = item.content.filter((c): c is string => typeof c === 'string').join('\n');
  }
  return text ? { id: item.id, text } : null;
}

/**
 * Subscribe to the session's assistant messages. Returns an unsubscribe
 * function (push it onto the session's cleanup list).
 */
export function wireAssistantTurnCapture(config: AssistantTurnCaptureConfig): () => void {
  const { session, sessionId } = config;
  if (typeof session.on !== 'function') {
    log.warn({ sessionId }, 'Session has no event API - assistant turns will not be captured');
    return () => undefined;
  }

  const seenIds = new Set<string>();
  const handler = (event: unknown): void => {
    const extracted = extractAssistantText(event);
    if (!extracted) return;
    if (extracted.id) {
      if (seenIds.has(extracted.id)) {
        recordAssistantTurnDeduped();
        return;
      }
      seenIds.add(extracted.id);
      if (seenIds.size > 500) {
        const first = seenIds.values().next().value;
        if (first !== undefined) seenIds.delete(first);
      }
    }
    markSessionActivity(sessionId);
    void recordAssistantTurn({
      sessionId,
      userId: config.userId,
      services: config.services,
      text: extracted.text,
      personaId: config.getPersonaId(),
      threadId: config.getThreadId?.(),
    }).catch((error: unknown) =>
      log.warn({ error: String(error), sessionId }, 'Assistant turn capture failed')
    );
  };

  session.on(CONVERSATION_ITEM_ADDED_EVENT, handler);
  log.info({ sessionId }, '📝 Assistant turn capture wired');
  return () => {
    try {
      session.off?.(CONVERSATION_ITEM_ADDED_EVENT, handler);
    } catch {
      // Session may already be closed
    }
  };
}
