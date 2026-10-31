/**
 * Why LiveKit kept or dropped its preemptive reply, for the TURN_RECEIPT
 * (`preemptiveCause`): whether the caller's words, the chat context and the tools
 * were the same at the commit as when the reply started, and how long before the
 * commit it started (`leadMs`). No words are kept.
 *
 * Our LiveKit patch logs these checks as PREEMPTIVE_DECISION, but its
 * `ferni_preemptive_decision` event carries only `used`, and changing the patch
 * means a reinstall. So the same checks are made here, on the same objects, while
 * that event is emitted: LiveKit emits it synchronously in userTurnCompletedImpl,
 * before it clears `_preemptiveGeneration`. The commit's chat context and message
 * are locals there; LiveKit hands both to the agent's onUserTurnCompleted just
 * before, which keeps them here with noteTurnCommit (ferni-agent.ts). Notes that
 * hook adds land in that same context, so the check sees them too.
 *
 * @module agents/shared/preemptive-cause
 */
import { tokenize, type llm } from '@livekit/agents';

export interface PreemptiveCause {
  /** The commit's words match the preflight's (null: the commit was not seen). */
  sameTranscript: boolean | null;
  /** The chat context is equivalent (null: the commit was not seen). */
  sameChatCtx: boolean | null;
  sameTools: boolean;
  /** How long before the commit the preemptive reply started. */
  leadMs: number;
}

interface TurnCommit {
  chatCtx: llm.ChatContext;
  text: string | undefined;
}

/** The parts of LiveKit's AgentActivity (session._activity) this reads. */
interface ActivityView {
  agent?: object;
  tools?: unknown;
  _preemptiveGeneration?: {
    info?: { newTranscript?: string };
    chatCtx?: { isEquivalent(other: llm.ChatContext): boolean };
    tools?: { equals(other: unknown): boolean };
    createdAt?: number;
  };
}

const commits = new WeakMap<object, TurnCommit>();

/** The agent's onUserTurnCompleted: the commit's chat context and the caller's message. */
export function noteTurnCommit(
  agent: object,
  chatCtx: llm.ChatContext,
  message: llm.ChatMessage
): void {
  commits.set(agent, { chatCtx, text: message.rawTextContent });
}

// Thai, kana and CJK compare character by character, everything else word by word.
const CHAR_OR_WORD = /[฀-๿぀-ヿ㐀-䶿一-鿿]|[^฀-๿぀-ヿ㐀-䶿一-鿿]+/gu;
const words = (text: string): string[] =>
  tokenize.basic
    .splitWords(text, true)
    .flatMap(([word]) => word.match(CHAR_OR_WORD) ?? [])
    .filter(Boolean)
    .map((word) => word.toLowerCase());

/** LiveKit's transcriptsEquivalent (agent_activity.js), which it does not export. */
function sameWords(first: string | undefined, second: string | undefined): boolean {
  if (first === second) return true;
  if (first === undefined || second === undefined) return false;
  const a = words(first);
  const b = words(second);
  return a.length > 0 && a.length === b.length && a.every((w, i) => w === b[i]);
}

/**
 * During `ferni_preemptive_decision`: the checks LiveKit is making. Undefined when
 * there is no preemptive reply to read. Never throws.
 */
export function preemptiveCause(session: object, now = Date.now()): PreemptiveCause | undefined {
  try {
    const activity = (session as { _activity?: ActivityView })._activity;
    const pre = activity?._preemptiveGeneration;
    if (!activity || !pre?.tools || pre.createdAt === undefined) return undefined;
    const commit = activity.agent ? commits.get(activity.agent) : undefined;
    if (activity.agent) commits.delete(activity.agent);
    return {
      sameTranscript: commit ? sameWords(pre.info?.newTranscript, commit.text) : null,
      sameChatCtx: commit && pre.chatCtx ? pre.chatCtx.isEquivalent(commit.chatCtx) : null,
      sameTools: pre.tools.equals(activity.tools),
      leadMs: Math.max(0, Math.round(now - pre.createdAt)),
    };
  } catch {
    return undefined;
  }
}
