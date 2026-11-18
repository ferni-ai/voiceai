/**
 * processTurn's memory writers and the turn's crisis read ("crisis turns record nothing").
 *
 * One wait per turn: every writer that holds asks `kept()`, which starts crisisTurnSettled once
 * and shares its answer (crisis-memory-hold.ts). `write` is a pipeline writer under
 * CRISIS_HOLD_PIPELINE_WRITERS: off, it runs inline, as before; on, it runs in the background,
 * only when the read settled clean and no hold covers the caller (minor-care.ts writeHeld, read
 * after the wait, so a hold set while it ran counts). Any throw records nothing: fail closed.
 */
import { flagOn } from '../../../config/env-flag.js';
import { crisisTurnSettled } from '../../../utils/crisis-memory-hold.js';
import { writeHeld } from '../../../utils/minor-care.js';
import { safeFireAndForget } from '../../../utils/safe-fire-and-forget.js';

type Env = Readonly<Record<string, string | undefined>>;

export interface TurnHold {
  /** The turn's crisis read settled clean and nothing held the call; asked once per turn. */
  kept(): Promise<boolean>;
  /** A pipeline writer, named by `context` (its safeFireAndForget context when it waits). */
  write<A extends unknown[]>(context: string, writer: (...args: A) => void, ...args: A): void;
}

export function turnHold(
  userId: string | undefined,
  sessionId: string | undefined,
  words: string,
  env: Env = process.env
): TurnHold {
  let wait: Promise<boolean> | undefined;
  const kept = (): Promise<boolean> => (wait ??= crisisTurnSettled(sessionId, words));
  return {
    kept,
    write(context, writer, ...args) {
      if (!flagOn('CRISIS_HOLD_PIPELINE_WRITERS', env)) return writer(...args);
      safeFireAndForget(
        async () => {
          if ((await kept()) && !writeHeld(userId, sessionId, env)) writer(...args);
        },
        { context }
      );
    },
  };
}
