/**
 * Text chat's "remember this", also kept where recall reads it (#2518).
 *
 * The chat API runs rememberAboutUser through the memory executor
 * (memory-executor.ts), which writes bogle_users/{uid}/extracted_facts. Recall
 * no longer reads that collection (memory/recall/forget.ts), so a fact asked
 * for in chat never came back by meaning on a later call. The voice tool
 * already writes through the remembered-fact writer (keepForRecall,
 * memory/dynamic/remembered-facts.ts) into dynamic_facts, which recall reads.
 *
 * With CHAT_REMEMBER_TO_RECALL on, the executor hands the fact it just stored
 * to that same writer, so every guard there applies: the writer still refuses
 * unless REMEMBER_TO_RECALL or MEMORY_TOOLS_HONEST is on, keeps only a member's
 * fact, never keeps a credential (word rules, then the secret model, failing
 * closed), and honours forgotten topics. The extracted_facts write and its
 * memory_saved announcement are unchanged; this adds a write, it replaces none.
 *
 * The writer's store and secret model are handed in by
 * agents/remembered-fact-store-register.ts, which only the agent process loads
 * (gce/job-executor.ts). The chat API runs in the UI server, so this loads it
 * too, on first use and only with the flag on. Never throws: a failed recall
 * write is logged and the chat tool's reply is unchanged.
 *
 * @module agents/shared/tool-executors/chat-remember-to-recall
 */
import { flagOn, type Env } from '../../../config/env-flag.js';
import type { KeepOutcome } from '../../../services/memory/index.js';
import { errorClass } from '../../../utils/error-class.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'ChatRememberToRecall' });

export interface ChatRememberedFact {
  fact: string;
  /** The extracted_facts document it copies, so either can be traced to the other. */
  memoryId: string;
  category?: string;
  sessionId?: string;
}

function chatRememberToRecallOn(env: Env = process.env): boolean {
  return flagOn('CHAT_REMEMBER_TO_RECALL', env);
}

/**
 * With CHAT_REMEMBER_TO_RECALL on, the fact through the remembered-fact writer
 * the voice tool uses; what it did, or null with the flag off (nothing tried).
 */
export async function keepChatFactForRecall(
  userId: string,
  r: ChatRememberedFact,
  env: Env = process.env
): Promise<KeepOutcome | null> {
  if (!chatRememberToRecallOn(env)) return null;
  try {
    await import('../../remembered-fact-store-register.js'); // the UI server loads no agent wiring
    const { keepForRecall } = await import('../../../services/memory/index.js');
    const kept = await keepForRecall(userId, r, { env });
    log.info(
      {
        outcome: kept.kind,
        ...('id' in kept && { factId: kept.id }),
        ...('reason' in kept && { reason: kept.reason }),
      },
      'Chat remember to recall'
    );
    return kept;
  } catch (error) {
    log.warn({ error: errorClass(error) }, 'Chat remember not written for recall');
    return { kind: 'failed' };
  }
}
