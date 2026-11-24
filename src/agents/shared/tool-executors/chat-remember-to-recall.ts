/**
 * Text chat's "remember this", also kept where recall reads it (#2518).
 *
 * The chat API runs rememberAboutUser and updateMemory through the memory
 * executor (memory-executor.ts), which writes bogle_users/{uid}/extracted_facts.
 * Recall no longer reads that collection (memory/recall/forget.ts), so a fact
 * asked for in chat never came back by meaning on a later call. The voice tool
 * already writes through the remembered-fact writer (keepForRecall,
 * memory/dynamic/remembered-facts.ts) into dynamic_facts, which recall reads.
 *
 * With CHAT_REMEMBER_TO_RECALL on, the executor hands the fact it just stored to
 * that same writer, and a correction to the replace path the voice tool's
 * updateMemory uses (replaceRemembered), so recall never keeps the old value.
 * Every guard there applies: the writer still refuses unless REMEMBER_TO_RECALL
 * or MEMORY_TOOLS_HONEST is on, keeps only a member's fact, never keeps a
 * credential, and honours forgotten topics. The extracted_facts writes and
 * memory_saved are unchanged; this adds writes, it replaces none. A forget
 * already reaches dynamic_facts (forgetForCaller marks every fact collection).
 *
 * Flags are the caller's own: the UI server serves many people in one process
 * and never writes cohort flags into process.env (cohort-flags.ts), so they are
 * read per person here, CHAT_REMEMBER_TO_RECALL included.
 *
 * The writer's stores and secret model are handed in by
 * agents/remembered-fact-store-register.ts, which only the agent process loads
 * (gce/job-executor.ts). The chat API runs in the UI server, so this loads it
 * too, on first use and only with the flag on. The executor awaits these
 * writes: Cloud Run throttles the CPU once the reply is sent, so a write left
 * running could be lost. Never throws: a failure is logged and the chat tool's
 * reply is unchanged.
 *
 * @module agents/shared/tool-executors/chat-remember-to-recall
 */
import { flagOn, type Env } from '../../../config/env-flag.js';
import type { keepForRecall, KeepOutcome, ReplaceOutcome } from '../../../services/memory/index.js';
import { errorClass } from '../../../utils/error-class.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'ChatRememberToRecall' });
const FLAG = 'CHAT_REMEMBER_TO_RECALL';
type RememberToRecallDeps = NonNullable<Parameters<typeof keepForRecall>[2]>;

export interface ChatRememberedFact {
  fact: string;
  /** The extracted_facts document it copies, so either can be traced to the other. */
  memoryId: string;
  category?: string;
  sessionId?: string;
}

/** The writer's deps with this caller's flags, or null when CHAT_REMEMBER_TO_RECALL is off for them. */
async function forCaller(userId: string): Promise<RememberToRecallDeps | null> {
  const { envForCaller, flagForUser } = await import('../../../services/platform/cohort-flags.js');
  // Cached, and no read at all without COHORT_FLAGS: the off path stays cheap. Their own value wins.
  const own = await flagForUser(userId, FLAG);
  if (!flagOn(FLAG, own === undefined ? process.env : { [FLAG]: own })) return null;
  const env: Env = await envForCaller(userId);
  await import('../../remembered-fact-store-register.js'); // the UI server loads no agent wiring
  const { memoryToolFlags } = await import('../../../services/memory/index.js');
  // RECALL_VECTOR_INDEX is a cohort flag too: the writer would read it from process.env
  return { env, flags: memoryToolFlags(env), embedding: { enabled: flagOn('RECALL_VECTOR_INDEX', env) } }; // prettier-ignore
}

function logged<T extends KeepOutcome | ReplaceOutcome>(what: string, out: T): T {
  log.info(
    {
      outcome: out.kind,
      ...('id' in out && { factId: out.id }),
      ...('reason' in out && { reason: out.reason }),
      ...('kept' in out && { kept: out.kept.kind }),
    },
    what
  );
  return out;
}

/**
 * With CHAT_REMEMBER_TO_RECALL on for this caller, the fact through the
 * remembered-fact writer the voice tool uses; what it did, or null when off.
 */
export async function keepChatFactForRecall(
  userId: string,
  r: ChatRememberedFact
): Promise<KeepOutcome | null> {
  try {
    const deps = await forCaller(userId);
    if (!deps) return null;
    const { keepForRecall } = await import('../../../services/memory/index.js');
    return logged('Chat remember to recall', await keepForRecall(userId, r, deps));
  } catch (error) {
    log.warn({ error: errorClass(error) }, 'Chat remember not written for recall');
    return { kind: 'failed' };
  }
}

/**
 * With the flag on for this caller, a chat correction in the store recall reads:
 * the remembered fact that reads exactly `original` is replaced by `updated`
 * (replaceRemembered). With no such fact, `updated` is kept for recall, as the
 * executor stores it anew. Null when off.
 */
export async function replaceChatFactForRecall(
  userId: string,
  change: { original: string; updated: string }
): Promise<ReplaceOutcome | KeepOutcome | null> {
  try {
    const deps = await forCaller(userId);
    if (!deps) return null;
    const { keepForRecall, replaceRemembered } = await import('../../../services/memory/index.js');
    const replaced = await replaceRemembered(userId, change, deps);
    if (replaced.kind !== 'no_match') return logged('Chat correction to recall', replaced);
    const fact = { fact: change.updated, category: 'correction' };
    return logged('Chat correction to recall', await keepForRecall(userId, fact, deps));
  } catch (error) {
    log.warn({ error: errorClass(error) }, 'Chat correction not written for recall');
    return { kind: 'failed' };
  }
}
