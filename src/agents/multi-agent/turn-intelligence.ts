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
import type { UserData } from '../shared/types.js';
import type { TurnHandlerContext } from '../voice-agent/turn-handler.js';

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
  const sendDataMessage = async (type: string, payload: Record<string, unknown>): Promise<void> => {
    try {
      const data = new TextEncoder().encode(JSON.stringify({ type, ...payload }));
      await deps.room?.localParticipant?.publishData(data, { reliable: true });
    } catch {
      // Frontend signals are best-effort; a dropped one must not affect the turn.
    }
  };

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
      const pauseBeforeMs =
        userData.userSpeakingStartTime && userData.lastAgentResponseTime
          ? Math.max(0, userData.userSpeakingStartTime - userData.lastAgentResponseTime)
          : 0;

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

/** Opens each pushed context note, so readers of the chat can tell it from the caller's words. */
export const TURN_CONTEXT_HEADER = '[Context for your next reply, not something the user said]';

/** Keeps a pushed context note from growing the session's context unboundedly. */
const MAX_PUSHED_CONTEXT_CHARS = 2000;

interface ContextAgent {
  readonly chatCtx: {
    copy(): {
      items: Array<{ id: string }>;
      addMessage(msg: { role: 'user'; content: string }): { id: string };
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
 */
export function createTurnContextPusher(hook: UserTurnHook, agent: ContextAgent) {
  let pending: string | null = null;
  let pushedId: string | null = null;
  let turnText = '';
  let run = 0;
  let agentListening = true;
  let userSpeaking = false;

  const tryPush = async (): Promise<void> => {
    if (!pending || !agentListening || userSpeaking) return;
    const content = `${TURN_CONTEXT_HEADER}\n${pending}`;
    pending = null;
    try {
      const chatCtx = agent.chatCtx.copy();
      if (pushedId) chatCtx.items = chatCtx.items.filter((item) => item.id !== pushedId);
      pushedId = chatCtx.addMessage({ role: 'user', content }).id;
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
