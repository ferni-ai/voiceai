/**
 * Never leave the caller's turn unanswered.
 *
 * Dev, 2026-09-30: the caller paused mid-thought ("Oh, and Biscuit chewed up
 * my phone charger this morning... So, that was fun."). Ferni's reply to the
 * first half started just as the second half ended, LiveKit cut it after one
 * word, and never committed the second half as a turn: it isn't in the chat
 * history and nothing answered it. 16-27 s of silence followed, filled by the
 * silence handler.
 *
 * So the keeper follows the caller's final transcripts itself. A final is
 * answered once an assistant message after it plays through, or is cut off
 * only after saying something real. When both sides have been quiet for a
 * short grace period and the latest final (a few words at least) is still
 * unanswered, Ferni answers it, passing the words along when LiveKit never
 * put them in the history.
 *
 * @module agents/multi-agent/turn-keeper
 */

export const TURN_KEEPER_GRACE_MS = 2500;
const MIN_WORDS = 3;
/** A cut-off reply shorter than this didn't answer anything. */
const MIN_ANSWER_WORDS = 6;

interface ChatItemLike {
  id?: string;
  type?: string;
  role?: string;
  textContent?: string;
  interrupted?: boolean;
}

const wordCount = (text: string | undefined): number =>
  (text ?? '').trim().split(/\s+/).filter(Boolean).length;

/** Whether an assistant message counts as an answer. */
export function isRealAnswer(item: ChatItemLike): boolean {
  if (item.role !== 'assistant' || (item.type && item.type !== 'message')) return false;
  return !item.interrupted || wordCount(item.textContent) >= MIN_ANSWER_WORDS;
}

/** Whether `text` is already the last user message in the history. */
export function lastUserMessageIs(items: readonly unknown[], text: string): boolean {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i] as ChatItemLike;
    if (item?.type && item.type !== 'message') continue;
    if (item?.role === 'user') return (item.textContent ?? '').trim() === text.trim();
  }
  return false;
}

export interface TurnKeeperSession {
  readonly agentState: string;
  readonly userState: string;
  readonly history: { items: readonly unknown[] };
}

export interface TurnKeeper {
  /** Any agent or user state change. */
  onStateChange(): void;
  /** user_input_transcribed */
  onTranscript(event: unknown): void;
  /** conversation_item_added */
  onItemAdded(event: unknown): void;
  stop(): void;
}

export function createTurnKeeper(deps: {
  session: TurnKeeperSession;
  /** Reply now; `userInput` is set when the caller's words aren't in the history. */
  reply: (userInput?: string) => void;
  graceMs?: number;
  log?: (fields: Record<string, unknown>) => void;
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (t: ReturnType<typeof setTimeout>) => void;
}): TurnKeeper {
  const setTimer = deps.setTimer ?? setTimeout;
  const clearTimer = deps.clearTimer ?? clearTimeout;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: string | undefined; // latest final transcript not yet answered
  const recovered = new Set<string>();
  const bothQuiet = (): boolean =>
    deps.session.agentState === 'listening' && deps.session.userState === 'listening';

  const check = (): void => {
    timer = undefined;
    if (!bothQuiet() || !pending || recovered.has(pending)) return;
    const text = pending;
    recovered.add(text);
    pending = undefined;
    const inHistory = lastUserMessageIs(deps.session.history.items, text);
    deps.log?.({ text: text.slice(0, 80), inHistory });
    deps.reply(inHistory ? undefined : text);
  };
  const reschedule = (): void => {
    if (timer) clearTimer(timer);
    timer =
      pending && bothQuiet() ? setTimer(check, deps.graceMs ?? TURN_KEEPER_GRACE_MS) : undefined;
  };

  return {
    onStateChange: reschedule,
    onTranscript(event) {
      const ev = event as { transcript?: string; isFinal?: boolean };
      if (!ev?.isFinal) return;
      const text = (ev.transcript ?? '').trim();
      if (wordCount(text) >= MIN_WORDS) pending = text;
      reschedule();
    },
    onItemAdded(event) {
      const item = (event as { item?: ChatItemLike })?.item;
      if (item && isRealAnswer(item)) pending = undefined;
      reschedule();
    },
    stop() {
      if (timer) clearTimer(timer);
      timer = undefined;
    },
  };
}
