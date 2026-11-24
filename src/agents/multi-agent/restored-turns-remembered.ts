/**
 * Earlier turns put back into a new call's history leave out what the caller
 * asked Ferni to forget (FORGET_EVERY_READER, #2762).
 *
 * resume-after-drop.ts replays an earlier call's last turns verbatim: on
 * reconnect after a drop (findDroppedCall), and into the phone call a "call me"
 * moved to (restoreMovedTurns). A topic forgotten in those turns came straight
 * back. Each turn now goes through the check every other reader uses
 * (aboutForgotten, forget-every-reader.ts).
 *
 * The topics come from a fresh read only (forgottenWithin): the earlier call
 * often ran on another pod, so this process's last-known list can miss the
 * topic forgotten there. A read that is late, fails or throws keeps no turn.
 *
 * @module agents/multi-agent/restored-turns-remembered
 */
import type { Env } from '../../config/env-flag.js';
import { forgetEveryReaderEnabled, forgottenWithin } from '../../memory/index.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'RestoredTurnsRemembered' });

/**
 * The turns not about a forgotten topic. Flag off or no member: the same array,
 * unchanged. Topics unreadable: none (fail closed). `reader` names the caller in logs.
 */
export async function rememberedTurns<T extends { content: string }>(
  userId: string | null | undefined,
  turns: T[],
  reader: string,
  env: Env = process.env
): Promise<T[]> {
  if (!forgetEveryReaderEnabled(env) || !isMemberIdentity(userId) || turns.length === 0) {
    return turns;
  }
  let forgotten: Awaited<ReturnType<typeof forgottenWithin>>;
  try {
    forgotten = await forgottenWithin(userId, reader);
  } catch (error) {
    log.warn({ error: String(error), reader }, 'Forgotten topics read threw, restoring no turns');
    return [];
  }
  if (!forgotten) {
    log.warn({ reader, dropped: turns.length }, 'Forgotten topics unreadable, restoring no turns');
    return [];
  }
  const kept = turns.filter((t) => !forgotten(t.content));
  if (kept.length < turns.length) {
    log.info({ reader, dropped: turns.length - kept.length }, 'Restored turns: forgotten left out');
  }
  return kept;
}
