/**
 * A running tool keeps its own wait (NEVER_SILENT_TOOL_WAIT, #4220).
 *
 * Without it, the agent's lead-in ("Sure.") disarms the never-silent turn and
 * the tool's hold with it, so a tool that hangs gives silence until the caller
 * speaks. With no lead-in, the hold runs out into a "say that again?" line,
 * which asks the caller to repeat a request whose tool may still finish, and a
 * repeated request can run a write twice.
 *
 * With the flag on, a tool's wait lives outside the turn. When it runs out
 * with the tool still running and nothing playing, the caller hears one honest
 * line, never a re-ask. The caller speaking or taking a new turn ends the
 * wait: their turn's own clock takes over. The line never interrupts a reply
 * in progress, so it can never delay any reply, a crisis reply included.
 *
 * @module agents/multi-agent/never-silent-tool-wait
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import type { NeverSilentGuard } from './never-silent.js';

/** Honest, and asks nothing: a re-ask could repeat a request whose tool may still finish. */
const STILL_WORKING_LINE = 'Still on it, one sec.';

export function toolWaitOn(env: Env = process.env): boolean {
  return flagOn('NEVER_SILENT_TOOL_WAIT', env);
}

export interface ToolWait {
  /** A tool was requested: start (or restart) its wait. */
  start: () => void;
  /** The tool returned: its wait is over. */
  end: () => void;
  /** The caller went on, or the call ended: drop the wait without a line. */
  drop: () => void;
}

export function createToolWait(deps: {
  session: {
    readonly agentState: string;
    readonly userState: string;
    say: (text: string, options?: { allowInterruptions?: boolean }) => unknown;
  };
  mode: 'on' | 'shadow';
  waitMs: number;
  stayQuiet?: () => boolean;
  replyPaused?: () => boolean;
  log: (fields: Record<string, unknown>) => void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (t: ReturnType<typeof setTimeout>) => void;
}): ToolWait {
  const { session } = deps;
  const now = deps.now ?? Date.now;
  const setTimer = deps.setTimer ?? setTimeout;
  const clearTimer = deps.clearTimer ?? clearTimeout;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let startedAt = 0;

  const clear = (): void => {
    if (timer) clearTimer(timer);
    timer = undefined;
  };
  const arm = (): void => {
    clear();
    timer = setTimer(fire, deps.waitMs);
  };

  function fire(): void {
    timer = undefined;
    if (session.userState === 'speaking') return; // the caller went on
    // Something is playing: never talk over it or cut it off. Look again later. (While the wait
    // is open, 'thinking' is the tool's own wait: a new reply ends the wait first.)
    if (session.agentState === 'speaking') return arm();
    if (deps.replyPaused?.()) return arm();
    const fields = { reason: 'tool_wait', sinceToolMs: now() - startedAt, mode: deps.mode };
    if (deps.stayQuiet?.()) return deps.log({ ...fields, skipped: 'stay_quiet' });
    deps.log(fields); // one line per wait: nothing re-arms it after this
    if (deps.mode !== 'on') return;
    try {
      session.say(STILL_WORKING_LINE, { allowInterruptions: true });
    } catch (error) {
      deps.log({ ...fields, sayFailed: String(error) });
    }
  }

  return {
    start() {
      if (!timer) startedAt = now();
      arm();
    },
    end: clear,
    drop: clear,
  };
}

/**
 * The guard with a tool's wait around it. The guard must be built with `toolWait: true`, so a
 * requested tool clears its turn clock instead of holding it into a re-ask. No wait: the guard.
 */
export function withToolWait(guard: NeverSilentGuard, wait: ToolWait | null): NeverSilentGuard {
  if (!wait) return guard;
  const role = (event: unknown): string | undefined =>
    (event as { item?: { role?: string } })?.item?.role;
  const state = (event: unknown): string | undefined => (event as { newState?: string })?.newState;
  return {
    ...guard,
    onItemAdded(event) {
      if (role(event) === 'user') wait.drop(); // a new caller turn: its own clock takes over
      guard.onItemAdded(event);
    },
    onUserState(event) {
      if (state(event) === 'speaking') wait.drop(); // the caller went on
      guard.onUserState(event);
    },
    onToolsRequested() {
      wait.start(); // the agent's lead-in speech does not drop it
      guard.onToolsRequested();
    },
    onToolsExecuted() {
      wait.end();
      guard.onToolsExecuted();
    },
    stop() {
      wait.drop();
      guard.stop();
    },
  };
}
