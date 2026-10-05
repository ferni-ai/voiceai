/**
 * Per-turn intelligence for the live agent.
 *
 * handleUserTurn() builds each turn's context (context builders, memory
 * retrieval, emotional and coaching guidance) and injects it into the LLM's
 * chat context before the reply. It ran from the legacy VoiceAgent's
 * onUserTurnCompleted; when that class was deleted (12fdfcbcc, 2025-12-21) the
 * replacement PersonaVoiceAgent never got the hook, so no live call ran it.
 *
 * Run synchronously in onUserTurnCompleted it cost ~300 ms a turn and spoke a
 * second reply, so it now runs in the background, context-only, and its note
 * informs the next reply (createTurnContextPusher). Gated by TURN_INTELLIGENCE.
 *
 * @module agents/multi-agent/turn-intelligence
 */

import type { llm } from '@livekit/agents';
import type { PersonaConfig } from '../../personas/types.js';
import type { SessionServices } from '../../services/index.js';
import { createLogger } from '../../utils/safe-logger.js';
import { createDataMessageSender } from '../shared/data-message-envelope.js';
import type { UserData } from '../shared/types.js';
import type { TurnHandlerContext } from '../voice-agent/turn-handler.js';
import { getUserResponseGapMs } from '../voice-agent/user-response-gap.js';

const log = createLogger({ module: 'TurnIntelligence' });

export type TurnIntelligenceMode = 'on' | 'off';

export function resolveTurnIntelligenceMode(
  env: Record<string, string | undefined> = process.env
): TurnIntelligenceMode {
  return env.TURN_INTELLIGENCE === 'on' ? 'on' : 'off';
}

export type UserTurnHook = (turnCtx: llm.ChatContext, newMessage: llm.ChatMessage) => Promise<void>;

export interface TurnIntelligenceDeps {
  persona: PersonaConfig;
  services: SessionServices;
  userData: UserData;
  room?: TurnHandlerContext['room'];
  /** Injected for tests; defaults to the real turn handler. */
  handle?: (ctx: TurnHandlerContext) => Promise<void>;
}

export function createTurnIntelligenceHook(deps: TurnIntelligenceDeps): UserTurnHook {
  // Frontend signals are best-effort; a dropped one must not affect the turn.
  const sendDataMessage = createDataMessageSender(deps.room);

  return async (turnCtx, newMessage) => {
    const userText = newMessage.textContent?.trim();
    if (!userText) return;

    const start = Date.now();
    try {
      // The turn handler records each turn's voice pattern; the engine must
      // exist first (voice-pattern-session.ts, VOICE_PATTERN_ENGINE).
      const { startVoicePatterns } =
        await import('../../conversation/humanization/voice-pattern-session.js');
      await startVoicePatterns(deps.services.sessionId, deps.services.userId);
      const handle = deps.handle ?? (await import('../voice-agent/turn-handler.js')).handleUserTurn;
      const { getStateManager } = await import('../session/user-data-proxy.js');
      const { getAverageSpeechRate } = await import('../voice-agent/human-turn-intelligence.js');
      const userData = deps.userData as UserData & {
        turnCount?: number;
        userSpeakingStartTime?: number;
        lastAgentResponseTime?: number;
        voiceEmotion?: { primary: string; confidence: number; prosody?: Record<string, unknown> };
      };
      const stateManager = getStateManager(deps.userData);
      const state = stateManager?.getState() as
        | {
            extensibility?: { sessionPrompt?: string };
            user?: { totalConversations?: number; sharedVulnerabilities?: number };
          }
        | undefined;
      const pauseBeforeMs = getUserResponseGapMs(userData) ?? 0;

      await handle({
        turnCtx,
        userText,
        // Runs beside the reply, so it must not speak, run tools or act.
        contextOnly: true,
        persona: deps.persona,
        services: deps.services,
        userData: {
          turnCount: userData.turnCount,
          extensibilitySessionPrompt: state?.extensibility?.sessionPrompt,
          pauseBeforeMs,
          speechRateWPM: getAverageSpeechRate(deps.services.sessionId),
          totalConversations: state?.user?.totalConversations,
          sharedVulnerabilities: state?.user?.sharedVulnerabilities,
        },
        voiceEmotion: userData.voiceEmotion
          ? {
              primary: userData.voiceEmotion.primary,
              confidence: userData.voiceEmotion.confidence,
              arousal: userData.voiceEmotion.prosody?.energy as number | undefined,
              valence: userData.voiceEmotion.prosody?.pitch as number | undefined,
            }
          : undefined,
        sessionStateManager: stateManager,
        room: deps.room,
        sendDataMessage,
      });
      log.info(
        { personaId: deps.persona.id, durationMs: Date.now() - start },
        'Turn intelligence applied'
      );
    } catch (error) {
      // The SDK's StopResponse means "do not reply to this turn" - let it through.
      if ((error as { name?: string })?.name === 'StopResponse') throw error;
      log.error(
        { personaId: deps.persona.id, durationMs: Date.now() - start, error: String(error) },
        'Turn intelligence failed; replying without per-turn context'
      );
    }
  };
}

