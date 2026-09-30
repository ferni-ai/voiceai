/**
 * Per-turn intelligence for the live agent.
 *
 * handleUserTurn() builds each turn's context (context builders, memory
 * retrieval, emotional and coaching guidance) and injects it into the LLM's
 * chat context before the reply. It ran from the legacy VoiceAgent's
 * onUserTurnCompleted; when that class was deleted (12fdfcbcc, 2025-12-21) the
 * replacement PersonaVoiceAgent never got the hook, so no live call ran it.
 *
 * Modes (TURN_INTELLIGENCE):
 * - background (default, also "on"): runs off the reply's critical path in
 *   advisory mode and informs the next LLM request. See
 *   background-turn-intelligence.ts.
 * - blocking: the SDK awaits it in onUserTurnCompleted, adding its duration
 *   (measured 280-400 ms) to every reply.
 * - off.
 *
 * Realtime models with server-side turn detection (Gemini native audio) never
 * get onUserTurnCompleted from the SDK; this hook only affects text-LLM
 * pipelines such as the Cartesia cascade.
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

export type TurnIntelligenceMode = 'background' | 'blocking' | 'off';

export function resolveTurnIntelligenceMode(
  env: Record<string, string | undefined> = process.env
): TurnIntelligenceMode {
  const mode = env.TURN_INTELLIGENCE?.trim().toLowerCase();
  if (mode === 'off' || mode === 'blocking') return mode;
  return 'background';
}

export type UserTurnHook = (turnCtx: llm.ChatContext, newMessage: llm.ChatMessage) => Promise<void>;

export interface TurnIntelligenceDeps {
  persona: PersonaConfig;
  services: SessionServices;
  userData: UserData;
  room?: TurnHandlerContext['room'];
  /** Gather context only: never speak or reply from inside the handler. */
  advisory?: boolean;
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
      // The handler reads and writes the LIVE session data (mood, stories and
      // themes already shared, relationship stage): a fresh object each turn
      // reset the persona's mood and let it repeat itself. Per-turn signals
      // are layered on top.
      Object.assign(userData, {
        extensibilitySessionPrompt: state?.extensibility?.sessionPrompt,
        pauseBeforeMs,
        speechRateWPM: getAverageSpeechRate(deps.services.sessionId),
        totalConversations: state?.user?.totalConversations,
        sharedVulnerabilities: state?.user?.sharedVulnerabilities,
      });

      await handle({
        turnCtx,
        userText,
        persona: deps.persona,
        services: deps.services,
        userData: userData as TurnHandlerContext['userData'],
        advisory: deps.advisory,
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
        { personaId: deps.persona.id, durationMs: Date.now() - start, advisory: !!deps.advisory },
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
 * True when the SDK will never call onUserTurnCompleted for this session: a
 * realtime model that detects turns server-side (e.g. Gemini native audio)
 * replies without waiting for the agent.
 */
export function usesServerTurnDetection(session: unknown): boolean {
  const model = (session as { llm?: { capabilities?: { turnDetection?: boolean } } })?.llm;
  return model?.capabilities?.turnDetection === true;
}

/** Keeps a pushed context note from growing the model's context unboundedly. */
export const MAX_TURN_NOTES_CHARS = 2000;

/** Run the hook against a scratch context and return what it would have injected. */
export async function collectTurnNotes(
  hook: UserTurnHook,
  transcript: string
): Promise<string | null> {
  if (!transcript.trim()) return null;
  const { llm } = await import('@livekit/agents');
  const scratch = llm.ChatContext.empty();
  await hook(scratch, llm.ChatMessage.create({ role: 'user', content: transcript }));
  const notes = scratch.items
    .map((item) => (item as { textContent?: string }).textContent?.trim())
    .filter((text): text is string => Boolean(text));
  return notes.length > 0 ? notes.join('\n\n').slice(0, MAX_TURN_NOTES_CHARS) : null;
}

interface RealtimeContextAgent {
  readonly chatCtx: { copy(): { addMessage(msg: { role: 'user'; content: string }): unknown } };
  updateChatCtx(chatCtx: unknown): Promise<void>;
}

/**
 * Per-turn context for realtime models that reply on their own.
 *
 * The turn handler runs on each final user transcript against a scratch
 * context; what it would have injected is held and pushed into the session
 * when the agent goes back to listening. Pushing while the model is speaking
 * would arrive as new input mid-reply, so it waits for the gap between turns
 * and informs the next reply instead.
 */
export function createRealtimeTurnContextPusher(hook: UserTurnHook, agent: RealtimeContextAgent) {
  let pending: string | null = null;

  return {
    async onFinalTranscript(transcript: string): Promise<void> {
      const notes = await collectTurnNotes(hook, transcript);
      if (notes) pending = notes;
    },

    async onAgentState(newState: string | undefined): Promise<void> {
      if (newState !== 'listening' || !pending) return;
      const content = `[Context for your next reply, not something the user said]\n${pending}`;
      pending = null;
      try {
        const chatCtx = agent.chatCtx.copy();
        chatCtx.addMessage({ role: 'user', content });
        await agent.updateChatCtx(chatCtx);
      } catch (error) {
        log.warn({ error: String(error) }, 'Could not push turn context to the realtime session');
      }
    },
  };
}
