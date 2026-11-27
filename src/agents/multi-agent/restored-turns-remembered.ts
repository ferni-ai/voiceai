/**
 * Earlier turns put back into a new call's history leave out what the caller
 * asked Ferni to forget (FORGET_EVERY_READER, #2762).
 *
 * resume-after-drop.ts replays an earlier call's last turns verbatim: on
 * reconnect after a drop (findDroppedCall), and into the phone call a "call me"
 * moved to (restoreMovedTurns). A topic forgotten in those turns came straight
 * back. The turns are the caller's raw speech, so each goes through the check
 * for raw words (isForgottenPassage, via forgottenPassageWithin), as open
 * loops, episode quotes and call summaries do: any distinctive word of the
 * topic counts, so "the Denver job" leaves out "the offer from the Denver
 * office".
 *
 * The topics are read from the store itself (forget-topics-source.ts, the
 * uncached read of #2755): no last-known fallback and not the shared 15 s
 * cache, which only a forget in this process clears. A reconnect comes seconds
 * after the earlier call, while that cache is warm, so a topic forgotten on
 * another pod or in the web app would otherwise come straight back. One store
 * read per restore. A read that is late (300 ms), fails or throws keeps no turn.
 *
 * @module agents/multi-agent/restored-turns-remembered
 */
import type { Env } from '../../config/env-flag.js';
import { forgetEveryReaderEnabled, forgottenPassageWithin } from '../../memory/index.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'RestoredTurnsRemembered' });

/** Keeps the turns not about a forgotten topic. */
export type TurnsFilter = <T extends { content: string }>(turns: T[]) => T[];

const keepAll: TurnsFilter = (turns) => turns;
const keepNone: TurnsFilter = () => [];

/**
 * Starts the forgotten-topics read now and resolves to the filter for restored
 * turns, so a caller can read the turns at the same time. Flag off or no member:
 * every turn kept, no read. Topics unreadable, late or the read throws: none
 * kept (fail closed). Never rejects. `reader` names the caller in logs.
 */
export async function restoredTurnsFilter(
  userId: string | null | undefined,
  reader: string,
  env: Env = process.env
): Promise<TurnsFilter> {
  // forgottenPassageWithin answers null both when off and when unreadable; only the second drops
  if (!forgetEveryReaderEnabled(env) || !isMemberIdentity(userId)) return keepAll;
  let forgotten: Awaited<ReturnType<typeof forgottenPassageWithin>>;
  try {
    forgotten = await forgottenPassageWithin(userId, reader, env, true);
  } catch (error) {
    log.warn({ error: String(error), reader }, 'Forgotten topics read threw, restoring no turns');
    return keepNone;
  }
  if (!forgotten) {
    log.warn({ reader }, 'Forgotten topics unreadable, restoring no turns');
    return keepNone;
  }
  const check = forgotten;
  return (turns) => {
    const kept = turns.filter((t) => !check(t.content));
    if (kept.length < turns.length) {
      log.info(
        { reader, dropped: turns.length - kept.length },
        'Restored turns: forgotten left out'
      );
    }
    return kept;
  };
}

/** The turns not about a forgotten topic (restoredTurnsFilter, read then applied). */
export async function rememberedTurns<T extends { content: string }>(
  userId: string | null | undefined,
  turns: T[],
  reader: string,
  env: Env = process.env
): Promise<T[]> {
  if (turns.length === 0) return turns;
  return (await restoredTurnsFilter(userId, reader, env))(turns);
}
