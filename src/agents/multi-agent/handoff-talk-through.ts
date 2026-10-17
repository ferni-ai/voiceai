/**
 * HANDOFF_TALK_THROUGH (off by default): a caller who keeps talking while the outgoing
 * persona says goodbye is heard, and handed over, instead of losing the handoff.
 *
 * Dev A/B 2026-10-17 (voiceai-evidence/handoff-warmth-2026-10-17, section c): talking
 * through Jordan's "Let me get Ferni for you!" failed the handoff in 3 of 3 calls with
 * "The handoff tool didn't swap within 8000ms". The chain, the same in every call:
 * 1. The handoff tool call runs on its own SpeechHandle. The SDK applies the tool's
 *    `llm.handoff` only if that handle is not interrupted once the tool returns;
 *    an interrupted one has its handoff dropped without a word
 *    (agent_activity `_commitInterruptedToolOutputs`, 1.6.4 and 1.9.3).
 * 2. While the tool waits for the goodbye, its handle is a "background speech", and
 *    `session.interrupt()` interrupts background speeches first, then the current one.
 *    The barge-in fast path fired on the caller's voice ~1 s into the goodbye
 *    (BARGE_IN_FASTPATH at 10:07:04.714 in A1): the tool's handle was interrupted, then
 *    the goodbye threw "This generation handle does not allow interruptions", which
 *    was logged as if nothing had happened.
 * 3. The tool returned at 10:07:06.283 with the next persona; the SDK dropped it (no
 *    function_tools_executed for that speech), so swapBySdk polled out at 14.302.
 * 4. The goodbye is `allowInterruptions: false`, so LiveKit discards the caller's audio
 *    while it plays (discardAudioIfUninterruptible): only "at 4." was transcribed, and
 *    the old persona answered it.
 *
 * With the flag on:
 * - the handoff tool's handle is held against interruption (`disallowInterruptions`)
 *   for as long as the handoff is in flight, so nothing can drop it once committed;
 * - the goodbye is interruptible, skipped if the caller is already talking, and stopped
 *   when they talk over it; the swap waits until they finish (bounded), so their words
 *   are transcribed on the outgoing persona's stream before it closes;
 * - the outgoing persona doesn't answer what is said meanwhile (StopResponse); the words
 *   go into the next persona's context, and it answers them as its first line.
 *
 * @module agents/multi-agent/handoff-talk-through
 */
import { voice } from '@livekit/agents';
import type { llm } from '@livekit/agents';
import { flagOn, type Env } from '../../config/env-flag.js';
import { generateReply } from '../shared/generate-reply-gateway.js';
import { personaName } from '../personas/said-by.js';
import { getLogger } from '../../utils/safe-logger.js';
import { singleSessionHandoffs } from './persona-swap.js';

const log = getLogger();

export function handoffTalkThrough(env: Env = process.env): boolean {
  return flagOn('HANDOFF_TALK_THROUGH', env);
}

/** The longest the swap waits for a caller who talks over the goodbye */
export const LISTEN_MAX_MS = 6_000;
/** After the caller stops: time for the STT's final transcript before the swap */
export const FINAL_GRACE_MS = 1_000;
const POLL_MS = 25;

interface CallSession {
  userState: string;
  interrupt: () => unknown;
  on: (event: string, fn: (ev: unknown) => void) => unknown;
  off: (event: string, fn: (ev: unknown) => void) => unknown;
}

interface Outgoing {
  personaId: string;
  session: unknown;
  agent?: unknown;
}

/** One handoff's window: from before the goodbye until the next persona is on */
export interface TalkThrough {
  /** The caller is talking now: no goodbye */
  callerTalking: () => boolean;
  /** Instead of waiting out the goodbye: stop it if the caller talks, and hear them out */
  listen: (goodbyeMs: number) => Promise<void>;
  /**
   * Close the window. With words heard, they go into `agent`'s context and it answers
   * them (the returned promise); with none, undefined (the usual greeting).
   */
  arrive: (persona: unknown) => Promise<void> | undefined;
  /** Close the window without a handoff: the words stay with the outgoing persona */
  abandon: () => void;
}

type TurnHook = (chatCtx: llm.ChatContext, message: llm.ChatMessage) => Promise<void>;

/** The window for a handoff away from `from`, or null (flag off, or not a swap) */
export function talkThroughFor(from: Outgoing, sessionId: string): TalkThrough | null {
  if (!handoffTalkThrough() || !singleSessionHandoffs() || from.agent === undefined) return null;
  try {
    return openWindow(from, sessionId);
  } catch (error) {
    // Never in the way of the handoff itself: without a window it runs as before
    log.warn({ sessionId, error: String(error) }, 'HANDOFF_TALK_THROUGH window not opened');
    return null;
  }
}