/**
 * Opens each pushed context note, so readers of the chat can tell it from the
 * caller's words. A note is built for the reply to the words just above it,
 * which has already been spoken by the time it lands, so its instructions are
 * spent. Read as live, its "ask a follow-up question" steering made 15 of 19
 * dev replies end in a question (2026-10-05; 7 of 23 before notes reached
 * replies).
 */
export const TURN_CONTEXT_HEADER =
  "[Background on what they said just above, not something the user said. It was written for your reply to that line, which you already gave: use what it tells you about them, but don't act on its instructions, such as asking a question or bringing something up.]";

/** The key, in a pushed note's `extra`, of the caller's words it was built for. */
export const TURN_CONTEXT_FOR = 'turnContextFor';

interface ChatItemView {
  id: string;
  type?: string;
  role?: string;
  textContent?: string;
  extra?: Record<string, unknown>;
  createdAt?: number;
}

const isTurnContext = (item: ChatItemView): boolean =>
  item.type === 'message' &&
  item.role === 'user' &&
  Boolean(item.textContent?.startsWith(TURN_CONTEXT_HEADER));
const normalized = (text: unknown): string =>
  String(text ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The request for one reply without a pushed note that would read as being
 * about the words it answers when it was built for others.
 *
 * Dev call 2026-10-03: a note built from the previous turn sat just before
 * "Why do you keep forgetting?", and the reply ("Maybe it's not about making
 * me human...") followed the previous turn. Notes are now placed right after
 * the words they were built for (createTurnContextPusher), so one that sits in
 * history, before a reply of Ferni's, is background and stays. Only a note in
 * the unanswered tail that was built for other words is dropped.
 * STALE_TURN_CONTEXT=keep sends every note.
 */
export function withoutStaleTurnContext<T extends { items: ChatItemView[]; copy(): T }>(
  chatCtx: T,
  env: Record<string, string | undefined> = process.env
): T {
  if (env.STALE_TURN_CONTEXT === 'keep') return chatCtx;
  const items = chatCtx.items;
  if (!items.some(isTurnContext)) return chatCtx;
  // The caller's words this reply answers: their messages since Ferni last spoke.
  const said: string[] = [];
  let tail = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.type !== 'message') continue;
    if (item.role === 'assistant') {
      tail = i + 1;
      break;
    }
    if (item.role === 'user' && !isTurnContext(item)) said.unshift(item.textContent ?? '');
  }
  const answering = normalized(said.join(' '));
  const stale = new Set(
    items
      .filter((item, i) => {
        if (i < tail || !isTurnContext(item)) return false;
        const builtFor = normalized(item.extra?.[TURN_CONTEXT_FOR]);
        return !builtFor || builtFor !== answering;
      })
      .map((item) => item.id)
  );
  if (stale.size === 0) return chatCtx;
  log.info(
    { answering: answering.slice(0, 60), dropped: stale.size },
    'STALE_TURN_CONTEXT_DROPPED'
  );
  const ctx = chatCtx.copy();
  ctx.items = ctx.items.filter((item) => !stale.has(item.id));
  return ctx;
}

/**
 * Where a note goes: just after the caller's words it was built for and before
 * what followed them (Ferni's reply), with a createdAt that keeps the context
 * in time order. Undefined when those words aren't in the context yet or
 * nothing follows them: the note then goes at the end, with its words.
 */
function afterTheirWords(
  items: ChatItemView[],
  builtFor: string
): { index: number; createdAt: number } | undefined {
  const want = normalized(builtFor);
  const said = (item: ChatItemView | undefined) =>
    item?.type === 'message' && item.role === 'user' && !isTurnContext(item);
  for (let end = items.length - 1; end >= 0; end--) {
    if (!said(items[end])) continue;
    let start = end;
    while (start > 0 && said(items[start - 1])) start--;
    const span = normalized(
      items
        .slice(start, end + 1)
        .map((i) => i.textContent ?? '')
        .join(' ')
    );
    if (span === want) {
      if (end + 1 >= items.length) return undefined;
      const last = items[end].createdAt ?? 0;
      const next = items[end + 1].createdAt ?? last;
      return { index: end + 1, createdAt: next > last ? last + (next - last) / 2 : last };
    }
    end = start;
  }
  return undefined;
}

