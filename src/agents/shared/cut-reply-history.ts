/**
 * A reply the caller cut off stays in the chat, marked as cut (CUT_REPLY_IN_HISTORY, #2422).
 *
 * LiveKit adds an interrupted reply to the chat only with the text that played
 * (agent_activity.js: no item when `forwardedText` is empty). Cut before a word
 * played, the reply is in no chat item at all, so the model, the director and
 * TOLD_THIS_CALL never see it, and the next reply says it again: 13+ of 105 prod
 * calls (prod-call-audit-2026-10-24 item 9), "heard" empty on all 400+ cut-offs.
 *
 * The text is the reply at the TTS hand-off, the source CALL_TIMELINE reads
 * (tts-wrapper.ts). When a reply's speech ends interrupted, whatever of it the
 * SDK did not commit goes into the agent's chat context as an assistant message,
 * marked: all of it when nothing was committed, the unheard rest when part was.
 * Never emitted as a conversation item, so it is never stored as a turn, and
 * never spoken. The cut text is also kept for the next reply's near-copy check
 * (personas/cut-reply-guard.ts) until that reply reaches the TTS.
 *
 * @module agents/shared/cut-reply-history
 */
import { llm } from '@livekit/agents';
import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { stripSSML } from '../../utils/text-utils.js';

const log = createLogger({ module: 'cut-reply-history' });

/** Leads a cut reply none of which was committed. */
export const CUT_MARK = '[cut off by the caller; they heard little or none of this]';
/** Leads the unheard rest of a reply cut part-way. */
export const CUT_REST_MARK = '[cut off by the caller here; they did not hear the rest]';
/** The `extra` key on a message this module inserted. */
export const CUT_REPLY_EXTRA = 'cutReply';

/** Committed words at or above this share of the generated reply: heard, nothing to add. */
const HEARD_ALL = 0.9;

interface CutState {
  /** The last reply text at the TTS hand-off, not yet matched to a finished speech. */
  pending?: { text: string; atMs: number };
  /** The last cut reply, until the next reply reaches the TTS. */
  armed?: string;
}

// Only sessions attached with the flag on have a state; everything else is a no-op.
const states = new WeakMap<object, CutState>();

/** Spoken words, for counting and comparing: punctuation-only tokens dropped. */
export function wordsOf(text: string): string[] {
  return text.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t));
}

/**
 * The chat text for a cut reply: the marked reply when nothing was committed, the marked
 * unheard rest when part was, undefined when the committed text covers it.
 */
export function unheardPart(generated: string, heard: string): string | undefined {
  const gen = wordsOf(generated);
  const heardCount = wordsOf(heard).length;
  if (gen.length === 0) return undefined;
  if (heardCount === 0) return `${CUT_MARK} ${gen.join(' ')}`;
  if (heardCount >= gen.length * HEARD_ALL) return undefined;
  return `${CUT_REST_MARK} ${gen.slice(heardCount).join(' ')}`;
}

/** tts-wrapper: the full reply text at the TTS hand-off. A new reply disarms the last cut. */
export function noteGeneratedForCut(
  session: object | undefined,
  text: string,
  now: number = Date.now()
): void {
  const state = session && states.get(session);
  if (!state) return;
  const clean = stripSSML(text).trim();
  if (!clean) return;
  state.pending = { text: clean, atMs: now };
  state.armed = undefined;
}

/** The cut reply the next reply must not repeat, if there is one. */
export function armedCutReply(session: object): string | undefined {
  return states.get(session)?.armed;
}

interface ChatAgent {
  readonly chatCtx: { copy(): llm.ChatContext };
  updateChatCtx(chatCtx: llm.ChatContext): Promise<void>;
}

interface Handle {
  readonly interrupted: boolean;
  readonly chatItems: readonly llm.ChatItem[];
  addDoneCallback(callback: () => void): void;
}

interface CutSession {
  on(event: string, handler: (ev: { speechHandle?: Handle; createdAt?: number }) => void): unknown;
  off(event: string, handler: (ev: { speechHandle?: Handle; createdAt?: number }) => void): unknown;
  readonly currentAgent: ChatAgent;
}

function committedReply(items: readonly llm.ChatItem[]): llm.ChatMessage | undefined {
  const replies = items.filter(
    (i): i is llm.ChatMessage => i.type === 'message' && i.role === 'assistant'
  );
  return replies.length > 0 ? replies[replies.length - 1] : undefined;
}

function onSpeechDone(
  session: CutSession,
  state: CutState,
  handle: Handle,
  createdAt: number,
  sessionId: string
): void {
  const generated = state.pending;
  if (!generated || generated.atMs < createdAt) return; // no text of this speech reached the TTS
  state.pending = undefined;
  if (!handle.interrupted) return;
  const committed = committedReply(handle.chatItems);
  const heard = committed?.textContent ?? '';
  const content = unheardPart(generated.text, heard);
  if (!content) return;
  state.armed = generated.text;
  try {
    const agent = session.currentAgent;
    const ctx = agent.chatCtx.copy();
    // Where LiveKit would have put it: at the reply's start, or right after the heard part.
    const at = committed ? committed.createdAt + 1 : createdAt;
    const extra = { [CUT_REPLY_EXTRA]: true };
    ctx.insert(llm.ChatMessage.create({ role: 'assistant', content, createdAt: at, extra }));
    void agent.updateChatCtx(ctx).catch((error: unknown) => {
      log.warn({ sessionId, error: String(error) }, 'cut reply not added to the chat');
    });
  } catch (error) {
    log.warn({ sessionId, error: String(error) }, 'cut reply not added to the chat');
    return;
  }
  const words = {
    heardWords: wordsOf(heard).length,
    generatedWords: wordsOf(generated.text).length,
  };
  log.info({ sessionId, ...words }, 'CUT_REPLY_IN_HISTORY');
}

/** CUT_REPLY_IN_HISTORY=on: keep cut replies in this session's chat. Returns the detach. */
export function attachCutReplyHistory(
  session: CutSession,
  opts: { sessionId: string },
  env: Env = process.env
): () => void {
  if (!flagOn('CUT_REPLY_IN_HISTORY', env)) return () => {};
  const state: CutState = {};
  states.set(session, state);
  const onSpeech = (ev: { speechHandle?: Handle; createdAt?: number }): void => {
    const handle = ev.speechHandle;
    const createdAt = ev.createdAt ?? Date.now();
    handle?.addDoneCallback(() => onSpeechDone(session, state, handle, createdAt, opts.sessionId));
  };
  session.on('speech_created', onSpeech);
  return () => {
    session.off('speech_created', onSpeech);
    if (states.get(session) === state) states.delete(session);
  };
}