function openWindow(from: Outgoing, sessionId: string): TalkThrough {
  const agent = from.agent as { onUserTurnCompleted?: TurnHook };
  const session = from.session as CallSession;
  const heard: string[] = [];
  let lastFinalAt = 0;
  const onTranscript = (ev: unknown): void => {
    const { transcript, isFinal } = ev as { transcript?: string; isFinal?: boolean };
    if (!isFinal || !transcript?.trim()) return;
    heard.push(transcript.trim());
    lastFinalAt = Date.now();
  };
  session.on(voice.AgentSessionEventTypes.UserInputTranscribed, onTranscript);
  // The outgoing persona must not answer what is said during its goodbye
  const own = Object.getOwnPropertyDescriptor(agent, 'onUserTurnCompleted');
  agent.onUserTurnCompleted = async () => Promise.reject(new voice.StopResponse());
  let open = true;
  const close = (): string => {
    if (open) {
      open = false;
      session.off(voice.AgentSessionEventTypes.UserInputTranscribed, onTranscript);
      if (own) Object.defineProperty(agent, 'onUserTurnCompleted', own);
      else delete agent.onUserTurnCompleted;
    }
    return heard.join(' ');
  };
  const talking = (): boolean => session.userState === 'speaking';

  return {
    callerTalking: talking,
    listen: async (goodbyeMs) => {
      const start = Date.now();
      let talked = false;
      let quietSince: number | undefined;
      for (;;) {
        const now = Date.now();
        if (talking()) {
          quietSince = undefined;
          if (!talked) {
            talked = true;
            stopGoodbye(session); // the tool's speech is held: this can't drop the handoff
          }
        } else quietSince ??= now;
        if (!talked && now - start >= goodbyeMs) return;
        const settled =
          talked &&
          quietSince !== undefined &&
          (lastFinalAt >= quietSince || now - quietSince >= FINAL_GRACE_MS);
        if (settled || now - start >= LISTEN_MAX_MS) {
          log.info({ sessionId, heard: heard.length, ms: now - start }, 'HANDOFF_TALK_THROUGH');
          return;
        }
        // eslint-disable-next-line no-await-in-loop -- polling the caller's voice activity
        await new Promise<void>((resolve) => {
          setTimeout(resolve, POLL_MS);
        });
      }
    },
    arrive: (next): Promise<void> | undefined => {
      const words = close();
      if (!words) return undefined;
      return answerOnArrival(next, words, from.personaId, sessionId);
    },
    abandon: () => {
      const words = close();
      if (words)
        carry(agent, words).catch((e: unknown) =>
          log.warn({ error: String(e) }, 'HANDOFF_TALK_THROUGH words not kept')
        );
    },
  };
}

function stopGoodbye(session: CallSession): void {
  try {
    session.interrupt();
  } catch (error) {
    log.warn({ error: String(error) }, 'handoff talk-through: goodbye not stopped');
  }
}

/** The caller's words as their latest message in `agent`'s context, once */
async function carry(agent: unknown, words: string): Promise<void> {
  const a = agent as {
    chatCtx: llm.ChatContext;
    updateChatCtx: (c: llm.ChatContext) => Promise<void>;
  };
  const talk = a.chatCtx.copy();
  const already = talk.items.some(
    (i) => i.type === 'message' && i.role === 'user' && i.textContent === words
  );
  if (already) return;
  talk.addMessage({ role: 'user', content: words });
  await a.updateChatCtx(talk);
}

export const ARRIVAL_ANSWER =
  "{from} has just handed this call to you. The caller's last words were said while {from} was handing them over, so nobody has answered them yet. Open in your own voice with a quick hello, then answer or acknowledge exactly what they said. Don't ask them to repeat it. Two short sentences at most.";

async function answerOnArrival(
  persona: unknown,
  words: string,
  fromPersonaId: string,
  sessionId: string
): Promise<void> {
  const { agent, session } = persona as { agent: unknown; session: voice.AgentSession };
  try {
    await carry(agent, words);
    const result = await generateReply(session, sessionId, {
      instructions: ARRIVAL_ANSWER.replaceAll('{from}', personaName(fromPersonaId)),
      context: 'handoff-talk-through',
      priority: 'high',
      waitForPlayout: false,
    });
    log.info({ sessionId, success: result.success }, 'HANDOFF_TALK_THROUGH arrival answered');
  } catch (error) {
    // The swap is done: a failed answer must not count as a failed handoff
    log.warn({ sessionId, error: String(error) }, 'HANDOFF_TALK_THROUGH arrival not answered');
  }
}