/** Keeps a pushed context note from growing the session's context unboundedly. */
const MAX_PUSHED_CONTEXT_CHARS = 2000;

interface ContextAgent {
  readonly chatCtx: {
    copy(): {
      items: ChatItemView[];
      addMessage(msg: {
        role: 'user';
        content: string;
        extra: Record<string, unknown>;
        createdAt?: number;
      }): { id: string };
    };
  };
  updateChatCtx(chatCtx: unknown): Promise<void>;
}

/**
 * Per-turn context, built in the background and pushed between turns.
 *
 * Injecting it in onUserTurnCompleted cost every reply: the SDK starts
 * generating from the preflight transcript and throws that generation away
 * when onUserTurnCompleted changes the chat context (agent_activity.js:
 * "chat context or tools have changed after onUserTurnCompleted"). So the turn
 * handler runs here, context-only, on the turn's final transcript while Ferni
 * replies, and the note lands in the chat context for the next reply.
 *
 * A push waits until Ferni is listening and the user is not speaking: one
 * that lands mid-speech would change the context under a preemptive
 * generation. Each push replaces the previous note, so notes never pile up.
 *
 * A note is ready about 1.2 s after the reply to its turn has started (dev,
 * 2026-10-05), so it can only inform the next reply. It goes right after the
 * caller's words it was built for, before Ferni's reply to them, where it
 * reads as background on that moment rather than as a note about the new
 * question. Appended at the end, it was dropped as stale 122 times in 112 turns
 * (some turns pushed twice): the per-turn context reached no reply.
 */
export function createTurnContextPusher(hook: UserTurnHook, agent: ContextAgent) {
  let pending: string | null = null;
  let pushedId: string | null = null;
  let turnText = '';
  let run = 0;
  let agentListening = true;
  let userSpeaking = false;

  let pendingFor = '';

  const tryPush = async (): Promise<void> => {
    if (!pending || !agentListening || userSpeaking) return;
    const content = `${TURN_CONTEXT_HEADER}\n${pending}`;
    const extra = { [TURN_CONTEXT_FOR]: pendingFor };
    pending = null;
    try {
      const chatCtx = agent.chatCtx.copy();
      if (pushedId) chatCtx.items = chatCtx.items.filter((item) => item.id !== pushedId);
      const place = afterTheirWords(chatCtx.items, extra[TURN_CONTEXT_FOR]);
      const note = chatCtx.addMessage({
        role: 'user',
        content,
        extra,
        createdAt: place?.createdAt,
      });
      pushedId = note.id;
      if (place) {
        const rest = chatCtx.items.filter((item) => item.id !== note.id);
        chatCtx.items = [
          ...rest.slice(0, place.index),
          note as ChatItemView,
          ...rest.slice(place.index),
        ];
      }
      log.debug({ placed: place ? 'history' : 'tail' }, 'Turn context pushed');
      await agent.updateChatCtx(chatCtx);
    } catch (error) {
      log.warn({ error: String(error) }, 'Could not push turn context');
    }
  };

  return {
    /** A final transcript segment; segments of one turn accumulate. */
    async onFinalTranscript(transcript: string): Promise<void> {
      if (!transcript.trim()) return;
      turnText = `${turnText} ${transcript.trim()}`.trim();
      const forText = turnText;
      const mine = ++run;
      const { llm } = await import('@livekit/agents');
      const scratch = llm.ChatContext.empty();
      await hook(scratch, llm.ChatMessage.create({ role: 'user', content: turnText }));
      if (mine !== run) return; // a later segment of this turn superseded it
      const notes = scratch.items
        .map((item) => (item as { textContent?: string }).textContent?.trim())
        .filter((text): text is string => Boolean(text));
      if (notes.length === 0) return;
      pending = notes.join('\n\n').slice(0, MAX_PUSHED_CONTEXT_CHARS);
      pendingFor = forText;
      await tryPush();
    },

    async onAgentState(newState: string | undefined): Promise<void> {
      if (newState === 'thinking' || newState === 'speaking') turnText = ''; // the turn ended
      agentListening = newState === 'listening';
      await tryPush();
    },

    async onUserState(newState: string | undefined): Promise<void> {
      userSpeaking = newState === 'speaking';
      await tryPush();
    },
  };
}
