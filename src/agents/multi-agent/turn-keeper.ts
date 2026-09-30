/**
 * Never leave the caller's turn unanswered.
 *
 * Dev, 2026-09-30: the caller paused mid-thought ("Oh, and Biscuit chewed up
 * my phone charger this morning... So, that was fun."), Ferni started
 * answering in the pause, was cut off after one word by the rest of the
 * sentence, and then never answered it: no reply for 16 s, until the silence
 * handler filled the gap with a canned "How did that feel?".
 *
 * When both sides have gone quiet and the last thing said in the conversation
 * was the caller's (at least a few words), Ferni answers it after a short
 * grace period, like a person who realises the other one is waiting.
 *
 * @module agents/multi-agent/turn-keeper
 */

export const TURN_KEEPER_GRACE_MS = 2500;
const MIN_WORDS = 3;

interface ChatItemLike {
  id?: string;
  type?: string;
  role?: string;
  textContent?: string;
}

/** The last spoken message in the history (skips tool calls, handoffs, system notes). */
export function lastSpoken(items: readonly unknown[]): ChatItemLike | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i] as ChatItemLike;
    if (item?.type && item.type !== 'message') continue;
    if (item?.role !== 'user' && item?.role !== 'assistant') continue;
    if (!item.textContent?.trim()) continue;
    return item;
  }
  return undefined;
}

/** A caller message still waiting for an answer, if there is one. */
export function unansweredUserTurn(items: readonly unknown[]): ChatItemLike | undefined {
  const last = lastSpoken(items);
  if (last?.role !== 'user') return undefined;
  const words = (last.textContent ?? '').trim().split(/\s+/).filter(Boolean);
  return words.length >= MIN_WORDS ? last : undefined;
}

export interface TurnKeeperSession {
  readonly agentState: string;
  readonly userState: string;
  readonly history: { items: readonly unknown[] };
}

export function createTurnKeeper(deps: {
  session: TurnKeeperSession;
  reply: () => void;
  graceMs?: number;
  log?: (fields: Record<string, unknown>) => void;
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (t: ReturnType<typeof setTimeout>) => void;
}): { onStateChange: () => void; stop: () => void } {
  const setTimer = deps.setTimer ?? setTimeout;
  const clearTimer = deps.clearTimer ?? clearTimeout;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const answered = new Set<string>();
  const bothQuiet = (): boolean =>
    deps.session.agentState === 'listening' && deps.session.userState === 'listening';

  const check = (): void => {
    timer = undefined;
    if (!bothQuiet()) return;
    const turn = unansweredUserTurn(deps.session.history.items);
    if (!turn) return;
    const key = turn.id ?? turn.textContent ?? '';
    if (answered.has(key)) return; // one recovery per caller turn
    answered.add(key);
    deps.log?.({ text: turn.textContent?.slice(0, 80) });
    deps.reply();
  };

  return {
    onStateChange() {
      if (timer) clearTimer(timer);
      timer = bothQuiet() ? setTimer(check, deps.graceMs ?? TURN_KEEPER_GRACE_MS) : undefined;
    },
    stop() {
      if (timer) clearTimer(timer);
      timer = undefined;
    },
  };
}
