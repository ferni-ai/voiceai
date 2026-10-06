/**
 * Agent Reply Recorder
 *
 * Records every reply the agent actually committed to the conversation:
 * normal LLM replies, cached replies and greetings alike. Driven by the
 * LiveKit `conversation_item_added` event, so the text is what the user
 * heard (truncated when they interrupted), not what the LLM planned to say.
 *
 * Writes the state that turn processing reads on the next user turn:
 * session turns + memory attribution, lastAgentResponse (correction, echo,
 * interruption and silence handling), repair/advice tracking, and humor/story
 * calibration.
 *
 * @module voice-agent/agent-reply-recorder
 */

import { voice, type llm } from '@livekit/agents';
import {
  recordAdviceGiven,
  recordAgentResponse,
} from '../../conversation/advanced-humanization-integration.js';
import type { SessionServices } from '../../services/index.js';
import { detectAdvice } from '../../services/superhuman/semantic-intelligence/advice-detector.js';
import { createLogger } from '../../utils/safe-logger.js';
import { stripSSML } from '../../utils/text-utils.js';
import type { UserData } from '../shared/types.js';
import { createLedgerRecorder } from '../personas/life-ledger.js';
import { recordAgentTurn } from './agent-turn-recorder.js';

const log = createLogger({ module: 'agent-reply-recorder' });

export interface AgentReplyContext {
  sessionId: string;
  services?: SessionServices | null;
  userData: UserData;
}

export interface AgentReplySignals {
  hasHumor: boolean;
  hasStory: boolean;
  isAdvice: boolean;
}

// Whole-phrase markers only: bare words like "funny" or "story" show up in
// serious replies ("it's funny how grief works", "tell me your story").
const HUMOR_MARKERS = /\b(ha(ha)+|he(he)+|just kidding|i'm kidding|kidding aside|pun intended)\b/i;
// First-person anchors: "do you remember when..." is a question, not a story.
const STORY_MARKERS =
  /\b(i remember when|back when i|once upon a time|let me tell you about|i once knew|reminds me of (a|the) time|one time i)\b/i;

// Backchannels and bare acknowledgements are committed like any reply, but
// they are not something the user answers or corrects. Recording them would
// overwrite the question the user is actually responding to.
const ACKNOWLEDGEMENTS = new Set([
  'mm',
  'mmm',
  'mhm',
  'mm-hm',
  'mm-hmm',
  'uh-huh',
  'hmm',
  'ah',
  'ahh',
  'oh',
  'yeah',
  'yep',
  'yes',
  'okay',
  'ok',
  'right',
  'i see',
  'got it',
  'i hear you',
  'indeed',
  'interesting',
]);

export function isAcknowledgementOnly(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z' -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return ACKNOWLEDGEMENTS.has(normalized);
}

export function classifyAgentReply(text: string): AgentReplySignals {
  return {
    hasHumor: HUMOR_MARKERS.test(text),
    hasStory: STORY_MARKERS.test(text),
    isAdvice: detectAdvice(text).containsAdvice,
  };
}

/**
 * Record one committed conversation item if it is an assistant reply.
 * Returns true when the item was recorded.
 */
export async function recordCommittedAgentReply(
  ctx: AgentReplyContext,
  item: llm.ChatItem | { type: string }
): Promise<boolean> {
  if (item.type !== 'message') return false;
  const message = item as llm.ChatMessage;
  if (message.role !== 'assistant') return false;

  const text = stripSSML(message.textContent ?? '').trim();
  if (!text || isAcknowledgementOnly(text)) return false;

  const { sessionId, services, userData } = ctx;
  userData.lastAgentResponse = text;
  userData.lastAgentResponseTime = Date.now();

  const signals = classifyAgentReply(text);
  const topic = userData.lastTopic || 'general';

  try {
    userData.lastResponseHadHumor = signals.hasHumor && !!services;
    if (signals.hasHumor && services) {
      services.humorCalibration.recordHumorAttempt(text.slice(0, 200), topic);
    }
    userData.lastResponseHadStory = signals.hasStory && !!services;
    if (signals.hasStory && services) {
      services.storyPreference.recordStory(text, topic);
    }
  } catch (error) {
    log.debug({ error: String(error), sessionId }, 'Humor/story calibration failed');
  }

  try {
    recordAgentResponse(sessionId, text);
    if (signals.isAdvice) recordAdviceGiven(sessionId);
  } catch (error) {
    log.debug({ error: String(error), sessionId }, 'Repair/advice tracking failed');
  }

  await recordAgentTurn(sessionId, services, text);

  log.debug(
    { sessionId, chars: text.length, interrupted: message.interrupted, ...signals },
    'Agent reply recorded'
  );
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReplySession = voice.AgentSession<any>;

const recordingSessions = new WeakSet<object>();

/**
 * Start recording committed replies on a session. Safe to call more than once:
 * multi-agent setup registers before the greeting (handlers are wired after
 * it), and the session-state handlers register again later.
 * Returns false when the session was already recording.
 */
export function registerAgentReplyRecorder(session: ReplySession, ctx: AgentReplyContext): boolean {
  if (recordingSessions.has(session)) return false;
  recordingSessions.add(session);

  // What the agent says about itself, kept for the next call (life-ledger.ts).
  const userId = ctx.services?.userId;
  const ledger = userId && userId !== 'anonymous' ? createLedgerRecorder(userId) : null;
  session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (event) => {
    recordCommittedAgentReply(ctx, event.item)
      .then((recorded) => {
        const text = recorded ? ctx.userData.lastAgentResponse : undefined;
        if (ledger && text) ledger.add(ctx.userData.personaId ?? 'ferni', text);
      })
      .catch((error) => {
        log.warn(
          { error: String(error), sessionId: ctx.sessionId },
          'Recording agent reply failed'
        );
      });
  });
  if (ledger) session.on(voice.AgentSessionEventTypes.Close, () => void ledger.flush());
  return true;
}
